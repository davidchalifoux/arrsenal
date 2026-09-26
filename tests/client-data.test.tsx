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
  QueueItem,
} from "@/lib/types";
import { advanceTime } from "./timers";

mock.module("@/lib/client", () => ({ api: mock() }));
const { api } = await import("@/lib/client");
const {
  useClientReady,
  useInstances,
  useLibrary,
  useLibraryMedia,
  useQueue,
  useSyncData,
} = await import("@/lib/client-data");
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
    client.clear();
  }
  jest.useRealTimers();
  focusManager.setEventListener(() => undefined);
  focusManager.setFocused(undefined);
  mock.restore();
});

describe("client data", () => {
  it("does not fetch during server rendering, then loads on hydration", async () => {
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
    for (const key of [
      libraryQuery.queryKey,
      instancesQuery.queryKey,
      queueQuery.queryKey,
    ]) {
      expect(client.getQueryState(key)?.fetchStatus).toBe("idle");
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

  it("selects details from the shared response and updates selection when the route changes", async () => {
    const { client, wrapper } = setup();
    const other: MediaItem = { ...movie, id: "series:2", kind: "series" };
    client.setQueryData(libraryQuery.queryKey, {
      items: [movie, other],
      errors: [],
      loadingInstanceIds: ["slow"],
    });
    const { result, rerender } = renderHook(
      ({ id, kind }: { id: string; kind: MediaItem["kind"] }) => ({
        library: useLibrary(),
        detail: useLibraryMedia(id, kind),
      }),
      { wrapper, initialProps: { id: movie.id, kind: "movie" } },
    );
    expect(result.current.detail.data?.media).toBe(
      result.current.library.data?.items[0],
    );
    expect(result.current.detail.data?.loadingInstanceIds).toEqual(["slow"]);
    rerender({ id: other.id, kind: "series" });
    expect(result.current.detail.data?.media).toEqual(
      result.current.library.data?.items[1],
    );
    rerender({ id: other.id, kind: "movie" });
    expect(result.current.detail.data?.media).toBeUndefined();
    rerender({ id: movie.id, kind: "movie" });
    act(() =>
      client.setQueryData(libraryQuery.queryKey, {
        items: [{ ...movie, title: "Updated" }, other],
        errors: [serviceError],
      }),
    );
    await waitFor(() =>
      expect(result.current.detail.data?.media?.title).toBe("Updated"),
    );
    expect(result.current.detail.data?.errors).toEqual(
      result.current.library.data?.errors,
    );
    expect(result.current.detail.data?.loadingInstanceIds).toBeUndefined();
    act(() =>
      client.setQueryData(libraryQuery.queryKey, {
        items: [other],
        errors: [],
      }),
    );
    await waitFor(() =>
      expect(result.current.detail.data?.media).toBeUndefined(),
    );
    expect(api).not.toHaveBeenCalled();
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
      () => ({ library: { ...useLibrary() }, sync: useSyncData() }),
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
    expect(api).toHaveBeenCalledTimes(1);
    expect(runtimeError).not.toHaveBeenCalled();
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
});
