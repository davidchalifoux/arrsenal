import { afterEach, beforeEach, expect, it, mock, spyOn } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { UpdateStatus } from "@/components/update-status";

const repositoryUrl = "https://github.com/davidchalifoux/arrsenal";
let client: QueryClient;
function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  mock.restore();
});

function renderStatus() {
  return render(
    <UpdateStatus currentVersion="0.9.0" repositoryUrl={repositoryUrl} />,
    { wrapper },
  );
}

it("names the new version and links to the update guide", () => {
  client.setQueryData(["preferences"], { timeZone: null });
  client.setQueryData(["updates"], {
    enabled: true,
    release: {
      version: "0.10.0",
      url: `${repositoryUrl}/releases/tag/v0.10.0`,
      updateAvailable: true,
    },
  });
  renderStatus();
  expect(
    screen.getByText(
      /Arrsenal v0\.10\.0 is available\. You are running v0\.9\.0/,
    ),
  ).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "How to update" }).getAttribute("href"),
  ).toBe(`${repositoryUrl}/blob/main/docs/deployment.md#updates-and-stopping`);
});

it("turns update checks off and reports that updates are not checked", async () => {
  client.setQueryData(["preferences"], { timeZone: null });
  client.setQueryData(["updates"], { enabled: true, release: null });
  const fetcher = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (path: RequestInfo | URL) =>
        Response.json(
          path === "/api/updates"
            ? { enabled: false, release: null }
            : { timeZone: null, updateChecks: false },
        ),
      { preconnect: fetch.preconnect },
    ),
  );
  renderStatus();
  const checkbox = screen.getByRole("checkbox", {
    name: "Check for new releases",
  });
  expect(checkbox.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(checkbox);
  await waitFor(() =>
    expect(screen.getByText("Update checks are turned off.")).toBeTruthy(),
  );
  const save = fetcher.mock.calls.find(([path]) => path === "/api/preferences");
  expect(JSON.parse(String(save?.[1]?.body))).toEqual({ updateChecks: false });
});

it("checks now and shows the fresh result", async () => {
  client.setQueryData(["preferences"], { timeZone: null });
  client.setQueryData(["updates"], {
    enabled: true,
    release: {
      version: "0.9.0",
      url: `${repositoryUrl}/releases/tag/v0.9.0`,
      updateAvailable: false,
    },
  });
  const fetcher = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async () =>
        Response.json({
          enabled: true,
          release: {
            version: "0.10.0",
            url: `${repositoryUrl}/releases/tag/v0.10.0`,
            updateAvailable: true,
          },
        }),
      { preconnect: fetch.preconnect },
    ),
  );
  renderStatus();
  expect(screen.getByText(/No newer version available/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Check now" }));
  await waitFor(() =>
    expect(screen.getByText(/Arrsenal v0\.10\.0 is available/)).toBeTruthy(),
  );
  expect(fetcher.mock.calls[0]?.[0]).toBe("/api/updates");
  expect(fetcher.mock.calls[0]?.[1]?.method).toBe("POST");
});

it("offers no manual check while update checks are off", () => {
  client.setQueryData(["preferences"], { timeZone: null, updateChecks: false });
  client.setQueryData(["updates"], { enabled: false, release: null });
  renderStatus();
  expect(screen.getByText("Update checks are turned off.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Check now" })).toBeNull();
});
