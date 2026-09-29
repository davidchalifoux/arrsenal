import type { ColumnDefinition } from "./table-columns";

/** Every library table column except the always-shown title, in default order. */
export const libraryColumns: ColumnDefinition[] = [
  { key: "title", label: "Title", locked: true },
  { key: "year", label: "Year" },
  { key: "type", label: "Type" },
  { key: "targets", label: "Targets" },
  { key: "episodes", label: "Episodes" },
  { key: "monitored", label: "Monitored" },
  { key: "size", label: "On disk" },
  { key: "added", label: "Added" },
  { key: "rating", label: "Rating", defaultVisible: false },
  { key: "genres", label: "Genres", defaultVisible: false },
  { key: "runtime", label: "Runtime", defaultVisible: false },
  { key: "profile", label: "Quality profile", defaultVisible: false },
];
