"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./client";

const queryKey = ["preferences"];
type Preferences = { timeZone: string | null };

export function useTimezonePreference(): {
  timeZone: string | null;
  override: string;
  setOverride: (value: string) => Promise<void>;
  error: string | null;
} {
  const client = useQueryClient();
  const [browserZone, setBrowserZone] = useState<string | null>(null);
  useEffect(() => {
    function refresh() {
      try {
        setBrowserZone(
          Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        );
      } catch {
        setBrowserZone("UTC");
      }
    }
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => api<Preferences>("/api/preferences", { signal }),
    enabled: browserZone !== null,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const mutation = useMutation({
    scope: { id: "preferences" },
    mutationFn: (value: string) =>
      api<Preferences>("/api/preferences", {
        method: "PATCH",
        body: JSON.stringify({ timeZone: value || null }),
      }),
    onMutate: () => client.cancelQueries({ queryKey }),
    onSuccess: async (preferences) => {
      // A GET started during the save must not replace the confirmed response.
      await client.cancelQueries({ queryKey });
      client.setQueryData(queryKey, preferences);
      await client.invalidateQueries({ queryKey, refetchType: "none" });
    },
  });
  const override = query.data?.timeZone ?? "";
  return {
    timeZone:
      browserZone === null || query.isPending ? null : override || browserZone,
    override,
    setOverride: async (value) => {
      try {
        await mutation.mutateAsync(value);
      } catch {
        // Expose mutation errors through the contract, including fire-and-forget callers.
      }
    },
    error: mutation.error
      ? `Could not save the library timezone. ${mutation.error.message}`
      : query.error
        ? `Could not load the library timezone. ${query.data ? "Using the last loaded preference." : "Using this browser's timezone temporarily."} ${query.error.message}`
        : null,
  };
}
