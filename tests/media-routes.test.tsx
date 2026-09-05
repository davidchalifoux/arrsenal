import { describe, expect, it, vi } from "vitest";
import MoviePage from "@/app/(workspace)/movies/[id]/page";
import ShowPage from "@/app/(workspace)/shows/[id]/page";

vi.mock("@/components/media-screen", () => ({ MediaScreen: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

describe("media detail pages", () => {
  it.each([
    [MoviePage, "693134-dune-part-two", "movie:tmdb:693134", "movie"],
    [ShowPage, "81189-breaking-bad", "series:tvdb:81189", "series"],
    [MoviePage, "movie%3Atmdb%3A693134", "movie:tmdb:693134", "movie"],
    [ShowPage, "series:tvdb:81189", "series:tvdb:81189", "series"],
    [ShowPage, "series%3Ainstance-a%3A11", "series:instance-a:11", "series"],
    [ShowPage, "81189-previous-title", "series:tvdb:81189", "series"],
  ] as const)("resolves %s route %s to its library identity", async (Page, id, mediaId, kind) => {
    const page = await Page({ params: Promise.resolve({ id }) });
    expect(page.props).toEqual({ mediaId, kind });
  });

  it.each([
    MoviePage,
    ShowPage,
  ])("rejects malformed URI encoding", async (Page) => {
    await expect(
      Page({ params: Promise.resolve({ id: "%invalid" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
