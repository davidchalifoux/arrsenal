import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AddMedia } from "@/components/add-media";
import { DiscoverBrowser } from "@/components/discover-browser";
import { api } from "@/lib/client";
import type { InstanceSummary, MediaItem } from "@/lib/types";

const { connect, add } = vi.hoisted(() => ({ connect: vi.fn(), add: vi.fn() }));
vi.mock("@/lib/client", () => ({ api: vi.fn() }));
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => ({ connect, add }),
}));
vi.mock("@/components/page-header", () => ({ PageHeader: () => null }));
vi.mock("@/components/media-card", () => ({
  Poster: () => null,
  MediaCard: ({ item, onClick }: { item: MediaItem; onClick: () => void }) => (
    <button type="button" onClick={onClick}>
      {item.title}: {item.targets.length} targets
    </button>
  ),
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

it("gives Discover kind-specific connection guidance instead of making lookups", async () => {
  renderUI(<DiscoverBrowser />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Dune" } });
  fireEvent.click(
    await screen.findByRole("button", { name: "Connect Radarr" }),
  );
  expect(connect).toHaveBeenCalledOnce();
  expect(
    vi.mocked(api).mock.calls.every(([url]) => url === "/api/instances"),
  ).toBe(true);
});

it("preserves Discover targets for both the card and add handoff", async () => {
  const item = {
    id: "movie-1",
    title: "Dune",
    targets: [{ instanceId: "radarr" }],
  } as MediaItem;
  client.setQueryData(["instances"], {
    instances: [{ ...sonarr, id: "radarr", kind: "radarr" }],
  });
  vi.mocked(api).mockResolvedValue({ items: [item], errors: [] });
  renderUI(<DiscoverBrowser />);
  expect(screen.getByText(/Enter at least 2 characters/)).toBeDefined();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Dune" } });
  fireEvent.click(
    await screen.findByRole("button", { name: "Dune: 1 targets" }),
  );
  expect(add).toHaveBeenCalledWith(item);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Alien" } });
  expect(screen.queryByRole("button", { name: "Dune: 1 targets" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(screen.getByText(/Enter at least 2 characters/)).toBeDefined();
  expect(document.activeElement).toBe(screen.getByRole("textbox"));
});
