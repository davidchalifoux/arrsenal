import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Turbopack scoped to site/ rather than the app's lockfile at the repo root.
  turbopack: { root: __dirname },
  devIndicators: false,
};

export default nextConfig;
