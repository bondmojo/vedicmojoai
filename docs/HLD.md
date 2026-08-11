# VedicMojoAI — High Level Design (HLD)

**Version:** 1.9
**Last updated:** 2026-08-07
**Status:** Draft

> **Maintenance rule:** Any change to architecture, data flow, routes, pages, or the
> engine must be reflected here **and** in the AI Skills (`.kiro/skills/`), ERD, and DFD
> in the same change. See `Agents.md → Documentation Maintenance`.

## What changed in v1.9

- Added **Vercel & Supabase Deployment** as a third deployment target
  (`.kiro/specs/vercel-supabase-deployment/`), alongside local dev and GCP
  Cloud Run — see new §8.5. Report storage moved from disk-only to
  database-backed (`PipelineRun.reportHtml`/`reportMarkdown`, §3.3), the AI
  Analysis and Duration Analysis pipelines are now kept alive past their
  `202` response via `waitUntil()` (bounded by an explicit `maxDuration`,
  not a guarantee — see §8.5), Prisma gained a pooled/direct connection
  split, `next.config.mjs` now force-includes `swisseph-v2` and `prompts/`
  into the serverless bundle, and `/api/health`'s reports-directory check is
  bypassed under `process.env.VERCEL`.

## What changed in v1.8

- Added **Marriage Matchmaking** (`.kiro/specs/marriage-matchmaking/`) — a
  fifth practitioner-facing feature. Pure, never-throwing Ashtakoota (Guna
  Milan, 36-point) + Mangal Dosha (Kuja Dosha) engine
  (`engine/compute/matchmaking.ts` + `matchmakingTables.ts`), reachable via
  `POST /api/matchmaking` (persists), `POST /api/matchmaking/preview`
  (read-only, the only one the MCP tool may call), `GET`/`DELETE
  /api/matchmaking[/id]`, and the UI at `/matchmaking` + `/matchmaking/[id]`.
  New MCP tool `compute_match` (§3.9). See §8.4 and `docs/computation_matchmaking.md`.
- `UnifiedChart` gains a `gender` column (informational picker hint only —
  never used to infer a bride/groom role) and `lib/chart-mapper.ts`'s
  `buildChartInputV1FromUnified` now prefers it over the pre-existing
  `chartInputV1.meta.gender` fallback before Wave 2G's/`getValidationWarnings`'s
  last-resort `'male'` default (fixes a latent Wave 2G defaulting bug
  predating this feature).
- `DELETE /api/unified-charts/[id]` gained a `compatibilityMatch.deleteMany`
  step in its cascade transaction (regression prevention — a
  `CompatibilityMatch` FK without this fix would reintroduce an FK-violation-
  as-500 on chart delete).
- `middleware.ts`'s route matcher gained `/matchmaking/:path*`.

## What changed in v1.7

- Added an **MCP OAuth 2.1 authorization server** — a second, additional way
  to obtain a token for `POST /api/mcp`, alongside the existing manual
  `McpApiToken` generate-and-paste flow at `/account` (unchanged). Lets an
  OAuth-aware remote client (e.g. claude.ai's "Add custom connector") get a
  token by redirecting the user through login + a consent screen, with no
  manual copy-pasting. See §3.9.
- New routes: `GET /.well-known/oauth-authorization-server` (RFC 8414),
  `GET /.well-known/oauth-protected-resource(/api/mcp)?` (RFC 9728),
  `POST /api/oauth/register` (RFC 7591 dynamic client registration),
  `GET /oauth/authorize` (login/consent UI), `POST /api/oauth/authorize-decision`,
  `POST /api/oauth/token` (authorization_code + refresh_token grants, PKCE
  S256 only), `POST /api/oauth/revoke` (RFC 7009).
- New Prisma models: `OAuthClient`, `OAuthAuthorizationCode`,
  `OAuthAccessToken`, `OAuthRefreshToken` — see `docs/ERD.md`.
- `lib/mcpAuth.ts`'s `resolveMcpUser` now also resolves OAuth-issued access
  tokens (distinguished by a `mcp_oat_` prefix) alongside `McpApiToken`, and
  `app/api/mcp/route.ts`'s no-token 401 gained a `WWW-Authenticate` header
  pointing at the protected-resource metadata — the discovery breadcrumb an
  OAuth-aware client reads before attempting the handshake.
- `middleware.ts` bug fix: the redirect-to-login now preserves the full query
  string (`request.nextUrl.search`), not just the pathname — needed so
  `/oauth/authorize`'s params survive a login round-trip; generically
  correct for any guarded page.
- New env var `OAUTH_ISSUER_URL` (stable, externally-facing — distinct from
  the internal-only `VEDICMOJO_INTERNAL_BASE_URL`).

## What changed in v1.6

- Added a second MCP transport: `POST /api/mcp` (Next.js Route Handler,
  `@modelcontextprotocol/sdk`'s `WebStandardStreamableHTTPServerTransport`) —
  the same tool/resource/prompt surface as the stdio server, reachable by
  remote MCP clients on this app's own Vercel deployment. Stateless,
  auth via `Authorization: Bearer <token>` per request (falls back to
  `x-mcp-token`). See §3.9.
- `mcp/src/http.ts`'s module-level `api` singleton became
  `createApiClient(token?, baseUrl?)`; `registerTools`/`registerResources`/
  `registerPrompts` (and `resolveChart`/`resolveCharaDasha`/`loadRubric`) now
  take the client as a parameter instead of importing it — required so one
  running HTTP endpoint can serve many users concurrently, each with their
  own token. `mcp/src/registerAll.ts` (new) is the shared factory both
  entry points call.
- Root `package.json` gained `@modelcontextprotocol/sdk` as a direct
  dependency (previously only `mcp/package.json` had it), and
  `next.config.mjs` gained a `webpack.resolve.extensionAlias` for `.js` →
  `.ts` so Next.js's bundler can follow `mcp/src/*.ts`'s NodeNext-style
  relative imports when `app/api/mcp/route.ts` pulls them in.

## What changed in v1.5

- Added **User Management** (`.kiro/specs/user-management/`): real accounts
  (signup/login/logout/forgot-password), `UnifiedChart` (and everything hung
  off it — runs, reports, Duration Analysis) is now owned per-user, and the
  MCP server authenticates as a specific user instead of a shared secret.
- **Auth.js (NextAuth v5)** + `@auth/prisma-adapter`, database-backed sessions.
  Credential verification is fully custom (`app/api/auth/{signup,login,logout,
  forgot-password,reset-password}`) — Auth.js's own `signIn()`/`signOut()` are
  never called; see `lib/auth.ts`'s file header for why (`@auth/core` hard-
  errors on "Credentials provider + database session strategy" as a config,
  regardless of whether `signIn()` is ever invoked with it — so no Credentials
  provider is registered at all, `providers: []`).
- New `middleware.ts` — gates UI page routes (`/`, `/compute/**`,
  `/unified-charts/**`, `/runs/**`, `/duration-analysis/**`,
  `/duration-computation/**`, `/account/**`, `/reports/**`) on session-cookie
  *presence* only (cheap, edge-safe, no DB hit); the real session-validity and
  ownership check happens per-route via `lib/auth.ts`'s `resolveRequestUser`.
- `lib/mcpAuth.ts`'s `requireMcpToken` (shared `MCP_TOKEN` secret, open when
  unset) is replaced by `resolveMcpUser` — resolves a per-user `McpApiToken`
  hash to a `userId`. `resolveRequestUser` tries the session cookie first,
  then falls back to `resolveMcpUser`, so every route's ownership check is
  written once and works for both browser and MCP callers.
