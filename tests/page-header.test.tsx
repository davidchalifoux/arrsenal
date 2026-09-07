import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageHeader, WorkspaceUtilities } from "@/components/page-header";

const workspace = vi.hoisted(() => ({ add: vi.fn(), searchLibrary: vi.fn() }));
vi.mock("@/components/workspace-provider", () => ({
  useWorkspace: () => workspace,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PageHeader", () => {
  it("keeps standalone page headings and actions independent of workspace utilities", () => {
    const refresh = vi.fn();
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
    expect(refresh).toHaveBeenCalledOnce();
    expect(workspace.add).not.toHaveBeenCalled();
    expect(workspace.searchLibrary).not.toHaveBeenCalled();
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
    const refresh = vi.fn();
    render(
      <>
        <WorkspaceUtilities />
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
    expect(workspace.searchLibrary).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(workspace.add).toHaveBeenCalledExactlyOnceWith(null, "movie");
  });
});

describe("WorkspaceUtilities", () => {
  it.each([
    undefined,
    "movie",
    "series",
  ] as const)("opens search and seeds Add with addKind=%s", (addKind) => {
    render(<WorkspaceUtilities addKind={addKind} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Search library" }));
    expect(workspace.searchLibrary).toHaveBeenCalledOnce();
    expect(workspace.add).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Add media" }));
    expect(workspace.add).toHaveBeenCalledExactlyOnceWith(
      null,
      addKind ?? "movie",
    );
    expect(workspace.searchLibrary).toHaveBeenCalledOnce();
  });
});
