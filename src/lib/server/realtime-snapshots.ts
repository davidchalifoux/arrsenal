import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  type RealtimeQueryKey,
  type RealtimeSnapshot,
  type RealtimeTopic,
  type RealtimeVersion,
  realtimeCoreQueries,
  realtimeQueryKeySchema,
  realtimeSnapshotSchema,
  type Versioned,
} from "../realtime-events";
import type {
  CalendarResponse,
  EpisodesResponse,
  InstanceOptions,
  InstanceSummary,
  LibraryResponse,
  MediaItem,
  QueueItem,
  QueueResponse,
  ServiceError,
} from "../types";
import {
  instanceOptions,
  instanceSummary,
  num,
  queueRecords,
  type Row,
  redact,
  row,
  str,
} from "./arr";
import { instanceCalendar, mergeCalendar } from "./calendar";
import { type InstanceConfig, readInstances } from "./config";
import { instanceEpisodes } from "./episodes";
import { ApiError, errorMessage, parseInput } from "./http";
import {
  combinedStatus,
  mergeMedia,
  normalizeMedia,
  normalizeQueue,
} from "./media";
import { instanceMedia, type MediaEnrichment } from "./services";

type Data =
  | LibraryResponse
  | QueueResponse
  | CalendarResponse
  | EpisodesResponse
  | InstanceOptions
  | { instances: InstanceSummary[] };
type Listener = (snapshot: RealtimeSnapshot) => void;
type Slot<T> = {
  generation: number;
  committed: number;
  value?: T;
  error?: ApiError;
  pending?: Promise<T>;
  retired: boolean;
};
type LibraryBacking = LibraryResponse & { enrichment?: MediaEnrichment };
type QueueBacking = { items: QueueItem[]; records: Row[] };
type CalendarBacking = Pick<CalendarResponse, "items" | "errors">;
type Backing = {
  instance: InstanceConfig;
  library: Slot<LibraryBacking>;
  queue: Slot<QueueBacking>;
  summary: Slot<InstanceSummary>;
  options: Slot<InstanceOptions>;
  calendars: Map<string, Slot<CalendarBacking>>;
  episodes: Map<number, Slot<EpisodesResponse>>;
};
type Entry = {
  key: RealtimeQueryKey;
  listeners: Set<Listener>;
  readers: number;
  generation: number;
  retired: boolean;
  snapshot?: RealtimeSnapshot;
  calendarFailure?: CalendarResponse;
  failure?: ApiError;
  pending?: Promise<RealtimeSnapshot>;
  timer?: NodeJS.Timeout;
  expiry?: NodeJS.Timeout;
};

