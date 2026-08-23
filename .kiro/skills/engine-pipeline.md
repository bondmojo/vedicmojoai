---
inclusion: auto
---

# VedicMojoAI — Engine & Pipeline Rules

## Pipeline Execution Rules

1. **Pre-analysis always runs first** — deterministic, no LLM. Produces `alerts[]`, `dasha_tree`, `chart_summary`.
2. **Wave 1 runs only on first query** for a chart. Results are cached in `Wave1Cache` (keyed by `chart_hash`).
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

## Calculation Profiles and Astronomy Providers

- Resolve the calculation profile once at the compute entry point, then pass its
  `AstronomyProvider` into natal, current-transit, and Gochar work. Do not let a
  non-Drik profile fall back to Swiss/Lahiri values.
- `drik_lahiri_v1` is the current production provider. The registered
  `surya_siddhanta_makaranda_v1` profile deliberately fails closed until the
  standalone formula provider and profile-specific Dasha year strategy exist.
  Resolve arbitrary runtime profile IDs through `resolveCalculationProfile()` so
  invalid IDs produce `CalculationProfileValidationError`, never an undefined
  provider or an accidental Drik fallback.
- Until Task 6 creates profile-aware persistence/hash provenance,
  `createUnifiedChartFromBirthData()` must reject every non-Drik profile with
  `CalculationProfilePersistenceUnavailableError` before any legacy dedup lookup.
- Keep external sunrise **instants** (`engine/compute/sunrise.ts`) separate from
  the selected provider's Sun longitude. The current Drik helper keeps its legacy
  06:00 fallback; do not claim the future SSS 72-hour/polar failure contract is
  implemented before Task 4.
- Public route/MCP schemas accept padded `HH:MM:SS.s` (up to six fractional
  digits). `engine/compute/time.ts` additionally normalizes old persisted
  unpadded hours for mappers/migrations. Use its split `PreciseUtcInstant` for
  microsecond-capable transport; JavaScript `Date` remains millisecond-only.

## Planner Rules

- `DOMAIN_AGENTS` map resolves `query_types[]` → Wave 2/3 agent IDs
- `ALWAYS_RUN` = `[1A, 1B, 1C, 1D, 2B, 4X, 4A, 4B, 4C]` — first query only
- Agent 3D is conditional: only runs if lagna lord is afflicted/debilitated
- Planner output is persisted to `pipeline_runs.planner_output` for auditability

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

## Report Persistence and Serverless Execution

- The report renderer persists HTML or Markdown in `PipelineRun.reportHtml` /
  `reportMarkdown` together with the legacy `reportPath`. The DB value is
  authoritative; a filesystem copy is best-effort for local/Cloud Run only.
- Pipeline-launch routes use Vercel `waitUntil()` to keep the work alive after
  their `202` response, bounded by `maxDuration`. Do not describe this as
  guaranteed background processing: a run that outlives the bound must remain
  recoverable from its persisted state.
