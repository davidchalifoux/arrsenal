"use client";

import { ArrowLeftIcon } from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { settingsSections } from "./sections";

export function SettingsNavigation() {
  const pathname = usePathname();
  return (
    <>
      <nav
        aria-label="Settings sections"
        className={css({
          display: { base: "none", lg: "grid" },
          alignContent: "start",
          gap: "4px",
          borderRight: "1px solid token(colors.line)",
          pr: "20px",
        })}
      >
        <p
          className={css({
            fontSize: "12px",
            fontWeight: "600",
            mb: "12px",
            px: "12px",
          })}
        >
          Settings
        </p>
        {[{ href: "/settings", title: "Overview" }, ...settingsSections].map(
          (section) => (
            <Link
              key={section.href}
              href={section.href}
              aria-current={pathname === section.href ? "page" : undefined}
              className={css({
                display: "flex",
                alignItems: "center",
                minHeight: "44px",
                px: "12px",
                borderRadius: "7px",
                color: "muted",
                fontSize: "13px",
                _hover: { bg: "elevated", color: "ink" },
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
              {section.title}
            </Link>
          ),
        )}
      </nav>
      {pathname !== "/settings" && (
        <Link
          href="/settings"
          className={css({
            display: { base: "inline-flex", lg: "none" },
            alignItems: "center",
            gap: "8px",
            minHeight: "44px",
            width: "fit-content",
            color: "muted",
            fontSize: "13px",
            _hover: { color: "ink" },
            _focusVisible: {
              outline: "2px solid token(colors.accent)",
              outlineOffset: "2px",
            },
          })}
        >
          <ArrowLeftIcon size={16} aria-hidden="true" /> Back to Settings
        </Link>
      )}
    </>
  );
}
