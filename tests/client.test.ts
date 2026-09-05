// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, qualityLabel, sizeLabel } from "@/lib/client";
import { addMediaSchema } from "@/lib/server/schemas";
import type { ActionResponse } from "@/lib/types";

vi.mock("server-only", () => ({}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("sizeLabel", () => {
  it.each([
    [0, "0 B"],
    [-1, "0 B"],
    [Number.NaN, "0 B"],
    [Number.POSITIVE_INFINITY, "0 B"],
    [Number.NEGATIVE_INFINITY, "0 B"],
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
    ["Ultra-HD", "WEBDL-1080p", "1080p"],
    ["HD-1080p", "Bluray-2160p", "4K"],
    ["HD-1080p", "HDTV-720p", "720p"],
    ["Ultra-HD", "Not downloaded", "4K"],
    ["HD-1080p", "Unknown", "1080p"],
    ["Full HD", "", "1080p"],
    ["Any", "", "Any"],
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

  it("forwards the request body, signal, and custom headers with JSON content type", async () => {
    fetchMock.mockResolvedValue(Response.json({ success: true }));
    const controller = new AbortController();
    const body = JSON.stringify({ search: false });
    await expect(
      api("/api/media", {
        method: "POST",
        body,
        signal: controller.signal,
        headers: { "X-Request-ID": "test-add" },
      }),
    ).resolves.toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/media", {
      method: "POST",
      body,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": "test-add",
      },
    });
  });
});
