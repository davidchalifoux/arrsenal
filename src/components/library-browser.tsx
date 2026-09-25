"use client";

import { FolderSimpleIcon, XIcon } from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { z } from "zod";
import { mediaHref } from "@/lib/client";
import { useInstances, useLibrary } from "@/lib/client-data";
import { useLibraryActions } from "./library-provider";
import { LibraryToolbar } from "./library-toolbar";
import { MediaCard, MediaList } from "./media-card";
import { PageHeader, SegmentedTabs } from "./page-header";
import { Button, Notice } from "./ui";
import {
  type LibraryCategory,
  type LibraryLayout,
  type LibrarySort,
  type LibrarySortDirection,
  type LibraryStatus,
  useLibraryView,
} from "./use-library-view";

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
  sort: z.enum(["recent", "title", "year", "rating", "size"]),
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
  const { add, refresh } = useLibraryActions();
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
  const { filtered, totalCount, qualities, filterCount, statusCounts } =
    useLibraryView(items, {
      category,
      status,
      instanceFilter,
      quality,
      sort,
      sortDirection,
    });
  useEffect(() => {
    if (!snapshotLoaded || !library.data || scrollRestored.current) return;
    // Wait for the restored layout and selected rows to commit before scrolling.
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: scrollPosition.current, behavior: "instant" });
      scrollRestored.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [snapshotLoaded, library.data]);

  const loadingInstances = library.data?.loadingInstanceIds?.length ?? 0;
  const hasCompleteData =
    !!library.data &&
    library.data.errors.length === 0 &&
    loadingInstances === 0;

  function addMedia() {
    add();
  }

  function changeSort(next: LibrarySort) {
    setSort(next);
    setSortDirection(next === "title" ? "asc" : "desc");
  }

  function resetFilters() {
    setInstanceFilter("all");
    setQuality("all");
    setStatus("all");
  }

  const title =
    category === "library"
      ? "All titles"
      : category === "missing"
        ? "Incomplete"
        : category === "movies"
          ? "Movies"
          : "Shows";
  const categoryItems = items.filter((item) =>
    category === "movies"
      ? item.kind === "movie"
      : category === "shows"
        ? item.kind === "series"
        : true,
  );
  const syncLabel = library.isPending ? (
    <LibraryLoadingStatus />
  ) : loadingInstances > 0 ? (
    `Loading ${loadingInstances} more ${loadingInstances === 1 ? "instance" : "instances"}...`
  ) : library.isFetching ? (
    "Syncing library..."
  ) : library.isError ? (
    "Sync failed"
  ) : library.data?.errors.length ? (
    "Some instances need attention"
  ) : (
    "Library up to date"
  );

  return (
    <>
      <LibraryToolbar
        refreshing={library.isFetching}
        onRefresh={refresh}
        onAdd={addMedia}
        filterCount={filterCount - Number(status !== "all")}
        instances={instances}
        qualities={qualities}
        instanceFilter={instanceFilter}
        quality={quality}
        sort={sort}
        sortDirection={sortDirection}
        layout={layout}
        onInstanceChange={setInstanceFilter}
        onQualityChange={setQuality}
        onSortChange={changeSort}
        onSortDirectionChange={setSortDirection}
        onLayoutChange={setLayout}
        onResetFilters={resetFilters}
      />
      <PageHeader
        title={title}
        actions={
          <span
            className={css({
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "subtle",
              fontSize: "12px",
              maxWidth: "360px",
            })}
          >
            {hasCompleteData && snapshotLoaded && (
              <span className={css({ color: "muted", whiteSpace: "nowrap" })}>
                {filterCount > 0 || category === "missing"
                  ? `${filtered.length} of `
                  : ""}
                {totalCount} {totalCount === 1 ? "title" : "titles"}
                <span aria-hidden="true" className={css({ ml: "8px" })}>
                  ·
                </span>
              </span>
            )}
            {syncLabel}
          </span>
        }
      >
        <nav
          aria-label="Library categories"
          className={css({
            display: { base: "flex", lg: "none" },
            gap: "4px",
            order: -1,
            width: "100%",
          })}
        >
          {(
            [
              ["/", "All", "library"],
              ["/movies", "Movies", "movies"],
              ["/shows", "Shows", "shows"],
            ] as const
          ).map(([href, label, value]) => (
            <Link
              key={href}
              href={href}
              aria-current={category === value ? "page" : undefined}
              className={css({
                height: "30px",
                px: "12px",
                display: "inline-flex",
                alignItems: "center",
                borderRadius: "999px",
                border: "1px solid token(colors.lineStrong)",
                fontSize: "12px",
                color: "muted",
                _currentPage: {
                  bg: "elevated",
                  color: "ink",
                  borderColor: "elevated",
                },
              })}
            >
              {label}
            </Link>
          ))}
        </nav>
        {library.data && category !== "missing" && (
          <SegmentedTabs
            label="Filter by availability"
            value={status}
            onChange={setStatus}
            options={[
              {
                value: "all",
                label: "All",
                count: statusCounts.all,
                dot: "var(--ink)",
              },
              {
                value: "available",
                label: "Available",
                count: statusCounts.available,
                dot: "var(--positive)",
              },
              {
                value: "incomplete",
                label: "Incomplete",
                count: statusCounts.incomplete,
                dot: "var(--warning)",
              },
              {
                value: "downloading",
                label: "Downloading",
                count: statusCounts.downloading,
                dot: "var(--info)",
              },
            ]}
          />
        )}
        {library.data && (filterCount > 0 || category === "missing") && (
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
        )}
      </PageHeader>
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
                sizes="(min-width: 1864px) 183px, (min-width: 1536px) calc((100vw - 400px) / 9), (min-width: 1280px) calc((100vw - 380px) / 8), (min-width: 1024px) calc((100vw - 360px) / 7), (min-width: 768px) calc((100vw - 112px) / 5), (min-width: 640px) calc((100vw - 62px) / 3), calc((100vw - 47px) / 2)"
                href={mediaHref(item)}
              />
            ))}
          </div>
        ) : (
          <MediaList
            items={filtered}
            sort={sort}
            sortDirection={sortDirection}
            onSort={(next) =>
              next === sort
                ? setSortDirection(sortDirection === "asc" ? "desc" : "asc")
                : changeSort(next)
            }
          />
        )
      ) : loadingInstances > 0 ? (
        <output>More library items are still loading.</output>
      ) : (
        <div
          className={css({
            textAlign: "center",
            py: "70px",
            border: "1px dashed token(colors.lineStrong)",
            borderRadius: "14px",
          })}
        >
          <FolderSimpleIcon
            size={36}
            weight="duotone"
            className={css({ mx: "auto", color: "subtle", mb: "15px" })}
          />
          <h2
            className={css({ fontSize: "18px", fontWeight: "600", mb: "8px" })}
          >
            {items.length
              ? "Nothing in this view. Yet."
              : "The beginning of a great collection."}
          </h2>
          <p className={css({ fontSize: "13px", color: "muted", mb: "20px" })}>
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
          mt: "32px",
          mx: { base: "-16px", lg: "-28px" },
          mb: { base: "0", lg: "-40px" },
          px: { base: "16px", lg: "28px" },
          minHeight: "28px",
          py: "6px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "6px 16px",
          bg: "toolbar",
          borderTop: "1px solid token(colors.line)",
          color: "subtle",
          fontSize: "11px",
        })}
      >
        <span
          className={css({ display: "flex", gap: "16px", flexWrap: "wrap" })}
        >
          {category === "library" && (
            <>
              <span>
                {categoryItems.filter((item) => item.kind === "movie").length}{" "}
                movies
              </span>
              <span>
                {categoryItems.filter((item) => item.kind === "series").length}{" "}
                shows
              </span>
            </>
          )}
          <span>
            {instanceQuery.data ? `${instances.length} instances` : "Instances"}
          </span>
        </span>
        <span
          className={css({ display: "flex", gap: "14px", flexWrap: "wrap" })}
        >
          {(
            [
              ["Available", "var(--positive)"],
              ["Downloading", "var(--info)"],
              ["Incomplete", "var(--warning)"],
            ] as const
          ).map(([label, color]) => (
            <span
              key={label}
              className={css({
                display: "flex",
                alignItems: "center",
                gap: "6px",
              })}
            >
              <span
                aria-hidden="true"
                className={css({
                  width: "7px",
                  height: "7px",
                  borderRadius: "2px",
                })}
                style={{ background: color }}
              />
              {label}
            </span>
          ))}
        </span>
      </footer>
    </>
  );
}
