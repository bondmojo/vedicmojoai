# VedicMojoAI — Claude Desktop Guide

**Version:** 1.3
**Last updated:** 2026-08-06

This file orients Claude Desktop (and any AI assistant) working on VedicMojoAI. It
mirrors the guidance in `Agents.md` and the Kiro AI Skills (`.kiro/skills/`) so the
project has full context outside the Kiro IDE.

---

## What this project is

VedicMojoAI is a **multi-user** web app (as of the `user-management` feature — real
accounts, per-user chart ownership; still no OAuth/social login) that computes Vedic
astrology charts and runs a multi-wave LLM analysis pipeline over them, producing
interactive HTML reports. It is one **Next.js 14 (App Router, TypeScript)** monorepo —
UI, API routes, the deterministic compute engine, the LLM pipeline, and the report
renderer all live in one project and one deployment.

### Five practitioner-facing features

1. **Generate Chart** — deterministic Swiss Ephemeris computation. Two ingestion
   paths land in one `UnifiedChart` store:
   - `POST /api/unified-charts/from-compute` — from birth data (Path A)
   - `POST /api/unified-charts/from-paste` — from a `ChartInputV1` JSON (Path B)
2. **AI Analysis** — the 4-wave LLM pipeline, launched with
   `POST /api/unified-charts/[id]/analyze`. Compute-path charts **skip LLM Wave 1**
   because their foundation data is already computed deterministically.
3. **Reporting** — Wave 4 synthesis JSON is rendered to an HTML report
   (`engine/renderer.ts`), stored on disk, and served via the report viewer at
   `/runs/[id]/report` (data fetched from `GET /api/runs/[id]` +
   `GET /api/runs/[id]/report-content`; the list of completed reports comes from
   `GET /api/reports`).
4. **Duration Analysis** — a separate 3-agent sequential pipeline
   (`engine/durationAnalysis/`): user picks a date range + life domain (health,
   career, wealth, marriage, property, cashflow); the dasha tree is sliced and a
   registry-selected domain agent (DA1-*) analyses each period, with an optional
   symptom-validation gate (DA-2) and a forecast + chat agent (DA-3). Entry:
   `POST /api/duration-analysis`. Domain knowledge lives in `prompts/domains/`
   (shared with Wave 2 via `{{include:}}`); see `skills/backend/duration-analysis.md`.

   A sibling, purely deterministic UI — **Duration Analyser** (`/duration-computation`)
   — sits on top of the same Step 0a–0d compute-first layer with no LLM call: pick a
   chart, drill into a dasha period (MD → AD → PD), and pick an analysis type (Career,
   Health, Money, Family) to see every computed chart for that window — divisional
   charts, planets, nakshatras, upagrahas, balas, Ashtakavarga. Each period also gets a
   deterministic **driver digest** (`engine/durationAnalysis/periodInsights.ts`) that
   selects + labels the drishti / control / nakshatra / argala the raw payload already
   carries — the no-LLM tab's stand-in for the interpretation the MCP path leaves to
   Claude Desktop. Entry: `POST /api/timeline` (`includeCategoryData:true`) — the same
   backbone the MCP server exposes to Claude Desktop. `family` is a UI-only domain
   registered in `DOMAIN_AGENT_REGISTRY`/`DOMAIN_SCORING_WEIGHTS` for this path only; it
   has no prompt file and is not reachable from `/api/duration-analysis`. See
   `docs/duration-analyser.md` for the MCP-vs-UI exposure model.

5. **Marriage Matchmaking** (`.kiro/specs/marriage-matchmaking/`) — a pure,
   never-throwing Ashtakoota (Guna Milan, 36-point) + Mangal Dosha (Kuja Dosha)
   compatibility engine (`engine/compute/matchmaking.ts` +
   `matchmakingTables.ts`) scoring a bride/groom pair of saved `UnifiedChart`s.
   No ephemeris, LLM, network, DB, or file I/O — the score is derived from
   each chart's Moon nakshatra/pada alone (Mangal Dosha additionally needs
   Mars/lagna/aspect data, so it degrades to `unavailable`, never `matched`,
   on a paste-source chart). Entry: `POST /api/matchmaking` (persists a
   `CompatibilityMatch`), `POST /api/matchmaking/preview` (identical, no
   persistence — the only variant the MCP `compute_match` tool may call), UI
   at `/matchmaking` (picker + saved-match list) and `/matchmaking/[id]`
   (result). Role is encoded structurally (`brideChartId`/`groomChartId`
   field names / Prisma relations — never inferred from
   `UnifiedChart.gender`, which is an informational picker label only). See
   `docs/computation_matchmaking.md` for the full koota rules, provenance,
   and PyJHora oracle-verification methodology.

