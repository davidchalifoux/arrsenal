import type { NextConfig } from "next";
import { posterSources } from "./src/lib/image-sources";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  // SignalR loads its Node transports dynamically; preserve package-local resolution.
  serverExternalPackages: ["@microsoft/signalr", "ws"],
  devIndicators: false,
  images: {
    remotePatterns: posterSources.map(({ hostname, pathname }) => ({
      protocol: "https",
      hostname,
      port: "",
      pathname: `${pathname}**`,
      search: "",
    })),
    localPatterns: [{ pathname: "/api/image" }],
    maximumRedirects: 0,
  },
};

export default nextConfig;
