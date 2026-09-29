"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  DotsSixVerticalIcon,
  LockSimpleIcon,
} from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import { type DragEvent, useState } from "react";
import { usePreferences, useSavePreferences } from "@/lib/preferences";
import {
  type ColumnDefinition,
  columnSettings,
  type ResolvedColumn,
  resolveColumns,
  type TableId,
} from "@/lib/table-columns";
import { Button, Modal, Notice } from "./ui";

/** Column choices a table receives from its screen, with a way to change them. */
export interface TableColumnsControl {
  columns: ResolvedColumn[];
  /** New column order and visibility, or null to reset to the defaults. */
  onChange: (columns: ResolvedColumn[] | null) => void;
  error?: string | null;
}

/** Saved column choices for one table, shared by everyone on this server. */
export function useTableColumns(
  table: TableId,
  definitions: readonly ColumnDefinition[],
): TableColumnsControl {
  const preferences = usePreferences();
  const save = useSavePreferences();
  const [error, setError] = useState<string | null>(null);
  return {
    columns: resolveColumns(definitions, preferences.data?.tables?.[table]),
    error,
    onChange(next) {
      setError(null);
      const tables = { ...preferences.data?.tables };
      if (next) tables[table] = columnSettings(next);
      else delete tables[table];
      save.mutate(
        { tables },
        {
          onError: (cause) =>
            setError(`Could not save the columns. ${cause.message}`),
        },
      );
    },
  };
}

/** The visible column keys, in order, for tables rendered without a screen. */
export function visibleColumns(
  definitions: readonly ColumnDefinition[],
  control?: TableColumnsControl,
) {
  return (control?.columns ?? resolveColumns(definitions))
    .filter((column) => column.visible)
    .map((column) => column.key);
}

function move<T>(items: readonly T[], from: number, to: number) {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function TableOptionsDialog({
  open,
  onOpenChange,
  control,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  control: TableColumnsControl;
}) {
  // While dragging, the order changes locally and saves once on drop.
  const [dragging, setDragging] = useState<{
    key: string;
    columns: ResolvedColumn[];
  } | null>(null);
  const columns = dragging?.columns ?? control.columns;
  const firstMovable = columns.findIndex((column) => !column.locked);

  function dragOver(event: DragEvent, index: number) {
    if (!dragging || columns[index].locked) return;
    event.preventDefault();
    const from = columns.findIndex((column) => column.key === dragging.key);
    if (from !== index)
      setDragging({ ...dragging, columns: move(columns, from, index) });
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Table options"
      description="Choose which columns are shown and their order. Changes apply right away and are saved for everyone on this server."
    >
      <div className={css({ display: "grid", gap: "16px", minWidth: 0 })}>
        <ul
          aria-label="Columns"
          className={css({
            listStyle: "none",
            m: 0,
            p: 0,
            bg: "canvas",
            border: "1px solid token(colors.line)",
            borderRadius: "12px",
            overflow: "hidden",
          })}
        >
          {columns.map((column, index) => (
            <li
              key={column.key}
              draggable={!column.locked}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                // Firefox only starts a drag that carries data.
                event.dataTransfer.setData("text/plain", column.key);
                setDragging({ key: column.key, columns: control.columns });
              }}
              onDragOver={(event) => dragOver(event, index)}
              onDrop={(event) => event.preventDefault()}
              onDragEnd={() => {
                if (dragging) control.onChange(dragging.columns);
                setDragging(null);
              }}
              data-dragging={dragging?.key === column.key || undefined}
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "10px",
                minHeight: "44px",
                px: "10px",
                borderBottom: "1px solid token(colors.lineSoft)",
                fontSize: "13px",
                _last: { borderBottom: 0 },
                "&[data-dragging]": { bg: "elevated", opacity: 0.7 },
              })}
            >
              <span
                aria-hidden="true"
                className={css({
                  display: "grid",
                  placeItems: "center",
                  width: "18px",
                  color: "subtle",
                  cursor: column.locked ? "default" : "grab",
                })}
              >
                {column.locked ? (
                  <LockSimpleIcon size={13} />
                ) : (
                  <DotsSixVerticalIcon size={16} weight="bold" />
                )}
              </span>
              <label
                className={css({
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  cursor: column.locked ? "default" : "pointer",
                  color: column.visible ? "ink" : "muted",
                })}
              >
                <input
                  type="checkbox"
                  checked={column.visible}
                  disabled={column.locked}
                  onChange={(event) =>
                    control.onChange(
                      columns.map((entry) =>
                        entry.key === column.key
                          ? { ...entry, visible: event.target.checked }
                          : entry,
                      ),
                    )
                  }
                  className={css({ width: "15px", height: "15px", m: 0 })}
                />
                {column.label}
                {column.locked && (
                  <span className={css({ color: "subtle", fontSize: "11px" })}>
                    Always shown
                  </span>
                )}
              </label>
              {!column.locked && (
                <span className={css({ display: "flex", gap: "2px" })}>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Move ${column.label} up`}
                    disabled={index <= firstMovable}
                    onClick={() =>
                      control.onChange(move(columns, index, index - 1))
                    }
                    styles={css.raw({ width: "28px", height: "28px" })}
                  >
                    <ArrowUpIcon size={13} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Move ${column.label} down`}
                    disabled={index === columns.length - 1}
                    onClick={() =>
                      control.onChange(move(columns, index, index + 1))
                    }
                    styles={css.raw({ width: "28px", height: "28px" })}
                  >
                    <ArrowDownIcon size={13} />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
        {control.error && <Notice error>{control.error}</Notice>}
        <div
          className={css({
            display: "flex",
            justifyContent: "space-between",
            gap: "10px",
          })}
        >
          <Button onClick={() => control.onChange(null)}>
            Reset to defaults
          </Button>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
