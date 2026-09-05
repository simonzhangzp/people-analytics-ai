import type { NextConfig } from "next";

const NO_STORE = {
  key: "Cache-Control",
  value: "private, no-cache, no-store, max-age=0, must-revalidate",
} as const;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  transpilePackages: ["@kanaries/graphic-walker"],
  serverExternalPackages: ["pg"],
  async headers() {
    return [
      { source: "/", headers: [NO_STORE] },
      { source: "/enterprise-demo", headers: [NO_STORE] },
      { source: "/enterprise-demo/:path*", headers: [NO_STORE] },
      { source: "/about", headers: [NO_STORE] },
      { source: "/dataset", headers: [NO_STORE] },
    ];
  },
};

export default nextConfig;
