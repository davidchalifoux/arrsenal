import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  preflight: true,
  include: ["./src/**/*.{ts,tsx}"],
  exclude: [],
  theme: {
    extend: {
      tokens: {
        colors: {
          canvas: { value: "#101010" },
          surface: { value: "#161616" },
          raised: { value: "#1c1c1c" },
          elevated: { value: "#262626" },
          line: { value: "#262626" },
          lineStrong: { value: "#363636" },
          ink: { value: "#ededed" },
          soft: { value: "#cfcfcf" },
          muted: { value: "#a6a6a6" },
          subtle: { value: "#8c8c8c" },
          faint: { value: "#5f5f5f" },
          accent: { value: "#d4d4d4" },
          sonarr: { value: "#35c5f4" },
          radarr: { value: "#ffc230" },
          positive: { value: "#5fcf8f" },
          warning: { value: "#f0b45b" },
          negative: { value: "#f2878a" },
          info: { value: "#6aa8ff" },
        },
        fonts: {
          sans: { value: "var(--font-geist-sans), sans-serif" },
          mono: { value: "var(--font-geist-mono), monospace" },
        },
      },
    },
  },
  globalCss: {
    html: {
      colorScheme: "dark",
      bg: "canvas",
      color: "ink",
      fontFamily: "sans",
      scrollBehavior: "smooth",
      WebkitFontSmoothing: "antialiased",
    },
    body: { bg: "canvas", minH: "100dvh" },
    "::selection": { bg: "elevated", color: "ink" },
  },
  outdir: "styled-system",
});
