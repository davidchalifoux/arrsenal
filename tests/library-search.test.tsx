import { afterEach, beforeEach, expect, it, mock, spyOn } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import type { AddMedia } from "@/components/add-media";

import type { CatalogItem, MediaItem } from "@/lib/types";

const { push } = { push: mock() };
mock.module("next/navigation", () => ({ useRouter: () => ({ push }) }));
mock.module("@/components/media-card", () => ({ Poster: () => null }));
mock.module("@/components/add-media", () => ({
  AddMedia: ({ open, seed }: ComponentProps<typeof AddMedia>) =>
    open ? (
      <section aria-label="Catalog handoff">
        <span>Seed: {seed?.title ?? "none"}</span>
      </section>
    ) : null,
}));
const { LibraryProvider, useLibraryActions } = await import(
  "@/components/library-provider"
);
const { mediaHref } = await import("@/lib/client");

let client: QueryClient;
const layoutProperties = [
  "offsetHeight",
  "offsetWidth",
  "scrollHeight",
  "scrollTo",
] as const;
const originalLayout = Object.fromEntries(
  layoutProperties.map((key) => [
    key,
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, key),
  ]),
);
beforeEach(() => {
  mock.clearAllMocks();
  // Catalog lookups find nothing unless a test seeds the lookup cache.
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => Response.json({ items: [], errors: [] }), {
      preconnect: fetch.preconnect,
    }),
  );
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["instances"], { instances: [] });
  // jsdom has no layout; supply viewport and row measurements, not a virtualizer mock.
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: {
      configurable: true,
      get(this: HTMLElement) {
        return this.hasAttribute("data-search-result") ? 72 : 288;
      },
    },
    offsetWidth: {
      configurable: true,
      get() {
        return 640;
      },
    },
    scrollHeight: {
      configurable: true,
      get(this: HTMLElement) {
        return (
          Number.parseFloat(
            (this.firstElementChild as HTMLElement)?.style.height,
          ) || 288
        );
      },
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value(this: HTMLElement, options: ScrollToOptions) {
      if (this.scrollTop === (options.top ?? 0)) return;
      this.scrollTop = options.top ?? 0;
      this.dispatchEvent(new Event("scroll"));
    },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  mock.restore();
  for (const key of layoutProperties) {
    const descriptor = originalLayout[key];
    if (descriptor)
      Object.defineProperty(HTMLElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, key);
  }
});

function media(title: string, added = ""): MediaItem {
  return {
    id: `movie:${title}`,
    kind: "movie",
    title,
    year: 2024,
    overview: "",
    poster: "",
    genres: [],
    added,
    status: "available",
    targets: [],
  };
}

const titles = Array.from({ length: 45 }, (_, index) =>
  media(`Title ${String(index + 1).padStart(2, "0")}`),
);

function SearchTrigger() {
  const { searchLibrary, add } = useLibraryActions();
  return (
    <>
      <button type="button" onClick={searchLibrary}>
        Open library search
      </button>
      <button type="button" onClick={() => add()}>
        Add new
      </button>
    </>
  );
}

function renderSearch(items: MediaItem[] = titles) {
  client.setQueryData(["library"], { items, errors: [] });
  render(
    <QueryClientProvider client={client}>
      <LibraryProvider>
        <SearchTrigger />
      </LibraryProvider>
    </QueryClientProvider>,
  );
}

function openSearch() {
  fireEvent.click(screen.getByRole("button", { name: "Open library search" }));
  return screen.getByRole<HTMLInputElement>("combobox", {
    name: "Search library titles",
  });
}

const options = () =>
  within(screen.getByRole("listbox"))
    .queryAllByRole("option")
    .map((option) => option.textContent ?? "");
const activeOption = (input: HTMLElement) =>
  document.getElementById(input.getAttribute("aria-activedescendant") ?? "");

