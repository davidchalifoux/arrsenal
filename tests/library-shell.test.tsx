import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ComponentProps, PropsWithChildren } from "react";
import type { RealtimeConnection } from "@/lib/use-realtime";

const mocks = {
  pathname: "/",
  add: mock(),
  searchLibrary: mock(),
  queue: { data: { items: [] as unknown[] } },
  realtime: {
    connection: "connecting",
    instances: [],
  } as RealtimeConnection,
  instances: {
    data: {
      instances: [
        { id: "private-radarr-id", name: "Movies server" },
        { id: "private-sonarr-id", name: "Shows server" },
      ],
    },
  },
  sync: mock(async (_scope: string) => {}),
  notify: mock(),
};
mock.module("next/navigation", () => ({ usePathname: () => mocks.pathname }));
mock.module("next/link", () => ({
  default: ({ href, onClick, ...props }: ComponentProps<"a">) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    />
  ),
}));
mock.module("@/lib/collections", () => ({
  useQueue: () => mocks.queue,
  useInstances: () => mocks.instances,
  useSyncData: () => mocks.sync,
}));
mock.module("@/components/library-provider", () => ({
  useLibraryActions: () => mocks,
}));
const { LibraryShell } = await import("@/components/library-shell");

const navigationNames = ["Main navigation", "Mobile navigation"];
const destinations = [
  ["Home", "/"],
  ["Movies", "/movies"],
  ["Shows", "/shows"],
  ["Downloads", "/queue"],
  ["Calendar", "/calendar"],
];

let client: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  mock.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  mocks.realtime = { connection: "connecting", instances: [] };
  mocks.sync.mockImplementation(async () => {});
  mocks.pathname = "/";
  mocks.queue = { data: { items: [] } };
});
afterEach(() => {
  cleanup();
  client.clear();
});

function renderShell() {
  return render(
    <LibraryShell>
      <h1>Library content</h1>
    </LibraryShell>,
    { wrapper },
  );
}

it("places Settings after Calendar on desktop and keeps five mobile tabs", () => {
  renderShell();
  const header = screen.getByRole("banner");
  const settings = within(header).getAllByRole("link", { name: "Settings" });
  expect(settings).toHaveLength(2);
  for (const link of settings)
    expect(link.getAttribute("href")).toBe("/settings");
  expect(screen.getAllByRole("navigation")).toHaveLength(2);
  for (const name of navigationNames) {
    const nav = screen.getByRole("navigation", { name });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual(
      name === "Main navigation"
        ? [...destinations, ["Settings", "/settings"]]
        : destinations,
    );
  }
});

it("preserves the home link, skip link, and main content landmark", () => {
  renderShell();
  expect(
    screen.getByRole("link", { name: "Arrsenal home" }).getAttribute("href"),
  ).toBe("/");
  expect(
    screen.getByRole("link", { name: "Skip to content" }).getAttribute("href"),
  ).toBe(`#${screen.getByRole("main").id}`);
  expect(
    within(screen.getByRole("main")).getByRole("heading", {
      name: "Library content",
    }),
  ).toBeDefined();
});

it.each([
  ["/", "Home"],
  ["/movies", "Movies"],
  ["/movies/123", "Movies"],
  ["/shows", "Shows"],
  ["/shows/123/seasons/1", "Shows"],
  ["/queue", "Downloads"],
  ["/queue/123", "Downloads"],
  ["/calendar", "Calendar"],
  ["/calendar/upcoming", "Calendar"],
  ["/settings", "Settings"],
  ["/settings/connections", "Settings"],
  ["/settings/connections/123", "Settings"],
  ["/settings/unknown", "Settings"],
  ["/movies-extra", null],
  ["/shows-extra", null],
  ["/queue-extra", null],
  ["/calendar-extra", null],
  ["/settings-extra", null],
  ["/missing", null],
  ["/unknown", null],
])("marks only the matching parent route active on %s", (pathname, label) => {
  mocks.pathname = pathname;
  renderShell();
  for (const name of navigationNames) {
    expect(
      within(screen.getByRole("navigation", { name }))
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page")
        .map((link) => link.textContent),
    ).toEqual(
      label && (label !== "Settings" || name === "Main navigation")
        ? [label]
        : [],
    );
  }
  for (const link of screen.getAllByRole("link", { name: "Settings" })) {
    expect(link.getAttribute("aria-current")).toBe(
      label === "Settings" ? "page" : null,
    );
  }
});

it("updates active links and queue badges in both navigation regions on rerender", () => {
  const view = renderShell();
  for (const count of [0, 1, 2, 99, 100, 123, 0]) {
    mocks.pathname = count ? "/queue" : "/";
    mocks.queue.data.items = Array.from({ length: count }, () => ({}));
    view.rerender(<LibraryShell>Downloads content</LibraryShell>);
    for (const name of navigationNames) {
      const nav = within(screen.getByRole("navigation", { name }));
      const downloads = nav.getByRole("link", {
        name: count
          ? new RegExp(`^${count} downloads\\s*Downloads$`)
          : "Downloads",
      });
      expect(downloads.getAttribute("aria-current")).toBe(
        count ? "page" : null,
      );
      expect(
        nav.getByRole("link", { name: "Home" }).getAttribute("aria-current"),
      ).toBe(count ? null : "page");
      if (count) {
        expect(
          within(downloads).getByLabelText(`${count} downloads`).textContent,
        ).toBe(count > 99 ? "99+" : String(count));
      } else {
        expect(within(downloads).queryByLabelText(/downloads/)).toBeNull();
        expect(downloads.textContent).toBe("Downloads");
      }
    }
  }
});

