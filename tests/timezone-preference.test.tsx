import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  render,
  renderHook,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimezonePreference } from "@/lib/timezone-preference";

let client: QueryClient;
let savedZone: string | null;
const fetchMock = vi.fn<typeof fetch>();
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  savedZone = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_path, init) => {
    if (init?.method === "PATCH")
      savedZone = JSON.parse(String(init.body)).timeZone;
    return Response.json({ timeZone: savedZone });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("server config timezone preference", () => {
  it("stays null through server rendering and pending fetch, then hydrates the saved zone", async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValue(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    const seen: (string | null)[] = [];
    function Probe() {
      const { timeZone } = useTimezonePreference();
      seen.push(timeZone);
      return <span>{timeZone ?? "Loading"}</span>;
    }
    const view = wrapper({ children: <Probe /> });
    const html = renderToString(view);
    expect(fetchMock).not.toHaveBeenCalled();
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);
    const errors = vi.spyOn(console, "error");
    render(view, { container, hydrate: true });
    expect(seen.every((zone) => zone === null)).toBe(true);
    await act(async () => resolve(Response.json({ timeZone: "Asia/Tokyo" })));
    await waitFor(() => expect(container.textContent).toBe("Asia/Tokyo"));
    expect(errors).not.toHaveBeenCalled();
  });

  it("uses each browser's zone in Automatic and refreshes it on focus", async () => {
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { result } = renderHook(useTimezonePreference, { wrapper });
    await waitFor(() => expect(result.current.timeZone).toBe(browser));
    expect(result.current).toMatchObject({ override: "", error: null });
    const options = Intl.DateTimeFormat().resolvedOptions();
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...options,
      timeZone: "Pacific/Auckland",
    });
    act(() => window.dispatchEvent(new Event("focus")));
    expect(result.current.timeZone).toBe("Pacific/Auckland");
  });

  it("falls back to UTC only when the browser cannot report its timezone", async () => {
    const options = Intl.DateTimeFormat().resolvedOptions();
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      ...options,
      timeZone: "",
    });
    const { result } = renderHook(useTimezonePreference, { wrapper });
    await waitFor(() => expect(result.current.timeZone).toBe("UTC"));
  });

  it("saves through PATCH, shares confirmed updates and resets with null", async () => {
    const first = renderHook(useTimezonePreference, { wrapper });
    const second = renderHook(useTimezonePreference, { wrapper });
    await waitFor(() => expect(first.result.current.timeZone).not.toBeNull());
    await act(() => first.result.current.setOverride("Asia/Tokyo"));
    await waitFor(() =>
      expect(second.result.current.timeZone).toBe("Asia/Tokyo"),
    );
    expect(savedZone).toBe("Asia/Tokyo");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/preferences",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ timeZone: "Asia/Tokyo" }),
      }),
    );
    await act(() => second.result.current.setOverride(""));
    await waitFor(() => expect(first.result.current.override).toBe(""));
    expect(savedZone).toBeNull();
  });

  it("retains the confirmed zone after validation or config write failures and recovers on retry", async () => {
    savedZone = "Europe/Paris";
    const { result } = renderHook(useTimezonePreference, { wrapper });
    await waitFor(() => expect(result.current.override).toBe(savedZone));
    for (const [status, error] of [
      [400, "Enter a valid IANA timezone."],
      [500, "Check directory permissions."],
    ] as const) {
      fetchMock.mockResolvedValueOnce(Response.json({ error }, { status }));
      await act(() => result.current.setOverride("Invalid/Zone"));
      await waitFor(() => expect(result.current.error).toContain(error));
      expect(result.current.timeZone).toBe("Europe/Paris");
    }
    await act(() => result.current.setOverride("Asia/Tokyo"));
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.timeZone).toBe("Asia/Tokyo");
  });

  it("reports failed loads and uses the local zone temporarily, then recovers", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Offline"));
    const { result } = renderHook(useTimezonePreference, { wrapper });
    await waitFor(() =>
      expect(result.current.error).toContain(
        "Using this browser's timezone temporarily",
      ),
    );
    expect(result.current.timeZone).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    savedZone = "Asia/Tokyo";
    await act(() => client.invalidateQueries({ queryKey: ["preferences"] }));
    await waitFor(() => expect(result.current.timeZone).toBe("Asia/Tokyo"));
    expect(result.current.error).toBeNull();
  });

  it("refreshes choices saved by other viewers and retains cached data on refetch errors", async () => {
    savedZone = "Europe/Paris";
    const { result } = renderHook(useTimezonePreference, { wrapper });
    await waitFor(() => expect(result.current.override).toBe("Europe/Paris"));
    savedZone = "Asia/Tokyo";
    await act(() => client.invalidateQueries({ queryKey: ["preferences"] }));
    await waitFor(() => expect(result.current.override).toBe("Asia/Tokyo"));
    fetchMock.mockRejectedValueOnce(new Error("Offline"));
    await act(() => client.invalidateQueries({ queryKey: ["preferences"] }));
    await waitFor(() =>
      expect(result.current.error).toContain(
        "Using the last loaded preference",
      ),
    );
    expect(result.current.timeZone).toBe("Asia/Tokyo");
  });
});
