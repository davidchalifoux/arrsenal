import { expect, it } from "bun:test";
import {
  type RealtimeSnapshot,
  realtimePatchSchema,
} from "@/lib/realtime-events";
import { applyRealtimePatch, type CoreData } from "@/lib/realtime-patches";
import { createLibraryMerger } from "@/lib/server/library-projection";
import {
  createRealtimePatch,
  encodeRealtimeFrame,
  parseSnapshot,
  unchangedPatch,
} from "@/lib/server/realtime-patches";
import type { MediaItem, QueueItem } from "@/lib/types";

const movie: MediaItem = {
  id: "movie:tmdb:1",
  kind: "movie",
  title: "Before",
  year: 2026,
  overview: "Large static description ".repeat(1000),
  poster: "",
  genres: [],
  added: "",
  status: "available",
  targets: [],
  rating: 8,
};
const version = (revision: number) => ({ epoch: "test", revision });
function library(
  items: MediaItem[],
  revision: number,
  loadingInstanceIds?: string[],
): RealtimeSnapshot {
  return {
    queryKey: ["library"],
    version: version(revision),
    data: {
      items,
      errors: [],
      ...(loadingInstanceIds ? { loadingInstanceIds } : {}),
    },
  };
}
function roundTrip(before: RealtimeSnapshot, after: RealtimeSnapshot) {
  if (!("data" in before) || !("data" in after))
    throw new Error("Expected data");
  const patch = createRealtimePatch(before, after);
  if (!patch) throw new Error("Expected patch");
  const wire = realtimePatchSchema.parse(JSON.parse(JSON.stringify(patch)));
  const result = applyRealtimePatch(
    { ...before.data, _realtime: before.version } as CoreData,
    wire,
  );
  expect(result).toEqual({ ...after.data, _realtime: after.version });
  return { patch: wire, result };
}

it("sends a small field patch for a one-title update in a large library", () => {
  const items = Array.from({ length: 2000 }, (_, i) => ({
    ...movie,
    id: `movie:${i}`,
  }));
  const before = library(items, 1);
  const changed = items.map((item, i) =>
    i === 12 ? { ...item, status: "downloading" as const } : item,
  );
  const { patch, result } = roundTrip(before, library(changed, 7));
  expect(patch.added).toEqual([]);
  expect(patch.updated).toEqual([
    { key: "movie:12", set: { status: "downloading" }, unset: [] },
  ]);
  expect(patch.order).toBeUndefined();
  expect(JSON.stringify(patch).length).toBeLessThan(350);
  expect(result?.items?.[0]).toBe(items[0]);
  expect(items[12].status).toBe("available");
});

it("round trips insertions, removals, ordering, optional field clearing and progressive metadata", () => {
  const second = { ...movie, id: "movie:2" };
  const third = { ...movie, id: "movie:3" };
  const { rating: _rating, ...withoutRating } = movie;
  const { patch } = roundTrip(
    library([movie, second], 1, ["slow"]),
    library([third, withoutRating], 2),
  );
  expect(patch.removed).toEqual([second.id]);
  expect(patch.order).toEqual([third.id, movie.id]);
  expect(patch.updated[0].unset).toEqual(["rating"]);
  expect(patch.metadata).toEqual({ errors: [] });
});

it("keeps equal signed queue IDs isolated and omits static metadata from progress", () => {
  const row: QueueItem = {
    id: -1,
    instanceId: "a",
    instanceName: "A",
    title: "Download",
    mediaTitle: "Movie",
    kind: "movie",
    quality: "HD",
    size: 100,
    sizeleft: 90,
    status: "downloading",
    warnings: [],
    timeleft: "00:01:00",
  };
  const other = { ...row, instanceId: "b" };
  const before: RealtimeSnapshot = {
    queryKey: ["queue"],
    version: version(1),
    data: { items: [row, other], errors: [] },
  };
  const { timeleft: _timeleft, ...changed } = row;
  const after: RealtimeSnapshot = {
    queryKey: ["queue"],
    version: version(2),
    data: {
      items: [{ ...changed, sizeleft: 20 }, other],
      errors: [{ instanceId: "c", instanceName: "C", message: "offline" }],
    },
  };
  const { patch, result } = roundTrip(before, after);
  expect(patch.updated).toEqual([
    { key: '["a",-1]', set: { sizeleft: 20 }, unset: ["timeleft"] },
  ]);
  expect(result?.items?.[1]).toBe(other);
});

