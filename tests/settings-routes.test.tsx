import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import {
  act,
  cleanup,
  fireEvent,
  render as renderView,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";

const state = {
  pathname: "/settings",
  replace: mock(),
  sync: mock(),
  notify: mock(),
  pending: false,
};

mock.module("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ replace: state.replace }),
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
mock.module("@/lib/collections", () => ({
  useInstances: () => ({ isPending: state.pending, data: { instances: [] } }),
  useSyncData: () => state.sync,
}));
mock.module("@/components/library-provider", () => ({
  useLibraryActions: () => ({ notify: state.notify }),
}));
const { default: ConnectionsPage } = await import(
  "@/app/(library)/settings/connections/page"
);
const { default: SettingsLayout } = await import(
  "@/app/(library)/settings/layout"
);
const { default: SettingsPage } = await import("@/app/(library)/settings/page");
const { default: PersonalizationPage } = await import(
  "@/app/(library)/settings/personalization/page"
);

let client: QueryClient;
let savedZone: string | null;
const fetchMock =
  mock<(...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>>();
function render(view: ReactElement) {
  return renderView(view, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  savedZone = null;
  fetchMock.mockImplementation(async (_url, init) => {
    if (init?.method === "PATCH") {
      const value = JSON.parse(String(init.body)).timeZone;
      if (value === "Invalid/Zone")
        return Response.json(
          { error: "Enter a valid IANA timezone." },
          { status: 400 },
        );
      savedZone = value;
    }
    return Response.json({ timeZone: savedZone });
  });
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(fetchMock, { preconnect: fetch.preconnect }),
  );
  state.pathname = "/settings";
  state.pending = false;
  mock.clearAllMocks();
});
afterEach(() => {
  cleanup();
  client.clear();
  mock.restore();
});

describe("Settings routes and navigation", () => {
  it("does not submit freeform search and disables the picker while a deliberate save is pending", async () => {
    render(<PersonalizationPage />);
    const trigger = screen.getByRole("combobox", { name: "Timezone" });
    await waitFor(() => expect(trigger.hasAttribute("disabled")).toBe(false));
    expect(
      screen.getByRole("button", { name: "Save" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(trigger);
    const search = await screen.findByRole("combobox", {
      name: "Search timezones",
    });
    fireEvent.change(search, { target: { value: "Invalid/Zone" } });
    expect(screen.getByText(/No matching timezones/)).toBeTruthy();
    fireEvent.keyDown(search, { key: "Escape" });
    expect(savedZone).toBeNull();
    expect(
      screen.getByRole("button", { name: "Save" }).hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(trigger);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Search timezones" }),
      { target: { value: "Tokyo" } },
    );
    fireEvent.click(
      await screen.findByRole("option", { name: /Tokyo Asia\/Tokyo/ }),
    );
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      (await screen.findByRole("button", { name: "Saving..." })).hasAttribute(
        "disabled",
      ),
    ).toBe(true);
    expect(trigger.hasAttribute("disabled")).toBe(true);
    await act(async () => finish(Response.json({ timeZone: "Asia/Tokyo" })));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Save" }).hasAttribute("disabled"),
      ).toBe(true),
    );
    expect(trigger.hasAttribute("disabled")).toBe(false);
  });

  it("implements Personalization with a searchable timezone field, save and automatic reset", async () => {
    state.pathname = "/settings/personalization";
    render(
      <SettingsLayout>
        <PersonalizationPage />
      </SettingsLayout>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Personalization" }),
    ).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(
      within(nav)
        .getByRole("link", { name: "Personalization" })
        .getAttribute("aria-current"),
    ).toBe("page");
    const input = screen.getByRole("combobox", { name: "Timezone" });
    await waitFor(() => expect(input.hasAttribute("disabled")).toBe(false));
    fireEvent.click(input);
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Search timezones" }),
      { target: { value: "Tokyo" } },
    );
    fireEvent.click(
      await screen.findByRole("option", { name: /Tokyo Asia\/Tokyo/ }),
    );
    expect(savedZone).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Asia/Tokyo"),
    );
    expect(savedZone).toBe("Asia/Tokyo");
    fireEvent.click(input);
    fireEvent.click(await screen.findByRole("option", { name: /Automatic/ }));
    expect(savedZone).toBe("Asia/Tokyo");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Automatic"),
    );
    expect(savedZone).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows config save failure feedback without applying an unsaved choice", async () => {
    render(<PersonalizationPage />);
    await waitFor(() =>
      expect(
        screen
          .getByRole("combobox", { name: "Timezone" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    fetchMock.mockResolvedValue(
      Response.json(
        {
          error:
            "Unable to save Arrsenal configuration. Check directory permissions.",
        },
        { status: 500 },
      ),
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Timezone" }));
    fireEvent.change(
      await screen.findByRole("combobox", { name: "Search timezones" }),
      { target: { value: "Tokyo" } },
    );
    fireEvent.click(
      await screen.findByRole("option", { name: /Tokyo Asia\/Tokyo/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Check directory permissions",
    );
    expect(screen.getByRole("status").textContent).toContain("Automatic");
    expect(savedZone).toBeNull();
  });

  it("opens Connections instead of an overview", async () => {
    await expect(
      SettingsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/settings/connections");
  });

  it("redirects legacy connect links to the connection subpage", async () => {
    await expect(
      SettingsPage({ searchParams: Promise.resolve({ connect: "1" }) }),
    ).rejects.toThrow("REDIRECT:/settings/connections?connect=1");
  });

  it.each(
    [undefined, "0", ["1", "0"]].map((connect) => ({ connect })),
  )("does not auto-open for connect=%s", async ({ connect }) => {
    await expect(
      SettingsPage({ searchParams: Promise.resolve({ connect }) }),
    ).rejects.toThrow("REDIRECT:/settings/connections");
    const page = await ConnectionsPage({
      searchParams: Promise.resolve({ connect }),
    });
    expect(page.props.autoOpen).toBe(false);
  });

  it("renders the manager with direct section navigation and no overview", async () => {
    state.pathname = "/settings/connections";
    render(
      <SettingsLayout>
        {await ConnectionsPage({ searchParams: Promise.resolve({}) })}
      </SettingsLayout>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Connections" }),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Back to Settings" })).toBeNull();
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(
      within(nav)
        .getByRole("link", { name: "Connections" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(within(nav).queryByRole("link", { name: "Overview" })).toBeNull();
    expect(
      within(nav)
        .getByRole("link", { name: "Personalization" })
        .getAttribute("href"),
    ).toBe("/settings/personalization");
    fireEvent.click(screen.getByRole("button", { name: "Add instance" }));
    expect(
      await screen.findByRole("dialog", { name: "Connect an instance" }),
    ).toBeTruthy();
  });

  it("waits for connections to load, then opens once and cleans the query on the subpage", async () => {
    state.pathname = "/settings/connections";
    state.pending = true;
    const page = await ConnectionsPage({
      searchParams: Promise.resolve({ connect: "1" }),
    });
    const view = render(page);
    expect(screen.getByText("Loading connections...")).toBeTruthy();
    expect(state.replace).not.toHaveBeenCalled();
    state.pending = false;
    view.rerender(
      await ConnectionsPage({
        searchParams: Promise.resolve({ connect: "1" }),
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Connect an instance" }),
    ).toBeTruthy();
    expect(state.replace).toHaveBeenCalledTimes(1);
    expect(state.replace).toHaveBeenCalledWith("/settings/connections", {
      scroll: false,
    });
    view.rerender(await ConnectionsPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("dialog", { name: "Connect an instance" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(state.replace).toHaveBeenCalledTimes(1);
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
