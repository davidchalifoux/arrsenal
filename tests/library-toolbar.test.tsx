import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

const { LibraryToolbar } = await import("@/components/library-toolbar");

afterEach(cleanup);

const props: ComponentProps<typeof LibraryToolbar> = {
  filterCount: 0,
  instances: [],
  qualities: [],
  instanceFilter: "all",
  quality: "all",
  status: "all",
  sort: "recent",
  sortDirection: "desc",
  layout: "grid",
  onInstanceChange: mock(),
  onQualityChange: mock(),
  onStatusChange: mock(),
  onSortChange: mock(),
  onSortDirectionChange: mock(),
  onLayoutChange: mock(),
  onResetFilters: mock(),
};

describe("LibraryToolbar", () => {
  it("offers both sort directions with an accessible action label", () => {
    const onSortDirectionChange = mock();
    const view = render(
      <LibraryToolbar
        {...props}
        onSortDirectionChange={onSortDirectionChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sort ascending" }));
    expect(onSortDirectionChange).toHaveBeenLastCalledWith("asc");
    view.rerender(
      <LibraryToolbar
        {...props}
        sortDirection="asc"
        onSortDirectionChange={onSortDirectionChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sort descending" }));
    expect(onSortDirectionChange).toHaveBeenLastCalledWith("desc");
  });

  it("offers Incomplete directly in the toolbar without opening Filters", async () => {
    const onStatusChange = mock();
    render(<LibraryToolbar {...props} onStatusChange={onStatusChange} />);
    expect(screen.queryByText("Quality profile")).toBeNull();
    fireEvent.click(
      screen.getByRole("combobox", { name: "Filter by availability" }),
    );
    const option = await screen.findByRole("option", { name: "Incomplete" });
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    expect(onStatusChange).toHaveBeenCalledWith("incomplete");
  });
});
