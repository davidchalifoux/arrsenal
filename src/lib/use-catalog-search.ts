"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./client";
import type { LibraryResponse } from "./types";

export function useCatalogSearch(term: string, kind: string, enabled: boolean) {
  const query = term.trim();
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const isDebouncing = query !== debouncedQuery;
  const canSearch = enabled && query.length >= 2 && !isDebouncing;
  const results = useQuery({
    queryKey: ["lookup", query, kind],
    queryFn: ({ signal }) =>
      api<LibraryResponse>(
        `/api/lookup?term=${encodeURIComponent(query)}&kind=${kind}`,
        { signal },
      ),
    enabled: canSearch,
  });

  return {
    ...results,
    data: canSearch ? results.data : undefined,
    isError: canSearch && results.isError,
    isDebouncing,
  };
}
