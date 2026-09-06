import { Popover } from "@base-ui/react/popover";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ListIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { css } from "@styled-system/css";
import Link from "next/link";
import { Button, buttonStyle, SelectField } from "./ui";
import type {
  LibraryCategory,
  LibraryCounts,
  LibraryLayout,
  LibrarySort,
  LibrarySortDirection,
  LibraryStatus,
} from "./use-library-view";

const categoryNames = {
  library: "All media",
  movies: "Movies",
  shows: "Shows",
  missing: "Missing",
};

export function LibraryToolbar({
  category,
  counts,
  hasData,
  isPending,
  filterCount,
  instances,
  qualities,
  instanceFilter,
  quality,
  status,
  sort,
  sortDirection,
  layout,
  onInstanceChange,
  onQualityChange,
  onStatusChange,
  onSortChange,
  onSortDirectionChange,
  onLayoutChange,
  onResetFilters,
}: {
  category: LibraryCategory;
  counts: LibraryCounts;
  hasData: boolean;
  isPending: boolean;
  filterCount: number;
  instances: { id: string; name: string }[];
  qualities: string[];
  instanceFilter: string;
  quality: string;
  status: LibraryStatus;
  sort: LibrarySort;
  sortDirection: LibrarySortDirection;
  layout: LibraryLayout;
  onInstanceChange: (instance: string) => void;
  onQualityChange: (quality: string) => void;
  onStatusChange: (status: LibraryStatus) => void;
  onSortChange: (sort: LibrarySort) => void;
  onSortDirectionChange: (direction: LibrarySortDirection) => void;
  onLayoutChange: (layout: LibraryLayout) => void;
  onResetFilters: () => void;
}) {
  return (
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
              aria-hidden={isPending || undefined}
              className={css({
                fontSize: "9px",
                fontFamily: "mono",
                minWidth: isPending ? "24px" : undefined,
                minHeight: isPending ? "16px" : undefined,
                borderRadius: "4px",
                px: "5px",
                py: "1px",
                color: category === tab ? "#c7c7c7" : "#858585",
                bg: category === tab ? "#303030" : "#242424",
              })}
            >
              {hasData ? counts[tab] : isPending ? null : "-"}
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
              size: "md",
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
                      onChange={onInstanceChange}
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
                      onChange={onQualityChange}
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
                      onChange={(value) => {
                        if (
                          value === "all" ||
                          value === "available" ||
                          value === "incomplete" ||
                          value === "downloading"
                        ) {
                          onStatusChange(value);
                        }
                      }}
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
                  <Button variant="ghost" size="sm" onClick={onResetFilters}>
                    Reset filters
                  </Button>
                </div>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
        <SelectField
          compact
          value={sort}
          onChange={(value) => {
            if (
              value === "recent" ||
              value === "title" ||
              value === "year" ||
              value === "rating"
            ) {
              onSortChange(value);
            }
          }}
          label="Sort library"
          options={[
            { value: "recent", label: "Date added" },
            { value: "title", label: "Title" },
            { value: "year", label: "Release year" },
            { value: "rating", label: "Rating" },
          ]}
        />
        <Button
          aria-label={
            sortDirection === "asc" ? "Sort descending" : "Sort ascending"
          }
          title={
            sortDirection === "asc"
              ? "Ascending: click to sort descending"
              : "Descending: click to sort ascending"
          }
          onClick={() =>
            onSortDirectionChange(sortDirection === "asc" ? "desc" : "asc")
          }
          className={css({ width: "36px", px: "0" })}
        >
          {sortDirection === "asc" ? (
            <ArrowUpIcon size={16} />
          ) : (
            <ArrowDownIcon size={16} />
          )}
        </Button>
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            bg: "#191919",
            border: "1px solid token(colors.line)",
            borderRadius: "7px",
            height: "36px",
            padding: "3px",
            ml: "4px",
            gap: "2px",
          })}
        >
          <button
            type="button"
            aria-label="Grid view"
            aria-pressed={layout === "grid"}
            onClick={() => onLayoutChange("grid")}
            className={css({
              display: "grid",
              placeItems: "center",
              width: "27px",
              height: "28px",
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
            onClick={() => onLayoutChange("list")}
            className={css({
              display: "grid",
              placeItems: "center",
              width: "27px",
              height: "28px",
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
  );
}
