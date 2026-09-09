import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import type { AddMedia } from "@/components/add-media";

import type { MediaItem } from "@/lib/types";

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
  for (const key of layoutProperties) {
    const descriptor = originalLayout[key];
    if (descriptor)
      Object.defineProperty(HTMLElement.prototype, key, descriptor);
    else Reflect.deleteProperty(HTMLElement.prototype, key);
  }
});

function media(title: string): MediaItem {
  return {
    id: `movie:${title}`,
    kind: "movie",
    title,
    year: 2024,
    overview: "",
    poster: "",
    genres: [],
    added: "",
    status: "available",
    targets: [],
  };
}

const titles = Array.from({ length: 45 }, (_, index) =>
  media(`Title ${String(index + 1).padStart(2, "0")}`),
);

function SearchTrigger() {
  const { searchLibrary } = useLibraryActions();
  return (
    <button type="button" onClick={searchLibrary}>
      Open library search
    </button>
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
  return screen.getByRole<HTMLInputElement>("textbox", {
    name: "Search library titles",
  });
}

it("trims and ignores query case, ranking exact, prefix, then substring matches alphabetically", () => {
  const items = [
    "The Dune Story",
    "Dune: Part Two",
    "Alien",
    "A Dune Story",
    "Dune",
    "Dune: Part One",
  ].map(media);
  renderSearch(items);
  fireEvent.change(openSearch(), { target: { value: "  dUnE  " } });
  expect(screen.getByRole("status").textContent).toBe("5 titles found");
  expect(
    screen.getAllByRole("link").map((link) => link.getAttribute("href")),
  ).toEqual([items[4], items[5], items[1], items[3], items[0]].map(mediaHref));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
  expect(screen.getAllByRole("link")).toHaveLength(6);
  expect(screen.getByRole("status").textContent).toBe(
    "6 titles in your library",
  );
});

it("scrolls to the final result without pagination and resets when searching", async () => {
  renderSearch();
  const input = openSearch();
  const first = await screen.findByRole("link", { name: /^Title 01/ });
  const scroller = first.parentElement?.parentElement as HTMLElement;
  expect(screen.queryByRole("link", { name: /^Title 45/ })).toBeNull();
  fireEvent.scroll(scroller, { target: { scrollTop: 45 * 72 - 288 } });
  const last = await screen.findByRole("link", { name: /^Title 45/ });
  expect(last.getAttribute("href")).toBe(mediaHref(titles[44]));
  fireEvent.change(input, { target: { value: "Title 01" } });
  await screen.findByRole("link", { name: /^Title 01/ });
  expect(scroller.scrollTop).toBe(0);
  expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
});

it("keeps keyboard focus when navigating beyond the rendered window", async () => {
  renderSearch();
  const input = openSearch();
  await waitFor(() => expect(document.activeElement).toBe(input));
  for (let index = 0; index < titles.length; index++) {
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: "ArrowDown",
    });
    await waitFor(() =>
      expect(document.activeElement?.textContent).toContain(
        titles[index].title,
      ),
    );
  }
  fireEvent.click(document.activeElement as HTMLElement);
  expect(push).toHaveBeenCalledWith(mediaHref(titles[44]));
});

it("matches acronyms, non-contiguous letters, and titles without typing accents", () => {
  const items = ["Star Wars", "Stardust", "Am\u00e9lie", "Alien"].map(media);
  renderSearch(items);
  const input = openSearch();
  for (const [query, item] of [
    ["sw", items[0]],
    ["strdst", items[1]],
    ["amelie", items[2]],
  ] as const) {
    fireEvent.change(input, { target: { value: query } });
    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual([mediaHref(item)]);
  }
});

it("moves focus with ArrowDown and ArrowUp, returning to the input before the first result", async () => {
  renderSearch([media("Beta"), media("Alpha")]);
  const input = openSearch();
  await waitFor(() => expect(document.activeElement).toBe(input));
  const [first, second] = screen.getAllByRole("link");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: "ArrowDown" });
  expect(document.activeElement).toBe(second);
  fireEvent.keyDown(second, { key: "ArrowDown" });
  expect(document.activeElement).toBe(second);
  fireEvent.keyDown(second, { key: "ArrowUp" });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: "ArrowUp" });
  expect(document.activeElement).toBe(input);
  expect(push).not.toHaveBeenCalled();
});

it("navigates to the top ranked result on Enter and closes search, but not for an empty result", async () => {
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

it("switches sections without replacing the dialog or losing the query", () => {
  renderSearch();
  const input = openSearch();
  const dialog = screen.getByRole("dialog");
  fireEvent.change(input, { target: { value: "Dune" } });
  fireEvent.click(screen.getByRole("button", { name: "Add media" }));
  expect(screen.getByRole("dialog")).toBe(dialog);
  expect(
    screen.getByRole<HTMLInputElement>("textbox", {
      name: "Search movies and shows",
    }),
  ).toBe(input);
  expect(input.value).toBe("Dune");
  fireEvent.click(screen.getByRole("button", { name: "Library" }));
  expect(screen.getByRole("textbox", { name: "Search library titles" })).toBe(
    input,
  );
  expect(input.value).toBe("Dune");
  expect(push).not.toHaveBeenCalled();
});

// Opening and reopening the real dialog can exceed 5s in CI.
it.each([
  "ctrlKey",
  "metaKey",
] as const)("%s+K toggles search and reopens with a clean query and input focus", async (modifier) => {
  renderSearch();
  fireEvent.keyDown(window, { key: "k", [modifier]: true });
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "Title" } });
  fireEvent.keyDown(input, { key: "K", [modifier]: true });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.keyDown(window, { key: "k", [modifier]: true });
  const reopened = screen.getByRole<HTMLInputElement>("textbox");
  expect(reopened.value).toBe("");
  expect(screen.getByRole("link", { name: /^Title 01/ })).toBeDefined();
  expect(screen.getByRole("status").textContent).toBe(
    "45 titles in your library",
  );
  await waitFor(() => expect(document.activeElement).toBe(reopened));
}, 15_000);