it("shows recently added titles before anything is typed", () => {
  const items = [
    media("Oldest", "2024-01-01T00:00:00Z"),
    media("Newest", "2026-09-01T00:00:00Z"),
    media("Middle", "2025-05-01T00:00:00Z"),
  ];
  renderSearch(items);
  openSearch();
  expect(screen.getByText("Recently added")).toBeTruthy();
  expect(options().map((text) => text.split("2024")[0])).toEqual([
    "Newest",
    "Middle",
    "Oldest",
  ]);
  expect(screen.getByRole("status").textContent).toBe(
    "3 titles in your library",
  );
});

it("ranks library matches, previews three, and expands to the rest", () => {
  const items = [
    "The Dune Story",
    "Dune: Part Two",
    "Alien",
    "A Dune Story",
    "Dune",
    "Dune: Part One",
  ].map((title) => media(title));
  renderSearch(items);
  fireEvent.change(openSearch(), { target: { value: "  dUnE  " } });
  expect(screen.getByText("In your library")).toBeTruthy();
  const links = () =>
    within(screen.getByRole("listbox"))
      .queryAllByRole("option")
      .filter((option) => option.tagName === "A")
      .map((option) => option.getAttribute("href"));
  expect(links()).toEqual([items[4], items[5], items[1]].map(mediaHref));
  fireEvent.click(
    screen.getByRole("option", { name: "Show all 5 library matches" }),
  );
  expect(links()).toEqual(
    [items[4], items[5], items[1], items[3], items[0]].map(mediaHref),
  );
  expect(screen.getByRole("status").textContent).toContain("5 in your library");
});

it("scrolls an expanded list to the final result and resets when searching", async () => {
  renderSearch();
  const input = openSearch();
  fireEvent.change(input, { target: { value: "Title" } });
  fireEvent.click(
    screen.getByRole("option", { name: "Show all 45 library matches" }),
  );
  const scroller = screen.getByRole("listbox");
  expect(screen.queryByRole("option", { name: /^Title 45/ })).toBeNull();
  fireEvent.scroll(scroller, { target: { scrollTop: 48 * 72 - 288 } });
  const last = await screen.findByRole("option", { name: /^Title 45/ });
  expect(last.getAttribute("href")).toBe(mediaHref(titles[44]));
  fireEvent.change(input, { target: { value: "Title 01" } });
  await screen.findByRole("option", { name: /^Title 01/ });
  expect(scroller.scrollTop).toBe(0);
});

it("moves the highlight with the arrow keys while focus stays in the input", async () => {
  renderSearch([media("Beta"), media("Alpha")]);
  const input = openSearch();
  await waitFor(() => expect(document.activeElement).toBe(input));
  fireEvent.change(input, { target: { value: "a" } });
  expect(activeOption(input)?.textContent).toContain("Alpha");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(activeOption(input)?.textContent).toContain("Beta");
  expect(activeOption(input)?.getAttribute("aria-selected")).toBe("true");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(activeOption(input)?.textContent).toContain("Beta");
  fireEvent.keyDown(input, { key: "ArrowUp" });
  fireEvent.keyDown(input, { key: "ArrowUp" });
  expect(activeOption(input)?.textContent).toContain("Alpha");
  expect(document.activeElement).toBe(input);
  expect(push).not.toHaveBeenCalled();
});

it("keeps the highlighted result rendered when navigating a long list", async () => {
  renderSearch();
  const input = openSearch();
  fireEvent.change(input, { target: { value: "Title" } });
  fireEvent.click(
    screen.getByRole("option", { name: "Show all 45 library matches" }),
  );
  for (let index = 1; index < titles.length; index++) {
    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() =>
      expect(activeOption(input)?.textContent).toContain(titles[index].title),
    );
  }
  fireEvent.keyDown(input, { key: "Enter" });
  expect(push).toHaveBeenCalledWith(mediaHref(titles[44]));
});

