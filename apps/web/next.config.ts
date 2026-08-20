import type { NextConfig } from "next";
import path from "node:path";

const internalApiUrl =
  process.env.INTERNAL_API_URL ?? "http://apfiscal-api:3001";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  agentRules: false,
  serverExternalPackages: ["xlsx"],

  // O app vive em um workspace. Mantemos o root do tracing no monorepo para
  // que dependências do pnpm sejam copiadas fisicamente para o standalone.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*",
    ],
  },

  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: `${internalApiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
