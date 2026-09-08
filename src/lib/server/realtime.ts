import "server-only";

import {
  HttpTransportType,
  type HubConnection,
  HubConnectionBuilder,
  LogLevel,
} from "@microsoft/signalr";
import WebSocket from "ws";
import type {
  RealtimeEvent,
  RealtimeSnapshot,
  RealtimeStatus,
  RealtimeTopic,
} from "../realtime-events";
import { row } from "./arr";
import {
  type InstanceConfig,
  readInstances,
  subscribeInstanceChanges,
} from "./config";
import {
  reconcileSnapshots,
  refreshSnapshots,
  subscribeSnapshots,
  updateSnapshots,
} from "./realtime-snapshots";

type Listener = {
  onStatus: (status: RealtimeStatus) => void;
  onInvalidate: (event: RealtimeEvent) => void;
};
type Timer = NodeJS.Timeout;
type RealtimeManager = { subscribe(listener: Listener): () => void };
type Attempt = {
  active: boolean;
  connection?: HubConnection;
  socket?: WebSocket;
  deadline?: Timer;
};
type InstanceConnection = {
  instance: InstanceConfig;
  attempt?: Attempt;
  retry?: Timer;
  failures: number;
  status: RealtimeStatus["instances"][number]["status"];
};

const openingTimeout = 10_000;
const closeTimeout = 1_000;
const mediaTopics: RealtimeTopic[] = ["library", "episodes", "calendar"];
const importTopics: RealtimeTopic[] = ["queue", ...mediaTopics];
const queueTopics: RealtimeTopic[] = ["queue", "library", "episodes"];
const instanceTopics: RealtimeTopic[] = ["instances"];
const optionTopics: RealtimeTopic[] = ["options", "library"];
const pageTopics: RealtimeTopic[] = ["episodes", "calendar", "options"];
const maxPendingHints = 64;

function messageTopics(message: unknown): readonly RealtimeTopic[] | undefined {
  const value = row(message);
  // Only known resource categories may update the normalized snapshot store.
  switch (value.name) {
    case "queue":
    case "queue/details":
    case "queue/status":
      return queueTopics;
    case "series":
    case "movie":
    case "episode":
    case "calendar":
      return mediaTopics;
    case "episodefile":
    case "moviefile":
      return importTopics;
    case "command": {
      const status = row(row(value.body).resource).status;
      return status === "completed" || status === "failed"
        ? importTopics
        : undefined;
    }
    case "health":
    case "system":
    case "system/status":
    case "version":
      return instanceTopics;
    case "qualityprofile":
    case "qualitydefinition":
    case "languageprofile":
    case "rootfolder":
    case "tag":
    case "customformat":
      return optionTopics;
    default:
      return undefined;
  }
}

