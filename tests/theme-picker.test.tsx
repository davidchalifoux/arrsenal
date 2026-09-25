import { afterEach, beforeEach, expect, it, mock } from "bun:test";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";

const state = {
  data: { timeZone: null, theme: "midnight", accent: null } as Record<
    string,
    unknown
  >,
  mutate: mock(
    (_patch: unknown, _options?: { onError?: (error: Error) => void }) => {},
  ),
};
mock.module("@/lib/preferences", () => ({
  usePreferences: () => ({ data: state.data, isPending: false }),
  useSavePreferences: () => ({ mutate: state.mutate }),
}));
const { ThemePicker } = await import("@/components/theme-picker");

beforeEach(() => {
  state.mutate.mockReset();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
});
afterEach(cleanup);

it("applies a theme immediately and saves it with the theme accent", () => {
  render(<ThemePicker />);
  expect(
    screen
      .getByRole("button", { name: /Midnight/ })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: /Radarr/ }));
  expect(state.mutate.mock.calls[0][0]).toEqual({
    theme: "radarr",
    accent: null,
  });
  const root = document.documentElement;
  expect(root.dataset.theme).toBe("radarr");
  expect(root.style.getPropertyValue("--accent")).toBe("#ffc230");
  expect(root.style.getPropertyValue("--on-accent")).toBe("#0d0e10");
});

it("saves accent swatches and custom hex colors, and reverts on failure", () => {
  render(<ThemePicker />);
  fireEvent.click(screen.getByRole("button", { name: "Rose accent" }));
  expect(state.mutate.mock.calls[0][0]).toEqual({ accent: "#f2789a" });
  act(() => state.mutate.mock.calls[0][1]?.onError?.(new Error("Disk full")));
  expect(document.documentElement.style.getPropertyValue("--accent")).toBe(
    "#8b7cf6",
  );
  expect(screen.getByRole("alert").textContent).toContain("Disk full");
  const input = screen.getByRole("textbox", { name: "Custom" });
  fireEvent.change(input, { target: { value: "#12AB34" } });
  fireEvent.blur(input);
  expect(state.mutate.mock.calls[1][0]).toEqual({ accent: "#12ab34" });
  fireEvent.change(input, { target: { value: "nope" } });
  fireEvent.blur(input);
  expect(state.mutate).toHaveBeenCalledTimes(2);
});