function createStore() {
  const epoch = randomUUID();
  let revision = 0;
  let configRead: Promise<void> | undefined;
  let configGeneration = 0;
  const entries = new Map<string, Entry>();
  const backing = new Map<string, Backing>();
  const version = (): RealtimeVersion => ({ epoch, revision: ++revision });
  const slot = <T>(): Slot<T> => ({
    generation: 1,
    committed: 0,
    retired: false,
  });
  const allSlots = (state: Backing) => [
    state.library,
    state.queue,
    state.summary,
    state.options,
    ...state.calendars.values(),
    ...state.episodes.values(),
  ];
  const active = (entry: Entry) =>
    !entry.retired && (entry.listeners.size > 0 || entry.readers > 0);
  const relevant = (entry: Entry, id: string) =>
    !["episodes", "instance-options"].includes(entry.key[0]) ||
    entry.key[1] === id;
  const topic = (key: RealtimeQueryKey): RealtimeTopic =>
    key[0] === "instance-options" ? "options" : key[0];

  function mark(cell: Slot<unknown>, force = false) {
    if (!cell.retired && (!force || !cell.pending)) cell.generation++;
  }

  // Each generation has exactly one shared load, including its failure. Changes
  // during a load cause one trailing pass; direct commits retire stale work.
  function load<T>(cell: Slot<T>, fetchValue: () => Promise<T>): Promise<T> {
    if (cell.retired)
      return Promise.reject(
        new ApiError(409, "Instance configuration changed. Refresh and retry."),
      );
    if (cell.pending) return cell.pending;
    if (cell.committed === cell.generation) {
      if (cell.error) return Promise.reject(cell.error);
      if (cell.value !== undefined) return Promise.resolve(cell.value);
    }
    cell.pending = (async () => {
      while (!cell.retired) {
        const generation = cell.generation;
        try {
          const value = await fetchValue();
          if (cell.retired) break;
          if (cell.generation !== generation) {
            if (
              cell.committed === cell.generation &&
              cell.value !== undefined &&
              !cell.error
            )
              return cell.value;
            continue;
          }
          cell.value = value;
          cell.error = undefined;
          cell.committed = generation;
          return value;
        } catch (error) {
          if (cell.retired) break;
          if (cell.generation !== generation) {
            if (
              cell.committed === cell.generation &&
              cell.value !== undefined &&
              !cell.error
            )
              return cell.value;
            continue;
          }
          cell.error =
            error instanceof ApiError
              ? error
              : new ApiError(
                  502,
                  "Unable to refresh instance data. Check its connection and retry.",
                );
          cell.committed = generation;
          throw cell.error;
        }
      }
      throw new ApiError(
        409,
        "Instance configuration changed. Refresh and retry.",
      );
    })().finally(() => {
      cell.pending = undefined;
    });
    return cell.pending;
  }

  function queueFor(state: Backing) {
    return load(state.queue, async () => {
      const records = await queueRecords(state.instance);
      return {
        items: records.map((item) => normalizeQueue(item, state.instance)),
        // Only identities/status are retained for enrichment, never raw paths,
        // credentials, upstream error objects, or arbitrary nested resources.
        records: records.map((item) => ({
          movieId: num(item.movieId, num(row(item.movie).id)),
          seriesId:
            item.seriesId === undefined &&
            row(item.episode).seriesId === undefined &&
            row(item.series).id === undefined
              ? undefined
              : num(
                  item.seriesId,
                  num(row(item.episode).seriesId, num(row(item.series).id)),
                ),
          episodeId: num(item.episodeId, num(row(item.episode).id)),
          status: str(item.status),
        })),
      };
    });
  }

  function libraryFor(state: Backing) {
    return load(state.library, async () => {
      let enrichment: MediaEnrichment | undefined;
      const result = await instanceMedia(state.instance, undefined, {
        queue: async () => (await queueFor(state)).records,
        enrichment: (value) => {
          enrichment = value;
        },
      });
      if (!result.primarySucceeded)
        throw new ApiError(
          502,
          result.errors[0]?.message ?? "Unable to refresh the library.",
        );
      return { items: result.items, errors: result.errors, enrichment };
    });
  }

  function calendarCell(
    state: Backing,
    key: Extract<RealtimeQueryKey, ["calendar", string, string]>,
  ) {
    const id = JSON.stringify(key);
    let cell = state.calendars.get(id);
    if (!cell) {
      cell = slot<CalendarBacking>();
      state.calendars.set(id, cell);
    }
    return cell;
  }

  function episodeCell(state: Backing, id: number) {
    let cell = state.episodes.get(id);
    if (!cell) {
      cell = slot<EpisodesResponse>();
      state.episodes.set(id, cell);
    }
    return cell;
  }

  function cellsFor(state: Backing, key: RealtimeQueryKey): Slot<unknown>[] {
    switch (key[0]) {
      case "library":
        return [state.library, state.queue];
      case "queue":
        return [state.queue];
      case "instances":
        return [state.summary];
      case "calendar":
        return [calendarCell(state, key)];
      case "episodes":
        return [episodeCell(state, key[2]), state.queue];
      case "instance-options":
        return [state.options];
    }
  }

  function libraryItems(state: Backing, value: LibraryBacking): MediaItem[] {
    const records = state.queue.value?.records;
    if (!records || state.queue.error) return value.items;
    const downloading = new Set(
      records
        .filter(
          (item) =>
            !["failed", "delay", "downloadclientunavailable"].includes(
              str(item.status).toLowerCase(),
            ),
        )
        .map((item) =>
          num(state.instance.kind === "radarr" ? item.movieId : item.seriesId),
        ),
    );
    return value.items.map((item) => {
      const targets = item.targets.map((target) => ({
        ...target,
        instanceName: state.instance.name,
        status: downloading.has(target.remoteId)
          ? ("downloading" as const)
          : item.kind === "movie"
            ? target.quality === "Not downloaded"
              ? ("missing" as const)
              : ("available" as const)
            : (target.episodeFileCount ?? 0) > 0
              ? (target.episodeCount ?? 0) > 0 &&
                (target.episodeFileCount ?? 0) >= (target.episodeCount ?? 0)
                ? ("available" as const)
                : ("partial" as const)
              : ("missing" as const),
      }));
      return { ...item, targets, status: combinedStatus(targets) };
    });
  }

  async function aggregate(entry: Entry): Promise<Data> {
    const key = entry.key;
    entry.calendarFailure = undefined;
    const states = [...backing.values()].filter((state) =>
      relevant(entry, state.instance.id),
    );
    if (
      (key[0] === "episodes" || key[0] === "instance-options") &&
      !states.length
    )
      throw new ApiError(404, "Instance not found.");
    const results = await Promise.all(
      states.map(async (state) => {
        try {
          switch (key[0]) {
            case "library": {
              const value = await libraryFor(state);
              const errors = [...value.errors];
              try {
                await queueFor(state);
              } catch (error) {
                if (
                  !errors.some((entry) =>
                    entry.message.startsWith("Download status unavailable:"),
                  )
                )
                  errors.push({
                    instanceId: state.instance.id,
                    instanceName: state.instance.name,
                    message: `Download status unavailable: ${errorMessage(error)}`,
                  });
              }
              return {
                data: { items: libraryItems(state, value), errors } as Data,
              };
            }
            case "queue":
              return {
                data: {
                  items: (await queueFor(state)).items,
                  errors: [],
                } as Data,
              };
            case "instances":
              return {
                data: {
                  instances: [
                    await load(state.summary, () =>
                      instanceSummary(state.instance),
                    ),
                  ],
                } as Data,
              };
            case "calendar": {
              const value = await load(calendarCell(state, key), async () => {
                const result = await instanceCalendar(
                  state.instance,
                  key[1],
                  key[2],
                );
                if (result.errors.length)
                  throw new ApiError(502, result.errors[0].message);
                return result;
              });
              return { data: { ...value, instanceCount: 1 } as Data };
            }
            case "episodes":
              return {
                data: (await load(episodeCell(state, key[2]), () =>
                  instanceEpisodes(
                    state.instance,
                    key[2],
                    async () => (await queueFor(state)).records,
                  ),
                )) as Data,
              };
            case "instance-options":
              return {
                data: (await load(state.options, () =>
                  instanceOptions(state.instance),
                )) as Data,
              };
          }
        } catch (error) {
          if (key[0] === "episodes" || key[0] === "instance-options")
            throw error;
          const failure: ServiceError = {
            instanceId: state.instance.id,
            instanceName: state.instance.name,
            message: errorMessage(error),
          };
          let data: Data | undefined;
          switch (key[0]) {
            case "library":
              if (state.library.value)
                data = {
                  items: libraryItems(state, state.library.value),
                  errors: [],
                };
              break;
            case "queue":
              if (state.queue.value)
                data = { items: state.queue.value.items, errors: [] };
              break;
            case "calendar": {
              const value = calendarCell(state, key).value;
              if (value) data = { ...value, instanceCount: 1 };
              break;
            }
          }
          return { data, failure };
        }
      }),
    );
    const failures = results.flatMap((result) =>
      result.failure ? [result.failure] : [],
    );
    if (failures.length === states.length && states.length) {
      if (key[0] === "calendar")
        entry.calendarFailure = {
          items: [],
          errors: failures,
          instanceCount: states.length,
        };
      throw new ApiError(502, failures[0].message);
    }
    const values = results.flatMap((result) =>
      result.data ? [result.data] : [],
    );
    switch (key[0]) {
      case "library":
        return {
          items: mergeMedia(
            (values as LibraryResponse[]).flatMap((value) => value.items),
          ),
          errors: [
            ...(values as LibraryResponse[]).flatMap((value) => value.errors),
            ...failures,
          ],
        };
      case "queue":
        return {
          items: (values as QueueResponse[]).flatMap((value) => value.items),
          errors: failures,
        };
      case "instances":
        return {
          instances: (values as { instances: InstanceSummary[] }[]).flatMap(
            (value) => value.instances,
          ),
        };
      case "calendar":
        return mergeCalendar(
          [...(values as CalendarResponse[]), { items: [], errors: failures }],
          states.length,
        );
      default:
        return values[0];
    }
  }

  function publish(entry: Entry, snapshot: RealtimeSnapshot) {
    if (entry.retired) return;
    entry.snapshot = snapshot;
    for (const listener of entry.listeners) {
      try {
        listener(snapshot);
      } catch {
        /* One closed stream cannot interrupt peers. */
      }
    }
  }

  function refresh(entry: Entry): Promise<RealtimeSnapshot> {
    if (entry.pending) return entry.pending;
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
    }
    entry.pending = (async () => {
      while (!entry.retired) {
        const generation = entry.generation;
        let data: Data;
        try {
          data = await aggregate(entry);
        } catch (error) {
          if (entry.generation !== generation) continue;
          entry.failure =
            error instanceof ApiError
              ? error
              : new ApiError(502, "Unable to refresh instance data.");
          const snapshot: RealtimeSnapshot = {
            queryKey: entry.key,
            version: version(),
            error: errorMessage(error),
          };
          publish(entry, snapshot);
          return snapshot;
        }
        if (entry.generation !== generation) continue;
        entry.failure = undefined;
        const snapshot = realtimeSnapshotSchema.parse({
          queryKey: entry.key,
          version: version(),
          data,
        });
        publish(entry, snapshot);
        return snapshot;
      }
      throw new ApiError(409, "The realtime subscription has closed.");
    })().finally(() => {
      entry.pending = undefined;
    });
    return entry.pending;
  }

  function schedule(entry: Entry) {
    entry.generation++;
    if (entry.retired || !entry.listeners.size || entry.pending || entry.timer)
      return;
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      void refresh(entry).catch(() => {});
    }, 100);
    entry.timer.unref?.();
  }

  function prune() {
    for (const [id, state] of backing) {
      const interested = [...entries.values()].filter((entry) =>
        relevant(entry, id),
      );
      if (!interested.length) {
        for (const cell of allSlots(state)) cell.retired = true;
        backing.delete(id);
        continue;
      }
      for (const [key, cell] of state.calendars) {
        if (!entries.has(key)) {
          cell.retired = true;
          state.calendars.delete(key);
        }
      }
      for (const [remoteId, cell] of state.episodes) {
        if (!entries.has(JSON.stringify(["episodes", id, remoteId]))) {
          cell.retired = true;
          state.episodes.delete(remoteId);
        }
      }
    }
  }

  function expire(entry: Entry) {
    if (active(entry) || entry.expiry) return;
    entry.expiry = setTimeout(() => {
      entry.expiry = undefined;
      if (active(entry)) return;
      entry.retired = true;
      clearTimeout(entry.timer);
      entries.delete(JSON.stringify(entry.key));
      prune();
    }, 30_000);
    entry.expiry.unref?.();
  }

  function obtain(key: RealtimeQueryKey) {
    const id = JSON.stringify(key);
    let entry = entries.get(id);
    if (!entry) {
      if (entries.size >= 256) {
        const unused = [...entries.values()].find(
          (candidate) => !active(candidate),
        );
        if (!unused)
          throw new ApiError(503, "Too many active realtime queries.");
        unused.retired = true;
        clearTimeout(unused.timer);
        clearTimeout(unused.expiry);
        entries.delete(JSON.stringify(unused.key));
        prune();
      }
      entry = {
        key,
        listeners: new Set(),
        readers: 0,
        generation: 0,
        retired: false,
      };
      entries.set(id, entry);
    }
    if (entry.expiry) {
      clearTimeout(entry.expiry);
      entry.expiry = undefined;
    }
    return entry;
  }

  function reconcile(instances: InstanceConfig[]) {
    configGeneration++;
    let changed = false;
    const ids = new Set(instances.map((instance) => instance.id));
    for (const [id, state] of backing) {
      const next = instances.find((instance) => instance.id === id);
      if (
        !next ||
        next.kind !== state.instance.kind ||
        next.url !== state.instance.url ||
        next.apiKey !== state.instance.apiKey
      ) {
        for (const cell of allSlots(state)) cell.retired = true;
        backing.delete(id);
        changed = true;
      } else if (next.name !== state.instance.name) {
        state.instance = { ...next };
        // Reuse normalized records and relabel only public instance metadata.
        if (state.library.value)
          state.library.value.items = state.library.value.items.map((item) => ({
            ...item,
            targets: item.targets.map((target) => ({
              ...target,
              instanceName: next.name,
            })),
          }));
        if (state.queue.value)
          state.queue.value.items = state.queue.value.items.map((item) => ({
            ...item,
            instanceName: next.name,
          }));
        if (state.summary.value)
          state.summary.value = { ...state.summary.value, name: next.name };
        for (const cell of state.calendars.values())
          if (cell.value)
            cell.value = {
              ...cell.value,
              items: cell.value.items.map((item) => ({
                ...item,
                sources: item.sources.map((source) => ({
                  ...source,
                  instanceName: next.name,
                })),
              })),
            };
        for (const cell of state.episodes.values())
          if (cell.value)
            cell.value = { ...cell.value, instanceName: next.name };
        // Pending work captured the old name and cannot overwrite relabeled data.
        for (const cell of allSlots(state)) if (cell.pending) mark(cell);
        changed = true;
      }
    }
    if (entries.size)
      for (const instance of instances) {
        if (!backing.has(instance.id)) {
          backing.set(instance.id, {
            instance: { ...instance },
            library: slot(),
            queue: slot(),
            summary: slot(),
            options: slot(),
            calendars: new Map(),
            episodes: new Map(),
          });
          changed = true;
        }
      }
    if (changed)
      for (const entry of entries.values()) {
        if (
          ["episodes", "instance-options"].includes(entry.key[0]) &&
          !ids.has(entry.key[1] as string)
        )
          entry.snapshot = undefined;
        schedule(entry);
      }
  }

  function synchronize() {
    if (!configRead) {
      const generation = configGeneration;
      configRead = readInstances()
        .then((instances) => {
          if (generation === configGeneration) reconcile(instances);
        })
        .finally(() => {
          configRead = undefined;
        });
    }
    return configRead;
  }

  async function read(key: RealtimeQueryKey): Promise<Versioned<Data>> {
    const entry = obtain(parseInput(realtimeQueryKeySchema, key));
    entry.readers++;
    try {
      await synchronize();
      if (!entry.pending) {
        for (const state of backing.values())
          if (relevant(entry, state.instance.id))
            for (const cell of cellsFor(state, entry.key)) mark(cell, true);
        entry.generation++;
      }
      const snapshot = await refresh(entry);
      if (!("data" in snapshot)) {
        // Calendar REST callers expose per-instance diagnostics with HTTP 502.
        // SSE still emits an error and never replaces last-good browser data.
        if (entry.key[0] === "calendar" && entry.calendarFailure)
          return { ...entry.calendarFailure, _realtime: snapshot.version };
        throw entry.failure ?? new ApiError(502, snapshot.error);
      }
      return { ...snapshot.data, _realtime: snapshot.version };
    } finally {
      entry.readers--;
      expire(entry);
    }
  }

  function subscribe(listener: Listener) {
    const subscribed: Entry[] = [];
    const forward: Listener = (snapshot) => listener(snapshot);
    try {
      for (const key of realtimeCoreQueries) {
        const entry = obtain(key);
        subscribed.push(entry);
        entry.listeners.add(forward);
      }
    } catch (error) {
      for (const entry of subscribed) {
        entry.listeners.delete(forward);
        expire(entry);
      }
      throw error;
    }
    let closed = false;
    void synchronize()
      .then(() => {
        if (closed) return;
        for (const entry of subscribed) {
          if (entry.snapshot) {
            try {
              listener(entry.snapshot);
            } catch {}
          }
          void refresh(entry).catch(() => {});
        }
      })
      .catch(() => {
        if (!closed)
          for (const entry of subscribed)
            publish(entry, {
              queryKey: entry.key,
              version: version(),
              error:
                "Unable to read instance configuration. Refresh and retry.",
            });
      });
    return () => {
      closed = true;
      for (const entry of subscribed) {
        entry.listeners.delete(forward);
        if (!entry.listeners.size) {
          clearTimeout(entry.timer);
          entry.timer = undefined;
        }
        expire(entry);
      }
    };
  }

  function refreshAll(instanceId?: string) {
    for (const state of backing.values()) {
      if (instanceId && state.instance.id !== instanceId) continue;
      for (const cell of allSlots(state)) mark(cell);
    }
    for (const entry of entries.values())
      if (!instanceId || relevant(entry, instanceId)) schedule(entry);
  }

  function update(
    instance: InstanceConfig,
    message: unknown,
    topics: readonly RealtimeTopic[],
    remoteId?: number,
  ) {
    const state = backing.get(instance.id);
    if (
      !state ||
      state.instance.apiKey !== instance.apiKey ||
      state.instance.url !== instance.url ||
      state.instance.kind !== instance.kind
    )
      return;
    const direct = topics.includes("library") && applyMedia(state, message);
    if (topics.includes("queue")) mark(state.queue);
    const queueMessage = /^queue(?:\/|$)/i.test(str(row(message).name));
    if (topics.includes("library") && !direct && !queueMessage) {
      mark(state.library);
      if (state.library.value?.enrichment)
        state.library.value.enrichment.complete = false;
    }
    if (topics.includes("instances")) mark(state.summary);
    if (topics.includes("options")) {
      mark(state.options);
      mark(state.library);
      if (state.library.value?.enrichment)
        state.library.value.enrichment.complete = false;
    }
    if (topics.includes("calendar"))
      for (const cell of state.calendars.values()) mark(cell);
    if (topics.includes("episodes"))
      for (const [id, cell] of state.episodes)
        if (remoteId === undefined || id === remoteId) mark(cell);
    for (const entry of entries.values()) {
      if (
        relevant(entry, instance.id) &&
        (entry.key[0] !== "episodes" ||
          remoteId === undefined ||
          entry.key[2] === remoteId) &&
        (topics.includes(topic(entry.key)) ||
          (entry.key[0] === "library" &&
            (topics.includes("queue") || topics.includes("options"))))
      )
        schedule(entry);
    }
  }

  return { read, subscribe, update, reconcile, refreshAll };
}

