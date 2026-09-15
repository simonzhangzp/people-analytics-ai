import type { NextConfig } from "next";

const NO_STORE = {
  key: "Cache-Control",
  value: "private, no-cache, no-store, max-age=0, must-revalidate",
} as const;

const RETIRED = [
  "/lab",
  "/ask",
  "/workbench",
  "/demo",
  "/strategy",
  "/app",
  "/workspace",
  "/api/workbench/ai",
  "/api/strategy/analyze",
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["pg"],
  async redirects() {
    return RETIRED.flatMap((source) => [
      { source, destination: "/", statusCode: 301 },
      { source: `${source}/:path*`, destination: "/", statusCode: 301 },
    ]);
  },
  async headers() {
    return [
      { source: "/", headers: [NO_STORE] },
      { source: "/enterprise-demo", headers: [NO_STORE] },
      { source: "/enterprise-demo/:path*", headers: [NO_STORE] },
      { source: "/about", headers: [NO_STORE] },
      { source: "/dataset", headers: [NO_STORE] },
      { source: "/connect", headers: [NO_STORE] },
      { source: "/try", headers: [NO_STORE] },
    ];
  },
};

export default nextConfig;
