import type { MediaItem } from "./types";

export function mediaHref(media: Pick<MediaItem, "id" | "kind">) {
  return `/${media.kind === "movie" ? "movies" : "shows"}/${encodeURIComponent(media.id)}`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(
      `Arrsenal returned an unexpected response (${response.status}). Refresh and try again.`,
    );
  }
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error ?? body.message ?? "The request failed. Please try again.",
    );
  return body as T;
}

export function sizeLabel(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.max(
    0,
    Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1),
  );
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

export function qualityLabel(profile: string, quality = "") {
  const value =
    quality && !/not downloaded|unknown/i.test(quality) ? quality : profile;
  if (/2160|4k|ultra|uhd/i.test(value)) return "4K";
  if (/1080|full.?hd/i.test(value)) return "1080p";
  if (/720/i.test(value)) return "720p";
  return value || "Unknown";
}
