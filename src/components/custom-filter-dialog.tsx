"use client";

import { PlusIcon, SelectionPlusIcon, TrashIcon } from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import { useId, useState } from "react";
import {
  type CustomFilter,
  defaultRule,
  type FilterField,
  type FilterGroup,
  type FilterRule,
  fieldDefinitions,
  filterFields,
  matchesFilter,
  operatorLabels,
  statusChoices,
  typeChoices,
} from "@/lib/library-filters";
import type { MediaItem } from "@/lib/types";
import { Button, inputStyle, labelStyle, Modal, SelectField } from "./ui";

type Choice = { value: string; label: string };

export type FilterChoices = {
  instances: Choice[];
  qualities: string[];
  genres: string[];
};

function choicesFor(field: FilterField, choices: FilterChoices): Choice[] {
  switch (field) {
    case "type":
      return typeChoices;
    case "status":
    case "targetStatus":
      return statusChoices;
    case "target":
      return choices.instances;
    case "qualityProfile":
      return choices.qualities.map((value) => ({ value, label: value }));
    case "genre":
      return choices.genres.map((value) => ({ value, label: value }));
    default:
      return [];
  }
}

const chipToggleStyle = css({
  height: "26px",
  px: "9px",
  borderRadius: "6px",
  border: "1px solid token(colors.lineStrong)",
  bg: "transparent",
  color: "muted",
  fontSize: "12px",
  fontWeight: "500",
  _hover: { color: "ink" },
  "&[aria-pressed=true]": {
    bg: "elevated",
    borderColor: "accent",
    color: "ink",
  },
});

function ValueEditor({
  rule,
  choices,
  onChange,
}: {
  rule: FilterRule;
  choices: FilterChoices;
  onChange: (values: string[]) => void;
}) {
  const definition = fieldDefinitions[rule.field];
  const label = `${definition.label} value`;
  if (definition.kind === "boolean")
    return (
      <SelectField
        label={label}
        value={rule.values[0] ?? "true"}
        onChange={(value) => onChange([value])}
        options={[
          { value: "true", label: "Yes" },
          { value: "false", label: "No" },
        ]}
      />
    );
  if (definition.kind === "choice" || definition.kind === "list") {
    const options = choicesFor(rule.field, choices);
    if (!options.length)
      return (
        <span className={css({ fontSize: "12px", color: "subtle" })}>
          Nothing to choose from yet.
        </span>
      );
    return (
      <fieldset
        aria-label={label}
        className={css({
          display: "flex",
          flexWrap: "wrap",
          gap: "5px",
          m: 0,
          p: 0,
          border: 0,
          minWidth: 0,
        })}
      >
        {options.map((option) => {
          const selected = rule.values.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onChange(
                  selected
                    ? rule.values.filter((value) => value !== option.value)
                    : [...rule.values, option.value],
                )
              }
              className={chipToggleStyle}
            >
              {option.label}
            </button>
          );
        })}
      </fieldset>
    );
  }
  return (
    <span
      className={css({ display: "flex", alignItems: "center", gap: "8px" })}
    >
      <input
        aria-label={label}
        type={definition.kind === "text" ? "text" : "number"}
        inputMode={definition.kind === "text" ? undefined : "decimal"}
        min={definition.kind === "text" ? undefined : 0}
        value={rule.values[0] ?? ""}
        placeholder={definition.kind === "text" ? "Bluray, 2160p..." : "0"}
        onChange={(event) =>
          onChange(event.target.value ? [event.target.value] : [])
        }
        className={cx(inputStyle, css({ height: "36px", fontSize: "13px" }))}
      />
      {definition.unit && (
        <span className={css({ fontSize: "12px", color: "subtle" })}>
          {definition.unit}
        </span>
      )}
    </span>
  );
}

