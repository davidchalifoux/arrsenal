const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "3 hours ago", "yesterday", or "just now" for recent past timestamps. */
export function relativeTime(iso: string, now = Date.now()) {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  if (!Number.isFinite(seconds)) return "";
  if (Math.abs(seconds) < 60) return "just now";
  for (const [unit, size] of units)
    if (Math.abs(seconds) >= size)
      return relative.format(Math.round(seconds / size), unit);
  return "just now";
}

/** The full local date and time, for a tooltip beside a relative time. */
export function fullDateTime(iso: string, timeZone?: string | null) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}
