import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Settings } from "@/components/settings";
import { api } from "@/lib/client";
import type { ActionResponse, InstanceSummary } from "@/lib/types";

vi.mock("@/lib/client", () => ({ api: vi.fn() }));

const instance: InstanceSummary = {
  id: "sonarr-hd",
  kind: "sonarr",
  name: "Sonarr HD",
  url: "http://localhost:8989",
  hasApiKey: true,
  connected: true,
  version: "4.0.1",
};

function fillForm(url = "http://localhost:8989") {
  fireEvent.change(screen.getByLabelText("Instance name"), {
    target: { value: " Sonarr HD " },
  });
  fireEvent.change(screen.getByLabelText("Instance URL"), {
    target: { value: url },
  });
  fireEvent.change(screen.getByLabelText("API key"), {
    target: { value: "test-secret-key" },
  });
}

beforeEach(() => vi.mocked(api).mockReset());
afterEach(cleanup);

describe("Settings", () => {
  it("prefills edits, tests with the saved key, and updates the same instance", async () => {
    const onChanged = vi.fn();
    const notify = vi.fn();
    vi.mocked(api).mockResolvedValueOnce({ success: true, version: "4.0.1" });
    render(
      <Settings instances={[instance]} onChanged={onChanged} notify={notify} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Sonarr HD" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit instance" });
    expect(
      (screen.getByLabelText("Instance name") as HTMLInputElement).value,
    ).toBe(instance.name);
    expect(
      (screen.getByLabelText("Instance URL") as HTMLInputElement).value,
    ).toBe(instance.url);
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      screen.getByText(/Leave blank to keep the saved API key/),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Instance name"), {
      target: { value: "Renamed Sonarr" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await screen.findByText(/Connection verified.*Not saved yet/);
    expect(api).toHaveBeenLastCalledWith(
      "/api/instances/sonarr-hd/test",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(String(vi.mocked(api).mock.calls[0][1]?.body))).toEqual({
      kind: "sonarr",
      name: "Renamed Sonarr",
      url: instance.url,
    });
    expect(onChanged).not.toHaveBeenCalled();

    const pending = Promise.withResolvers<{ instance: InstanceSummary }>();
    vi.mocked(api).mockReturnValueOnce(pending.promise);
    const form = dialog.querySelector("form");
    if (!form) throw new Error("Edit form missing");
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(api).toHaveBeenCalledTimes(2);
    expect(api).toHaveBeenLastCalledWith(
      "/api/instances/sonarr-hd",
      expect.objectContaining({ method: "PATCH" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () =>
      pending.resolve({ instance: { ...instance, name: "Renamed Sonarr" } }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("Renamed Sonarr updated.");
    fireEvent.click(screen.getByRole("button", { name: "Add instance" }));
    await screen.findByRole("dialog", { name: "Connect an instance" });
    expect(
      (screen.getByLabelText("Instance name") as HTMLInputElement).value,
    ).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Connect instance" }));
    expect(screen.getByText("Enter the instance's API key.")).toBeTruthy();
  });

  it("retains failed edits for retry and discards replacement credentials on close", async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error("Connection failed."));
    const onChanged = vi.fn();
    render(
      <Settings
        instances={[instance]}
        onChanged={onChanged}
        notify={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Sonarr HD" }));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("Instance URL"), {
      target: { value: "http://localhost:9999" },
    });
    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "replacement-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Connection failed.",
    );
    expect(JSON.parse(String(vi.mocked(api).mock.calls[0][1]?.body))).toEqual({
      kind: "sonarr",
      name: instance.name,
      url: "http://localhost:9999",
      apiKey: "replacement-key",
    });
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe(
      "replacement-key",
    );
    expect(onChanged).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Edit Sonarr HD" }));
    await screen.findByRole("dialog");
    expect(
      (screen.getByLabelText("Instance URL") as HTMLInputElement).value,
    ).toBe(instance.url);
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("shows an honest empty state and validates required fields before a request", async () => {
    render(<Settings instances={[]} onChanged={vi.fn()} notify={vi.fn()} />);
    expect(screen.getByText("Bring your library together")).toBeTruthy();
    expect(screen.queryByText("Connected")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Connect first instance" }),
    );
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Connect instance" }));
    expect(screen.getAllByRole("alert")).toHaveLength(3);
    expect(api).not.toHaveBeenCalled();
    expect(screen.getByText(/host.docker.internal/)).toBeTruthy();
  });

  it.each([
    "not a URL",
    "ftp://localhost:8989",
    "http://user:password@localhost:8989",
    "http://localhost:8989?apikey=secret",
    "http://localhost:8989#settings",
    "http://localhost:8989\\sonarr",
  ])(
    "rejects the invalid instance URL %s without throwing or contacting the server",
    async (url) => {
      render(
        <Settings
          instances={[]}
          onChanged={vi.fn()}
          notify={vi.fn()}
          autoOpen
        />,
      );
      await screen.findByRole("dialog");
      fillForm(url);
      fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
      expect(screen.getByRole("alert")).toBeTruthy();
      expect(api).not.toHaveBeenCalled();
    },
  );

  it("tests without saving and clears the verified result when any field changes", async () => {
    vi.mocked(api).mockResolvedValue({
      success: true,
      version: "4.0.1",
      message: "Connection successful.",
    });
    const onChanged = vi.fn();
    render(
      <Settings
        instances={[]}
        onChanged={onChanged}
        notify={vi.fn()}
        autoOpen
      />,
    );
    await screen.findByRole("dialog");
    fillForm("http://host.docker.internal:8989/sonarr");
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await screen.findByText(/Connection verified.*Not saved yet/);
    const [path, init] = vi.mocked(api).mock.calls[0];
    expect(path).toBe("/api/instances/test");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      kind: "sonarr",
      name: "Sonarr HD",
      url: "http://host.docker.internal:8989/sonarr",
      apiKey: "test-secret-key",
    });
    expect(onChanged).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Instance name"), {
      target: { value: "Another instance" },
    });
    expect(screen.queryByText(/Connection verified/)).toBeNull();
  });

  it("ignores a late test response after an edit and clears the API key on close", async () => {
    const pending = Promise.withResolvers<
      ActionResponse & { version: string }
    >();
    vi.mocked(api).mockReturnValue(pending.promise);
    render(
      <Settings instances={[]} onChanged={vi.fn()} notify={vi.fn()} autoOpen />,
    );
    await screen.findByRole("dialog");
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Show API key" }));
    expect(screen.getByLabelText("API key").getAttribute("type")).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    const signal = vi.mocked(api).mock.calls[0][1]?.signal;
    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "new-secret" },
    });
    expect(signal?.aborted).toBe(true);
    await act(async () =>
      pending.resolve({ success: true, version: "4.0.1", message: "OK" }),
    );
    expect(screen.queryByText(/Connection verified/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Add instance" }));
    await screen.findByRole("dialog");
    const keyInput = screen.getByLabelText("API key") as HTMLInputElement;
    expect(keyInput.value).toBe("");
    expect(keyInput.type).toBe("password");
    expect(screen.queryByText(/Connection verified/)).toBeNull();
  });

  it("saves once, prevents dismissal while saving, and refreshes connections on success", async () => {
    const pending = Promise.withResolvers<{ instance: InstanceSummary }>();
    vi.mocked(api).mockReturnValue(pending.promise);
    const onChanged = vi.fn();
    const notify = vi.fn();
    render(
      <Settings
        instances={[]}
        onChanged={onChanged}
        notify={notify}
        autoOpen
      />,
    );
    const dialog = await screen.findByRole("dialog");
    fillForm();
    const form = dialog.querySelector("form");
    if (!form) throw new Error("Connection form missing");
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(api).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api).mock.calls[0][0]).toBe("/api/instances");
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    await act(async () => pending.resolve({ instance }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("Sonarr HD connected.");
    fireEvent.click(screen.getByRole("button", { name: "Add instance" }));
    await screen.findByRole("dialog");
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("surfaces save failures and allows a retry", async () => {
    vi.mocked(api).mockRejectedValueOnce(
      new Error("An instance with this URL already exists."),
    );
    const notify = vi.fn();
    const onChanged = vi.fn();
    render(
      <Settings
        instances={[]}
        onChanged={onChanged}
        notify={notify}
        autoOpen
      />,
    );
    await screen.findByRole("dialog");
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Connect instance" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "already exists",
    );
    expect(
      screen
        .getByRole("button", { name: "Connect instance" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(notify).toHaveBeenCalledWith(
      "An instance with this URL already exists.",
      true,
    );
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("switches instance type through the shared select and sends the selected kind", async () => {
    vi.mocked(api).mockResolvedValue({
      success: true,
      message: "Connection successful.",
    });
    render(
      <Settings instances={[]} onChanged={vi.fn()} notify={vi.fn()} autoOpen />,
    );
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("combobox", { name: "Instance type" }));
    const option = await screen.findByRole("option", {
      name: "Radarr - Movies",
    });
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    fillForm("http://localhost:7878");
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await screen.findByText(/Connection verified/);
    expect(JSON.parse(String(vi.mocked(api).mock.calls[0][1]?.body)).kind).toBe(
      "radarr",
    );
    expect(screen.getByText(/Find it in Radarr/)).toBeTruthy();
  });

  it("does not treat a negative connection-test result as verified", async () => {
    vi.mocked(api).mockResolvedValue({
      success: false,
      message: "This is Radarr, not Sonarr.",
    });
    render(
      <Settings instances={[]} onChanged={vi.fn()} notify={vi.fn()} autoOpen />,
    );
    await screen.findByRole("dialog");
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "not Sonarr",
    );
    expect(screen.queryByText(/Connection verified/)).toBeNull();
  });

  it("handles each auto-open request once, even when the parent callback changes", async () => {
    const onAutoOpened = vi.fn();
    const props = { instances: [], onChanged: vi.fn(), notify: vi.fn() };
    const { rerender } = render(
      <Settings {...props} autoOpen onAutoOpened={onAutoOpened} />,
    );
    await screen.findByRole("dialog");
    expect(onAutoOpened).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    rerender(
      <Settings {...props} autoOpen onAutoOpened={() => onAutoOpened()} />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onAutoOpened).toHaveBeenCalledTimes(1);
    rerender(
      <Settings {...props} autoOpen={false} onAutoOpened={onAutoOpened} />,
    );
    rerender(<Settings {...props} autoOpen onAutoOpened={onAutoOpened} />);
    await screen.findByRole("dialog");
    expect(onAutoOpened).toHaveBeenCalledTimes(2);
  });

  it("refreshes saved-key status through the parent and confirms local-only disconnection", async () => {
    vi.mocked(api).mockResolvedValue({
      success: true,
      message: "Instance disconnected. No remote media or files were deleted.",
    });
    const onChanged = vi.fn();
    const notify = vi.fn();
    render(
      <Settings
        instances={[
          { ...instance, connected: false, error: "Connection timed out." },
        ]}
        onChanged={onChanged}
        notify={notify}
      />,
    );
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText("4.0.1")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "Connection timed out",
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(api).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Disconnect Sonarr HD" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/does not delete any upstream media/),
    ).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Disconnect instance",
      }),
    );
    await waitFor(() => expect(notify).toHaveBeenCalled());
    expect(api).toHaveBeenCalledWith("/api/instances/sonarr-hd", {
      method: "DELETE",
    });
    expect(onChanged).toHaveBeenCalledTimes(2);
  });
});
