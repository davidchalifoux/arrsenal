import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryToolbar } from "@/components/library-toolbar";

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
  onInstanceChange: vi.fn(),
  onQualityChange: vi.fn(),
  onStatusChange: vi.fn(),
  onSortChange: vi.fn(),
  onSortDirectionChange: vi.fn(),
  onLayoutChange: vi.fn(),
  onResetFilters: vi.fn(),
};

describe("LibraryToolbar", () => {
  it("leaves section navigation to the global navigation", () => {
    render(<LibraryToolbar {...props} />);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Filter by availability" }),
    ).toBeTruthy();
  });
  it("offers both sort directions with an accessible action label", () => {
    const onSortDirectionChange = vi.fn();
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

  it("opens the filter controls without the introductory heading", async () => {
    render(<LibraryToolbar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(await screen.findByText("Instance")).toBeTruthy();
    expect(screen.getByText("Quality profile")).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Filter by availability" }),
    ).toBeTruthy();
    expect(screen.queryByText("Make it your view")).toBeNull();
  });

  it("offers Incomplete directly in the toolbar without opening Filters", async () => {
    const onStatusChange = vi.fn();
    render(<LibraryToolbar {...props} onStatusChange={onStatusChange} />);
    expect(screen.queryByText("Quality profile")).toBeNull();
    fireEvent.click(
      screen.getByRole("combobox", { name: "Filter by availability" }),
    );
    const option = await screen.findByRole("option", { name: "Incomplete" });
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    expect(onStatusChange).toHaveBeenCalledWith("incomplete");
    expect(screen.queryByText("Incomplete / missing")).toBeNull();
  });
});
