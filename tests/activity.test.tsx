import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  mock,
} from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import type {
  ActionResponse,
  BlocklistItem,
  BlocklistResponse,
  HistoryItem,
  HistoryResponse,
} from "@/lib/types";

const originalClient = { ...(await import("@/lib/client")) };
mock.module("@/lib/client", () => ({ ...originalClient, api: mock() }));
const { HistoryView } = await import("@/components/history");
const { BlocklistView } = await import("@/components/blocklist");
const { relativeTime } = await import("@/lib/relative-time");
const { api } = await import("@/lib/client");
const apiMock = api as Mock<
  (...args: Parameters<typeof api>) => ReturnType<typeof api>
>;

const ok: ActionResponse = { success: true, message: "Done.", outcomes: [] };

function renderWithClient(view: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{view}</QueryClientProvider>,
  );
}

const grab: HistoryItem = {
  id: 1,
  instanceId: "sonarr",
  instanceName: "Sonarr HD",
  kind: "series",
  event: "grabbed",
  sourceTitle: "Shogun.S01E01.1080p.WEB-DL",
  mediaTitle: "Shogun",
  mediaId: "series:tvdb:392573",
  episode: "S01E01 · Anjin",
  quality: "WEBDL-1080p",
  date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  detail: "Nzb → SABnzbd",
};
const imported: HistoryItem = {
  ...grab,
  id: 2,
  instanceId: "radarr",
  instanceName: "Radarr HD",
  kind: "movie",
  event: "imported",
  sourceTitle: "Dune.2021.2160p",
  mediaTitle: "Dune",
  mediaId: undefined,
  episode: undefined,
  detail: "/movies/Dune (2021)/Dune.mkv",
};

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation(async (path) =>
    path === "/api/preferences" ? { timeZone: null } : ok,
  );
});
afterEach(cleanup);

describe("relativeTime", () => {
  it("describes recent past timestamps", () => {
    const now = Date.parse("2026-09-28T12:00:00Z");
    expect(relativeTime("2026-09-28T11:59:30Z", now)).toBe("just now");
    expect(relativeTime("2026-09-28T09:00:00Z", now)).toBe("3 hours ago");
    expect(relativeTime("2026-09-27T12:00:00Z", now)).toBe("yesterday");
    expect(relativeTime("not a date", now)).toBe("");
  });
});

describe("HistoryView", () => {
  function renderHistory(
    data: HistoryResponse = {
      items: [grab, imported],
      errors: [],
      hasMore: false,
    },
  ) {
    const props = {
      onEvent: mock(),
      onLoadMore: mock(),
      onRefresh: mock(),
      onChanged: mock(),
      notify: mock(),
    };
    renderWithClient(
      <HistoryView data={data} loading={false} event="all" {...props} />,
    );
    return props;
  }

  it("shows events with links, episodes, and details", () => {
    renderHistory();
    const row = screen.getByRole("row", { name: "Shogun grabbed" });
    expect(
      within(row).getByRole("link", { name: "Shogun" }).getAttribute("href"),
    ).toBe("/shows/392573-shogun");
    expect(within(row).getByText(/S01E01 · Anjin/)).toBeTruthy();
    expect(within(row).getByText("2 hours ago")).toBeTruthy();
    expect(within(row).getByText("Sonarr HD · Nzb → SABnzbd")).toBeTruthy();
    // Unmatched media stays plain text; only grabs can be marked failed.
    const movie = screen.getByRole("row", { name: "Dune imported" });
    expect(within(movie).queryByRole("link")).toBeNull();
    expect(
      within(movie).queryByRole("button", { name: /as failed/ }),
    ).toBeNull();
  });

  it("filters by search and event, and asks for older events", () => {
    const props = renderHistory({
      items: [grab, imported],
      errors: [],
      hasMore: true,
    });
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "dune 2160p" },
    });
    expect(screen.queryByRole("row", { name: "Shogun grabbed" })).toBeNull();
    expect(screen.getByRole("row", { name: "Dune imported" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Failed" }));
    expect(props.onEvent).toHaveBeenCalledWith("failed");
    fireEvent.click(screen.getByRole("button", { name: "Load older events" }));
    expect(props.onLoadMore).toHaveBeenCalled();
  });

  it("confirms before marking a grab as failed", async () => {
    const props = renderHistory();
    fireEvent.click(
      screen.getByRole("button", { name: "Mark Shogun as failed" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Shogun.S01E01.1080p.WEB-DL")).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Mark as failed" }),
    );
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    const call = apiMock.mock.calls.find(([path]) => path === "/api/history");
    expect(call?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      instanceId: "sonarr",
      id: 1,
    });
    expect(props.notify).toHaveBeenCalledWith("Done.");
  });

  it("reports unavailable instances and an empty filter", () => {
    renderHistory({
      items: [],
      errors: [
        { instanceId: "x", instanceName: "Sonarr 4K", message: "Timed out." },
      ],
      hasMore: false,
    });
    expect(screen.getByText("Sonarr 4K is unavailable.")).toBeTruthy();
    expect(screen.getByText("No history could be loaded")).toBeTruthy();
  });
});

