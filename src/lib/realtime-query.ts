import type { QueryFunctionContext } from "@tanstack/react-query";
import { api } from "./client";
import { awaitBootstrap } from "./realtime-bootstrap";
import type { RealtimeVersion, Versioned } from "./realtime-events";

export function realtimeVersion(data: unknown): RealtimeVersion | undefined {
  if (!data || typeof data !== "object" || !("_realtime" in data)) return;
  const version = data._realtime;
  if (
    version &&
    typeof version === "object" &&
    "epoch" in version &&
    typeof version.epoch === "string" &&
    "revision" in version &&
    typeof version.revision === "number" &&
    Number.isSafeInteger(version.revision) &&
    version.revision >= 0
  )
    return version as RealtimeVersion;
}

// Keep the envelope intact, including its revision, without requiring callers
// that seed the cache with local data to manufacture server metadata.
export async function realtimeQuery<T>(
  { client, queryKey, signal }: QueryFunctionContext,
  path: string,
): Promise<T> {
  const startedState = client.getQueryState(queryKey);
  const startedWith =
    realtimeVersion(startedState?.error) ?? realtimeVersion(startedState?.data);
  // On a first load (no data yet), take the live-update stream's snapshot
  // instead of asking the server to build the same response again.
  const streamed =
    queryKey.length === 1 && startedState?.data === undefined
      ? ((await awaitBootstrap(String(queryKey[0]), signal)) as
          | Versioned<T>
          | undefined)
      : undefined;
  // Canceled while waiting (for example by a streamed error): stop here.
  signal.throwIfAborted();
  const response = streamed ?? (await api<Versioned<T>>(path, { signal }));
  const cached = client.getQueryData<T>(queryKey);
  const error = client.getQueryState(queryKey)?.error;
  const current = realtimeVersion(error) ?? realtimeVersion(cached);
  const incoming = realtimeVersion(response);
  if (
    current &&
    incoming &&
    (current.epoch === incoming.epoch
      ? current.revision > incoming.revision
      : current.epoch !== startedWith?.epoch)
  ) {
    if (error) throw error;
    if (cached !== undefined) return cached;
  }
  return response;
}
