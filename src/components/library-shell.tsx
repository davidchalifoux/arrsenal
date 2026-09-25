"use client";

import {
  CalendarBlankIcon,
  DownloadSimpleIcon,
  GearSixIcon,
  type Icon,
  SquaresFourIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { settingsSections } from "@/app/(library)/settings/sections";
import { useInstances, useLibrary, useQueue } from "@/lib/client-data";
import { useLibraryActions } from "./library-provider";
import { SearchTrigger, TaskStatus } from "./page-header";
import { wantedRows } from "./wanted";

type Section = "library" | "calendar" | "activity" | "wanted" | "settings";

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function activeSection(pathname: string): Section | null {
  if (pathname === "/" || matches(pathname, "/movies")) return "library";
  if (matches(pathname, "/shows")) return "library";
  if (matches(pathname, "/calendar")) return "calendar";
  if (matches(pathname, "/queue")) return "activity";
  if (matches(pathname, "/wanted")) return "wanted";
  if (matches(pathname, "/settings")) return "settings";
  return null;
}

const libraryChildren = [
  { href: "/", label: "All titles", match: (path: string) => path === "/" },
  {
    href: "/movies",
    label: "Movies",
    match: (path: string) => matches(path, "/movies"),
  },
  {
    href: "/shows",
    label: "Shows",
    match: (path: string) => matches(path, "/shows"),
  },
];

const sectionLinkStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "12px",
  height: "38px",
  px: "12px",
  borderRadius: "9px",
  fontSize: "14px",
  fontWeight: "500",
  color: "soft",
  transition: "background 150ms, color 150ms",
  _hover: { bg: "elevated", color: "ink" },
  "&[aria-current=page], &[data-active]": {
    bg: "elevated",
    color: "ink",
    "& > svg": { color: "accent" },
  },
});

const childLinkStyle = css({
  display: "flex",
  alignItems: "center",
  width: "100%",
  height: "32px",
  px: "10px",
  borderRadius: "7px",
  border: 0,
  bg: "transparent",
  fontSize: "13px",
  color: "muted",
  textAlign: "left",
  _hover: { color: "ink", bg: "elevated" },
  _currentPage: { color: "accent", fontWeight: "500" },
});

const countStyle = css({
  minWidth: "20px",
  height: "20px",
  px: "6px",
  display: "grid",
  placeItems: "center",
  borderRadius: "999px",
  fontFamily: "mono",
  fontSize: "11px",
  fontWeight: "600",
  lineHeight: 1,
});

