"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import type { ReactNode } from "react";
import { sizeLabel } from "@/lib/client";
import type { ColumnDefinition } from "@/lib/table-columns";
import type { Release } from "@/lib/types";
import {
  cellStyle,
  headCellStyle,
  tableHeadStyle,
  tableStyle,
} from "./table-styles";
import { Button, Spinner } from "./ui";

/** Manual search columns, in default order. The title is always shown. */
export const releaseColumns: ColumnDefinition[] = [
  { key: "title", label: "Title", locked: true },
  { key: "source", label: "Source" },
  { key: "age", label: "Age" },
  { key: "indexer", label: "Indexer" },
  { key: "size", label: "Size" },
  { key: "peers", label: "Peers" },
  { key: "languages", label: "Languages" },
  { key: "quality", label: "Quality" },
  { key: "score", label: "Score" },
];

/** "rank" is the instance's own preference order, its best match first. */
export type ReleaseSortKey =
  | "rank"
  | "title"
  | "source"
  | "age"
  | "indexer"
  | "size"
  | "peers"
  | "languages"
  | "quality"
  | "score";
export type ReleaseSort = { key: ReleaseSortKey; direction: "asc" | "desc" };

export const bestMatch: ReleaseSort = { key: "rank", direction: "asc" };

// Bigger is better for these, so a first click puts the best on top.
const descendingFirst = new Set<ReleaseSortKey>([
  "size",
  "peers",
  "quality",
  "score",
]);

export function nextReleaseSort(
  current: ReleaseSort,
  key: ReleaseSortKey,
): ReleaseSort {
  if (current.key === key)
    return {
      key,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  return { key, direction: descendingFirst.has(key) ? "desc" : "asc" };
}

function sortValue(
  release: Release,
  key: ReleaseSortKey,
): string | number | undefined {
  switch (key) {
    case "rank":
      return release.releaseWeight;
    case "title":
      return release.title.toLowerCase();
    case "source":
      return release.protocol;
    case "age":
      return release.ageMinutes;
    case "indexer":
      return release.indexer.toLowerCase();
    case "size":
      return release.size;
    case "peers":
      return release.protocol === "torrent" ? release.seeders : undefined;
    case "languages":
      return release.languages.join(", ").toLowerCase() || undefined;
    case "quality":
      return release.qualityWeight;
    case "score":
      return release.customFormatScore;
  }
}

/**
 * Releases in the chosen order. Missing values, such as peers for Usenet,
 * always sort last, and ties keep the instance's best-match order.
 */
export function sortReleases(
  releases: readonly Release[],
  sort: ReleaseSort,
): Release[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...releases].sort((a, b) => {
    const left = sortValue(a, sort.key);
    const right = sortValue(b, sort.key);
    if (left !== right) {
      if (left === undefined) return 1;
      if (right === undefined) return -1;
      const order =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));
      if (order) return order * sign;
    }
    return a.releaseWeight - b.releaseWeight;
  });
}

