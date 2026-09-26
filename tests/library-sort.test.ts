import { describe, expect, it } from "bun:test";
import {
  mediaMonitoring,
  selectLibraryView,
  targetMonitoring,
} from "@/lib/library-selectors";
import type { MediaItem, MediaTarget } from "@/lib/types";

const target = (overrides: Partial<MediaTarget> = {}): MediaTarget => ({
  instanceId: "tv",
  instanceName: "Shows HD",
  remoteId: 1,
  qualityProfileId: 1,
  qualityProfile: "HD-1080p",
  quality: "",
  status: "partial",
  monitored: true,
  sizeOnDisk: 0,
  ...overrides,
});
const show = (
  title: string,
  overrides: Partial<MediaTarget> = {},
): MediaItem => ({
  id: `series:tvdb:${title}`,
  kind: "series",
  title,
  year: 2020,
  overview: "",
  poster: "",
  genres: [],
  added: "2026-01-01",
  status: "partial",
  targets: [target(overrides)],
});

function sorted(
  items: MediaItem[],
  sort: "episodes" | "monitored",
  sortDirection: "asc" | "desc",
) {
  return selectLibraryView(items, {
    category: "library",
    status: "all",
    instanceFilter: "all",
    quality: "all",
    sort,
    sortDirection,
  }).filtered.map((item) => item.title);
}

describe("library sorting", () => {
  it("sorts by missing episodes and keeps movies last", () => {
    const items = [
      { ...show("Movie"), kind: "movie" as const, targets: [target()] },
      show("Complete", { episodeCount: 10, episodeFileCount: 10 }),
      show("Lots", { episodeCount: 40, episodeFileCount: 10 }),
      show("Few", { episodeCount: 10, episodeFileCount: 8 }),
    ];
    expect(sorted(items, "episodes", "desc")).toEqual([
      "Lots",
      "Few",
      "Complete",
      "Movie",
    ]);
    expect(sorted(items, "episodes", "asc")).toEqual([
      "Complete",
      "Few",
      "Lots",
      "Movie",
    ]);
  });

  it("sorts by how much is monitored", () => {
    const items = [
      show("Off", { monitored: false, seasonCount: 3 }),
      show("All", { seasonCount: 3, monitoredSeasonCount: 3 }),
      show("Some", { seasonCount: 3, monitoredSeasonCount: 1 }),
    ];
    expect(sorted(items, "monitored", "desc")).toEqual(["All", "Some", "Off"]);
  });
});

describe("monitoring", () => {
  it("labels shows by their monitored seasons", () => {
    expect(targetMonitoring(target({ monitored: false })).label).toBe(
      "Unmonitored",
    );
    expect(targetMonitoring(target()).label).toBe("Monitored");
    expect(
      targetMonitoring(target({ seasonCount: 5, monitoredSeasonCount: 2 })),
    ).toMatchObject({ state: "partial", label: "2 of 5 seasons" });
    expect(
      mediaMonitoring({
        ...show("Mixed"),
        targets: [target(), target({ instanceId: "4k", monitored: false })],
      }),
    ).toMatchObject({ state: "partial", label: "Partly monitored" });
  });
});

describe("normalizeMedia", () => {
  it("counts monitored regular seasons for shows", async () => {
    const { normalizeMedia } = await import("@/lib/server/media");
    const [normalized] = normalizeMedia(
      {
        id: 3,
        title: "Severance",
        tvdbId: 371980,
        monitored: true,
        seasons: [
          { seasonNumber: 0, monitored: false },
          { seasonNumber: 1, monitored: true },
          { seasonNumber: 2, monitored: false },
        ],
      },
      {
        id: "tv",
        name: "Shows HD",
        kind: "sonarr",
        url: "http://sonarr",
        apiKey: "key",
      },
    ).targets;
    expect(normalized).toMatchObject({
      seasonCount: 2,
      monitoredSeasonCount: 1,
    });
  });
});
