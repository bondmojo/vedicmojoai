# Design Document: Vercel & Supabase Deployment

## Overview

This document specifies the architecture and code changes required to deploy VedicMojoAI to Vercel using Supabase PostgreSQL. 

The core issues addressed are:
1. **Read-only Filesystem on Vercel:** Transitioning HTML/MD reports from disk to DB-backed storage (`PipelineRun` fields `reportHtml` and `reportMarkdown`).
2. **Serverless Connection Exhaustion:** Configuring Prisma with connection pooling using Supabase's transaction pooler, and direct database access for migrations.
3. **Background Pipeline Survival (bounded):** The AI Analysis and Duration Analysis pipelines are launched fire-and-forget after a `202` response — `waitUntil()` keeps the invocation alive past the response, but only up to `maxDuration`; runs that exceed it are an accepted, recoverable-via-`/rerun` failure mode, not something this spec claims to fully solve.
4. **Runtime-Read Asset Bundling:** Both `swisseph-v2` (whole package, not just `ephe/`) and `prompts/**` must be explicitly traced into the deployment bundle, or chart compute *and* the LLM pipeline / MCP knowledge surface silently break at runtime.
5. **MCP HTTP Transport Wiring:** `POST /api/mcp` self-calls back into this deployment's own API and needs deployment-specific env vars to avoid round-tripping over the public internet or getting blocked by Deployment Protection.
6. **Other Serverless-Incompatible Assumptions:** Prisma binary target, cookie `Secure` flag derivation, the in-memory auth rate limiter, and unpinned Node version each carry a latent break on Vercel that isn't caused by the read-only filesystem but must still be closed out.

---

## Architecture / Affected Modules

```mermaid
flowchart TD
    subgraph vercel["Vercel (Serverless Function Context)"]
        CLIENT["Prisma Client<br/>(Uses DATABASE_URL Pooler)"]
        API["/api/runs/[id]/report-content<br/>(Reads DB, falls back to fs)"]
        RENDERER["renderer.ts<br/>(Writes DB, wraps fs in try-catch)"]
        HEALTH["/api/health<br/>(Bypasses reports_dir check if VERCEL=1)"]
        ANALYZE["/api/unified-charts/[id]/analyze<br/>+ /api/duration-analysis<br/>(pipeline kept alive via waitUntil/after,<br/>maxDuration set)"]
        MCP["/api/mcp (Streamable HTTP)<br/>self-calls back into own /api/*<br/>via VEDICMOJO_INTERNAL_BASE_URL"]
    end
    subgraph supabase["Supabase (PostgreSQL Cloud DB)"]
        POOLER["Connection Pooler (Port 6543)<br/>Transaction Mode"]
        DB["Direct Database (Port 5432)"]
    end
    CLIENT --> POOLER
    POOLER --> DB
    API --> CLIENT
    RENDERER --> CLIENT
    HEALTH --> CLIENT
    ANALYZE --> CLIENT
    MCP -->|"self-call (2nd invocation)"| API
    MCP --> CLIENT
```

---

## Data Models

