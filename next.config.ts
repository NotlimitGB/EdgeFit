import type { NextConfig } from "next";
import { getHostingProvider, TIMEWEB_INDEXABLE_HOST_PATTERN } from "./src/lib/deployment-policy";

// Validate provider at config load/build time, not after accepting production traffic.
getHostingProvider();

const nextConfig: NextConfig = {
  // Opt-in at build time; ordinary Vercel builds keep their existing output.
  ...(process.env.SNOWDEX_STANDALONE === "true" ? { output: "standalone" as const } : {}),
  async headers() {
    return process.env.SNOWDEX_SHADOW_MODE === "true"
      ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] }]
      : getHostingProvider() === "timeweb"
        ? [{ source: "/:path*", missing: [{ type: "host", value: TIMEWEB_INDEXABLE_HOST_PATTERN }],
            headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] }]
        : [];
  },
  async redirects() {
    return [
      {
        // Only the former stable public host migrates; previews remain usable.
        // Service paths and the exact ownership file retain their original behavior.
        source: "/:path((?!health$|google10fccbce44c29493\\.html$|api(?:/|$)|go(?:/|$)|internal(?:/|$)|_next(?:/|$)).*)",
        has: [{ type: "host", value: "edge-fit\\.vercel\\.app" }],
        destination: "https://snowdex.ru/:path",
        permanent: true,
      },
      ...(getHostingProvider() === "timeweb" ? [{
        source: "/:path((?!health$|google10fccbce44c29493\\.html$|api(?:/|$)|go(?:/|$)|internal(?:/|$)|_next(?:/|$)).*)",
        has: [{ type: "host" as const, value: "www\\.snowdex\\.ru" }],
        destination: "https://snowdex.ru/:path",
        permanent: true,
      }] : []),
    ];
  },
};

export default nextConfig;
