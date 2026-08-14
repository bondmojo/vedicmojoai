# VedicMojoAI — Data Flow Diagram (DFD)

**Version:** 1.9
**Last updated:** 2026-08-10
**Status:** Draft

> **Maintenance rule:** Update this DFD alongside any change to processes, data
> stores, or flows — together with the AI Skills, ERD, and HLD. See
> `Agents.md → Documentation Maintenance`.

## What changed in v1.9

- Added the **Vercel + Supabase deployment flow**. Both asynchronous pipeline
  launchers now register their work with `waitUntil()` before returning `202`;
  this keeps a serverless invocation alive only up to the route's declared
  `maxDuration`, rather than treating an unawaited Promise as durable work.
  A run that exceeds that bound remains recoverable through the existing
  run/duration-analysis recovery paths.
- **D2: PipelineRun** now holds the rendered report content as
  `reportHtml`/`reportMarkdown`, as well as the legacy `reportPath`.
  P5 writes the database content first; the filesystem write is best-effort
  for local/Cloud Run compatibility. P6 reads the database first and falls
  back to `FS: reports/` only for pre-migration reports.
- The AI-analysis SSE client reconnects after a serverless connection ends.
  Its `connected` event contains a snapshot of persisted `WaveOutput` state,
  while the server seeds its per-connection deduplication from D4; this avoids
  losing progress or replaying old agent events after reconnect.
- Supabase app traffic flows through its pooled `DATABASE_URL`; migrations use
  unpooled `DIRECT_URL`. Vercel bundles prompt files and Swiss Ephemeris assets
  because both are runtime-read inputs to P4/P10 and chart computation.

## What changed in v1.8

- Added **P13 — Marriage Matchmaking** and data store **D15:
  CompatibilityMatch**. A pure, never-throwing engine (no ephemeris/LLM/
  network/DB/file I/O) scoring a bride/groom `UnifiedChart` pair — see the
  new subsection under Level 2 — P13.
- **P11 (MCP Server)** gains a new tool, `compute_match`, which flows into
  **P13-preview** only (`POST /api/matchmaking/preview`) — never into P13's
  persisting flow. Same never-writes guarantee as P11's existing tools,
  covered by the same `tests/mcp-cost-guard.test.ts`.
