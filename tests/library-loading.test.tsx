import { css } from "@styled-system/css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ImageProps } from "next/image";
import { type PropsWithChildren, useEffect } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LibraryError from "@/app/(library)/error";
import { LibraryLoading } from "@/components/library-loading";
import { api } from "@/lib/client";
import { getCollections } from "@/lib/collections";
import type { InstanceSummary, MediaItem, QueueItem } from "@/lib/types";

vi.mock("@/lib/client", () => ({ api: vi.fn() }));
vi.mock("next/image", () => ({
  // Whitelist DOM props so Next-only options such as preload never leak.
  default: ({
    src,
    alt,
    width,
    height,
    className,
    loading,
    fetchPriority,
  }: ImageProps) => (
    // biome-ignore lint/performance/noImgElement: DOM stand-in for next/image in tests.
    <img
      src={typeof src === "string" ? src : undefined}
      alt={alt}
      width={width}
      height={height}
      className={className}
      loading={loading}
      fetchPriority={fetchPriority}
    />
  ),
}));

const names = ["library", "instances", "queue"] as const;
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
const instance: InstanceSummary = {
  id: "a",
  name: "A",
  kind: "radarr",
  url: "http://localhost",
  hasApiKey: true,
  connected: true,
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
const clients: QueryClient[] = [];

function setup(empty = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  const responses = {
    library: { items: empty ? [] : [movie], errors: [] },
    instances: { instances: empty ? [] : [instance] },
    queue: { items: empty ? [] : [download], errors: [] },
  };
  const requests = {
    library: Promise.withResolvers<typeof responses.library>(),
    instances: Promise.withResolvers<typeof responses.instances>(),
    queue: Promise.withResolvers<typeof responses.queue>(),
  };
  vi.mocked(api).mockImplementation((path) => {
    const name = names.find((name) => path === `/api/${name}`);
    if (!name) throw new Error(`Unexpected request: ${path}`);
    return requests[name].promise;
  });
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>
      <LibraryLoading>{children}</LibraryLoading>
    </QueryClientProvider>
  );
  const resolve = async (name: (typeof names)[number]) => {
    await act(async () => {
      if (name === "library") requests.library.resolve(responses.library);
      if (name === "instances") requests.instances.resolve(responses.instances);
      if (name === "queue") requests.queue.resolve(responses.queue);
    });
    await waitFor(() =>
      expect(client.getQueryState([name])?.status).toBe("success"),
    );
  };
  return { client, requests, responses, Wrapper, resolve };
}

function expectBlocked(child: HTMLElement, blocked: boolean) {
  const wrapper = child.parentElement;
  expect(wrapper?.hasAttribute("hidden")).toBe(blocked);
  expect(wrapper?.hasAttribute("inert")).toBe(blocked);
}

