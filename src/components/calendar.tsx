"use client";

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { mediaHref } from "@/lib/client";
import { calendarQuery } from "@/lib/queries";
import type { CalendarEvent } from "@/lib/types";
import { PageHeader } from "./page-header";
import { Button, mutedStyle, Spinner } from "./ui";

const labels = {
  episode: "Episode airs",
  theatrical: "Theatrical release",
  digital: "Digital release",
  physical: "Physical release",
};
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Event({ event }: { event: CalendarEvent }) {
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
        {event.airDateUtc && ` / ${event.airDateUtc.slice(11, 16)} UTC`}
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

export function Calendar({ today }: { today: string }) {
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);
  const first = new Date(`${month}T00:00:00Z`);
  const next = new Date(first);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const end = next.toISOString().slice(0, 10);
  const query = useQuery(calendarQuery(month, end));
  const items = query.data?.items ?? [];
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
  return (
    <section>
      <PageHeader title="Calendar" />
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
        <h2
          aria-live="polite"
          className={css({
            fontSize: "20px",
            fontWeight: "600",
            letterSpacing: "-0.5px",
          })}
        >
          {title}
        </h2>
        <div className={css({ display: "flex", gap: "8px" })}>
          <Button aria-label="Previous month" onClick={() => move(-1)}>
            <CaretLeftIcon />
          </Button>
          <Button onClick={() => setMonth(`${today.slice(0, 7)}-01`)}>
            Today
          </Button>
          <Button aria-label="Next month" onClick={() => move(1)}>
            <CaretRightIcon />
          </Button>
        </div>
      </div>
      <p className={css({ color: "muted", fontSize: "11px", mb: "20px" })}>
        All days and episode times use UTC. Movie releases are dates, not
        showtimes; dates may change.
      </p>
      {query.isPending && (
        <output className={css({ display: "flex", gap: "10px", p: "24px" })}>
          <Spinner />
          Loading calendar...
        </output>
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
      {query.data && (
        <>
          {items.length === 0 && (
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
                          <Event key={event.id} event={event} />
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
                              <Event key={event.id} event={event} />
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
                    <Event key={event.id} event={event} />
                  ))}
                </ul>
              </section>
            ))}
          </section>
        </>
      )}
    </section>
  );
}
