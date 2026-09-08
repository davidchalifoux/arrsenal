"use client";

import { type Query, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  type RealtimeEvent,
  realtimeEventSchema,
  realtimeTopics,
} from "./realtime-events";

function matches(query: Query, event: RealtimeEvent) {
  return event.topics.some((topic) => {
    const prefix = topic === "options" ? "instance-options" : topic;
    return (
      query.queryKey[0] === prefix &&
      (event.instanceId === undefined ||
        (topic !== "episodes" && topic !== "options") ||
        query.queryKey[1] === event.instanceId)
    );
  });
}

export function useRealtime() {
  const client = useQueryClient();

  useEffect(() => {
    if (typeof EventSource === "undefined") return;

    const stream = new EventSource("/api/events");
    const cache = client.getQueryCache();
    const dirty = new Set<Query>();
    let timer: number | undefined;
    let stopped = false;
    let opened = false;

    function schedule() {
      if (stopped || timer !== undefined) return;
      timer = window.setTimeout(flush, 250);
    }

    function flush() {
      timer = undefined;
      for (const query of dirty) {
        // An event received during any fetch needs a second fetch AFTER it.
        // cancelRefetch:false alone would reuse that possibly outdated request.
        if (query.state.fetchStatus !== "idle") continue;
        dirty.delete(query);
        query.invalidate();
        if (document.visibilityState !== "hidden" && query.isActive()) {
          void client.refetchQueries(
            { queryKey: query.queryKey, exact: true, type: "active" },
            { cancelRefetch: false },
          );
        }
      }
    }

    function invalidate(event: RealtimeEvent) {
      if (stopped) return;
      // Only touch existing queries: inactive caches become stale, but absent
      // episodes/options and unmounted screens must not start new requests.
      for (const query of cache.getAll()) {
        if (!matches(query, event)) continue;
        dirty.add(query);
        query.invalidate();
      }
      if (dirty.size) schedule();
    }

    const unsubscribe = cache.subscribe((event) => {
      if (event.type === "removed") dirty.delete(event.query);
      if (dirty.has(event.query) && event.query.state.fetchStatus === "idle") {
        schedule();
      }
    });

    function reset() {
      invalidate({ topics: [...realtimeTopics] });
    }

    function onOpen() {
      // The server sends an initial reset too. Subsequent opens may follow a
      // gap in delivery, so refresh even if no individual hints were replayed.
      if (opened) reset();
      opened = true;
    }

    function onInvalidate(event: MessageEvent<string>) {
      try {
        const parsed = realtimeEventSchema.safeParse(JSON.parse(event.data));
        if (parsed.success) invalidate(parsed.data);
      } catch {
        // Malformed hints are disposable; ordinary polling remains available.
      }
    }

    function onVisible() {
      if (document.visibilityState !== "hidden") reset();
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      stream.close();
      stream.removeEventListener("open", onOpen);
      stream.removeEventListener("invalidate", onInvalidate);
      stream.removeEventListener("auth-required", stop);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      unsubscribe();
      window.clearTimeout(timer);
      dirty.clear();
    }

    stream.addEventListener("open", onOpen);
    stream.addEventListener("invalidate", onInvalidate);
    stream.addEventListener("auth-required", stop);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return stop;
  }, [client]);
}