export function ageLabel(release: Release) {
  const minutes = release.ageMinutes;
  if (minutes < 60) return `${Math.max(0, Math.round(minutes))} min`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h`;
  const days = Math.round(minutes / (24 * 60));
  return `${days} ${days === 1 ? "day" : "days"}`;
}

const truncate = css.raw({
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
const quiet = css.raw({ whiteSpace: "nowrap", color: "muted" });
const numeric = css.raw({
  whiteSpace: "nowrap",
  color: "soft",
  fontVariantNumeric: "tabular-nums",
});
const badge = css.raw({
  display: "inline-block",
  px: "6px",
  py: "1px",
  borderRadius: "4px",
  fontSize: "10px",
  fontWeight: "600",
  textTransform: "lowercase",
});

const sourceBadges: Record<string, string> = {
  torrent: css(badge, {
    bg: "color-mix(in srgb, var(--positive) 18%, transparent)",
    color: "positive",
  }),
  usenet: css(badge, {
    bg: "color-mix(in srgb, var(--info) 18%, transparent)",
    color: "info",
  }),
  unknown: css(badge, { bg: "elevated", color: "muted" }),
};

type ReleaseCell = {
  head?: string;
  cell?: string;
  /** Right-aligned numbers. */
  numeric?: boolean;
  render: (release: Release) => ReactNode;
};

const releaseCells: Record<string, ReleaseCell> = {
  title: {
    head: css({ width: "100%" }),
    cell: css({ maxWidth: 0, minWidth: "260px" }),
    render: (release) => (
      <>
        {release.infoUrl ? (
          <a
            href={release.infoUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={release.title}
            className={css(truncate, {
              fontWeight: "500",
              _hover: { color: "accent", textDecoration: "underline" },
            })}
          >
            {release.title}
          </a>
        ) : (
          <span
            title={release.title}
            className={css(truncate, { fontWeight: "500" })}
          >
            {release.title}
          </span>
        )}
        {release.rejections.length > 0 && (
          <span
            title={release.rejections.join("\n")}
            className={css(truncate, {
              mt: "3px",
              color: "warning",
              fontSize: "10px",
            })}
          >
            {release.rejections.join(" · ")}
          </span>
        )}
      </>
    ),
  },
  source: {
    cell: css({ whiteSpace: "nowrap" }),
    render: (release) => (
      <span className={sourceBadges[release.protocol] ?? sourceBadges.unknown}>
        {release.protocol}
      </span>
    ),
  },
  age: {
    cell: css(quiet),
    render: (release) => ageLabel(release),
  },
  indexer: {
    cell: css(quiet, { maxWidth: "160px" }),
    render: (release) => (
      <span title={release.indexer} className={css(truncate)}>
        {release.indexer}
      </span>
    ),
  },
  size: {
    numeric: true,
    cell: css(numeric),
    render: (release) => sizeLabel(release.size),
  },
  peers: {
    numeric: true,
    cell: css(numeric),
    render: (release) =>
      release.protocol === "torrent" ? (
        <span
          title={`${release.seeders ?? "Unknown"} seeders, ${release.leechers ?? "unknown"} leechers`}
          className={css({
            color: !release.seeders
              ? "negative"
              : release.seeders < 5
                ? "warning"
                : "positive",
          })}
        >
          {release.seeders ?? "?"} / {release.leechers ?? "?"}
        </span>
      ) : (
        <span className={css({ color: "faint" })}>—</span>
      ),
  },
  languages: {
    cell: css(quiet, { maxWidth: "140px" }),
    render: (release) => (
      <span title={release.languages.join(", ")} className={css(truncate)}>
        {release.languages.join(", ") || "—"}
      </span>
    ),
  },
  quality: {
    cell: css({ whiteSpace: "nowrap", color: "soft" }),
    render: (release) => release.quality || "Unknown",
  },
  score: {
    numeric: true,
    cell: css(numeric),
    render: (release) =>
      release.customFormatScore || release.customFormats.length ? (
        <span
          title={
            release.customFormats.length
              ? `Custom formats: ${release.customFormats.join(", ")}`
              : "No custom formats matched"
          }
          className={css({
            color:
              release.customFormatScore > 0
                ? "positive"
                : release.customFormatScore < 0
                  ? "negative"
                  : "muted",
          })}
        >
          {release.customFormatScore > 0 ? "+" : ""}
          {release.customFormatScore}
        </span>
      ) : (
        <span className={css({ color: "faint" })}>—</span>
      ),
  },
};

export function ReleaseTable({
  releases,
  columns,
  sort,
  onSort,
  grabbing,
  onGrab,
}: {
  releases: readonly Release[];
  /** Visible column keys, in order. */
  columns: string[];
  sort: ReleaseSort;
  onSort: (key: ReleaseSortKey) => void;
  grabbing: string | null;
  onGrab: (release: Release) => void;
}) {
  const labels = new Map(
    releaseColumns.map((column) => [column.key, column.label]),
  );
  return (
    <div className={css({ minWidth: 0, overflowX: "auto" })}>
      <table className={tableStyle}>
        <caption className={css({ srOnly: true })}>Releases</caption>
        <thead className={tableHeadStyle}>
          <tr>
            {columns.map((column) => {
              const key = column as ReleaseSortKey;
              const active = sort.key === key;
              const label = labels.get(column) ?? column;
              return (
                <th
                  key={column}
                  scope="col"
                  aria-sort={
                    active
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                  className={cx(
                    headCellStyle,
                    releaseCells[column].head,
                    releaseCells[column].numeric && css({ textAlign: "right" }),
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSort(key)}
                    aria-label={`Sort by ${label.toLowerCase()}`}
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
                      cursor: "pointer",
                      _hover: { color: "ink" },
                    })}
                  >
                    {label}
                    {active &&
                      (sort.direction === "asc" ? (
                        <ArrowUpIcon size={10} weight="bold" />
                      ) : (
                        <ArrowDownIcon size={10} weight="bold" />
                      ))}
                  </button>
                </th>
              );
            })}
            <th scope="col" className={headCellStyle}>
              <span className={css({ srOnly: true })}>Status</span>
            </th>
            <th scope="col" className={headCellStyle}>
              <span className={css({ srOnly: true })}>Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {releases.map((release) => (
            <tr
              key={`${release.indexerId}:${release.guid}`}
              aria-label={release.title}
            >
              {columns.map((column) => (
                <td
                  key={column}
                  className={cx(
                    cellStyle,
                    releaseCells[column].cell,
                    releaseCells[column].numeric && css({ textAlign: "right" }),
                  )}
                >
                  {releaseCells[column].render(release)}
                </td>
              ))}
              <td className={cellStyle}>
                {release.approved ? (
                  <CheckCircleIcon
                    size={15}
                    aria-label="Allowed by your quality rules"
                    className={css({ color: "positive", display: "block" })}
                  />
                ) : (
                  <WarningCircleIcon
                    size={15}
                    aria-label={`Rejected: ${release.rejections.join("; ")}`}
                    className={css({ color: "warning", display: "block" })}
                  />
                )}
              </td>
              <td className={cx(cellStyle, css({ textAlign: "right" }))}>
                <Button
                  size="sm"
                  disabled={grabbing !== null}
                  onClick={() => onGrab(release)}
                >
                  {grabbing === release.guid ? (
                    <Spinner size={13} />
                  ) : (
                    <ArrowDownIcon size={14} />
                  )}
                  Grab
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
