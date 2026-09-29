"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import { inputRaw, SelectField } from "./ui";

/** Search box and instance filter for the Activity page headers. */
export function ActivityFilters({
  query,
  onQuery,
  placeholder,
  instances,
  instance,
  onInstance,
}: {
  query: string;
  onQuery: (query: string) => void;
  placeholder: string;
  /** Instance ID to name, for every instance with rows or errors. */
  instances: Map<string, string>;
  instance: string;
  onInstance: (instance: string) => void;
}) {
  return (
    <>
      <label
        className={css({
          position: "relative",
          display: "block",
          width: { base: "100%", sm: "240px" },
          minWidth: 0,
        })}
      >
        <span className={css({ srOnly: true })}>{placeholder}</span>
        <MagnifyingGlassIcon
          size={15}
          aria-hidden="true"
          className={css({
            position: "absolute",
            left: "11px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "subtle",
            pointerEvents: "none",
          })}
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              event.preventDefault();
              onQuery("");
            }
          }}
          placeholder={placeholder}
          className={css(inputRaw, {
            height: "36px",
            pl: "33px",
            fontSize: "13px",
          })}
        />
      </label>
      <div
        className={css({
          width: { base: "100%", sm: "200px" },
          minWidth: 0,
          "& button > span": {
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          },
        })}
      >
        <SelectField
          label="Filter by instance"
          value={instances.has(instance) ? instance : "all"}
          onChange={onInstance}
          options={[
            { value: "all", label: "All instances" },
            ...Array.from(instances, ([value, label]) => ({ value, label })),
          ]}
        />
      </div>
    </>
  );
}

/** Every search term must appear in one of the given fields. */
export function matchesSearch(fields: (string | undefined)[], query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = fields.join("\n").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
