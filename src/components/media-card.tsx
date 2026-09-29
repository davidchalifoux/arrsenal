"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookmarkSimpleIcon,
  FilmSlateIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import Image from "next/image";
import Link from "next/link";
import { type CSSProperties, Fragment, useCallback, useState } from "react";
import { mediaHref, sizeLabel } from "@/lib/client";
import { libraryColumns } from "@/lib/library-columns";
import {
  defaultViewOptions,
  type LibraryViewOptions,
} from "@/lib/library-options";
import {
  mediaMonitoring,
  mediaSize,
  targetMonitoring,
} from "@/lib/library-selectors";
import type { MediaItem, MediaStatus, MediaTarget } from "@/lib/types";
import { visibleColumns } from "./table-options";
import type { LibrarySort, LibrarySortDirection } from "./use-library-view";
import { useScrollList } from "./use-scroll-list";

// Cover two rows at the widest grid without eagerly loading the library.
const eagerPosterCount = 12;

export const statusColor: Record<MediaStatus, string> = {
  available: "var(--positive)",
  downloading: "var(--info)",
  partial: "var(--warning)",
  missing: "var(--warning)",
};

export const statusLabel: Record<MediaStatus, string> = {
  available: "Available",
  downloading: "Downloading",
  partial: "Incomplete",
  missing: "Missing",
};

export function Poster({
  item,
  sizes = "(min-width: 2022px) 273px, (min-width: 1280px) calc((100vw - 386px) / 6), (min-width: 1024px) calc((100vw - 346px) / 4), (min-width: 768px) calc((100vw - 124px) / 4), (min-width: 640px) calc((100vw - 68px) / 3), calc((100vw - 53px) / 2)",
  priority = false,
}: {
  item: Pick<MediaItem, "poster" | "title">;
  sizes?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className={css({
        position: "absolute",
        inset: 0,
        bg: "elevated",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      })}
    >
      {item.poster && !failed ? (
        <Image
          src={item.poster}
          alt={`${item.title} poster`}
          fill
          sizes={sizes}
          loading={priority ? "eager" : "lazy"}
          onError={() => setFailed(true)}
          className={css({
            objectFit: "cover",
          })}
        />
      ) : (
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            textAlign: "center",
            p: "16px",
            color: "muted",
          })}
        >
          <FilmSlateIcon size={36} weight="duotone" />
          <span className={css({ fontSize: "13px" })}>{item.title}</span>
        </div>
      )}
    </div>
  );
}

/** One chip per target: its quality profile, dotted with the target's status. */
export function QualityBadge({
  target,
  label = "profile",
}: {
  target: MediaTarget;
  label?: "profile" | "quality";
}) {
  const text =
    label === "quality" ? target.quality || "No file" : target.qualityProfile;
  return (
    <span
      title={`${target.instanceName}: ${text} · ${statusLabel[target.status]}`}
      className={css({
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        px: "7px",
        minHeight: "22px",
        maxWidth: "100%",
        borderRadius: "6px",
        bg: "control",
        border: "1px solid token(colors.lineStrong)",
        color: "soft",
        fontSize: "11px",
        fontWeight: "500",
        whiteSpace: "nowrap",
      })}
    >
      <span
        aria-hidden="true"
        className={css({
          width: "6px",
          height: "6px",
          borderRadius: "999px",
          flexShrink: 0,
        })}
        style={{ background: statusColor[target.status] }}
      />
      <span className={css({ overflow: "hidden", textOverflow: "ellipsis" })}>
        {text}
      </span>
      <span className={css({ srOnly: true })}>
        , {statusLabel[target.status]} on {target.instanceName}
      </span>
    </span>
  );
}

function TargetChips({
  targets,
  limit = 3,
  label,
}: {
  targets: MediaTarget[];
  limit?: number;
  label?: "profile" | "quality";
}) {
  if (!targets.length) return null;
  return (
    <div className={css({ display: "flex", flexWrap: "wrap", gap: "5px" })}>
      {targets.slice(0, limit).map((target) => (
        <QualityBadge key={target.instanceId} target={target} label={label} />
      ))}
      {targets.length > limit && (
        <span
          className={css({
            display: "inline-flex",
            alignItems: "center",
            px: "6px",
            minHeight: "22px",
            borderRadius: "6px",
            bg: "control",
            fontSize: "11px",
            color: "muted",
          })}
        >
          +{targets.length - limit}
        </span>
      )}
    </div>
  );
}