function RuleRow({
  rule,
  choices,
  onChange,
  onRemove,
}: {
  rule: FilterRule;
  choices: FilterChoices;
  onChange: (rule: FilterRule) => void;
  onRemove: () => void;
}) {
  const definition = fieldDefinitions[rule.field];
  return (
    <div
      className={css({
        display: "grid",
        gridTemplateColumns: {
          base: "minmax(0, 1fr) minmax(0, 1fr) 32px",
          md: "170px 150px minmax(0, 1fr) 32px",
        },
        gap: "8px",
        alignItems: "start",
      })}
    >
      <SelectField
        label="Field"
        value={rule.field}
        onChange={(value) => {
          const field = filterFields.find((item) => item === value);
          if (field) onChange(defaultRule(field));
        }}
        options={filterFields.map((field) => ({
          value: field,
          label: fieldDefinitions[field].label,
        }))}
      />
      <SelectField
        label="Operator"
        value={rule.operator}
        onChange={(value) => {
          const operator = definition.operators.find((item) => item === value);
          if (operator) onChange({ ...rule, operator });
        }}
        options={definition.operators.map((operator) => ({
          value: operator,
          label: operatorLabels[operator],
        }))}
      />
      <div
        className={css({
          gridColumn: { base: "1 / 3", md: "auto" },
          gridRow: { base: 2, md: "auto" },
          minHeight: "36px",
          display: "flex",
          alignItems: "center",
          minWidth: 0,
        })}
      >
        <ValueEditor
          rule={rule}
          choices={choices}
          onChange={(values) => onChange({ ...rule, values })}
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${definition.label} rule`}
        onClick={onRemove}
        styles={css.raw({ width: "32px", height: "36px" })}
      >
        <TrashIcon size={15} />
      </Button>
    </div>
  );
}

function RuleList({
  rules,
  choices,
  onChange,
}: {
  rules: FilterRule[];
  choices: FilterChoices;
  onChange: (rules: FilterRule[]) => void;
}) {
  return (
    <>
      {rules.map((rule, index) => (
        <RuleRow
          // Rules have no identity beyond their position in the list.
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
          key={index}
          rule={rule}
          choices={choices}
          onChange={(next) =>
            onChange(rules.map((item, at) => (at === index ? next : item)))
          }
          onRemove={() => onChange(rules.filter((_, at) => at !== index))}
        />
      ))}
    </>
  );
}

function MatchSelect({
  value,
  onChange,
  label,
}: {
  value: "all" | "any";
  onChange: (value: "all" | "any") => void;
  label: string;
}) {
  return (
    <SelectField
      compact
      label={label}
      value={value}
      onChange={(next) => onChange(next === "any" ? "any" : "all")}
      options={[
        { value: "all", label: "all" },
        { value: "any", label: "any" },
      ]}
    />
  );
}

export function emptyCustomFilter(): CustomFilter {
  return {
    id: `filter-${Date.now().toString(36)}`,
    name: "",
    match: "all",
    rules: [defaultRule()],
    groups: [],
  };
}

export function CustomFilterDialog({
  open,
  onOpenChange,
  initial,
  isNew,
  choices,
  items,
  saving,
  error,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: CustomFilter;
  isNew: boolean;
  choices: FilterChoices;
  items: readonly MediaItem[];
  saving: boolean;
  error?: string | null;
  onSave: (filter: CustomFilter) => void;
  onDelete: (id: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(initial);
  const [nameError, setNameError] = useState(false);
  const matching = items.filter((item) => matchesFilter(item, draft));
  function setGroups(groups: FilterGroup[]) {
    setDraft({ ...draft, groups });
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={isNew ? "New custom filter" : "Edit custom filter"}
      description="Combine rules to save a view of your library. Saved filters appear in the Filter menu for everyone on this server."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.name.trim()) {
            setNameError(true);
            return;
          }
          onSave({ ...draft, name: draft.name.trim() });
        }}
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        })}
      >
        <label htmlFor={`${id}-name`} className={labelStyle}>
          Filter name
          <input
            id={`${id}-name`}
            value={draft.name}
            placeholder="4K not yet grabbed"
            aria-invalid={nameError || undefined}
            onChange={(event) => {
              setNameError(false);
              setDraft({ ...draft, name: event.target.value });
            }}
            className={inputStyle}
          />
          {nameError && (
            <span className={css({ color: "negative", fontWeight: "400" })}>
              Name the filter so you can find it later.
            </span>
          )}
        </label>

        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          })}
        >
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              color: "soft",
            })}
          >
            Show titles that match
            <MatchSelect
              label="Match rules"
              value={draft.match}
              onChange={(match) => setDraft({ ...draft, match })}
            />
            of these rules
          </div>
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              p: "12px",
              bg: "canvas",
              border: "1px solid token(colors.line)",
              borderRadius: "12px",
            })}
          >
            <RuleList
              rules={draft.rules}
              choices={choices}
              onChange={(rules) => setDraft({ ...draft, rules })}
            />
            {draft.groups.map((group, index) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: groups are positional
                key={index}
                className={css({
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  p: "10px 10px 10px 14px",
                  border: "1px dashed token(colors.lineStrong)",
                  borderRadius: "10px",
                })}
              >
                <div
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    color: "muted",
                  })}
                >
                  Group · match
                  <MatchSelect
                    label={`Group ${index + 1} match`}
                    value={group.match}
                    onChange={(match) =>
                      setGroups(
                        draft.groups.map((item, at) =>
                          at === index ? { ...item, match } : item,
                        ),
                      )
                    }
                  />
                  of
                  <span className={css({ flexGrow: 1 })} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setGroups(draft.groups.filter((_, at) => at !== index))
                    }
                  >
                    Remove group
                  </Button>
                </div>
                <RuleList
                  rules={group.rules}
                  choices={choices}
                  onChange={(rules) =>
                    setGroups(
                      draft.groups.map((item, at) =>
                        at === index ? { ...item, rules } : item,
                      ),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className={css({ alignSelf: "flex-start" })}
                  onClick={() =>
                    setGroups(
                      draft.groups.map((item, at) =>
                        at === index
                          ? { ...item, rules: [...item.rules, defaultRule()] }
                          : item,
                      ),
                    )
                  }
                >
                  <PlusIcon size={13} /> Add rule to group
                </Button>
              </div>
            ))}
            <div className={css({ display: "flex", gap: "4px" })}>
              <Button
                variant="ghost"
                size="sm"
                disabled={draft.rules.length >= 20}
                onClick={() =>
                  setDraft({ ...draft, rules: [...draft.rules, defaultRule()] })
                }
                styles={css.raw({ color: "accent" })}
              >
                <PlusIcon size={14} /> Add rule
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={draft.groups.length >= 5}
                onClick={() =>
                  setGroups([
                    ...draft.groups,
                    { match: "any", rules: [defaultRule()] },
                  ])
                }
              >
                <SelectionPlusIcon size={14} /> Add group
              </Button>
            </div>
          </div>
        </div>

        <output
          className={css({
            display: "flex",
            alignItems: "center",
            gap: "10px",
            p: "12px 14px",
            bg: "raised",
            borderRadius: "10px",
            fontSize: "13px",
            color: "soft",
          })}
        >
          <span
            aria-hidden="true"
            className={css({
              width: "8px",
              height: "8px",
              borderRadius: "999px",
              bg: "accent",
              flexShrink: 0,
            })}
          />
          <span>
            Matches{" "}
            <strong className={css({ color: "ink", fontWeight: "600" })}>
              {matching.length} of {items.length}
            </strong>{" "}
            titles
            {matching.length > 0 && (
              <span className={css({ color: "subtle" })}>
                {" · "}
                {matching
                  .slice(0, 4)
                  .map((item) => item.title)
                  .join(", ")}
                {matching.length > 4 ? ` +${matching.length - 4}` : ""}
              </span>
            )}
          </span>
        </output>

        {error && (
          <p
            role="alert"
            className={css({ color: "negative", fontSize: "13px" })}
          >
            {error}
          </p>
        )}

        <div
          className={css({
            display: "flex",
            alignItems: "center",
            gap: "8px",
            pt: "14px",
            borderTop: "1px solid token(colors.line)",
          })}
        >
          {!isNew && (
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => onDelete(draft.id)}
              styles={css.raw({ color: "negative" })}
            >
              Delete filter
            </Button>
          )}
          <span className={css({ flexGrow: 1 })} />
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving..." : "Save and apply"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
