import type { QueryFunctionContext } from "@tanstack/react-query";
import { api } from "./client";
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
  const response = await api<Versioned<T>>(path, { signal });
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
