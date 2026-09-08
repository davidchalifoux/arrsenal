import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

mock.module("server-only", () => ({}));
const account = await import("@/app/api/auth/route");
const login = await import("@/app/api/auth/login/route");
const logout = await import("@/app/api/auth/logout/route");
const preferences = await import("@/app/api/preferences/route");

let directory: string;
const previousDirectory = process.env.ARRSENAL_CONFIG_DIR;
const password = "eight123";
function request(path: string, method = "GET", body?: unknown, cookie = "") {
  return new Request(`https://arrsenal.test${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "https://arrsenal.test",
      Cookie: cookie,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function cookie(response: Response) {
  const value = response.headers.get("set-cookie");
  expect(value).toContain("HttpOnly");
  expect(value).toContain("Secure");
  expect(value).toContain("SameSite=Lax");
  if (!value) throw new Error("Expected a session cookie.");
  return value.split(";", 1)[0];
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "arrsenal-auth-"));
  process.env.ARRSENAL_CONFIG_DIR = directory;
});
afterEach(async () => {
  if (previousDirectory === undefined) delete process.env.ARRSENAL_CONFIG_DIR;
  else process.env.ARRSENAL_CONFIG_DIR = previousDirectory;
  await rm(directory, { recursive: true, force: true });
});

it("protects data routes, rotates credentials, and revokes logged-out sessions", async () => {
  expect((await preferences.GET(request("/api/preferences"))).status).toBe(200);
  const enabled = await account.POST(
    request("/api/auth", "POST", { username: "owner", password }),
  );
  expect(enabled.status).toBe(200);
  const first = cookie(enabled);
  expect((await preferences.GET(request("/api/preferences"))).status).toBe(401);
  expect(
    (
      await preferences.GET(
        request("/api/preferences", "GET", undefined, first),
      )
    ).status,
  ).toBe(200);
  const rejected = await account.DELETE(
    request("/api/auth", "DELETE", { currentPassword: "wrong" }, first),
  );
  expect(rejected.status).toBe(401);
  const changed = await account.POST(
    request(
      "/api/auth",
      "POST",
      {
        username: "renamed",
        password: `${password}!`,
        currentPassword: password,
      },
      first,
    ),
  );
  expect(changed.status).toBe(200);
  const second = cookie(changed);
  expect(
    (
      await preferences.GET(
        request("/api/preferences", "GET", undefined, first),
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await login.POST(
        request("/api/auth/login", "POST", { username: "owner", password }),
      )
    ).status,
  ).toBe(401);
  expect(
    (await logout.POST(request("/api/auth/logout", "POST", {}, second))).status,
  ).toBe(200);
  expect(
    (
      await preferences.GET(
        request("/api/preferences", "GET", undefined, second),
      )
    ).status,
  ).toBe(401);
  const loggedIn = await login.POST(
    request("/api/auth/login", "POST", {
      username: "renamed",
      password: `${password}!`,
    }),
  );
  expect(loggedIn.status).toBe(200);
  const disabled = await account.DELETE(
    request(
      "/api/auth",
      "DELETE",
      { currentPassword: `${password}!` },
      cookie(loggedIn),
    ),
  );
  expect(disabled.status).toBe(200);
  expect((await preferences.GET(request("/api/preferences"))).status).toBe(200);
});

it("allows only one concurrent first-account creation", async () => {
  const responses = await Promise.all(
    ["first", "second"].map((username) =>
      account.POST(request("/api/auth", "POST", { username, password })),
    ),
  );
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  const winner = responses.find((response) => response.status === 200);
  if (!winner) throw new Error("Expected one successful account creation.");
  const status = await account.GET(
    request("/api/auth", "GET", undefined, cookie(winner)),
  );
  expect(status.status).toBe(200);
});

it("fails closed on corrupt account configuration and refuses cross-origin enable", async () => {
  const crossOrigin = new Request("https://arrsenal.test/api/auth", {
    method: "POST",
    headers: {
      Origin: "https://attacker.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username: "owner", password }),
  });
  expect((await account.POST(crossOrigin)).status).toBe(403);
  await Bun.write(
    join(directory, "config.json"),
    '{"version":1,"instances":[],"account":{"username":"owner","passwordHash":"invalid"}}',
  );
  expect((await preferences.GET(request("/api/preferences"))).status).toBe(500);
  expect(
    (
      await account.POST(
        request("/api/auth", "POST", { username: "owner", password }),
      )
    ).status,
  ).toBe(500);
});
