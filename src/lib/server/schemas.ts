import "server-only";

import { z } from "zod";
import { isPosterSource } from "../image-sources";

const objectError = { error: "A JSON object is required." };

export const jsonObjectSchema = z.record(z.string(), z.unknown(), objectError);

function textSchema(name: string, max: number) {
  const error = `${name} must be a nonempty string (at most ${max} characters).`;
  return z
    .string({ error })
    .refine(
      (value) =>
        value.length <= max &&
        Boolean(value.trim()) &&
        [...value].every(
          (character) =>
            character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
        ),
      // Preserve the original UTF-16 length limit and reject controls before trimming.
      { error },
    )
    .trim();
}

function integerSchema(name: string, min = 1) {
  const error = `${name} must be an integer between ${min} and 2147483647.`;
  return z
    .number({ error })
    .int({ error })
    .min(min, { error })
    .max(2147483647, { error });
}

function queryIntegerSchema(name: string, min = 1) {
  const error = `${name} must be a ${min === 0 ? "nonnegative" : "positive"} integer.`;
  return z
    .string({ error })
    .regex(/^\d+$/, { error })
    .transform(Number)
    .pipe(integerSchema(name, min));
}

function seriesEpisodeOnly(value: { kind: string; episodeId?: number }) {
  return value.episodeId === undefined || value.kind === "series";
}

const episodeKindError = {
  error: "episodeId is only valid for series.",
  path: ["episodeId"],
};

const seasonKindError = {
  error: "seasonNumber is only valid for series.",
  path: ["seasonNumber"],
};

const searchScopeError = {
  error: "episodeId and seasonNumber cannot be combined.",
  path: ["seasonNumber"],
};

const instanceIdSchema = textSchema("instanceId", 100);
const mediaKindSchema = z.enum(["movie", "series"], {
  error: "kind must be movie or series.",
});

export const instanceInputSchema = z.object(
  {
    name: textSchema("name", 100),
    kind: z.enum(["radarr", "sonarr"], {
      error: "kind must be radarr or sonarr.",
    }),
    url: textSchema("url", 2048)
      .pipe(
        z.url({
          error: "Enter a valid http:// or https:// instance URL.",
        }),
      )
      .transform((raw, context) => {
        // z.httpUrl() excludes local/private hosts; keep WHATWG URL parsing instead.
        const url = new URL(raw);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          raw.includes("\\")
        ) {
          context.issues.push({
            code: "custom",
            input: raw,
            message:
              "Instance URLs must use HTTP(S), without credentials, query strings, or fragments.",
          });
          return z.NEVER;
        }
        url.pathname = url.pathname
          .replace(/\/+$/, "")
          .replace(/\/api\/v3$/i, "");
        return url.toString().replace(/\/$/, "");
      }),
    apiKey: textSchema("apiKey", 512).regex(/^[\x21-\x7e]+$/, {
      error: "apiKey must contain only printable, non-space ASCII characters.",
    }),
  },
  objectError,
);

export const instanceEditSchema = instanceInputSchema.partial({ apiKey: true });

export const storedInstanceSchema = instanceInputSchema.extend({
  id: textSchema("id", 100).regex(/^[a-zA-Z0-9_-]+$/),
});

export const preferencesSchema = z.strictObject({
  timeZone: z
    .string()
    .max(100)
    .nullable()
    .transform((value, context) => {
      if (value === null || value === "") return null;
      try {
        if (/^[+-]/.test(value)) throw new Error("Numeric offset");
        return new Intl.DateTimeFormat(undefined, {
          timeZone: value,
        }).resolvedOptions().timeZone;
      } catch {
        context.issues.push({
          code: "custom",
          input: value,
          message: "Enter a valid IANA timezone, such as America/New_York.",
        });
        return z.NEVER;
      }
    }),
});

export const usernameSchema = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/, {
  error:
    "Username must be 1–64 letters, numbers, dots, underscores, or hyphens.",
});

export const passwordSchema = z
  .string()
  .refine(
    (value) =>
      value.length <= 1024 &&
      Buffer.byteLength(value, "utf8") <= 1024 &&
      [...value].length >= 8,
    {
      error:
        "Password must contain at least 8 characters and at most 1024 UTF-8 bytes.",
    },
  );

export const accountSchema = z.strictObject({
  username: usernameSchema,
  passwordHash: z
    .string()
    .max(256)
    .regex(
      /^\$argon2id\$v=19\$m=65536,t=3,p=1\$[A-Za-z0-9+/]{22,86}\$[A-Za-z0-9+/]{43}$/,
    ),
  generation: z.uuid(),
});

export const accountInputSchema = z.strictObject({
  username: usernameSchema,
  password: passwordSchema,
  currentPassword: z.string().max(1024).optional(),
});

