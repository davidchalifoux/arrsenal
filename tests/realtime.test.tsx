import { afterEach, beforeEach, expect, it, jest, mock, spyOn } from "bun:test";
import {
  QueryClient,
  QueryClientProvider,
  useQueries,
  useQuery,
} from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { getCollections, useLibrary } from "@/lib/collections";
import { libraryQuery } from "@/lib/queries";
import type {
  EpisodesResponse,
  InstanceOptions,
  LibraryResponse,
  MediaItem,
} from "@/lib/types";
import { useRealtime } from "@/lib/use-realtime";
import { advanceTime } from "./timers";

class Stream extends EventTarget {
  static instances: Stream[] = [];
  closed = false;
  constructor(readonly url: string) {
    super();
    Stream.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data = "") {
    this.dispatchEvent(new MessageEvent(type, { data }));
  }
  invalidate(topics: string[], instanceId?: string, remoteId?: number) {
    this.emit("invalidate", JSON.stringify({ topics, instanceId, remoteId }));
  }
  snapshot(
    queryKey: unknown[],
    data: unknown,
    revision: number,
    epoch = "server-a",
  ) {
    this.emit(
      "snapshot",
      JSON.stringify({ queryKey, data, version: { epoch, revision } }),
    );
  }
}

function latestStream() {
  const stream = Stream.instances.at(-1);
  if (!stream) throw new Error("Expected a realtime subscription");
  return stream;
}

const originalStream = Object.getOwnPropertyDescriptor(
  globalThis,
  "EventSource",
);
const originalVisibility = Object.getOwnPropertyDescriptor(
  document,
  "visibilityState",
);
const clients: QueryClient[] = [];

function visible(value: boolean) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: value ? "visible" : "hidden",
  });
}

function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
      },
    },
  });
  clients.push(client);
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

async function tick(milliseconds = 300) {
  await act(() => advanceTime(milliseconds));
}

beforeEach(() => {
  jest.useFakeTimers();
  Stream.instances = [];
  spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Unexpected HTTP request"),
  );
  Object.defineProperty(globalThis, "EventSource", {
    configurable: true,
    writable: true,
    value: Stream,
  });
  visible(true);
});

afterEach(async () => {
  cleanup();
  for (const client of clients.splice(0)) {
    await Promise.all(
      Object.values(getCollections(client)).map((collection) =>
        collection.cleanup(),
      ),
    );
    client.clear();
  }
  jest.restoreAllMocks();
  jest.useRealTimers();
  if (originalStream)
    Object.defineProperty(globalThis, "EventSource", originalStream);
  else Reflect.deleteProperty(globalThis, "EventSource");
  if (originalVisibility)
    Object.defineProperty(document, "visibilityState", originalVisibility);
  else Reflect.deleteProperty(document, "visibilityState");
});

const movie: MediaItem = {
  id: "movie:1",
  kind: "movie",
  title: "Before",
  year: 2026,
  overview: "",
  poster: "",
  genres: [],
  added: "",
  status: "available",
  targets: [],
};

