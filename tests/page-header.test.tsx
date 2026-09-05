import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PageHeader,
  PageUtilitiesContext,
  WorkspaceUtilities,
} from "@/components/page-header";

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
    render(
      <PageHeader
        id="queue-heading"
        title="Download queue"
        description="Downloads across your instances."
        actions={<button type="button">Refresh</button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 }).id).toBe("queue-heading");
    expect(screen.getByText("Downloads across your instances.")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("renders each page action once between search and Add media", () => {
    const refresh = vi.fn();
    render(
      <PageUtilitiesContext
        value={(actions) => (
          <WorkspaceUtilities desktopOnly>{actions}</WorkspaceUtilities>
        )}
      >
        <PageHeader
          title="Your library"
          actions={
            <button type="button" onClick={refresh}>
              Refresh
            </button>
          }
        />
      </PageUtilitiesContext>,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0].getAttribute("aria-label")).toBe("Search library");
    expect(buttons[1].textContent).toBe("Refresh");
    expect(buttons[2].textContent).toBe("Add media");
    for (const button of buttons) fireEvent.click(button);
    expect(workspace.searchLibrary).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(workspace.add).toHaveBeenCalledExactlyOnceWith();
  });
});
