import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { Release } from "@/lib/types";

const {
  ageLabel,
  bestMatch,
  nextReleaseSort,
  ReleaseTable,
  releaseColumns,
  sortReleases,
} = await import("@/components/release-table");
const { visibleColumns } = await import("@/components/table-options");

const release = (overrides: Partial<Release>): Release => ({
  guid: "g",
  indexerId: 1,
  title: "Release",
  quality: "WEBDL-1080p",
  qualityWeight: 10,
  size: 1000,
  age: 1,
  ageMinutes: 1440,
  protocol: "usenet",
  indexer: "NZBgeek",
  languages: ["Japanese"],
  customFormats: [],
  customFormatScore: 0,
  releaseWeight: 1,
  approved: true,
  rejections: [],
  ...overrides,
});

const a = release({
  guid: "a",
  title: "Alpha",
  releaseWeight: 3,
  protocol: "torrent",
  seeders: 49,
  leechers: 1,
  customFormatScore: 400,
  customFormats: ["Tier 01"],
  ageMinutes: 90,
});
const b = release({
  guid: "b",
  title: "bravo",
  releaseWeight: 1,
  customFormatScore: -50,
  qualityWeight: 14,
});
const c = release({
  guid: "c",
  title: "Charlie",
  releaseWeight: 2,
  protocol: "torrent",
  seeders: 3,
  leechers: 0,
  ageMinutes: 30,
});

afterEach(cleanup);

describe("sortReleases", () => {
  const titles = (items: Release[]) => items.map((item) => item.title);

  it("starts in the instance's best-match order", () => {
    expect(titles(sortReleases([a, b, c], bestMatch))).toEqual([
      "bravo",
      "Charlie",
      "Alpha",
    ]);
  });

  it("sorts by score, peers, age, quality, and title", () => {
    expect(
      titles(sortReleases([a, b, c], { key: "score", direction: "desc" })),
    ).toEqual(["Alpha", "Charlie", "bravo"]);
    // Usenet has no peers, so it sorts last either way.
    expect(
      titles(sortReleases([a, b, c], { key: "peers", direction: "desc" })),
    ).toEqual(["Alpha", "Charlie", "bravo"]);
    expect(
      titles(sortReleases([a, b, c], { key: "peers", direction: "asc" })),
    ).toEqual(["Charlie", "Alpha", "bravo"]);
    expect(
      titles(sortReleases([a, b, c], { key: "age", direction: "asc" })),
    ).toEqual(["Charlie", "Alpha", "bravo"]);
    expect(
      titles(sortReleases([a, b, c], { key: "quality", direction: "desc" })),
    ).toEqual(["bravo", "Charlie", "Alpha"]);
    expect(
      titles(sortReleases([a, b, c], { key: "title", direction: "asc" })),
    ).toEqual(["Alpha", "bravo", "Charlie"]);
  });

  it("puts the best first on a column's first click, then toggles", () => {
    expect(nextReleaseSort(bestMatch, "score")).toEqual({
      key: "score",
      direction: "desc",
    });
    expect(nextReleaseSort(bestMatch, "age")).toEqual({
      key: "age",
      direction: "asc",
    });
    expect(
      nextReleaseSort({ key: "age", direction: "asc" }, "age").direction,
    ).toBe("desc");
  });

  it("labels ages in minutes, hours, or days", () => {
    expect(ageLabel(release({ ageMinutes: 30 }))).toBe("30 min");
    expect(ageLabel(release({ ageMinutes: 90 }))).toBe("2 h");
    expect(ageLabel(release({ ageMinutes: 1440 }))).toBe("1 day");
    expect(ageLabel(release({ ageMinutes: 5000 }))).toBe("3 days");
  });
});

describe("ReleaseTable", () => {
  it("shows every column and sorts from the headers", () => {
    const onSort = mock();
    const onGrab = mock();
    render(
      <ReleaseTable
        releases={[a, b]}
        columns={visibleColumns(releaseColumns)}
        sort={bestMatch}
        onSort={onSort}
        grabbing={null}
        onGrab={onGrab}
      />,
    );
    const row = within(screen.getByRole("row", { name: "Alpha" }));
    expect(row.getByText("torrent")).toBeTruthy();
    expect(row.getByText("49 / 1")).toBeTruthy();
    expect(row.getByText("Japanese")).toBeTruthy();
    expect(row.getByText("+400").getAttribute("title")).toBe(
      "Custom formats: Tier 01",
    );
    expect(
      within(screen.getByRole("row", { name: "bravo" })).getByText("-50"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sort by score" }));
    expect(onSort).toHaveBeenCalledWith("score");
    fireEvent.click(row.getByRole("button", { name: "Grab" }));
    expect(onGrab).toHaveBeenCalledWith(a);
  });

  it("links titles to the indexer page and flags rejections", () => {
    render(
      <ReleaseTable
        releases={[
          release({
            title: "Linked",
            infoUrl: "https://nyaa.si/view/1",
            approved: false,
            rejections: ["Not wanted in profile"],
          }),
        ]}
        columns={["title"]}
        sort={bestMatch}
        onSort={mock()}
        grabbing={null}
        onGrab={mock()}
      />,
    );
    const link = screen.getByRole("link", { name: "Linked" });
    expect(link.getAttribute("href")).toBe("https://nyaa.si/view/1");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText("Not wanted in profile")).toBeTruthy();
    expect(
      screen.getByLabelText("Rejected: Not wanted in profile"),
    ).toBeTruthy();
  });
});
