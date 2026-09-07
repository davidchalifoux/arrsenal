"use client";

import {
  ArrowClockwiseIcon,
  FolderSimpleIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { z } from "zod";
import { mediaHref } from "@/lib/client";
import { useInstances, useLibrary } from "@/lib/collections";
import { LibraryToolbar } from "./library-toolbar";
import { MediaCard, MediaList } from "./media-card";
import { PageHeader } from "./page-header";
import { Button, Notice } from "./ui";
import {
  type LibraryCategory,
  type LibraryLayout,
  type LibrarySort,
  type LibrarySortDirection,
  type LibraryStatus,
  useLibraryView,
} from "./use-library-view";
import { useWorkspace } from "./workspace-provider";

const gridStyle = css({
  display: "grid",
  gridTemplateColumns: {
    base: "repeat(2, minmax(0, 1fr))",
    sm: "repeat(3, minmax(0, 1fr))",
    md: "repeat(5, minmax(0, 1fr))",
    lg: "repeat(7, minmax(0, 1fr))",
    xl: "repeat(8, minmax(0, 1fr))",
    "2xl": "repeat(9, minmax(0, 1fr))",
  },
  columnGap: { base: "15px", md: "20px" },
  rowGap: "29px",
});

const snapshotSchema = z.object({
  instanceFilter: z.string(),
  quality: z.string(),
  status: z.enum(["all", "available", "incomplete", "downloading"]),
  sort: z.enum(["recent", "title", "year", "rating"]),
  sortDirection: z.enum(["asc", "desc"]),
  layout: z.enum(["grid", "list"]),
  scrollY: z.number().finite().nonnegative(),
});

function LibraryLoadingStatus() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timeout = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <output className={css({ color: "muted" })}>
      {slow ? (
        <>
          Still waiting for your instances. Large libraries or slow connections
          can take a little longer.{" "}
          <Link
            href="/settings/connections"
            className={css({ textDecoration: "underline" })}
          >
            Check connections
          </Link>
        </>
      ) : (
        "Loading your library..."
      )}
    </output>
  );
}

export function LibraryBrowser(props: {
  category: LibraryCategory;
  initialStatus?: LibraryStatus;
  openAdd?: boolean;
}) {
  return (
    <LibrarySection
      key={`${props.category}:${props.initialStatus ?? "all"}`}
      {...props}
    />
  );
}

