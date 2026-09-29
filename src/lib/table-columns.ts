import { z } from "zod";

/** Tables whose columns people can show, hide, and reorder. */
export const tableIds = [
  "library",
  "queue",
  "history",
  "blocklist",
  "wanted",
] as const;
export type TableId = (typeof tableIds)[number];

/** A saved column choice. The array's order is the column order. */
export const columnSettingSchema = z.strictObject({
  key: z.string().min(1).max(40),
  visible: z.boolean(),
});
export type ColumnSetting = z.infer<typeof columnSettingSchema>;

export const tableSettingsSchema = z
  .partialRecord(z.enum(tableIds), z.array(columnSettingSchema).max(40))
  .refine(
    (tables) =>
      Object.values(tables).every(
        (columns) =>
          new Set(columns?.map((column) => column.key)).size ===
          columns?.length,
      ),
    { error: "Column keys must be unique within a table." },
  );
export type TableSettings = Partial<Record<TableId, ColumnSetting[]>>;

export interface ColumnDefinition {
  key: string;
  label: string;
  /** Always shown and always first, like Sonarr's series title. */
  locked?: boolean;
  /** Shown until someone hides it. Defaults to true. */
  defaultVisible?: boolean;
}

export interface ResolvedColumn {
  key: string;
  label: string;
  visible: boolean;
  locked: boolean;
}

/**
 * The table's columns in saved order. Saved keys the table no longer has are
 * dropped, and columns added since the save appear where the defaults put them.
 */
export function resolveColumns(
  definitions: readonly ColumnDefinition[],
  saved?: readonly ColumnSetting[],
): ResolvedColumn[] {
  const byKey = new Map(definitions.map((column) => [column.key, column]));
  const resolve = (
    column: ColumnDefinition,
    visible = column.defaultVisible ?? true,
  ): ResolvedColumn => ({
    key: column.key,
    label: column.label,
    visible: column.locked ? true : visible,
    locked: column.locked ?? false,
  });
  const locked = definitions
    .filter((column) => column.locked)
    .map((c) => resolve(c));
  const ordered: ResolvedColumn[] = [];
  const seen = new Set(locked.map((column) => column.key));
  for (const setting of saved ?? []) {
    const column = byKey.get(setting.key);
    if (!column || seen.has(column.key)) continue;
    seen.add(column.key);
    ordered.push(resolve(column, setting.visible));
  }
  // Insert new columns after the column that precedes them by default.
  for (const [index, column] of definitions.entries()) {
    if (seen.has(column.key)) continue;
    seen.add(column.key);
    const previous = definitions
      .slice(0, index)
      .reverse()
      .find((candidate) =>
        ordered.some((entry) => entry.key === candidate.key),
      );
    const at = previous
      ? ordered.findIndex((entry) => entry.key === previous.key) + 1
      : 0;
    ordered.splice(at, 0, resolve(column));
  }
  return [...locked, ...ordered];
}

/** The settings to save for resolved columns, without the locked ones. */
export function columnSettings(columns: readonly ResolvedColumn[]) {
  return columns
    .filter((column) => !column.locked)
    .map(({ key, visible }) => ({ key, visible }));
}