it("round trips instance command changes and optional error clearing", () => {
  const instance = {
    id: "a",
    name: "A",
    kind: "sonarr" as const,
    url: "http://local",
    hasApiKey: true,
    connected: false,
    error: "offline",
  };
  const before: RealtimeSnapshot = {
    queryKey: ["instances"],
    version: version(1),
    data: { instances: [instance] },
  };
  const { error: _error, ...healthy } = instance;
  const after: RealtimeSnapshot = {
    queryKey: ["instances"],
    version: version(2),
    data: { instances: [{ ...healthy, connected: true, commands: [] }] },
  };
  roundTrip(before, after);
});

it("requires a full baseline after an error or epoch change and recognizes no-op updates", () => {
  const before = library([movie], 1);
  const after = library([movie], 2);
  const patch = createRealtimePatch(before, after);
  if (!patch) throw new Error("Expected patch");
  expect(unchangedPatch(before, patch)).toBe(true);
  expect(
    createRealtimePatch(
      { queryKey: ["library"], version: version(1), error: "offline" },
      after,
    ),
  ).toBeUndefined();
  expect(
    createRealtimePatch(before, {
      ...after,
      version: { epoch: "restart", revision: 2 },
    }),
  ).toBeUndefined();
  expect(
    applyRealtimePatch(
      { items: [movie], errors: [], _realtime: version(0) },
      patch,
    ),
  ).toBeUndefined();
  expect(
    applyRealtimePatch(
      {
        items: [movie],
        errors: [],
        _realtime: { epoch: "other", revision: 1 },
      },
      patch,
    ),
  ).toBeUndefined();
});

it("rejects impossible delta identities and ordering without touching its baseline", () => {
  const before = library([movie], 1);
  const patch = createRealtimePatch(
    before,
    library([{ ...movie, title: "After" }], 2),
  );
  if (!patch) throw new Error("Expected patch");
  const data = { items: [movie], errors: [], _realtime: version(1) };
  expect(
    applyRealtimePatch(data, { ...patch, removed: ["absent"] }),
  ).toBeUndefined();
  expect(applyRealtimePatch(data, { ...patch, order: [] })).toBeUndefined();
  expect(
    applyRealtimePatch(
      data,
      realtimePatchSchema.parse({
        ...patch,
        updated: [...patch.updated, ...patch.updated],
      }),
    ),
  ).toBeUndefined();
  expect(movie.title).toBe("Before");
});

it("merges only changed per-instance contributions and retains DTO row identities", () => {
  const merge = createLibraryMerger();
  const second = { ...movie, id: "second" };
  const before = merge([movie, second]);
  const after = merge([{ ...movie, title: "New" }, second]);
  expect(after[0]).not.toBe(before[0]);
  expect(after[1]).toBe(before[1]);
  const firstSnapshot = parseSnapshot(
    library(before, 1) as Parameters<typeof parseSnapshot>[0],
  );
  const secondSnapshot = parseSnapshot(
    library(after, 2) as Parameters<typeof parseSnapshot>[0],
  );
  if (
    !("data" in firstSnapshot) ||
    !("items" in firstSnapshot.data) ||
    !("data" in secondSnapshot) ||
    !("items" in secondSnapshot.data)
  )
    throw new Error("Missing items");
  expect(secondSnapshot.data.items[1]).toBe(firstSnapshot.data.items[1]);
  expect(merge([])).toEqual([]);
});

it("validates changed DTO rows and encodes immutable publications once for all subscribers", () => {
  const snapshot = parseSnapshot({
    queryKey: ["library"],
    version: version(1),
    data: { items: [{ ...movie, apiKey: "secret" }], errors: [] },
  });
  const first = encodeRealtimeFrame("snapshot", snapshot);
  expect(encodeRealtimeFrame("snapshot", snapshot)).toBe(first);
  expect(new TextDecoder().decode(first)).not.toContain("secret");
  const hint = { topics: ["episodes"] };
  encodeRealtimeFrame("invalidate", hint);
  hint.topics.push("calendar");
  expect(
    new TextDecoder().decode(encodeRealtimeFrame("invalidate", hint)),
  ).toContain("calendar");
});