it("pushes core snapshots to mounted DB rows but ignores parameter snapshots without HTTP", async () => {
  const { client, wrapper } = setup();
  client.setQueryData<LibraryResponse>(["library"], {
    items: [movie],
    errors: [],
  });
  const fetcher = spyOn(globalThis, "fetch");
  const unexpected = mock(async () => {
    throw new Error("Unexpected read");
  });
  const episodes: EpisodesResponse = {
    instanceId: "a",
    instanceName: "Sonarr",
    remoteId: 1,
    seasons: [],
    episodes: [],
    errors: [],
  };
  const options: InstanceOptions = { profiles: [], rootFolders: [] };
  const calendarKey = ["calendar", "2026-09-01", "2026-10-01"];
  const { result } = renderHook(
    () => {
      useRealtime();
      return {
        library: useLibrary(),
        episodes: useQuery({
          queryKey: ["episodes", "a", 1],
          queryFn: unexpected,
          initialData: episodes,
        }),
        other: useQuery({
          queryKey: ["episodes", "b", 1],
          queryFn: unexpected,
          initialData: { ...episodes, instanceId: "b" },
        }),
        options: useQuery({
          queryKey: ["instance-options", "a"],
          queryFn: unexpected,
          initialData: options,
        }),
        calendar: useQuery({
          queryKey: calendarKey,
          queryFn: unexpected,
          initialData: { items: [], errors: [], instanceCount: 0 },
        }),
      };
    },
    { wrapper },
  );
  expect(result.current.episodes.data).toEqual(episodes);
  expect(result.current.other.data?.instanceId).toBe("b");
  expect(result.current.options.data).toEqual(options);
  expect(result.current.calendar.data?.instanceCount).toBe(0);
  act(() => {
    latestStream().emit("open");
  });
  await tick();
  expect(result.current.library.data?.items[0].title).toBe("Before");
  const stream = latestStream();
  act(() => {
    stream.snapshot(
      ["library"],
      { items: [{ ...movie, title: "After" }], errors: [] },
      1,
    );
    stream.snapshot(["episodes", "a", 1], { ...episodes, instanceId: "b" }, 99);
    stream.snapshot(
      ["episodes", "a", 1],
      { ...episodes, seasons: [{ seasonNumber: 1, monitored: true }] },
      2,
    );
    stream.snapshot(
      ["instance-options", "a"],
      { ...options, profiles: [{ id: 1, name: "HD" }] },
      3,
    );
    stream.snapshot(
      calendarKey,
      { items: [], errors: [], instanceCount: 2 },
      4,
    );
    stream.snapshot(["queue"], { items: [], errors: [] }, 5);
  });
  await tick();
  expect(result.current.library.data?.items[0].title).toBe("After");
  expect(result.current.episodes.data?.seasons).toEqual([]);
  expect(result.current.other.data?.seasons).toEqual([]);
  expect(result.current.options.data?.profiles).toEqual([]);
  expect(result.current.calendar.data?.instanceCount).toBe(0);
  act(() => stream.snapshot(["library"], { items: [], errors: [] }, 6));
  await tick();
  expect(result.current.library.data?.items).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
  expect(unexpected).not.toHaveBeenCalled();
  expect(client.getQueryState(["queue"])).toBeUndefined();
});

