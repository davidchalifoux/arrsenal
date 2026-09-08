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
import type { RealtimeEvent } from "@/lib/realtime-events";

mock.module("server-only", () => ({}));
const listeners = new Set<(event: RealtimeEvent) => void>();
mock.module("@/lib/server/realtime", () => ({
  subscribeRealtime(listener: (event: RealtimeEvent) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
}));
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

it("revokes an established stream after logout before forwarding another event", async () => {
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
  while (!initial.includes("event: invalidate")) {
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
  for (const listener of listeners)
    listener({ instanceId: "private-instance", topics: ["queue"] });
  let remainder = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    remainder += decoder.decode(chunk.value);
  }
  expect(remainder).toContain("event: auth-required");
  expect(remainder).not.toContain("private-instance");
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
