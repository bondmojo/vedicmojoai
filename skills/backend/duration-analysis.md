# Duration Analysis Pipeline (`engine/durationAnalysis/`)

A separate, lighter pipeline for focused date-range / domain-specific analysis.
**Not part of the 18-agent wave pipeline.** Entry: `POST /api/duration-analysis`.

This engine backs two distinct UI surfaces that share everything through Step 0d
(scoring) but diverge after it:
- **Duration Analysis** (`/duration-analysis`, `POST /api/duration-analysis`) — the
  paid 3-agent LLM pipeline (DA-1/DA-2/DA-3) described below.
- **Duration Analyser** (`/duration-computation`, `POST /api/timeline`) — a
  deterministic, no-LLM view over the SAME Step 0a–0d output (period slice, transit
  overlay, category extraction, scoring). It lets the practitioner drill into a dasha
  period (MD → AD → PD) and a life domain (Career/Health/Money/Family) and see every
  computed chart for that window — divisional charts, planets, nakshatras, upagrahas,
  balas, Ashtakavarga — with zero API cost. Each period also carries a deterministic
  **driver digest** (`periodInsights.ts` → `insights`) + `domainContext`: the tab has no
  LLM, so this selects + labels the drishti / control / nakshatra / argala the payload
  already holds, whereas the MCP path hands those raw arrays to Claude Desktop to
  interpret. This is the same backbone the MCP server's
  `get_timeline_periods`/`get_domain_dataset` tools expose to Claude Desktop. **The
  MCP-vs-UI exposure model is documented in `docs/duration-analyser.md`.**

## Files

