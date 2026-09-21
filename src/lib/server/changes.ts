import "server-only";

import type { RealtimeEvent, RealtimeTopic } from "../realtime-events";
import type { InstanceConfig } from "./config";
import { updateSnapshots } from "./realtime-snapshots";

type Listener = (event: RealtimeEvent) => void;
const state = globalThis as typeof globalThis & {
  __arrsenalResourceChanges?: Set<Listener>;
};
state.__arrsenalResourceChanges ??= new Set();
const listeners = state.__arrsenalResourceChanges;
const pageTopics: readonly RealtimeTopic[] = [
  "episodes",
  "calendar",
  "options",
];

// The consistency boundary is independent of the lifetime of a browser stream
// or upstream connection. Both local writes and SignalR notifications use it.
export function publishInstanceChange(
  instance: InstanceConfig,
  message: unknown,
  topics: readonly RealtimeTopic[],
  remoteId?: number,
) {
  updateSnapshots(instance, message, topics, remoteId);
  const affected = topics.filter((topic) => pageTopics.includes(topic));
  if (!affected.length) return;
  const event: RealtimeEvent = {
    instanceId: instance.id,
    ...(remoteId === undefined ? {} : { remoteId }),
    topics: affected,
  };
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // A closed transport cannot change a write's outcome or starve its peers.
    }
  }
}

export function subscribeResourceChanges(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
