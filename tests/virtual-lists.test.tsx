import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ImageProps } from "next/image";
import { defaultViewOptions } from "@/lib/library-options";
import type { MediaItem } from "@/lib/types";

mock.module("next/image", () => ({
  // biome-ignore lint/performance/noImgElement: The Next Image test double is intentionally a native image.
  default: ({ alt }: ImageProps) => <img alt={alt} />,
}));

const { MediaList } = await import("@/components/media-card");
const { PosterGrid, posterColumns } = await import("@/components/poster-grid");

const library: MediaItem[] = Array.from({ length: 5000 }, (_, index) => ({
  id: `movie-${index}`,
  kind: "movie",
  title: `Movie ${index}`,
  year: 2000,
  overview: "",
  poster: "",
  genres: [],
  added: "2024-03-01T00:00:00Z",
  status: "available",
  targets: [],
}));

const titleLinks = () =>
  screen
    .getAllByRole("link")
    .filter((link) => link.textContent?.startsWith("Movie "));

async function scrollTo(top: number) {
  await act(async () => {
    window.scrollY = top;
    fireEvent.scroll(window);
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
}

afterEach(async () => {
  cleanup();
  await scrollTo(0);
});

describe("MediaList", () => {
  it("renders only the rows near the viewport of a large library", async () => {
    render(<MediaList items={library} />);
    const links = titleLinks();
    expect(links.length).toBeGreaterThan(10);
    expect(links.length).toBeLessThan(100);
    expect(screen.getByRole("link", { name: /^Movie 0$/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /^Movie 3000$/ })).toBeNull();

    await scrollTo(3000 * 36);
    expect(screen.getByRole("link", { name: /^Movie 3000$/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /^Movie 0$/ })).toBeNull();
    expect(titleLinks().length).toBeLessThan(100);
  });

  it("stripes rows by their position in the whole list", () => {
    render(<MediaList items={library.slice(0, 3)} />);
    const rows = document.querySelectorAll("[data-index]");
    expect([...rows].map((row) => row.hasAttribute("data-stripe"))).toEqual([
      false,
      true,
      false,
    ]);
    expect(rows[2].hasAttribute("data-last")).toBe(true);
  });
});

describe("PosterGrid", () => {
  it("renders only the poster rows near the viewport", async () => {
    render(<PosterGrid items={library} options={defaultViewOptions} />);
    const cards = () => screen.getAllByRole("link", { name: /^View Movie / });
    expect(cards().length).toBeGreaterThan(2);
    expect(cards().length).toBeLessThan(100);
    expect(screen.getByRole("link", { name: "View Movie 0" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View Movie 4000" })).toBeNull();

    // Without layout the grid falls back to two columns of estimated rows.
    const row = 2000;
    await scrollTo(row * (160 * 1.5 + 84 + 28));
    expect(
      screen.getByRole("link", { name: `View Movie ${row * 2}` }),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "View Movie 0" })).toBeNull();
  });

  it.each([
    [1200, 20, 148, 7],
    [1200, 20, 240, 4],
    [360, 15, 148, 2],
    [240, 15, 240, 2],
    [0, 20, 148, 2],
  ])("fits %ipx with %ipx gaps and %ipx posters into %i columns", (width, gap, minimum, columns) => {
    expect(posterColumns(width, gap, minimum)).toBe(columns);
  });
});
