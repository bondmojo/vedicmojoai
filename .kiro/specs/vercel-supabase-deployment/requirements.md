# Requirements Document: Vercel & Supabase Deployment

## Introduction

This feature enables hosting VedicMojoAI on Vercel as a serverless Next.js application, with PostgreSQL hosted on Supabase. 

Currently, the application is run in environments with a persistent, writable local filesystem (Docker and local development), where HTML and Markdown report files are generated and stored at a local path defined by `REPORTS_DIR` (defaulting to `data/reports`).

When deploying to Vercel, the local filesystem is **read-only** (except for `/tmp` which is ephemeral and does not persist across invocations). Therefore, running the pipeline and saving reports to disk fails or results in data loss. 

To resolve this, we will migrate report storage to the PostgreSQL database on Supabase. Additionally, serverless architectures create high numbers of short-lived database connections, which can exhaust standard PostgreSQL connection limits. We will add connection pooling support using Supabase's pooler.

---

## Requirements

### Requirement 1 — Database-backed Report Storage
- The application MUST store the full generated HTML and Markdown report contents directly in the database.
- The `PipelineRun` model MUST be extended with two new text fields: `reportHtml` and `reportMarkdown`.
- Generating a report (both HTML and Markdown) MUST write the output directly to the database.

### Requirement 2 — Ephemeral Filesystem Fallback & Backward Compatibility
- When writing files to disk (local dev/Docker), filesystem write operations MUST be wrapped in safety blocks (e.g. try/catch) so they do not crash the pipeline if the filesystem is read-only (like Vercel).
- Reading report content via `/api/runs/[id]/report-content` MUST look up the content in the database first. 
- If the content is not found in the database (e.g. for legacy reports generated before this migration), the API MUST fall back to reading from disk.

### Requirement 3 — Database Connection Pooling
- The Prisma schema MUST support a connection pooler (`DATABASE_URL` via Supabase Connection Pooler) for standard queries.
- The Prisma schema MUST support a direct connection URL (`DIRECT_URL` via Supabase direct PostgreSQL URL) for running database migrations during deployment.

### Requirement 4 — Serverless Health Check Adaptation
- The `/api/health` endpoint checks if the reports directory on disk is writable. This check MUST be bypassed or marked as passing when running on Vercel (`process.env.VERCEL` is set), as write access to local disk is no longer required in serverless mode.

### Requirement 5 — Long-Running Pipeline Execution Must Survive the Serverless Response Lifecycle
- `POST /api/unified-charts/[id]/analyze` and `POST /api/duration-analysis` currently launch their pipelines **fire-and-forget** (not awaited) and return `202` immediately, relying on the Node process staying alive after the HTTP response is sent. That is true under Docker/local dev (a persistent server) but is **not guaranteed** under Vercel's per-invocation serverless model, where the function may be frozen/torn down shortly after the response is returned.
- The background pipeline execution (`executePipeline` in the analyze route, and the equivalent call in the duration-analysis route) MUST be kept alive past the response via `@vercel/functions`'s `waitUntil()` (a no-op wrapper outside Vercel, so Docker/local behavior is unaffected).
- **This is a bounded mitigation, not a guarantee** — `waitUntil()` only extends the invocation up to the route's `maxDuration` ceiling. Wave 4 alone is a strictly sequential 4X→4A→4B→4C chain, with 4C running a larger model at a high token budget (`prisma/seed.ts`); realistic worst-case pipeline runtime (waves 2–4 combined) can plausibly exceed even Vercel Pro's 800s (Fluid Compute) ceiling. A full queue/worker architecture would remove this ceiling entirely, but is explicitly **out of scope** for this spec given the app's actual scale (`lib/rateLimit.ts` documents "~10 reports/month, single-instance deployment") — the cost/complexity of a queue is not justified here.
- Given that, the route(s) MUST declare an explicit `maxDuration` sized as large as the target Vercel plan allows, AND runs that exceed the ceiling MUST be treated as an accepted, recoverable failure mode: they will be left in a non-terminal `status` (e.g. `running`) with no further progress. The existing `POST /api/runs/[id]/rerun` and `POST /api/runs/[id]/override` endpoints MUST be documented as the operator-facing recovery path for this case (not built new — they already exist).
- Progress polling (`GET /api/runs/[id]/events`, SSE) is a **separate invocation** from the POST that starts the run, with its **own independent `maxDuration` ceiling** — a run that legitimately takes longer than that ceiling will have its SSE connection cut server-side regardless of pipeline state. The route MUST also declare an explicit `maxDuration`, and the client MUST reconnect on stream end without duplicating already-reported events (the current in-memory `reportedAgents` dedup set in `app/api/runs/[id]/events/route.ts` resets on every reconnect/new invocation and MUST be replaced with dedup against data already reflected in the DB, not an in-memory set).

