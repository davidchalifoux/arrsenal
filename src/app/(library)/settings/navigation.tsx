"use client";

import {
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
        minWidth: 0,
        pr: { lg: "16px" },
        pb: { base: "16px", lg: "8px" },
      })}
    >
      <p
        className={css({
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
          flexDirection: { base: "row", lg: "column" },
          flexWrap: "wrap",
          gap: "4px",
        })}
      >
        {settingsSections.map((section) => {
          const Icon =
            section.href === "/settings/connections"
              ? PlugIcon
              : section.href === "/settings/security"
                ? ShieldCheckIcon
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
                minHeight: { base: "40px", lg: "32px" },
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
