# VedicMojoAI — Engine & Pipeline Rules

## Pipeline Execution Rules

1. **Pre-analysis always runs first** — deterministic, no LLM. Produces `alerts[]`, `dasha_tree`, `chart_summary`.
2. **Wave 1 runs only on first query** for a chart (LLM/paste path). Results are cached in `Wave1Cache` (keyed by `chart_hash`).
   - **Compute path exception:** `source="compute"` unified charts skip Wave 1 entirely.
     `wave1_delta` is built from deterministic domain columns. See `ai-backend.md → Deterministic Wave 1`.
   - **Named-yoga detection is deterministic on the compute path.** `engine/compute/yogas.ts`
     computes a chart-wide `Yoga[]` catalogue (Mahapurusha, Raja/DKA, Dhana, Viparita,
     Neechabhanga, lunar, Gaja Kesari, Budha-Aditya, Parivartana, Kartari) from the
     already-computed `relationships` geometry; it rides in `wave1_delta` under `1D` and
     Wave 2A validates/interprets it instead of re-deriving formation. See
     `.kiro/specs/named-yoga-engine/`.
3. **Waves 2–3 are parallel within wave, sequential across waves.** Only planner-selected agents run.
4. **Wave 4 is strictly sequential:** 4X → 4A → HALT GATE → 4B → 4C.
5. **Critical Error Halt Gate:** If `4A.critical_errors > 0`, pipeline halts. No 4B, no 4C, no report.
6. **Follow-up queries** skip Wave 1 (cached), don't apply `ALWAYS_RUN`, and include a Verification Agent.

## Context Assembly (Token Optimization)

- Every agent gets `chart_summary` (~2KB) — never raw `ChartInputV1` (~30KB).
- Agents receive only relevant upstream deltas, not all accumulated output.
- Agent 4X consolidates all Wave 2/3 output into `fact_summary` (~6KB) before Opus 4C.
- 4C input: `chart_summary` + `fact_summary` + `4A` + `4B` ≈ 15K tokens (not 100K).

## Dasha Computation

- Function: `computeVimshottari(moonLongitudeDeg, birthDatetime)`
- Year constant: `YEAR_DAYS = 365.2425` (defined ONCE in `constants.ts`)
- Self-verification: sum of all MD durations = 120 years ± 1 day
- If verification fails → `DashaIntegrityError` thrown before any LLM agent runs

## Planner Rules

- `DOMAIN_AGENTS` map resolves `query_types[]` → Wave 2/3 agent IDs
- `ALWAYS_RUN` = `[1A, 1B, 1C, 1D, 2B, 4X, 4A, 4B, 4C]` — first query (LLM path) only
- Agent 3D is conditional: only runs if lagna lord is afflicted/debilitated
- Planner output is persisted to `pipeline_runs.planner_output` for auditability
- Compute path: analyze route strips Wave 1 agents from the plan after `resolvePlan()`

## Model Tiers

| Tier | Agents | Model | Temperature |
|---|---|---|---|
| Foundation | 1A–1D | claude-haiku-4-5 | 0.3 |
| Specialists | 2A–2G, 3A–3D | claude-sonnet-4-5 | 0.3 |
| QA | 4X, 4A, 4B, verification | claude-sonnet-4-5 | 0.0 |
| Synthesis | 4C | claude-opus-4-5 | 0.0 |

## LLM Layer (`engine/llm.ts`)

- Uses Vercel AI SDK — provider-agnostic wrapper
- Model/provider read from `model_config` table at runtime
- Returns: `{ content, tokenIn, tokenOut, costUsd }`
- Swapping provider requires zero code changes

## Error Handling

- Agent failures: mark `WaveOutput.status = 'failed'`, persist error, emit SSE event
- Critical errors (4A): halt pipeline, set `pipeline_runs.status = 'halted_for_review'`
- Orchestrator emits SSE `critical_error` event with action buttons
- Override sets `override_applied = true` and adds report watermark

## Duration Analysis Pipeline Rules

A **separate** 3-agent pipeline for focused date-range analysis. Not related to the
18-agent wave pipeline. Lives in `engine/durationAnalysis/`.

1. **Execution order is strictly sequential:** Step 0a (slicer) → Step 0b (transitOverlay) → DA-1 → DA-2 (conditional) → DA-3 → contextSummary.
2. **Fail-fast on invalid JSON:** `parseAgentJson()` throws on malformed output. The outer catch sets `status=failed` and persists `errorMessage`. Never proceed with malformed agent output.
3. **Symptom gate is fail-closed:** If DA-2's `symptom_diagnosis` is absent or `found` is not a boolean, treat as failure — not a silent bypass.
4. **Post-LLM merge:** After DA-1 returns valid JSON, `mergePeriodContext()` joins `transitContext` (from `transitOverlay[]` by `ad.start`) and `lordAnnotations` (from `periodSlice[]`) back onto each `period_analysis` entry deterministically. The LLM does not produce these.
5. **Period slice truncation:** `sliceDashaTree` caps at 200 periods and returns `{ slices, truncated }`. When `truncated=true`, a warning is prepended to the DA-1 prompt.
6. **Category extraction includes `nakshatras`, `relationships`, `ashtakavarga` for ALL categories** — they are required for lord annotation, yoga detection, and BAV scoring respectively.
7. **Transit overlay is best-effort:** If `computeTransits()` throws for a specific AD date, that entry is skipped and the overlay continues. Never fail the whole pipeline on a single ephemeris error.
8. **contextSummary is deterministic** (no LLM). Substitutes full `da1Output` in follow-up prompts when `conversationHistory.length > 2` to prevent token growth.
9. **Chat spend rolls up:** `POST /api/duration-analysis/[id]/chat` increments `totalTokenIn/Out/CostUsd` on the analysis record after each call.

## Duration Analysis Model Tiers

| Agent | Model | Temperature | Purpose |
|---|---|---|---|
| DA-1 | claude-sonnet-4-5 | 0.3 | Interpretive per-period analysis |
| DA-2 | claude-sonnet-4-5 | 0.0 | Gate validation — deterministic |
| DA-3 | claude-sonnet-4-5 | 0.3 | Forecast + follow-up chat |
