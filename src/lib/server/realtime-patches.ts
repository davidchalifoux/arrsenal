import "server-only";

import { isDeepStrictEqual } from "node:util";
import {
  type RealtimePatch,
  type RealtimeQueryKey,
  type RealtimeSnapshot,
  type RealtimeVersion,
  realtimeInstanceSchema,
  realtimeMediaSchema,
  realtimePatchSchema,
  realtimeQueueItemSchema,
  realtimeSnapshotSchema,
} from "../realtime-events";
import { type CoreData, realtimeRowKey } from "../realtime-patches";

// Called once per publication, never once per connected browser. Comparing
// fields lets queue progress and library status travel without static metadata.
export function createRealtimePatch(
  previous: RealtimeSnapshot | undefined,
  next: RealtimeSnapshot,
): RealtimePatch | undefined {
  if (
    !previous ||
    !("data" in previous) ||
    !("data" in next) ||
    previous.version.epoch !== next.version.epoch ||
    previous.queryKey[0] !== next.queryKey[0] ||
    !["library", "queue", "instances"].includes(next.queryKey[0])
  )
    return;
  const topic = next.queryKey[0];
  const field = topic === "instances" ? "instances" : "items";
  const oldData = previous.data as CoreData;
  const newData = next.data as CoreData;
  const before = oldData[field] ?? [];
  const after = newData[field] ?? [];
  const oldRows = new Map(
    before.map((item) => [realtimeRowKey(topic, item), item]),
  );
  const nextKeys = after.map((item) => realtimeRowKey(topic, item));
  const nextIds = new Set(nextKeys);
  if (oldRows.size !== before.length || nextIds.size !== after.length) return;
  const removed = [...oldRows.keys()].filter((key) => !nextIds.has(key));
  const added: object[] = [];
  const updated: {
    key: string;
    set: Record<string, unknown>;
    unset: string[];
  }[] = [];
  for (const item of after) {
    const key = realtimeRowKey(topic, item);
    const old = oldRows.get(key);
    if (!old) {
      added.push(item);
      continue;
    }
    if (old === item) continue;
    const left = old as Record<string, unknown>;
    const right = item as Record<string, unknown>;
    const set: Record<string, unknown> = {};
    const unset: string[] = [];
    for (const field of new Set([
      ...Object.keys(left),
      ...Object.keys(right),
    ])) {
      if (isDeepStrictEqual(left[field], right[field])) continue;
      if (right[field] === undefined) unset.push(field);
      else set[field] = right[field];
    }
    if (Object.keys(set).length || unset.length)
      updated.push({ key, set, unset });
  }
  const naturalOrder = [...oldRows.keys()]
    .filter((key) => nextIds.has(key))
    .concat(added.map((item) => realtimeRowKey(topic, item)));
  const { [field]: _rows, ...metadata } = newData;
  return realtimePatchSchema.parse({
    queryKey: next.queryKey,
    version: next.version,
    baseRevision: previous.version.revision,
    added,
    updated,
    removed,
    metadata,
    ...(isDeepStrictEqual(naturalOrder, nextKeys) ? {} : { order: nextKeys }),
  });
}

export function unchangedPatch(
  previous: RealtimeSnapshot | undefined,
  patch: RealtimePatch,
): boolean {
  if (!previous || !("data" in previous)) return false;
  const field = patch.queryKey[0] === "instances" ? "instances" : "items";
  const { [field]: _rows, ...metadata } = previous.data as CoreData;
  return (
    !patch.added.length &&
    !patch.updated.length &&
    !patch.removed.length &&
    !patch.order &&
    isDeepStrictEqual(metadata, patch.metadata)
  );
}

const frames = new WeakMap<object, Map<string, Uint8Array>>();
const encoder = new TextEncoder();
// Snapshots/patches are immutable publications shared by every subscriber.
// Weak keys release encoded bytes when the publication is no longer retained.
export function encodeRealtimeFrame(event: string, data: object): Uint8Array {
  if (event !== "snapshot" && event !== "patch")
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  let encoded = frames.get(data);
  if (!encoded) {
    encoded = new Map();
    frames.set(data, encoded);
  }
  let bytes = encoded.get(event);
  if (!bytes) {
    bytes = encoder.encode(
      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
    );
    encoded.set(event, bytes);
  }
  return bytes;
}

// Parsing the envelope must not deep-clone every unchanged media row on each
// publication. Normalized rows are immutable; validate each new identity once.
const normalized = new WeakMap<object, { topic: string; row: object }>();
export function parseSnapshot(input: {
  queryKey: RealtimeQueryKey;
  version: RealtimeVersion;
  data: unknown;
}): RealtimeSnapshot {
  const topic = input.queryKey[0];
  const schema =
    topic === "library"
      ? realtimeMediaSchema
      : topic === "queue"
        ? realtimeQueueItemSchema
        : topic === "instances"
          ? realtimeInstanceSchema
          : undefined;
  if (!schema) return realtimeSnapshotSchema.parse(input);
  const field = topic === "instances" ? "instances" : "items";
  const data = input.data as Record<string, unknown>;
  if (!data || !Array.isArray(data[field]))
    return realtimeSnapshotSchema.parse(input);
  if (topic === "instances" && data[field].length > 32)
    return realtimeSnapshotSchema.parse(input);
  const envelope = realtimeSnapshotSchema.parse({
    ...input,
    data: { ...data, [field]: [] },
  });
  if (!("data" in envelope)) return envelope;
  const items = (data[field] as unknown[]).map((value) => {
    if (!value || typeof value !== "object") return schema.parse(value);
    const cached = normalized.get(value);
    if (cached?.topic === topic) return cached.row;
    const row = schema.parse(value);
    normalized.set(value, { topic, row });
    return row;
  });
  return {
    ...envelope,
    data: { ...envelope.data, [field]: items },
  } as RealtimeSnapshot;
}
