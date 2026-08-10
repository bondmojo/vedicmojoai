# Requirements Document: Duration Analysis

## Introduction

Duration Analysis is a focused 3-agent sequential pipeline feature in VedicMojoAI.
It allows a practitioner to select a chart, a date range, a life domain category
(health/career/wealth/marriage/property), optional current symptoms, and a question.
The system deterministically slices the stored Vimshottari dasha tree, runs up to three
sequential LLM agents (DA-1 Domain Analyser, DA-2 Symptom Validator, DA-3 Future
Analyser), streams progress via SSE, and exposes a follow-up chat interface backed by
DA-3. DA-2 is conditional (only when symptoms are provided) and acts as a gate that can
short-circuit the pipeline with a `symptom_unmatched` terminal state.

## Glossary

- **Duration_Analysis**: The new DB record and feature representing a single period-analysis run.
- **DA-1**: Domain Analyser LLM agent (Step 1 of the pipeline).
- **DA-2**: Symptom Validator LLM agent (Step 2, conditional).
- **DA-3**: Future Analyser LLM agent (Step 3).
- **Period_Slicer**: The deterministic `sliceDashaTree()` TypeScript function (Step 0).
- **Category_Extractor**: The deterministic `extractCategoryData()` TypeScript function.
- **DashaSlice**: A flat array entry representing one overlapping MD/AD/PD combination.
- **Symptom_Gate**: The conditional halt that fires when DA-2 returns `found === false`.
- **Pipeline**: The `executeDurationPipeline()` orchestrator function in `engine/durationAnalysis/index.ts`.
- **SSE_Stream**: The Server-Sent Events endpoint at `GET /api/duration-analysis/[id]/events`.
- **UnifiedChart**: The existing DB table holding all chart data including `dashaTree` JSONB.
- **ModelConfig**: The existing DB table mapping `waveId` strings to model/provider/temperature/maxTokens.
- **callLLM**: The single LLM gateway function in `engine/llm.ts` — the only function that calls LLM APIs.
- **Transit_Overlay**: The deterministic `buildTransitOverlay()` output — Saturn, Jupiter, Rahu/Ketu positions at each AD boundary within the date range.
- **Lord_Annotation**: Natal chart metadata for a dasha lord (nakshatra lord, sub-lord, combustion, retrograde) — computed deterministically from stored chart data.
- **Context_Summary**: A ~500-token compressed summary of DA-1 and DA-3 findings, generated after DA-3 completes and used in place of full outputs for follow-up turns > 2.
- **Bahiranga**: External manifestation — observable events or circumstances predicted for a period.
- **Antaranga**: Internal experience — psychological, emotional, or bodily state during a period.
- **Yoga_Activation**: The condition where the MD lord and AD lord running simultaneously form or trigger a classical yoga (Raja, Dhana, Parivartana, Neechabhanga) based on their natal positions — computed deterministically from `relationships` data.
- **BAV_Score**: Bhinna Ashtakavarga score (0–8) of a transiting planet in its current sign. Score ≥ 4 indicates the transit sign supports the planet's significations; ≤ 3 indicates friction. Used for Saturn and Jupiter transit quality assessment.

---

## Requirements

### Requirement 1: Duration Analysis Submission

**User Story:** As a practitioner, I want to submit a duration analysis request for a
chart and date range so that I can receive astrological period-by-period analysis.

#### Acceptance Criteria

1. WHEN a practitioner submits a valid request to `POST /api/duration-analysis`, THE
   Duration_Analysis_API SHALL create a `DurationAnalysis` record with `status = 'queued'`
   and return HTTP 202 with `{ "analysisId": "<uuid>" }`.

2. WHEN the request body is missing `unifiedChartId`, `dateFrom`, `dateTo`, or
   `category`, THE Duration_Analysis_API SHALL return HTTP 400 with a descriptive error.

3. WHEN `dateFrom` is equal to or later than `dateTo`, THE Duration_Analysis_API SHALL
   return HTTP 400 with error "dateFrom must be before dateTo".

4. WHEN the referenced `UnifiedChart` does not exist, THE Duration_Analysis_API SHALL
   return HTTP 404.

5. WHEN the referenced `UnifiedChart` has a null `dashaTree` column, THE
   Duration_Analysis_API SHALL return HTTP 422 with error "Chart has no dasha tree. Run
   compute first."

6. WHERE `userQuestion` is provided in the request body, THE Duration_Analysis_API SHALL
   persist it as a `DurationMessage` record with `role = 'user'` before returning 202.

