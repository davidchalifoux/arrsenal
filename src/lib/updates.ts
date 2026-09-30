"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { usePreferences } from "./preferences";

export const updatesQueryKey = ["updates"];

export type UpdateStatus = {
  enabled: boolean;
  release: {
    version: string;
    url: string;
    updateAvailable: boolean;
  } | null;
};

export function useUpdateStatus() {
  return useQuery({
    queryKey: updatesQueryKey,
    queryFn: ({ signal }) => api<UpdateStatus>("/api/updates", { signal }),
    retry: false,
    // The server caches the release feed for 15 minutes; match it here.
    staleTime: 15 * 60_000,
    refetchInterval: 15 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Checks now, bypassing and expiring the server's cached answer. */
export function useCheckForUpdates() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<UpdateStatus>("/api/updates", { method: "POST", body: "{}" }),
    onSuccess: (status) => client.setQueryData(updatesQueryKey, status),
  });
}

/** The release to announce in navigation, unless it was dismissed. */
export function useAnnouncedUpdate() {
  const release = useUpdateStatus().data?.release;
  const dismissed = usePreferences().data?.dismissedUpdate;
  return release?.updateAvailable && release.version !== dismissed
    ? release
    : null;
}
