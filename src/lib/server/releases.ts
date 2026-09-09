import { z } from "zod";
import { version } from "../../../package.json";

export const currentVersion = version;
export const repositoryUrl = "https://github.com/davidchalifoux/arrsenal";

// GitHub's latest-release endpoint excludes prereleases; compare numeric parts,
// not strings (0.10.0 is newer than 0.9.0).
const stableVersion =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\+[\w.-]+)?$/;
const releaseSchema = z.object({
  tag_name: z.string().regex(stableVersion),
  draft: z.literal(false),
  prerelease: z.literal(false),
});

export async function getLatestRelease() {
  try {
    const response = await fetch(
      "https://api.github.com/repos/davidchalifoux/arrsenal/releases/latest",
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Arrsenal",
        },
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return null;
    const release = releaseSchema.parse(await response.json());
    const latest = stableVersion.exec(release.tag_name);
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
      version: release.tag_name.replace(/^v/, ""),
      url: `${repositoryUrl}/releases/tag/${encodeURIComponent(release.tag_name)}`,
      updateAvailable:
        comparison > 0 || (comparison === 0 && currentVersion.includes("-")),
    };
  } catch {
    // Network failures, rate limits, and invalid releases must not break Settings.
    return null;
  }
}