7. THE Duration_Analysis_API SHALL accept `category` values of exactly:
   `health`, `career`, `wealth`, `marriage`, `property`. IF any other value is provided,
   THEN THE Duration_Analysis_API SHALL return HTTP 400.

8. WHEN `dateTo - dateFrom` exceeds 10 years (3653 days), THE Duration_Analysis_API
   SHALL return HTTP 400 with error "Date range must not exceed 10 years".

---

### Requirement 2: Period Slicer and Category Extraction

**User Story:** As the pipeline engine, I need accurate dasha period data and category-
scoped chart data so that LLM agents receive the minimum necessary context.

#### Acceptance Criteria

1. WHEN `sliceDashaTree` is called with a `DashaTree` and a date range, THE
   Period_Slicer SHALL return a `SliceResult` object (`{ slices: DashaSlice[], truncated: boolean }`)
   where `slices` contains every MD/AD/PD combination whose PD interval overlaps the range,
   sorted by PD start date ascending, with no entries that do not overlap. `truncated` SHALL be
   `true` when the result was capped at 200 entries.

2. WHEN `sliceDashaTree` finds no overlapping periods, THE Period_Slicer SHALL return
   `{ slices: [], truncated: false }` without throwing.

3. WHEN `extractCategoryData` is called with a `UnifiedChart` and `category = 'health'`,
   THE Category_Extractor SHALL return `planets`, `nakshatras`, `relationships`,
   `ashtakavarga`, `shadbala`, the D30 entry from `divisionalCharts`, and `dashaTree`.

4. WHEN `extractCategoryData` is called with `category = 'career'`, THE
   Category_Extractor SHALL return `planets`, `nakshatras`, `relationships`,
   `ashtakavarga`, `shadbala`, `jaimini`, the D10 entry from `divisionalCharts`,
   and `dashaTree`.

5. WHEN `extractCategoryData` is called with `category = 'wealth'`, THE
   Category_Extractor SHALL return `planets`, `nakshatras`, `relationships`,
   `ashtakavarga`, `jaimini`, the D2 entry from `divisionalCharts`, and `dashaTree`.

6. WHEN `extractCategoryData` is called with `category = 'marriage'`, THE
   Category_Extractor SHALL return `planets`, `nakshatras`, `relationships`,
   `ashtakavarga`, the D9 entry from `divisionalCharts`, and `dashaTree`.

7. WHEN `extractCategoryData` is called with `category = 'property'`, THE
   Category_Extractor SHALL return `planets`, `nakshatras`, `relationships`,
   `ashtakavarga`, the D4 entry from `divisionalCharts`, and `dashaTree`.

8. WHEN `sliceDashaTree` processes each period, THE Period_Slicer SHALL annotate each
   `DashaSlice` entry with `lordAnnotations` containing for each of MD lord, AD lord,
   and PD lord: the planet's natal sign, house, nakshatra, nakshatra lord, sub-lord,
   retrograde flag, and combustion/cazimi state derived from the chart's `nakshatras`
   and `relationships.combustion` columns, AND `ownsHouses` listing all D1 houses
   the planet rules (from `relationships.houseLords`) and `occupiesHouse` (same as natal house).

9. WHEN `buildTransitOverlay` is called with a period slice and natal chart parameters,
   THE Transit_Overlay_Builder SHALL call `computeTransits()` once per unique AD start
   date and return a `TransitOverlay` entry containing Saturn, Jupiter, Rahu, and Ketu
   positions (sign, house from lagna, house from Moon), Sade Sati phase (derived from
   stored `sadeSati.allPeriods` without re-scanning the ephemeris), ashtamaShani flag,
   and kantakaShani flag.

10. Criteria 2.3–2.7 are authoritative for column inclusion per category. `nakshatras`,
    `relationships`, and `ashtakavarga` are explicitly listed in every category because:
    - `nakshatras` provides nakshatra lords and sub-lords for period lord annotation
    - `relationships` provides combustion state and yoga geometry (conjunctions, parivartana)
    - `ashtakavarga.bav` provides BAV transit scores for Saturn and Jupiter
    The Category_Extractor SHALL NOT include columns not listed for a given category.

11. WHEN `sliceDashaTree` computes `lordAnnotations` for each period, THE Period_Slicer
    SHALL populate `activatedYogas[]` on each lord annotation by checking the MD and AD
    lord combination against `relationships.mutualReception`, `relationships.conjunctions`,
    and `relationships.houseLords` to identify:
    - Parivartana (mutual reception between MD and AD lords)
    - Conjunction yoga (MD and AD lords in the same sign)
    - Raja Yoga substrate (one lord owns a kendra house 1/4/7/10 AND the other owns a trikona house 1/5/9)
    - Dhana Yoga substrate (one lord owns the 2nd or 11th AND the other owns the 1st, 5th, or 9th)
    - Neechabhanga (a period lord is in its debilitation sign AND either the debilitation-sign
      dispositor or the planet exalted in that sign occupies a kendra from lagna OR from Moon)
    An empty array is valid when no yogas activate.

