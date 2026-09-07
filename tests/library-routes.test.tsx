import { describe, expect, it, vi } from "vitest";
import DiscoverPage from "@/app/(library)/discover/page";
import MissingPage from "@/app/(library)/missing/page";
import LibraryPage from "@/app/(library)/page";

vi.mock("@/components/library-browser", () => ({ LibraryBrowser: () => null }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

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
