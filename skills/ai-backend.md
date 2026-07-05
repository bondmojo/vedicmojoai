# VedicMojoAI — AI Backend Skill

Guidelines for the LLM pipeline engine, agent orchestration, prompt engineering, and model management.

## Architecture Overview

The backend is a 4-wave pipeline of 18+ LLM agents orchestrated by deterministic TypeScript code.

```
Pre-Analysis (deterministic) → Wave 1 (parallel) → Wave 2 (parallel, selected)
→ Wave 3 (parallel, selected) → Wave 4 (sequential: 4X→4A→HALT→4B→4C)
```

**Core files:**

| File | Responsibility |
|---|---|
| `engine/llm.ts` | Single LLM gateway — all model calls route here |
| `engine/orchestrator.ts` | Fan-out execution, DB writes, SSE emission, halt gate |
| `engine/planner.ts` | Deterministic query-type → agent resolution |
| `engine/constants.ts` | All constants, domain→agent maps, agent catalogue |
| `engine/chartSummary.ts` | Builds compact context from raw chart data |
| `engine/pre_analysis.ts` | 11 deterministic rules (no LLM) |
| `engine/computeVimshottari.ts` | Moon longitude → 120-year dasha tree |
| `engine/renderer.ts` | Synthesis JSON → HTML report |
| `engine/waves/*.ts` | Wave-specific utilities |

## LLM Layer (`engine/llm.ts`)

**Rules:**
- ALL LLM calls go through `callLLM()` — never import provider SDKs elsewhere
- Uses Vercel AI SDK (`ai` package) for provider abstraction
- Model/provider resolved at runtime from `model_config` DB table
- Returns `{ content, tokenIn, tokenOut, costUsd }` on every call
- Swapping providers requires zero code changes — update DB row only

**Provider factory pattern:**
```typescript
switch (provider) {
  case 'anthropic': createAnthropic({ apiKey })
  case 'openai': createOpenAI({ apiKey })
  case 'google': // not yet configured
}
```

**Cost estimation** uses `COST_PER_MILLION` lookup table (per-model input/output rates).

## Orchestrator Pattern

The orchestrator (`engine/orchestrator.ts`) is the pipeline's control plane:

1. **Parallel within waves** — uses `Promise.all()` for Wave 1/2/3
2. **Sequential across waves** — awaits each wave before next
3. **Context accumulation** — builds `AgentContext` as waves complete
4. **DB persistence** — creates/updates `WaveOutput` rows per agent
5. **SSE emission** — calls `emitEvent()` for every state transition
6. **Halt gate** — after 4A, checks `critical_errors > 0` → throws `PipelineHaltError`
7. **Resume path** — `resumeFromHalt()` reconstructs context from DB and runs 4B→4C

**Key invariants:**
- Orchestrator is the ONLY engine module that writes to the database
- Agent failures mark `WaveOutput.status = 'failed'` and re-throw
- 4X must produce non-empty `fact_summary` or pipeline errors

## Context Assembly (Token Optimization)

Each agent gets minimal, relevant context — not accumulated raw output:

| Agent | Receives |
|---|---|
| 1A–1D | `chart_summary` + `alerts` (~3KB) |
| 2A–2G | `chart_summary` + `alerts` + `wave1_delta` (~10KB) |
| 3A–3D | `chart_summary` + `alerts` + `wave1_delta` + relevant wave2 deltas (~12KB) |
| 4X | `chart_summary` + all wave2/3 deltas (~40KB) |
| 4A, 4B | `chart_summary` + `fact_summary` (~8KB) |
| 4C | `chart_summary` + `fact_summary` + `4A` + `4B` (~15KB) |

**Rules:**
- Never pass raw `ChartInputV1` (~30KB) to agents — always `chart_summary` (~2KB)
- Wave 3 agents only get domain-relevant Wave 2 output (via `getRelevantWave2ForWave3()`)
- Prompt template goes LAST in the assembled prompt (after all context sections)
- Context sections use delimiters: `--- SECTION_NAME ---`

## Planner (`engine/planner.ts`)

Deterministic (no LLM). Maps `query_types[]` → agent execution plan.

**Core logic:**
1. Resolve domain agents from `DOMAIN_AGENTS` map
2. First queries: add `ALWAYS_RUN_FIRST_QUERY` set
3. Follow-ups: add Wave 4 + verification, skip Wave 1 (unless `forceRerunWave1`)
4. Conditional: 3D only if lagna lord afflicted/debilitated (checked via alerts)
5. Sort by wave order for execution

