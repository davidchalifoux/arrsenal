import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryToolbar } from "@/components/library-toolbar";

afterEach(cleanup);

const props: ComponentProps<typeof LibraryToolbar> = {
  category: "library",
  counts: {
    library: 0,
    movies: 0,
    shows: 0,
    missing: 0,
    available: 0,
    downloading: 0,
  },
  hasData: true,
  isPending: false,
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
    expect(screen.getByText("Availability")).toBeTruthy();
    expect(screen.queryByText("Make it your view")).toBeNull();
  });
});
