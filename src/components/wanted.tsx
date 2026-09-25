"use client";

import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  CheckSquareIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import Link from "next/link";
import { useRef, useState } from "react";
import { api, mediaHref } from "@/lib/client";
import { useLibrary } from "@/lib/client-data";
import type { ActionResponse, MediaItem, MediaTarget } from "@/lib/types";
import { useLibraryActions } from "./library-provider";
import {
  Page,
  PageHeader,
  PageToolbar,
  pageFooterStyle,
  SegmentedTabs,
  ToolbarButton,
  ToolbarDivider,
} from "./page-header";
import { Button, Notice, panelStyle, Spinner } from "./ui";

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

type Scope = "all" | "movies" | "episodes";

const columns =
  "20px minmax(0, 2.2fr) minmax(0, 1.1fr) minmax(0, 1.4fr) minmax(0, 1fr) 72px 96px";

const checkboxStyle = css({ width: "15px", height: "15px", m: 0 });

export function Wanted() {
  const library = useLibrary();
  const { notify, refresh } = useLibraryActions();
  const [scope, setScope] = useState<Scope>("all");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const all = wantedRows(library.data?.items ?? []);
  const rows = all.filter((row) =>
    scope === "movies"
      ? row.media.kind === "movie"
      : scope === "episodes"
        ? row.media.kind === "series"
        : true,
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

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  }

  return (
    <Page
      toolbar={
        <PageToolbar label="Wanted actions">
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
          <span>{movies} movies</span>
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
              value: "episodes",
              label: "Episodes",
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
              gridTemplateColumns: columns,
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
            <span>Title</span>
            <span>Target</span>
            <span>Missing</span>
            <span>Profile</span>
            <span>Year</span>
            <span className={css({ textAlign: "right" })}>Actions</span>
          </div>
          <ul className={css({ listStyle: "none", m: 0, p: 0 })}>
            {rows.map((row) => (
              <li
                key={row.key}
                aria-label={`${row.media.title} on ${row.target.instanceName}`}
                className={css({
                  display: "grid",
                  gridTemplateColumns: {
                    base: "20px minmax(0, 1fr) auto",
                    md: columns,
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
                  checked={selected.has(row.key)}
                  onChange={() => toggle(row.key)}
                  className={checkboxStyle}
                />
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
                <span
                  className={css({
                    display: { base: "none", md: "block" },
                    color: "soft",
                  })}
                >
                  {row.target.instanceName}
                </span>
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
                <span
                  className={css({
                    display: { base: "none", md: "block" },
                    color: "muted",
                  })}
                >
                  {row.target.qualityProfile}
                </span>
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
                <span
                  className={css({
                    display: "flex",
                    justifyContent: "flex-end",
                  })}
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    aria-label={`Search ${row.target.instanceName} for ${row.media.title}`}
                    onClick={() => void search([row], row.key)}
                  >
                    {busy === row.key ? (
                      <Spinner size={14} />
                    ) : (
                      <MagnifyingGlassIcon size={14} />
                    )}
                    Search
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Page>
  );
}
