import { focusManager, type QueryClient } from "@tanstack/react-query";

const queueViews = new WeakMap<QueryClient, number>();

export function queuePollingInterval(client: QueryClient) {
  return queueViews.get(client) ? 15_000 : 60_000;
}

export function subscribeQueueView(client: QueryClient) {
  function change(delta: number) {
    queueViews.set(client, (queueViews.get(client) ?? 0) + delta);
    // Notify the collection observer to recompute its interval without a fetch
    // or a second polling observer. Neither data nor freshness is changed.
    client
      .getQueryCache()
      .find({ queryKey: ["queue"], exact: true })
      ?.setState({});
  }
  change(1);
  return () => change(-1);
}

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
