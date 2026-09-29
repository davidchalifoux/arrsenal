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
} from "@testing-library/react";
import {
  magnetName,
  nzbReleaseName,
  overrideReleaseName,
  releaseFileKind,
  releaseFileName,
  torrentLinkProblem,
} from "@/lib/release-links";
import type { ActionResponse, MediaItem } from "@/lib/types";

const originalClient = { ...(await import("@/lib/client")) };
mock.module("@/lib/client", () => ({
  ...originalClient,
  api: mock(),
}));
const { AddRelease } = await import("@/components/add-release");
const { api } = await import("@/lib/client");
const apiMock = api as Mock<
  (...args: Parameters<typeof api>) => ReturnType<typeof api>
>;

const show: MediaItem = {
  id: "series:tvdb:70327",
  kind: "series",
  title: "Astro Boy",
  year: 1963,
  overview: "",
  poster: "",
  genres: [],
  added: "2026-01-01T00:00:00Z",
  status: "missing",
  targets: [
    {
      instanceId: "sonarr-anime",
      instanceName: "Sonarr Anime",
      remoteId: 12,
      qualityProfileId: 1,
      qualityProfile: "Any",
      quality: "",
      status: "missing",
      monitored: true,
      sizeOnDisk: 0,
    },
  ],
};
const magnet =
  "magnet:?xt=urn:btih:5f3a9c&dn=%5BGroup%5D%20Tetsuwan%20Atom%20(1963)%20%5BBD%201080p%5D&tr=udp%3A%2F%2Ftracker";

/** Answers the preferences read; `push` answers the release push. */
function respond(push: ActionResponse, arrsenalUrl: string | null = null) {
  apiMock.mockImplementation(async (path) =>
    path === "/api/preferences" ? { timeZone: null, arrsenalUrl } : push,
  );
}

function pushBody() {
  const call = apiMock.mock.calls.find(
    ([path]) => path === "/api/releases/push",
  );
  return JSON.parse(String(call?.[1]?.body));
}

function renderDialog() {
  const props = { onClose: mock(), notify: mock(), onTarget: mock() };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AddRelease media={show} target={show.targets[0]} {...props} />
    </QueryClientProvider>,
  );
  return props;
}

function nzbFile(contents: string, name: string) {
  return new File([contents], name, { type: "application/x-nzb" });
}

/** A minimal bencoded torrent with the given info name. */
function torrentBytes(name: string) {
  const encoded = new TextEncoder().encode(name);
  return new TextEncoder().encode(
    `d8:announce9:udp://x:14:infod6:lengthi1e4:name${encoded.length}:${name}12:piece lengthi16384e6:pieces0:ee`,
  );
}

const sent: ActionResponse = {
  success: true,
  message: "Release sent.",
  outcomes: [],
};

beforeEach(() => {
  apiMock.mockReset();
  respond(sent);
});
afterEach(cleanup);

describe("release links", () => {
  it("reads the name a magnet link carries", () => {
    expect(magnetName(magnet)).toBe("[Group] Tetsuwan Atom (1963) [BD 1080p]");
    expect(magnetName("magnet:?xt=urn:btih:5f3a9c")).toBeUndefined();
    expect(magnetName("https://nyaa.si/download/1.torrent")).toBeUndefined();
  });

  it("accepts magnets with a hash and HTTP(S) torrent links only", () => {
    expect(torrentLinkProblem(magnet)).toBeUndefined();
    expect(torrentLinkProblem("https://nyaa.si/download/1.torrent")).toBe(
      undefined,
    );
    expect(torrentLinkProblem("magnet:?dn=no-hash")).toMatch(/no info hash/);
    expect(torrentLinkProblem("https://indexer.example/a.nzb")).toMatch(
      /choose the file/,
    );
    expect(torrentLinkProblem("ftp://example.com/a.torrent")).toMatch(
      /Paste a magnet/,
    );
    expect(torrentLinkProblem("not a link")).toMatch(/Paste a magnet/);
  });

  it("builds override names that keep the release's quality", () => {
    expect(
      overrideReleaseName(show, "[Group] Tetsuwan Atom (1963) [BD 1080p]"),
    ).toBe("Astro Boy S01 1080p BluRay");
    expect(
      overrideReleaseName(
        { kind: "movie", title: "Metropolis", year: 1927 },
        "Metropolis.1927.720p.WEB-DL",
      ),
    ).toBe("Metropolis (1927) 720p WEB-DL");
    expect(overrideReleaseName(show)).toBe("Astro Boy S01");
  });

  it("prefers the NZB's name field, then the file name", () => {
    expect(
      nzbReleaseName(
        '<nzb><head><meta type="name">Show &amp; Tell S01 1080p</meta></head></nzb>',
        "ignored.nzb",
      ),
    ).toBe("Show & Tell S01 1080p");
    expect(nzbReleaseName("<nzb></nzb>", "Show.S01.1080p.WEB-DL.nzb")).toBe(
      "Show.S01.1080p.WEB-DL",
    );
    expect(nzbReleaseName("<nzb></nzb>", ".nzb")).toBeUndefined();
  });

  it("tells NZBs and torrents apart by content, not extension", () => {
    const encoder = new TextEncoder();
    const torrent = torrentBytes("[Group] Tetsuwan Atom (1963)");
    expect(releaseFileKind(torrent)).toBe("torrent");
    expect(releaseFileKind(encoder.encode('<?xml?><nzb xmlns="x">'))).toBe(
      "nzb",
    );
    expect(releaseFileKind(encoder.encode("<html>login</html>"))).toBe(
      undefined,
    );
    // Bencoded, but not a torrent: no info dictionary.
    expect(releaseFileKind(encoder.encode("d3:fooi1ee"))).toBeUndefined();
    expect(releaseFileKind(encoder.encode("d4:infod"))).toBeUndefined();
    expect(releaseFileName(torrent, "torrent", "misnamed.nzb")).toBe(
      "[Group] Tetsuwan Atom (1963)",
    );
    expect(
      releaseFileName(encoder.encode("<nzb></nzb>"), "nzb", "Show.S01.nzb"),
    ).toBe("Show.S01");
  });
});

