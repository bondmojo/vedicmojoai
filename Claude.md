# VedicMojoAI — Claude Desktop Guide

**Version:** 1.0
**Last updated:** 2026-07-05

This file orients Claude Desktop (and any AI assistant) working on VedicMojoAI. It
mirrors the guidance in `Agents.md` and the Kiro AI Skills (`.kiro/skills/`) so the
project has full context outside the Kiro IDE.

---

## What this project is

VedicMojoAI is a single-practitioner internal web app that computes Vedic astrology
charts and runs a multi-wave LLM analysis pipeline over them, producing interactive
HTML reports. It is one **Next.js 14 (App Router, TypeScript)** monorepo — UI, API
routes, the deterministic compute engine, the LLM pipeline, and the report renderer
all live in one project and one deployment.

### Four practitioner-facing features

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

---

## Architecture at a glance

```
Browser (Next.js UI)                         Claude Desktop
  → Next.js API routes (/app/api)  ◄──HTTP──   → MCP server (mcp/, stdio, no LLM)
    → Engine (/engine): compute (deterministic) + pipeline (LLM) + renderer
      → LLM providers (Anthropic / OpenAI via Vercel AI SDK)
  → PostgreSQL (Prisma) + HTML reports on disk
```

### MCP server (`mcp/`) — Claude Desktop path, $0 API

A **separate stdio process** (its own package under `mcp/`) that exposes the
deterministic engine (Tools), the domain rubrics (Resources), and ready-to-run
analysis workflows (Prompts) to Claude Desktop, so the *reasoning* is billed to the
Desktop subscription, not the API. It is a thin HTTP client of the app and
**deliberately never calls the paid pipelines** (`analyze`, `duration-analysis`
POST) — enforced by `tests/mcp-cost-guard.test.ts`. Backed by two new read-only,
no-LLM routes: `POST /api/timeline` (deterministic period scoring) and
`GET /api/knowledge/**` (rubrics). Details: `mcp/README.md`, HLD §3.9, DFD P11.

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

---

## Key directories

```
app/            Next.js App Router (pages + /api routes)
  compute/        Generate Chart UI + chart visualization components
  unified-charts/ Unified chart list, detail, and AI Analysis launcher
  runs/[id]/      Run progress (SSE) + report viewer
  api/            Route handlers (charts, compute, unified-charts, runs, reports, health)
engine/         Pipeline + deterministic compute
  compute/        Swiss Ephemeris modules (pure functions, no DB)
  waves/          wave1–wave4 utilities
  orchestrator.ts planner.ts llm.ts pre_analysis.ts computeVimshottari.ts renderer.ts
lib/            db.ts, validation.ts, errors.ts, types.ts, chart-mapper.ts, mcpAuth.ts
prisma/         schema.prisma, migrations, seed.ts
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
npm run db:studio    # Prisma Studio
npm run docker:up    # docker-compose up -d (Postgres + app)
npm run docker:down  # docker-compose down

# MCP server (separate package under mcp/)
cd mcp && npm install         # first time
cd mcp && npm run build       # → dist/server.js (point Claude Desktop here)
cd mcp && node smoke-test.mjs # live wiring check (app must be running)
```

Environment: copy `.env.example` to `.env`. Requires `DATABASE_URL` and provider API
keys (Anthropic / OpenAI). Models/providers are resolved at runtime from the
`model_config` table, so provider swaps need no code change. The MCP server reads
`VEDICMOJO_BASE_URL` (default `http://localhost:3000`) and optional `MCP_TOKEN`.

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

Keep the three feature areas — Generate Chart, AI Analysis, Reporting — accurately
described across all of these documents.