- **D7: UnifiedChart** gains a `gender` field (informational only — flows
  into P13's picker as a label/warning, never as a role-inference input).

## What changed in v1.7

- Added **P11-OAuth**: an MCP OAuth 2.1 authorization server — a second,
  additional way to obtain a token for P11-HTTP's `POST /api/mcp`, alongside
  the existing P12.2 manual `McpApiToken` flow (unchanged). New data store
  **D14** (`OAuthClient`/`OAuthAuthorizationCode`/`OAuthAccessToken`/
  `OAuthRefreshToken`). See the new subsection under Level 2 — P11.
- P11-HTTP's no-token 401 now carries a `WWW-Authenticate` header pointing
  at P11-OAuth's discovery endpoint — the two subsections are now linked.

## What changed in v1.6

- Added **P11-HTTP**: `POST /api/mcp`, a Streamable HTTP transport for the
  same P11 tools/resources/prompts, living inside the main Next.js process
  instead of the separate `mcp/` stdio process — see the new subsection under
  Level 2 — P11. Same never-calls-P4/P10 guarantee, same test coverage.

## What changed in v1.5

- Added **P12 — User Management & Auth** and data stores **D10: User**,
  **D11: Session**, **D12: PasswordResetToken**, **D13: McpApiToken**
  (`Account`/`VerificationToken` are Auth.js adapter plumbing, unused in v1 —
  no data flows of their own yet).
- Every flow into **D7: UnifiedChart** (and anything hung off it — D2, D4,
  D5, D8, D9, and `FS: reports/`) now carries a `userId`, resolved once via
  `resolveRequestUser` and enforced as an ownership check before the flow
  proceeds — a mismatch returns 404, not the data. This isn't drawn as a
  separate arrow on every existing process box; treat it as a cross-cutting
  gate this version adds in front of P1, P8, P9, P10, and P11's read flows.
- **P11 (MCP Server)** auth flow changes: `x-mcp-token` now resolves through
  D13: McpApiToken to a `userId` (P12.2) instead of a static shared-secret
  compare. Behavior for `tests/mcp-cost-guard.test.ts` is unchanged — no new
  `mcp/src` call sites were added.

## What changed in v1.1

- Added P9: Unified Chart Ingestion + Analyze and D7: UnifiedChart.

## What changed in v1.2

- Added **P10: Duration Analysis** process and data stores **D8: DurationAnalysis** and **D9: DurationMessage**.
- Added D8/D9 to the Level 1 data store list.
- Extended the Data Dictionary with Duration Analysis data items.

## What changed in v1.3

- P10.4 is now a **registry-resolved per-domain agent** (DA1-HEALTH … DA1-CASHFLOW)
  with **batched** DA-1 calls (≤25 periods/call, merged via `mergeDA1Outputs()`)
  and lenient JSON parsing with one retry (`callAgentJson`).
- Added the **cashflow** category ("Money Agent" — liquidity, distinct from wealth).
- P10.2 slicer **fails fast on an empty period slice** (hint: `npm run db:backfill-pd`).
- **Stale-run reaper**: queued/running rows with no heartbeat (updatedAt) for 10 min are
  marked failed on every read path (GET [id], SSE poll, list). DA-1 batches persist
  totals per batch as the heartbeat.
- **Cancel**: `POST /[id]/cancel` → `status=cancelled`; the pipeline checks the flag
  between steps and unwinds without overwriting it. SSE emits `run_cancelled`.
- **History**: `GET /api/duration-analysis` lists the newest 50 runs (chart name,
  category, status, cost) for the launcher page's Recent analyses section.
- **Prompt caching**: DA-1 batches and DA-3 chat follow-ups send their stable
  chart-data prefix via `callLLM({ cachedPrefix })` (Anthropic cache_control).

## What changed in v1.4

- Added **P11 — MCP server** (`mcp/`): a separate stdio process that lets Claude
  Desktop read deterministic data + rubrics and reason locally at **$0 API cost**.
  It calls the app over HTTP and **never** flows into P4 (wave pipeline) or P10
  (duration pipeline) — the paid LLM processes. New external entity: **CLAUDE
  DESKTOP**. See the Level 2 — P11 section.
- New deterministic read-only flows are `POST /api/timeline` (scoring that
  reuses P10.2/P10.3 pre-steps sans LLM), `POST /api/gochar` (UTC Lahiri
  occupancy intervals), and `GET /api/knowledge/**` (rubric files).
- `POST /api/gochar` is also read-only: authenticated callers provide a saved-chart
  reference or unsaved birth data, the route derives only natal Moon/Lagna signs,
  and the deterministic engine returns Lahiri whole-sign occupancy intervals in UTC.
  It creates no chart, pipeline run, or other persisted record. The home Transits
  Gochar form and Vimshottari PD expansion send the immutable birth-data snapshot
  captured with the displayed chart rather than a loaded-chart id or live form,
  so later edits cannot query a different natal context. PD calls forward the
  dasha tree's exact ISO UTC start/end bounds.
- The same immutable chart result feeds the four current-snapshot diagrams in
  Transits → Gochar: natal D1, JHora-style Transit Moment Chart from the moving
  Ascendant at `TransitAnalysis.asOf`/birthplace, and Gochar from birth Lagna
  and natal Moon. All three Gochar panels consume `TransitAnalysis.asOf`
  positions directly, while the range route remains an ingress-interval flow.

---

## Level 0 — Context Diagram

The highest-level view. One process, two external entities.

```
┌─────────────┐   ChartInputV1 JSON         ┌─────────────────────┐
│             │   Query type + user_query    │                     │
│ PRACTITIONER├────────────────────────────►│                     │
│             │                             │   VEDICMOJOAI       │
│             │◄────────────────────────────│   SYSTEM            │
│             │   HTML Report               │                     │
│             │   Dasha Timeline JSON       │                     │
│             │   Run Progress (SSE)        │                     │
│             │   Token cost breakdown      └──────────┬──────────┘
└─────────────┘                                        │
                                                       │ LLM API calls
                                              ┌────────▼────────┐
                                              │   LLM PROVIDERS  │
                                              │ (Claude/OpenAI/  │
                                              │  Gemini)         │
                                              └─────────────────┘
```

---

## Level 1 — Major Processes

Breaks the system into its 7 primary processes and shows data flows between them.

```
PRACTITIONER
     │
     │ 1. ChartInputV1 JSON
     ▼
┌────────────────────┐
│  P1                │──── chart_hash ──────────────────────────────────┐
│  CHART MANAGEMENT  │                                                  │
│  (validate +       │──── ChartInputV1 (immutable) ──────────────────► D1: Chart
│   persist chart)   │                                                  │
└────────┬───────────┘                                                  │
         │ chart_id + lagna + yogakaraka                                │
         │ 2. query_types[] + user_query                                │
         ▼                                                              │
┌────────────────────┐                                                  │
│  P2                │──── execution_plan[] ──────────────────────────► D2: PipelineRun
│  PLANNER           │     planner_output                               │
│  (resolve agents)  │                                                  │
└────────┬───────────┘                                                  │
         │ execution_plan[]                                             │
         ▼                                                              │
┌────────────────────┐                                                  │
│  P3                │◄─── ChartInputV1 ──────────────── D1: Chart      │
│  PRE-ANALYSIS      │                                                  │
│  + DASHA ENGINE    │──── alerts[] ───────────────────────────────────►│
│  (deterministic)   │──── dasha_tree ─────────────────────────────────►│
│                    │──── chart_summary (~2KB) ───────────────────────► D3: Wave1Cache
└────────┬───────────┘                                                  │
         │ alerts[] + dasha_tree + chart_summary                        │
         ▼                                                              │
┌────────────────────┐                                                  │
│  P4                │◄─── chart_summary ──────────── D3: Wave1Cache    │
│  PIPELINE ENGINE   │◄─── execution_plan[] ────────── D2: PipelineRun  │
│  (orchestrate      │                                                  │
│   18 agents)       │──── wave_deltas[] ──────────────────────────────► D4: WaveOutput
│                    │──── SSE events ─────────────────────────────────► PRACTITIONER
└────────┬───────────┘                                                  │
         │ synthesis_json                                               │
         ▼                                                              │
┌────────────────────┐                                                  │
│  P5                │                                                  │
│  REPORT RENDERER   │──── reportPath + reportHtml/Markdown ──────────► D2: PipelineRun
│  (synthesis →      │──── best-effort HTML/MD file ──────────────────► FS: reports/
│   HTML/Markdown)   │    (local/Cloud Run; not required on Vercel)     │
└────────┬───────────┘                                                  │
         │ report content                                               │
         ▼                                                              │
┌────────────────────┐                                                  │
│  P6                │◄─── reportHtml/Markdown ───── D2: PipelineRun     │
│  REPORT VIEWER     │◄─── legacy HTML/MD file ────── FS: reports/       │
│  (serve + display) │                                                  │
│                    │──── report HTML + dasha JSON ──────────────────► PRACTITIONER
└────────────────────┘                                                  │
                                                                        │
┌────────────────────┐                                                  │
│  P7                │◄─── prior 4C synthesis ──────── D4: WaveOutput   │
│  FOLLOW-UP /       │◄─── conversation history ──────── D5: RunMessage │
│  VERIFICATION      │◄─── wave1_delta ───────────────── D3: Wave1Cache │
│  (reuse + verify)  │                                                  │
│                    │──── follow-up synthesis ───────────────────────► D4: WaveOutput
│                    │──── new message ───────────────────────────────► D5: RunMessage
└────────────────────┘

┌────────────────────┐                                                  │
│  P8                │                                                  │
│  CHART COMPUTE     │                                                  │
│  + SAVE/LOAD       │                                                  │
│                    │◄─── birth data (date/time/tz/lat/lon) ────── PRACTITIONER
│  (deterministic    │                                                  │
│   engine —         │──── ComputedChart + DashaTree ────────────────► PRACTITIONER
│   no LLM)          │                                                  │
│                    │──── savedChart (chartData JSONB) ─────────────► D6: SavedChart
│                    │◄─── loadedChart ─────────────────────────────── D6: SavedChart
└────────────────────┘

┌────────────────────┐
│  P13                │
│  MARRIAGE           │◄─── bride/groom UnifiedChart pair ──────────── D7: UnifiedChart
│  MATCHMAKING        │
│  (pure, never-      │──── CompatibilityMatch (POST only) ───────────► D15: CompatibilityMatch
│   throwing)         │──── MatchResult JSON ──────────────────────────► PRACTITIONER
└────────────────────┘

Data Stores:
  D1: Chart          — immutable chart record (chart_id, lagna, chart_json, hash)
  D2: PipelineRun    — run record (status, planner_output, reportPath, reportHtml,
                       reportMarkdown, cost); DB report content is authoritative
  D3: Wave1Cache     — chart_summary, wave1_delta, dasha_tree (keyed by chart_hash)
  D4: WaveOutput     — per-agent delta output, domain tag, token counts
  D5: RunMessage     — conversation thread (role, content, run_id)
  D6: SavedChart     — persisted computed charts (birth data + full chartData JSONB + dashaTree)
  D7: UnifiedChart   — canonical chart store, column-per-domain JSONB (source=compute|paste)
  D8: DurationAnalysis — duration analysis runs (periodSlice, transitOverlay, da1-3 outputs, errorMessage)
  D9: DurationMessage  — duration analysis conversation thread (role, content, analysisId)
  D10: User            — practitioner accounts (email, passwordHash, name)
  D11: Session         — database-backed sessions (sessionToken, userId, expires)
  D12: PasswordResetToken — reset tokens (tokenHash, expiresAt, usedAt)
  D13: McpApiToken     — per-user MCP credentials (tokenHash, label, lastUsedAt, revokedAt)
  D14: OAuthClient / OAuthAuthorizationCode / OAuthAccessToken / OAuthRefreshToken
                       — MCP OAuth 2.1 authorization server (P11-OAuth); all secrets hashed at rest
  D15: CompatibilityMatch — persisted Ashtakoota + Mangal Dosha result (gunaScore, verdict, result JSONB,
                       tablesVersion, brideChartId/groomChartId → D7)
  FS: reports/       — legacy/local HTML/Markdown report files on disk (best-effort)
```

---

## Level 2 — P3: Pre-Analysis + Dasha Engine (Detail)

```
ChartInputV1 JSON
       │
       ├──────────────────────────────────────────────────────────────┐
       │                                                              │
       ▼                                                              ▼
┌─────────────────┐                                        ┌──────────────────────┐
│ RULE ENGINE     │                                        │ VIMSHOTTARI ENGINE   │
│ (11 rules)      │                                        │ computeVimshottari() │
│                 │                                        │                      │
│ Rule 1: Dignity │  Moon.sidereal_longitude               │ Input:               │
│ Rule 2: Lagna   │◄───────────────────────────────────────│  moonLong (deg)      │
│ Rule 3: FB/FM   │                                        │  birthDatetime       │
│ Rule 4: YK      │                                        │                      │
│ Rule 5: Neecha  │                                        │ Steps:               │
│ Rule 6: Strength│                                        │  1. nakshatra_idx =  │
│ Rule 7: Yoga    │                                        │     floor(long/13.33)│
│    gate         │                                        │  2. balance_years =  │
│ Rule 8: Dasha   │                                        │     (1-frac)×MD_yrs  │
│    filter       │                                        │  3. lay MD sequence  │
│ Rule 9: SadeSati│                                        │  4. compute AD/PD    │
│ Rule 10: AK     │                                        │     recursively      │
│ Rule 11: Cross  │                                        │  5. integrity check  │
│    channel      │                                        │     (sum=120yr±1day) │
└────────┬────────┘                                        └──────────┬───────────┘
         │ alerts[]                                                   │ dasha_tree
         │                                                            │
         └────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
                        ┌──────────────────┐
                        │ CHART SUMMARY    │
                        │ BUILDER          │
                        │                  │
                        │ Inputs:          │
                        │  ChartInputV1    │
                        │  alerts[]        │
                        │  dasha_tree      │
                        │                  │
                        │ Output:          │
                        │  chart_summary   │
                        │  (~2KB string)   │
                        │  stored in       │
                        │  Wave1Cache      │
                        └──────────────────┘
```

---

## Level 2 — P4: Pipeline Engine (Detail)

```
chart_summary + execution_plan[] + alerts[]
                    │
                    ▼
          ┌─────────────────┐
          │  ORCHESTRATOR   │
          │  orchestrator.ts│
          └────────┬────────┘
                   │
     ┌─────────────┼──────────────────────┐
     │             │                      │
     ▼             ▼                      ▼
  Wave 1?      Wave 1        Check Wave1Cache
  (first run)  (parallel)    (follow-up)
     │         │                      │
     │    ┌────┴──────────────────┐   │ wave1_delta (cached)
     │    │  1A  1B  1C  1D       │   │
     │    │  (parallel, 4 LLM     │   │
     │    │   calls)              │   │
     │    └────────────┬──────────┘   │
     │                 │              │
     └─────────────────┼──────────────┘
                       │ wave1_delta → Wave1Cache + WaveOutput
                       ▼
          ┌────────────────────────────┐
          │        WAVE 2              │
          │  (parallel, planner-       │
          │   selected subset)         │
          │                            │
          │  Each agent receives:      │
          │  • chart_summary           │
          │  • wave1_delta             │
          │  • pre_analysis_alerts     │
          │                            │
          │  2A  2B  2C  2D  2E  2F 2G │
          │  (up to 7 parallel LLM     │
          │   calls)                   │
          └────────────┬───────────────┘
                       │ wave2_deltas[] → WaveOutput (domain-tagged)
                       ▼
          ┌────────────────────────────┐
          │        WAVE 3              │
          │  (parallel, planner-       │
          │   selected subset)         │
          │                            │
          │  Each agent receives:      │
          │  • chart_summary           │
          │  • wave1_delta             │
          │  • relevant wave2_deltas[] │
          │    (not all — only domain- │
          │     relevant ones)         │
          │                            │
          │  3A  3B  3C  3D(cond.)     │
          └────────────┬───────────────┘
                       │ wave3_deltas[] → WaveOutput
                       ▼
          ┌────────────────────────────┐
          │        WAVE 4              │
          │  (strictly sequential)     │
          │                            │
          │  4X: CONSOLIDATION         │
          │  Input: chart_summary +    │
          │         all wave2/3 deltas │
          │  Output: fact_summary      │
          │  (~6KB) → WaveOutput       │
          │              │             │
          │              ▼             │
          │  4A: ERROR DETECTION       │
          │  Input: chart_summary +    │
          │         fact_summary       │
          │  Output: corrections[]     │
          │              │             │
          │              ▼             │
          │  4B: VALIDATION            │
          │  Input: chart_summary +    │
          │         fact_summary +     │
          │         4A_output          │
          │  Output: confidence_matrix │
          │              │             │
          │              ▼             │
          │  4C: SYNTHESIS (Opus)      │
          │  Input: chart_summary +    │
          │         fact_summary +     │
          │         4A_output +        │
          │         4B_output          │
          │  Output: synthesis_json    │
          │  (~15K tokens total input) │
          └────────────┬───────────────┘
                       │ synthesis_json → WaveOutput
                       ▼
                 REPORT RENDERER
```

---

## Level 2 — P7: Follow-up / Verification (Detail)

```
Practitioner submits follow-up query
          │ chart_id + new query_types[] + user_query
          ▼
┌──────────────────────────┐
│  Load from Wave1Cache    │
│  • chart_summary         │
│  • wave1_delta           │
│  • dasha_tree            │
│  (no re-run of Wave 1    │
│   or pre-analysis)       │
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│  Load prior context      │
│  from WaveOutput:        │
│  • prior 4C synthesis    │
│  • domain-specific       │
│    wave2/3 outputs       │
│  from RunMessage:        │
│  • full conversation     │
│    history               │
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│  PLANNER                 │
│  (follow-up mode)        │
│  ALWAYS_RUN not applied  │
│  Maps new types →        │
│  domain agents only      │
└──────────────┬───────────┘
               │ new_agent_list[]
               ▼
┌──────────────────────────┐
│  Wave 2 domain agents    │
│  (selected subset only)  │
│  Input: chart_summary +  │
│         wave1_delta      │
└──────────────┬───────────┘
               │ new wave2_deltas[]
               ▼
┌──────────────────────────┐
│  Wave 3 domain agents    │
│  (selected subset only)  │
└──────────────┬───────────┘
               │ new wave3_deltas[]
               ▼
┌──────────────────────────┐
│  4X: CONSOLIDATION       │
│  Appends new deltas to   │
│  prior fact_summary      │
│  (incremental, not full  │
│   rebuild)               │
└──────────────┬───────────┘
               │ updated fact_summary
               ▼
┌──────────────────────────┐
│  VERIFICATION AGENT      │
│  Input:                  │
│  • fact_summary          │
│  • prior 4C synthesis    │
│  • conversation_history  │
│  Output:                 │
│  • continuity_check      │
│  • contradictions[]      │
└──────────────┬───────────┘
               │
               ▼
┌──────────────────────────┐
│  4C: SYNTHESIS (Opus)    │
│  Produces follow-up      │
│  synthesis (layered —    │
│  prior synthesis stays   │
│  immutable in DB)        │
└──────────────┬───────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
  WaveOutput        RunMessage
  (new run_id)   (thread entry)
  synthesis_json   role=assistant
                   content=synthesis
```

---

## Level 2 — API ↔ Engine Data Flows

> **v1.3 note:** this flow originally ran through the legacy `Chart` model's
> `POST /api/runs` and `GET /api/charts/:id/dasha` / `GET /api/reports/:id`
> routes. Those routes had no remaining UI caller and were deleted. The
> current entry point is `POST /api/unified-charts/[id]/analyze` (see P9
> below); the SSE progress and run-detail flows are unchanged.

```
BROWSER                    API LAYER                    ENGINE / DB
   │                           │                            │
   │── POST /api/unified-      │                            │
   │   charts/:id/analyze ────►│                            │
   │   {queryTypes[],           │── read UnifiedChart ──────►│ D7: UnifiedChart
   │    userQuery, ...}         │                            │
   │                           │── create PipelineRun ─────►│ D2: PipelineRun
   │                           │── waitUntil(pipeline) ────►│ bounded serverless work
   │◄── 202 {run_id} ──────────│                            │
   │                           │                            │
   │── GET /api/runs/:id/events►│   (SSE connection open)   │
   │                           │◄── agent_start event ─────│ orchestrator
   │◄── SSE: agent_start ──────│                            │
   │◄── SSE: agent_complete ───│◄── wave_delta saved ──────│ D4: WaveOutput
   │◄── SSE: token_count ──────│                            │
   │◄── SSE: run_complete ─────│◄── synthesis saved ───────│ D4: WaveOutput
   │                           │◄── report content written ─│ D2: PipelineRun
   │                           │◄── optional file written ──│ FS: reports/
   │                           │◄── run updated ───────────│ D2: PipelineRun
   │                           │                            │
   │── GET /api/runs/:id ──────►│── read PipelineRun ───────►│ D2: PipelineRun
   │◄── run detail JSON ───────│                            │
   │                           │                            │
   │── GET /api/reports ───────►│── list done runs ──────────►│ D2: PipelineRun
   │◄── report list JSON ──────│                            │
   │                           │                            │
   │── GET /api/runs/:id/       │                            │
   │   report-content ─────────►│── read report content ─────►│ D2: PipelineRun
   │◄── markdown/HTML content ─│── legacy file fallback ────│ FS: reports/
```

---

---

## Level 2 — P8: Chart Compute + Save/Load (SUPERSEDED by P9)

This process is independent from the AI analysis pipeline. It handles real-time
astronomical chart computation from birth data.

> **v1.3 note:** the P8.2/P8.3 save-and-load steps below (via `SavedChart` and
> `/api/compute/save`, `/api/compute/charts[/id]`) are historical — those routes
> were dormant and have been deleted. Save/Load now goes through P9's
> `UnifiedChart` (`POST /api/unified-charts/from-compute`, `GET
> /api/unified-charts[/id]`). P8.1 (the compute engine itself, stateless) is
> unchanged and still lives behind `POST /api/compute`; its UI is now the
> home page (`/`, formerly `/compute`).

```
PRACTITIONER
     │
     │ Birth data (date, time, timezone, latitude, longitude, sunriseMode)
     │ POST /api/compute
     ▼
┌───────────────────────────────┐
│  P8.1                         │
│  CHART COMPUTATION ENGINE     │
│  (engine/compute/index.ts)    │
│                               │
│  computeFullChart()           │
│  • Swiss Ephemeris calls      │
│  • Planetary positions (D1)   │
│  • Divisional charts          │
│    (D1–D60: D1,D2,D3,D4,D5,   │
│    D6,D7,D9,D10,D12,D24,D30, │
│    D60), each placement +     │
│    dignity/vargottama         │
│  • Nakshatras                 │
│  • Chara Karakas              │
│  • Ashtakavarga               │
│  • Upagrahas                  │
│  • Special Lagnas             │
│  • Arudha Padas               │
│  • Pinda Strength             │
│  • Transits + Sade Sati       │
│    (sign-based + degree-based │
│    via moon.longitude → 7th   │
│    arg to computeTransits)    │
│                               │
│  computeVimshottari()         │
│  • Full dasha tree            │
└──────────────┬────────────────┘
               │ ComputedChart + DashaTree (JSON)
               │
               │─────────────────────────────────────► PRACTITIONER (Chart Compute UI, `/`)
               │
               │ (User clicks "Save Chart" — now via P9, see below)
               │ POST /api/unified-charts/from-compute
               ▼
              (See "Level 2 — P9: Unified Chart Ingestion + Analyze" —
               persists to UnifiedChart, not the legacy SavedChart table.)
```

### Data flows within Compute engine (P8.1):

```
BirthInput
    │
    ├─► Swiss Ephemeris (swisseph-v2) → Julian Day, Ayanamsa
    │
    ├─► computeAscendant()           → Lagna longitude, sign
    │
    ├─► computePlanetPositions()     → PlanetPosition[] (9 grahas)
    │       │
    │       ├─► computeNakshatras()  → NakshatraInfo[]
    │       ├─► computeDivisionalCharts() → DivisionalChart[] (D1–D60)
    │       │       └── Each varga gets:
    │       │           • planet placements (+ dignity, vargottama
    │       │             via engine/compute/dignity.ts)
    │       │           • arudha padas (per-varga)
    │       │           • special lagnas (projected)
    │       │           • upagrahas (projected)
    │       ├─► computeCharaKarakas() → CharaKaraka[]
    │       ├─► computeAshtakavarga() → BAV/SAV (sign-indexed) + byHouse
    │       │       (house-indexed, house 1 = lagna)
    │       ├─► computeUpagrahas()   → Upagraha[]
    │       ├─► computeSpecialLagnas() → SpecialLagna[]
    │       ├─► computeArudhaPadas() → ArudhaPada[]
    │       ├─► computePindaStrength() → PindaStrengthEntry[]
    │       └─► computeTransits(moonSign, lagnaSign, birthYear,
    │               asOfDate, lat, lon, moon.longitude)
    │               → TransitAnalysis
    │                 ├── sadeSati (sign-based, isCurrent from asOfDate)
    │                 ├── sadeSatiByDegree? (±45° of natal Moon,
    │                 │     138-day merge, populated only when
    │                 │     natalMoonLongitude supplied — i.e. from
    │                 │     computeFullChart; absent from transitOverlay)
    │                 ├── moonTransits[], ascendantTransits[]
    │                 └── ashtamaShani, kantakaShani
    │
    ├─► computeDivisionalCharts() calls dignity.ts:
    │       getVargaDignityLabel(planet, sign, d1Map, degreeInSign?)
    │       └── D1 only: passes planet.longitude % 30 as degreeInSign
    │           (D2–D60 keep whole-sign rule; no varga longitude exists)
    │
    ├─► computeVimshottari(moonLong, birthDate) → DashaTree
    └─► computeCharaDasha(planets, lagnaSign, birthDate) → CharaDashaResult
        (Jaimini rasi dasha; /api/compute sibling, like DashaTree)
```

### P8.4 — Varshaphal (Tajika annual solar-return chart) — on demand

Independent, stateless flow triggered from the `/compute` **Varshaphal** tab.

```
PRACTITIONER (Varshaphal tab: birth data + varshaYear)
     │ POST /api/compute/varshaphal
     ▼
┌───────────────────────────────────────────┐
│  computeVarshaphal() (engine/compute/       │
│  varshaphal.ts)                             │
│                                             │
│  • natal Sun sidereal longitude             │
│  • findSolarReturnJulianDay()   → Varsha    │
│    Pravesh instant (Newton on Sun long.)    │
│  • julianDayToLocalCivil()      → date/time │
│  • computeFullChart(annual)     → annual    │
│    chart (planets, Varsha Lagna, vargas,    │
│    Shadbala, …)                             │
│  • computeMuntha()  (+1 sign/year)          │
│  • computePanchavargeeyaBala()  (7 planets) │
│  • computeVarshesha() (5 candidates → lord) │
└──────────────┬──────────────────────────────┘
               │ VarshaphalResult (JSON)
               ▼
         PRACTITIONER (/compute Varshaphal tab)
```

No DB writes. Reuses `computeFullChart` for the annual chart (so the annual
Shadbala is the same engine as the natal). Method/caveats are surfaced in the
`method` field of the result.

---

## Level 2 — P9: Unified Chart Ingestion + Analyze (NEW)

Backs the **Generate Chart** and **AI Analysis** features. Chart data lands in the
`UnifiedChart` store (`D7`) via one of two ingestion paths, then AI Analysis runs
directly against that record.

```
PRACTITIONER
     │
     ├── Path A: birth data (date/time/tz/lat/lon/sunriseMode)
     │   POST /api/unified-charts/from-compute
     │        │
     │        ▼
     │   ┌────────────────────────────┐
     │   │ P9.1  COMPUTE + MAP         │
     │   │ computeFullChart()          │  (Swiss Ephemeris — deterministic)
     │   │ computeVimshottari()        │
     │   │ mapComputedToUnified()      │  (lib/chart-mapper.ts)
     │   └──────────────┬─────────────┘
     │                  │ UnifiedChart(source="compute", all domain columns)
     │                  ▼
     │            D7: UnifiedChart
     │
     └── Path B: ChartInputV1 JSON
         POST /api/unified-charts/from-paste
              │
              ▼
         ┌────────────────────────────┐
         │ P9.2  VALIDATE + MAP        │
         │ validateChartInput()        │
         │ mapPastedToUnified()        │
         └──────────────┬─────────────┘
                        │ UnifiedChart(source="paste", chartInputV1; domains null)
                        ▼
                  D7: UnifiedChart
                        │
                        │ (dedup on chartHash; 409 if exists)
                        │
                        │ POST /api/unified-charts/[id]/analyze
                        ▼
         ┌───────────────────────────────────────────────┐
         │ P9.3  ANALYZE (AI pipeline launcher)           │
         │                                               │
         │ • build ChartInputV1:                         │
         │     paste   → stored chartInputV1             │
         │     compute → buildChartInputV1FromUnified()  │
         │ • ensure legacy Chart row (by chartHash) ─────┼──► D1: Chart
         │ • computeVimshottari + preAnalysis +          │
         │   buildChartSummary                           │
         │ • resolvePlan(); compute path → strip Wave 1  │
         │ • wave1_delta:                                │
         │     compute → from D7 domain columns          │
         │     paste   → from D3 Wave1Cache (or run W1)  │
         │ • optional modelOverride → upsert ────────────┼──► model_config
         │ • create PipelineRun(chartId, unifiedChartId) ┼──► D2: PipelineRun
         │ • register executePipeline() with waitUntil() │
         │   (maxDuration-bound serverless work)         │
         └──────────────┬────────────────────────────────┘
                        │ 202 { runId, waveStrategy, executionPlan }
                        ▼
                  waitUntil(executePipeline())  ──►  P4: Pipeline Engine (Waves 2–4)
                        │                  (Wave 1 only for paste path)
                        ▼
                  D4: WaveOutput → P5: Report Renderer → D2 report content
```

**Wave strategy summary:**

| `source` | Wave 1 | `wave1_delta` origin | `wave1Source` flag |
|---|---|---|---|
| `compute` | skipped (agents stripped from plan) | deterministic domain columns in `D7` | `"compute"` |
| `paste` | full LLM Wave 1 (unless cached) | `D3: Wave1Cache` or fresh Wave 1 run | `"llm"` |

---

## Level 2 — P10: Duration Analysis (NEW in v1.2)

Focused 3-agent sequential pipeline for date-range / domain-specific analysis.
Completely independent from the 18-agent wave pipeline.

Categories: health | career | wealth | marriage | property | cashflow.
The domain step (P10.4) is registry-driven: `DOMAIN_AGENT_REGISTRY`
(engine/durationAnalysis/registry.ts) resolves the category's agent id
(DA1-HEALTH … DA1-CASHFLOW), prompt file, model_config row, divisional charts,
and extra chart columns before the pipeline runs.

```
PRACTITIONER
     │ POST /api/duration-analysis
     │ { unifiedChartId, dateFrom, dateTo, category, symptoms?, userQuestion? }
     ▼
┌───────────────────────────┐
│ P10.1  API ROUTE           │──► create DurationAnalysis (status=queued) ──► D8
│  • validate (10yr cap,    │
│    dashaTree not null)    │──► create DurationMessage if userQuestion ───► D9
│  • waitUntil(pipeline) before│
│    returning 202 (bounded) │
└───────────────┬───────────┘
                │ 202 { analysisId }
                ▼ (background work, bounded by maxDuration)
┌───────────────────────────┐
│ P10.2  STEP 0a — SLICER   │◄─── dashaTree, planets, nakshatras ────── D7: UnifiedChart
│  sliceDashaTree() pure TS │
│  • MD/AD/PD overlap filter│
│  • Lord annotations        │──► DashaSlice[] (with lordAnnotations,
│    (nakshatra, combustion, │      activatedYogas, ownsHouses, ...)
│    yogas, ownsHouses)     │
│  • Truncate to 200        │──► periodSlice + truncated flag
│  • empty → FAIL FAST      │      (no LLM call; hint: db:backfill-pd)
└───────────────┬───────────┘
                │
                ▼
┌───────────────────────────┐
│ P10.3  STEP 0b — TRANSIT  │◄─── transits, ashtakavarga ─────────── D7: UnifiedChart
│  buildTransitOverlay()    │
│  • Per unique AD boundary │──► calls computeTransits() [Swiss Eph]
│  • Saturn/Jup/Rahu/Ketu   │
│  • BAV scores from bav[]  │──► TransitOverlay[] → stored ──────────► D8
│  • Sade Sati from stored  │
│    allPeriods             │
│  • ashtamaShani, kantaka  │
└───────────────┬───────────┘
                │ periodSlice + transitOverlay persisted ──────────────► D8
                ▼
┌───────────────────────────┐
│ P10.4  DA-1 DOMAIN AGENT  │◄─── category-scoped chart data ──────── D7
│  (DA1-<DOMAIN>, registry- │      (registry: divisions + extra columns;
│   resolved prompt/model)  │       dashaTree stripped from prompt)
│  [Claude Sonnet, temp 0.3]│──► read DA1-<DOMAIN> model config ─── model_config
│  • BATCHED: ≤25 periods + │
│    matching overlays/call │──► callAgentJson(per-batch prompt)
│    (lenient JSON + 1 retry)│
│  • mergeDA1Outputs()      │
│  • Post-LLM: merge        │
│    transitContext +       │──► da1Output (merged, enriched) ────────► D8
│    lordAnnotations back   │
└───────────────┬───────────┘
                │
                ├── symptoms present? ───────► P10.5
                │
                └── no symptoms ─────────────► P10.6
                ▼
┌───────────────────────────┐
│ P10.5  DA-2 SYMPTOM       │◄─── da1Output ──────────────────────── D8
│  VALIDATOR (CONDITIONAL)  │
│  [Claude Sonnet, temp 0.0]│──► callLLM(DA-2 prompt)
│                           │──► da2Output ──────────────────────────► D8
│  GATE: found===false?     │
│    YES → status=           │
│      symptom_unmatched    │──────────────────────────────────────────► D8
│      SSE symptom_gate     │──────────────────────────────────────────► PRACTITIONER
│      STOP (overridable)   │
│    NO  → continue to DA-3 │
└───────────────┬───────────┘
                │
                ▼
┌───────────────────────────┐
│ P10.6  DA-3 FUTURE        │◄─── da1Output, da2Output, messages ─── D8, D9
│  ANALYSER                 │
│  [Claude Sonnet, temp 0.3]│──► callLLM(DA-3 prompt)
│                           │──► da3Output ──────────────────────────► D8
│  contextSummary generated │──► contextSummary (deterministic) ──────► D8
│  (no LLM, ~500 tokens)    │
│  status = done            │──────────────────────────────────────────► D8
│                           │──► assistant DurationMessage ──────────► D9
│  SSE run_complete ────────┼──────────────────────────────────────────► PRACTITIONER
└───────────────────────────┘

Override path (POST /api/duration-analysis/[id]/override):
  status=symptom_unmatched → set overrideApplied=true → resume P10.6 with mismatch note in prompt

Cancel path (POST /api/duration-analysis/[id]/cancel):
  status in queued|running|symptom_unmatched → status=cancelled ──► D8
  pipeline checks the flag between steps (per DA-1 batch, before DA-2/DA-3) and unwinds
  SSE run_cancelled ──► PRACTITIONER

Follow-up chat (POST /api/duration-analysis/[id]/chat):
  Load D8 (da1/da2/da3 outputs) + D9 (messages) → build DA-3 prompt →
  use contextSummary when history depth > 2 → callLLM → D9 message + D8 totals updated
```

---

## Level 2 — P11: MCP Server (Claude Desktop, no paid LLM)

The MCP server (`mcp/`) is a separate stdio process. It moves the *reasoning* into
Claude Desktop and only ever reads deterministic data + rubrics from the app — it
never triggers P4 or P10 (the paid LLM pipelines).

```
CLAUDE DESKTOP
     │  MCP (stdio): tools / resources / prompts
     ▼
┌─────────────────────┐
│  P11  MCP SERVER    │   thin HTTP client — no astrology logic, no LLM
│  (mcp/, Node)       │
└─────┬───────────────┘
      │ HTTP (localhost, optional x-mcp-token)
      ├──────────────► GET  /api/unified-charts[/id]     (D: UnifiedChart)   read
      ├──────────────► POST /api/compute[/varshaphal]    (stateless compute) no DB, no LLM
      ├──────────────► POST /api/gochar ─────────────────► UTC Lahiri whole-sign Gochar range
      │                                                    (saved-chart scalar read or in-memory natal context;
      │                                                    no DB write, no LLM)
      ├──────────────► POST /api/timeline ───────────────► P10.2 slicer + P10.3 overlay
      │                                                    + deterministic scorePeriod + identifyPeaks
      │                                                    + buildPeriodInsights (driver digest) + domainContext
      │                                                    (NO DA-1/2/3, NO LLM)
      ├──────────────► POST /api/matchmaking/preview ────► P13.1 + P13.2 (Ashtakoota + Mangal Dosha,
      │                                                    NO D15 write — compute_match tool only calls
      │                                                    /preview, never POST /api/matchmaking)
      ├──────────────► GET  /api/knowledge/**  ──────────► prompts/domains + prompts/agents (readPromptFile)
      └──────────────► GET  /api/reports, /api/runs/[id], /api/duration-analysis[/id]   read-only

  Claude Desktop then reasons over the returned numbers using the returned rubric
  and writes the reading — billed to the Desktop subscription, $0 API.

  ✗ P11 never calls POST /api/unified-charts/[id]/analyze  (P4)
  ✗ P11 never calls POST /api/duration-analysis            (P10 create)
     Enforced by tests/mcp-cost-guard.test.ts.
```

**P11 data flows**

| Flow | From → To | Payload |
|---|---|---|
| discover | P11 → UnifiedChart | list/detail (read) |
| compute | P11 → compute engine | ComputedChart + dashaTree (stateless) |
| gochar | P11 → `/api/gochar` | UTC Lahiri whole-sign occupancy intervals; Moon opt-in |
| timeline | P11 → `/api/timeline` | scored MD/AD/PD periods + peaks + transit overlay |
| knowledge | P11 → `/api/knowledge` | domain/framework rubric text (include-expanded) |
| reports | P11 → runs / duration reads | already-generated results (no new cost) |

### P11-HTTP: the same tools, reachable remotely (`POST /api/mcp`, NEW)

A second transport for the exact same `mcp/src/{tools,resources,prompts}.ts`
code — not a second process. `app/api/mcp/route.ts` lives **inside** the main
Next.js app (unlike P11's separate `mcp/` stdio process) and is reachable by
any remote MCP client, not just a locally-running Claude Desktop:

```
REMOTE MCP CLIENT
     │  MCP (Streamable HTTP): Authorization: Bearer <token>
     ▼
┌─────────────────────────┐
│  POST /api/mcp           │  Next.js Route Handler — stateless,
│  (app/, same process)    │  fresh McpServer per request
└─────┬────────────────────┘
      │ HTTP (self: VEDICMOJO_INTERNAL_BASE_URL, falling back to
      │       new URL(request.url).origin only when unset — see
      │       mcp/README.md "Deploying it behind a proxy"; forwarded x-mcp-token)
      └──────────────► same GET/POST targets as P11 above ──────────────►

  ✗ Same guarantee as P11 — never calls P4's analyze route or P10's create
     route, because it's the same mcp/src/tools.ts, covered by the same
     tests/mcp-cost-guard.test.ts (a static scan of mcp/src, transport-
     agnostic).
```

The only structural difference from P11: the API client (token + base URL)
is built **per HTTP request** from the caller's own `Authorization` header,
instead of once at process startup from `MCP_TOKEN`/`VEDICMOJO_BASE_URL` env
vars — because one shared endpoint serves many users concurrently, where the
stdio process only ever serves the one user Claude Desktop was configured
for.

### P11-OAuth: MCP OAuth 2.1 authorization server (NEW in v1.7)

A second, additional way to get a token for P11-HTTP — P12.2's manual
`McpApiToken` flow is unaffected. Lets an OAuth-aware remote client (e.g.
claude.ai's "Add custom connector") obtain a token via browser login +
consent instead of copy-pasting one from `/account`. Hand-rolled Next.js
Route Handlers (no Express) backed by a new store, **D14**.

```
REMOTE MCP CLIENT                          BROWSER (same user)
     │ 1. POST /api/mcp, no token               │
     ▼                                          │
  401 + WWW-Authenticate: Bearer                │
    resource_metadata="…/.well-known/           │
    oauth-protected-resource/api/mcp"            │
     │                                          │
     │ 2. GET that URL (RFC 9728)               │
     │ 3. GET .well-known/oauth-authorization-  │
     │    server (RFC 8414) → endpoint list     │
     │ 4. POST /api/oauth/register (RFC 7591)   │
     │    → client_id (public/PKCE-only)        │
     │                                          │
     │ 5. open authorization_endpoint ─────────►│  GET /oauth/authorize?client_id=…
     │                                          │  (Server Component: session check,
     │                                          │   phase-1 client_id/redirect_uri
     │                                          │   exact-match, phase-2 PKCE/S256)
     │                                          │  → consent form → user clicks Allow
     │                                          │  POST /api/oauth/authorize-decision
     │                                          │  (re-validates client_id/redirect_uri)
     │                                          │  → D14.OAuthAuthorizationCode (hashed)
     │◄─── redirect_uri?code=…&state=… ─────────┤
     │                                          
     │ 6. POST /api/oauth/token                  
     │    grant_type=authorization_code          
     │    (atomic single-use claim, PKCE verify) 
     ▼                                          
  { access_token: mcp_oat_…, refresh_token: mcp_ort_…, … }
     │                                          
     │ 7. POST /api/mcp, Authorization: Bearer mcp_oat_…
     ▼                                          
  same GET/POST targets as P11 above (lib/mcpAuth.ts's resolveMcpUser
  branches to D14.OAuthAccessToken by the mcp_oat_ prefix, else D13.McpApiToken)
```

`POST /api/oauth/token`'s `refresh_token` grant rotates on every use (same
atomic-claim pattern, applied to `D14.OAuthRefreshToken`); `POST
/api/oauth/revoke` (RFC 7009) always returns 200. Known v1 simplification: no
refresh-token-family tracking (a replayed, already-rotated refresh token is
rejected on that one request, not cascade-revoked).

---

## Level 2 — P12: User Management & Auth (NEW in v1.5)

```
PRACTITIONER (browser)                          CLAUDE DESKTOP (MCP)
     │ email + password                                │ x-mcp-token header
     ▼                                                  ▼
┌─────────────────────┐                        ┌─────────────────────┐
│ P12.1 CREDENTIAL     │                        │ P12.2 MCP TOKEN      │
│ AUTH (signup/login/  │──── Session row ─────► │ RESOLUTION           │
│ logout/forgot/reset) │      D11: Session      │ (resolveMcpUser)     │
│ bcrypt hash+verify    │──── User row ────────► │──── userId ─────────► (falls back into
│ (bypasses Auth.js's   │      D10: User         │      or null          resolveRequestUser
│  signIn()/signOut())  │──── reset token ─────► │                       when no session
│                       │      D12: PasswordReset│                       cookie is present)
└──────────┬────────────┘      Token             └───────────┬──────────┘
           │ session cookie                                  │ D13: McpApiToken
           ▼ (authjs.session-token)                           │ (tokenHash → userId,
┌──────────────────────────────────────────────┐              │  lastUsedAt update)
│ P12.3 resolveRequestUser (lib/auth.ts)         │◄────────────┘
│ session cookie → auth() ─┐                     │
│                          ├─► userId (or null) ─┼───► every ownership check in
│ no session → P12.2 ──────┘                     │     P1/P8/P9/P10/P11 (404 on
└────────────────────────────────────────────────┘     mismatch, never 403)

  MCP token issuance is a session-gated WEB action, not something P11 (the
  MCP process) calls itself:
  PRACTITIONER → POST /api/account/mcp-token (session-only, P12.1's session
  required) → raw token shown once → D13: McpApiToken (hash only, stored).
  This is why P11's HTTP client code (mcp/src/http.ts, mcp/src/tools.ts)
  needed ZERO changes — it already sent an opaque x-mcp-token string; only
  what that string resolves to changed.
```

**P12 data flows**

| Flow | From → To | Payload |
|---|---|---|
| signup/login | Practitioner → P12.1 → D10/D11 | email, bcrypt hash, session row |
| logout | Practitioner → P12.1 → D11 | delete session row |
| forgot/reset | Practitioner → P12.1 → D10/D12 | reset token hash, new password hash; deletes ALL D11 rows for that user |
| mcp token issuance | Practitioner (session) → D13 | raw token (shown once), hash persisted |
| mcp identity resolution | P11 → P12.2 → D13 | `x-mcp-token` → userId, `lastUsedAt` touch |
| ownership gate | P1/P8/P9/P10/P11 → P12.3 | userId resolved once per request, reused for every ownership check |

---

## Level 2 — P13: Marriage Matchmaking (NEW in v1.8)

A pure, never-throwing engine — no ephemeris, LLM, network, DB, or file I/O.
Reads two `UnifiedChart` rows and produces a fractional `gunaScore` + Mangal
Dosha verdict; only the `POST /api/matchmaking` variant writes to D15.

```
PRACTITIONER
     │ POST /api/matchmaking { brideChartId, groomChartId, label? }
     │ (or POST /api/matchmaking/preview — identical, no D15 write)
     ▼
┌───────────────────────────┐
│ P13.1  OWNERSHIP + INPUT  │◄─── moonLongitude, planets, lagna, ──────── D7: UnifiedChart
│  RESOLUTION                │      relationships.aspects (bride + groom)
│  • both charts must        │
│    resolve to caller       │
│    (404 on either          │
│    mismatch, no leak)      │
│  • longitudeToNakshatra-   │
│    PadaRashi() per chart   │
│  • MangalNativeInput only  │
│    when source="compute"   │
│    (else omitted → the     │
│    Mangal koota reports    │
│    'unavailable', never    │
│    'matched')               │
└──────────────┬─────────────┘
               │ MatchNativeInput × 2 (+ optional MangalNativeInput × 2)
               ▼
┌───────────────────────────┐
│ P13.2  computeMatch()      │
│  (engine/compute/          │
│   matchmaking.ts)          │
│                            │
│  computeAshtakootaMatch:   │
│   8 kootas in fixed order  │
│   (Varna→Nadi), each       │
│   error-contained          │
│   individually             │
│  computeMangalDosha:       │
│   per native, 3 reference  │
│   points (lagna/Moon/Venus)│
│                            │
│  → gunaScore (fractional,  │
│    never rounded), verdict,│
│    mangalDoshaCompat-      │
│    ibility, boundaryRisk,  │
│    limitations             │
│  stamped: tablesVersion    │
│  (MATCHMAKING_TABLES_      │
│   VERSION)                 │
└──────────────┬─────────────┘
               │ MatchResult JSON
               ├── POST /api/matchmaking only ──► D15: CompatibilityMatch
               │     (gunaScore, verdict denormalized; result = full snapshot)
               ▼
         PRACTITIONER (`/matchmaking/[id]` renders D15.result verbatim — never
         recomputed, OD-5)

DELETE /api/unified-charts/[id] (chart-delete cascade fix, regression
  prevention): compatibilityMatch.deleteMany({ brideChartId: id OR
  groomChartId: id }) runs BEFORE the chart delete, in the same
  $transaction as the pre-existing pipeline-run cascade — Prisma does not
  cascade FKs automatically, so a CompatibilityMatch FK without this fix
  would turn "delete a matched chart" into a 500.

DELETE /api/matchmaking/[id]: plain delete, no dependents ──► D15
```

**P13 data flows**

| Flow | From → To | Payload |
|---|---|---|
| chart resolution | P13.1 → D7 | ownership-checked read of both charts |
| score (persist) | P13.2 → D15 | `CompatibilityMatch` row (POST only) |
| score (preview) | P13.2 → PRACTITIONER / P11 | `MatchResult` JSON, not persisted |
| cascade | P1 (chart delete) → D15 | dependent match rows deleted first |

---

## Data Dictionary

| Data Item | Format | Size (approx) | Source | Consumers |
|---|---|---|---|---|
| `ChartInputV1` | JSON | ~30KB | Practitioner (input) | Pre-analysis, Chart table |
| `chart_summary` | String | ~2KB | chartSummary.ts | All 18 agents |
| `alerts[]` | JSON array | ~1KB | pre_analysis.ts | All agents via chart_summary |
| `dasha_tree` | JSON | ~5KB | computeVimshottari.ts | 3A, 4C, Dasha UI |
| `wave1_delta` | JSON | ~8KB | Agents 1A–1D | Wave 2 agents, Wave1Cache |
| `wave2_delta` (per agent) | JSON | ~4–6KB each | Agents 2A–2G | Wave 3 agents, 4X |
| `wave3_delta` (per agent) | JSON | ~4–6KB each | Agents 3A–3D | 4X |
| `fact_summary` | JSON | ~6KB | Agent 4X | 4A, 4B, 4C |
| `corrections[]` | JSON array | ~2KB | Agent 4A | 4B, 4C |
| `confidence_matrix[]` | JSON array | ~3KB | Agent 4B | 4C |
| `synthesis_json` | JSON | ~15KB | Agent 4C | Report renderer, RunMessage |
| `HTML report` | TEXT (primary) + optional file | ~50–150KB | renderer.ts | PipelineRun.reportHtml, browser; FS fallback |
| `Markdown report` | TEXT (primary) + optional file | ~20–100KB | renderer.ts | PipelineRun.reportMarkdown, browser; FS fallback |
| `conversation_history` | JSON array | ~2KB/turn | RunMessage table | Verification Agent |
| `ComputedChart` | JSON (JSONB) | ~80–120KB | computeFullChart() | SavedChart.chartData, UnifiedChart domains, /compute UI |
| `DashaTree` (serialized) | JSON (JSONB) | ~5KB | computeVimshottari() | SavedChart.dashaTree, UnifiedChart.dashaTree, /compute UI |
| `UnifiedChart` (domain columns) | JSONB per domain | ~80–120KB total | chart-mapper.ts | Unified chart UI, AI Analysis (`wave1_delta` on compute path) |
| `shadbala` / `relationships` / `jaimini` / `bhavaBala` | JSON (JSONB) | ~4–15KB each | engine/compute deterministic modules | UnifiedChart columns, Wave 2 agents (compute path 1C/1D substitute) |
| `TransitAnalysis.sadeSatiByDegree` | JSON (nested) | ~2KB | computeDegreeSadeSati() via computeTransits(…, moon.longitude) | UnifiedChart.transits (Json), SadeSatiPanel UI. Not passed to transitOverlay.ts |
| `DashaSlice[]` (with annotations) | JSON (JSONB) | ~30–80KB (200 entries) | slicer.ts | DurationAnalysis.periodSlice; DA-1 prompt |
| `TransitOverlay[]` | JSON (JSONB) | ~5–15KB (one entry per AD boundary) | transitOverlay.ts | DurationAnalysis.transitOverlay; DA-1 prompt |
| `DA1Output` | JSON (JSONB) | ~20–50KB | DA-1 agent + post-merge | DurationAnalysis.da1Output; DA-2/DA-3 prompts |
| `DA2Output` | JSON (JSONB) | ~2–5KB | DA-2 agent | DurationAnalysis.da2Output; symptom gate |
| `DA3Output` | JSON (JSONB) | ~10–30KB | DA-3 agent | DurationAnalysis.da3Output; report UI |
| `contextSummary` | TEXT | ~500 tokens (~2KB) | index.ts (deterministic) | DurationAnalysis.contextSummary; DA-3 chat follow-up prompts |
| `OAuthAuthorizationCode` / `OAuthAccessToken` / `OAuthRefreshToken` (raw values) | opaque string | ~64 bytes each | app/api/oauth/{authorize-decision,token}/route.ts | Remote MCP client; hashed at rest in D14, raw value never persisted |
| `MatchResult` | JSON (JSONB) | ~3–6KB | matchmaking.ts's `computeMatch()` | D15.result (POST only); `/matchmaking/[id]` UI; `compute_match` MCP response (preview, not persisted) |
