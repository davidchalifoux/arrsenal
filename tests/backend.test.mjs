import { expect, jest, mock, onTestFinished, spyOn, test } from "bun:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { advanceTime } from "./timers";

mock.module("server-only", () => ({}));

const instancesRoute = await import("../src/app/api/instances/route.ts");
const testRoute = await import("../src/app/api/instances/test/route.ts");
const instanceRoute = await import("../src/app/api/instances/[id]/route.ts");
const instanceTestRoute = await import(
  "../src/app/api/instances/[id]/test/route.ts"
);
const optionsRoute = await import(
  "../src/app/api/instances/[id]/options/route.ts"
);
const libraryRoute = await import("../src/app/api/library/route.ts");
const lookupRoute = await import("../src/app/api/lookup/route.ts");
const mediaRoute = await import("../src/app/api/media/route.ts");
const searchRoute = await import("../src/app/api/search/route.ts");
const releasesRoute = await import("../src/app/api/releases/route.ts");
const queueRoute = await import("../src/app/api/queue/route.ts");
const imageRoute = await import("../src/app/api/image/route.ts");
const episodesRoute = await import("../src/app/api/episodes/route.ts");
const { arrRequest } = await import("../src/lib/server/arr.ts");
const {
  instanceInput,
  readInstances,
  saveInstance,
  removeInstance,
  updateInstance,
} = await import("../src/lib/server/config.ts");
const { coverPath, mediaImage, mergeMedia, normalizeMedia } = await import(
  "../src/lib/server/media.ts"
);

const origin = "http://localhost:3000";
const secret = "arrsenal-test-secret-not-for-clients";
const quality = (name) => ({ quality: { id: 7, name } });
const movie = {
  id: 11,
  tmdbId: 693134,
  title: "Dune: Part Two",
  titleSlug: "dune-part-two",
  year: 2024,
  qualityProfileId: 1,
  hasFile: true,
  monitored: true,
  sizeOnDisk: 7000,
  movieFile: { id: 90, quality: quality("Bluray-1080p"), size: 7000 },
  images: [
    {
      coverType: "poster",
      remoteUrl:
        "https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg",
    },
  ],
  added: "2024-03-01T00:00:00Z",
  genres: ["Science Fiction"],
};
const series = {
  id: 22,
  tvdbId: 392573,
  title: "Shogun",
  titleSlug: "shogun",
  year: 2024,
  qualityProfileId: 1,
  monitored: true,
  statistics: { episodeCount: 10, episodeFileCount: 6, sizeOnDisk: 6000 },
  seasons: [{ seasonNumber: 0 }, { seasonNumber: 1 }],
  images: [
    {
      coverType: "poster",
      url: "/sonarr/MediaCover/22/poster-250.jpg?lastWrite=123",
    },
  ],
};

