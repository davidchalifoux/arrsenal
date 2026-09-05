"use client";

import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowSquareOutIcon,
  CheckCircleIcon,
  ClockIcon,
  HardDrivesIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  StarIcon,
  TargetIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";
import { api, sizeLabel } from "@/lib/client";
import type {
  ActionResponse,
  MediaItem,
  MediaTarget,
  Release,
} from "@/lib/types";
import { Poster, QualityBadge } from "./media-card";
import { SeriesEpisodes } from "./series-episodes";
import { Button, Modal, mutedStyle, Notice, SelectField, Spinner } from "./ui";

export function MediaDetails({
  media,
  onAddTarget,
  notify,
  onChanged,
}: {
  media: MediaItem;
  onAddTarget: (item: MediaItem) => void;
  notify: (message: string, error?: boolean) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<MediaTarget | null>(null);
  const [episodeScope, setEpisodeScope] = useState<{
    id: number;
    code: string;
  } | null>(null);
  const searchLock = useRef(false);
  const [error, setError] = useState("");
  async function search(target: MediaTarget) {
    if (searchLock.current) return;
    searchLock.current = true;
    setBusy(target.instanceId);
    setError("");
    try {
      const result = await api<ActionResponse>("/api/search", {
        method: "POST",
        body: JSON.stringify({
          instanceId: target.instanceId,
          remoteId: target.remoteId,
          kind: media.kind,
        }),
      });
      if (!result.success) throw new Error(result.message);
      notify(result.message);
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Search failed.");
    } finally {
      searchLock.current = false;
      setBusy(null);
    }
  }
  return (
    <>
      <article className={css({ minWidth: 0, width: "100%" })}>
        <div
          className={css({
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            mb: "28px",
          })}
        >
          <Link
            href={media.kind === "movie" ? "/movies" : "/shows"}
            className={css({
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              color: "muted",
              fontSize: "12px",
              _hover: { color: "ink" },
            })}
          >
            <ArrowLeftIcon size={15} /> Back to{" "}
            {media.kind === "movie" ? "Movies" : "Shows"}
          </Link>
          <Button onClick={() => onAddTarget(media)}>
            <PlusIcon size={15} />
            Add target
          </Button>
        </div>
        <div
          className={css({
            display: "flex",
            flexDirection: { base: "column", sm: "row" },
            gap: { base: "18px", md: "26px" },
            mb: "26px",
          })}
        >
          <div
            className={css({
              width: { base: "130px", md: "190px" },
              aspectRatio: "2 / 3",
              flexShrink: 0,
              position: "relative",
              borderRadius: "7px",
              overflow: "hidden",
              alignSelf: "flex-start",
            })}
          >
            <Poster
              item={media}
              sizes="(min-width: 768px) 190px, 130px"
              priority
            />
          </div>
          <div className={css({ minWidth: 0, pt: "3px" })}>
            <h1
              className={css({
                fontSize: { base: "28px", md: "36px" },
                fontWeight: "600",
                letterSpacing: "-.9px",
                lineHeight: "1.2",
                mb: "10px",
              })}
            >
              {media.title}
            </h1>
            <p className={cx(mutedStyle, css({ mb: "20px" }))}>
              {[
                media.year || "Release date unknown",
                media.kind === "movie" ? "Movie" : "Show",
                ...media.genres,
              ].join(" · ")}
            </p>
            <div
              className={css({
                display: "flex",
                flexWrap: "wrap",
                gap: "14px",
                alignItems: "center",
                mb: "14px",
                color: "muted",
                fontSize: "12px",
              })}
            >
              {media.rating ? (
                <span
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    color: "ink",
                  })}
                >
                  <StarIcon size={15} weight="fill" />
                  {media.rating.toFixed(1)}
                  <span className={css({ color: "subtle", fontSize: "10px" })}>
                    / 10
                  </span>
                </span>
              ) : null}
              {media.runtime ? (
                <span
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                  })}
                >
                  <ClockIcon size={14} />
                  {media.runtime} min
                </span>
              ) : null}
              <span
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                })}
              >
                <HardDrivesIcon size={14} />
                Total on disk:{" "}
                {sizeLabel(
                  media.targets.reduce(
                    (sum, target) => sum + target.sizeOnDisk,
                    0,
                  ),
                )}
              </span>
            </div>
            <p
              className={cx(
                mutedStyle,
                css({
                  fontSize: { base: "12px", md: "13px" },
                  lineHeight: "1.8",
                  maxWidth: "780px",
                }),
              )}
            >
              {media.overview || "No overview is available for this title."}
            </p>
            {(media.tmdbId || media.tvdbId) && (
              <a
                href={
                  media.tmdbId
                    ? `https://www.themoviedb.org/${media.kind === "movie" ? "movie" : "tv"}/${media.tmdbId}`
                    : `https://www.thetvdb.com/?tab=series&id=${media.tvdbId}`
                }
                target="_blank"
                rel="noreferrer"
                className={css({
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "11px",
                  color: "subtle",
                  mt: "16px",
                  _hover: { color: "accent" },
                })}
              >
                View on {media.tmdbId ? "TMDB" : "TVDB"}
                <ArrowSquareOutIcon size={13} />
              </a>
            )}
          </div>
        </div>
        <div
          className={css({
            borderTop: "1px solid token(colors.line)",
            pt: "22px",
          })}
        >
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: "16px",
            })}
          >
            <h2
              className={css({
                display: "flex",
                gap: "8px",
                alignItems: "center",
                fontSize: "14px",
                fontWeight: "550",
              })}
            >
              <TargetIcon size={18} className={css({ color: "accent" })} />
              Quality targets
              <span
                className={css({
                  color: "subtle",
                  fontSize: "11px",
                  fontWeight: "400",
                })}
              >
                {media.targets.length}
              </span>
            </h2>
          </div>
          <div
            className={css({
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
              gap: "10px",
            })}
          >
            {media.targets.map((target) => (
              <div
                key={target.instanceId}
                className={css({
                  p: "15px",
                  border: "1px solid token(colors.line)",
                  borderRadius: "8px",
                  bg: "#202020",
                })}
              >
                <div
                  className={css({
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                  })}
                >
                  <div
                    className={css({
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    })}
                  >
                    <span
                      className={css({
                        width: "30px",
                        height: "30px",
                        display: "grid",
                        placeItems: "center",
                        borderRadius: "7px",
                        bg: "#303030",
                        color: "#c7c7c7",
                      })}
                    >
                      <HardDrivesIcon size={17} />
                    </span>
                    <div>
                      <h4
                        className={css({
                          fontSize: "12px",
                          fontWeight: "550",
                        })}
                      >
                        {target.instanceName}
                      </h4>
                      <p
                        className={css({
                          color: "subtle",
                          fontSize: "10px",
                          mt: "3px",
                        })}
                      >
                        {target.qualityProfile} ·{" "}
                        {target.monitored ? "Monitored" : "Unmonitored"}
                      </p>
                    </div>
                  </div>
                  <QualityBadge target={target} />
                </div>
                <div
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "10px",
                    mt: "14px",
                  })}
                >
                  <span
                    className={css({
                      fontSize: "11px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      color:
                        target.status === "available"
                          ? "positive"
                          : target.status === "downloading"
                            ? "info"
                            : "warning",
                    })}
                  >
                    {target.status === "available" ? (
                      <CheckCircleIcon size={14} />
                    ) : target.status === "downloading" ? (
                      <ArrowDownIcon size={14} />
                    ) : (
                      <WarningCircleIcon size={14} />
                    )}
                    {target.status === "available"
                      ? "Available"
                      : target.status === "downloading"
                        ? "Downloading"
                        : target.status === "partial"
                          ? "Some episodes missing"
                          : "Missing"}
                    <span className={css({ color: "subtle" })}>
                      {target.episodeCount !== undefined
                        ? ` · ${target.episodeFileCount ?? 0}/${target.episodeCount} episodes`
                        : target.sizeOnDisk
                          ? ` · ${sizeLabel(target.sizeOnDisk)}`
                          : ""}
                    </span>
                  </span>
                  <div className={css({ display: "flex", gap: "6px" })}>
                    <Button
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => search(target)}
                    >
                      {busy === target.instanceId ? (
                        <Spinner size={13} />
                      ) : (
                        <MagnifyingGlassIcon size={13} />
                      )}
                      Auto search
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEpisodeScope(null);
                        setReleaseTarget(target);
                      }}
                    >
                      Manual search
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {media.targets.length === 0 && (
            <p className={mutedStyle}>
              This title is not in your library yet. Add a target to get
              started.
            </p>
          )}
          {error && (
            <div className={css({ mt: "14px" })}>
              <Notice error>{error}</Notice>
            </div>
          )}
        </div>
        {media.kind === "series" && (
          <SeriesEpisodes
            media={media}
            notify={notify}
            onChanged={onChanged}
            onManualSearch={(target, episode, code) => {
              setEpisodeScope({ id: episode.id, code });
              setReleaseTarget(target);
            }}
          />
        )}
      </article>
      {releaseTarget && (
        <ReleaseSearch
          key={episodeScope?.id ?? "all"}
          media={media}
          target={releaseTarget}
          targets={media.targets}
          onClose={() => setReleaseTarget(null)}
          onTarget={setReleaseTarget}
          notify={notify}
          onChanged={onChanged}
          episodeScope={episodeScope}
        />
      )}
    </>
  );
}

