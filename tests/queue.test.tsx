import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  mock,
} from "bun:test";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import type { ActionResponse, QueueItem, QueueResponse } from "@/lib/types";

const originalClient = { ...(await import("@/lib/client")) };
mock.module("@/lib/client", () => ({
  ...originalClient,
  api: mock(),
}));
const { DownloadQueue } = await import("@/components/queue");
const { api } = await import("@/lib/client");

const download: QueueItem = {
  id: -42,
  instanceId: "sonarr-hd",
  instanceName: "Sonarr HD",
  mediaTitle: "Severance",
  title: "Severance.S02E01.1080p.WEB-DL",
  kind: "series",
  quality: "WEBDL-1080p",
  size: 1024 ** 3,
  sizeleft: 1024 ** 3 / 4,
  status: "downloading",
  timeleft: "00:03:10",
  downloadClient: "qBittorrent",
  downloadId: "download-one",
  warnings: [],
};

function queue(items: QueueItem[] = [download]): QueueResponse {
  return { items, errors: [] };
}

beforeEach(() =>
  (
    api as Mock<(...args: Parameters<typeof api>) => ReturnType<typeof api>>
  ).mockReset(),
);
afterEach(cleanup);

describe("DownloadQueue", () => {
  it.each([
    { size: 100, sizeleft: 150, status: "downloading", expected: "0" },
    { size: 100, sizeleft: -10, status: "downloading", expected: "100" },
    { size: 0, sizeleft: 0, status: "downloading", expected: null },
    { size: 0, sizeleft: 0, status: "completed", expected: "100" },
  ])("keeps progress finite and bounded for $status ($size / $sizeleft)", ({
    expected,
    ...fields
  }) => {
    render(
      <DownloadQueue
        data={queue([{ ...download, ...fields }])}
        loading={false}
        onRefresh={mock()}
        notify={mock()}
      />,
    );
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      expected,
    );
  });

  it("filters warnings and downloading items without changing the summary totals", () => {
    const completed = {
      ...download,
      id: 7,
      mediaTitle: "Silo",
      status: "completed",
      sizeleft: 0,
      warnings: ["Import requires manual review."],
    };
    render(
      <DownloadQueue
        data={queue([download, completed])}
        loading={false}
        onRefresh={mock()}
        notify={mock()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Warnings/ }));
    expect(
      screen.queryByRole("row", { name: "Severance download" }),
    ).toBeNull();
    expect(screen.getByRole("row", { name: "Silo download" })).toBeTruthy();
    expect(
      screen.getByLabelText("Warning details for Silo").closest("details")
        ?.open,
    ).toBe(false);
    expect(
      screen.getByRole("button", { name: /^Downloading/ }).textContent,
    ).toBe("Downloading1");
    fireEvent.click(screen.getByRole("button", { name: /^Downloading/ }));
    expect(screen.queryByRole("row", { name: "Silo download" })).toBeNull();
    expect(
      screen.getByRole("row", { name: "Severance download" }),
    ).toBeTruthy();
  });

  it("matches Sonarr's queue order by remaining time, then progress", () => {
    const waiting = {
      ...download,
      id: 1,
      mediaTitle: "Waiting",
      timeleft: undefined,
    };
    const slow = {
      ...download,
      id: 2,
      mediaTitle: "Slow",
      timeleft: "01:00:00",
    };
    const fast = {
      ...download,
      id: 3,
      mediaTitle: "Fast",
      timeleft: "00:05:00",
    };
    const lowerProgress = {
      ...download,
      id: 4,
      mediaTitle: "Lower progress",
      timeleft: "00:10:00",
      size: 100,
      sizeleft: 90,
    };
    const higherProgress = {
      ...download,
      id: 5,
      mediaTitle: "Higher progress",
      timeleft: "00:10:00",
      size: 100,
      sizeleft: 20,
    };
    render(
      <DownloadQueue
        data={queue([waiting, slow, lowerProgress, fast, higherProgress])}
        loading={false}
        onRefresh={mock()}
        notify={mock()}
      />,
    );
    expect(
      screen
        .getAllByRole("row", { name: / download$/ })
        .map((item) => item.getAttribute("aria-label")),
    ).toEqual([
      "Fast download",
      "Higher progress download",
      "Lower progress download",
      "Slow download",
      "Waiting download",
    ]);
  });

  it("distinguishes loading, missing responses, all-service failure, and a truly empty queue", () => {
    const props = { onRefresh: mock(), notify: mock() };
    const { rerender } = render(
      <DownloadQueue {...props} data={undefined} loading />,
    );
    expect(screen.getByText("Loading downloads...")).toBeTruthy();
    expect(screen.queryByText("Nothing in the queue")).toBeNull();
    rerender(<DownloadQueue {...props} data={undefined} loading={false} />);
    expect(screen.getByRole("alert").textContent).toContain(
      "queue is unavailable",
    );
    rerender(
      <DownloadQueue
        {...props}
        data={{
          items: [],
          errors: [
            {
              instanceId: "sonarr-hd",
              instanceName: "Sonarr HD",
              message: "Timed out.",
            },
          ],
        }}
        loading={false}
      />,
    );
    expect(screen.getByText("No downloads could be loaded")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Timed out");
    expect(screen.queryByText("Nothing in the queue")).toBeNull();
    rerender(<DownloadQueue {...props} data={queue([])} loading={false} />);
    expect(screen.getByText("Nothing in the queue")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(props.onRefresh).toHaveBeenCalledTimes(1);
  });

  it("filters by instance through the shared select and recovers when that instance disappears", async () => {
    const other = {
      ...download,
      instanceId: "radarr",
      instanceName: "Radarr 4K",
      mediaTitle: "Dune",
      kind: "movie" as const,
    };
    const props = { onRefresh: mock(), notify: mock(), loading: false };
    const { rerender } = render(
      <DownloadQueue {...props} data={queue([download, other])} />,
    );
    fireEvent.click(
      screen.getByRole("combobox", { name: "Filter by instance" }),
    );
    const option = await screen.findByRole("option", { name: "Radarr 4K" });
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    expect(
      screen.queryByRole("row", { name: "Severance download" }),
    ).toBeNull();
    expect(screen.getByRole("row", { name: "Dune download" })).toBeTruthy();
    rerender(<DownloadQueue {...props} data={queue()} />);
    expect(
      screen.getByRole("row", { name: "Severance download" }),
    ).toBeTruthy();
  });

  it("keeps available downloads visible alongside partial-service errors", () => {
    render(
      <DownloadQueue
        data={{
          ...queue(),
          errors: [
            {
              instanceId: "radarr",
              instanceName: "Radarr",
              message: "Connection refused.",
            },
          ],
        }}
        loading={false}
        onRefresh={mock()}
        notify={mock()}
      />,
    );
    expect(
      screen.getByRole("row", { name: "Severance download" }),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("may be missing");
  });

  it("confirms real removal, sends both boolean flags, and blocks duplicate submissions", async () => {
    const pending = Promise.withResolvers<ActionResponse>();
    (
      api as Mock<(...args: Parameters<typeof api>) => ReturnType<typeof api>>
    ).mockReturnValue(pending.promise);
    const onRefresh = mock();
    const notify = mock();
    render(
      <DownloadQueue
        data={queue()}
        loading={false}
        onRefresh={onRefresh}
        notify={notify}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Severance from queue" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(api).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: "Remove from download client",
      }),
    );
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "Blocklist this release" }),
    );
    expect(
      within(dialog).getByText(/job stays in your download client/),
    ).toBeTruthy();
    expect(within(dialog).getByText(/download a replacement/)).toBeTruthy();
    const remove = within(dialog).getByRole("button", {
      name: "Remove download",
    });
    fireEvent.click(remove);
    fireEvent.click(remove);
    expect(api).toHaveBeenCalledTimes(1);
    const [path, init] = (
      api as Mock<(...args: Parameters<typeof api>) => ReturnType<typeof api>>
    ).mock.calls[0];
    expect(path).toBe("/api/queue");
    expect(init?.method).toBe("DELETE");
    expect(JSON.parse(String(init?.body))).toEqual({
      instanceId: "sonarr-hd",
      id: -42,
      removeFromClient: false,
      blocklist: true,
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Close dialog" }),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () =>
      pending.resolve({ success: true, message: "Queue item removed." }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onRefresh).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("Queue item removed.");
  });

  it("treats success:false as failure, preserves the confirmation, and leaves reconciliation to the server after uncertainty", async () => {
    (
      api as Mock<(...args: Parameters<typeof api>) => ReturnType<typeof api>>
    ).mockResolvedValue({
      success: false,
      message: "Removal was not confirmed.",
      errors: [
        {
          instanceId: "sonarr-hd",
          instanceName: "Sonarr HD",
          message: "The request timed out. Refresh before retrying.",
        },
      ],
    });
    const onRefresh = mock();
    const notify = mock();
    render(
      <DownloadQueue
        data={queue()}
        loading={false}
        onRefresh={onRefresh}
        notify={notify}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Severance from queue" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Remove download",
      }),
    );
    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "Removal was not confirmed.",
    );
    expect(within(dialog).getByRole("alert").textContent).toContain(
      "Sonarr HD: The request timed out.",
    );
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("not confirmed"),
      true,
    );
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("only offers import retry and delayed-release grab when the DTO supports them", () => {
    const entries = [
      download,
      { ...download, id: 2, mediaTitle: "Complete", status: "completed" },
      {
        ...download,
        id: 3,
        mediaTitle: "No ID",
        status: "completed",
        downloadId: undefined,
      },
      {
        ...download,
        id: 4,
        mediaTitle: "Delayed",
        status: "delay",
        downloadId: undefined,
      },
      { ...download, id: 5, mediaTitle: "Already grabbed", status: "delay" },
      {
        ...download,
        id: 6,
        mediaTitle: "Unavailable",
        status: "downloadClientUnavailable",
        downloadId: undefined,
      },
      {
        ...download,
        id: 7,
        mediaTitle: "Unsupported pending",
        status: "pending",
        downloadId: undefined,
      },
    ];
    render(
      <DownloadQueue
        data={queue(entries)}
        loading={false}
        onRefresh={mock()}
        notify={mock()}
      />,
    );
    expect(
      screen.getAllByRole("button", { name: "Retry import" }),
    ).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Grab now" })).toHaveLength(2);
    expect(screen.getByText(/No download ID was reported/)).toBeTruthy();
    expect(
      within(
        screen.getByRole("row", { name: "Already grabbed download" }),
      ).queryByRole("button", { name: "Grab now" }),
    ).toBeNull();
  });

  it.each([
    "completed",
    "delay",
  ])("requests the supported %s action without claiming completion", async (status) => {
    const item = {
      ...download,
      status,
      downloadId: status === "delay" ? undefined : "download-one",
    };
    (
      api as Mock<(...args: Parameters<typeof api>) => ReturnType<typeof api>>
    ).mockResolvedValue({
      success: true,
      message:
        "Queue action accepted. Import may still need manual intervention.",
    });
    const onRefresh = mock();
    const notify = mock();
    render(
      <DownloadQueue
        data={queue([item])}
        loading={false}
        onRefresh={onRefresh}
        notify={notify}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: status === "completed" ? "Retry import" : "Grab now",
      }),
    );
    await waitFor(() => expect(notify).toHaveBeenCalled());
    expect(onRefresh).not.toHaveBeenCalled();
    expect(api).toHaveBeenCalledWith("/api/queue", {
      method: "POST",
      body: JSON.stringify({ instanceId: "sonarr-hd", id: -42 }),
    });
    expect(notify).toHaveBeenCalledWith(
      "Queue action accepted. Import may still need manual intervention.",
    );
  });

  it("blocks stale removal when the queue item disappears", async () => {
    const props = { onRefresh: mock(), notify: mock(), loading: false };
    const { rerender } = render(<DownloadQueue {...props} data={queue()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Severance from queue" }),
    );
    await screen.findByRole("dialog");
    rerender(
      <DownloadQueue
        {...props}
        data={queue([{ ...download, instanceId: "other" }])}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove download" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "queue has changed",
    );
    expect(api).not.toHaveBeenCalled();
    expect(props.onRefresh).not.toHaveBeenCalled();
  });

  it("selects rows and removes them together with the chosen options", async () => {
    const apiMock = api as Mock<
      (...args: Parameters<typeof api>) => ReturnType<typeof api>
    >;
    apiMock.mockResolvedValue({ success: true, message: "Removed." });
    const notify = mock();
    const silo = { ...download, id: 7, mediaTitle: "Silo" };
    render(
      <DownloadQueue
        data={queue([download, silo])}
        loading={false}
        onRefresh={mock()}
        notify={notify}
      />,
    );
    expect(screen.queryByRole("button", { name: /selected$/ })).toBeNull();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all downloads" }),
    );
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove 2 selected" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Remove 2 downloads?")).toBeTruthy();
    expect(within(dialog).getByText("Silo")).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole("checkbox", { name: "Blocklist this release" }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Remove 2 downloads" }),
    );
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
    expect(
      apiMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body))),
    ).toEqual([
      {
        instanceId: "sonarr-hd",
        id: -42,
        removeFromClient: true,
        blocklist: true,
      },
      {
        instanceId: "sonarr-hd",
        id: 7,
        removeFromClient: true,
        blocklist: true,
      },
    ]);
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith("Removal accepted for 2 downloads."),
    );
    expect(screen.queryByText("2 selected")).toBeNull();
  });

  it("grabs only the selected downloads that can be grabbed or imported", async () => {
    const apiMock = api as Mock<
      (...args: Parameters<typeof api>) => ReturnType<typeof api>
    >;
    apiMock.mockResolvedValue({ success: true, message: "Grabbed." });
    const delayed = {
      ...download,
      id: 9,
      mediaTitle: "Delayed",
      status: "delay",
      downloadId: undefined,
    };
    render(
      <DownloadQueue
        data={queue([download, delayed])}
        loading={false}
        onRefresh={mock()}
        notify={mock()}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Severance" }));
    expect(
      screen
        .getByRole("button", { name: "Grab or import 0 selected" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Delayed" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Grab or import 1 selected" }),
    );
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1));
    expect(apiMock.mock.calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(String(apiMock.mock.calls[0][1]?.body))).toEqual({
      instanceId: "sonarr-hd",
      id: 9,
    });
  });

  it("searches downloads by title, release, and client", () => {
    render(
      <DownloadQueue
        data={queue([
          download,
          {
            ...download,
            id: 7,
            mediaTitle: "Dune",
            title: "Dune.2021.2160p.UHD",
            downloadClient: "SABnzbd",
          },
        ])}
        loading={false}
        onRefresh={mock()}
        notify={mock()}
      />,
    );
    const search = screen.getByRole("searchbox", { name: "Search downloads" });
    fireEvent.change(search, { target: { value: "2160p dune" } });
    expect(screen.getByRole("row", { name: "Dune download" })).toBeTruthy();
    expect(
      screen.queryByRole("row", { name: "Severance download" }),
    ).toBeNull();
    fireEvent.change(search, { target: { value: "qbittorrent" } });
    expect(
      screen.getByRole("row", { name: "Severance download" }),
    ).toBeTruthy();
    expect(screen.queryByRole("row", { name: "Dune download" })).toBeNull();
    fireEvent.change(search, { target: { value: "nothing here" } });
    expect(screen.getByText("No matching downloads")).toBeTruthy();
  });

  it("selects a range with shift-click", () => {
    const items = ["A", "B", "C"].map((mediaTitle, index) => ({
      ...download,
      id: index + 1,
      mediaTitle,
      timeleft: `00:0${index + 1}:00`,
    }));
    render(
      <DownloadQueue
        data={queue(items)}
        loading={false}
        onRefresh={mock()}
        notify={mock()}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Select A" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select C" }), {
      shiftKey: true,
    });
    expect(screen.getByText("3 selected")).toBeTruthy();
  });
});