// Resource schemas are intentionally allowlisted. A malformed field makes a
// notification a fetch hint; it never partially overwrites a last-good record.
const id = z.number().int().positive();
const number = z.number().finite().nonnegative();
const quality = z
  .object({
    quality: z.object({ name: z.string().min(1) }).optional(),
    name: z.string().min(1).optional(),
  })
  .refine((value) => value.quality !== undefined || value.name !== undefined);
const mediaResource = z.object({
  id,
  title: z.string().trim().min(1),
  year: number.optional(),
  overview: z.string().optional(),
  tmdbId: number.optional(),
  tvdbId: number.optional(),
  qualityProfileId: id,
  monitored: z.boolean(),
  hasFile: z.boolean().optional(),
  sizeOnDisk: number.optional(),
  movieFile: z
    .object({
      id: number.optional(),
      size: number.optional(),
      quality: quality.optional(),
    })
    .optional(),
  statistics: z
    .object({
      episodeCount: number.optional(),
      episodeFileCount: number.optional(),
      sizeOnDisk: number.optional(),
    })
    .optional(),
  images: z
    .array(
      z.object({
        coverType: z.string(),
        url: z.string().optional(),
        remoteUrl: z.string().optional(),
      }),
    )
    .optional(),
  remotePoster: z.string().optional(),
  genres: z.array(z.string()).optional(),
  runtime: number.optional(),
  added: z.string().optional(),
  ratings: z
    .object({
      imdb: z.object({ value: number }).optional(),
      tmdb: z.object({ value: number }).optional(),
      value: number.optional(),
    })
    .optional(),
});

