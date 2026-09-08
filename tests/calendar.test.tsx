import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";

import type { CalendarResponse } from "../src/lib/types";

const { useQuery, prefetchQuery, preference } = {
  useQuery: mock(),
  prefetchQuery: mock(),
  preference: {
    timeZone: "UTC" as string | null,
    error: null as string | null,
  },
};
mock.module("../src/lib/timezone-preference", () => ({
  useTimezonePreference: () => preference,
}));
const originalQuery = { ...(await import("@tanstack/react-query")) };
mock.module("@tanstack/react-query", () => ({
  ...originalQuery,
  useQuery,
  useQueryClient: () => ({ prefetchQuery }),
}));
const { Calendar } = await import("../src/components/calendar");

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

beforeEach(() => {
  preference.timeZone = "UTC";
  preference.error = null;
  useQuery.mockReturnValue({
    data,
    isPending: false,
    isError: false,
    refetch: mock(),
  });
});
afterEach(() => {
  cleanup();
  mock.clearAllMocks();
});

it("renders month and date-grouped agenda with UTC episode times, distinct release labels and only valid links", () => {
  render(<Calendar now="2026-09-06T12:00:00Z" />);
  expect(
    screen.getByRole("heading", { level: 1, name: "September 2026" }),
  ).toBeTruthy();
  expect(screen.getByLabelText("September 2026 month calendar")).toBeTruthy();
  expect(screen.getByLabelText("September 2026 agenda")).toBeTruthy();
  const time = new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date("2026-09-02T23:30:00Z"));
  expect(screen.getAllByText(time)).toHaveLength(2);
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
});