export function MediaCard({
  item,
  onClick,
  href,
  index = eagerPosterCount,
  priority = index < eagerPosterCount,
  sizes,
  options = defaultViewOptions,
}: {
  item: MediaItem;
  onClick?: () => void;
  href?: string;
  index?: number;
  priority?: boolean;
  sizes?: string;
  options?: LibraryViewOptions;
}) {
  const size = mediaSize(item);
  const meta = [
    options.showYear ? String(item.year || "TBA") : null,
    options.showRating && item.rating ? `★ ${item.rating.toFixed(1)}` : null,
    options.showSize && size ? sizeLabel(size) : null,
  ].filter(Boolean);
  const className = cx(
    "group",
    css({
      position: "relative",
      // Keeps the hover backdrop behind this card's content only.
      isolation: "isolate",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      minWidth: 0,
      textAlign: "left",
      borderRadius: "10px",
      width: "100%",
      // A faint backdrop fades in behind the whole card on hover, reaching a
      // little past its edges (into the grid gap).
      _before: {
        content: '""',
        position: "absolute",
        inset: "-7px -7px -9px",
        zIndex: -1,
        borderRadius: "14px",
        bg: "elevated",
        opacity: 0,
        transform: "scale(0.97)",
        transition: "opacity 180ms ease, transform 180ms ease",
        pointerEvents: "none",
      },
      _hover: { _before: { opacity: 1, transform: "none" } },
      _focusVisible: {
        outline: "none",
        _before: {
          opacity: 1,
          transform: "none",
          boxShadow: "0 0 0 2px token(colors.accent)",
        },
      },
      _motionReduce: { _before: { transform: "none" } },
    }),
  );
  const content = (
    <>
      <div
        className={css({
          position: "relative",
          aspectRatio: "2 / 3",
          overflow: "hidden",
          borderRadius: "10px",
          bg: "surface",
          _after: {
            content: '""',
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            pointerEvents: "none",
            boxShadow: "inset 0 0 0 1px #ffffff12",
          },
        })}
      >
        <Poster item={item} priority={priority} sizes={sizes} />
      </div>
      <div className={css({ minWidth: 0 })}>
        <h3
          title={item.title}
          className={cx(
            css({
              fontSize: "14px",
              fontWeight: "500",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "ink",
              _groupHover: { color: "accent" },
              transition: "color 150ms",
            }),
            !options.showTitle && css({ srOnly: true }),
          )}
        >
          {item.title}
        </h3>
        <p
          className={cx(
            css({ mt: "3px", color: "subtle", fontSize: "12px" }),
            !meta.length && css({ srOnly: true }),
          )}
        >
          {meta.join(" · ")}
          <span className={css({ srOnly: true })}>
            {meta.length ? ", " : ""}
            {item.kind === "movie" ? "Movie" : "Show"}
          </span>
        </p>
        {options.showEpisodes && item.kind === "series" && (
          <div className={css({ mt: "6px" })}>
            <EpisodeProgress item={item} />
          </div>
        )}
      </div>
      {options.showTargets && (
        <TargetChips targets={item.targets} label={options.chipLabel} />
      )}
    </>
  );
  return href ? (
    <Link href={href} aria-label={`View ${item.title}`} className={className}>
      {content}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      aria-label={`View ${item.title}`}
      className={className}
    >
      {content}
    </button>
  );
}

function EpisodeProgress({ item }: { item: MediaItem }) {
  if (item.kind !== "series") {
    return <span className={css({ color: "faint" })}>—</span>;
  }
  const files = item.targets.reduce(
    (total, target) => total + (target.episodeFileCount ?? 0),
    0,
  );
  const count = item.targets.reduce(
    (total, target) => total + (target.episodeCount ?? 0),
    0,
  );
  if (!count) return <span className={css({ color: "faint" })}>—</span>;
  const percent = Math.min(100, Math.round((files / count) * 100));
  return (
    <span
      title="Downloaded episodes / episode count, across targets"
      className={css({ display: "flex", alignItems: "center", gap: "10px" })}
    >
      <span
        aria-hidden="true"
        className={css({
          flexGrow: 1,
          height: "4px",
          borderRadius: "999px",
          bg: "lineStrong",
          overflow: "hidden",
        })}
      >
        <span
          className={css({ display: "block", height: "100%" })}
          style={{
            width: `${percent}%`,
            background: percent === 100 ? "var(--positive)" : "var(--warning)",
          }}
        />
      </span>
      <span
        className={css({
          // A fixed slot keeps every bar the same length; the mono font makes
          // 9ch fit counts up to "999 / 999".
          minWidth: "9ch",
          flexShrink: 0,
          textAlign: "right",
          fontFamily: "mono",
          fontSize: "11px",
          color: "muted",
          whiteSpace: "nowrap",
        })}
      >
        {files} / {count}
      </span>
    </span>
  );
}

