import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The landing site is plain static HTML, deployable to any static host.
  output: "export",
  images: { unoptimized: true },
  // Keep Turbopack scoped to site/ rather than the app's lockfile at the repo root.
  turbopack: { root: __dirname },
  devIndicators: false,
};

export default nextConfig;
