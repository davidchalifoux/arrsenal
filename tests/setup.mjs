import { JSDOM } from "jsdom";

const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost:3000",
  pretendToBeVisual: true,
});

// Keep Bun's fetch, streams, and timers; use jsdom's matching DOM event classes.
for (const key of Object.getOwnPropertyNames(window)) {
  if (
    !(key in globalThis) ||
    ["Event", "EventTarget", "MessageEvent"].includes(key)
  ) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: window[key],
    });
  }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout. Give page scroll bodies a viewport-sized box so
// virtualized lists inside them render the rows a real window would show.
for (const [property, size] of [
  ["offsetWidth", () => window.innerWidth],
  ["offsetHeight", () => window.innerHeight],
  ["clientWidth", () => window.innerWidth],
  ["clientHeight", () => window.innerHeight],
]) {
  const base =
    Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, property) ??
    Object.getOwnPropertyDescriptor(window.Element.prototype, property);
  Object.defineProperty(window.HTMLElement.prototype, property, {
    configurable: true,
    get() {
      return this.hasAttribute("data-page-scroll")
        ? size()
        : (base?.get?.call(this) ?? 0);
    },
  });
}

// Tear upstream realtime connections down as soon as the last subscriber
// leaves, so tests don't share them. One test opts into the grace period.
process.env.ARRSENAL_UPSTREAM_LINGER_MS ??= "0";
