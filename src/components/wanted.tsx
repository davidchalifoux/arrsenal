"use client";

import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CheckSquareIcon,
  HandIcon,
  MagnifyingGlassIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import Link from "next/link";
import {
  type CSSProperties,
  Fragment,
  type ReactNode,
  useRef,
  useState,
} from "react";
import { api, mediaHref } from "@/lib/client";
import { useLibrary } from "@/lib/client-data";
import type { ColumnDefinition } from "@/lib/table-columns";
import type { ActionResponse, MediaItem, MediaTarget } from "@/lib/types";
import { useLibraryActions } from "./library-provider";
import { ReleaseSearch } from "./media-details";
import {
  Page,
  PageHeader,
  PageToolbar,
  pageFooterStyle,
  SegmentedTabs,
  ToolbarButton,
  ToolbarDivider,
} from "./page-header";
import {
  TableOptionsDialog,
  useTableColumns,
  visibleColumns,
} from "./table-options";
import { Button, Notice, panelStyle, Spinner } from "./ui";
import { useRangeSelection } from "./use-range-selection";

export type WantedRow = {
  key: string;
  media: MediaItem;
  target: MediaTarget;
  missing: string;
  missingCount: number;
};

/** Monitored targets that are released but have no file, one row each. */
export function wantedRows(items: readonly MediaItem[]): WantedRow[] {
  return items.flatMap((media) =>
    media.targets
      .filter(
        (target) =>
          target.monitored &&
          (target.status === "missing" || target.status === "partial"),
      )
      .map((target) => {
        const episodes =
          media.kind === "series" &&
          target.episodeCount !== undefined &&
          target.episodeFileCount !== undefined
            ? Math.max(0, target.episodeCount - target.episodeFileCount)
            : null;
        return {
          key: `${media.id}:${target.instanceId}`,
          media,
          target,
          missingCount: media.kind === "movie" ? 1 : (episodes ?? 1),
          missing:
            media.kind === "movie"
              ? "Movie file"
              : episodes
                ? `${episodes} ${episodes === 1 ? "episode" : "episodes"}`
                : "Episodes",
        };
      }),
  );
}

type Scope = "all" | "movies" | "shows";

/** Every Wanted column except the always-shown title, in default order. */
export const wantedColumns: ColumnDefinition[] = [
  { key: "title", label: "Title", locked: true },
  { key: "target", label: "Instance" },
  { key: "missing", label: "Missing" },
  { key: "profile", label: "Quality profile" },
  { key: "year", label: "Year" },
];

// Grid tracks for each column, between the checkbox and the actions.
const wantedTracks: Record<string, string> = {
  title: "minmax(0, 2.2fr)",
  target: "minmax(0, 1.1fr)",
  missing: "minmax(0, 1.4fr)",
  profile: "minmax(0, 1fr)",
  year: "72px",
};

const checkboxStyle = css({ width: "15px", height: "15px", m: 0 });
const rowActionRaw = css.raw({ width: "30px", height: "30px" });

