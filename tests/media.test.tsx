import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ImageProps } from "next/image";
import type { ComponentProps, ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddMedia } from "@/components/add-media";
import { Arrsenal } from "@/components/arrsenal";
import { MediaCard } from "@/components/media-card";
import { MediaDetails } from "@/components/media-details";
import type {
  AddMediaRequest,
  InstanceOptions,
  InstanceSummary,
  LibraryResponse,
  MediaItem,
  MediaTarget,
  Release,
} from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("next/image", () => ({
  default: ({ src, alt, onError, sizes, className }: ImageProps) => (
    // Keep image errors testable without passing Next-only props to the DOM.
    // biome-ignore lint/performance/noImgElement: The Next Image test double is intentionally a native image.
    <img
      src={typeof src === "string" ? src : undefined}
      alt={alt}
      onError={onError}
      sizes={sizes}
      className={className}
    />
  ),
}));

const hd: InstanceSummary = {
  id: "radarr-hd",
  name: "Radarr HD",
  kind: "radarr",
  url: "http://radarr-hd.invalid:7878",
  hasApiKey: true,
  connected: true,
};
const uhd: InstanceSummary = { ...hd, id: "radarr-4k", name: "Radarr 4K" };
const archive: InstanceSummary = {
  ...hd,
  id: "radarr-archive",
  name: "Radarr Archive",
};
const sonarr: InstanceSummary = {
  ...hd,
  id: "sonarr-hd",
  name: "Sonarr HD",
  kind: "sonarr",
};
const hdTarget: MediaTarget = {
  instanceId: hd.id,
  instanceName: hd.name,
  remoteId: 11,
  qualityProfileId: 7,
  qualityProfile: "HD-1080p",
  quality: "WEBDL-1080p",
  status: "available",
  monitored: true,
  sizeOnDisk: 1024 ** 3,
};
const uhdTarget: MediaTarget = {
  ...hdTarget,
  instanceId: uhd.id,
  instanceName: uhd.name,
  remoteId: 22,
  qualityProfileId: 19,
  qualityProfile: "Ultra-HD",
  quality: "Not downloaded",
  status: "missing",
  sizeOnDisk: 0,
};
const movie: MediaItem = {
  id: "movie-693134",
  kind: "movie",
  title: "Dune: Part Two",
  year: 2024,
  tmdbId: 693134,
  overview: "Paul Atreides unites with the Fremen.",
  poster: "/poster.jpg",
  genres: ["Science Fiction"],
  added: "2024-03-01T00:00:00Z",
  status: "missing",
  targets: [],
};
const options: Record<string, InstanceOptions> = {
  [hd.id]: {
    profiles: [{ id: 7, name: "HD-1080p" }],
    rootFolders: [{ id: 1, path: "/movies/hd" }],
  },
  [uhd.id]: {
    profiles: [{ id: 19, name: "Ultra-HD" }],
    rootFolders: [{ id: 2, path: "/movies/4k" }],
  },
};
const rejected: Release = {
  guid: "release-guid-4k",
  indexerId: 31,
  title: "Dune.Part.Two.2024.2160p.WEB-DL",
  quality: "WEBDL-2160p",
  size: 12 * 1024 ** 3,
  age: 2,
  seeders: 18,
  protocol: "torrent",
  indexer: "Test indexer",
  approved: false,
  rejections: ["Quality is not allowed in this profile."],
};

const fetchMock = vi.fn<typeof fetch>();
let queryClient: QueryClient;

function renderUI(element: ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
  );
}

function renderAdd(overrides: Partial<ComponentProps<typeof AddMedia>> = {}) {
  const props = {
    open: true,
    seed: movie,
    instances: [hd, uhd, archive, sonarr],
    library: [],
    demo: false,
    onClose: vi.fn(),
    onAdded: vi.fn(),
    onConnect: vi.fn(),
    notify: vi.fn(),
    ...overrides,
  };
  renderUI(<AddMedia {...props} />);
  return props;
}

function renderDetails(demo = false) {
  const props = {
    media: { ...movie, targets: [hdTarget, uhdTarget] },
    demo,
    onClose: vi.fn(),
    onAddTarget: vi.fn(),
    onChanged: vi.fn(),
    notify: vi.fn(),
  };
  renderUI(<MediaDetails {...props} />);
  return props;
}

async function choose(label: string, value: string) {
  fireEvent.click(await screen.findByRole("combobox", { name: label }));
  const option = await screen.findByRole("option", { name: value });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
}

async function selectTarget(
  instance: InstanceSummary,
  profile: string,
  folder: string,
) {
  fireEvent.click(screen.getByRole("checkbox", { name: instance.name }));
  await choose(`${instance.name} quality profile`, profile);
  await choose(`${instance.name} root folder`, folder);
}

