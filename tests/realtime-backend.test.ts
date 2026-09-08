import {
  afterEach,
  beforeEach,
  expect,
  it,
  mock,
  onTestFinished,
} from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  RealtimeEvent,
  RealtimeSnapshot,
  RealtimeStatus,
} from "@/lib/realtime-events";

mock.module("server-only", () => ({}));
type Subscriber = {
  snapshot: (event: RealtimeSnapshot) => void;
  status: (status: RealtimeStatus) => void;
  invalidate: (event: RealtimeEvent) => void;
};
const listeners = new Set<Subscriber>();
let onSubscribe: (() => void) | undefined;
mock.module("@/lib/server/realtime", () => ({
  subscribeRealtime(
    status: Subscriber["status"],
    snapshot: Subscriber["snapshot"],
    invalidate: Subscriber["invalidate"],
  ) {
    const listener = { snapshot, status, invalidate };
    listeners.add(listener);
    status({
      instances: [{ instanceId: "existing-instance", status: "disconnected" }],
    });
    onSubscribe?.();
    return () => {
      listeners.delete(listener);
    };
  },
}));
// The mocked upstream must be installed before the route modules are evaluated.
const events = await import("@/app/api/events/route");
const account = await import("@/app/api/auth/route");
const logout = await import("@/app/api/auth/logout/route");

let directory: string;
const previous = process.env.ARRSENAL_CONFIG_DIR;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "arrsenal-events-"));
  process.env.ARRSENAL_CONFIG_DIR = directory;
});
afterEach(async () => {
  listeners.clear();
  onSubscribe = undefined;
  if (previous === undefined) delete process.env.ARRSENAL_CONFIG_DIR;
  else process.env.ARRSENAL_CONFIG_DIR = previous;
  await rm(directory, { recursive: true, force: true });
});

async function enableAuth() {
  const response = await account.POST(
    new Request("http://arrsenal.test/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://arrsenal.test",
      },
      body: JSON.stringify({ username: "owner", password: "secret-password" }),
    }),
  );
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Missing session cookie");
  return cookie;
}

it("rejects unauthenticated and cross-site streams before subscribing upstream", async () => {
  const cookie = await enableAuth();
  const denied = await events.GET(
    new Request("http://arrsenal.test/api/events"),
  );
  expect(denied.status).toBe(401);
  expect(listeners.size).toBe(0);
  const crossSite = await events.GET(
    new Request("http://arrsenal.test/api/events", {
      headers: { Cookie: cookie, "Sec-Fetch-Site": "cross-site" },
    }),
  );
  expect(crossSite.status).toBe(403);
  expect(listeners.size).toBe(0);
});

it.each([
  "snapshot",
  "status",
  "invalidate",
] as const)("revokes an established stream before forwarding %s after logout", async (kind) => {
  const cookie = await enableAuth();
  const response = await events.GET(
    new Request("http://arrsenal.test/api/events", {
      headers: { Cookie: cookie },
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/event-stream");
  if (!response.body) throw new Error("Missing event stream");
  const reader = response.body.getReader();
  onTestFinished(() => reader.cancel());
  const decoder = new TextDecoder();
  let initial = "";
  while (
    !initial.includes("event: invalidate") ||
    !initial.includes("event: status")
  ) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error("Stream closed before initial resync");
    initial += decoder.decode(chunk.value);
  }
  await logout.POST(
    new Request("http://arrsenal.test/api/auth/logout", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        Origin: "http://arrsenal.test",
      },
      body: "{}",
    }),
  );
  for (const listener of listeners) {
    if (kind === "snapshot") {
      listener.snapshot({
        queryKey: ["queue"],
        version: { epoch: "test", revision: 1 },
        data: {
          items: [],
          errors: [
            {
              instanceId: "private-instance",
              instanceName: "Private",
              message: "Failed",
            },
          ],
        },
      });
    } else if (kind === "invalidate") {
      listener.invalidate({
        instanceId: "private-instance",
        remoteId: 42,
        topics: ["episodes", "calendar"],
      });
    } else {
      listener.status({
        instances: [{ instanceId: "private-instance", status: "disconnected" }],
      });
    }
  }
  let remainder = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    remainder += decoder.decode(chunk.value);
  }
  expect(remainder).toContain("event: auth-required");
  expect(remainder).not.toContain("private-instance");
  expect(remainder).not.toContain("event: status");
  expect(remainder).not.toContain("event: snapshot");
  expect(remainder).not.toContain("event: invalidate");
  expect(listeners.size).toBe(0);
});

it("releases upstream subscriptions when the browser cancels the stream", async () => {
  const response = await events.GET(
    new Request("http://arrsenal.test/api/events"),
  );
  expect(listeners.size).toBe(1);
  if (!response.body) throw new Error("Missing event stream");
  await response.body.cancel();
  expect(listeners.size).toBe(0);
});

it("closes and unsubscribes when a synchronous subscription callback aborts", async () => {
  const abort = new AbortController();
  onSubscribe = () => abort.abort();
  const response = await events.GET(
    new Request("http://arrsenal.test/api/events", { signal: abort.signal }),
  );
  if (!response.body) throw new Error("Missing event stream");
  const contents = await response.text();
  expect(contents).not.toContain("event: status");
  expect(contents).not.toContain("event: invalidate");
  expect(listeners.size).toBe(0);
});