function request(path, method = "GET", body, headers = {}) {
  return new Request(`${origin}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function setup(definitions = {}) {
  const directory = await mkdtemp(join(tmpdir(), "arrsenal-backend-"));
  const previous = process.env.ARRSENAL_CONFIG_DIR;
  process.env.ARRSENAL_CONFIG_DIR = directory;
  onTestFinished(async () => {
    if (previous === undefined) delete process.env.ARRSENAL_CONFIG_DIR;
    else process.env.ARRSENAL_CONFIG_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  });
  const nodes = Object.fromEntries(
    Object.entries(definitions).map(([name, options]) => [
      name,
      {
        kind: "radarr",
        apiKey: secret,
        media: [],
        queue: [],
        lookup: [],
        ...options,
      },
    ]),
  );
  const calls = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const parts = url.pathname.split("/");
      const node = nodes[parts[1]];
      const endpoint = parts.slice(4).join("/");
      const raw = await req.text();
      const body = raw ? JSON.parse(raw) : undefined;
      calls.push({
        node: parts[1],
        endpoint,
        method: req.method,
        query: Object.fromEntries(url.searchParams),
        body,
        key: req.headers.get("x-api-key") ?? undefined,
      });
      const send = (data, status = 200) => Response.json(data, { status });
      if (url.pathname === "/leak") return send({ leaked: true });
      if (!node || parts[2] !== "api" || parts[3] !== "v3")
        return send({ error: "Not found" }, 404);
      if (node.mode === "slow") {
        // Leave headers pending until the client disconnects, then release the handler.
        return new Promise((resolve) => {
          const aborted = () => resolve(new Response(null, { status: 204 }));
          if (req.signal.aborted) aborted();
          else req.signal.addEventListener("abort", aborted, { once: true });
        });
      }
      if (node.mode === "slow-body") {
        return new Response(
          new ReadableStream({
            type: "direct",
            pull(controller) {
              // Send headers and a partial body, leaving the stream open until cancellation.
              controller.write("{");
              controller.flush();
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      if (node.mode === "oversized") {
        // Bun uses chunked encoding for streams, so exceed the limit with actual bytes.
        let remaining = 33;
        const chunk = new Uint8Array(1024 * 1024).fill(32);
        return new Response(
          new ReadableStream({
            pull(controller) {
              controller.enqueue(chunk);
              if (--remaining === 0) controller.close();
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      if (node.mode === "redirect") {
        return new Response(null, {
          status: 302,
          headers: { Location: "/leak" },
        });
      }
      if (req.headers.get("x-api-key") !== node.apiKey)
        return send({ error: secret }, 401);
      if (node.mode === "error" || node.fail?.includes(endpoint))
        return send({ error: `failure ${secret}`, apiKey: secret }, 503);
      if (node.mode === "invalid") {
        return new Response(`<html>${secret}</html>`, {
          headers: { "Content-Type": "text/html" },
        });
      }
      if (endpoint === "system/status" && node.verify) await node.verify();
      if (endpoint === "system/status")
        return send({
          appName: node.kind === "radarr" ? "Radarr" : "Sonarr",
          version: "4.0.1",
          apiKey: secret,
        });
      if (endpoint === "qualityprofile")
        return send([{ id: 1, name: node.profile ?? "HD-1080p" }]);
      if (endpoint === "rootfolder")
        return send([{ id: 1, path: "/media", freeSpace: 100000 }]);
      if (endpoint === "queue" && req.method === "GET") {
        const page = Number(url.searchParams.get("page"));
        if (node.queuePages) return send(node.queuePages[page - 1]);
        const pageSize =
          node.pageSize ?? Number(url.searchParams.get("pageSize"));
        if (node.queuePageFailure === page) return send({ error: secret }, 503);
        return send({
          page,
          pageSize,
          totalRecords: node.queue.length,
          records: node.queue.slice((page - 1) * pageSize, page * pageSize),
        });
      }
      if (endpoint === "episodefile")
        return send(
          node.files ?? [
            { quality: quality("WEBDL-1080p") },
            { quality: quality("Bluray-1080p") },
          ],
        );
      if (endpoint === "episode") return send(node.episodes ?? []);
      if (/^episode\/\d+$/.test(endpoint)) {
        const episode = node.episodes?.find(
          (item) => item.id === Number(parts[5]),
        );
        return send(episode ?? {}, episode ? 200 : 404);
      }
      if (endpoint.endsWith("/lookup")) return send(node.lookup);
      if (["movie", "series"].includes(endpoint) && req.method === "GET")
        return send(node.media);
      if (/^(movie|series)\/\d+$/.test(endpoint))
        return send(
          node.media.find((item) => item.id === Number(parts[5])) ?? {},
          node.media.some((item) => item.id === Number(parts[5])) ? 200 : 404,
        );
      if (endpoint === "release" && req.method === "GET")
        return send(
          node.releases ?? [
            {
              guid: "release-guid",
              indexerId: 4,
              title: "Dune.2160p",
              quality: quality("WEBDL-2160p"),
              size: 12000,
              age: 2,
              seeders: 8,
              protocol: "torrent",
              indexer: "Sample indexer",
              approved: false,
              rejections: ["Quality cutoff already met"],
            },
          ],
        );
      if (endpoint.startsWith("MediaCover/")) {
        if (node.imageStatus)
          return send({ error: "Cover unavailable" }, node.imageStatus);
        return new Response(
          Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a00kAAAAASUVORK5CYII=",
            "base64",
          ),
          {
            headers: {
              "Content-Type": node.imageType ?? "image/png",
              "Set-Cookie": `secret=${secret}`,
            },
          },
        );
      }
      if (req.method === "POST" || req.method === "DELETE")
        return send({ id: 100, apiKey: secret });
      return send({ error: "Not found" }, 404);
    },
  });
  onTestFinished(() => server.stop(true));
  const base = server.url.origin;
  const input = (name) => ({
    name,
    kind: nodes[name].kind,
    url: `${base}/${name}`,
    apiKey: secret,
  });
  const connect = async (name) => {
    const response = await instancesRoute.POST(
      request("/api/instances", "POST", input(name), { Origin: origin }),
    );
    assert.equal(response.status, 200, await response.clone().text());
    const body = await response.json();
    assert.equal(JSON.stringify(body).includes(secret), false);
    return body.instance;
  };
  return { directory, nodes, calls, base, input, connect };
}

test("episode reads preserve per-instance identities, exact download matches, seasons, and partial file failures", async () => {
  const episode = {
    id: 101,
    seriesId: 22,
    seasonNumber: 1,
    episodeNumber: 1,
    title: "Pilot",
    monitored: true,
    hasFile: false,
    airDateUtc: "2024-01-01T00:00:00Z",
  };
  const env = await setup({
    hd: {
      kind: "sonarr",
      media: [series],
      files: [
        { id: 9, seriesId: 22, quality: quality("WEBDL-1080p"), size: 500 },
      ],
      episodes: [
        { ...episode, hasFile: true, episodeFileId: 9 },
        { ...episode, id: 102, episodeNumber: 2 },
        { ...episode, id: 103, episodeNumber: 3 },
        {
          ...episode,
          id: 104,
          episodeNumber: 4,
          airDateUtc: "2999-01-01T00:00:00Z",
        },
        { ...episode, id: 105, episodeNumber: 5, monitored: false },
        { ...episode, id: 106, seasonNumber: 0, airDateUtc: undefined },
      ],
      queue: [
        { id: 1, seriesId: 22, episodeId: 103, status: "downloading" },
        { id: 2, seriesId: 22, status: "downloading" },
      ],
    },
    uhd: {
      kind: "sonarr",
      media: [{ ...series, id: 44 }],
      files: [],
      episodes: [{ ...episode, id: 901, seriesId: 44 }],
    },
  });
  const hd = await env.connect("hd");
  const uhd = await env.connect("uhd");
  const read = (id, remoteId) =>
    episodesRoute.GET(
      request(`/api/episodes?instanceId=${id}&remoteId=${remoteId}`),
    );
  const first = await (await read(hd.id, 22)).json();
  expect(first.episodes.map((item) => [item.id, item.status])).toEqual([
    [106, "unknown"],
    [101, "available"],
    [102, "missing"],
    [103, "downloading"],
    [104, "unreleased"],
    [105, "unmonitored"],
  ]);
  expect(first.seasons.map((season) => season.seasonNumber)).toEqual([0, 1]);
  expect(first.episodes.find((item) => item.id === 101)).toMatchObject({
    quality: "WEBDL-1080p",
    sizeOnDisk: 500,
  });
  const second = await (await read(uhd.id, 44)).json();
  expect(second.episodes[0]).toMatchObject({
    id: 901,
    seriesId: 44,
    seasonNumber: 1,
    episodeNumber: 1,
    status: "missing",
  });
  env.nodes.hd.fail = ["episodefile"];
  const partial = await (await read(hd.id, 22)).json();
  expect(partial.episodes.find((item) => item.id === 101)).toMatchObject({
    hasFile: true,
    status: "available",
    quality: "Unknown",
  });
  expect(partial.errors).toHaveLength(1);
  env.nodes.hd.fail = ["episode"];
  expect((await read(hd.id, 22)).status).toBe(502);
});

test("episode searches and releases use local episode IDs and reject wrong-series or movie scopes", async () => {
  const env = await setup({
    sonarr: { kind: "sonarr", episodes: [{ id: 901, seriesId: 44 }] },
    radarr: {},
  });
  const instance = await env.connect("sonarr");
  const radarr = await env.connect("radarr");
  const payload = {
    instanceId: instance.id,
    remoteId: 44,
    kind: "series",
    episodeId: 901,
  };
  expect(
    (await searchRoute.POST(request("/api/search", "POST", payload))).status,
  ).toBe(200);
  expect(env.calls.find((call) => call.endpoint === "command").body).toEqual({
    name: "EpisodeSearch",
    episodeIds: [901],
  });
  expect(
    (
      await releasesRoute.GET(
        request(
          `/api/releases?instanceId=${instance.id}&remoteId=44&kind=series&episodeId=901`,
        ),
      )
    ).status,
  ).toBe(200);
  expect(env.calls.find((call) => call.endpoint === "release").query).toEqual({
    episodeId: "901",
  });
  const actions = env.calls.filter((call) =>
    ["command", "release"].includes(call.endpoint),
  ).length;
  expect(
    (
      await searchRoute.POST(
        request("/api/search", "POST", { ...payload, remoteId: 22 }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await releasesRoute.GET(
        request(
          `/api/releases?instanceId=${instance.id}&remoteId=22&kind=series&episodeId=901`,
        ),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await searchRoute.POST(
        request("/api/search", "POST", {
          ...payload,
          kind: "movie",
          instanceId: radarr.id,
        }),
      )
    ).status,
  ).toBe(400);
  for (const episodeId of ["", "true", "1e3", "-1", "0"]) {
    expect(
      (
        await releasesRoute.GET(
          request(
            `/api/releases?instanceId=${instance.id}&remoteId=44&kind=series&episodeId=${episodeId}`,
          ),
        )
      ).status,
    ).toBe(400);
  }
  expect(
    env.calls.filter((call) => ["command", "release"].includes(call.endpoint)),
  ).toHaveLength(actions);
});

test("unconfigured reads return empty collections without network access or persistence", async () => {
  const { directory, calls } = await setup();
  for (const response of [
    await libraryRoute.GET(),
    await queueRoute.GET(),
    await lookupRoute.GET(request("/api/lookup")),
    await lookupRoute.GET(request("/api/lookup?term=dune&kind=movie")),
  ]) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [], errors: [] });
  }
  assert.deepEqual(await (await instancesRoute.GET()).json(), {
    instances: [],
  });
  assert.equal(calls.length, 0);
  assert.deepEqual(await readdir(directory), []);
});

for (const [name, handler] of [
  ["library", libraryRoute.GET],
  ["queue", queueRoute.GET],
]) {
  test(`${name} distinguishes successful empty reads, total primary failures, partial success, and recovery`, async () => {
    const env = await setup({ hd: {}, sonarr: { kind: "sonarr" } });
    await env.connect("hd");
    const read = async (status) => {
      const response = await handler();
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const text = await response.text();
      expect(text).not.toContain(secret);
      expect(text).not.toContain(env.base);
      return JSON.parse(text);
    };
    expect(await read(200)).toEqual({ items: [], errors: [] });
    // Primary failures must not be masked by healthy auxiliary endpoints.
    env.nodes.hd.fail = [name === "library" ? "movie" : "queue"];
    const failure = {
      error: `Unable to load the ${name} from any configured instance. Check instance connections and retry.`,
    };
    expect(await read(502)).toEqual(failure);
    const sonarr = await env.connect("sonarr");
    const partialEmpty = await read(200);
    expect(Object.keys(partialEmpty).sort()).toEqual(["errors", "items"]);
    expect(partialEmpty.items).toEqual([]);
    expect(partialEmpty.errors).toEqual([
      expect.objectContaining({
        instanceName: "hd",
        message: "Instance returned HTTP 503.",
      }),
    ]);
    env.nodes.sonarr.fail = [name === "library" ? "series" : "queue"];
    expect(await read(502)).toEqual(failure);
    delete env.nodes.sonarr.fail;
    env.nodes.sonarr.media = [series];
    env.nodes.sonarr.queue = [{ id: 7, seriesId: 22, status: "downloading" }];
    const recovered = await read(200);
    expect(recovered.items).toHaveLength(1);
    expect(recovered.errors).toHaveLength(1);
    if (name === "library")
      expect(recovered.items[0].targets[0].instanceId).toBe(sonarr.id);
    else expect(recovered.items[0].instanceId).toBe(sonarr.id);
    delete env.nodes.hd.fail;
    expect((await read(200)).errors).toEqual([]);
    env.nodes.sonarr.media = [];
    env.nodes.sonarr.queue = [];
    expect(await read(200)).toEqual({ items: [], errors: [] });
  });
}

test("library primary success remains successful with only auxiliary warnings", async () => {
  const env = await setup({ sonarr: { kind: "sonarr" } });
  await env.connect("sonarr");
  env.nodes.sonarr.fail = ["qualityprofile", "queue", "episodefile"];
  for (const media of [[], [series]]) {
    env.nodes.sonarr.media = media;
    const response = await libraryRoute.GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body).sort()).toEqual(["errors", "items"]);
    expect(body.items).toHaveLength(media.length);
    expect(body.errors.map((error) => error.message)).toEqual([
      expect.stringMatching(/^Quality profiles unavailable:/),
      expect.stringMatching(/^Download status unavailable:/),
      ...(media.length
        ? [expect.stringMatching(/^Some episode qualities are unknown:/)]
        : []),
    ]);
    if (media.length)
      expect(body.items[0].targets[0]).toMatchObject({
        episodeCount: 10,
        episodeFileCount: 6,
        quality: "Unknown",
      });
  }
});

test("lookup retains per-instance errors when all primary reads fail", async () => {
  const env = await setup({ hd: {} });
  const instance = await env.connect("hd");
  env.nodes.hd.fail = ["movie/lookup"];
  const response = await lookupRoute.GET(
    request("/api/lookup?term=dune&kind=movie"),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    items: [],
    errors: [
      {
        instanceId: instance.id,
        instanceName: "hd",
        message: "Instance returned HTTP 503.",
      },
    ],
  });
});

test("unknown instances return 404 without upstream actions", async () => {
  const { calls } = await setup();
  const id = "unknown-instance";
  const responses = await Promise.all([
    episodesRoute.GET(request(`/api/episodes?instanceId=${id}&remoteId=22`)),
    searchRoute.POST(
      request("/api/search", "POST", {
        instanceId: id,
        remoteId: 1,
        kind: "movie",
      }),
    ),
    releasesRoute.POST(
      request("/api/releases", "POST", {
        instanceId: id,
        guid: "guid",
        indexerId: 1,
      }),
    ),
    queueRoute.DELETE(
      request("/api/queue", "DELETE", {
        instanceId: id,
        id: 1,
        blocklist: true,
        removeFromClient: true,
      }),
    ),
    queueRoute.POST(request("/api/queue", "POST", { instanceId: id, id: 1 })),
    instanceRoute.DELETE(request(`/api/instances/${id}`, "DELETE"), {
      params: Promise.resolve({ id }),
    }),
  ]);
  for (const response of responses) {
    assert.equal(response.status, 404);
    assert.match((await response.json()).error, /Instance not found/);
  }
  assert.equal(calls.length, 0);
});

test("mutations enforce Origin, fetch metadata, JSON types, and body limits before network access", async () => {
  const env = await setup({ radarr: {} });
  const input = env.input("radarr");
  for (const headers of [
    { Origin: "https://evil.example" },
    { Origin: "null" },
    { Origin: "http://localhost:3001" },
    { "Sec-Fetch-Site": "cross-site" },
    { "Sec-Fetch-Site": "same-site" },
    { Origin: "https://evil.example", "X-Forwarded-Host": "evil.example" },
  ]) {
    const response = await testRoute.POST(
      request("/api/instances/test", "POST", input, headers),
    );
    assert.equal(response.status, 403);
  }
  for (const type of [
    "text/plain",
    "application/x-www-form-urlencoded",
    "multipart/form-data",
  ]) {
    const response = await testRoute.POST(
      request("/api/instances/test", "POST", input, { "Content-Type": type }),
    );
    assert.equal(response.status, 415);
  }
  assert.equal(
    (
      await testRoute.POST(
        new Request(`${origin}/api/instances/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (await testRoute.POST(request("/api/instances/test", "POST", []))).status,
    400,
  );
  assert.equal(
    (
      await testRoute.POST(
        request("/api/instances/test", "POST", { padding: "x".repeat(140000) }),
      )
    ).status,
    413,
  );
  assert.equal(env.calls.length, 0);
  assert.equal(
    (
      await testRoute.POST(
        request("/api/instances/test", "POST", input, {
          "Content-Type": "Application/JSON; charset=utf-8",
          Origin: origin,
        }),
      )
    ).status,
    200,
  );
  assert.equal(
    (await testRoute.POST(request("/api/instances/test", "POST", input)))
      .status,
    200,
  );
});