function applyMedia(state: Backing, message: unknown): boolean {
  const envelope = row(message);
  const expected = state.instance.kind === "radarr" ? "movie" : "series";
  if (str(envelope.name).toLowerCase() !== expected) return false;
  const body = row(envelope.body);
  const action = str(body.action, str(envelope.action)).toLowerCase();
  const resource = body.resource ?? envelope.resource;
  const current = state.library.value;
  if (!current) return false;
  const remoteId = num(row(resource).id, num(body.id));
  if (
    ["deleted", "delete"].includes(action) &&
    Number.isSafeInteger(remoteId) &&
    remoteId > 0
  ) {
    state.library.value = {
      ...current,
      items: current.items.filter(
        (item) => !item.targets.some((target) => target.remoteId === remoteId),
      ),
    };
    state.library.generation++;
    state.library.committed = state.library.generation;
    state.library.error = undefined;
    return true;
  }
  if (!["updated", "update", "created", "create", "added"].includes(action))
    return false;
  const parsed = mediaResource.safeParse(resource);
  if (!parsed.success || !current.enrichment?.complete) return false;
  const media = row(redact(parsed.data, state.instance.apiKey));
  const previous = current.items.find((item) =>
    item.targets.some((target) => target.remoteId === parsed.data.id),
  );
  const enrichment = current.enrichment;
  if (
    !enrichment.profiles.some(
      (profile) => profile.id === media.qualityProfileId,
    )
  )
    return false;
  if (expected === "movie") {
    if (
      typeof media.hasFile !== "boolean" ||
      (media.hasFile && !row(media.movieFile).quality)
    )
      return false;
  } else {
    const statistics = parsed.data.statistics;
    if (
      !statistics ||
      statistics.episodeCount === undefined ||
      statistics.episodeFileCount === undefined ||
      statistics.sizeOnDisk === undefined
    )
      return false;
    if (
      statistics.episodeFileCount > 0 &&
      (!enrichment.episodeQualities.has(parsed.data.id) ||
        previous?.targets[0].episodeFileCount !== statistics.episodeFileCount ||
        previous.targets[0].sizeOnDisk !== statistics.sizeOnDisk)
    )
      return false;
  }
  if (
    !previous &&
    [
      "year",
      "overview",
      "images",
      "genres",
      "added",
      expected === "movie" ? "tmdbId" : "tvdbId",
    ].some((field) => media[field] === undefined)
  )
    return false;
  let item = normalizeMedia(
    media,
    state.instance,
    enrichment.profiles,
    enrichment.downloading,
    enrichment.episodeQualities.get(parsed.data.id),
  );
  if (previous) {
    if (
      expected === "movie" &&
      media.hasFile &&
      media.sizeOnDisk === undefined &&
      row(media.movieFile).size === undefined
    )
      item.targets[0].sizeOnDisk = previous.targets[0].sizeOnDisk;
    // Optional metadata omitted by upstream is not an instruction to erase it.
    item = {
      ...item,
      year: media.year === undefined ? previous.year : item.year,
      overview:
        media.overview === undefined ? previous.overview : item.overview,
      poster:
        media.images === undefined && media.remotePoster === undefined
          ? previous.poster
          : item.poster,
      backdrop: media.images === undefined ? previous.backdrop : item.backdrop,
      genres: media.genres === undefined ? previous.genres : item.genres,
      rating: media.ratings === undefined ? previous.rating : item.rating,
      runtime: media.runtime === undefined ? previous.runtime : item.runtime,
      added: media.added === undefined ? previous.added : item.added,
      tmdbId: media.tmdbId === undefined ? previous.tmdbId : item.tmdbId,
      tvdbId: media.tvdbId === undefined ? previous.tvdbId : item.tvdbId,
    };
    if (media[expected === "movie" ? "tmdbId" : "tvdbId"] === undefined)
      item.id = previous.id;
  }
  state.library.value = {
    ...current,
    items: [
      ...current.items.filter(
        (entry) =>
          !entry.targets.some((target) => target.remoteId === parsed.data.id),
      ),
      item,
    ],
  };
  state.library.generation++;
  state.library.committed = state.library.generation;
  state.library.error = undefined;
  return true;
}

