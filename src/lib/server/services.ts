import "server-only";

import type {
  ActionResponse,
  InstanceOptions,
  LibraryResponse,
  MediaKind,
  ServiceError,
} from "../types";
import {
  arrRequest,
  instanceOptions,
  num,
  profiles,
  queueRecords,
  type Row,
  row,
  rows,
  str,
} from "./arr";
import { getInstance, type InstanceConfig, readInstances } from "./config";
import { episodeFilesForRemoval, verifyEpisode } from "./episodes";
import { ApiError, errorMessage, parseInput } from "./http";
import {
  mergeMedia,
  normalizeMedia,
  normalizeRelease,
  qualityName,
} from "./media";
import { updateSnapshots } from "./realtime-snapshots";
import {
  addMediaSchema,
  grabReleaseSchema,
  removeEpisodeFilesSchema,
  removeMediaSchema,
  removeQueueSchema,
  retryQueueSchema,
  searchSchema,
} from "./schemas";

function serviceError(
  instance: Pick<InstanceConfig, "id" | "name">,
  error: unknown,
): ServiceError {
  return {
    instanceId: instance.id,
    instanceName: instance.name,
    message: errorMessage(error),
  };
}

function requireKind(instance: InstanceConfig, kind: MediaKind): void {
  if (instance.kind !== (kind === "movie" ? "radarr" : "sonarr")) {
    throw new ApiError(
      400,
      "The media kind does not match the selected instance.",
    );
  }
}

export type MediaEnrichment = {
  profiles: InstanceOptions["profiles"];
  downloading: Set<number>;
  episodeQualities: Map<number, string[]>;
  complete: boolean;
};

export type MediaDependencies = {
  queue?: () => Promise<Row[]>;
  enrichment?: (value: MediaEnrichment) => void;
};

