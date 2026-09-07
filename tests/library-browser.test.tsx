import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { css } from "@styled-system/css";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import type { MediaItem } from "@/lib/types";

const mocks = {
  add: mock(),
  replace: mock(),
  ready: true,
  data: { items: [] as MediaItem[], errors: [] },
  pending: false,
};
mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mock() }),
}));
mock.module("@/components/library-provider", () => ({
  useLibraryActions: () => ({ add: mocks.add, refresh: mock() }),
}));
mock.module("@/lib/collections", () => ({
  useLibrary: () => ({
    data: mocks.pending ? undefined : mocks.data,
    isPending: mocks.pending,
  }),
  useInstances: () => ({ data: { instances: [{ id: "a", name: "A" }] } }),
}));
mock.module("@/components/use-library-view", () => ({
  useLibraryView: () => ({
    filtered: mocks.data.items,
    totalCount: mocks.data.items.length,
    qualities: ["HD"],
    filterCount: 0,
    isReady: mocks.ready,
  }),
}));
mock.module("@/components/media-card", () => ({
  MediaCard: () => <div>Grid result</div>,
  MediaList: () => <div>List results</div>,
}));
const { LibraryBrowser } = await import("@/components/library-browser");

const saved = {
  instanceFilter: "a",
  quality: "HD",
  status: "available",
  sort: "title",
  sortDirection: "asc",
  layout: "list",
  scrollY: 640,
};
beforeEach(() => {
  sessionStorage.clear();
  mock.clearAllMocks();
  spyOn(window, "scrollTo").mockImplementation(() => {});
  mocks.pending = false;
  mocks.ready = true;
  mocks.data.items = [];
});
afterEach(() => {
  cleanup();
  mock.restore();
  window.scrollY = 0;
});

describe("LibraryBrowser", () => {
  it.each([
    ["library", "Home"],
    ["movies", "Movies"],
    ["shows", "Shows"],
  ] as const)("keeps %s controls in one toolbar with only a visually hidden page heading", (category, title) => {
    const { container } = render(<LibraryBrowser category={category} />);
    const refresh = screen.getByRole("button", { name: "Refresh library" });
    const toolbar = screen.getByRole("group", { name: "Library controls" });
    const heading = screen.getByRole("heading", { level: 1, name: title });
    expect(heading.className).toBe(css({ srOnly: true }));
    expect(heading.parentElement).toBe(container);
    expect(container.querySelector("header")).toBeNull();
    expect(toolbar.contains(screen.getByText("0 titles"))).toBe(true);
    expect(toolbar.contains(refresh)).toBe(true);
    expect(
      toolbar.contains(screen.getAllByRole("button", { name: "Add media" })[0]),
    ).toBe(true);
    expect(refresh.parentElement?.textContent).toContain("Library up to date");
    expect(screen.queryByText(/All your favorites/)).toBeNull();
  });
  it("restores each category's filters, sorting, layout, and scroll after data loads", async () => {
    sessionStorage.setItem(
      "arrsenal:library-view:movies",
      JSON.stringify(saved),
    );
    mocks.pending = true;
    mocks.ready = false;
    const view = render(<LibraryBrowser category="movies" />);
    expect(
      screen.getByRole("combobox", { name: "Filter by availability" })
        .textContent,
    ).toContain("Available");
    expect(
      screen.getByRole("combobox", { name: "Sort library" }).textContent,
    ).toContain("Title");
    expect(
      screen
        .getByRole("button", { name: "List view" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(window.scrollTo).not.toHaveBeenCalled();
    mocks.pending = false;
    view.rerender(<LibraryBrowser category="movies" />);
    expect(window.scrollTo).not.toHaveBeenCalled();
    mocks.ready = true;
    view.rerender(<LibraryBrowser category="movies" />);
    await waitFor(() =>
      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 640,
        behavior: "instant",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sort descending" }));
    window.scrollY = 900;
    fireEvent.scroll(window);
    view.rerender(<LibraryBrowser category="shows" />);
    expect(
      screen.getByRole("combobox", { name: "Filter by availability" })
        .textContent,
    ).toContain("All availability");
    expect(
      screen
        .getByRole("button", { name: "Grid view" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    view.rerender(<LibraryBrowser category="movies" />);
    await waitFor(() =>
      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 900,
        behavior: "instant",
      }),
    );
    expect(screen.getByRole("button", { name: "Sort ascending" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      (await screen.findByRole("combobox", { name: "Filter by instance" }))
        .textContent,
    ).toContain("A");
    expect(
      screen.getByRole("combobox", { name: "Filter by quality profile" })
        .textContent,
    ).toContain("HD");
    view.unmount();
    render(<LibraryBrowser category="movies" />);
    expect(
      screen
        .getByRole("button", { name: "List view" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("honors the legacy Incomplete entry point over saved availability", () => {
    sessionStorage.setItem(
      "arrsenal:library-view:library",
      JSON.stringify(saved),
    );
    render(<LibraryBrowser category="library" initialStatus="incomplete" />);
    expect(screen.getByRole("heading", { name: "Home" })).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Filter by availability" })
        .textContent,
    ).toContain("Incomplete");
    expect(
      screen.queryByRole("button", { name: /Titles downloading/ }),
    ).toBeNull();
  });

  it.each([
    "invalid json",
    JSON.stringify({ ...saved, sort: "invalid" }),
  ])("ignores invalid snapshots: %s", (snapshot) => {
    sessionStorage.setItem("arrsenal:library-view:library", snapshot);
    render(<LibraryBrowser category="library" />);
    expect(
      screen.getByRole("combobox", { name: "Sort library" }).textContent,
    ).toContain("Date added");
  });

  it("works when session storage is unavailable", () => {
    spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    render(<LibraryBrowser category="movies" />);
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(
      screen
        .getByRole("button", { name: "List view" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it.each([
    ["library", "movie"],
    ["movies", "movie"],
    ["shows", "series"],
  ] as const)("seeds both Add actions for %s", (category, kind) => {
    render(<LibraryBrowser category={category} />);
    const buttons = screen.getAllByRole("button", { name: "Add media" });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      fireEvent.click(button);
      expect(mocks.add).toHaveBeenLastCalledWith(null, kind);
    }
  });
});