12. WHEN `buildTransitOverlay` computes each AD boundary's transit state, THE
    Transit_Overlay_Builder SHALL look up `saturnBavScore` from
    `UnifiedChart.ashtakavarga.bav['Saturn'][saturn.signNumber - 1]` and
    `jupiterBavScore` from `UnifiedChart.ashtakavarga.bav['Jupiter'][jupiter.signNumber - 1]`
    and include both scores in the `TransitOverlay` entry. If `ashtakavarga` data is null
    (paste-path chart without computed data), both scores SHALL default to -1.

13. WHEN `sliceDashaTree` produces more than 200 PD entries for a date range, THE
    Period_Slicer SHALL return `{ slices: <first 200 entries by PD start ascending>, truncated: true }`.
    THE Pipeline SHALL include a partial-window warning in the DA-1 prompt and the UI
    SHALL display a visible truncation notice above the period table.

---

### Requirement 3: Pipeline Execution and Agent Sequencing

**User Story:** As a practitioner, I want the three-agent pipeline to run in the correct
order so that each agent builds on the previous one's output.

#### Acceptance Criteria

1. WHEN the Pipeline starts, THE Pipeline SHALL execute steps in strict order:
   Step 0a (Period_Slicer with lord annotation, synchronous) →
   Step 0b (Transit_Overlay builder, synchronous) →
   Step 1 (DA-1) → Step 2 (DA-2, conditional) → Step 3 (DA-3) →
   Step 0c (Context_Summary generation, synchronous post-DA-3).
   No step may start before its predecessor completes.

2. WHEN the `symptoms` field of the `DurationAnalysis` record is null or absent, THE
   Pipeline SHALL skip DA-2 entirely and proceed directly from DA-1 to DA-3.

3. WHEN DA-2 completes and `symptom_diagnosis.found === false`, THE Pipeline SHALL set
   `DurationAnalysis.status = 'symptom_unmatched'`, emit a `symptom_gate` SSE event
   containing the full DA-2 output, and stop without running DA-3.

4. WHEN DA-2 completes but `symptom_diagnosis` is absent or `found` is not a boolean
   (malformed output), THE Pipeline SHALL treat this as a failure — set
   `status = 'failed'`, persist `errorMessage`, and stop. The gate SHALL NEVER be
   bypassed silently (fail-closed).

5. WHEN DA-2 completes and `symptom_diagnosis.found === true`, THE Pipeline SHALL
   proceed to DA-3.

6. WHEN any LLM agent call throws an error OR returns content that cannot be parsed
   as valid JSON, THE Pipeline SHALL set `status = 'failed'`, persist the error message
   to `DurationAnalysis.errorMessage`, emit an `agent_error` SSE event with that message,
   and stop the pipeline. The Pipeline SHALL NOT continue with malformed agent output.

7. THE Pipeline SHALL call all LLM agents exclusively through `callLLM()` in
   `engine/llm.ts`. Direct imports of provider SDKs are prohibited.

8. THE Pipeline SHALL read each agent's model configuration from the `ModelConfig` DB
   table using `waveId` values `'DA-1'`, `'DA-2'`, and `'DA-3'`.

8. WHEN the Pipeline completes all required steps successfully, THE Pipeline SHALL set
   `DurationAnalysis.status = 'done'` and emit a `run_complete` SSE event.

9. WHEN the Pipeline persists each agent's JSON output, THE Pipeline SHALL also
   accumulate `tokenIn`, `tokenOut`, and `costUsd` into the `DurationAnalysis`
   totals fields.

10. WHEN DA-3 completes successfully, THE Pipeline SHALL generate a `contextSummary`
    string (≤ 600 tokens) compressing key findings from DA-1 and DA-3, and persist it
    to `DurationAnalysis.contextSummary` before emitting `run_complete`.

11. AFTER DA-1 returns valid JSON, THE Pipeline SHALL deterministically enrich each
    `period_analysis` entry with `lordAnnotations` (from the matching `DashaSlice`) and
    `transitContext` (from the matching `TransitOverlay` by `ad.start`). This merge is
    performed in the pipeline — not by the LLM — so that consumers receive accurate
    per-period data without relying on model reproduction of large nested objects.