beforeEach(() => {
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
    await client.cancelQueries();
    client.clear();
  }
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("LibraryLoading", () => {
  it("mounts hidden, inert children while all three requests start in parallel and exposes the logo and status", async () => {
    const { client, Wrapper, resolve } = setup();
    const mounted = vi.fn();
    const unmounted = vi.fn();
    function Child() {
      useEffect(() => {
        mounted();
        return unmounted;
      }, []);
      return <button type="button">Library action</button>;
    }
    const { container } = render(<Child />, { wrapper: Wrapper });
    const child = screen.getByText("Library action");
    expect(mounted).toHaveBeenCalledTimes(1);
    expectBlocked(child, true);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(
      "Loading your library...",
    );
    expect(screen.getByText("ARRSENAL")).toBeTruthy();
    const logo = container.querySelector('img[src="/logo.svg"]');
    expect(logo?.getAttribute("alt")).toBe("");
    expect(logo?.getAttribute("width")).toBe("80");
    expect(logo?.getAttribute("height")).toBe("80");
    expect(logo?.getAttribute("loading")).toBe("eager");
    expect(logo?.getAttribute("fetchpriority")).toBe("high");
    expect(
      logo?.classList.contains(css({ _motionReduce: { animation: "none" } })),
    ).toBe(true);
    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
    expect(
      vi
        .mocked(api)
        .mock.calls.map(([path]) => path)
        .sort(),
    ).toEqual(names.map((name) => `/api/${name}`).sort());
    for (const name of names) {
      expect(client.getQueryState([name])).toMatchObject({
        status: "pending",
        fetchStatus: "fetching",
      });
    }
    for (const name of names) await resolve(name);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.getByRole("button")).toBe(child);
    expectBlocked(child, false);
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();
  });

  it.each(
    names,
  )("waits for %s when it is the final successful query", async (last) => {
    const { Wrapper, resolve } = setup();
    render(<div>Route content</div>, { wrapper: Wrapper });
    for (const name of names.filter((name) => name !== last)) {
      await resolve(name);
      expect(screen.getByRole("status")).toBeTruthy();
      expectBlocked(screen.getByText("Route content"), true);
    }
    await resolve(last);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expectBlocked(screen.getByText("Route content"), false);
  });

  it("dismisses after three empty successful responses", async () => {
    const { Wrapper, resolve } = setup(true);
    render(<div>Empty library</div>, { wrapper: Wrapper });
    for (const name of names) await resolve(name);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expectBlocked(screen.getByText("Empty library"), false);
  });

  it.each(
    names,
  )("dismisses on a terminal %s error while the other queries remain pending", async (failed) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, requests, Wrapper } = setup();
    render(<div>Route content</div>, { wrapper: Wrapper });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("status")).toBeTruthy();
    await act(async () =>
      requests[failed].reject(new Error("Connection failed")),
    );
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expectBlocked(screen.getByText("Route content"), false);
    expect(client.getQueryState([failed])?.status).toBe("error");
    for (const name of names.filter((name) => name !== failed)) {
      expect(client.getQueryState([name])).toMatchObject({
        status: "pending",
        fetchStatus: "fetching",
      });
    }
    expect(api).toHaveBeenCalledTimes(3);
  });

  it("never replays the splash during invalidation or route child changes once ready", async () => {
    const { client, Wrapper, resolve, responses } = setup();
    const view = render(<div key="library">Library route</div>, {
      wrapper: Wrapper,
    });
    for (const name of names) await resolve(name);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    const refresh = Promise.withResolvers<typeof responses.library>();
    vi.mocked(api).mockReturnValue(refresh.promise);
    let invalidating: Promise<void> | undefined;
    act(() => {
      invalidating = client.invalidateQueries({ queryKey: ["library"] });
    });
    await waitFor(() =>
      expect(client.getQueryState(["library"])?.fetchStatus).toBe("fetching"),
    );
    expect(screen.queryByRole("status")).toBeNull();
    expectBlocked(screen.getByText("Library route"), false);
    view.rerender(<div key="settings">Settings route</div>);
    expect(screen.queryByRole("status")).toBeNull();
    expectBlocked(screen.getByText("Settings route"), false);
    await act(async () => {
      refresh.resolve(responses.library);
      await invalidating;
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers Check connections at five seconds and dismisses on its settings link", async () => {
    vi.useFakeTimers();
    const { client, Wrapper } = setup();
    render(<div>Route content</div>, { wrapper: Wrapper });
    await act(() => vi.advanceTimersByTimeAsync(4999));
    expect(
      screen.queryByRole("link", { name: "Check connections" }),
    ).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(
      "Loading your library...",
    );
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByRole("status").textContent).toContain(
      "Still connecting",
    );
    const link = screen.getByRole("link", { name: "Check connections" });
    expect(link.getAttribute("href")).toBe("/settings/connections");
    // Keep jsdom from navigating; the real Link's React onClick still runs.
    link.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(link);
    expect(screen.queryByRole("status")).toBeNull();
    expectBlocked(screen.getByText("Route content"), false);
    for (const name of names)
      expect(client.getQueryState([name])?.status).toBe("pending");
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(
      screen.queryByRole("link", { name: "Check connections" }),
    ).toBeNull();
  });

  it("server-renders without fetching and hydrates without recoverable errors", async () => {
    const { client, Wrapper, resolve } = setup();
    const content = (
      <Wrapper>
        <div>Hydrated route</div>
      </Wrapper>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(content);
    expect(container.querySelector("output")?.textContent).toBe(
      "Loading your library...",
    );
    expect(container.querySelector("[hidden][inert]")?.textContent).toBe(
      "Hydrated route",
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api).not.toHaveBeenCalled();
    for (const collection of Object.values(getCollections(client)))
      expect(collection.status).toBe("idle");
    const onRecoverableError = vi.fn();
    const view = render(content, {
      container,
      hydrate: true,
      onRecoverableError,
    });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
    expect(view.getByRole("status")).toBeTruthy();
    for (const name of names) await resolve(name);
    await waitFor(() => expect(view.queryByRole("status")).toBeNull());
    expectBlocked(view.getByText("Hydrated route"), false);
    expect(onRecoverableError).not.toHaveBeenCalled();
  });

  it("lets the real library route error dismiss through context with queries still pending", async () => {
    const { client, Wrapper } = setup();
    const reset = vi.fn();
    const view = render(<div>Pending route</div>, { wrapper: Wrapper });
    expect(screen.getByRole("status")).toBeTruthy();
    view.rerender(<LibraryError reset={reset} />);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    const heading = screen.getByRole("heading", {
      name: "Unable to load this page",
    });
    expectBlocked(heading.parentElement as HTMLElement, false);
    for (const name of names)
      expect(client.getQueryState([name])?.status).toBe("pending");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
