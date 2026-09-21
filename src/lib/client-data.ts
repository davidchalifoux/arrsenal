"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { selectLibraryMedia } from "./library-selectors";
import { instancesQuery, libraryQuery, queueQuery } from "./queries";
import type { LibraryResponse, MediaKind } from "./types";

const noop = () => {};
const subscribe = () => noop;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

// Keep network reads out of server rendering and the first hydration render.
export function useClientReady() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}

export function useLibrary() {
  const ready = useClientReady();
  return useQuery({ ...libraryQuery, enabled: ready });
}

export function useLibraryMedia(mediaId: string, kind: MediaKind) {
  const ready = useClientReady();
  const select = useCallback(
    (data: LibraryResponse) => selectLibraryMedia(data, mediaId, kind),
    [mediaId, kind],
  );
  return useQuery({ ...libraryQuery, enabled: ready, select });
}

export function useInstances() {
  const ready = useClientReady();
  return useQuery({ ...instancesQuery, enabled: ready });
}

export function useQueue() {
  const ready = useClientReady();
  return useQuery({ ...queueQuery, enabled: ready });
}

// Explicit user refreshes only. Mutation reconciliation belongs to the server.
export function useSyncData() {
  const queryClient = useQueryClient();
  return async (scope: "library" | "queue" | "all"): Promise<void> => {
    if (scope === "all") {
      await queryClient.invalidateQueries();
      return;
    }
    await queryClient.invalidateQueries({
      queryKey:
        scope === "library" ? libraryQuery.queryKey : queueQuery.queryKey,
    });
  };
}
