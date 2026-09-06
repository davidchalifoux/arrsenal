import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddMedia } from "@/components/add-media";
import { instanceOptionsQuery } from "@/lib/instance-options-query";
import type { InstanceOptions, InstanceSummary, MediaItem } from "@/lib/types";

vi.mock("next/image", () => ({ default: () => null }));

const instance: InstanceSummary = {
  id: "radarr-hd",
  name: "Radarr HD",
  kind: "radarr",
  url: "http://radarr.invalid",
  connected: true,
  hasApiKey: true,
};
const sonarr: InstanceSummary = {
  ...instance,
  id: "sonarr",
  name: "Sonarr",
  kind: "sonarr",
};
const movie: MediaItem = {
  id: "movie:tmdb:693134",
  kind: "movie",
  title: "Dune: Part Two",
  year: 2024,
  genres: [],
  overview: "",
  poster: "",
  added: "",
  status: "missing",
  targets: [],
};
const options: InstanceOptions = {
  profiles: [{ id: 7, name: "HD-1080p" }],
  rootFolders: [{ id: 1, path: "/movies" }],
};
const key = ["instance-options", instance.id];
const fetchMock = vi.fn<typeof fetch>();
let queryClient: QueryClient;

function renderAdd(overrides: Partial<ComponentProps<typeof AddMedia>> = {}) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AddMedia
        open
        seed={movie}
        instances={[instance, sonarr]}
        library={[]}
        onClose={vi.fn()}
        onAdded={vi.fn()}
        onConnect={vi.fn()}
        notify={vi.fn()}
        {...overrides}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(Response.json(options));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe("AddMedia target options prefetch", () => {
  it("makes no requests merely rendering targets", async () => {
    renderAdd();
    await screen.findByRole("checkbox", { name: instance.name });
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("checkbox", { name: sonarr.name })).toBeNull();
  });

  it.each([
    "hover",
    "focus",
  ])("%s warms only the target options cache without selecting anything", async (interaction) => {
    renderAdd();
    const checkbox = await screen.findByRole("checkbox", {
      name: instance.name,
    });
    if (interaction === "hover") fireEvent.mouseEnter(checkbox);
    else act(() => checkbox.focus());
    await waitFor(() => expect(queryClient.getQueryData(key)).toEqual(options));
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      `/api/instances/${instance.id}/options`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("0 targets selected")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();

    fireEvent.mouseEnter(checkbox);
    fireEvent.focus(checkbox);
    fireEvent.click(checkbox);
    const profile = await screen.findByRole("combobox", {
      name: `${instance.name} quality profile`,
    });
    expect(profile.textContent).toContain("Choose a profile");
    expect(
      screen.getByRole("combobox", { name: `${instance.name} root folder` })
        .textContent,
    ).toContain("Choose a folder");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores targets already present in the library", async () => {
    renderAdd({
      library: [
        {
          ...movie,
          targets: [
            {
              instanceId: instance.id,
              instanceName: instance.name,
              remoteId: 1,
              qualityProfileId: 7,
              qualityProfile: "HD-1080p",
              quality: "Unknown",
              status: "missing",
              monitored: true,
              sizeOnDisk: 0,
            },
          ],
        },
      ],
    });
    const target = await screen.findByText(instance.name);
    fireEvent.mouseEnter(target);
    fireEvent.focus(target);
    await act(async () => {});
    expect(screen.getByText("Already added")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries failed prefetch on selection without displaying speculative errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Options unavailable"));
    renderAdd();
    const checkbox = await screen.findByRole("checkbox", {
      name: instance.name,
    });
    fireEvent.mouseEnter(checkbox);
    await waitFor(() =>
      expect(queryClient.getQueryState(key)?.status).toBe("error"),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(checkbox);
    await screen.findByRole("combobox", {
      name: `${instance.name} quality profile`,
    });
    expect(queryClient.getQueryData(key)).toEqual(options);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reuses an in-flight prefetch when selected and forwards cancellation", async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    renderAdd();
    const checkbox = await screen.findByRole("checkbox", {
      name: instance.name,
    });
    fireEvent.mouseEnter(checkbox);
    fireEvent.click(checkbox);
    expect(screen.getByText("Loading profiles and folders...")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const signal = fetchMock.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
    await act(() => queryClient.cancelQueries({ queryKey: key }));
    expect(signal?.aborted).toBe(true);
  });

  it("keeps options fresh for five minutes", async () => {
    expect(instanceOptionsQuery(instance.id).staleTime).toBe(5 * 60_000);
    queryClient.setQueryData(key, options, {
      updatedAt: Date.now() - 4 * 60_000,
    });
    renderAdd();
    const checkbox = await screen.findByRole("checkbox", {
      name: instance.name,
    });
    fireEvent.mouseEnter(checkbox);
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => {
      queryClient.setQueryData(key, options, {
        updatedAt: Date.now() - 5 * 60_000 - 1,
      });
    });
    fireEvent.focus(checkbox);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
