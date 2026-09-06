import { useLiveQuery } from "@tanstack/react-db";
import { useClientReady, useCollections } from "@/lib/collections";
import type { MediaItem } from "@/lib/types";

export type LibraryCategory = "library" | "movies" | "shows" | "missing";
export type LibraryStatus = "all" | "available" | "incomplete" | "downloading";
export type LibrarySort = "recent" | "title" | "year" | "rating";
export type LibraryLayout = "grid" | "list";
export type LibraryCounts = Record<
  LibraryCategory | "available" | "downloading",
  number
>;

export function useLibraryView(
  items: MediaItem[],
  {
    category,
    status,
    instanceFilter,
    quality,
    sort,
  }: {
    category: LibraryCategory;
    status: LibraryStatus;
    instanceFilter: string;
    quality: string;
    sort: LibrarySort;
  },
) {
  const collections = useCollections();
  const clientReady = useClientReady();
  const qualities = [
    ...new Set(
      items.flatMap((item) =>
        item.targets.map((target) => target.qualityProfile),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));
  // Summary counts describe the whole library, independent of the current view.
  const counts: LibraryCounts = {
    library: items.length,
    movies: items.filter((item) => item.kind === "movie").length,
    shows: items.filter((item) => item.kind === "series").length,
    missing: items.filter(
      (item) => item.status === "partial" || item.status === "missing",
    ).length,
    available: items.filter((item) => item.status === "available").length,
    downloading: items.filter((item) => item.status === "downloading").length,
  };
  const { data: matching } = useLiveQuery({
    queryKey: [
      collections.library.id,
      "filtered",
      clientReady,
      category,
      status,
      instanceFilter,
      quality,
    ],
    query: (q) =>
      clientReady
        ? q.from({ item: collections.library }).fn.where(({ item }) => {
            if (category === "movies" && item.kind !== "movie") return false;
            if (category === "shows" && item.kind !== "series") return false;
            if (
              category === "missing" &&
              item.status !== "partial" &&
              item.status !== "missing"
            )
              return false;
            if (
              status !== "all" &&
              (status === "incomplete"
                ? !["partial", "missing"].includes(item.status)
                : item.status !== status)
            )
              return false;
            return item.targets.some(
              (target) =>
                (instanceFilter === "all" ||
                  target.instanceId === instanceFilter) &&
                (quality === "all" || target.qualityProfile === quality),
            );
          })
        : undefined,
  });
  // DB insertion order can differ from response order after a refresh.
  const positions = new Map(items.map((item, index) => [item.id, index]));
  const filtered = [...(matching ?? [])].sort(
    (a, b) =>
      (sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "year"
          ? b.year - a.year
          : sort === "rating"
            ? (b.rating ?? 0) - (a.rating ?? 0)
            : b.added.localeCompare(a.added)) ||
      (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0),
  );
  const filterCount =
    Number(instanceFilter !== "all") +
    Number(quality !== "all") +
    Number(status !== "all");

  return { filtered, counts, qualities, filterCount };
}
