"use client";

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { mediaHref } from "@/lib/client";
import { calendarQuery } from "@/lib/queries";
import { useTimezonePreference } from "@/lib/timezone-preference";
import type { CalendarEvent } from "@/lib/types";
import { Button, mutedStyle } from "./ui";

const labels = {
  episode: "Episode airs",
  theatrical: "Theatrical release",
  digital: "Digital release",
  physical: "Physical release",
};
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthQuery(first: Date) {
  const next = new Date(first);
  next.setUTCMonth(next.getUTCMonth() + 1);
  // Include adjacent UTC days so timezone shifts cannot hide boundary events.
  return calendarQuery(
    new Date(first.getTime() - 86400000).toISOString().slice(0, 10),
    new Date(next.getTime() + 86400000).toISOString().slice(0, 10),
  );
}

function localDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join("-");
}

function Event({
  event,
  timeZone,
}: {
  event: CalendarEvent;
  timeZone: string;
}) {
  const validIdentity =
    event.mediaId &&
    (event.kind === "movie"
      ? /^movie:tmdb:[1-9]\d*$/
      : /^series:tvdb:[1-9]\d*$/
    ).test(event.mediaId);
  return (
    <li
      className={css({
        bg: "elevated",
        borderLeft: "2px solid",
        borderColor: event.type === "episode" ? "accent" : "muted",
        borderRadius: "4px",
        p: "8px",
        fontSize: "11px",
        overflowWrap: "anywhere",
      })}
    >
      <div className={css({ color: "muted", fontSize: "10px", mb: "4px" })}>
        {labels[event.type]}
        {event.airDateUtc && (
          <>
            {" / "}
            <time dateTime={event.airDateUtc}>
              {new Intl.DateTimeFormat(undefined, {
                timeZone,
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              }).format(new Date(event.airDateUtc))}
            </time>
          </>
        )}
      </div>
      {validIdentity && event.mediaId ? (
        <Link
          className={css({
            fontWeight: "600",
            _hover: { textDecoration: "underline" },
          })}
          href={mediaHref({
            id: event.mediaId,
            kind: event.kind,
            title: event.title,
          })}
        >
          {event.title}
        </Link>
      ) : (
        <strong>{event.title}</strong>
      )}
      {event.type === "episode" && (
        <p className={css({ color: "muted", mt: "4px" })}>
          S{String(event.seasonNumber).padStart(2, "0")}E
          {String(event.episodeNumber).padStart(2, "0")}
          {event.episodeTitle && ` / ${event.episodeTitle}`}
        </p>
      )}
      <p className={css({ color: "subtle", mt: "4px", fontSize: "10px" })}>
        {event.sources.map((source) => source.instanceName).join(", ")}
      </p>
    </li>
  );
}

