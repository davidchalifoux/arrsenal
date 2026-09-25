export const themes = [
  { id: "sonarr", name: "Sonarr", accent: "#35c5f4" },
  { id: "midnight", name: "Midnight", accent: "#8b7cf6" },
  { id: "radarr", name: "Radarr", accent: "#ffc230" },
  { id: "graphite", name: "Graphite", accent: "#5fd0a0" },
  { id: "neutral", name: "Neutral", accent: "#d4d4d4" },
  { id: "daylight", name: "Daylight", accent: "#6d5be8" },
] as const;

export type ThemeId = (typeof themes)[number]["id"];

export const themeIds = themes.map((theme) => theme.id) as [
  ThemeId,
  ...ThemeId[],
];

export const defaultTheme: ThemeId = "sonarr";

export const accentSwatches = [
  { name: "Violet", value: "#8b7cf6" },
  { name: "Sky", value: "#35c5f4" },
  { name: "Amber", value: "#ffc230" },
  { name: "Mint", value: "#5fd0a0" },
  { name: "Rose", value: "#f2789a" },
  { name: "Slate", value: "#a3a7b0" },
  { name: "Silver", value: "#d4d4d4" },
];

export const hexColorPattern = /^#[0-9a-f]{6}$/i;

export function themeAccent(theme: ThemeId, accent?: string | null) {
  return accent ?? themes.find((item) => item.id === theme)?.accent ?? "";
}

// Picks dark or light text for a filled accent using WCAG relative luminance.
export function accentForeground(hex: string) {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.18 ? "#0d0e10" : "#ffffff";
}

export function themeStyle(theme: ThemeId, accent?: string | null) {
  const color = themeAccent(theme, accent);
  return {
    "--accent": color,
    "--on-accent": accentForeground(color),
  } as Record<string, string>;
}
