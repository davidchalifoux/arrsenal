import { type FilterDefinition, matchesFilter } from "./library-filters";
import type {
  LibraryResponse,
  MediaItem,
  MediaKind,
  MediaTarget,
} from "./types";

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
export const librarySorts = [
  "recent",
  "title",
  "year",
  "rating",
  "size",
  "episodes",
  "monitored",
] as const;
export type LibrarySort = (typeof librarySorts)[number];
export type LibrarySortDirection = "asc" | "desc";
export type LibraryLayout = "grid" | "list";

export function mediaSize(item: MediaItem) {
  return item.targets.reduce((total, target) => total + target.sizeOnDisk, 0);
}

/** Episodes without a file across targets; null for movies or unknown counts. */
export function missingEpisodes(item: MediaItem) {
  if (item.kind !== "series") return null;
  let count = 0;
  let missing = 0;
  for (const target of item.targets) {
    count += target.episodeCount ?? 0;
    missing += Math.max(
      0,
      (target.episodeCount ?? 0) - (target.episodeFileCount ?? 0),
    );
  }
  return count ? missing : null;
}

export type MonitorState = "monitored" | "partial" | "unmonitored";

/**
 * How much of a target the instance is still watching. A monitored show
 * counts as partial when only some of its regular seasons are monitored.
 */
export function targetMonitoring(target: MediaTarget): {
  state: MonitorState;
  label: string;
  share: number;
} {
  if (!target.monitored)
    return { state: "unmonitored", label: "Unmonitored", share: 0 };
  const seasons = target.seasonCount ?? 0;
  const monitored = target.monitoredSeasonCount ?? seasons;
  if (!seasons || monitored >= seasons)
    return { state: "monitored", label: "Monitored", share: 1 };
  return {
    state: "partial",
    label: `${monitored} of ${seasons} seasons`,
    share: monitored / seasons,
  };
}

export function mediaMonitoring(item: MediaItem) {
  const targets = item.targets.map(targetMonitoring);
  if (targets.length === 1) return targets[0];
  const share = targets.length
    ? targets.reduce((total, target) => total + target.share, 0) /
      targets.length
    : 0;
  if (targets.length && targets.every((target) => target.state === "monitored"))
    return { state: "monitored" as const, label: "Monitored", share };
  if (targets.every((target) => target.state === "unmonitored"))
    return { state: "unmonitored" as const, label: "Unmonitored", share };
  return { state: "partial" as const, label: "Partly monitored", share };
}

const monitorRank: Record<MonitorState, number> = {
  unmonitored: 0,
  partial: 1,
  monitored: 2,
};

function compareMedia(a: MediaItem, b: MediaItem, sort: LibrarySort) {
  switch (sort) {
    case "title":
      return a.title.localeCompare(b.title);
    case "year":
      return a.year - b.year;
    case "rating":
      return (a.rating ?? 0) - (b.rating ?? 0);
    case "size":
      return mediaSize(a) - mediaSize(b);
    case "episodes":
      return (missingEpisodes(a) ?? 0) - (missingEpisodes(b) ?? 0);
    case "monitored": {
      const left = mediaMonitoring(a);
      const right = mediaMonitoring(b);
      return (
        monitorRank[left.state] - monitorRank[right.state] ||
        left.share - right.share
      );
    }
    case "recent":
      return a.added.localeCompare(b.added);
  }
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
    filter,
  }: {
    filter?: FilterDefinition | null;
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
  const now = Date.now();
  function inScope(item: MediaItem) {
    return (
      inCategory(item) &&
      (!filter || matchesFilter(item, filter, now)) &&
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
    .sort((a, b) => {
      // Titles without episodes (movies) stay last in either direction.
      if (sort === "episodes") {
        const left = missingEpisodes(a) === null;
        const right = missingEpisodes(b) === null;
        if (left !== right) return left ? 1 : -1;
      }
      return (sortDirection === "asc" ? 1 : -1) * compareMedia(a, b, sort);
    });
  const filterCount =
    Number(!!filter) +
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
