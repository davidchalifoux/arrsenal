import { z } from "zod";
import type { MediaItem, MediaStatus } from "./types";

/*
 * Custom library filters, modeled on Sonarr's filter builder: named rule
 * sets that match all or any of their rules, with one level of nested
 * groups. Definitions live in the server preferences so every browser
 * sees the same saved filters.
 */

export const filterFields = [
  "type",
  "status",
  "target",
  "targetStatus",
  "qualityProfile",
  "fileQuality",
  "monitored",
  "year",
  "rating",
  "genre",
  "size",
  "episodeProgress",
  "added",
] as const;
export type FilterField = (typeof filterFields)[number];

export const filterOperators = [
  "is",
  "isNot",
  "includes",
  "excludes",
  "contains",
  "greaterThan",
  "lessThan",
  "inLast",
  "notInLast",
] as const;
export type FilterOperator = (typeof filterOperators)[number];

type FieldKind = "choice" | "list" | "text" | "number" | "boolean" | "days";

export const fieldDefinitions: Record<
  FilterField,
  { label: string; kind: FieldKind; operators: FilterOperator[]; unit?: string }
> = {
  type: { label: "Type", kind: "choice", operators: ["is", "isNot"] },
  status: { label: "Status", kind: "choice", operators: ["is", "isNot"] },
  target: {
    label: "Target",
    kind: "list",
    operators: ["includes", "excludes"],
  },
  targetStatus: {
    label: "Target status",
    kind: "choice",
    operators: ["is", "isNot"],
  },
  qualityProfile: {
    label: "Quality profile",
    kind: "list",
    operators: ["includes", "excludes"],
  },
  fileQuality: {
    label: "File quality",
    kind: "text",
    operators: ["contains"],
  },
  monitored: { label: "Monitored", kind: "boolean", operators: ["is"] },
  year: {
    label: "Year",
    kind: "number",
    operators: ["is", "greaterThan", "lessThan"],
  },
  rating: {
    label: "Rating",
    kind: "number",
    operators: ["greaterThan", "lessThan"],
  },
  genre: { label: "Genre", kind: "list", operators: ["includes", "excludes"] },
  size: {
    label: "Size on disk",
    kind: "number",
    operators: ["greaterThan", "lessThan"],
    unit: "GB",
  },
  episodeProgress: {
    label: "Episode progress",
    kind: "number",
    operators: ["greaterThan", "lessThan", "is"],
    unit: "%",
  },
  added: {
    label: "Added",
    kind: "days",
    operators: ["inLast", "notInLast"],
    unit: "days",
  },
};

export const operatorLabels: Record<FilterOperator, string> = {
  is: "is",
  isNot: "is not",
  includes: "includes",
  excludes: "excludes",
  contains: "contains",
  greaterThan: "is greater than",
  lessThan: "is less than",
  inLast: "in the last",
  notInLast: "not in the last",
};

export const typeChoices = [
  { value: "movie", label: "Movie" },
  { value: "series", label: "Show" },
];

export const statusChoices: { value: MediaStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "partial", label: "Partially available" },
  { value: "missing", label: "Missing" },
  { value: "downloading", label: "Downloading" },
];

const ruleSchema = z.strictObject({
  field: z.enum(filterFields),
  operator: z.enum(filterOperators),
  values: z.array(z.string().max(200)).max(50),
});
export type FilterRule = z.infer<typeof ruleSchema>;

const groupSchema = z.strictObject({
  match: z.enum(["all", "any"]),
  rules: z.array(ruleSchema).max(20),
});
export type FilterGroup = z.infer<typeof groupSchema>;

export const customFilterSchema = z.strictObject({
  id: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,64}$/)
    .refine((value) => !value.startsWith("preset-"), {
      error: "Custom filter IDs cannot use the preset prefix.",
    }),
  name: z.string().trim().min(1).max(80),
  match: z.enum(["all", "any"]),
  rules: z.array(ruleSchema).max(20),
  groups: z.array(groupSchema).max(5).default([]),
});
export type CustomFilter = z.infer<typeof customFilterSchema>;

export type FilterDefinition = Pick<CustomFilter, "match" | "rules"> & {
  groups?: FilterGroup[];
};