it("keeps global Search and Add in the header and updates the Add seed with the route", () => {
  const view = renderShell();
  for (const [pathname, kind] of [
    ["/", "movie"],
    ["/shows", "series"],
    ["/shows/123", "series"],
    ["/shows-extra", "movie"],
    ["/movies/123", "movie"],
    ["/queue", "movie"],
    ["/calendar", "movie"],
    ["/settings/connections", "movie"],
  ]) {
    mock.clearAllMocks();
    mocks.pathname = pathname;
    view.rerender(<LibraryShell>Library content</LibraryShell>);
    const header = within(screen.getByRole("banner"));
    expect(screen.getAllByRole("button")).toHaveLength(2);
    fireEvent.click(header.getByRole("button", { name: "Add media" }));
    fireEvent.click(header.getByRole("button", { name: "Search library" }));
    expect(mocks.add).toHaveBeenCalledTimes(1);
    expect(mocks.add).toHaveBeenCalledWith(null, kind);
    expect(mocks.searchLibrary).toHaveBeenCalledTimes(1);
  }
});

it("keeps cached content visible and clears only recovered or removed instance warnings", () => {
  const view = renderShell();
  expect(screen.queryByRole("alert")).toBeNull();
  const content = screen.getByRole("heading", { name: "Library content" });
  mocks.realtime = {
    connection: "connected",
    instances: [
      { instanceId: "private-radarr-id", status: "disconnected" },
      { instanceId: "private-sonarr-id", status: "disconnected" },
    ],
  };
  const update = () =>
    view.rerender(
      <LibraryShell>
        <h1>Library content</h1>
      </LibraryShell>,
    );
  update();
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  const warning = screen.getByRole("alert");
  expect(warning.textContent).toContain("Movies server");
  expect(warning.textContent).toContain("Shows server");
  expect(warning.textContent).not.toContain("private-");
  expect(
    within(warning)
      .getByRole("link", { name: "Check instances" })
      .getAttribute("href"),
  ).toBe("/settings/connections");
  expect(screen.getByRole("heading", { name: "Library content" })).toBe(
    content,
  );

  mocks.realtime.instances = [
    { instanceId: "private-radarr-id", status: "connected" },
    { instanceId: "private-sonarr-id", status: "disconnected" },
  ];
  update();
  expect(screen.getByRole("alert").textContent).not.toContain("Movies server");
  expect(screen.getByRole("alert").textContent).toContain("Shows server");
  mocks.realtime.instances = [
    { instanceId: "private-radarr-id", status: "connected" },
  ];
  update();
  expect(screen.queryByRole("alert")).toBeNull();

  mocks.realtime.connection = "disconnected";
  update();
  expect(screen.getByRole("alert").textContent).toContain("browser");
  mocks.realtime.connection = "connected";
  update();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("refreshes in place while disconnected without clearing the warning", async () => {
  mocks.realtime.connection = "disconnected";
  let finish!: () => void;
  mocks.sync.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  renderShell();
  const content = screen.getByRole("heading", { name: "Library content" });
  fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
  const pending = screen.getByRole("button", { name: "Refreshing..." });
  expect(pending.hasAttribute("disabled")).toBe(true);
  fireEvent.click(pending);
  expect(mocks.sync).toHaveBeenCalledTimes(1);
  expect(mocks.sync).toHaveBeenCalledWith("all");
  await act(async () => finish());
  expect(
    screen
      .getByRole("button", { name: "Refresh data" })
      .hasAttribute("disabled"),
  ).toBe(false);
  expect(screen.getByRole("alert").textContent).toContain(
    "Live updates disconnected",
  );
  expect(screen.getByRole("heading", { name: "Library content" })).toBe(
    content,
  );
  expect(mocks.notify).not.toHaveBeenCalled();
});

it("reports failed refreshes without replacing cached content or dismissing the warning", async () => {
  mocks.realtime.connection = "disconnected";
  function CachedData() {
    const query = useQuery({
      queryKey: ["library"],
      queryFn: async () => {
        throw new Error("Service unavailable");
      },
      initialData: "Cached title",
    });
    return <p>{query.data}</p>;
  }
  mocks.sync.mockImplementation(async () => {
    await client.invalidateQueries();
  });
  render(
    <LibraryShell>
      <CachedData />
    </LibraryShell>,
    { wrapper },
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
  });
  expect(mocks.notify).toHaveBeenCalledWith(
    "Some data could not be refreshed. Please try again.",
    true,
  );
  expect(screen.getByText("Cached title")).toBeDefined();
  expect(screen.getByRole("alert").textContent).toContain(
    "Live updates disconnected",
  );
  expect(
    screen
      .getByRole("button", { name: "Refresh data" })
      .hasAttribute("disabled"),
  ).toBe(false);
});
