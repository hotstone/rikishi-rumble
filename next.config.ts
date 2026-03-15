import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "node-cron"],
  experimental: {
    instrumentationHook: true,
  },
};

export default nextConfig;