The home page (`/`, the Chart Compute UI) renders a computed chart across **10 tabs**:
Summary · Grahas · Divisional Charts · Ashtakavarga · Yogas · Dasha (Vimshottari) ·
Chara Dasha · Transits · Pinda Strength · Varshaphal. It was 11 until the
`chart-ui-enhancements` spec merged Planets + Nakshatras + Karakas into one **Grahas**
tab (`app/components/GrahasTable.tsx`; `KarakaTable.tsx` deleted, `PlanetTable.tsx` and
`NakshatraTable.tsx` kept because `DurationComputationResults` still embeds them) and
added a **Yogas** tab after Ashtakavarga rendering the deterministic `chart.yogas`
catalogue.

Alongside these, the home page also offers
**Varshaphal** (Tajika annual solar-return chart) as an on-demand, stateless
tool: `POST /api/compute/varshaphal`
→ `engine/compute/varshaphal.ts` computes the Varsha Pravesh (solar return), the
annual chart (reusing `computeFullChart`, so the annual Shadbala uses the same
engine as natal), the Muntha, Panchavargeeya Bala, and the Varshesha (year lord).

> An **AI report chat** feature is specified in `.kiro/specs/report-ai-chat` but is
> not implemented yet (no routes/tables). Do not assume it exists.

### User Management (`.kiro/specs/user-management/`)

A cross-cutting layer, not one of the five practitioner-facing features above:
real accounts (signup/login/logout/forgot-password), `UnifiedChart` (and
everything hung off it, including `CompatibilityMatch`) owned per-user, and
per-user MCP tokens.

- **Auth.js (NextAuth v5)** + `@auth/prisma-adapter`, **database-backed
  sessions**. Credential verification is fully custom
  (`app/api/auth/{signup,login,logout,forgot-password,reset-password}`) —
  Auth.js's own `signIn()`/`signOut()` are never called. Why: `@auth/core`'s
  config assertion hard-errors on "Credentials provider + database session
  strategy" as a config shape (regardless of whether `signIn()` is ever
  invoked), so `lib/auth.ts` registers `providers: []` and creates/deletes
  `Session` rows directly via the adapter instead. See `lib/auth.ts`'s file
  header before touching this.
- **`resolveRequestUser(request)`** (`lib/auth.ts`) is the one function every
  route calls to identify a caller: session cookie first, then a per-user
  `McpApiToken` via `lib/mcpAuth.ts`'s `resolveMcpUser` (replaces the old
  shared-secret `requireMcpToken`). Ownership mismatch → **404, never 403**.
- **`middleware.ts`** gates UI page routes on session-cookie presence only
  (edge-safe); the real check is always the per-route `resolveRequestUser`.
- **MCP tokens** are generated by a logged-in user from `/account`
  (`POST /api/account/mcp-token`, reveal-once, one active token per user) —
  not something the MCP process itself calls, so `mcp/src/*` needed zero
  changes; only what the `x-mcp-token` string resolves to changed.
