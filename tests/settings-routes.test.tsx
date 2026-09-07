import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConnectionsPage, {
  metadata as connectionsMetadata,
} from "@/app/(workspace)/settings/connections/page";
import SettingsLayout from "@/app/(workspace)/settings/layout";
import SettingsPage, { metadata } from "@/app/(workspace)/settings/page";
import ErrorPage from "@/app/error";

const state = vi.hoisted(() => ({
  pathname: "/settings",
  replace: vi.fn(),
  sync: vi.fn(),
  notify: vi.fn(),
  pending: false,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ replace: state.replace }),
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/collections", () => ({
  useInstances: () => ({ isPending: state.pending, data: { instances: [] } }),
  useSyncData: () => state.sync,
}));
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({ notify: state.notify }),
}));

beforeEach(() => {
  state.pathname = "/settings";
  state.pending = false;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("Settings routes and navigation", () => {
  it("renders a usable overview with only implemented sections", async () => {
    render(
      <SettingsLayout>
        {await SettingsPage({ searchParams: Promise.resolve({}) })}
      </SettingsLayout>,
    );
    expect(metadata.title).toBe("Settings | Arrsenal");
    const overview = screen.getByRole("region", { name: "Settings" });
    expect(
      within(overview)
        .getByRole("link", { name: /Connections/ })
        .getAttribute("href"),
    ).toBe("/settings/connections");
    expect(screen.queryByText("Personalization")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add instance" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Back to Settings" })).toBeNull();
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(
      within(nav)
        .getByRole("link", { name: "Overview" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      within(nav)
        .getByRole("link", { name: "Connections" })
        .hasAttribute("aria-current"),
    ).toBe(false);
  });

  it("redirects legacy connect links to the connection subpage", async () => {
    await expect(
      SettingsPage({ searchParams: Promise.resolve({ connect: "1" }) }),
    ).rejects.toThrow("REDIRECT:/settings/connections?connect=1");
  });

  it.each([
    undefined,
    "0",
    ["1", "0"],
  ])("does not auto-open for connect=%s", async (connect) => {
    await expect(
      SettingsPage({ searchParams: Promise.resolve({ connect }) }),
    ).resolves.toBeTruthy();
    const page = await ConnectionsPage({
      searchParams: Promise.resolve({ connect }),
    });
    expect(page.props.autoOpen).toBe(false);
  });

  it("renders the existing manager with section navigation and a mobile return link", async () => {
    state.pathname = "/settings/connections";
    render(
      <SettingsLayout>
        {await ConnectionsPage({ searchParams: Promise.resolve({}) })}
      </SettingsLayout>,
    );
    expect(connectionsMetadata.title).toBe("Connections | Arrsenal");
    expect(
      screen.getByRole("heading", { level: 1, name: "Connections" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Back to Settings" })
        .getAttribute("href"),
    ).toBe("/settings");
    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(
      within(nav)
        .getByRole("link", { name: "Connections" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      within(nav)
        .getByRole("link", { name: "Overview" })
        .hasAttribute("aria-current"),
    ).toBe(false);
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
    expect(state.replace).toHaveBeenCalledExactlyOnceWith(
      "/settings/connections",
      { scroll: false },
    );
    view.rerender(await ConnectionsPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByRole("dialog", { name: "Connect an instance" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(state.replace).toHaveBeenCalledTimes(1);
  });

  it("links error recovery directly to Connections", () => {
    render(<ErrorPage reset={vi.fn()} />);
    expect(
      screen.getByRole("link", { name: "Connections" }).getAttribute("href"),
    ).toBe("/settings/connections");
  });
});
