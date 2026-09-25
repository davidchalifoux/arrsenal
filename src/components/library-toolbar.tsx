import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import {
  ArrowClockwiseIcon,
  ArrowsDownUpIcon,
  CheckIcon,
  FunnelIcon,
  ListIcon,
  PlusIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";
import { css, cx } from "@styled-system/css";
import type { ReactNode } from "react";
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
} from "./use-library-view";

export const sortOptions: { value: LibrarySort; label: string }[] = [
  { value: "recent", label: "Date added" },
  { value: "title", label: "Title" },
  { value: "year", label: "Release year" },
  { value: "rating", label: "Rating" },
  { value: "size", label: "Size on disk" },
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

function FilterPopover({
  filterCount,
  instances,
  qualities,
  instanceFilter,
  quality,
  onInstanceChange,
  onQualityChange,
  onResetFilters,
}: {
  filterCount: number;
  instances: { id: string; name: string }[];
  qualities: string[];
  instanceFilter: string;
  quality: string;
  onInstanceChange: (instance: string) => void;
  onQualityChange: (quality: string) => void;
  onResetFilters: () => void;
}) {
  return (
    <Popover.Root>
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
            className={cx(menuPopupStyle, css({ width: "280px", p: "16px" }))}
          >
            <div
              className={css({
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              })}
            >
              <div>
                <p className={cx(menuLabelStyle, css({ px: 0, pt: 0 }))}>
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
                <p className={cx(menuLabelStyle, css({ px: 0, pt: 0 }))}>
                  Quality profile
                </p>
                <SelectField
                  value={quality}
                  onChange={onQualityChange}
                  label="Filter by quality profile"
                  options={[
                    { value: "all", label: "All profiles" },
                    ...qualities.map((name) => ({ value: name, label: name })),
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
  extra,
}: {
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
  extra?: ReactNode;
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
          />
          {extra}
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