**Output:** `ExecutionPlan { agents, rationale, query_types, is_followup, skipped_waves }`

Validation: `validateAgentSelection()` checks dependency constraints (e.g., 4C requires 4X).

## Prompt Engineering Rules

Prompt files live in `prompts/agents/{wave}_{id}_{name}.md`. Read at runtime via `readPromptFile()`.

**When writing or modifying agent prompts:**
- Output must be structured JSON (parsed by orchestrator)
- Include explicit output schema in the prompt
- Define clear domain boundaries — don't let agents overlap
- Use few-shot examples for complex output structures
- Set temperature per tier: foundation=0.3, specialists=0.3, QA=0.0, synthesis=0.0
- Include "DO NOT" constraints to prevent common hallucination patterns
- Reference pre-analysis alerts — agents should acknowledge flagged conditions

## Model Configuration

Runtime model assignment via `model_config` table (not hardcoded):

| Tier | Default Model | Temperature | Max Tokens |
|---|---|---|---|
| Foundation (1A–1D) | claude-haiku-4-5 | 0.3 | 4096 |
| Specialists (2A–2G, 3A–3D) | claude-sonnet-4-5 | 0.3 | 8192 |
| QA (4X, 4A, 4B, verification) | claude-sonnet-4-5 | 0.0 | 8192 |
| Synthesis (4C) | claude-opus-4-5 | 0.0 | 16384 |

**Swapping models:** Update `model_config` row → next run uses new model. No code change, no redeploy.

## Critical Error Halt Gate

Between agents 4A and 4B:

```typescript
if (errorResult.critical_errors > 0) {
  // Set run status to 'halted_for_review'
  // Emit SSE 'critical_error' event with actions
  // Throw PipelineHaltError (stops pipeline)
}
```

**Resume options:**
- Override & Continue: `resumeFromHalt()` — sets `override_applied = true`, runs 4B→4C
- Re-run from wave: Start new sub-run from specified wave
- Cancel: Mark run as failed

## SSE Event Protocol

The orchestrator emits events for real-time frontend updates:

| Event Type | When | Data |
|---|---|---|
| `connected` | SSE stream opened | — |
| `agent_start` | Agent begins execution | `agent_id`, `wave_number` |
| `agent_complete` | Agent finished successfully | `tokenIn`, `tokenOut`, `costUsd` |
| `agent_error` | Agent failed | `error` message |
| `token_count` | Token usage update | `tokenIn`, `tokenOut` |
| `critical_error` | 4A halt triggered | `errors[]`, `actions[]` |
| `run_complete` | Pipeline done | total tokens and cost |
| `run_failed` | Pipeline failed | error details |

**Implementation:** API route at `/api/runs/[id]/events/route.ts` using Web Streams API.

## Dasha Computation

`computeVimshottari(moonLongitudeDeg, birthDatetime)`:

- Uses `YEAR_DAYS = 365.2425` (single source in constants)
- Self-verification: sum of all MD durations must equal 120 years ± 1 day
- Failure → `DashaIntegrityError` thrown before any LLM runs
- Output: full `DashaTree` with Maha/Antar/Pratyantar periods

## Pre-Analysis Rules

11 deterministic rules in `engine/pre_analysis.ts`:

- No LLM — pure algorithmic checks
- Detects: debilitated lagna lord, retrograde nodes, combustion, etc.
- Output: `alerts[]` with `{ rule_id, rule_name, severity, message }`
- Alerts are injected into ALL agents as context
- Used by planner for conditional decisions (e.g., 3D activation)

## Compute Engine (`engine/compute/`)

Deterministic astronomical calculations (Swiss Ephemeris):

| Module | Purpose |
|---|---|
| `planets.ts` | Planet longitudes, signs, houses |
| `nakshatras.ts` | Nakshatra, pada, sublord |
| `divisional.ts` | Divisional charts incl. D2, D3, D12 (added for Shadbala/Vimsopaka) + D4/D7/D9/D10/D30 |
| `ashtakavarga.ts` | Bindhu scores per planet per house |
| `karakas.ts` | Jaimini karaka assignments |
| `arudhaPadas.ts` | Arudha pada calculations |
| `specialLagnas.ts` | Hora, Ghati, Sree Lagna etc. |
| `pindaStrength.ts` | Rashi/Graha/Drishti Pinda |
| `transits.ts` | Current transit positions |
| `upagrahas.ts` | Sub-planets (Gulika, Mandi etc.) |
| `shadbala.ts` | **Full 6-component Shadbala — deterministic replacement for LLM agent 1C** |
| `relationships.ts` | **Conjunctions, graha/rashi drishti, yuddha, parivartana, combustion, avastha… — deterministic replacement for LLM agent 1D** |
| `nakshatraRelationships.ts` | Sub-lords, depositor chains, nakshatra parivartana, clusters, Rahu/Ketu axis |
| `jaimini.ts` | Argala/Virodha Argala, Yogi/Avayogi points, special-lagna aspects, lord relationship map |
| `bhavaBala.ts` | Bhavadhipati / Bhava Dig / Bhava Drishti bala |