We will update [prisma/schema.prisma](file:///Users/mohitjoshi/Documents/Vedic Astrology/vedicmojoai/prisma/schema.prisma):

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model PipelineRun {
  id              String        @id @default(uuid())
  ...
  reportPath      String?
  reportHtml      String?       @db.Text
  reportMarkdown  String?       @db.Text
  ...
}
```

---

## Component Changes

### 1. Prisma Connection Setup
- Modify the database block in `prisma/schema.prisma` to include `directUrl`, and add `rhel-openssl-3.0.x` to `binaryTargets` (see Component 8).
- Specify connection pooling parameters:
  - `DATABASE_URL` uses the pooler with `pgbouncer=true` **and** `connection_limit=1` (e.g., `postgresql://...:6543/postgres?pgbouncer=true&connection_limit=1`) — each serverless invocation gets its own Prisma Client, so this caps how many connections one invocation can open against the pooler.
  - `DIRECT_URL` uses the direct URL (e.g., `postgresql://...:5432/postgres`).

### 2. Report Generation (Renderer)
Update `renderReport` and `renderMarkdownReport` in `engine/renderer.ts`:
- Capture HTML content and markdown content.
- Update `prisma.pipelineRun.update` to write the content directly to the database.
- Wrap filesystem writes `fs.writeFile` and `fs.mkdir` in a safety `try...catch` block.

```typescript
// Example renderReport modification
try {
  await fs.mkdir(reportsDir, { recursive: true })
  await fs.writeFile(filePath, html, 'utf-8')
} catch (err) {
  console.warn('Skipping file write (likely on serverless filesystem):', err)
}

await prisma.pipelineRun.update({
  where: { id: runId },
  data: {
    reportPath: relativePath,
    reportHtml: html,
  },
})
```

### 3. Serving Reports (API Endpoint)
Modify `app/api/runs/[id]/report-content/route.ts`:
- Check if `reportHtml` or `reportMarkdown` is available in the database.
- Return it immediately if present.
- If not present, fall back to reading from disk using `fs.readFile`.

### 4. Health Check Integration
Modify `app/api/health/route.ts`:
- Check if `process.env.VERCEL` is defined. If so, immediately mark the reports directory health check as `'ok'`.

### 5. Background Pipeline Execution (bounded mitigation)
Modify `app/api/unified-charts/[id]/analyze/route.ts` and `app/api/duration-analysis/route.ts`:
- Wrap the existing fire-and-forget `executePipeline(...).catch(...)` (and the duration-analysis equivalent) in `waitUntil()` from `@vercel/functions` — this keeps the invocation alive until the promise settles instead of relying on the process happening to still be running. `waitUntil()` is a no-op wrapper outside Vercel, so local/Docker behavior (where the process persists anyway) is unaffected.
- Add `export const maxDuration = <seconds>` to both route files, set to the target Vercel plan's maximum (Hobby 300s / Pro 300s standard, up to 800s with Fluid Compute). This is a ceiling, not a tuning knob sized "to the pipeline" — Wave 4 alone is a sequential 4X→4A→4B→4C chain with 4C on a larger model at a high token budget, so realistic worst-case runtime can plausibly exceed even the 800s ceiling. **Do not build a queue/worker for this** — out of scope given this app's documented ~10 reports/month scale (`lib/rateLimit.ts`) — instead, treat ceiling-exceeding runs as an accepted failure mode recoverable via the already-existing `POST /api/runs/[id]/rerun` / `POST /api/runs/[id]/override` endpoints.
- Add `export const maxDuration = <seconds>` to `app/api/runs/[id]/events/route.ts` (SSE) too — it's a separate invocation with its own independent ceiling. Change the client's `EventSource` handling to reconnect on stream end, and change the server's duplicate-event suppression from the current in-memory `reportedAgents` `Set` (which resets on every new invocation/reconnect) to a check against what's already persisted in the DB.

```typescript
// Example: app/api/unified-charts/[id]/analyze/route.ts
import { waitUntil } from '@vercel/functions'

export const maxDuration = 800 // seconds — target plan's ceiling; runs that exceed it recover via /rerun

// ...
waitUntil(
  executePipeline({ /* ... */ }).catch(async (error) => {
    console.error(`Pipeline run ${run.id} failed:`, error)
  })
)
```

### 6. Runtime-Read Asset Bundling
Modify `next.config.js`:
- Add `experimental.outputFileTracingIncludes` (this config key lives under `experimental` in Next.js 14.2.x — it only became top-level in Next.js 15) covering:
  - `node_modules/swisseph-v2/**` — the **whole package**, not just `ephe/`. The native addon loads via a concatenated `require(__dirname + '/../build/Release/swisseph.node')` (`node_modules/swisseph-v2/lib/swisseph.js`), which `@vercel/nft`'s static analysis may not resolve, on top of the `ephe/` data directory `swe_set_ephe_path()` reads at runtime.
  - `prompts/**` — read by `engine/llm.ts` (every one of the ~34 LLM agent prompts, via `path.join(process.cwd(), relative)`) and `fs.readdir()`'d directly by `app/api/knowledge/route.ts` and `app/api/knowledge/[type]/[name]/route.ts`. Missing this breaks the entire LLM pipeline and MCP Resources surface (`get_domain_knowledge`, `get_framework`, `list_knowledge`), not just chart compute.
- Verify with a preview deployment that (a) a chart-compute request's transit longitudes match a known-correct local reference — **not just "no error"**, since `SEFLG_SWIEPH` with missing data files silently falls back to the lower-precision Moshier ephemeris (see `engine/compute/transits.degreeSadeSati.test.ts`'s note on this) — and (b) an MCP knowledge-resource read (e.g. `get_framework`) succeeds against the deployed bundle.