- New `lib/rateLimit.ts` — minimal in-memory sliding-window limiter on the
  auth routes (stated limitation: doesn't survive a restart or work across
  multiple instances — fine at this app's single-instance scale).
- See §3.10 (new) and DFD's auth-layer notes for the request path, and
  ERD v1.3 for the six new tables.

## What changed in v1.1

The system now organizes around three practitioner-facing features.
(See full details in v1.1 below.)

## What changed in v1.4

- Added the **VedicMojo MCP server** (`mcp/`) — a separate, read-only stdio process
  that lets Claude Desktop act as the astrologer at **$0 API cost**. It exposes the
  deterministic engine (Tools), the domain rubrics (Resources), and ready-to-run
  analysis workflows (Prompts), and **never invokes the paid LLM pipelines**. It is a
  thin HTTP client of the existing Next.js app. See §3.9 and DFD P11.
- New **read-only, no-LLM** API routes backing the MCP:
  - `POST /api/timeline` — deterministic dasha-period slice + transit overlay +
    0–100 scoring + peaks (the Duration Analysis pre-steps, minus the LLM).
  - `GET /api/knowledge` and `GET /api/knowledge/{domains|frameworks}/{name}` —
    the prompt rubrics, `{{include:}}`-expanded, allow-listed.
- New helper `lib/mcpAuth.ts` — optional `MCP_TOKEN` shared-secret guard on the new
  routes. New guard test `tests/mcp-cost-guard.test.ts` proves the MCP never POSTs a
  paid route.

## What changed in v1.2

- Added **Duration Analysis** — a fourth practitioner-facing feature: a focused
  3-agent sequential pipeline (DA-1 → DA-2 (conditional) → DA-3) that answers
  period-specific questions over a user-selected date range and life domain. Completely
  separate from the 18-agent wave pipeline.
- New engine directory: `engine/durationAnalysis/` (slicer, transitOverlay, registry,
  extractor, agentJson, index/orchestrator).
- New API routes: `POST + GET /api/duration-analysis` (create + history list),
  `GET /api/duration-analysis/[id]`, `GET /api/duration-analysis/[id]/events`,
  `POST /api/duration-analysis/[id]/chat`, `POST /api/duration-analysis/[id]/override`,
  `POST /api/duration-analysis/[id]/cancel`.
- New UI pages: `/duration-analysis` (form + run history) and `/duration-analysis/[id]`
  (results + live SSE + follow-up chat).
- **Durability:** stale-run reaper (`engine/durationAnalysis/reaper.ts`) marks
  queued/running rows with no heartbeat for 10 min as failed on every read path;
  the DA-1 batch loop persists totals per batch as the heartbeat. Cancellation is
  cooperative: `/cancel` sets `status=cancelled` and the pipeline unwinds at its
  next checkpoint.
- **Prompt caching:** `callLLM({ cachedPrefix })` marks a stable prefix with
  Anthropic `cache_control` — used by DA-1 batches (shared chart data) and DA-3
  chat follow-ups (chart data + DA-1 + DA-2 sections).
- New DB tables: `duration_analysis`, `duration_message` (see ERD v1.2).
- **Full PD storage:** `computeVimshottari` now computes Pratyantardashas for all 9
  Mahadashas (729 entries). `AntarDasha.pratyantardashas` is now a required field.
- New prompt files: per-domain `duration_da1_<category>.md` (composed from
  `prompts/domains/<category>.md` fragments + the `duration_da1_domain_analyser.md`
  core via `{{include:}}`), `duration_da2_symptom_validator.md`,
  `duration_da3_future_analyser.md`. The `prompts/domains/` fragments are the
  canonical domain knowledge, also included by the Wave 2 domain agents (2C–2G).
- Categories: health, career, wealth, marriage, property, cashflow ("Money Agent" —
  liquidity, distinct from wealth/accumulation).
- New `ModelConfig` rows: `DA-1` (legacy), `DA1-HEALTH` … `DA1-CASHFLOW` (one per
  domain agent), `DA-2`, `DA-3`.
- DA-1 runs batched (≤25 periods per call, merged deterministically); all DA LLM
  calls use lenient JSON parsing with one retry.
- Backfill: `npm run db:backfill-pd` fills missing Pratyantardashas into charts
  computed before full-PD storage (`scripts/backfill-pratyantardashas.ts`).

1. **Generate Chart** — deterministic Swiss Ephemeris computation. Two ingestion
   paths land in a single `UnifiedChart` store: `from-compute` (birth data) and
   `from-paste` (`ChartInputV1` JSON).
2. **AI Analysis** — the 4-wave LLM pipeline, now runnable directly against a
   `UnifiedChart` via `/api/unified-charts/[id]/analyze`. Compute-path charts
   **skip LLM Wave 1** because the foundation data is already computed
   deterministically.
3. **Reporting** — synthesis JSON rendered to an HTML report, served through the
   report viewer.

Additional structural changes:
- **Deterministic Wave 1 substrate:** new `engine/compute/` modules — `shadbala.ts`
  (1C), `relationships.ts` (1D), `jaimini.ts`, `bhavaBala.ts`,
  `nakshatraRelationships.ts`, `yogas.ts` (named-yoga catalogue, injected under 1D) —
  plus `D2`, `D3`, `D12` divisional charts.
- **`UnifiedChart` table** with one JSONB column per domain (see ERD).
- **`lib/chart-mapper.ts`** maps between `ComputedChart`, `ChartInputV1`, and
  `UnifiedChart`.

> An **AI report chat** feature (`.kiro/specs/report-ai-chat`) is specified but not
> yet implemented (no routes or tables exist yet). It is intentionally omitted from
> the diagrams below and should be added here when built.

---

## 1. System Overview

VedicMojoAI is a single-practitioner internal web application that wraps an 18-agent,
4-wave Vedic astrology analysis pipeline. It accepts a pre-computed birth chart as
JSON, orchestrates LLM agents in a structured pipeline, persists all outputs, and
renders interactive HTML reports.

The system is a single **Next.js 14 (TypeScript)** monorepo — UI, API routes,
pipeline engine, and report renderer all in one project, one language, one deployment.

---

## 2. Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (UI)                             │
│  Chart Submission │ Run Dashboard │ Report Viewer │ Dasha UI    │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP / SSE
┌────────────────────────────▼────────────────────────────────────┐
│                   NEXT.JS API LAYER  (/app/api)                 │
│  POST /api/unified-charts/[id]/analyze  GET /api/runs/:id/events│
│  POST /api/compute   GET /api/reports   GET /api/runs/:id       │
└────────────────────────────┬────────────────────────────────────┘
                             │ function calls (same process)
┌────────────────────────────▼────────────────────────────────────┐
│                      ENGINE  (/engine)                          │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────┐ │
│  │ pre_analysis │   │   planner    │   │  computeVimshottari │ │
│  │    .ts       │   │    .ts       │   │       .ts           │ │
│  └──────┬───────┘   └──────┬───────┘   └──────────┬──────────┘ │
│         │                  │                       │            │
│  ┌──────▼───────────────────────────────────────────▼────────┐  │
│  │              ORCHESTRATOR  (orchestrator.ts)              │  │
│  │  - resolves agent execution plan from planner             │  │
│  │  - manages parallel fan-out per wave                      │  │
│  │  - writes WaveOutput to DB as each agent completes        │  │
│  │  - emits SSE events to API layer                          │  │
│  │  - CRITICAL ERROR HALT GATE between 4A and 4B (US-4.3)   │  │
│  └──────┬──────────────────────────────────────────┬─────────┘  │
│         │                                          │            │
│  ┌──────▼──────┐                          ┌────────▼──────────┐ │
│  │  LLM LAYER  │                          │  REPORT RENDERER  │ │
│  │  (llm.ts)   │                          │  (renderer.ts)    │ │
│  │  Vercel AI  │                          │  HTML + templates │ │
│  │  SDK wrap   │                          └───────────────────┘ │
│  └──────┬──────┘                                                │
└─────────┼───────────────────────────────────────────────────────┘
          │ HTTPS  (Claude / OpenAI / Gemini)
    ┌─────▼──────┐
    │  LLM APIs  │
    └────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     PERSISTENCE LAYER                           │
│   PostgreSQL (via Prisma)          File System                  │
│   - Chart (legacy, paste-path)     - reports/{slug}.html        │
│   - UnifiedChart                   - prompts/agents/*.md        │
│   - PipelineRun                    (prompt files read-only)     │
│   - WaveOutput                                                  │
│   - Wave1Cache                                                  │
│   - RunMessage                                                  │
│   - ModelConfig                                                 │
│   - SavedChart (legacy, read-only — superseded by UnifiedChart) │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Descriptions

### 3.1 UI Layer (`/app`)

> **v1.3 note:** the legacy `/charts` (list/detail/new-run/dasha) pages and the
> `Chart`-model `POST /api/runs` route were removed. `/` is now the Chart
> Compute UI directly (formerly at `/compute`); AI Analysis runs are started
> exclusively via `/unified-charts/[id]/analyze` → `POST
> /api/unified-charts/[id]/analyze`. The legacy `Chart` table and its
> read-only detail queries still exist (paste-path runs keep a legacy `Chart`
> row for the `PipelineRun` FK — see §3.2), but there is no dedicated UI for it.

| Page | Route | Purpose |
|---|---|---|
| Chart Compute (home) | `/` | Real-time chart computation from birth data + Save/Load computed charts. **10 tabs:** Summary · Grahas · Divisional Charts · Ashtakavarga · **Yogas** · Dasha (Vimshottari) · Chara Dasha · Transits · Pinda Strength · **Varshaphal** (annual solar-return chart per year). Was 11 — Planets + Nakshatras + Karakas merged into one **Grahas** tab and **Yogas** added after Ashtakavarga (`chart-ui-enhancements` spec) |
| Run Progress | `/runs/[id]` | Live SSE stream — per-agent status, token count, cost running total |
| Report Viewer | `/runs/[id]/report` | Tabbed HTML report: Health / Wealth / Career / Marriage / Property / Dasha |
| Unified Charts | `/unified-charts` | Generate Chart hub — list unified charts (compute + paste), filter, open |
| Unified Chart Detail | `/unified-charts/[id]` | Full domain view of a unified chart + run history |
| Unified Chart Analyze | `/unified-charts/[id]/analyze` | AI Analysis launcher — query-type + agent selection, model override, 202 redirect |
| Duration Analysis Form | `/duration-analysis` | Date range + category + optional symptoms + question → launches 3-agent pipeline |
| Duration Analysis Results | `/duration-analysis/[id]` | Live SSE progress, period table (DA-1), symptom gate, DA-3 forecast, follow-up chat |
| Marriage Matchmaking | `/matchmaking` | Bride/groom chart picker (gender shown as a label/warning only, never auto-selected) + list of the caller's saved matches |
| Marriage Matchmaking Result | `/matchmaking/[id]` | Ashtakoota 8-koota breakdown + Mangal Dosha status, rendered from the persisted `result` snapshot (never recomputed) |

### 3.2 API Layer (`/app/api`)

> **v1.3 note:** the legacy `Chart`-model routes (`/api/charts`,
> `/api/charts/[id]`, `/api/charts/[id]/dasha`, `POST /api/runs`) and the
> dormant `/api/compute/save`, `/api/compute/charts`, `/api/compute/charts/[id]`,
> `/api/reports/[id]`, `/api/runs/[id]/rerun` routes were deleted — none had a
> remaining UI caller. `POST /api/unified-charts/[id]/analyze` is now the only
> way to start a pipeline run.

| Route | Method | Purpose |
|---|---|---|
| `/api/compute` | POST, GET | Compute a full Vedic chart from birth data (stateless) |
| `/api/compute/varshaphal` | POST, GET | Compute a Tajika Varshaphal (annual solar-return chart) for a given year (stateless): Varsha Pravesh, annual chart, Muntha, Panchavargeeya Bala, Varshesha |
| `/api/unified-charts` | GET | List unified charts (filters: `search`, `lagna`, `source`) + run counts |
| `/api/unified-charts/from-compute` | POST | **Generate Chart (Path A)** — compute from birth data, persist as `source="compute"` (shared creator: `lib/unified-chart-create.ts`) |
| `/api/unified-charts/from-paste` | POST | **Generate Chart (Path B)** — validate + persist pasted `ChartInputV1` as `source="paste"` |
| `/api/unified-charts/[id]` | GET, PATCH, DELETE | Load full domain data / rename / delete (cascades pipeline runs + duration analyses) |
| `/api/unified-charts/[id]/analyze` | POST | **AI Analysis** — start pipeline on a unified chart (202 + run_id); skips Wave 1 for compute source |
| `/api/duration-analysis` | POST | **Duration Analysis** — create run for date range + category (202 + analysisId) |
| `/api/duration-analysis/[id]` | GET | Full Duration Analysis record with all agent outputs and messages |
| `/api/duration-analysis/[id]/events` | GET | SSE stream for DA pipeline progress |
| `/api/duration-analysis/[id]/chat` | POST | Follow-up question to DA-3 with conversation history |
| `/api/duration-analysis/[id]/override` | POST | Override symptom gate and resume to DA-3 |
| `/api/matchmaking` | POST, GET | **Marriage Matchmaking** — compute + persist a `CompatibilityMatch` (`{brideChartId, groomChartId, label?}`) / list the caller's saved matches (summary fields only — see ERD's `verdict` denormalization note) |
| `/api/matchmaking/preview` | POST | Identical to the POST above minus persistence — the only matchmaking route the MCP tool (`compute_match`) may call |
| `/api/matchmaking/[id]` | GET, DELETE | Load the persisted `result` verbatim (never recomputed, OD-5) / delete a saved match, both ownership-checked |
| `/api/runs/[id]` | GET | Run status, planner output, per-agent results |
| `/api/runs/[id]/events` | GET | SSE stream of agent_complete / error events |
| `/api/runs/[id]/cancel` | POST | Cancel a running/queued pipeline run |
| `/api/runs/[id]/override` | POST | Override the critical-error halt gate and resume |
| `/api/runs/[id]/chat` | POST | Follow-up question against a completed report |
| `/api/runs/[id]/report-content` | GET | Raw markdown report content (for `.md` output format) |
| `/api/reports` | GET | List all completed pipeline runs (for the Reports page) |
| `/api/reports/[id]` | GET | Serve HTML report file |
| `/api/timeline` | POST | **MCP + Duration Analyser UI (no-LLM)** — deterministic dasha-period slice + transit overlay + 0–100 scoring + peaks + per-period driver digest (`insights`) + `domainContext` over a date range + category (Duration Analysis pre-steps without the LLM). Consumed both by MCP (raw → Claude Desktop LLM interprets) and the `/duration-computation` UI (renders the digest directly, no LLM). See `docs/duration-analyser.md`. |
| `/api/knowledge` | GET | **MCP** — list available domain + framework rubrics |
| `/api/knowledge/[type]/[name]` | GET | **MCP** — one rubric (`type`=`domains`\|`frameworks`), `{{include:}}`-expanded, name allow-listed |

> The `/api/timeline` and `/api/knowledge/**` routes are read-only and never call
> an LLM. They back the MCP server (§3.9) and honour the optional `MCP_TOKEN`
> guard (`lib/mcpAuth.ts`).

### 3.3 Engine Layer (`/engine`)

```
engine/
├── constants.ts          # YEAR_DAYS=365.2425, nakshatra map, dasha years, domain→agent map
├── pre_analysis.ts       # 11 deterministic rules → alerts[]
├── computeVimshottari.ts # Moon longitude → full DashaTree (MD/AD/PD + dates)
├── planner.ts            # query types[] → ordered agent execution plan
├── orchestrator.ts       # fan-out execution, DB writes, SSE emission
├── llm.ts                # Vercel AI SDK wrapper — provider/model swappable
├── chartSummary.ts       # ChartInputV1 + DashaTree → compact ~2KB summary string
├── renderer.ts           # synthesis JSON → HTML report file
├── compute/              # deterministic Swiss Ephemeris engine (no LLM)
│   ├── index.ts           # computeFullChart() — orchestrates all modules below
│   ├── planets.ts         # planet longitudes, signs, houses
│   ├── nakshatras.ts      # nakshatra, pada, sub-lord
│   ├── dignity.ts         # MOOLATRIKONA_RANGES (degree-aware D1 rule), getVargaDignityLabel (optional degreeInSign param), getVargaDignityReason() — consumed by divisional.ts, yogas.ts, scoring.ts, UI KeyDignitiesPanel
│   ├── divisional.ts      # divisional charts incl. D2, D3, D12 (new) + D4/D7/D9/D10/D30
│   ├── ashtakavarga.ts    # BAV/SAV
│   ├── karakas.ts         # Jaimini chara karakas
│   ├── arudhaPadas.ts     # arudha padas
│   ├── specialLagnas.ts   # HL, GL, SL, etc.
│   ├── upagrahas.ts       # Gulika, Mandi + solar-derived upagrahas
│   ├── pindaStrength.ts   # pinda strength
│   ├── transits.ts        # transits + BOTH Sade Sati readings: sign-based (computeSadeSatiPeriods, asOfDate-driven isCurrent) and degree-based (computeDegreeSadeSati → TransitAnalysis.sadeSatiByDegree, Saturn ±45° of natal Moon, 138-day merge threshold)
│   ├── shadbala.ts        # NEW — full 6-component Shadbala (deterministic 1C)
│   ├── relationships.ts   # NEW — conjunctions, aspects, yuddha, parivartana… (deterministic 1D)
│   ├── nakshatraRelationships.ts # NEW — sub-lords, depositor chains, parivartana, clusters
│   ├── jaimini.ts         # NEW — argala, yogi/avayogi, special-lagna aspects
│   ├── bhavaBala.ts       # NEW — Bhavadhipati / Bhava Dig / Bhava Drishti bala
│   ├── yogas.ts           # NEW — deterministic named-yoga catalogue (Mahapurusha, Raja/DKA, Dhana, Viparita, Neechabhanga, lunar, Gaja Kesari, Budha-Aditya, Parivartana, Kartari)
│   ├── varshaphal.ts      # NEW — Tajika annual solar-return chart (on-demand; reuses computeFullChart)
│   ├── matchmakingTables.ts # NEW — static Ashtakoota reference tables (nakshatra/rashi attributes, 5 scoring matrices), hand-transcribed + oracle-verified (docs/computation_matchmaking.md)
│   └── matchmaking.ts     # NEW — pure, never-throwing Ashtakoota (computeAshtakootaMatch) + Mangal Dosha (computeMangalDosha) + composition (computeMatch)
└── waves/
    ├── wave1.ts           # LLM path: 1A, 1B, 1C, 1D (compute path skips these)
    ├── wave2.ts           # parallel, planner-selected: 2A–2G
    ├── wave3.ts           # parallel, planner-selected: 3A–3D
    └── wave4.ts           # sequential: 4X → 4A → 4B → 4C
```

**Duration Analysis engine** (separate from the wave pipeline):

```
engine/durationAnalysis/
├── index.ts           # executeDurationPipeline + resumeDurationPipeline orchestrator
├── slicer.ts          # sliceDashaTree() — pure TS, overlap filter, lord annotation, yoga activation
├── transitOverlay.ts  # buildTransitOverlay() — per-AD transit snapshots + BAV scores
├── registry.ts        # DOMAIN_AGENT_REGISTRY — per-category prompt/model/divisions/columns
├── agentJson.ts       # callAgentJson() — lenient JSON extraction + one retry per agent call
└── extractor.ts       # extractCategoryData() — registry-driven chart data extraction
```

**Deterministic Wave 1 (compute path):** For a `source="compute"` unified chart,
the analyze route strips Wave 1 agents from the execution plan and builds
`wave1_delta` directly from the chart's deterministic domain columns
(`planets`, `nakshatras`, `shadbala`, `relationships`, `jaimini`, `bhavaBala`,
`ashtakavarga`, `yogas`, …). Wave 2 then interprets structured data instead of
re-deriving geometry via LLM. The legacy `Chart` / paste path still runs the LLM Wave 1
agents (1A–1D remain in `AGENT_CATALOGUE` and `ALWAYS_RUN_FIRST_QUERY` in `constants.ts`).

`yogas` (`engine/compute/yogas.ts`, `named-yoga-engine` spec) is injected under the
`1D` key alongside `relationships`/`jaimini`/`ashtakavarga`: a chart-wide, deterministic
named-yoga catalogue (Pancha Mahapurusha, Raja incl. `raja.dka`, Dhana, Viparita,
Neechabhanga, lunar, Gaja Kesari, Budha-Aditya, Parivartana, Kartari) that Wave 2A
(Yoga Detection) validates/interprets rather than re-derives. It is also consumed by
the Duration-Analysis slicer (`sliceDashaTree`, filtered by the running MD/AD lord)
and exposed read-only via the `get_yogas` MCP tool.

### 3.4 Pre-Analysis Engine

Deterministic, no LLM. Runs first, always, before any wave.

**Outputs two artifacts:**
1. `alerts[]` — 11-rule flag array consumed by every agent prompt
2. `dasha_tree` — full Vimshottari computation via `computeVimshottari()`

Both are stored in `Wave1Cache` and injected into agent contexts via `chart_summary`.

### 3.5 Vimshottari Engine (`computeVimshottari.ts`)

Pure TypeScript function. No LLM, no external dependencies.

```
Input:  moonLongitudeDeg: number   (0–360, sidereal)
        birthDatetime: Date

Output: DashaTree {
  balance_years: number
  mahadashas: MahaDasha[]          // 9 periods covering 120 years
}

MahaDasha {
  lord: Planet
  start: Date
  end: Date
  duration_days: number
  antardashas: AnterDasha[]        // 9 sub-periods
}

AntarDasha {
  lord: Planet
  start: Date
  end: Date
  duration_days: number
  pratyantardashas?: PratyanDasha[] // populated for current + next MD only
}
```

Year constant: `YEAR_DAYS = 365.2425` defined once in `constants.ts`.

Self-verification: sum of all MD duration_days must equal `120 × 365.2425 ± 1`.
If check fails → `DashaIntegrityError` thrown before any LLM agent runs.

### 3.6 Planner (`planner.ts`)

Deterministic TypeScript map. No LLM by default.

```typescript
const DOMAIN_AGENTS: Record<QueryType, AgentId[]> = {
  health:   ['2E', '3C'],
  wealth:   ['2A', '2C', '3A', '3B'],
  career:   ['2A', '2F', '3A', '3C'],
  property: ['2A', '2D', '3A'],
  marriage: ['2A', '2G', '3C'],
  generic:  ['2A', '2B', '2C', '2E', '2F', '3A', '3C'],
  full:     ['2A', '2B', '2C', '2D', '2E', '2F', '2G', '3A', '3B', '3C', '3D'],
}

const ALWAYS_RUN_FIRST_QUERY = ['1A', '1B', '1C', '1D', '2B', '4X', '4A', '4B', '4C']
```

Planner output (resolved agent list + rationale) is persisted to
`pipeline_runs.planner_output` for auditability.

### 3.7 LLM Layer (`llm.ts`)

Thin wrapper around Vercel AI SDK.

```typescript
interface LLMCallOptions {
  model:       string           // e.g. 'claude-opus-4-5', 'gpt-4o'
  provider:    'anthropic' | 'openai' | 'google'
  prompt:      string
  temperature: number           // 0 for Wave 4, 0.3 for Wave 2
  maxTokens:   number
}

async function callLLM(opts: LLMCallOptions): Promise<LLMResponse>
// Returns: { content: string, tokenIn: number, tokenOut: number, costUsd: number }
```

Model and provider are read from `model_config` table (or env defaults).
Swapping provider requires zero code changes.

### 3.8 Context Assembly (token optimisation)

Every agent receives a **compact context**, not raw accumulated output:

| Agent group | Context injected |
|---|---|
| 1A–1D | `chart_summary` (~2KB) + `pre_analysis_alerts` |
| 2A–2G | `chart_summary` + `wave1_delta_output` only |
| 3A–3D | `chart_summary` + relevant Wave 2 delta outputs only |
| 4X | `chart_summary` + all Wave 2/3 delta outputs (produces `fact_summary`) |
| 4A–4B | `chart_summary` + `fact_summary` |
| 4C (Opus) | `chart_summary` + `fact_summary` + `4A_output` + `4B_output` |

`chart_summary` is pre-computed once from `ChartInputV1` + `dasha_tree` and stored
in `Wave1Cache`. It is never re-derived by an LLM agent.

### 3.9 MCP Server (`mcp/` + `app/api/mcp/route.ts`)

**Dual transport**, same tool/resource/prompt surface either way:

- **stdio** — a **separate Node process** (its own package under `mcp/`)
  launched by Claude Desktop for local use. Holds **no astrology logic** —
  every tool is a thin HTTP call to the routes in §3.2. Its purpose is to move
  the *reasoning* into Claude Desktop (billed to the Desktop subscription)
  instead of the paid API pipelines, so it deliberately **never calls**
  `POST /api/unified-charts/[id]/analyze` or `POST /api/duration-analysis`.
- **Streamable HTTP** — `POST /api/mcp`, a normal Next.js Route Handler in the
  main app, reachable by remote MCP clients on the same Vercel deployment (no
  separate process, no TLS/port management). Stateless (a fresh `McpServer`
  per request); auth comes from the request's own `Authorization: Bearer`
  header rather than a process-env token, since one shared endpoint serves
  many users concurrently. Internally it's still the same thin-HTTP-client
  design — each tool call `fetch()`es back into this deployment's own
  `/api/*` routes via `mcp/src/http.ts`'s `createApiClient`, just bound to
  `new URL(request.url).origin` instead of `VEDICMOJO_BASE_URL`. The route
  handler constructs the server via `mcp/src/registerAll.ts`'s
  `createMcpServer` rather than the `McpServer` class directly — the root app
  and `mcp/` each install their own copy of `@modelcontextprotocol/sdk`, and
  keeping construction inside `mcp/src` avoids a TypeScript nominal-typing
  conflict between the two copies' otherwise-identical classes.

Both entry points share the exact same `mcp/src/{tools,resources,prompts,chart}.ts`
— the API client (token + base URL) is threaded through as a parameter rather
than imported as a singleton, which is what makes the same code safe to reuse
per-request.

Three primitives:

- **Tools** — deterministic data: discovery (`list_clients`, `get_client_chart`),
  compute (`compute_chart`, `compute_varshaphal`), focused extractors
  (`get_shadbala`, `get_divisional_chart`, `get_dasha_tree`, `get_active_dasha`,
  `get_chara_dasha`, `get_ashtakavarga`, `get_relationships`, `get_jaimini`,
  `get_bhava_bala`, `get_transits` — each taking a stored `chartId` **or** raw `birthData`),
  timeline (`get_timeline_periods`, `get_domain_dataset`), matchmaking
  (`compute_match` — Ashtakoota/Mangal Dosha for two stored charts, calling
  only `POST /api/matchmaking/preview`, never the persisting route — see §8.4),
  knowledge (`list_knowledge`, `get_domain_knowledge`, `get_framework`), and
  read-only access to already-generated reports.
- **Resources** — the 6 canonical domain rubrics (`knowledge://domains/{domain}`).
- **Prompts** — ready-to-run readings (`analyze_{career|health|wealth|marriage|property|cashflow}`,
  `duration_timeline`, `analyze_full_chart`). Each embeds the domain rubric and
  instructs Claude which Tools to call for the given client (the "recipe →
  ingredients → cook" loop).

Backed by two new read-only, no-LLM routes: `POST /api/timeline` and
`GET /api/knowledge/**` (§3.2). Auth resolves to a specific `User` via a
per-user `McpApiToken` (§3.10) — the old shared `MCP_TOKEN` secret is gone.
Full details: `mcp/README.md`.

#### MCP OAuth authorization server (v1.7)

A second, additional way to get a token for `POST /api/mcp` — the manual
`McpApiToken` flow above is completely unaffected. Lets an OAuth-aware remote
client (e.g. claude.ai's "Add custom connector") redirect the user through
login + consent instead of copy-pasting a token from `/account`. Hand-rolled
as plain Next.js Route Handlers (Web-standard, no Express) rather than using
`@modelcontextprotocol/sdk`'s `server/auth/*` toolkit, which is Express-only
and incompatible with this app's Vercel-serverless-first design; the SDK's
framework-agnostic Zod schemas (`shared/auth.js`) are reused for
spec-correct request/response shapes.

- **Discovery**: `app/api/mcp/route.ts`'s no-token 401 carries a
  `WWW-Authenticate: Bearer resource_metadata="..."` header pointing at
  `GET /.well-known/oauth-protected-resource/api/mcp` (RFC 9728), which in
  turn points at `GET /.well-known/oauth-authorization-server` (RFC 8414)
  for the endpoint list.
- **Registration**: `POST /api/oauth/register` (RFC 7591) — every
  dynamically-registered client is treated as public/PKCE-only (no
  `client_secret`), matching how claude.ai registers.
- **Authorize**: `GET /oauth/authorize` — a Server Component (the one page
  in this client-component-heavy app that deliberately isn't one, so the
  redirect-safety validation and session check run before anything
  renders). Two-phase validation per RFC 6749 §4.1.2.1: phase 1
  (`client_id`/`redirect_uri`, exact-match only) fails with a **direct
  error**, never a redirect — the open-redirect guard; phase 2 (PKCE
  `S256`-only, `response_type`, etc.) fails with a **redirect** to the
  now-trusted `redirect_uri`. The consent form posts to
  `POST /api/oauth/authorize-decision`, which **re-validates**
  `client_id`/`redirect_uri` itself rather than trusting the submitted
  hidden fields, and mints a short-lived, hashed `OAuthAuthorizationCode`.
- **Token**: `POST /api/oauth/token` (form-encoded, not JSON — the OAuth
  standard) — `authorization_code` (PKCE-verified, RFC 8707 `resource`-bound)
  and `refresh_token` (rotated on every use) grants. Both consume their
  single-use secret via an atomic conditional `updateMany` claim (`count ===
  1` or reject) rather than read-then-write, which would be a replay race.
  Newly-issued access tokens carry a `mcp_oat_` prefix so
  `lib/mcpAuth.ts`'s `resolveMcpUser` can branch to the right table without
  a blind lookup against both on every call.
- **Revocation**: `POST /api/oauth/revoke` (RFC 7009), always 200.
- Known v1 simplification: no refresh-token-family tracking — a replayed
  (already-rotated) refresh token is rejected on that one request but
  doesn't cascade-revoke the rest of its lineage.

### 3.10 User Management & Auth Layer (`lib/auth.ts`, `middleware.ts`, v1.5)

Net-new — the repo had zero auth infrastructure before this. **Auth.js
(NextAuth v5)** + `@auth/prisma-adapter`, database-backed sessions:

- `lib/auth.ts` — `PrismaAdapter(prisma)` configured with `session.strategy =
  'database'` and `providers: []` (no Credentials provider is registered —
  `@auth/core`'s config assertion hard-errors on "Credentials + database
  sessions" as a *config shape*, independent of whether `signIn()` is ever
  called with it). Exports `auth()` (session reads only), `resolveRequestUser`
  (session cookie → `lib/mcpAuth.ts`'s `resolveMcpUser` fallback), and
  `requireSessionUserId` (session-only, no MCP fallback — used by the MCP
  token issuance routes so a token can't mint another token).
- Custom routes under `app/api/auth/*` (signup, login, logout,
  forgot-password, reset-password) bypass Auth.js's own `signIn()`/`signOut()`
  entirely: they verify the bcrypt hash (`lib/passwords.ts`) and
  create/delete `Session` rows directly via the Prisma adapter's
  `createSession`/`deleteSession`, setting the `authjs.session-token` cookie
  by hand. Password reset emails go through Resend (`lib/email.ts`).
- `middleware.ts` guards UI page routes on session-cookie *presence* only
  (edge-safe, no DB call) — redirects to `/login` if absent. It deliberately
  does not import `lib/auth.ts` (that module pulls in the Prisma adapter,
  not edge-compatible). The real validity/ownership check is always the
  per-route `resolveRequestUser` call.
- Every `UnifiedChart`-adjacent route (§8.2, Duration Analysis §8.3, reports,
  runs) resolves a `userId` via `resolveRequestUser` and enforces ownership —
  404 (never 403) on a mismatch, so a non-owner can't distinguish "doesn't
  exist" from "exists but isn't yours."
- MCP token lifecycle: `POST /api/account/mcp-token` (session-only,
  generates + reveals a raw token exactly once, revokes any prior active
  token — one active token per user in v1) and
  `POST /api/account/mcp-token/revoke`. `lib/mcpAuth.ts`'s `resolveMcpUser`
  hashes the incoming `x-mcp-token` header and looks up the owning `userId`;
  a non-production `MCP_DEV_USER_EMAIL` fallback exists only when **no**
  token header is sent at all (an invalid/revoked token never falls through
  to it).
- `lib/rateLimit.ts` — minimal in-memory sliding-window limiter applied to
  the auth routes; explicitly does not survive a restart or work across
  multiple instances (fine at this app's single-instance scale, flagged
  rather than silently accepted).

---

## 4. Agent Pipeline Flow

```
ChartInputV1 JSON
       │
       ▼
[Pre-Analysis + Vimshottari Engine]  ← deterministic, no LLM
       │ alerts[] + dasha_tree + chart_summary
       ▼
[PLANNER]  ← resolves agent list from query types
       │ execution_plan[]
       ▼
┌──────────────────────────────────────────────────────┐
│ WAVE 1 (parallel)                                    │
│   1A: Chart Extraction                               │
│   1B: Nakshatra Analysis                             │
│   1C: Bala Deep Audit                                │
│   1D: Relationship Geometry                          │
└──────────────────┬───────────────────────────────────┘
                   │ wave1_delta (stored in Wave1Cache)
                   ▼
┌──────────────────────────────────────────────────────┐
│ WAVE 2 (parallel, planner-selected)                  │
│   2A: Yoga Detection     2B: Ashtakavarga (always)   │
│   2C: Wealth             2D: Property                │
│   2E: Health             2F: Career (new)            │
│   2G: Marriage (new)                                 │
└──────────────────┬───────────────────────────────────┘
                   │ wave2_deltas[]
                   ▼
┌──────────────────────────────────────────────────────┐
│ WAVE 3 (parallel, planner-selected)                  │
│   3A: Cashflow Timeline  3B: Financial Freedom       │
│   3C: Cross-Channel      3D: Lagna Lord (conditional)│
└──────────────────┬───────────────────────────────────┘
                   │ wave3_deltas[]
                   ▼
┌──────────────────────────────────────────────────────┐
│ WAVE 4 (sequential)                                  │
│   4X: Fact Consolidation  →  fact_summary (~6KB)     │
│   4A: Error Detection     →  corrections[]           │
│   ┄┄┄┄┄ HALT GATE (US-4.3) ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│   │ critical_errors > 0 → HALT (status=halted)       │
│   │ else → continue                                  │
│   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│   4B: Validation          →  confidence_matrix[]     │
│   4C: Final Synthesis (Opus) → authoritative report  │
└──────────────────┬───────────────────────────────────┘
                   │ synthesis JSON
                   ▼
           [Report Renderer]
                   │ HTML file
                   ▼
          reports/{slug}.html  +  DB report_path
```

---

## 5. Token Optimisation Architecture

The token budget is managed at three levels:

**Level 1 — Pre-compute chart_summary once**
All 18 agents share the same ~2KB chart_summary prefix.
No agent ever sees the raw 30KB `ChartInputV1` JSON.

**Level 2 — Delta-only wave outputs**
Each agent outputs only net-new findings. Agents are explicitly instructed
not to restate inputs. Wave outputs shrink ~40% vs. naïve re-echo.

**Level 3 — 4X Fact Consolidation before Opus**
Agent 4X (new, Wave 4, Sonnet model) reads all Wave 1–3 deltas and produces
a ~6KB `fact_summary`. Agent 4C (Opus) receives only:
`chart_summary + fact_summary + 4A + 4B` — estimated ~15K tokens vs ~100K without.

**Estimated token savings:**
| Scenario | Without optimisation | With optimisation |
|---|---|---|
| Full run — Wave 4C call | ~100K tokens | ~15K tokens |
| Follow-up run | ~100K tokens | ~8K tokens (cached W1 + delta W2/3) |

---

## 6. Critical Error Halt Gate (US-4.3)

Between agent 4A (error detection) and 4B (validation), the orchestrator applies a
severity-based triage. This is a simple conditional — not a separate agent.

### Three-tier response to 4A output

| Severity | Pipeline action | UI behaviour |
|---|---|---|
| `minor` | Continue to 4B → 4C; 4C applies correction inline | Green badge: "corrections applied" |
| `moderate` | Continue to 4B → 4C; 4C applies correction + flags it | Amber badge: "review flagged items" |
| `critical` | **Halt before 4B**. No report generated. | Red "Run halted" state with action buttons |

### Orchestrator pseudocode

```typescript
// engine/orchestrator.ts — after 4A completes

const errorReport = await run4A(factSummary, chartSummary)
await saveWaveOutput(runId, '4A', errorReport)

if (errorReport.error_detection.critical_errors > 0) {
  const criticalErrors = errorReport.error_detection.errors_found
    .filter(e => e.severity === 'critical')

  await db.pipelineRun.update({
    where: { id: runId },
    data: {
      status: 'halted_for_review',
      haltReason: criticalErrors,
    }
  })

  emitSSE(runId, {
    type: 'critical_error',
    errors: criticalErrors,
    actions: ['override_continue', 'rerun_from_wave', 'cancel']
  })

  return  // ← pipeline stops here. No 4B, no 4C, no report.
}

// Non-critical: continue normally
const validationReport = await run4B(factSummary, errorReport)
// ... 4C follows
```

### Resume after halt

When the practitioner selects an action:

| Action | API call | Behaviour |
|---|---|---|
| Override & Continue | `POST /api/runs/{id}/override` | Sets `override_applied = true`, resumes from 4B. Report carries permanent "override" watermark. |
| Re-run from Wave X | `POST /api/runs/{id}/rerun?from_wave={n}` | Identifies the wave that produced the faulty output (from `affects_waves` in 4A corrections), re-executes from there using same run_id. |
| Cancel | `POST /api/runs/{id}/cancel` | Sets status to `failed`, preserves completed wave outputs for debugging. |

### What triggers a critical halt

From the existing 4A checks:
- **CHECK 1**: Yogakaraka classified as malefic or VRY lord
- **CHECK 3**: 3D ran when it should not (or vice versa)
- **CHECK 5**: Dasha dates fabricated (should not happen with deterministic engine, but kept as a safety net)
- Any error where `pipeline_integrity = "critical_failure"`

### DB changes

`pipeline_runs` gains:
- `status` enum value: `halted_for_review`
- `halt_reason` (JSONB, nullable): array of critical error objects from 4A
- `override_applied` (BOOLEAN, default false): true if practitioner forced continuation

---

## 7. Follow-up Query Flow

```
Follow-up query arrives for existing chart
       │
       ▼
Load Wave1Cache (wave1_delta + chart_summary + dasha_tree)
       │ skips pre-analysis and Wave 1 entirely
       ▼
Planner resolves domain agents from new query type
       │
       ▼
Wave 2 domain agents run (with chart_summary + wave1_delta)
       ▼
Wave 3 synthesis agents run (domain-scoped)
       ▼
4X Consolidation (new deltas appended to prior fact_summary)
       ▼
Verification Agent (sees prior 4C synthesis + conversation history)
       ▼
4C Final Synthesis
       ▼
RunMessage stored (immutable thread — prior synthesis unchanged)
```

---

## 8. Deployment Architecture

**Local development:**
```
next dev → single process, SQLite via Prisma, reports/ on local disk
```

**Production (GCP):**
```
Cloud Run (Next.js container)
    ├── Cloud SQL (PostgreSQL)
    └── Cloud Storage bucket (or persistent disk) for reports/
```

Single `Dockerfile`, single deploy command. No Celery, no Redis, no queues.
Next.js background route handlers are sufficient for ~10 reports/month.

---

## 8.5 Vercel & Supabase Deployment (NEW in v1.9)

A third deployment target, alongside local dev and GCP Cloud Run —
`.kiro/specs/vercel-supabase-deployment/`. Vercel's Node.js Serverless
Functions have a **read-only filesystem** (except ephemeral `/tmp`) and are
**per-invocation** — a function's process is not guaranteed to keep running
once its HTTP response is sent. Neither assumption holds for Cloud Run's
persistent container, so four things needed to change:

```
Vercel (serverless)                            Supabase (PostgreSQL)
┌──────────────────────────────┐
│ /api/unified-charts/[id]/    │  waitUntil()   ┌─────────────────────┐
│   analyze, /api/duration-    │───────────────▶│ Connection Pooler   │
│   analysis (maxDuration=800) │  (bounded, not │ (:6543, DATABASE_URL)│
│   → executePipeline()        │   a guarantee) └──────────┬──────────┘
├──────────────────────────────┤                            │
│ engine/renderer.ts           │  writes reportHtml/         ▼
│   fs write wrapped try/catch │  reportMarkdown       ┌─────────────┐
├──────────────────────────────┤                       │  Postgres   │
│ /api/runs/[id]/report-content│  reads DB first,      │  Direct     │
│   falls back to disk         │  disk for legacy      │ (:5432,     │
├──────────────────────────────┤                       │  DIRECT_URL,│
│ /api/health                  │  bypasses reports_dir │  migrations)│
│   check when VERCEL=1        │  check                └─────────────┘
└──────────────────────────────┘
```

1. **Database-backed reports.** `engine/renderer.ts`'s `renderReport()` /
   `renderMarkdownReport()` write the full content to
   `PipelineRun.reportHtml`/`reportMarkdown` (§ERD v1.6) as the source of
   truth; the disk write is now a best-effort side effect wrapped in
   `try/catch` (never blocks or fails the pipeline). `GET
   /api/runs/[id]/report-content` reads the DB columns first, falling back
   to disk only for reports generated before this migration.
2. **Bounded background pipeline execution.** `POST
   /api/unified-charts/[id]/analyze` and `POST /api/duration-analysis`
   still return `202` immediately after firing their pipeline
   fire-and-forget, but the call is now wrapped in `waitUntil()`
   (`@vercel/functions`) so the invocation is kept alive past the response
   instead of relying on the process happening to still be running. This is
   a **bounded mitigation, not a guarantee**: both routes declare `export
   const maxDuration = 800` (Vercel's Fluid Compute ceiling), but a
   pipeline that legitimately runs longer is left non-terminal —
   recoverable via the existing `POST /api/runs/[id]/rerun`/`override`, or
   swept by `reapStaleAnalyses()` for Duration Analysis. A deliberate
   choice **not** to build a queue/worker for this, given the app's
   documented ~10 reports/month scale. The SSE progress endpoints
   (`/api/runs/[id]/events`, `/api/duration-analysis/[id]/events`) are
   separate invocations with their own independent `maxDuration`; the
   former's client (`app/runs/[id]/page.tsx`) reconnects with backoff on a
   dropped connection, and the server seeds its dedup state from the DB
   (not an in-memory `Set` that would otherwise re-announce old progress on
   reconnect) plus sends a status snapshot on `connected`.
3. **Runtime-read asset bundling.** Vercel's build-time file tracer
   (`@vercel/nft`) only follows JS `require()` chains, not arbitrary
   runtime directory reads. `next.config.mjs`'s
   `experimental.outputFileTracingIncludes` now force-includes
   `node_modules/swisseph-v2/**` (the native ephemeris addon + its data
   files, read via `swe_set_ephe_path()` in `engine/compute/transits.ts`)
   and `prompts/**` (every LLM agent prompt, read by `engine/llm.ts`, plus
   `app/api/knowledge/**`'s `fs.readdir()` calls) for all `/api/**` routes.
4. **Connection pooling.** `prisma/schema.prisma`'s `datasource` block gains
   `directUrl = env("DIRECT_URL")`. `DATABASE_URL` points at Supabase's
   transaction connection pooler (`?pgbouncer=true&connection_limit=1`) for
   normal app queries — serverless creates many short-lived connections
   that would otherwise exhaust Postgres's connection limit — while
   `DIRECT_URL` is the unpooled connection `prisma migrate deploy` needs.
5. **Health check.** `/api/health`'s reports-directory writability check is
   bypassed (`checks.reports_dir = 'ok'`) when `process.env.VERCEL` is set.
6. **MCP HTTP transport** (`POST /api/mcp`, §3.9) needed no code change — it
   was already Vercel-aware (`VEDICMOJO_INTERNAL_BASE_URL`,
   `VERCEL_AUTOMATION_BYPASS_SECRET`) — but those env vars must actually be
   set on the Vercel deployment, and its self-call fan-out (two
   invocations per external MCP tool call, each pooling a DB connection)
   counts against the pooler limit above.

**Explicitly out of scope / accepted risk for this deployment:** a
queue/worker replacing `waitUntil()` (see point 2); moving
`lib/rateLimit.ts`'s in-memory auth rate limiter to a shared store — it is
effectively inert under Vercel's multi-instance model, and this is
documented as an accepted v1 risk given the app's scale rather than fixed.

---

## 8.1 Chart Computation & Persistence Flow (SUPERSEDED by §8.2)

> **v1.3:** This section describes the original `SavedChart`-based compute flow.
> It has been fully superseded by `UnifiedChart` (§8.2) — the `/api/compute/save`,
> `/api/compute/charts`, and `/api/compute/charts/[id]` routes described below
> were dormant (no remaining UI caller) and have been **deleted**. The `Chart
> Compute` UI now lives at `/` (formerly `/compute`) and its "Save Chart" button
> calls `POST /api/unified-charts/from-compute` instead. `SavedChart` remains in
> the schema as a read-only legacy table (old rows are not migrated away
> automatically) but nothing writes to it anymore.

Separate from the AI analysis pipeline, the system includes a **deterministic chart computation engine** that calculates planetary positions, divisional charts, and dasha trees using Swiss Ephemeris.

### Architecture (historical — `SavedChart` write path, now removed)

```
PRACTITIONER
     │
     │  Birth data (date, time, tz, lat/lon)
     ▼
┌────────────────────────┐
│  Chart Compute (UI)    │
│  Client Component      │
│  • Input form          │
│  • Chart visualization │
│  • Save / Load buttons │
└──────────┬─────────────┘
           │ POST /api/compute
           ▼
┌────────────────────────┐
│  Compute Engine        │
│  (stateless, no DB)    │
│  computeFullChart()    │
│  computeVimshottari()  │
└──────────┬─────────────┘
           │ ComputedChart + DashaTree
           ▼
┌────────────────────────┐
│  UI displays results   │
│  (10 tabs: summary,    │
│   grahas, divisional,  │
│   ashtakavarga, yogas, │
│   dasha, chara dasha,  │
│   transits, pinda,     │
│   varshaphal)          │
└──────────┬─────────────┘
           │ User clicks "Save Chart"
           │ POST /api/unified-charts/from-compute  (was /api/compute/save)
           ▼
┌────────────────────────┐           ┌─────────────────────┐
│  from-compute API      │─────────►│ UnifiedChart         │
│  • Validates input     │           │ (PostgreSQL)         │
│  • Persists via shared │           │ • one JSONB column   │
│    creator function    │           │   per domain         │
└────────────────────────┘           └─────────────────────┘
```

Load/list is now `GET /api/unified-charts` and `GET /api/unified-charts/[id]`
(§8.2), not the deleted `/api/compute/charts` routes.

### Data historically stored in `SavedChart` (legacy, no longer written)

| Field | Type | Purpose |
|---|---|---|
| `name` | TEXT | Chart/person identifier |
| `birthDate`, `birthTime` | TEXT | Original birth input |
| `timezone`, `latitude`, `longitude` | DECIMAL | Geo-temporal coordinates |
| `sunriseMode` | TEXT | "precise" or "jhora" |
| `lagna` | TEXT | Computed ascendant sign (indexed) |
| `lagnaLongitude`, `moonLongitude`, `ayanamsa` | DECIMAL | Key metadata for quick display |
| `chartData` | JSONB | **Full `ComputedChart` object** — contains all divisional charts, planets, upagrahas, special lagnas, arudha padas, etc. |
| `dashaTree` | JSONB | Full Vimshottari dasha tree |
| `inputHash` | TEXT (unique) | SHA-256 of birth input for dedup |

---

## 8.2 Unified Chart — Generate Chart + AI Analysis (NEW)

`UnifiedChart` bridges the Compute flow and the Analysis pipeline that section 8.1
described as separate. A single record holds all domain data (one JSONB column per
domain) and can be analyzed directly, without re-submitting a `ChartInputV1`.

### Generate Chart (two ingestion paths)

```
PRACTITIONER
     │
     ├── Path A: birth data ─────► POST /api/unified-charts/from-compute
     │                                 │ computeFullChart() + computeVimshottari()
     │                                 │ mapComputedToUnified()  (chart-mapper.ts)
     │                                 ▼
     │                            UnifiedChart(source="compute", all domain columns filled)
     │
     └── Path B: ChartInputV1 JSON ─► POST /api/unified-charts/from-paste
                                       │ validateChartInput() + mapPastedToUnified()
                                       ▼
                                  UnifiedChart(source="paste", chartInputV1 filled, domains null)
```

Both paths deduplicate on `chartHash` and return `409` with the existing record on
a duplicate.

### AI Analysis (POST /api/unified-charts/[id]/analyze)

```
Load UnifiedChart(id)
     │
     ├── build ChartInputV1:
     │     source="paste"   → use stored chartInputV1
     │     source="compute" → buildChartInputV1FromUnified() (synthesize from domains)
     │
     ├── ensure legacy Chart row exists (by chartHash) for PipelineRun.chartId FK
     │
     ├── computeVimshottari() + runPreAnalysis() + buildChartSummary()
     │
     ├── resolvePlan(queryTypes, isFollowup, alerts)
     │     source="compute" → strip all Wave 1 agents, mark wave 1 skipped
     │
     ├── wave1_delta:
     │     source="compute" → assembled from domain columns (1A/1B/1C/1D shaped)
     │     source="paste"   → from Wave1Cache if present, else Wave 1 runs
     │
     ├── optional per-tier modelOverride → upsert model_config rows
     │
     └── create PipelineRun(chartId, unifiedChartId, status="queued")
           → executePipeline({ wave1Source: "compute"|"llm", … })  (fire-and-forget)
           → 202 { runId, waveStrategy: "skip_wave1"|"full_pipeline", executionPlan }
```

Progress streams over the existing SSE endpoint (`/api/runs/[id]/events`), and the
resulting report is served by the same Reporting flow (section 3.1 / `/api/reports`).

Follow-up detection: if the unified chart already has a completed run
(`status="done"`), the new run is flagged `isFollowup` and Wave 1 is not re-run.

---

## 8.3 Duration Analysis — Focused 3-Agent Pipeline (NEW in v1.2)

Duration Analysis is a fourth practitioner-facing feature. Unlike the 18-agent wave
pipeline that produces a broad holistic report, Duration Analysis answers focused
questions about a specific date range and life domain using a lightweight 3-agent
sequential pipeline backed by its own DB tables.

### Architecture

```
PRACTITIONER
     │  POST /api/duration-analysis
     │  { unifiedChartId, dateFrom, dateTo, category, symptoms?, userQuestion? }
     ▼
┌────────────────────────────┐
│  API Route                 │
│  • Validate (10-year cap,  │
│    dashaTree present)      │
│  • Create DurationAnalysis │
│    (status="queued")       │
│  • Fire executeDuration-   │
│    Pipeline (no await)     │
└──────────────┬─────────────┘
               │ 202 { analysisId }
               │
               ▼ (fire-and-forget background execution)
┌──────────────────────────────────────────────────────────┐
│  executeDurationPipeline (engine/durationAnalysis/index.ts)│
│                                                          │
│  Step 0a — sliceDashaTree()   [pure TS, ~1ms]            │
│    • Overlap filter (PD intervals vs date range)         │
│    • Lord annotations (nakshatra, combustion, yoga)      │
│    • Yoga activation (parivartana, Raja, Dhana, Neechabhanga)│
│    • Truncate to 200 periods (flag if truncated)         │
│                                                          │
│  Step 0b — buildTransitOverlay()  [calls computeTransits]│
│    • Saturn/Jupiter/Rahu/Ketu per unique AD boundary     │
│    • BAV scores (bav['Saturn'][signNumber-1])            │
│    • Sade Sati phase from stored allPeriods              │
│    • ashtamaShani / kantakaShani flags                   │
│                                                          │
│  Step 1 — DA-1 Domain Analyser  [Claude Sonnet]          │
│    • Category-scoped chart data + period table + overlay │
│    • Per-period: analysis, key_factors, transit_factors, │
│      activated_yogas, intensity, favorable, bahiranga,   │
│      antaranga                                           │
│    • Post-LLM merge: transitContext + lordAnnotations    │
│      joined back deterministically by ad.start           │
│                                                          │
│  Step 2 — DA-2 Symptom Validator  [Sonnet, CONDITIONAL]  │
│    • Only runs when symptoms provided                    │
│    • Returns: { found, confidence, factors[], analysis } │
│    • Gate: if found=false → status=symptom_unmatched,    │
│      emit symptom_gate SSE, STOP (overridable via /override)│
│                                                          │
│  Step 3 — DA-3 Future Analyser  [Claude Sonnet]          │
│    • Per-AD forecast: bahiranga, antaranga, why,         │
│      transit_why, recommendations                        │
│    • contextSummary generated post-DA-3 (deterministic,  │
│      no LLM) for efficient follow-up prompting           │
└──────────────────────────────────────────────────────────┘

Progress streamed via SSE at GET /api/duration-analysis/[id]/events
Follow-up questions via POST /api/duration-analysis/[id]/chat
```

### Key design decisions

| Decision | Rationale |
|---|---|
| Separate from 18-agent pipeline | Different access pattern (date range + domain vs broad report); lighter cost |
| Deterministic Steps 0a/0b before LLM | Period slicing and transit overlay are exact — no LLM needed; reduces prompt tokens |
| 3 agents sequential (no fan-out) | Each agent depends on the prior; parallelism would not help |
| Post-LLM merge of transitContext | LLM reliably produces interpretive text; joining structured data back in code avoids asking the model to reproduce large nested objects faithfully |
| Category-scoped extraction | Minimises input tokens — health query only gets health-relevant columns |
| contextSummary (deterministic) | After 2+ follow-up turns, substitutes full da1Output in prompt to prevent token growth |
| Symptom gate override | Mirrors halt-gate UX from Wave 4; practitioner can override and get analysis with caveats |

---

## 8.4 Marriage Matchmaking — Ashtakoota + Mangal Dosha (NEW in v1.8)

Marriage Matchmaking is a fifth practitioner-facing feature: a **pure, never-throwing**
compatibility engine (no ephemeris/LLM/network/DB/file I/O) scoring a bride/groom
pair of saved `UnifiedChart`s. It does not touch the wave pipeline or Duration
Analysis at all — the score is derived from each chart's Moon nakshatra/pada
(Ashtakoota) plus Mars/lagna/aspect data on compute-source charts only (Mangal
Dosha).

```
PRACTITIONER
     │ POST /api/matchmaking { brideChartId, groomChartId, label? }
     ▼
┌───────────────────────────────────────────────┐
│  Ownership check — both charts must resolve    │
│  to the caller (404 on either mismatch, never  │
│  403; no distinguishing which chart failed)    │
└──────────────────┬──────────────────────────────┘
                   │ derive MatchNativeInput per chart:
                   │   longitudeToNakshatraPadaRashi(chart.moonLongitude) + role
                   │ derive MangalNativeInput when source="compute" (else omit → 'unavailable')
                   ▼
┌───────────────────────────────────────────────┐
│  computeMatch(bride, groom)                    │
│  (engine/compute/matchmaking.ts)               │
│                                                 │
│  computeAshtakootaMatch — 8 kootas in fixed     │
│    order (Varna, Vashya, Tara, Yoni, Graha      │
│    Maitri, Gana, Bhakoot, Nadi), each wrapped   │
│    so one scorer error doesn't kill the rest    │
│    (mirrors yogas.ts's per-detector guard)      │
│  computeMangalDosha — per native, three         │
│    reference points (lagna/Moon/Venus)          │
│  → gunaScore (fractional, half-points load-     │
│    bearing — Vashya/Graha Maitri/Tara), verdict,│
│    mangalDoshaCompatibility, boundaryRisk,       │
│    limitations                                  │
└──────────────────┬──────────────────────────────┘
                   │ MatchResult, stamped with tablesVersion
                   ▼
              CompatibilityMatch row (POST only — /preview computes and
              returns the same MatchResult without persisting)
                   │
                   ▼
        PRACTITIONER (`/matchmaking/[id]` renders the persisted result verbatim)
```

- **Role-awareness is structural.** `brideChartId`/`groomChartId` (distinct
  Prisma relations `MatchBride`/`MatchGroom`) and `computeAshtakootaMatch`'s
  explicit `bride`/`groom`-named parameters ARE the role encoding — no
  argument-order or list-position inference, and `UnifiedChart.gender` never
  auto-assigns a role (informational picker label + non-blocking warning
  only).
- **Paste-source charts still get a full 8-koota score** — `moonLongitude`
  is a required scalar on both ingestion paths. Only Mangal Dosha (needs
  `planets` JSONB) degrades to `'unavailable'` on a paste chart, never
  silently reported `'matched'`.
- **`/preview` is the MCP-reachable route** (§3.9's `compute_match` tool) —
  identical computation to `POST /api/matchmaking` minus the
  `CompatibilityMatch` write, enforced by `tests/mcp-cost-guard.test.ts`.
- **Chart-delete cascade fix**: `DELETE /api/unified-charts/[id]` explicitly
  `compatibilityMatch.deleteMany`s dependent rows (bride- and groom-side)
  before deleting the chart, in the same `$transaction` as the pipeline-run
  cascade already there — Prisma does not cascade FKs automatically.
- Full koota rules, provenance, and the PyJHora oracle-verification
  methodology: `docs/computation_matchmaking.md`. Schema: `docs/ERD.md`
  §Marriage Matchmaking.

---

## 9. Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Monorepo language | TypeScript only | One language, one deploy, no Python subprocess coupling |
| LLM wrapper | Vercel AI SDK | Provider-agnostic, works with Claude/OpenAI/Gemini, maintained by Vercel |
| DB ORM | Prisma | Type-safe, excellent Next.js integration, easy migrations |
| Dasha computation | Deterministic TS function | Math is exact; LLM-assembled dasha dates are error-prone |
| Dasha year constant | 365.2425 days | Gregorian mean year; defined once in constants.ts |
| Wave execution | Parallel within wave, sequential across waves | Matches the dependency structure; parallel maximises speed |
| 4C input reduction | 4X fact-consolidation (Phase 1) | Largest single cost driver; moved from Phase 2 to Phase 1 |
| Error handling | Severity triage + halt gate between 4A→4B | Critical errors must not produce a report; minor/moderate are auto-corrected by 4C |
| Correction approach | 4C self-corrects (no re-routing to upstream agents) | Errors are interpretive, not computational; re-routing would cascade through dependency graph |
| Report storage | HTML files on disk, path in DB | Simple, portable, no blob-storage complexity |
| Auth | None (Phase 1) | Single internal user |
