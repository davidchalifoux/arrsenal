import { z } from "zod";

export const realtimeTopics = [
  "queue",
  "library",
  "episodes",
  "calendar",
  "instances",
  "options",
] as const;

const instanceId = z.string().min(1).max(100);
const remoteId = z.number().int().min(1).max(2147483647);
export const realtimeEventSchema = z.object({
  instanceId: instanceId.optional(),
  remoteId: remoteId.optional(),
  topics: z.array(z.enum(realtimeTopics)).min(1).max(realtimeTopics.length),
  reset: z.literal(true).optional(),
});
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export type RealtimeTopic = RealtimeEvent["topics"][number];

const date = z.iso.date();
const calendarKey = z
  .tuple([z.literal("calendar"), date, date])
  .refine(
    ([, start, end]) =>
      start >= "0001-01-01" &&
      end > start &&
      Date.parse(end) - Date.parse(start) <= 93 * 86400000,
    "Calendar range must be increasing and at most 93 days.",
  );
export const realtimeQueryKeySchema = z.union([
  z.tuple([z.literal("library")]),
  z.tuple([z.literal("queue")]),
  z.tuple([z.literal("instances")]),
  calendarKey,
  z.tuple([z.literal("episodes"), instanceId, remoteId]),
  z.tuple([z.literal("instance-options"), instanceId]),
]);
export type RealtimeQueryKey = z.infer<typeof realtimeQueryKeySchema>;

export const realtimeCoreQueries: RealtimeQueryKey[] = [
  ["library"],
  ["queue"],
  ["instances"],
];

export const realtimeVersionSchema = z.object({
  epoch: z.string().min(1).max(100),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export type RealtimeVersion = z.infer<typeof realtimeVersionSchema>;
export type Versioned<T> = T & { _realtime: RealtimeVersion };

const kind = z.enum(["movie", "series"]);
const status = z.enum(["available", "partial", "missing", "downloading"]);
const serviceError = z.object({
  instanceId,
  instanceName: z.string(),
  message: z.string(),
});
const errors = z.array(serviceError);
const media = z.object({
  id: z.string(),
  kind,
  title: z.string(),
  year: z.number(),
  overview: z.string(),
  poster: z.string(),
  backdrop: z.string().optional(),
  genres: z.array(z.string()),
  rating: z.number().optional(),
  runtime: z.number().optional(),
  tmdbId: z.number().optional(),
  tvdbId: z.number().optional(),
  added: z.string(),
  status,
  targets: z.array(
    z.object({
      instanceId,
      instanceName: z.string(),
      remoteId,
      qualityProfileId: z.number(),
      qualityProfile: z.string(),
      quality: z.string(),
      status,
      monitored: z.boolean(),
      sizeOnDisk: z.number(),
      episodeCount: z.number().optional(),
      episodeFileCount: z.number().optional(),
    }),
  ),
});
const queueItem = z.object({
  id: z.number(),
  instanceId,
  instanceName: z.string(),
  title: z.string(),
  mediaTitle: z.string(),
  kind,
  poster: z.string().optional(),
  quality: z.string(),
  size: z.number(),
  sizeleft: z.number(),
  status: z.string(),
  timeleft: z.string().optional(),
  downloadClient: z.string().optional(),
  downloadId: z.string().optional(),
  warnings: z.array(z.string()),
});
const instance = z.object({
  id: instanceId,
  name: z.string(),
  kind: z.enum(["radarr", "sonarr"]),
  url: z.string(),
  hasApiKey: z.boolean(),
  connected: z.boolean(),
  version: z.string().optional(),
  error: z.string().optional(),
});
const calendarEvent = z.object({
  id: z.string(),
  title: z.string(),
  mediaId: z.string().optional(),
  kind,
  type: z.enum(["episode", "theatrical", "digital", "physical"]),
  date: z.string(),
  airDateUtc: z.string().optional(),
  episodeTitle: z.string().optional(),
  seasonNumber: z.number().optional(),
  episodeNumber: z.number().optional(),
  sources: z.array(z.object({ instanceId, instanceName: z.string() })),
});
const episode = z.object({
  id: remoteId,
  seriesId: remoteId,
  seasonNumber: z.number(),
  episodeNumber: z.number(),
  title: z.string(),
  overview: z.string(),
  airDateUtc: z.string().optional(),
  runtime: z.number().optional(),
  monitored: z.boolean(),
  hasFile: z.boolean(),
  quality: z.string(),
  sizeOnDisk: z.number(),
  status: z.enum([
    "available",
    "missing",
    "downloading",
    "unreleased",
    "unmonitored",
    "unknown",
  ]),
});

// Explicit DTO schemas strip unknown fields. Raw upstream resources never cross SSE.
export const realtimeSnapshotSchema = z.union([
  z.object({
    queryKey: z.tuple([z.literal("library")]),
    version: realtimeVersionSchema,
    data: z.object({ items: z.array(media), errors }),
  }),
  z.object({
    queryKey: z.tuple([z.literal("queue")]),
    version: realtimeVersionSchema,
    data: z.object({ items: z.array(queueItem), errors }),
  }),
  z.object({
    queryKey: z.tuple([z.literal("instances")]),
    version: realtimeVersionSchema,
    data: z.object({ instances: z.array(instance).max(32) }),
  }),
  z.object({
    queryKey: calendarKey,
    version: realtimeVersionSchema,
    data: z.object({
      items: z.array(calendarEvent),
      errors,
      instanceCount: z.number(),
    }),
  }),
  z
    .object({
      queryKey: z.tuple([z.literal("episodes"), instanceId, remoteId]),
      version: realtimeVersionSchema,
      data: z.object({
        instanceId,
        instanceName: z.string(),
        remoteId,
        seasons: z.array(
          z.object({ seasonNumber: z.number(), monitored: z.boolean() }),
        ),
        episodes: z.array(episode),
        errors,
      }),
    })
    .refine(
      ({ queryKey, data }) =>
        data.instanceId === queryKey[1] &&
        data.remoteId === queryKey[2] &&
        data.episodes.every((item) => item.seriesId === queryKey[2]),
      "Episode snapshot does not match its query.",
    ),
  z.object({
    queryKey: z.tuple([z.literal("instance-options"), instanceId]),
    version: realtimeVersionSchema,
    data: z.object({
      profiles: z.array(z.object({ id: z.number(), name: z.string() })),
      rootFolders: z.array(
        z.object({
          id: z.number(),
          path: z.string(),
          freeSpace: z.number().optional(),
        }),
      ),
    }),
  }),
  z.object({
    queryKey: realtimeQueryKeySchema,
    version: realtimeVersionSchema,
    error: z.string(),
  }),
]);
export type RealtimeSnapshot = z.infer<typeof realtimeSnapshotSchema>;

export const realtimeStatusSchema = z.object({
  instances: z
    .array(
      z.object({
        instanceId,
        status: z.enum(["connecting", "connected", "disconnected"]),
      }),
    )
    .max(32),
});
export type RealtimeStatus = z.infer<typeof realtimeStatusSchema>;
