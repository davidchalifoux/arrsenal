import type { NextConfig } from "next";
import { posterSources } from "./src/lib/image-sources";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  // SignalR loads its Node transports dynamically; preserve package-local resolution.
  serverExternalPackages: ["@microsoft/signalr", "ws"],
  outputFileTracingIncludes: {
    "/api/events": [
      // SignalR loads these through aliased require() calls, even in WebSocket-only mode.
      "./node_modules/{eventsource,fetch-cookie,tough-cookie}/**/*",
      // Include their transitive dependencies and nested package versions.
      "./node_modules/{set-cookie-parser,psl,punycode,universalify,url-parse,querystringify,requires-port,tldts,tldts-core}/**/*",
    ],
  },
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
