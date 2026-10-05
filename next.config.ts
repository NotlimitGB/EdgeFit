import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Opt-in at build time; ordinary Vercel builds keep their existing output.
  ...(process.env.SNOWDEX_SHADOW_MODE === "true" ? { output: "standalone" as const } : {}),
  async headers() {
    return process.env.SNOWDEX_SHADOW_MODE === "true"
      ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] }]
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
    ];
  },
};

export default nextConfig;
