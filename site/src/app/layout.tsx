import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "One self-hosted library for all your Sonarr and Radarr instances. See every title, quality, queue, and missing episode across HD and 4K without switching tabs.";

export const metadata: Metadata = {
  // Set SITE_URL at build time so social previews resolve to absolute URLs.
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3100"),
  title: "Arrsenal | One home for your Sonarr and Radarr libraries",
  description,
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "Arrsenal",
    description,
    type: "website",
    images: [{ url: "/library.png", width: 2880, height: 1770 }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101010",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
