"use client";

import {
  ArrowClockwiseIcon,
  ProhibitIcon,
  SlidersHorizontalIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { type ReactNode, useId, useRef, useState } from "react";
import { api, mediaHref } from "@/lib/client";
import { fullDateTime, relativeTime } from "@/lib/relative-time";
import type { ColumnDefinition } from "@/lib/table-columns";
import { useTimezonePreference } from "@/lib/timezone-preference";
import type {
  ActionResponse,
  BlocklistItem,
  BlocklistResponse,
} from "@/lib/types";
import { ActivityFilters, matchesSearch } from "./activity-filters";
import { useLibraryActions } from "./library-provider";
import {
  Page,
  PageHeader,
  PageToolbar,
  ToolbarButton,
  ToolbarDivider,
} from "./page-header";
import {
  type TableColumnsControl,
  TableOptionsDialog,
  useTableColumns,
  visibleColumns,
} from "./table-options";
import {
  cellStyle,
  checkboxStyle,
  columnLg,
  columnMd,
  headCellStyle,
  tableHeadStyle,
  tableStyle,
} from "./table-styles";
import { Button, Modal, mutedStyle, Notice, panelStyle, Spinner } from "./ui";
import { useRangeSelection } from "./use-range-selection";

export const blocklistQueryKey = ["blocklist"] as const;

function blocklistKey(item: BlocklistItem) {
  return `${item.instanceId}:${item.id}`;
}

const protocolLabels: Record<BlocklistItem["protocol"], string> = {
  torrent: "Torrent",
  usenet: "Usenet",
  unknown: "Unknown",
};

/** Every Blocklist column except the always-shown title, in default order. */
export const blocklistColumns: ColumnDefinition[] = [
  { key: "title", label: "Title", locked: true },
  { key: "quality", label: "Quality" },
  { key: "date", label: "Date" },
  { key: "instance", label: "Instance" },
  { key: "indexer", label: "Indexer" },
  { key: "reason", label: "Reason" },
];

const truncate = css.raw({
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

type BlocklistCell = {
  /** Responsive hiding, shared by the header and the cells. */
  hide?: string;
  head?: string;
  cell?: string;
  render: (item: BlocklistItem, timeZone: string | null) => ReactNode;
};

const blocklistCells: Record<string, BlocklistCell> = {
  title: {
    head: css({ width: "100%" }),
    cell: css({ maxWidth: 0 }),
    render: (item) => (
      <>
        <span className={css(truncate, { fontWeight: "550" })}>
          {item.mediaId ? (
            <Link
              href={mediaHref({
                id: item.mediaId,
                kind: item.kind,
                title: item.mediaTitle,
              })}
              className={css({ _hover: { color: "accent" } })}
            >
              {item.mediaTitle}
            </Link>
          ) : (
            item.mediaTitle
          )}
        </span>
        <span
          title={item.sourceTitle}
          className={css(truncate, {
            mt: "2px",
            color: "subtle",
            fontSize: "11px",
          })}
        >
          {item.sourceTitle}
        </span>
      </>
    ),
  },
  quality: {
    hide: columnMd,
    cell: css({ whiteSpace: "nowrap", color: "soft" }),
    render: (item) => item.quality || "Unknown",
  },
  date: {
    cell: css({ whiteSpace: "nowrap" }),
    render: (item, timeZone) => (
      <time
        dateTime={item.date}
        title={fullDateTime(item.date, timeZone)}
        className={css({ color: "soft" })}
      >
        {relativeTime(item.date)}
      </time>
    ),
  },
  instance: {
    hide: columnLg,
    cell: css({ whiteSpace: "nowrap", color: "muted" }),
    render: (item) => item.instanceName,
  },
  indexer: {
    hide: columnLg,
    cell: css({ whiteSpace: "nowrap", color: "muted" }),
    // Without an indexer, the protocol stands in.
    render: (item) => item.indexer ?? protocolLabels[item.protocol],
  },
  reason: {
    hide: columnLg,
    cell: css({ maxWidth: "280px", color: "muted" }),
    render: (item) =>
      item.message ? (
        <span title={item.message} className={css(truncate)}>
          {item.message}
        </span>
      ) : (
        "—"
      ),
  },
};

export function BlocklistScreen() {
  const { notify } = useLibraryActions();
  const client = useQueryClient();
  const tableColumns = useTableColumns("blocklist", blocklistColumns);
  const blocklist = useQuery({
    queryKey: blocklistQueryKey,
    queryFn: ({ signal }) =>
      api<BlocklistResponse>("/api/blocklist", { signal }),
    retry: false,
  });
  return (
    <BlocklistView
      data={blocklist.data}
      loading={blocklist.isFetching}
      error={blocklist.isError ? blocklist.error.message : undefined}
      onRefresh={() => void blocklist.refetch()}
      onChanged={() =>
        void client.invalidateQueries({ queryKey: blocklistQueryKey })
      }
      notify={notify}
      tableColumns={tableColumns}
    />
  );
}

export function BlocklistView({
  data,
  loading,
  error,
  onRefresh,
  onChanged,
  notify,
  tableColumns,
}: {
  data?: BlocklistResponse;
  loading: boolean;
  error?: string;
  onRefresh: () => void;
  onChanged: () => void;
  notify: (message: string, error?: boolean) => void;
  /** Saved column choices; the defaults are used without them. */
  tableColumns?: TableColumnsControl;
}) {
  const id = useId();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const columns = visibleColumns(blocklistColumns, tableColumns);
  const labels = new Map(
    blocklistColumns.map((column) => [column.key, column.label]),
  );
  const { timeZone } = useTimezonePreference();
  const [query, setQuery] = useState("");
  const [instance, setInstance] = useState("all");
  const [removing, setRemoving] = useState<BlocklistItem[] | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const items = data?.items ?? [];
  const errors = data?.errors ?? [];
  const instances = new Map<string, string>();
  for (const item of items) instances.set(item.instanceId, item.instanceName);
  for (const entry of errors)
    instances.set(entry.instanceId, entry.instanceName);
  const filtered = items.filter(
    (item) =>
      (instance === "all" || item.instanceId === instance) &&
      matchesSearch(
        [
          item.mediaTitle,
          item.sourceTitle,
          item.quality,
          item.instanceName,
          item.indexer,
          item.message,
        ],
        query,
      ),
  );
  const filteredOut = query.trim() !== "" || instance !== "all";
  const { selected, setSelected, checkboxProps } = useRangeSelection(
    filtered.map(blocklistKey),
  );
  // Selection only counts rows that are still visible.
  const selectedItems = filtered.filter((item) =>
    selected.has(blocklistKey(item)),
  );
  const allSelected =
    filtered.length > 0 && selectedItems.length === filtered.length;

  async function remove() {
    if (!removing?.length || lock.current) return;
    lock.current = true;
    setBusy(true);
    setRemoveError("");
    try {
      const result = await api<ActionResponse>("/api/blocklist", {
        method: "DELETE",
        body: JSON.stringify({
          items: removing.map((item) => ({
            instanceId: item.instanceId,
            id: item.id,
          })),
        }),
      });
      if (!result.success) throw new Error(result.message);
      notify(result.message);
      setRemoving(null);
      setSelected(new Set());
      onChanged();
    } catch (cause) {
      setRemoveError(
        cause instanceof Error ? cause.message : "Unable to remove entries.",
      );
      // A partial removal still changed the blocklist.
      onChanged();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function openRemove(next: BlocklistItem[]) {
    setRemoveError("");
    setRemoving(next);
  }

  return (
    <Page
      className={css({ minWidth: 0 })}
      aria-labelledby={`${id}-heading`}
      toolbar={
        <PageToolbar
          label="Blocklist actions"
          actions={
            tableColumns && (
              <ToolbarButton
                icon={SlidersHorizontalIcon}
                label="Options"
                aria-label="Table options"
                onClick={() => setOptionsOpen(true)}
              />
            )
          }
        >
          <ToolbarButton
            icon={ArrowClockwiseIcon}
            label={loading ? "Refreshing..." : "Refresh"}
            disabled={loading || busy}
            onClick={onRefresh}
            iconClassName={
              loading
                ? css({
                    animation: "spin 1s linear infinite",
                    _motionReduce: { animation: "none" },
                  })
                : undefined
            }
          />
          {selectedItems.length > 0 && (
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
                  mr: "4px",
                  flexShrink: 0,
                  borderRadius: "999px",
                  bg: "color-mix(in srgb, var(--accent) 16%, transparent)",
                  fontSize: "12px",
                  fontWeight: "600",
                })}
              >
                {selectedItems.length} selected
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
                    _hover: { color: "ink" },
                  })}
                >
                  <XIcon size={11} weight="bold" />
                </button>
              </span>
              <ToolbarButton
                icon={TrashIcon}
                label="Remove"
                aria-label={`Remove ${selectedItems.length} selected`}
                danger
                disabled={busy || loading}
                onClick={() => openRemove(selectedItems)}
              />
            </>
          )}
        </PageToolbar>
      }
    >
      <PageHeader
        id={`${id}-heading`}
        title="Blocklist"
        actions={
          <ActivityFilters
            query={query}
            onQuery={setQuery}
            placeholder="Search blocklist"
            instances={instances}
            instance={instance}
            onInstance={setInstance}
          />
        }
      />

      <div
        className={css({
          display: "grid",
          gap: "12px",
          mb: "20px",
          _empty: { display: "none" },
        })}
      >
        {error && (
          <Notice error>
            {error}
            {data && " Showing the last loaded blocklist."}
          </Notice>
        )}
        {errors.map((entry) => (
          <Notice error key={entry.instanceId}>
            <div className={css({ minWidth: 0, overflowWrap: "anywhere" })}>
              <strong className={css({ fontWeight: "550" })}>
                {entry.instanceName} is unavailable.
              </strong>{" "}
              {entry.message} Its blocklist is missing below.
            </div>
          </Notice>
        ))}
        {data?.truncated && (
          <Notice>
            Showing the newest 1,000 entries per instance. Older entries are
            still blocklisted.
          </Notice>
        )}
      </div>

      <div aria-busy={loading} className={css({ minWidth: 0 })}>
        {!data ? (
          <output
            className={cx(
              panelStyle,
              css({
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                p: "48px 20px",
                color: "muted",
                fontSize: "13px",
              }),
            )}
          >
            {loading ? (
              <>
                <Spinner /> Loading blocklist...
              </>
            ) : (
              "The blocklist is unavailable. Refresh to try again."
            )}
          </output>
        ) : filtered.length === 0 ? (
          <div
            className={cx(
              panelStyle,
              css({ p: "36px 20px", textAlign: "center" }),
            )}
          >
            <ProhibitIcon
              size={27}
              className={css({ mx: "auto", color: "subtle", mb: "12px" })}
            />
            <h2 className={css({ fontSize: "16px", fontWeight: "550" })}>
              {filteredOut && items.length
                ? "No matching entries"
                : errors.length && !items.length
                  ? "No blocklist could be loaded"
                  : "The blocklist is empty"}
            </h2>
            <p
              className={cx(
                mutedStyle,
                css({ mt: "7px", maxWidth: "420px", mx: "auto" }),
              )}
            >
              {filteredOut && items.length
                ? "Try a different search or instance."
                : "Releases that fail or are removed with blocklisting appear here, so they aren't grabbed again."}
            </p>
            {filteredOut && (
              <Button
                size="sm"
                className={css({ mt: "16px" })}
                onClick={() => {
                  setQuery("");
                  setInstance("all");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div
            className={cx(panelStyle, css({ minWidth: 0, overflowX: "auto" }))}
          >
            <table className={tableStyle}>
              <caption className={css({ srOnly: true })}>Blocklist</caption>
              <thead className={tableHeadStyle}>
                <tr>
                  <th
                    scope="col"
                    className={`${headCellStyle} ${css({ width: "36px", pr: 0 })}`}
                  >
                    <input
                      type="checkbox"
                      aria-label="Select all entries"
                      checked={allSelected}
                      ref={(input) => {
                        if (input)
                          input.indeterminate =
                            selectedItems.length > 0 && !allSelected;
                      }}
                      onChange={() =>
                        setSelected(
                          allSelected
                            ? new Set()
                            : new Set(filtered.map(blocklistKey)),
                        )
                      }
                      className={checkboxStyle}
                    />
                  </th>
                  {columns.map((key) => (
                    <th
                      key={key}
                      scope="col"
                      className={cx(
                        headCellStyle,
                        blocklistCells[key].hide,
                        blocklistCells[key].head,
                      )}
                    >
                      {labels.get(key)}
                    </th>
                  ))}
                  <th scope="col" className={headCellStyle}>
                    <span className={css({ srOnly: true })}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const key = blocklistKey(item);
                  const isSelected = selected.has(key);
                  return (
                    <tr
                      key={key}
                      aria-label={`${item.mediaTitle} blocklist entry`}
                      aria-selected={isSelected}
                      className={css({
                        "&[aria-selected=true] > td": {
                          bg: "color-mix(in srgb, var(--accent) 8%, transparent)",
                        },
                      })}
                    >
                      <td className={`${cellStyle} ${css({ pr: 0 })}`}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.mediaTitle}`}
                          {...checkboxProps(key)}
                          className={checkboxStyle}
                        />
                      </td>
                      {columns.map((key) => (
                        <td
                          key={key}
                          className={cx(
                            cellStyle,
                            blocklistCells[key].hide,
                            blocklistCells[key].cell,
                          )}
                        >
                          {blocklistCells[key].render(item, timeZone)}
                        </td>
                      ))}
                      <td
                        className={`${cellStyle} ${css({ textAlign: "right" })}`}
                      >
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove ${item.mediaTitle} from blocklist`}
                          title="Remove from blocklist"
                          disabled={busy}
                          onClick={() => openRemove([item])}
                          styles={css.raw({ width: "28px", height: "28px" })}
                        >
                          <TrashIcon size={15} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {tableColumns && (
        <TableOptionsDialog
          open={optionsOpen}
          onOpenChange={setOptionsOpen}
          control={tableColumns}
        />
      )}
      <Modal
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !lock.current) setRemoving(null);
        }}
        title={
          removing && removing.length > 1
            ? `Remove ${removing.length} entries?`
            : "Remove from blocklist?"
        }
        description="Sonarr and Radarr may grab these releases again the next time they search."
      >
        <div className={css({ display: "grid", gap: "16px", minWidth: 0 })}>
          <ul
            className={css({
              maxHeight: "220px",
              overflowY: "auto",
              display: "grid",
              gap: "6px",
            })}
          >
            {removing?.map((item) => (
              <li
                key={blocklistKey(item)}
                className={css({
                  fontSize: "12px",
                  color: "muted",
                  overflowWrap: "anywhere",
                })}
              >
                <strong className={css({ color: "ink", fontWeight: "550" })}>
                  {item.mediaTitle}
                </strong>{" "}
                · {item.sourceTitle}
              </li>
            ))}
          </ul>
          {removeError && <Notice error>{removeError}</Notice>}
          <div
            className={css({
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
            })}
          >
            <Button disabled={busy} onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy ? <Spinner size={15} /> : <TrashIcon size={15} />}
              Remove
            </Button>
          </div>
        </div>
      </Modal>
    </Page>
  );
}
