import "server-only";
import type { MediaItem } from "../types";
import { mergeMedia } from "./media";

// Aggregate only changed contributions. A media resource update retains all
// unaffected merged entities, including titles shared by several instances.
export function createLibraryMerger() {
  let previous = new Map<string, { sources: MediaItem[]; item: MediaItem }>();
  return (items: MediaItem[]): MediaItem[] => {
    const groups = new Map<string, MediaItem[]>();
    for (const item of items) {
      const group = groups.get(item.id);
      if (group) group.push(item);
      else groups.set(item.id, [item]);
    }
    const next = new Map<string, { sources: MediaItem[]; item: MediaItem }>();
    for (const [id, sources] of groups) {
      const cached = previous.get(id);
      next.set(
        id,
        cached &&
          cached.sources.length === sources.length &&
          cached.sources.every((source, index) => source === sources[index])
          ? cached
          : { sources, item: mergeMedia(sources)[0] },
      );
    }
    previous = next;
    return [...next.values()].map(({ item }) => item);
  };
}
