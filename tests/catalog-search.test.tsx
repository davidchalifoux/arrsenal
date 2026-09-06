import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/client";
import { useCatalogSearch } from "@/lib/use-catalog-search";

vi.mock("@/lib/client", () => ({ api: vi.fn() }));

let client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(api).mockReset();
  vi.mocked(api).mockResolvedValue({ items: [], errors: [] });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

it("debounces rapid changes for 250ms and uses the trimmed query", async () => {
  const { rerender } = renderHook(
    ({ term }) => useCatalogSearch(term, "movie", true),
    { wrapper, initialProps: { term: "Du" } },
  );
  await advance(200);
  rerender({ term: "  Dune  " });
  await advance(249);
  expect(api).not.toHaveBeenCalled();
  await advance(1);
  expect(api).toHaveBeenCalledExactlyOnceWith(
    "/api/lookup?term=Dune&kind=movie",
    { signal: expect.any(AbortSignal) },
  );
  rerender({ term: "Dune " });
  await advance(250);
  expect(api).toHaveBeenCalledTimes(1);
});

it("hides previous results immediately and clears without another request", async () => {
  const { result, rerender } = renderHook(
    ({ term }) => useCatalogSearch(term, "movie", true),
    { wrapper, initialProps: { term: "Dune" } },
  );
  await advance(251);
  await advance(1);
  expect(result.current.data).toEqual({ items: [], errors: [] });
  rerender({ term: "Alien" });
  expect(result.current.data).toBeUndefined();
  expect(result.current.isDebouncing).toBe(true);
  rerender({ term: "" });
  await advance(251);
  expect(result.current.data).toBeUndefined();
  expect(api).toHaveBeenCalledTimes(1);
});

it("blocks short queries and lookups without a relevant instance", async () => {
  const { rerender } = renderHook(
    ({ term, enabled }) => useCatalogSearch(term, "series", enabled),
    { wrapper, initialProps: { term: " a ", enabled: true } },
  );
  await advance(250);
  rerender({ term: "Severance", enabled: false });
  await advance(250);
  expect(api).not.toHaveBeenCalled();
  rerender({ term: "Severance", enabled: true });
  await advance(1);
  expect(api).toHaveBeenCalledWith("/api/lookup?term=Severance&kind=series", {
    signal: expect.any(AbortSignal),
  });
});

it("cancels obsolete in-flight requests and separates media kinds", async () => {
  vi.mocked(api).mockImplementation(() => new Promise(() => {}));
  const { result, rerender } = renderHook(
    ({ term, kind }) => useCatalogSearch(term, kind, true),
    { wrapper, initialProps: { term: "Dune", kind: "movie" } },
  );
  await advance(250);
  const signal = vi.mocked(api).mock.calls[0][1]?.signal;
  rerender({ term: "Alien", kind: "movie" });
  expect(signal?.aborted).toBe(true);
  expect(result.current.data).toBeUndefined();
  await advance(250);
  rerender({ term: "Alien", kind: "series" });
  expect(api).toHaveBeenLastCalledWith("/api/lookup?term=Alien&kind=series", {
    signal: expect.any(AbortSignal),
  });
});
