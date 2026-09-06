import {
  focusManager,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  act,
  cleanup,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/client";
import {
  getCollections,
  useClientReady,
  useCollections,
  useInstances,
  useLibrary,
  useQueue,
  useSyncData,
} from "@/lib/collections";
import { configurePollingFocus } from "@/lib/polling";
import { instancesQuery, libraryQuery, queueQuery } from "@/lib/queries";
import type {
  InstanceSummary,
  LibraryResponse,
  MediaItem,
  MediaTarget,
  QueueItem,
} from "@/lib/types";

vi.mock("@/lib/client", () => ({ api: vi.fn() }));

const movie: MediaItem = {
  id: "movie:1",
  kind: "movie",
  title: "Arrival",
  year: 2016,
  overview: "",
  poster: "",
  genres: [],
  added: "",
  status: "available",
  targets: [],
};
const download: QueueItem = {
  id: 1,
  instanceId: "a",
  instanceName: "A",
  title: "Arrival",
  mediaTitle: "Arrival",
  kind: "movie",
  quality: "HD",
  size: 100,
  sizeleft: 50,
  status: "downloading",
  warnings: [],
};
const instance: InstanceSummary = {
  id: "a",
  name: "A",
  kind: "radarr",
  url: "http://localhost",
  hasApiKey: true,
  connected: true,
};
const serviceError = { instanceId: "b", instanceName: "B", message: "Offline" };
const clients: QueryClient[] = [];

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  // Returning mockReset() would register the API mock as a Vitest cleanup hook.
  vi.mocked(api).mockReset();
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
  vi.useRealTimers();
  focusManager.setEventListener(() => undefined);
  focusManager.setFocused(undefined);
  vi.restoreAllMocks();
});

