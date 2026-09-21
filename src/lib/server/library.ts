import "server-only";

import type { InstanceOptions, LibraryResponse, ServiceError } from "../types";
import {
  arrRequest,
  num,
  profiles,
  queueRecords,
  type Row,
  rows,
  str,
} from "./arr";
import type { InstanceConfig } from "./config";
import { ApiError, errorMessage } from "./http";
import { normalizeMedia, qualityName } from "./media";
import { serviceError } from "./service-error";

export type MediaEnrichment = {
  profiles: InstanceOptions["profiles"];
  downloading: Set<number>;
  complete: boolean;
};

// Sonarr exposes real per-episode quality only through per-series episodefile
// calls, an unavoidable N+1 (there is no bulk endpoint). The snapshot store
// fills these in the background and caches them per series, so the library
// itself never blocks on the sweep and an unreachable series just keeps its
// "Unknown" labels until a later pass. Returns the distinct file qualities.
export async function seriesEpisodeQuality(
  instance: InstanceConfig,
  seriesId: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const files = rows(
    await arrRequest(instance, "episodefile", {
      signal,
      query: { seriesId },
    }),
  );
  return files.map((file) => qualityName(file.quality));
}

export type MediaDependencies = {
  queue?: () => Promise<Row[]>;
  enrichment?: (value: MediaEnrichment) => void;
};

export async function instanceMedia(
  instance: InstanceConfig,
  dependencies: MediaDependencies = {},
): Promise<LibraryResponse & { primarySucceeded: boolean }> {
  const errors: ServiceError[] = [];
  const signal = AbortSignal.timeout(30000);
  const endpoint = instance.kind === "radarr" ? "movie" : "series";
  const [mediaResult, profileResult, queueResult] = await Promise.allSettled([
    arrRequest(instance, endpoint, {
      // A full library list for a large instance takes well beyond arrRequest's
      // 8s default; give it the whole instance budget so the list is never
      // dropped (which would drop every item, not just an optional label).
      timeoutMs: 30000,
      signal,
    }).then((value) => {
      const items = rows(value);
      if (
        items.some(
          (item) =>
            !str(item.title).trim() ||
            !Number.isInteger(item.id) ||
            num(item.id) <= 0,
        )
      ) {
        throw new ApiError(502, "Instance returned an invalid media record.");
      }
      return items;
    }),
    profiles(instance, signal),
    dependencies.queue ? dependencies.queue() : queueRecords(instance, signal),
  ]);
  if (mediaResult.status === "rejected")
    return {
      primarySucceeded: false,
      items: [],
      errors: [serviceError(instance, mediaResult.reason)],
    };
  if (profileResult.status === "rejected")
    errors.push(
      serviceError(
        instance,
        new ApiError(
          502,
          `Quality profiles unavailable: ${errorMessage(profileResult.reason)}`,
        ),
      ),
    );
  if (queueResult.status === "rejected")
    errors.push(
      serviceError(
        instance,
        new ApiError(
          502,
          `Download status unavailable: ${errorMessage(queueResult.reason)}`,
        ),
      ),
    );
  const qualityProfiles =
    profileResult.status === "fulfilled" ? profileResult.value : [];
  const queue = queueResult.status === "fulfilled" ? queueResult.value : [];
  const downloading = new Set(
    queue
      .filter(
        (item) =>
          !["failed", "delay", "downloadclientunavailable"].includes(
            str(item.status).toLowerCase(),
          ),
      )
      .map((item) =>
        num(instance.kind === "radarr" ? item.movieId : item.seriesId),
      )
      .filter((id) => id > 0),
  );
  const media = mediaResult.value;
  // Episode-level quality (Sonarr) is not fetched here: it is a per-series N+1
  // that would block the whole library and time out on large instances. The
  // snapshot store fills and caches it in the background instead; series items
  // start with "Unknown" episode quality and are enriched without a reload.
  dependencies.enrichment?.({
    profiles: qualityProfiles,
    downloading,
    complete:
      profileResult.status === "fulfilled" &&
      queueResult.status === "fulfilled",
  });
  return {
    primarySucceeded: true,
    items: media.map((item) =>
      normalizeMedia(item, instance, qualityProfiles, downloading),
    ),
    errors,
  };
}