it("navigates months across years, uses exclusive ranges, and returns to today", () => {
  render(<Calendar now="2026-12-06T12:00:00Z" />);
  expect(useQuery.mock.lastCall?.[0].queryKey).toEqual([
    "calendar",
    "2026-11-30",
    "2027-01-02",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Next month" }));
  expect(screen.getByRole("heading", { name: "January 2027" })).toBeTruthy();
  expect(useQuery.mock.lastCall?.[0].queryKey).toEqual([
    "calendar",
    "2026-12-31",
    "2027-02-02",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
  fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
  expect(screen.getByRole("heading", { name: "November 2026" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  expect(screen.getByRole("heading", { name: "December 2026" })).toBeTruthy();
});

it("shows failures with retry", () => {
  const refetch = mock();
  useQuery.mockReturnValue({
    isPending: false,
    isError: true,
    error: new Error("Instances unavailable"),
    refetch,
  });
  render(<Calendar now="2026-09-06T12:00:00Z" />);
  expect(screen.getByRole("alert").textContent).toContain(
    "Instances unavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry calendar" }));
  expect(refetch).toHaveBeenCalledTimes(1);
});

it.each([
  0, 1,
])("distinguishes no instances from an empty calendar (%s)", (instanceCount) => {
  useQuery.mockReturnValue({
    data: { items: [], errors: [], instanceCount },
  });
  render(<Calendar now="2026-09-06T12:00:00Z" />);
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
  render(<Calendar now="2026-09-06T12:00:00Z" />);
  expect(screen.getByRole("alert").textContent).toContain(
    "Offline Radarr: Timed out Calendar may be incomplete.",
  );
  expect(screen.getAllByRole("link", { name: "Show" })).toHaveLength(2);
});

it.each([
  {
    zone: "Pacific/Kiritimati",
    instants: ["2024-01-31T10:00:00Z", "2024-02-29T09:59:00Z"],
    outside: ["2024-01-31T09:59:00Z", "2024-02-29T10:00:00Z"],
  },
  {
    zone: "America/Los_Angeles",
    instants: ["2024-02-01T08:00:00Z", "2024-03-01T07:59:00Z"],
    outside: ["2024-02-01T07:59:00Z", "2024-03-01T08:00:00Z"],
  },
])("regroups month boundaries and leap day in $zone, excluding padded events outside the visible month", ({
  zone,
  instants,
  outside,
}) => {
  preference.timeZone = zone;
  useQuery.mockReturnValue({
    data: {
      ...data,
      items: [...instants, ...outside].map((airDateUtc, index) => ({
        ...data.items[0],
        id: `boundary-${index}`,
        title: `Boundary ${index}`,
        date: airDateUtc.slice(0, 10),
        airDateUtc,
      })),
    },
  });
  render(<Calendar now="2024-02-15T12:00:00Z" />);
  expect(useQuery.mock.lastCall?.[0].queryKey).toEqual([
    "calendar",
    "2024-01-31",
    "2024-03-02",
  ]);
  const grid = screen.getByLabelText("February 2024 month calendar");
  const agenda = screen.getByLabelText("February 2024 agenda");
  expect(
    grid.querySelectorAll("time[datetime^='2024-02-']:not([datetime*='T'])"),
  ).toHaveLength(29);
  expect(
    Array.from(agenda.querySelectorAll("h3 time"), (time) =>
      time.getAttribute("datetime"),
    ),
  ).toEqual(["2024-02-01", "2024-02-29"]);
  for (const [index, date] of ["2024-02-01", "2024-02-29"].entries()) {
    const cell = grid.querySelector(`time[datetime='${date}']`)?.parentElement;
    expect(cell).toBeTruthy();
    expect(
      within(cell as HTMLElement).getByText(`Boundary ${index}`),
    ).toBeTruthy();
    const group = agenda
      .querySelector(`time[datetime='${date}']`)
      ?.closest("section");
    expect(
      within(group as HTMLElement).getByText(`Boundary ${index}`),
    ).toBeTruthy();
    const time = new Intl.DateTimeFormat(undefined, {
      timeZone: zone,
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(instants[index]));
    expect(screen.getAllByText(time)).toHaveLength(2);
  }
  expect(screen.queryByText("Boundary 2")).toBeNull();
  expect(screen.queryByText("Boundary 3")).toBeNull();
});

it.each([
  {
    month: "March 2026",
    date: "2026-03-08",
    instants: ["2026-03-08T06:59:00Z", "2026-03-08T07:00:00Z"],
  },
  {
    month: "November 2026",
    date: "2026-11-01",
    instants: ["2026-11-01T05:45:00Z", "2026-11-01T06:15:00Z"],
  },
])("orders episodes by instant across the $month DST transition", ({
  month,
  date,
  instants,
}) => {
  preference.timeZone = "America/New_York";
  useQuery.mockReturnValue({
    data: {
      ...data,
      items: instants
        .map((airDateUtc, index) => ({
          ...data.items[0],
          id: `dst-${index}`,
          title: index ? "Earlier alphabetically" : "Later alphabetically",
          date,
          airDateUtc,
        }))
        .reverse(),
    },
  });
  render(<Calendar now={`${date}T12:00:00Z`} />);
  for (const label of [`${month} month calendar`, `${month} agenda`]) {
    const section = screen.getByLabelText(label);
    expect(
      within(section)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Later alphabetically", "Earlier alphabetically"]);
    expect(
      Array.from(
        section.querySelectorAll("time[datetime*='T']"),
        (time) => time.textContent,
      ),
    ).toEqual(
      instants.map((instant) =>
        new Intl.DateTimeFormat(undefined, {
          timeZone: "America/New_York",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(new Date(instant)),
      ),
    );
  }
  expect(
    screen.getByLabelText(`${month} agenda`).querySelectorAll("h3"),
  ).toHaveLength(1);
});

it.each([
  "Pacific/Kiritimati",
  "America/Los_Angeles",
])("preserves all date-only movie releases in %s", (zone) => {
  preference.timeZone = zone;
  useQuery.mockReturnValue({
    data: {
      ...data,
      items: ["2024-01-31", "2024-02-01", "2024-02-29", "2024-03-01"].flatMap(
        (date) =>
          data.items.slice(1, 4).map((item) => ({
            ...item,
            id: `${item.id}-${date}`,
            title: `${item.title} ${date}`,
            date,
          })),
      ),
    },
  });
  render(<Calendar now="2024-02-15T12:00:00Z" />);
  for (const label of [
    "February 2024 month calendar",
    "February 2024 agenda",
  ]) {
    const section = screen.getByLabelText(label);
    expect(section.querySelectorAll("li")).toHaveLength(6);
    expect(section.querySelectorAll("time[datetime*='T']")).toHaveLength(0);
    for (const date of ["2024-02-01", "2024-02-29"]) {
      const time = section.querySelector(`time[datetime='${date}']`);
      const group = label.endsWith("agenda")
        ? time?.closest("section")
        : time?.parentElement;
      for (const type of ["theatrical", "digital", "physical"]) {
        expect(
          within(group as HTMLElement).getByText(`${type} movie ${date}`),
        ).toBeTruthy();
      }
    }
  }
  expect(screen.queryByText(/movie 2024-01-31/)).toBeNull();
  expect(screen.queryByText(/movie 2024-03-01/)).toBeNull();
});

it("keeps the selected month while timezone changes regroup episodes and Today uses the new local date", () => {
  const now = "2026-09-01T00:30:00Z";
  const view = render(<Calendar now={now} />);
  fireEvent.click(screen.getByRole("button", { name: "Next month" }));
  fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
  const key = useQuery.mock.lastCall?.[0].queryKey;
  preference.timeZone = "Pacific/Kiritimati";
  view.rerender(<Calendar now={now} />);
  expect(screen.getByRole("heading", { name: "September 2026" })).toBeTruthy();
  expect(useQuery.mock.lastCall?.[0].queryKey).toEqual(key);
  const agenda = screen.getByLabelText("September 2026 agenda");
  const episodeGroup = within(agenda).getByText("Show").closest("section");
  expect(episodeGroup?.querySelector("h3 time")?.getAttribute("datetime")).toBe(
    "2026-09-03",
  );
  expect(
    within(agenda)
      .getByText("digital movie")
      .closest("section")
      ?.querySelector("h3 time")
      ?.getAttribute("datetime"),
  ).toBe("2026-09-02");
  preference.timeZone = "America/Los_Angeles";
  view.rerender(<Calendar now={now} />);
  expect(screen.getByRole("heading", { name: "September 2026" })).toBeTruthy();
  expect(useQuery.mock.lastCall?.[0].queryKey).toEqual(key);
  expect(
    within(agenda)
      .getByText("Show")
      .closest("section")
      ?.querySelector("h3 time")
      ?.getAttribute("datetime"),
  ).toBe("2026-09-02");
  expect(view.container.querySelector("[aria-current='date']")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Today" }));
  expect(screen.getByRole("heading", { name: "August 2026" })).toBeTruthy();
  expect(
    view.container
      .querySelector("[aria-current='date']")
      ?.getAttribute("datetime"),
  ).toBe("2026-08-31");
});

it.each([
  ["Pacific/Kiritimati", "2026-12-31T12:00:00Z", "January 2027", "2027-01-01"],
  [
    "America/Los_Angeles",
    "2024-03-01T00:30:00Z",
    "February 2024",
    "2024-02-29",
  ],
])("computes initial month and today in %s", (zone, now, month, date) => {
  preference.timeZone = zone;
  const view = render(<Calendar now={now} />);
  expect(screen.getByRole("heading", { name: month })).toBeTruthy();
  expect(
    view.container
      .querySelector("[aria-current='date']")
      ?.getAttribute("datetime"),
  ).toBe(date);
});

it("keeps an empty desktop calendar through preference and query loading, then populates it", () => {
  preference.timeZone = null;
  const view = render(<Calendar now="2026-09-06T12:00:00Z" />);
  let frame = screen.getByLabelText("September 2026 month calendar");
  expect(useQuery.mock.lastCall?.[0].enabled).toBe(false);
  expect(frame.querySelectorAll("li")).toHaveLength(0);
  expect(frame.querySelectorAll("time")).toHaveLength(30);
  expect(screen.queryByRole("status")).toBeNull();
  preference.timeZone = "UTC";
  useQuery.mockReturnValue({ isPending: true, isError: false });
  view.rerender(<Calendar now="2026-09-06T12:00:00Z" />);
  frame = screen.getByLabelText("September 2026 month calendar");
  expect(useQuery.mock.lastCall?.[0].enabled).toBe(true);
  expect(frame.querySelectorAll("li")).toHaveLength(0);
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(
    screen.queryByText(/Loading calendar|No scheduled|Connect a Sonarr/),
  ).toBeNull();
  useQuery.mockReturnValue({ data, isPending: false, isError: false });
  view.rerender(<Calendar now="2026-09-06T12:00:00Z" />);
  frame = screen.getByLabelText("September 2026 month calendar");
  expect(frame.querySelectorAll("li")).toHaveLength(5);
});

it("shows a preference error without hiding the calendar or fallback-zone events", () => {
  preference.error = "Could not load timezone preference. Using UTC.";
  render(<Calendar now="2026-09-06T12:00:00Z" />);
  expect(screen.getByRole("alert").textContent).toBe(preference.error);
  expect(screen.getByLabelText("September 2026 month calendar")).toBeTruthy();
  expect(screen.getAllByText("Show")).toHaveLength(2);
  const time = new Intl.DateTimeFormat(undefined, {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date("2026-09-02T23:30:00Z"));
  expect(screen.getAllByText(time)).toHaveLength(2);
});

it.each([
  {
    now: "2026-12-15T12:00:00Z",
    button: "Next month",
    title: "January 2027",
    start: "2026-12-31",
    end: "2027-02-02",
  },
  {
    now: "2027-01-15T12:00:00Z",
    button: "Previous month",
    title: "December 2026",
    start: "2026-11-30",
    end: "2027-01-02",
  },
  {
    now: "2024-03-15T12:00:00Z",
    button: "Previous month",
    title: "February 2024",
    start: "2024-01-31",
    end: "2024-03-02",
  },
])("prefetches $title on hover and focus with the same key as navigation", ({
  now,
  button,
  title,
  start,
  end,
}) => {
  render(<Calendar now={now} />);
  expect(prefetchQuery).not.toHaveBeenCalled();
  const control = screen.getByRole("button", { name: button });
  const currentKey = useQuery.mock.lastCall?.[0].queryKey;
  fireEvent.mouseEnter(control);
  fireEvent.focus(control);
  expect(prefetchQuery).toHaveBeenCalledTimes(2);
  for (const [options] of prefetchQuery.mock.calls) {
    expect(options.queryKey).toEqual(["calendar", start, end]);
  }
  expect(useQuery.mock.lastCall?.[0].queryKey).toEqual(currentKey);
  expect(screen.queryByRole("heading", { name: title })).toBeNull();
  fireEvent.click(control);
  expect(screen.getByRole("heading", { name: title })).toBeTruthy();
  expect(useQuery.mock.lastCall?.[0].queryKey).toEqual(
    prefetchQuery.mock.lastCall?.[0].queryKey,
  );
});

it("does not prefetch either adjacent month until the timezone preference resolves", () => {
  preference.timeZone = null;
  const view = render(<Calendar now="2026-12-15T12:00:00Z" />);
  for (const name of ["Previous month", "Next month"]) {
    fireEvent.mouseEnter(screen.getByRole("button", { name }));
    fireEvent.focus(screen.getByRole("button", { name }));
  }
  expect(prefetchQuery).not.toHaveBeenCalled();
  preference.timeZone = "Pacific/Kiritimati";
  view.rerender(<Calendar now="2026-12-15T12:00:00Z" />);
  fireEvent.mouseEnter(screen.getByRole("button", { name: "Next month" }));
  expect(prefetchQuery).toHaveBeenCalledTimes(1);
  expect(prefetchQuery.mock.lastCall?.[0].queryKey).toEqual([
    "calendar",
    "2026-12-31",
    "2027-02-02",
  ]);
});
