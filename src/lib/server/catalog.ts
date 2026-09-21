import "server-only";

import type { CatalogItem, CatalogResponse, MediaKind } from "../types";
import { arrRequest, num, rows, str } from "./arr";
import { readInstances } from "./config";
import { ApiError } from "./http";
import { mergeMediaMetadata, normalizeMediaMetadata } from "./media";
import { serviceError } from "./service-error";

export async function searchCatalog(
  term: string,
  kind?: MediaKind,
  signal?: AbortSignal,
): Promise<CatalogResponse> {
  function checkCanceled() {
    if (signal?.aborted) throw new ApiError(499, "Catalog search canceled.");
  }
  checkCanceled();
  const instances = await readInstances();
  checkCanceled();
  if (!instances.length || !term) return { items: [], errors: [] };
  const eligible = instances.filter(
    (instance) =>
      !kind || instance.kind === (kind === "movie" ? "radarr" : "sonarr"),
  );
  if (!eligible.length)
    return {
      items: [],
      errors: [
        {
          instanceId: kind === "movie" ? "radarr" : "sonarr",
          instanceName: kind === "movie" ? "Radarr" : "Sonarr",
          message: `Connect a ${kind === "movie" ? "Radarr" : "Sonarr"} instance to search for this media kind.`,
        },
      ],
    };
  const results = await Promise.all(
    eligible.map(async (instance): Promise<CatalogResponse> => {
      try {
        checkCanceled();
        const endpoint = instance.kind === "radarr" ? "movie" : "series";
        const records = rows(
          await arrRequest(instance, `${endpoint}/lookup`, {
            query: { term },
            signal,
            timeoutMs: 30000,
          }),
        );
        checkCanceled();
        if (records.some((item) => !str(item.title).trim()))
          throw new ApiError(
            502,
            "Instance returned an invalid catalog record.",
          );
        return {
          items: records.map((record) => ({
            ...normalizeMediaMetadata(record, instance),
            // Lookup can identify existing entries without loading library enrichment.
            existingInstanceIds:
              Number.isInteger(record.id) && num(record.id) > 0
                ? [instance.id]
                : [],
          })),
          errors: [],
        };
      } catch (error) {
        // A caller cancellation is not an instance failure or a cacheable empty result.
        checkCanceled();
        return { items: [], errors: [serviceError(instance, error)] };
      }
    }),
  );
  checkCanceled();
  const merged = new Map<string, CatalogItem>();
  for (const item of results.flatMap((result) => result.items)) {
    const existing = merged.get(item.id);
    if (!existing) {
      merged.set(item.id, item);
      continue;
    }
    mergeMediaMetadata(existing, item);
    existing.existingInstanceIds = [
      ...new Set([
        ...existing.existingInstanceIds,
        ...item.existingInstanceIds,
      ]),
    ];
  }
  return {
    items: [...merged.values()],
    errors: results.flatMap((result) => result.errors),
  };
}
