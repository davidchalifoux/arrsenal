"use client";

import { css, cx } from "@styled-system/css";
import { useEffect, useId, useState } from "react";
import type { LibraryDefaults } from "@/lib/library-options";
import { usePreferences, useSavePreferences } from "@/lib/preferences";
import { useTimezonePreference } from "@/lib/timezone-preference";
import { sortOptions } from "./library-toolbar";
import { PageHeader } from "./page-header";
import { ThemePicker } from "./theme-picker";
import { TimezoneSelect } from "./timezone-select";
import { Button, labelStyle, mutedStyle, panelStyle, SelectField } from "./ui";

const sectionHeadingStyle = css({ fontSize: "15px", fontWeight: "600" });

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cx(
        panelStyle,
        css({ p: "20px", display: "grid", gap: "16px", minWidth: 0 }),
      )}
    >
      <div>
        <h2 className={sectionHeadingStyle}>{title}</h2>
        <p className={cx(mutedStyle, css({ mt: "4px" }))}>{description}</p>
      </div>
      {children}
    </section>
  );
}

const defaultLibraryDefaults: LibraryDefaults = {
  layout: "grid",
  sort: "recent",
  sortDirection: "desc",
};

function LibraryDefaultsForm() {
  const preferences = usePreferences();
  const save = useSavePreferences();
  const [error, setError] = useState<string | null>(null);
  const library = preferences.data?.library ?? {};
  const defaults = library.defaults ?? defaultLibraryDefaults;
  function update(next: Partial<LibraryDefaults>) {
    setError(null);
    save.mutate(
      { library: { ...library, defaults: { ...defaults, ...next } } },
      {
        onError: (cause) =>
          setError(`Could not save library defaults. ${cause.message}`),
      },
    );
  }
  return (
    <>
      <div
        className={css({
          display: "grid",
          gridTemplateColumns: { base: "1fr", md: "repeat(3, minmax(0, 1fr))" },
          gap: "12px",
        })}
      >
        <div className={labelStyle}>
          Default view
          <SelectField
            label="Default view"
            disabled={preferences.isPending}
            value={defaults.layout}
            onChange={(value) =>
              update({ layout: value === "list" ? "list" : "grid" })
            }
            options={[
              { value: "grid", label: "Posters" },
              { value: "list", label: "Table" },
            ]}
          />
        </div>
        <div className={labelStyle}>
          Default sort
          <SelectField
            label="Default sort"
            disabled={preferences.isPending}
            value={defaults.sort}
            onChange={(value) => {
              const option = sortOptions.find((item) => item.value === value);
              if (option) update({ sort: option.value });
            }}
            options={sortOptions}
          />
        </div>
        <div className={labelStyle}>
          Order
          <SelectField
            label="Default order"
            disabled={preferences.isPending}
            value={defaults.sortDirection}
            onChange={(value) =>
              update({ sortDirection: value === "asc" ? "asc" : "desc" })
            }
            options={[
              { value: "desc", label: "Descending" },
              { value: "asc", label: "Ascending" },
            ]}
          />
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className={css({ color: "negative", fontSize: "13px" })}
        >
          {error}
        </p>
      )}
    </>
  );
}

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
      <PageHeader id={`${id}-heading`} title="Personalization">
        <p
          className={css({
            width: "100%",
            order: 1,
            mt: "-8px",
            color: "muted",
            fontSize: "13px",
          })}
        >
          Shared preferences for everyone who uses this Arrsenal server, saved
          to its config file.
        </p>
      </PageHeader>
      <div
        className={css({
          display: "grid",
          gap: "16px",
          maxWidth: "820px",
          minWidth: 0,
        })}
      >
        <Section
          title="Theme"
          description="Pick a preset, then fine-tune the accent color if you like."
        >
          <ThemePicker />
        </Section>
        <form
          aria-label="Time zone"
          className={cx(
            panelStyle,
            css({
              p: "20px",
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
          <div>
            <h2 className={sectionHeadingStyle}>Time zone</h2>
            <p className={cx(mutedStyle, css({ mt: "4px" }))}>
              Used for calendar days and air times across the app.
            </p>
          </div>
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
              size="sm"
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
        <Section
          title="Library defaults"
          description="What the library shows when a browser opens it for the first time. View options and saved filters are stored here too."
        >
          <LibraryDefaultsForm />
        </Section>
      </div>
    </section>
  );
}