| File | Responsibility |
|---|---|
| `slicer.ts` | `sliceDashaTree()` — pure TS. Overlap filter, lord annotation (nakshatra lord, combustion, ownsHouses, **karakaRole from stored `karakas`**), yoga activation (parivartana, Raja/Dhana substrate, Neechabhanga). Returns `{ slices, truncated }`. Pass `chart.karakas` to get karakaRole tags. |
| `transitOverlay.ts` | `buildTransitOverlay()` — calls `computeTransits()` once per unique AD start date; extracts Saturn/Jupiter/Rahu/Ketu + BAV scores from stored `ashtakavarga.bav`. |
| `registry.ts` | `DOMAIN_AGENT_REGISTRY` — single source of truth per category: agent id, prompt file, `model_config` waveId, divisional charts (e.g. career = D1 + D9 + D10 — D1 + D9 are now included alongside every domain's primary varga), extra columns (`shadbala`/`jaimini`), and **`foundationAgents` (Track 2 — which natal foundation sub-agents run before DA-1)**. Also `FOUNDATION_AGENT_CATALOGUE` (id → prompt file + waveId + required facet) + `getFoundationAgentSpec()`. Adding a domain agent = one entry + prompt file + seed row — **except** `family`, which is registered for type-completeness and the deterministic `/api/timeline` path only; it has no prompt file or `model_config` row and is deliberately excluded from `/api/duration-analysis`'s (separately-hardcoded) category enum, so it never reaches the paid LLM pipeline. |
| `scoringWeights.ts` | `DOMAIN_SCORING_WEIGHTS` — single source of truth for all per-domain scoring parameters (beneficHouses, maleficHouses, primaryHouses, karakaRoles, naturalKarakas, per-factor weights, specialPoints, primaryFactors). `WEIGHTS_VERSION = '0.4.0-provisional'`. `resolveDomainWeights(category)` — throws `ScoringConfigError` on missing category (this DOES cover `family`, since `/api/timeline` scores it too). |
| `scoring.ts` | `scorePeriod(period, chartData, transitEntry, domainWeights)` — pure deterministic scorer, **18 factors** (15 original + 3 depth: `nakshatraDispositor`, `dashaLordBav`, `argalaOnDomainHouse`), never throws. Node lords (Rahu/Ketu) omit `dashaLordBav`; node nakshatra dispositors use occupancy only. Returns `{ score, breakdown }`. `identifyPeaks(scored, topN, minSignificance)`. Constants: `FAVORABLE_THRESHOLD=50`, `INTENSITY_HIGH/MEDIUM_DELTA=25/12`, `PEAK_SIGNIFICANCE_DELTA=12`, `BHAVA_RUPAS_CALIBRATION=12`, `SAV_MEAN=28`. |
| `extractor.ts` | `extractCategoryData()` — registry-driven. All categories get `planets`, `nakshatras`, `relationships`, `ashtakavarga`, `dashaTree`, **`nakshatraRelationships` (computed on-demand), `bhavaBala`, `upagrahas` (full table, null when absent), `specialPoints`**; registry adds `divisionalCharts[]` + extra columns. `toScoringChartData()` — thin `ScoringChartData` incl. `jaimini` (for `argalaOnDomainHouse`). **`pickScoringRawChart(chart)` — the single column-picker BOTH `index.ts` and `/api/timeline` use, so pipeline & MCP scores cannot diverge.** |
| `periodInsights.ts` | `buildPeriodInsights(slice, categoryData, domainWeights)` — pure SELECTION + LABELING pass producing the per-period `PeriodInsights` digest (D1 control tagged by domain role, D1 graha/rashi drishti, nakshatra threads, argala, domain-house focus, **plus per-varga control+drishti — `LordDriver.vargas[]` — computed within every OTHER divisional chart the domain uses, e.g. D9+D10 for career, D6+D9 for health, via each varga's own `lagnaSignNumber` and `computeGrahaDrishti` fed that varga's own placements**) for the no-LLM UI. No new astrology; reuses `houseToSign`/`SIGN_LORDS`/`NATURAL_BENEFICS/MALEFICS`/`getSignName`/`computeGrahaDrishti`. Called only by `/api/timeline` (Step 0d); the LLM pipeline doesn't need it. Degrades gracefully; never throws. |
| `foundation.ts` | **NEW (Track 2).** `runFoundationStage()` — runs the domain's selected natal foundation sub-agents in parallel (Haiku), swallows individual failures, returns merged `FoundationOutput`. `selectFoundationAgents(agents, inputs)` — pure planner: drops agents whose facet is absent (paste-path). `buildFoundationSection(output)` — renders the `--- FOUNDATION ANALYSIS ---` block injected into DA-1 (cached prefix) and DA-3. |
| `agentJson.ts` | `extractJsonBlock()` / `parseAgentJson()` / `callAgentJson()` — lenient JSON extraction + ONE retry, then throws. Supports `cachedPrefix`. |
| `reaper.ts` | `isStale()` / `reapStaleAnalyses()` — marks stale queued/running rows failed. Called on every read path. |
| `index.ts` | `executeDurationPipeline()` + `resumeDurationPipeline()`. Sequential: Step 0a → Step 0b → Step 0c (extract) → Step 0d (scoring) → **Step 0e (FOUNDATION sub-agents → `foundationOutput`)** → DA-1 (batched) → DA-2 (cond.) → DA-3. Foundation section is injected into DA-1 **and** DA-3 (and re-injected on resume). Merges `transitContext`/`lordAnnotations`/`score`/`intensity`/`favorable`/`scoreBreakdown` onto DA-1 output. |

## Domain Agents (registry-driven)

| Category | Agent ID | Prompt File | Divisions | Extra columns |
|---|---|---|---|---|
| health | DA1-HEALTH | `duration_da1_health.md` | D1, D6, D9 | shadbala |
| career | DA1-CAREER | `duration_da1_career.md` | D1, D9, D10 | shadbala, jaimini |
| wealth | DA1-WEALTH | `duration_da1_wealth.md` | D2 | shadbala, jaimini |
| marriage | DA1-MARRIAGE | `duration_da1_marriage.md` | D9 | jaimini |
| property | DA1-PROPERTY | `duration_da1_property.md` | D4 | — |
| cashflow | DA1-CASHFLOW | `duration_da1_cashflow.md` | D1, D2, D9 | shadbala |
| family † | DA1-FAMILY | *(none — see below)* | D1, D4, D9 | shadbala |

† `family` is deterministic-tab-only — see the `registry.ts` row above. Not reachable
from `/duration-analysis` or its category enum. In the `/duration-computation` UI,
"Money" maps to `cashflow` and "Family" maps to this new `family` category.

DA-2 (Symptom Validator, temp 0.0, gate) and DA-3 (Future Analyser, temp 0.3,
forecast + chat) are shared across all categories. All DA-1 rows: claude-sonnet-4-5,
temp 0.3, one `model_config` row each — run `npm run db:seed` after adding one.

## Foundation Sub-Agents (Track 2, Step 0e — before DA-1)

Natal-static facet readers (Haiku, `model_config` rows `FOUND-PLANETS`/`FOUND-NAKSHATRA`/
`FOUND-UPAGRAHA`/`FOUND-BAV`) that run ONCE per (chart, domain) and emit a compact
`{ summary, key_findings }` block. Selection is deterministic (`registry.foundationAgents`
per domain); an agent whose required facet is absent on a paste-path chart is **skipped**,
and a single agent failing is **swallowed** (enrichment, never a hard dependency). The merged
`FoundationOutput` is persisted to `duration_analysis.foundationOutput` and its rendered
section is injected into DA-1's cached prefix and DA-3's prompt. No caching in v1 (cost = the
selected agents' calls per analysis, ~2–4 Haiku calls). Prompt files are **domain-agnostic**
(`prompts/agents/duration_found_*.md`); the domain + facet data are injected at runtime.

## Prompt Composition

Each per-domain DA-1 prompt is 3 lines: a role preamble +
`{{include:domains/<category>.md}}` (canonical domain knowledge — ALSO included by
the matching Wave 2 agent 2C–2G) + `{{include:agents/duration_da1_domain_analyser.md}}`
(the shared core: rules, input format, output JSON schema). `readPromptFile()`
expands `{{include:}}` at load time (paths with `/` resolve from `prompts/`).
**Edit domain astrology in `prompts/domains/` only** — never duplicate it into
agent prompt files.

## Compute-First Contract (Phase 1 Scoring Layer)

The scoring layer runs deterministically at **Step 0d** (before DA-1):

1. `resolveDomainWeights(category)` — throws `ScoringConfigError` if the category is unregistered
2. `toScoringChartData(categoryData, rawChart)` — assembles typed scoring input
3. `scorePeriod(slice, chartData, overlayEntry, domainWeights)` per slice → `{ score, breakdown }`
4. `identifyPeaks(scoredSlices)` → `{ peakStress, peakFavorable }`
5. Persist `ScoredDashaSlice[]` (each entry has `score`, `intensity`, `favorable`, `scoreBreakdown`) into `periodSlice`

**DA-1 receives scored slices** — the period table carries engine verdicts as authoritative context.
**`mergePeriodContext()`** overwrites any model-emitted `intensity`/`favorable` with engine values.
**Engine peaks** replace LLM-chosen peaks in the persisted `da1Output`.
**DA-3 receives** a compact scored-period summary + engine peaks as authoritative context.

**Weights are PROVISIONAL** (`WEIGHTS_VERSION = '0.4.0-provisional'`; 0.2.0 added the 3 depth factors, 0.3.0 added the Rashi layer, 0.4.0 added `family` and widened career/health/cashflow's divisional-chart sets for the Duration Computation tab — see `scoringWeights.ts` for the full changelog). Never present scores as calibrated until the Calibration_Gate.

**Legacy backward compatibility:** pre-feature `periodSlice` entries (no `score`/`scoreBreakdown`) are returned verbatim with no rescoring. The GET route adds a top-level `peaks` field only when present in `da1Output`.

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

- `prompts/domains/{health,career,wealth,marriage,property,cashflow}.md` — canonical domain knowledge (no `family.md` — that domain has no LLM agent)
- `prompts/agents/duration_da1_<category>.md` — per-domain DA-1 wrappers (6; `family` has none)
- `prompts/agents/duration_da1_domain_analyser.md` — shared DA-1 core
- `prompts/agents/duration_da2_symptom_validator.md`
- `prompts/agents/duration_da3_future_analyser.md`
- `prompts/agents/duration_found_{planets,nakshatra,upagraha,bav}.md` — Track 2 foundation sub-agents (domain-agnostic)

All agents expect structured JSON output with no markdown fences (leniently parsed anyway).
