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
  it("shows queue totals, accessible progress, metadata, and the full release title", () => {
    render(
      <DownloadQueue
        data={queue()}
        loading={false}
        onRefresh={mock()}
        notify={mock()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Downloads" }).className,
    ).toContain("sr_true");
    expect(
      screen
        .getByRole("button", { name: "Refresh" })
        .parentElement?.querySelector("dl"),
    ).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "75",
    );
    expect(screen.getByText(download.title).getAttribute("title")).toBe(
      download.title,
    );
    expect(screen.getByText("256.0 MB of 1.0 GB left")).toBeTruthy();
    expect(screen.getByText("00:03:10 left")).toBeTruthy();
    expect(screen.getByText("qBittorrent")).toBeTruthy();
    expect(
      screen.getByText("Active downloads").parentElement?.textContent,
    ).toContain("1");
    expect(
      screen.getByText("Remaining size").parentElement?.textContent,
    ).toContain("256.0 MB");
    expect(screen.queryByText("Instances involved")).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: /Pause|Resume|Grab now|Retry import/,
      }),
    ).toBeNull();
  });

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
    fireEvent.click(screen.getByRole("button", { name: "Warnings" }));
    expect(
      screen.queryByRole("article", { name: "Severance download" }),
    ).toBeNull();
    expect(screen.getByRole("article", { name: "Silo download" })).toBeTruthy();
    expect(screen.getByText("Import requires manual review.")).toBeTruthy();
    expect(
      screen.getByText("Active downloads").parentElement?.textContent,
    ).toContain("1");
    expect(
      screen.getByText("Remaining size").parentElement?.textContent,
    ).toContain("256.0 MB");
    fireEvent.click(screen.getByRole("button", { name: "Downloading" }));
    expect(screen.queryByRole("article", { name: "Silo download" })).toBeNull();
    expect(
      screen.getByRole("article", { name: "Severance download" }),
    ).toBeTruthy();
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
      screen.queryByRole("article", { name: "Severance download" }),
    ).toBeNull();
    expect(screen.getByRole("article", { name: "Dune download" })).toBeTruthy();
    rerender(<DownloadQueue {...props} data={queue()} />);
    expect(
      screen.getByRole("article", { name: "Severance download" }),
    ).toBeTruthy();
  });

  it("falls back to a media icon when a poster cannot be loaded", () => {
    const { container } = render(
      <DownloadQueue
        data={queue([
          {
            ...download,
            poster:
              "/api/image?instanceId=sonarr-hd&path=/MediaCover/1/poster.jpg",
          },
        ])}
        loading={false}
        onRefresh={mock()}
        notify={mock()}
      />,
    );
    const poster = container.querySelector("img");
    if (!poster) throw new Error("Poster missing");
    fireEvent.error(poster);
    expect(container.querySelector("img")).toBeNull();
    expect(
      screen.getByRole("article", { name: "Severance download" }),
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
      screen.getByRole("article", { name: "Severance download" }),
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
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("Queue item removed.");
  });

  it("treats success:false as failure, preserves the confirmation, and refreshes after uncertainty", async () => {
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
    expect(onRefresh).toHaveBeenCalledTimes(1);
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
        screen.getByRole("article", { name: "Already grabbed download" }),
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
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
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
});
