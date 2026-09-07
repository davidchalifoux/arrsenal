import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLibraryView } from "@/components/use-library-view";
import { getCollections, useLibrary } from "@/lib/collections";
import { libraryQuery } from "@/lib/queries";
import type { MediaItem, MediaTarget } from "@/lib/types";

vi.mock("@/lib/client", () => ({ api: vi.fn() }));

const target: MediaTarget = {
  instanceId: "a",
  instanceName: "A",
  remoteId: 1,
  qualityProfileId: 1,
  qualityProfile: "HD",
  quality: "HD",
  status: "available",
  monitored: true,
  sizeOnDisk: 0,
};
const movie: MediaItem = {
  id: "movie:1",
  kind: "movie",
  title: "Arrival",
  year: 2016,
  overview: "",
  poster: "",
  genres: [],
  added: "2026-01-01",
  status: "available",
  targets: [target],
};
const defaults: Parameters<typeof useLibraryView>[1] = {
  category: "library",
  status: "all",
  instanceFilter: "all",
  quality: "all",
  sort: "recent",
  sortDirection: "desc",
};
const clients: QueryClient[] = [];

function setup(items: MediaItem[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  client.setQueryData(libraryQuery.queryKey, { items, errors: [] });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    (filters) => useLibraryView(useLibrary().data?.items ?? [], filters),
    { wrapper, initialProps: defaults },
  );
  return { client, ...hook };
}

afterEach(async () => {
  cleanup();
  for (const client of clients.splice(0)) {
    await Promise.all(
      Object.values(getCollections(client)).map((collection) =>
        collection.cleanup(),
      ),
    );
    client.clear();
  }
});

describe("useLibraryView", () => {
  it("counts the whole category regardless of instance, quality, or availability filters", async () => {
    const items: MediaItem[] = [
      movie,
      { ...movie, id: "movie:2", status: "downloading" },
      {
        ...movie,
        id: "movie:3",
        status: "missing",
        targets: [{ ...target, qualityProfile: "4K" }],
      },
      {
        ...movie,
        id: "movie:4",
        status: "partial",
        targets: [{ ...target, instanceId: "b" }],
      },
      { ...movie, id: "series:1", kind: "series", status: "missing" },
    ];
    const { result, rerender } = setup(items);
    await waitFor(() => expect(result.current.filtered).toHaveLength(5));
    expect(result.current.totalCount).toBe(5);
    const filters = {
      ...defaults,
      category: "movies" as const,
      instanceFilter: "a",
      quality: "HD",
    };
    rerender({ ...filters, status: "available" });
    await waitFor(() =>
      expect(result.current.filtered.map((item) => item.id)).toEqual([
        movie.id,
      ]),
    );
    expect(result.current.totalCount).toBe(4);
    rerender({ ...filters, status: "downloading" });
    await waitFor(() =>
      expect(result.current.filtered.map((item) => item.id)).toEqual([
        "movie:2",
      ]),
    );
    expect(result.current.totalCount).toBe(4);
    rerender({ ...filters, category: "shows", status: "available" });
    await waitFor(() => expect(result.current.filtered).toHaveLength(0));
    expect(result.current.totalCount).toBe(1);
    rerender({ ...filters, category: "library", status: "available" });
    await waitFor(() => expect(result.current.filtered).toHaveLength(1));
    expect(result.current.totalCount).toBe(5);
  });

  it("requires instance and quality to match the same target without narrowing the total", async () => {
    const split = {
      ...movie,
      targets: [target, { ...target, instanceId: "b", qualityProfile: "4K" }],
    };
    const { result, rerender } = setup([split]);
    await waitFor(() => expect(result.current.filtered).toHaveLength(1));
    rerender({ ...defaults, instanceFilter: "a", quality: "4K" });
    await waitFor(() => expect(result.current.filtered).toHaveLength(0));
    expect(result.current.filterCount).toBe(2);
    expect(result.current.qualities).toEqual(["4K", "HD"]);
    expect(result.current.totalCount).toBe(1);
    rerender({ ...defaults, instanceFilter: "b", quality: "4K" });
    await waitFor(() => expect(result.current.filtered).toHaveLength(1));
    expect(result.current.totalCount).toBe(1);
  });

  it("includes partial and missing items and intersects category with availability", async () => {
    const partial: MediaItem = { ...movie, id: "movie:2", status: "partial" };
    const missing: MediaItem = {
      ...movie,
      id: "series:1",
      kind: "series",
      status: "missing",
    };
    const downloading: MediaItem = {
      ...movie,
      id: "movie:3",
      status: "downloading",
    };
    const { result, rerender } = setup([movie, partial, missing, downloading]);
    await waitFor(() => expect(result.current.filtered).toHaveLength(4));
    rerender({ ...defaults, status: "incomplete" });
    await waitFor(() =>
      expect(result.current.filtered.map((item) => item.id)).toEqual([
        partial.id,
        missing.id,
      ]),
    );
    rerender({ ...defaults, category: "missing" });
    await waitFor(() =>
      expect(result.current.filtered.map((item) => item.id)).toEqual([
        partial.id,
        missing.id,
      ]),
    );
    expect(result.current.filterCount).toBe(0);
    expect(result.current.totalCount).toBe(2);
    rerender({ ...defaults, category: "movies", status: "incomplete" });
    await waitFor(() =>
      expect(result.current.filtered.map((item) => item.id)).toEqual([
        partial.id,
      ]),
    );
    rerender({ ...defaults, category: "shows" });
    expect(result.current.totalCount).toBe(1);
    await waitFor(() =>
      expect(result.current.filtered.map((item) => item.id)).toEqual([
        missing.id,
      ]),
    );
    rerender({ ...defaults, status: "downloading" });
    await waitFor(() =>
      expect(result.current.filtered.map((item) => item.id)).toEqual([
        downloading.id,
      ]),
    );
    expect(result.current.totalCount).toBe(4);
  });

  it.each([
    "recent",
    "title",
    "year",
    "rating",
  ] as const)("preserves refreshed response order for %s ties", async (sort) => {
    const other = { ...movie, id: "movie:2" };
    const { client, result, rerender } = setup([movie, other]);
    rerender({ ...defaults, sort });
    await waitFor(() =>
      expect(result.current.filtered.map((item) => item.id)).toEqual([
        movie.id,
        other.id,
      ]),
    );
    act(() =>
      client.setQueryData(libraryQuery.queryKey, {
        items: [other, movie],
        errors: [],
      }),
    );
    await waitFor(() =>
      expect(result.current.filtered.map((item) => item.id)).toEqual([
        other.id,
        movie.id,
      ]),
    );
  });

  it.each([
    ["recent", ["movie:2", "movie:1"]],
    ["title", ["movie:1", "movie:2"]],
    ["year", ["movie:2", "movie:1"]],
    ["rating", ["movie:2", "movie:1"]],
  ] as const)("sorts by %s", async (sort, ids) => {
    const other = {
      ...movie,
      id: "movie:2",
      title: "Dune",
      year: 2021,
      added: "2026-02-01",
      rating: 8,
    };
    const { result, rerender } = setup([movie, other]);
    rerender({
      ...defaults,
      sort,
      sortDirection: sort === "title" ? "asc" : "desc",
    });
    await waitFor(() =>
      expect(result.current.filtered.map((item) => item.id)).toEqual(ids),
    );
    rerender({
      ...defaults,
      sort,
      sortDirection: sort === "title" ? "desc" : "asc",
    });
    await waitFor(() =>
      expect(result.current.filtered.map((item) => item.id)).toEqual(
        [...ids].reverse(),
      ),
    );
  });
});
