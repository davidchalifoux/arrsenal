import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";

const { TimezoneSelect } = await import("@/components/timezone-select");

const changed = mock();
function Picker({ saved = "" }: { saved?: string }) {
  const [value, setValue] = useState(saved);
  return (
    <TimezoneSelect
      value={value}
      savedValue={saved}
      onChange={(zone) => {
        changed(zone);
        setValue(zone);
      }}
      describedBy="hint"
    />
  );
}

beforeEach(() => {
  changed.mockClear();
  spyOn(Intl, "supportedValuesOf").mockReturnValue([
    "America/New_York",
    "Asia/Tokyo",
    "Europe/Paris",
  ]);
  const options = Intl.DateTimeFormat().resolvedOptions();
  spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    ...options,
    timeZone: "US/Pacific",
  });
});
afterEach(() => {
  cleanup();
  mock.restore();
});

async function open() {
  fireEvent.click(screen.getByRole("combobox", { name: "Timezone" }));
  const search = await screen.findByRole("combobox", {
    name: "Search timezones",
  });
  await waitFor(() => expect(document.activeElement).toBe(search));
  return search;
}

describe("timezone picker", () => {
  it.each([
    "new york",
    "NEW_YORK",
    "america/new york",
  ])("normalizes search %s and clears the query without resetting selection", async (query) => {
    render(<Picker saved="Asia/Tokyo" />);
    const search = await open();
    fireEvent.change(search, { target: { value: query } });
    expect(
      await screen.findByRole("option", {
        name: /New York America\/New_York/,
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Tokyo/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect((search as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(search);
    expect(changed).not.toHaveBeenCalled();
    expect(await screen.findByRole("option", { name: /Tokyo/ })).toBeTruthy();
  });

  it("selects with ArrowDown and Enter, restores focus, and discards search on Escape", async () => {
    render(<Picker />);
    const search = await open();
    fireEvent.change(search, { target: { value: "new york" } });
    await screen.findByRole("option", { name: /New York/ });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() =>
      expect(changed).toHaveBeenLastCalledWith("America/New_York"),
    );
    const trigger = screen.getByRole("combobox", { name: "Timezone" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    const nextSearch = await open();
    fireEvent.change(nextSearch, { target: { value: "Invalid/Zone" } });
    expect(screen.getByText(/No matching timezones/)).toBeTruthy();
    fireEvent.keyDown(nextSearch, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(changed).toHaveBeenCalledTimes(1);
    const reopened = await open();
    expect((reopened as HTMLInputElement).value).toBe("");
  });

  it("preserves saved and browser aliases missing from supportedValuesOf and resets by selection", async () => {
    render(<Picker saved="US/Eastern" />);
    const search = await open();
    expect(
      screen
        .getByRole("option", { name: /Eastern US\/Eastern/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.change(search, { target: { value: "us pacific" } });
    expect(
      await screen.findByRole("option", { name: /Pacific US\/Pacific/ }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: /Automatic/ }));
    await waitFor(() => expect(changed).toHaveBeenLastCalledWith(""));
  });
});
