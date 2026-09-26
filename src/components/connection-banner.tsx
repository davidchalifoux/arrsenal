"use client";

import { WarningIcon } from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useInstances, useSyncData } from "@/lib/client-data";
import { useOptionalLibraryActions } from "./library-provider";

export function ConnectionBanner() {
  const actions = useOptionalLibraryActions();
  return actions ? <Banner {...actions} /> : null;
}

function Banner({
  realtime,
  notify,
}: Pick<
  NonNullable<ReturnType<typeof useOptionalLibraryActions>>,
  "realtime" | "notify"
>) {
  const instances = useInstances();
  const sync = useSyncData();
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const disconnected = realtime.instances.filter(
    (instance) => instance.status === "disconnected",
  );
  const streamDisconnected = realtime.connection === "disconnected";
  if (!streamDisconnected && !disconnected.length) return null;

  const names = disconnected.map(
    (instance) =>
      instances.data?.instances.find(
        (configured) => configured.id === instance.instanceId,
      )?.name ?? "An instance",
  );
  const nameList =
    names.length > 1
      ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
      : names[0];

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await sync("all");
      const failed = client.getQueryCache().findAll({
        type: "active",
        predicate: (query) => query.state.status === "error",
      });
      if (failed.length) {
        notify("Some data could not be refreshed. Please try again.", true);
      }
    } catch {
      notify("Could not refresh data. Please try again.", true);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div
      role="alert"
      className={css({
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "8px 10px",
        minHeight: "40px",
        p: "7px 8px 7px 14px",
        bg: "color-mix(in srgb, var(--warning) 9%, transparent)",
        border: "1px solid color-mix(in srgb, var(--warning) 28%, transparent)",
        borderRadius: "10px",
        color: "warning",
        fontSize: "13px",
        lineHeight: "1.5",
      })}
    >
      <WarningIcon size={16} aria-hidden="true" />
      <p
        className={css({
          flex: "1 1 260px",
          minWidth: 0,
          overflowWrap: "anywhere",
        })}
      >
        {streamDisconnected ? (
          <>
            <strong className={css({ fontWeight: "600" })}>
              Live updates disconnected.
            </strong>{" "}
            The browser's live connection is unavailable, so displayed data may
            be outdated.
          </>
        ) : null}
        {!!names.length && (
          <>
            {streamDisconnected ? " " : ""}
            <strong className={css({ fontWeight: "600" })}>
              {nameList} {names.length > 1 ? "are" : "is"} unreachable.
            </strong>{" "}
            {names.length > 1 ? "Their" : "Its"} titles may be out of date until
            {names.length > 1 ? " they reconnect" : " it reconnects"}.
          </>
        )}
      </p>
      <div
        className={css({ display: "flex", alignItems: "center", gap: "4px" })}
      >
        <button
          type="button"
          disabled={refreshing}
          onClick={() => void refresh()}
          className={css({
            height: "30px",
            px: "10px",
            bg: "transparent",
            border:
              "1px solid color-mix(in srgb, var(--warning) 32%, transparent)",
            borderRadius: "7px",
            color: "inherit",
            fontSize: "12px",
            fontWeight: "500",
            _hover: {
              bg: "color-mix(in srgb, var(--warning) 12%, transparent)",
            },
            _disabled: { opacity: 0.6 },
          })}
        >
          {refreshing ? "Refreshing..." : "Refresh data"}
        </button>
        <Link
          href="/settings/connections"
          className={css({
            display: "inline-flex",
            alignItems: "center",
            height: "30px",
            px: "10px",
            borderRadius: "7px",
            color: "inherit",
            fontSize: "12px",
            fontWeight: "500",
            _hover: {
              bg: "color-mix(in srgb, var(--warning) 12%, transparent)",
            },
          })}
        >
          Check connection
        </Link>
      </div>
    </div>
  );
}