describe("collections", () => {
  it("does not start collections or fetch during server rendering, then loads on hydration", async () => {
    const { client, wrapper: Wrapper } = setup();
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === "/api/library") return { items: [movie], errors: [] };
      if (path === "/api/instances") return { instances: [instance] };
      if (path === "/api/queue") return { items: [download], errors: [] };
      throw new Error(`Unexpected request: ${path}`);
    });
    function Probe() {
      const ready = useClientReady();
      const library = useLibrary();
      const instances = useInstances();
      const queue = useQueue();
      return (
        <pre>
          {JSON.stringify({
            ready,
            pending: [library.isPending, instances.isPending, queue.isPending],
            data: [library.data, instances.data, queue.data],
          })}
        </pre>
      );
    }
    const content = (
      <Wrapper>
        <Probe />
      </Wrapper>
    );
    const html = renderToString(content);
    const container = document.createElement("div");
    container.innerHTML = html;
    expect(JSON.parse(container.textContent ?? "")).toEqual({
      ready: false,
      pending: [true, true, true],
      data: [null, null, null],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api).not.toHaveBeenCalled();
    for (const collection of Object.values(getCollections(client))) {
      expect(collection.status).toBe("idle");
    }
    const onRecoverableError = vi.fn();
    render(content, { container, hydrate: true, onRecoverableError });
    await waitFor(() =>
      expect(JSON.parse(container.textContent ?? "")).toEqual({
        ready: true,
        pending: [false, false, false],
        data: [
          { items: [movie], errors: [] },
          { instances: [instance] },
          { items: [download], errors: [] },
        ],
      }),
    );
    expect(api).toHaveBeenCalledTimes(3);
    expect(onRecoverableError).not.toHaveBeenCalled();
  });

  it("shares lazy collections within a QueryClient, never across clients", () => {
    const first = setup();
    const second = setup();
    const collections = getCollections(first.client);
    expect(getCollections(first.client)).toBe(collections);
    for (const name of ["library", "instances", "queue"] as const) {
      expect(collections[name]).not.toBe(getCollections(second.client)[name]);
      expect(collections[name].status).toBe("idle");
    }
    const { result } = renderHook(useCollections, { wrapper: first.wrapper });
    expect(result.current).toBe(collections);
    expect(api).not.toHaveBeenCalled();
  });

  it("hydrates isolated caches and syncs inserts, updates, deletes and response order", async () => {
    const first = setup();
    const second = setup();
    first.client.setQueryData(libraryQuery.queryKey, {
      items: [movie],
      errors: [serviceError],
    });
    second.client.setQueryData(libraryQuery.queryKey, {
      items: [],
      errors: [],
    });
    const a = renderHook(useLibrary, { wrapper: first.wrapper });
    const b = renderHook(useLibrary, { wrapper: second.wrapper });
    await waitFor(() => expect(a.result.current.data?.items).toEqual([movie]));
    expect(a.result.current.data?.errors).toEqual([serviceError]);
    const updated = { ...movie, title: "Zodiac" };
    const added = { ...movie, id: "movie:2", title: "Dune" };
    act(() =>
      first.client.setQueryData(libraryQuery.queryKey, {
        items: [added, updated],
        errors: [],
      }),
    );
    await waitFor(() =>
      expect(a.result.current.data?.items).toEqual([added, updated]),
    );
    act(() =>
      first.client.setQueryData(libraryQuery.queryKey, {
        items: [updated, added],
        errors: [],
      }),
    );
    await waitFor(() =>
      expect(a.result.current.data?.items).toEqual([updated, added]),
    );
    act(() =>
      first.client.setQueryData(libraryQuery.queryKey, {
        items: [added],
        errors: [],
      }),
    );
    await waitFor(() => expect(a.result.current.data?.items).toEqual([added]));
    expect(getCollections(first.client).library.has(movie.id)).toBe(false);
    expect(b.result.current.data?.items).toEqual([]);
    expect(first.client.getQueryData(libraryQuery.queryKey)).toEqual({
      items: [added],
      errors: [],
    });
    act(() =>
      first.client.setQueryData(libraryQuery.queryKey, {
        items: [added],
        errors: [serviceError],
      }),
    );
    await waitFor(() =>
      expect(a.result.current.data?.errors).toEqual([serviceError]),
    );
    expect(api).not.toHaveBeenCalled();
  });

  it("uses live DB rows rather than the envelope's row array", async () => {
    const { client, wrapper } = setup();
    client.setQueryData(libraryQuery.queryKey, { items: [movie], errors: [] });
    const { result } = renderHook(useLibrary, { wrapper });
    await waitFor(() => expect(result.current.data?.items).toEqual([movie]));
    expect(result.current.data?.items[0]).not.toBe(
      getCollections(client).library.get(movie.id),
    );
    act(() =>
      getCollections(client).library.utils.writeUpdate({
        id: movie.id,
        title: "Live title",
      }),
    );
    await waitFor(() =>
      expect(result.current.data?.items[0].title).toBe("Live title"),
    );
  });

  it("keeps equal queue IDs from different instances and preserves server order", async () => {
    const { client, wrapper } = setup();
    const other = { ...download, instanceId: "b" };
    client.setQueryData(queueQuery.queryKey, {
      items: [other, download],
      errors: [serviceError],
    });
    const { result } = renderHook(useQueue, { wrapper });
    await waitFor(() =>
      expect(result.current.data?.items).toEqual([other, download]),
    );
    expect(
      getCollections(client).queue.get(JSON.stringify(["a", 1])),
    ).toMatchObject(download);
    expect(
      getCollections(client).queue.get(JSON.stringify(["b", 1])),
    ).toMatchObject(other);
    act(() =>
      client.setQueryData(queueQuery.queryKey, {
        items: [download, other],
        errors: [],
      }),
    );
    await waitFor(() =>
      expect(result.current.data?.items).toEqual([download, other]),
    );
    act(() =>
      client.setQueryData(queueQuery.queryKey, { items: [other], errors: [] }),
    );
    await waitFor(() => expect(result.current.data?.items).toEqual([other]));
  });

  it("projects the instances envelope and syncs instance changes", async () => {
    const { client, wrapper } = setup();
    client.setQueryData(instancesQuery.queryKey, { instances: [instance] });
    const { result } = renderHook(useInstances, { wrapper });
    await waitFor(() =>
      expect(result.current.data).toEqual({ instances: [instance] }),
    );
    act(() => client.setQueryData(instancesQuery.queryKey, { instances: [] }));
    await waitFor(() => expect(result.current.data).toEqual({ instances: [] }));
  });

  it("keeps all hook envelopes safe to serialize without modifying DB rows", async () => {
    const { client, wrapper } = setup();
    const library = { items: [movie], errors: [serviceError] };
    const instances = { instances: [instance] };
    const queue = { items: [download], errors: [] };
    client.setQueryData(libraryQuery.queryKey, library);
    client.setQueryData(instancesQuery.queryKey, instances);
    client.setQueryData(queueQuery.queryKey, queue);
    const { result } = renderHook(
      () => ({
        library: useLibrary().data,
        instances: useInstances().data,
        queue: useQueue().data,
      }),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current).toEqual({ library, instances, queue }),
    );
    expect(JSON.parse(JSON.stringify(result.current))).toEqual({
      library,
      instances,
      queue,
    });
    expect(getCollections(client).library.get(movie.id)).toHaveProperty(
      "$key",
      movie.id,
    );
    expect(getCollections(client).instances.get(instance.id)).toHaveProperty(
      "$key",
      instance.id,
    );
    expect(
      getCollections(client).queue.get(
        JSON.stringify([download.instanceId, download.id]),
      ),
    ).toHaveProperty("$synced", true);
    expect(client.getQueryData(libraryQuery.queryKey)).toEqual(library);
  });

  it("retains rows and metadata after a refresh fails, then unmounts without recovery", async ({
    onTestFinished,
  }) => {
    const runtimeError = vi.fn();
    window.addEventListener("error", runtimeError);
    window.addEventListener("unhandledrejection", runtimeError);
    onTestFinished(() => {
      window.removeEventListener("error", runtimeError);
      window.removeEventListener("unhandledrejection", runtimeError);
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, wrapper } = setup();
    const envelope = { items: [movie], errors: [serviceError] };
    client.setQueryData(libraryQuery.queryKey, envelope);
    const { result, unmount } = renderHook(
      () => ({ library: useLibrary(), sync: useSyncData() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.library.data).toEqual(envelope));
    const updatedAt = result.current.library.dataUpdatedAt;
    const failure = new Error("Refresh failed");
    const request = Promise.withResolvers<LibraryResponse>();
    vi.mocked(api).mockReturnValue(request.promise);
    let syncing: Promise<void>;
    act(() => {
      syncing = result.current.sync("library");
    });
    await waitFor(() => expect(result.current.library.isFetching).toBe(true));
    expect(result.current.library.data).toEqual(envelope);
    expect(result.current.library.isPending).toBe(false);
    await act(async () => {
      request.reject(failure);
      await syncing;
    });
    await waitFor(() => expect(result.current.library.isError).toBe(true));
    expect(result.current.library.error?.message).toBe(failure.message);
    expect(result.current.library.isRefetchError).toBe(true);
    expect(result.current.library.isPending).toBe(false);
    expect(result.current.library.dataUpdatedAt).toBe(updatedAt);
    expect(result.current.library.data).toEqual(envelope);
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(client.getQueryState(libraryQuery.queryKey)?.status).toBe("error");
    expect(
      client
        .getQueryCache()
        .find({ queryKey: libraryQuery.queryKey })
        ?.getObserversCount(),
    ).toBe(0);
    await getCollections(client).library.cleanup();
    expect(api).toHaveBeenCalledTimes(1);
    expect(runtimeError).not.toHaveBeenCalled();
  });

  it("unmounts and cleans up after an unrecovered initial error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, wrapper } = setup();
    vi.mocked(api).mockRejectedValue(new Error("Initial failure"));
    const { result, unmount } = renderHook(useLibrary, { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isPending).toBe(false);
    unmount();
    await getCollections(client).library.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("keeps initial data undefined while loading, exposes failure, then recovers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { wrapper } = setup();
    const request = Promise.withResolvers<LibraryResponse>();
    vi.mocked(api).mockReturnValueOnce(request.promise);
    const states: {
      data: LibraryResponse | undefined;
      pending: boolean;
      error: boolean;
    }[] = [];
    const { result } = renderHook(
      () => {
        const library = useLibrary();
        states.push({
          data: library.data,
          pending: library.isPending,
          error: library.isError,
        });
        return { library, sync: useSyncData() };
      },
      { wrapper },
    );
    expect(result.current.library.data).toBeUndefined();
    expect(result.current.library.isPending).toBe(true);
    await act(async () => request.reject(new Error("Initial failure")));
    await waitFor(() => expect(result.current.library.isError).toBe(true));
    expect(result.current.library.data).toBeUndefined();
    expect(result.current.library.isPending).toBe(false);
    vi.mocked(api).mockResolvedValue({ items: [movie], errors: [] });
    await act(() => result.current.sync("library"));
    await waitFor(() =>
      expect(result.current.library.data?.items).toEqual([movie]),
    );
    expect(result.current.library.isError).toBe(false);
    expect(result.current.library.isPending).toBe(false);
    expect(
      states.some((state) => !state.data && !state.pending && !state.error),
    ).toBe(false);
  });

  it("centralizes scoped invalidation and deduplicates target episode keys", async () => {
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(useSyncData, { wrapper });
    const target: MediaTarget = {
      instanceId: "a",
      instanceName: "A",
      remoteId: 42,
      qualityProfileId: 1,
      qualityProfile: "HD",
      quality: "HD",
      status: "available",
      monitored: true,
      sizeOnDisk: 0,
    };
    await result.current("media", [target, target]);
    expect(invalidate.mock.calls).toEqual([
      [{ queryKey: libraryQuery.queryKey }],
      [{ queryKey: queueQuery.queryKey }],
      [{ queryKey: ["episodes", "a", 42] }],
    ]);
    invalidate.mockClear();
    await result.current("queue");
    expect(invalidate.mock.calls).toEqual([
      [{ queryKey: queueQuery.queryKey }],
    ]);
    invalidate.mockClear();
    await result.current("all");
    expect(invalidate.mock.calls).toEqual([[]]);
  });

  it("owns one polling observer for multiple subscribers and stops after unmount", async () => {
    vi.useFakeTimers();
    const { client, wrapper } = setup();
    vi.mocked(api).mockResolvedValue({ items: [download], errors: [] });
    const first = renderHook(useQueue, { wrapper });
    const second = renderHook(useQueue, { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(api).toHaveBeenCalledTimes(1);
    expect(first.result.current.data?.items).toEqual([download]);
    expect(second.result.current.data?.items).toEqual([download]);
    const observers = client
      .getQueryCache()
      .find({ queryKey: queueQuery.queryKey })?.observers;
    expect(
      observers?.filter((observer) => observer.options.enabled !== false),
    ).toHaveLength(1);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(api).toHaveBeenCalledTimes(2);
    first.unmount();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(api).toHaveBeenCalledTimes(3);
    second.unmount();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(api).toHaveBeenCalledTimes(3);
  });

  it("changes queue cadence immediately as active views mount and unmount without fetching", async () => {
    vi.useFakeTimers();
    const { client, wrapper } = setup();
    vi.mocked(api).mockResolvedValue({ items: [], errors: [] });
    renderHook(() => useQueue(), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(1));
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(api).toHaveBeenCalledTimes(1);
    const view = renderHook(() => useQueue(true), { wrapper });
    const secondView = renderHook(() => useQueue(true), { wrapper });
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(api).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(api).toHaveBeenCalledTimes(2);
    view.unmount();
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(api).toHaveBeenCalledTimes(3);
    secondView.unmount();
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(api).toHaveBeenCalledTimes(3);
    await act(() => vi.advanceTimersByTimeAsync(45_000));
    expect(api).toHaveBeenCalledTimes(4);
    expect(
      client
        .getQueryCache()
        .find({ queryKey: ["queue"] })
        ?.observers.filter((observer) => observer.options.enabled !== false),
    ).toHaveLength(1);
  });

  it("pauses collection and ordinary query polling on blur or hidden tabs and resumes on focus", async () => {
    vi.useFakeTimers();
    const focused = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    configurePollingFocus();
    const { client, wrapper } = setup();
    client.setDefaultOptions({
      queries: { retry: false, refetchOnWindowFocus: false },
    });
    vi.mocked(api).mockImplementation(async (path) =>
      path === "/api/instances" ? { instances: [] } : { items: [], errors: [] },
    );
    const episodes = vi.fn(async () => []);
    renderHook(
      () => {
        useLibrary();
        useInstances();
        useQueue(true);
        useQuery({
          queryKey: ["episodes"],
          queryFn: episodes,
          refetchInterval: 30_000,
        });
      },
      { wrapper },
    );
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(api).toHaveBeenCalledTimes(3);
    expect(episodes).toHaveBeenCalledTimes(1);
    focused.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("blur")));
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(api).toHaveBeenCalledTimes(3);
    expect(episodes).toHaveBeenCalledTimes(1);
    // Explicit reconciliation still works while polling is paused.
    await act(() => client.invalidateQueries({ queryKey: ["queue"] }));
    expect(api).toHaveBeenCalledTimes(4);
    focused.mockReturnValue(true);
    visibility.mockReturnValue("hidden");
    act(() => window.dispatchEvent(new Event("focus")));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(api).toHaveBeenCalledTimes(4);
    visibility.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(api).toHaveBeenCalledTimes(4);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(api).toHaveBeenCalledTimes(10);
    expect(episodes).toHaveBeenCalledTimes(3);
  });

  it("retains queue rows through a total outage and replaces them on recovery", async () => {
    const { client, wrapper } = setup();
    vi.mocked(api).mockResolvedValue({ items: [download], errors: [] });
    const { result } = renderHook(() => useQueue(), { wrapper });
    await waitFor(() => expect(result.current.data?.items).toEqual([download]));
    vi.mocked(api).mockRejectedValue(
      new Error("Unable to load the queue from any configured instance."),
    );
    await act(() => client.invalidateQueries({ queryKey: ["queue"] }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data?.items).toEqual([download]);
    vi.mocked(api).mockResolvedValue({ items: [], errors: [] });
    await act(() => client.invalidateQueries({ queryKey: ["queue"] }));
    await waitFor(() => expect(result.current.isError).toBe(false));
    expect(result.current.data?.items).toEqual([]);
  });
});
