import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";

import type { InstanceSummary, MediaItem } from "@/lib/types";

mock.module("@/components/media-card", () => ({
  Poster: () => null,
}));
// Load after installing the poster mock so the real media-card module stays isolated.
const { AddMedia } = await import("@/components/add-media");

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
});

it("preserves catalog targets before the library refreshes", () => {
  const radarr: InstanceSummary = {
    id: "radarr",
    name: "Movies",
    kind: "radarr",
    url: "http://radarr.invalid",
    hasApiKey: true,
    connected: true,
  };
  const item: MediaItem = {
    id: "movie-1",
    kind: "movie",
    title: "Dune",
    year: 2021,
    overview: "",
    poster: "",
    genres: [],
    added: "",
    status: "available",
    targets: [
      {
        instanceId: radarr.id,
        instanceName: radarr.name,
        remoteId: 1,
        qualityProfileId: 1,
        qualityProfile: "HD",
        quality: "1080p",
        status: "available",
        monitored: true,
        sizeOnDisk: 0,
      },
    ],
  };
  render(
    <QueryClientProvider client={client}>
      <AddMedia
        open
        seed={item}
        instances={[radarr]}
        library={[]}
        onClose={mock()}
        onAdded={mock()}
        notify={mock()}
        onConnect={mock()}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText("Already added")).toBeDefined();
  expect(screen.queryByRole("checkbox", { name: radarr.name })).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Add to targets" })
      .hasAttribute("disabled"),
  ).toBe(true);
});
