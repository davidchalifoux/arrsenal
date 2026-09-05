import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  preflight: true,
  include: ["./src/**/*.{ts,tsx,js,jsx}"],
  exclude: [],
  conditions: {
    extend: {
      startingStyle: "&[data-starting-style]",
      endingStyle: "&[data-ending-style]",
      highlighted: "&[data-highlighted]",
    },
  },
  theme: {
    extend: {
      tokens: {
        colors: {
          canvas: { value: "#111312" },
          sidebar: { value: "#141615" },
          surface: { value: "#191c1a" },
          elevated: { value: "#222623" },
          line: { value: "#2a2e2b" },
          ink: { value: "#f0f2ef" },
          muted: { value: "#969d96" },
          subtle: { value: "#6c756d" },
          accent: { value: "#c5f277" },
          positive: { value: "#a6d78b" },
          warning: { value: "#dfb978" },
          negative: { value: "#f29c9c" },
          info: { value: "#94baf1" },
        },
        fonts: {
          sans: { value: "var(--font-geist-sans), sans-serif" },
          mono: { value: "var(--font-geist-mono), monospace" },
        },
      },
      keyframes: {
        spin: { to: { transform: "rotate(360deg)" } },
        enter: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  outdir: "styled-system",
});