function LibrarySection({
  category,
  initialStatus = "all",
  openAdd = false,
}: {
  category: LibraryCategory;
  initialStatus?: LibraryStatus;
  openAdd?: boolean;
}) {
  const router = useRouter();
  const { add, refresh } = useWorkspace();
  const library = useLibrary();
  const instanceQuery = useInstances();
  const [instanceFilter, setInstanceFilter] = useState("all");
  const [quality, setQuality] = useState("all");
  const [status, setStatus] = useState<LibraryStatus>(initialStatus);
  const openRequestedAdd = useEffectEvent(() => {
    add();
    router.replace("/", { scroll: false });
  });
  useEffect(() => {
    if (openAdd) openRequestedAdd();
  }, [openAdd]);
  const [sort, setSort] = useState<LibrarySort>("recent");
  const [sortDirection, setSortDirection] =
    useState<LibrarySortDirection>("desc");
  const [layout, setLayout] = useState<LibraryLayout>("grid");
  const [snapshotLoaded, setSnapshotLoaded] = useState(false);
  const scrollPosition = useRef(0);
  const scrollRestored = useRef(false);
  const storageKey = `arrsenal:library-view:${category}`;
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      const snapshot = snapshotSchema.safeParse(
        stored ? JSON.parse(stored) : null,
      );
      if (snapshot.success) {
        const saved = snapshot.data;
        setInstanceFilter(saved.instanceFilter);
        setQuality(saved.quality);
        setStatus(initialStatus === "all" ? saved.status : initialStatus);
        setSort(saved.sort);
        setSortDirection(saved.sortDirection);
        setLayout(saved.layout);
        scrollPosition.current = initialStatus === "all" ? saved.scrollY : 0;
      }
    } catch {
      // Storage may be unavailable or contain an interrupted/invalid snapshot.
    }
    setSnapshotLoaded(true);
  }, [storageKey, initialStatus]);

  const saveSnapshot = useEffectEvent(() => {
    if (!snapshotLoaded) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          instanceFilter,
          quality,
          status,
          sort,
          sortDirection,
          layout,
          scrollY: scrollPosition.current,
        }),
      );
    } catch {
      // Browsing still works when session storage is blocked or full.
    }
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: View changes must trigger persistence; the event also serves scroll/pagehide listeners.
  useEffect(() => {
    saveSnapshot();
  }, [
    snapshotLoaded,
    instanceFilter,
    quality,
    status,
    sort,
    sortDirection,
    layout,
  ]);
  useEffect(() => {
    const onScroll = () => {
      if (!scrollRestored.current) return;
      scrollPosition.current = window.scrollY;
      saveSnapshot();
    };
    const onPageHide = () => saveSnapshot();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);
  const items = library.data?.items ?? [];
  const instances = instanceQuery.data?.instances ?? [];
  const { filtered, totalCount, qualities, filterCount, isReady } =
    useLibraryView(items, {
      category,
      status,
      instanceFilter,
      quality,
      sort,
      sortDirection,
    });
  useEffect(() => {
    if (!snapshotLoaded || !library.data || !isReady || scrollRestored.current)
      return;
    // Wait for the restored layout and live query to commit before scrolling.
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: scrollPosition.current, behavior: "instant" });
      scrollRestored.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [snapshotLoaded, library.data, isReady]);

  const hasCompleteData = !!library.data && library.data.errors.length === 0;

  function addMedia() {
    add(null, category === "shows" ? "series" : "movie");
  }

  function resetFilters() {
    setInstanceFilter("all");
    setQuality("all");
    setStatus("all");
  }

  return (
    <>
      <PageHeader
        title={
          <>
            {category === "library"
              ? "Home"
              : category === "missing"
                ? "Incomplete"
                : category === "movies"
                  ? "Movies"
                  : "Shows"}{" "}
            {hasCompleteData && (
              <span
                className={css({
                  ml: "10px",
                  color: "muted",
                  fontSize: "12px",
                  fontWeight: "400",
                  letterSpacing: "normal",
                  whiteSpace: "nowrap",
                })}
              >
                {totalCount} {totalCount === 1 ? "title" : "titles"}
              </span>
            )}
          </>
        }
        actions={
          <>
            <Button
              variant="primary"
              onClick={addMedia}
              className={css({ display: { base: "inline-flex", lg: "none" } })}
            >
              <PlusIcon size={14} />
              Add media
            </Button>
            <div
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "6px",
                minWidth: 0,
              })}
            >
              <span
                className={css({
                  color: "subtle",
                  fontSize: "11px",
                  maxWidth: "260px",
                })}
              >
                {library.isPending ? (
                  <LibraryLoadingStatus />
                ) : library.isFetching ? (
                  "Syncing library..."
                ) : library.isError ? (
                  "Sync failed"
                ) : library.data?.errors.length ? (
                  "Some instances need attention"
                ) : (
                  "Library up to date"
                )}
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
                    library.isFetching && !library.isPending
                      ? css({
                          animation: "spin 1s linear infinite",
                          _motionReduce: { animation: "none" },
                        })
                      : undefined
                  }
                />
              </Button>
            </div>
          </>
        }
      />
      {library.isError && library.data && (
        <div className={css({ mb: "14px" })}>
          <Notice error>
            {library.error.message} Showing the last loaded library.
          </Notice>
        </div>
      )}
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
      <LibraryToolbar
        filterCount={filterCount}
        instances={instances}
        qualities={qualities}
        instanceFilter={instanceFilter}
        quality={quality}
        status={status}
        sort={sort}
        sortDirection={sortDirection}
        layout={layout}
        onInstanceChange={setInstanceFilter}
        onQualityChange={setQuality}
        onStatusChange={setStatus}
        onSortChange={(next) => {
          setSort(next);
          setSortDirection(next === "title" ? "asc" : "desc");
        }}
        onSortDirectionChange={setSortDirection}
        onLayoutChange={setLayout}
        onResetFilters={resetFilters}
      />
      {library.data && (filterCount > 0 || category === "missing") && (
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
          {hasCompleteData && isReady && snapshotLoaded && (
            <span>
              {filtered.length} of {totalCount}{" "}
              {totalCount === 1 ? "title" : "titles"}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetFilters();
              if (category === "missing") router.push("/");
            }}
          >
            <XIcon size={12} />
            Clear filters
          </Button>
        </div>
      )}
      {library.isError && !library.data ? (
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
      ) : library.isPending ? null : filtered.length ? (
        layout === "grid" ? (
          <div className={gridStyle}>
            {filtered.map((item, index) => (
              <MediaCard
                key={item.id}
                item={item}
                index={index}
                priority={index < 16}
                sizes="(min-width: 1864px) 183px, (min-width: 1536px) calc((100vw - 224px) / 9), (min-width: 1280px) calc((100vw - 204px) / 8), (min-width: 1024px) calc((100vw - 184px) / 7), (min-width: 768px) calc((100vw - 144px) / 5), (min-width: 640px) calc((100vw - 62px) / 3), calc((100vw - 47px) / 2)"
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
            className={css({ fontSize: "18px", fontWeight: "550", mb: "8px" })}
          >
            {items.length
              ? "Nothing in this view. Yet."
              : "The beginning of a great collection."}
          </h3>
          <p className={css({ fontSize: "12px", color: "muted", mb: "20px" })}>
            {items.length
              ? "Try a different filter to find what you're looking for."
              : "Add your first movie or show to get things rolling."}
          </p>
          <Button
            variant="primary"
            onClick={() => {
              if (items.length) {
                resetFilters();
                router.push("/");
              } else addMedia();
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
          {instanceQuery.data ? `${instances.length} instances` : "Instances"}
          <span className={css({ mx: "7px", color: "#4d4d4d" })}>·</span>
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
            Incomplete
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
  );
}
