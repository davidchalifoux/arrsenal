import { useMemo } from "react";
import { selectLibraryView } from "@/lib/library-selectors";
import type { MediaItem } from "@/lib/types";

export type {
  LibraryCategory,
  LibraryLayout,
  LibrarySort,
  LibrarySortDirection,
  LibraryStatus,
} from "@/lib/library-selectors";

export function useLibraryView(
  items: readonly MediaItem[],
  {
    category,
    status,
    instanceFilter,
    quality,
    sort,
    sortDirection,
    filter,
  }: Parameters<typeof selectLibraryView>[1],
) {
  return useMemo(
    () =>
      selectLibraryView(items, {
        category,
        status,
        instanceFilter,
        quality,
        sort,
        sortDirection,
        filter,
      }),
    [
      items,
      category,
      status,
      instanceFilter,
      quality,
      sort,
      sortDirection,
      filter,
    ],
  );
}
