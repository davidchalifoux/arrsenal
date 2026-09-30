import { repoUrl } from "./site";

const image = "davidchalifoux/arrsenal";
// Release images are tagged X.Y.Z; skip `latest` and any prerelease tags.
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function compare(a: string, b: string) {
  const left = a.split(".").map(BigInt);
  const right = b.split(".").map(BigInt);
  for (let part = 0; part < 3; part++) {
    if (left[part] !== right[part]) return left[part] > right[part] ? 1 : -1;
  }
  return 0;
}

async function registry(url: string, token?: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`GHCR request failed with ${response.status}: ${url}`);
  }
  return response.json();
}

/**
 * The newest release with a published Docker image. Reading GHCR's tags rather
 * than GitHub Releases means a release is only announced once it can be pulled.
 * Throws on any failure so the build fails and the previous deploy stays live.
 */
export async function getLatestRelease() {
  const { token } = await registry(
    `https://ghcr.io/token?scope=repository:${image}:pull`,
  );
  const { tags } = await registry(
    `https://ghcr.io/v2/${image}/tags/list?n=10000`,
    token,
  );
  if (!Array.isArray(tags)) throw new Error("GHCR returned no tag list.");
  const versions = tags.filter(
    (tag): tag is string => typeof tag === "string" && stableVersion.test(tag),
  );
  const version = versions.sort(compare).at(-1);
  if (!version) throw new Error("GHCR has no stable release tags.");
  return { version, url: `${repoUrl}/releases/tag/v${version}` };
}