it("streams data larger than a hint without truncating the snapshot", async () => {
  const response = await events.GET(
    new Request("http://arrsenal.test/api/events"),
  );
  if (!response.body) throw new Error("Missing event stream");
  const reader = response.body.getReader();
  onTestFinished(() => reader.cancel());
  const snapshot: RealtimeSnapshot = {
    queryKey: ["queue"],
    version: { epoch: "fixture", revision: 2 },
    data: {
      items: [],
      errors: [
        {
          instanceId: "fixture",
          instanceName: "Fixture",
          message: "x".repeat(40_000),
        },
      ],
    },
  };
  for (const listener of listeners) listener.snapshot(snapshot);
  const decoder = new TextDecoder();
  let received = "";
  while (!received.includes("event: snapshot")) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error("Snapshot was dropped");
    received += decoder.decode(chunk.value);
  }
  const frame = received
    .split("\n\n")
    .find((part) => part.startsWith("event: snapshot"));
  expect(JSON.parse(frame?.split("\ndata: ")[1] ?? "null")).toEqual(snapshot);
});

async function readThrough(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  marker: string,
) {
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes(marker)) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error(`Stream closed before ${marker}`);
    text += decoder.decode(chunk.value);
  }
  return text;
}

async function openStream(signal?: AbortSignal) {
  const response = await events.GET(
    new Request("http://arrsenal.test/api/events", { signal }),
  );
  expect(response.status).toBe(200);
  if (!response.body) throw new Error("Missing event stream");
  const reader = response.body.getReader();
  onTestFinished(() => reader.cancel());
  await readThrough(reader, "event: status");
  return reader;
}

it("broadcasts core data and scoped page hints to both tabs without page snapshots", async () => {
  const first = await openStream();
  const second = await openStream();
  const hint: RealtimeEvent = {
    instanceId: "sonarr",
    remoteId: 42,
    topics: ["episodes", "calendar"],
  };
  const core: RealtimeSnapshot = {
    queryKey: ["queue"],
    version: { epoch: "fixture", revision: 2 },
    data: { items: [], errors: [] },
  };
  for (const listener of listeners) {
    listener.snapshot({
      queryKey: ["calendar", "2026-01-01", "2026-02-01"],
      version: { epoch: "fixture", revision: 1 },
      data: { items: [], errors: [], instanceCount: 1 },
    });
    listener.invalidate(hint);
    listener.snapshot(core);
  }
  for (const reader of [first, second]) {
    const received = await readThrough(reader, '"queryKey":["queue"]');
    expect(received).toContain(
      `event: invalidate\ndata: ${JSON.stringify(hint)}`,
    );
    expect(received).toContain(JSON.stringify(core));
    expect(received).not.toContain('"queryKey":["calendar"');
  }
});

it("coalesces hint topics for the same series while authorization is pending", async () => {
  const reader = await openStream();
  for (const listener of listeners) {
    for (const topics of [
      ["episodes"],
      ["calendar"],
      ["episodes"],
    ] as RealtimeEvent["topics"][]) {
      listener.invalidate({ instanceId: "sonarr", remoteId: 42, topics });
    }
  }
  const received = await readThrough(reader, "event: invalidate");
  const frames = received
    .split("\n\n")
    .filter((frame) => frame.startsWith("event: invalidate"));
  expect(frames).toHaveLength(1);
  expect(JSON.parse(frames[0].split("\ndata: ")[1])).toEqual({
    instanceId: "sonarr",
    remoteId: 42,
    topics: ["episodes", "calendar"],
  });
});

it("collapses an overflowing burst of series hints to bounded broad page recovery", async () => {
  const reader = await openStream();
  for (const listener of listeners) {
    for (let remoteId = 1; remoteId <= 2000; remoteId++) {
      listener.invalidate({
        instanceId: "sonarr",
        remoteId,
        topics: ["episodes"],
      });
    }
  }
  const received = await readThrough(reader, "event: invalidate");
  const frames = received
    .split("\n\n")
    .filter((frame) => frame.startsWith("event: invalidate"));
  expect(frames).toHaveLength(1);
  expect(JSON.parse(frames[0].split("\ndata: ")[1])).toEqual({
    topics: ["episodes", "calendar", "options"],
  });
});

it.each([
  "abort",
  "slow-consumer",
] as const)("releases the upstream listener after %s cleanup", async (kind) => {
  const abort = new AbortController();
  const reader = await openStream(abort.signal);
  if (kind === "abort") abort.abort();
  else {
    for (const listener of listeners) {
      listener.snapshot({
        queryKey: ["queue"],
        version: { epoch: "fixture", revision: 1 },
        data: {
          items: [],
          errors: [
            {
              instanceId: "fixture",
              instanceName: "Fixture",
              message: "x".repeat(32 * 1024 * 1024),
            },
          ],
        },
      });
    }
  }
  expect((await reader.read()).done).toBe(true);
  expect(listeners.size).toBe(0);
});