describe("AddRelease", () => {
  it("sends the magnet's own name until the override is ticked", async () => {
    const props = renderDialog();
    fireEvent.change(screen.getByLabelText("Release"), {
      target: { value: magnet },
    });
    const name = screen.getByLabelText("Release name") as HTMLInputElement;
    expect(name.value).toBe("[Group] Tetsuwan Atom (1963) [BD 1080p]");
    expect(name.readOnly).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: /Override name/ }));
    expect(name.value).toBe("Astro Boy S01 1080p BluRay");
    expect(name.readOnly).toBe(false);
    fireEvent.change(name, { target: { value: "Astro Boy S01-S02 1080p" } });
    fireEvent.click(screen.getByRole("button", { name: /Send to/ }));

    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(props.notify).toHaveBeenCalledWith("Release sent.");
    expect(pushBody()).toEqual({
      instanceId: "sonarr-anime",
      remoteId: 12,
      kind: "series",
      title: "Astro Boy S01-S02 1080p",
      link: magnet,
    });
  });

  it("makes a name for links that carry none and shows rejections", async () => {
    respond({
      success: false,
      message: "Sonarr Anime rejected this release: Unknown quality",
      outcomes: [],
    });
    const props = renderDialog();
    fireEvent.change(screen.getByLabelText("Release"), {
      target: { value: "https://nyaa.si/download/1.torrent" },
    });
    const override = screen.getByRole("checkbox", { name: /Override name/ });
    expect(override.getAttribute("aria-checked")).toBe("true");
    expect(
      (screen.getByLabelText("Release name") as HTMLInputElement).value,
    ).toBe("Astro Boy S01");
    expect(screen.getByText(/doesn't include a release name/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Send to/ }));
    expect(
      await screen.findByText(
        "Sonarr Anime rejected this release: Unknown quality",
      ),
    ).toBeTruthy();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("uploads a chosen NZB and names the saved address", async () => {
    respond(sent, "http://arrsenal:3000");
    const props = renderDialog();
    const contents = '<?xml version="1.0"?><nzb><file/></nzb>';
    fireEvent.change(screen.getByLabelText("Release file"), {
      target: {
        files: [nzbFile(contents, "Astro.Boy.1963.S01.480p.DVDRip.nzb")],
      },
    });
    expect(
      await screen.findByText("Astro.Boy.1963.S01.480p.DVDRip.nzb"),
    ).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Paste a magnet/)).toBeNull();
    expect(
      await screen.findByText(
        /Sonarr Anime downloads this NZB from http:\/\/arrsenal:3000\./,
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Change address" }).getAttribute("href"),
    ).toBe("/settings/connections");
    expect(
      (screen.getByLabelText("Release name") as HTMLInputElement).value,
    ).toBe("Astro.Boy.1963.S01.480p.DVDRip");

    fireEvent.click(screen.getByRole("button", { name: /Send to/ }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    const body = pushBody();
    expect(body.title).toBe("Astro.Boy.1963.S01.480p.DVDRip");
    expect(body.link).toBeUndefined();
    expect(atob(body.file)).toBe(contents);
  });

  it("accepts a dropped NZB and can go back to a link", async () => {
    renderDialog();
    fireEvent.drop(
      screen.getByLabelText("Release").closest("form") as Element,
      {
        dataTransfer: {
          files: [nzbFile("<nzb></nzb>", "Dropped.S01.nzb")],
          types: ["Files"],
        },
      },
    );
    expect(await screen.findByText("Dropped.S01.nzb")).toBeTruthy();
    expect(
      await screen.findByText(
        new RegExp(`downloads this NZB from ${window.location.origin}`),
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove file" }));
    expect(screen.getByPlaceholderText(/Paste a magnet/)).toBeTruthy();
  });

  it("sends a torrent file under the name inside it", async () => {
    const props = renderDialog();
    fireEvent.change(screen.getByLabelText("Release file"), {
      target: {
        files: [
          new File(
            [torrentBytes("[Group] Tetsuwan Atom (1963) [BD 1080p]")],
            "123.torrent",
          ),
        ],
      },
    });
    expect(await screen.findByText("123.torrent")).toBeTruthy();
    expect(screen.getByText("Torrent")).toBeTruthy();
    expect(screen.getByText(/downloads this torrent file from/)).toBeTruthy();
    expect(
      (screen.getByLabelText("Release name") as HTMLInputElement).value,
    ).toBe("[Group] Tetsuwan Atom (1963) [BD 1080p]");
    fireEvent.click(screen.getByRole("checkbox", { name: /Override name/ }));
    fireEvent.click(screen.getByRole("button", { name: /Send to/ }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(pushBody().title).toBe("Astro Boy S01 1080p BluRay");
    expect(pushBody().file).toBeString();
  });

  it("refuses files that aren't releases and invalid links", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Release file"), {
      target: { files: [nzbFile("<html>login</html>", "download.nzb")] },
    });
    expect(
      await screen.findByText("This file isn't an NZB or a torrent file."),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Release"), {
      target: { value: "https://indexer.example/getnzb/a.nzb" },
    });
    expect(
      screen.getByText(/Download the NZB, then choose the file/),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Send to/ }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
