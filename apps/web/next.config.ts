import type { NextConfig } from "next";

const internalApiUrl = process.env.INTERNAL_API_URL ?? "http://apfiscal-api:3001";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  agentRules: false,
  serverExternalPackages: ["xlsx"],
  async rewrites() {
    return [{ source: "/backend/:path*", destination: `${internalApiUrl}/:path*` }];
  },
};

export default nextConfig;
