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
    // Vercel's build-time file tracer (@vercel/nft) only follows JS require() chains —
    // it doesn't see swisseph-v2's native addon load (a concatenated require() in
    // node_modules/swisseph-v2/lib/swisseph.js) or its ephemeris data files read via
    // swe_set_ephe_path() (engine/compute/transits.ts), nor the prompts/**/*.md files
    // read at runtime via fs.readFile/fs.readdir (engine/llm.ts, app/api/knowledge/*).
    // Without this, both silently drop from the deployed bundle: chart compute falls
    // back to a lower-precision ephemeris with no error, and every LLM agent / MCP
    // knowledge-resource call 404s reading its prompt file.
    outputFileTracingIncludes: {
      "/api/**/*": ["./node_modules/swisseph-v2/**/*", "./prompts/**/*"],
    },
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
