import { describe, expect, it, mock } from "bun:test";

mock.module("@/components/media-screen", () => ({ MediaScreen: () => null }));
mock.module("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
const { default: MoviePage } = await import("@/app/(library)/movies/[id]/page");
const { default: ShowPage } = await import("@/app/(library)/shows/[id]/page");

describe("media detail pages", () => {
  it.each([
    MoviePage,
    ShowPage,
  ])("rejects malformed URI encoding", async (Page) => {
    await expect(
      Page({ params: Promise.resolve({ id: "%invalid" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
