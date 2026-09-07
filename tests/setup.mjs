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
