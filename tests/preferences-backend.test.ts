import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

mock.module("server-only", () => ({}));
const { GET, PATCH } = await import("@/app/api/preferences/route");
const {
  readInstances,
  readPreferences,
  removeInstance,
  saveInstance,
  savePreferences,
  updateInstance,
} = await import("@/lib/server/config");

let directory: string;
const previousConfigDir = process.env.ARRSENAL_CONFIG_DIR;
const input = {
  name: "Movies",
  kind: "radarr" as const,
  url: "http://radarr.test",
  apiKey: "private-instance-api-key",
};
const patch = (body: unknown, headers: Record<string, string> = {}) =>
  PATCH(
    new Request("http://localhost/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "arrsenal-preferences-"));
  process.env.ARRSENAL_CONFIG_DIR = directory;
});
afterEach(async () => {
  if (previousConfigDir === undefined) delete process.env.ARRSENAL_CONFIG_DIR;
  else process.env.ARRSENAL_CONFIG_DIR = previousConfigDir;
  await rm(directory, { recursive: true, force: true });
});

describe("preferences config and API", () => {
  it("returns Automatic for missing config and existing configs missing preferences without writing on GET", async () => {
    const response = await GET(new Request("http://localhost/api/preferences"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ timeZone: null });
    expect(await readdir(directory)).toEqual([]);
    const old = JSON.stringify({
      version: 1,
      instances: [{ id: "movies", ...input }],
    });
    await Bun.write(join(directory, "config.json"), old);
    expect(
      await (await GET(new Request("http://localhost/api/preferences"))).json(),
    ).toEqual({ timeZone: null });
    expect(await Bun.file(join(directory, "config.json")).text()).toBe(old);
    expect(await readInstances()).toEqual([{ id: "movies", ...input }]);
  });

  it("saves canonical zones and resets to null without exposing or losing instances and API keys", async () => {
    const instance = await saveInstance(input);
    const response = await patch({ timeZone: "america/new_york" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ timeZone: "America/New_York" });
    expect(await readPreferences()).toEqual({ timeZone: "America/New_York" });
    expect(await readInstances()).toEqual([instance]);
    for (const timeZone of [null, ""]) {
      expect(await (await patch({ timeZone })).json()).toEqual({
        timeZone: null,
      });
      expect(await readInstances()).toEqual([instance]);
    }
    const config = await Bun.file(join(directory, "config.json")).json();
    expect(config).toEqual({
      version: 1,
      instances: [instance],
      preferences: { timeZone: null },
    });
    expect((await stat(join(directory, "config.json"))).mode & 0o777).toBe(
      0o600,
    );
    expect(await readdir(directory)).toEqual(["config.json"]);
  });

  it.each([
    {},
    { timeZone: "Not/A_Zone" },
    { timeZone: "+01:00" },
    { timeZone: " " },
    { timeZone: 1 },
    { timeZone: false },
    { timeZone: [] },
    { timeZone: "UTC", instances: [] },
    null,
  ])("strictly rejects invalid payload %j without changing config", async (body) => {
    await saveInstance(input);
    const before = await Bun.file(join(directory, "config.json")).text();
    const response = await patch(body);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(input.apiKey);
    expect(await Bun.file(join(directory, "config.json")).text()).toBe(before);
    expect(await readdir(directory)).toEqual(["config.json"]);
  });

  it("uses the existing same-origin and content-type guards", async () => {
    expect(
      (await patch({ timeZone: "UTC" }, { origin: "http://evil.test" })).status,
    ).toBe(403);
    expect(
      (await patch({ timeZone: "UTC" }, { "Content-Type": "text/plain" }))
        .status,
    ).toBe(415);
    expect(await readdir(directory)).toEqual([]);
  });

  it("serializes preference changes with instance additions, edits and removals", async () => {
    const first = await saveInstance(input);
    const [, second] = await Promise.all([
      savePreferences({ timeZone: "Asia/Tokyo" }),
      saveInstance({
        ...input,
        name: "Shows",
        kind: "sonarr",
        url: "http://sonarr.test",
        apiKey: "second-private-key",
      }),
      updateInstance(first, {
        ...input,
        name: "Renamed",
        apiKey: "updated-private-key",
      }),
    ]);
    expect(await readPreferences()).toEqual({ timeZone: "Asia/Tokyo" });
    expect(await readInstances()).toEqual([
      { ...first, name: "Renamed", apiKey: "updated-private-key" },
      second,
    ]);
    await Promise.all([
      removeInstance(second.id),
      savePreferences({ timeZone: "Europe/Paris" }),
    ]);
    expect(await readInstances()).toEqual([
      { ...first, name: "Renamed", apiKey: "updated-private-key" },
    ]);
    expect(await readPreferences()).toEqual({ timeZone: "Europe/Paris" });
    expect(await readdir(directory)).toEqual(["config.json"]);
  });

  it("never overwrites corrupt config and returns useful errors without leaking keys", async () => {
    const corrupt = JSON.stringify({
      version: 1,
      instances: [{ id: "movies", ...input }],
      preferences: { timeZone: "Invalid/Zone" },
    });
    await Bun.write(join(directory, "config.json"), corrupt);
    for (const response of [
      await GET(new Request("http://localhost/api/preferences")),
      await patch({ timeZone: "UTC" }),
    ]) {
      expect(response.status).toBe(500);
      const text = await response.text();
      expect(text).toContain("it was not overwritten");
      expect(text).not.toContain(input.apiKey);
    }
    expect(await Bun.file(join(directory, "config.json")).text()).toBe(corrupt);
    expect(await readdir(directory)).toEqual(["config.json"]);
  });

  it("reports write failures at the custom config path instead of pretending to save", async () => {
    const path = join(directory, "not-a-directory");
    await Bun.write(path, "unchanged");
    process.env.ARRSENAL_CONFIG_DIR = path;
    const response = await patch({ timeZone: "UTC" });
    expect(response.status).toBe(500);
    expect(await Bun.file(path).text()).toBe("unchanged");
  });
});
