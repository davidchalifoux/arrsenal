import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
  type Mock,
  mock,
  onTestFinished,
  spyOn,
} from "bun:test";
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
import type {
  InstanceSummary,
  LibraryResponse,
  MediaItem,
  MediaTarget,
  QueueItem,
} from "@/lib/types";
import { advanceTime } from "./timers";

mock.module("@/lib/client", () => ({ api: mock() }));
const { api } = await import("@/lib/client");
const {
  getCollections,
  useClientReady,
  useCollections,
  useInstances,
  useLibrary,
  useQueue,
  useSyncData,
} = await import("@/lib/collections");
const { calendarQuery, instancesQuery, libraryQuery, queueQuery } =
  await import("@/lib/queries");

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
  (
    api as Mock<(...args: Parameters<typeof api>) => ReturnType<typeof api>>
  ).mockReset();
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
  jest.useRealTimers();
  focusManager.setEventListener(() => undefined);
  focusManager.setFocused(undefined);
  mock.restore();
});

describe("collections", () => {
  it("does not start collections or fetch during server rendering, then loads on hydration", async () => {
    const { client, wrapper: Wrapper } = setup();
    (
      api as Mock<(...args: Parameters<typeof api>) => ReturnType<typeof api>>
    ).mockImplementation(async (path) => {
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
    const onRecoverableError = mock();
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
    expect(
      first.client.getQueryData<LibraryResponse>(libraryQuery.queryKey),
    ).toEqual({
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
    expect(client.getQueryData<LibraryResponse>(libraryQuery.queryKey)).toEqual(
      library,
    );
  });

  it("retains rows and metadata after a refresh fails, then unmounts without recovery", async () => {
    const runtimeError = mock();
    window.addEventListener("error", runtimeError);
    window.addEventListener("unhandledrejection", runtimeError);
    onTestFinished(() => {
      window.removeEventListener("error", runtimeError);
      window.removeEventListener("unhandledrejection", runtimeError);
    });
    spyOn(console, "error").mockImplementation(() => {});
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
    (
      api as Mock<(...args: Parameters<typeof api>) => ReturnType<typeof api>>
    ).mockReturnValue(request.promise);
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
    spyOn(console, "error").mockImplementation(() => {});
    const { client, wrapper } = setup();
    (
      api as Mock<(...args: Parameters<typeof api>) => ReturnType<typeof api>>
    ).mockRejectedValue(new Error("Initial failure"));
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
    spyOn(console, "error").mockImplementation(() => {});
    const { wrapper } = setup();
    const request = Promise.withResolvers<LibraryResponse>();
    (
      api as Mock<(...args: Parameters<typeof api>) => ReturnType<typeof api>>
    ).mockReturnValueOnce(request.promise);
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
    (
      api as Mock<(...args: Parameters<typeof api>) => ReturnType<typeof api>>
    ).mockResolvedValue({ items: [movie], errors: [] });
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
    const invalidate = spyOn(client, "invalidateQueries");
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

  it("shares cached data without interval polling and refreshes it on demand", async () => {
    jest.useFakeTimers();
    const { wrapper } = setup();
    let remaining = download.sizeleft;
    (
      api as Mock<(...args: Parameters<typeof api>) => ReturnType<typeof api>>
    ).mockImplementation(async (path) => {
      if (path === "/api/instances") return { instances: [instance] };
      if (path === "/api/library") return { items: [movie], errors: [] };
      if (path === "/api/queue") {
        return { items: [{ ...download, sizeleft: remaining }], errors: [] };
      }
      return { items: [], errors: [] };
    });
    const first = renderHook(
      () => ({
        library: useLibrary(),
        instances: useInstances(),
        queue: useQueue(),
        calendar: useQuery(calendarQuery("2026-09-01", "2026-09-30")),
        sync: useSyncData(),
      }),
      { wrapper },
    );
    const second = renderHook(useQueue, { wrapper });
    await act(() => advanceTime(1));
    expect(api).toHaveBeenCalledTimes(4);
    expect(first.result.current.queue.data?.items[0].sizeleft).toBe(remaining);
    expect(second.result.current.data?.items[0].sizeleft).toBe(remaining);
    await act(() => advanceTime(120_000));
    expect(api).toHaveBeenCalledTimes(4);

    remaining = 0;
    await act(() => first.result.current.sync("all"));
    await act(() => advanceTime(1));
    expect(first.result.current.queue.data?.items[0].sizeleft).toBe(0);
    expect(second.result.current.data?.items[0].sizeleft).toBe(0);
    expect(api).toHaveBeenCalledTimes(8);
    await act(() => advanceTime(120_000));
    expect(api).toHaveBeenCalledTimes(8);
  });

  it("retains queue rows through a total outage and replaces them on recovery", async () => {
    const { client, wrapper } = setup();
    (
      api as Mock<(...args: Parameters<typeof api>) => ReturnType<typeof api>>
    ).mockResolvedValue({
      items: [download],
      errors: [],
    });
    const { result } = renderHook(() => useQueue(), { wrapper });
    await waitFor(() => expect(result.current.data?.items).toEqual([download]));
    (
      api as Mock<(...args: Parameters<typeof api>) => ReturnType<typeof api>>
    ).mockRejectedValue(
      new Error("Unable to load the queue from any configured instance."),
    );
    await act(() => client.invalidateQueries({ queryKey: ["queue"] }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data?.items).toEqual([download]);
    (
      api as Mock<(...args: Parameters<typeof api>) => ReturnType<typeof api>>
    ).mockResolvedValue({ items: [], errors: [] });
    await act(() => client.invalidateQueries({ queryKey: ["queue"] }));
    await waitFor(() => expect(result.current.isError).toBe(false));
    expect(result.current.data?.items).toEqual([]);
  });
});