12. WHEN the Pipeline sets `status = 'failed'`, THE Pipeline SHALL persist the error
    message string to `DurationAnalysis.errorMessage` so that the SSE stream can surface
    the real failure reason.

13. WHEN a practitioner calls `POST /api/duration-analysis/[id]/override` and the
    analysis `status === 'symptom_unmatched'`, THE Override_API SHALL set
    `overrideApplied = true`, resume the pipeline from DA-3 with the mismatch context
    included in the prompt, and upon DA-3 completion set `status = 'done'`.

14. IF `POST /api/duration-analysis/[id]/override` is called and the analysis status
    is NOT `'symptom_unmatched'`, THEN THE Override_API SHALL return HTTP 400.

---

### Requirement 4: Chat / Follow-up Interface

**User Story:** As a practitioner, I want to ask follow-up questions about a completed
analysis so that I can explore specific periods or get clarification.

#### Acceptance Criteria

1. WHEN a practitioner posts a message to `POST /api/duration-analysis/[id]/chat` and
   the analysis `status === 'done'`, THE Chat_API SHALL call DA-3 with the full
   conversation history and return `200 { response, messageId, tokenIn, tokenOut }`.

2. WHEN a practitioner posts a message to `POST /api/duration-analysis/[id]/chat`,
   THE Chat_API SHALL persist the user message and assistant response as `DurationMessage`
   records before returning the response.

3. IF the analysis `status` is not `'done'` when chat is called, THEN THE Chat_API
   SHALL return HTTP 400 with "Analysis not complete".

4. WHEN building the DA-3 prompt for a follow-up, THE Chat_API SHALL:
   a. Always include all prior `DurationMessage` records ordered by `createdAt` ascending.
   b. Include full `da1Output` as context when message history depth is ≤ 2 turns.
   c. Use `contextSummary` in place of full `da1Output` when message history depth > 2
      turns, to contain token growth for long conversations.
   d. If `focusPeriod` is provided in the request body, prepend it to the prompt to
      anchor the model's response to the specified period.

5. THE Chat_API SHALL accept an optional `focusPeriod` field in the request body
   (max 200 characters) and include it in the DA-3 prompt when present.

---

### Requirement 5: Token Tracking and Cost

**User Story:** As an operator, I want token usage and cost recorded per analysis so
that I can monitor spend.

#### Acceptance Criteria

1. WHEN a `DurationAnalysis` reaches `status = 'done'` or `status = 'symptom_unmatched'`,
   THE Pipeline SHALL have accumulated `totalTokenIn` and `totalTokenOut` from all LLM
   calls made during the run, and `totalCostUsd` estimated from those counts.

2. WHEN a follow-up chat message produces a DA-3 response, THE Chat_API SHALL increment
   `DurationAnalysis.totalTokenIn`, `totalTokenOut`, and `totalCostUsd` by the token
   counts of that call, so analysis-level totals reflect all spend including conversations.

3. THE `GET /api/duration-analysis/[id]` endpoint SHALL include `totalTokenIn`,
   `totalTokenOut`, and `totalCostUsd` in its response body.

---

### Requirement 6: SSE Progress Stream

**User Story:** As a practitioner, I want to see real-time progress of the analysis so
that I know which agent is running and when the result is ready.

#### Acceptance Criteria

1. WHEN the SSE_Stream is opened, THE SSE_Stream SHALL immediately emit a `connected`
   event containing `{ analysisId, status }`.

2. WHEN an agent starts, THE SSE_Stream SHALL emit an `agent_start` event with
   `{ agent_id: 'DA-1' | 'DA-2' | 'DA-3' }`. Because the SSE route uses DB polling,
   `agent_start` is derived from DB state transitions (running + which outputs are null)
   rather than real-time pipeline events.

3. WHEN an agent completes, THE SSE_Stream SHALL emit an `agent_complete` event with
   `{ agent_id, tokenIn, totalTokenOut, totalCostUsd }` (cumulative analysis-level totals
   at the time of completion).

4. WHEN an agent fails, THE SSE_Stream SHALL emit an `agent_error` event with
   `{ error: "<message>" }` where the message is read from `DurationAnalysis.errorMessage`.

5. WHEN DA-2 returns `found === false`, THE SSE_Stream SHALL emit a `symptom_gate` event
   with `{ da2Output: <full DA-2 JSON> }`.

6. WHEN the pipeline completes all steps, THE SSE_Stream SHALL emit a `run_complete`
   event with `{ totalTokenIn, totalTokenOut, totalCostUsd }` and then close the stream.