function writes() {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (path) => {
    const id = String(path).match(/^\/api\/instances\/([^/]+)\/options$/)?.[1];
    if (id && options[id]) return Response.json(options[id]);
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("AddMedia", () => {
  it("requires selection, then a profile and root folder for every selected target", async () => {
    renderAdd();
    await screen.findByRole("dialog");
    expect(
      screen
        .getByRole("button", { name: /Add to .*targets/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: hd.name }));
    fireEvent.click(screen.getByRole("checkbox", { name: uhd.name }));
    await screen.findByRole("combobox", {
      name: `${uhd.name} quality profile`,
    });
    const add = screen.getByRole("button", { name: "Add to 2 targets" });
    fireEvent.click(add);
    expect(screen.getByRole("alert").textContent).toContain(
      "Choose a quality profile and root folder for every selected instance.",
    );
    expect(writes()).toHaveLength(0);

    await choose(`${hd.name} quality profile`, "HD-1080p");
    await choose(`${hd.name} root folder`, "/movies/hd");
    await choose(`${uhd.name} root folder`, "/movies/4k");
    fireEvent.click(add);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(writes()).toHaveLength(0);

    await choose(`${uhd.name} quality profile`, "Ultra-HD");
    await choose(`${uhd.name} root folder`, "Choose a folder");
    fireEvent.click(add);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });

  it("sends only the selected target's choices, excludes existing instances, and submits once", async () => {
    const pending = Promise.withResolvers<Response>();
    const props = renderAdd({
      library: [
        {
          ...movie,
          targets: [
            { ...hdTarget, instanceId: archive.id, instanceName: archive.name },
          ],
        },
      ],
    });
    await screen.findByRole("dialog");
    expect(screen.getByText("Already added")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: archive.name })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: sonarr.name })).toBeNull();
    await selectTarget(hd, "HD-1080p", "/movies/hd");
    await selectTarget(uhd, "Ultra-HD", "/movies/4k");
    fireEvent.click(screen.getByRole("checkbox", { name: hd.name }));
    expect(screen.getByText("1 target selected")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Start searching after adding/ }),
    );
    fetchMock.mockImplementationOnce(() => pending.promise);
    const add = screen.getByRole("button", { name: "Add to 1 target" });
    fireEvent.click(add);
    fireEvent.click(add);
    expect(writes()).toHaveLength(1);
    const [path, init] = writes()[0];
    expect(path).toBe("/api/media");
    const body: AddMediaRequest = JSON.parse(String(init?.body));
    expect(body).toEqual({
      media: movie,
      search: false,
      targets: [
        {
          instanceId: uhd.id,
          qualityProfileId: 19,
          rootFolderPath: "/movies/4k",
        },
      ],
    });
    expect(props.onAdded).not.toHaveBeenCalled();
    await act(async () =>
      pending.resolve(
        Response.json({ success: true, message: "Added to Radarr 4K." }),
      ),
    );
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(props.onAdded).toHaveBeenCalledExactlyOnceWith();
    expect(props.notify).toHaveBeenCalledWith("Added to Radarr 4K.");
  });

  it("keeps HTTP 207 failures open and retries only unconfirmed targets even before the library refreshes", async () => {
    const props = renderAdd();
    await screen.findByRole("dialog");
    await selectTarget(hd, "HD-1080p", "/movies/hd");
    await selectTarget(uhd, "Ultra-HD", "/movies/4k");
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          success: false,
          message: "Added to 1 of 2 selected instances.",
          errors: [
            {
              instanceId: uhd.id,
              instanceName: uhd.name,
              message: "Disk is full.",
            },
          ],
        },
        { status: 207 },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to 2 targets" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Radarr 4K: Disk is full.",
    );
    expect(JSON.parse(String(writes()[0][1]?.body))).toEqual({
      media: movie,
      search: true,
      targets: [
        {
          instanceId: hd.id,
          qualityProfileId: 7,
          rootFolderPath: "/movies/hd",
        },
        {
          instanceId: uhd.id,
          qualityProfileId: 19,
          rootFolderPath: "/movies/4k",
        },
      ],
    });
    expect(screen.queryByRole("checkbox", { name: hd.name })).toBeNull();
    expect(screen.getByText("Already added")).toBeTruthy();
    expect(props.onAdded).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.notify).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: true, message: "Added the remaining target." }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to 1 target" }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(writes()).toHaveLength(2);
    expect(JSON.parse(String(writes()[1][1]?.body))).toEqual({
      media: movie,
      search: true,
      targets: [
        {
          instanceId: uhd.id,
          qualityProfileId: 19,
          rootFolderPath: "/movies/4k",
        },
      ],
    });
    expect(props.onAdded).toHaveBeenCalledTimes(2);
  });

  it("surfaces option and add server failures without losing the user's choices", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Profiles unavailable." }, { status: 503 }),
    );
    const props = renderAdd();
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("checkbox", { name: hd.name }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Profiles unavailable.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await choose(`${hd.name} quality profile`, "HD-1080p");
    await choose(`${hd.name} root folder`, "/movies/hd");
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Root folder is read-only." }, { status: 500 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to 1 target" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Root folder is read-only.",
    );
    expect(props.onAdded).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
    expect(
      screen.getByRole("combobox", { name: `${hd.name} root folder` })
        .textContent,
    ).toContain("/movies/hd");
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: true, message: "Added." }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to 1 target" }));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(writes()).toHaveLength(2);
    expect(writes()[1][1]?.body).toBe(writes()[0][1]?.body);
  });

  it("offers a Sonarr connection rather than a Radarr target when adding a series", async () => {
    const series: MediaItem = {
      ...movie,
      id: "series-392573",
      kind: "series",
      tvdbId: 392573,
      tmdbId: undefined,
    };
    const props = renderAdd({ seed: series, instances: [hd] });
    await screen.findByRole("dialog");
    expect(screen.getByRole("status").textContent).toContain(
      "No Sonarr instances are connected.",
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Connect an instance" }),
    );
    expect(props.onConnect).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Demo library integration", () => {
  it("adds a sample target through Arrsenal into the query cache without a write or options API call", async () => {
    const existing: MediaTarget = { ...hdTarget, instanceId: "demo-radarr-hd" };
    const library: LibraryResponse = {
      items: [{ ...movie, status: "available", targets: [existing] }],
      demo: true,
      errors: [],
    };
    fetchMock.mockImplementation(async (path) => {
      if (path === "/api/library") return Response.json(library);
      if (path === "/api/instances") return Response.json({ instances: [] });
      if (path === "/api/queue")
        return Response.json({ items: [], demo: true, errors: [] });
      throw new Error(`Unexpected demo request: ${path}`);
    });
    renderUI(<Arrsenal view="library" />);
    fireEvent.click(
      await screen.findByRole("button", { name: `View ${movie.title}` }),
    );
    const details = await screen.findByRole("dialog", { name: movie.title });
    fireEvent.click(
      within(details).getByRole("button", { name: "Add target" }),
    );
    await screen.findByRole("dialog", { name: "Add a quality target" });
    await selectTarget({ ...uhd, id: "demo-radarr-4k" }, "Ultra-HD", "/movies");
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Start searching after adding/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to 1 target" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("status").textContent).toContain(
      "No real instances were changed.",
    );
    const cached = queryClient.getQueryData<LibraryResponse>(["library"]);
    expect(cached?.items).toHaveLength(1);
    expect(cached?.items[0].targets).toEqual([
      existing,
      expect.objectContaining({
        instanceId: "demo-radarr-4k",
        qualityProfileId: 2,
        qualityProfile: "Ultra-HD",
        quality: "Not downloaded",
        status: "missing",
        monitored: true,
        sizeOnDisk: 0,
      }),
    ]);
    expect(writes()).toHaveLength(0);
    expect(fetchMock.mock.calls.map(([path]) => path).sort()).toEqual([
      "/api/instances",
      "/api/library",
      "/api/queue",
    ]);
    expect(
      screen.getByRole("button", { name: `View ${movie.title}` }),
    ).toBeTruthy();
  });
});

