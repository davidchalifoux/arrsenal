import "server-only";

import type {
  BlocklistItem,
  BlocklistResponse,
  HistoryEvent,
  HistoryItem,
  HistoryResponse,
  ServiceError,
} from "../types";
import { arrRequest, num, type Row, row, rows, str } from "./arr";
import { getInstance, type InstanceConfig, readInstances } from "./config";
import { ApiError, parseInput } from "./http";
import { episodeLabel, linkedMediaId, qualityName } from "./media";
import {
  actionResponse,
  executeMutation,
  mutationFailure,
  runAction,
} from "./mutations";
import { markFailedSchema, removeBlocklistSchema } from "./schemas";
import { serviceError } from "./service-error";

// Blocklists are short; one read covers nearly every library.
const BLOCKLIST_PAGE_SIZE = 1000;

// Sonarr and Radarr number their history events differently.
const eventCodes: Record<
  Exclude<HistoryEvent, "unknown">,
  { sonarr: number[]; radarr: number[] }
> = {
  grabbed: { sonarr: [1], radarr: [1] },
  imported: { sonarr: [2, 3], radarr: [3, 7] },
  failed: { sonarr: [4], radarr: [4] },
  deleted: { sonarr: [5], radarr: [6] },
  renamed: { sonarr: [6], radarr: [8] },
  ignored: { sonarr: [7], radarr: [9] },
};

const eventNames: Record<string, HistoryEvent> = {
  grabbed: "grabbed",
  seriesfolderimported: "imported",
  downloadfolderimported: "imported",
  moviefolderimported: "imported",
  downloadfailed: "failed",
  episodefiledeleted: "deleted",
  moviefiledeleted: "deleted",
  episodefilerenamed: "renamed",
  moviefilerenamed: "renamed",
  downloadignored: "ignored",
};

function historyEvent(value: unknown, instance: InstanceConfig): HistoryEvent {
  if (typeof value === "string")
    return eventNames[value.toLowerCase()] ?? "unknown";
  if (typeof value === "number")
    for (const [event, codes] of Object.entries(eventCodes))
      if (codes[instance.kind].includes(value)) return event as HistoryEvent;
  return "unknown";
}

function isoDate(value: unknown): string | undefined {
  const time = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

const deleteReasons: Record<string, string> = {
  manual: "Deleted manually",
  missingfromdisk: "Missing from disk",
  upgrade: "Replaced by an upgrade",
};

function historyDetail(event: HistoryEvent, data: Row): string | undefined {
  const text = (key: string) => str(data[key]).trim();
  switch (event) {
    case "grabbed": {
      const client = text("downloadClientName") || text("downloadClient");
      return [text("indexer"), client].filter(Boolean).join(" → ") || undefined;
    }
    case "imported":
      return text("importedPath") || text("droppedPath") || undefined;
    case "failed":
    case "ignored":
      return text("message") || undefined;
    case "deleted": {
      const reason = text("reason");
      return deleteReasons[reason.toLowerCase()] ?? (reason || undefined);
    }
    case "renamed":
      return text("path") || undefined;
    default:
      return undefined;
  }
}

function mediaFields(item: Row, instance: InstanceConfig) {
  const kind = instance.kind === "radarr" ? "movie" : "series";
  const media = row(kind === "movie" ? item.movie : item.series);
  return {
    kind,
    mediaTitle: str(media.title, "Unknown media"),
    mediaId: linkedMediaId(media, instance),
  } as const;
}

export function normalizeHistory(
  item: Row,
  instance: InstanceConfig,
): HistoryItem | undefined {
  const date = isoDate(item.date);
  if (!date || num(item.id) <= 0) return undefined;
  const event = historyEvent(item.eventType, instance);
  const fields = mediaFields(item, instance);
  return {
    id: num(item.id),
    instanceId: instance.id,
    instanceName: instance.name,
    ...fields,
    event,
    sourceTitle: str(item.sourceTitle, "Unknown release"),
    episode:
      fields.kind === "series" ? episodeLabel(row(item.episode)) : undefined,
    quality: qualityName(item.quality),
    date,
    detail: historyDetail(event, row(item.data)),
  };
}

export function normalizeBlocklist(
  item: Row,
  instance: InstanceConfig,
): BlocklistItem | undefined {
  const date = isoDate(item.date);
  if (!date || num(item.id) <= 0) return undefined;
  const protocol = str(item.protocol).toLowerCase();
  return {
    id: num(item.id),
    instanceId: instance.id,
    instanceName: instance.name,
    ...mediaFields(item, instance),
    sourceTitle: str(item.sourceTitle, "Unknown release"),
    quality: qualityName(item.quality),
    date,
    protocol:
      protocol === "torrent" || num(item.protocol) === 2
        ? "torrent"
        : protocol === "usenet" || num(item.protocol) === 1
          ? "usenet"
          : "unknown",
    indexer: str(item.indexer).trim() || undefined,
    message: str(item.message).trim() || undefined,
  };
}

function newestFirst<
  T extends { date: string; instanceId: string; id: number },
>(a: T, b: T) {
  return (
    b.date.localeCompare(a.date) ||
    a.instanceId.localeCompare(b.instanceId) ||
    b.id - a.id
  );
}

async function eachInstance<T>(
  read: (instance: InstanceConfig) => Promise<T>,
): Promise<{ results: T[]; errors: ServiceError[] }> {
  const instances = await readInstances();
  const settled = await Promise.allSettled(instances.map(read));
  const results: T[] = [];
  const errors: ServiceError[] = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") results.push(outcome.value);
    else errors.push(serviceError(instances[index], outcome.reason));
  });
  return { results, errors };
}

