import { revalidateTag } from "next/cache";
import { z } from "zod";
import { version } from "../../../package.json";
import { readPreferences } from "./config";

export const currentVersion = version;
export const repositoryUrl = "https://github.com/davidchalifoux/arrsenal";

// The website publishes the newest release with a Docker image, so a release
// is only announced once it can be pulled. The address and shape are permanent.
export const releaseFeedUrl =
  "https://www.arrsenal.com/v1/releases/latest.json";
const releaseFeedTag = "release-feed";

// Compare numeric parts, not strings (0.10.0 is newer than 0.9.0).
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const releaseSchema = z.object({
  version: z.string().regex(stableVersion),
});

/** Checks the release feed, cached for 15 minutes unless `fresh` is set. */
export async function getLatestRelease({ fresh = false } = {}) {
  try {
    const response = await fetch(releaseFeedUrl, {
      headers: { Accept: "application/json", "User-Agent": "Arrsenal" },
      ...(fresh
        ? { cache: "no-store" as const }
        : { next: { revalidate: 900, tags: [releaseFeedTag] } }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const release = releaseSchema.parse(await response.json());
    const latest = stableVersion.exec(release.version);
    const installed = stableVersion.exec(currentVersion.split("-")[0]);
    if (!latest || !installed) return null;
    let comparison = 0;
    for (let part = 1; part <= 3; part++) {
      const a = BigInt(latest[part]);
      const b = BigInt(installed[part]);
      if (a !== b) {
        comparison = a > b ? 1 : -1;
        break;
      }
    }
    return {
      version: release.version,
      url: `${repositoryUrl}/releases/tag/v${release.version}`,
      updateAvailable:
        comparison > 0 || (comparison === 0 && currentVersion.includes("-")),
    };
  } catch {
    // Network failures and invalid responses must not break Settings.
    return null;
  }
}

/** The update check result, or `enabled: false` when checks are turned off. */
export async function getUpdateStatus() {
  if ((await readPreferences()).updateChecks === false) {
    return { enabled: false as const, release: null };
  }
  return { enabled: true as const, release: await getLatestRelease() };
}

/**
 * A manual check: skips the cached answer and expires it, so every browser's
 * next check fetches the feed again too.
 */
export async function checkForUpdates() {
  if ((await readPreferences()).updateChecks === false) {
    return { enabled: false as const, release: null };
  }
  revalidateTag(releaseFeedTag, { expire: 0 });
  return {
    enabled: true as const,
    release: await getLatestRelease({ fresh: true }),
  };
}
