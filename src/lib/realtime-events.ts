import { z } from "zod";

export const realtimeTopics = [
  "queue",
  "library",
  "episodes",
  "calendar",
  "instances",
  "options",
  "commands",
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
export const realtimeMediaSchema = z.object({
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
      seasonCount: z.number().optional(),
      monitoredSeasonCount: z.number().optional(),
    }),
  ),
});
export const realtimeQueueItemSchema = z.object({
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
// Bounds the active-command list carried in each instance summary. Kept in one
// place so the fetch, the SignalR merge, and the snapshot schema agree.
export const MAX_ACTIVE_COMMANDS = 32;
const activeCommand = z.object({
  id: z.number().int(),
  name: z.string(),
  commandName: z.string(),
  message: z.string(),
  status: z.string(),
});
export const realtimeInstanceSchema = z.object({
  id: instanceId,
  name: z.string(),
  kind: z.enum(["radarr", "sonarr"]),
  url: z.string(),
  hasApiKey: z.boolean(),
  connected: z.boolean(),
  version: z.string().optional(),
  error: z.string().optional(),
  commands: z.array(activeCommand).max(MAX_ACTIVE_COMMANDS).optional(),
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
  episodeFileId: z.number().int().nonnegative(),
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
    data: z.object({
      items: z.array(realtimeMediaSchema),
      errors,
      loadingInstanceIds: z.array(instanceId).max(32).optional(),
    }),
  }),
  z.object({
    queryKey: z.tuple([z.literal("queue")]),
    version: realtimeVersionSchema,
    data: z.object({ items: z.array(realtimeQueueItemSchema), errors }),
  }),
  z.object({
    queryKey: z.tuple([z.literal("instances")]),
    version: realtimeVersionSchema,
    data: z.object({ instances: z.array(realtimeInstanceSchema).max(32) }),
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

// Patches carry only allowlisted DTO fields. Identity fields cannot be changed;
// replacing an identity is a removal followed by an insertion.
const patchVersion = {
  version: realtimeVersionSchema,
  baseRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  removed: z.array(z.string()),
  order: z.array(z.string()).optional(),
};
const mediaFields = realtimeMediaSchema.omit({ id: true });
const queueFields = realtimeQueueItemSchema.omit({
  id: true,
  instanceId: true,
});
const instanceFields = realtimeInstanceSchema.omit({ id: true });
export const realtimePatchSchema = z
  .union([
    z.object({
      ...patchVersion,
      queryKey: z.tuple([z.literal("library")]),
      added: z.array(realtimeMediaSchema),
      updated: z.array(
        z.object({
          key: z.string(),
          set: mediaFields.partial(),
          unset: z.array(
            z.enum(["backdrop", "rating", "runtime", "tmdbId", "tvdbId"]),
          ),
        }),
      ),
      metadata: z.object({
        errors,
        loadingInstanceIds: z.array(instanceId).max(32).optional(),
      }),
    }),
    z.object({
      ...patchVersion,
      queryKey: z.tuple([z.literal("queue")]),
      added: z.array(realtimeQueueItemSchema),
      updated: z.array(
        z.object({
          key: z.string(),
          set: queueFields.partial(),
          unset: z.array(
            z.enum(["poster", "timeleft", "downloadClient", "downloadId"]),
          ),
        }),
      ),
      metadata: z.object({ errors }),
    }),
    z.object({
      ...patchVersion,
      queryKey: z.tuple([z.literal("instances")]),
      added: z.array(realtimeInstanceSchema),
      updated: z.array(
        z.object({
          key: z.string(),
          set: instanceFields.partial(),
          unset: z.array(z.enum(["version", "error", "commands"])),
        }),
      ),
      metadata: z.object({}),
    }),
  ])
  .refine((patch) => patch.version.revision > patch.baseRevision);
export type RealtimePatch = z.infer<typeof realtimePatchSchema>;
