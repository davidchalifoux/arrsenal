"use client";

import { type Query, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useState } from "react";
import { instancesQuery, libraryQuery, queueQuery } from "./queries";
import {
  beginBootstrap,
  deliverBootstrap,
  endBootstrap,
} from "./realtime-bootstrap";
import {
  type RealtimeEvent,
  type RealtimePatch,
  type RealtimeSnapshot,
  type RealtimeStatus,
  type RealtimeVersion,
  realtimeCoreQueries,
  realtimeEventSchema,
  realtimePatchSchema,
  realtimeSnapshotSchema,
  realtimeStatusSchema,
  realtimeTopics,
} from "./realtime-events";
import { applyRealtimePatch, type CoreData } from "./realtime-patches";
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

  // Layout effects run before any query's mount fetch, so first loads know to
  // wait for the stream's snapshots.
  useLayoutEffect(() => {
    if (typeof EventSource === "undefined") return;
    beginBootstrap();
    return endBootstrap;
  }, []);

  useEffect(() => {
    if (typeof EventSource === "undefined") {
      setConnection("disconnected");
      return;
    }

    const cache = client.getQueryCache();
    const dirty = new Set<Query>();
    const recovery = new Map<Query, RealtimeVersion>();
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
      for (const [query, required] of recovery) {
        if (
          query.state.fetchStatus !== "idle" ||
          document.visibilityState === "hidden"
        )
          continue;
        const options =
          query.queryKey[0] === "library"
            ? libraryQuery
            : query.queryKey[0] === "queue"
              ? queueQuery
              : instancesQuery;
        dirty.delete(query);
        // A patch baseline is needed even for an inactive, existing core cache.
        // fetchQuery also works for the disabled transport observers used by DB.
        void client
          .fetchQuery<unknown, Error, unknown, string[]>({
            queryKey: options.queryKey,
            queryFn: options.queryFn,
            staleTime: 0,
            retry: false,
          })
          .then(
            () => {
              if (stopped) return;
              const latest =
                realtimeVersion(query.state.error) ??
                realtimeVersion(query.state.data);
              const needed = recovery.get(query);
              if (!needed) return;
              if (
                latest?.epoch === needed.epoch &&
                latest.revision >= needed.revision
              )
                recovery.delete(query);
              else if (needed !== required) schedule();
              else {
                recovery.delete(query);
                query.invalidate();
              }
            },
            () => {
              if (stopped) return;
              recovery.delete(query);
              // Keep last-good rows; a later event or visibility change retries.
              query.invalidate();
            },
          );
      }
      for (const query of dirty) {
        // A hint received during a fetch must survive its response and trigger
        // one trailing read. A core snapshot instead clears this marker.
        if (query.state.fetchStatus !== "idle" || recovery.has(query)) continue;
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

    // Every new stream opens with a reset hint. On the first connection it
    // would only re-read data this page is loading or just loaded, so skip
    // those; reconnects reset everything themselves in onOpen.
    const startedAt = Date.now();
    let firstReset = true;

    function invalidate(event: RealtimeEvent) {
      if (stopped) return;
      const initial = event.reset === true && firstReset && !needsRecovery;
      if (event.reset) firstReset = false;
      for (const query of cache.getAll()) {
        if (!matches(query, event)) continue;
        if (
          initial &&
          (query.state.fetchStatus === "fetching" ||
            query.state.dataUpdatedAt >= startedAt)
        )
          continue;
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
      endBootstrap();
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

    function recover(query: Query, version: RealtimeVersion) {
      recovery.set(query, version);
      query.invalidate();
      schedule();
    }

    function receive(snapshot: RealtimeSnapshot | RealtimePatch) {
      if (stopped) return;
      const isPatch = "baseRevision" in snapshot;
      const key = JSON.stringify(snapshot.queryKey);
      if (!core[key]) return;
      const query = cache.find({ queryKey: snapshot.queryKey, exact: true });
      if (
        !isPatch &&
        deliverBootstrap(
          String(snapshot.queryKey[0]),
          "data" in snapshot
            ? { ...snapshot.data, _realtime: snapshot.version }
            : undefined,
          { keep: !query },
        )
      ) {
        // A first-load query took this snapshot as its result.
        if (query) dirty.delete(query);
        return;
      }
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
      // Do not cancel a recovery fetch for a delta we already know cannot be
      // applied. Track the newest required revision for a trailing recovery.
      const baseline = queued ?? cached;
      if (
        isPatch &&
        (baseline?.epoch !== version.epoch ||
          baseline.revision !== snapshot.baseRevision)
      ) {
        recover(query, version);
        return;
      }
      received.set(key, version);
      dirty.delete(query);
      const receivedDelivery = delivery;
      const canceled = client.cancelQueries({
        queryKey: snapshot.queryKey,
        exact: true,
      });
      const update = Promise.all([pending.get(key), canceled]).then(() => {
        if (
          stopped ||
          delivery !== receivedDelivery ||
          epoch !== version.epoch ||
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
        if (isPatch) {
          const data = applyRealtimePatch(
            query.state.data as CoreData | undefined,
            snapshot,
          );
          if (!data || query.state.error) {
            recover(query, version);
            return;
          }
          client.setQueryData(snapshot.queryKey, data);
        } else if ("data" in snapshot) {
          client.setQueryData(snapshot.queryKey, {
            ...snapshot.data,
            _realtime: version,
          });
        } else {
          const error = Object.assign(new Error(snapshot.error), {
            _realtime: version,
          });
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
        versions.set(key, version);
        const needed = recovery.get(query);
        if (
          needed &&
          (needed.epoch !== version.epoch ||
            needed.revision <= version.revision)
        )
          recovery.delete(query);
      });
      pending.set(key, update);
      void update.finally(() => {
        if (pending.get(key) === update) pending.delete(key);
        if (received.get(key) === version) received.delete(key);
      });
    }

    function onSnapshot(event: MessageEvent<string>) {
      try {
        const parsed = realtimeSnapshotSchema.safeParse(JSON.parse(event.data));
        if (parsed.success) receive(parsed.data);
      } catch {
        /* Ignore malformed envelopes. */
      }
    }

    function onPatch(event: MessageEvent<string>) {
      try {
        const parsed = realtimePatchSchema.safeParse(JSON.parse(event.data));
        if (parsed.success) receive(parsed.data);
        else reset();
      } catch {
        reset();
      }
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
        recovery.delete(event.query);
        versions.delete(JSON.stringify(event.query.queryKey));
      }
      if (
        (dirty.has(event.query) || recovery.has(event.query)) &&
        event.query.state.fetchStatus === "idle"
      )
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
      stream.removeEventListener("patch", onPatch);
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
      recovery.clear();
    }

    stream.addEventListener("open", onOpen);
    stream.addEventListener("error", onError);
    stream.addEventListener("status", onStatus);
    stream.addEventListener("snapshot", onSnapshot);
    stream.addEventListener("patch", onPatch);
    stream.addEventListener("invalidate", onInvalidate);
    stream.addEventListener("auth-required", onAuthRequired);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return stop;
  }, [client]);

  return { connection, instances };
}
