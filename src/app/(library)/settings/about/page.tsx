import { css } from "@styled-system/css";
import { Suspense } from "react";
import { About } from "@/components/about";
import { Notice } from "@/components/ui";
import {
  currentVersion,
  getLatestRelease,
  repositoryUrl,
} from "@/lib/server/releases";

export const metadata = { title: "About | Arrsenal" };

async function ReleaseStatus() {
  const release = await getLatestRelease();
  if (!release) {
    return (
      <output>
        Unable to check for updates. You can check releases on GitHub.
      </output>
    );
  }
  if (release.updateAvailable) {
    return (
      <Notice>
        <span>
          Arrsenal v{release.version} is available. You are running v
          {currentVersion}.{" "}
          <a
            href={release.url}
            target="_blank"
            rel="noopener noreferrer"
            className={css({
              textDecoration: "underline",
              textUnderlineOffset: "3px",
            })}
          >
            View release
          </a>
        </span>
      </Notice>
    );
  }
  return (
    <output>
      No newer version available. Latest stable release: v{release.version}.
    </output>
  );
}

export default function AboutPage() {
  return (
    <About version={currentVersion} repositoryUrl={repositoryUrl}>
      <Suspense fallback={<output>Checking GitHub for updates...</output>}>
        <ReleaseStatus />
      </Suspense>
      <p className={css({ mt: "8px", fontSize: "12px", color: "subtle" })}>
        Checks the latest stable GitHub release. Results are cached for one
        hour.
      </p>
    </About>
  );
}
