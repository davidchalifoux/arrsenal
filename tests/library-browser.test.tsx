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
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import type { LibraryResponse, MediaItem } from "@/lib/types";

const mocks = {
  add: mock(),
  replace: mock(),
  data: { items: [] as MediaItem[], errors: [] } as LibraryResponse,
  pending: false,
};
mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: mock() }),
}));
mock.module("@/components/library-provider", () => ({
  useLibraryActions: () => ({ add: mocks.add, refresh: mock() }),
  useOptionalLibraryActions: () => null,
}));
mock.module("@/lib/client-data", () => ({
  useLibrary: () => ({
    data: mocks.pending ? undefined : mocks.data,
    isPending: mocks.pending,
  }),
  useInstances: () => ({ data: { instances: [{ id: "a", name: "A" }] } }),
  useSyncData: () => mock(),
}));
mock.module("@/lib/preferences", () => ({
  usePreferences: () => ({ data: undefined }),
  useSavePreferences: () => ({ mutate: mock(), isPending: false }),
}));
mock.module("@/components/use-library-view", () => ({
  useLibraryView: () => ({
    filtered: mocks.data.items,
    totalCount: mocks.data.items.length,
    qualities: ["HD"],
    filterCount: 0,
    statusCounts: { all: 0, available: 0, incomplete: 0, downloading: 0 },
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
  mocks.data.items = [];
});
afterEach(() => {
  cleanup();
  mock.restore();
  window.scrollY = 0;
});

const pressed = (name: string) =>
  screen
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .getAttribute("aria-pressed");
const sortLabel = () =>
  screen
    .getByRole("button", { name: /^Sort library:/ })
    .getAttribute("aria-label");

describe("LibraryBrowser", () => {
  it("restores each category's filters, sorting, layout, and scroll after data loads", async () => {
    sessionStorage.setItem(
      "arrsenal:library-view:movies",
      JSON.stringify(saved),
    );
    mocks.pending = true;
    const view = render(<LibraryBrowser category="movies" />);
    expect(sortLabel()).toBe("Sort library: Title, ascending");
    expect(pressed("Table")).toBe("true");
    expect(window.scrollTo).not.toHaveBeenCalled();
    mocks.pending = false;
    view.rerender(<LibraryBrowser category="movies" />);
    expect(pressed("Available")).toBe("true");
    await waitFor(() =>
      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 640,
        behavior: "instant",
      }),
    );
    window.scrollY = 900;
    fireEvent.scroll(window);
    view.rerender(<LibraryBrowser category="shows" />);
    expect(pressed("All")).toBe("true");
    expect(pressed("Posters")).toBe("true");
    view.rerender(<LibraryBrowser category="movies" />);
    await waitFor(() =>
      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 900,
        behavior: "instant",
      }),
    );
    expect(sortLabel()).toBe("Sort library: Title, ascending");
    fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));
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
    expect(pressed("Table")).toBe("true");
  });

  it("honors the legacy Incomplete entry point over saved availability", () => {
    sessionStorage.setItem(
      "arrsenal:library-view:library",
      JSON.stringify(saved),
    );
    render(<LibraryBrowser category="library" initialStatus="incomplete" />);
    expect(screen.getByRole("heading", { name: "All titles" })).toBeTruthy();
    expect(pressed("Incomplete")).toBe("true");
  });

  it.each([
    "invalid json",
    JSON.stringify({ ...saved, sort: "invalid" }),
  ])("ignores invalid snapshots: %s", (snapshot) => {
    sessionStorage.setItem("arrsenal:library-view:library", snapshot);
    render(<LibraryBrowser category="library" />);
    expect(sortLabel()).toBe("Sort library: Date added, descending");
  });

  it("works when session storage is unavailable", () => {
    spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    render(<LibraryBrowser category="movies" />);
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(pressed("Table")).toBe("true");
  });
});

it("labels partial startup data and does not claim an empty or complete library", async () => {
  mocks.data = { items: [], errors: [], loadingInstanceIds: ["slow"] };
  render(<LibraryBrowser category="library" />);
  expect(screen.getByText("Loading 1 more instance...")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe(
    "More library items are still loading.",
  );
  expect(screen.queryByText("Library up to date")).toBeNull();
  expect(screen.queryByText("The beginning of a great collection.")).toBeNull();
});
