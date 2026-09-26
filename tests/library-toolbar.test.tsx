import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

const { LibraryToolbar } = await import("@/components/library-toolbar");

afterEach(cleanup);

const props: ComponentProps<typeof LibraryToolbar> = {
  refreshing: false,
  onRefresh: mock(),
  onAdd: mock(),
  filterCount: 0,
  instances: [],
  qualities: [],
  instanceFilter: "all",
  quality: "all",
  sort: "recent",
  sortDirection: "desc",
  layout: "grid",
  onInstanceChange: mock(),
  onQualityChange: mock(),
  onSortChange: mock(),
  onSortDirectionChange: mock(),
  onLayoutChange: mock(),
  onResetFilters: mock(),
};

describe("LibraryToolbar", () => {
  it("disables refresh while the library is syncing", () => {
    render(<LibraryToolbar {...props} refreshing />);
    expect(
      screen
        .getByRole("button", { name: "Refresh library" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("chooses the sort field and direction from the Sort menu", async () => {
    const onSortChange = mock();
    const onSortDirectionChange = mock();
    render(
      <LibraryToolbar
        {...props}
        onSortChange={onSortChange}
        onSortDirectionChange={onSortDirectionChange}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Sort library: Date added, descending",
    });
    fireEvent.click(trigger);
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "Title" }),
    );
    expect(onSortChange).toHaveBeenCalledWith("title");
    fireEvent.click(trigger);
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "Ascending" }),
    );
    expect(onSortDirectionChange).toHaveBeenCalledWith("asc");
  });
});
