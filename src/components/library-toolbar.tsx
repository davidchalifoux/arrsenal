import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import {
  ArrowClockwiseIcon,
  ArrowsDownUpIcon,
  CheckIcon,
  FunnelIcon,
  ListIcon,
  PencilSimpleIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import { useState } from "react";
import {
  PageToolbar,
  ToolbarButton,
  ToolbarDivider,
  toolbarItemStyle,
} from "./page-header";
import {
  Button,
  menuItemStyle,
  menuLabelStyle,
  menuPopupStyle,
  menuSeparatorStyle,
  SelectField,
} from "./ui";
import type {
  LibraryLayout,
  LibrarySort,
  LibrarySortDirection,
  LibraryStatus,
} from "./use-library-view";

const statusOptions: { value: LibraryStatus; label: string; dot: string }[] = [
  { value: "all", label: "All availability", dot: "var(--ink)" },
  { value: "available", label: "Available", dot: "var(--positive)" },
  { value: "incomplete", label: "Incomplete", dot: "var(--warning)" },
  { value: "downloading", label: "Downloading", dot: "var(--info)" },
];

export const sortOptions: { value: LibrarySort; label: string }[] = [
  { value: "recent", label: "Date added" },
  { value: "title", label: "Title" },
  { value: "year", label: "Release year" },
  { value: "rating", label: "Rating" },
  { value: "size", label: "Size on disk" },
  { value: "episodes", label: "Missing episodes" },
  { value: "monitored", label: "Monitored" },
];

function SortMenu({
  sort,
  sortDirection,
  onSortChange,
  onSortDirectionChange,
}: {
  sort: LibrarySort;
  sortDirection: LibrarySortDirection;
  onSortChange: (sort: LibrarySort) => void;
  onSortDirectionChange: (direction: LibrarySortDirection) => void;
}) {
  const current = sortOptions.find((option) => option.value === sort);
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`Sort library: ${current?.label}, ${sortDirection === "asc" ? "ascending" : "descending"}`}
        className={toolbarItemStyle}
      >
        <ArrowsDownUpIcon size={16} aria-hidden="true" />
        <span className={css({ display: { base: "none", md: "inline" } })}>
          Sort
        </span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          sideOffset={6}
          align="end"
          className={css({ zIndex: 50 })}
        >
          <Menu.Popup className={menuPopupStyle}>
            <Menu.RadioGroup
              value={sort}
              onValueChange={(value) => {
                const option = sortOptions.find((item) => item.value === value);
                if (option) onSortChange(option.value);
              }}
            >
              <Menu.GroupLabel className={menuLabelStyle}>
                Sort by
              </Menu.GroupLabel>
              {sortOptions.map((option) => (
                <Menu.RadioItem
                  key={option.value}
                  value={option.value}
                  closeOnClick
                  className={menuItemStyle}
                >
                  <span
                    className={css({
                      width: "16px",
                      display: "grid",
                      placeItems: "center",
                    })}
                  >
                    <Menu.RadioItemIndicator>
                      <CheckIcon
                        size={14}
                        weight="bold"
                        color="var(--accent)"
                      />
                    </Menu.RadioItemIndicator>
                  </span>
                  {option.label}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
            <Menu.Separator className={menuSeparatorStyle} />
            <Menu.RadioGroup
              value={sortDirection}
              onValueChange={(value) => {
                if (value === "asc" || value === "desc")
                  onSortDirectionChange(value);
              }}
            >
              <Menu.GroupLabel className={menuLabelStyle}>
                Order
              </Menu.GroupLabel>
              {(["asc", "desc"] as const).map((direction) => (
                <Menu.RadioItem
                  key={direction}
                  value={direction}
                  closeOnClick
                  className={menuItemStyle}
                >
                  <span
                    className={css({
                      width: "16px",
                      display: "grid",
                      placeItems: "center",
                    })}
                  >
                    <Menu.RadioItemIndicator>
                      <CheckIcon
                        size={14}
                        weight="bold"
                        color="var(--accent)"
                      />
                    </Menu.RadioItemIndicator>
                  </span>
                  {direction === "asc" ? "Ascending" : "Descending"}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export type FilterMenuEntry = { id: string; name: string; count?: number };

const filterEntryRaw = css.raw({
  display: "flex",
  alignItems: "center",
  gap: "10px",
  width: "100%",
  minHeight: "34px",
  px: "10px",
  border: 0,
  borderRadius: "8px",
  bg: "transparent",
  color: "soft",
  fontSize: "13px",
  textAlign: "left",
  _hover: { bg: "elevated", color: "ink" },
  "&[aria-pressed=true]": { bg: "elevated", color: "ink" },
});
const filterEntryStyle = css(filterEntryRaw);

function FilterEntry({
  entry,
  active,
  onSelect,
  onEdit,
  dot,
}: {
  entry: FilterMenuEntry;
  active: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  dot?: string;
}) {
  return (
    <div className={css({ display: "flex", alignItems: "center", gap: "2px" })}>
      <button
        type="button"
        aria-pressed={active}
        onClick={onSelect}
        className={filterEntryStyle}
      >
        <span
          className={css({
            width: "16px",
            display: "grid",
            placeItems: "center",
          })}
        >
          {active && (
            <CheckIcon size={14} weight="bold" color="var(--accent)" />
          )}
        </span>
        {dot && (
          <span
            aria-hidden="true"
            className={css({
              width: "6px",
              height: "6px",
              borderRadius: "999px",
              flexShrink: 0,
            })}
            style={{ background: dot }}
          />
        )}
        <span className={css({ flexGrow: 1, minWidth: 0 })}>{entry.name}</span>
        {entry.count !== undefined && (
          <span
            className={css({
              fontFamily: "mono",
              fontSize: "11px",
              color: "subtle",
            })}
          >
            {entry.count}
          </span>
        )}
      </button>
      {onEdit && (
        <button
          type="button"
          aria-label={`Edit ${entry.name}`}
          onClick={onEdit}
          className={css({
            width: "30px",
            height: "30px",
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            border: 0,
            borderRadius: "7px",
            bg: "transparent",
            color: "muted",
            _hover: { bg: "elevated", color: "ink" },
          })}
        >
          <PencilSimpleIcon size={14} />
        </button>
      )}
    </div>
  );
}

function FilterPopover({
  filterCount,
  instances,
  qualities,
  instanceFilter,
  quality,
  onInstanceChange,
  onQualityChange,
  onResetFilters,
  filterId,
  allCount,
  presets,
  customFilters,
  onFilterChange,
  onEditFilter,
  onNewFilter,
  status,
  statusCounts,
  onStatusChange,
}: {
  status: LibraryStatus;
  statusCounts?: Record<LibraryStatus, number>;
  onStatusChange: (status: LibraryStatus) => void;
  filterCount: number;
  instances: { id: string; name: string }[];
  qualities: string[];
  instanceFilter: string;
  quality: string;
  onInstanceChange: (instance: string) => void;
  onQualityChange: (quality: string) => void;
  onResetFilters: () => void;
  filterId: string | null;
  allCount?: number;
  presets: FilterMenuEntry[];
  customFilters: FilterMenuEntry[];
  onFilterChange: (id: string | null) => void;
  onEditFilter: (id: string) => void;
  onNewFilter: () => void;
}) {
  const [open, setOpen] = useState(false);
  function select(id: string | null) {
    onFilterChange(id);
    setOpen(false);
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={filterCount ? `Filter, ${filterCount} active` : "Filter"}
        data-active={filterCount > 0 || undefined}
        className={toolbarItemStyle}
      >
        <FunnelIcon size={16} aria-hidden="true" />
        <span className={css({ display: { base: "none", md: "inline" } })}>
          Filter
        </span>
        {filterCount > 0 && (
          <span
            aria-hidden="true"
            className={css({
              minWidth: "18px",
              height: "18px",
              px: "5px",
              display: "grid",
              placeItems: "center",
              borderRadius: "999px",
              bg: "accent",
              color: "onAccent",
              fontSize: "11px",
              fontWeight: "600",
            })}
          >
            {filterCount}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          sideOffset={6}
          align="end"
          className={css({ zIndex: 50 })}
        >
          <Popover.Popup
            aria-label="Filter library"
            className={cx(menuPopupStyle, css({ width: "320px" }))}
          >
            <p className={menuLabelStyle}>Availability</p>
            {statusOptions.map((option) => (
              <FilterEntry
                key={option.value}
                entry={{
                  id: option.value,
                  name: option.label,
                  count: statusCounts?.[option.value],
                }}
                dot={option.dot}
                active={status === option.value}
                onSelect={() => {
                  onStatusChange(option.value);
                  setOpen(false);
                }}
              />
            ))}
            <div className={menuSeparatorStyle} />
            <p className={menuLabelStyle}>Presets</p>
            <FilterEntry
              entry={{ id: "all", name: "No preset", count: allCount }}
              active={filterId === null}
              onSelect={() => select(null)}
            />
            {presets.map((entry) => (
              <FilterEntry
                key={entry.id}
                entry={entry}
                active={filterId === entry.id}
                onSelect={() => select(entry.id)}
              />
            ))}
            <div className={menuSeparatorStyle} />
            <p className={menuLabelStyle}>Custom filters</p>
            {customFilters.length === 0 && (
              <p
                className={css({
                  px: "10px",
                  pb: "6px",
                  fontSize: "12px",
                  color: "subtle",
                })}
              >
                Save a combination of rules to reuse it here.
              </p>
            )}
            {customFilters.map((entry) => (
              <FilterEntry
                key={entry.id}
                entry={entry}
                active={filterId === entry.id}
                onSelect={() => select(entry.id)}
                onEdit={() => {
                  setOpen(false);
                  onEditFilter(entry.id);
                }}
              />
            ))}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onNewFilter();
              }}
              className={css(filterEntryRaw, {
                color: "accent",
                fontWeight: "500",
              })}
            >
              <PlusIcon size={16} aria-hidden="true" />
              New custom filter…
            </button>
            <div className={menuSeparatorStyle} />
            <p className={menuLabelStyle}>Quick filters</p>
            <div
              className={css({
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                px: "10px",
                pb: "8px",
              })}
            >
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
              <SelectField
                value={quality}
                onChange={onQualityChange}
                label="Filter by quality profile"
                options={[
                  { value: "all", label: "All profiles" },
                  ...qualities.map((name) => ({ value: name, label: name })),
                ]}
              />
              <Button variant="ghost" size="sm" onClick={onResetFilters}>
                Reset filters
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function LibraryToolbar({
  refreshing,
  onRefresh,
  onAdd,
  filterCount,
  instances,
  qualities,
  instanceFilter,
  quality,
  sort,
  sortDirection,
  layout,
  onInstanceChange,
  onQualityChange,
  onSortChange,
  onSortDirectionChange,
  onLayoutChange,
  onResetFilters,
  filterId = null,
  allCount,
  presets = [],
  customFilters = [],
  onFilterChange = () => {},
  onEditFilter = () => {},
  onNewFilter = () => {},
  onOptions,
  status = "all",
  statusCounts,
  onStatusChange = () => {},
}: {
  status?: LibraryStatus;
  statusCounts?: Record<LibraryStatus, number>;
  onStatusChange?: (status: LibraryStatus) => void;
  refreshing: boolean;
  onRefresh: () => void;
  onAdd: () => void;
  filterCount: number;
  instances: { id: string; name: string }[];
  qualities: string[];
  instanceFilter: string;
  quality: string;
  sort: LibrarySort;
  sortDirection: LibrarySortDirection;
  layout: LibraryLayout;
  onInstanceChange: (instance: string) => void;
  onQualityChange: (quality: string) => void;
  onSortChange: (sort: LibrarySort) => void;
  onSortDirectionChange: (direction: LibrarySortDirection) => void;
  onLayoutChange: (layout: LibraryLayout) => void;
  onResetFilters: () => void;
  filterId?: string | null;
  allCount?: number;
  presets?: FilterMenuEntry[];
  customFilters?: FilterMenuEntry[];
  onFilterChange?: (id: string | null) => void;
  onEditFilter?: (id: string) => void;
  onNewFilter?: () => void;
  onOptions?: () => void;
}) {
  return (
    <PageToolbar
      label="Library actions"
      actions={
        <>
          <ToolbarButton
            icon={SquaresFourIcon}
            label="Posters"
            aria-pressed={layout === "grid"}
            onClick={() => onLayoutChange("grid")}
          />
          <ToolbarButton
            icon={ListIcon}
            label="Table"
            aria-pressed={layout === "list"}
            onClick={() => onLayoutChange("list")}
          />
          <ToolbarDivider />
          <SortMenu
            sort={sort}
            sortDirection={sortDirection}
            onSortChange={onSortChange}
            onSortDirectionChange={onSortDirectionChange}
          />
          <FilterPopover
            filterCount={filterCount}
            instances={instances}
            qualities={qualities}
            instanceFilter={instanceFilter}
            quality={quality}
            onInstanceChange={onInstanceChange}
            onQualityChange={onQualityChange}
            onResetFilters={onResetFilters}
            filterId={filterId}
            allCount={allCount}
            presets={presets}
            customFilters={customFilters}
            onFilterChange={onFilterChange}
            onEditFilter={onEditFilter}
            onNewFilter={onNewFilter}
            status={status}
            statusCounts={statusCounts}
            onStatusChange={onStatusChange}
          />
          {onOptions && (
            <ToolbarButton
              icon={SlidersHorizontalIcon}
              label="Options"
              aria-label="View options"
              onClick={onOptions}
            />
          )}
        </>
      }
    >
      <ToolbarButton
        icon={ArrowClockwiseIcon}
        label="Refresh"
        aria-label="Refresh library"
        disabled={refreshing}
        onClick={onRefresh}
        iconClassName={
          refreshing
            ? css({
                animation: "spin 1s linear infinite",
                _motionReduce: { animation: "none" },
              })
            : undefined
        }
      />
      <ToolbarButton icon={PlusIcon} label="Add new" onClick={onAdd} />
    </PageToolbar>
  );
}