function page(data: unknown, label: string) {
  const body = row(data);
  if (!Array.isArray(body.records) || !Number.isSafeInteger(body.totalRecords))
    throw new ApiError(502, `Instance returned an invalid ${label} response.`);
  return { records: rows(body.records), total: num(body.totalRecords) };
}

/**
 * The newest `limit` events across every instance. Each instance returns up
 * to `limit` of its own, so the merged list is exact to that depth.
 */
export async function readHistory(
  limit: number,
  event?: Exclude<HistoryEvent, "unknown">,
): Promise<HistoryResponse> {
  const { results, errors } = await eachInstance(async (instance) => {
    const { records, total } = page(
      await arrRequest(instance, "history", {
        timeoutMs: 15000,
        query: {
          page: 1,
          pageSize: limit,
          sortKey: "date",
          sortDirection: "descending",
          ...(instance.kind === "radarr"
            ? { includeMovie: true }
            : { includeSeries: true, includeEpisode: true }),
          ...(event ? { eventType: eventCodes[event][instance.kind] } : {}),
        },
      }),
      "history",
    );
    return {
      items: records.flatMap(
        (record) => normalizeHistory(record, instance) ?? [],
      ),
      more: total > records.length,
    };
  });
  const items = results.flatMap((result) => result.items).sort(newestFirst);
  return {
    items: items.slice(0, limit),
    errors,
    hasMore: items.length > limit || results.some((result) => result.more),
  };
}

export async function readBlocklist(): Promise<BlocklistResponse> {
  const { results, errors } = await eachInstance(async (instance) => {
    const { records, total } = page(
      await arrRequest(instance, "blocklist", {
        timeoutMs: 15000,
        query: {
          page: 1,
          pageSize: BLOCKLIST_PAGE_SIZE,
          sortKey: "date",
          sortDirection: "descending",
        },
      }),
      "blocklist",
    );
    return {
      items: records.flatMap(
        (record) => normalizeBlocklist(record, instance) ?? [],
      ),
      truncated: total > records.length,
    };
  });
  return {
    items: results.flatMap((result) => result.items).sort(newestFirst),
    errors,
    truncated: results.some((result) => result.truncated),
  };
}

export async function markHistoryFailed(input: unknown): Promise<Response> {
  const { instanceId, id } = parseInput(markFailedSchema, input);
  const instance = await getInstance(instanceId);
  return runAction(instance, { operation: "markFailed" }, async (write) => {
    await write(`history/failed/${id}`, { method: "POST" });
    return `Marked as failed on ${instance.name}. The release was blocklisted, and ${instance.name} may search for a replacement.`;
  });
}

export async function removeBlocklistItems(input: unknown): Promise<Response> {
  const { items } = parseInput(removeBlocklistSchema, input);
  const byInstance = new Map<string, number[]>();
  for (const item of items)
    byInstance.set(item.instanceId, [
      ...(byInstance.get(item.instanceId) ?? []),
      item.id,
    ]);
  const instances = await readInstances();
  const results = await Promise.all(
    [...byInstance].map(async ([instanceId, ids]) => {
      const instance = instances.find((entry) => entry.id === instanceId);
      if (!instance)
        return mutationFailure(
          { id: instanceId, name: "Unknown instance" },
          new ApiError(404, "Selected instance no longer exists."),
        );
      return executeMutation(
        instance,
        { operation: "unblock" },
        async (write) => {
          await write("blocklist/bulk", { method: "DELETE", body: { ids } });
          return "Removed.";
        },
      );
    }),
  );
  const errors = results.flatMap((result) =>
    result.error ? [result.error] : [],
  );
  const removed = [...byInstance.values()]
    .filter((_, index) => !results[index].error)
    .reduce((total, ids) => total + ids.length, 0);
  const noun = (count: number) =>
    `${count} blocklist ${count === 1 ? "entry" : "entries"}`;
  return actionResponse(
    {
      success: errors.length === 0,
      outcomes: results.map((result) => result.outcome),
      message: removed
        ? `Removed ${noun(removed)}. Those releases can be grabbed again.${errors.length ? " Some instances failed; review the errors before retrying." : ""}`
        : "No blocklist entries were removed. Review the errors and refresh before retrying.",
      ...(errors.length ? { errors } : {}),
    },
    errors.length ? (removed ? 207 : results[0].status) : 200,
  );
}
