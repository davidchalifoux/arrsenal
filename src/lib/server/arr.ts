import "server-only";

import type { InstanceOptions, InstanceSummary } from "../types";
import type { InstanceConfig } from "./config";
import { ApiError, errorMessage } from "./http";

export type Row = Record<string, unknown>;

export function row(value: unknown): Row {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}

export function rows(value: unknown): Row[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (entry) => !entry || typeof entry !== "object" || Array.isArray(entry),
    )
  ) {
    throw new ApiError(502, "Instance returned an invalid API response.");
  }
  return value as Row[];
}

export function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function redact(value: unknown, apiKey: string): unknown {
  if (typeof value === "string") {
    return value
      .split(apiKey)
      .join("[redacted]")
      .split(encodeURIComponent(apiKey))
      .join("[redacted]");
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, apiKey));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/api.?key/i.test(key))
        .map(([key, item]) => [key, redact(item, apiKey)]),
    );
  }
  return value;
}

export async function arrRequest(
  instance: Pick<InstanceConfig, "url" | "apiKey">,
  path: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    query?: Record<string, string | number | boolean>;
    body?: unknown;
    timeoutMs?: number;
    signal?: AbortSignal;
    image?: boolean;
  } = {},
): Promise<unknown> {
  // All callers supply fixed API paths or an independently validated cover path.
  const url = new URL(`${instance.url}/api/v3/${path}`);
  for (const [key, value] of Object.entries(options.query ?? {}))
    url.searchParams.set(key, String(value));
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 8000);
  const signal = options.signal
    ? AbortSignal.any([timeout, options.signal])
    : timeout;
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        "X-Api-Key": instance.apiKey,
        Accept: options.image ? "image/*" : "application/json",
        ...(options.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      redirect: "manual",
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status >= 300 && response.status < 400) {
        throw new ApiError(
          502,
          "Instance redirected the request. Use its final application URL; redirects are blocked to protect API keys.",
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new ApiError(
          502,
          "Instance rejected the API key or denied access.",
        );
      }
      if (response.status === 404)
        throw new ApiError(
          404,
          "The requested resource or v3 API endpoint was not found on this instance.",
        );
      if (
        response.status === 400 ||
        response.status === 409 ||
        response.status === 422
      ) {
        throw new ApiError(
          response.status === 409 ? 409 : 422,
          "Instance rejected the request. Check its configuration, whether the media already exists, and its logs.",
        );
      }
      throw new ApiError(502, `Instance returned HTTP ${response.status}.`);
    }
    if (options.image) return await imageResponse(response);
    const bytes = await readLimited(response, 32 * 1024 * 1024);
    if (bytes.byteLength === 0) return null;
    try {
      return redact(
        JSON.parse(new TextDecoder().decode(bytes)),
        instance.apiKey,
      );
    } catch {
      throw new ApiError(
        502,
        "Instance returned invalid JSON. Check the application URL and reverse proxy.",
      );
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const uncertain =
      options.method && options.method !== "GET"
        ? " The action may have been accepted; refresh the instance before retrying."
        : "";
    if (signal.aborted)
      throw new ApiError(504, `Instance request timed out.${uncertain}`);
    // Fetch errors and upstream response bodies can contain credentials or URLs.
    throw new ApiError(
      502,
      `Unable to reach the instance. Check its URL, TLS certificate, and network access.${uncertain}`,
    );
  }
}