7. WHILE the analysis is in a terminal state (`done | failed | symptom_unmatched`), THE
   SSE_Stream SHALL emit the appropriate terminal event and close within one poll cycle
   (≤ 2 seconds after reaching the state).

---

### Requirement 7: Data Retrieval

**User Story:** As a practitioner, I want to retrieve the full analysis result so that
I can display all agent outputs on the results page.

#### Acceptance Criteria

1. WHEN `GET /api/duration-analysis/[id]` is called and the record exists, THE
   Duration_Analysis_API SHALL return HTTP 200 with all fields: id, unifiedChartId,
   chartName, dateFrom, dateTo, category, userQuestion, symptoms, status, periodSlice,
   da1Output, da2Output, da3Output, totalTokenIn, totalTokenOut, totalCostUsd, messages,
   createdAt, updatedAt.

2. IF the `DurationAnalysis` record does not exist, THEN THE Duration_Analysis_API
   SHALL return HTTP 404.

---

### Requirement 8: UI — Form Page

**User Story:** As a practitioner, I want a form to configure and submit a duration
analysis without writing any API calls manually.

#### Acceptance Criteria

1. WHEN a practitioner visits `/duration-analysis`, THE UI SHALL display a chart picker
   populated from `GET /api/unified-charts`, date range inputs (From / To), a category
   selector (radio or tabs), an optional symptoms textarea, and an optional question textarea.

2. WHEN a practitioner submits the form with valid inputs, THE UI SHALL call
   `POST /api/duration-analysis` and redirect to `/duration-analysis/[id]` on a 202 response.

3. WHEN the form submission fails validation (missing required fields or dateFrom ≥ dateTo),
   THE UI SHALL display an inline error message and not submit the request.

---

### Requirement 9: UI — Results Page

**User Story:** As a practitioner, I want a results page that shows live agent progress
and rendered outputs so that I can review the analysis without polling manually.

#### Acceptance Criteria

1. WHEN a practitioner visits `/duration-analysis/[id]`, THE UI SHALL open a SSE
   connection to `/api/duration-analysis/[id]/events` and display agent status indicators
   (pending / running / done / failed) for DA-1, DA-2, and DA-3.

2. WHEN DA-1 completes, THE UI SHALL render the period table with columns for:
   MD lord, AD lord, PD lord, Start, End, Intensity badge, Favorable badge,
   Transit context (Saturn/Jupiter house from lagna + BAV score), and Analysis text (expandable).
   Each expanded row SHALL also show: Bahiranga and Antaranga sections separately,
   and an Activated Yogas section listing any yogas that activate in this period.

3. WHEN the analysis status is `symptom_unmatched`, THE UI SHALL display a prominent
   banner with the DA-2 analysis explaining the astrological mismatch.

4. WHEN DA-3 completes, THE UI SHALL display the answer field prominently and render
   period forecasts as expandable cards showing: forecast text, Bahiranga section,
   Antaranga section, "Why" (dasha reasoning), "Transit Why" (transit reasoning),
   and recommendations list.

5. WHEN the analysis status is `done`, THE UI SHALL display a follow-up chat input that
   calls `POST /api/duration-analysis/[id]/chat` and renders the response inline.

6. WHEN the analysis category is `health`, THE UI SHALL display a persistent, non-dismissible
   medical disclaimer banner stating that the analysis provides astrological perspectives
   only and is not medical advice, and directing the user to consult healthcare professionals.

---

### Requirement 10: Database Migration

**User Story:** As a developer, I want the new DB tables created via Prisma migration so
that the schema matches the application code.

#### Acceptance Criteria

1. THE database SHALL contain a `duration_analysis` table with columns: id, unifiedChartId
   (FK to unified_chart), dateFrom, dateTo, category, userQuestion, symptoms, status,
   periodSlice (JSONB), transitOverlay (JSONB), contextSummary (TEXT nullable),
   errorMessage (TEXT nullable), overrideApplied (BOOLEAN default false),
   da1Output (JSONB), da2Output (JSONB), da3Output (JSONB),
   totalTokenIn, totalTokenOut, totalCostUsd, createdAt, updatedAt.

2. THE database SHALL contain a `duration_message` table with columns: id, analysisId
   (FK to duration_analysis), role, content, agentId, focusPeriod (nullable),
   tokenIn (default 0), tokenOut (default 0), createdAt.

3. THE database SHALL have indexes on `duration_analysis.unifiedChartId`,
   `duration_analysis.status`, and `duration_message.analysisId`.

4. THE `model_config` table SHALL contain rows for `waveId` values `'DA-1'`, `'DA-2'`,
   and `'DA-3'` after the seed script runs.

