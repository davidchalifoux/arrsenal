"use client";

import {
  CalendarBlankIcon,
  DownloadSimpleIcon,
  FilmSlateIcon,
  GearSixIcon,
  HouseIcon,
  TelevisionSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { useInstances, useQueue, useSyncData } from "@/lib/collections";
import { useLibraryActions } from "./library-provider";
import { LibraryUtilities } from "./page-header";
import { Button } from "./ui";

const navigation = [
  { href: "/", label: "Home", icon: HouseIcon },
  { href: "/movies", label: "Movies", icon: FilmSlateIcon },
  { href: "/shows", label: "Shows", icon: TelevisionSimpleIcon },
  { href: "/queue", label: "Downloads", icon: DownloadSimpleIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarBlankIcon },
];

function RealtimeWarning() {
  const { realtime, notify } = useLibraryActions();
  const instances = useInstances();
  const sync = useSyncData();
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const disconnected = realtime.instances.filter(
    (instance) => instance.status === "disconnected",
  );
  const streamDisconnected = realtime.connection === "disconnected";
  if (!streamDisconnected && !disconnected.length) return null;

  const names = disconnected.map(
    (instance) =>
      instances.data?.instances.find(
        (configured) => configured.id === instance.instanceId,
      )?.name ?? "An instance",
  );

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await sync("all");
      const failed = client.getQueryCache().findAll({
        type: "active",
        predicate: (query) => query.state.status === "error",
      });
      if (failed.length) {
        notify("Some data could not be refreshed. Please try again.", true);
      }
    } catch {
      notify("Could not refresh data. Please try again.", true);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div
      role="alert"
      className={css({
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "12px",
        mb: "20px",
        p: "12px 14px",
        border: "1px solid #633a35",
        bg: "#30211f",
        color: "negative",
        borderRadius: "7px",
        fontSize: "12px",
        lineHeight: "1.6",
      })}
    >
      <WarningCircleIcon size={20} aria-hidden="true" />
      <div className={css({ flex: "1 1 240px", minWidth: 0 })}>
        <p className={css({ fontWeight: "600" })}>Live updates disconnected</p>
        {streamDisconnected && (
          <p>The browser's live connection is unavailable.</p>
        )}
        {!!names.length && (
          <p className={css({ overflowWrap: "anywhere" })}>
            Affected instances: {names.join(", ")}.
          </p>
        )}
        <p>Displayed data may be outdated.</p>
      </div>
      <div
        className={css({
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "8px",
        })}
      >
        <Button
          disabled={refreshing}
          onClick={() => void refresh()}
          className={css({ minHeight: "44px" })}
        >
          {refreshing ? "Refreshing..." : "Refresh data"}
        </Button>
        <Link
          href="/settings/connections"
          className={css({
            display: "inline-flex",
            alignItems: "center",
            minHeight: "44px",
            px: "8px",
            color: "inherit",
            textDecoration: "underline",
            textUnderlineOffset: "3px",
            _hover: { color: "ink" },
          })}
        >
          Check instances
        </Link>
      </div>
    </div>
  );
}

export function LibraryShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLibraryPage =
    pathname === "/" || pathname === "/movies" || pathname === "/shows";
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
            <LibraryUtilities />
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
          pt: isLibraryPage ? "8px" : { base: "20px", lg: "28px" },
          pb: { base: "calc(96px + env(safe-area-inset-bottom))", lg: "32px" },
          maxWidth: "1864px",
          mx: "auto",
          minWidth: 0,
        })}
      >
        <RealtimeWarning />
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
