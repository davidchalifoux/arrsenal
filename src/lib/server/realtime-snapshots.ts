import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  MAX_ACTIVE_COMMANDS,
  type RealtimePatch,
  type RealtimeQueryKey,
  type RealtimeSnapshot,
  type RealtimeTopic,
  type RealtimeVersion,
  realtimeCoreQueries,
  realtimeQueryKeySchema,
  type Versioned,
} from "../realtime-events";
import type {
  ActiveCommand,
  CalendarResponse,
  Episode,
  EpisodeStatus,
  EpisodesResponse,
  InstanceOptions,
  InstanceSummary,
  LibraryResponse,
  MediaItem,
  MediaTarget,
  QueueItem,
  QueueResponse,
  ServiceError,
} from "../types";
import {
  activeCommands,
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
  instanceMedia,
  type MediaEnrichment,
  seriesEpisodeQuality,
} from "./library";
import { createLibraryMerger } from "./library-projection";
import {
  combinedStatus,
  normalizeMedia,
  normalizeQueue,
  qualityName,
} from "./media";
import {
  createRealtimePatch,
  parseSnapshot,
  unchangedPatch,
} from "./realtime-patches";

type Data =
  | LibraryResponse
  | QueueResponse
  | CalendarResponse
  | EpisodesResponse
  | InstanceOptions
  | { instances: InstanceSummary[] };
type Listener = (snapshot: RealtimeSnapshot, patch?: RealtimePatch) => void;
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
// Per-series episode quality, cached and filled in the background. Keyed by the
// remote series id and validated against (episodeFileCount, sizeOnDisk) so a
// changed series is refetched while unchanged ones are reused across refreshes.
type EpisodeQuality = {
  episodeFileCount: number;
  sizeOnDisk: number;
  quality: string[];
  nextAttemptAt: number;
  failures: number;
};
type Backing = {
  instance: InstanceConfig;
  library: Slot<LibraryBacking>;
  queue: Slot<QueueBacking>;
  summary: Slot<InstanceSummary>;
  commands: Slot<ActiveCommand[]>;
  options: Slot<InstanceOptions>;
  calendars: Map<string, Slot<CalendarBacking>>;
  episodes: Map<number, Slot<EpisodesResponse>>;
  episodeQuality: Map<number, EpisodeQuality>;
  enriching: boolean;
  downloadSignature?: string;
  projected: WeakMap<MediaItem, { signature: string; item: MediaItem }>;
  qualityRetry?: NodeJS.Timeout;
  qualityAbort?: AbortController;
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
  qualityTimer?: NodeJS.Timeout;
};