### Requirement 6 — Runtime-Read Assets Must Ship in the Deployment Bundle
- Vercel's build-time file tracer (`@vercel/nft`) only follows JS `require()` chains — it does not see arbitrary runtime directory reads (`fs.readdir`, native-addon internal file access) done through variables or string concatenation, so those assets can be silently dropped from the deployed bundle with no build-time warning, only a runtime failure. Two known cases MUST be covered:
  - **Swiss Ephemeris data:** `swisseph-v2`'s ephemeris directory, read via `swe_set_ephe_path()` in `engine/compute/transits.ts`. The native addon itself loads via a concatenated `require(__dirname + '/../build/Release/swisseph.node')` (`node_modules/swisseph-v2/lib/swisseph.js`), so the safe scope is the **whole package**, not just the `ephe/` subdirectory: `node_modules/swisseph-v2/**`.
  - **Prompt files:** `engine/llm.ts` reads every agent prompt from `prompts/**` via `path.join(process.cwd(), relative)` at runtime, and `app/api/knowledge/route.ts` + `app/api/knowledge/[type]/[name]/route.ts` do `fs.readdir()` on `prompts/domains` and `prompts/agents` directly. If untraced, this breaks **every one of the ~34 LLM agents** (not just chart compute) and the entire MCP Resources / `get_domain_knowledge` / `get_framework` / `list_knowledge` surface. This directory MUST be included alongside the ephemeris data — it is at least as severe a gap.
  - Both MUST be declared via `next.config.js`'s `experimental.outputFileTracingIncludes` (the config key lives under `experimental` in Next.js 14.2.x, the version this app is pinned to — it only moved to top-level in Next.js 15).
