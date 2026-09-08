"use client";

import { type Query, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  type RealtimeEvent,
  type RealtimeSnapshot,
  type RealtimeStatus,
  type RealtimeVersion,
  realtimeCoreQueries,
  realtimeEventSchema,
  realtimeSnapshotSchema,
  realtimeStatusSchema,
  realtimeTopics,
} from "./realtime-events";
import { realtimeVersion } from "./realtime-query";

function matches(query: Query, event: RealtimeEvent) {
  return event.topics.some((topic) => {
    const prefix = topic === "options" ? "instance-options" : topic;
    return (
      query.queryKey[0] === prefix &&
      (event.instanceId === undefined ||
        (topic !== "episodes" && topic !== "options") ||
        query.queryKey[1] === event.instanceId) &&
      (topic !== "episodes" ||
        event.remoteId === undefined ||
        query.queryKey[2] === event.remoteId)
    );
  });
}

export interface RealtimeConnection {
  connection: "connecting" | "connected" | "disconnected";
  instances: RealtimeStatus["instances"];
}

export function useRealtime(): RealtimeConnection {
  const client = useQueryClient();
  const [connection, setConnection] =
    useState<RealtimeConnection["connection"]>("connecting");
  const [instances, setInstances] = useState<RealtimeStatus["instances"]>([]);

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      setConnection("disconnected");
      return;
    }

    const cache = client.getQueryCache();
    const dirty = new Set<Query>();
    const versions = new Map<string, RealtimeVersion>();
    const received = new Map<string, RealtimeVersion>();
    const pending = new Map<string, Promise<void>>();
    const retiredEpochs = new Set<string>();
    const core: Record<string, true> = Object.fromEntries(
      realtimeCoreQueries.map((key) => [JSON.stringify(key), true]),
    );
    const stream = new EventSource("/api/events");
    let epoch: string | undefined;
    let streamEpoch: string | undefined;
    let delivery = 0;
    let timer: number | undefined;
    let stopped = false;
    let opened = false;
    let needsRecovery = false;

    function schedule() {
      if (stopped || timer !== undefined) return;
      timer = window.setTimeout(flush, 250);
    }

    function flush() {
      timer = undefined;
      for (const query of dirty) {
        // A hint received during a fetch must survive its response and trigger
        // one trailing read. A core snapshot instead clears this marker.
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
      for (const query of cache.getAll()) {
        if (!matches(query, event)) continue;
        dirty.add(query);
        query.invalidate();
      }
      if (dirty.size) schedule();
    }

    function reset() {
      invalidate({ topics: [...realtimeTopics] });
    }

    function onOpen() {
      if (stopped) return;
      setConnection("connected");
      if (opened || needsRecovery) {
        delivery++;
        streamEpoch = undefined;
        received.clear();
        reset();
      }
      opened = true;
      needsRecovery = false;
    }

    function onError() {
      if (stopped) return;
      delivery++;
      received.clear();
      setConnection("disconnected");
      needsRecovery = true;
    }

    function onStatus(event: MessageEvent<string>) {
      if (stopped) return;
      try {
        const parsed = realtimeStatusSchema.safeParse(JSON.parse(event.data));
        if (parsed.success) setInstances(parsed.data.instances);
      } catch {
        // Keep the last known status when a snapshot is malformed.
      }
    }

    function onSnapshot(event: MessageEvent<string>) {
      if (stopped) return;
      let snapshot: RealtimeSnapshot;
      try {
        const parsed = realtimeSnapshotSchema.safeParse(JSON.parse(event.data));
        if (!parsed.success) return;
        snapshot = parsed.data;
      } catch {
        return;
      }
      const key = JSON.stringify(snapshot.queryKey);
      if (!core[key]) return;
      const query = cache.find({ queryKey: snapshot.queryKey, exact: true });
      if (!query) return;
      const version = snapshot.version;
      if (streamEpoch && streamEpoch !== version.epoch) return;
      if (retiredEpochs.has(version.epoch)) return;
      streamEpoch = version.epoch;
      if (epoch !== version.epoch) {
        if (epoch) retiredEpochs.add(epoch);
        epoch = version.epoch;
        versions.clear();
        received.clear();
      }
      const previous = versions.get(key);
      const queued = received.get(key);
      const cached =
        realtimeVersion(query.state.error) ?? realtimeVersion(query.state.data);
      if (
        (previous?.epoch === version.epoch &&
          previous.revision >= version.revision) ||
        (queued?.epoch === version.epoch &&
          queued.revision >= version.revision) ||
        (cached?.epoch === version.epoch && cached.revision >= version.revision)
      )
        return;
      received.set(key, version);
      dirty.delete(query);
      const receivedDelivery = delivery;
      // Cancel immediately, even if another update for this key is awaiting
      // cancellation. Identity guards exclude obsolete deliveries and epochs.
      const canceled = client.cancelQueries({
        queryKey: snapshot.queryKey,
        exact: true,
      });
      const update = Promise.all([pending.get(key), canceled]).then(() => {
        if (
          stopped ||
          delivery !== receivedDelivery ||
          epoch !== version.epoch ||
          received.get(key) !== version ||
          cache.find({ queryKey: snapshot.queryKey, exact: true }) !== query
        )
          return;
        const latest =
          realtimeVersion(query.state.error) ??
          realtimeVersion(query.state.data);
        if (
          latest?.epoch === version.epoch &&
          latest.revision >= version.revision
        )
          return;
        versions.set(key, version);
        if ("data" in snapshot) {
          client.setQueryData(snapshot.queryKey, {
            ...snapshot.data,
            _realtime: version,
          });
        } else {
          const error = Object.assign(new Error(snapshot.error), {
            _realtime: version,
          });
          // A server refresh error is a query error, not an invitation for
          // every browser to retry the same upstream request. Keep its rows.
          query.setState({
            error,
            errorUpdatedAt: Date.now(),
            errorUpdateCount: query.state.errorUpdateCount + 1,
            fetchFailureCount: query.state.fetchFailureCount + 1,
            fetchFailureReason: error,
            fetchStatus: "idle",
            status: "error",
            isInvalidated: false,
          });
        }
      });
      pending.set(key, update);
      void update.finally(() => {
        if (pending.get(key) === update) pending.delete(key);
        if (received.get(key) === version) received.delete(key);
      });
    }

    function onInvalidate(event: MessageEvent<string>) {
      if (stopped) return;
      try {
        const parsed = realtimeEventSchema.safeParse(JSON.parse(event.data));
        if (!parsed.success) return;
        invalidate(parsed.data);
      } catch {
        // Malformed hints cannot safely identify data to refresh.
      }
    }

    function onAuthRequired() {
      if (stopped) return;
      setConnection("disconnected");
      stop();
    }

    const unsubscribe = cache.subscribe((event) => {
      if (event.type === "removed") {
        dirty.delete(event.query);
        versions.delete(JSON.stringify(event.query.queryKey));
      }
      if (dirty.has(event.query) && event.query.state.fetchStatus === "idle")
        schedule();
    });

    function onVisible() {
      if (document.visibilityState !== "hidden") reset();
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      stream.close();
      stream.removeEventListener("open", onOpen);
      stream.removeEventListener("error", onError);
      stream.removeEventListener("status", onStatus);
      stream.removeEventListener("snapshot", onSnapshot);
      stream.removeEventListener("invalidate", onInvalidate);
      stream.removeEventListener("auth-required", onAuthRequired);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      unsubscribe();
      window.clearTimeout(timer);
      dirty.clear();
      versions.clear();
      received.clear();
      pending.clear();
    }

    stream.addEventListener("open", onOpen);
    stream.addEventListener("error", onError);
    stream.addEventListener("status", onStatus);
    stream.addEventListener("snapshot", onSnapshot);
    stream.addEventListener("invalidate", onInvalidate);
    stream.addEventListener("auth-required", onAuthRequired);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return stop;
  }, [client]);

  return { connection, instances };
}
