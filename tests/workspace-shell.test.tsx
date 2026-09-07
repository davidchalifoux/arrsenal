import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceShell } from "@/components/workspace-shell";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  add: vi.fn(),
  searchLibrary: vi.fn(),
  queue: { data: { items: [] as unknown[] } },
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("next/link", () => ({
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
vi.mock("@/lib/collections", () => ({ useQueue: () => mocks.queue }));
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => mocks,
}));

const navigationNames = ["Main navigation", "Mobile navigation"];
const destinations = [
  ["Home", "/"],
  ["Movies", "/movies"],
  ["Shows", "/shows"],
  ["Downloads", "/queue"],
  ["Calendar", "/calendar"],
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/";
  mocks.queue = { data: { items: [] } };
});
afterEach(cleanup);

function renderShell() {
  return render(
    <WorkspaceShell>
      <h1>Library content</h1>
    </WorkspaceShell>,
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
  const mobile = screen.getByRole("navigation", { name: "Mobile navigation" });
  expect(header.contains(mobile)).toBe(false);
  for (const [name] of destinations) {
    fireEvent.click(within(mobile).getByRole("link", { name }));
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBe(
      mobile,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  }
  expect(screen.queryByRole("button", { name: /navigation/i })).toBeNull();
  expect(screen.queryByRole("link", { name: "Connections" })).toBeNull();
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
    view.rerender(<WorkspaceShell>Downloads content</WorkspaceShell>);
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
    vi.clearAllMocks();
    mocks.pathname = pathname;
    view.rerender(<WorkspaceShell>Library content</WorkspaceShell>);
    const header = within(screen.getByRole("banner"));
    expect(screen.getAllByRole("button")).toHaveLength(2);
    fireEvent.click(header.getByRole("button", { name: "Add media" }));
    fireEvent.click(header.getByRole("button", { name: "Search library" }));
    expect(mocks.add).toHaveBeenCalledExactlyOnceWith(null, kind);
    expect(mocks.searchLibrary).toHaveBeenCalledOnce();
  }
});
