"use client";

import { Menu } from "@base-ui/react/menu";
import {
  ArrowDownIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  DotsThreeIcon,
  MagnifyingGlassIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { css, cva } from "@styled-system/css";
import { useQueries } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api, qualityLabel, sizeLabel } from "@/lib/client";
import type {
  ActionResponse,
  Episode,
  EpisodeStatus,
  EpisodesResponse,
  MediaItem,
  MediaTarget,
} from "@/lib/types";
import { Button, buttonStyle, Modal, mutedStyle, Notice, Spinner } from "./ui";

const statuses: Record<EpisodeStatus, string> = {
  available: "Available",
  missing: "Missing",
  downloading: "Downloading",
  unreleased: "Unreleased",
  unmonitored: "Unmonitored",
  unknown: "Unknown",
};
const statusStyle = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "11px",
    whiteSpace: "nowrap",
  },
  variants: {
    status: {
      available: { color: "positive" },
      missing: { color: "warning" },
      downloading: { color: "info" },
      unreleased: { color: "muted" },
      unmonitored: { color: "muted" },
      unknown: { color: "muted" },
    },
  },
});
const cellStyle = css({
  px: "12px",
  py: "6px",
  height: "42px",
  textAlign: "left",
  verticalAlign: "middle",
  borderTop: "1px solid token(colors.line)",
});
const dateCellStyle = css({
  px: "12px",
  py: "6px",
  textAlign: "left",
  verticalAlign: "middle",
  borderTop: "1px solid token(colors.line)",
  display: { base: "none", md: "table-cell" },
  width: "110px",
  color: "muted",
  whiteSpace: "nowrap",
  fontSize: "11px",
});
const menuItemStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  px: "12px",
  py: "9px",
  fontSize: "12px",
  borderRadius: "4px",
  cursor: "pointer",
  outline: "none",
  _highlighted: { bg: "elevated" },
});

function episodeCode(episode: Episode) {
  return `S${String(episode.seasonNumber).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`;
}

function airDate(episode: Episode) {
  const date = episode.airDateUtc ? new Date(episode.airDateUtc) : null;
  return date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(date)
    : "Date unknown";
}

function EpisodeAvailability({
  episode,
  stale = false,
}: {
  episode: Episode;
  stale?: boolean;
}) {
  return (
    <span
      className={css({
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        minWidth: 0,
      })}
    >
      <span className={statusStyle({ status: episode.status })}>
        {episode.hasFile ? (
          <CheckCircleIcon size={13} />
        ) : episode.status === "downloading" ? (
          <ArrowDownIcon size={13} />
        ) : (
          <CircleDashedIcon size={13} />
        )}
        {statuses[episode.status]}
      </span>
      {episode.hasFile && (
        <span
          title={episode.quality}
          className={css({
            fontSize: "10px",
            color: "muted",
            whiteSpace: "nowrap",
            maxWidth: "90px",
            overflow: "hidden",
            textOverflow: "ellipsis",
          })}
        >
          {qualityLabel("", episode.quality)}
        </span>
      )}
      {stale && (
        <WarningCircleIcon
          size={13}
          aria-label="Last known status"
          className={css({ color: "warning", flexShrink: 0 })}
        />
      )}
    </span>
  );
}

