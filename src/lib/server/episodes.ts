import "server-only";

import { z } from "zod";
import type { Episode, EpisodesResponse, ServiceError } from "../types";
import { arrRequest, num, queueRecords, type Row, row, rows, str } from "./arr";
import type { InstanceConfig } from "./config";
import { ApiError, errorMessage } from "./http";
import { qualityName } from "./media";

const idSchema = z.number().int().min(1).max(2147483647);
const numberSchema = z.number().int().min(0).max(2147483647);
const identitySchema = z.object({ id: idSchema, seriesId: idSchema });
const episodeSchema = z.looseObject({
  ...identitySchema.shape,
  seasonNumber: numberSchema,
  episodeNumber: numberSchema,
  monitored: z.boolean(),
  hasFile: z.boolean(),
});
const seriesSchema = z.looseObject({
  id: idSchema,
  seasons: z
    .array(
      z.object({
        seasonNumber: numberSchema,
        monitored: z.boolean().default(false),
      }),
    )
    .default([]),
});

export async function verifyEpisode(
  instance: InstanceConfig,
  remoteId: number,
  episodeId: number,
): Promise<void> {
  if (instance.kind !== "sonarr")
    throw new ApiError(400, "Episodes require a Sonarr instance.");
  const result = identitySchema.safeParse(
    await arrRequest(instance, `episode/${episodeId}`),
  );
  if (!result.success || result.data.id !== episodeId) {
    throw new ApiError(502, "Instance returned an invalid episode identity.");
  }
  if (result.data.seriesId !== remoteId) {
    throw new ApiError(
      400,
      "The episode does not belong to the requested series on this instance.",
    );
  }
}

const deletionEpisodeSchema = episodeSchema.extend({
  episodeFileId: numberSchema,
});
const deletionFileSchema = identitySchema.extend({
  seasonNumber: numberSchema,
});

export async function episodeFilesForRemoval(
  instance: InstanceConfig,
  remoteId: number,
  episodeId?: number,
  seasonNumber?: number,
): Promise<number[]> {
  if (instance.kind !== "sonarr")
    throw new ApiError(400, "Episodes require a Sonarr instance.");
  const [seriesValue, episodeValue, fileValue] = await Promise.all([
    arrRequest(instance, `series/${remoteId}`),
    arrRequest(instance, "episode", { query: { seriesId: remoteId } }),
    arrRequest(instance, "episodefile", { query: { seriesId: remoteId } }),
  ]);
  const series = seriesSchema.safeParse(seriesValue);
  const episodes = z.array(deletionEpisodeSchema).safeParse(episodeValue);
  const files = z.array(deletionFileSchema).safeParse(fileValue);
  if (
    !series.success ||
    series.data.id !== remoteId ||
    new Set(series.data.seasons.map((season) => season.seasonNumber)).size !==
      series.data.seasons.length ||
    !episodes.success ||
    episodes.data.some((episode) => episode.seriesId !== remoteId) ||
    new Set(episodes.data.map((episode) => episode.id)).size !==
      episodes.data.length ||
    !files.success ||
    files.data.some((file) => file.seriesId !== remoteId) ||
    new Set(files.data.map((file) => file.id)).size !== files.data.length
  ) {
    throw new ApiError(
      502,
      "Instance returned invalid, ambiguous, or mismatched series/episode/file records. No files were deleted.",
    );
  }
  const seasons = new Set(
    series.data.seasons.map((season) => season.seasonNumber),
  );
  const fileMap = new Map(files.data.map((file) => [file.id, file]));
  // Validate the complete response before deleting anything, including shared
  // file references outside the selected episode or season.
  for (const episode of episodes.data) {
    const file = fileMap.get(episode.episodeFileId);
    if (
      !seasons.has(episode.seasonNumber) ||
      (episode.hasFile
        ? !file || file.seasonNumber !== episode.seasonNumber
        : episode.episodeFileId !== 0)
    ) {
      throw new ApiError(
        502,
        "Instance returned inconsistent episode file ownership. No files were deleted.",
      );
    }
  }
  const selected = episodes.data.filter((episode) =>
    episodeId !== undefined
      ? episode.id === episodeId
      : episode.seasonNumber === seasonNumber,
  );
  if (
    (episodeId !== undefined && selected.length !== 1) ||
    (seasonNumber !== undefined && !seasons.has(seasonNumber))
  ) {
    throw new ApiError(
      400,
      "The selected episode or season does not belong to the requested series on this instance.",
    );
  }
  const ids = [
    ...new Set(
      selected
        .filter((episode) => episode.hasFile)
        .map((episode) => episode.episodeFileId),
    ),
  ];
  if (!ids.length)
    throw new ApiError(
      409,
      "The selected episode or season has no files to delete.",
    );
  return ids;
}

