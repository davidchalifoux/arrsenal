"use client";

import { useQuery } from "@tanstack/react-query";
import { matchSorter } from "match-sorter";
import { useEffect, useMemo, useState } from "react";
import { api } from "./client";
import type { LibraryResponse } from "./types";

export function useCatalogSearch(term: string, enabled: boolean) {
  const query = term.trim();
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const isDebouncing = query !== debouncedQuery;
  const canSearch = enabled && query.length >= 2 && !isDebouncing;
  const results = useQuery({
    queryKey: ["lookup", query],
    queryFn: ({ signal }) =>
      api<LibraryResponse>(`/api/lookup?term=${encodeURIComponent(query)}`, {
        signal,
      }),
    enabled: canSearch,
  });
  const data = useMemo(
    () =>
      canSearch && results.data
        ? {
            ...results.data,
            items: matchSorter(results.data.items, query, { keys: ["title"] }),
          }
        : undefined,
    [canSearch, results.data, query],
  );

  return {
    ...results,
    data,
    isError: canSearch && results.isError,
    isDebouncing,
  };
}
