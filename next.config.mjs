/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "@prisma/client",
      "ai",
      "@ai-sdk/anthropic",
      "@ai-sdk/openai",
      "swisseph-v2",
    ],
  },
  async headers() {
    // /oauth/authorize is the one page in this app where a clickjacked click
    // has real consequence (granting an MCP OAuth client account access), so
    // it gets frame protection the rest of the app doesn't need.
    return [
      {
        source: "/oauth/authorize",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
  webpack: (config) => {
    // mcp/src/*.ts uses NodeNext-style relative imports ("./tools.js" resolving
    // to tools.ts) for its own separate tsc build. Webpack doesn't do that
    // extension mapping by default, so app/api/mcp/route.ts's cross-package
    // import chain into mcp/src/* fails to resolve without this alias.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
