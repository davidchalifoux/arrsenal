import { queryOptions } from "@tanstack/react-query";
import { api } from "./client";
import type { InstanceSummary, LibraryResponse, QueueResponse } from "./types";

export const libraryQuery = queryOptions({
  queryKey: ["library"],
  queryFn: ({ signal }) => api<LibraryResponse>("/api/library", { signal }),
  staleTime: 60_000,
  refetchInterval: 60_000,
});

export const instancesQuery = queryOptions({
  queryKey: ["instances"],
  queryFn: ({ signal }) =>
    api<{ instances: InstanceSummary[] }>("/api/instances", { signal }),
  staleTime: 60_000,
  refetchInterval: 60_000,
});

export const queueQuery = queryOptions({
  queryKey: ["queue"],
  queryFn: ({ signal }) => api<QueueResponse>("/api/queue", { signal }),
  staleTime: 10_000,
  refetchInterval: 15_000,
});
