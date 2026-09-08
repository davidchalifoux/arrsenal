import { queryOptions } from "@tanstack/react-query";
import { realtimeQuery } from "./realtime-query";
import type {
  CalendarResponse,
  InstanceSummary,
  LibraryResponse,
  QueueResponse,
} from "./types";

export const libraryQuery = queryOptions({
  queryKey: ["library"],
  queryFn: (context) => realtimeQuery<LibraryResponse>(context, "/api/library"),
  staleTime: 60_000,
});

export const instancesQuery = queryOptions({
  queryKey: ["instances"],
  queryFn: (context) =>
    realtimeQuery<{ instances: InstanceSummary[] }>(context, "/api/instances"),
  staleTime: 60_000,
});

export const queueQuery = queryOptions({
  queryKey: ["queue"],
  queryFn: (context) => realtimeQuery<QueueResponse>(context, "/api/queue"),
  staleTime: 10_000,
});

export const calendarQuery = (start: string, end: string) =>
  queryOptions({
    queryKey: ["calendar", start, end],
    queryFn: (context) =>
      realtimeQuery<CalendarResponse>(
        context,
        `/api/calendar?${new URLSearchParams({ start, end })}`,
      ),
    staleTime: 60_000,
  });