const globalState = globalThis as typeof globalThis & {
  __arrsenalSnapshots?: SnapshotStore;
};
type SnapshotStore = {
  read(key: RealtimeQueryKey): Promise<Versioned<Data>>;
  subscribe(listener: Listener): () => void;
  update(
    instance: InstanceConfig,
    message: unknown,
    topics: readonly RealtimeTopic[],
    remoteId?: number,
  ): void;
  reconcile(instances: InstanceConfig[]): void;
  refreshAll(instanceId?: string): void;
};
globalState.__arrsenalSnapshots ??= createStore();
const store = globalState.__arrsenalSnapshots;

export function readRealtimeSnapshot(
  key: ["library"],
): Promise<Versioned<LibraryResponse>>;
export function readRealtimeSnapshot(
  key: ["queue"],
): Promise<Versioned<QueueResponse>>;
export function readRealtimeSnapshot(
  key: ["instances"],
): Promise<Versioned<{ instances: InstanceSummary[] }>>;
export function readRealtimeSnapshot(
  key: ["calendar", string, string],
): Promise<Versioned<CalendarResponse>>;
export function readRealtimeSnapshot(
  key: ["episodes", string, number],
): Promise<Versioned<EpisodesResponse>>;
export function readRealtimeSnapshot(
  key: ["instance-options", string],
): Promise<Versioned<InstanceOptions>>;
export function readRealtimeSnapshot(
  key: RealtimeQueryKey,
): Promise<Versioned<Data>>;
export function readRealtimeSnapshot(key: RealtimeQueryKey) {
  return store.read(key);
}
export function subscribeSnapshots(listener: Listener) {
  return store.subscribe(listener);
}
export function updateSnapshots(
  instance: InstanceConfig,
  message: unknown,
  topics: readonly RealtimeTopic[],
  remoteId?: number,
) {
  store.update(instance, message, topics, remoteId);
}
export function reconcileSnapshots(instances: InstanceConfig[]) {
  store.reconcile(instances);
}
export function refreshSnapshots(instanceId?: string) {
  store.refreshAll(instanceId);
}
