"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { matchSorter } from "match-sorter";
import { useEffect, useMemo, useState } from "react";
import { api } from "./client";
import type { CatalogResponse } from "./types";

/**
 * Looks up catalog titles 250ms after typing stops. Results for the previous
 * query stay available (flagged `isStale`) until the next ones arrive, so the
 * list doesn't collapse and re-grow on every keystroke.
 */
export function useCatalogSearch(term: string, enabled: boolean) {
  const query = term.trim();
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const isDebouncing = query !== debouncedQuery;
  const active = enabled && query.length >= 2;
  const results = useQuery({
    queryKey: ["lookup", debouncedQuery],
    queryFn: ({ signal }) =>
      api<CatalogResponse>(
        `/api/lookup?term=${encodeURIComponent(debouncedQuery)}`,
        { signal },
      ),
    enabled: active && debouncedQuery.length >= 2,
    placeholderData: keepPreviousData,
  });
  const data = useMemo(
    () =>
      active && results.data
        ? {
            ...results.data,
            items: matchSorter(results.data.items, debouncedQuery, {
              keys: ["title"],
            }),
          }
        : undefined,
    [active, results.data, debouncedQuery],
  );

  return {
    ...results,
    data,
    isError: active && !isDebouncing && results.isError,
    isFetching: active && results.isFetching,
    isDebouncing: active && isDebouncing,
    isStale: active && (isDebouncing || results.isPlaceholderData),
  };
}
