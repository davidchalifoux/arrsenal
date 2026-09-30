import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const revalidateTag = mock();
mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({ revalidateTag }));
const { GET, POST } = await import("@/app/api/updates/route");
const { savePreferences } = await import("@/lib/server/config");
const {
  checkForUpdates,
  currentVersion,
  getLatestRelease,
  getUpdateStatus,
  repositoryUrl,
} = await import("@/lib/server/releases");

function respond(body: unknown, status = 200) {
  spyOn(globalThis, "fetch").mockResolvedValue(Response.json(body, { status }));
}

afterEach(() => {
  mock.restore();
  revalidateTag.mockClear();
});

it("detects a numerically newer minor release and links its tag", async () => {
  const [major, minor] = currentVersion.split(".").map(Number);
  const version = `${major}.${minor + 10}.0`;
  const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ version, url: "https://unrelated.test/" }),
  );
  expect(await getLatestRelease()).toEqual({
    version,
    url: `${repositoryUrl}/releases/tag/v${version}`,
    updateAvailable: true,
  });
  expect(fetch.mock.calls[0]?.[0]).toBe(
    "https://www.arrsenal.com/v1/releases/latest.json",
  );
});

it("does not advertise the installed release as an update", async () => {
  respond({ version: currentVersion });
  expect((await getLatestRelease())?.updateAvailable).toBe(false);
});

it("does not advertise an older release as an update", async () => {
  respond({ version: "0.0.0" });
  expect((await getLatestRelease())?.updateAvailable).toBe(false);
});

it("does not treat a prerelease as a stable update", async () => {
  respond({ version: "999.0.0-beta.1" });
  expect(await getLatestRelease()).toBeNull();
});

it("reports unknown update status when the release feed is unavailable", async () => {
  respond({ message: "Not found" }, 404);
  expect(await getLatestRelease()).toBeNull();
});

it("reports unknown update status for malformed release data", async () => {
  respond({ version: "not-a-version" });
  expect(await getLatestRelease()).toBeNull();
});

it("keeps settings available when the release feed times out", async () => {
  spyOn(globalThis, "fetch").mockRejectedValue(
    new DOMException("Timed out", "TimeoutError"),
  );
  expect(await getLatestRelease()).toBeNull();
});

describe("update status", () => {
  let directory: string;
  const previousConfigDir = process.env.ARRSENAL_CONFIG_DIR;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "arrsenal-updates-"));
    process.env.ARRSENAL_CONFIG_DIR = directory;
  });
  afterEach(async () => {
    if (previousConfigDir === undefined) delete process.env.ARRSENAL_CONFIG_DIR;
    else process.env.ARRSENAL_CONFIG_DIR = previousConfigDir;
    await rm(directory, { recursive: true, force: true });
  });

  it("checks for updates by default", async () => {
    respond({ version: currentVersion });
    const response = await GET(new Request("http://localhost/api/updates"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      enabled: true,
      release: {
        version: currentVersion,
        url: `${repositoryUrl}/releases/tag/v${currentVersion}`,
        updateAvailable: false,
      },
    });
  });

  it("caches the release feed for 15 minutes under a tag", async () => {
    const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ version: currentVersion }),
    );
    await GET(new Request("http://localhost/api/updates"));
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      next: { revalidate: 900, tags: ["release-feed"] },
    });
  });

  it("checks now by bypassing and expiring the cached feed", async () => {
    const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ version: currentVersion }),
    );
    const response = await POST(
      new Request("http://localhost/api/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).release.version).toBe(currentVersion);
    expect(revalidateTag).toHaveBeenCalledWith("release-feed", { expire: 0 });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
    expect(fetch.mock.calls[0]?.[1]).not.toHaveProperty("next");
  });

  it("rejects a cross-site check", async () => {
    const response = await POST(
      new Request("http://localhost/api/updates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://attacker.test",
        },
        body: "{}",
      }),
    );
    expect(response.status).toBe(403);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("never contacts the release feed when update checks are turned off", async () => {
    const fetch = spyOn(globalThis, "fetch");
    await savePreferences({ updateChecks: false });
    expect(await getUpdateStatus()).toEqual({ enabled: false, release: null });
    expect(await checkForUpdates()).toEqual({ enabled: false, release: null });
    expect(fetch).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
