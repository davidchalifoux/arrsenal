import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

import type { ActionResponse } from "@/lib/types";

mock.module("server-only", () => ({}));
const { api, mediaHref, mediaIdFromRoute, qualityLabel, sizeLabel } =
  await import("@/lib/client");
const { addMediaSchema } = await import("@/lib/server/schemas");

const fetchMock =
  mock<(...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>>();

beforeEach(() => {
  fetchMock.mockReset();
  spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(fetchMock, { preconnect: fetch.preconnect }),
  );
});
afterEach(() => mock.restore());

describe("media routes", () => {
  it.each([
    [
      "movie",
      "movie:tmdb:693134",
      "Dune: Part Two",
      "/movies/693134-dune-part-two",
    ],
    [
      "series",
      "series:tvdb:81189",
      "Breaking Bad",
      "/shows/81189-breaking-bad",
    ],
    [
      "movie",
      "movie:tmdb:1",
      "  Am\u00e9lie / 100%?!  ",
      "/movies/1-amelie-100",
    ],
    [
      "movie",
      "movie:tmdb:2",
      "\u6771\u4eac",
      `/movies/2-${encodeURIComponent("\u6771\u4eac")}`,
    ],
    ["movie", "movie:tmdb:3", "?!", "/movies/3-title"],
    [
      "series",
      "series:instance-a:11",
      "Example",
      "/shows/series%3Ainstance-a%3A11",
    ],
  ] as const)("round-trips %s %s with a readable route", (kind, id, title, expected) => {
    const href = mediaHref({ kind, id, title });
    expect(href).toBe(expected);
    expect(
      mediaIdFromRoute(
        decodeURIComponent(href.slice(href.lastIndexOf("/") + 1)),
        kind,
      ),
    ).toBe(id);
  });

  it("resolves stale slugs and bare provider IDs without relying on the title", () => {
    expect(mediaIdFromRoute("693134-old-title", "movie")).toBe(
      "movie:tmdb:693134",
    );
    expect(mediaIdFromRoute("81189", "series")).toBe("series:tvdb:81189");
    expect(mediaIdFromRoute("81189-breaking-bad", "movie")).toBe(
      "movie:tmdb:81189",
    );
  });

  it.each([
    "movie:tmdb:693134",
    "series:tvdb:81189",
    "series:instance-a:11",
  ])("preserves legacy and instance-scoped identity %s", (id) =>
    expect(
      mediaIdFromRoute(id, id.startsWith("movie:") ? "movie" : "series"),
    ).toBe(id));
});

describe("sizeLabel", () => {
  it.each([
    [0, "0 B"],
    [-1, "0 B"],
    [Number.NaN, "0 B"],
    [Number.POSITIVE_INFINITY, "0 B"],
    [0.1, "0 B"],
    [0.5, "1 B"],
    [1, "1 B"],
    [1023, "1023 B"],
    [1024, "1 KB"],
    [1.5 * 1024 ** 2, "1.5 MB"],
    [1024 ** 3, "1.0 GB"],
    [1024 ** 4, "1.0 TB"],
    [1024 ** 5, "1024.0 TB"],
  ] as const)("formats %s bytes as %s without invalid units", (bytes, expected) => {
    expect(sizeLabel(bytes)).toBe(expected);
  });
});

describe("qualityLabel", () => {
  it.each([
    ["Ultra-HD", "WEBDL-1080p", "WEBDL-1080p"],
    ["Ultra-HD", "Not downloaded", "Ultra-HD"],
    ["HD-1080p", "Unknown", "HD-1080p"],
    ["Full HD", "", "Full HD"],
    ["Ultra-HD", "Bluray-1080p, WEBDL-1080p", "Bluray-1080p, WEBDL-1080p"],
    ["", "", "Unknown"],
  ])("labels profile %s with downloaded quality %s as %s", (profile, quality, expected) => {
    expect(qualityLabel(profile, quality)).toBe(expected);
  });

  it("preserves an actual downloaded quality outside the HD aliases instead of showing the target profile", () => {
    expect(qualityLabel("Ultra-HD", "SDTV")).toBe("SDTV");
  });
});

describe("add request Zod contract", () => {
  it("accepts independent target choices and rejects missing selection, profiles, folders, and duplicates", () => {
    const target = {
      instanceId: "radarr-hd",
      qualityProfileId: 7,
      rootFolderPath: "/movies/hd",
    };
    const request = {
      media: { kind: "movie", tmdbId: 693134, title: "Client metadata" },
      search: false,
      targets: [
        target,
        {
          instanceId: "radarr-4k",
          qualityProfileId: 19,
          rootFolderPath: "/movies/4k",
        },
      ],
    };
    expect(addMediaSchema.parse(request)).toEqual({
      ...request,
      media: { kind: "movie", tmdbId: 693134 },
    });
    for (const targets of [
      [],
      [{ ...target, qualityProfileId: 0 }],
      [{ ...target, rootFolderPath: "" }],
      [target, target],
    ]) {
      expect(addMediaSchema.safeParse({ ...request, targets }).success).toBe(
        false,
      );
    }
  });
});

describe("api", () => {
  it.each([
    200, 502,
  ])("reports a non-JSON HTTP %s response without leaking its body", async (status) => {
    fetchMock.mockResolvedValue(
      new Response("<html>Internal proxy diagnostics</html>", {
        status,
        headers: { "Content-Type": "text/html" },
      }),
    );
    await expect(api("/api/library")).rejects.toThrow(
      `Arrsenal returned an unexpected response (${status}). Refresh and try again.`,
    );
  });

  it.each([
    {
      body: { error: "Profile no longer exists.", message: "Add failed." },
      expected: "Profile no longer exists.",
    },
    {
      body: { message: "Instance unavailable." },
      expected: "Instance unavailable.",
    },
    { body: {}, expected: "The request failed. Please try again." },
  ])("uses the JSON error, message, or fallback: $expected", async ({
    body,
    expected,
  }) => {
    fetchMock.mockResolvedValue(Response.json(body, { status: 503 }));
    await expect(api("/api/media")).rejects.toThrow(expected);
  });

  it("returns HTTP 207 action failures intact so callers can retry only failed targets", async () => {
    const partial: ActionResponse = {
      success: false,
      message: "Added to 1 of 2 selected instances.",
      errors: [
        {
          instanceId: "radarr-4k",
          instanceName: "Radarr 4K",
          message: "Disk is full.",
        },
      ],
    };
    fetchMock.mockResolvedValue(Response.json(partial, { status: 207 }));
    await expect(api<ActionResponse>("/api/media")).resolves.toEqual(partial);
  });
});