function Count({
  value,
  label,
  strong = false,
}: {
  value: number;
  label: string;
  strong?: boolean;
}) {
  if (value <= 0) return null;
  return (
    <span
      role="img"
      aria-label={`${value} ${label}`}
      className={cx(
        countStyle,
        strong
          ? css({ bg: "accent", color: "onAccent" })
          : css({ bg: "elevated", color: "muted" }),
      )}
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}

function SectionLink({
  href,
  label,
  icon: IconComponent,
  active,
  current,
  children,
}: {
  href: string;
  label: string;
  icon: Icon;
  active: boolean;
  current: boolean;
  children?: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      data-active={active || undefined}
      className={sectionLinkStyle}
    >
      <IconComponent
        size={18}
        weight={active ? "fill" : "regular"}
        aria-hidden="true"
      />
      <span className={css({ flexGrow: 1 })}>{label}</span>
      {children}
    </Link>
  );
}

function SubNavigation({ children }: { children: ReactNode }) {
  return (
    <div
      className={css({
        display: "flex",
        flexDirection: "column",
        gap: "1px",
        m: "2px 0 6px 21px",
        pl: "12px",
        borderLeft: "1px solid token(colors.lineStrong)",
      })}
    >
      {children}
    </div>
  );
}

function useInstanceHealth() {
  const { realtime } = useLibraryActions();
  const instances = useInstances().data?.instances ?? [];
  const library = useLibrary();
  const libraryErrors = new Set(
    (library.data?.errors ?? []).map((error) => error.instanceId),
  );
  return instances.map((instance) => {
    const live = realtime.instances.find(
      (item) => item.instanceId === instance.id,
    );
    const healthy =
      instance.connected !== false &&
      !instance.error &&
      !libraryErrors.has(instance.id) &&
      live?.status !== "disconnected";
    return {
      id: instance.id,
      name: instance.name,
      kind: instance.kind,
      healthy,
    };
  });
}

function InstanceList() {
  const health = useInstanceHealth();
  if (!health.length) return null;
  return (
    <ul
      aria-label="Instance connections"
      className={css({
        listStyle: "none",
        m: 0,
        p: "10px 12px",
        display: "flex",
        flexDirection: "column",
        borderTop: "1px solid token(colors.line)",
      })}
    >
      {health.map((instance) => (
        <li key={instance.id}>
          <Link
            href="/settings/connections"
            title={
              instance.healthy
                ? `${instance.name} is connected`
                : `${instance.name} is unreachable`
            }
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "9px",
              mx: "-8px",
              px: "8px",
              py: "5px",
              borderRadius: "7px",
              fontSize: "13px",
              color: "soft",
              _hover: { bg: "elevated", color: "ink" },
            })}
          >
            <span
              aria-hidden="true"
              className={css({
                width: "7px",
                height: "7px",
                borderRadius: "999px",
                flexShrink: 0,
                bg: instance.healthy ? "positive" : "warning",
              })}
            />
            <span
              className={css({
                flexGrow: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              })}
            >
              {instance.name}
              <span className={css({ srOnly: true })}>
                {instance.healthy ? ", connected" : ", unreachable"}
              </span>
            </span>
            <span
              className={css({
                fontFamily: "mono",
                fontSize: "11px",
                color: "subtle",
              })}
            >
              {instance.kind === "sonarr" ? "Sonarr" : "Radarr"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function useCounts() {
  const queue = useQueue();
  const library = useLibrary();
  return {
    downloads: queue.data?.items.length ?? 0,
    wanted: wantedRows(library.data?.items ?? []).length,
  };
}

function Sidebar({ pathname }: { pathname: string }) {
  const { add } = useLibraryActions();
  const section = activeSection(pathname);
  const counts = useCounts();
  return (
    <aside
      className={css({
        display: { base: "none", lg: "flex" },
        flexDirection: "column",
        position: "sticky",
        top: 0,
        height: "100dvh",
        bg: "sidebar",
        borderRight: "1px solid token(colors.line)",
        overflowY: "auto",
      })}
    >
      <Link
        href="/"
        aria-label="Arrsenal home"
        className={css({
          display: "flex",
          alignItems: "center",
          height: "56px",
          flexShrink: 0,
          px: "20px",
        })}
      >
        <Image
          src="/logo.svg"
          loading="eager"
          width={28}
          height={28}
          alt=""
          aria-hidden="true"
        />
      </Link>
      <nav
        aria-label="Main navigation"
        className={css({
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          p: "6px 12px 14px",
        })}
      >
        <SectionLink
          href="/"
          label="Library"
          icon={SquaresFourIcon}
          active={section === "library"}
          current={false}
        />
        {section === "library" && (
          <SubNavigation>
            {libraryChildren.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                aria-current={child.match(pathname) ? "page" : undefined}
                className={childLinkStyle}
              >
                {child.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => add()}
              className={childLinkStyle}
            >
              Add new
            </button>
          </SubNavigation>
        )}
        <SectionLink
          href="/calendar"
          label="Calendar"
          icon={CalendarBlankIcon}
          active={section === "calendar"}
          current={section === "calendar"}
        />
        <SectionLink
          href="/queue"
          label="Activity"
          icon={DownloadSimpleIcon}
          active={section === "activity"}
          current={section === "activity"}
        >
          <Count value={counts.downloads} label="downloads" strong />
        </SectionLink>
        <SectionLink
          href="/wanted"
          label="Wanted"
          icon={WarningCircleIcon}
          active={section === "wanted"}
          current={section === "wanted"}
        >
          <Count value={counts.wanted} label="wanted items" />
        </SectionLink>
        <SectionLink
          href="/settings"
          label="Settings"
          icon={GearSixIcon}
          active={section === "settings"}
          current={false}
        />
        {section === "settings" && (
          <SubNavigation>
            {settingsSections.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                aria-current={
                  matches(pathname, child.href) ||
                  (pathname === "/settings" &&
                    child.href === "/settings/connections")
                    ? "page"
                    : undefined
                }
                className={childLinkStyle}
              >
                {child.title}
              </Link>
            ))}
          </SubNavigation>
        )}
      </nav>
      <div className={css({ flexGrow: 1 })} />
      <InstanceList />
    </aside>
  );
}

const mobileTabs: {
  href: string;
  label: string;
  icon: Icon;
  section: Section;
}[] = [
  { href: "/", label: "Library", icon: SquaresFourIcon, section: "library" },
  {
    href: "/calendar",
    label: "Calendar",
    icon: CalendarBlankIcon,
    section: "calendar",
  },
  {
    href: "/queue",
    label: "Activity",
    icon: DownloadSimpleIcon,
    section: "activity",
  },
  {
    href: "/wanted",
    label: "Wanted",
    icon: WarningCircleIcon,
    section: "wanted",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: GearSixIcon,
    section: "settings",
  },
];

function MobileNavigation({ pathname }: { pathname: string }) {
  const section = activeSection(pathname);
  const counts = useCounts();
  return (
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
        bg: "color-mix(in srgb, var(--sidebar) 94%, transparent)",
        backdropFilter: "blur(16px)",
        borderTop: "1px solid token(colors.line)",
        pt: "6px",
        px: "max(6px, env(safe-area-inset-left), env(safe-area-inset-right))",
        pb: "max(6px, env(safe-area-inset-bottom))",
      })}
    >
      {mobileTabs.map((tab) => {
        const active = section === tab.section;
        const count =
          tab.section === "activity"
            ? counts.downloads
            : tab.section === "wanted"
              ? counts.wanted
              : 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={css({
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
              minWidth: 0,
              minHeight: "56px",
              borderRadius: "10px",
              color: "muted",
              fontSize: "11px",
              fontWeight: "500",
              _currentPage: { color: "ink", "& svg": { color: "accent" } },
            })}
          >
            <span className={css({ position: "relative", display: "flex" })}>
              <tab.icon
                size={22}
                weight={active ? "fill" : "regular"}
                aria-hidden="true"
              />
              {count > 0 && (
                <span
                  className={css({
                    position: "absolute",
                    top: "-7px",
                    right: "-12px",
                  })}
                >
                  <Count
                    value={count}
                    label={
                      tab.section === "activity" ? "downloads" : "wanted items"
                    }
                    strong={tab.section === "activity"}
                  />
                </span>
              )}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AccountButton() {
  const auth = useQuery({
    queryKey: ["auth"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/auth", { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Auth status unavailable");
      return (await response.json()) as {
        enabled: boolean;
        username?: string;
      };
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const username = auth.data?.enabled ? auth.data.username : undefined;
  if (!username) return null;
  return (
    <Link
      href="/settings/security"
      aria-label={`Signed in as ${username}. Account settings`}
      title={`Signed in as ${username}`}
      className={css({
        width: "32px",
        height: "32px",
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        borderRadius: "999px",
        bg: "elevated",
        color: "ink",
        fontSize: "12px",
        fontWeight: "600",
        textTransform: "uppercase",
        _hover: { bg: "lineStrong" },
      })}
    >
      {username.slice(0, 1)}
    </Link>
  );
}

export function LibraryShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div
      className={css({
        minHeight: "100dvh",
        isolation: "isolate",
        display: { lg: "grid" },
        gridTemplateColumns: { lg: "232px minmax(0, 1fr)" },
      })}
    >
      <a
        href="#main-content"
        className={css({
          position: "fixed",
          top: "8px",
          left: "8px",
          transform: "translateY(-200%)",
          zIndex: 150,
          bg: "accent",
          color: "onAccent",
          p: "10px 15px",
          borderRadius: "8px",
          _focus: { transform: "translateY(0)" },
        })}
      >
        Skip to content
      </a>
      <Sidebar pathname={pathname} />
      <div className={css({ minWidth: 0 })}>
        <header
          className={css({
            position: "sticky",
            top: 0,
            zIndex: 30,
            bg: "sidebar",
            borderBottom: "1px solid token(colors.line)",
            paddingTop: "env(safe-area-inset-top)",
          })}
        >
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "10px",
              height: "56px",
              px: { base: "12px", lg: "20px" },
            })}
          >
            <Link
              href="/"
              aria-label="Arrsenal home"
              className={css({
                display: { base: "flex", lg: "none" },
                alignItems: "center",
                minWidth: "40px",
                minHeight: "40px",
                flexShrink: 0,
              })}
            >
              <Image
                src="/logo.svg"
                loading="eager"
                width={28}
                height={28}
                alt=""
                aria-hidden="true"
              />
            </Link>
            <span
              className={css({
                display: { base: "block", lg: "none" },
                flexGrow: 1,
              })}
            />
            <SearchTrigger />
            <span
              className={css({
                display: { base: "none", lg: "block" },
                flexGrow: 1,
              })}
            />
            <TaskStatus />
            <AccountButton />
          </div>
        </header>
        <main
          id="main-content"
          className={css({
            px: { base: "16px", lg: "28px" },
            pb: {
              base: "calc(96px + env(safe-area-inset-bottom))",
              lg: "40px",
            },
            minWidth: 0,
            // Pages without an action bar still need breathing room below the header.
            "& > :first-child:not([role=toolbar]):not(:has(> [role=toolbar]:first-child))":
              {
                mt: { base: "18px", lg: "24px" },
              },
          })}
        >
          {children}
        </main>
      </div>
      <MobileNavigation pathname={pathname} />
    </div>
  );
}