export function Wanted() {
  const library = useLibrary();
  const tableColumns = useTableColumns("wanted", wantedColumns);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const columns = visibleColumns(wantedColumns, tableColumns);
  const columnLabels = new Map(
    wantedColumns.map((column) => [column.key, column.label]),
  );
  const template = [
    "20px",
    ...columns.map((column) => wantedTracks[column]),
    "72px",
  ].join(" ");
  const { notify, refresh } = useLibraryActions();
  const [scope, setScope] = useState<Scope>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [manual, setManual] = useState<WantedRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const all = wantedRows(library.data?.items ?? []);
  const rows = all.filter((row) =>
    scope === "movies"
      ? row.media.kind === "movie"
      : scope === "shows"
        ? row.media.kind === "series"
        : true,
  );
  const { selected, setSelected, checkboxProps } = useRangeSelection(
    rows.map((row) => row.key),
  );
  const selectedRows = rows.filter((row) => selected.has(row.key));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const movies = all.filter((row) => row.media.kind === "movie").length;
  const episodes = all
    .filter((row) => row.media.kind === "series")
    .reduce((total, row) => total + row.missingCount, 0);
  const titles = new Set(all.map((row) => row.media.id)).size;

  async function search(targets: WantedRow[], key: string) {
    if (lock.current || !targets.length) return;
    lock.current = true;
    setBusy(key);
    setError(null);
    const failures: string[] = [];
    for (const row of targets) {
      try {
        const result = await api<ActionResponse>("/api/search", {
          method: "POST",
          body: JSON.stringify({
            instanceId: row.target.instanceId,
            remoteId: row.target.remoteId,
            kind: row.media.kind,
          }),
        });
        if (!result.success) throw new Error(result.message);
      } catch (cause) {
        failures.push(
          `${row.media.title} (${row.target.instanceName}): ${cause instanceof Error ? cause.message : "Search failed."}`,
        );
      }
    }
    if (failures.length) setError(failures.join(" "));
    else {
      notify(
        targets.length === 1
          ? `Searching ${targets[0].target.instanceName} for ${targets[0].media.title}.`
          : `Searching for ${targets.length} missing items.`,
      );
      setSelected(new Set());
    }
    lock.current = false;
    setBusy(null);
  }

  return (
    <Page
      toolbar={
        <PageToolbar
          label="Wanted actions"
          actions={
            <ToolbarButton
              icon={SlidersHorizontalIcon}
              label="Options"
              aria-label="Table options"
              onClick={() => setOptionsOpen(true)}
            />
          }
        >
          <ToolbarButton
            icon={ArrowClockwiseIcon}
            label="Refresh"
            aria-label="Refresh wanted"
            disabled={library.isFetching}
            onClick={refresh}
          />
          <ToolbarButton
            icon={MagnifyingGlassIcon}
            label="Search all"
            aria-label={`Search all ${rows.length} missing`}
            disabled={!rows.length || busy !== null}
            onClick={() => void search(rows, "all")}
          />
          <ToolbarButton
            icon={CheckSquareIcon}
            label="Search selected"
            aria-label={`Search ${selectedRows.length} selected`}
            disabled={!selectedRows.length || busy !== null}
            onClick={() => void search(selectedRows, "selected")}
          />
          {selectedRows.length > 0 && (
            <>
              <ToolbarDivider />
              <span
                className={css({
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  height: "26px",
                  pl: "10px",
                  pr: "3px",
                  flexShrink: 0,
                  borderRadius: "999px",
                  bg: "color-mix(in srgb, var(--accent) 16%, transparent)",
                  fontSize: "12px",
                  fontWeight: "600",
                })}
              >
                {selectedRows.length} selected
                <button
                  type="button"
                  aria-label="Clear selection"
                  onClick={() => setSelected(new Set())}
                  className={css({
                    width: "20px",
                    height: "20px",
                    display: "grid",
                    placeItems: "center",
                    border: 0,
                    borderRadius: "999px",
                    bg: "transparent",
                    color: "soft",
                  })}
                >
                  <XIcon size={11} weight="bold" />
                </button>
              </span>
            </>
          )}
        </PageToolbar>
      }
      footer={
        <footer className={pageFooterStyle}>
          <span>
            {all.length} missing across {titles}{" "}
            {titles === 1 ? "title" : "titles"}
          </span>
          <span>
            {movies} {movies === 1 ? "movie" : "movies"}
          </span>
          <span>{episodes} episodes</span>
          <span className={css({ ml: "auto" })}>
            Unmonitored and downloading items are hidden
          </span>
        </footer>
      }
    >
      <PageHeader
        title="Wanted"
        actions={
          <span className={css({ fontSize: "12px", color: "subtle" })}>
            Monitored items with no file yet
          </span>
        }
      >
        <SegmentedTabs
          label="Filter wanted items"
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "Missing", count: all.length },
            { value: "movies", label: "Movies", count: movies },
            {
              value: "shows",
              label: "Shows",
              count: all.length - movies,
            },
          ]}
        />
      </PageHeader>
      {error && (
        <div className={css({ mb: "16px" })}>
          <Notice error>{error}</Notice>
        </div>
      )}
      {library.isPending ? (
        <output
          className={cx(
            panelStyle,
            css({
              display: "flex",
              gap: "10px",
              justifyContent: "center",
              p: "48px",
              color: "muted",
            }),
          )}
        >
          <Spinner /> Loading wanted items...
        </output>
      ) : rows.length === 0 ? (
        <div
          className={cx(
            panelStyle,
            css({ p: "40px 20px", textAlign: "center" }),
          )}
        >
          <CheckCircleIcon
            size={28}
            className={css({ mx: "auto", mb: "12px", color: "positive" })}
          />
          <h2 className={css({ fontSize: "16px", fontWeight: "600" })}>
            Nothing missing
          </h2>
          <p className={css({ mt: "6px", color: "muted", fontSize: "13px" })}>
            Every monitored target has its files.
          </p>
        </div>
      ) : (
        <div
          style={{ "--wanted-columns": template } as CSSProperties}
          className={css({
            border: "1px solid token(colors.line)",
            borderRadius: "12px",
            overflow: "hidden",
            bg: "surface",
          })}
        >
          <div
            className={css({
              display: { base: "none", md: "grid" },
              gridTemplateColumns: "var(--wanted-columns)",
              alignItems: "center",
              gap: "14px",
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
            <input
              type="checkbox"
              aria-label="Select all wanted items"
              checked={allSelected}
              onChange={() =>
                setSelected(
                  allSelected ? new Set() : new Set(rows.map((row) => row.key)),
                )
              }
              className={checkboxStyle}
            />
            {columns.map((column) => (
              <span key={column}>{columnLabels.get(column)}</span>
            ))}
            <span className={css({ textAlign: "right" })}>Actions</span>
          </div>
          <ul className={css({ listStyle: "none", m: 0, p: 0 })}>
            {rows.map((row) => {
              const cells: Record<string, ReactNode> = {
                title: (
                  <span className={css({ minWidth: 0 })}>
                    <Link
                      href={mediaHref(row.media)}
                      className={css({
                        display: "block",
                        fontWeight: "500",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        _hover: { color: "accent" },
                      })}
                    >
                      {row.media.title}
                    </Link>
                    <span
                      className={css({
                        display: { base: "block", md: "none" },
                        fontSize: "12px",
                        color: "subtle",
                      })}
                    >
                      {row.target.instanceName} · {row.missing}
                    </span>
                  </span>
                ),
                target: (
                  <span
                    className={css({
                      display: { base: "none", md: "block" },
                      color: "soft",
                    })}
                  >
                    {row.target.instanceName}
                  </span>
                ),
                missing: (
                  <span
                    className={css({
                      display: { base: "none", md: "flex" },
                      alignItems: "center",
                      gap: "8px",
                      fontFamily: "mono",
                      fontSize: "12px",
                    })}
                  >
                    <span
                      aria-hidden="true"
                      className={css({
                        width: "6px",
                        height: "6px",
                        borderRadius: "999px",
                        bg: "warning",
                        flexShrink: 0,
                      })}
                    />
                    {row.missing}
                  </span>
                ),
                profile: (
                  <span
                    className={css({
                      display: { base: "none", md: "block" },
                      color: "muted",
                    })}
                  >
                    {row.target.qualityProfile}
                  </span>
                ),
                year: (
                  <span
                    className={css({
                      display: { base: "none", md: "block" },
                      fontFamily: "mono",
                      fontSize: "12px",
                      color: "muted",
                    })}
                  >
                    {row.media.year || "TBA"}
                  </span>
                ),
              };
              return (
                <li
                  key={row.key}
                  aria-label={`${row.media.title} on ${row.target.instanceName}`}
                  className={css({
                    display: "grid",
                    gridTemplateColumns: {
                      base: "20px minmax(0, 1fr) auto",
                      md: "var(--wanted-columns)",
                    },
                    alignItems: "center",
                    gap: "8px 14px",
                    minHeight: "44px",
                    px: "16px",
                    py: { base: "8px", md: "4px" },
                    borderBottom: "1px solid token(colors.lineSoft)",
                    fontSize: "13px",
                    _last: { borderBottom: 0 },
                    _even: {
                      bg: "color-mix(in srgb, var(--raised) 55%, transparent)",
                    },
                  })}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.media.title} on ${row.target.instanceName}`}
                    {...checkboxProps(row.key)}
                    className={checkboxStyle}
                  />
                  {columns.map((column) => (
                    <Fragment key={column}>{cells[column]}</Fragment>
                  ))}
                  <span
                    className={css({
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: "2px",
                    })}
                  >
                    <Button
                      size="icon"
                      variant="ghost"
                      styles={rowActionRaw}
                      disabled={busy !== null}
                      title="Automatic search"
                      aria-label={`Search ${row.target.instanceName} for ${row.media.title}`}
                      onClick={() => void search([row], row.key)}
                    >
                      {busy === row.key ? (
                        <Spinner size={14} />
                      ) : (
                        <MagnifyingGlassIcon size={15} />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      styles={rowActionRaw}
                      title="Manual search"
                      aria-label={`Manual search ${row.target.instanceName} for ${row.media.title}`}
                      onClick={() => setManual(row)}
                    >
                      <HandIcon size={15} />
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <TableOptionsDialog
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
        control={tableColumns}
      />
      {manual && (
        <ReleaseSearch
          media={manual.media}
          target={manual.target}
          targets={[manual.target]}
          onClose={() => setManual(null)}
          onTarget={() => {}}
          notify={notify}
        />
      )}
    </Page>
  );
}
