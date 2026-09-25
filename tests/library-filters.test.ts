import { describe, expect, it } from "bun:test";
import {
  customFilterSchema,
  type FilterDefinition,
  matchesFilter,
  presetFilters,
} from "@/lib/library-filters";
import type { MediaItem, MediaTarget } from "@/lib/types";

const now = Date.parse("2026-09-25T12:00:00Z");
const target = (overrides: Partial<MediaTarget> = {}): MediaTarget => ({
  instanceId: "hd",
  instanceName: "Movies HD",
  remoteId: 1,
  qualityProfileId: 1,
  qualityProfile: "HD-1080p",
  quality: "Bluray-1080p",
  status: "available",
  monitored: true,
  sizeOnDisk: 10 * 1024 ** 3,
  ...overrides,
});
const movie = (overrides: Partial<MediaItem> = {}): MediaItem => ({
  id: "movie:tmdb:1",
  kind: "movie",
  title: "Dune",
  year: 2021,
  overview: "",
  poster: "",
  genres: ["Science Fiction", "Adventure"],
  rating: 7.8,
  added: "2026-09-20T00:00:00Z",
  status: "available",
  targets: [target()],
  ...overrides,
});

const all = (rules: FilterDefinition["rules"]): FilterDefinition => ({
  match: "all",
  rules,
});

describe("matchesFilter", () => {
  it("matches choice and list fields with include and exclude operators", () => {
    const item = movie({
      targets: [target(), target({ instanceId: "uhd", status: "downloading" })],
    });
    expect(
      matchesFilter(
        item,
        all([{ field: "type", operator: "is", values: ["movie"] }]),
        now,
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        item,
        all([{ field: "type", operator: "isNot", values: ["movie"] }]),
        now,
      ),
    ).toBe(false);
    expect(
      matchesFilter(
        item,
        all([{ field: "target", operator: "includes", values: ["uhd"] }]),
        now,
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        item,
        all([{ field: "target", operator: "excludes", values: ["uhd"] }]),
        now,
      ),
    ).toBe(false);
    expect(
      matchesFilter(
        item,
        all([
          { field: "targetStatus", operator: "is", values: ["downloading"] },
        ]),
        now,
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        item,
        all([{ field: "genre", operator: "includes", values: ["adventure"] }]),
        now,
      ),
    ).toBe(true);
  });

  it("compares numbers, sizes, text and dates", () => {
    const item = movie();
    expect(
      matchesFilter(
        item,
        all([{ field: "year", operator: "greaterThan", values: ["2020"] }]),
        now,
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        item,
        all([{ field: "size", operator: "lessThan", values: ["5"] }]),
        now,
      ),
    ).toBe(false);
    expect(
      matchesFilter(
        item,
        all([
          { field: "fileQuality", operator: "contains", values: ["bluray"] },
        ]),
        now,
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        item,
        all([{ field: "added", operator: "inLast", values: ["7"] }]),
        now,
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        item,
        all([{ field: "added", operator: "notInLast", values: ["7"] }]),
        now,
      ),
    ).toBe(false);
    expect(
      matchesFilter(
        item,
        all([{ field: "rating", operator: "greaterThan", values: [""] }]),
        now,
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        movie({ rating: undefined }),
        all([{ field: "rating", operator: "greaterThan", values: ["5"] }]),
        now,
      ),
    ).toBe(false);
  });

  it("measures episode progress for shows only", () => {
    const show = movie({
      kind: "series",
      targets: [target({ episodeCount: 10, episodeFileCount: 5 })],
    });
    expect(
      matchesFilter(
        show,
        all([
          { field: "episodeProgress", operator: "lessThan", values: ["60"] },
        ]),
        now,
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        movie(),
        all([
          { field: "episodeProgress", operator: "lessThan", values: ["60"] },
        ]),
        now,
      ),
    ).toBe(false);
  });

  it("combines rules with all or any and nests groups", () => {
    const item = movie({ year: 1999 });
    const rules: FilterDefinition["rules"] = [
      { field: "type", operator: "is", values: ["movie"] },
      { field: "year", operator: "greaterThan", values: ["2000"] },
    ];
    expect(matchesFilter(item, { match: "all", rules }, now)).toBe(false);
    expect(matchesFilter(item, { match: "any", rules }, now)).toBe(true);
    expect(
      matchesFilter(
        item,
        {
          match: "all",
          rules: [rules[0]],
          groups: [
            {
              match: "any",
              rules: [
                rules[1],
                { field: "monitored", operator: "is", values: ["true"] },
              ],
            },
          ],
        },
        now,
      ),
    ).toBe(true);
    expect(matchesFilter(item, { match: "all", rules: [] }, now)).toBe(true);
  });

  it("ships presets that evaluate", () => {
    for (const preset of presetFilters)
      expect(typeof matchesFilter(movie(), preset.definition, now)).toBe(
        "boolean",
      );
    expect(
      matchesFilter(
        movie({ targets: [target({ monitored: false })] }),
        presetFilters.find((preset) => preset.id === "preset-unmonitored")
          ?.definition ?? { match: "any", rules: [] },
        now,
      ),
    ).toBe(true);
  });
});

describe("customFilterSchema", () => {
  it("accepts saved filters and rejects preset IDs or unknown fields", () => {
    const filter = {
      id: "filter-4k",
      name: " 4K not grabbed ",
      match: "all" as const,
      rules: [
        {
          field: "target" as const,
          operator: "includes" as const,
          values: ["uhd"],
        },
      ],
    };
    expect(customFilterSchema.parse(filter)).toEqual({
      ...filter,
      name: "4K not grabbed",
      groups: [],
    });
    expect(
      customFilterSchema.safeParse({ ...filter, id: "preset-x" }).success,
    ).toBe(false);
    expect(
      customFilterSchema.safeParse({
        ...filter,
        rules: [{ field: "path", operator: "is", values: [] }],
      }).success,
    ).toBe(false);
    expect(customFilterSchema.safeParse({ ...filter, name: "" }).success).toBe(
      false,
    );
  });
});
