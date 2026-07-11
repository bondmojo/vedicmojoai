# VedicMojoAI — High Level Design (HLD)

**Version:** 1.2
**Last updated:** 2026-07-07
**Status:** Draft

> **Maintenance rule:** Any change to architecture, data flow, routes, pages, or the
> engine must be reflected here **and** in the AI Skills (`.kiro/skills/`), ERD, and DFD
> in the same change. See `Agents.md → Documentation Maintenance`.

## What changed in v1.1

The system now organizes around three practitioner-facing features.
(See full details in v1.1 below.)

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
  `nakshatraRelationships.ts` — plus `D2`, `D3`, `D12` divisional charts.
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
│  POST /api/runs   GET /api/runs/:id/events   GET /api/charts    │
│  GET /api/charts/:id/dasha   GET /api/reports/:id               │
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
│   - Chart                          - reports/{slug}.html        │
│   - PipelineRun                    - prompts/agents/*.md        │
│   - WaveOutput                     (prompt files read-only)     │
│   - Wave1Cache                                                  │
│   - RunMessage                                                  │
│   - ModelConfig                                                 │
│   - SavedChart (computed charts)                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Descriptions

### 3.1 UI Layer (`/app`)

| Page | Route | Purpose |
|---|---|---|
| Chart List | `/` | Lists all submitted charts — client name, lagna, run count, last run |
| Chart Detail | `/charts/[id]` | Chart summary, run history, "New Run" button, dasha timeline |
| New Run | `/charts/[id]/run` | Query type selector, free-text field, agent preview, run button |
| Run Progress | `/runs/[id]` | Live SSE stream — per-agent status, token count, cost running total |
| Report Viewer | `/runs/[id]/report` | Tabbed HTML report: Health / Wealth / Career / Marriage / Property / Dasha |
| Dasha Timeline | `/charts/[id]/dasha` | Interactive lifetime dasha viewer (mahadasha → antardasha → pratyantar) |
| Chart Compute | `/compute` | Real-time chart computation from birth data + Save/Load computed charts |
| Unified Charts | `/unified-charts` | Generate Chart hub — list unified charts (compute + paste), filter, open |
| Unified Chart Detail | `/unified-charts/[id]` | Full domain view of a unified chart + run history |
| Unified Chart Analyze | `/unified-charts/[id]/analyze` | AI Analysis launcher — query-type + agent selection, model override, 202 redirect |
| Duration Analysis Form | `/duration-analysis` | Date range + category + optional symptoms + question → launches 3-agent pipeline |
| Duration Analysis Results | `/duration-analysis/[id]` | Live SSE progress, period table (DA-1), symptom gate, DA-3 forecast, follow-up chat |

### 3.2 API Layer (`/app/api`)

| Route | Method | Purpose |
|---|---|---|
| `/api/charts` | GET, POST | List charts / submit new chart |
| `/api/charts/[id]` | GET | Chart detail + run history |
| `/api/charts/[id]/dasha` | GET | Computed dasha tree (current period derived at request time) |
| `/api/compute` | POST, GET | Compute a full Vedic chart from birth data (stateless) |
| `/api/compute/save` | POST | Save a computed chart to the database (with dedup via input hash) |
| `/api/compute/charts` | GET | List all saved computed charts (metadata only) |
| `/api/compute/charts/[id]` | GET, DELETE | Load or delete a single saved computed chart |
| `/api/unified-charts` | GET | List unified charts (filters: `search`, `lagna`, `source`) + run counts |
| `/api/unified-charts/from-compute` | POST | **Generate Chart (Path A)** — compute from birth data, persist as `source="compute"` |
| `/api/unified-charts/from-paste` | POST | **Generate Chart (Path B)** — validate + persist pasted `ChartInputV1` as `source="paste"` |
| `/api/unified-charts/[id]` | GET, DELETE | Load full domain data / delete a unified chart (cascades runs) |
| `/api/unified-charts/[id]/analyze` | POST | **AI Analysis** — start pipeline on a unified chart (202 + run_id); skips Wave 1 for compute source |
| `/api/duration-analysis` | POST | **Duration Analysis** — create run for date range + category (202 + analysisId) |
| `/api/duration-analysis/[id]` | GET | Full Duration Analysis record with all agent outputs and messages |
| `/api/duration-analysis/[id]/events` | GET | SSE stream for DA pipeline progress |
| `/api/duration-analysis/[id]/chat` | POST | Follow-up question to DA-3 with conversation history |
| `/api/duration-analysis/[id]/override` | POST | Override symptom gate and resume to DA-3 |
| `/api/runs` | POST | Start a new pipeline run against a legacy `Chart` (returns 202 + run_id) || `/api/runs/[id]` | GET | Run status, planner output, per-agent results |
| `/api/runs/[id]/events` | GET | SSE stream of agent_complete / error events |
| `/api/reports/[id]` | GET | Serve HTML report file |

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
│   ├── divisional.ts      # divisional charts incl. D2, D3, D12 (new) + D4/D7/D9/D10/D30
│   ├── ashtakavarga.ts    # BAV/SAV
│   ├── karakas.ts         # Jaimini chara karakas
│   ├── arudhaPadas.ts     # arudha padas
│   ├── specialLagnas.ts   # HL, GL, SL, etc.
│   ├── upagrahas.ts       # Gulika, Mandi + solar-derived upagrahas
│   ├── pindaStrength.ts   # pinda strength
│   ├── transits.ts        # transits + Sade Sati
│   ├── shadbala.ts        # NEW — full 6-component Shadbala (deterministic 1C)
│   ├── relationships.ts   # NEW — conjunctions, aspects, yuddha, parivartana… (deterministic 1D)
│   ├── nakshatraRelationships.ts # NEW — sub-lords, depositor chains, parivartana, clusters
│   ├── jaimini.ts         # NEW — argala, yogi/avayogi, special-lagna aspects
│   └── bhavaBala.ts       # NEW — Bhavadhipati / Bhava Dig / Bhava Drishti bala
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
`ashtakavarga`, …). Wave 2 then interprets structured data instead of re-deriving
geometry via LLM. The legacy `Chart` / paste path still runs the LLM Wave 1 agents
(1A–1D remain in `AGENT_CATALOGUE` and `ALWAYS_RUN_FIRST_QUERY` in `constants.ts`).

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

## 8.1 Chart Computation & Persistence Flow (NEW)

Separate from the AI analysis pipeline, the system includes a **deterministic chart computation engine** (`/compute`) that calculates planetary positions, divisional charts, and dasha trees using Swiss Ephemeris. Computed charts can be saved to and loaded from the database.

### Architecture

```
PRACTITIONER
     │
     │  Birth data (date, time, tz, lat/lon)
     ▼
┌────────────────────────┐
│  /compute (UI)         │
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
│  (tabs: divisional,    │
│   planets, nakshatras, │
│   karakas, ashtaka,    │
│   dasha, transits,     │
│   pinda)               │
└──────────┬─────────────┘
           │ User clicks "Save Chart"
           │ POST /api/compute/save
           ▼
┌────────────────────────┐           ┌─────────────────────┐
│  Save API              │─────────►│ D6: SavedChart       │
│  • Validates input     │           │ (PostgreSQL)         │
│  • SHA-256 dedup hash  │           │ • birth metadata     │
│  • Upsert record       │           │ • chartData (JSONB)  │
│                        │           │ • dashaTree (JSONB)  │
└────────────────────────┘           └─────────────────────┘
                                              ▲
┌────────────────────────┐                    │
│  Load APIs             │────────────────────┘
│  GET /compute/charts   │ (list all)
│  GET /compute/charts/  │ (load single)
│      [id]              │
└────────────────────────┘
```

### Data stored in `SavedChart`

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

### Relationship to Analysis Pipeline

The **Compute flow** and the **Analysis Pipeline flow** are intentionally independent:

- `/compute` → Deterministic astronomical calculation → `SavedChart` table
- `/charts` (POST) → Submit pre-computed ChartInputV1 → `Chart` table → triggers AI pipeline

Future enhancement: A saved computed chart could be exported as `ChartInputV1` format and submitted to the AI pipeline for analysis, bridging the two flows.

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
