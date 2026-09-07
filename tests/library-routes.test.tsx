import { describe, expect, it, mock } from "bun:test";

mock.module("@/components/library-browser", () => ({
  LibraryBrowser: () => null,
}));
mock.module("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
const { default: DiscoverPage } = await import("@/app/(library)/discover/page");
const { default: MissingPage } = await import("@/app/(library)/missing/page");
const { default: LibraryPage } = await import("@/app/(library)/page");

describe("Library-first routes", () => {
  it("sends old Discover links into Add media", () => {
    expect(() => DiscoverPage()).toThrow("REDIRECT:/?add=1");
  });

  it("sends old Missing links to the Incomplete library filter", () => {
    expect(() => MissingPage()).toThrow("REDIRECT:/?status=incomplete");
  });

  it.each([
    "available",
    "incomplete",
    "downloading",
    "all",
  ])("opens the %s availability view under All media", async (status) => {
    const page = await LibraryPage({
      searchParams: Promise.resolve({ status }),
    });
    expect(page.props).toEqual({
      category: "library",
      initialStatus: status,
      openAdd: false,
    });
  });

  it("validates status and recognizes the Add media entry point", async () => {
    const page = await LibraryPage({
      searchParams: Promise.resolve({
        status: ["incomplete", "available"],
        add: "1",
      }),
    });
    expect(page.props).toEqual({
      category: "library",
      initialStatus: "all",
      openAdd: true,
    });
  });
});
