import "server-only";

import {
  HttpTransportType,
  type HubConnection,
  HubConnectionBuilder,
  LogLevel,
} from "@microsoft/signalr";
import WebSocket from "ws";
import {
  type RealtimeEvent,
  type RealtimeTopic,
  realtimeTopics,
} from "../realtime-events";
import { row } from "./arr";
import { type InstanceConfig, readInstances } from "./config";

type Listener = (event: RealtimeEvent) => void;
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
};

const refreshInterval = 5_000;
const openingTimeout = 10_000;
const closeTimeout = 1_000;
const coalesceInterval = 100;
const mediaTopics: RealtimeTopic[] = ["library", "episodes", "calendar"];
const importTopics: RealtimeTopic[] = ["queue", ...mediaTopics];
const queueTopics: RealtimeTopic[] = ["queue", "episodes"];
const instanceTopics: RealtimeTopic[] = ["instances"];
const optionTopics: RealtimeTopic[] = ["options"];

function messageTopics(message: unknown): readonly RealtimeTopic[] | undefined {
  const value = row(message);
  // Read only the allowlisted discriminator/status; never retain upstream bodies.
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
  const pending = new Map<string | undefined, Set<RealtimeTopic>>();
  let flushTimer: Timer | undefined;
  let refreshTimer: Timer | undefined;
  let reconciling = false;
  let reconcileRequested = false;
  let generation = 0;

  function current(entry: InstanceConnection) {
    return listeners.size > 0 && connections.get(entry.instance.id) === entry;
  }

  function enqueue(
    instanceId: string | undefined,
    topics: readonly RealtimeTopic[],
  ) {
    if (!listeners.size) return;
    let accumulated = pending.get(instanceId);
    if (!accumulated) {
      accumulated = new Set();
      pending.set(instanceId, accumulated);
    }
    for (const topic of topics) accumulated.add(topic);
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = undefined;
      const events = [...pending];
      pending.clear();
      for (const [id, topics] of events) {
        if (id !== undefined && !connections.has(id)) continue;
        const event: RealtimeEvent = {
          ...(id === undefined ? {} : { instanceId: id }),
          topics: [...topics],
        };
        for (const listener of listeners) {
          try {
            listener(event);
          } catch {
            // One closed browser stream must not interrupt other subscribers.
          }
        }
      }
    }, coalesceInterval);
    flushTimer.unref();
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
    pending.delete(entry.instance.id);
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
        if (topics) enqueue(entry.instance.id, topics);
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
          // Include initial opens: REST reads may have raced the connection.
          enqueue(entry.instance.id, realtimeTopics);
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
      const configured = new Map(
        instances.map((instance) => [instance.id, instance]),
      );
      let changed = false;
      for (const entry of connections.values()) {
        const instance = configured.get(entry.instance.id);
        if (
          !instance ||
          instance.url !== entry.instance.url ||
          instance.apiKey !== entry.instance.apiKey ||
          instance.kind !== entry.instance.kind
        ) {
          remove(entry);
          changed = true;
        } else {
          if (entry.instance.name !== instance.name) changed = true;
          entry.instance = instance;
        }
      }
      for (const instance of instances) {
        if (connections.has(instance.id)) continue;
        const entry: InstanceConnection = { instance, failures: 0 };
        connections.set(instance.id, entry);
        connect(entry);
        changed = true;
      }
      if (changed) enqueue(undefined, realtimeTopics);
    } catch {
      // A transient config read failure must not kill existing connections or
      // permanently disable discovery. Keep the last validated configuration.
    } finally {
      reconciling = false;
      if (listeners.size) {
        refreshTimer = setTimeout(
          () => {
            refreshTimer = undefined;
            void reconcile();
          },
          reconcileRequested ? 0 : refreshInterval,
        );
        refreshTimer.unref();
      }
    }
  }

  return {
    subscribe(listener: Listener) {
      // A wrapper makes duplicate subscriptions of the same callback independent.
      const subscription: Listener = (event) => listener(event);
      listeners.add(subscription);
      if (listeners.size === 1) {
        generation++;
        void reconcile();
      }
      return () => {
        if (!listeners.delete(subscription) || listeners.size) return;
        generation++;
        clearTimeout(refreshTimer);
        clearTimeout(flushTimer);
        refreshTimer = undefined;
        flushTimer = undefined;
        reconcileRequested = false;
        pending.clear();
        for (const entry of connections.values()) remove(entry);
      };
    },
  };
}

const state = globalThis as typeof globalThis & {
  __arrsenalRealtime?: RealtimeManager;
};
state.__arrsenalRealtime ??= createManager();
const manager = state.__arrsenalRealtime;

export function subscribeRealtime(listener: Listener): () => void {
  return manager.subscribe(listener);
}
