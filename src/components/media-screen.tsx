"use client";

import { css } from "@styled-system/css";
import Link from "next/link";
import { useLibraryMedia } from "@/lib/client-data";
import type { MediaKind } from "@/lib/types";
import { useLibraryActions } from "./library-provider";
import { MediaDetails } from "./media-details";
import { Page, PageHeader } from "./page-header";
import { Button, buttonStyle, Notice, Spinner } from "./ui";

export function MediaScreen({
  mediaId,
  kind,
}: {
  mediaId: string;
  kind: MediaKind;
}) {
  const library = useLibraryMedia(mediaId, kind);
  const { add, notify, refresh } = useLibraryActions();
  const media = library.data?.media;
  if (
    library.isPending ||
    (!media &&
      (library.isFetching ||
        (!library.isError && !!library.data?.loadingInstanceIds?.length)))
  )
    return (
      <Page>
        <PageHeader title="Loading title..." actions={<Spinner />} />
      </Page>
    );
  if (!media)
    return (
      <Page>
        <PageHeader title="Title unavailable" />
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
      </Page>
    );
  return (
    <MediaDetails
      key={media.id}
      media={media}
      onAddTarget={add}
      onRefresh={refresh}
      notify={notify}
      notice={
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
        </>
      }
    />
  );
}
