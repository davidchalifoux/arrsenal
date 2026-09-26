import { z } from "zod";
import { customFilterSchema } from "./library-filters";
import { librarySorts } from "./library-selectors";

export const posterSizes = ["small", "medium", "large", "huge"] as const;
export type PosterSize = (typeof posterSizes)[number];

export const cardDetails = [
  { key: "showTitle", label: "Title", hint: "Show the title under the poster" },
  { key: "showYear", label: "Year", hint: "Release or first-air year" },
  {
    key: "showTargets",
    label: "Target chips",
    hint: "One chip per instance, with its status dot",
  },
  {
    key: "showEpisodes",
    label: "Episode progress",
    hint: "Downloaded / total episodes for shows",
  },
  { key: "showRating", label: "Rating", hint: "TMDB rating" },
  {
    key: "showSize",
    label: "Size on disk",
    hint: "Combined across all targets",
  },
] as const;
export type CardDetail = (typeof cardDetails)[number]["key"];

export const libraryViewSchema = z.strictObject({
  posterSize: z.enum(posterSizes),
  chipLabel: z.enum(["profile", "quality"]),
  showTitle: z.boolean(),
  showYear: z.boolean(),
  showTargets: z.boolean(),
  showEpisodes: z.boolean(),
  showRating: z.boolean(),
  showSize: z.boolean(),
});
export type LibraryViewOptions = z.infer<typeof libraryViewSchema>;

export const defaultViewOptions: LibraryViewOptions = {
  posterSize: "medium",
  chipLabel: "profile",
  showTitle: true,
  showYear: true,
  showTargets: true,
  showEpisodes: false,
  showRating: false,
  showSize: false,
};

export const libraryDefaultsSchema = z.strictObject({
  layout: z.enum(["grid", "list"]),
  sort: z.enum(librarySorts),
  sortDirection: z.enum(["asc", "desc"]),
});
export type LibraryDefaults = z.infer<typeof libraryDefaultsSchema>;

export const libraryPreferencesSchema = z.strictObject({
  view: libraryViewSchema.optional(),
  filters: z
    .array(customFilterSchema)
    .max(50)
    .refine(
      (filters) =>
        new Set(filters.map((filter) => filter.id)).size === filters.length,
      { error: "Custom filter IDs must be unique." },
    )
    .optional(),
  defaults: libraryDefaultsSchema.optional(),
});
export type LibraryPreferences = z.infer<typeof libraryPreferencesSchema>;
