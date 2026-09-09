import { afterEach, expect, it, mock, spyOn } from "bun:test";
import {
  currentVersion,
  getLatestRelease,
  repositoryUrl,
} from "../src/lib/server/releases";

function respond(body: unknown, status = 200) {
  spyOn(globalThis, "fetch").mockResolvedValue(Response.json(body, { status }));
}

afterEach(() => mock.restore());

it("detects a numerically newer minor release and links its tag", async () => {
  const [major, minor] = currentVersion.split(".").map(Number);
  const version = `${major}.${minor + 10}.0`;
  respond({ tag_name: `v${version}`, draft: false, prerelease: false });
  expect(await getLatestRelease()).toEqual({
    version,
    url: `${repositoryUrl}/releases/tag/v${version}`,
    updateAvailable: true,
  });
});

it("does not advertise the installed release as an update", async () => {
  respond({ tag_name: `v${currentVersion}`, draft: false, prerelease: false });
  expect((await getLatestRelease())?.updateAvailable).toBe(false);
});

it("does not advertise an older release as an update", async () => {
  respond({ tag_name: "v0.0.0", draft: false, prerelease: false });
  expect((await getLatestRelease())?.updateAvailable).toBe(false);
});

it("does not treat a prerelease as a stable update", async () => {
  respond({ tag_name: "v999.0.0-beta.1", draft: false, prerelease: true });
  expect(await getLatestRelease()).toBeNull();
});

it("reports unknown update status for GitHub rate limits", async () => {
  respond({ message: "API rate limit exceeded" }, 403);
  expect(await getLatestRelease()).toBeNull();
});

it("reports unknown update status for malformed release data", async () => {
  respond({ tag_name: "not-a-version", draft: false, prerelease: false });
  expect(await getLatestRelease()).toBeNull();
});

it("keeps settings available when GitHub times out", async () => {
  spyOn(globalThis, "fetch").mockRejectedValue(
    new DOMException("Timed out", "TimeoutError"),
  );
  expect(await getLatestRelease()).toBeNull();
});