it("cancels older HTTP work and rejects older snapshots and later stale REST responses", async () => {
  const { wrapper } = setup();
  const first = Promise.withResolvers<Response>();
  const fetcher = spyOn(globalThis, "fetch");
  const envelope = (title: string, revision: number) => ({
    items: [{ ...movie, title }],
    errors: [],
    _realtime: { epoch: "server-a", revision },
  });
  const { result } = renderHook(
    () => {
      useRealtime();
      return useQuery({
        ...libraryQuery,
        staleTime: Infinity,
        initialData: envelope("Before", 1),
      });
    },
    { wrapper },
  );
  expect(result.current.data?.items[0].title).toBe("Before");
  fetcher.mockClear();
  fetcher.mockImplementationOnce(
    Object.assign(() => first.promise, { preconnect: fetch.preconnect }),
  );
  let request: Promise<unknown> | undefined;
  act(() => {
    request = result.current.refetch();
  });
  const signal = fetcher.mock.calls[0]?.[1]?.signal;
  const stream = latestStream();
  act(() => {
    stream.snapshot(["library"], envelope("Newer", 3), 3);
    stream.snapshot(["library"], envelope("Newest", 4), 4);
    stream.snapshot(["library"], envelope("Outdated snapshot", 2), 2);
  });
  await tick();
  expect(result.current.data?.items[0].title).toBe("Newest");
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    first.resolve(Response.json(envelope("Outdated HTTP", 1)));
    await request;
  });
  await tick();
  expect(result.current.data?.items[0].title).toBe("Newest");
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValueOnce(
    Response.json(envelope("Stale manual response", 3)),
  );
  await act(async () => {
    await result.current.refetch();
  });
  await tick();
  expect(result.current.data?.items[0].title).toBe("Newest");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("keeps successful rows on snapshot errors without retries and recovers only to newer data", async () => {
  const { wrapper } = setup();
  const pending = Promise.withResolvers<LibraryResponse>();
  const fetcher = mock(() => pending.promise);
  const { result } = renderHook(
    () => {
      useRealtime();
      return useQuery({
        queryKey: ["library"],
        queryFn: fetcher,
        initialData: { items: [movie], errors: [] },
      });
    },
    { wrapper },
  );
  expect(result.current.isError).toBe(false);
  expect(result.current.data?.items[0].title).toBe("Before");
  const stream = latestStream();
  act(() => {
    void result.current.refetch();
  });
  act(() =>
    stream.emit(
      "snapshot",
      JSON.stringify({
        queryKey: ["library"],
        version: { epoch: "server-a", revision: 3 },
        error: "Service unavailable",
      }),
    ),
  );
  await tick();
  expect(result.current.isError).toBe(true);
  expect(result.current.error?.message).toBe("Service unavailable");
  expect(result.current.data?.items).toEqual([movie]);
  act(() => stream.snapshot(["library"], { items: [], errors: [] }, 2));
  await act(async () => pending.resolve({ items: [], errors: [] }));
  await tick(1000);
  expect(result.current.isError).toBe(true);
  expect(result.current.data?.items).toEqual([movie]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  act(() => stream.snapshot(["library"], { items: [], errors: [] }, 4));
  await tick();
  expect(result.current.isSuccess).toBe(true);
  expect(result.current.error).toBeNull();
  expect(result.current.data?.items).toEqual([]);
});

it("keeps one fixed stream and inactive core caches live across changing active pages without HTTP", async () => {
  const { client, wrapper } = setup();
  client.setQueryData(["library"], { items: [movie], errors: [] });
  client.setQueryData(["queue"], { items: [], errors: [] });
  client.setQueryData(["instances"], { instances: [] });
  const fetcher = mock(async () => ({
    items: [],
    errors: [],
    instanceCount: 0,
  }));
  const key = ["calendar", "2026-09-01", "2026-10-01"];
  const { result, rerender } = renderHook(
    ({ enabled, remoteId }) => {
      useRealtime();
      useQuery({
        queryKey: ["episodes", "a", remoteId],
        enabled,
        queryFn: fetcher,
        initialData: { items: [], errors: [], instanceCount: 0 },
      });
      return useQuery({
        queryKey: key,
        enabled,
        queryFn: fetcher,
        initialData: { items: [], errors: [], instanceCount: 0 },
      });
    },
    { wrapper, initialProps: { enabled: false, remoteId: 1 } },
  );
  expect(result.current.data?.instanceCount).toBe(0);
  const stream = latestStream();
  act(() => {
    stream.emit("open");
  });
  await tick();
  expect(stream.url).toBe("/api/events");
  rerender({ enabled: true, remoteId: 1 });
  rerender({ enabled: false, remoteId: 2 });
  rerender({ enabled: true, remoteId: 3 });
  await tick();
  expect(Stream.instances).toEqual([stream]);
  act(() => {
    stream.snapshot(["library"], { items: [], errors: [] }, 1);
    stream.snapshot(
      ["queue"],
      {
        items: [],
        errors: [
          { instanceId: "a", instanceName: "A", message: "Unavailable" },
        ],
      },
      2,
    );
    stream.snapshot(["instances"], { instances: [] }, 3);
    stream.snapshot(key, { items: [], errors: [], instanceCount: 2 }, 4);
  });
  await tick();
  expect(client.getQueryData<LibraryResponse>(["library"])?.items).toEqual([]);
  expect(
    client.getQueryData<{ errors: unknown[] }>(["queue"])?.errors,
  ).toHaveLength(1);
  expect(
    client.getQueryData<{ _realtime: unknown }>(["instances"])?._realtime,
  ).toEqual({ epoch: "server-a", revision: 3 });
  expect(result.current.data?.instanceCount).toBe(0);
  rerender({ enabled: false, remoteId: 3 });
  act(() =>
    stream.snapshot(key, { items: [], errors: [], instanceCount: 9 }, 5),
  );
  await tick();
  expect(result.current.data?.instanceCount).toBe(0);
  expect(Stream.instances).toEqual([stream]);
  expect(stream.closed).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("coalesces scoped page hints, refetches only active matches, and only stales inactive caches", async () => {
  const { client, wrapper } = setup();
  const episode = mock(async () => "updated episode");
  const otherSeries = mock(async () => "updated other series");
  const otherInstance = mock(async () => "updated other instance");
  const options = mock(async () => "updated options");
  const otherOptions = mock(async () => "updated other options");
  const september = mock(async () => "updated September");
  const october = mock(async () => "updated October");
  const disabled = mock(async () => "updated disabled episode");
  const inactiveCalendar = ["calendar", "2026-11-01", "2026-12-01"];
  const inactiveEpisode = ["episodes", "a", 3];
  client.setQueryData(inactiveCalendar, "cached calendar");
  client.setQueryData(inactiveEpisode, "cached episode");
  const queries = [
    { queryKey: ["episodes", "a", 1], queryFn: episode },
    { queryKey: ["episodes", "a", 2], queryFn: otherSeries },
    { queryKey: ["episodes", "b", 1], queryFn: otherInstance },
    { queryKey: ["instance-options", "a"], queryFn: options },
    { queryKey: ["instance-options", "b"], queryFn: otherOptions },
    {
      queryKey: ["calendar", "2026-09-01", "2026-10-01"],
      queryFn: september,
    },
    {
      queryKey: ["calendar", "2026-10-01", "2026-11-01"],
      queryFn: october,
    },
    { queryKey: ["episodes", "a", 4], queryFn: disabled, enabled: false },
  ];
  const { result } = renderHook(
    () => {
      useRealtime();
      return useQueries({
        queries: queries.map((query) => ({ ...query, initialData: "cached" })),
      });
    },
    { wrapper },
  );
  expect(result.current.map((query) => query.data)).toEqual(
    queries.map(() => "cached"),
  );
  const stream = latestStream();
  act(() => {
    stream.invalidate(["episodes", "calendar", "options"], "a", 1);
    stream.invalidate(["episodes", "calendar", "options"], "a", 1);
  });
  expect(client.getQueryState(inactiveCalendar)?.isInvalidated).toBe(true);
  expect(client.getQueryState(inactiveEpisode)?.isInvalidated).toBe(false);
  expect(client.getQueryState(["episodes", "a", 2])?.isInvalidated).toBe(false);
  expect(client.getQueryState(["episodes", "b", 1])?.isInvalidated).toBe(false);
  expect(client.getQueryState(["instance-options", "b"])?.isInvalidated).toBe(
    false,
  );
  await tick(249);
  expect(episode).not.toHaveBeenCalled();
  expect(options).not.toHaveBeenCalled();
  expect(september).not.toHaveBeenCalled();
  expect(october).not.toHaveBeenCalled();
  await tick(10);
  expect(result.current.map((query) => query.data)).toEqual([
    "updated episode",
    "cached",
    "cached",
    "updated options",
    "cached",
    "updated September",
    "updated October",
    "cached",
  ]);
  expect(episode).toHaveBeenCalledTimes(1);
  expect(options).toHaveBeenCalledTimes(1);
  expect(september).toHaveBeenCalledTimes(1);
  expect(october).toHaveBeenCalledTimes(1);
  expect(otherSeries).not.toHaveBeenCalled();
  expect(otherInstance).not.toHaveBeenCalled();
  expect(otherOptions).not.toHaveBeenCalled();
  expect(disabled).not.toHaveBeenCalled();
  expect(client.getQueryData<string>(inactiveCalendar)).toBe("cached calendar");
  act(() => stream.invalidate(["episodes"], "a"));
  expect(client.getQueryState(inactiveEpisode)?.isInvalidated).toBe(true);
  expect(client.getQueryState(["episodes", "a", 4])?.isInvalidated).toBe(true);
  await tick();
  expect(result.current[1].data).toBe("updated other series");
  expect(episode).toHaveBeenCalledTimes(2);
  expect(otherSeries).toHaveBeenCalledTimes(1);
  expect(otherInstance).not.toHaveBeenCalled();
  expect(disabled).not.toHaveBeenCalled();
  expect(client.getQueryData<string>(inactiveEpisode)).toBe("cached episode");
  act(() => stream.invalidate(["episodes"], "a", 99));
  await tick(1000);
  expect(client.getQueryState(["episodes", "a", 99])).toBeUndefined();
  expect(episode).toHaveBeenCalledTimes(2);
  expect(otherSeries).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
  expect(Stream.instances).toEqual([stream]);
});

it("performs exactly one trailing page refetch for a burst arriving during an in-flight read", async () => {
  const { wrapper } = setup();
  const first = Promise.withResolvers<string>();
  const trailing = Promise.withResolvers<string>();
  const fetcher = mock(() => trailing.promise).mockImplementationOnce(
    () => first.promise,
  );
  const { result } = renderHook(
    () => {
      useRealtime();
      return useQuery({
        queryKey: ["episodes", "a", 1],
        queryFn: fetcher,
        initialData: "before",
      });
    },
    { wrapper },
  );
  expect(result.current.data).toBe("before");
  const stream = latestStream();
  act(() => stream.invalidate(["episodes"], "a", 1));
  await tick(250);
  expect(fetcher).toHaveBeenCalledTimes(1);
  act(() => {
    stream.invalidate(["episodes"], "a", 1);
    stream.invalidate(["episodes"], "a", 1);
  });
  await tick(1000);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => first.resolve("intermediate"));
  await tick(249);
  expect(result.current.data).toBe("intermediate");
  expect(fetcher).toHaveBeenCalledTimes(1);
  await tick(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => trailing.resolve("after"));
  await tick(1000);
  expect(result.current.data).toBe("after");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("does not refetch a page deactivated while its hint is coalescing", async () => {
  const { client, wrapper } = setup();
  const fetcher = mock(async () => "updated");
  const key = ["episodes", "a", 1];
  const { result, rerender } = renderHook(
    ({ enabled }) => {
      useRealtime();
      return useQuery({
        queryKey: key,
        queryFn: fetcher,
        initialData: "cached",
        enabled,
      });
    },
    { wrapper, initialProps: { enabled: true } },
  );
  expect(result.current.data).toBe("cached");
  const stream = latestStream();
  act(() => stream.invalidate(["episodes"], "a", 1));
  rerender({ enabled: false });
  await tick(1000);
  expect(result.current.data).toBe("cached");
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(Stream.instances).toEqual([stream]);
});

it("updates hidden caches without HTTP and resynchronizes through REST on tab return", async () => {
  const { wrapper } = setup();
  const fetcher = mock(async () => ({ items: [movie], errors: [] }));
  const { result } = renderHook(
    () => {
      useRealtime();
      return useQuery({
        queryKey: ["library"],
        queryFn: fetcher,
        initialData: { items: [movie], errors: [] },
      });
    },
    { wrapper },
  );
  expect(result.current.data?.items).toEqual([movie]);
  visible(false);
  act(() => {
    latestStream().snapshot(["library"], { items: [], errors: [] }, 1);
    window.dispatchEvent(new Event("focus"));
  });
  await tick();
  expect(result.current.data?.items).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
  visible(true);
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await tick();
  expect(result.current.data?.items).toEqual([movie]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("refreshes a missed update on reconnect while leaving inactive data stale without fetching", async () => {
  const { client, wrapper } = setup();
  client.setQueryData(["episodes", "unmounted", 1], "cached");
  const fetcher = mock(async () => "reconnected");
  const { result } = renderHook(
    () => {
      useRealtime();
      return useQuery({
        queryKey: ["calendar", "2026-09-01", "2026-10-01"],
        queryFn: fetcher,
        initialData: "old",
      });
    },
    { wrapper },
  );
  expect(result.current.data).toBe("old");
  act(() => {
    Stream.instances[0].emit("open");
    Stream.instances[0].emit("error");
    Stream.instances[0].emit("open");
  });
  await tick();
  expect(result.current.data).toBe("reconnected");
  expect(
    client.getQueryState(["episodes", "unmounted", 1])?.isInvalidated,
  ).toBe(true);
  expect(client.getQueryData<string>(["episodes", "unmounted", 1])).toBe(
    "cached",
  );
  expect(client.getQueryState(["library"])).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
  expect(Stream.instances).toHaveLength(1);
  expect(Stream.instances[0].closed).toBe(false);
});

it("accepts a new server epoch after reconnect and rejects late records from the retired epoch", async () => {
  const { wrapper } = setup();
  const fetcher = mock(async () => ({
    items: [movie],
    errors: [],
    _realtime: { epoch: "server-b", revision: 1 },
  }));
  const { result } = renderHook(
    () => {
      useRealtime();
      return useQuery({
        queryKey: ["library"],
        queryFn: fetcher,
        initialData: {
          items: [movie],
          errors: [],
          _realtime: { epoch: "server-a", revision: 100 },
        },
      });
    },
    { wrapper },
  );
  expect(result.current.data?.items).toEqual([movie]);
  const stream = latestStream();
  act(() => {
    stream.emit("open");
    stream.snapshot(["library"], { items: [], errors: [] }, 101);
  });
  await tick();
  expect(result.current.data?.items).toEqual([]);
  act(() => {
    stream.emit("error");
    stream.emit("open");
  });
  await tick();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result.current.data?.items).toEqual([movie]);
  act(() => {
    stream.snapshot(["library"], { items: [], errors: [] }, 2, "server-b");
    stream.snapshot(
      ["library"],
      { items: [movie], errors: [] },
      1000,
      "server-a",
    );
  });
  await tick();
  expect(result.current.data?.items).toEqual([]);
  expect(result.current.data?._realtime).toEqual({
    epoch: "server-b",
    revision: 2,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("ignores malformed hints and shuts down timers and listeners on auth loss or unmount", async () => {
  const { wrapper } = setup();
  const fetcher = mock(async () => "new");
  const { result } = renderHook(
    () =>
      useQuery({ queryKey: ["queue"], queryFn: fetcher, initialData: "old" }),
    { wrapper },
  );
  const { unmount } = renderHook(useRealtime, { wrapper });
  expect(result.current.data).toBe("old");
  const stream = Stream.instances[0];
  expect(stream.url).toBe("/api/events");
  act(() => {
    stream.emit("invalidate", "not json");
    stream.emit("snapshot", "not json");
    stream.snapshot(["queue"], { items: "not records", errors: [] }, 1);
    stream.invalidate(["unknown"]);
    stream.emit(
      "invalidate",
      JSON.stringify({ topics: ["queue"], instanceId: 42 }),
    );
    stream.emit("unrelated", JSON.stringify({ topics: ["queue"] }));
  });
  await tick();
  expect(result.current.data).toBe("old");
  expect(fetcher).not.toHaveBeenCalled();
  act(() => {
    stream.invalidate(["queue"]);
    stream.snapshot(["queue"], { items: [], errors: [] }, 2);
    stream.emit("auth-required");
    stream.emit("open");
    stream.invalidate(["queue"]);
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await tick();
  expect(stream.closed).toBe(true);
  expect(result.current.data).toBe("old");
  expect(fetcher).not.toHaveBeenCalled();
  unmount();
  const next = renderHook(useRealtime, { wrapper });
  const nextStream = Stream.instances[1];
  act(() => nextStream.invalidate(["queue"]));
  next.unmount();
  await tick();
  expect(nextStream.closed).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
});

it("tracks transport failures separately and replaces upstream status snapshots on recovery", () => {
  const { wrapper } = setup();
  const { result } = renderHook(useRealtime, { wrapper });
  const stream = Stream.instances[0];
  expect(result.current.connection).toBe("connecting");
  act(() => {
    stream.emit("open");
    stream.emit(
      "status",
      JSON.stringify({
        instances: [
          { instanceId: "a", status: "disconnected" },
          { instanceId: "b", status: "disconnected" },
        ],
      }),
    );
  });
  expect(result.current.connection).toBe("connected");
  expect(result.current.instances).toEqual([
    { instanceId: "a", status: "disconnected" },
    { instanceId: "b", status: "disconnected" },
  ]);
  act(() => stream.emit("error"));
  expect(result.current.connection).toBe("disconnected");
  expect(stream.closed).toBe(false);
  act(() => stream.emit("open"));
  expect(result.current.connection).toBe("connected");
  expect(
    result.current.instances.every(
      (instance) => instance.status === "disconnected",
    ),
  ).toBe(true);

  act(() =>
    stream.emit(
      "status",
      JSON.stringify({
        instances: [
          { instanceId: "a", status: "connected" },
          { instanceId: "b", status: "disconnected" },
        ],
      }),
    ),
  );
  expect(result.current.instances).toEqual([
    { instanceId: "a", status: "connected" },
    { instanceId: "b", status: "disconnected" },
  ]);
  act(() =>
    stream.emit(
      "status",
      JSON.stringify({
        instances: [{ instanceId: "a", status: "connected" }],
      }),
    ),
  );
  expect(result.current.instances).toEqual([
    { instanceId: "a", status: "connected" },
  ]);
  act(() => stream.emit("error"));
  expect(result.current.connection).toBe("disconnected");
  expect(result.current.instances).toEqual([
    { instanceId: "a", status: "connected" },
  ]);
  act(() => stream.emit("status", JSON.stringify({ instances: [] })));
  expect(result.current.instances).toEqual([]);
  expect(result.current.connection).toBe("disconnected");
});

it("retains the last valid status when snapshots are malformed and stops on auth loss", () => {
  const { wrapper } = setup();
  const { result, unmount } = renderHook(useRealtime, { wrapper });
  const stream = Stream.instances[0];
  act(() => {
    stream.emit("open");
    stream.emit(
      "status",
      JSON.stringify({
        instances: [{ instanceId: "a", status: "disconnected" }],
      }),
    );
  });
  act(() => {
    stream.emit("status", "not json");
    stream.emit(
      "status",
      JSON.stringify({
        instances: [{ instanceId: "a", status: "unknown" }],
      }),
    );
    stream.emit(
      "status",
      JSON.stringify({
        instances: [{ instanceId: 123, status: "connected" }],
      }),
    );
    stream.emit("status", JSON.stringify({ instances: null }));
  });
  expect(result.current.instances).toEqual([
    { instanceId: "a", status: "disconnected" },
  ]);
  act(() => stream.emit("auth-required"));
  expect(result.current.connection).toBe("disconnected");
  expect(stream.closed).toBe(true);
  act(() => {
    stream.emit("open");
    stream.emit("status", JSON.stringify({ instances: [] }));
  });
  expect(result.current.connection).toBe("disconnected");
  expect(result.current.instances).toEqual([
    { instanceId: "a", status: "disconnected" },
  ]);
  unmount();

  const next = renderHook(useRealtime, { wrapper });
  const nextStream = Stream.instances[1];
  next.unmount();
  act(() => {
    nextStream.emit("open");
    nextStream.emit("error");
    nextStream.emit("status", JSON.stringify({ instances: [] }));
    nextStream.emit("auth-required");
  });
  expect(nextStream.closed).toBe(true);
  expect(next.result.current.connection).toBe("connecting");
});

it("reports unsupported EventSource without starting a stream", () => {
  Object.defineProperty(globalThis, "EventSource", {
    configurable: true,
    value: undefined,
  });
  const { wrapper } = setup();
  const { result } = renderHook(useRealtime, { wrapper });
  expect(result.current.connection).toBe("disconnected");
  expect(Stream.instances).toEqual([]);
});