export const configSchema = z.object({
  version: z.literal(1),
  preferences: preferencesSchema.default({ timeZone: null }),
  account: accountSchema.optional(),
  instances: z
    .array(storedInstanceSchema)
    .max(32)
    .refine(
      (instances) =>
        new Set(instances.map((instance) => instance.id)).size ===
          instances.length &&
        new Set(instances.map((instance) => instance.url)).size ===
          instances.length,
      { error: "Invalid or duplicate instance." },
    ),
});

export const instanceParamsSchema = z.object(
  { id: textSchema("id", 100) },
  objectError,
);

const identitySchema = jsonObjectSchema.pipe(
  z.discriminatedUnion(
    "kind",
    [
      z.object({
        kind: z.literal("movie"),
        tmdbId: integerSchema("media.tmdbId"),
      }),
      z.object({
        kind: z.literal("series"),
        tvdbId: integerSchema("media.tvdbId"),
      }),
    ],
    { error: "kind must be movie or series." },
  ),
);

const targetSchema = z.object(
  {
    instanceId: instanceIdSchema,
    qualityProfileId: integerSchema("qualityProfileId"),
    rootFolderPath: textSchema("rootFolderPath", 4096),
  },
  objectError,
);

const targetsError = { error: "Select between 1 and 32 targets." };

export const addMediaSchema = z.object(
  {
    // Strip client metadata, including raw upstream objects, down to its identity.
    media: identitySchema,
    search: z.boolean({ error: "search must be a boolean." }),
    targets: z
      .array(targetSchema, targetsError)
      .min(1, targetsError)
      .max(32, targetsError)
      .refine(
        (targets) =>
          new Set(targets.map((target) => target.instanceId)).size ===
          targets.length,
        { error: "Select each instance only once." },
      ),
  },
  objectError,
);

export const searchSchema = z
  .object(
    {
      kind: mediaKindSchema,
      remoteId: integerSchema("remoteId"),
      instanceId: instanceIdSchema,
      episodeId: integerSchema("episodeId").optional(),
      seasonNumber: integerSchema("seasonNumber", 0).optional(),
    },
    objectError,
  )
  .refine(seriesEpisodeOnly, episodeKindError)
  .refine(
    (value) => value.seasonNumber === undefined || value.kind === "series",
    seasonKindError,
  )
  .refine(
    (value) =>
      value.episodeId === undefined || value.seasonNumber === undefined,
    searchScopeError,
  );

export const grabReleaseSchema = z.object(
  {
    guid: textSchema("guid", 4096),
    indexerId: integerSchema("indexerId"),
    instanceId: instanceIdSchema,
  },
  objectError,
);

// Queue IDs are signed 32-bit hashes, unlike positive media/profile/indexer IDs.
export const retryQueueSchema = z.object(
  {
    id: integerSchema("id", -2147483648),
    instanceId: instanceIdSchema,
  },
  objectError,
);

export const removeQueueSchema = retryQueueSchema.extend({
  blocklist: z.boolean({ error: "blocklist must be a boolean." }),
  removeFromClient: z.boolean({ error: "removeFromClient must be a boolean." }),
});

export const lookupQuerySchema = z.object({
  term: z
    .union([z.literal(""), textSchema("term", 300)], {
      error: "term must be a nonempty string (at most 300 characters).",
    })
    .default(""),
  kind: mediaKindSchema.optional(),
});

export const episodesQuerySchema = z.object({
  instanceId: instanceIdSchema,
  remoteId: queryIntegerSchema("remoteId"),
});

export const releasesQuerySchema = z
  .object({
    ...episodesQuerySchema.shape,
    kind: mediaKindSchema,
    // Do not coerce arbitrary strings, booleans, hex, or exponent notation into IDs.
    episodeId: queryIntegerSchema("episodeId").optional(),
    seasonNumber: queryIntegerSchema("seasonNumber", 0).optional(),
  })
  .refine(seriesEpisodeOnly, episodeKindError)
  .refine(
    (value) => value.seasonNumber === undefined || value.kind === "series",
    seasonKindError,
  )
  .refine(
    (value) =>
      value.episodeId === undefined || value.seasonNumber === undefined,
    searchScopeError,
  );

export const imageQuerySchema = z.object({
  instanceId: instanceIdSchema,
  path: textSchema("path", 2048),
  fallback: textSchema("fallback", 2048)
    .pipe(z.url({ error: "Invalid artwork fallback URL." }))
    .refine((value) => isPosterSource(new URL(value)), {
      error: "Artwork fallback must use an allowed CDN source.",
    })
    .optional(),
});

export const localCoverPathSchema = z
  .string()
  .regex(
    /^\/(?:api\/v3\/)?MediaCover\/\d+\/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp|gif|avif)$/i,
    { error: "path must be a local /MediaCover/<id>/<image> path." },
  )
  .transform((path) => path.replace(/^\/(?:api\/v3\/)?/i, ""));