describe("BlocklistView", () => {
  const entry: BlocklistItem = {
    id: 4,
    instanceId: "sonarr",
    instanceName: "Sonarr HD",
    kind: "series",
    sourceTitle: "Shogun.S01.1080p",
    mediaTitle: "Shogun",
    mediaId: "series:tvdb:392573",
    quality: "WEBDL-1080p",
    date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    protocol: "usenet",
    indexer: "DrunkenSlug",
    message: "Manually marked as failed",
  };
  const other: BlocklistItem = {
    ...entry,
    id: 7,
    instanceId: "radarr",
    instanceName: "Radarr HD",
    kind: "movie",
    mediaTitle: "Dune",
    mediaId: "movie:tmdb:438631",
    indexer: undefined,
    protocol: "torrent",
  };

  function renderBlocklist(
    data: BlocklistResponse = {
      items: [entry, other],
      errors: [],
      truncated: false,
    },
  ) {
    const props = { onRefresh: mock(), onChanged: mock(), notify: mock() };
    renderWithClient(<BlocklistView data={data} loading={false} {...props} />);
    return props;
  }

  it("lists entries with their reason", () => {
    renderBlocklist();
    const row = screen.getByRole("row", { name: "Shogun blocklist entry" });
    expect(
      within(row)
        .getByText("Sonarr HD · DrunkenSlug · Manually marked as failed")
        .getAttribute("title"),
    ).toBe("Manually marked as failed");
    // Without an indexer, the protocol stands in.
    expect(
      screen.getByText("Radarr HD · Torrent · Manually marked as failed"),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("row", { name: "Dune blocklist entry" }))
        .getByRole("link", { name: "Dune" })
        .getAttribute("href"),
    ).toBe("/movies/438631-dune");
  });

  it("removes selected entries together after confirming", async () => {
    const props = renderBlocklist();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all entries" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove 2 selected" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Remove 2 entries?")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled());
    const call = apiMock.mock.calls.find(([path]) => path === "/api/blocklist");
    expect(call?.[1]?.method).toBe("DELETE");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      items: [
        { instanceId: "sonarr", id: 4 },
        { instanceId: "radarr", id: 7 },
      ],
    });
  });

  it("keeps the dialog open with the error when removal fails", async () => {
    apiMock.mockImplementation(async (path) =>
      path === "/api/preferences"
        ? { timeZone: null }
        : { success: false, message: "Sonarr HD is offline.", outcomes: [] },
    );
    renderBlocklist();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Shogun from blocklist" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(
      await within(dialog).findByText("Sonarr HD is offline."),
    ).toBeTruthy();
  });

  it("notes when an instance has more entries than were read", () => {
    renderBlocklist({ items: [entry], errors: [], truncated: true });
    expect(screen.getByText(/newest 1,000 entries per instance/)).toBeTruthy();
  });
});