describe("MediaDetails searches", () => {
  it("auto-searches the selected instance and preserves server failures without reporting success", async () => {
    const props = renderDetails();
    await screen.findByRole("dialog");
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: false, message: "Search was not accepted." }),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Auto search" })[1]);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Search was not accepted.",
    );
    expect(writes()[0][0]).toBe("/api/search");
    expect(JSON.parse(String(writes()[0][1]?.body))).toEqual({
      instanceId: uhd.id,
      remoteId: 22,
      kind: "movie",
    });
    expect(props.onChanged).not.toHaveBeenCalled();
    expect(props.notify).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: true, message: "Search was queued." }),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Auto search" })[1]);
    await waitFor(() => expect(props.onChanged).toHaveBeenCalledTimes(1));
    expect(props.notify).toHaveBeenCalledWith("Search was queued.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("requires explicit confirmation for a rejected release and keeps it retryable after HTTP and action failures", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ items: [rejected] }));
    const props = renderDetails();
    await screen.findByRole("dialog");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Manual search" })[1],
    );
    const dialog = await screen.findByRole("dialog", { name: "Manual search" });
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "Grab" }),
    );
    expect(within(dialog).getByText(rejected.rejections[0])).toBeTruthy();
    expect(within(dialog).getByRole("alert").textContent).toContain(
      "Grabbing it will override those rules.",
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/releases?instanceId=radarr-4k&remoteId=22&kind=movie",
    );
    expect(writes()).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(
      within(dialog).queryByRole("button", { name: "Confirm grab" }),
    ).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Grab" }));

    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Download client unavailable." }, { status: 503 }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirm grab" }),
    );
    await waitFor(() =>
      expect(props.notify).toHaveBeenCalledWith(
        "Download client unavailable.",
        true,
      ),
    );
    expect(props.onChanged).not.toHaveBeenCalled();
    expect(
      within(dialog)
        .getByRole("button", { name: "Confirm grab" })
        .hasAttribute("disabled"),
    ).toBe(false);
    fetchMock.mockResolvedValueOnce(
      Response.json({ success: false, message: "Grab was not confirmed." }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Confirm grab" }),
    );
    await waitFor(() =>
      expect(props.notify).toHaveBeenCalledWith(
        "Grab was not confirmed.",
        true,
      ),
    );
    expect(props.onChanged).not.toHaveBeenCalled();

    const pending = Promise.withResolvers<Response>();
    fetchMock.mockImplementationOnce(() => pending.promise);
    const confirm = within(dialog).getByRole("button", {
      name: "Confirm grab",
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(writes()).toHaveLength(3);
    for (const [path, init] of writes()) {
      expect(path).toBe("/api/releases");
      expect(JSON.parse(String(init?.body))).toEqual({
        instanceId: uhd.id,
        guid: rejected.guid,
        indexerId: rejected.indexerId,
      });
    }
    await act(async () =>
      pending.resolve(
        Response.json({
          success: true,
          message: "Release sent to download client.",
        }),
      ),
    );
    await waitFor(() =>
      expect(
        within(dialog).queryByRole("button", { name: "Confirm grab" }),
      ).toBeNull(),
    );
    expect(props.onChanged).toHaveBeenCalledTimes(1);
    expect(props.notify).toHaveBeenLastCalledWith(
      "Release sent to download client.",
    );
  });

  it("clears release confirmation when switching instances and uses that instance's remote ID", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ items: [rejected] }));
    renderDetails();
    await screen.findByRole("dialog");
    fireEvent.click(
      screen.getAllByRole("button", { name: "Manual search" })[0],
    );
    const dialog = await screen.findByRole("dialog", { name: "Manual search" });
    fireEvent.click(
      await within(dialog).findByRole("button", { name: "Grab" }),
    );
    fetchMock.mockResolvedValueOnce(
      Response.json({ error: "Indexer lookup failed." }, { status: 502 }),
    );
    await choose("Search instance", uhd.name);
    expect(
      within(dialog).queryByRole("button", { name: "Confirm grab" }),
    ).toBeNull();
    expect((await within(dialog).findByRole("alert")).textContent).toContain(
      "Indexer lookup failed.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/releases?instanceId=radarr-4k&remoteId=22&kind=movie",
    );
    fetchMock.mockResolvedValueOnce(Response.json({ items: [] }));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Search again" }),
    );
    expect(await within(dialog).findByText(/No releases found/)).toBeTruthy();
    expect(writes()).toHaveLength(0);
  });

  it("does not search indexers or offer live releases in demo mode", async () => {
    const props = renderDetails(true);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getAllByRole("button", { name: "Auto search" })[0]);
    expect(props.notify).toHaveBeenCalledWith(
      expect.stringContaining("Demo: automatic search"),
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Manual search" })[0],
    );
    const dialog = await screen.findByRole("dialog", { name: "Manual search" });
    expect(within(dialog).getByRole("status").textContent).toContain(
      "No sample releases are presented as live results.",
    );
    expect(
      within(dialog)
        .getByRole("button", { name: "Search again" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(within(dialog).queryByRole("button", { name: "Grab" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(props.onChanged).not.toHaveBeenCalled();
  });
});

describe("MediaCard", () => {
  it("keeps downloaded quality distinct from the target profile and remains usable after poster failure", () => {
    const onClick = vi.fn();
    renderUI(
      <MediaCard
        item={{
          ...movie,
          targets: [{ ...hdTarget, qualityProfile: "Ultra-HD" }],
        }}
        onClick={onClick}
      />,
    );
    const card = screen.getByRole("button", { name: `View ${movie.title}` });
    expect(within(card).getByText("1080p")).toBeTruthy();
    expect(within(card).queryByText("4K")).toBeNull();
    expect(within(card).getByText("1080p").getAttribute("title")).toContain(
      "Ultra-HD",
    );
    fireEvent.error(
      within(card).getByRole("img", { name: `${movie.title} poster` }),
    );
    expect(within(card).queryByRole("img")).toBeNull();
    expect(
      within(card).getByRole("heading", { name: movie.title }),
    ).toBeTruthy();
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
