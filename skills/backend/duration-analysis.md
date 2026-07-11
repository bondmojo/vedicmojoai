# Duration Analysis Pipeline (`engine/durationAnalysis/`)

A separate, lighter pipeline for focused date-range / domain-specific analysis.
**Not part of the 18-agent wave pipeline.** Entry: `POST /api/duration-analysis`.

## Files

| File | Responsibility |
|---|---|
| `slicer.ts` | `sliceDashaTree()` — pure TS. Overlap filter, lord annotation (nakshatra lord, combustion, ownsHouses), yoga activation (parivartana, Raja/Dhana substrate, Neechabhanga). Returns `{ slices, truncated }`. |
| `transitOverlay.ts` | `buildTransitOverlay()` — calls `computeTransits()` once per unique AD start date; extracts Saturn/Jupiter/Rahu/Ketu + BAV scores from stored `ashtakavarga.bav`. |
| `registry.ts` | `DOMAIN_AGENT_REGISTRY` — single source of truth per category: agent id, prompt file, `model_config` waveId, divisional charts (e.g. career = D9 + D10), extra columns (`shadbala`/`jaimini`). Adding a domain agent = one entry + prompt file + seed row. |
| `extractor.ts` | `extractCategoryData()` — registry-driven. All categories get `planets`, `nakshatras`, `relationships`, `ashtakavarga`, `dashaTree`; the registry adds `divisionalCharts[]` + extra columns per category. |
| `agentJson.ts` | `extractJsonBlock()` / `parseAgentJson()` / `callAgentJson()` — lenient JSON extraction (fences/preamble stripped) + ONE retry with a correction instruction; throws after the retry fails. Supports `cachedPrefix` pass-through. |
| `reaper.ts` | `isStale()` / `reapStaleAnalyses()` — marks queued/running rows with no heartbeat for 10 min as failed. Called on every read path (GET [id], SSE poll, list). |
| `index.ts` | `executeDurationPipeline()` + `resumeDurationPipeline()`. Sequential: Step 0a → Step 0b → DA-1 (batched) → DA-2 (cond.) → DA-3. Merges `transitContext`/`lordAnnotations` onto DA-1 output after parsing. |

## Domain Agents (registry-driven)

| Category | Agent ID | Prompt File | Divisions | Extra columns |
|---|---|---|---|---|
| health | DA1-HEALTH | `duration_da1_health.md` | D30 | shadbala |
| career | DA1-CAREER | `duration_da1_career.md` | D9, D10 | shadbala, jaimini |
| wealth | DA1-WEALTH | `duration_da1_wealth.md` | D2 | shadbala, jaimini |
| marriage | DA1-MARRIAGE | `duration_da1_marriage.md` | D9 | jaimini |
| property | DA1-PROPERTY | `duration_da1_property.md` | D4 | — |
| cashflow | DA1-CASHFLOW | `duration_da1_cashflow.md` | D2 | shadbala |

DA-2 (Symptom Validator, temp 0.0, gate) and DA-3 (Future Analyser, temp 0.3,
forecast + chat) are shared across all categories. All DA-1 rows: claude-sonnet-4-5,
temp 0.3, one `model_config` row each — run `npm run db:seed` after adding one.

## Prompt Composition

Each per-domain DA-1 prompt is 3 lines: a role preamble +
`{{include:domains/<category>.md}}` (canonical domain knowledge — ALSO included by
the matching Wave 2 agent 2C–2G) + `{{include:agents/duration_da1_domain_analyser.md}}`
(the shared core: rules, input format, output JSON schema). `readPromptFile()`
expands `{{include:}}` at load time (paths with `/` resolve from `prompts/`).
**Edit domain astrology in `prompts/domains/` only** — never duplicate it into
agent prompt files.

## Key Rules

- All LLM calls go through `callAgentJson()` → `callLLM()` — never call providers directly
- The domain-analysis step resolves its prompt file and `model_config` row from `DOMAIN_AGENT_REGISTRY` — never hardcode per-category logic in the orchestrator or extractor
- **DA-1 is batched:** ≤ `DA1_BATCH_SIZE` (25) periods per call so output stays inside maxTokens; batches are merged deterministically by `mergeDA1Outputs()` (period_analysis concatenated, trends joined, per-batch peaks kept). The DA-1 prompt payload strips `dashaTree` — the period table already carries the periods
- **Empty slice = fail fast** (no LLM call). Usual cause: a chart computed before full-PD storage — run `npm run db:backfill-pd` (`scripts/backfill-pratyantardashas.ts`, idempotent)
- JSON parse failures retry ONCE with a correction suffix, then **throw** — pipeline sets `status=failed`; never swallow invalid JSON
- DA-2 gate is **fail-closed**: malformed DA-2 output = failure, not bypass
- `mergePeriodContext()` runs after DA-1: joins `transitContext` (from `transitOverlay` by `ad.start`) and `lordAnnotations` (from `periodSlice`) back onto each `period_analysis` entry deterministically — do NOT ask the LLM to reproduce these nested objects
- `contextSummary` is generated deterministically after DA-3 (no LLM); chat follow-ups use it instead of full `da1Output` when `conversationHistory.length > 2`
- Error message is persisted to `DurationAnalysis.errorMessage` so SSE can surface the real reason
- **Durability:** the pipeline is fire-and-forget, so every read path reaps stale runs (`reaper.ts`); the DA-1 loop persists totals after each batch as the heartbeat. Never add a long-running step without a DB write inside it
- **Cancellation is cooperative:** `POST /[id]/cancel` sets `status=cancelled`; the pipeline calls `throwIfCancelled()` between steps and unwinds via `PipelineCancelledError` WITHOUT overwriting the status. Add a check before any new expensive step
- **Prompt caching:** DA-1 passes the chart-data section as `cachedPrefix` (identical across batches); the chat route passes chart data + DA-1 + DA-2 sections (identical across turns). Keep cached sections byte-stable — never embed timestamps or volatile values in them

## Prompt Files

- `prompts/domains/{health,career,wealth,marriage,property,cashflow}.md` — canonical domain knowledge
- `prompts/agents/duration_da1_<category>.md` — per-domain DA-1 wrappers (6)
- `prompts/agents/duration_da1_domain_analyser.md` — shared DA-1 core
- `prompts/agents/duration_da2_symptom_validator.md`
- `prompts/agents/duration_da3_future_analyser.md`

All agents expect structured JSON output with no markdown fences (leniently parsed anyway).
