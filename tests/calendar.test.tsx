import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Calendar } from "../src/components/calendar";
import type { CalendarResponse } from "../src/lib/types";

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<object>()),
  useQuery,
}));

const data: CalendarResponse = {
  instanceCount: 1,
  errors: [],
  items: [
    {
      id: "episode",
      title: "Show",
      mediaId: "series:tvdb:99",
      kind: "series",
      type: "episode",
      date: "2026-09-02",
      airDateUtc: "2026-09-02T23:30:00.000Z",
      seasonNumber: 1,
      episodeNumber: 2,
      episodeTitle: "Arrival",
      sources: [{ instanceId: "one", instanceName: "Sonarr" }],
    },
    ...(["theatrical", "digital", "physical"] as const).map((type) => ({
      id: type,
      title: `${type} movie`,
      mediaId: "movie:tmdb:42",
      kind: "movie" as const,
      type,
      date: "2026-09-02",
      sources: [],
    })),
    {
      id: "unknown",
      title: "Unknown identity",
      kind: "movie",
      type: "digital",
      date: "2026-09-03",
      sources: [],
    },
  ],
};

beforeEach(() =>
  useQuery.mockReturnValue({
    data,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("renders month and date-grouped agenda with UTC episode times, distinct release labels and only valid links", () => {
  render(<Calendar today="2026-09-06" />);
  expect(screen.getByRole("heading", { name: "Calendar" })).toBeTruthy();
  expect(screen.getByLabelText("September 2026 month calendar")).toBeTruthy();
  expect(screen.getByLabelText("September 2026 agenda")).toBeTruthy();
  expect(screen.getAllByText("Episode airs / 23:30 UTC")).toHaveLength(2);
  for (const label of [
    "Theatrical release",
    "Digital release",
    "Physical release",
  ])
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  expect(
    screen.getAllByRole("link", { name: "Show" })[0].getAttribute("href"),
  ).toBe("/shows/99-show");
  expect(screen.queryByRole("link", { name: "Unknown identity" })).toBeNull();
  expect(screen.getByText(/All days and episode times use UTC/)).toBeTruthy();
});

it("navigates months across years, uses exclusive ranges, and returns to today", () => {
  render(<Calendar today="2026-12-06" />);
  expect(useQuery.mock.lastCall?.[0].queryKey).toEqual([
    "calendar",
    "2026-12-01",
    "2027-01-01",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Next month" }));
  expect(screen.getByRole("heading", { name: "January 2027" })).toBeTruthy();
  expect(useQuery.mock.lastCall?.[0].queryKey).toEqual([
    "calendar",
    "2027-01-01",
    "2027-02-01",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
  fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
  expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  expect(screen.getByRole("heading", { name: "December 2026" })).toBeTruthy();
});

it("keeps busy desktop days compact with expandable remaining events", () => {
  render(<Calendar today="2026-09-06" />);
  const summary = screen.getByText("2 more events");
  expect(summary.tagName).toBe("SUMMARY");
  expect(summary.parentElement?.querySelectorAll("li")).toHaveLength(2);
  expect(
    screen.getByLabelText("September 2026 agenda").querySelectorAll("li"),
  ).toHaveLength(5);
});

it("shows initial loading without a misleading empty state", () => {
  useQuery.mockReturnValue({ isPending: true, isError: false });
  render(<Calendar today="2026-09-06" />);
  expect(screen.getByRole("status").textContent).toContain("Loading calendar");
  expect(screen.queryByText(/No scheduled/)).toBeNull();
});

it("shows failures with retry", () => {
  const refetch = vi.fn();
  useQuery.mockReturnValue({
    isPending: false,
    isError: true,
    error: new Error("Instances unavailable"),
    refetch,
  });
  render(<Calendar today="2026-09-06" />);
  expect(screen.getByRole("alert").textContent).toContain(
    "Instances unavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry calendar" }));
  expect(refetch).toHaveBeenCalledOnce();
});

it.each([
  0, 1,
])("distinguishes no instances from an empty calendar (%s)", (instanceCount) => {
  useQuery.mockReturnValue({
    data: { items: [], errors: [], instanceCount },
  });
  render(<Calendar today="2026-09-06" />);
  expect(screen.getByRole("status").textContent).toContain(
    instanceCount ? "No scheduled releases" : "Connect a Sonarr or Radarr",
  );
});

it("retains events with partial errors and does not claim completeness", () => {
  useQuery.mockReturnValue({
    data: {
      ...data,
      errors: [
        {
          instanceId: "bad",
          instanceName: "Offline Radarr",
          message: "Timed out",
        },
      ],
    },
  });
  render(<Calendar today="2026-09-06" />);
  expect(screen.getByRole("alert").textContent).toContain(
    "Offline Radarr: Timed out Calendar may be incomplete.",
  );
  expect(screen.getAllByRole("link", { name: "Show" })).toHaveLength(2);
});
