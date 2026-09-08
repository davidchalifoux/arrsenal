import { focusManager } from "@tanstack/react-query";

export function trackWindowFocus(setFocused: (focused: boolean) => void) {
  if (typeof window === "undefined") return;
  const update = () =>
    setFocused(document.visibilityState !== "hidden" && document.hasFocus());
  const blur = () => setFocused(false);
  window.addEventListener("focus", update);
  window.addEventListener("blur", blur);
  document.addEventListener("visibilitychange", update);
  update();
  return () => {
    window.removeEventListener("focus", update);
    window.removeEventListener("blur", blur);
    document.removeEventListener("visibilitychange", update);
  };
}

export function configurePollingFocus() {
  focusManager.setEventListener(trackWindowFocus);
}
