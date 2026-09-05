"use client";

import { Popover } from "@base-ui/react/popover";
import {
  ArrowClockwiseIcon,
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowsDownUpIcon,
  BroadcastIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  CommandIcon,
  CompassIcon,
  DownloadSimpleIcon,
  FilmSlateIcon,
  FolderSimpleIcon,
  GearSixIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
  StackIcon,
  SunIcon,
  TelevisionSimpleIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { css, cva, cx } from "@styled-system/css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useEffectEvent, useState } from "react";
import { api, mediaHref, qualityLabel } from "@/lib/client";
import { demoInstances } from "@/lib/demo";
import type {
  InstanceSummary,
  LibraryResponse,
  MediaItem,
  QueueResponse,
} from "@/lib/types";
import { AddMedia } from "./add-media";
import { MediaCard, MediaList, Poster } from "./media-card";
import { MediaDetails } from "./media-details";
import { DownloadQueue } from "./queue";
import { Settings } from "./settings";
import {
  Button,
  buttonStyle,
  inputStyle,
  Modal,
  Notice,
  SelectField,
  Spinner,
} from "./ui";

export type View =
  | "library"
  | "movies"
  | "shows"
  | "missing"
  | "discover"
  | "queue"
  | "settings";

const viewNames: Record<View, string> = {
  library: "All media",
  movies: "Movies",
  shows: "Shows",
  missing: "Missing",
  discover: "Discover",
  queue: "Download queue",
  settings: "Connections",
};
const gridStyle = css({
  display: "grid",
  gridTemplateColumns: {
    base: "repeat(2, minmax(0, 1fr))",
    sm: "repeat(3, minmax(0, 1fr))",
    md: "repeat(4, minmax(0, 1fr))",
    lg: "repeat(4, minmax(0, 1fr))",
    xl: "repeat(6, minmax(0, 1fr))",
  },
  columnGap: { base: "15px", md: "20px" },
  rowGap: "29px",
});
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

export function Arrsenal({ view, mediaId }: { view: View; mediaId?: string }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const library = useQuery({
    queryKey: ["library"],
    queryFn: ({ signal }) => api<LibraryResponse>("/api/library", { signal }),
    refetchInterval: (query) => (query.state.data?.demo ? false : 60_000),
  });
  const instanceQuery = useQuery({
    queryKey: ["instances"],
    queryFn: ({ signal }) =>
      api<{ instances: InstanceSummary[] }>("/api/instances", { signal }),
    refetchInterval: 60_000,
  });
  const queue = useQuery({
    queryKey: ["queue"],
    queryFn: ({ signal }) => api<QueueResponse>("/api/queue", { signal }),
    refetchInterval: 15_000,
  });
  const [addOpen, setAddOpen] = useState(false);
  const [addSeed, setAddSeed] = useState<MediaItem | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [instanceFilter, setInstanceFilter] = useState("all");
  const [quality, setQuality] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("recent");
  const [layout, setLayout] = useState("grid");
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const demo = library.data?.demo ?? false;
  const items = library.data?.items ?? [];
  const detail = mediaId
    ? items.find(
        (item) =>
          item.id === mediaId &&
          item.kind === (view === "movies" ? "movie" : "series"),
      )
    : undefined;
  const instances = instanceQuery.data?.instances ?? [];
  const displayInstances = demo ? demoInstances : instances;
  const isLibrary = ["library", "movies", "shows", "missing"].includes(view);
  const incomplete = items.filter(
    (item) => item.status === "partial" || item.status === "missing",
  );
  const counts = {
    library: items.length,
    movies: items.filter((item) => item.kind === "movie").length,
    shows: items.filter((item) => item.kind === "series").length,
    missing: incomplete.length,
  };
  const filtered = items
    .filter((item) => {
      if (view === "movies" && item.kind !== "movie") return false;
      if (view === "shows" && item.kind !== "series") return false;
      if (
        view === "missing" &&
        item.status !== "partial" &&
        item.status !== "missing"
      )
        return false;
      if (
        status !== "all" &&
        (status === "incomplete"
          ? !["partial", "missing"].includes(item.status)
          : item.status !== status)
      )
        return false;
      return item.targets.some(
        (target) =>
          (instanceFilter === "all" || target.instanceId === instanceFilter) &&
          (quality === "all" ||
            qualityLabel(target.qualityProfile, target.quality) === quality),
      );
    })
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "year"
          ? b.year - a.year
          : sort === "rating"
            ? (b.rating ?? 0) - (a.rating ?? 0)
            : b.added.localeCompare(a.added),
    );
  const filterCount =
    Number(instanceFilter !== "all") +
    Number(quality !== "all") +
    Number(status !== "all");
  function notify(message: string, error = false) {
    setToast({ message, error });
  }
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["library"] });
    void queryClient.invalidateQueries({ queryKey: ["queue"] });
    void queryClient.invalidateQueries({ queryKey: ["instances"] });
    void queryClient.invalidateQueries({ queryKey: ["episodes"] });
  }
  function add(item: MediaItem | null = null) {
    setAddSeed(item);
    setAddOpen(true);
  }
  function connect() {
    setAddOpen(false);
    setMobileOpen(false);
    setConnectOpen(true);
  }
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setSearchOpen((open) => !open);
    }
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 6500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function sidebarContent(mobile = false) {
    return (
      <>
        <Link
          href="/"
          aria-label="Arrsenal home"
          onClick={() => setMobileOpen(false)}
          className={css({
            display: "flex",
            gap: "10px",
            alignItems: "center",
            px: "12px",
            height: "75px",
            mb: "19px",
          })}
        >
          <BrandMark />
          <span
            className={css({
              fontSize: "24px",
              fontWeight: "650",
              letterSpacing: "-1.3px",
              color: "ink",
            })}
          >
            arrsenal<span className={css({ color: "accent" })}>.</span>
          </span>
        </Link>
        <nav aria-label={mobile ? "Mobile navigation" : "Main navigation"}>
          <div
            className={css({
              display: "flex",
              flexDirection: "column",
              gap: "5px",
            })}
          >
            {[
              {
                id: "library",
                label: "Library",
                icon: SquaresFourIcon,
                href: "/",
              },
              {
                id: "discover",
                label: "Discover",
                icon: CompassIcon,
                href: "/discover",
              },
              {
                id: "queue",
                label: "Download queue",
                icon: DownloadSimpleIcon,
                href: "/queue",
              },
            ].map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={navStyle({
                  active: item.id === "library" ? isLibrary : view === item.id,
                })}
                aria-current={view === item.id ? "page" : undefined}
              >
                <item.icon
                  size={19}
                  weight={
                    (item.id === "library" ? isLibrary : view === item.id)
                      ? "fill"
                      : "regular"
                  }
                />
                <span className={css({ flex: 1 })}>{item.label}</span>
                {item.id === "queue" && (queue.data?.items.length ?? 0) > 0 && (
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
            ))}
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
            {[
              { id: "movies" as const, icon: FilmSlateIcon },
              { id: "shows" as const, icon: TelevisionSimpleIcon },
              { id: "missing" as const, icon: CircleDashedIcon },
            ].map((item) => (
              <Link
                key={item.id}
                href={`/${item.id}`}
                onClick={() => setMobileOpen(false)}
                className={navStyle({ active: view === item.id })}
                aria-current={view === item.id ? "page" : undefined}
              >
                <item.icon size={18} />
                <span className={css({ flex: 1 })}>{viewNames[item.id]}</span>
                <span
                  className={css({
                    fontSize: "10px",
                    color: view === item.id ? "accent" : "subtle",
                    fontFamily: "mono",
                  })}
                >
                  {counts[item.id]}
                </span>
              </Link>
            ))}
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
            {demo ? "Sample instances" : "Instances"}
          </p>
          <button
            type="button"
            onClick={connect}
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
          {displayInstances.map((instance) => (
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
                title={
                  demo
                    ? "Sample instance"
                    : instance.connected
                      ? "Connected"
                      : "Unavailable"
                }
                className={css({
                  width: "5px",
                  height: "5px",
                  borderRadius: "50%",
                  bg: demo
                    ? "#757575"
                    : instance.connected
                      ? "positive"
                      : "negative",
                })}
              />
            </Link>
          ))}
          {!displayInstances.length && (
            <button
              type="button"
              onClick={connect}
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
        {demo && (
          <div
            className={css({
              mx: "5px",
              mb: "19px",
              p: "14px",
              border: "1px solid #353535",
              borderRadius: "8px",
              background: "linear-gradient(125deg, #242424, #191919)",
            })}
          >
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "7px",
                mb: "8px",
                fontSize: "11px",
                fontWeight: "550",
                color: "#d8d8d8",
              })}
            >
              <StackIcon size={15} className={css({ color: "accent" })} />
              Better, together.
            </div>
            <p
              className={css({
                fontSize: "10px",
                color: "muted",
                lineHeight: "1.7",
                mb: "12px",
              })}
            >
              Your instances. One beautiful library.
              <br />
              Make this space yours.
            </p>
            <button
              type="button"
              onClick={connect}
              className={css({
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                color: "#c7c7c7",
                fontWeight: "500",
                fontSize: "10px",
                _hover: { color: "accent" },
              })}
            >
              Connect an instance
              <ArrowRightIcon size={13} />
            </button>
          </div>
        )}
        <Link
          href="/settings"
          onClick={() => setMobileOpen(false)}
          className={navStyle({ active: view === "settings" })}
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
              bg: demo
                ? "#929292"
                : instances.length &&
                    instances.every((instance) => instance.connected)
                  ? "positive"
                  : "warning",
            })}
          />
          {demo
            ? "Demo workspace"
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
        {sidebarContent()}
      </aside>
      <div className={css({ ml: { base: 0, lg: "222px" }, minWidth: 0 })}>
        <header
          className={css({
            height: "72px",
            borderBottom: "1px solid token(colors.line)",
            display: "flex",
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
                display: { base: "inline-flex", lg: "none" },
                ml: "-7px",
              })}
            >
              <ListIcon size={22} />
            </Button>
            <span
              className={css({
                display: { base: "none", sm: "inline-flex" },
                color: "subtle",
              })}
            >
              {isLibrary ? (
                <FolderSimpleIcon size={17} />
              ) : view === "queue" ? (
                <DownloadSimpleIcon size={17} />
              ) : view === "discover" ? (
                <CompassIcon size={17} />
              ) : (
                <GearSixIcon size={17} />
              )}
            </span>
            <span
              className={css({
                fontSize: "11px",
                color: "muted",
                display: { base: "none", sm: "inline" },
              })}
            >
              {isLibrary ? "Library" : "Workspace"}
            </span>
            <CaretRightIcon
              size={10}
              className={css({
                color: "#555555",
                display: { base: "none", sm: "block" },
              })}
            />
            <span
              className={css({
                fontSize: "11px",
                color: "#d8d8d8",
                whiteSpace: "nowrap",
              })}
            >
              {viewNames[view]}
            </span>
          </div>
          <div
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "16px",
            })}
          >
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search library"
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "9px",
                height: "34px",
                width: { base: "30px", md: "232px" },
                px: { base: "5px", md: "11px" },
                color: "subtle",
                fontSize: "11px",
                bg: { base: "transparent", md: "#191919" },
                border: { base: "none", md: "1px solid token(colors.line)" },
                borderRadius: "6px",
                _hover: { color: "muted", borderColor: "#414141" },
              })}
            >
              <MagnifyingGlassIcon size={16} />
              <span
                className={css({ display: { base: "none", md: "inline" } })}
              >
                Search your library...
              </span>
              <kbd
                className={css({
                  display: { base: "none", md: "flex" },
                  alignItems: "center",
                  gap: "2px",
                  ml: "auto",
                  fontSize: "9px",
                  color: "#858585",
                  border: "1px solid #353535",
                  borderRadius: "3px",
                  px: "3px",
                  height: "17px",
                })}
              >
                <CommandIcon size={9} />K
              </kbd>
            </button>
            <Button variant="primary" onClick={() => add()}>
              <PlusIcon size={15} weight="bold" />
              Add media
            </Button>
          </div>
        </header>
        <main
          id="main-content"
          className={css({
            px: { base: "19px", md: "32px" },
            pt: { base: "26px", md: "32px" },
            pb: "30px",
            maxWidth: "1800px",
            mx: "auto",
          })}
        >
          {mediaId ? (
            library.isPending ? (
              <div
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  py: "40px",
                  color: "muted",
                })}
              >
                <Spinner />
                Loading title...
              </div>
            ) : detail ? (
              <>
                {library.data?.errors.map((error) => (
                  <div
                    key={`${error.instanceId}:${error.message}`}
                    className={css({ mb: "14px" })}
                  >
                    <Notice error>
                      {error.instanceName}: {error.message}
                    </Notice>
                  </div>
                ))}
                <MediaDetails
                  key={detail.id}
                  media={detail}
                  onAddTarget={add}
                  demo={demo}
                  notify={notify}
                  onChanged={refresh}
                />
              </>
            ) : (
              <div className={css({ py: "32px" })}>
                <h1
                  className={css({
                    fontSize: "26px",
                    fontWeight: "550",
                    mb: "16px",
                  })}
                >
                  Title unavailable
                </h1>
                <Notice error>
                  {library.isError
                    ? library.error.message
                    : library.data?.errors.length
                      ? "Some instances could not be reached. This title may still be in your library."
                      : "This title is not in the current library, or its media type does not match this page."}
                </Notice>
                <div
                  className={css({ display: "flex", gap: "12px", mt: "20px" })}
                >
                  <Button onClick={refresh}>Try again</Button>
                  <Link
                    href={`/${view}`}
                    className={buttonStyle({ variant: "ghost" })}
                  >
                    Back to {view === "movies" ? "movies" : "shows"}
                  </Link>
                </div>
              </div>
            )
          ) : isLibrary ? (
            <>
              <div
                className={css({
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  mb: "28px",
                  gap: "14px",
                })}
              >
                <div>
                  <div
                    className={css({
                      display: "flex",
                      alignItems: "center",
                      gap: "11px",
                    })}
                  >
                    <h1
                      className={css({
                        fontSize: { base: "27px", md: "29px" },
                        letterSpacing: "-1px",
                        fontWeight: "600",
                        lineHeight: "1.3",
                      })}
                    >
                      {view === "library"
                        ? "Your library"
                        : view === "missing"
                          ? "Fill in the gaps"
                          : view === "movies"
                            ? "Movie library"
                            : "Shows"}
                    </h1>
                    {demo && (
                      <span
                        className={css({
                          fontSize: "8px",
                          fontWeight: "500",
                          textTransform: "uppercase",
                          letterSpacing: "1px",
                          color: "muted",
                          bg: "#242424",
                          border: "1px solid #353535",
                          borderRadius: "4px",
                          px: "6px",
                          py: "3px",
                          mt: "2px",
                        })}
                      >
                        Demo
                      </span>
                    )}
                  </div>
                  <p
                    className={css({
                      color: "muted",
                      fontSize: "12px",
                      mt: "7px",
                      lineHeight: "1.7",
                    })}
                  >
                    {view === "missing"
                      ? "A little closer to complete. See what your quality targets are missing."
                      : "All your favorites. Every quality. One place."}
                  </p>
                </div>
                <div
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    pt: "5px",
                  })}
                >
                  <span
                    className={css({
                      display: { base: "none", md: "inline" },
                      color: "subtle",
                      fontSize: "10px",
                    })}
                  >
                    {demo
                      ? "Sample library"
                      : library.isFetching
                        ? "Syncing library..."
                        : library.isError
                          ? "Sync failed"
                          : library.data?.errors.length
                            ? "Some instances need attention"
                            : "Library up to date"}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Refresh library"
                    disabled={library.isFetching}
                    onClick={refresh}
                  >
                    <ArrowClockwiseIcon
                      size={16}
                      className={
                        library.isFetching
                          ? css({ animation: "spin 1s linear infinite" })
                          : undefined
                      }
                    />
                  </Button>
                </div>
              </div>
              <div
                className={css({
                  display: "grid",
                  gridTemplateColumns: {
                    base: "repeat(2, minmax(0, 1fr))",
                    md: "repeat(4, minmax(0, 1fr))",
                  },
                  gap: "12px",
                  mb: "32px",
                })}
              >
                {[
                  {
                    label: "Total titles",
                    count: items.length,
                    note: `${counts.movies} movies · ${counts.shows} shows`,
                    icon: StackIcon,
                    color: "#c7c7c7",
                    filter: "all",
                  },
                  {
                    label: "Available",
                    count: items.filter((item) => item.status === "available")
                      .length,
                    note: "Ready in every quality",
                    icon: CheckCircleIcon,
                    color: "#b1d894",
                    filter: "available",
                  },
                  {
                    label: "Incomplete",
                    count: incomplete.length,
                    note: "A target needs some love",
                    icon: CircleDashedIcon,
                    color: "#d8ba80",
                    filter: "incomplete",
                  },
                  {
                    label: "Downloading",
                    count: items.filter((item) => item.status === "downloading")
                      .length,
                    note: "Good things are on the way",
                    icon: ArrowDownIcon,
                    color: "#9dbbed",
                    filter: "downloading",
                  },
                ].map((stat) => (
                  <button
                    type="button"
                    key={stat.label}
                    onClick={() => {
                      setStatus(stat.filter);
                    }}
                    className={css({
                      textAlign: "left",
                      bg: "#191919",
                      border: "1px solid token(colors.line)",
                      borderRadius: "8px",
                      px: { base: "14px", md: "17px" },
                      py: "15px",
                      _hover: { bg: "#202020", borderColor: "#414141" },
                      transition: "background 150ms, border-color 150ms",
                    })}
                  >
                    <div
                      className={css({
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "10px",
                        color: "muted",
                        fontSize: "10px",
                      })}
                    >
                      <span>{stat.label}</span>
                      <stat.icon size={17} style={{ color: stat.color }} />
                    </div>
                    <div
                      className={css({
                        fontSize: "27px",
                        fontWeight: "550",
                        lineHeight: 1,
                        letterSpacing: "-.8px",
                        mt: "10px",
                        mb: "7px",
                      })}
                    >
                      {library.isPending ? (
                        <span className={css({ color: "subtle" })}>...</span>
                      ) : (
                        stat.count
                      )}
                    </div>
                    <p
                      className={css({
                        color: "subtle",
                        fontSize: "9px",
                        lineHeight: "1.4",
                      })}
                    >
                      {stat.note}
                    </p>
                  </button>
                ))}
              </div>
              {library.data?.errors.map((error) => (
                <div
                  className={css({ mb: "14px" })}
                  key={`${error.instanceId}:${error.message}`}
                >
                  <Notice error>
                    {error.instanceName}: {error.message}
                  </Notice>
                </div>
              ))}
              <div
                className={css({
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  borderBottom: "1px solid token(colors.line)",
                  pb: "15px",
                  mb: "23px",
                  flexWrap: "wrap",
                })}
              >
                <nav
                  aria-label="Library categories"
                  className={css({
                    display: "flex",
                    gap: { base: "16px", md: "21px" },
                    height: "34px",
                    alignItems: "center",
                  })}
                >
                  {(["library", "movies", "shows"] as const).map((tab) => (
                    <Link
                      href={tab === "library" ? "/" : `/${tab}`}
                      key={tab}
                      aria-current={view === tab ? "page" : undefined}
                      className={css({
                        height: "50px",
                        display: "flex",
                        alignItems: "center",
                        gap: "7px",
                        position: "relative",
                        fontSize: "11px",
                        color: view === tab ? "ink" : "subtle",
                        fontWeight: view === tab ? "550" : "400",
                        _hover: { color: "ink" },
                        _after: {
                          content: '""',
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: { base: "7px", md: "-7px" },
                          height: "2px",
                          borderRadius: "2px",
                          bg: view === tab ? "accent" : "transparent",
                        },
                      })}
                    >
                      {tab === "library" ? "All media" : viewNames[tab]}
                      <span
                        className={css({
                          fontSize: "9px",
                          fontFamily: "mono",
                          borderRadius: "4px",
                          px: "5px",
                          py: "1px",
                          color: view === tab ? "#c7c7c7" : "#858585",
                          bg: view === tab ? "#303030" : "#242424",
                        })}
                      >
                        {counts[tab]}
                      </span>
                    </Link>
                  ))}
                </nav>
                <div
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flexWrap: "wrap",
                  })}
                >
                  <Popover.Root>
                    <Popover.Trigger
                      className={buttonStyle({
                        size: "sm",
                        variant: filterCount ? "primary" : "secondary",
                      })}
                    >
                      <SlidersHorizontalIcon size={14} />
                      Filters{filterCount > 0 ? ` (${filterCount})` : ""}
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Positioner
                        sideOffset={8}
                        align="end"
                        className={css({ zIndex: 40 })}
                      >
                        <Popover.Popup
                          className={css({
                            width: "260px",
                            p: "18px",
                            bg: "#202020",
                            border: "1px solid #414141",
                            borderRadius: "10px",
                            boxShadow: "0 12px 40px #0006",
                          })}
                        >
                          <h3
                            className={css({
                              fontSize: "13px",
                              fontWeight: "550",
                              mb: "17px",
                            })}
                          >
                            Make it your view
                          </h3>
                          <div
                            className={css({
                              display: "flex",
                              flexDirection: "column",
                              gap: "14px",
                            })}
                          >
                            <div>
                              <p
                                className={css({
                                  color: "muted",
                                  fontSize: "10px",
                                  mb: "7px",
                                })}
                              >
                                Instance
                              </p>
                              <SelectField
                                value={instanceFilter}
                                onChange={setInstanceFilter}
                                label="Filter by instance"
                                options={[
                                  { value: "all", label: "All instances" },
                                  ...displayInstances.map((instance) => ({
                                    value: instance.id,
                                    label: instance.name,
                                  })),
                                ]}
                              />
                            </div>
                            <div>
                              <p
                                className={css({
                                  color: "muted",
                                  fontSize: "10px",
                                  mb: "7px",
                                })}
                              >
                                Quality target
                              </p>
                              <SelectField
                                value={quality}
                                onChange={setQuality}
                                label="Filter by quality"
                                options={[
                                  { value: "all", label: "All qualities" },
                                  { value: "4K", label: "4K / Ultra HD" },
                                  { value: "1080p", label: "1080p / Full HD" },
                                  { value: "720p", label: "720p / HD" },
                                ]}
                              />
                            </div>
                            <div>
                              <p
                                className={css({
                                  color: "muted",
                                  fontSize: "10px",
                                  mb: "7px",
                                })}
                              >
                                Availability
                              </p>
                              <SelectField
                                value={status}
                                onChange={setStatus}
                                label="Filter by availability"
                                options={[
                                  { value: "all", label: "Any status" },
                                  { value: "available", label: "Available" },
                                  {
                                    value: "incomplete",
                                    label: "Incomplete / missing",
                                  },
                                  {
                                    value: "downloading",
                                    label: "Downloading",
                                  },
                                ]}
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setInstanceFilter("all");
                                setQuality("all");
                                setStatus("all");
                              }}
                            >
                              Reset filters
                            </Button>
                          </div>
                        </Popover.Popup>
                      </Popover.Positioner>
                    </Popover.Portal>
                  </Popover.Root>
                  <span
                    className={css({
                      color: "subtle",
                      display: { base: "none", sm: "flex" },
                    })}
                  >
                    <ArrowsDownUpIcon size={13} />
                  </span>
                  <SelectField
                    compact
                    value={sort}
                    onChange={setSort}
                    label="Sort library"
                    options={[
                      { value: "recent", label: "Recently added" },
                      { value: "title", label: "Title A-Z" },
                      { value: "year", label: "Release year" },
                      { value: "rating", label: "Highest rated" },
                    ]}
                  />
                  <div
                    className={css({
                      display: "flex",
                      alignItems: "center",
                      bg: "#191919",
                      border: "1px solid token(colors.line)",
                      borderRadius: "6px",
                      padding: "3px",
                      ml: "4px",
                      gap: "2px",
                    })}
                  >
                    <button
                      type="button"
                      aria-label="Grid view"
                      aria-pressed={layout === "grid"}
                      onClick={() => setLayout("grid")}
                      className={css({
                        display: "grid",
                        placeItems: "center",
                        width: "27px",
                        height: "24px",
                        bg: layout === "grid" ? "#353535" : "transparent",
                        color: layout === "grid" ? "#d8d8d8" : "subtle",
                        borderRadius: "3px",
                      })}
                    >
                      <SquaresFourIcon
                        size={15}
                        weight={layout === "grid" ? "fill" : "regular"}
                      />
                    </button>
                    <button
                      type="button"
                      aria-label="List view"
                      aria-pressed={layout === "list"}
                      onClick={() => setLayout("list")}
                      className={css({
                        display: "grid",
                        placeItems: "center",
                        width: "27px",
                        height: "24px",
                        bg: layout === "list" ? "#353535" : "transparent",
                        color: layout === "list" ? "#d8d8d8" : "subtle",
                        borderRadius: "3px",
                      })}
                    >
                      <ListIcon size={16} />
                    </button>
                  </div>
                </div>
              </div>
              {(filterCount > 0 || view === "missing") && (
                <div
                  className={css({
                    display: "flex",
                    gap: "8px",
                    alignItems: "center",
                    mb: "20px",
                    fontSize: "11px",
                    color: "muted",
                  })}
                >
                  <span>{filtered.length} matching titles</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setInstanceFilter("all");
                      setQuality("all");
                      setStatus("all");
                      if (view === "missing") router.push("/");
                    }}
                  >
                    <XIcon size={12} />
                    Clear filters
                  </Button>
                </div>
              )}
              {library.isError ? (
                <Notice error>
                  {library.error.message}{" "}
                  <button
                    type="button"
                    onClick={refresh}
                    className={css({ textDecoration: "underline" })}
                  >
                    Try again
                  </button>
                </Notice>
              ) : library.isPending ? (
                <div className={gridStyle}>
                  {Array.from({ length: 12 }, (_, index) => (
                    <div key={`skeleton-${index.toString()}`}>
                      <div
                        className={css({
                          aspectRatio: "2 / 3",
                          bg: "#191919",
                          borderRadius: "8px",
                        })}
                      />
                      <div
                        className={css({
                          height: "12px",
                          width: "70%",
                          mt: "13px",
                          bg: "#242424",
                          borderRadius: "3px",
                        })}
                      />
                    </div>
                  ))}
                </div>
              ) : filtered.length ? (
                layout === "grid" ? (
                  <div className={gridStyle}>
                    {filtered.map((item, index) => (
                      <MediaCard
                        key={item.id}
                        item={item}
                        index={index}
                        href={mediaHref(item)}
                      />
                    ))}
                  </div>
                ) : (
                  <MediaList items={filtered} />
                )
              ) : (
                <div
                  className={css({
                    textAlign: "center",
                    py: "70px",
                    border: "1px dashed token(colors.line)",
                    borderRadius: "10px",
                  })}
                >
                  <FolderSimpleIcon
                    size={36}
                    weight="duotone"
                    className={css({ mx: "auto", color: "subtle", mb: "15px" })}
                  />
                  <h3
                    className={css({
                      fontSize: "18px",
                      fontWeight: "550",
                      mb: "8px",
                    })}
                  >
                    {items.length
                      ? "Nothing in this view. Yet."
                      : "The beginning of a great collection."}
                  </h3>
                  <p
                    className={css({
                      fontSize: "12px",
                      color: "muted",
                      mb: "20px",
                    })}
                  >
                    {items.length
                      ? "Try a different filter to find what you're looking for."
                      : "Add your first movie or show to get things rolling."}
                  </p>
                  <Button
                    variant="primary"
                    onClick={() => {
                      if (items.length) {
                        setInstanceFilter("all");
                        setQuality("all");
                        setStatus("all");
                        router.push("/");
                      } else add();
                    }}
                  >
                    {items.length ? "Show all media" : "Add media"}
                  </Button>
                </div>
              )}
              <footer
                className={css({
                  mt: "30px",
                  borderTop: "1px solid token(colors.line)",
                  pt: "17px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  color: "subtle",
                  fontSize: "10px",
                  flexWrap: "wrap",
                })}
              >
                <span>
                  {filtered.length} titles
                  <span className={css({ mx: "7px", color: "#4d4d4d" })}>
                    ·
                  </span>
                  {displayInstances.length} {demo ? "sample " : ""}instances
                  <span className={css({ mx: "7px", color: "#4d4d4d" })}>
                    ·
                  </span>
                  One library
                </span>
                <span
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                  })}
                >
                  <span
                    className={css({
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    })}
                  >
                    <span
                      className={css({
                        width: "4px",
                        height: "4px",
                        bg: "positive",
                        borderRadius: "50%",
                      })}
                    />
                    Available
                  </span>
                  <span
                    className={css({
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    })}
                  >
                    <span
                      className={css({
                        width: "4px",
                        height: "4px",
                        bg: "warning",
                        borderRadius: "50%",
                      })}
                    />
                    Missing
                  </span>
                  <span
                    className={css({
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    })}
                  >
                    <span
                      className={css({
                        width: "4px",
                        height: "4px",
                        bg: "info",
                        borderRadius: "50%",
                      })}
                    />
                    Downloading
                  </span>
                </span>
              </footer>
            </>
          ) : view === "discover" ? (
            <Discover demo={demo} onSelect={(item) => add(item)} />
          ) : view === "queue" ? (
            <>
              {queue.isError && (
                <div className={css({ mb: "16px" })}>
                  <Notice error>{queue.error.message}</Notice>
                </div>
              )}
              <DownloadQueue
                data={queue.data}
                loading={queue.isFetching}
                onRefresh={() => {
                  void queryClient.invalidateQueries({ queryKey: ["queue"] });
                }}
                notify={notify}
              />
            </>
          ) : (
            <>
              {instanceQuery.isError && (
                <div className={css({ mb: "16px" })}>
                  <Notice error>{instanceQuery.error.message}</Notice>
                </div>
              )}
              <Settings
                instances={instances}
                onChanged={refresh}
                notify={notify}
              />
            </>
          )}
        </main>
      </div>
      <AddMedia
        open={addOpen}
        onClose={() => setAddOpen(false)}
        seed={addSeed}
        instances={displayInstances}
        library={items}
        demo={demo}
        onAdded={(item) => {
          if (item)
            queryClient.setQueryData<LibraryResponse>(["library"], (current) =>
              current
                ? {
                    ...current,
                    items: [
                      item,
                      ...current.items.filter((entry) => entry.id !== item.id),
                    ],
                  }
                : current,
            );
          else refresh();
        }}
        notify={notify}
        onConnect={connect}
      />
      <Modal
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search your library"
        description="Every title, across every instance."
        wide
      >
        <div className={css({ position: "relative", mb: "20px" })}>
          <MagnifyingGlassIcon
            size={19}
            className={css({
              position: "absolute",
              top: "12px",
              left: "13px",
              color: "subtle",
            })}
          />
          <input
            aria-label="Search library titles"
            placeholder="Movies, shows, something you love..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={cx(inputStyle, css({ pl: "40px" }))}
          />
        </div>
        <div className={css({ maxHeight: "400px", overflowY: "auto" })}>
          {items
            .filter((item) =>
              item.title.toLowerCase().includes(deferredSearch.toLowerCase()),
            )
            .slice(0, 20)
            .map((item) => (
              <Link
                href={mediaHref(item)}
                key={item.id}
                onClick={() => {
                  setSearchOpen(false);
                }}
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px",
                  borderRadius: "7px",
                  _hover: { bg: "elevated" },
                })}
              >
                <span
                  className={css({
                    width: "35px",
                    height: "52px",
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: "4px",
                    flexShrink: 0,
                  })}
                >
                  <Poster item={item} sizes="35px" />
                </span>
                <span
                  className={css({
                    flex: 1,
                    fontSize: "13px",
                    fontWeight: "500",
                  })}
                >
                  {item.title}
                  <span
                    className={css({
                      display: "block",
                      fontSize: "11px",
                      color: "subtle",
                      fontWeight: "400",
                      mt: "4px",
                    })}
                  >
                    {item.year} · {item.kind === "movie" ? "Movie" : "Show"} ·{" "}
                    {item.targets.length} targets
                  </span>
                </span>
                <ArrowRightIcon
                  size={15}
                  className={css({ color: "subtle" })}
                />
              </Link>
            ))}
        </div>
        {!items.some((item) =>
          item.title.toLowerCase().includes(deferredSearch.toLowerCase()),
        ) && (
          <div
            className={css({
              textAlign: "center",
              py: "24px",
              color: "muted",
              fontSize: "13px",
            })}
          >
            <p>No titles match &quot;{search}&quot;.</p>
            <Button
              variant="ghost"
              onClick={() => {
                setSearchOpen(false);
                add();
              }}
              className={css({ mt: "15px" })}
            >
              <PlusIcon size={15} />
              Find something to add
            </Button>
          </div>
        )}
      </Modal>
      <Modal
        open={mobileOpen}
        onOpenChange={setMobileOpen}
        title="Your workspace"
      >
        <div className={css({ display: "flex", flexDirection: "column" })}>
          {sidebarContent(true)}
        </div>
      </Modal>
      {connectOpen && (
        <div className={css({ display: "none" })}>
          <Settings
            instances={instances}
            onChanged={refresh}
            notify={notify}
            autoOpen
            onAutoOpened={() => {}}
            onDismiss={() => setConnectOpen(false)}
          />
        </div>
      )}
      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={css({
            position: "fixed",
            bottom: "24px",
            right: { base: "16px", md: "28px" },
            left: { base: "16px", md: "auto" },
            maxWidth: "460px",
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            p: "15px",
            bg: toast.error ? "#382722" : "#26321e",
            color: toast.error ? "#f1b3a6" : "#d4e9c0",
            border: "1px solid",
            borderColor: toast.error ? "#7d493c" : "#51663c",
            borderRadius: "9px",
            boxShadow: "0 10px 35px #0006",
            zIndex: 110,
            fontSize: "12px",
            lineHeight: "1.7",
            animation: "enter 180ms ease-out",
          })}
        >
          {toast.error ? (
            <WarningCircleIcon
              size={18}
              className={css({ flexShrink: 0, mt: "2px" })}
            />
          ) : (
            <CheckCircleIcon
              size={18}
              className={css({ flexShrink: 0, mt: "2px" })}
            />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
            className={css({ flexShrink: 0, color: "inherit", p: "2px" })}
          >
            <XIcon size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function BrandMark() {
  return (
    <svg
      width="31"
      height="33"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path d="m5 32 12-26h7l12 26h-9l-7-17-7 17H5Z" fill="#e5e5e5" />
      <path d="M17 27h8v5h-8z" fill="#e5e5e5" />
    </svg>
  );
}

function Discover({
  demo,
  onSelect,
}: {
  demo: boolean;
  onSelect: (item: MediaItem) => void;
}) {
  const [term, setTerm] = useState("");
  const deferred = useDeferredValue(term);
  const [kind, setKind] = useState("movie");
  const results = useQuery({
    queryKey: ["lookup", deferred, kind],
    queryFn: ({ signal }) =>
      api<LibraryResponse>(
        `/api/lookup?term=${encodeURIComponent(deferred)}&kind=${kind}`,
        { signal },
      ),
    enabled: demo || deferred.trim().length > 1,
  });
  return (
    <>
      <div className={css({ mb: "28px" })}>
        <p
          className={css({
            display: "flex",
            gap: "7px",
            alignItems: "center",
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            fontSize: "9px",
            color: "accent",
            mb: "12px",
          })}
        >
          <CompassIcon size={14} />
          The next addition
        </p>
        <h1
          className={css({
            fontSize: { base: "28px", md: "32px" },
            fontWeight: "550",
            letterSpacing: "-1px",
            mb: "10px",
          })}
        >
          Make room for a good story.
        </h1>
        <p
          className={css({
            color: "muted",
            fontSize: "12px",
            lineHeight: "1.7",
          })}
        >
          Find a movie or show. Choose your targets. Leave the searching to your
          instances.
        </p>
      </div>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          gap: "12px",
          mb: "32px",
        })}
      >
        <div className={css({ position: "relative", flex: 1 })}>
          <MagnifyingGlassIcon
            size={20}
            className={css({
              position: "absolute",
              top: "14px",
              left: "15px",
              color: "subtle",
            })}
          />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            aria-label="Discover movies and shows"
            placeholder="What are you looking for?"
            className={cx(
              inputStyle,
              css({ height: "48px", pl: "46px", bg: "surface" }),
            )}
          />
        </div>
        <SelectField
          compact
          value={kind}
          onChange={setKind}
          label="Discover media type"
          options={[
            { value: "movie", label: "Movies" },
            { value: "series", label: "Shows" },
          ]}
        />
      </div>
      <div
        className={css({
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: "20px",
          gap: "10px",
        })}
      >
        <h2 className={css({ fontSize: "16px", fontWeight: "500" })}>
          {term
            ? "Search results"
            : demo
              ? "A little inspiration"
              : "A world of stories awaits"}
        </h2>
        {demo && (
          <span className={css({ fontSize: "10px", color: "subtle" })}>
            Sample catalog
          </span>
        )}
      </div>
      {results.isError ? (
        <Notice error>{results.error.message}</Notice>
      ) : !demo && deferred.trim().length < 2 ? (
        <div
          className={css({
            py: "80px",
            textAlign: "center",
            border: "1px dashed token(colors.line)",
            borderRadius: "10px",
            color: "muted",
          })}
        >
          <MagnifyingGlassIcon
            size={36}
            className={css({ mx: "auto", color: "subtle", mb: "16px" })}
          />
          <p>Start with a title.</p>
          <p className={css({ fontSize: "12px", mt: "8px", color: "subtle" })}>
            We&apos;ll search the catalog through your connected instances.
          </p>
        </div>
      ) : results.isPending ? (
        <div
          className={css({
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "10px",
            py: "50px",
            color: "muted",
          })}
        >
          <Spinner />
          Finding your next favorite...
        </div>
      ) : (
        <>
          {results.data?.errors.map((error) => (
            <div key={error.instanceId} className={css({ mb: "15px" })}>
              <Notice error>
                {error.instanceName}: {error.message}
              </Notice>
            </div>
          ))}
          <div className={gridStyle}>
            {results.data?.items.map((item, index) => (
              <MediaCard
                key={item.id}
                item={{ ...item, targets: [] }}
                index={index}
                onClick={() => onSelect(item)}
              />
            ))}
          </div>
          {results.data?.items.length === 0 && (
            <p
              className={css({
                color: "muted",
                textAlign: "center",
                py: "50px",
              })}
            >
              No matches found. Try another title.
            </p>
          )}
        </>
      )}
    </>
  );
}
