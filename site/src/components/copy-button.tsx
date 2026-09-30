"use client";

import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import { useState } from "react";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be denied; the text stays selectable.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      className={css({
        display: "inline-flex",
        alignItems: "center",
        gap: "1.5",
        h: "7",
        px: "2.5",
        rounded: "md",
        fontSize: "xs",
        color: "subtle",
        cursor: "pointer",
        _hover: { color: "ink", bg: "elevated" },
        _focusVisible: { outline: "2px solid", outlineColor: "accent" },
      })}
    >
      {copied ? (
        <CheckIcon size={14} weight="bold" aria-hidden />
      ) : (
        <CopyIcon size={14} aria-hidden />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
