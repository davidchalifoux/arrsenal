"use client";

import {
  BroadcastIcon,
  CircleDashedIcon,
  CompassIcon,
  DownloadSimpleIcon,
  FilmSlateIcon,
  GearSixIcon,
  ListIcon,
  PlusIcon,
  SquaresFourIcon,
  SunIcon,
  TelevisionSimpleIcon,
} from "@phosphor-icons/react";
import { css, cva } from "@styled-system/css";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { instancesQuery, libraryQuery, queueQuery } from "@/lib/queries";
import { PageUtilitiesContext, WorkspaceUtilities } from "./page-header";
import { Button, Modal } from "./ui";
import { useWorkspace } from "./workspace-provider";

const navigation = [
  { href: "/", label: "Library", icon: SquaresFourIcon },
  { href: "/discover", label: "Discover", icon: CompassIcon },
  { href: "/queue", label: "Download queue", icon: DownloadSimpleIcon },
];
const collections = [
  { href: "/movies", label: "Movies", icon: FilmSlateIcon },
  { href: "/shows", label: "Shows", icon: TelevisionSimpleIcon },
  { href: "/missing", label: "Missing", icon: CircleDashedIcon },
];
const navStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "11px",
    px: "12px",
    height: "39px",
    borderRadius: "6px",
    fontSize: "12px",
    transition: "background 150ms, color 150ms",
    border: "1px solid transparent",
    _hover: { bg: "elevated", color: "ink" },
  },
  variants: {
    active: {
      true: {
        bg: "#2a2a2a",
        color: "accent",
        borderColor: "#e5e5e50b",
        fontWeight: "500",
      },
      false: { color: "muted" },
    },
  },
});

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { connect } = useWorkspace();
  const [mobileOpen, setMobileOpen] = useState(false);
  const library = useQuery(libraryQuery);
  const instanceQuery = useQuery(instancesQuery);
  const queue = useQuery(queueQuery);
  const instances = instanceQuery.data?.instances ?? [];
  const items = library.data?.items ?? [];
  const isLibrary =
    pathname === "/" ||
    collections.some(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    );
  const counts: Record<string, number> = {
    "/movies": items.filter((item) => item.kind === "movie").length,
    "/shows": items.filter((item) => item.kind === "series").length,
    "/missing": items.filter(
      (item) => item.status === "partial" || item.status === "missing",
    ).length,
  };
  function openConnections() {
    setMobileOpen(false);
    connect();
  }
  function sidebar(mobile = false) {
    return (
      <>
        <Link
          href="/"
          aria-label="Arrsenal home"
          onClick={() => setMobileOpen(false)}
          className={css({
            display: "flex",
            alignItems: "center",
            px: "12px",
            height: "75px",
            mb: "19px",
          })}
        >
          <Image
            src="/logo.svg"
            width={34}
            height={34}
            alt=""
            aria-hidden="true"
          />
        </Link>
        <nav aria-label={mobile ? "Mobile navigation" : "Main navigation"}>
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "5px",
            })}
          >
            {navigation.map((item) => {
              const active =
                item.href === "/" ? isLibrary : pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={navStyle({ active })}
                  aria-current={pathname === item.href ? "page" : undefined}
                >
                  <item.icon size={19} weight={active ? "fill" : "regular"} />
                  <span className={css({ flex: 1 })}>{item.label}</span>
                  {item.href === "/queue" &&
                    (queue.data?.items.length ?? 0) > 0 && (
                      <span
                        className={css({
                          bg: "#2a2a2a",
                          color: "accent",
                          border: "1px solid #414141",
                          borderRadius: "4px",
                          minWidth: "19px",
                          height: "18px",
                          textAlign: "center",
                          fontSize: "10px",
                          lineHeight: "16px",
                          fontFamily: "mono",
                        })}
                      >
                        {queue.data?.items.length}
                      </span>
                    )}
                </Link>
              );
            })}
          </div>
          <p
            className={css({
              fontSize: "9px",
              fontWeight: "550",
              color: "subtle",
              letterSpacing: "1.3px",
              textTransform: "uppercase",
              px: "12px",
              mt: "33px",
              mb: "10px",
            })}
          >
            Your collection
          </p>
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "3px",
            })}
          >
            {collections.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={navStyle({ active })}
                  aria-current={pathname === item.href ? "page" : undefined}
                >
                  <item.icon size={18} />
                  <span className={css({ flex: 1 })}>{item.label}</span>
                  <span
                    className={css({
                      fontSize: "10px",
                      color: active ? "accent" : "subtle",
                      fontFamily: "mono",
                    })}
                  >
                    {library.data ? counts[item.href] : "..."}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: "12px",
            mt: "29px",
            mb: "8px",
          })}
        >
          <p
            className={css({
              fontSize: "9px",
              fontWeight: "550",
              color: "subtle",
              letterSpacing: "1.3px",
              textTransform: "uppercase",
            })}
          >
            Instances
          </p>
          <button
            type="button"
            onClick={openConnections}
            aria-label="Connect an instance"
            className={css({
              color: "subtle",
              p: "3px",
              borderRadius: "3px",
              _hover: { color: "accent", bg: "elevated" },
            })}
          >
            <PlusIcon size={13} />
          </button>
        </div>
        <div
          className={css({
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          })}
        >
          {instances.map((instance) => (
            <Link
              key={instance.id}
              href="/settings"
              onClick={() => setMobileOpen(false)}
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "10px",
                px: "13px",
                py: "10px",
                fontSize: "11px",
                color: "muted",
                borderRadius: "5px",
                _hover: { bg: "elevated", color: "ink" },
              })}
            >
              <span
                className={css({
                  color: instance.kind === "radarr" ? "#d4b866" : "#78afcf",
                })}
              >
                {instance.kind === "radarr" ? (
                  <SunIcon size={16} weight="fill" />
                ) : (
                  <BroadcastIcon size={16} />
                )}
              </span>
              <span className={css({ flex: 1 })}>{instance.name}</span>
              <span
                title={instance.connected ? "Connected" : "Unavailable"}
                className={css({
                  width: "5px",
                  height: "5px",
                  borderRadius: "50%",
                  bg: instance.connected ? "positive" : "negative",
                })}
              />
            </Link>
          ))}
          {instanceQuery.isPending && (
            <p
              className={css({
                px: "13px",
                py: "10px",
                color: "subtle",
                fontSize: "11px",
              })}
            >
              Loading instances...
            </p>
          )}
          {instanceQuery.isError && (
            <Link
              href="/settings"
              className={css({
                px: "13px",
                py: "10px",
                color: "warning",
                fontSize: "11px",
              })}
            >
              Connection status unavailable
            </Link>
          )}
          {instanceQuery.data && !instances.length && (
            <button
              type="button"
              onClick={openConnections}
              className={css({
                mx: "12px",
                py: "12px",
                border: "1px dashed token(colors.line)",
                borderRadius: "6px",
                fontSize: "11px",
                color: "subtle",
                _hover: { color: "accent", borderColor: "subtle" },
              })}
            >
              + Connect your first instance
            </button>
          )}
        </div>
        <div className={css({ flex: 1, minHeight: "35px" })} />
        <Link
          href="/settings"
          onClick={() => setMobileOpen(false)}
          className={navStyle({ active: pathname === "/settings" })}
        >
          <GearSixIcon size={18} />
          <span>Settings</span>
        </Link>
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            gap: "7px",
            px: "13px",
            py: "20px",
            mt: "9px",
            borderTop: "1px solid token(colors.line)",
            color: "subtle",
            fontSize: "9px",
          })}
        >
          <span
            className={css({
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              bg:
                instances.length &&
                instances.every((instance) => instance.connected)
                  ? "positive"
                  : "warning",
            })}
          />
          {instanceQuery.isPending
            ? "Checking connections..."
            : instances.length &&
                instances.every((instance) => instance.connected)
              ? "All instances connected"
              : "Local workspace"}
          <span
            className={css({
              ml: "auto",
              color: "#555555",
              fontFamily: "mono",
              fontSize: "8px",
            })}
          >
            v0.1.0
          </span>
        </div>
      </>
    );
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
      <aside
        className={css({
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
          width: "222px",
          bg: "sidebar",
          borderRight: "1px solid token(colors.line)",
          display: { base: "none", lg: "flex" },
          flexDirection: "column",
          px: "15px",
          overflowY: "auto",
          zIndex: 20,
        })}
      >
        {sidebar()}
      </aside>
      <div className={css({ ml: { base: 0, lg: "222px" }, minWidth: 0 })}>
        <header
          className={css({
            height: "56px",
            borderBottom: "1px solid token(colors.line)",
            display: { base: "flex", lg: "none" },
            alignItems: "center",
            justifyContent: "space-between",
            gap: "14px",
            px: { base: "19px", md: "32px" },
            bg: "#111111f5",
          })}
        >
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "13px",
              minWidth: 0,
            })}
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              className={css({
                width: "44px",
                height: "44px",
                ml: "-7px",
              })}
            >
              <ListIcon size={22} />
            </Button>
          </div>
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "8px",
            })}
          >
            <WorkspaceUtilities />
          </div>
        </header>
        <main
          id="main-content"
          className={css({
            px: { base: "19px", md: "32px" },
            pt: { base: "20px", lg: "28px" },
            pb: "30px",
            maxWidth: "1800px",
            mx: "auto",
          })}
        >
          <PageUtilitiesContext
            value={(actions) => (
              <WorkspaceUtilities desktopOnly>{actions}</WorkspaceUtilities>
            )}
          >
            {children}
          </PageUtilitiesContext>
        </main>
      </div>
      <Modal
        open={mobileOpen}
        onOpenChange={setMobileOpen}
        title="Your workspace"
      >
        <div className={css({ display: "flex", flexDirection: "column" })}>
          {sidebar(true)}
        </div>
      </Modal>
    </div>
  );
}
