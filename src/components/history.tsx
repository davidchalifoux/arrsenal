"use client";

import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  DownloadSimpleIcon,
  EyeSlashIcon,
  type Icon,
  PencilSimpleIcon,
  QuestionIcon,
  SlidersHorizontalIcon,
  TrashIcon,
  WarningCircleIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { type ReactNode, useId, useRef, useState } from "react";
import { api, mediaHref } from "@/lib/client";
import { fullDateTime, relativeTime } from "@/lib/relative-time";
import type { ColumnDefinition } from "@/lib/table-columns";
import { useTimezonePreference } from "@/lib/timezone-preference";
import type {
  ActionResponse,
  HistoryEvent,
  HistoryItem,
  HistoryResponse,
} from "@/lib/types";
import { ActivityFilters, matchesSearch } from "./activity-filters";
import { useLibraryActions } from "./library-provider";
import {
  Page,
  PageHeader,
  PageToolbar,
  SegmentedTabs,
  ToolbarButton,
} from "./page-header";
import {
  type TableColumnsControl,
  TableOptionsDialog,
  useTableColumns,
  visibleColumns,
} from "./table-options";
import {
  cellStyle,
  columnLg,
  columnMd,
  headCellStyle,
  tableHeadStyle,
  tableStyle,
} from "./table-styles";
import { Button, Modal, mutedStyle, Notice, panelStyle, Spinner } from "./ui";

const PAGE_SIZE = 100;

type EventFilter = "all" | "grabbed" | "imported" | "failed" | "deleted";

const eventBadgeRaw = css.raw({
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  fontWeight: "500",
});
const quietEvent = css(eventBadgeRaw, { color: "muted" });

const events: Record<
  HistoryEvent,
  { label: string; icon: Icon; className: string }
> = {
  grabbed: {
    label: "Grabbed",
    icon: DownloadSimpleIcon,
    className: css(eventBadgeRaw, { color: "info" }),
  },
  imported: {
    label: "Imported",
    icon: CheckCircleIcon,
    className: css(eventBadgeRaw, { color: "positive" }),
  },
  failed: {
    label: "Failed",
    icon: WarningCircleIcon,
    className: css(eventBadgeRaw, { color: "negative" }),
  },
  deleted: { label: "Deleted", icon: TrashIcon, className: quietEvent },
  renamed: { label: "Renamed", icon: PencilSimpleIcon, className: quietEvent },
  ignored: { label: "Ignored", icon: EyeSlashIcon, className: quietEvent },
  unknown: { label: "Other", icon: QuestionIcon, className: quietEvent },
};

function historyKey(item: HistoryItem) {
  return `${item.instanceId}:${item.id}`;
}

export function historyQueryKey(event: EventFilter, limit: number) {
  return ["history", event, limit] as const;
}

export function HistoryScreen() {
  const { notify } = useLibraryActions();
  const client = useQueryClient();
  const [event, setEvent] = useState<EventFilter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const tableColumns = useTableColumns("history", historyColumns);
  const history = useQuery({
    queryKey: historyQueryKey(event, limit),
    queryFn: ({ signal }) =>
      api<HistoryResponse>(
        `/api/history?${new URLSearchParams({
          limit: String(limit),
          ...(event === "all" ? {} : { event }),
        })}`,
        { signal },
      ),
    // Keep rows on screen while a filter change or "Load more" fetches.
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    retry: false,
  });
  return (
    <HistoryView
      data={history.data}
      loading={history.isFetching}
      error={history.isError ? history.error.message : undefined}
      event={event}
      onEvent={(next) => {
        setEvent(next);
        setLimit(PAGE_SIZE);
      }}
      onLoadMore={() => setLimit((current) => current + PAGE_SIZE)}
      onRefresh={() => void history.refetch()}
      onChanged={() => void client.invalidateQueries({ queryKey: ["history"] })}
      notify={notify}
      tableColumns={tableColumns}
    />
  );
}

