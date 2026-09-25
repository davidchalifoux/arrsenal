"use client";

import {
  InfoIcon,
  PlugIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { settingsSections } from "./sections";

export function SettingsNavigation() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Settings sections"
      className={css({
        // Phones only: a single row of sections above the page, which the
        // desktop sidebar replaces.
        display: { base: "block", lg: "none" },
        flexShrink: 0,
        minWidth: 0,
        px: "12px",
        py: "6px",
        bg: "sidebar",
        borderBottom: "1px solid token(colors.line)",
        overflowX: "auto",
        scrollbarWidth: "none",
      })}
    >
      <p
        className={css({
          srOnly: true,
          color: "subtle",
          fontSize: "11px",
          fontWeight: "600",
          letterSpacing: ".06em",
          textTransform: "uppercase",
          mb: "12px",
          px: "10px",
          pt: "8px",
        })}
      >
        Settings
      </p>
      <div
        className={css({
          display: "flex",
          gap: "4px",
        })}
      >
        {settingsSections.map((section) => {
          const Icon =
            section.href === "/settings/connections"
              ? PlugIcon
              : section.href === "/settings/security"
                ? ShieldCheckIcon
                : section.href === "/settings/about"
                  ? InfoIcon
                  : SlidersHorizontalIcon;
          const active = pathname === section.href;
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={active ? "page" : undefined}
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexShrink: 0,
                whiteSpace: "nowrap",
                minHeight: "36px",
                px: "10px",
                borderRadius: "7px",
                color: "muted",
                fontSize: "12px",
                transition: "background 150ms, color 150ms",
                _hover: { bg: "surface", color: "ink" },
                _currentPage: {
                  bg: "elevated",
                  color: "ink",
                  fontWeight: "550",
                },
                _focusVisible: {
                  outline: "2px solid token(colors.accent)",
                  outlineOffset: "2px",
                },
              })}
            >
              <Icon
                size={16}
                weight={active ? "fill" : "regular"}
                aria-hidden="true"
              />
              {section.title}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
