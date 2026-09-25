"use client";

import { CheckIcon } from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import { useState } from "react";
import { usePreferences, useSavePreferences } from "@/lib/preferences";
import {
  accentSwatches,
  defaultTheme,
  hexColorPattern,
  type ThemeId,
  themeStyle,
  themes,
} from "@/lib/theme";
import { inputStyle } from "./ui";

// Themes apply to the page immediately; the server copy makes them stick.
function applyTheme(theme: ThemeId, accent: string | null) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  for (const [name, value] of Object.entries(themeStyle(theme, accent)))
    root.style.setProperty(name, value);
}

export function ThemePicker() {
  const preferences = usePreferences();
  const save = useSavePreferences();
  const theme = preferences.data?.theme ?? defaultTheme;
  const accent = preferences.data?.accent ?? null;
  const [custom, setCustom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentAccent =
    accent ?? themes.find((item) => item.id === theme)?.accent ?? "";

  function choose(next: { theme?: ThemeId; accent?: string | null }) {
    const nextTheme = next.theme ?? theme;
    const nextAccent = next.accent === undefined ? accent : next.accent;
    setError(null);
    applyTheme(nextTheme, nextAccent);
    save.mutate(next, {
      onError: (cause) => {
        applyTheme(theme, accent);
        setError(`Could not save the theme. ${cause.message}`);
      },
    });
  }

  return (
    <div className={css({ display: "grid", gap: "16px" })}>
      <fieldset
        aria-label="Theme"
        className={css({
          display: "grid",
          gridTemplateColumns: {
            base: "repeat(2, minmax(0, 1fr))",
            sm: "repeat(3, minmax(0, 1fr))",
            md: "repeat(6, minmax(0, 1fr))",
          },
          gap: "10px",
          m: 0,
          p: 0,
          border: 0,
          minWidth: 0,
        })}
      >
        {themes.map((item) => {
          const selected = item.id === theme;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              disabled={preferences.isPending}
              onClick={() => choose({ theme: item.id, accent: null })}
              className={css({
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                p: "6px 6px 10px",
                bg: "transparent",
                border: "1px solid token(colors.lineStrong)",
                borderRadius: "12px",
                textAlign: "left",
                _hover: { borderColor: "faint" },
                "&[aria-pressed=true]": {
                  borderColor: "accent",
                  boxShadow:
                    "0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent)",
                },
              })}
            >
              <span
                data-theme={item.id}
                aria-hidden="true"
                className={css({
                  display: "flex",
                  height: "72px",
                  overflow: "hidden",
                  borderRadius: "8px",
                })}
                style={{
                  background: "var(--canvas)",
                  border: "1px solid var(--line)",
                }}
              >
                <span
                  className={css({
                    width: "26%",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    p: "7px 5px",
                  })}
                  style={{ background: "var(--sidebar)" }}
                >
                  <span
                    className={css({ height: "5px", borderRadius: "3px" })}
                    style={{ background: item.accent }}
                  />
                  <span
                    className={css({ height: "5px", borderRadius: "3px" })}
                    style={{ background: "var(--line-strong)" }}
                  />
                  <span
                    className={css({ height: "5px", borderRadius: "3px" })}
                    style={{ background: "var(--line-strong)" }}
                  />
                </span>
                <span
                  className={css({
                    flexGrow: 1,
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: "4px",
                    p: "7px",
                  })}
                >
                  {[0, 1, 2].map((tile) => (
                    <span
                      key={tile}
                      className={css({ borderRadius: "3px" })}
                      style={{ background: "var(--elevated)" }}
                    />
                  ))}
                </span>
              </span>
              <span
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  px: "4px",
                  fontSize: "12px",
                  fontWeight: "500",
                  color: "ink",
                })}
              >
                <span
                  aria-hidden="true"
                  className={css({
                    width: "8px",
                    height: "8px",
                    borderRadius: "999px",
                  })}
                  style={{ background: item.accent }}
                />
                {item.name}
                {selected && (
                  <CheckIcon
                    size={12}
                    weight="bold"
                    className={css({ ml: "auto", color: "accent" })}
                  />
                )}
              </span>
            </button>
          );
        })}
      </fieldset>

      <div
        className={css({
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "12px",
        })}
      >
        <span
          className={css({
            fontSize: "12px",
            fontWeight: "500",
            color: "soft",
          })}
        >
          Accent
        </span>
        <fieldset
          aria-label="Accent color"
          className={css({
            display: "flex",
            gap: "8px",
            m: 0,
            p: 0,
            border: 0,
          })}
        >
          {accentSwatches.map((swatch) => {
            const selected = currentAccent.toLowerCase() === swatch.value;
            return (
              <button
                key={swatch.value}
                type="button"
                aria-label={`${swatch.name} accent`}
                aria-pressed={selected}
                disabled={preferences.isPending}
                onClick={() => choose({ accent: swatch.value })}
                className={css({
                  width: "24px",
                  height: "24px",
                  p: 0,
                  borderRadius: "999px",
                  border: "2px solid transparent",
                  boxShadow: "inset 0 0 0 2px var(--surface)",
                  "&[aria-pressed=true]": { borderColor: "ink" },
                })}
                style={{ background: swatch.value }}
              />
            );
          })}
        </fieldset>
        <label
          className={css({
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "12px",
            color: "muted",
            ml: { md: "auto" },
          })}
        >
          Custom
          <input
            value={custom ?? currentAccent}
            maxLength={7}
            spellCheck={false}
            aria-invalid={
              custom !== null && !hexColorPattern.test(custom)
                ? true
                : undefined
            }
            onChange={(event) => setCustom(event.target.value)}
            onBlur={() => {
              if (custom && hexColorPattern.test(custom)) {
                choose({ accent: custom.toLowerCase() });
              }
              setCustom(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className={cx(
              inputStyle,
              css({
                width: "96px",
                height: "32px",
                fontFamily: "mono",
                fontSize: "12px",
              }),
            )}
          />
        </label>
        {accent && (
          <button
            type="button"
            onClick={() => choose({ accent: null })}
            className={css({
              border: 0,
              bg: "transparent",
              color: "muted",
              fontSize: "12px",
              textDecoration: "underline",
              _hover: { color: "ink" },
            })}
          >
            Use theme accent
          </button>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className={css({ color: "negative", fontSize: "13px" })}
        >
          {error}
        </p>
      )}
    </div>
  );
}