export function HistoryView({
  data,
  loading,
  error,
  event,
  onEvent,
  onLoadMore,
  onRefresh,
  onChanged,
  notify,
  tableColumns,
}: {
  data?: HistoryResponse;
  loading: boolean;
  error?: string;
  event: EventFilter;
  onEvent: (event: EventFilter) => void;
  onLoadMore: () => void;
  onRefresh: () => void;
  onChanged: () => void;
  notify: (message: string, error?: boolean) => void;
  /** Saved column choices; the defaults are used without them. */
  tableColumns?: TableColumnsControl;
}) {
  const id = useId();
  const [optionsOpen, setOptionsOpen] = useState(false);
  const columns = visibleColumns(historyColumns, tableColumns);
  const labels = new Map(
    historyColumns.map((column) => [column.key, column.label]),
  );
  const { timeZone } = useTimezonePreference();
  const [query, setQuery] = useState("");
  const [instance, setInstance] = useState("all");
  const [failing, setFailing] = useState<HistoryItem | null>(null);
  const [failError, setFailError] = useState("");
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
          item.episode,
          item.sourceTitle,
          item.quality,
          item.instanceName,
          item.detail,
          events[item.event].label,
        ],
        query,
      ),
  );
  const filteredOut = query.trim() !== "" || instance !== "all";

  async function markFailed() {
    if (!failing || lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailError("");
    try {
      const result = await api<ActionResponse>("/api/history", {
        method: "POST",
        body: JSON.stringify({
          instanceId: failing.instanceId,
          id: failing.id,
        }),
      });
      if (!result.success) throw new Error(result.message);
      notify(result.message);
      setFailing(null);
      onChanged();
    } catch (cause) {
      setFailError(
        cause instanceof Error ? cause.message : "Unable to mark as failed.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Page
      className={css({ minWidth: 0 })}
      aria-labelledby={`${id}-heading`}
      toolbar={
        <PageToolbar
          label="History actions"
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
            disabled={loading}
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
        </PageToolbar>
      }
    >
      <PageHeader
        id={`${id}-heading`}
        title="History"
        actions={
          <ActivityFilters
            query={query}
            onQuery={setQuery}
            placeholder="Search history"
            instances={instances}
            instance={instance}
            onInstance={setInstance}
          />
        }
      >
        <SegmentedTabs
          label="Filter history by event"
          value={event}
          onChange={onEvent}
          options={[
            { value: "all", label: "All" },
            { value: "grabbed", label: "Grabbed" },
            { value: "imported", label: "Imported" },
            { value: "failed", label: "Failed" },
            { value: "deleted", label: "Deleted" },
          ]}
        />
      </PageHeader>

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
            {data && " Showing the last loaded history."}
          </Notice>
        )}
        {errors.map((entry) => (
          <Notice error key={entry.instanceId}>
            <div className={css({ minWidth: 0, overflowWrap: "anywhere" })}>
              <strong className={css({ fontWeight: "550" })}>
                {entry.instanceName} is unavailable.
              </strong>{" "}
              {entry.message} Its history is missing below.
            </div>
          </Notice>
        ))}
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
                <Spinner /> Loading history...
              </>
            ) : (
              "History is unavailable. Refresh to try again."
            )}
          </output>
        ) : filtered.length === 0 ? (
          <div
            className={cx(
              panelStyle,
              css({ p: "36px 20px", textAlign: "center" }),
            )}
          >
            <ClockCounterClockwiseIcon
              size={27}
              className={css({ mx: "auto", color: "subtle", mb: "12px" })}
            />
            <h2 className={css({ fontSize: "16px", fontWeight: "550" })}>
              {filteredOut && items.length
                ? "No matching history"
                : errors.length && !items.length
                  ? "No history could be loaded"
                  : "No history yet"}
            </h2>
            <p
              className={cx(
                mutedStyle,
                css({ mt: "7px", maxWidth: "420px", mx: "auto" }),
              )}
            >
              {filteredOut && items.length
                ? "Try a different search or instance."
                : event === "all"
                  ? "Grabs, imports, and failures will appear here."
                  : "No events of this kind yet."}
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
              <caption className={css({ srOnly: true })}>History</caption>
              <thead className={tableHeadStyle}>
                <tr>
                  {columns.map((key) => (
                    <th
                      key={key}
                      scope="col"
                      className={cx(
                        headCellStyle,
                        historyCells[key].hide,
                        historyCells[key].head,
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
                {filtered.map((item) => (
                  <HistoryRow
                    key={historyKey(item)}
                    item={item}
                    columns={columns}
                    timeZone={timeZone}
                    onMarkFailed={() => {
                      setFailError("");
                      setFailing(item);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data?.hasMore && (
          <div
            className={css({
              display: "flex",
              justifyContent: "center",
              mt: "16px",
            })}
          >
            <Button size="sm" disabled={loading} onClick={onLoadMore}>
              {loading && <Spinner size={13} />}
              Load older events
            </Button>
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
        open={failing !== null}
        onOpenChange={(open) => {
          if (!open && !lock.current) setFailing(null);
        }}
        title="Mark as failed?"
        description={
          failing
            ? `${failing.instanceName} blocklists this release so it isn't grabbed again, and may search for a replacement.`
            : undefined
        }
      >
        <div className={css({ display: "grid", gap: "16px", minWidth: 0 })}>
          <p
            className={css({
              fontSize: "12px",
              color: "muted",
              overflowWrap: "anywhere",
            })}
          >
            {failing?.sourceTitle}
          </p>
          {failError && <Notice error>{failError}</Notice>}
          <div
            className={css({
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
            })}
          >
            <Button disabled={busy} onClick={() => setFailing(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => void markFailed()}
            >
              {busy ? <Spinner size={15} /> : <XCircleIcon size={15} />}
              Mark as failed
            </Button>
          </div>
        </div>
      </Modal>
    </Page>
  );
}

/** Every History column except the always-shown title, in default order. */
export const historyColumns: ColumnDefinition[] = [
  { key: "title", label: "Title", locked: true },
  { key: "event", label: "Event" },
  { key: "quality", label: "Quality" },
  { key: "date", label: "Date" },
  { key: "instance", label: "Instance" },
  { key: "details", label: "Details" },
];

const truncate = css.raw({
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

type HistoryCell = {
  /** Responsive hiding, shared by the header and the cells. */
  hide?: string;
  head?: string;
  cell?: string;
  render: (item: HistoryItem, timeZone: string | null) => ReactNode;
};

const historyCells: Record<string, HistoryCell> = {
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
          {item.episode && (
            <span className={css({ color: "muted", fontWeight: "normal" })}>
              {" · "}
              {item.episode}
            </span>
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
  event: {
    cell: css({ whiteSpace: "nowrap" }),
    render: (item) => {
      const event = events[item.event];
      const EventIcon = event.icon;
      return (
        <span className={event.className}>
          <EventIcon size={14} weight="bold" aria-hidden="true" />
          {event.label}
        </span>
      );
    },
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
  details: {
    hide: columnLg,
    cell: css({ maxWidth: "320px", color: "muted" }),
    render: (item) =>
      item.detail ? (
        <span title={item.detail} className={css(truncate)}>
          {item.detail}
        </span>
      ) : (
        "—"
      ),
  },
};

function HistoryRow({
  item,
  columns,
  timeZone,
  onMarkFailed,
}: {
  item: HistoryItem;
  columns: string[];
  timeZone: string | null;
  onMarkFailed: () => void;
}) {
  return (
    <tr
      aria-label={`${item.mediaTitle} ${events[item.event].label.toLowerCase()}`}
    >
      {columns.map((key) => (
        <td
          key={key}
          className={cx(
            cellStyle,
            historyCells[key].hide,
            historyCells[key].cell,
          )}
        >
          {historyCells[key].render(item, timeZone)}
        </td>
      ))}
      <td className={`${cellStyle} ${css({ textAlign: "right" })}`}>
        {item.event === "grabbed" && (
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Mark ${item.mediaTitle} as failed`}
            title="Mark as failed"
            onClick={onMarkFailed}
            styles={css.raw({ width: "28px", height: "28px" })}
          >
            <XCircleIcon size={15} />
          </Button>
        )}
      </td>
    </tr>
  );
}
