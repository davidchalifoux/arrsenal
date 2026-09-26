"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { LibraryPreferences } from "./library-options";
import type { ThemeId } from "./theme";

export const preferencesQueryKey = ["preferences"];

export type Preferences = {
  timeZone: string | null;
  theme?: ThemeId;
  accent?: string | null;
  library?: LibraryPreferences;
  /** Last quality profile and root folder used per instance when adding. */
  addDefaults?: Record<string, AddDefault>;
};

export type AddDefault = { qualityProfileId: number; rootFolderPath: string };

export type PreferencesPatch = Partial<Preferences>;

export function usePreferences() {
  return useQuery({
    queryKey: preferencesQueryKey,
    queryFn: ({ signal }) => api<Preferences>("/api/preferences", { signal }),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Saves a preference patch. The cache updates optimistically so view
 * changes apply at once, and rolls back if the server rejects the patch.
 */
export function useSavePreferences() {
  const client = useQueryClient();
  return useMutation({
    scope: { id: "preferences" },
    mutationFn: (patch: PreferencesPatch) =>
      api<Preferences>("/api/preferences", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: preferencesQueryKey });
      const previous = client.getQueryData<Preferences>(preferencesQueryKey);
      if (previous)
        client.setQueryData(preferencesQueryKey, { ...previous, ...patch });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous)
        client.setQueryData(preferencesQueryKey, context.previous);
    },
    onSuccess: async (preferences) => {
      // A GET started during the save must not replace the confirmed response.
      await client.cancelQueries({ queryKey: preferencesQueryKey });
      client.setQueryData(preferencesQueryKey, preferences);
      await client.invalidateQueries({
        queryKey: preferencesQueryKey,
        refetchType: "none",
      });
    },
  });
}