function MonitoredCell({ item }: { item: MediaItem }) {
  const { state, label } = mediaMonitoring(item);
  const detail =
    item.targets.length > 1
      ? item.targets
          .map(
            (target) =>
              `${target.instanceName}: ${targetMonitoring(target).label}`,
          )
          .join("\n")
      : undefined;
  return (
    <span
      title={detail}
      data-state={state}
      className={css({
        display: "flex",
        alignItems: "center",
        gap: "6px",
        minWidth: 0,
        fontSize: "12px",
        color: "soft",
        whiteSpace: "nowrap",
        "&[data-state=partial]": { color: "warning" },
        "&[data-state=unmonitored]": { color: "subtle" },
      })}
    >
      <BookmarkSimpleIcon
        size={13}
        aria-hidden="true"
        weight={
          state === "monitored"
            ? "fill"
            : state === "partial"
              ? "duotone"
              : "regular"
        }
        className={css({ flexShrink: 0 })}
      />
      <span className={css({ overflow: "hidden", textOverflow: "ellipsis" })}>
        {label}
      </span>
    </span>
  );
}

const libraryTracks: Record<string, string> = {
  title: "minmax(0, 2.6fr)",
  year: "64px",
  type: "72px",
  targets: "minmax(0, 2fr)",
  episodes: "minmax(0, 1.2fr)",
  monitored: "124px",
  size: "96px",
  added: "104px",
  rating: "64px",
  genres: "minmax(0, 1.4fr)",
  runtime: "72px",
  profile: "minmax(0, 1.2fr)",
};

const librarySortKeys: Partial<Record<string, LibrarySort>> = {
  title: "title",
  year: "year",
  episodes: "episodes",
  monitored: "monitored",
  size: "size",
  added: "recent",
  rating: "rating",
};

const rightAligned = new Set(["size", "added", "rating", "runtime"]);

