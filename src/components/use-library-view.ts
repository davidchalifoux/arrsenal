import { useLiveQuery } from "@tanstack/react-db";
import { useClientReady, useCollections } from "@/lib/collections";
import type { MediaItem } from "@/lib/types";

export type LibraryCategory = "library" | "movies" | "shows" | "missing";
export type LibraryStatus = "all" | "available" | "incomplete" | "downloading";
export type LibrarySort = "recent" | "title" | "year" | "rating";
export type LibrarySortDirection = "asc" | "desc";
export type LibraryLayout = "grid" | "list";

export function useLibraryView(
  items: MediaItem[],
  {
    category,
    status,
    instanceFilter,
    quality,
    sort,
    sortDirection,
  }: {
    category: LibraryCategory;
    status: LibraryStatus;
    instanceFilter: string;
    quality: string;
    sort: LibrarySort;
    sortDirection: LibrarySortDirection;
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
  function inCategory(item: MediaItem) {
    if (category === "movies" && item.kind !== "movie") return false;
    if (category === "shows" && item.kind !== "series") return false;
    if (
      category === "missing" &&
      item.status !== "partial" &&
      item.status !== "missing"
    )
      return false;
    return true;
  }
  const totalCount = items.filter(inCategory).length;
  function inScope(item: MediaItem) {
    return (
      inCategory(item) &&
      item.targets.some(
        (target) =>
          (instanceFilter === "all" || target.instanceId === instanceFilter) &&
          (quality === "all" || target.qualityProfile === quality),
      )
    );
  }
  const { data: matching, isReady } = useLiveQuery({
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
            if (!inScope(item)) return false;
            if (
              status !== "all" &&
              (status === "incomplete"
                ? !["partial", "missing"].includes(item.status)
                : item.status !== status)
            )
              return false;
            return true;
          })
        : undefined,
  });
  // DB insertion order can differ from response order after a refresh.
  const positions = new Map(items.map((item, index) => [item.id, index]));
  const filtered = [...(matching ?? [])].sort(
    (a, b) =>
      (sortDirection === "asc" ? 1 : -1) *
        (sort === "title"
          ? a.title.localeCompare(b.title)
          : sort === "year"
            ? a.year - b.year
            : sort === "rating"
              ? (a.rating ?? 0) - (b.rating ?? 0)
              : a.added.localeCompare(b.added)) ||
      (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0),
  );
  const filterCount =
    Number(instanceFilter !== "all") +
    Number(quality !== "all") +
    Number(status !== "all");

  return {
    filtered,
    totalCount,
    qualities,
    filterCount,
    isReady,
  };
}
