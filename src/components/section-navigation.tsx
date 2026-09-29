"use client";

import type { Icon } from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type SectionNavigationItem = { href: string; title: string; icon: Icon };

/**
 * Phones only: a single row of a section's pages above the page, which the
 * desktop sidebar's sub-navigation replaces.
 */
export function SectionNavigation({
  label,
  heading,
  items,
}: {
  label: string;
  heading: string;
  items: SectionNavigationItem[];
}) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className={css({
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
      <p className={css({ srOnly: true })}>{heading}</p>
      <div className={css({ display: "flex", gap: "4px" })}>
        {items.map((item) => {
          const active = pathname === item.href;
          const ItemIcon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
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
              <ItemIcon
                size={16}
                weight={active ? "fill" : "regular"}
                aria-hidden="true"
              />
              {item.title}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