// Hidden on phones, where rows show only the title and target chips.
const desktopCell = css.raw({ display: { base: "none", md: "block" } });
const monoCell = css.raw({ fontFamily: "mono", fontSize: "12px" });
const truncateCell = css.raw({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const addedFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function SortHeader({
  label,
  sortKey,
  sort,
  sortDirection,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey?: LibrarySort;
  sort: LibrarySort;
  sortDirection: LibrarySortDirection;
  onSort: (sort: LibrarySort) => void;
  align?: "left" | "right";
}) {
  if (!sortKey)
    return <span className={css({ textAlign: align })}>{label}</span>;
  const active = sort === sortKey;
  return (
    <span
      className={css({
        display: "flex",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
      })}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label.toLowerCase()}${active ? (sortDirection === "asc" ? ", ascending" : ", descending") : ""}`}
        className={css({
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          p: 0,
          border: 0,
          bg: "transparent",
          font: "inherit",
          letterSpacing: "inherit",
          textTransform: "inherit",
          color: active ? "ink" : "inherit",
          _hover: { color: "ink" },
        })}
      >
        {label}
        {active &&
          (sortDirection === "asc" ? (
            <ArrowUpIcon size={12} weight="bold" color="var(--accent)" />
          ) : (
            <ArrowDownIcon size={12} weight="bold" color="var(--accent)" />
          ))}
      </button>
    </span>
  );
}

export function MediaList({
  items,
  sort = "recent",
  sortDirection = "desc",
  onSort = () => {},
  columns = visibleColumns(libraryColumns),
}: {
  items: MediaItem[];
  sort?: LibrarySort;
  sortDirection?: LibrarySortDirection;
  onSort?: (sort: LibrarySort) => void;
  /** Visible column keys in order, starting with the title. */
  columns?: string[];
}) {
  const headerProps = { sort, sortDirection, onSort };
  const labels = new Map(
    libraryColumns.map((column) => [column.key, column.label]),
  );
  const template = columns.map((column) => libraryTracks[column]).join(" ");
  const { listRef, rows, spacerStyle, measureElement } =
    useScrollList<HTMLDivElement>({
      count: items.length,
      estimateSize: useCallback(() => 36, []),
      sizeKey: "table",
      getItemKey: useCallback((index: number) => items[index].id, [items]),
      overscan: 12,
    });
  return (
    <div
      style={{ "--library-columns": template } as CSSProperties}
      className={css({
        border: "1px solid token(colors.line)",
        borderRadius: "12px",
        overflow: "hidden",
        bg: "surface",
      })}
    >
      <div>
        <div
          className={css({
            display: { base: "none", md: "grid" },
            gridTemplateColumns: "var(--library-columns)",
            alignItems: "center",
            gap: "16px",
            height: "38px",
            px: "16px",
            bg: "raised",
            borderBottom: "1px solid token(colors.line)",
            fontSize: "11px",
            fontWeight: "600",
            letterSpacing: ".05em",
            textTransform: "uppercase",
            color: "subtle",
          })}
        >
          {columns.map((column) => (
            <SortHeader
              key={column}
              label={labels.get(column) ?? column}
              sortKey={librarySortKeys[column]}
              align={rightAligned.has(column) ? "right" : "left"}
              {...headerProps}
            />
          ))}
        </div>
      </div>
      <div ref={listRef} style={spacerStyle}>
        {rows.map((row) => {
          const item = items[row.index];
          const size = mediaSize(item);
          return (
            <div
              key={row.key}
              ref={measureElement}
              data-index={row.index}
              data-stripe={row.index % 2 ? "" : undefined}
              data-last={row.index === items.length - 1 ? "" : undefined}
              className={css({
                position: "relative",
                display: "grid",
                gridTemplateColumns: {
                  base: "minmax(0, 1fr) auto",
                  md: "var(--library-columns)",
                },
                alignItems: "center",
                gap: "8px 16px",
                minHeight: "36px",
                px: "16px",
                py: { base: "10px", md: "4px" },
                borderBottom: "1px solid token(colors.lineSoft)",
                fontSize: "13px",
                // Rows are windowed, so position comes from the list index.
                "&[data-last]": { borderBottom: 0 },
                "&[data-stripe]": {
                  bg: "color-mix(in srgb, var(--raised) 55%, transparent)",
                },
                _hover: { bg: "elevated" },
              })}
            >
              {columns.map((column) => (
                <Fragment key={column}>
                  {column === "title" ? (
                    <span
                      className={css({
                        fontWeight: "500",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      })}
                    >
                      <Link
                        href={mediaHref(item)}
                        className={css({
                          _after: {
                            content: '""',
                            position: "absolute",
                            inset: 0,
                          },
                          _focusVisible: { outline: "none" },
                          "&:focus-visible::after": {
                            outline: "2px solid var(--accent)",
                            outlineOffset: "-2px",
                          },
                        })}
                      >
                        {item.title}
                      </Link>
                      <span
                        className={css({
                          display: { base: "block", md: "none" },
                          mt: "2px",
                          fontSize: "12px",
                          color: "subtle",
                          fontWeight: "400",
                        })}
                      >
                        {item.year || "TBA"} ·{" "}
                        {item.kind === "movie" ? "Movie" : "Show"}
                      </span>
                    </span>
                  ) : (
                    <LibraryCell column={column} item={item} size={size} />
                  )}
                </Fragment>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LibraryCell({
  column,
  item,
  size,
}: {
  column: string;
  item: MediaItem;
  size: number;
}) {
  switch (column) {
    case "year":
      return (
        <span className={css(desktopCell, monoCell, { color: "muted" })}>
          {item.year || "TBA"}
        </span>
      );
    case "type":
      return (
        <span className={css(desktopCell, { color: "muted" })}>
          {item.kind === "movie" ? "Movie" : "Show"}
        </span>
      );
    case "targets":
      // The one detail column phones keep, beside the title.
      return (
        <span className={css({ minWidth: 0 })}>
          <TargetChips targets={item.targets} limit={4} />
        </span>
      );
    case "episodes":
      return (
        <span className={css(desktopCell)}>
          <EpisodeProgress item={item} />
        </span>
      );
    case "monitored":
      return (
        <span className={css(desktopCell)}>
          <MonitoredCell item={item} />
        </span>
      );
    case "size":
      return (
        <span
          className={css(desktopCell, monoCell, {
            textAlign: "right",
            color: size ? "soft" : "faint",
          })}
        >
          {size ? sizeLabel(size) : "—"}
        </span>
      );
    case "added":
      return (
        <span
          className={css(desktopCell, monoCell, {
            textAlign: "right",
            color: "muted",
          })}
        >
          {item.added ? addedFormat.format(new Date(item.added)) : "—"}
        </span>
      );
    case "rating":
      return (
        <span
          className={css(desktopCell, monoCell, {
            textAlign: "right",
            color: item.rating ? "soft" : "faint",
          })}
        >
          {item.rating ? item.rating.toFixed(1) : "—"}
        </span>
      );
    case "genres":
      return (
        <span
          title={item.genres.join(", ")}
          className={css(desktopCell, truncateCell, { color: "muted" })}
        >
          {item.genres.join(", ") || "—"}
        </span>
      );
    case "runtime":
      return (
        <span
          className={css(desktopCell, monoCell, {
            textAlign: "right",
            color: item.runtime ? "muted" : "faint",
          })}
        >
          {item.runtime ? `${item.runtime}m` : "—"}
        </span>
      );
    case "profile": {
      const profiles = [
        ...new Set(item.targets.map((target) => target.qualityProfile)),
      ].join(", ");
      return (
        <span
          title={profiles}
          className={css(desktopCell, truncateCell, { color: "muted" })}
        >
          {profiles || "—"}
        </span>
      );
    }
    default:
      return <span className={css(desktopCell)} />;
  }
}
