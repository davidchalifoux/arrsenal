"use client";

import { css, cx } from "@styled-system/css";
import { useEffect, useId, useState } from "react";
import { usePreferences, useSavePreferences } from "@/lib/preferences";
import { Button, inputStyle, mutedStyle, panelStyle, Spinner } from "./ui";

/** The browser's own address, which Arrsenal uses when none is set. */
export function browserAddress() {
  return typeof window === "undefined" ? "" : window.location.origin;
}

export function ArrsenalAddress({
  notify,
}: {
  notify: (message: string, error?: boolean) => void;
}) {
  const id = useId();
  const preferences = usePreferences();
  const save = useSavePreferences();
  const saved = preferences.data?.arrsenalUrl ?? "";
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState("");
  useEffect(() => setDraft(saved), [saved]);

  return (
    <form
      aria-labelledby={`${id}-heading`}
      className={cx(
        panelStyle,
        css({ mt: "16px", p: "20px", display: "grid", gap: "14px" }),
      )}
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim() === saved) return;
        setError("");
        save.mutate(
          { arrsenalUrl: draft.trim() || null },
          {
            onSuccess: () =>
              notify(
                draft.trim()
                  ? "Arrsenal address saved."
                  : "Arrsenal address cleared.",
              ),
            onError: (cause) => setError(cause.message),
          },
        );
      }}
    >
      <div>
        <h2
          id={`${id}-heading`}
          className={css({ fontSize: "15px", fontWeight: "600" })}
        >
          Arrsenal address
        </h2>
        <p className={cx(mutedStyle, css({ mt: "4px" }))}>
          Where Sonarr and Radarr download the NZB and torrent files you upload
          with Add release. In Docker, use the Arrsenal container&apos;s name or
          your server&apos;s IP, not localhost. Leave it empty to use the
          address you&apos;re browsing from.
        </p>
      </div>
      <div
        className={css({
          display: "flex",
          gap: "10px",
          flexWrap: { base: "wrap", sm: "nowrap" },
        })}
      >
        <input
          aria-label="Arrsenal address"
          className={inputStyle}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError("");
          }}
          placeholder={browserAddress() || "http://arrsenal:3000"}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={2048}
          disabled={preferences.isPending}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <Button
          type="submit"
          disabled={
            preferences.isPending || save.isPending || draft.trim() === saved
          }
          styles={css.raw({ height: "40px", flexShrink: 0 })}
        >
          {save.isPending && <Spinner size={14} />}
          Save
        </Button>
      </div>
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className={css({ color: "negative", fontSize: "13px" })}
        >
          {error}
        </p>
      )}
    </form>
  );
}