function createManager() {
  const listeners = new Set<Listener>();
  const connections = new Map<string, InstanceConnection>();
  let unsubscribeConfig: (() => void) | undefined;
  let reconciling = false;
  let reconcileRequested = false;
  let generation = 0;
  const hints = new Map<string, RealtimeEvent>();
  let hintTimer: Timer | undefined;

  function invalidate(event: RealtimeEvent) {
    if (!listeners.size || hints.has("*")) return;
    const key = event.instanceId
      ? JSON.stringify([event.instanceId, event.remoteId])
      : "*";
    if (key === "*" || (!hints.has(key) && hints.size >= maxPendingHints)) {
      hints.clear();
      hints.set("*", { topics: [...pageTopics] });
    } else {
      const pending = hints.get(key);
      if (pending) {
        for (const topic of event.topics)
          if (!pending.topics.includes(topic)) pending.topics.push(topic);
      } else hints.set(key, event);
    }
    if (hintTimer) return;
    hintTimer = setTimeout(() => {
      hintTimer = undefined;
      const batch = [...hints.values()];
      hints.clear();
      for (const event of batch) {
        for (const listener of listeners) {
          try {
            listener.onInvalidate(event);
          } catch {
            // One closed stream must not interrupt page recovery for peers.
          }
        }
      }
    }, 100);
    hintTimer.unref();
  }

  function current(entry: InstanceConnection) {
    return listeners.size > 0 && connections.get(entry.instance.id) === entry;
  }

  function snapshot(): RealtimeStatus {
    return {
      instances: [...connections.values()].map(({ instance, status }) => ({
        instanceId: instance.id,
        status,
      })),
    };
  }

  function publishStatus() {
    const status = snapshot();
    for (const listener of listeners) {
      try {
        listener.onStatus(status);
      } catch {
        // One closed browser stream must not interrupt other subscribers.
      }
    }
  }

  function setStatus(
    entry: InstanceConnection,
    status: InstanceConnection["status"],
  ) {
    if (entry.status === status) return;
    entry.status = status;
    publishStatus();
  }

  function stopAttempt(attempt: Attempt) {
    attempt.active = false;
    clearTimeout(attempt.deadline);
    // stop() alone waits for the opening transport, and ws.close() can wait 30s.
    // Terminate the tracked socket even while the HTTP upgrade is in progress.
    void attempt.connection?.stop().catch(() => {});
    if (attempt.socket && attempt.socket.readyState !== WebSocket.CLOSED) {
      attempt.socket.terminate();
    }
  }

  function remove(entry: InstanceConnection) {
    connections.delete(entry.instance.id);
    clearTimeout(entry.retry);
    if (entry.attempt) stopAttempt(entry.attempt);
  }

  function failed(entry: InstanceConnection, attempt: Attempt) {
    if (!attempt.active) return;
    stopAttempt(attempt);
    entry.attempt = undefined;
    if (!current(entry)) return;
    const delay = Math.min(1_000 * 2 ** Math.min(entry.failures++, 5), 30_000);
    entry.retry = setTimeout(() => {
      entry.retry = undefined;
      if (current(entry)) connect(entry);
    }, delay);
    entry.retry.unref();
    setStatus(entry, "disconnected");
  }

  function connect(entry: InstanceConnection) {
    const attempt: Attempt = { active: true };
    entry.attempt = attempt;
    // Explicit Node ws preserves X-Api-Key headers even when a native global
    // WebSocket exists. SignalR passes headers in its third constructor argument.
    class InstanceWebSocket extends WebSocket {
      private closeDeadline?: Timer;

      constructor(
        url: string,
        protocols?: string | string[],
        options?: WebSocket.ClientOptions,
      ) {
        if (!attempt.active || !current(entry)) {
          throw new Error("Realtime connection stopped.");
        }
        super(url, protocols, {
          ...options,
          followRedirects: false,
          handshakeTimeout: openingTimeout,
          maxPayload: 4 * 1024 * 1024,
        });
        attempt.socket = this;
        this.on("error", () => {});
        this.once("close", () => clearTimeout(this.closeDeadline));
      }

      override close(code?: number, data?: string | Buffer) {
        super.close(code, data);
        if (this.readyState !== WebSocket.CLOSED && !this.closeDeadline) {
          this.closeDeadline = setTimeout(() => this.terminate(), closeTimeout);
          this.closeDeadline.unref();
        }
      }
    }

    try {
      // WebSocket is an official runtime option stripped from SignalR's public
      // declarations. Passing the options variable preserves that constructor.
      const options = {
        transport: HttpTransportType.WebSockets,
        skipNegotiation: true,
        headers: { "X-Api-Key": entry.instance.apiKey },
        WebSocket: InstanceWebSocket,
        logger: LogLevel.None,
        logMessageContent: false,
      };
      const connection = new HubConnectionBuilder()
        .withUrl(`${entry.instance.url}/signalr/messages`, options)
        .configureLogging(LogLevel.None)
        .build();
      attempt.connection = connection;
      // One retry loop handles both failed initial starts and later disconnects.
      connection.onclose(() => failed(entry, attempt));
      connection.on("receiveMessage", (message: unknown) => {
        if (!attempt.active || !current(entry)) return;
        const topics = messageTopics(message);
        if (!topics) return;
        const value = row(message);
        const resource = row(row(value.body).resource);
        const candidate =
          entry.instance.kind !== "sonarr"
            ? undefined
            : value.name === "series"
              ? resource.id
              : value.name === "episode" || value.name === "episodefile"
                ? resource.seriesId
                : undefined;
        const remoteId =
          typeof candidate === "number" &&
          Number.isInteger(candidate) &&
          candidate > 0 &&
          candidate <= 2147483647
            ? candidate
            : undefined;
        updateSnapshots(entry.instance, message, topics, remoteId);
        const affected = topics.filter((topic) => pageTopics.includes(topic));
        if (affected.length)
          invalidate({
            instanceId: entry.instance.id,
            ...(remoteId === undefined ? {} : { remoteId }),
            topics: affected,
          });
      });
      attempt.deadline = setTimeout(
        () => failed(entry, attempt),
        openingTimeout,
      );
      attempt.deadline.unref();
      void connection.start().then(
        () => {
          if (!attempt.active || !current(entry)) return;
          clearTimeout(attempt.deadline);
          entry.failures = 0;
          setStatus(entry, "connected");
          // Include initial opens: REST reads may have raced the connection.
          refreshSnapshots(entry.instance.id);
          invalidate({
            instanceId: entry.instance.id,
            topics: [...pageTopics],
          });
        },
        () => failed(entry, attempt),
      );
    } catch {
      // Do not expose connection errors: they can contain credentials or URLs.
      failed(entry, attempt);
    }
  }

  async function reconcile() {
    if (reconciling) {
      reconcileRequested = true;
      return;
    }
    reconciling = true;
    reconcileRequested = false;
    const startedGeneration = generation;
    try {
      const instances = await readInstances();
      if (!listeners.size || generation !== startedGeneration) return;
      reconcileSnapshots(instances);
      // Discovery also covers removals and metadata-only configuration changes.
      invalidate({ topics: [...pageTopics] });
      const configured = new Map(
        instances.map((instance) => [instance.id, instance]),
      );
      let statusChanged = false;
      const added: InstanceConnection[] = [];
      for (const entry of connections.values()) {
        const instance = configured.get(entry.instance.id);
        if (
          !instance ||
          instance.url !== entry.instance.url ||
          instance.apiKey !== entry.instance.apiKey ||
          instance.kind !== entry.instance.kind
        ) {
          remove(entry);
          statusChanged = true;
        } else {
          entry.instance = instance;
        }
      }
      for (const instance of instances) {
        if (connections.has(instance.id)) continue;
        const entry: InstanceConnection = {
          instance,
          failures: 0,
          status: "connecting",
        };
        connections.set(instance.id, entry);
        added.push(entry);
        statusChanged = true;
      }
      if (statusChanged) publishStatus();
      for (const entry of added) {
        if (current(entry)) connect(entry);
      }
    } catch {
      // Keep the last validated configuration if a read fails. A subsequent
      // configuration write or a new subscription lifecycle retries discovery.
    } finally {
      reconciling = false;
      if (listeners.size && reconcileRequested) void reconcile();
    }
  }

  return {
    subscribe(listener: Listener) {
      // A separate object makes repeated callbacks independent subscriptions.
      const subscription = { ...listener };
      listeners.add(subscription);
      try {
        subscription.onStatus(snapshot());
      } catch {
        // A subscriber may already have closed while joining the manager.
      }
      if (listeners.size === 1) {
        generation++;
        unsubscribeConfig = subscribeInstanceChanges(() => {
          void reconcile();
        });
        void reconcile();
      }
      return () => {
        if (!listeners.delete(subscription) || listeners.size) return;
        generation++;
        unsubscribeConfig?.();
        unsubscribeConfig = undefined;
        reconcileRequested = false;
        clearTimeout(hintTimer);
        hintTimer = undefined;
        hints.clear();
        for (const entry of connections.values()) remove(entry);
      };
    },
  };
}

const state = globalThis as typeof globalThis & {
  __arrsenalRealtimeSnapshotsTransport?: RealtimeManager;
};
state.__arrsenalRealtimeSnapshotsTransport ??= createManager();
const manager = state.__arrsenalRealtimeSnapshotsTransport;

export function subscribeRealtime(
  onStatus: Listener["onStatus"],
  onSnapshot: (snapshot: RealtimeSnapshot) => void,
  onInvalidate: Listener["onInvalidate"],
): () => void {
  const unsubscribeSnapshots = subscribeSnapshots(onSnapshot);
  let unsubscribeTransport: () => void;
  try {
    unsubscribeTransport = manager.subscribe({ onStatus, onInvalidate });
  } catch (error) {
    unsubscribeSnapshots();
    throw error;
  }
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    unsubscribeSnapshots();
    unsubscribeTransport();
  };
}