test("standalone origin checks use the addressed Host, not the internal bind address or forwarded host", async () => {
  const env = await setup({ radarr: {} });
  for (const [url, host, origin] of [
    [
      "http://0.0.0.0:3000/api/instances/test",
      "localhost:4000",
      "http://localhost:4000",
    ],
    [
      "http://0.0.0.0:3000/api/instances/test",
      "arrsenal.local",
      "http://arrsenal.local",
    ],
    [
      "https://0.0.0.0:3000/api/instances/test",
      "media.example",
      "https://media.example",
    ],
  ]) {
    const response = await testRoute.POST(
      new Request(url, {
        method: "POST",
        headers: {
          Host: host,
          Origin: origin,
          "Content-Type": "application/json",
          "Sec-Fetch-Site": "same-origin",
        },
        body: JSON.stringify(env.input("radarr")),
      }),
    );
    expect(response.status).toBe(200);
  }
  const calls = env.calls.length;
  for (const headers of [
    { Origin: "https://evil.example", "X-Forwarded-Host": "evil.example" },
    { Origin: "http://localhost:4000", "Sec-Fetch-Site": "cross-site" },
    { Origin: "http://localhost:5000" },
    { Origin: "https://localhost:4000", "X-Forwarded-Proto": "https" },
  ]) {
    const response = await testRoute.POST(
      new Request("http://0.0.0.0:3000/api/instances/test", {
        method: "POST",
        headers: {
          Host: "localhost:4000",
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(env.input("radarr")),
      }),
    );
    expect(response.status).toBe(403);
  }
  expect(env.calls).toHaveLength(calls);
});

test("request body deadlines reject stalled JSON and cancel the reader", async () => {
  jest.useFakeTimers();
  onTestFinished(() => jest.useRealTimers());
  let controller;
  const cancel = mock();
  const stream = new ReadableStream({
    start(value) {
      controller = value;
      controller.enqueue(new TextEncoder().encode("{"));
    },
    cancel,
  });
  onTestFinished(() => {
    if (!cancel.mock.calls.length) controller.close();
  });
  const pending = testRoute.POST(
    new Request(`${origin}/api/instances/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stream,
      duplex: "half",
    }),
  );
  let response;
  void pending.then((result) => {
    response = result;
  });
  await advanceTime(10000);
  expect(response?.status).toBe(408);
  expect(await response.json()).toEqual({ error: "Request body timed out." });
  expect(cancel).toHaveBeenCalledTimes(1);
});

test("instance validation permits private HTTP(S) and subpaths, but not URL credentials or invalid headers", async () => {
  const env = await setup({ radarr: {}, sonarr: { kind: "sonarr" } });
  for (const url of [
    "ftp://localhost",
    "http://user:password@localhost",
    "http://localhost?apiKey=secret",
    "http://localhost/#key",
    "not a URL",
    "http://localhost\\evil",
  ]) {
    assert.equal(
      (
        await testRoute.POST(
          request("/api/instances/test", "POST", {
            ...env.input("radarr"),
            url,
          }),
        )
      ).status,
      400,
    );
  }
  for (const apiKey of ["", "key\r\nX-Evil: true", "key with space"])
    assert.equal(
      (
        await testRoute.POST(
          request("/api/instances/test", "POST", {
            ...env.input("radarr"),
            apiKey,
          }),
        )
      ).status,
      400,
    );
  for (const url of [
    "http://192.168.1.4:7878",
    "http://localhost:8989/sonarr",
    "https://[::1]:8989/sonarr/api/v3/",
  ])
    assert.ok(instanceInput({ ...env.input("radarr"), url }).url);
  assert.equal(
    instanceInput({ ...env.input("radarr"), url: `${env.base}/radarr/api/v3/` })
      .url,
    `${env.base}/radarr`,
  );
  assert.equal(
    (
      await testRoute.POST(
        request("/api/instances/test", "POST", {
          ...env.input("sonarr"),
          kind: "radarr",
        }),
      )
    ).status,
    422,
  );
  assert.equal(
    (
      await testRoute.POST(
        request("/api/instances/test", "POST", {
          ...env.input("radarr"),
          apiKey: "wrong-key",
        }),
      )
    ).status,
    502,
  );
});

test("Zod instance schemas preserve string limits, normalization, and credential-safe errors", async () => {
  const env = await setup({ radarr: {} });
  const input = env.input("radarr");
  const invalid = [
    { name: null },
    { name: 42 },
    { name: " " },
    { name: "x".repeat(101) },
    { name: "\uD83D\uDE80".repeat(51) },
    { name: ` ${"x".repeat(100)}` },
    { name: "\tradarr" },
    { name: "radarr\u007f" },
    { kind: "Radarr" },
    { kind: secret },
    { url: { secret } },
    { url: `https://user:${secret}@localhost/` },
    { url: `http://localhost?apiKey=${secret}` },
    { url: `http://localhost/#${secret}` },
    { apiKey: null },
    { apiKey: 42 },
    { apiKey: "x".repeat(513) },
    { apiKey: `\n${secret}` },
  ];
  for (const [path, handler] of [
    ["/api/instances", instancesRoute.POST],
    ["/api/instances/test", testRoute.POST],
  ]) {
    for (const overrides of invalid) {
      const response = await handler(
        request(path, "POST", { ...input, ...overrides }),
      );
      assert.equal(response.status, 400, JSON.stringify(overrides));
      const body = await response.json();
      assert.deepEqual(Object.keys(body), ["error"]);
      assert.equal(typeof body.error, "string");
      assert.equal(JSON.stringify(body).includes(secret), false);
    }
  }
  assert.equal(env.calls.length, 0);
  assert.deepEqual(await readdir(env.directory), []);
  const normalized = instanceInput({
    ...input,
    name: "\uD83D\uDE80".repeat(50),
    url: ` ${input.url}/api/v3/ `,
    apiKey: ` ${secret} `,
    id: "client-id",
    connected: true,
    raw: { apiKey: secret },
  });
  assert.deepEqual(normalized, { ...input, name: "\uD83D\uDE80".repeat(50) });
  assert.equal(
    (await testRoute.POST(request("/api/instances/test", "POST", normalized)))
      .status,
    200,
  );
});

test("Zod action schemas reject coercion, invalid identities, bounds, and normalized duplicate targets", async () => {
  const env = await setup();
  const target = {
    instanceId: "unconfigured",
    qualityProfileId: 1,
    rootFolderPath: "/media",
  };
  const add = {
    media: { kind: "movie", tmdbId: 693134 },
    search: false,
    targets: [target],
  };
  const search = { instanceId: target.instanceId, kind: "movie", remoteId: 11 };
  const release = {
    instanceId: target.instanceId,
    guid: "release-guid",
    indexerId: 4,
  };
  const retry = { instanceId: target.instanceId, id: -3 };
  const remove = { ...retry, blocklist: false, removeFromClient: true };
  const cases = [
    [
      "/api/media",
      "POST",
      mediaRoute.POST,
      [
        {},
        { ...add, media: null },
        { ...add, media: [] },
        { ...add, media: { kind: secret, tmdbId: 693134 } },
        { ...add, media: { kind: "movie", tvdbId: 693134 } },
        { ...add, media: { kind: "series", tmdbId: 693134 } },
        { ...add, media: { kind: "movie", tmdbId: "693134" } },
        { ...add, media: { kind: "series", tvdbId: 1.5 } },
        { ...add, search: "false" },
        { ...add, search: null },
        { ...add, targets: null },
        { ...add, targets: [] },
        { ...add, targets: [null] },
        {
          ...add,
          targets: Array.from({ length: 33 }, (_, index) => ({
            ...target,
            instanceId: `target-${index}`,
          })),
        },
        {
          ...add,
          targets: [
            target,
            { ...target, instanceId: ` ${target.instanceId} ` },
          ],
        },
        { ...add, targets: [{ ...target, qualityProfileId: "1" }] },
        { ...add, targets: [{ ...target, qualityProfileId: 0 }] },
        { ...add, targets: [{ ...target, rootFolderPath: "/media\u0000" }] },
        { ...add, targets: [{ ...target, rootFolderPath: "x".repeat(4097) }] },
      ],
    ],
    [
      "/api/search",
      "POST",
      searchRoute.POST,
      [
        { ...search, kind: secret },
        { ...search, instanceId: null },
        ...["11", true, null, 0, -1, 1.1, 2147483648].map((remoteId) => ({
          ...search,
          remoteId,
        })),
      ],
    ],
    [
      "/api/releases",
      "POST",
      releasesRoute.POST,
      [
        { ...release, guid: "" },
        { ...release, guid: { secret } },
        { ...release, guid: "x".repeat(4097) },
        ...["4", true, null, 0, -1, 1.5, 2147483648].map((indexerId) => ({
          ...release,
          indexerId,
        })),
      ],
    ],
    [
      "/api/queue",
      "POST",
      queueRoute.POST,
      [
        ...["-3", false, null, 1.5, -2147483649, 2147483648].map((id) => ({
          ...retry,
          id,
        })),
      ],
    ],
    [
      "/api/queue",
      "DELETE",
      queueRoute.DELETE,
      [
        { ...remove, blocklist: "false" },
        { ...remove, blocklist: 0 },
        { ...remove, removeFromClient: "true" },
        { ...remove, removeFromClient: null },
        { ...remove, id: "-3" },
        { ...remove, instanceId: "\tbad" },
      ],
    ],
  ];
  for (const [path, method, handler, payloads] of cases) {
    for (const payload of payloads) {
      const response = await handler(request(path, method, payload));
      assert.equal(
        response.status,
        400,
        `${method} ${path}: ${JSON.stringify(payload)}`,
      );
      const body = await response.json();
      assert.deepEqual(Object.keys(body), ["error"]);
      assert.equal(JSON.stringify(body).includes(secret), false);
    }
  }
  assert.equal(env.calls.length, 0);
  assert.deepEqual(await readdir(env.directory), []);
  // Legal signed queue endpoints must reach the instance lookup, not fail schema validation.
  for (const id of [-2147483648, 0, 2147483647]) {
    assert.equal(
      (await queueRoute.POST(request("/api/queue", "POST", { ...retry, id })))
        .status,
      404,
    );
  }
});

test("Zod query/path schemas preserve decimal-only IDs, optional lookup defaults, and first query values", async () => {
  const env = await setup({ radarr: {} });
  const instance = await env.connect("radarr");
  env.calls.length = 0;
  const release = { instanceId: instance.id, remoteId: "11", kind: "movie" };
  for (const remoteId of [
    "",
    "0",
    "-1",
    "+11",
    " 11",
    "1.1",
    "1e2",
    "0x10",
    "Infinity",
    "2147483648",
    "\uFF11",
    null,
  ]) {
    const query = new URLSearchParams(release);
    if (remoteId === null) query.delete("remoteId");
    else query.set("remoteId", remoteId);
    const response = await releasesRoute.GET(request(`/api/releases?${query}`));
    assert.equal(response.status, 400, String(remoteId));
    assert.deepEqual(Object.keys(await response.json()), ["error"]);
  }
  for (const [path, handler] of [
    ["/api/releases?remoteId=11&kind=movie", releasesRoute.GET],
    [`/api/releases?instanceId=${instance.id}&remoteId=11`, releasesRoute.GET],
    [`/api/lookup?kind=${secret}`, lookupRoute.GET],
    ["/api/lookup?kind=", lookupRoute.GET],
    ["/api/lookup?term=%20%20", lookupRoute.GET],
    ["/api/lookup?term=%09Dune", lookupRoute.GET],
    [
      `/api/lookup?${new URLSearchParams({ term: "\uD83D\uDE80".repeat(151) })}`,
      lookupRoute.GET,
    ],
    [`/api/image?instanceId=${instance.id}`, imageRoute.GET],
    ["/api/image?path=%2FMediaCover%2F11%2Fposter.jpg", imageRoute.GET],
    [
      `/api/image?${new URLSearchParams({ instanceId: instance.id, path: "x".repeat(2049) })}`,
      imageRoute.GET,
    ],
  ]) {
    const response = await handler(request(path));
    assert.equal(response.status, 400, path);
    const body = await response.json();
    assert.deepEqual(Object.keys(body), ["error"]);
    assert.equal(JSON.stringify(body).includes(secret), false);
  }
  for (const id of [null, 42, "", " ", "x".repeat(101), "bad\n"]) {
    assert.equal(
      (
        await optionsRoute.GET(request("/api/instances/invalid/options"), {
          params: Promise.resolve({ id }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await instanceRoute.DELETE(
          request("/api/instances/invalid", "DELETE"),
          { params: Promise.resolve({ id }) },
        )
      ).status,
      400,
    );
  }
  assert.equal(env.calls.length, 0);
  assert.deepEqual(
    await (
      await lookupRoute.GET(request("/api/lookup?term=&kind=movie&kind=bad"))
    ).json(),
    { items: [], errors: [] },
  );
  assert.deepEqual(
    await (await lookupRoute.GET(request("/api/lookup"))).json(),
    { items: [], errors: [] },
  );
  const valid = await releasesRoute.GET(
    request(
      `/api/releases?instanceId=${instance.id}&kind=movie&remoteId=00011&remoteId=bad`,
    ),
  );
  assert.equal(valid.status, 200);
  assert.deepEqual(env.calls.at(-1).query, { movieId: "11" });
});

test("Zod persisted config rejects invalid schemas and normalized duplicates without overwriting or leaking keys", async () => {
  const env = await setup({ radarr: {} });
  const record = { id: "saved-instance", ...env.input("radarr") };
  const document = { version: 1, instances: [record] };
  const invalid = [
    null,
    [],
    {},
    { ...document, version: "1" },
    { ...document, version: 2 },
    { ...document, instances: {} },
    { ...document, instances: [null] },
    ...[
      { id: "" },
      { id: "path/segment" },
      { id: 42 },
      { name: " " },
      { kind: secret },
      { apiKey: undefined },
      { apiKey: 42 },
      { apiKey: `${secret}\n` },
      { url: `http://user:${secret}@localhost` },
    ].map((overrides) => ({
      ...document,
      instances: [{ ...record, ...overrides }],
    })),
    {
      ...document,
      instances: [record, { ...record, url: `${env.base}/second` }],
    },
    {
      ...document,
      instances: [
        record,
        { ...record, id: "second", url: `${record.url}/api/v3/` },
      ],
    },
    {
      ...document,
      instances: Array.from({ length: 33 }, (_, index) => ({
        ...record,
        id: `id-${index}`,
        url: `${env.base}/${index}`,
      })),
    },
  ];
  const path = join(env.directory, "config.json");
  for (const value of invalid) {
    const serialized = JSON.stringify(value);
    await writeFile(path, serialized, { mode: 0o600 });
    const response = await libraryRoute.GET();
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.deepEqual(Object.keys(body), ["error"]);
    assert.match(body.error, /Unable to read Arrsenal config\.json/);
    assert.equal(JSON.stringify(body).includes(secret), false);
    await assert.rejects(
      saveInstance(
        instanceInput({ ...env.input("radarr"), url: `${env.base}/new` }),
      ),
      (error) => error.status === 500,
    );
    assert.equal(await Bun.file(path).text(), serialized);
    assert.deepEqual(await readdir(env.directory), ["config.json"]);
  }
  const valid = JSON.stringify({
    ...document,
    ignored: secret,
    instances: [
      {
        ...record,
        name: " radarr ",
        url: `${record.url}/api/v3/`,
        ignored: secret,
      },
    ],
  });
  await Bun.write(path, valid);
  assert.deepEqual(await readInstances(), [record]);
  await assert.rejects(
    saveInstance({
      ...env.input("radarr"),
      url: `${env.base}/new`,
      apiKey: 42,
    }),
    (error) => error.status === 500,
  );
  assert.equal(await Bun.file(path).text(), valid);
  assert.deepEqual(await readdir(env.directory), ["config.json"]);
  assert.equal(env.calls.length, 0);
});

test("connectivity tests do not save; atomic config writes serialize and never expose keys", async () => {
  const env = await setup({ hd: {}, uhd: {}, sonarr: { kind: "sonarr" } });
  const checked = await testRoute.POST(
    request("/api/instances/test", "POST", env.input("hd")),
  );
  assert.equal((await checked.json()).success, true);
  assert.deepEqual(await readInstances(), []);
  const summaries = await Promise.all([
    env.connect("hd"),
    env.connect("uhd"),
    env.connect("sonarr"),
  ]);
  assert.equal((await readInstances()).length, 3);
  const config = await Bun.file(join(env.directory, "config.json")).json();
  assert.equal(config.instances[0].apiKey, secret);
  assert.equal(
    (await stat(join(env.directory, "config.json"))).mode & 0o777,
    0o600,
  );
  assert.deepEqual(await readdir(env.directory), ["config.json"]);
  assert.equal(
    (
      await instancesRoute.POST(
        request("/api/instances", "POST", env.input("hd")),
      )
    ).status,
    409,
  );
  env.nodes.uhd.mode = "error";
  const listed = await instancesRoute.GET();
  const listedText = await listed.text();
  assert.equal(listedText.includes(secret), false);
  const listedInstances = JSON.parse(listedText).instances;
  assert.equal(listedInstances.filter((item) => item.connected).length, 2);
  assert.match(
    listedInstances.find((item) => item.name === "uhd").error,
    /HTTP 503/,
  );
  env.calls.length = 0;
  const removed = await instanceRoute.DELETE(
    request(`/api/instances/${summaries[0].id}`, "DELETE"),
    { params: Promise.resolve({ id: summaries[0].id }) },
  );
  assert.equal(removed.status, 200);
  assert.match((await removed.json()).message, /No remote media/);
  assert.equal(env.calls.length, 0);
  assert.equal((await readInstances()).length, 2);
  await Promise.all([
    removeInstance(summaries[1].id),
    saveInstance(instanceInput({ ...env.input("hd"), name: "Reconnected" })),
  ]);
  assert.equal((await readInstances()).length, 2);
});

test("instance edits retain or replace keys, normalize changes, and preserve identity", async () => {
  const replacement = "replacement-private-key";
  const env = await setup({ hd: {}, sonarr: { kind: "sonarr" } });
  const saved = await env.connect("hd");
  const path = `/api/instances/${saved.id}`;
  const context = { params: Promise.resolve({ id: saved.id }) };
  const patch = (body) =>
    instanceRoute.PATCH(request(path, "PATCH", body), context);
  const { apiKey: _key, ...original } = env.input("hd");
  const renamed = await patch({ ...original, name: " Renamed ", id: "forged" });
  expect(renamed.status).toBe(200);
  expect(await renamed.json()).toEqual({
    instance: { ...saved, name: "Renamed" },
  });
  expect(env.calls.at(-1).key).toBe(secret);
  const { apiKey: _otherKey, ...changed } = env.input("sonarr");
  const moved = await patch({
    ...changed,
    name: " Television ",
    url: `${changed.url}/api/v3/`,
  });
  expect(moved.status).toBe(200);
  expect(await moved.json()).toEqual({
    instance: { ...saved, ...changed, name: "Television" },
  });
  expect(await readInstances()).toEqual([
    { ...changed, name: "Television", id: saved.id, apiKey: secret },
  ]);
  env.nodes.sonarr.apiKey = replacement;
  const replaced = await patch({ ...changed, apiKey: replacement });
  expect(replaced.status).toBe(200);
  expect(await replaced.json()).toEqual({ instance: { ...saved, ...changed } });
  expect(env.calls.at(-1).key).toBe(replacement);
  expect(await readInstances()).toEqual([
    { ...changed, id: saved.id, apiKey: replacement },
  ]);
  expect((await patch(changed)).status).toBe(200);
  expect(env.calls.at(-1).key).toBe(replacement);
  expect((await stat(join(env.directory, "config.json"))).mode & 0o777).toBe(
    0o600,
  );
  expect(await readdir(env.directory)).toEqual(["config.json"]);
});

test("saved-instance connection tests use retained or replacement keys without persisting drafts", async () => {
  const replacement = "draft-private-key";
  const env = await setup({ hd: {}, sonarr: { kind: "sonarr" } });
  const saved = await env.connect("hd");
  const before = await Bun.file(join(env.directory, "config.json")).text();
  const { apiKey: _key, ...draft } = env.input("sonarr");
  for (const apiKey of [undefined, replacement]) {
    env.nodes.sonarr.apiKey = apiKey ?? secret;
    const response = await instanceTestRoute.POST(
      request(`/api/instances/${saved.id}/test`, "POST", {
        ...draft,
        name: "Draft",
        apiKey,
      }),
      { params: Promise.resolve({ id: saved.id }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      version: "4.0.1",
      message: "Connection successful. The instance has not been saved.",
    });
    expect(env.calls.at(-1)).toMatchObject({
      node: "sonarr",
      key: apiKey ?? secret,
    });
    expect(await Bun.file(join(env.directory, "config.json")).text()).toBe(
      before,
    );
  }
});

test("instance edits reject duplicate URLs and both edit endpoints fail safely without persistence", async () => {
  const env = await setup({ hd: {}, other: {} });
  const saved = await env.connect("hd");
  await env.connect("other");
  const configPath = join(env.directory, "config.json");
  const before = await Bun.file(configPath).text();
  const context = { params: Promise.resolve({ id: saved.id }) };
  const duplicate = await instanceRoute.PATCH(
    request(`/api/instances/${saved.id}`, "PATCH", {
      ...env.input("other"),
      url: `${env.input("other").url}/api/v3/`,
    }),
    context,
  );
  expect(duplicate.status).toBe(409);
  expect(await Bun.file(configPath).text()).toBe(before);
  for (const [method, handler] of [
    ["PATCH", instanceRoute.PATCH],
    ["POST", instanceTestRoute.POST],
  ]) {
    const path = `/api/instances/${saved.id}${method === "POST" ? "/test" : ""}`;
    const calls = env.calls.length;
    const missing = await handler(request(path, method, env.input("hd")), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(missing.status).toBe(404);
    expect(env.calls).toHaveLength(calls);
    for (const [overrides, status] of [
      [{ apiKey: "wrong-private-key" }, 502],
      [{ kind: "sonarr" }, 422],
    ]) {
      const response = await handler(
        request(path, method, { ...env.input("hd"), ...overrides }),
        context,
      );
      expect(response.status).toBe(status);
      const text = await response.text();
      expect(text).not.toContain(secret);
      expect(text).not.toContain("wrong-private-key");
      expect(await Bun.file(configPath).text()).toBe(before);
    }
    env.nodes.hd.mode = "error";
    const failed = await handler(
      request(path, method, { ...env.input("hd"), name: "Unsaved" }),
      context,
    );
    expect(failed.status).toBe(502);
    expect(await failed.text()).not.toContain(secret);
    expect(await Bun.file(configPath).text()).toBe(before);
    delete env.nodes.hd.mode;
  }
  expect(await readdir(env.directory)).toEqual(["config.json"]);
});

test("edit endpoints enforce mutation guards, full fields, optional-key validation, and path validation before upstream access", async () => {
  const env = await setup({ hd: {} });
  const saved = await env.connect("hd");
  const before = await Bun.file(join(env.directory, "config.json")).text();
  env.calls.length = 0;
  for (const [method, handler] of [
    ["PATCH", instanceRoute.PATCH],
    ["POST", instanceTestRoute.POST],
  ]) {
    const path = `/api/instances/${saved.id}${method === "POST" ? "/test" : ""}`;
    const context = { params: Promise.resolve({ id: saved.id }) };
    for (const [headers, status] of [
      [{ Origin: "https://evil.example" }, 403],
      [{ "Sec-Fetch-Site": "cross-site" }, 403],
      [{ "Content-Type": "text/plain" }, 415],
    ]) {
      expect(
        (
          await handler(
            request(path, method, env.input("hd"), headers),
            context,
          )
        ).status,
      ).toBe(status);
    }
    for (const overrides of [
      { name: undefined },
      { kind: undefined },
      { url: undefined },
      { name: " " },
      { kind: secret },
      { url: `http://user:${secret}@localhost` },
      { apiKey: "" },
      { apiKey: null },
      { apiKey: 42 },
      { apiKey: `${secret}\n` },
      { apiKey: "key with space" },
    ]) {
      const response = await handler(
        request(path, method, { ...env.input("hd"), ...overrides }),
        context,
      );
      expect(response.status).toBe(400);
      expect(await response.text()).not.toContain(secret);
    }
    for (const id of [null, 42, "", "bad\n"]) {
      expect(
        (
          await handler(request(path, method, env.input("hd")), {
            params: Promise.resolve({ id }),
          })
        ).status,
      ).toBe(400);
    }
    expect((await handler(request(path, method, []), context)).status).toBe(
      400,
    );
    expect(
      (
        await handler(
          request(path, method, { padding: "x".repeat(140000) }),
          context,
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await handler(
          new Request(`${origin}${path}`, {
            method,
            headers: { "Content-Type": "application/json" },
            body: "{",
          }),
          context,
        )
      ).status,
    ).toBe(400);
  }
  expect(env.calls).toHaveLength(0);
  expect(await Bun.file(join(env.directory, "config.json")).text()).toBe(
    before,
  );
});

test("edits compare every saved field under lock after verification and preserve concurrent changes", async () => {
  const env = await setup({ hd: {}, other: {} });
  const saved = await env.connect("hd");
  const path = `/api/instances/${saved.id}`;
  const context = { params: Promise.resolve({ id: saved.id }) };
  for (const change of [
    { name: "Concurrent rename" },
    { kind: "sonarr" },
    { url: `${env.base}/moved` },
    { apiKey: "concurrent-private-key" },
  ]) {
    const current = (await readInstances())[0];
    env.nodes.hd.verify = async () => {
      await updateInstance(current, { ...current, ...change });
    };
    const response = await instanceRoute.PATCH(
      request(path, "PATCH", env.input("hd")),
      context,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Instance changed during verification. Reload and retry.",
    });
    expect(await readInstances()).toEqual([{ ...current, ...change }]);
  }
  env.nodes.hd.verify = async () => {
    await env.connect("other");
  };
  expect(
    (
      await instanceRoute.PATCH(
        request(path, "PATCH", env.input("hd")),
        context,
      )
    ).status,
  ).toBe(200);
  expect(await readInstances()).toHaveLength(2);
  env.nodes.hd.verify = async () => {
    await removeInstance(saved.id);
  };
  expect(
    (
      await instanceRoute.PATCH(
        request(path, "PATCH", env.input("hd")),
        context,
      )
    ).status,
  ).toBe(404);
  expect((await readInstances()).map((item) => item.name)).toEqual(["other"]);
  expect(await readdir(env.directory)).toEqual(["config.json"]);
});

test("duplicate URLs introduced during verification are rejected under the write lock", async () => {
  const env = await setup({ hd: {}, other: {} });
  const saved = await env.connect("hd");
  env.nodes.other.verify = async () => {
    await saveInstance(env.input("other"));
  };
  const response = await instanceRoute.PATCH(
    request(`/api/instances/${saved.id}`, "PATCH", env.input("other")),
    { params: Promise.resolve({ id: saved.id }) },
  );
  expect(response.status).toBe(409);
  expect(await readInstances()).toEqual([
    { ...env.input("hd"), id: saved.id },
    expect.objectContaining(env.input("other")),
  ]);
});

test("separate Bun processes cannot lose each other's config mutations", async () => {
  const env = await setup();
  const configUrl = new URL("../src/lib/server/config.ts", import.meta.url)
    .href;
  const loader = fileURLToPath(
    new URL("./backend-process-preload.mjs", import.meta.url),
  );
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, async (_, index) => {
      const worker = Bun.spawn(
        [
          process.execPath,
          "--preload",
          loader,
          "-e",
          `const {saveInstance, instanceInput} = await import(${JSON.stringify(configUrl)}); await saveInstance(instanceInput({name:"Worker ${index}",kind:"radarr",url:"http://127.0.0.1:${8000 + index}",apiKey:"worker-test-secret"}));`,
        ],
        {
          env: { ...process.env, ARRSENAL_CONFIG_DIR: env.directory },
          stdout: "ignore",
          stderr: "pipe",
        },
      );
      const [exitCode, stderr] = await Promise.all([
        worker.exited,
        new Response(worker.stderr).text(),
      ]);
      assert.equal(exitCode, 0, `Config writer ${index} failed: ${stderr}`);
    }),
  );
  for (const result of results) {
    if (result.status === "rejected") throw result.reason;
  }
  assert.equal((await readInstances()).length, 5);
  assert.equal(
    (await stat(join(env.directory, "config.json"))).mode & 0o777,
    0o600,
  );
  assert.deepEqual(await readdir(env.directory), ["config.json"]);
});

test("corrupt or symlinked config fails closed without fallback or overwrite", async () => {
  const env = await setup({ hd: {} });
  const path = join(env.directory, "config.json");
  await writeFile(path, "{broken", { mode: 0o600 });
  for (const handler of [libraryRoute.GET, queueRoute.GET, instancesRoute.GET])
    assert.equal((await handler()).status, 500);
  const saving = await instancesRoute.POST(
    request("/api/instances", "POST", env.input("hd")),
  );
  assert.equal(saving.status, 500);
  assert.equal(await Bun.file(path).text(), "{broken");
  assert.deepEqual(await readdir(env.directory), ["config.json"]);
  await rm(path);
  await Bun.write(
    join(env.directory, "private.json"),
    JSON.stringify({ version: 1, instances: [] }),
  );
  await symlink(join(env.directory, "private.json"), path);
  assert.equal((await libraryRoute.GET()).status, 500);
});

test("upstream redirects, slow responses, malformed JSON, and reflected credentials are safe", async () => {
  const env = await setup({
    redirect: { mode: "redirect" },
    slow: { mode: "slow" },
    invalid: { mode: "invalid" },
    reflected: {
      lookup: [
        {
          title: secret,
          tmdbId: 88,
          remotePoster: `https://example.org/${secret}.jpg`,
        },
      ],
    },
  });
  const redirected = await testRoute.POST(
    request("/api/instances/test", "POST", env.input("redirect")),
  );
  assert.equal(redirected.status, 502);
  assert.match((await redirected.json()).error, /redirect/i);
  assert.ok(!env.calls.some((call) => call.node === "leak"));
  await assert.rejects(
    arrRequest(env.input("slow"), "system/status", { timeoutMs: 25 }),
    (error) => error.status === 504,
  );
  const invalid = await testRoute.POST(
    request("/api/instances/test", "POST", env.input("invalid")),
  );
  assert.equal(invalid.status, 502);
  assert.equal((await invalid.text()).includes(secret), false);
  await env.connect("reflected");
  const response = await lookupRoute.GET(
    request("/api/lookup?term=reflected&kind=movie"),
  );
  const text = await response.text();
  assert.equal(text.includes(secret), false);
  assert.equal(JSON.parse(text).items[0].poster, "");
});

test("timeouts cover bodies and mutations, oversized responses fail, and malformed media reports errors", async () => {
  const env = await setup({
    body: { mode: "slow-body" },
    oversized: { mode: "oversized" },
    invalidMedia: { media: [{}] },
  });
  await assert.rejects(
    arrRequest(env.input("body"), "system/status", { timeoutMs: 25 }),
    (error) => error.status === 504,
  );
  await assert.rejects(
    arrRequest(env.input("body"), "command", {
      method: "POST",
      body: { name: "MoviesSearch", movieIds: [11] },
      timeoutMs: 25,
    }),
    (error) =>
      error.status === 504 && /may have been accepted/.test(error.message),
  );
  await assert.rejects(
    arrRequest(env.input("oversized"), "movie"),
    (error) => error.status === 502 && /size limit/.test(error.message),
  );
  await env.connect("invalidMedia");
  const response = await libraryRoute.GET();
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {
    error:
      "Unable to load the library from any configured instance. Check instance connections and retry.",
  });
});

test("library merges by provider identity, preserves per-target quality/counts, and isolates outages", async () => {
  const env = await setup({
    hd: {
      media: [
        movie,
        { id: 90, title: "Unidentified", year: 2000, hasFile: false },
      ],
    },
    uhd: {
      profile: "Ultra-HD",
      media: [
        {
          ...movie,
          id: 44,
          hasFile: false,
          movieFile: undefined,
          sizeOnDisk: 0,
        },
        { id: 90, title: "Unidentified", year: 2000, hasFile: false },
      ],
      queue: [{ id: -12, movieId: 44, status: "downloading" }],
    },
    sonarr: { kind: "sonarr", media: [series] },
    offline: {},
  });
  await Promise.all(Object.keys(env.nodes).map(env.connect));
  env.nodes.offline.mode = "error";
  const body = await (await libraryRoute.GET()).json();
  assert.equal(body.items.length, 4);
  const dune = body.items.find((item) => item.tmdbId === 693134);
  assert.equal(dune.targets.length, 2);
  assert.equal(dune.status, "downloading");
  assert.equal(
    dune.targets.find((target) => target.instanceName === "hd").quality,
    "Bluray-1080p",
  );
  assert.equal(
    dune.targets.find((target) => target.instanceName === "uhd").qualityProfile,
    "Ultra-HD",
  );
  const shogun = body.items.find((item) => item.kind === "series");
  assert.equal(shogun.targets[0].episodeCount, 10);
  assert.equal(shogun.targets[0].episodeFileCount, 6);
  assert.equal(shogun.targets[0].sizeOnDisk, 6000);
  assert.equal(shogun.targets[0].quality, "Bluray-1080p, WEBDL-1080p");
  assert.equal(shogun.status, "partial");
  assert.match(shogun.poster, /^\/api\/image\?/);
  assert.equal(body.errors.length, 1);
  assert.equal(body.errors[0].instanceName, "offline");
  env.nodes.sonarr.fail = ["qualityprofile", "queue", "episodefile"];
  const partial = await (await libraryRoute.GET()).json();
  assert.equal(partial.items.length, 4);
  assert.equal(
    partial.errors.filter((error) => error.instanceName === "sonarr").length,
    3,
  );
  for (const node of Object.values(env.nodes)) node.mode = "error";
  const failed = await libraryRoute.GET();
  assert.equal(failed.status, 502);
  assert.deepEqual(await failed.json(), {
    error:
      "Unable to load the library from any configured instance. Check instance connections and retry.",
  });
});

test("normalization scopes fallback identities and does not conflate movie and series IDs", () => {
  const instance = {
    id: "a",
    name: "A",
    kind: "radarr",
    url: "http://localhost/radarr",
    apiKey: secret,
  };
  const first = normalizeMedia({ id: 1, title: "Same", year: 2020 }, instance);
  const second = normalizeMedia(
    { id: 1, title: "Same", year: 2020 },
    { ...instance, id: "b" },
  );
  assert.notEqual(first.id, second.id);
  assert.equal(mergeMedia([first, second]).length, 2);
  assert.equal(
    mergeMedia([
      normalizeMedia({ ...movie, tmdbId: 10 }, instance),
      normalizeMedia(
        { ...series, tvdbId: 10 },
        { ...instance, kind: "sonarr" },
      ),
    ]).length,
    2,
  );
  assert.equal(
    mergeMedia([
      normalizeMedia(movie, instance),
      normalizeMedia(
        { ...movie, hasFile: false, movieFile: undefined },
        { ...instance, id: "b" },
      ),
    ])[0].status,
    "partial",
  );
});

test("live lookup merges available results, reports failed targets, and never claims trending", async () => {
  const env = await setup({
    hd: { lookup: [{ ...movie, id: 0 }] },
    uhd: { lookup: [{ ...movie, id: 0 }] },
    failed: {},
    sonarr: { kind: "sonarr", lookup: [{ ...series, id: 0 }] },
  });
  await Promise.all(Object.keys(env.nodes).map(env.connect));
  env.nodes.failed.mode = "error";
  env.calls.length = 0;
  const empty = await (
    await lookupRoute.GET(request("/api/lookup?kind=movie"))
  ).json();
  assert.deepEqual(empty, { items: [], errors: [] });
  assert.equal(env.calls.length, 0);
  const response = await (
    await lookupRoute.GET(
      request("/api/lookup?kind=movie&term=Dune%20%26%20friends"),
    )
  ).json();
  assert.equal(response.items.length, 1);
  assert.equal(response.errors.length, 1);
  assert.ok(!env.calls.some((call) => call.node === "sonarr"));
  assert.equal(
    env.calls.find((call) => call.endpoint === "movie/lookup").query.term,
    "Dune & friends",
  );
  assert.equal(
    (await lookupRoute.GET(request("/api/lookup?kind=bad&term=Dune"))).status,
    400,
  );
  assert.equal(
    (await lookupRoute.GET(request(`/api/lookup?term=${"x".repeat(301)}`)))
      .status,
    400,
  );
});

test("options and media add resolve trusted metadata per target and report partial success", async () => {
  const env = await setup({
    hd: { lookup: [{ ...movie, id: 0 }] },
    uhd: { lookup: [{ ...movie, id: 0 }] },
    sonarr: { kind: "sonarr", lookup: [{ ...series, id: 0 }] },
  });
  const hd = await env.connect("hd");
  const uhd = await env.connect("uhd");
  const sonarr = await env.connect("sonarr");
  const options = await (
    await optionsRoute.GET(request(`/api/instances/${hd.id}/options`), {
      params: Promise.resolve({ id: hd.id }),
    })
  ).json();
  assert.deepEqual(options, {
    profiles: [{ id: 1, name: "HD-1080p" }],
    rootFolders: [{ id: 1, path: "/media", freeSpace: 100000 }],
  });
  const body = {
    media: {
      ...movie,
      kind: "movie",
      title: "CLIENT FORGERY",
      id: 99999,
      path: "/etc",
      images: [{ url: "https://evil.example" }],
    },
    targets: [
      { instanceId: hd.id, qualityProfileId: 1, rootFolderPath: "/media" },
      { instanceId: uhd.id, qualityProfileId: 999, rootFolderPath: "/media" },
    ],
    search: true,
  };
  const response = await mediaRoute.POST(request("/api/media", "POST", body));
  assert.equal(response.status, 207);
  const action = await response.json();
  assert.equal(action.success, false);
  assert.match(action.message, /Added to 1 of 2/);
  assert.equal(action.errors[0].instanceId, uhd.id);
  const adds = env.calls.filter(
    (call) => call.endpoint === "movie" && call.method === "POST",
  );
  assert.equal(adds.length, 1);
  assert.equal(adds[0].body.title, movie.title);
  assert.equal(adds[0].body.tmdbId, movie.tmdbId);
  assert.equal(adds[0].body.id, undefined);
  assert.equal(adds[0].body.path, undefined);
  assert.equal(adds[0].body.monitored, true);
  assert.deepEqual(adds[0].body.addOptions, { searchForMovie: true });
  assert.equal(JSON.stringify(adds[0].body).includes("evil.example"), false);
  assert.equal(
    env.calls.find((call) => call.endpoint === "movie/lookup").query.term,
    "tmdb:693134",
  );
  const seriesAdd = await mediaRoute.POST(
    request("/api/media", "POST", {
      media: {
        kind: "series",
        tvdbId: series.tvdbId,
        seasons: [{ seasonNumber: 99 }],
      },
      targets: [
        {
          instanceId: sonarr.id,
          qualityProfileId: 1,
          rootFolderPath: "/media",
        },
      ],
      search: false,
    }),
  );
  assert.equal(seriesAdd.status, 200);
  const addedSeries = env.calls.find(
    (call) => call.endpoint === "series" && call.method === "POST",
  ).body;
  assert.equal(addedSeries.tvdbId, series.tvdbId);
  assert.deepEqual(addedSeries.seasons, [
    { seasonNumber: 0, monitored: false },
    { seasonNumber: 1, monitored: true },
  ]);
  assert.deepEqual(addedSeries.addOptions, {
    monitor: "all",
    searchForMissingEpisodes: false,
    searchForCutoffUnmetEpisodes: false,
  });
  const invalidRoot = await mediaRoute.POST(
    request("/api/media", "POST", {
      ...body,
      targets: [
        {
          instanceId: hd.id,
          qualityProfileId: 1,
          rootFolderPath: "/unapproved",
        },
      ],
    }),
  );
  assert.equal(invalidRoot.status, 400);
  env.nodes.hd.lookup = [{ ...movie, tmdbId: 123, id: 0 }];
  assert.equal(
    (
      await mediaRoute.POST(
        request("/api/media", "POST", { ...body, targets: [body.targets[0]] }),
      )
    ).status,
    404,
  );
  env.nodes.hd.lookup = [movie];
  assert.equal(
    (
      await mediaRoute.POST(
        request("/api/media", "POST", { ...body, targets: [body.targets[0]] }),
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await mediaRoute.POST(
        request("/api/media", "POST", {
          ...body,
          targets: [body.targets[0], body.targets[0]],
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await mediaRoute.POST(
        request("/api/media", "POST", { ...body, search: "true" }),
      )
    ).status,
    400,
  );
});

test("automatic search and release endpoints use the correct v3 IDs and commands", async () => {
  const env = await setup({
    hd: { media: [movie] },
    sonarr: { kind: "sonarr", media: [series] },
  });
  const hd = await env.connect("hd");
  const sonarr = await env.connect("sonarr");
  for (const [instance, kind, remoteId] of [
    [hd, "movie", 11],
    [sonarr, "series", 22],
  ]) {
    assert.equal(
      (
        await searchRoute.POST(
          request("/api/search", "POST", {
            instanceId: instance.id,
            kind,
            remoteId,
          }),
        )
      ).status,
      200,
    );
    const response = await releasesRoute.GET(
      request(
        `/api/releases?${new URLSearchParams({ instanceId: instance.id, kind, remoteId: String(remoteId) })}`,
      ),
    );
    const release = (await response.json()).items[0];
    assert.equal(release.approved, false);
    assert.deepEqual(release.rejections, ["Quality cutoff already met"]);
  }
  assert.deepEqual(
    env.calls
      .filter((call) => call.endpoint === "command")
      .map((call) => call.body),
    [
      { name: "MoviesSearch", movieIds: [11] },
      { name: "SeriesSearch", seriesId: 22 },
    ],
  );
  assert.deepEqual(
    env.calls
      .filter((call) => call.endpoint === "release")
      .map((call) => call.query),
    [{ movieId: "11" }, { seriesId: "22" }],
  );
  assert.equal(
    (
      await releasesRoute.POST(
        request("/api/releases", "POST", {
          instanceId: hd.id,
          guid: "release-guid",
          indexerId: 4,
          downloadUrl: "https://evil.example",
        }),
      )
    ).status,
    200,
  );
  assert.deepEqual(env.calls.at(-1).body, {
    guid: "release-guid",
    indexerId: 4,
  });
  assert.equal(
    (
      await searchRoute.POST(
        request("/api/search", "POST", {
          instanceId: sonarr.id,
          kind: "movie",
          remoteId: 22,
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await releasesRoute.GET(
        request(`/api/releases?instanceId=${hd.id}&kind=movie&remoteId=1e2`),
      )
    ).status,
    400,
  );
});

test("queue paginates every record, preserves progress and errors, and forwards delete flags", async () => {
  const downloads = Array.from({ length: 5 }, (_, index) => ({
    id: index - 3,
    title: `Download ${index}`,
    movieId: 11,
    movie,
    quality: quality("WEBDL-1080p"),
    size: 100,
    sizeleft: 25,
    timeleft: "00:01:23",
    status: "downloading",
    downloadId: `hash-${index}`,
    downloadClient: "qBittorrent",
    statusMessages: [
      { title: "Import warning", messages: ["Waiting for files"] },
    ],
  }));
  const env = await setup({
    hd: { queue: downloads, pageSize: 2 },
    sonarr: {
      kind: "sonarr",
      queue: [
        {
          ...downloads[0],
          id: 88,
          series,
          movie: undefined,
          movieId: undefined,
          seriesId: 22,
        },
      ],
    },
    offline: {},
  });
  const hd = await env.connect("hd");
  await env.connect("sonarr");
  await env.connect("offline");
  env.nodes.offline.mode = "error";
  const response = await (await queueRoute.GET()).json();
  assert.equal(response.items.length, 6);
  assert.equal(response.errors.length, 1);
  assert.equal(response.items[0].sizeleft, 25);
  assert.equal(response.items[0].timeleft, "00:01:23");
  assert.deepEqual(response.items[0].warnings, [
    "Import warning",
    "Waiting for files",
  ]);
  assert.equal(
    response.items.find((item) => item.kind === "series").mediaTitle,
    series.title,
  );
  assert.deepEqual(
    env.calls
      .filter((call) => call.node === "hd" && call.endpoint === "queue")
      .map((call) => call.query.page),
    ["1", "2", "3"],
  );
  assert.equal(
    env.calls.find((call) => call.node === "hd" && call.endpoint === "queue")
      .query.includeMovie,
    "true",
  );
  assert.equal(
    env.calls.find(
      (call) => call.node === "sonarr" && call.endpoint === "queue",
    ).query.includeSeries,
    "true",
  );
  assert.equal(
    (
      await queueRoute.DELETE(
        request("/api/queue", "DELETE", {
          instanceId: hd.id,
          id: -3,
          blocklist: true,
          removeFromClient: false,
        }),
      )
    ).status,
    200,
  );
  assert.equal(env.calls.at(-1).endpoint, "queue/-3");
  assert.deepEqual(env.calls.at(-1).query, {
    blocklist: "true",
    removeFromClient: "false",
  });
  assert.equal(
    (
      await queueRoute.DELETE(
        request("/api/queue", "DELETE", {
          instanceId: hd.id,
          id: -3,
          blocklist: "true",
          removeFromClient: false,
        }),
      )
    ).status,
    400,
  );
  env.nodes.hd.queuePageFailure = 2;
  assert.equal((await (await queueRoute.GET()).json()).errors.length, 2);
});

test("queue changes, clamped pages, and duplicate records are not reported as a complete queue", async () => {
  const env = await setup({ hd: {} });
  await env.connect("hd");
  const page = (number, totalRecords, ids, pageSize = 2) => ({
    page: number,
    totalRecords,
    pageSize,
    records: ids.map((id) => ({ id, title: `Download ${id}` })),
  });
  for (const pages of [
    [{ records: [], totalRecords: "0", page: 1, pageSize: 2 }],
    [page(1, 1, ["invalid-id"])],
    [page(1, 5, [1, 2]), page(2, 4, [4, 5])],
    [page(1, 4, [1, 2]), page(1, 4, [3, 4])],
    [page(1, 3, [1, 2]), page(2, 3, [2, 3])],
    [page(1, 3, [1, 2]), page(2, 3, [3], 1)],
  ]) {
    env.nodes.hd.queuePages = pages;
    const response = await queueRoute.GET();
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({
      error:
        "Unable to load the queue from any configured instance. Check instance connections and retry.",
    });
  }
  delete env.nodes.hd.queuePages;
  env.nodes.hd.queue = [{ id: 1 }, { id: 2 }, { id: 3 }];
  env.nodes.hd.pageSize = 2;
  env.nodes.hd.queuePageFailure = 2;
  const failed = await queueRoute.GET();
  expect(failed.status).toBe(502);
  expect(Object.keys(await failed.json())).toEqual(["error"]);
  delete env.nodes.hd.queuePageFailure;
  const recovered = await queueRoute.GET();
  expect(recovered.status).toBe(200);
  const body = await recovered.json();
  expect(body.items).toHaveLength(3);
  expect(body.errors).toEqual([]);
});

test("queue retry distinguishes delayed grabs, completed import scans, and active downloads", async () => {
  const env = await setup({
    hd: {
      queue: [
        { id: -1, status: "delay" },
        {
          id: 2,
          status: "completed",
          trackedDownloadState: "importPending",
          downloadId: "movie-hash",
          outputPath: "/downloads/movie",
        },
        {
          id: 3,
          status: "downloading",
          downloadId: "active",
          outputPath: "/downloads/active",
        },
        { id: 4, status: "completed" },
      ],
    },
    sonarr: {
      kind: "sonarr",
      queue: [
        {
          id: 5,
          status: "completed",
          downloadId: "series-hash",
          outputPath: "/downloads/series",
        },
      ],
    },
  });
  const hd = await env.connect("hd");
  const sonarr = await env.connect("sonarr");
  const delayed = await queueRoute.POST(
    request("/api/queue", "POST", { instanceId: hd.id, id: -1 }),
  );
  assert.equal(delayed.status, 200);
  assert.match((await delayed.json()).message, /not an import retry/);
  for (const [instanceId, id] of [
    [hd.id, 2],
    [sonarr.id, 5],
  ])
    assert.equal(
      (await queueRoute.POST(request("/api/queue", "POST", { instanceId, id })))
        .status,
      200,
    );
  assert.deepEqual(
    env.calls
      .filter((call) => call.endpoint === "command")
      .map((call) => call.body),
    [
      {
        name: "DownloadedMoviesScan",
        path: "/downloads/movie",
        downloadClientId: "movie-hash",
        importMode: "auto",
      },
      {
        name: "DownloadedEpisodesScan",
        path: "/downloads/series",
        downloadClientId: "series-hash",
        importMode: "auto",
      },
    ],
  );
  assert.equal(
    env.calls.filter((call) => call.endpoint === "queue/grab/-1").length,
    1,
  );
  for (const id of [3, 4])
    assert.equal(
      (
        await queueRoute.POST(
          request("/api/queue", "POST", { instanceId: hd.id, id }),
        )
      ).status,
      409,
    );
  assert.equal(
    (
      await queueRoute.POST(
        request("/api/queue", "POST", { instanceId: hd.id, id: 999 }),
      )
    ).status,
    404,
  );
});

test("cached covers take priority and missing covers fall back without forwarding credentials", async () => {
  const env = await setup({ sonarr: { kind: "sonarr" } });
  const instance = { ...(await env.connect("sonarr")), apiKey: secret };
  const remote = "https://artworks.thetvdb.com/banners/posters/example.jpg";
  const src = mediaImage(
    {
      remotePoster: remote,
      images: [
        {
          coverType: "poster",
          url: "/sonarr/MediaCover/22/poster.jpg",
          remoteUrl: remote,
        },
      ],
    },
    instance,
  );
  const query = new URL(src, origin).searchParams;
  expect(query.get("path")).toBe("/MediaCover/22/poster.jpg");
  expect(query.get("fallback")).toBe(remote);
  expect(mediaImage({ remotePoster: remote }, instance)).toBe(remote);

  const actualFetch = globalThis.fetch;
  const fallbackRequests = [];
  let contentType = "image/png";
  const local = await imageRoute.GET(request(src));
  expect(local.status).toBe(200);
  const bytes = await local.arrayBuffer();
  const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
    (input, init) => {
      if (String(input) !== remote) return actualFetch(input, init);
      fallbackRequests.push(init);
      return Promise.resolve(
        new Response(bytes, {
          headers: {
            "Content-Type": contentType,
            "Set-Cookie": "tracking=value",
          },
        }),
      );
    },
  );
  onTestFinished(() => fetchMock.mockRestore());
  expect((await imageRoute.GET(request(src))).status).toBe(200);
  expect(fallbackRequests).toHaveLength(0);
  env.nodes.sonarr.imageStatus = 404;
  const fallback = await imageRoute.GET(request(src));
  expect(fallback.status).toBe(200);
  expect(fallback.headers.get("content-type")).toBe("image/png");
  expect(fallback.headers.get("set-cookie")).toBeNull();
  expect(fallbackRequests).toHaveLength(1);
  expect(new Headers(fallbackRequests[0].headers).has("x-api-key")).toBe(false);
  expect(new Headers(fallbackRequests[0].headers).has("authorization")).toBe(
    false,
  );
  expect(fallbackRequests[0].redirect).toBe("error");
  expect(fallbackRequests[0].signal).toBeInstanceOf(AbortSignal);
  contentType = "image/svg+xml";
  expect((await imageRoute.GET(request(src))).status).toBe(502);
  query.delete("fallback");
  expect((await imageRoute.GET(request(`/api/image?${query}`))).status).toBe(
    404,
  );
});

test("invalid artwork fallbacks and local paths cannot trigger a fetch", async () => {
  const env = await setup({ sonarr: { kind: "sonarr" } });
  const instance = await env.connect("sonarr");
  const before = env.calls.length;
  for (const fallback of [
    "http://127.0.0.1/private.jpg",
    "https://evil.example/image.jpg",
    "https://user:password@image.tmdb.org/t/p/w500/image.jpg",
    "https://image.tmdb.org/t/p/w500/image.jpg?apiKey=secret",
    "https://image.tmdb.org/other/image.jpg",
    "https://image.tmdb.org/t/p/w500/image.jpg#fragment",
  ]) {
    expect(
      (
        await imageRoute.GET(
          request(
            `/api/image?${new URLSearchParams({ instanceId: instance.id, path: "/MediaCover/22/poster.jpg", fallback })}`,
          ),
        )
      ).status,
    ).toBe(400);
  }
  expect(
    (
      await imageRoute.GET(
        request(
          `/api/image?${new URLSearchParams({ instanceId: instance.id, path: "/api/v3/system/status", fallback: "https://image.tmdb.org/t/p/w500/image.jpg" })}`,
        ),
      )
    ).status,
  ).toBe(400);
  expect(env.calls).toHaveLength(before);
});

test("absolute local remotePoster and remoteUrl covers use the authenticated image proxy", async () => {
  const env = await setup({ sonarr: { kind: "sonarr" } });
  const instance = { ...(await env.connect("sonarr")), apiKey: secret };
  const cover = `${instance.url}/api/v3/MediaCover/22/poster.jpg?lastWrite=123`;
  expect((await fetch(cover)).status).toBe(401);
  for (const media of [
    { remotePoster: cover },
    { images: [{ coverType: "poster", remoteUrl: cover }] },
    { images: [{ coverType: "poster", url: cover }] },
    {
      remotePoster: "https://unsupported.example/poster.jpg",
      images: [{ coverType: "poster", url: cover }],
    },
  ]) {
    const src = mediaImage(media, instance);
    expect(src).toMatch(/^\/api\/image\?/);
    expect(src).not.toContain(secret);
    const response = await imageRoute.GET(request(src));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(env.calls.at(-1).key).toBe(secret);
  }
});

test("image proxy is base-aware, raster-only, key-safe, and refuses external or traversing paths", async () => {
  const env = await setup({ sonarr: { kind: "sonarr" } });
  const instance = await env.connect("sonarr");
  const config = { ...instance, apiKey: secret };
  assert.equal(
    coverPath(config, "/sonarr/MediaCover/22/poster-250.jpg"),
    "MediaCover/22/poster-250.jpg",
  );
  for (const path of [
    "/MediaCover/22/poster.jpg",
    "/api/v3/MediaCover/22/poster.jpg",
    "/sonarr/api/v3/MediaCover/22/poster.jpg",
  ]) {
    const response = await imageRoute.GET(
      request(
        `/api/image?${new URLSearchParams({ instanceId: instance.id, path })}`,
      ),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(
      response.headers.get("cross-origin-resource-policy"),
      "same-origin",
    );
    assert.ok((await response.arrayBuffer()).byteLength > 0);
    assert.equal(env.calls.at(-1).endpoint, "MediaCover/22/poster.jpg");
    assert.equal(env.calls.at(-1).key, secret);
  }
  const before = env.calls.length;
  for (const path of [
    "https://evil.example/image.jpg",
    "//evil.example/image.jpg",
    "/api/v3/system/status",
    "/MediaCover/../config.xml",
    "/MediaCover/22/../../system/status",
    "/MediaCover/22/%2e%2e%2fconfig.xml",
    "/MediaCover/22/%252e%252e%252fconfig.xml",
    "/MediaCover/22/image.svg",
    "/MediaCover/22/poster.jpg?apikey=secret",
    "/MediaCover\\22\\poster.jpg",
  ]) {
    assert.equal(
      (
        await imageRoute.GET(
          request(
            `/api/image?${new URLSearchParams({ instanceId: instance.id, path })}`,
          ),
        )
      ).status,
      400,
      path,
    );
  }
  assert.equal(env.calls.length, before);
  env.nodes.sonarr.imageType = "image/svg+xml";
  assert.equal(
    (
      await imageRoute.GET(
        request(
          `/api/image?${new URLSearchParams({ instanceId: instance.id, path: "/MediaCover/22/poster.jpg" })}`,
        ),
      )
    ).status,
    502,
  );
  assert.equal(
    mediaImage(
      {
        remotePoster: "javascript:alert(1)",
        images: [
          {
            coverType: "poster",
            remoteUrl: "https://user:password@evil.example/image.jpg",
          },
        ],
      },
      config,
    ),
    "",
  );
  assert.equal(
    mediaImage(
      {
        images: [
          {
            coverType: "poster",
            remoteUrl: "https://example.org/poster.jpg?apiKey=secret",
          },
        ],
      },
      config,
    ),
    "",
  );
  assert.equal(
    mediaImage(
      { remotePoster: "https://image.tmdb.org/t/p/w500/poster.jpg" },
      config,
    ),
    "https://image.tmdb.org/t/p/w500/poster.jpg",
  );
});