function ReleaseSearch({
  media,
  target,
  targets,
  onClose,
  onTarget,
  notify,
  onChanged,
  episodeScope,
}: {
  media: MediaItem;
  target: MediaTarget;
  targets: MediaTarget[];
  onClose: () => void;
  onTarget: (target: MediaTarget) => void;
  notify: (message: string, error?: boolean) => void;
  onChanged: () => void;
  episodeScope?: { id: number; code: string } | null;
}) {
  const grabLock = useRef(false);
  const [grabbing, setGrabbing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Release | null>(null);
  const releases = useQuery({
    queryKey: [
      "releases",
      target.instanceId,
      target.remoteId,
      media.kind,
      ...(episodeScope ? [episodeScope.id] : []),
    ],
    queryFn: ({ signal }) =>
      api<{ items: Release[] }>(
        `/api/releases?instanceId=${encodeURIComponent(target.instanceId)}&remoteId=${target.remoteId}&kind=${media.kind}${episodeScope ? `&episodeId=${episodeScope.id}` : ""}`,
        { signal },
      ),
    retry: false,
  });
  async function grab(release: Release) {
    if (grabLock.current) return;
    grabLock.current = true;
    setGrabbing(release.guid);
    try {
      const result = await api<ActionResponse>("/api/releases", {
        method: "POST",
        body: JSON.stringify({
          instanceId: target.instanceId,
          guid: release.guid,
          indexerId: release.indexerId,
        }),
      });
      if (!result.success) throw new Error(result.message);
      notify(result.message);
      setConfirm(null);
      onChanged();
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : "Unable to grab release.",
        true,
      );
    } finally {
      grabLock.current = false;
      setGrabbing(null);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Manual search"
      description={`Find a release for ${media.title}${episodeScope ? ` · ${episodeScope.code}` : ""}. Your instance's indexers and quality rules are used.`}
      wide
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          mb: "20px",
        })}
      >
        <SelectField
          disabled={Boolean(episodeScope) || grabbing !== null}
          value={target.instanceId}
          onChange={(id) => {
            const next = targets.find((item) => item.instanceId === id);
            if (next) {
              onTarget(next);
              setConfirm(null);
            }
          }}
          label="Search instance"
          options={targets.map((item) => ({
            value: item.instanceId,
            label: item.instanceName,
          }))}
        />
        <Button
          onClick={() => releases.refetch()}
          disabled={releases.isFetching}
        >
          {releases.isFetching ? (
            <Spinner />
          ) : (
            <MagnifyingGlassIcon size={15} />
          )}
          Search again
        </Button>
      </div>
      {releases.isPending ? (
        <div
          className={css({
            display: "flex",
            gap: "10px",
            alignItems: "center",
            justifyContent: "center",
            py: "40px",
            color: "muted",
          })}
        >
          <Spinner />
          Searching indexers...
        </div>
      ) : releases.isError ? (
        <Notice error>{releases.error.message}</Notice>
      ) : releases.data?.items.length === 0 ? (
        <p className={cx(mutedStyle, css({ py: "30px", textAlign: "center" }))}>
          No releases found. Check this instance&apos;s indexers and try again.
        </p>
      ) : (
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          })}
        >
          {releases.data?.items.map((release) => (
            <div
              key={`${release.indexerId}:${release.guid}`}
              className={css({
                border: "1px solid token(colors.line)",
                borderRadius: "7px",
                p: "13px",
                display: "flex",
                gap: "14px",
                alignItems: "center",
              })}
            >
              <div className={css({ minWidth: 0, flex: 1 })}>
                <p
                  title={release.title}
                  className={css({
                    fontSize: "12px",
                    overflowWrap: "anywhere",
                    fontWeight: "500",
                  })}
                >
                  {release.title}
                </p>
                <p
                  className={css({
                    fontSize: "10px",
                    color: "muted",
                    mt: "7px",
                  })}
                >
                  {release.quality} · {sizeLabel(release.size)} ·{" "}
                  {release.indexer} · {release.age}d old{" "}
                  {release.seeders !== undefined
                    ? ` · ${release.seeders} seeders`
                    : ""}
                </p>
                {release.rejections.length > 0 && (
                  <p
                    className={css({
                      color: "warning",
                      fontSize: "10px",
                      mt: "7px",
                    })}
                  >
                    {release.rejections.join(" · ")}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                disabled={grabbing !== null}
                onClick={() => setConfirm(release)}
              >
                <ArrowDownIcon size={14} />
                Grab
              </Button>
            </div>
          ))}
        </div>
      )}
      {confirm && (
        <div
          className={css({
            borderTop: "1px solid token(colors.line)",
            mt: "20px",
            pt: "16px",
          })}
        >
          <Notice error={!confirm.approved}>
            {confirm.approved
              ? "Send this release to your download client?"
              : "This release was rejected by your quality rules. Grabbing it will override those rules."}
          </Notice>
          <p
            className={css({
              fontSize: "11px",
              overflowWrap: "anywhere",
              color: "muted",
              my: "12px",
            })}
          >
            {confirm.title}
          </p>
          <div
            className={css({
              display: "flex",
              justifyContent: "flex-end",
              gap: "8px",
            })}
          >
            <Button
              disabled={grabbing !== null}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={grabbing !== null}
              onClick={() => grab(confirm)}
            >
              {grabbing ? <Spinner /> : <ArrowDownIcon size={14} />}Confirm grab
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
