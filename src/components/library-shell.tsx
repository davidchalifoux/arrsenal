"use client";

import {
  CalendarBlankIcon,
  DownloadSimpleIcon,
  FilmSlateIcon,
  GearSixIcon,
  HouseIcon,
  TelevisionSimpleIcon,
} from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useQueue } from "@/lib/collections";
import { LibraryUtilities } from "./page-header";

const navigation = [
  { href: "/", label: "Home", icon: HouseIcon },
  { href: "/movies", label: "Movies", icon: FilmSlateIcon },
  { href: "/shows", label: "Shows", icon: TelevisionSimpleIcon },
  { href: "/queue", label: "Downloads", icon: DownloadSimpleIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarBlankIcon },
];

export function LibraryShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const queue = useQueue();
  const count = queue.data?.items.length ?? 0;
  const current = navigation.find((item) =>
    item.href === "/"
      ? pathname === "/"
      : pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  const settingsActive =
    pathname === "/settings" || pathname.startsWith("/settings/");

  function links(mobile: boolean) {
    return navigation.map((item) => {
      const active = current === item;
      return (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={css({
            display: "flex",
            flexDirection: mobile ? "column" : "row",
            alignItems: "center",
            justifyContent: "center",
            gap: mobile ? "4px" : "7px",
            minWidth: 0,
            minHeight: mobile ? "60px" : "32px",
            px: mobile ? "2px" : "12px",
            borderRadius: "8px",
            color: "muted",
            fontSize: mobile ? "10px" : "12px",
            fontWeight: "500",
            transition: "background 150ms, color 150ms",
            _currentPage: { color: "accent", bg: "elevated" },
            _hover: { bg: "elevated", color: "ink" },
            _focusVisible: {
              outline: "2px solid token(colors.accent)",
              outlineOffset: "-2px",
            },
          })}
        >
          <span className={css({ position: "relative", display: "flex" })}>
            <item.icon
              size={mobile ? 22 : 18}
              weight={active ? "fill" : "regular"}
            />
            {item.href === "/queue" && count > 0 && (
              <span
                role="img"
                aria-label={`${count} downloads`}
                className={css({
                  position: "absolute",
                  top: "-7px",
                  right: "-10px",
                  minWidth: "15px",
                  height: "15px",
                  px: "3px",
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "8px",
                  bg: "accent",
                  color: "canvas",
                  fontSize: "9px",
                  fontFamily: "mono",
                  lineHeight: 1,
                })}
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </span>
          {item.label}
        </Link>
      );
    });
  }

  return (
    <div className={css({ minHeight: "100dvh", isolation: "isolate" })}>
      <a
        href="#main-content"
        className={css({
          position: "fixed",
          top: "8px",
          left: "8px",
          transform: "translateY(-200%)",
          zIndex: 150,
          bg: "accent",
          color: "canvas",
          p: "10px 15px",
          borderRadius: "6px",
          _focus: { transform: "translateY(0)" },
        })}
      >
        Skip to content
      </a>
      <header
        className={css({
          position: "sticky",
          top: 0,
          zIndex: 30,
          bg: "#111111f5",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid token(colors.line)",
          paddingTop: "env(safe-area-inset-top)",
        })}
      >
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            gap: { base: "10px", lg: "20px" },
            minHeight: "56px",
            px: { base: "16px", md: "32px" },
            maxWidth: "1864px",
            mx: "auto",
          })}
        >
          <Link
            href="/"
            aria-label="Arrsenal home"
            className={css({
              display: "flex",
              alignItems: "center",
              minHeight: "44px",
              minWidth: "44px",
              flexShrink: 0,
            })}
          >
            <Image
              src="/logo.svg"
              loading="eager"
              width={30}
              height={30}
              alt=""
              aria-hidden="true"
            />
          </Link>
          <nav
            aria-label="Main navigation"
            className={css({
              display: { base: "none", lg: "flex" },
              gap: "4px",
            })}
          >
            {links(false)}
            <Link
              href="/settings"
              aria-current={settingsActive ? "page" : undefined}
              className={css({
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "7px",
                minHeight: "32px",
                px: "12px",
                borderRadius: "8px",
                color: "muted",
                fontSize: "12px",
                fontWeight: "500",
                _currentPage: { color: "accent", bg: "elevated" },
                _hover: { bg: "elevated", color: "ink" },
              })}
            >
              <GearSixIcon
                size={18}
                weight={settingsActive ? "fill" : "regular"}
              />
              Settings
            </Link>
          </nav>
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "8px",
              ml: "auto",
            })}
          >
            <LibraryUtilities
              addKind={current?.href === "/shows" ? "series" : "movie"}
            />
            <Link
              href="/settings"
              aria-label="Settings"
              aria-current={settingsActive ? "page" : undefined}
              className={css({
                display: { base: "flex", lg: "none" },
                alignItems: "center",
                justifyContent: "center",
                gap: "7px",
                minWidth: "44px",
                minHeight: "44px",
                px: "10px",
                borderRadius: "7px",
                color: "muted",
                fontSize: "12px",
                _currentPage: { color: "accent", bg: "elevated" },
                _hover: { bg: "elevated", color: "ink" },
              })}
            >
              <GearSixIcon
                size={21}
                weight={settingsActive ? "fill" : "regular"}
              />
            </Link>
          </div>
        </div>
      </header>
      <main
        id="main-content"
        className={css({
          px: { base: "16px", md: "32px" },
          pt: { base: "20px", lg: "28px" },
          pb: { base: "calc(96px + env(safe-area-inset-bottom))", lg: "32px" },
          maxWidth: "1864px",
          mx: "auto",
          minWidth: 0,
        })}
      >
        {children}
      </main>
      <nav
        aria-label="Mobile navigation"
        className={css({
          display: { base: "grid", lg: "none" },
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: "2px",
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          bg: "#151515f5",
          backdropFilter: "blur(16px)",
          borderTop: "1px solid token(colors.line)",
          pt: "6px",
          px: "max(6px, env(safe-area-inset-left), env(safe-area-inset-right))",
          pb: "max(6px, env(safe-area-inset-bottom))",
        })}
      >
        {links(true)}
      </nav>
    </div>
  );
}