export async function instanceEpisodes(
  instance: InstanceConfig,
  remoteId: number,
  loadQueue: () => Promise<Row[]> = () => queueRecords(instance),
): Promise<EpisodesResponse> {
  const instanceId = instance.id;
  if (instance.kind !== "sonarr")
    throw new ApiError(400, "Episodes require a Sonarr instance.");
  const signal = AbortSignal.timeout(20000);
  const [seriesResult, episodeResult, fileResult, queueResult] =
    await Promise.allSettled([
      arrRequest(instance, `series/${remoteId}`, { signal }),
      arrRequest(instance, "episode", {
        signal,
        query: { seriesId: remoteId },
      }),
      arrRequest(instance, "episodefile", {
        signal,
        query: { seriesId: remoteId },
      }).then(rows),
      loadQueue(),
    ]);
  if (seriesResult.status === "rejected") throw seriesResult.reason;
  if (episodeResult.status === "rejected") throw episodeResult.reason;
  const series = seriesSchema.safeParse(seriesResult.value);
  const records = z.array(episodeSchema).safeParse(episodeResult.value);
  if (
    !series.success ||
    series.data.id !== remoteId ||
    !records.success ||
    records.data.some((episode) => episode.seriesId !== remoteId) ||
    new Set(records.data.map((episode) => episode.id)).size !==
      records.data.length
  ) {
    throw new ApiError(
      502,
      "Instance returned invalid or mismatched series/episode records.",
    );
  }

  const errors: ServiceError[] = [];
  const addError = (message: string) =>
    errors.push({ instanceId, instanceName: instance.name, message });
  const files = new Map<number, Row>();
  let incompleteFiles = false;
  if (fileResult.status === "rejected") {
    addError(
      `Episode file metadata unavailable: ${errorMessage(fileResult.reason)}`,
    );
  } else {
    for (const file of fileResult.value) {
      const identity = identitySchema.safeParse(file);
      if (
        !identity.success ||
        identity.data.seriesId !== remoteId ||
        files.has(identity.data.id)
      ) {
        incompleteFiles = true;
        continue;
      }
      files.set(identity.data.id, file);
    }
  }
  if (queueResult.status === "rejected") {
    addError(
      `Episode download status unavailable: ${errorMessage(queueResult.reason)}`,
    );
  }
  const knownIds = new Set(records.data.map((episode) => episode.id));
  const downloading = new Set<number>();
  if (queueResult.status === "fulfilled") {
    for (const entry of queueResult.value) {
      const embedded = row(entry.episode);
      const episodeId = entry.episodeId ?? embedded.id;
      if (
        (entry.seriesId === undefined || entry.seriesId === remoteId) &&
        (embedded.seriesId === undefined || embedded.seriesId === remoteId) &&
        knownIds.has(num(episodeId)) &&
        ["queued", "paused", "downloading", "completed"].includes(
          str(entry.status).toLowerCase(),
        )
      ) {
        downloading.add(num(episodeId));
      }
    }
  }
  const seasons = new Map(
    series.data.seasons.map((season) => [season.seasonNumber, { ...season }]),
  );
  const metadataSeasons = new Set(seasons.keys());
  const now = Date.now();
  const items: Episode[] = records.data.map((episode) => {
    const file = episode.hasFile
      ? files.get(num(episode.episodeFileId))
      : undefined;
    if (episode.hasFile && !file) incompleteFiles = true;
    if (!metadataSeasons.has(episode.seasonNumber)) {
      seasons.set(episode.seasonNumber, {
        seasonNumber: episode.seasonNumber,
        monitored:
          episode.monitored ||
          seasons.get(episode.seasonNumber)?.monitored === true,
      });
    }
    const airTime = Date.parse(str(episode.airDateUtc));
    const knownAirDate = Number.isFinite(airTime);
    return {
      id: episode.id,
      seriesId: episode.seriesId,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      title: str(episode.title) || `Episode ${episode.episodeNumber}`,
      overview: str(episode.overview),
      airDateUtc: knownAirDate ? new Date(airTime).toISOString() : undefined,
      runtime:
        num(episode.runtime, num(series.data.runtime)) > 0
          ? num(episode.runtime, num(series.data.runtime))
          : undefined,
      monitored: episode.monitored,
      hasFile: episode.hasFile,
      quality: episode.hasFile
        ? file
          ? qualityName(file.quality) || "Unknown"
          : "Unknown"
        : "Not downloaded",
      sizeOnDisk: file ? Math.max(0, num(file.size)) : 0,
      status: episode.hasFile
        ? "available"
        : downloading.has(episode.id)
          ? "downloading"
          : knownAirDate && airTime > now
            ? "unreleased"
            : !episode.monitored
              ? "unmonitored"
              : knownAirDate
                ? "missing"
                : "unknown",
    };
  });
  if (incompleteFiles && fileResult.status === "fulfilled") {
    addError(
      "Some episode file metadata is missing, invalid, or belongs to another series.",
    );
  }
  return {
    instanceId,
    instanceName: instance.name,
    remoteId,
    seasons: [...seasons.values()].sort(
      (a, b) => a.seasonNumber - b.seasonNumber,
    ),
    episodes: items.sort(
      (a, b) =>
        a.seasonNumber - b.seasonNumber ||
        a.episodeNumber - b.episodeNumber ||
        a.id - b.id,
    ),
    errors,
  };
}
