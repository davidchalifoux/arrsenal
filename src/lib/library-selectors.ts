import type { LibraryResponse, MediaItem, MediaKind } from "./types";

// Project the shared response without materializing a separate entity store.
export function selectLibraryMedia(
  data: LibraryResponse,
  mediaId: string,
  kind: MediaKind,
) {
  return {
    media: data.items.find((item) => item.id === mediaId && item.kind === kind),
    errors: data.errors,
    loadingInstanceIds: data.loadingInstanceIds,
  };
}

export type LibraryCategory = "library" | "movies" | "shows" | "missing";
export type LibraryStatus = "all" | "available" | "incomplete" | "downloading";
export type LibrarySort = "recent" | "title" | "year" | "rating" | "size";
export type LibrarySortDirection = "asc" | "desc";
export type LibraryLayout = "grid" | "list";

export function mediaSize(item: MediaItem) {
  return item.targets.reduce((total, target) => total + target.sizeOnDisk, 0);
}

function matchesStatus(item: MediaItem, status: LibraryStatus) {
  return (
    status === "all" ||
    (status === "incomplete"
      ? item.status === "partial" || item.status === "missing"
      : item.status === status)
  );
}

export function selectLibraryView(
  items: readonly MediaItem[],
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
  // Filtering preserves response order; stable sorting keeps that order for ties.
  const scoped = items.filter(inScope);
  const statusCounts = {
    all: scoped.length,
    available: scoped.filter((item) => matchesStatus(item, "available")).length,
    incomplete: scoped.filter((item) => matchesStatus(item, "incomplete"))
      .length,
    downloading: scoped.filter((item) => matchesStatus(item, "downloading"))
      .length,
  } satisfies Record<LibraryStatus, number>;
  const filtered = scoped
    .filter((item) => matchesStatus(item, status))
    .sort(
      (a, b) =>
        (sortDirection === "asc" ? 1 : -1) *
        (sort === "title"
          ? a.title.localeCompare(b.title)
          : sort === "year"
            ? a.year - b.year
            : sort === "rating"
              ? (a.rating ?? 0) - (b.rating ?? 0)
              : sort === "size"
                ? mediaSize(a) - mediaSize(b)
                : a.added.localeCompare(b.added)),
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
    statusCounts,
  };
}
