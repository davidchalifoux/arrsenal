/**
 * First-load handoff between the live-update stream and the core REST queries.
 *
 * On connect the stream sends full snapshots of the library, queue and
 * instances. Without coordination, the page also requests the same data over
 * REST, so the server builds the (large) library response twice. While a
 * stream is connecting, core queries wait briefly for its first snapshot and
 * use it instead; they fall back to REST if the stream fails, closes, or is
 * slow. Each key hands off once; later refetches always use REST.
 */

type Delivery = (data: unknown) => void;

const bootstrapKeys = new Set(["library", "queue", "instances"]);
// How long a first-load query waits for the stream before calling REST.
export const bootstrapTimeoutMs = 2000;

let active = false;
// Keys still expecting their first stream snapshot.
const expected = new Set<string>();
// Snapshots that arrived before their query asked for them.
const early = new Map<string, unknown>();
const waiters = new Map<string, Set<Delivery>>();

/** A stream is about to connect: first core loads should wait for it. */
export function beginBootstrap() {
  active = true;
  expected.clear();
  early.clear();
  for (const key of bootstrapKeys) expected.add(key);
}

/** The stream failed or closed: release every waiter to REST. */
export function endBootstrap() {
  active = false;
  expected.clear();
  early.clear();
  for (const set of waiters.values())
    for (const deliver of set) deliver(undefined);
  waiters.clear();
}

/**
 * Hands a stream snapshot to a waiting first-load query. Returns true when a
 * query took it, in which case the query applies the data itself. Undefined
 * data (an error snapshot) only ends the handoff for that key: the caller's
 * normal path cancels waiting queries and applies the error.
 */
export function deliverBootstrap(
  key: string,
  data: unknown,
  { keep }: { keep: boolean },
): boolean {
  if (!active || !expected.has(key)) return false;
  expected.delete(key);
  if (!expected.size) active = false;
  if (data === undefined) return false;
  const set = waiters.get(key);
  waiters.delete(key);
  if (set?.size) {
    for (const deliver of set) deliver(data);
    return true;
  }
  // Only a query that doesn't exist yet may pick this up later; an existing
  // one gets the snapshot through the normal update path.
  if (keep) early.set(key, data);
  return false;
}

/**
 * Resolves with the stream's first snapshot for `key`, or undefined when the
 * caller should fetch over REST instead.
 */
export function awaitBootstrap(
  key: string,
  signal?: AbortSignal,
): Promise<unknown> {
  if (early.has(key)) {
    const data = early.get(key);
    early.delete(key);
    return Promise.resolve(data);
  }
  if (!active || !expected.has(key) || signal?.aborted)
    return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const set = waiters.get(key) ?? new Set<Delivery>();
    waiters.set(key, set);
    const finish: Delivery = (data) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      set.delete(finish);
      resolve(data);
    };
    const onAbort = () => finish(undefined);
    // A slow stream must not hold the page: give up on it for this key.
    const timer = setTimeout(() => {
      expected.delete(key);
      finish(undefined);
    }, bootstrapTimeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    set.add(finish);
  });
}
