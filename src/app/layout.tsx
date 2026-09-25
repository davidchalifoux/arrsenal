import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import { readPreferences } from "@/lib/server/config";
import { defaultTheme, themeStyle } from "@/lib/theme";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Arrsenal | Your media, together",
  description:
    "One home for your Sonarr and Radarr libraries. Every title, every quality, every instance.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0e10",
};

async function readTheme() {
  await connection();
  try {
    const { theme = defaultTheme, accent } = await readPreferences();
    return { theme, accent };
  } catch {
    // An unreadable config should not block rendering; fall back to the default look.
    return { theme: defaultTheme, accent: null };
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { theme, accent } = await readTheme();
  return (
    <html
      lang="en"
      data-theme={theme}
      style={themeStyle(theme, accent)}
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
