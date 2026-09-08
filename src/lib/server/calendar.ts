import "server-only";

import type { CalendarEvent, CalendarResponse } from "../types";
import { arrRequest, row, str } from "./arr";
import type { InstanceConfig } from "./config";
import { ApiError, errorMessage } from "./http";

function realDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "0001-01-01" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function timestamp(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    !realDate(value.slice(0, 10)) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/i.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19)) > 59
  )
    return;
  return new Date(value).toISOString();
}

export function mergeCalendar(
  results: Pick<CalendarResponse, "items" | "errors">[],
  instanceCount: number,
): CalendarResponse {
  const merged = new Map<string, CalendarEvent>();
  for (const event of results.flatMap((result) => result.items)) {
    const existing = merged.get(event.id);
    if (!existing)
      merged.set(event.id, { ...event, sources: [...event.sources] });
    else
      for (const source of event.sources) {
        if (
          !existing.sources.some(
            (entry) => entry.instanceId === source.instanceId,
          )
        )
          existing.sources.push(source);
      }
  }
  return {
    items: [...merged.values()].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.airDateUtc ?? "").localeCompare(b.airDateUtc ?? "") ||
        a.title.localeCompare(b.title) ||
        (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) ||
        (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0) ||
        a.id.localeCompare(b.id),
    ),
    errors: results.flatMap((result) => result.errors),
    instanceCount,
  };
}

export async function instanceCalendar(
  instance: InstanceConfig,
  start: string,
  end: string,
): Promise<Pick<CalendarResponse, "items" | "errors">> {
  try {
    const data = await arrRequest(instance, "calendar", {
      query: {
        start,
        end,
        unmonitored: true,
        ...(instance.kind === "sonarr" ? { includeSeries: true } : {}),
      },
    });
    if (!Array.isArray(data))
      throw new ApiError(
        502,
        "Instance returned an invalid calendar response.",
      );
    const items: CalendarEvent[] = [];
    for (const value of data) {
      const item = row(value);
      if (!positiveId(item.id)) continue;
      const isEpisode = instance.kind === "sonarr";
      const media = isEpisode ? row(item.series) : item;
      if (
        isEpisode &&
        (!positiveId(item.seriesId) || media.id !== item.seriesId)
      )
        continue;
      const title = str(media.title).trim();
      if (!title) continue;
      const providerId = isEpisode ? media.tvdbId : media.tmdbId;
      const mediaId = positiveId(providerId)
        ? `${isEpisode ? "series:tvdb" : "movie:tmdb"}:${providerId}`
        : undefined;
      const identity = mediaId ?? `${instance.id}:${media.id}`;
      const sources = [
        { instanceId: instance.id, instanceName: instance.name },
      ];
      if (isEpisode) {
        const airDateUtc = timestamp(item.airDateUtc);
        if (
          !airDateUtc ||
          !Number.isSafeInteger(item.seasonNumber) ||
          Number(item.seasonNumber) < 0 ||
          !positiveId(item.episodeNumber)
        )
          continue;
        const date = airDateUtc.slice(0, 10);
        if (date < start || date >= end) continue;
        items.push({
          id: `${identity}:episode:${item.seasonNumber}:${item.episodeNumber}:${airDateUtc}`,
          title,
          mediaId,
          kind: "series",
          type: "episode",
          date,
          airDateUtc,
          episodeTitle: str(item.title),
          seasonNumber: Number(item.seasonNumber),
          episodeNumber: item.episodeNumber,
          sources,
        });
      } else {
        for (const [field, type] of [
          ["inCinemas", "theatrical"],
          ["digitalRelease", "digital"],
          ["physicalRelease", "physical"],
        ] as const) {
          const raw = str(item[field]);
          const date = realDate(raw) ? raw : timestamp(raw)?.slice(0, 10);
          if (!date || date < start || date >= end) continue;
          items.push({
            id: `${identity}:${type}:${date}`,
            title,
            mediaId,
            kind: "movie",
            type,
            date,
            sources,
          });
        }
      }
    }
    return { items, errors: [] };
  } catch (error) {
    return {
      items: [],
      errors: [
        {
          instanceId: instance.id,
          instanceName: instance.name,
          message: errorMessage(error),
        },
      ],
    };
  }
}
