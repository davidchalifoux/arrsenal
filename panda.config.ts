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
          canvas: { value: "var(--canvas)" },
          sidebar: { value: "var(--sidebar)" },
          toolbar: { value: "var(--toolbar)" },
          surface: { value: "var(--surface)" },
          raised: { value: "var(--raised)" },
          control: { value: "var(--control)" },
          elevated: { value: "var(--elevated)" },
          line: { value: "var(--line)" },
          lineSoft: { value: "var(--line-soft)" },
          lineStrong: { value: "var(--line-strong)" },
          ink: { value: "var(--ink)" },
          soft: { value: "var(--soft)" },
          muted: { value: "var(--muted)" },
          subtle: { value: "var(--subtle)" },
          faint: { value: "var(--faint)" },
          accent: { value: "var(--accent)" },
          onAccent: { value: "var(--on-accent)" },
          positive: { value: "var(--positive)" },
          warning: { value: "var(--warning)" },
          negative: { value: "var(--negative)" },
          info: { value: "var(--info)" },
          scrim: { value: "var(--scrim)" },
        },
        fonts: {
          sans: { value: "var(--font-geist-sans), sans-serif" },
          mono: { value: "var(--font-geist-mono), monospace" },
        },
      },
      keyframes: {
        spin: { to: { transform: "rotate(360deg)" } },
        pulse: { "50%": { opacity: "0.45" } },
        // Startup screen: marks rise in, then shimmer in a slow wave.
        markRise: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        markWave: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        progressSlide: {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(250%)" },
        },
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        enter: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  outdir: "styled-system",
});
