"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  FilmSlateIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";
import { mediaHref, sizeLabel } from "@/lib/client";
import {
  defaultViewOptions,
  type LibraryViewOptions,
} from "@/lib/library-options";
import { mediaSize } from "@/lib/library-selectors";
import type { MediaItem, MediaStatus, MediaTarget } from "@/lib/types";
import type { LibrarySort, LibrarySortDirection } from "./use-library-view";
import { useWindowList } from "./use-window-list";

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
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      minWidth: 0,
      textAlign: "left",
      borderRadius: "10px",
      width: "100%",
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
          transition: "box-shadow 150ms ease",
          _groupHover: { boxShadow: "0 14px 28px -12px #000" },
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

const tableColumns =
  "minmax(0, 2.6fr) 64px 72px minmax(0, 2fr) minmax(0, 1.2fr) 96px 104px";

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
}: {
  items: MediaItem[];
  sort?: LibrarySort;
  sortDirection?: LibrarySortDirection;
  onSort?: (sort: LibrarySort) => void;
}) {
  const headerProps = { sort, sortDirection, onSort };
  const { listRef, rows, spacerStyle, measureElement } =
    useWindowList<HTMLDivElement>({
      count: items.length,
      estimateSize: useCallback(() => 36, []),
      sizeKey: "table",
      getItemKey: useCallback((index: number) => items[index].id, [items]),
      overscan: 12,
    });
  return (
    <div
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
            gridTemplateColumns: tableColumns,
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
          <SortHeader label="Title" sortKey="title" {...headerProps} />
          <SortHeader label="Year" sortKey="year" {...headerProps} />
          <SortHeader label="Type" {...headerProps} />
          <SortHeader label="Targets" {...headerProps} />
          <SortHeader label="Episodes" {...headerProps} />
          <SortHeader
            label="On disk"
            sortKey="size"
            align="right"
            {...headerProps}
          />
          <SortHeader
            label="Added"
            sortKey="recent"
            align="right"
            {...headerProps}
          />
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
                  md: tableColumns,
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
                    _after: { content: '""', position: "absolute", inset: 0 },
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
              <span
                className={css({
                  display: { base: "none", md: "block" },
                  fontFamily: "mono",
                  fontSize: "12px",
                  color: "muted",
                })}
              >
                {item.year || "TBA"}
              </span>
              <span
                className={css({
                  display: { base: "none", md: "block" },
                  color: "muted",
                })}
              >
                {item.kind === "movie" ? "Movie" : "Show"}
              </span>
              <span className={css({ minWidth: 0 })}>
                <TargetChips targets={item.targets} limit={4} />
              </span>
              <span className={css({ display: { base: "none", md: "block" } })}>
                <EpisodeProgress item={item} />
              </span>
              <span
                className={css({
                  display: { base: "none", md: "block" },
                  textAlign: "right",
                  fontFamily: "mono",
                  fontSize: "12px",
                  color: size ? "soft" : "faint",
                })}
              >
                {size ? sizeLabel(size) : "—"}
              </span>
              <span
                className={css({
                  display: { base: "none", md: "block" },
                  textAlign: "right",
                  fontFamily: "mono",
                  fontSize: "12px",
                  color: "muted",
                })}
              >
                {item.added ? addedFormat.format(new Date(item.added)) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
