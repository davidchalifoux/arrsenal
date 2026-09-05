"use client";

import { Menu } from "@base-ui/react/menu";
import { DotsThreeIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { api } from "@/lib/client";
import type {
  ActionResponse,
  Episode,
  EpisodeStatus,
  EpisodesResponse,
  MediaItem,
  MediaTarget,
} from "@/lib/types";
import { Button, buttonStyle, mutedStyle, Notice, Spinner } from "./ui";

const statuses: Record<EpisodeStatus, string> = {
  available: "Available",
  missing: "Missing",
  downloading: "Downloading",
  unreleased: "Unreleased",
  unmonitored: "Unmonitored",
  unknown: "Unknown",
};

const cellStyle = css({
  p: "14px 16px",
  textAlign: "left",
  verticalAlign: "top",
  borderTop: "1px solid token(colors.line)",
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

export function SeriesEpisodes({
  media,
  notify,
  onChanged,
  onManualSearch,
}: {
  media: MediaItem;
  notify: (message: string, error?: boolean) => void;
  onChanged: () => void;
  onManualSearch: (target: MediaTarget, episode: Episode, code: string) => void;
}) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const searchLock = useRef(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
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
        ) {
          throw new Error("Episode response does not match this target.");
        }
        return response;
      },
      refetchInterval: 30_000,
      retry: false,
    })),
  });

  // Only display identities are merged. Action IDs always come from the target's own response.
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
  const seasonNumbers = [...seasons.keys()].sort((a, b) => a - b);
  const latest = Math.max(0, ...seasonNumbers.filter((number) => number > 0));
  const loading = queries.some((query) => query.isPending);
  const failed = queries.some(
    (query) => query.isError || Boolean(query.data?.errors.length),
  );

  async function search(target: MediaTarget, episode: Episode) {
    if (searchLock.current) return;
    searchLock.current = true;
    setPending(`${target.instanceId}:${episode.id}`);
    try {
      const result = await api<ActionResponse>("/api/search", {
        method: "POST",
        body: JSON.stringify({
          instanceId: target.instanceId,
          remoteId: target.remoteId,
          kind: "series",
          episodeId: episode.id,
        }),
      });
      if (!result.success) throw new Error(result.message);
      notify(result.message);
      onChanged();
      await queryClient.invalidateQueries({
        queryKey: ["episodes", target.instanceId, target.remoteId],
      });
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "Episode search failed.",
        true,
      );
    } finally {
      searchLock.current = false;
      setPending(null);
    }
  }

  return (
    <section
      aria-labelledby="episodes-heading"
      className={css({
        mt: "32px",
        pt: "24px",
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
          <p className={css({ fontSize: "12px", color: "muted", mt: "5px" })}>
            Availability and searches for each quality target.
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
      <div className={css({ display: "grid", gap: "10px" })}>
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
          return (
            <details
              key={number}
              open={expanded[number] ?? number === latest}
              onToggle={(event) => {
                const open = event.currentTarget.open;
                if (open !== (expanded[number] ?? number === latest)) {
                  setExpanded((current) => ({ ...current, [number]: open }));
                }
              }}
              className={css({
                border: "1px solid token(colors.line)",
                borderRadius: "8px",
                bg: "surface",
                overflow: "hidden",
              })}
            >
              <summary
                className={css({
                  p: "16px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: "550",
                  _hover: { bg: "elevated" },
                })}
              >
                {number === 0 ? "Specials" : `Season ${number}`}
                <span
                  className={css({
                    color: "muted",
                    fontWeight: "400",
                    ml: "12px",
                    fontSize: "11px",
                  })}
                >
                  {rows.length} {rows.length === 1 ? "episode" : "episodes"}
                </span>
              </summary>
              {rows.length === 0 ? (
                <p
                  className={css({
                    px: "16px",
                    pb: "16px",
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
                    <thead>
                      <tr>
                        <th scope="col" className={cellStyle}>
                          Episode
                        </th>
                        {media.targets.map((target) => (
                          <th
                            key={target.instanceId}
                            scope="col"
                            className={cellStyle}
                          >
                            <span>{target.instanceName}</span>
                            <span
                              className={css({
                                display: "block",
                                fontSize: "10px",
                                fontWeight: "400",
                                color: "muted",
                                mt: "4px",
                              })}
                            >
                              {target.qualityProfile}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ episode, targets }) => {
                        const code = `S${String(number).padStart(2, "0")}E${String(episode.episodeNumber).padStart(2, "0")}`;
                        const date = episode.airDateUtc
                          ? new Date(episode.airDateUtc)
                          : null;
                        const airDate =
                          date && !Number.isNaN(date.getTime())
                            ? new Intl.DateTimeFormat("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                timeZone: "UTC",
                              }).format(date)
                            : null;
                        return (
                          <tr key={episode.episodeNumber}>
                            <th scope="row" className={cellStyle}>
                              <div
                                className={css({
                                  minWidth: "210px",
                                  maxWidth: "480px",
                                  fontWeight: "400",
                                })}
                              >
                                <span
                                  className={css({
                                    fontFamily: "mono",
                                    color: "muted",
                                    fontSize: "10px",
                                  })}
                                >
                                  {code}
                                </span>
                                <p
                                  className={css({
                                    fontWeight: "500",
                                    mt: "4px",
                                  })}
                                >
                                  {episode.title || "Untitled episode"}
                                </p>
                                <p
                                  className={css({
                                    fontSize: "10px",
                                    color: "muted",
                                    mt: "5px",
                                  })}
                                >
                                  {[
                                    airDate,
                                    episode.runtime
                                      ? `${episode.runtime} min`
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                                {episode.overview && (
                                  <details
                                    className={css({
                                      mt: "6px",
                                      color: "muted",
                                      fontSize: "11px",
                                    })}
                                  >
                                    <summary
                                      className={css({ cursor: "pointer" })}
                                    >
                                      Overview
                                      <span className={css({ srOnly: true })}>
                                        {" "}
                                        for {code}
                                      </span>
                                    </summary>
                                    <p
                                      className={css({
                                        mt: "6px",
                                        lineHeight: "1.7",
                                        fontWeight: "400",
                                      })}
                                    >
                                      {episode.overview}
                                    </p>
                                  </details>
                                )}
                              </div>
                            </th>
                            {media.targets.map((target, index) => {
                              const local = targets.get(target.instanceId);
                              const query = queries[index];
                              const unavailable =
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
                                      gap: "12px",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      minWidth: "155px",
                                    })}
                                  >
                                    <div>
                                      <span
                                        className={css({
                                          color:
                                            local?.status === "available"
                                              ? "positive"
                                              : local?.status === "downloading"
                                                ? "info"
                                                : local?.status === "missing"
                                                  ? "warning"
                                                  : "muted",
                                        })}
                                      >
                                        {local
                                          ? statuses[local.status]
                                          : query.isPending
                                            ? "Loading..."
                                            : unavailable
                                              ? "Unavailable"
                                              : "No record"}
                                      </span>
                                      {local?.quality && (
                                        <p
                                          className={css({
                                            mt: "4px",
                                            color: "muted",
                                            fontSize: "10px",
                                          })}
                                        >
                                          {local.quality}
                                        </p>
                                      )}
                                      {local && unavailable && (
                                        <p
                                          className={css({
                                            mt: "4px",
                                            color: "warning",
                                            fontSize: "10px",
                                          })}
                                        >
                                          Last known status
                                        </p>
                                      )}
                                      {isPending && (
                                        <output
                                          className={css({
                                            display: "flex",
                                            gap: "5px",
                                            alignItems: "center",
                                            fontSize: "10px",
                                            color: "muted",
                                            mt: "5px",
                                          })}
                                        >
                                          <Spinner size={12} />
                                          Searching...
                                        </output>
                                      )}
                                    </div>
                                    {local && (
                                      <Menu.Root modal={false}>
                                        <Menu.Trigger
                                          disabled={pending !== null}
                                          aria-label={`Actions for ${code} ${episode.title} on ${target.instanceName}`}
                                          className={buttonStyle({
                                            variant: "ghost",
                                            size: "icon",
                                          })}
                                        >
                                          <DotsThreeIcon size={20} />
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
    </section>
  );
}