export async function imageResponse(response: Response): Promise<Response> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new ApiError(502, "Artwork source is unavailable.");
  }
  const type =
    response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() ?? "";
  if (
    ![
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/avif",
    ].includes(type)
  ) {
    await response.body?.cancel();
    throw new ApiError(
      502,
      "Artwork source did not return a supported raster image.",
    );
  }
  const bytes = await readLimited(response, 10 * 1024 * 1024);
  return new Response(bytes, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

async function readLimited(
  response: Response,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new ApiError(502, "Instance response exceeds the size limit.");
  }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > limit) {
          await reader.cancel();
          throw new ApiError(502, "Instance response exceeds the size limit.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function testConnection(
  instance: Omit<InstanceConfig, "id">,
): Promise<string | undefined> {
  const status = row(
    await arrRequest(instance, "system/status", { timeoutMs: 4000 }),
  );
  if (!str(status.version))
    throw new ApiError(
      502,
      "The URL did not return a valid Sonarr/Radarr v3 system status.",
    );
  if (
    str(status.appName) &&
    str(status.appName).toLowerCase() !== instance.kind
  ) {
    throw new ApiError(
      422,
      "The instance type does not match the application at this URL.",
    );
  }
  return str(status.version);
}

export async function instanceSummary(
  instance: InstanceConfig,
): Promise<InstanceSummary> {
  const summary: InstanceSummary = {
    id: instance.id,
    name: instance.name,
    kind: instance.kind,
    url: instance.url,
    hasApiKey: Boolean(instance.apiKey),
    connected: false,
  };
  try {
    summary.version = await testConnection(instance);
    summary.connected = true;
  } catch (error) {
    summary.error = errorMessage(error);
  }
  return summary;
}

export async function profiles(
  instance: InstanceConfig,
  signal?: AbortSignal,
): Promise<InstanceOptions["profiles"]> {
  return rows(await arrRequest(instance, "qualityprofile", { signal })).map(
    (item) => {
      if (!Number.isInteger(item.id) || num(item.id) <= 0 || !str(item.name))
        throw new ApiError(
          502,
          "Instance returned an invalid quality profile.",
        );
      return { id: num(item.id), name: str(item.name) };
    },
  );
}

export async function instanceOptions(
  instance: InstanceConfig,
): Promise<InstanceOptions> {
  const [qualityProfiles, roots] = await Promise.all([
    profiles(instance),
    arrRequest(instance, "rootfolder"),
  ]);
  return {
    profiles: qualityProfiles,
    rootFolders: rows(roots).map((item) => {
      if (!Number.isInteger(item.id) || num(item.id) <= 0 || !str(item.path))
        throw new ApiError(502, "Instance returned an invalid root folder.");
      return {
        id: num(item.id),
        path: str(item.path),
        freeSpace:
          typeof item.freeSpace === "number" ? num(item.freeSpace) : undefined,
      };
    }),
  };
}

export async function queueRecords(
  instance: InstanceConfig,
  signal = AbortSignal.timeout(20000),
): Promise<Row[]> {
  const items = new Map<number, Row>();
  let totalRecords: number | undefined;
  let pageSize: number | undefined;
  const changed =
    "Queue changed during pagination or returned an incomplete page. Refresh to retry.";
  for (let page = 1; page <= 1000; page++) {
    const data = row(
      await arrRequest(instance, "queue", {
        signal,
        query: {
          page,
          pageSize: 250,
          sortKey: "added",
          sortDirection: "ascending",
          ...(instance.kind === "radarr"
            ? { includeMovie: true, includeUnknownMovieItems: true }
            : {
                includeSeries: true,
                includeEpisode: true,
                includeUnknownSeriesItems: true,
              }),
        },
      }),
    );
    const records = rows(data.records);
    if (
      !Number.isSafeInteger(data.totalRecords) ||
      num(data.totalRecords, -1) < 0 ||
      !Number.isSafeInteger(data.pageSize) ||
      num(data.pageSize) <= 0
    ) {
      throw new ApiError(502, "Instance returned invalid queue pagination.");
    }
    totalRecords ??= num(data.totalRecords);
    pageSize ??= num(data.pageSize);
    if (
      data.page !== page ||
      data.totalRecords !== totalRecords ||
      data.pageSize !== pageSize ||
      records.length !== Math.min(pageSize, totalRecords - items.size)
    ) {
      throw new ApiError(502, changed);
    }
    for (const item of records) {
      if (!Number.isInteger(item.id))
        throw new ApiError(502, "Instance returned an invalid queue item.");
      if (items.has(num(item.id))) throw new ApiError(502, changed);
      items.set(num(item.id), item);
    }
    if (items.size === totalRecords) return [...items.values()];
  }
  throw new ApiError(502, "Queue exceeds the pagination safety limit.");
}