it("matches acronyms, non-contiguous letters, and titles without typing accents", () => {
  const items = ["Star Wars", "Stardust", "Am\u00e9lie", "Alien"].map((title) =>
    media(title),
  );
  renderSearch(items);
  const input = openSearch();
  for (const [query, item] of [
    ["sw", items[0]],
    ["strdst", items[1]],
    ["amelie", items[2]],
  ] as const) {
    fireEvent.change(input, { target: { value: query } });
    expect(
      within(screen.getByRole("listbox"))
        .queryAllByRole("option")
        .map((option) => option.getAttribute("href")),
    ).toEqual([mediaHref(item)]);
  }
});

it("opens the highlighted result on Enter and closes search, but not for an empty result", async () => {
  const dune = media("Dune");
  renderSearch([media("Dune: Part Two"), dune]);
  const input = openSearch();
  fireEvent.change(input, { target: { value: "missing" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(push).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeDefined();
  fireEvent.change(input, { target: { value: "  DUNE " } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(push).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(push).toHaveBeenCalledTimes(1);
  expect(push).toHaveBeenCalledWith(mediaHref(dune));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

// Opening and reopening the real dialog can exceed 5s in CI.
it.each([
  "ctrlKey",
  "metaKey",
] as const)("%s+K toggles search and reopens with a clean query and input focus", async (modifier) => {
  renderSearch();
  fireEvent.keyDown(window, { key: "k", [modifier]: true });
  const input = screen.getByRole("combobox");
  fireEvent.change(input, { target: { value: "Title" } });
  fireEvent.keyDown(input, { key: "K", [modifier]: true });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.keyDown(window, { key: "k", [modifier]: true });
  const reopened = screen.getByRole<HTMLInputElement>("combobox");
  expect(reopened.value).toBe("");
  expect(screen.getByText("Recently added")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe(
    "45 titles in your library",
  );
  await waitFor(() => expect(document.activeElement).toBe(reopened));
}, 15_000);

const catalogDune: CatalogItem = {
  id: "movie:tmdb:438631",
  kind: "movie",
  tmdbId: 438631,
  title: "Dune",
  year: 2021,
  overview: "",
  poster: "",
  genres: [],
  existingInstanceIds: ["radarr"],
};

it("lists catalog titles below library matches and hands one to the add dialog", async () => {
  client.setQueryDefaults(["lookup"], { staleTime: 60000 });
  client.setQueryData(["lookup", "Dune"], {
    items: [catalogDune, { ...catalogDune, id: "movie:Dune", title: "Dune" }],
    errors: [],
  });
  renderSearch([media("Dune")]);
  fireEvent.change(openSearch(), { target: { value: "Dune" } });
  expect(await screen.findByText("Add to your library")).toBeTruthy();
  // The title already in the library is listed once, as a library match.
  const result = await screen.findByRole("option", {
    name: /Dune.*In library/,
  });
  expect(
    screen.getAllByRole("option").filter((option) => option.tagName === "A"),
  ).toHaveLength(1);
  fireEvent.click(result);
  expect(await screen.findByText("Seed: Dune")).toBeTruthy();
  expect(push).not.toHaveBeenCalled();
});

it("opens in add mode from Add new, searching only the catalog", async () => {
  client.setQueryDefaults(["lookup"], { staleTime: 60000 });
  client.setQueryData(["lookup", "Dune"], {
    items: [catalogDune],
    errors: [],
  });
  renderSearch([media("Dune")]);
  fireEvent.click(screen.getByRole("button", { name: "Add new" }));
  const input = screen.getByRole("combobox", {
    name: "Search movies and shows",
  });
  expect(
    screen.getByText("Type at least 2 characters to search TMDB and TVDB."),
  ).toBeTruthy();
  fireEvent.change(input, { target: { value: "Dune" } });
  const result = await screen.findByRole("option", {
    name: /Dune.*In library/,
  });
  expect(screen.queryByText("In your library")).toBeNull();
  await waitFor(() =>
    expect(activeOption(input)?.textContent).toContain("Dune"),
  );
  fireEvent.keyDown(input, { key: "Enter" });
  expect(await screen.findByText("Seed: Dune")).toBeTruthy();
  expect(result).toBeTruthy();
});
