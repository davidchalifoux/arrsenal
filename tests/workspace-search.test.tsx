import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AddMedia } from "@/components/add-media";
import {
  useWorkspace,
  WorkspaceProvider,
} from "@/components/workspace-provider";
import { mediaHref } from "@/lib/client";
import type { MediaItem } from "@/lib/types";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/media-card", () => ({ Poster: () => null }));
vi.mock("@/components/add-media", () => ({
  AddMedia: ({ open, initialTerm, seed }: ComponentProps<typeof AddMedia>) =>
    open ? (
      <section aria-label="Catalog handoff">
        <span>Query: {initialTerm}</span>
        <span>Seed: {seed?.title ?? "none"}</span>
      </section>
    ) : null,
}));

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["instances"], { instances: [] });
});
afterEach(() => {
  cleanup();
  client.clear();
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
  const { searchLibrary } = useWorkspace();
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
      <WorkspaceProvider>
        <SearchTrigger />
      </WorkspaceProvider>
    </QueryClientProvider>,
  );
}

function openSearch() {
  fireEvent.click(screen.getByRole("button", { name: "Open library search" }));
  return screen.getByRole<HTMLInputElement>("textbox", {
    name: "Search library titles",
  });
}

it("focuses the search input when the modal opens", async () => {
  renderSearch();
  const input = openSearch();
  await waitFor(() => expect(document.activeElement).toBe(input));
  expect(input.value).toBe("");
  expect(screen.getByRole("status").textContent).toBe(
    "45 titles in your library",
  );
});

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

it("shows results beyond 20 in batches and resets pagination when the query changes", () => {
  renderSearch();
  const input = openSearch();
  expect(screen.getAllByRole("link")).toHaveLength(20);
  expect(screen.queryByRole("link", { name: /^Title 21/ })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Show more (25 remaining)" }),
  );
  expect(screen.getAllByRole("link")).toHaveLength(40);
  expect(
    screen.getByRole("link", { name: /^Title 21/ }).getAttribute("href"),
  ).toBe(mediaHref(titles[20]));
  fireEvent.click(
    screen.getByRole("button", { name: "Show more (5 remaining)" }),
  );
  expect(screen.getAllByRole("link")).toHaveLength(45);
  expect(screen.getByRole("link", { name: /^Title 45/ })).toBeDefined();
  expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
  fireEvent.change(input, { target: { value: "Title" } });
  expect(screen.getAllByRole("link")).toHaveLength(20);
  expect(
    screen.getByRole("button", { name: "Show more (25 remaining)" }),
  ).toBeDefined();
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
  expect(push).toHaveBeenCalledExactlyOnceWith(mediaHref(dune));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("hands the trimmed current query to Search catalog and closes the library modal", async () => {
  renderSearch();
  fireEvent.change(openSearch(), { target: { value: "  Dune: Part Two  " } });
  fireEvent.click(screen.getByRole("button", { name: "Search catalog" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    screen.getByRole("region", { name: "Catalog handoff" }).textContent,
  ).toBe("Query: Dune: Part TwoSeed: none");
  expect(push).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  expect(screen.queryByRole("region", { name: "Catalog handoff" })).toBeNull();
  expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("");
});

it.each([
  "ctrlKey",
  "metaKey",
] as const)("%s+K toggles search and reopens with a clean query, first page, and input focus", async (modifier) => {
  renderSearch();
  fireEvent.keyDown(window, { key: "k", [modifier]: true });
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "Title" } });
  fireEvent.click(
    screen.getByRole("button", { name: "Show more (25 remaining)" }),
  );
  expect(screen.getAllByRole("link")).toHaveLength(40);
  fireEvent.keyDown(input, { key: "K", [modifier]: true });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.keyDown(window, { key: "k", [modifier]: true });
  const reopened = screen.getByRole<HTMLInputElement>("textbox");
  expect(reopened.value).toBe("");
  expect(screen.getAllByRole("link")).toHaveLength(20);
  expect(screen.getByRole("status").textContent).toBe(
    "45 titles in your library",
  );
  await waitFor(() => expect(document.activeElement).toBe(reopened));
});
