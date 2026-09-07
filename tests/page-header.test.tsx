import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const libraryActions = {
  add: mock(),
  searchLibrary: mock(),
};
mock.module("@/components/library-provider", () => ({
  useLibraryActions: () => libraryActions,
}));
const { LibraryUtilities, PageHeader } = await import(
  "@/components/page-header"
);

afterEach(() => {
  cleanup();
  mock.clearAllMocks();
});

describe("PageHeader", () => {
  it("keeps standalone page headings and actions independent of library utilities", () => {
    const refresh = mock();
    render(
      <PageHeader
        id="queue-heading"
        title="Download queue"
        actions={
          <button type="button" onClick={refresh}>
            Refresh
          </button>
        }
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).id).toBe("queue-heading");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Download queue",
    );
    expect(screen.queryByRole("paragraph")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(libraryActions.add).not.toHaveBeenCalled();
    expect(libraryActions.searchLibrary).not.toHaveBeenCalled();
  });

  it("renders a heading without subtitles or optional actions", () => {
    render(<PageHeader title="Calendar" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Calendar",
    );
    expect(screen.queryByRole("paragraph")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("does not duplicate global utilities when rendered beside them", () => {
    const refresh = mock();
    render(
      <>
        <LibraryUtilities />
        <PageHeader
          title="Your library"
          actions={
            <button type="button" onClick={refresh}>
              Refresh
            </button>
          }
        />
      </>,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0].getAttribute("aria-label")).toBe("Search library");
    expect(buttons[1].textContent).toBe("Add media");
    expect(buttons[2].textContent).toBe("Refresh");
    for (const button of buttons) fireEvent.click(button);
    expect(libraryActions.searchLibrary).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(libraryActions.add).toHaveBeenCalledTimes(1);
    expect(libraryActions.add).toHaveBeenCalledWith(null, "movie");
  });
});

describe("LibraryUtilities", () => {
  it.each([
    undefined,
    "movie",
    "series",
  ] as const)("opens search and seeds Add with addKind=%s", (addKind) => {
    render(<LibraryUtilities addKind={addKind} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Search library" }));
    expect(libraryActions.searchLibrary).toHaveBeenCalledTimes(1);
    expect(libraryActions.add).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add media" }));
    expect(libraryActions.add).toHaveBeenCalledTimes(1);
    expect(libraryActions.add).toHaveBeenCalledWith(null, addKind ?? "movie");
    expect(libraryActions.searchLibrary).toHaveBeenCalledTimes(1);
  });
});