**Rules:**
- Pure functions — no DB, no side effects
- All use `swisseph-v2` for ephemeris calculations
- Types defined in `engine/compute/types.ts`
- `computeFullChart()` (index.ts) orchestrates every module and returns `ComputedChart`
- Called by the compute API and the unified-chart ingestion routes — never by LLM agents

## Deterministic Wave 1 (compute path)

Charts with `source="compute"` **skip LLM Wave 1**. The foundation data that agents
1C (Shadbala) and 1D (Relationship Geometry) would produce is computed
deterministically by the modules above and stored in `UnifiedChart` domain columns.

In `/api/unified-charts/[id]/analyze`:
- `resolvePlan()` runs, then all Wave 1 (`'1'`-prefixed) agents are stripped and
  wave 1 is marked skipped.
- `wave1_delta` is assembled from the chart's domain columns (`planets`,
  `nakshatras`, `shadbala`, `bhavaBala`, `relationships`, `jaimini`, `ashtakavarga`)
  shaped as `1A`/`1B`/`1C`/`1D` deltas.
- `executePipeline()` is called with `wave1Source: "compute"`.

The legacy `Chart` / `source="paste"` path still runs LLM Wave 1 (agents 1A–1D
remain in `AGENT_CATALOGUE` and `ALWAYS_RUN_FIRST_QUERY`).

## Error Handling

```typescript
// Engine-specific errors (from lib/errors.ts)
DashaIntegrityError    // Dasha sum != 120 years
ChartValidationError   // Invalid chart input
PipelineHaltError      // Critical errors in 4A
LLMCallError           // Provider/model failures
```

**Recovery patterns:**
- Agent failure: mark failed, emit SSE error, re-throw to orchestrator
- LLM timeout/rate-limit: LLMCallError with provider + model context
- Pipeline halt: persist halt_reason, emit critical_error, throw PipelineHaltError
- Never swallow errors silently — always persist + emit

## Adding a New Agent

1. Create prompt file: `prompts/agents/{wave}_{id}_{name}.md`
2. Add entry to `AGENT_CATALOGUE` in `engine/constants.ts`
3. Add to `DOMAIN_AGENTS` map (if domain-specific)
4. Add to `ALWAYS_RUN_FIRST_QUERY` (if needed)
5. Update `model_config` seed in `prisma/seed.ts`
6. Add context assembly logic in `orchestrator.ts → assemblePrompt()`
7. Update `Agents.md` documentation

## API Routes (Backend)

| Route | Method | Purpose |
|---|---|---|
| `/api/runs` | POST | Start a new pipeline run (returns 202 + runId) |
| `/api/runs/[id]` | GET | Get run status + agent outputs |
| `/api/runs/[id]/events` | GET | SSE stream for real-time progress |
| `/api/runs/[id]/override` | POST | Override halt gate, resume from 4B |
| `/api/runs/[id]/rerun` | POST | Re-run from specific wave |
| `/api/runs/[id]/cancel` | POST | Cancel a halted/running run |
| `/api/charts` | GET/POST | List/create charts |
| `/api/charts/[id]` | GET | Chart detail |
| `/api/charts/[id]/dasha` | GET | Computed dasha tree |
| `/api/compute` | POST | Run deterministic compute engine |
| `/api/unified-charts` | GET | List unified charts (filters: `search`, `lagna`, `source`) |
| `/api/unified-charts/from-compute` | POST | Generate Chart (Path A) — compute + persist `source="compute"` |
| `/api/unified-charts/from-paste` | POST | Generate Chart (Path B) — validate + persist `source="paste"` |
| `/api/unified-charts/[id]` | GET/DELETE | Load full domain data / delete (cascades runs) |
| `/api/unified-charts/[id]/analyze` | POST | AI Analysis on a unified chart (202); skips Wave 1 for compute source |
| `/api/reports/[id]` | GET | Serve HTML report file |
| `/api/health` | GET | Health check (DB + reports dir) |

**Pattern:** Long-running operations return 202 immediately. Progress via SSE.
