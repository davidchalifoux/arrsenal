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
import type { MediaItem, MediaTarget } from "@/lib/types";

const target = (overrides: Partial<MediaTarget> = {}): MediaTarget => ({
  instanceId: "hd",
  instanceName: "Movies HD",
  remoteId: 1,
  qualityProfileId: 1,
  qualityProfile: "HD-1080p",
  quality: "",
  status: "missing",
  monitored: true,
  sizeOnDisk: 0,
  ...overrides,
});
const item = (overrides: Partial<MediaItem>): MediaItem => ({
  id: "movie:tmdb:1",
  kind: "movie",
  title: "Dune",
  year: 2021,
  overview: "",
  poster: "",
  genres: [],
  added: "2026-01-01",
  status: "missing",
  targets: [target()],
  ...overrides,
});

const state = {
  items: [] as MediaItem[],
  notify: mock(),
};
const originalClient = { ...(await import("@/lib/client")) };
mock.module("@/lib/client", () => ({ ...originalClient, api: mock() }));
mock.module("@/lib/client-data", () => ({
  useLibrary: () => ({
    data: { items: state.items, errors: [] },
    isPending: false,
    isFetching: false,
  }),
  useInstances: () => ({ data: { instances: [] } }),
  useSyncData: () => mock(),
}));
mock.module("@/components/library-provider", () => ({
  useLibraryActions: () => ({ notify: state.notify, refresh: mock() }),
  useOptionalLibraryActions: () => null,
}));
const { Wanted, wantedRows } = await import("@/components/wanted");
const { api } = await import("@/lib/client");
const apiMock = api as Mock<
  (...args: Parameters<typeof api>) => ReturnType<typeof api>
>;

beforeEach(() => {
  apiMock.mockReset();
  state.notify.mockReset();
  state.items = [
    item({}),
    item({
      id: "series:tvdb:2",
      kind: "series",
      title: "Severance",
      status: "partial",
      targets: [
        target({
          instanceId: "tv",
          instanceName: "Shows HD",
          remoteId: 5,
          status: "partial",
          episodeCount: 19,
          episodeFileCount: 17,
        }),
        target({ instanceId: "tv4k", status: "available" }),
      ],
    }),
    item({
      id: "movie:tmdb:3",
      title: "Unmonitored",
      targets: [target({ monitored: false })],
    }),
  ];
});
afterEach(cleanup);

describe("wantedRows", () => {
  it("lists monitored missing or partial targets with what is missing", () => {
    expect(
      wantedRows(state.items).map((row) => [
        row.media.title,
        row.target.instanceName,
        row.missing,
      ]),
    ).toEqual([
      ["Dune", "Movies HD", "Movie file"],
      ["Severance", "Shows HD", "2 episodes"],
    ]);
  });
});

describe("Wanted", () => {
  it("filters by kind and searches one row", async () => {
    apiMock.mockResolvedValue({ success: true, message: "ok" });
    render(<Wanted />);
    expect(screen.getByRole("heading", { name: "Wanted" })).toBeTruthy();
    expect(screen.queryByText("Unmonitored")).toBeNull();
    // One missing movie reads as singular in the footer.
    expect(screen.getByText("1 movie")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Shows/ }));
    expect(
      screen.queryByRole("listitem", { name: "Dune on Movies HD" }),
    ).toBeNull();
    const row = screen.getByRole("listitem", { name: "Severance on Shows HD" });
    fireEvent.click(
      within(row).getByRole("button", {
        name: "Search Shows HD for Severance",
      }),
    );
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(apiMock.mock.calls[0][1]?.body))).toEqual({
      instanceId: "tv",
      remoteId: 5,
      kind: "series",
    });
    await waitFor(() =>
      expect(state.notify).toHaveBeenCalledWith(
        "Searching Shows HD for Severance.",
      ),
    );
  });

  it("searches selected rows and reports failures", async () => {
    apiMock
      .mockResolvedValueOnce({ success: true, message: "ok" })
      .mockResolvedValueOnce({ success: false, message: "Offline" });
    render(<Wanted />);
    expect(
      screen
        .getByRole("button", { name: "Search 0 selected" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all wanted items" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Search 2 selected" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Severance (Shows HD): Offline",
    );
    expect(state.notify).not.toHaveBeenCalled();
  });

  it("opens a manual search beside the automatic one", async () => {
    apiMock.mockResolvedValue({ items: [] });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Wanted />
      </QueryClientProvider>,
    );
    const row = screen.getByRole("listitem", { name: "Dune on Movies HD" });
    fireEvent.click(
      within(row).getByRole("button", {
        name: "Manual search Movies HD for Dune",
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Manual search" }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(String(apiMock.mock.calls[0][0])).toBe(
        "/api/releases?instanceId=hd&remoteId=1&kind=movie",
      ),
    );
  });

  it("selects every row between two clicks when shift is held", () => {
    state.items = ["A", "B", "C", "D", "E"].map((title, index) =>
      item({ id: `movie:tmdb:${index}`, title }),
    );
    render(<Wanted />);
    const box = (title: string) =>
      screen.getByRole("checkbox", { name: `Select ${title} on Movies HD` });
    const checked = () =>
      ["A", "B", "C", "D", "E"].filter(
        (title) => (box(title) as HTMLInputElement).checked,
      );
    fireEvent.click(box("B"));
    fireEvent.click(box("E"), { shiftKey: true });
    expect(checked()).toEqual(["B", "C", "D", "E"]);
    // Overshooting and shift-clicking a closer row shrinks the range...
    fireEvent.click(box("C"), { shiftKey: true });
    expect(checked()).toEqual(["B", "C"]);
    // ...and it can flip to the other side of the anchor.
    fireEvent.click(box("A"), { shiftKey: true });
    expect(checked()).toEqual(["A", "B"]);
    // Shift-clicking from a cleared anchor clears the range instead.
    fireEvent.click(box("E"));
    fireEvent.click(box("E"));
    fireEvent.click(box("A"), { shiftKey: true });
    expect(checked()).toEqual([]);
  });
});
