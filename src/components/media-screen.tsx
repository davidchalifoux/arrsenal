"use client";

import { css } from "@styled-system/css";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  collectionRow,
  useClientReady,
  useCollections,
  useSyncData,
} from "@/lib/collections";
import { libraryQuery } from "@/lib/queries";
import type { MediaKind } from "@/lib/types";
import { MediaDetails } from "./media-details";
import { PageHeader } from "./page-header";
import { Button, buttonStyle, Notice, Spinner } from "./ui";
import { useWorkspace } from "./workspace-provider";

export function MediaScreen({
  mediaId,
  kind,
}: {
  mediaId: string;
  kind: MediaKind;
}) {
  const collections = useCollections();
  const clientReady = useClientReady();
  const library = useQuery({ ...libraryQuery, enabled: false });
  const sync = useSyncData();
  const { add, notify, refresh } = useWorkspace();
  const title = useLiveQuery({
    query: (q) =>
      clientReady
        ? q
            .from({ item: collections.library })
            .where(({ item }) => eq(item.id, mediaId))
            .where(({ item }) => eq(item.kind, kind))
            .findOne()
        : undefined,
  });
  const media = title.data && collectionRow(title.data);
  if (
    library.isPending ||
    (!library.isError && title.isLoading) ||
    (!media && library.isFetching)
  )
    return <PageHeader title="Loading title..." actions={<Spinner />} />;
  if (!media)
    return (
      <div>
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
          void sync("media", media.targets);
        }}
      />
    </>
  );
}
