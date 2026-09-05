"use client";

import {
  ArrowClockwiseIcon,
  ArrowDownIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadSimpleIcon,
  FilmSlateIcon,
  HardDrivesIcon,
  PlayIcon,
  StackIcon,
  TelevisionIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import Image from "next/image";
import { useId, useRef, useState } from "react";
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
  const [hiddenDemoIds, setHiddenDemoIds] = useState<Set<string>>(new Set());
  const [failedPosters, setFailedPosters] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<{
    item: QueueItem;
    demo: boolean;
  } | null>(null);
  const [removeFromClient, setRemoveFromClient] = useState(true);
  const [blocklist, setBlocklist] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [busy, setBusy] = useState<{
    key: string;
    action: "remove" | "retry";
  } | null>(null);
  const actionLock = useRef(false);

  const demo = data?.demo === true;
  const errors = data?.errors ?? [];
  const items = (data?.items ?? []).filter(
    (item) => !demo || !hiddenDemoIds.has(queueKey(item)),
  );
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
  const activeCount = items.filter(
    (item) => item.status.toLowerCase() === "downloading",
  ).length;
  const remainingSize = items.reduce(
    (total, item) =>
      total + (Number.isFinite(item.sizeleft) ? Math.max(0, item.sizeleft) : 0),
    0,
  );
  const instanceCount = new Set(items.map((item) => item.instanceId)).size;
  const selectedUnavailable = errors.some(
    (error) => error.instanceId === selectedInstance,
  );

  async function mutate(
    item: QueueItem,
    action: "remove" | "retry",
    sample: boolean,
  ) {
    if (actionLock.current || loading) return;
    if (
      !data ||
      sample !== data.demo ||
      !items.some((entry) => queueKey(entry) === queueKey(item))
    ) {
      setActionError(
        "The queue has changed. Close this dialog and refresh before trying again.",
      );
      return;
    }
    setActionError(undefined);
    if (sample) {
      if (action === "remove") {
        setHiddenDemoIds((previous) => new Set(previous).add(queueKey(item)));
        setRemoving(null);
        notify("Demo: Sample download hidden. No real downloads were changed.");
      } else {
        notify(
          "Demo: This is a sample action. No real downloads were changed.",
        );
      }
      return;
    }

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
      // A timed-out mutation may still have been accepted by the instance.
      onRefresh();
    }
  }

  return (
    <section className={css({ minWidth: 0 })} aria-labelledby={`${id}-heading`}>
      <div
        className={css({
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          mb: "24px",
        })}
      >
        <div>
          <h1
            id={`${id}-heading`}
            className={css({
              fontSize: "25px",
              fontWeight: "600",
              letterSpacing: "-.7px",
            })}
          >
            Download queue
          </h1>
          <p className={cx(mutedStyle, css({ mt: "5px" }))}>
            {data
              ? `${items.length} ${demo ? "sample " : ""}${items.length === 1 ? "item" : "items"} across your ${demo ? "example" : "connected"} instances.`
              : loading
                ? "Loading downloads from your instances."
                : "Downloads from your Sonarr and Radarr instances."}
          </p>
        </div>
        <Button disabled={loading || !!busy} onClick={() => onRefresh()}>
          {loading ? <Spinner size={15} /> : <ArrowClockwiseIcon size={15} />}
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div className={css({ display: "grid", gap: "12px", mb: "20px" })}>
        {demo && (
          <Notice>
            Sample downloads, not live activity. Demo actions only affect this
            preview; no real downloads are changed.
          </Notice>
        )}
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

      <dl
        className={css({
          display: "grid",
          gridTemplateColumns: {
            base: "minmax(0, 1fr)",
            sm: "repeat(3, minmax(0, 1fr))",
          },
          gap: "12px",
          mb: "24px",
        })}
      >
        {[
          {
            label: "Active downloads",
            value: data ? String(activeCount) : "--",
            icon: DownloadSimpleIcon,
            detail: demo ? "In this sample queue" : "Currently downloading",
          },
          {
            label: "Remaining size",
            value: data ? sizeLabel(remainingSize) : "--",
            icon: HardDrivesIcon,
            detail: "Across listed downloads",
          },
          {
            label: "Instances involved",
            value: data ? String(instanceCount) : "--",
            icon: StackIcon,
            detail: demo ? "Example instances" : "With items in the queue",
          },
        ].map(({ label, value, icon: Icon, detail }) => (
          <div
            key={label}
            className={cx(panelStyle, css({ p: "18px", minWidth: 0 }))}
          >
            <dt
              className={css({
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "8px",
                color: "muted",
                fontSize: "12px",
              })}
            >
              {label}
              <Icon
                size={16}
                className={css({ color: "subtle", flexShrink: 0 })}
              />
            </dt>
            <dd
              className={css({
                fontSize: "27px",
                lineHeight: "1.3",
                fontWeight: "550",
                letterSpacing: "-.8px",
                mt: "12px",
                fontVariantNumeric: "tabular-nums",
              })}
            >
              {value}
            </dd>
            <dd
              className={css({ color: "subtle", fontSize: "11px", mt: "5px" })}
            >
              {detail}
            </dd>
          </div>
        ))}
      </dl>

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
                    : demo
                      ? "Sample queue cleared"
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
                  : demo
                    ? "You have hidden the sample downloads in this preview. No real downloads were changed."
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
            {demo && !items.length && hiddenDemoIds.size > 0 && (
              <Button
                size="sm"
                className={css({ mt: "16px" })}
                onClick={() => setHiddenDemoIds(new Set())}
              >
                Restore sample downloads
              </Button>
            )}
          </div>
        ) : (
          <ul
            className={css({
              display: "grid",
              gap: "10px",
              listStyle: "none",
              p: 0,
              m: 0,
            })}
          >
            {filteredItems.map((item) => {
              const key = queueKey(item);
              const status = item.status.toLowerCase();
              const warning = hasWarning(item);
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
              const poster = item.poster;
              return (
                <li
                  key={key}
                  className={cx(
                    panelStyle,
                    css({ p: { base: "14px", md: "18px" }, minWidth: 0 }),
                  )}
                >
                  <article
                    aria-label={`${item.mediaTitle} download`}
                    className={css({
                      display: "grid",
                      gridTemplateColumns: {
                        base: "44px minmax(0, 1fr)",
                        md: "52px minmax(0, 1fr) minmax(180px, 250px) auto",
                      },
                      columnGap: { base: "12px", md: "18px" },
                      rowGap: "16px",
                      alignItems: "center",
                      minWidth: 0,
                    })}
                  >
                    <div
                      className={css({
                        width: { base: "44px", md: "52px" },
                        height: { base: "66px", md: "78px" },
                        display: "grid",
                        placeItems: "center",
                        bg: "elevated",
                        border: "1px solid token(colors.line)",
                        borderRadius: "6px",
                        overflow: "hidden",
                        color: "subtle",
                        alignSelf: "start",
                      })}
                    >
                      {poster && !failedPosters.has(poster) ? (
                        <Image
                          src={poster}
                          alt=""
                          width={52}
                          height={78}
                          unoptimized
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedPosters((previous) =>
                              new Set(previous).add(poster),
                            )
                          }
                          className={css({
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          })}
                        />
                      ) : item.kind === "series" ? (
                        <TelevisionIcon size={21} />
                      ) : (
                        <FilmSlateIcon size={21} />
                      )}
                    </div>
                    <div className={css({ minWidth: 0 })}>
                      <h2
                        className={css({
                          fontSize: "14px",
                          fontWeight: "550",
                          lineHeight: "1.5",
                          overflowWrap: "anywhere",
                        })}
                      >
                        {item.mediaTitle}
                      </h2>
                      <p
                        title={item.title}
                        className={css({
                          fontSize: "11px",
                          color: "subtle",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          mt: "3px",
                        })}
                      >
                        {item.title}
                      </p>
                      <div
                        className={css({
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          columnGap: "8px",
                          rowGap: "5px",
                          mt: "10px",
                          fontSize: "10px",
                          color: "muted",
                          minWidth: 0,
                          overflowWrap: "anywhere",
                        })}
                      >
                        <span
                          className={css({
                            px: "6px",
                            py: "2px",
                            border: "1px solid token(colors.line)",
                            borderRadius: "4px",
                            color: "ink",
                            bg: "elevated",
                            maxWidth: "100%",
                          })}
                        >
                          {item.quality || "Quality unknown"}
                        </span>
                        <span>{item.instanceName}</span>
                        <span
                          aria-hidden="true"
                          className={css({ color: "subtle" })}
                        >
                          /
                        </span>
                        <span>
                          {item.downloadClient || "Client not reported"}
                        </span>
                      </div>
                    </div>
                    <div
                      className={css({
                        minWidth: 0,
                        gridColumn: { base: "1 / -1", md: "auto" },
                      })}
                    >
                      <div
                        className={css({
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "10px",
                          fontSize: "11px",
                          mb: "9px",
                        })}
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
                            minWidth: 0,
                            overflowWrap: "anywhere",
                          })}
                        >
                          {warning ? (
                            <WarningCircleIcon
                              size={13}
                              className={css({ flexShrink: 0 })}
                            />
                          ) : status === "downloading" ? (
                            <ArrowDownIcon
                              size={12}
                              className={css({ flexShrink: 0 })}
                            />
                          ) : null}
                          {statusLabels[status] ||
                            item.status ||
                            "Status unknown"}
                        </span>
                        <span
                          className={css({
                            color: "muted",
                            flexShrink: 0,
                            fontVariantNumeric: "tabular-nums",
                          })}
                        >
                          {progress === undefined ? "Unknown" : `${progress}%`}
                        </span>
                      </div>
                      <progress
                        value={progress}
                        max={100}
                        aria-label={`${demo ? "Sample download" : "Download"} progress for ${item.mediaTitle}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progress}
                        aria-valuetext={
                          progress === undefined
                            ? "Progress unavailable"
                            : `${progress}% downloaded${demo ? " (sample)" : ""}`
                        }
                        className={css({
                          display: "block",
                          width: "100%",
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
                      <div
                        className={css({
                          display: "flex",
                          flexWrap: "wrap",
                          justifyContent: "space-between",
                          gap: "6px",
                          color: "subtle",
                          fontSize: "10px",
                          mt: "9px",
                          fontVariantNumeric: "tabular-nums",
                        })}
                      >
                        <span>
                          {size > 0
                            ? `${sizeLabel(remaining)} of ${sizeLabel(size)} left`
                            : remaining > 0
                              ? `${sizeLabel(remaining)} left / total unknown`
                              : "Size not reported"}
                        </span>
                        <span
                          className={css({
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            overflowWrap: "anywhere",
                            minWidth: 0,
                          })}
                        >
                          <ClockIcon
                            size={11}
                            className={css({ flexShrink: 0 })}
                          />
                          {status === "completed"
                            ? "Download finished"
                            : item.timeleft
                              ? `${item.timeleft} left`
                              : "ETA unavailable"}
                        </span>
                      </div>
                    </div>
                    <div
                      className={css({
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: "6px",
                        gridColumn: { base: "1 / -1", md: "auto" },
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
                          onClick={() => void mutate(item, "retry", demo)}
                        >
                          {busy?.key === key && busy.action === "retry" ? (
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
                          setRemoving({ item, demo });
                          setRemoveFromClient(true);
                          setBlocklist(false);
                          setActionError(undefined);
                        }}
                      >
                        <TrashIcon size={16} />
                      </Button>
                    </div>
                    {item.warnings.length > 0 && (
                      <div
                        className={css({
                          gridColumn: "1 / -1",
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                          borderTop: "1px solid token(colors.line)",
                          pt: "12px",
                          color: "warning",
                          fontSize: "11px",
                          lineHeight: "1.7",
                          minWidth: 0,
                        })}
                      >
                        <WarningCircleIcon
                          size={15}
                          className={css({ flexShrink: 0, mt: "2px" })}
                        />
                        <ul
                          aria-label={`Warnings for ${item.mediaTitle}`}
                          className={css({
                            minWidth: 0,
                            overflowWrap: "anywhere",
                            display: "grid",
                            gap: "3px",
                            listStyle: "none",
                            p: 0,
                            m: 0,
                          })}
                        >
                          {Array.from(new Set(item.warnings)).map((message) => (
                            <li key={message}>{message}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {status === "completed" && !item.downloadId && (
                      <p
                        className={css({
                          gridColumn: "1 / -1",
                          color: "muted",
                          fontSize: "11px",
                          lineHeight: "1.6",
                        })}
                      >
                        No download ID was reported. Open this instance's manual
                        import screen to review the completed files.
                      </p>
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
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
        title={removing?.demo ? "Remove sample download?" : "Remove download?"}
        description={
          removing?.demo
            ? "This only hides the sample item in this preview."
            : "Choose what happens in the instance and download client."
        }
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
              {removing?.item.mediaTitle}
            </p>
            <p
              title={removing?.item.title}
              className={css({
                fontSize: "11px",
                color: "subtle",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                mt: "4px",
              })}
            >
              {removing?.item.title}
            </p>
            <p
              className={css({
                fontSize: "11px",
                color: "muted",
                mt: "6px",
                overflowWrap: "anywhere",
              })}
            >
              {removing?.item.instanceName}
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
          {removing?.demo && (
            <Notice>
              Demo only. These options will not be sent to an instance or
              download client. No real downloads will be changed.
            </Notice>
          )}
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
                if (removing)
                  void mutate(removing.item, "remove", removing.demo);
              }}
            >
              {busy?.action === "remove" ? (
                <Spinner size={15} />
              ) : (
                <TrashIcon size={15} />
              )}
              {busy?.action === "remove"
                ? "Removing..."
                : removing?.demo
                  ? "Remove sample"
                  : "Remove download"}
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
