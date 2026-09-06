"use client";

import { Popover } from "@base-ui/react/popover";
import {
  ArrowClockwiseIcon,
  ArrowDownIcon,
  ArrowsDownUpIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  FolderSimpleIcon,
  ListIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
  StackIcon,
  XIcon,
} from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import { useLiveQuery } from "@tanstack/react-db";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { mediaHref } from "@/lib/client";
import {
  useClientReady,
  useCollections,
  useInstances,
  useLibrary,
} from "@/lib/collections";
import { MediaCard, MediaList } from "./media-card";
import { PageHeader } from "./page-header";
import { Button, buttonStyle, Notice, SelectField } from "./ui";
import { useWorkspace } from "./workspace-provider";

const categoryNames = {
  library: "All media",
  movies: "Movies",
  shows: "Shows",
  missing: "Missing",
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

export function LibraryBrowser({
  category,
}: {
  category: "library" | "movies" | "shows" | "missing";
}) {
  const router = useRouter();
  const { add, refresh } = useWorkspace();
  const library = useLibrary();
  const collections = useCollections();
  const clientReady = useClientReady();
  const instanceQuery = useInstances();
  const [instanceFilter, setInstanceFilter] = useState("all");
  const [quality, setQuality] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("recent");
  const [layout, setLayout] = useState("grid");
  const items = library.data?.items ?? [];
  const instances = instanceQuery.data?.instances ?? [];
  const qualities = [
    ...new Set(
      items.flatMap((item) =>
        item.targets.map((target) => target.qualityProfile),
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));
  const incomplete = items.filter(
    (item) => item.status === "partial" || item.status === "missing",
  );
  const counts = {
    library: items.length,
    movies: items.filter((item) => item.kind === "movie").length,
    shows: items.filter((item) => item.kind === "series").length,
    missing: incomplete.length,
  };
  const { data: matching } = useLiveQuery({
    queryKey: [
      collections.library.id,
      "filtered",
      clientReady,
      category,
      status,
      instanceFilter,
      quality,
    ],
    query: (q) =>
      clientReady
        ? q.from({ item: collections.library }).fn.where(({ item }) => {
            if (category === "movies" && item.kind !== "movie") return false;
            if (category === "shows" && item.kind !== "series") return false;
            if (
              category === "missing" &&
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
                (instanceFilter === "all" ||
                  target.instanceId === instanceFilter) &&
                (quality === "all" || target.qualityProfile === quality),
            );
          })
        : undefined,
  });
  const positions = new Map(items.map((item, index) => [item.id, index]));
  const filtered = [...(matching ?? [])].sort(
    (a, b) =>
      (sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "year"
          ? b.year - a.year
          : sort === "rating"
            ? (b.rating ?? 0) - (a.rating ?? 0)
            : b.added.localeCompare(a.added)) ||
      (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0),
  );
  const filterCount =
    Number(instanceFilter !== "all") +
    Number(quality !== "all") +
    Number(status !== "all");

  return (
    <>
      <PageHeader
        title={
          category === "library"
            ? "Your library"
            : category === "missing"
              ? "Fill in the gaps"
              : category === "movies"
                ? "Movie library"
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
            count: items.filter((item) => item.status === "available").length,
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
            count: items.filter((item) => item.status === "downloading").length,
            note: "Good things are on the way",
            icon: ArrowDownIcon,
            color: "#9dbbed",
            filter: "downloading",
          },
        ].map((stat) => (
          <button
            type="button"
            key={stat.label}
            disabled={!library.data}
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
              {library.data ? stat.count : "-"}
            </div>
            <p
              className={css({
                color: "subtle",
                fontSize: "9px",
                lineHeight: "1.4",
              })}
            >
              {library.isPending && stat.filter === "all"
                ? "Loading counts..."
                : stat.filter === "all" && !library.data
                  ? "Counts unavailable"
                  : stat.note}
            </p>
          </button>
        ))}
      </div>
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
              aria-current={category === tab ? "page" : undefined}
              className={css({
                height: "50px",
                display: "flex",
                alignItems: "center",
                gap: "7px",
                position: "relative",
                fontSize: "11px",
                color: category === tab ? "ink" : "subtle",
                fontWeight: category === tab ? "550" : "400",
                _hover: { color: "ink" },
                _after: {
                  content: '""',
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: { base: "7px", md: "-7px" },
                  height: "2px",
                  borderRadius: "2px",
                  bg: category === tab ? "accent" : "transparent",
                },
              })}
            >
              {tab === "library" ? "All media" : categoryNames[tab]}
              <span
                aria-hidden={library.isPending || undefined}
                className={css({
                  fontSize: "9px",
                  fontFamily: "mono",
                  minWidth: library.isPending ? "24px" : undefined,
                  minHeight: library.isPending ? "16px" : undefined,
                  borderRadius: "4px",
                  px: "5px",
                  py: "1px",
                  color: category === tab ? "#c7c7c7" : "#858585",
                  bg: category === tab ? "#303030" : "#242424",
                })}
              >
                {library.data ? counts[tab] : library.isPending ? null : "-"}
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
                          ...instances.map((instance) => ({
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
                        Quality profile
                      </p>
                      <SelectField
                        value={quality}
                        onChange={setQuality}
                        label="Filter by quality profile"
                        options={[
                          { value: "all", label: "All profiles" },
                          ...qualities.map((name) => ({
                            value: name,
                            label: name,
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
                          { value: "downloading", label: "Downloading" },
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
              setInstanceFilter("all");
              setQuality("all");
              setStatus("all");
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
