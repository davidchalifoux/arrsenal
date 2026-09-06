"use client";

import { queryCollectionOptions } from "@tanstack/query-db-collection";
import {
  createCollection,
  hasVirtualProps,
  useLiveQuery,
} from "@tanstack/react-db";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { queuePollingInterval, subscribeQueueView } from "./polling";
import { instancesQuery, libraryQuery, queueQuery } from "./queries";
import type {
  InstanceSummary,
  LibraryResponse,
  MediaTarget,
  QueueItem,
  QueueResponse,
} from "./types";

const queueKey = (item: QueueItem) =>
  JSON.stringify([item.instanceId, item.id]);

function createCollections(queryClient: QueryClient) {
  // queryOptions widens queryFn to optional even for these concrete queries.
  if (!libraryQuery.queryFn || !instancesQuery.queryFn || !queueQuery.queryFn) {
    throw new Error("Collection queries require query functions");
  }
  // Copy keys to remove queryOptions' type-only data tags for DB inference.
  return {
    library: createCollection(
      queryCollectionOptions({
        ...libraryQuery,
        queryKey: [...libraryQuery.queryKey],
        queryFn: libraryQuery.queryFn,
        queryClient,
        select: (response: LibraryResponse) => response.items,
        getKey: (item) => item.id,
      }),
    ),
    instances: createCollection(
      queryCollectionOptions({
        ...instancesQuery,
        queryKey: [...instancesQuery.queryKey],
        queryFn: instancesQuery.queryFn,
        queryClient,
        select: (response: { instances: InstanceSummary[] }) =>
          response.instances,
        getKey: (instance) => instance.id,
      }),
    ),
    queue: createCollection(
      queryCollectionOptions({
        ...queueQuery,
        refetchInterval: () => queuePollingInterval(queryClient),
        queryKey: [...queueQuery.queryKey],
        queryFn: queueQuery.queryFn,
        queryClient,
        select: (response: QueueResponse) => response.items,
        getKey: queueKey,
      }),
    ),
  };
}

const collections = new WeakMap<
  QueryClient,
  ReturnType<typeof createCollections>
>();

export function getCollections(queryClient: QueryClient) {
  let result = collections.get(queryClient);
  if (!result) {
    result = createCollections(queryClient);
    collections.set(queryClient, result);
  }
  return result;
}

export function useCollections() {
  return getCollections(useQueryClient());
}

const noop = () => {};
const subscribe = () => noop;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function useClientReady() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}

// DB row insertion order does not track response reordering after a refresh.
function responseOrder<T extends object>(
  rows: T[],
  original: T[],
  getKey: (row: T) => string,
) {
  const positions = new Map(original.map((row, index) => [getKey(row), index]));
  return [...rows]
    .sort(
      (a, b) =>
        (positions.get(getKey(a)) ?? original.length) -
        (positions.get(getKey(b)) ?? original.length),
    )
    .map(collectionRow);
}

export function collectionRow<T extends object>(row: T) {
  if (!hasVirtualProps(row)) return row;
  // Live query metadata must not leak into API mutation payloads.
  const {
    $synced: _synced,
    $origin: _origin,
    $key: _key,
    $collectionId: _collectionId,
    ...data
  } = row;
  return data;
}

export function useLibrary() {
  const collections = useCollections();
  const ready = useClientReady();
  const live = useLiveQuery({
    query: (q) => (ready ? q.from({ item: collections.library }) : undefined),
  });
  const query = useQuery({ ...libraryQuery, enabled: false });
  return {
    ...query,
    data:
      query.data && live.isReady && live.data
        ? {
            ...query.data,
            items: responseOrder(
              live.data,
              query.data.items,
              (item) => item.id,
            ),
          }
        : undefined,
    isPending: query.isPending || (!query.isError && !live.isReady),
  };
}

export function useInstances() {
  const collections = useCollections();
  const ready = useClientReady();
  const live = useLiveQuery({
    query: (q) => (ready ? q.from({ item: collections.instances }) : undefined),
  });
  const query = useQuery({ ...instancesQuery, enabled: false });
  return {
    ...query,
    data:
      query.data && live.isReady && live.data
        ? {
            ...query.data,
            instances: responseOrder(
              live.data,
              query.data.instances,
              (instance) => instance.id,
            ),
          }
        : undefined,
    isPending: query.isPending || (!query.isError && !live.isReady),
  };
}

export function useQueue(activeView = false) {
  const client = useQueryClient();
  useEffect(() => {
    if (activeView) return subscribeQueueView(client);
  }, [client, activeView]);
  const collections = useCollections();
  const ready = useClientReady();
  const live = useLiveQuery({
    query: (q) => (ready ? q.from({ item: collections.queue }) : undefined),
  });
  const query = useQuery({ ...queueQuery, enabled: false });
  return {
    ...query,
    data:
      query.data && live.isReady && live.data
        ? {
            ...query.data,
            items: responseOrder(live.data, query.data.items, queueKey),
          }
        : undefined,
    isPending: query.isPending || (!query.isError && !live.isReady),
  };
}

export function useSyncData() {
  const queryClient = useQueryClient();
  return async (
    scope: "library" | "queue" | "media" | "all",
    targets: readonly MediaTarget[] = [],
  ): Promise<void> => {
    if (scope === "all") {
      await queryClient.invalidateQueries();
      return;
    }
    const keys =
      scope === "media"
        ? [
            libraryQuery.queryKey,
            queueQuery.queryKey,
            ...targets.map((target) => [
              "episodes",
              target.instanceId,
              target.remoteId,
            ]),
          ]
        : [scope === "library" ? libraryQuery.queryKey : queueQuery.queryKey];
    await Promise.all(
      [...new Map(keys.map((key) => [JSON.stringify(key), key])).values()].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };
}