function createStore() {
  const epoch = randomUUID();
  let revision = 0;
  let configRead: Promise<void> | undefined;
  let configGeneration = 0;
  const entries = new Map<string, Entry>();
  const mergeLibrary = createLibraryMerger();
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
    state.commands,
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
    const pending = load(state.queue, async () => {
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
    // A queue progress tick does not change library membership/status. Only
    // transitions into/out of downloading (or queue failure/recovery) require
    // projecting the library again. Queue and library loads share this promise.
    const reconcileDownloads = () => {
      const ids = state.queue.value?.records
        .filter(
          (item) =>
            !["failed", "delay", "downloadclientunavailable"].includes(
              str(item.status).toLowerCase(),
            ),
        )
        .map((item) =>
          num(state.instance.kind === "radarr" ? item.movieId : item.seriesId),
        );
      const signature = state.queue.error
        ? "error"
        : JSON.stringify([...new Set(ids)].sort((a, b) => a - b));
      if (state.downloadSignature === signature || state.queue.retired) return;
      const previous = state.downloadSignature;
      state.downloadSignature = signature;
      if (previous !== undefined) {
        const entry = entries.get('["library"]');
        if (entry) schedule(entry);
      }
    };
    return pending.then(
      (value) => {
        reconcileDownloads();
        return value;
      },
      (error) => {
        reconcileDownloads();
        throw error;
      },
    );
  }

  // A failed command lookup must never take down the instance summary; the
  // indicator simply stays empty until the next refresh.
  function commandsFor(state: Backing) {
    return load(state.commands, async () => {
      try {
        return await activeCommands(state.instance);
      } catch {
        return [];
      }
    });
  }

  function libraryFor(state: Backing) {
    return load(state.library, async () => {
      let enrichment: MediaEnrichment | undefined;
      const result = await instanceMedia(state.instance, {
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
        return [state.summary, state.commands];
      case "calendar":
        return [calendarCell(state, key)];
      case "episodes":
        return [episodeCell(state, key[2]), state.queue];
      case "instance-options":
        return [state.options];
    }
  }

  // A series' episode quality comes from the background-filled cache, keyed by
  // (episodeFileCount, sizeOnDisk) so stale entries are ignored. Until the cache
  // holds a matching entry the label is "Unknown" — never an error, just a value
  // that fills in once the background sweep reaches this series.
  function seriesQuality(state: Backing, target: MediaTarget): string {
    const fileCount = target.episodeFileCount ?? 0;
    if (fileCount <= 0) return "Not downloaded";
    const cached = state.episodeQuality.get(target.remoteId);
    if (
      cached &&
      cached.episodeFileCount === fileCount &&
      cached.sizeOnDisk === target.sizeOnDisk &&
      cached.quality.length
    )
      return [...new Set(cached.quality)].sort().join(", ");
    return "Unknown";
  }

  function libraryItems(state: Backing, value: LibraryBacking): MediaItem[] {
    const records = state.queue.error ? undefined : state.queue.value?.records;
    const downloading =
      records &&
      new Set(
        records
          .filter(
            (item) =>
              !["failed", "delay", "downloadclientunavailable"].includes(
                str(item.status).toLowerCase(),
              ),
          )
          .map((item) =>
            num(
              state.instance.kind === "radarr" ? item.movieId : item.seriesId,
            ),
          ),
      );
    return value.items.map((item) => {
      const targets = item.targets.map((target) => {
        const quality =
          item.kind === "series"
            ? seriesQuality(state, target)
            : target.quality;
        const status = !downloading
          ? target.status
          : downloading.has(target.remoteId)
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
                : ("missing" as const);
        return {
          ...target,
          quality,
          status,
          instanceName: state.instance.name,
        };
      });
      const signature = JSON.stringify(
        targets.map((target) => [
          target.status,
          target.quality,
          target.instanceName,
        ]),
      );
      const cached = state.projected.get(item);
      if (cached?.signature === signature) return cached.item;
      const projected = { ...item, targets, status: combinedStatus(targets) };
      state.projected.set(item, { signature, item: projected });
      return projected;
    });
  }

  // Series with files whose episode quality is not yet cached (or whose file
  // stats changed). These are what the background enrichment pass fetches.
  function pendingQuality(state: Backing): MediaTarget[] {
    const value = state.library.value;
    if (!value) return [];
    const pending: MediaTarget[] = [];
    for (const item of value.items) {
      if (item.kind !== "series") continue;
      const target = item.targets.find(
        (candidate) => candidate.instanceId === state.instance.id,
      );
      if (!target || (target.episodeFileCount ?? 0) <= 0) continue;
      const cached = state.episodeQuality.get(target.remoteId);
      if (
        !cached ||
        cached.episodeFileCount !== target.episodeFileCount ||
        cached.sizeOnDisk !== target.sizeOnDisk ||
        cached.nextAttemptAt <= Date.now()
      )
        pending.push(target);
    }
    return pending;
  }

  // Quality updates share one throttle across instances. Batch changed series
  // into one publication/patch rather than re-projecting the library per file
  // request. Ordinary media changes retain their low-latency scheduling.
  function scheduleQuality(entry: Entry) {
    if (entry.retired || entry.qualityTimer) return;
    entry.qualityTimer = setTimeout(() => {
      entry.qualityTimer = undefined;
      // A pending aggregate will publish its own result. Do not invalidate its
      // generation and suppress progressive results from other instances.
      if (entry.pending) scheduleQuality(entry);
      else schedule(entry);
    }, 2000);
    entry.qualityTimer.unref?.();
  }

  function stopQuality(state: Backing) {
    clearTimeout(state.qualityRetry);
    state.qualityRetry = undefined;
    state.qualityAbort?.abort();
  }

  function enrichLibrary(state: Backing): void {
    if (state.instance.kind !== "sonarr" || state.enriching) return;
    const libraryEntry = entries.get(
      JSON.stringify(["library"] satisfies RealtimeQueryKey),
    );
    if (!libraryEntry || !active(libraryEntry)) return;
    clearTimeout(state.qualityRetry);
    state.qualityRetry = undefined;
    const ids = new Set(
      state.library.value?.items.flatMap((item) =>
        item.kind === "series"
          ? item.targets
              .filter((target) => (target.episodeFileCount ?? 0) > 0)
              .map((target) => target.remoteId)
          : [],
      ),
    );
    for (const id of state.episodeQuality.keys())
      if (!ids.has(id)) state.episodeQuality.delete(id);
    const targets = pendingQuality(state);
    const current = () =>
      !state.library.retired &&
      !libraryEntry.retired &&
      backing.get(state.instance.id) === state;
    if (!targets.length) {
      // Refresh stale successes and retry failures only while someone is
      // subscribed. REST-only reads can restart work on their next visit.
      if (libraryEntry.listeners.size) {
        let next = Infinity;
        for (const value of state.episodeQuality.values())
          next = Math.min(next, value.nextAttemptAt);
        if (Number.isFinite(next)) {
          state.qualityRetry = setTimeout(
            () => enrichLibrary(state),
            Math.max(1, next - Date.now()),
          );
          state.qualityRetry.unref?.();
        }
      }
      return;
    }
    state.enriching = true;
    const controller = new AbortController();
    state.qualityAbort = controller;
    void (async () => {
      try {
        let cursor = 0;
        // Each request has its own timeout. Walk the entire queue once instead
        // of resetting a whole-sweep deadline and repeatedly starving its tail.
        await Promise.all(
          Array.from({ length: Math.min(4, targets.length) }, async () => {
            while (
              cursor < targets.length &&
              !controller.signal.aborted &&
              current()
            ) {
              const target = targets[cursor++];
              const previous = state.episodeQuality.get(target.remoteId);
              const attempt: EpisodeQuality = {
                episodeFileCount: target.episodeFileCount ?? 0,
                sizeOnDisk: target.sizeOnDisk,
                quality:
                  previous &&
                  previous.episodeFileCount === target.episodeFileCount &&
                  previous.sizeOnDisk === target.sizeOnDisk
                    ? previous.quality
                    : [],
                nextAttemptAt: Infinity,
                failures: previous?.failures ?? 0,
              };
              state.episodeQuality.set(target.remoteId, attempt);
              const valid = () =>
                current() &&
                !controller.signal.aborted &&
                state.episodeQuality.get(target.remoteId) === attempt;
              try {
                const quality = await seriesEpisodeQuality(
                  state.instance,
                  target.remoteId,
                  controller.signal,
                );
                // An event can invalidate this series while the request is in
                // flight. Its old response must not repopulate the cache.
                if (!valid()) continue;
                attempt.quality = [...new Set(quality)].sort();
                attempt.failures = 0;
                attempt.nextAttemptAt = Date.now() + 15 * 60_000;
                scheduleQuality(libraryEntry);
              } catch {
                if (!valid()) continue;
                attempt.failures++;
                attempt.nextAttemptAt =
                  Date.now() +
                  Math.min(
                    300_000,
                    30_000 * 2 ** Math.min(attempt.failures - 1, 4),
                  );
              }
            }
          }),
        );
      } finally {
        state.enriching = false;
        state.qualityAbort = undefined;
        // New/invalidated series run next; failures wait for their own backoff.
        if (current()) enrichLibrary(state);
      }
    })();
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
    const generation = entry.generation;
    const completed = new Map<
      string,
      { data?: Data; failure?: ServiceError }
    >();
    let partialTimer: NodeJS.Timeout | undefined;
    const publishPartial = () => {
      partialTimer = undefined;
      if (
        entry.retired ||
        entry.generation !== generation ||
        completed.size === states.length ||
        ![...completed.values()].some((result) => result.data)
      )
        return;
      const items = states.flatMap((state) => {
        const result = completed.get(state.instance.id);
        if (result)
          return (result.data as LibraryResponse | undefined)?.items ?? [];
        return state.library.value
          ? libraryItems(state, state.library.value)
          : [];
      });
      publish(
        entry,
        parseSnapshot({
          queryKey: ["library"],
          version: version(),
          data: {
            items: mergeLibrary(items),
            errors: [...completed.values()].flatMap((result) => [
              ...((result.data as LibraryResponse | undefined)?.errors ?? []),
              ...(result.failure ? [result.failure] : []),
            ]),
            loadingInstanceIds: states
              .filter((state) => !completed.has(state.instance.id))
              .map((state) => state.instance.id),
          },
        }),
      );
    };
    const results = await Promise.all(
      states.map((state) =>
        (async () => {
          try {
            switch (key[0]) {
              case "library": {
                const value = await libraryFor(state);
                // Kick off (or continue) background episode-quality enrichment;
                // it fills the cache and republishes without blocking this read.
                enrichLibrary(state);
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
              case "instances": {
                const summary = await load(state.summary, () =>
                  instanceSummary(state.instance),
                );
                const commands = await commandsFor(state);
                return {
                  data: {
                    instances: [{ ...summary, commands }],
                  } as Data,
                };
              }
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
        })().then((result) => {
          completed.set(state.instance.id, result);
          if (key[0] === "library" && !partialTimer && entry.listeners.size) {
            partialTimer = setTimeout(publishPartial, 100);
            partialTimer.unref?.();
          }
          return result;
        }),
      ),
    ).finally(() => clearTimeout(partialTimer));
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
          items: mergeLibrary(
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
    if (entry.retired) return snapshot;
    const patch = createRealtimePatch(entry.snapshot, snapshot);
    if (entry.snapshot && patch && unchangedPatch(entry.snapshot, patch))
      return entry.snapshot;
    entry.snapshot = snapshot;
    for (const listener of entry.listeners) {
      try {
        listener(snapshot, patch);
      } catch {
        /* One closed stream cannot interrupt peers. */
      }
    }
    return snapshot;
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
          return publish(entry, snapshot);
        }
        if (entry.generation !== generation) continue;
        entry.failure = undefined;
        const snapshot = parseSnapshot({
          queryKey: entry.key,
          version: version(),
          data,
        });
        return publish(entry, snapshot);
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
    if (!entries.has('["library"]')) mergeLibrary([]);
    for (const [id, state] of backing) {
      const interested = [...entries.values()].filter((entry) =>
        relevant(entry, id),
      );
      if (!interested.length) {
        stopQuality(state);
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
      clearTimeout(entry.qualityTimer);
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
        clearTimeout(unused.qualityTimer);
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
        stopQuality(state);
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
            commands: slot(),
            options: slot(),
            calendars: new Map(),
            episodes: new Map(),
            episodeQuality: new Map(),
            enriching: false,
            projected: new WeakMap(),
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
    const forward: Listener = (snapshot, patch) => listener(snapshot, patch);
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
          clearTimeout(entry.qualityTimer);
          entry.qualityTimer = undefined;
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
    // Episode-file metadata can change without changing aggregate file stats.
    // Deleting the entry also invalidates the identity of an in-flight fetch.
    const envelope = row(message);
    const name = str(envelope.name).toLowerCase();
    if (state.instance.kind === "sonarr" && name === "episodefile") {
      const resource = row(row(envelope.body).resource ?? envelope.resource);
      const seriesId = num(resource.seriesId, remoteId ?? 0);
      if (seriesId > 0) state.episodeQuality.delete(seriesId);
      else state.episodeQuality.clear();
    }
    const direct = topics.includes("library") && applyMedia(state, message);
    const command = topics.includes("commands") && applyCommand(state, message);
    const episode = topics.includes("episodes") && applyEpisode(state, message);
    const episodeFile =
      topics.includes("episodes") && applyEpisodeFile(state, message);
    if (topics.includes("queue")) mark(state.queue);
    const queueMessage = /^queue(?:\/|$)/i.test(str(row(message).name));
    if (topics.includes("library") && !direct && !queueMessage) {
      mark(state.library);
      if (state.library.value?.enrichment)
        state.library.value.enrichment.complete = false;
    }
    if (topics.includes("instances")) mark(state.summary);
    if (topics.includes("commands") && !command) mark(state.commands);
    if (topics.includes("options")) {
      mark(state.options);
      mark(state.library);
      if (state.library.value?.enrichment)
        state.library.value.enrichment.complete = false;
    }
    if (topics.includes("calendar"))
      for (const cell of state.calendars.values()) mark(cell);
    if (topics.includes("episodes") && !episode && !episodeFile)
      for (const [id, cell] of state.episodes)
        if (remoteId === undefined || id === remoteId) mark(cell);
    for (const entry of entries.values()) {
      if (
        relevant(entry, instance.id) &&
        (entry.key[0] !== "episodes" ||
          remoteId === undefined ||
          entry.key[2] === remoteId) &&
        !(queueMessage && entry.key[0] === "library") &&
        (topics.includes(topic(entry.key)) ||
          (entry.key[0] === "library" &&
            (topics.includes("queue") || topics.includes("options"))) ||
          (entry.key[0] === "instances" && topics.includes("commands")))
      )
        schedule(entry);
    }
    // A direct media apply can add a series or change its file stats; refill any
    // episode quality the change left pending, without a library reload.
    if (direct) enrichLibrary(state);
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

const commandResource = z.object({
  id,
  name: z.string().trim().min(1),
  commandName: z.string().optional(),
  message: z.string().optional(),
  status: z.string().min(1),
});
const terminalCommandStatuses = [
  "completed",
  "failed",
  "aborted",
  "cancelled",
  "orphaned",
];

// Merges one command resource from a SignalR message into the active list.
// Returns the next list, or undefined when the message cannot be applied and
// the caller should fall back to re-reading /api/v3/command.
export function mergeCommandResource(
  commands: ActiveCommand[],
  resource: unknown,
): ActiveCommand[] | undefined {
  const parsed = commandResource.safeParse(resource);
  if (!parsed.success) return undefined;
  const { id: commandId, name, status } = parsed.data;
  const active = status === "queued" || status === "started";
  if (!active && !terminalCommandStatuses.includes(status)) return undefined;
  const index = commands.findIndex((command) => command.id === commandId);
  if (!active && index === -1) return commands;
  const next = [...commands];
  if (active) {
    const entry: ActiveCommand = {
      id: commandId,
      name,
      commandName: parsed.data.commandName || name,
      message: parsed.data.message ?? "",
      status,
    };
    if (index === -1) next.push(entry);
    else next[index] = entry;
  } else {
    next.splice(index, 1);
  }
  // The instances snapshot schema caps this list; keep the two in step.
  return next.slice(0, MAX_ACTIVE_COMMANDS);
}

// True when a cell holds a committed value with no load in flight, so a
// direct-apply can mutate it without racing a pending fetch.
function settled<T>(cell: Slot<T>): boolean {
  return (
    cell.value !== undefined &&
    !cell.pending &&
    cell.committed === cell.generation
  );
}

// Applies a command message in place when the slot already holds a settled
// baseline. Anything else (no baseline yet, an in-flight load, or an
// unrecognised resource) returns false so the caller refreshes instead.
function applyCommand(state: Backing, message: unknown): boolean {
  const envelope = row(message);
  if (str(envelope.name).toLowerCase() !== "command") return false;
  const current = state.commands.value;
  if (!current || !settled(state.commands)) return false;
  const next = mergeCommandResource(
    current,
    row(envelope.body).resource ?? envelope.resource,
  );
  if (!next) return false;
  state.commands.value = next;
  return true;
}

const episodeResource = z.object({
  id,
  seriesId: id,
  episodeFileId: number.optional(),
  seasonNumber: z.number().int().min(0).max(2147483647),
  episodeNumber: z.number().int().min(0).max(2147483647),
  title: z.string().optional(),
  overview: z.string().optional(),
  airDateUtc: z.string().optional(),
  runtime: number.optional(),
  monitored: z.boolean(),
  hasFile: z.boolean(),
  grabbed: z.boolean().optional(),
  episodeFile: z
    .object({ size: number.optional(), quality: quality.optional() })
    .optional(),
});
const episodeFileResource = z.object({
  id,
  // Deleted files are broadcast as a default-constructed resource, so value
  // types like seriesId arrive as 0 rather than being omitted.
  seriesId: z.number().int().nonnegative().optional(),
  seasonNumber: z.number().int().min(0).max(2147483647).optional(),
  size: number.optional(),
  quality: quality.optional(),
});

function isoDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function deriveEpisodeStatus(
  episode: Pick<Episode, "airDateUtc" | "monitored" | "status">,
  hasFile: boolean,
  grabbed: boolean,
  now: number,
): EpisodeStatus {
  if (hasFile) return "available";
  if (grabbed || episode.status === "downloading") return "downloading";
  const time = episode.airDateUtc ? Date.parse(episode.airDateUtc) : NaN;
  if (Number.isFinite(time) && time > now) return "unreleased";
  if (!episode.monitored) return "unmonitored";
  return Number.isFinite(time) ? "missing" : "unknown";
}

// Merges one episode resource from a SignalR message into a cached series list.
// Returns the next list, or undefined when the episode is not present (so the
// caller refreshes instead of silently dropping a new episode).
export function mergeEpisodeResource(
  episodes: Episode[],
  resource: unknown,
  now = Date.now(),
): Episode[] | undefined {
  const parsed = episodeResource.safeParse(resource);
  if (!parsed.success) return undefined;
  const record = parsed.data;
  const index = episodes.findIndex((episode) => episode.id === record.id);
  if (index === -1) return undefined;
  const previous = episodes[index];
  if (previous.seriesId !== record.seriesId) return undefined;
  const hasFile = record.hasFile;
  const episodeFileId = hasFile
    ? (record.episodeFileId ?? previous.episodeFileId)
    : 0;
  const file = hasFile ? record.episodeFile : undefined;
  const quality = hasFile
    ? file
      ? qualityName(file.quality) || "Unknown"
      : previous.hasFile
        ? previous.quality
        : "Unknown"
    : "Not downloaded";
  const sizeOnDisk = hasFile
    ? file
      ? Math.max(0, file.size ?? 0)
      : previous.hasFile
        ? previous.sizeOnDisk
        : 0
    : 0;
  const airDateUtc = isoDate(record.airDateUtc) ?? previous.airDateUtc;
  const next = [...episodes];
  next[index] = {
    ...previous,
    title: record.title || previous.title,
    overview: record.overview ?? previous.overview,
    airDateUtc,
    runtime: record.runtime ?? previous.runtime,
    monitored: record.monitored,
    hasFile,
    episodeFileId,
    quality,
    sizeOnDisk,
    status: deriveEpisodeStatus(
      { airDateUtc, monitored: record.monitored, status: previous.status },
      hasFile,
      record.grabbed === true,
      now,
    ),
  };
  return next;
}

// Applies an episode-file add/change or removal to every episode referencing
// the file. `file` is undefined for a deletion.
export function mergeEpisodeFile(
  episodes: Episode[],
  fileId: number,
  file: { quality: string; sizeOnDisk: number } | undefined,
  now = Date.now(),
): Episode[] | undefined {
  if (!episodes.some((episode) => episode.episodeFileId === fileId))
    return undefined;
  return episodes.map((episode) => {
    if (episode.episodeFileId !== fileId) return episode;
    if (file)
      return {
        ...episode,
        hasFile: true,
        quality: file.quality,
        sizeOnDisk: file.sizeOnDisk,
        status: "available" as const,
      };
    return {
      ...episode,
      hasFile: false,
      episodeFileId: 0,
      quality: "Not downloaded",
      sizeOnDisk: 0,
      status: deriveEpisodeStatus(episode, false, false, now),
    };
  });
}

// Applies an episode message in place when the affected series is open and
// settled; otherwise returns false so the page refreshes.
function applyEpisode(state: Backing, message: unknown): boolean {
  const envelope = row(message);
  if (str(envelope.name).toLowerCase() !== "episode") return false;
  const resource = row(row(envelope.body).resource ?? envelope.resource);
  const cell = state.episodes.get(num(resource.seriesId, -1));
  const value = cell?.value;
  if (!cell || !value || !settled(cell)) return false;
  const episodes = mergeEpisodeResource(value.episodes, resource);
  if (!episodes) return false;
  cell.value = { ...value, episodes };
  return true;
}

// Applies an episodefile message to any open series. Update payloads carry the
// file; deletes carry only an id and are located through episodeFileId.
// Resolves an episodefile message into the file id, owning series, and (for
// updates) the file metadata to apply. Returns undefined when the resource is
// unusable so the caller refreshes.
export function parseEpisodeFileResource(
  resource: unknown,
  action: string,
):
  | {
      fileId: number;
      seriesId: number;
      removed: boolean;
      file?: { quality: string; sizeOnDisk: number };
    }
  | undefined {
  const parsed = episodeFileResource.safeParse(resource);
  if (!parsed.success) return undefined;
  const seriesId = parsed.data.seriesId ?? 0;
  if (action === "deleted" || seriesId <= 0)
    return { fileId: parsed.data.id, seriesId, removed: true };
  return {
    fileId: parsed.data.id,
    seriesId,
    removed: false,
    file: {
      quality: qualityName(parsed.data.quality) || "Unknown",
      sizeOnDisk: Math.max(0, parsed.data.size ?? 0),
    },
  };
}

function applyEpisodeFile(state: Backing, message: unknown): boolean {
  const envelope = row(message);
  if (str(envelope.name).toLowerCase() !== "episodefile") return false;
  const body = row(envelope.body);
  const action = str(body.action, str(envelope.action)).toLowerCase();
  const target = parseEpisodeFileResource(
    body.resource ?? envelope.resource,
    action,
  );
  if (!target) return false;
  for (const [id, cell] of state.episodes) {
    if (!target.removed && id !== target.seriesId) continue;
    const value = cell.value;
    if (
      !value?.episodes.some(
        (episode) => episode.episodeFileId === target.fileId,
      )
    )
      continue;
    if (!settled(cell)) return false;
    const episodes = mergeEpisodeFile(
      value.episodes,
      target.fileId,
      target.file,
    );
    if (episodes) cell.value = { ...value, episodes };
  }
  // Handled even when no open series references the file; the matching episode
  // message still drives the affected page.
  return true;
}

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
    // Episode quality is no longer gated here: the item is applied now with its
    // counts, and libraryItems shows "Unknown" until the background sweep (kicked
    // off after this apply) refetches the changed series' files from cache.
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
    items: previous
      ? current.items.map((entry) => (entry === previous ? item : entry))
      : [...current.items, item],
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