export function Calendar({ now }: { now: string }) {
  const client = useQueryClient();
  const { timeZone: preference, error: preferenceError } =
    useTimezonePreference();
  const timeZone = preference ?? "UTC";
  const today = localDate(new Date(now), timeZone);
  const [selectedMonth, setMonth] = useState<string | null>(null);
  const month = selectedMonth ?? `${today.slice(0, 7)}-01`;
  const first = new Date(`${month}T00:00:00Z`);
  const next = new Date(first);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const end = next.toISOString().slice(0, 10);
  const query = useQuery({
    ...monthQuery(first),
    enabled: preference !== null,
  });
  const items = (preference ? (query.data?.items ?? []) : [])
    .map((event) => ({
      ...event,
      date: event.airDateUtc
        ? localDate(new Date(event.airDateUtc), timeZone)
        : event.date,
    }))
    .filter((event) => event.date >= month && event.date < end)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.airDateUtc ?? "").localeCompare(b.airDateUtc ?? "") ||
        a.title.localeCompare(b.title),
    );
  const days = new Date(next.getTime() - 86400000).getUTCDate();
  const cells = Math.ceil((first.getUTCDay() + days) / 7) * 7;
  const title = first.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of items)
    groups.set(event.date, [...(groups.get(event.date) ?? []), event]);
  function move(offset: number) {
    const date = new Date(first);
    date.setUTCMonth(date.getUTCMonth() + offset);
    setMonth(date.toISOString().slice(0, 10));
  }
  function prefetchMonth(offset: number) {
    if (!preference) return;
    const date = new Date(first);
    date.setUTCMonth(date.getUTCMonth() + offset);
    void client.prefetchQuery(monthQuery(date));
  }
  return (
    <section>
      <div
        className={css({
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          mb: "12px",
        })}
      >
        <h1
          aria-live="polite"
          className={css({
            fontSize: "20px",
            fontWeight: "550",
            letterSpacing: "-.4px",
          })}
        >
          {title}
        </h1>
        <div className={css({ display: "flex", gap: "8px" })}>
          <Button
            aria-label="Previous month"
            onClick={() => move(-1)}
            onMouseEnter={() => prefetchMonth(-1)}
            onFocus={() => prefetchMonth(-1)}
          >
            <CaretLeftIcon />
          </Button>
          <Button onClick={() => setMonth(`${today.slice(0, 7)}-01`)}>
            Today
          </Button>
          <Button
            aria-label="Next month"
            onClick={() => move(1)}
            onMouseEnter={() => prefetchMonth(1)}
            onFocus={() => prefetchMonth(1)}
          >
            <CaretRightIcon />
          </Button>
        </div>
      </div>
      <p className={css({ color: "muted", fontSize: "11px", mb: "20px" })}>
        Episode times in{" "}
        {preference?.replaceAll("_", " ") ?? "your selected timezone"}.{" "}
        <Link
          href="/settings/personalization"
          className={css({ textDecoration: "underline" })}
        >
          Change timezone
        </Link>{" "}
        Movie releases are dates, not showtimes; dates may change.
      </p>
      {preferenceError && (
        <p role="alert" className={css({ color: "negative", mb: "16px" })}>
          {preferenceError}
        </p>
      )}
      {query.isError && (
        <div role="alert" className={css({ color: "negative", mb: "16px" })}>
          <p>{query.error.message}</p>
          <Button onClick={() => void query.refetch()}>Retry calendar</Button>
        </div>
      )}
      {query.data?.errors.map((error) => (
        <p
          role="alert"
          key={error.instanceId}
          className={css({ color: "negative", mb: "12px", fontSize: "12px" })}
        >
          {error.instanceName}: {error.message} Calendar may be incomplete.
        </p>
      ))}
      {preference &&
        query.data &&
        !query.isPending &&
        !query.isError &&
        items.length === 0 && (
          <output className={mutedStyle}>
            {query.data.instanceCount === 0 ? (
              <>
                Connect a Sonarr or Radarr instance in{" "}
                <Link
                  href="/settings"
                  className={css({ textDecoration: "underline" })}
                >
                  Settings
                </Link>{" "}
                to see your calendar.
              </>
            ) : query.data.errors.length ? (
              "No events from available instances this month."
            ) : (
              "No scheduled releases or episodes for your tracked titles this month."
            )}
          </output>
        )}
      <section
        aria-label={`${title} month calendar`}
        className={css({
          display: { base: "none", md: "grid" },
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          gap: "1px",
          bg: "line",
          border: "1px solid token(colors.line)",
          borderRadius: "8px",
          overflow: "hidden",
          mt: "16px",
        })}
      >
        {weekdays.map((day) => (
          <div
            key={day}
            className={css({
              bg: "surface",
              p: "10px",
              fontSize: "11px",
              color: "muted",
            })}
          >
            {day}
          </div>
        ))}
        {Array.from({ length: cells }, (_, index) => {
          const day = index - first.getUTCDay() + 1;
          const date = `${month.slice(0, 7)}-${String(day).padStart(2, "0")}`;
          const events = groups.get(date) ?? [];
          return (
            <div
              key={date}
              className={css({
                bg: "canvas",
                minHeight: "130px",
                p: "8px",
                minWidth: 0,
              })}
            >
              {day > 0 && day <= days && (
                <>
                  <time
                    dateTime={date}
                    aria-current={date === today ? "date" : undefined}
                    className={css({
                      display: "inline-block",
                      mb: "8px",
                      fontSize: "12px",
                      borderRadius: "4px",
                      px: "5px",
                      bg: date === today ? "accent" : "transparent",
                      color: date === today ? "canvas" : "muted",
                    })}
                  >
                    {day}
                  </time>
                  <ul className={css({ display: "grid", gap: "6px" })}>
                    {events.slice(0, 2).map((event) => (
                      <Event key={event.id} event={event} timeZone={timeZone} />
                    ))}
                  </ul>
                  {events.length > 2 && (
                    <details className={css({ mt: "8px" })}>
                      <summary
                        className={css({
                          color: "muted",
                          fontSize: "11px",
                          cursor: "pointer",
                          py: "4px",
                          _hover: { color: "ink" },
                        })}
                      >
                        {events.length - 2} more events
                      </summary>
                      <ul
                        className={css({
                          display: "grid",
                          gap: "6px",
                          mt: "6px",
                        })}
                      >
                        {events.slice(2).map((event) => (
                          <Event
                            key={event.id}
                            event={event}
                            timeZone={timeZone}
                          />
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </div>
          );
        })}
      </section>
      <section
        aria-label={`${title} agenda`}
        className={css({
          display: { base: "grid", md: "none" },
          gap: "24px",
          mt: "20px",
        })}
      >
        {[...groups].map(([date, events]) => (
          <section key={date}>
            <h3
              className={css({
                fontSize: "13px",
                mb: "10px",
                color: "muted",
              })}
            >
              <time dateTime={date}>
                {new Date(date).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </time>
              {date === today && " / Today"}
            </h3>
            <ul className={css({ display: "grid", gap: "8px" })}>
              {events.map((event) => (
                <Event key={event.id} event={event} timeZone={timeZone} />
              ))}
            </ul>
          </section>
        ))}
      </section>
    </section>
  );
}
