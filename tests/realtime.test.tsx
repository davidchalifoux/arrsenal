import { afterEach, beforeEach, expect, it, jest, mock, spyOn } from "bun:test";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { getCollections, useLibrary } from "@/lib/collections";
import type { LibraryResponse, MediaItem } from "@/lib/types";
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
  invalidate(topics: string[], instanceId?: string) {
    this.emit("invalidate", JSON.stringify({ topics, instanceId }));
  }
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

it("updates mounted DB rows and only the affected instance's episodes and options", async () => {
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
  const { client, wrapper } = setup();
  client.setQueryData<LibraryResponse>(["library"], {
    items: [movie],
    errors: [],
  });
  const fetcher = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ items: [{ ...movie, title: "After" }], errors: [] }),
  );
  const episodesA = mock(async () => "new episodes");
  const episodesB = mock(async () => "wrong instance");
  const optionsA = mock(async () => "new options");
  const optionsB = mock(async () => "wrong options");
  const { result } = renderHook(
    () => {
      useRealtime();
      return {
        library: useLibrary(),
        a: useQuery({
          queryKey: ["episodes", "a", 1],
          queryFn: episodesA,
          initialData: "old",
        }),
        b: useQuery({
          queryKey: ["episodes", "b", 1],
          queryFn: episodesB,
          initialData: "old",
        }),
        optionsA: useQuery({
          queryKey: ["instance-options", "a"],
          queryFn: optionsA,
          initialData: "old",
        }),
        optionsB: useQuery({
          queryKey: ["instance-options", "b"],
          queryFn: optionsB,
          initialData: "old",
        }),
      };
    },
    { wrapper },
  );
  await tick(10);
  expect(result.current.library.data?.items[0].title).toBe("Before");
  act(() => {
    Stream.instances[0].invalidate(
      ["library", "episodes", "options", "queue", "calendar"],
      "a",
    );
    Stream.instances[0].invalidate(["library", "episodes"], "a");
  });
  await tick();
  expect(result.current.library.data?.items[0].title).toBe("After");
  expect(result.current.a.data).toBe("new episodes");
  expect(result.current.optionsA.data).toBe("new options");
  expect(result.current.b.data).toBe("old");
  expect(result.current.optionsB.data).toBe("old");
  expect(episodesB).not.toHaveBeenCalled();
  expect(optionsB).not.toHaveBeenCalled();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(episodesA).toHaveBeenCalledTimes(1);
  expect(client.getQueryState(["queue"])).toBeUndefined();
  expect(client.getQueryCache().findAll({ queryKey: ["calendar"] })).toEqual(
    [],
  );
});

it("coalesces bursts without canceling a fetch and performs a trailing refresh", async () => {
  const { wrapper } = setup();
  const first = Promise.withResolvers<string>();
  let signal: AbortSignal | undefined;
  const fetcher = mock(({ signal: nextSignal }: { signal: AbortSignal }) => {
    signal = nextSignal;
    return first.promise;
  })
    .mockImplementationOnce(({ signal: nextSignal }) => {
      signal = nextSignal;
      return first.promise;
    })
    .mockImplementation(async () => "latest");
  const { result } = renderHook(
    () => {
      useRealtime();
      return useQuery({
        queryKey: ["queue"],
        queryFn: fetcher,
        initialData: "old",
      });
    },
    { wrapper },
  );
  act(() => Stream.instances[0].invalidate(["queue"]));
  await tick();
  expect(fetcher).toHaveBeenCalledTimes(1);
  act(() => {
    for (let i = 0; i < 20; i++) Stream.instances[0].invalidate(["queue"]);
  });
  await tick(600);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(signal?.aborted).toBe(false);
  await act(async () => first.resolve("outdated"));
  await tick();
  expect(result.current.data).toBe("latest");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("keeps hidden caches stale even after an older fetch settles and refreshes on return", async () => {
  const { client, wrapper } = setup();
  const pending = Promise.withResolvers<string>();
  const fetcher = mock(async () => "latest").mockImplementationOnce(
    () => pending.promise,
  );
  const { result } = renderHook(
    () => {
      useRealtime();
      return useQuery({
        queryKey: ["queue"],
        queryFn: fetcher,
        initialData: "old",
      });
    },
    { wrapper },
  );
  act(() => Stream.instances[0].invalidate(["queue"]));
  await tick();
  visible(false);
  act(() => Stream.instances[0].invalidate(["queue"]));
  await act(async () => pending.resolve("outdated"));
  await tick();
  expect(client.getQueryState(["queue"])?.isInvalidated).toBe(true);
  act(() => {
    for (let i = 0; i < 20; i++) Stream.instances[0].invalidate(["queue"]);
    window.dispatchEvent(new Event("focus"));
  });
  await tick(600);
  expect(fetcher).toHaveBeenCalledTimes(1);
  visible(true);
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });
  await tick();
  expect(result.current.data).toBe("latest");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("refreshes a missed update on reconnect while leaving inactive data stale without fetching", async () => {
  const { client, wrapper } = setup();
  client.setQueryData(["episodes", "unmounted", 1], "cached");
  const fetcher = mock(async () => "reconnected");
  const { result } = renderHook(
    () => {
      useRealtime();
      return useQuery({
        queryKey: ["calendar", "start", "end"],
        queryFn: fetcher,
        initialData: "old",
      });
    },
    { wrapper },
  );
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
  const stream = Stream.instances[0];
  expect(stream.url).toBe("/api/events");
  act(() => {
    stream.emit("invalidate", "not json");
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
    stream.emit("auth-required");
    stream.emit("open");
    stream.invalidate(["queue"]);
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await tick();
  expect(stream.closed).toBe(true);
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
