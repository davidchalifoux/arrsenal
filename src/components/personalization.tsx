"use client";

import { css, cx } from "@styled-system/css";
import { useEffect, useId, useState } from "react";
import { useTimezonePreference } from "@/lib/timezone-preference";
import { PageHeader } from "./page-header";
import { TimezoneSelect } from "./timezone-select";
import { Button, mutedStyle, panelStyle } from "./ui";

export function Personalization() {
  const id = useId();
  const { timeZone, override, setOverride, error } = useTimezonePreference();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(override), [override]);

  async function save(value: string) {
    if (saving) return;
    setSaving(true);
    try {
      await setOverride(value);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-heading`} className={css({ minWidth: 0 })}>
      <PageHeader id={`${id}-heading`} title="Personalization" />
      <form
        className={cx(
          panelStyle,
          css({
            p: "20px",
            maxWidth: "640px",
            display: "grid",
            gap: "18px",
            minWidth: 0,
          }),
        )}
        onSubmit={(event) => {
          event.preventDefault();
          if (draft !== override) void save(draft);
        }}
      >
        <TimezoneSelect
          value={draft}
          savedValue={override}
          onChange={setDraft}
          disabled={timeZone === null || saving}
          describedBy={`${id}-hint${error ? ` ${id}-error` : ""}`}
        />
        <p id={`${id}-hint`} className={mutedStyle}>
          Saved in the server configuration and shared by all viewers of this
          library. Automatic uses each viewer's browser timezone. Choose a
          timezone, then save to apply it to the library.
        </p>
        <output className={cx(mutedStyle, css({ overflowWrap: "anywhere" }))}>
          Effective timezone: {timeZone ?? "Loading preference..."}
          {timeZone && !override ? " (Automatic)" : ""}
        </output>
        {error && (
          <p
            id={`${id}-error`}
            role="alert"
            className={css({ color: "negative", fontSize: "13px" })}
          >
            {error}
          </p>
        )}
        <div
          className={css({ display: "flex", flexWrap: "wrap", gap: "10px" })}
        >
          <Button
            type="submit"
            variant="primary"
            disabled={timeZone === null || saving || draft === override}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
          {draft !== override && (
            <span
              className={css({
                color: "muted",
                fontSize: "12px",
                alignSelf: "center",
              })}
            >
              Unsaved changes
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
