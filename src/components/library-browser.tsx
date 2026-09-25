"use client";

import { FolderSimpleIcon, XIcon } from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { z } from "zod";
import { useInstances, useLibrary } from "@/lib/client-data";
import {
  type CustomFilter,
  matchesFilter,
  presetFilters,
} from "@/lib/library-filters";
import {
  defaultViewOptions,
  type LibraryPreferences,
} from "@/lib/library-options";
import { usePreferences, useSavePreferences } from "@/lib/preferences";
import { CustomFilterDialog, emptyCustomFilter } from "./custom-filter-dialog";
import { useLibraryActions } from "./library-provider";
import { LibraryToolbar } from "./library-toolbar";
import { MediaList } from "./media-card";
import { Page, PageHeader, pageFooterStyle } from "./page-header";
import { PosterGrid } from "./poster-grid";
import { Button, Notice } from "./ui";
import {
  type LibraryCategory,
  type LibraryLayout,
  type LibrarySort,
  type LibrarySortDirection,
  type LibraryStatus,
  useLibraryView,
} from "./use-library-view";
import { ViewOptionsDialog } from "./view-options-dialog";

const snapshotSchema = z.object({
  instanceFilter: z.string(),
  quality: z.string(),
  status: z.enum(["all", "available", "incomplete", "downloading"]),
  sort: z.enum(["recent", "title", "year", "rating", "size"]),
  sortDirection: z.enum(["asc", "desc"]),
  layout: z.enum(["grid", "list"]),
  filterId: z.string().max(80).nullable().default(null),
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
  const [filterId, setFilterId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    filter: CustomFilter;
    isNew: boolean;
  } | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const preferences = usePreferences();
  const savePreferences = useSavePreferences();
  const libraryPreferences: LibraryPreferences =
    preferences.data?.library ?? {};
  const customFilters = libraryPreferences.filters ?? [];
  const viewOptions = libraryPreferences.view ?? defaultViewOptions;
  const activeFilter =
    presetFilters.find((preset) => preset.id === filterId)?.definition ??
    customFilters.find((filter) => filter.id === filterId) ??
    null;
  const hadSnapshot = useRef(false);
  const appliedDefaults = useRef(false);
  const [snapshotLoaded, setSnapshotLoaded] = useState(false);
  const scrollBody = useRef<HTMLDivElement>(null);
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
        setFilterId(saved.filterId);
        hadSnapshot.current = true;
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
          filterId,
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
    filterId,
  ]);
  const defaults = libraryPreferences.defaults;
  useEffect(() => {
    // Server-wide defaults apply only when this browser has no saved view.
    if (!snapshotLoaded || !defaults || hadSnapshot.current) return;
    if (appliedDefaults.current) return;
    appliedDefaults.current = true;
    setLayout(defaults.layout);
    setSort(defaults.sort);
    setSortDirection(defaults.sortDirection);
  }, [snapshotLoaded, defaults]);
  useEffect(() => {
    const body = scrollBody.current;
    const onScroll = () => {
      if (!scrollRestored.current || !body) return;
      scrollPosition.current = body.scrollTop;
      saveSnapshot();
    };
    const onPageHide = () => saveSnapshot();
    body?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);
    return () => {
      body?.removeEventListener("scroll", onScroll);
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
      filter: activeFilter,
    });
  useEffect(() => {
    if (!snapshotLoaded || !library.data || scrollRestored.current) return;
    // Wait for the restored layout and selected rows to commit before scrolling.
    const frame = requestAnimationFrame(() => {
      if (scrollBody.current)
        scrollBody.current.scrollTop = scrollPosition.current;
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

  function saveLibraryPreferences(
    library: LibraryPreferences,
    onSaved?: () => void,
  ) {
    setSaveError(null);
    savePreferences.mutate(
      { library },
      {
        onSuccess: onSaved,
        onError: (error) => setSaveError(`Could not save. ${error.message}`),
      },
    );
  }

  function saveFilter(filter: CustomFilter) {
    const exists = customFilters.some((item) => item.id === filter.id);
    saveLibraryPreferences(
      {
        ...libraryPreferences,
        filters: exists
          ? customFilters.map((item) => (item.id === filter.id ? filter : item))
          : [...customFilters, filter],
      },
      () => {
        setFilterId(filter.id);
        setEditing(null);
      },
    );
  }

  function deleteFilter(id: string) {
    saveLibraryPreferences(
      {
        ...libraryPreferences,
        filters: customFilters.filter((item) => item.id !== id),
      },
      () => {
        if (filterId === id) setFilterId(null);
        setEditing(null);
      },
    );
  }

  function resetFilters() {
    setFilterId(null);
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
  const now = Date.now();
  const activeFilterName = activeFilter
    ? (presetFilters.find((preset) => preset.id === filterId)?.name ??
      customFilters.find((filter) => filter.id === filterId)?.name)
    : null;
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
    <Page
      toolbar={
        <LibraryToolbar
          refreshing={library.isFetching}
          onRefresh={refresh}
          onAdd={addMedia}
          filterCount={filterCount}
          status={status}
          statusCounts={library.data ? statusCounts : undefined}
          onStatusChange={setStatus}
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
          filterId={activeFilter ? filterId : null}
          allCount={categoryItems.length}
          presets={presetFilters.map((preset) => ({
            id: preset.id,
            name: preset.name,
            count: categoryItems.filter((item) =>
              matchesFilter(item, preset.definition, now),
            ).length,
          }))}
          customFilters={customFilters.map((filter) => ({
            id: filter.id,
            name: filter.name,
            count: categoryItems.filter((item) =>
              matchesFilter(item, filter, now),
            ).length,
          }))}
          onFilterChange={setFilterId}
          onEditFilter={(id) => {
            const filter = customFilters.find((item) => item.id === id);
            if (filter) {
              setSaveError(null);
              setEditing({ filter, isNew: false });
            }
          }}
          onNewFilter={() => {
            setSaveError(null);
            setEditing({ filter: emptyCustomFilter(), isNew: true });
          }}
          onOptions={() => {
            setSaveError(null);
            setOptionsOpen(true);
          }}
        />
      }
      footer={
        <footer
          className={cx(
            pageFooterStyle,
            css({ justifyContent: "space-between" }),
          )}
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
                  {
                    categoryItems.filter((item) => item.kind === "series")
                      .length
                  }{" "}
                  shows
                </span>
              </>
            )}
            <span>
              {instanceQuery.data
                ? `${instances.length} instances`
                : "Instances"}
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
      }
      scrollRef={scrollBody}
    >
      <PageHeader
        title={
          activeFilterName ? (
            <>
              {title}
              <span className={css({ color: "subtle", fontWeight: "500" })}>
                {" "}
                · {activeFilterName}
              </span>
            </>
          ) : (
            title
          )
        }
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
          <PosterGrid items={filtered} options={viewOptions} />
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
      {editing && (
        <CustomFilterDialog
          key={editing.filter.id}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          initial={editing.filter}
          isNew={editing.isNew}
          choices={{
            instances: instances.map((instance) => ({
              value: instance.id,
              label: instance.name,
            })),
            qualities,
            genres: [...new Set(items.flatMap((item) => item.genres))].sort(),
          }}
          items={categoryItems}
          saving={savePreferences.isPending}
          error={saveError}
          onSave={saveFilter}
          onDelete={deleteFilter}
        />
      )}
      <ViewOptionsDialog
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
        options={viewOptions}
        onChange={(view) =>
          saveLibraryPreferences({ ...libraryPreferences, view })
        }
        error={saveError}
      />
    </Page>
  );
}