### 7. MCP HTTP Transport Deployment Wiring
No code change — `app/api/mcp/route.ts` already reads `VEDICMOJO_INTERNAL_BASE_URL` and `VERCEL_AUTOMATION_BYPASS_SECRET`. This step is purely environment configuration (see below) plus a post-deploy smoke test: call `POST /api/mcp` (or run `mcp/smoke-test.mjs` pointed at the deployed URL) and confirm a tool that fans out into a self-call (e.g. `compute_chart`) succeeds without a 401 or a public-internet round trip.

### 8. Other Serverless-Incompatible Assumptions
- **`prisma/schema.prisma` `binaryTargets`:** add `rhel-openssl-3.0.x` alongside the existing `native` + `linux-musl-*` targets — Vercel's Node.js Serverless Functions run on glibc (Amazon Linux), not musl, and this is Prisma's own recommended insurance for Vercel deployments even when `native` generation should already match.
- **`lib/auth.ts` cookie security:** `useSecureCookies` is driven by `process.env.COOKIE_SECURE === 'true'` with no automatic derivation from `VERCEL`/HTTPS — set `COOKIE_SECURE=true` explicitly in Vercel env vars (see below) or sessions ship non-`Secure`.
- **`lib/rateLimit.ts`:** explicitly documented as in-memory/per-instance; Vercel's inherently multi-instance model makes this effectively inert, silently disabling brute-force protection on auth routes. Decide explicitly for this deployment: accept as a documented v1 risk, or move it to a DB-backed counter table (reusing the existing Postgres connection, no new infra) before shipping.
- **Node version pinning:** add `.nvmrc` and/or `engines.node` in `package.json`, and set the matching Vercel project Node version — `swisseph-v2` does a native `node-gyp rebuild` on install, so an unpinned version risks an ABI mismatch against cached `node_modules` across builds.
- **Pooler connection limit:** add `connection_limit=1` to `DATABASE_URL` alongside `?pgbouncer=true` (see Component 1) — each serverless invocation gets its own Prisma Client instance.

---

## Vercel & Supabase Environment Configuration

### Vercel Environment Variables
Set the following environment variables in the Vercel dashboard:
- `DATABASE_URL`: Transaction Connection Pooler URL from Supabase (e.g. `postgresql://postgres:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1`).
- `DIRECT_URL`: Direct Connection URL from Supabase (e.g. `postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`).
- `AUTH_SECRET`: Random hash (`openssl rand -base64 33`).
- `COOKIE_SECURE`: **Set to `true`.** Not derived automatically from `VERCEL`/HTTPS by `lib/auth.ts` — omitting this ships every session cookie without the `Secure` flag.
- `ANTHROPIC_API_KEY`: Anthropic credentials.
- `OPENAI_API_KEY`: (Optional) OpenAI credentials.
- `GOOGLE_AI_API_KEY`: (Optional) Google Gemini credentials.
- `RESEND_API_KEY`: Credentials for reset-password emails.
- `RESEND_FROM_EMAIL`: Verified sender address.
- `VEDICMOJO_INTERNAL_BASE_URL`: **Required for the MCP HTTP transport.** Set to this deployment's own origin (e.g. `https://vedicmojo.example.com` or the Vercel-assigned URL) so `/api/mcp`'s self-calls into `/api/*` stay inside the deployment instead of leaving and re-entering over the public internet.
- `VERCEL_AUTOMATION_BYPASS_SECRET`: **Required if Deployment Protection stays enabled** (the default on preview deployments) — without it, `/api/mcp`'s internal self-calls get a login-page 401 instead of the API response.
- `OAUTH_ISSUER_URL`: Required only if the MCP OAuth authorization server (`/oauth/authorize`, `/api/oauth/*`) is enabled for this deployment; must be a stable, externally-facing URL, not derived from request headers.
- `AUTH_TRUST_HOST`: Not required on Vercel (Auth.js's `trustHost` defaults true there); only needed for non-Vercel production hosts.

### Vercel Project Settings
- **Node.js Version:** pin to match a new `.nvmrc`/`engines.node` in `package.json`, to avoid an ABI mismatch on `swisseph-v2`'s native `node-gyp rebuild` against cached `node_modules` across builds.

### Vercel Build Command
Configure the Build Command in Vercel to:
```bash
npx prisma generate && npx prisma migrate deploy && next build
```
This ensures:
1. The Prisma Client is generated inside the Vercel builder.
2. The database schema migrations are applied automatically on every deploy.
3. The NextJS project compiles successfully.
