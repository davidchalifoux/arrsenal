"use client";

import { Combobox } from "@base-ui/react/combobox";
import {
  CaretDownIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  XIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import { useEffect, useRef, useState } from "react";
import { Button, inputStyle, labelStyle } from "./ui";

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[_/\s]+/g, " ")
    .trim();
}

export function TimezoneSelect({
  value,
  savedValue,
  onChange,
  disabled,
  describedBy,
}: {
  value: string;
  savedValue: string;
  onChange: (value: string) => void;
  disabled: boolean;
  describedBy: string;
}) {
  const [zones, setZones] = useState<string[]>([]);
  const [browserZone, setBrowserZone] = useState("UTC");
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setZones(
      typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : [],
    );
    function refresh() {
      try {
        setBrowserZone(
          Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        );
      } catch {
        setBrowserZone("UTC");
      }
    }
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  const automatic = {
    value: "",
    label: "Automatic",
    detail: `This browser: ${browserZone}`,
  };
  const choices = [
    ...new Set([...zones, "UTC", browserZone, savedValue, value]),
  ]
    .filter(Boolean)
    .map((zone) => ({
      value: zone,
      label: zone.split("/").at(-1)?.replaceAll("_", " ") || zone,
      detail: zone,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const items = [automatic, ...choices];
  const selected = items.find((item) => item.value === value) ?? automatic;
  const words = normalize(query).split(" ");
  const matches = choices.filter((item) =>
    words.every((word) =>
      normalize(`${item.label} ${item.value}`).includes(word),
    ),
  );
  // Keep the current selection visible on opening, without mounting hundreds of rows.
  const results =
    !query && value
      ? [selected, ...matches.filter((item) => item.value !== value)]
      : matches;
  const visible = [automatic, ...results.slice(0, 50)];

  return (
    <Combobox.Root
      items={items}
      filteredItems={visible}
      value={selected}
      isItemEqualToValue={(a, b) => a.value === b.value}
      onValueChange={(item) => {
        if (item) onChange(item.value);
      }}
      inputValue={query}
      onInputValueChange={setQuery}
      onOpenChange={() => setQuery("")}
      disabled={disabled}
    >
      <div className={labelStyle}>
        <Combobox.Label>Timezone</Combobox.Label>
        <Combobox.Trigger
          aria-describedby={describedBy}
          className={cx(
            inputStyle,
            css({
              minHeight: "62px",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              textAlign: "left",
              cursor: "pointer",
              _disabled: { opacity: 0.5, cursor: "not-allowed" },
            }),
          )}
        >
          <span
            className={css({
              flex: 1,
              minWidth: 0,
              display: "grid",
              gap: "3px",
            })}
          >
            <span>{selected.label}</span>
            <span
              className={css({
                color: "muted",
                fontSize: "11px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              })}
            >
              {selected.detail}
            </span>
          </span>
          <CaretDownIcon
            size={16}
            className={css({ color: "muted", flexShrink: 0 })}
          />
        </Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className={css({
            zIndex: 80,
            width: "var(--anchor-width)",
            maxWidth: "calc(100vw - 24px)",
          })}
        >
          <Combobox.Popup
            aria-label="Choose timezone"
            initialFocus={input}
            className={css({
              display: "flex",
              flexDirection: "column",
              width: "100%",
              maxHeight: "min(300px, var(--available-height))",
              overflow: "hidden",
              bg: "surface",
              color: "ink",
              border: "1px solid #414141",
              borderRadius: "10px",
              boxShadow: "0 16px 48px #0008",
              outline: "none",
            })}
          >
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "8px",
                p: "10px",
                flexShrink: 0,
                borderBottom: "1px solid token(colors.line)",
              })}
            >
              <MagnifyingGlassIcon
                size={16}
                className={css({ color: "muted", flexShrink: 0 })}
              />
              <Combobox.Input
                ref={input}
                aria-label="Search timezones"
                placeholder="Search city or timezone"
                className={cx(inputStyle, css({ minWidth: 0, height: "34px" }))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Clear search"
                disabled={!query}
                onClick={() => {
                  setQuery("");
                  input.current?.focus();
                }}
              >
                <XIcon size={15} />
              </Button>
            </div>
            <Combobox.List
              className={css({
                minHeight: 0,
                overflowY: "auto",
                overscrollBehavior: "contain",
                p: "5px",
                scrollPaddingBlock: "5px",
              })}
            >
              {(item: typeof automatic) => (
                <Combobox.Item
                  key={item.value}
                  value={item}
                  aria-label={`${item.label} ${item.detail}`}
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    px: "10px",
                    py: "9px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    outline: "none",
                    "&[data-highlighted]": { bg: "elevated" },
                    "&[data-selected]": { color: "accent" },
                  })}
                >
                  <span
                    className={css({
                      flex: 1,
                      minWidth: 0,
                      display: "grid",
                      gap: "3px",
                    })}
                  >
                    <span
                      className={css({ fontSize: "13px", fontWeight: "500" })}
                    >
                      {item.label}
                    </span>
                    <span
                      className={css({
                        fontSize: "11px",
                        color: "muted",
                        overflowWrap: "anywhere",
                      })}
                    >
                      {item.detail}
                    </span>
                  </span>
                  <Combobox.ItemIndicator>
                    <CheckIcon size={16} weight="bold" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
            {(results.length > 50 || results.length === 0) && (
              <p
                className={css({
                  px: "15px",
                  py: "9px",
                  fontSize: "11px",
                  color: "muted",
                  flexShrink: 0,
                  borderTop: "1px solid token(colors.line)",
                })}
              >
                {results.length === 0
                  ? "No matching timezones. Try another city or region."
                  : "Showing 50 timezones. Search to narrow the list."}
              </p>
            )}
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