export const presetFilters: {
  id: string;
  name: string;
  definition: FilterDefinition;
}[] = [
  {
    id: "preset-monitored",
    name: "Monitored",
    definition: {
      match: "all",
      rules: [{ field: "monitored", operator: "is", values: ["true"] }],
    },
  },
  {
    id: "preset-unmonitored",
    name: "Unmonitored",
    definition: {
      match: "all",
      rules: [{ field: "monitored", operator: "is", values: ["false"] }],
    },
  },
  {
    id: "preset-missing",
    name: "Missing",
    definition: {
      match: "all",
      rules: [{ field: "status", operator: "is", values: ["missing"] }],
    },
  },
  {
    id: "preset-partial",
    name: "Partially available",
    definition: {
      match: "all",
      rules: [{ field: "status", operator: "is", values: ["partial"] }],
    },
  },
  {
    id: "preset-recent",
    name: "Added in the last 30 days",
    definition: {
      match: "all",
      rules: [{ field: "added", operator: "inLast", values: ["30"] }],
    },
  },
];

function number(value: string | undefined) {
  if (value === undefined || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function episodePercent(item: MediaItem) {
  const count = item.targets.reduce(
    (total, target) => total + (target.episodeCount ?? 0),
    0,
  );
  if (!count) return null;
  const files = item.targets.reduce(
    (total, target) => total + (target.episodeFileCount ?? 0),
    0,
  );
  return (files / count) * 100;
}

function compare(
  actual: number | null,
  operator: FilterOperator,
  expected: number | null,
) {
  // A rule still being filled in should not hide the whole library.
  if (expected === null) return true;
  if (actual === null) return false;
  if (operator === "greaterThan") return actual > expected;
  if (operator === "lessThan") return actual < expected;
  return actual === expected;
}

function negate(operator: FilterOperator) {
  return operator === "isNot" || operator === "excludes";
}

export function matchesRule(item: MediaItem, rule: FilterRule, now: number) {
  const values = rule.values;
  const any = (candidates: string[]) =>
    candidates.some((candidate) => values.includes(candidate));
  switch (rule.field) {
    case "type":
    case "status": {
      const hit = values.includes(
        rule.field === "type" ? item.kind : item.status,
      );
      return negate(rule.operator) ? !hit : hit;
    }
    case "target": {
      const hit = any(item.targets.map((target) => target.instanceId));
      return negate(rule.operator) ? !hit : hit;
    }
    case "targetStatus": {
      const hit = any(item.targets.map((target) => target.status));
      return negate(rule.operator) ? !hit : hit;
    }
    case "qualityProfile": {
      const hit = any(item.targets.map((target) => target.qualityProfile));
      return negate(rule.operator) ? !hit : hit;
    }
    case "genre": {
      const genres = item.genres.map((genre) => genre.toLowerCase());
      const hit = values.some((value) => genres.includes(value.toLowerCase()));
      return negate(rule.operator) ? !hit : hit;
    }
    case "fileQuality": {
      const needle = (values[0] ?? "").trim().toLowerCase();
      if (!needle) return true;
      return item.targets.some((target) =>
        target.quality.toLowerCase().includes(needle),
      );
    }
    case "monitored": {
      const wanted = values[0] !== "false";
      return item.targets.some((target) => target.monitored === wanted);
    }
    case "year":
      return compare(item.year || null, rule.operator, number(values[0]));
    case "rating":
      return compare(item.rating ?? null, rule.operator, number(values[0]));
    case "size": {
      const bytes = item.targets.reduce(
        (total, target) => total + target.sizeOnDisk,
        0,
      );
      return compare(bytes / 1024 ** 3, rule.operator, number(values[0]));
    }
    case "episodeProgress":
      return compare(episodePercent(item), rule.operator, number(values[0]));
    case "added": {
      const days = number(values[0]);
      const added = Date.parse(item.added);
      if (days === null) return true;
      if (Number.isNaN(added)) return false;
      const recent = now - added <= days * 86_400_000;
      return rule.operator === "notInLast" ? !recent : recent;
    }
  }
}

function matchesSet(match: "all" | "any", results: boolean[]) {
  if (!results.length) return true;
  return match === "all" ? results.every(Boolean) : results.some(Boolean);
}

export function matchesFilter(
  item: MediaItem,
  definition: FilterDefinition,
  now = Date.now(),
) {
  const results = [
    ...definition.rules.map((rule) => matchesRule(item, rule, now)),
    ...(definition.groups ?? []).map((group) =>
      matchesSet(
        group.match,
        group.rules.map((rule) => matchesRule(item, rule, now)),
      ),
    ),
  ];
  return matchesSet(definition.match, results);
}

export function defaultRule(field: FilterField = "type"): FilterRule {
  const definition = fieldDefinitions[field];
  return {
    field,
    operator: definition.operators[0],
    values:
      definition.kind === "boolean"
        ? ["true"]
        : field === "type"
          ? ["movie"]
          : field === "status" || field === "targetStatus"
            ? ["available"]
            : [],
  };
}
