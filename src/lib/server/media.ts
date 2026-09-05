import "server-only";

import { createHash } from "node:crypto";
import type {
  InstanceOptions,
  MediaItem,
  MediaStatus,
  MediaTarget,
  QueueItem,
  Release,
} from "../types";
import { num, type Row, row, str, strings } from "./arr";
import type { InstanceConfig } from "./config";
import { parseInput } from "./http";
import { localCoverPathSchema } from "./schemas";

export function coverPath(instance: InstanceConfig, input: string): string {
  let path = input;
  const base = new URL(instance.url).pathname.replace(/\/$/, "");
  if (base && path.startsWith(`${base}/`)) path = path.slice(base.length);
  // An intentionally narrow raster-cover allowlist also excludes encoded traversal,
  // protocol-relative URLs, query credentials, and every other upstream endpoint.
  return parseInput(localCoverPathSchema, path);
}

function remoteImage(value: unknown): string {
  if (typeof value !== "string" || value.includes("[redacted]")) return "";
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash
    )
      return "";
    if (
      [...url.searchParams.keys()].some((key) =>
        /key|token|auth|signature|credential/i.test(key),
      )
    )
      return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function mediaImage(
  media: Row,
  instance: InstanceConfig,
  kind = "poster",
): string {
  const images = Array.isArray(media.images)
    ? media.images
        .map(row)
        .filter((image) => str(image.coverType).toLowerCase() === kind)
    : [];
  const candidates = [
    kind === "poster" ? media.remotePoster : undefined,
    ...images.map((image) => image.remoteUrl),
    ...images.map((image) => image.url),
  ];
  const instanceOrigin = new URL(instance.url).origin;
  for (const candidate of candidates) {
    const url = remoteImage(candidate);
    let path = str(candidate).split(/[?#]/, 1)[0];
    if (url) {
      const parsed = new URL(url);
      if (parsed.origin !== instanceOrigin) return url;
      // Even remotePoster/remoteUrl may point at a local cover requiring an API key.
      path = parsed.pathname;
    }
    try {
      const local = coverPath(instance, path);
      return `/api/image?${new URLSearchParams({ instanceId: instance.id, path: `/${local}` })}`;
    } catch {
      // Unrecognized images are omitted, never converted into arbitrary proxy URLs.
    }
  }
  return "";
}

export function qualityName(value: unknown): string {
  const model = row(value);
  return str(row(model.quality).name, str(model.name, "Unknown"));
}

export function combinedStatus(targets: MediaTarget[]): MediaStatus {
  if (!targets.length) return "missing";
  if (targets.some((target) => target.status === "downloading"))
    return "downloading";
  if (targets.every((target) => target.status === "available"))
    return "available";
  if (
    targets.some(
      (target) => target.status === "available" || target.status === "partial",
    )
  )
    return "partial";
  return "missing";
}

export function normalizeMedia(
  media: Row,
  instance: InstanceConfig,
  profiles: InstanceOptions["profiles"] = [],
  downloading = new Set<number>(),
  episodeQualities?: string[],
): MediaItem {
  const kind = instance.kind === "radarr" ? "movie" : "series";
  const tmdbId = num(media.tmdbId) > 0 ? num(media.tmdbId) : undefined;
  const tvdbId = num(media.tvdbId) > 0 ? num(media.tvdbId) : undefined;
  const identity = kind === "movie" ? tmdbId : tvdbId;
  const remoteId = num(media.id);
  const statistics = row(media.statistics);
  const file = row(media.movieFile);
  const episodeCount = num(statistics.episodeCount);
  const episodeFileCount = num(statistics.episodeFileCount);
  const hasFile = media.hasFile === true || num(file.id) > 0;
  const size =
    kind === "movie"
      ? num(media.sizeOnDisk, num(file.size))
      : num(statistics.sizeOnDisk);
  let status: MediaStatus =
    kind === "movie"
      ? hasFile
        ? "available"
        : "missing"
      : episodeFileCount > 0
        ? episodeCount > 0 && episodeFileCount >= episodeCount
          ? "available"
          : "partial"
        : "missing";
  if (downloading.has(remoteId)) status = "downloading";
  const targets: MediaTarget[] =
    remoteId > 0
      ? [
          {
            instanceId: instance.id,
            instanceName: instance.name,
            remoteId,
            qualityProfileId: num(media.qualityProfileId),
            qualityProfile:
              profiles.find((profile) => profile.id === media.qualityProfileId)
                ?.name ?? "Unknown profile",
            quality:
              kind === "movie"
                ? hasFile
                  ? qualityName(file.quality)
                  : "Not downloaded"
                : episodeQualities?.length
                  ? [...new Set(episodeQualities)].sort().join(", ")
                  : episodeFileCount > 0
                    ? "Unknown"
                    : "Not downloaded",
            status,
            monitored: media.monitored === true,
            sizeOnDisk: Math.max(0, size),
            ...(kind === "series" ? { episodeCount, episodeFileCount } : {}),
          },
        ]
      : [];
  const ratings = row(media.ratings);
  const rating = num(
    row(ratings.imdb).value,
    num(row(ratings.tmdb).value, num(ratings.value)),
  );
  const fallback =
    remoteId > 0
      ? String(remoteId)
      : createHash("sha256")
          .update(
            JSON.stringify([
              media.title,
              media.year,
              media.titleSlug,
              media.imdbId,
            ]),
          )
          .digest("hex")
          .slice(0, 16);
  return {
    id: identity
      ? `${kind}:${kind === "movie" ? "tmdb" : "tvdb"}:${identity}`
      : `${kind}:${instance.id}:${fallback}`,
    kind,
    title: str(media.title, "Untitled"),
    year: num(media.year),
    overview: str(media.overview),
    poster: mediaImage(media, instance),
    backdrop: mediaImage(media, instance, "fanart") || undefined,
    genres: strings(media.genres),
    rating: rating > 0 ? rating : undefined,
    runtime: num(media.runtime) > 0 ? num(media.runtime) : undefined,
    tmdbId,
    tvdbId,
    added: str(media.added),
    status: combinedStatus(targets),
    targets,
  };
}

export function mergeMedia(items: MediaItem[]): MediaItem[] {
  const merged = new Map<string, MediaItem>();
  for (const item of items) {
    const existing = merged.get(item.id);
    if (!existing) {
      merged.set(item.id, { ...item, targets: [...item.targets] });
      continue;
    }
    for (const target of item.targets) {
      if (
        !existing.targets.some(
          (entry) =>
            entry.instanceId === target.instanceId &&
            entry.remoteId === target.remoteId,
        )
      )
        existing.targets.push(target);
    }
    existing.poster ||= item.poster;
    existing.backdrop ||= item.backdrop;
    existing.overview ||= item.overview;
    existing.rating ??= item.rating;
    existing.tmdbId ??= item.tmdbId;
    existing.tvdbId ??= item.tvdbId;
    if (item.added > existing.added) existing.added = item.added;
    existing.genres = [...new Set([...existing.genres, ...item.genres])];
    existing.status = combinedStatus(existing.targets);
  }
  return [...merged.values()];
}

export function normalizeQueue(item: Row, instance: InstanceConfig): QueueItem {
  const kind = instance.kind === "radarr" ? "movie" : "series";
  const media = row(kind === "movie" ? item.movie : item.series);
  const warnings = (
    Array.isArray(item.statusMessages) ? item.statusMessages : []
  ).flatMap((message) => {
    if (typeof message === "string") return [message];
    const detail = row(message);
    return [str(detail.title), ...strings(detail.messages)].filter(Boolean);
  });
  if (str(item.errorMessage)) warnings.push(str(item.errorMessage));
  return {
    id: num(item.id),
    instanceId: instance.id,
    instanceName: instance.name,
    title: str(item.title, "Unknown download"),
    mediaTitle: str(media.title, str(item.title, "Unknown media")),
    kind,
    poster: mediaImage(media, instance) || undefined,
    quality: qualityName(item.quality),
    size: Math.max(0, num(item.size)),
    sizeleft: Math.max(0, num(item.sizeleft, num(item.sizeLeft))),
    status: str(item.status, "unknown"),
    timeleft: str(item.timeleft, str(item.timeLeft)) || undefined,
    downloadClient: str(item.downloadClient) || undefined,
    downloadId: str(item.downloadId) || undefined,
    warnings: [...new Set(warnings)],
  };
}

export function normalizeRelease(item: Row): Release {
  const rejections = strings(item.rejections);
  return {
    guid: str(item.guid),
    indexerId: num(item.indexerId),
    title: str(item.title, "Untitled release"),
    quality: qualityName(item.quality),
    size: num(item.size),
    age: num(item.age),
    seeders: typeof item.seeders === "number" ? num(item.seeders) : undefined,
    protocol: str(
      item.protocol,
      num(item.protocol) === 1
        ? "usenet"
        : num(item.protocol) === 2
          ? "torrent"
          : "unknown",
    ),
    indexer: str(item.indexer, "Unknown indexer"),
    approved:
      item.approved !== false &&
      item.rejected !== true &&
      rejections.length === 0,
    rejections,
  };
}