export async function instanceMedia(
  instance: InstanceConfig,
  term?: string,
  dependencies: MediaDependencies = {},
): Promise<LibraryResponse & { primarySucceeded: boolean }> {
  const errors: ServiceError[] = [];
  const signal = AbortSignal.timeout(20000);
  const endpoint = instance.kind === "radarr" ? "movie" : "series";
  const [mediaResult, profileResult, queueResult] = await Promise.allSettled([
    arrRequest(instance, term === undefined ? endpoint : `${endpoint}/lookup`, {
      signal,
      query: term === undefined ? undefined : { term },
    }).then((value) => {
      const items = rows(value);
      if (
        items.some(
          (item) =>
            !str(item.title).trim() ||
            (term === undefined &&
              (!Number.isInteger(item.id) || num(item.id) <= 0)),
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
  const episodeQualities = new Map<number, string[]>();
  if (instance.kind === "sonarr") {
    const series = media.filter(
      (item) =>
        num(item.id) > 0 && num(row(item.statistics).episodeFileCount) > 0,
    );
    let cursor = 0;
    let qualityError: unknown;
    // Sonarr exposes actual episode quality only via per-series episodefile calls.
    // Bound concurrency and the entire instance budget, keeping counts if these fail.
    await Promise.all(
      Array.from({ length: Math.min(4, series.length) }, async () => {
        while (cursor < series.length && !signal.aborted) {
          const item = series[cursor++];
          try {
            const files = rows(
              await arrRequest(instance, "episodefile", {
                signal,
                query: { seriesId: num(item.id) },
              }),
            );
            episodeQualities.set(
              num(item.id),
              files.map((file) => qualityName(file.quality)),
            );
          } catch (error) {
            qualityError = error;
          }
        }
      }),
    );
    if (signal.aborted && cursor < series.length)
      qualityError = new ApiError(504, "Instance request timed out.");
    if (qualityError)
      errors.push(
        serviceError(
          instance,
          new ApiError(
            502,
            `Some episode qualities are unknown: ${errorMessage(qualityError)}`,
          ),
        ),
      );
  }
  dependencies.enrichment?.({
    profiles: qualityProfiles,
    downloading,
    episodeQualities,
    complete:
      profileResult.status === "fulfilled" &&
      queueResult.status === "fulfilled",
  });
  return {
    primarySucceeded: true,
    items: media.map((item) =>
      normalizeMedia(
        item,
        instance,
        qualityProfiles,
        downloading,
        episodeQualities.get(num(item.id)),
      ),
    ),
    errors,
  };
}

export async function lookup(
  term: string,
  kind?: MediaKind,
): Promise<LibraryResponse> {
  const instances = await readInstances();
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
    eligible.map((instance) => instanceMedia(instance, term)),
  );
  return {
    items: mergeMedia(results.flatMap((result) => result.items)),
    errors: results.flatMap((result) => result.errors),
  };
}

function actionResponse(body: ActionResponse, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function runAction(
  instance: InstanceConfig,
  work: () => Promise<string>,
): Promise<Response> {
  try {
    return actionResponse({ success: true, message: await work() });
  } catch (error) {
    return actionResponse(
      {
        success: false,
        message: errorMessage(error),
        errors: [serviceError(instance, error)],
      },
      error instanceof ApiError ? error.status : 500,
    );
  }
}

export async function addMedia(input: unknown): Promise<Response> {
  const { media, search, targets } = parseInput(addMediaSchema, input);
  const kind = media.kind;
  const identityKey = kind === "movie" ? "tmdbId" : "tvdbId";
  const identity = media.kind === "movie" ? media.tmdbId : media.tvdbId;
  const instances = await readInstances();
  if (!instances.length)
    throw new ApiError(
      409,
      "Connect a Sonarr or Radarr instance before adding media.",
    );
  const results = await Promise.all(
    targets.map(async (target) => {
      const instance = instances.find(
        (entry) => entry.id === target.instanceId,
      );
      try {
        if (!instance)
          throw new ApiError(404, "Selected instance no longer exists.");
        requireKind(instance, kind);
        const [options, matches] = await Promise.all([
          instanceOptions(instance),
          arrRequest(instance, `${kind}/lookup`, {
            query: {
              term: `${kind === "movie" ? "tmdb" : "tvdb"}:${identity}`,
            },
          }).then(rows),
        ]);
        if (
          !options.profiles.some(
            (profile) => profile.id === target.qualityProfileId,
          )
        )
          throw new ApiError(
            400,
            "Select a quality profile belonging to this instance.",
          );
        if (
          !options.rootFolders.some(
            (folder) => folder.path === target.rootFolderPath,
          )
        )
          throw new ApiError(
            400,
            "Select a root folder belonging to this instance.",
          );
        const metadata = matches.find((item) => item[identityKey] === identity);
        if (!metadata || !str(metadata.title))
          throw new ApiError(
            404,
            "The requested metadata ID could not be resolved by this instance.",
          );
        if (num(metadata.id) > 0)
          throw new ApiError(
            409,
            "This media already exists on the selected instance.",
          );
        // Only metadata freshly resolved by this target is sent upstream. No client
        // title, images, seasons, remote ID, filesystem path, or raw payload is trusted.
        const payload: Row = {
          title: str(metadata.title),
          titleSlug: str(metadata.titleSlug),
          year: num(metadata.year),
          images: Array.isArray(metadata.images) ? metadata.images : [],
          [identityKey]: identity,
          qualityProfileId: target.qualityProfileId,
          rootFolderPath: target.rootFolderPath,
          monitored: true,
        };
        if (kind === "movie") {
          payload.minimumAvailability = "released";
          payload.addOptions = { searchForMovie: search };
        } else {
          payload.seasonFolder = true;
          payload.seriesType = ["standard", "daily", "anime"].includes(
            str(metadata.seriesType),
          )
            ? metadata.seriesType
            : "standard";
          payload.seasons = (
            Array.isArray(metadata.seasons) ? metadata.seasons.map(row) : []
          )
            .filter(
              (season) =>
                Number.isInteger(season.seasonNumber) &&
                num(season.seasonNumber, -1) >= 0,
            )
            .map((season) => ({
              seasonNumber: num(season.seasonNumber),
              monitored: num(season.seasonNumber) !== 0,
            }));
          payload.addOptions = {
            monitor: "all",
            searchForMissingEpisodes: search,
            searchForCutoffUnmetEpisodes: false,
          };
        }
        await arrRequest(instance, kind, { method: "POST", body: payload });
        return { error: undefined, status: 200 };
      } catch (error) {
        return {
          error: serviceError(
            instance ?? { id: target.instanceId, name: "Unknown instance" },
            error,
          ),
          status: error instanceof ApiError ? error.status : 500,
        };
      }
    }),
  );
  const errors = results.flatMap((result) =>
    result.error ? [result.error] : [],
  );
  const added = targets.length - errors.length;
  return actionResponse(
    {
      success: errors.length === 0,
      message: added
        ? `Added to ${added} of ${targets.length} selected instance${targets.length === 1 ? "" : "s"}.${search ? " Automatic search was requested." : " Media is monitored; no immediate search was requested."}${errors.length ? " Some targets failed; review the errors before retrying." : ""}`
        : "No additions were confirmed. Review the errors and refresh before retrying.",
      ...(errors.length ? { errors } : {}),
    },
    errors.length ? (added ? 207 : results[0].status) : 200,
  );
}

export async function removeMedia(input: unknown): Promise<Response> {
  const { instanceId, remoteId, kind, deleteFiles } = parseInput(
    removeMediaSchema,
    input,
  );
  const instance = await getInstance(instanceId);
  requireKind(instance, kind);
  return runAction(instance, async () => {
    const media = row(await arrRequest(instance, `${kind}/${remoteId}`));
    if (media.id !== remoteId)
      throw new ApiError(502, "Instance returned an invalid media identity.");
    try {
      await arrRequest(instance, `${kind}/${remoteId}`, {
        method: "DELETE",
        query: { deleteFiles },
      });
    } finally {
      // Failed requests may still have changed upstream state.
      updateSnapshots(
        instance,
        null,
        ["library", "instances", "calendar", "episodes"],
        remoteId,
      );
    }
    return `Removed from ${instance.name}.${deleteFiles ? " Files were deleted from disk." : " Files were kept on disk."}`;
  });
}

export async function removeEpisodeFiles(input: unknown): Promise<Response> {
  const { instanceId, remoteId, episodeId, seasonNumber } = parseInput(
    removeEpisodeFilesSchema,
    input,
  );
  const instance = await getInstance(instanceId);
  requireKind(instance, "series");
  return runAction(instance, async () => {
    const fileIds = await episodeFilesForRemoval(
      instance,
      remoteId,
      episodeId,
      seasonNumber,
    );
    let deleted = 0;
    try {
      for (const fileId of fileIds) {
        await arrRequest(instance, `episodefile/${fileId}`, {
          method: "DELETE",
        });
        deleted++;
      }
    } catch (error) {
      throw new ApiError(
        error instanceof ApiError ? error.status : 500,
        `${deleted} of ${fileIds.length} file deletions confirmed. ${errorMessage(error)} Refresh before retrying; the failed deletion may have been accepted.`,
      );
    } finally {
      updateSnapshots(
        instance,
        null,
        ["library", "instances", "calendar", "episodes"],
        remoteId,
      );
    }
    return `Deleted ${deleted} file${deleted === 1 ? "" : "s"} from disk. Monitoring was not changed; monitored episodes may download again.`;
  });
}

export async function automaticSearch(input: unknown): Promise<Response> {
  const { kind, remoteId, instanceId, episodeId, seasonNumber } = parseInput(
    searchSchema,
    input,
  );
  const instance = await getInstance(instanceId);
  requireKind(instance, kind);
  return runAction(instance, async () => {
    if (episodeId !== undefined)
      await verifyEpisode(instance, remoteId, episodeId);
    else await arrRequest(instance, `${kind}/${remoteId}`);
    await arrRequest(instance, "command", {
      method: "POST",
      body:
        episodeId !== undefined
          ? { name: "EpisodeSearch", episodeIds: [episodeId] }
          : seasonNumber !== undefined
            ? { name: "SeasonSearch", seriesId: remoteId, seasonNumber }
            : kind === "movie"
              ? { name: "MoviesSearch", movieIds: [remoteId] }
              : { name: "SeriesSearch", seriesId: remoteId },
    });
    return "Automatic search was queued on the instance.";
  });
}

export async function releases(
  instanceId: string,
  remoteId: number,
  kind: MediaKind,
  episodeId?: number,
  seasonNumber?: number,
) {
  const instance = await getInstance(instanceId);
  requireKind(instance, kind);
  if (episodeId !== undefined)
    await verifyEpisode(instance, remoteId, episodeId);
  const result = await arrRequest(instance, "release", {
    timeoutMs: 30000,
    query:
      episodeId !== undefined
        ? { episodeId }
        : seasonNumber !== undefined
          ? { seriesId: remoteId, seasonNumber }
          : kind === "movie"
            ? { movieId: remoteId }
            : { seriesId: remoteId },
  });
  return { items: rows(result).map(normalizeRelease) };
}

export async function grabRelease(input: unknown): Promise<Response> {
  const { guid, indexerId, instanceId } = parseInput(grabReleaseSchema, input);
  const instance = await getInstance(instanceId);
  return runAction(instance, async () => {
    await arrRequest(instance, "release", {
      method: "POST",
      timeoutMs: 30000,
      body: { guid, indexerId },
    });
    return "Release grab was requested from the instance. Check the queue for download progress.";
  });
}

export async function removeQueueItem(input: unknown): Promise<Response> {
  const { id, blocklist, removeFromClient, instanceId } = parseInput(
    removeQueueSchema,
    input,
  );
  const instance = await getInstance(instanceId);
  return runAction(instance, async () => {
    await arrRequest(instance, `queue/${id}`, {
      method: "DELETE",
      query: { blocklist, removeFromClient },
    });
    return `Queue item removed${removeFromClient ? " from the download client" : " from instance tracking; it was not removed from the download client"}.${blocklist ? " The release was blocklisted; the instance may search for a replacement." : " The release was not blocklisted."}`;
  });
}

export async function retryQueueItem(input: unknown): Promise<Response> {
  const { id, instanceId } = parseInput(retryQueueSchema, input);
  const instance = await getInstance(instanceId);
  return runAction(instance, async () => {
    const item = (await queueRecords(instance)).find(
      (entry) => entry.id === id,
    );
    if (!item)
      throw new ApiError(404, "Queue item not found. Refresh the queue.");
    const status = str(item.status).toLowerCase();
    if (
      ["delay", "downloadclientunavailable"].includes(status) &&
      !str(item.downloadId)
    ) {
      await arrRequest(instance, `queue/grab/${id}`, { method: "POST" });
      return "Pending release grab requested, bypassing its delay. This starts a download; it is not an import retry.";
    }
    const state = str(item.trackedDownloadState).toLowerCase();
    if (
      status !== "completed" &&
      !["importpending", "importblocked", "importfailed"].includes(state)
    ) {
      throw new ApiError(
        409,
        "Only a pending release or a completed download awaiting import can be retried. Active downloads are not re-grabbed.",
      );
    }
    const path = str(item.outputPath);
    if (!path || !str(item.downloadId))
      throw new ApiError(
        409,
        "This completed download has no import path or download ID. Use the instance's manual import screen.",
      );
    const command =
      instance.kind === "radarr"
        ? "DownloadedMoviesScan"
        : "DownloadedEpisodesScan";
    await arrRequest(instance, "command", {
      method: "POST",
      body: {
        name: command,
        path,
        downloadClientId: str(item.downloadId),
        importMode: "auto",
      },
    });
    return `${command} queued for this download's output path. This retries import, not download; import may still require manual intervention.`;
  });
}
