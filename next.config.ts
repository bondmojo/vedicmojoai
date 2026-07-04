import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "ai", "@ai-sdk/anthropic", "@ai-sdk/openai"],
  },
};

export default nextConfig;
