import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AddMedia } from "@/components/add-media";
import { api } from "@/lib/client";
import type { InstanceSummary, MediaItem } from "@/lib/types";

const connect = vi.fn();
vi.mock("@/lib/client", () => ({ api: vi.fn() }));
vi.mock("@/components/media-card", () => ({
  Poster: () => null,
}));

const sonarr: InstanceSummary = {
  id: "sonarr",
  name: "Shows",
  kind: "sonarr",
  url: "http://sonarr.invalid",
  hasApiKey: true,
  connected: true,
};
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(api).mockResolvedValue({ instances: [sonarr] });
});
afterEach(() => {
  cleanup();
  client.clear();
});

function renderUI(element: ReactElement) {
  return render(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>,
  );
}

it("seeds AddMedia search, guides movie connection, and clears with input focus", () => {
  renderUI(
    <AddMedia
      open
      seed={null}
      initialTerm="Dune"
      instances={[sonarr]}
      library={[]}
      onClose={vi.fn()}
      onAdded={vi.fn()}
      notify={vi.fn()}
      onConnect={connect}
    />,
  );
  const input = screen.getByRole<HTMLInputElement>("textbox", {
    name: "Search movies and shows",
  });
  expect(input.value).toBe("Dune");
  fireEvent.click(screen.getByRole("button", { name: "Connect Radarr" }));
  expect(connect).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(input.value).toBe("");
  expect(document.activeElement).toBe(input);
  expect(api).not.toHaveBeenCalled();
});

it("starts in Shows when opened from the Shows section", async () => {
  vi.mocked(api).mockResolvedValue({ items: [], errors: [] });
  renderUI(
    <AddMedia
      open
      seed={null}
      initialKind="series"
      initialTerm="Severance"
      instances={[sonarr]}
      library={[]}
      onClose={vi.fn()}
      onAdded={vi.fn()}
      notify={vi.fn()}
      onConnect={connect}
    />,
  );
  expect(screen.queryByRole("button", { name: "Connect Radarr" })).toBeNull();
  await screen.findByText(/No matches found/);
  expect(
    vi.mocked(api).mock.calls.some(([url]) => url.includes("kind=series")),
  ).toBe(true);
});

it("preserves catalog targets in AddMedia and hides stale results when the query changes", async () => {
  const radarr: InstanceSummary = {
    ...sonarr,
    id: "radarr",
    name: "Movies",
    kind: "radarr",
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
  vi.mocked(api).mockResolvedValue({ items: [item], errors: [] });
  renderUI(
    <AddMedia
      open
      seed={null}
      instances={[radarr]}
      library={[]}
      onClose={vi.fn()}
      onAdded={vi.fn()}
      notify={vi.fn()}
      onConnect={connect}
    />,
  );
  expect(screen.getByText(/Enter at least 2 characters/)).toBeDefined();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Dune" } });
  fireEvent.click(await screen.findByRole("button", { name: /Dune.*2021/ }));
  expect(screen.getByText("Already added")).toBeDefined();
  expect(screen.queryByRole("checkbox", { name: radarr.name })).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Add to targets" })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Back to results" }));
  expect(screen.getByRole("button", { name: /Dune.*2021/ })).toBeDefined();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Alien" } });
  expect(screen.queryByRole("button", { name: /Dune.*2021/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByText(/Enter at least 2 characters/)).toBeDefined();
  expect(document.activeElement).toBe(screen.getByRole("textbox"));
});
