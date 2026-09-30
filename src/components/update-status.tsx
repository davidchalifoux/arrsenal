"use client";

import { css } from "@styled-system/css";
import { useQueryClient } from "@tanstack/react-query";
import { usePreferences, useSavePreferences } from "@/lib/preferences";
import {
  updatesQueryKey,
  useCheckForUpdates,
  useUpdateStatus,
} from "@/lib/updates";
import { Button, CheckField, Notice, Spinner } from "./ui";

const linkStyle = css({
  textDecoration: "underline",
  textUnderlineOffset: "3px",
});

function ReleaseStatus({
  currentVersion,
  repositoryUrl,
}: {
  currentVersion: string;
  repositoryUrl: string;
}) {
  const updates = useUpdateStatus();
  if (updates.isPending) return <output>Checking for updates...</output>;
  if (updates.data?.enabled === false) {
    return <output>Update checks are turned off.</output>;
  }
  const release = updates.data?.release;
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
            className={linkStyle}
          >
            View release
          </a>
          {" · "}
          <a
            href={`${repositoryUrl}/blob/main/docs/deployment.md#updates-and-stopping`}
            target="_blank"
            rel="noopener noreferrer"
            className={linkStyle}
          >
            How to update
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

export function UpdateStatus({
  currentVersion,
  repositoryUrl,
}: {
  currentVersion: string;
  repositoryUrl: string;
}) {
  const client = useQueryClient();
  const preferences = usePreferences();
  const save = useSavePreferences();
  const check = useCheckForUpdates();
  const enabled = preferences.data?.updateChecks !== false;
  return (
    <>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          "& > :first-child": { flex: "1 1 280px" },
        })}
      >
        <ReleaseStatus
          currentVersion={currentVersion}
          repositoryUrl={repositoryUrl}
        />
        {enabled && (
          <Button
            size="sm"
            disabled={check.isPending}
            onClick={() => check.mutate()}
          >
            {check.isPending && <Spinner size={12} />}
            Check now
          </Button>
        )}
      </div>
      <CheckField
        checked={enabled}
        disabled={preferences.isPending || save.isPending}
        onChange={(updateChecks) =>
          save.mutate(
            { updateChecks },
            {
              onSettled: () =>
                client.invalidateQueries({ queryKey: updatesQueryKey }),
            },
          )
        }
        className={css({ mt: "8px", fontSize: "13px", color: "soft" })}
      >
        Check for new releases
      </CheckField>
      {(save.error ?? check.error) && (
        <p role="alert" className={css({ color: "negative" })}>
          {(save.error ?? check.error)?.message}
        </p>
      )}
    </>
  );
}
