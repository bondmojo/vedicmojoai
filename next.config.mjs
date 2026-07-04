/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: [
      "@prisma/client",
      "ai",
      "@ai-sdk/anthropic",
      "@ai-sdk/openai",
      "swisseph-v2",
    ],
  },
};

export default nextConfig;
