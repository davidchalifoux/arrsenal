import type { MediaItem, MediaKind } from "./types";

export function mediaHref(media: Pick<MediaItem, "id" | "kind" | "title">) {
  const providerId = media.id.match(
    media.kind === "movie"
      ? /^movie:tmdb:([1-9]\d*)$/
      : /^series:tvdb:([1-9]\d*)$/,
  )?.[1];
  const slug = media.title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  const segment = providerId ? `${providerId}-${slug || "title"}` : media.id;
  return `/${media.kind === "movie" ? "movies" : "shows"}/${encodeURIComponent(segment)}`;
}

export function mediaIdFromRoute(segment: string, kind: MediaKind) {
  const providerId = segment.match(/^([1-9]\d*)(?:-.+)?$/)?.[1];
  // The title is cosmetic; old slugs and legacy IDs still identify the same media.
  return providerId
    ? `${kind === "movie" ? "movie:tmdb" : "series:tvdb"}:${providerId}`
    : segment;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (
    response.status === 401 &&
    !path.startsWith("/api/auth") &&
    typeof window !== "undefined"
  ) {
    window.location.replace("/login");
    throw new Error("Authentication required.");
  }
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
  return value || "Unknown";
}
