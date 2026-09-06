"use client";

import {
  ArrowClockwiseIcon,
  FolderSimpleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { mediaHref } from "@/lib/client";
import { useInstances, useLibrary } from "@/lib/collections";
import { LibraryStats } from "./library-stats";
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
    xl: "repeat(7, minmax(0, 1fr))",
    "2xl": "repeat(8, minmax(0, 1fr))",
  },
  columnGap: { base: "15px", md: "20px" },
  rowGap: "29px",
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
            href="/settings"
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

export function LibraryBrowser({ category }: { category: LibraryCategory }) {
  const router = useRouter();
  const { add, refresh } = useWorkspace();
  const library = useLibrary();
  const instanceQuery = useInstances();
  const [instanceFilter, setInstanceFilter] = useState("all");
  const [quality, setQuality] = useState("all");
  const [status, setStatus] = useState<LibraryStatus>("all");
  const [sort, setSort] = useState<LibrarySort>("recent");
  const [sortDirection, setSortDirection] =
    useState<LibrarySortDirection>("desc");
  const [layout, setLayout] = useState<LibraryLayout>("grid");
  const items = library.data?.items ?? [];
  const instances = instanceQuery.data?.instances ?? [];
  const { filtered, counts, qualities, filterCount } = useLibraryView(items, {
    category,
    status,
    instanceFilter,
    quality,
    sort,
    sortDirection,
  });

  function resetFilters() {
    setInstanceFilter("all");
    setQuality("all");
    setStatus("all");
  }

  return (
    <>
      <PageHeader
        title={
          category === "library"
            ? "Your library"
            : category === "missing"
              ? "Missing"
              : category === "movies"
                ? "Movies"
                : "Shows"
        }
        description={
          <>
            {category === "missing"
              ? "A little closer to complete. See what your quality targets are missing."
              : "All your favorites. Every quality. One place."}{" "}
            <span
              className={css({
                display: "inline-block",
                ml: "8px",
                color: "subtle",
                fontSize: "10px",
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
          </>
        }
        actions={
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
        }
      />
      <LibraryStats
        counts={counts}
        hasData={!!library.data}
        isPending={library.isPending}
        onStatusChange={setStatus}
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
        category={category}
        counts={counts}
        hasData={!!library.data}
        isPending={library.isPending}
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
          <span>{filtered.length} matching titles</span>
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
                sizes="(min-width: 2022px) 200px, (min-width: 1536px) calc((100vw - 426px) / 8), (min-width: 1280px) calc((100vw - 406px) / 7), (min-width: 1024px) calc((100vw - 366px) / 5), (min-width: 768px) calc((100vw - 144px) / 5), (min-width: 640px) calc((100vw - 68px) / 3), calc((100vw - 53px) / 2)"
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
          {library.data ? `${filtered.length} titles` : "Titles"}
          <span className={css({ mx: "7px", color: "#4d4d4d" })}>·</span>
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
  );
}