- Verification MUST NOT be "the request returns without an error" — with `SEFLG_SWIEPH` set and its data files missing, swisseph **silently degrades to the lower-precision Moshier ephemeris** instead of failing (see `engine/compute/transits.degreeSadeSati.test.ts`'s own note on this fallback), so a request can return a plausible-looking 200 with silently wrong longitudes. Verification MUST compare actual computed values against a known-correct local reference, and MUST also confirm at least one MCP knowledge-resource read (e.g. `get_framework`) succeeds against the deployed bundle.

### Requirement 8 — Serverless-Incompatible Assumptions Elsewhere in the App
- **Prisma native binary target:** `prisma/schema.prisma`'s `binaryTargets` currently lists only `native` plus two `linux-musl-*` targets (added for this app's Docker/Alpine deployment). Vercel's Node.js Serverless Functions run on a glibc-based Amazon Linux runtime, not musl. Relying solely on `native` (matching whatever OS runs `prisma generate` during the Vercel build) is Prisma's documented safe path when generate and runtime share an environment, but Prisma's own Vercel deployment guidance additionally recommends explicitly adding the matching `rhel-openssl-3.0.x` target as insurance against build-cache or platform drift. This MUST be added.
- **Auth cookie security:** `lib/auth.ts` derives `useSecureCookies` from `process.env.COOKIE_SECURE === 'true'` — it is **not** automatically derived from `process.env.VERCEL` or from the request being served over HTTPS (which Vercel always does). `COOKIE_SECURE=true` MUST be explicitly set as a Vercel environment variable, or every session cookie ships non-`Secure` in production.
- **In-memory auth rate limiter:** `lib/rateLimit.ts` is an explicitly-documented per-instance, in-memory sliding-window limiter ("does not survive a process restart and does not work across multiple instances"). Vercel serverless is inherently multi-instance (each invocation may land on a different, possibly cold, instance) — this limiter is effectively **inert** in that environment, silently disabling brute-force protection on login/signup/password-reset. This spec MUST either (a) explicitly accept this as a known, documented risk for v1 of the Vercel deployment, or (b) require moving it to a shared store (DB-backed counter table, reusing the existing Postgres connection rather than adding Redis/Upstash) before shipping. Silently shipping with it broken is not acceptable.
- **Node.js version pinning:** No `.nvmrc` or `package.json` `engines` field currently pins a Node version, while `swisseph-v2` runs a native `node-gyp rebuild` on install. An unpinned Node version risks an ABI mismatch against a cached `node_modules` between Vercel builds. A pinned Node version MUST be added (`.nvmrc` and/or `engines.node` in `package.json`, plus the matching Vercel project setting).
- **Connection pool sizing:** Requirement 3's pooler URL MUST also include `connection_limit=1` per the Prisma+PgBouncer transaction-mode guidance (in addition to `?pgbouncer=true`), since each serverless invocation gets its own Prisma Client instance. This app's `$transaction` calls (`app/api/oauth/token`, `app/api/auth/reset-password`, `app/api/unified-charts/[id]`, `app/api/account/mcp-token`, `app/api/runs/[id]/chat`) use Prisma's array form, which is compatible with transaction-mode pooling — confirm this remains true for any new `$transaction` usage added by this migration.

### Requirement 9 — MCP HTTP Transport (`POST /api/mcp`) Deployment Configuration
- `app/api/mcp/route.ts` is already Vercel-aware in code — it self-calls back into this same deployment's own `/api/*` routes using `VEDICMOJO_INTERNAL_BASE_URL` (falling back to the request's own public origin, which is slower and double-invokes) and forwards `VERCEL_AUTOMATION_BYPASS_SECRET` as `x-vercel-protection-bypass` when Deployment Protection is on. These defaults only work correctly if the corresponding environment variables are actually set on the Vercel deployment — this MUST be carried into deployment configuration, not left implicit:
  - `VEDICMOJO_INTERNAL_BASE_URL` MUST be set to this deployment's own origin so MCP tool self-calls stay inside the deployment instead of round-tripping over the public internet.
  - `VERCEL_AUTOMATION_BYPASS_SECRET` MUST be set on any environment where Deployment Protection stays enabled (the default for preview deployments) — without it, every MCP tool call's internal self-call gets answered with a login page (401) instead of the API response.
  - If the MCP OAuth authorization server is enabled for this deployment, `OAUTH_ISSUER_URL` MUST be set to a stable, externally-facing URL.
- Each external MCP tool call fans out into a second internal serverless invocation (the self-call into `/api/*`), each acquiring its own pooled DB connection. This fan-out MUST be accounted for when sizing the Supabase pooler connection limit (Requirement 3).
- `compute_chart` and other compute-backed MCP tools depend on the ephemeris files being bundled (Requirement 6) via their downstream `/api/compute*` self-calls.

---

## Non-Goals

- **External Object Storage (S3 / Supabase Storage):** To keep deployment simple, cost-efficient, and fast, we will store reports directly in database text fields instead of setting up external bucket storage.
- **NextJS Route Edge Runtime:** We will not convert API routes to the Edge runtime since Swiss Ephemeris (`swisseph-v2`) requires Node.js native bindings which are incompatible with the Edge runtime. All routes will run in the Node.js Serverless runtime.