export function SeriesEpisodes({
  media,
  notify,
  onChanged,
  onManualSearch,
  onSeasonManualSearch,
}: {
  media: MediaItem;
  notify: (message: string, error?: boolean) => void;
  onChanged: () => void;
  onManualSearch: (target: MediaTarget, episode: Episode, code: string) => void;
  onSeasonManualSearch: (target: MediaTarget, seasonNumber: number) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const searchLock = useRef(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [selected, setSelected] = useState<{
    season: number;
    episode: number;
  } | null>(null);
  const queries = useQueries({
    queries: media.targets.map((target) => ({
      queryKey: ["episodes", target.instanceId, target.remoteId],
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const response = await api<EpisodesResponse>(
          `/api/episodes?instanceId=${encodeURIComponent(target.instanceId)}&remoteId=${target.remoteId}`,
          { signal },
        );
        if (
          response.instanceId !== target.instanceId ||
          response.remoteId !== target.remoteId
        )
          throw new Error("Episode response does not match this target.");
        return response;
      },
      refetchInterval: 30_000,
      staleTime: 30_000,
      retry: false,
    })),
  });

  // Merge display identities only; actions retain the episode ID from their own instance.
  const seasons = new Map<
    number,
    Map<number, { episode: Episode; targets: Map<string, Episode> }>
  >();
  for (const query of queries) {
    if (!query.data) continue;
    for (const season of query.data.seasons) {
      if (!seasons.has(season.seasonNumber))
        seasons.set(season.seasonNumber, new Map());
    }
    for (const episode of query.data.episodes) {
      if (episode.seriesId !== query.data.remoteId) continue;
      let season = seasons.get(episode.seasonNumber);
      if (!season) {
        season = new Map();
        seasons.set(episode.seasonNumber, season);
      }
      let row = season.get(episode.episodeNumber);
      if (!row) {
        row = { episode, targets: new Map() };
        season.set(episode.episodeNumber, row);
      }
      row.targets.set(query.data.instanceId, episode);
    }
  }
  const seasonNumbers = [...seasons.keys()].sort((a, b) => b - a);
  const loading = queries.some((query) => query.isPending);
  const failed = queries.some(
    (query) => query.isError || Boolean(query.data?.errors.length),
  );
  const detail = selected
    ? seasons.get(selected.season)?.get(selected.episode)
    : undefined;

  async function search(target: MediaTarget, scope: Episode | number) {
    if (searchLock.current) return;
    searchLock.current = true;
    setPending(
      `${target.instanceId}:${typeof scope === "number" ? `season:${scope}` : scope.id}`,
    );
    try {
      const result = await api<ActionResponse>("/api/search", {
        method: "POST",
        body: JSON.stringify({
          instanceId: target.instanceId,
          remoteId: target.remoteId,
          kind: "series",
          ...(typeof scope === "number"
            ? { seasonNumber: scope }
            : { episodeId: scope.id }),
        }),
      });
      if (!result.success) throw new Error(result.message);
      notify(result.message);
      onChanged();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Search failed.", true);
    } finally {
      searchLock.current = false;
      setPending(null);
    }
  }

  return (
    <section
      aria-labelledby="episodes-heading"
      className={css({
        mt: "28px",
        pt: "22px",
        borderTop: "1px solid token(colors.line)",
        minWidth: 0,
      })}
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: "16px",
          gap: "12px",
        })}
      >
        <div>
          <h2
            id="episodes-heading"
            className={css({ fontSize: "16px", fontWeight: "550" })}
          >
            Seasons & episodes
          </h2>
          <p className={css({ fontSize: "11px", color: "muted", mt: "5px" })}>
            Availability by instance. Select an episode for more details.
          </p>
        </div>
        {media.targets.length > 0 && (
          <Button
            size="sm"
            disabled={queries.some((query) => query.isFetching)}
            onClick={() => {
              for (const query of queries) void query.refetch();
            }}
          >
            Refresh episodes
          </Button>
        )}
      </div>
      <div className={css({ display: "grid", gap: "8px" })}>
        {queries.map((query, index) => {
          const target = media.targets[index];
          const messages = [
            query.isError ? query.error.message : "",
            ...(query.data?.errors.map((error) => error.message) ?? []),
          ].filter(Boolean);
          return messages.length > 0 ? (
            <Notice key={target.instanceId} error>
              {target.instanceName}: {messages.join(" · ")}
              {query.data
                ? " Previously loaded episode data may be out of date."
                : " Episode status is unavailable for this target."}
            </Notice>
          ) : null;
        })}
        {loading && (
          <output
            className={css({
              display: "flex",
              gap: "8px",
              alignItems: "center",
              color: "muted",
              fontSize: "12px",
            })}
          >
            <Spinner size={14} />
            Loading episodes...
          </output>
        )}
        {!loading && seasonNumbers.length === 0 && (
          <p className={mutedStyle}>
            {media.targets.length === 0
              ? "Add a target to see this show's seasons and episodes."
              : failed
                ? "Episode information could not be loaded. Refresh to try again."
                : "No seasons or episodes have been reported by your targets yet."}
          </p>
        )}
        {seasonNumbers.map((number) => {
          const rows = [...(seasons.get(number)?.values() ?? [])].sort(
            (a, b) => a.episode.episodeNumber - b.episode.episodeNumber,
          );
          const open = expanded[number] ?? false;
          return (
            <details
              key={number}
              open={open}
              onToggle={(event) => {
                const next = event.currentTarget.open;
                if (next !== open)
                  setExpanded((current) => ({ ...current, [number]: next }));
              }}
              className={css({
                border: "1px solid token(colors.line)",
                borderRadius: "7px",
                bg: "surface",
                overflow: "hidden",
                minWidth: 0,
              })}
            >
              <summary
                className={css({
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "10px 18px",
                  px: "13px",
                  py: "12px",
                  cursor: "pointer",
                  listStyle: "none",
                  "&::-webkit-details-marker": { display: "none" },
                  _hover: { bg: "elevated" },
                })}
              >
                <span
                  className={css({
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    flexShrink: 0,
                  })}
                >
                  <CaretRightIcon
                    size={12}
                    weight="bold"
                    className={css({
                      color: "muted",
                      transform: open ? "rotate(90deg)" : "none",
                      transition: "transform 120ms",
                    })}
                  />
                  <span
                    className={css({ fontSize: "12px", fontWeight: "550" })}
                  >
                    {number === 0 ? "Specials" : `Season ${number}`}
                  </span>
                  <span className={css({ color: "subtle", fontSize: "10px" })}>
                    {rows.length} {rows.length === 1 ? "episode" : "episodes"}
                  </span>
                </span>
                <span
                  className={css({
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "8px 20px",
                    ml: { base: "20px", md: "auto" },
                  })}
                >
                  {media.targets.map((target, index) => {
                    const query = queries[index];
                    const episodes = rows.flatMap((row) => {
                      const episode = row.targets.get(target.instanceId);
                      return episode ? [episode] : [];
                    });
                    const downloaded = episodes.filter(
                      (episode) => episode.hasFile,
                    ).length;
                    const missing = episodes.filter(
                      (episode) => episode.status === "missing",
                    ).length;
                    const others = episodes.filter(
                      (episode) =>
                        !episode.hasFile && episode.status !== "missing",
                    );
                    const otherDescription = Object.entries(statuses)
                      .filter(([status]) =>
                        others.some((episode) => episode.status === status),
                      )
                      .map(
                        ([status, label]) =>
                          `${others.filter((episode) => episode.status === status).length} ${label.toLowerCase()}`,
                      )
                      .join(", ");
                    const stale =
                      query.isError || Boolean(query.data?.errors.length);
                    const hasSeason =
                      episodes.length > 0 ||
                      Boolean(
                        query.data?.seasons.some(
                          (season) => season.seasonNumber === number,
                        ),
                      );
                    const seasonLabel =
                      number === 0 ? "Specials" : `Season ${number}`;
                    return (
                      <span
                        key={target.instanceId}
                        title={`${target.instanceName} season ${number} status`}
                        className={css({
                          display: "inline-flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: "8px",
                          fontSize: "10px",
                          fontWeight: "400",
                          whiteSpace: "nowrap",
                        })}
                      >
                        <span
                          title={target.instanceName}
                          className={css({
                            color: "muted",
                            maxWidth: "120px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          })}
                        >
                          {target.instanceName}
                        </span>
                        {!query.data ? (
                          <span className={css({ color: "subtle" })}>
                            {query.isPending ? "Loading..." : "Unavailable"}
                          </span>
                        ) : !episodes.length ? (
                          <span className={css({ color: "subtle" })}>
                            No episodes
                          </span>
                        ) : (
                          <>
                            <span
                              className={css({
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                color: "positive",
                              })}
                            >
                              <CheckCircleIcon size={12} />
                              {downloaded} downloaded
                            </span>
                            <span
                              title="Aired, monitored episodes without a file. Active downloads are counted separately."
                              className={css({
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                color: missing ? "warning" : "subtle",
                              })}
                            >
                              <CircleDashedIcon size={12} />
                              {missing} missing
                            </span>
                            {others.length > 0 && (
                              <span
                                title={otherDescription}
                                className={css({ color: "subtle" })}
                              >
                                <span aria-hidden="true">
                                  +{others.length} other
                                </span>
                                <span className={css({ srOnly: true })}>
                                  {otherDescription}
                                </span>
                              </span>
                            )}
                            {stale && (
                              <WarningCircleIcon
                                size={12}
                                aria-label="Counts may be incomplete or out of date"
                                className={css({ color: "warning" })}
                              />
                            )}
                          </>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Auto search ${seasonLabel} on ${target.instanceName}`}
                          disabled={!hasSeason || pending !== null}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void search(target, number);
                          }}
                        >
                          {pending ===
                          `${target.instanceId}:season:${number}` ? (
                            <Spinner size={12} />
                          ) : (
                            <MagnifyingGlassIcon size={12} />
                          )}
                          Auto search
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Manual search ${seasonLabel} on ${target.instanceName}`}
                          disabled={!hasSeason || pending !== null}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onSeasonManualSearch(target, number);
                          }}
                        >
                          Manual search
                        </Button>
                      </span>
                    );
                  })}
                </span>
              </summary>
              {rows.length === 0 ? (
                <p
                  className={css({
                    px: "16px",
                    pb: "14px",
                    fontSize: "12px",
                    color: "muted",
                  })}
                >
                  {failed || loading
                    ? "No episode records loaded for this season yet; some targets are unavailable or loading."
                    : "No episode records reported for this season."}
                </p>
              ) : (
                <div className={css({ overflowX: "auto" })}>
                  <table
                    className={css({
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: "12px",
                    })}
                  >
                    <caption className={css({ srOnly: true })}>
                      {number === 0 ? "Specials" : `Season ${number}`} episode
                      availability by instance
                    </caption>
                    <thead
                      className={css({
                        bg: "canvas",
                        color: "muted",
                        fontSize: "10px",
                      })}
                    >
                      <tr>
                        <th scope="col" className={cellStyle}>
                          Episode
                        </th>
                        <th scope="col" className={dateCellStyle}>
                          Aired
                        </th>
                        {media.targets.map((target) => (
                          <th
                            key={target.instanceId}
                            scope="col"
                            className={cellStyle}
                            title={target.qualityProfile}
                          >
                            {target.instanceName}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ episode, targets }) => {
                        const code = episodeCode(episode);
                        return (
                          <tr
                            key={episode.episodeNumber}
                            onClick={(event) => {
                              if (
                                (event.target as HTMLElement).closest(
                                  "button, a, [role='menu'], [role='menuitem']",
                                ) ||
                                window.getSelection()?.toString()
                              )
                                return;
                              event.currentTarget
                                .querySelector("button")
                                ?.focus({ preventScroll: true });
                              setSelected({
                                season: number,
                                episode: episode.episodeNumber,
                              });
                            }}
                            className={css({
                              cursor: "pointer",
                              transition: "background 100ms",
                              _hover: { bg: "elevated" },
                              _focusWithin: { bg: "elevated" },
                            })}
                          >
                            <th scope="row" className={cellStyle}>
                              <button
                                type="button"
                                aria-label={`View details for ${code} ${episode.title}`}
                                onClick={() =>
                                  setSelected({
                                    season: number,
                                    episode: episode.episodeNumber,
                                  })
                                }
                                className={css({
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "12px",
                                  minWidth: "200px",
                                  width: "100%",
                                  textAlign: "left",
                                  height: "28px",
                                  borderRadius: "3px",
                                  fontWeight: "400",
                                })}
                              >
                                <span
                                  className={css({
                                    color: "subtle",
                                    fontFamily: "mono",
                                    fontSize: "10px",
                                    flexShrink: 0,
                                  })}
                                >
                                  {code}
                                </span>
                                <span
                                  title={episode.title}
                                  className={css({
                                    fontWeight: "500",
                                    fontSize: "12px",
                                    maxWidth: { base: "180px", xl: "440px" },
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  })}
                                >
                                  {episode.title || "Untitled episode"}
                                </span>
                              </button>
                            </th>
                            <td className={dateCellStyle}>
                              {airDate(episode)}
                            </td>
                            {media.targets.map((target, index) => {
                              const local = targets.get(target.instanceId);
                              const query = queries[index];
                              const stale =
                                query.isError ||
                                Boolean(query.data?.errors.length);
                              const isPending =
                                local &&
                                pending === `${target.instanceId}:${local.id}`;
                              return (
                                <td
                                  key={target.instanceId}
                                  className={cellStyle}
                                >
                                  <div
                                    className={css({
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      gap: "8px",
                                      minWidth: "145px",
                                    })}
                                  >
                                    {isPending ? (
                                      <output
                                        className={css({
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "5px",
                                          fontSize: "11px",
                                          color: "muted",
                                        })}
                                      >
                                        <Spinner size={12} />
                                        Searching...
                                      </output>
                                    ) : local ? (
                                      <EpisodeAvailability
                                        episode={local}
                                        stale={stale}
                                      />
                                    ) : (
                                      <span
                                        className={css({
                                          fontSize: "11px",
                                          color: "subtle",
                                        })}
                                      >
                                        {query.isPending
                                          ? "Loading..."
                                          : stale
                                            ? "Unavailable"
                                            : "No record"}
                                      </span>
                                    )}
                                    {local && (
                                      <Menu.Root modal={false}>
                                        <Menu.Trigger
                                          disabled={pending !== null}
                                          aria-label={`Actions for ${code} ${episode.title} on ${target.instanceName}`}
                                          className={buttonStyle({
                                            variant: "ghost",
                                            size: "sm",
                                          })}
                                        >
                                          <DotsThreeIcon size={18} />
                                        </Menu.Trigger>
                                        <Menu.Portal>
                                          <Menu.Positioner
                                            sideOffset={5}
                                            className={css({ zIndex: 50 })}
                                          >
                                            <Menu.Popup
                                              className={css({
                                                bg: "surface",
                                                border:
                                                  "1px solid token(colors.line)",
                                                borderRadius: "7px",
                                                p: "4px",
                                                boxShadow: "0 10px 30px #0006",
                                              })}
                                            >
                                              <Menu.Item
                                                className={menuItemStyle}
                                                aria-label={`Auto search ${code} on ${target.instanceName}`}
                                                onClick={() =>
                                                  void search(target, local)
                                                }
                                              >
                                                <MagnifyingGlassIcon
                                                  size={14}
                                                />
                                                Auto search
                                              </Menu.Item>
                                              <Menu.Item
                                                className={menuItemStyle}
                                                aria-label={`Manual search ${code} on ${target.instanceName}`}
                                                onClick={() =>
                                                  onManualSearch(
                                                    target,
                                                    local,
                                                    code,
                                                  )
                                                }
                                              >
                                                Manual search
                                              </Menu.Item>
                                            </Menu.Popup>
                                          </Menu.Positioner>
                                        </Menu.Portal>
                                      </Menu.Root>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </details>
          );
        })}
      </div>
      <Modal
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={detail?.episode.title || "Episode details"}
        description={
          detail ? `${media.title} · ${episodeCode(detail.episode)}` : undefined
        }
        wide
      >
        {detail && (
          <>
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "16px",
                fontSize: "12px",
                color: "muted",
                mb: "16px",
              })}
            >
              <span>{airDate(detail.episode)}</span>
              {detail.episode.runtime ? (
                <span>{detail.episode.runtime} min</span>
              ) : null}
            </div>
            <p className={mutedStyle}>
              {detail.episode.overview ||
                [...detail.targets.values()].find((episode) => episode.overview)
                  ?.overview ||
                "No synopsis is available for this episode."}
            </p>
            <h3
              className={css({
                fontSize: "13px",
                fontWeight: "550",
                mt: "25px",
                mb: "12px",
              })}
            >
              Files & availability
            </h3>
            <div className={css({ display: "grid", gap: "10px" })}>
              {media.targets.map((target, index) => {
                const local = detail.targets.get(target.instanceId);
                const query = queries[index];
                const stale =
                  query.isError || Boolean(query.data?.errors.length);
                return (
                  <div
                    key={target.instanceId}
                    className={css({
                      border: "1px solid token(colors.line)",
                      borderRadius: "7px",
                      p: "14px",
                      bg: "canvas",
                    })}
                  >
                    <div
                      className={css({
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "10px",
                      })}
                    >
                      <span
                        className={css({ fontSize: "12px", fontWeight: "500" })}
                      >
                        {target.instanceName}
                      </span>
                      {local ? (
                        <EpisodeAvailability episode={local} stale={stale} />
                      ) : (
                        <span
                          className={css({ color: "muted", fontSize: "11px" })}
                        >
                          {query.isPending
                            ? "Loading..."
                            : stale
                              ? "Unavailable"
                              : "No record"}
                        </span>
                      )}
                    </div>
                    <p
                      className={css({
                        fontSize: "11px",
                        color: "muted",
                        mt: "8px",
                      })}
                    >
                      {target.qualityProfile}
                      {local
                        ? ` · ${local.monitored ? "Monitored" : "Unmonitored"}`
                        : ""}
                      {local?.hasFile
                        ? ` · ${local.quality} · ${sizeLabel(local.sizeOnDisk)}`
                        : ""}
                    </p>
                    {stale && (
                      <p
                        className={css({
                          fontSize: "11px",
                          color: "warning",
                          mt: "8px",
                        })}
                      >
                        This instance's episode information may be incomplete or
                        out of date.
                      </p>
                    )}
                    {local && (
                      <div
                        className={css({
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: "8px",
                          mt: "12px",
                        })}
                      >
                        <Button
                          size="sm"
                          disabled={pending !== null}
                          onClick={() => void search(target, local)}
                        >
                          {pending === `${target.instanceId}:${local.id}` ? (
                            <Spinner size={13} />
                          ) : (
                            <MagnifyingGlassIcon size={13} />
                          )}
                          Auto search
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending !== null}
                          onClick={() => {
                            setSelected(null);
                            onManualSearch(target, local, episodeCode(local));
                          }}
                        >
                          Manual search
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}
