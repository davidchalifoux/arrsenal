"use client";

import {
  ArrowClockwiseIcon,
  ArrowDownIcon,
  CheckCircleIcon,
  PlayIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import { Fragment, useId, useRef, useState } from "react";
import { api, sizeLabel } from "@/lib/client";
import type { ActionResponse, QueueItem, QueueResponse } from "@/lib/types";
import {
  Button,
  CheckField,
  Modal,
  mutedStyle,
  Notice,
  panelStyle,
  SelectField,
  Spinner,
} from "./ui";

function queueKey(item: QueueItem) {
  return `${item.instanceId}:${item.id}`;
}

function hasWarning(item: QueueItem) {
  return (
    item.warnings.length > 0 ||
    ["warning", "failed", "error", "downloadclientunavailable"].includes(
      item.status.toLowerCase(),
    )
  );
}

// Instances format remaining time as d.hh:mm:ss or hh:mm:ss.
function timeLeftSeconds(timeleft?: string) {
  const match = /^(?:(\d+)\.)?(\d{1,2}):(\d{1,2}):(\d{1,2})$/.exec(
    timeleft?.trim() ?? "",
  );
  if (!match) return undefined;
  return (
    Number(match[1] ?? 0) * 86_400 +
    Number(match[2]) * 3_600 +
    Number(match[3]) * 60 +
    Number(match[4])
  );
}

function queueProgress(item: QueueItem) {
  const size = Number.isFinite(item.size) ? item.size : 0;
  const left = Number.isFinite(item.sizeleft) ? item.sizeleft : 0;
  return size > 0 ? 100 - (left / size) * 100 : 0;
}

// Mirrors Sonarr's queue order: soonest remaining time first (missing ETA
// last), then the most complete download first.
function compareQueueItems(a: QueueItem, b: QueueItem) {
  const left = timeLeftSeconds(a.timeleft);
  const right = timeLeftSeconds(b.timeleft);
  if (left === undefined && right !== undefined) return 1;
  if (left !== undefined && right === undefined) return -1;
  if (left !== undefined && right !== undefined && left !== right)
    return left - right;
  return queueProgress(b) - queueProgress(a);
}

const statusLabels: Record<string, string> = {
  downloading: "Downloading",
  queued: "Queued",
  paused: "Paused",
  delay: "Pending release",
  downloadclientunavailable: "Client unavailable",
  completed: "Download complete",
  warning: "Needs attention",
  failed: "Failed",
  error: "Error",
  unknown: "Status unknown",
};

const headCellStyle = css({
  px: "10px",
  py: "7px",
  textAlign: "left",
  fontWeight: "500",
  whiteSpace: "nowrap",
});
const cellStyle = css({
  px: "10px",
  py: "7px",
  textAlign: "left",
  verticalAlign: "middle",
  borderTop: "1px solid token(colors.line)",
});
const columnSm = css({ display: { base: "none", sm: "table-cell" } });
const columnMd = css({ display: { base: "none", md: "table-cell" } });
const columnLg = css({ display: { base: "none", lg: "table-cell" } });

export function DownloadQueue({
  data,
  loading,
  onRefresh,
  notify,
}: {
  data: QueueResponse | undefined;
  loading: boolean;
  onRefresh: () => void;
  notify: (message: string, error?: boolean) => void;
}) {
  const id = useId();
  const [instanceFilter, setInstanceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [removing, setRemoving] = useState<QueueItem | null>(null);
  const [removeFromClient, setRemoveFromClient] = useState(true);
  const [blocklist, setBlocklist] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [busy, setBusy] = useState<{
    key: string;
    action: "remove" | "retry";
  } | null>(null);
  const actionLock = useRef(false);

  const errors = data?.errors ?? [];
  const items = data?.items ?? [];
  const instances = new Map([
    ...errors.map((error) => [error.instanceId, error.instanceName] as const),
    ...(data?.items ?? []).map(
      (item) => [item.instanceId, item.instanceName] as const,
    ),
  ]);
  const selectedInstance = instances.has(instanceFilter)
    ? instanceFilter
    : "all";
  const filteredItems = items.filter(
    (item) =>
      (selectedInstance === "all" || item.instanceId === selectedInstance) &&
      (statusFilter === "all" ||
        (statusFilter === "downloading" &&
          item.status.toLowerCase() === "downloading") ||
        (statusFilter === "warning" && hasWarning(item))),
  );
  const orderedItems = [...filteredItems].sort(compareQueueItems);
  const activeCount = items.filter(
    (item) => item.status.toLowerCase() === "downloading",
  ).length;
  const remainingSize = items.reduce(
    (total, item) =>
      total + (Number.isFinite(item.sizeleft) ? Math.max(0, item.sizeleft) : 0),
    0,
  );
  const selectedUnavailable = errors.some(
    (error) => error.instanceId === selectedInstance,
  );

  async function mutate(item: QueueItem, action: "remove" | "retry") {
    if (actionLock.current || loading) return;
    if (!data || !items.some((entry) => queueKey(entry) === queueKey(item))) {
      setActionError(
        "The queue has changed. Close this dialog and refresh before trying again.",
      );
      return;
    }
    setActionError(undefined);
    actionLock.current = true;
    setBusy({ key: queueKey(item), action });
    try {
      const result = await api<ActionResponse>("/api/queue", {
        method: action === "remove" ? "DELETE" : "POST",
        body: JSON.stringify({
          instanceId: item.instanceId,
          id: item.id,
          ...(action === "remove" ? { removeFromClient, blocklist } : {}),
        }),
      });
      if (!result.success) {
        const details = result.errors
          ?.map((error) => `${error.instanceName}: ${error.message}`)
          .join(" ");
        throw new Error(
          [result.message, details].filter(Boolean).join(" ") ||
            "The queue action was not accepted.",
        );
      }
      if (action === "remove") setRemoving(null);
      notify(
        result.message ||
          (action === "remove"
            ? "Queue removal accepted."
            : "Queue action accepted. Refresh to check its progress."),
      );
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "The queue action failed. Refresh before retrying.";
      setActionError(message);
      notify(message, true);
    } finally {
      actionLock.current = false;
      setBusy(null);
    }
  }

  return (
    <section className={css({ minWidth: 0 })} aria-labelledby={`${id}-heading`}>
      <h1 id={`${id}-heading`} className={css({ srOnly: true })}>
        Downloads
      </h1>

      <div
        className={css({
          display: "grid",
          gap: "12px",
          mb: "20px",
          _empty: { display: "none" },
        })}
      >
        {errors.map((error) => (
          <Notice error key={error.instanceId}>
            <div className={css({ minWidth: 0, overflowWrap: "anywhere" })}>
              <strong className={css({ fontWeight: "550" })}>
                {error.instanceName} is unavailable.
              </strong>{" "}
              {error.message} Its downloads may be missing from this queue and
              the totals below.
            </div>
          </Notice>
        ))}
        {!data && !loading && (
          <Notice error>
            The download queue is unavailable. Refresh to try again.
          </Notice>
        )}
        {actionError && !removing && (
          <Notice error>
            <span className={css({ minWidth: 0, overflowWrap: "anywhere" })}>
              {actionError}
            </span>
          </Notice>
        )}
      </div>

      <div
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          mb: "20px",
          minHeight: "36px",
        })}
      >
        <dl
          className={css({
            display: "flex",
            flexWrap: "wrap",
            columnGap: "24px",
            rowGap: "8px",
            fontSize: "12px",
          })}
        >
          {[
            {
              label: "Active downloads",
              value: data ? String(activeCount) : "--",
            },
            {
              label: "Remaining size",
              value: data ? sizeLabel(remainingSize) : "--",
            },
          ].map(({ label, value }) => (
            <div
              key={label}
              className={css({
                display: "flex",
                alignItems: "baseline",
                gap: "8px",
              })}
            >
              <dt className={css({ color: "muted" })}>{label}</dt>
              <dd
                className={css({
                  fontWeight: "550",
                  fontVariantNumeric: "tabular-nums",
                })}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <Button disabled={loading || !!busy} onClick={() => onRefresh()}>
          {loading ? <Spinner size={15} /> : <ArrowClockwiseIcon size={15} />}
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div
        className={css({
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          mb: "14px",
          minWidth: 0,
        })}
      >
        <fieldset
          aria-label="Filter downloads by status"
          className={css({
            display: "flex",
            flexWrap: "wrap",
            gap: "4px",
            minWidth: 0,
            border: 0,
            p: 0,
            m: 0,
          })}
        >
          {[
            { value: "all", label: "All downloads" },
            { value: "downloading", label: "Downloading" },
            { value: "warning", label: "Warnings" },
          ].map((filter) => (
            <Button
              key={filter.value}
              size="sm"
              variant={statusFilter === filter.value ? "secondary" : "ghost"}
              aria-pressed={statusFilter === filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={css({
                color: statusFilter === filter.value ? "ink" : "muted",
              })}
            >
              {filter.label}
            </Button>
          ))}
        </fieldset>
        <div
          className={css({
            width: { base: "100%", sm: "210px" },
            minWidth: 0,
            "& button > span": {
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            },
          })}
        >
          <SelectField
            label="Filter by instance"
            value={selectedInstance}
            onChange={setInstanceFilter}
            options={[
              { value: "all", label: "All instances" },
              ...Array.from(instances, ([value, label]) => ({ value, label })),
            ]}
          />
        </div>
      </div>

      <div aria-busy={loading} className={css({ minWidth: 0 })}>
        {!data && loading ? (
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
            <Spinner /> Loading downloads...
          </output>
        ) : data && filteredItems.length === 0 ? (
          <div
            className={cx(
              panelStyle,
              css({ p: "36px 20px", textAlign: "center" }),
            )}
          >
            {errors.length && (!items.length || selectedUnavailable) ? (
              <WarningCircleIcon
                size={27}
                className={css({ mx: "auto", color: "warning", mb: "12px" })}
              />
            ) : (
              <CheckCircleIcon
                size={27}
                className={css({ mx: "auto", color: "subtle", mb: "12px" })}
              />
            )}
            <h2 className={css({ fontSize: "16px", fontWeight: "550" })}>
              {selectedUnavailable
                ? "This instance's queue is unavailable"
                : !items.length && errors.length
                  ? "No downloads could be loaded"
                  : items.length
                    ? "No matching downloads"
                    : "Nothing in the queue"}
            </h2>
            <p
              className={cx(
                mutedStyle,
                css({ mt: "7px", maxWidth: "420px", mx: "auto" }),
              )}
            >
              {selectedUnavailable || (!items.length && errors.length)
                ? "Check the service errors above and refresh. This does not mean your downloads have stopped."
                : items.length
                  ? "Try a different instance or status filter."
                  : "Downloads will appear here when Sonarr or Radarr sends them to your download client."}
            </p>
            {(selectedInstance !== "all" || statusFilter !== "all") && (
              <Button
                size="sm"
                className={css({ mt: "16px" })}
                onClick={() => {
                  setInstanceFilter("all");
                  setStatusFilter("all");
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
            <table
              className={css({
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12px",
              })}
            >
              <caption className={css({ srOnly: true })}>
                Download queue
              </caption>
              <thead
                className={css({
                  color: "muted",
                  fontSize: "10px",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                })}
              >
                <tr>
                  <th
                    scope="col"
                    className={`${headCellStyle} ${css({ width: "100%" })}`}
                  >
                    Download
                  </th>
                  <th scope="col" className={headCellStyle}>
                    Status
                  </th>
                  <th scope="col" className={headCellStyle}>
                    Progress
                  </th>
                  <th scope="col" className={`${headCellStyle} ${columnMd}`}>
                    Size
                  </th>
                  <th scope="col" className={`${headCellStyle} ${columnSm}`}>
                    Time left
                  </th>
                  <th scope="col" className={`${headCellStyle} ${columnLg}`}>
                    Source
                  </th>
                  <th scope="col" className={headCellStyle}>
                    <span className={css({ srOnly: true })}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {orderedItems.map((item) => {
                  const key = queueKey(item);
                  const status = item.status.toLowerCase();
                  const warning = hasWarning(item);
                  const warnings = Array.from(new Set(item.warnings));
                  const size = Number.isFinite(item.size)
                    ? Math.max(0, item.size)
                    : 0;
                  const remaining = Number.isFinite(item.sizeleft)
                    ? Math.max(0, item.sizeleft)
                    : 0;
                  const progress =
                    size > 0
                      ? Math.min(
                          100,
                          Math.max(
                            0,
                            Math.round(((size - remaining) / size) * 100),
                          ),
                        )
                      : status === "completed"
                        ? 100
                        : undefined;
                  const canGrab =
                    ["delay", "downloadclientunavailable"].includes(status) &&
                    !item.downloadId;
                  const canImport = status === "completed" && !!item.downloadId;
                  return (
                    <Fragment key={key}>
                      <tr aria-label={`${item.mediaTitle} download`}>
                        <td className={`${cellStyle} ${css({ maxWidth: 0 })}`}>
                          <span
                            className={css({
                              display: "block",
                              fontWeight: "550",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            })}
                          >
                            {item.mediaTitle}
                          </span>
                          <span
                            className={css({
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                              mt: "2px",
                              minWidth: 0,
                            })}
                          >
                            <span
                              className={css({
                                flexShrink: 0,
                                px: "5px",
                                py: "1px",
                                border: "1px solid token(colors.line)",
                                borderRadius: "4px",
                                color: "muted",
                                fontSize: "10px",
                              })}
                            >
                              {item.quality || "Quality unknown"}
                            </span>
                            <span
                              title={item.title}
                              className={css({
                                minWidth: 0,
                                color: "subtle",
                                fontSize: "11px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              })}
                            >
                              {item.title}
                            </span>
                          </span>
                        </td>
                        <td
                          className={`${cellStyle} ${css({ whiteSpace: "nowrap" })}`}
                        >
                          <span
                            className={css({
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              color: warning
                                ? "warning"
                                : status === "downloading"
                                  ? "accent"
                                  : status === "completed"
                                    ? "positive"
                                    : "muted",
                            })}
                          >
                            {warning ? (
                              <WarningCircleIcon size={13} />
                            ) : status === "downloading" ? (
                              <ArrowDownIcon size={12} />
                            ) : null}
                            {statusLabels[status] ||
                              item.status ||
                              "Status unknown"}
                          </span>
                        </td>
                        <td
                          className={`${cellStyle} ${css({ whiteSpace: "nowrap" })}`}
                        >
                          <div
                            className={css({
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            })}
                          >
                            <progress
                              value={progress}
                              max={100}
                              aria-label={`Download progress for ${item.mediaTitle}`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={progress}
                              aria-valuetext={
                                progress === undefined
                                  ? "Progress unavailable"
                                  : `${progress}% downloaded`
                              }
                              className={css({
                                width: { base: "64px", md: "96px" },
                                height: "4px",
                                appearance: "none",
                                border: 0,
                                borderRadius: "4px",
                                overflow: "hidden",
                                bg: "line",
                                color: warning ? "warning" : "accent",
                                "&::-webkit-progress-bar": {
                                  bg: "line",
                                  borderRadius: "4px",
                                },
                                "&::-webkit-progress-value": {
                                  bg: "currentColor",
                                  borderRadius: "4px",
                                },
                                "&::-moz-progress-bar": {
                                  bg: "currentColor",
                                  borderRadius: "4px",
                                },
                              })}
                            />
                            <span
                              className={css({
                                minWidth: "42px",
                                color: "muted",
                                fontVariantNumeric: "tabular-nums",
                              })}
                            >
                              {progress === undefined
                                ? "Unknown"
                                : `${progress}%`}
                            </span>
                          </div>
                        </td>
                        <td
                          className={`${cellStyle} ${columnMd} ${css({ color: "muted", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" })}`}
                        >
                          {size > 0
                            ? `${sizeLabel(remaining)} / ${sizeLabel(size)}`
                            : remaining > 0
                              ? `${sizeLabel(remaining)} / ?`
                              : "—"}
                        </td>
                        <td
                          className={`${cellStyle} ${columnSm} ${css({ color: "muted", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" })}`}
                        >
                          {status === "completed"
                            ? "Finished"
                            : item.timeleft
                              ? item.timeleft
                              : "—"}
                        </td>
                        <td className={`${cellStyle} ${columnLg}`}>
                          <span
                            className={css({
                              display: "block",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            })}
                          >
                            {item.instanceName}
                          </span>
                          <span
                            className={css({
                              display: "block",
                              color: "subtle",
                              fontSize: "11px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            })}
                          >
                            {item.downloadClient || "Client not reported"}
                          </span>
                        </td>
                        <td
                          className={`${cellStyle} ${css({ textAlign: "right", whiteSpace: "nowrap" })}`}
                        >
                          <div
                            className={css({
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              gap: "4px",
                            })}
                          >
                            {(canGrab || canImport) && (
                              <Button
                                size="sm"
                                disabled={!!busy || loading}
                                title={
                                  canGrab
                                    ? "Bypass the release delay and request a download"
                                    : "Request an import scan; manual import may still be needed"
                                }
                                onClick={() => void mutate(item, "retry")}
                              >
                                {busy?.key === key &&
                                busy.action === "retry" ? (
                                  <Spinner size={14} />
                                ) : canGrab ? (
                                  <PlayIcon size={13} />
                                ) : (
                                  <ArrowClockwiseIcon size={13} />
                                )}
                                {canGrab ? "Grab now" : "Retry import"}
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Remove ${item.mediaTitle} from queue`}
                              disabled={!!busy || loading}
                              onClick={() => {
                                setRemoving(item);
                                setRemoveFromClient(true);
                                setBlocklist(false);
                                setActionError(undefined);
                              }}
                            >
                              <TrashIcon size={16} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {(warnings.length > 0 ||
                        (status === "completed" && !item.downloadId)) && (
                        <tr>
                          <td
                            colSpan={7}
                            className={css({
                              px: "10px",
                              pb: "8px",
                              color: "warning",
                              fontSize: "11px",
                              lineHeight: "1.6",
                              overflowWrap: "anywhere",
                            })}
                          >
                            {warnings.length > 0 && (
                              <details>
                                <summary
                                  aria-label={`Warning details for ${item.mediaTitle}`}
                                  className={css({
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    cursor: "pointer",
                                    listStyle: "none",
                                    "&::-webkit-details-marker": {
                                      display: "none",
                                    },
                                    _focusVisible: {
                                      outline: "2px solid token(colors.accent)",
                                      outlineOffset: "3px",
                                      borderRadius: "3px",
                                    },
                                  })}
                                >
                                  <WarningCircleIcon
                                    size={14}
                                    className={css({ flexShrink: 0 })}
                                  />
                                  <span
                                    title={warnings[0]}
                                    className={css({
                                      minWidth: 0,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    })}
                                  >
                                    {warnings[0]}
                                  </span>
                                  <span
                                    className={css({
                                      flexShrink: 0,
                                      ml: "auto",
                                      color: "muted",
                                    })}
                                  >
                                    Details
                                    {warnings.length > 1
                                      ? ` (${warnings.length})`
                                      : ""}
                                  </span>
                                </summary>
                                <ul
                                  aria-label={`Warnings for ${item.mediaTitle}`}
                                  className={css({
                                    minWidth: 0,
                                    maxHeight: "180px",
                                    overflowY: "auto",
                                    overflowWrap: "anywhere",
                                    display: "grid",
                                    gap: "3px",
                                    listStyle: "none",
                                    pl: "22px",
                                    pr: "8px",
                                    py: 0,
                                    mt: "6px",
                                    mb: 0,
                                  })}
                                >
                                  {warnings.map((message) => (
                                    <li key={message}>{message}</li>
                                  ))}
                                </ul>
                              </details>
                            )}
                            {status === "completed" && !item.downloadId && (
                              <p className={css({ color: "muted", mt: "4px" })}>
                                No download ID was reported. Open this
                                instance's manual import screen to review the
                                completed files.
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={!!removing}
        onOpenChange={(next) => {
          if (!next && !actionLock.current) {
            setRemoving(null);
            setActionError(undefined);
          }
        }}
        title="Remove download?"
        description="Choose what happens in the instance and download client."
      >
        <div className={css({ display: "grid", gap: "18px", minWidth: 0 })}>
          <div className={cx(panelStyle, css({ p: "13px", minWidth: 0 }))}>
            <p
              className={css({
                fontSize: "13px",
                fontWeight: "550",
                overflowWrap: "anywhere",
              })}
            >
              {removing?.mediaTitle}
            </p>
            <p
              title={removing?.title}
              className={css({
                fontSize: "11px",
                color: "subtle",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                mt: "4px",
              })}
            >
              {removing?.title}
            </p>
            <p
              className={css({
                fontSize: "11px",
                color: "muted",
                mt: "6px",
                overflowWrap: "anywhere",
              })}
            >
              {removing?.instanceName}
            </p>
          </div>
          <fieldset
            disabled={!!busy}
            className={css({
              display: "grid",
              gap: "14px",
              border: 0,
              p: 0,
              m: 0,
              minWidth: 0,
            })}
          >
            <CheckField
              checked={removeFromClient}
              onChange={(value) => {
                if (!actionLock.current) setRemoveFromClient(value);
              }}
            >
              Remove from download client
            </CheckField>
            <p
              className={css({
                color: "muted",
                fontSize: "11px",
                lineHeight: "1.7",
                pl: "27px",
                mt: "-9px",
              })}
            >
              {removeFromClient
                ? "Also asks the download client to remove this job. Downloaded files may be deleted according to your instance and client settings."
                : "Only removes instance tracking. The job stays in your download client and may reappear in the queue."}
            </p>
            <CheckField
              checked={blocklist}
              onChange={(value) => {
                if (!actionLock.current) setBlocklist(value);
              }}
            >
              Blocklist this release
            </CheckField>
            <p
              className={css({
                color: "muted",
                fontSize: "11px",
                lineHeight: "1.7",
                pl: "27px",
                mt: "-9px",
              })}
            >
              {blocklist
                ? "Prevents this release from being grabbed again. The instance may search for and download a replacement."
                : "The release will not be blocklisted and can be grabbed again."}
            </p>
          </fieldset>
          {actionError && (
            <Notice error>
              <span className={css({ minWidth: 0, overflowWrap: "anywhere" })}>
                {actionError}
              </span>
            </Notice>
          )}
          <div
            className={css({
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              gap: "10px",
            })}
          >
            <Button
              disabled={!!busy}
              onClick={() => {
                setRemoving(null);
                setActionError(undefined);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!!busy || loading}
              onClick={() => {
                if (removing) void mutate(removing, "remove");
              }}
            >
              {busy?.action === "remove" ? (
                <Spinner size={15} />
              ) : (
                <TrashIcon size={15} />
              )}
              {busy?.action === "remove" ? "Removing..." : "Remove download"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
