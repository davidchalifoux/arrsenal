"use client";

import {
  ArrowClockwiseIcon,
  CalendarDotIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ListBulletsIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { mediaHref } from "@/lib/client";
import { calendarQuery } from "@/lib/queries";
import { useTimezonePreference } from "@/lib/timezone-preference";
import type { CalendarEvent } from "@/lib/types";
import {
  Page,
  PageHeader,
  PageToolbar,
  pageFooterStyle,
  ToolbarButton,
  ToolbarDivider,
} from "./page-header";
import { Button, Modal, mutedStyle } from "./ui";

const labels = {
  episode: "Episode airs",
  theatrical: "Theatrical release",
  digital: "Digital release",
  physical: "Physical release",
};
const typeColors: Record<CalendarEvent["type"], string> = {
  episode: "var(--info)",
  theatrical: "var(--accent)",
  digital: "var(--positive)",
  physical: "var(--warning)",
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
  compact = false,
}: {
  event: CalendarEvent;
  timeZone: string;
  compact?: boolean;
}) {
  const validIdentity =
    event.mediaId &&
    (event.kind === "movie"
      ? /^movie:tmdb:[1-9]\d*$/
      : /^series:tvdb:[1-9]\d*$/
    ).test(event.mediaId);
  const color = typeColors[event.type];
  return (
    <li
      className={css({
        position: "relative",
        minWidth: 0,
        borderRadius: "7px",
        p: compact ? "4px 7px" : "10px 12px",
        fontSize: compact ? "12px" : "13px",
        overflowWrap: "anywhere",
        _hover: { filter: "brightness(1.15)" },
      })}
      style={{
        background: `color-mix(in srgb, ${color} ${compact ? 12 : 9}%, transparent)`,
      }}
    >
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "6px",
          minWidth: 0,
          fontWeight: "500",
        })}
      >
        <span
          aria-hidden="true"
          className={css({
            width: "6px",
            height: "6px",
            borderRadius: "999px",
            flexShrink: 0,
          })}
          style={{ background: color }}
        />
        <span
          className={css({
            minWidth: 0,
            overflow: compact ? "hidden" : undefined,
            textOverflow: compact ? "ellipsis" : undefined,
            whiteSpace: compact ? "nowrap" : undefined,
          })}
        >
          {validIdentity && event.mediaId ? (
            <Link
              className={css({
                color: "ink",
                _after: { content: '""', position: "absolute", inset: 0 },
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
            <strong className={css({ fontWeight: "500" })}>
              {event.title}
            </strong>
          )}
          {event.type === "episode" && (
            <span className={css({ color: "muted", fontWeight: "400" })}>
              {" · "}S{String(event.seasonNumber).padStart(2, "0")}E
              {String(event.episodeNumber).padStart(2, "0")}
            </span>
          )}
        </span>
      </div>
      <div
        className={css({
          pl: "12px",
          mt: "1px",
          color: "muted",
          fontSize: "11px",
          overflow: compact ? "hidden" : undefined,
          textOverflow: compact ? "ellipsis" : undefined,
          whiteSpace: compact ? "nowrap" : undefined,
        })}
      >
        {!(compact && event.airDateUtc) && <span>{labels[event.type]}</span>}
        {event.airDateUtc && (
          <>
            {compact ? "" : " · "}
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
      {!compact && (
        <>
          {event.type === "episode" && event.episodeTitle && (
            <p className={css({ pl: "12px", mt: "3px", color: "soft" })}>
              {event.episodeTitle}
            </p>
          )}
          <p
            className={css({
              pl: "12px",
              mt: "3px",
              color: "subtle",
              fontSize: "11px",
            })}
          >
            {event.sources.map((source) => source.instanceName).join(", ")}
          </p>
        </>
      )}
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
  const [view, setView] = useState<"month" | "agenda">("month");
  const [openDay, setOpenDay] = useState<string | null>(null);
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
  const eventCount = items.length;
  return (
    <Page
      toolbar={
        <PageToolbar
          label="Calendar actions"
          actions={
            <>
              <ToolbarButton
                icon={SquaresFourIcon}
                label="Month"
                aria-pressed={view === "month"}
                onClick={() => setView("month")}
                styles={css.raw({
                  display: { base: "none", md: "inline-flex" },
                })}
              />
              <ToolbarButton
                icon={ListBulletsIcon}
                label="Agenda"
                aria-pressed={view === "agenda"}
                onClick={() => setView("agenda")}
                styles={css.raw({
                  display: { base: "none", md: "inline-flex" },
                })}
              />
            </>
          }
        >
          <ToolbarButton
            icon={ArrowClockwiseIcon}
            label="Refresh"
            aria-label="Refresh calendar"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          />
          <ToolbarButton
            icon={CalendarDotIcon}
            label="Today"
            aria-label="Today"
            onClick={() => setMonth(`${today.slice(0, 7)}-01`)}
          />
          <ToolbarDivider />
          <ToolbarButton
            icon={CaretLeftIcon}
            label="Previous"
            aria-label="Previous month"
            onClick={() => move(-1)}
            onMouseEnter={() => prefetchMonth(-1)}
            onFocus={() => prefetchMonth(-1)}
          />
          <ToolbarButton
            icon={CaretRightIcon}
            label="Next"
            aria-label="Next month"
            onClick={() => move(1)}
            onMouseEnter={() => prefetchMonth(1)}
            onFocus={() => prefetchMonth(1)}
          />
        </PageToolbar>
      }
      footer={
        <footer className={pageFooterStyle}>
          {(Object.keys(labels) as CalendarEvent["type"][]).map((type) => (
            <span
              key={type}
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "6px",
              })}
            >
              <span
                aria-hidden="true"
                className={css({
                  width: "7px",
                  height: "7px",
                  borderRadius: "2px",
                })}
                style={{ background: typeColors[type] }}
              />
              {labels[type]}
            </span>
          ))}
        </footer>
      }
    >
      <PageHeader
        title={<span aria-live="polite">{title}</span>}
        actions={
          <span className={css({ fontSize: "12px", color: "subtle" })}>
            {query.data
              ? `${eventCount} ${eventCount === 1 ? "event" : "events"} · `
              : ""}
            times in {timeZone}
          </span>
        }
      />
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
        className={cx(
          css({
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            bg: "surface",
            border: "1px solid token(colors.line)",
            borderRadius: "14px",
            overflow: "hidden",
          }),
          // Whole classes per view: merging two conflicting display classes
          // leaves the winner to stylesheet order.
          view === "agenda"
            ? css({ display: "none" })
            : css({ display: { base: "none", md: "grid" } }),
        )}
      >
        {weekdays.map((day) => (
          <div
            key={day}
            className={css({
              bg: "raised",
              px: "12px",
              height: "34px",
              display: "flex",
              alignItems: "center",
              fontSize: "11px",
              fontWeight: "600",
              letterSpacing: ".05em",
              textTransform: "uppercase",
              color: "subtle",
              borderBottom: "1px solid token(colors.line)",
            })}
          >
            {day}
          </div>
        ))}
        {Array.from({ length: cells }, (_, index) => {
          const day = index - first.getUTCDay() + 1;
          const date = `${month.slice(0, 7)}-${String(day).padStart(2, "0")}`;
          const events = groups.get(date) ?? [];
          const inMonth = day > 0 && day <= days;
          return (
            <div
              key={date}
              className={css({
                minHeight: "132px",
                p: "8px",
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                borderRight: "1px solid token(colors.lineSoft)",
                borderBottom: "1px solid token(colors.lineSoft)",
                "&:nth-child(7n)": { borderRight: 0 },
              })}
              style={
                inMonth
                  ? undefined
                  : {
                      background:
                        "color-mix(in srgb, var(--canvas) 60%, transparent)",
                    }
              }
            >
              {inMonth && (
                <>
                  <time
                    dateTime={date}
                    aria-current={date === today ? "date" : undefined}
                    className={css({
                      alignSelf: "flex-start",
                      minWidth: "24px",
                      height: "24px",
                      px: "6px",
                      display: "grid",
                      placeItems: "center",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: date === today ? "700" : "500",
                      bg: date === today ? "accent" : "transparent",
                      color: date === today ? "onAccent" : "soft",
                    })}
                  >
                    {day}
                  </time>
                  <ul className={css({ display: "grid", gap: "4px" })}>
                    {events.slice(0, 2).map((event) => (
                      <Event
                        key={event.id}
                        event={event}
                        timeZone={timeZone}
                        compact
                      />
                    ))}
                  </ul>
                  {events.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setOpenDay(date)}
                      aria-label={`Show all ${events.length} events on ${new Date(date).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}`}
                      className={css({
                        alignSelf: "flex-start",
                        px: "7px",
                        py: "1px",
                        border: 0,
                        borderRadius: "5px",
                        bg: "elevated",
                        color: "soft",
                        fontSize: "11px",
                        fontWeight: "600",
                        _hover: { color: "ink" },
                      })}
                    >
                      +{events.length - 2} more
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </section>
      <section
        aria-label={`${title} agenda`}
        className={cx(
          css({ gap: "24px" }),
          view === "agenda"
            ? css({ display: "grid" })
            : css({ display: { base: "grid", md: "none" } }),
        )}
      >
        {[...groups].map(([date, events]) => (
          <section key={date}>
            <h3
              className={css({
                fontSize: "13px",
                fontWeight: "600",
                mb: "10px",
                color: "soft",
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
      <Modal
        open={openDay !== null}
        onOpenChange={(open) => {
          if (!open) setOpenDay(null);
        }}
        title={
          openDay
            ? new Date(openDay).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                timeZone: "UTC",
              })
            : ""
        }
        description={
          openDay ? `${groups.get(openDay)?.length ?? 0} events` : undefined
        }
      >
        <ul className={css({ display: "grid", gap: "6px" })}>
          {(openDay ? (groups.get(openDay) ?? []) : []).map((event) => (
            <Event key={event.id} event={event} timeZone={timeZone} />
          ))}
        </ul>
      </Modal>
    </Page>
  );
}
