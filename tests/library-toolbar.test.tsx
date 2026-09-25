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
  it("puts page actions on the left and view controls on the right", () => {
    const onRefresh = mock();
    const onAdd = mock();
    const onLayoutChange = mock();
    render(
      <LibraryToolbar
        {...props}
        onRefresh={onRefresh}
        onAdd={onAdd}
        onLayoutChange={onLayoutChange}
      />,
    );
    const toolbar = screen.getByRole("toolbar", { name: "Library actions" });
    expect(toolbar).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Refresh library" }));
    fireEvent.click(screen.getByRole("button", { name: "Add new" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(
      screen
        .getByRole("button", { name: "Posters" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(onLayoutChange).toHaveBeenCalledWith("list");
  });

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

  it("shows the active filter count on the Filter button", () => {
    render(<LibraryToolbar {...props} filterCount={2} />);
    expect(
      screen.getByRole("button", { name: "Filter, 2 active" }),
    ).toBeDefined();
  });
});