- **MCP OAuth authorization server** (`app/.well-known/**`,
  `app/oauth/authorize`, `app/api/oauth/*`) — a second, additional way to
  get a token for `POST /api/mcp`, alongside the manual flow above (which is
  unaffected). Lets an OAuth-aware client (e.g. claude.ai's "Add custom
  connector") redirect the user through login + consent instead of
  copy-pasting a token. `lib/mcpAuth.ts`'s `resolveMcpUser` resolves either
  token type (an OAuth-issued access token carries a `mcp_oat_` prefix).
  Requires `OAUTH_ISSUER_URL`. See "MCP server" below.
- Details: `docs/ERD.md` §User Management / §MCP OAuth Authorization Server,
  `docs/HLD.md` §3.9 / §3.10, `docs/DFD.md` §P11-OAuth / §P12.

---

## Architecture at a glance

```
Browser (Next.js UI)         Claude Desktop            Remote MCP client
  → Next.js API routes  ◄─HTTP── MCP server (mcp/,   ◄─HTTPS── POST /api/mcp
    (/app/api)                    stdio, no LLM)               (in-app, no LLM)
    → Engine (/engine): compute (deterministic) + pipeline (LLM) + renderer
      → LLM providers (Anthropic / OpenAI via Vercel AI SDK)
  → PostgreSQL (Prisma) + HTML reports on disk
```

### MCP server (`mcp/` + `app/api/mcp/route.ts`) — dual transport, $0 API

Exposes the deterministic engine (Tools), the domain rubrics (Resources), and
ready-to-run analysis workflows (Prompts) so the *reasoning* is billed to the
caller's own Claude subscription, not this app's API budget. **Deliberately
never calls the paid pipelines** (`analyze`, `duration-analysis` POST) —
enforced by `tests/mcp-cost-guard.test.ts`, which statically scans
`mcp/src/*.ts` regardless of transport. Backed by two new read-only, no-LLM
routes: `POST /api/timeline` (deterministic period scoring) and
`GET /api/knowledge/**` (rubrics). Auth is a per-user `McpApiToken` (see User
Management above) — each practitioner generates their own token from
`/account`.

Two transports, same `mcp/src/{tools,resources,prompts,chart}.ts` code (the
API client is threaded through as a parameter, not imported as a singleton,
so the exact same code is safe to reuse per-request):

- **stdio** (`mcp/`) — a separate Node process Claude Desktop spawns locally.
- **Streamable HTTP** (`POST /api/mcp`) — a normal Route Handler in this same
  Next.js app, reachable by remote MCP clients on the same Vercel deployment.
  Stateless (fresh `McpServer` per request via `mcp/src/registerAll.ts`'s
  `createMcpServer`); auth comes from the request's own `Authorization:
  Bearer` header (or `x-mcp-token`), not a process-env token. Internally it's
  still a thin HTTP client — each tool call `fetch()`es back into this same
  deployment's own `/api/*` routes.

Getting a bearer token for the HTTP transport: manually from `/account` (see
above), or via the **MCP OAuth 2.1 authorization server**
(`app/.well-known/oauth-{authorization-server,protected-resource}`,
`app/api/oauth/{register,token,revoke}`, `app/oauth/authorize` +
`app/api/oauth/authorize-decision`) — RFC 8414/9728 discovery (surfaced via a
`WWW-Authenticate` header on `/api/mcp`'s 401), RFC 7591 dynamic client
registration (public/PKCE-only clients), an authorization-code + PKCE
(`S256`-only) grant with a real login/consent screen, and refresh-token
rotation. Hand-rolled Next.js Route Handlers, not the SDK's Express-only
`server/auth/*` toolkit (incompatible with this app's serverless design) —
though its framework-agnostic Zod schemas (`shared/auth.js`) are reused for
response shapes. New tables: `OAuthClient`, `OAuthAuthorizationCode`,
`OAuthAccessToken`, `OAuthRefreshToken` (docs/ERD.md). Requires
`OAUTH_ISSUER_URL`.

Details: `mcp/README.md`, HLD §3.9, DFD P11 / P11-HTTP / P11-OAuth.

### The AI pipeline (LLM path)

```
Pre-analysis (deterministic) → Wave 1 (parallel 1A–1D)
→ Wave 2 (parallel, planner-selected 2A–2G) → Wave 3 (parallel 3A–3D)
→ Wave 4 (sequential 4X → 4A → HALT GATE → 4B → 4C) → HTML report
```

- Waves 2–3 run planner-selected agents in parallel; Wave 4 is strictly sequential.
- A **critical-error halt gate** sits between 4A and 4B: if 4A reports critical
  errors the run halts (`status="halted_for_review"`) with override/rerun/cancel.
- Follow-up queries skip Wave 1 (cached) and add a verification agent.
- Full agent catalogue, routing, and model tiers are in `Agents.md`.

### Deterministic Wave 1 (compute path)

For `UnifiedChart` with `source="compute"`, the analyze route strips Wave 1 agents
and builds `wave1_delta` from deterministic domain data. The modules that replace
the LLM foundation agents (especially **1C Shadbala** and **1D Relationship
Geometry**) live in `engine/compute/`:
`shadbala.ts`, `relationships.ts`, `nakshatraRelationships.ts`, `jaimini.ts`,
`bhavaBala.ts` (plus `D2`, `D3`, `D12` in `divisional.ts`).

> **Named-yoga catalogue:** `engine/compute/yogas.ts` deterministically computes a
> chart-wide `Yoga[]` catalogue (Pancha Mahapurusha, Raja incl. `raja.dka`, Dhana,
> Viparita, Neechabhanga, lunar, Gaja Kesari, Budha-Aditya, Parivartana, Kartari)
> from `relationships` + `dignity.ts`. It rides in `wave1_delta` under `1D` so Wave
> 2A validates/interprets it instead of re-deriving formation, feeds the
> Duration-Analysis slicer, and is exposed via the `get_yogas` MCP tool. Stored as
> `UnifiedChart.yogas` (null on paste path). See `.kiro/specs/named-yoga-engine/`.

> **Chara Dasha (Jaimini rasi dasha):** `engine/compute/charaDasha.ts`
> (`computeCharaDasha`, KN Rao/Parashara method) is an on-demand sibling of the
> Vimshottari tree — returned by `POST /api/compute` as `charaDasha`, shown in the
> `/compute` "Chara Dasha" tab + Copy-for-AI, and exposed to Claude Desktop via the
> MCP `get_chara_dasha` tool and the `chara_dasha` knowledge framework. Not
> persisted to `UnifiedChart` (recomputed from `birthInput` on demand). See
> `docs/computation_chara_dasha.md`.

> **Degree-aware moolatrikona:** `engine/compute/dignity.ts` adds
> `MOOLATRIKONA_RANGES` — the classical `[fromDeg, toDeg)` span inside the
> moolatrikona sign — plus an **optional trailing** `degreeInSign` parameter on
> `getVargaDignityLabel`. With a usable degree, a placement in the moolatrikona
> sign but outside the span now labels `own`; omit the degree and the whole-sign
> rule is unchanged. Only callers that genuinely hold a degree pass one (D1 in
> `divisional.ts`, `yogas.ts`, `durationAnalysis/scoring.ts`); D2–D60 keep the
> sign rule because this engine computes a varga *sign*, never a varga longitude,
> and `shadbala.ts` / `varshaphal.ts` deliberately stay sign-only. The module also
> exposes `getVargaDignityReason()`, returning the one-sentence explanation the
> Summary tab's dignity chips display.

> **Degree-based Sade Sati:** `engine/compute/transits.ts` adds
> `computeDegreeSadeSati()` — Saturn within ±45° of the natal Moon's longitude,
> one contiguous period per passage with no rising/peak/setting phase — surfaced
> as the optional sibling `TransitAnalysis.sadeSatiByDegree`, beside (never inside)
> the existing sign-based `sadeSati`. Retrograde fragments within **138 days** are
> merged (the degree scan's own threshold — smaller than the sign scan's 240 d,
> calibrated against PVR's reference output). `computeTransits` gained an optional
> trailing `natalMoonLongitude`, passed by `computeFullChart` but deliberately not
> by `durationAnalysis/transitOverlay.ts`. Same fix on both readings: `isCurrent`
> now comes from the `asOfDate` the transit block reports rather than a wall-clock
> `new Date()`, which disagreed with `sadeSati.active` for historical dates. The UI
> renders both readings in `app/components/SadeSatiPanel.tsx`. See
> `docs/computation_transits_sadesati.md`.

> **Marriage Matchmaking engine:** `engine/compute/matchmaking.ts` +
> `matchmakingTables.ts` — pure, never-throwing Ashtakoota + Mangal Dosha
> scoring, completely separate from the wave pipeline and Duration Analysis.
> `computeAshtakootaMatch` runs 8 kootas in fixed order (Varna→Nadi), each
> wrapped so one scorer error doesn't kill the rest (mirrors `yogas.ts`'s
> per-detector guard); `computeMangalDosha` checks Mars against lagna/Moon/
> Venus. Static tables (nakshatra/rashi attributes, 5 scoring matrices) were
> hand-transcribed from classical sources then verified against a local,
> never-vendored PyJHora oracle sweep (`scripts/oracle/`, AGPL-isolated —
> see `docs/computation_matchmaking.md`'s KNOWN DIVERGENCE table for what was
> and wasn't adopted from that sweep). `MATCHMAKING_TABLES_VERSION` is
> stamped onto every persisted `CompatibilityMatch.result`.

---

## Key directories

```
app/            Next.js App Router (pages + /api routes)
  compute/        Generate Chart UI + chart visualization components
  unified-charts/ Unified chart list, detail, and AI Analysis launcher
  matchmaking/    Marriage Matchmaking — bride/groom picker + saved-match list + result view
  runs/[id]/      Run progress (SSE) + report viewer
  login/ signup/ forgot-password/ reset-password/  Auth pages (User Management)
  account/        Account settings — logout, MCP token generate/revoke
  oauth/authorize/  MCP OAuth consent screen (Server Component)
  .well-known/    RFC 8414/9728 OAuth discovery metadata routes
  api/            Route handlers (auth, account, charts, compute, unified-charts, matchmaking, runs, reports, health, mcp, oauth)
engine/         Pipeline + deterministic compute
  compute/        Swiss Ephemeris modules (pure functions, no DB)
  waves/          wave1–wave4 utilities
  orchestrator.ts planner.ts llm.ts pre_analysis.ts computeVimshottari.ts renderer.ts
lib/            db.ts, validation.ts, errors.ts, types.ts, chart-mapper.ts,
                auth.ts, mcpAuth.ts, oauth.ts, passwords.ts, email.ts, rateLimit.ts
middleware.ts   Session-cookie presence gate on UI page routes (User Management)
prisma/         schema.prisma, migrations, seed.ts, backfill-owner.ts, backfill-gender.ts
prompts/agents/ LLM prompt files (read at runtime, never modified by the app)
mcp/            MCP server (separate stdio process; thin HTTP client, no LLM) — see mcp/README.md
docs/           ERD.md, HLD.md, DFD.md, computation_*.md, USER_STORIES
.kiro/skills/   AI Skills (implementation conventions)
.kiro/specs/    Feature specs (requirements/design)
```

---

## Data model highlights

- **`UnifiedChart`** is the canonical chart store: one JSONB column per domain
  (`planets`, `nakshatras`, `divisionalCharts`, `shadbala`, `relationships`,
  `jaimini`, `bhavaBala`, `ashtakavarga`, `transits`, `dashaTree`, `yogas`, …), plus
  scalar index fields and `chartInputV1`. `source` is `compute` or `paste`. Dedup on
  `chartHash` (SHA-256).
- **`PipelineRun`** keeps a required legacy `chartId` (`Chart` FK) and a nullable
  `unifiedChartId` (`UnifiedChart` FK). AI Analysis from a unified chart ensures a
  matching `Chart` exists by `chartHash`, then sets both.
- **All chart CRUD goes through `UnifiedChart`** — the compute page's Save/Load/
  Delete, renames (`PATCH /api/unified-charts/[id]`), and every pipeline read.
  `SavedChart` is legacy/read-only (promote old rows: `npm run db:migrate-saved`).
- Other tables: `Chart` (legacy immutable input), `SavedChart` (legacy computed
  store), `Wave1Cache`, `WaveOutput`, `RunMessage`, `ModelConfig`.
- **User Management (v1.3):** `User`, `Session`, `PasswordResetToken`,
  `McpApiToken`, plus `Account`/`VerificationToken` (Auth.js adapter shape,
  unused — no OAuth providers). `UnifiedChart.userId` is a required FK.
- **`CompatibilityMatch`** (Marriage Matchmaking): `brideChartId`/
  `groomChartId` FKs to `UnifiedChart` via two named relations
  (`MatchBride`/`MatchGroom`) — the role encoding. `gunaScore` (`Decimal(4,1)`,
  never rounded) and `verdict` are denormalized off the persisted `result`
  JSONB so the list route doesn't need to fetch the full snapshot.
  `UnifiedChart` also gains a `gender` column (informational picker hint
  only). Deleting a `UnifiedChart` cascades dependent `CompatibilityMatch`
  rows first (no automatic Prisma cascade).
- Format conversion is centralized in `lib/chart-mapper.ts`.
- Full details: `docs/ERD.md`.

---

## Commands

```bash
npm run dev          # Next.js dev server (run manually; long-running)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint (.ts/.tsx)
npm run test         # Vitest (use `npx vitest run` for a single pass)
npm run db:migrate   # prisma migrate dev
npm run db:push      # prisma db push
npm run db:seed      # seed model_config defaults (prisma/seed.ts)
npm run db:backfill-owner  # assign every unowned UnifiedChart to one User (-- <email>)
npm run db:backfill-gender # populate UnifiedChart.gender from chartInputV1.meta.gender (idempotent)
npm run db:studio    # Prisma Studio
npm run docker:up    # docker-compose up -d (Postgres + app)
npm run docker:down  # docker-compose down

# MCP server (separate package under mcp/)
cd mcp && npm install         # first time
cd mcp && npm run build       # → dist/server.js (point Claude Desktop here)
cd mcp && node smoke-test.mjs # live wiring check (app must be running)
```

Environment: copy `.env.example` to `.env`. Requires `DATABASE_URL`, `DIRECT_URL`
(same value as `DATABASE_URL` locally — see below), `AUTH_SECRET`
(`npx auth secret`), and provider API keys (Anthropic / OpenAI). `RESEND_API_KEY` +
`RESEND_FROM_EMAIL` are needed for password-reset emails. Models/providers are
resolved at runtime from the `model_config` table, so provider swaps need no code
change. The MCP server reads `VEDICMOJO_BASE_URL` (default `http://localhost:3000`)
and `MCP_TOKEN` — now a **per-user token** generated from `/account`, not a shared
secret (see mcp/README.md). `MCP_DEV_USER_EMAIL` is an optional non-production-only
dev fallback when no `x-mcp-token` is sent at all. `OAUTH_ISSUER_URL` is required
for the MCP OAuth authorization server (`app/oauth/authorize`, `app/api/oauth/*`)
to function — a stable, externally-facing URL, distinct from the internal-only
`VEDICMOJO_INTERNAL_BASE_URL`; without it, that path 404s but the manual
`MCP_TOKEN`/`McpApiToken` flow is unaffected. Node version is pinned via
`.nvmrc`/`package.json` `engines.node` (20.x) — `swisseph-v2` compiles a native
addon on install, so an unpinned Node version risks an ABI mismatch on a cached
`node_modules`.

**Vercel & Supabase deployment** (`.kiro/specs/vercel-supabase-deployment/`): a
third deployment target alongside local dev and GCP Cloud Run (see
`docs/HLD.md` §8.5). `DATABASE_URL` points at Supabase's connection pooler
(`?pgbouncer=true&connection_limit=1`); `DIRECT_URL` is the unpooled
connection used only for `prisma migrate deploy`. Reports are stored in
`PipelineRun.reportHtml`/`reportMarkdown` (DB is the source of truth; disk
writes in `engine/renderer.ts` are now best-effort, since Vercel's
filesystem is read-only). The AI Analysis and Duration Analysis pipelines
are kept alive past their `202` response via `waitUntil()`, bounded by an
explicit `maxDuration` — not a guarantee for pipelines that run longer than
that ceiling. `COOKIE_SECURE=true` must be set explicitly on Vercel (not
auto-derived). The `build` script runs `prisma generate` before `next build`
so Vercel's dependency cache cannot retain a Prisma Client that predates a
schema or binary-target change. See the spec folder for the full
requirements/design/tasks.

---

## Conventions

- **TypeScript everywhere.** No raw SQL — use Prisma. No provider SDK imports outside
  `engine/llm.ts` — all model calls go through `callLLM()`.
- **Server Components by default;** Client Components only for SSE, forms, and
  real-time UI. Tailwind for styling (dark theme).
- **Compute modules are pure functions** — no DB, no side effects.
- **Long-running operations return `202` immediately;** progress streams over SSE at
  `/api/runs/[id]/events`.
- **Prompt files** in `prompts/agents/*.md` are read at runtime and never modified by
  the app.
- Deeper conventions live in `.kiro/skills/`:
  `coding-standards.md`, `nextjs-project-structure.md`, `engine-pipeline.md`,
  `database-prisma.md`, `docker-deployment.md`, `ai-frontend.md`, `ai-backend.md`.

---

## Documentation maintenance (IMPORTANT)

When you change the project, update the relevant docs **in the same change** so they
never drift from the code:

| Change | Update |
|---|---|
| DB table/column/index/relation/ingestion path | `docs/ERD.md` |
| Architecture, components, routes, pages, engine layout | `docs/HLD.md` |
| Processes, data stores, data flows | `docs/DFD.md` |
| Agents, waves, routing, model tiers, execution order | `Agents.md` |
| Implementation conventions, files, routes, tables, patterns | `.kiro/skills/*.md` |
| Any of the above | this `Claude.md` |

Keep all five feature areas — Generate Chart, AI Analysis, Reporting, Duration
Analysis, Marriage Matchmaking — accurately described across all of these documents.
