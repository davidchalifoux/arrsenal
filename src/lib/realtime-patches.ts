import type { RealtimePatch, RealtimeVersion } from "./realtime-events";

// Queue IDs are only unique within their instance and may be negative.
export function realtimeRowKey(topic: string, value: object): string {
  const row = value as { id: string | number; instanceId?: string };
  return topic === "queue"
    ? JSON.stringify([row.instanceId, row.id])
    : String(row.id);
}

type Row = Record<string, unknown>;
export type CoreData = {
  items?: object[];
  instances?: object[];
  errors?: unknown[];
  loadingInstanceIds?: string[];
  _realtime?: RealtimeVersion;
};

// Never mutate the Query cache or accept a delta against a different baseline.
// Unchanged rows retain their identity for Query/DB structural sharing.
export function applyRealtimePatch(
  data: CoreData | undefined,
  patch: RealtimePatch,
): CoreData | undefined {
  if (
    !data ||
    data._realtime?.epoch !== patch.version.epoch ||
    data._realtime.revision !== patch.baseRevision
  )
    return;
  const topic = patch.queryKey[0];
  const field = topic === "instances" ? "instances" : "items";
  const original = data[field];
  if (!Array.isArray(original)) return;
  const rows = new Map(
    original.map((item) => [realtimeRowKey(topic, item), item]),
  );
  if (rows.size !== original.length) return;
  const touched = new Set<string>();
  for (const key of patch.removed) {
    if (touched.has(key) || !rows.delete(key)) return;
    touched.add(key);
  }
  for (const item of patch.added) {
    const key = realtimeRowKey(topic, item);
    if (touched.has(key) || rows.has(key)) return;
    touched.add(key);
    rows.set(key, item);
  }
  for (const update of patch.updated) {
    const previous = rows.get(update.key);
    if (!previous || touched.has(update.key)) return;
    touched.add(update.key);
    const next: Row = { ...previous, ...update.set };
    for (const field of update.unset) {
      if (field in update.set) return;
      delete next[field];
    }
    if (realtimeRowKey(topic, next) !== update.key) return;
    rows.set(update.key, next);
  }
  let items: object[];
  if (patch.order) {
    if (
      patch.order.length !== rows.size ||
      new Set(patch.order).size !== rows.size ||
      patch.order.some((key) => !rows.has(key))
    )
      return;
    items = patch.order.map((key) => rows.get(key) as object);
  } else items = [...rows.values()];
  // Metadata is a replacement: omitting loadingInstanceIds clears a completed
  // progressive load, just as a full REST response would.
  return { [field]: items, ...patch.metadata, _realtime: patch.version };
}
