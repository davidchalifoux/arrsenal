// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../src/lib/server/config", () => ({ readInstances: vi.fn() }));

import { GET } from "../src/app/api/calendar/route";
import { readInstances } from "../src/lib/server/config";

const instance = (id: string, kind: "sonarr" | "radarr" = "radarr") => ({
  id,
  kind,
  name: id,
  url: `http://${id}.test/base`,
  apiKey: "secret-key",
});
const movie = {
  id: 1,
  title: "Movie",
  tmdbId: 42,
  inCinemas: "2026-09-01T00:00:00Z",
  digitalRelease: "2026-09-15",
  physicalRelease: "2026-09-30T00:00:00Z",
};
const episode = {
  id: 5,
  seriesId: 2,
  title: "Pilot",
  seasonNumber: 1,
  episodeNumber: 1,
  airDateUtc: "2026-09-02T23:30:00Z",
  series: { id: 2, title: "Show", tvdbId: 99 },
};
const fetchMock = vi.fn<typeof fetch>();
const request = (query = "start=2026-09-01&end=2026-10-01") =>
  GET(new Request(`http://localhost/api/calendar?${query}`));

beforeEach(() => {
  vi.mocked(readInstances).mockResolvedValue([
    instance("movies"),
    instance("shows", "sonarr"),
  ]);
  fetchMock.mockImplementation(async (url) =>
    Response.json(String(url).includes("shows.test") ? [episode] : [movie]),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("calendar API", () => {
  it("skips invalid movie release fields independently and does not invent a provider identity", async () => {
    vi.mocked(readInstances).mockResolvedValue([instance("movies")]);
    fetchMock.mockResolvedValue(
      Response.json([
        {
          ...movie,
          tmdbId: -1,
          inCinemas: "2026-09-31",
          digitalRelease: "2026-09-10",
          physicalRelease: "2026-09-10T12:90:00Z",
        },
        { ...movie, title: " " },
        { ...movie, id: 1.5 },
      ]),
    );
    const data = await (await request()).json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({
      type: "digital",
      date: "2026-09-10",
    });
    expect(data.items[0].mediaId).toBeUndefined();
  });

  it("sorts same-time season drops numerically", async () => {
    vi.mocked(readInstances).mockResolvedValue([instance("shows", "sonarr")]);
    fetchMock.mockResolvedValue(
      Response.json(
        [10, 2, 1].map((episodeNumber) => ({ ...episode, episodeNumber })),
      ),
    );
    const data = await (await request()).json();
    expect(
      data.items.map((item: { episodeNumber: number }) => item.episodeNumber),
    ).toEqual([1, 2, 10]);
  });

  it("calls provider calendars with credentials server-side, includes series, and separates release types", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const data = await response.json();
    expect(data.items.map((item: { type: string }) => item.type)).toEqual([
      "theatrical",
      "episode",
      "digital",
      "physical",
    ]);
    expect(data.items[1]).toMatchObject({
      mediaId: "series:tvdb:99",
      airDateUtc: "2026-09-02T23:30:00.000Z",
      seasonNumber: 1,
      episodeNumber: 1,
    });
    for (const [input, init] of fetchMock.mock.calls) {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/base/api/v3/calendar");
      expect(url.searchParams.get("start")).toBe("2026-09-01");
      expect(url.searchParams.get("end")).toBe("2026-10-01");
      expect(url.searchParams.get("unmonitored")).toBe("true");
      expect(url.searchParams.get("includeSeries")).toBe(
        url.hostname === "shows.test" ? "true" : null,
      );
      expect(init).toMatchObject({
        cache: "no-store",
        redirect: "manual",
        headers: { "X-Api-Key": "secret-key" },
      });
    }
    expect(JSON.stringify(data)).not.toContain("secret-key");
  });

  it.each([
    "",
    "start=2026-02-30&end=2026-03-10",
    "start=2025-02-29&end=2025-03-10",
    "start=2026-9-01&end=2026-10-01",
    "start=2026-09-01&end=2026-09-01",
    "start=2026-10-01&end=2026-09-01",
    "start=2026-01-01&end=2026-04-05",
    "start=0000-01-01&end=0000-02-01",
    "start=2026-09-01T00:00:00Z&end=2026-10-01",
  ])("rejects invalid or excessive range %s before contacting providers", async (query) => {
    expect((await request(query)).status).toBe(400);
    expect(readInstances).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "start=2024-02-29&end=2024-03-01",
    "start=2026-01-01&end=2026-04-04",
  ])("accepts real leap dates and exactly 93 days: %s", async (query) => {
    expect((await request(query)).status).toBe(200);
  });

  it("filters each release separately and applies end-exclusive UTC bounds", async () => {
    fetchMock.mockResolvedValue(
      Response.json([
        {
          ...movie,
          inCinemas: "2026-08-31",
          digitalRelease: "2026-09-01",
          physicalRelease: "2026-10-01",
        },
      ]),
    );
    vi.mocked(readInstances).mockResolvedValue([instance("movies")]);
    const data = await (await request()).json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].type).toBe("digital");
  });

  it("skips malformed entries and impossible dates without discarding valid siblings", async () => {
    vi.mocked(readInstances).mockResolvedValue([instance("shows", "sonarr")]);
    fetchMock.mockResolvedValue(
      Response.json([
        null,
        false,
        [],
        {},
        episode,
        { ...episode, id: 0 },
        { ...episode, series: {} },
        { ...episode, seriesId: 3 },
        { ...episode, episodeNumber: -1 },
        { ...episode, seasonNumber: 1.5 },
        ...[
          "2026-09-31T00:00:00Z",
          "2026-09-02T24:00:00Z",
          "2026-09-02",
          "nonsense",
          "2026-10-01T00:00:00Z",
        ].map((airDateUtc) => ({ ...episode, airDateUtc })),
      ]),
    );
    const data = await (await request()).json();
    expect(data.errors).toEqual([]);
    expect(data.items).toHaveLength(1);
  });

  it("deduplicates stable identities across instances and retains sources, not title or local ID matches", async () => {
    vi.mocked(readInstances).mockResolvedValue([
      instance("one"),
      instance("two"),
    ]);
    fetchMock.mockImplementation(async () =>
      Response.json([
        movie,
        { ...movie, tmdbId: undefined },
        { ...movie, id: 3, tmdbId: 43 },
      ]),
    );
    const data = await (await request()).json();
    expect(data.items).toHaveLength(12);
    expect(
      data.items
        .filter(
          (item: { mediaId?: string }) => item.mediaId === "movie:tmdb:42",
        )
        .every((item: { sources: unknown[] }) => item.sources.length === 2),
    ).toBe(true);
    expect(
      data.items.filter((item: { mediaId?: string }) => !item.mediaId),
    ).toHaveLength(6);
  });

  it("deduplicates episodes by series identity, season, episode and air time, not local IDs", async () => {
    vi.mocked(readInstances).mockResolvedValue([
      instance("one", "sonarr"),
      instance("two", "sonarr"),
    ]);
    fetchMock.mockImplementation(async (url) =>
      Response.json([
        { ...episode, id: String(url).includes("one.test") ? 5 : 99 },
        { ...episode, episodeNumber: 2 },
      ]),
    );
    const data = await (await request()).json();
    expect(data.items).toHaveLength(2);
    expect(data.items[0].sources).toHaveLength(2);
  });

  it("returns partial success with sanitized per-instance errors", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("shows.test")) throw new Error("secret-key");
      return Response.json([movie]);
    });
    const response = await request();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toHaveLength(3);
    expect(data.errors).toEqual([
      expect.objectContaining({ instanceId: "shows", instanceName: "shows" }),
    ]);
    expect(JSON.stringify(data)).not.toContain("secret-key");
  });

  it("returns 502 and retains every instance error when all responses fail or are invalid", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("shows.test")
        ? new Response(null, { status: 401 })
        : Response.json({ invalid: true }),
    );
    const response = await request();
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.errors).toHaveLength(2);
    expect(data.error).toContain("all configured instances failed");
  });

  it("succeeds with no configured instances, and with an empty successful provider alongside a failure", async () => {
    vi.mocked(readInstances).mockResolvedValue([]);
    expect(await (await request()).json()).toEqual({
      items: [],
      errors: [],
      instanceCount: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.mocked(readInstances).mockResolvedValue([
      instance("movies"),
      instance("shows", "sonarr"),
    ]);
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("shows.test")
        ? new Response(null, { status: 500 })
        : Response.json([]),
    );
    expect((await request()).status).toBe(200);
  });
});
