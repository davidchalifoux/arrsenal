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
import type { InstanceSummary } from "@/lib/types";
import type { RealtimeConnection } from "@/lib/use-realtime";

const mocks = {
  pathname: "/",
  add: mock(),
  searchLibrary: mock(),
  queue: { data: { items: [] as unknown[] } },
  library: {
    data: { items: [] as unknown[], errors: [] as unknown[] },
  },
  realtime: {
    connection: "connecting",
    instances: [],
  } as RealtimeConnection,
  instances: {
    data: {
      instances: [
        { id: "private-radarr-id", name: "Movies server" },
        { id: "private-sonarr-id", name: "Shows server" },
      ] as Partial<InstanceSummary>[],
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
mock.module("@/lib/client-data", () => ({
  useQueue: () => mocks.queue,
  useLibrary: () => mocks.library,
  useInstances: () => mocks.instances,
  useSyncData: () => mocks.sync,
}));
mock.module("@/components/library-provider", () => ({
  useLibraryActions: () => mocks,
  useOptionalLibraryActions: () => mocks,
}));
const { LibraryShell } = await import("@/components/library-shell");
const { ConnectionBanner } = await import("@/components/connection-banner");

const sections = [
  ["Library", "/"],
  ["Calendar", "/calendar"],
  ["Activity", "/queue"],
  ["Wanted", "/wanted"],
  ["Settings", "/settings"],
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
  mocks.library = { data: { items: [], errors: [] } };
  mocks.instances = {
    data: {
      instances: [
        { id: "private-radarr-id", name: "Movies server" },
        { id: "private-sonarr-id", name: "Shows server" },
      ],
    },
  };
});
afterEach(() => {
  cleanup();
  client.clear();
});

function renderShell() {
  return render(
    <LibraryShell>
      <ConnectionBanner />
      <h1>Library content</h1>
    </LibraryShell>,
    { wrapper },
  );
}

it("shows the active instance command in the header", () => {
  mocks.instances = {
    data: {
      instances: [
        {
          id: "private-sonarr-id",
          name: "Shows server",
          commands: [
            {
              id: 1,
              name: "SeasonSearch",
              commandName: "Season Search",
              message: "Processing release 2142/2773",
              status: "started",
            },
          ],
        },
      ],
    },
  };
  renderShell();
  expect(
    screen.getByText("Shows server · Processing release 2142/2773"),
  ).toBeTruthy();
  expect(
    screen.getByTitle("Shows server: Processing release 2142/2773"),
  ).toBeTruthy();
});

it("shows no task indicator when no command is active", () => {
  renderShell();
  expect(screen.queryByText(/Processing release/)).toBeNull();
});

it("lists the Arr-style sections in the sidebar and mobile tab bar", () => {
  mocks.pathname = "/calendar";
  renderShell();
  const main = within(
    screen.getByRole("navigation", { name: "Main navigation" }),
  );
  expect(
    main
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href")]),
  ).toEqual(sections);
  const mobile = within(
    screen.getByRole("navigation", { name: "Mobile navigation" }),
  );
  expect(
    mobile
      .getAllByRole("link")
      .map((link) => [link.textContent, link.getAttribute("href")]),
  ).toEqual(sections);
});

it("expands only the active section's sub-navigation", () => {
  mocks.pathname = "/movies/123";
  const view = renderShell();
  const main = () =>
    within(screen.getByRole("navigation", { name: "Main navigation" }));
  expect(
    main().getByRole("link", { name: "Movies" }).getAttribute("aria-current"),
  ).toBe("page");
  expect(
    main()
      .getByRole("link", { name: "All titles" })
      .getAttribute("aria-current"),
  ).toBeNull();
  expect(main().getByRole("button", { name: "Add new" })).toBeDefined();
  expect(main().queryByRole("link", { name: "Connections" })).toBeNull();
  fireEvent.click(main().getByRole("button", { name: "Add new" }));
  expect(mocks.add).toHaveBeenCalledTimes(1);

  mocks.pathname = "/settings";
  view.rerender(<LibraryShell>Settings</LibraryShell>);
  expect(main().queryByRole("link", { name: "Movies" })).toBeNull();
  expect(
    main()
      .getByRole("link", { name: "Connections" })
      .getAttribute("aria-current"),
  ).toBe("page");
  mocks.pathname = "/settings/security";
  view.rerender(<LibraryShell>Settings</LibraryShell>);
  expect(
    main().getByRole("link", { name: "Security" }).getAttribute("aria-current"),
  ).toBe("page");
  expect(
    main()
      .getByRole("link", { name: "Connections" })
      .getAttribute("aria-current"),
  ).toBeNull();
});

it("links each instance to its connection settings with a health label", () => {
  mocks.instances = {
    data: {
      instances: [
        { id: "a", name: "Movies HD", kind: "radarr", connected: true },
        { id: "b", name: "Shows 4K", kind: "sonarr", connected: false },
      ],
    },
  };
  renderShell();
  const list = within(
    screen.getByRole("list", { name: "Instance connections" }),
  );
  const healthy = list.getByRole("link", { name: /Movies HD, connected/ });
  const down = list.getByRole("link", { name: /Shows 4K, unreachable/ });
  expect(healthy.getAttribute("href")).toBe("/settings/connections");
  expect(down.getAttribute("href")).toBe("/settings/connections");
});

it("preserves the home link, skip link, and main content landmark", () => {
  renderShell();
  for (const link of screen.getAllByRole("link", { name: "Arrsenal home" }))
    expect(link.getAttribute("href")).toBe("/");
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
  ["/", "Library"],
  ["/movies", "Library"],
  ["/shows/123/seasons/1", "Library"],
  ["/queue", "Activity"],
  ["/queue/123", "Activity"],
  ["/calendar", "Calendar"],
  ["/calendar/upcoming", "Calendar"],
  ["/wanted", "Wanted"],
  ["/settings", "Settings"],
  ["/settings/connections/123", "Settings"],
  ["/movies-extra", null],
  ["/queue-extra", null],
  ["/calendar-extra", null],
  ["/settings-extra", null],
  ["/unknown", null],
])("marks only the matching mobile tab active on %s", (pathname, label) => {
  mocks.pathname = pathname;
  renderShell();
  expect(
    within(screen.getByRole("navigation", { name: "Mobile navigation" }))
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page")
      .map((link) => link.textContent),
  ).toEqual(label ? [label] : []);
});

it("updates download and wanted badges on rerender", () => {
  const view = renderShell();
  for (const count of [0, 1, 99, 123, 0]) {
    mocks.queue.data.items = Array.from({ length: count }, () => ({}));
    mocks.library.data.items = Array.from({ length: count }, (_, index) => ({
      id: `title-${index}`,
      kind: "movie",
      status: index % 2 ? "partial" : "missing",
      targets: [
        {
          instanceId: "a",
          monitored: true,
          status: index % 2 ? "partial" : "missing",
        },
      ],
    }));
    view.rerender(<LibraryShell>Downloads content</LibraryShell>);
    const nav = within(
      screen.getByRole("navigation", { name: "Main navigation" }),
    );
    const activity = nav.getByRole("link", { name: /Activity/ });
    const wanted = nav.getByRole("link", { name: /Wanted/ });
    if (count) {
      const shown = count > 99 ? "99+" : String(count);
      expect(
        within(activity).getByLabelText(`${count} downloads`).textContent,
      ).toBe(shown);
      expect(
        within(wanted).getByLabelText(`${count} wanted items`).textContent,
      ).toBe(shown);
    } else {
      expect(activity.textContent).toBe("Activity");
      expect(wanted.textContent).toBe("Wanted");
    }
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
        <ConnectionBanner />
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
      .getByRole("link", { name: "Check connection" })
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
      <ConnectionBanner />
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
