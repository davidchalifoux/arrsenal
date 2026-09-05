"use client";

import { css } from "@styled-system/css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { libraryQuery } from "@/lib/queries";
import type { MediaKind } from "@/lib/types";
import { MediaDetails } from "./media-details";
import { Button, buttonStyle, Notice, Spinner } from "./ui";
import { useWorkspace } from "./workspace-provider";

export function MediaScreen({
  mediaId,
  kind,
}: {
  mediaId: string;
  kind: MediaKind;
}) {
  const library = useQuery(libraryQuery);
  const client = useQueryClient();
  const { add, notify, refresh } = useWorkspace();
  const media = library.data?.items.find(
    (item) => item.id === mediaId && item.kind === kind,
  );
  if (library.isPending || (!media && library.isFetching))
    return (
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "10px",
          py: "40px",
          color: "muted",
        })}
      >
        <Spinner />
        Loading title...
      </div>
    );
  if (!media)
    return (
      <div className={css({ py: "32px" })}>
        <h1
          className={css({ fontSize: "26px", fontWeight: "550", mb: "16px" })}
        >
          Title unavailable
        </h1>
        <Notice error>
          {library.isError
            ? library.error.message
            : library.data?.errors.length
              ? "Some instances could not be reached. This title may still be in your library."
              : "This title is no longer in your library."}
        </Notice>
        <div className={css({ display: "flex", gap: "12px", mt: "20px" })}>
          <Button onClick={refresh}>Try again</Button>
          <Link
            href={kind === "movie" ? "/movies" : "/shows"}
            className={buttonStyle({ variant: "ghost" })}
          >
            Back to {kind === "movie" ? "movies" : "shows"}
          </Link>
        </div>
      </div>
    );
  return (
    <>
      {library.isError && (
        <div className={css({ mb: "14px" })}>
          <Notice error>
            {library.error.message} Showing the last loaded title.
          </Notice>
        </div>
      )}
      {library.data?.errors.map((error) => (
        <div
          key={`${error.instanceId}:${error.message}`}
          className={css({ mb: "14px" })}
        >
          <Notice error>
            {error.instanceName}: {error.message}
          </Notice>
        </div>
      ))}
      <MediaDetails
        key={media.id}
        media={media}
        onAddTarget={add}
        notify={notify}
        onChanged={() => {
          refresh();
          void client.invalidateQueries({ queryKey: ["queue"] });
          for (const target of media.targets)
            void client.invalidateQueries({
              queryKey: ["episodes", target.instanceId, target.remoteId],
            });
        }}
      />
    </>
  );
}
