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
          canvas: { value: "#111111" },
          sidebar: { value: "#151515" },
          surface: { value: "#1c1c1c" },
          elevated: { value: "#282828" },
          line: { value: "#303030" },
          ink: { value: "#f0f0f0" },
          muted: { value: "#9c9c9c" },
          subtle: { value: "#767676" },
          accent: { value: "#e5e5e5" },
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
