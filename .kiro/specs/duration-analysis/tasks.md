# Implementation Plan: Duration Analysis

## Overview

Implement the Duration Analysis feature as a 3-agent sequential pipeline (DA-1, DA-2,
DA-3) with a new Prisma schema, engine module, four API routes, two UI pages, three
prompt files, and model config seed data. Follow existing patterns from
`engine/orchestrator.ts`, `app/api/runs/[id]/events/route.ts`, and the runs UI.

All code is TypeScript. No raw SQL — Prisma only. All LLM calls go through `callLLM()`
in `engine/llm.ts`.

---

## Tasks

- [x] 1. Prisma schema, migration, and seed data
  - Add `DurationAnalysis` and `DurationMessage` models to `prisma/schema.prisma`
    matching the spec exactly (columns, types, relations, indexes, `@@map` names)
  - Add `durationAnalyses DurationAnalysis[]` relation to the `UnifiedChart` model
  - Run `npx prisma migrate dev --name add_duration_analysis` to create the migration
  - Add seed entries for `waveId: 'DA-1'`, `'DA-2'`, `'DA-3'` to the seed script
    with the model/provider/temperature/maxTokens values from the design
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 2. TypeScript types
  - Add `DurationCategory`, `DurationStatus`, `DurationAgentId`, `DashaSlice`,
    `DurationPipelineInput`, `PeriodAnalysis`, `DA1Output`, `SymptomDiagnosis`,
    `DA2Output`, `PeriodForecast`, `DA3Output`, `DurationSSEEvent`,
    `DurationSSEEventType`, `CategoryChartData` to `lib/durationTypes.ts`
  - Add `PeriodLordAnnotation`, `TransitOverlay`, and updated `DashaSlice` (with `lordAnnotations`),
    updated `PeriodAnalysis` (with `transit_factors`, `bahiranga`, `antaranga`),
    updated `PeriodForecast` (with `bahiranga`, `antaranga`, `transit_why`),
    and `buildContextSummary` function signature
  - Add `focusPeriod` optional field to chat request type
  - Export all types from the new file; do not modify `lib/types.ts`
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 3. Period Slicer — `engine/durationAnalysis/slicer.ts`
  - Implement `sliceDashaTree(dashaTree: unknown, dateFrom: Date, dateTo: Date, chart: UnifiedChartData): DashaSlice[]`
  - After slicing, annotate each entry with `lordAnnotations`:
    for each of MD/AD/PD lord, look up the planet in `chart.nakshatras` (for nakshatra, nakshatraLord, subLord),
    `chart.planets` (for sign, house, retrograde), and `chart.relationships.combustion` (for combust, cazimi)
  - Return entries sorted by `pd.start` ascending; return `[]` (no throw) when empty
  - Yoga activation: for each period entry, compute `activatedYogas[]` on each lord annotation by checking:
    (a) Parivartana: MD lord and AD lord in `relationships.mutualReception`
    (b) Conjunction yoga: MD lord and AD lord in the same `relationships.conjunctions` entry
    (c) Raja Yoga substrate: check `relationships.houseLords` — if one lord owns kendra and other owns trikona
    (d) Dhana Yoga substrate: one lord owns 2nd or 11th, other owns 1st, 5th, or 9th
    (e) Neechabhanga: period lord is debilitated AND exaltation/own-sign lord is in kendra from lagna
  - Populate `ownsHouses`: scan `relationships.houseLords[1]` (D1 only) for all house entries where the lord matches this planet
  - Set `occupiesHouse` = same as `house` from `planets[]` (explicit copy for prompt readability)
  - If slice result exceeds 200 entries, truncate to first 200 and return a `truncated` metadata flag alongside the slice
  - _Requirements: 2.1, 2.2_

  - [ ]* 3.1 Write property test for Period Slicer overlap correctness
    - **Property 1: Period Slicer overlap correctness**
    - **Validates: Requirements 2.1, 2.2**
    - Generate random DashaTree instances and random date ranges; verify every
      overlapping PD appears in output and no non-overlapping PD appears
    - Use a reference implementation (brute-force nested loops) as the oracle

  - [ ]* 3.2 Write property test for Period Slicer sort order
    - **Property 2: Period Slicer sort order**
    - **Validates: Requirements 2.1**
    - For any non-empty slice result, verify adjacent pairs satisfy `a.pd.start <= b.pd.start`

- [x] 3.5. Transit Overlay — `engine/durationAnalysis/transitOverlay.ts`
  - Implement `buildTransitOverlay(periodSlice, natalMoonSignNumber, natalLagnaSignNumber, birthYear, storedTransits): TransitOverlay[]`
  - Deduplicate AD start dates from the period slice
  - For each unique AD start date: call `computeTransits(natalMoonSignNumber, natalLagnaSignNumber, birthYear, new Date(adStart))` from `engine/compute/transits.ts`
  - Extract Saturn, Jupiter, Rahu, Ketu from the returned `transits` array
  - Read `sadeSatiAllPeriods` from `storedTransits` JSONB (already stored — no re-scan); check if adStart falls within any period to set sadeSatiActive and phase
  - Set `ashtamaShani` and `kantakaShani` from the returned `TransitAnalysis` fields
  - Accept `storedAshtakavarga: unknown` as additional parameter
  - Look up `saturnBavScore` = `storedAshtakavarga.bav['Saturn'][saturn.signNumber - 1]` (0–8); default to -1 if ashtakavarga is null
  - Look up `jupiterBavScore` = `storedAshtakavarga.bav['Jupiter'][jupiter.signNumber - 1]` (0–8); default to -1 if ashtakavarga is null
  - Pass `chart.ashtakavarga` from the pipeline when calling `buildTransitOverlay`
  - _Requirements: 2.9_

- [ ] 4. Category Extractor — `engine/durationAnalysis/extractor.ts`
  - Implement `extractCategoryData(chart, category): CategoryChartData`
  - Apply the column map from the design for all five categories
  - Filter `divisionalCharts` JSON array to only the relevant division string
    (match `division` field: `'D30'`, `'D10'`, `'D2'`, `'D9'`, `'D4'`)
  - Always include `nakshatras`, full `relationships`, and `ashtakavarga` for all categories regardless of category value
  - Rationale: nakshatra lords, combustion, yoga detection (relationships), and BAV transit scores (ashtakavarga) are needed for all domains
  - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.10, 2.12_

  - [ ]* 4.1 Write property test for Category Extractor column isolation
    - **Property 3: Category extractor column isolation**
    - **Validates: Requirements 2.3, 2.4, 2.5, 2.6, 2.7, 2.10**
    - For each of the five categories: generate a chart with all columns populated,
      call `extractCategoryData`, verify exactly the expected keys are present and
      no extra keys are included

- [x] 5. Prompt files
  - Create `prompts/agents/duration_da1_domain_analyser.md` with the DA-1 prompt
    from the design (JSON output contract, RULES section)
  - Create `prompts/agents/duration_da2_symptom_validator.md` with the DA-2 prompt
  - Create `prompts/agents/duration_da3_future_analyser.md` with the DA-3 prompt
  - All three files must instruct the model to return only valid JSON with no
    markdown fences; include the exact JSON schema in each file
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 6. Pipeline engine — `engine/durationAnalysis/index.ts`
  - Implement `executeDurationPipeline(input: DurationPipelineInput): Promise<void>`
  - Step 0a: call `sliceDashaTree` with chart data for lord annotation, persist `periodSlice`
  - Step 0b: call `buildTransitOverlay`, persist `transitOverlay`; if buildTransitOverlay throws, log warning and continue with empty array
  - After DA-3: call `buildContextSummary(da1Output, da3Output, periodSlice)`, persist `contextSummary`
  - When building DA-1 prompt: pass `transitOverlay` as a separate JSON section labelled "TRANSIT OVERLAY"
  - When building DA-3 chat follow-up prompt: use `contextSummary` instead of full `da1Output` when history depth > 2
  - Step 1: build DA-1 prompt (call `readPromptFile`, prepend categoryData + periodSlice
    as JSON blocks), call `callLLM` with DA-1 `ModelConfig`, parse JSON, persist `da1Output`
    + symptoms, call `callLLM`, parse, persist `da2Output`; check `found === false` gate
  - Gate: if `found === false` → update `status = 'symptom_unmatched'`, emit `symptom_gate`,
    return early
  - Step 3: build DA-3 prompt with categoryData + da1Output + da2Output + conversation history,
    call `callLLM`, parse, persist `da3Output`, set `status = 'done'`
  - Emit `agent_start` and `agent_complete` events around each LLM call
  - Accumulate tokenIn/tokenOut/costUsd into analysis totals on each step
  - Wrap entire body in try/catch: on error set `status = 'failed'`, emit `agent_error`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [ ]* 6.1 Write property test for Symptom Gate state invariant
    - **Property 5: Symptom gate state invariant**
    - **Validates: Requirements 3.2, 3.3, 3.4**
    - Mock `callLLM` to return controlled DA-2 output; for `found=false` verify
      `status='symptom_unmatched'` and `da3Output=null`; for `found=true` verify
      DA-3 was called and `da3Output` is not null; for `symptoms=null` verify
      DA-2 was never called

  - [ ]* 6.2 Write property test for Token accumulation invariant
    - **Property 6: Token accumulation invariant**
    - **Validates: Requirements 3.9, 5.1**
    - Mock `callLLM` to return known token counts per call; after pipeline completes,
      verify `totalTokenIn` equals the sum and `totalCostUsd` equals the sum of costs

- [ ] 7. Checkpoint — verify engine layer
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. API route: `POST /api/duration-analysis`
  - File: `app/api/duration-analysis/route.ts`
  - Validate body with the Zod schema from the design
  - Return 400 for missing fields, 400 for dateFrom >= dateTo, 404 for missing chart,
    422 for null dashaTree
  - Return 400 if date span exceeds 10 years (3653 days): "Date range must not exceed 10 years"
  - _Requirements: 1.8_
  - Create `DurationAnalysis` record, optionally create user `DurationMessage`,
    fire `executeDurationPipeline` without await, return 202 `{ analysisId }`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ]* 8.1 Write property test for input validation
    - **Property 4: Input validation rejects invalid requests**
    - **Validates: Requirements 1.2, 1.3, 1.7**
    - Generate invalid request bodies (missing fields, bad dates, bad category values);
      verify each returns 4xx and creates no DB record

- [x] 9. API route: `GET /api/duration-analysis/[id]`
  - File: `app/api/duration-analysis/[id]/route.ts`
  - Load record with `messages` relation ordered by `createdAt` asc
  - Join `chartName` from `UnifiedChart.name`
  - Return 200 with all fields from the design response shape; return 404 if not found
  - _Requirements: 7.1, 7.2_

- [x] 10. API route: `GET /api/duration-analysis/[id]/events`
  - File: `app/api/duration-analysis/[id]/events/route.ts`
  - Implement SSE stream using `ReadableStream` — identical pattern to
    `app/api/runs/[id]/events/route.ts`
  - Poll every 2 seconds; emit `connected` immediately on open
  - Track emitted events with a `Set<string>` to avoid duplicates
  - Emit `agent_start` / `agent_complete` / `agent_error` by tracking a `reportedEvents` set
    keyed on `${agentId}_${status}`; derive these from the `DurationAnalysis` status
    changes (poll the single record — no separate WaveOutput table)
  - Emit `symptom_gate` when `status === 'symptom_unmatched'` (include `da2Output`)
  - Emit `run_complete` when `status === 'done'`; close stream
  - Close stream on `failed` or `symptom_unmatched` terminal states
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 11. API route: `POST /api/duration-analysis/[id]/chat`
  - File: `app/api/duration-analysis/[id]/chat/route.ts`
  - Validate `status === 'done'`; return 400 otherwise
  - Load `DurationAnalysis` with `da1Output`, `da2Output`, `da3Output`, and all `messages`
  - Create user `DurationMessage`
  - Build DA-3 prompt: prepend categoryData summary, da1Output, da2Output if present,
    then conversation history as `Practitioner: / Assistant:` pairs, then the new message
  - Accept optional `focusPeriod` field in request body (Zod: `z.string().max(200).optional()`)
  - When building DA-3 prompt: check message history depth; if > 2 use `contextSummary`
    instead of full `da1Output`; if focusPeriod provided, prepend as "Focus period: X"
  - Store `focusPeriod` on the created `DurationMessage` record
  - Call `callLLM` using `DA-3` `ModelConfig`; create assistant `DurationMessage`
  - Return 200 `{ response, messageId, tokenIn, tokenOut }`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 11.1 Write property test for chat message history completeness
    - **Property 7: Chat message history completeness**
    - **Validates: Requirements 4.2, 4.4**
    - For N successive chat messages, verify the messages list after each call contains
      all prior messages in order with no gaps

  - [ ]* 11.2 Write property test for chat rejected on non-done status
    - **Property 8: Chat rejected on non-done status**
    - **Validates: Requirements 4.3**
    - For each non-done status value, verify POST /chat returns 400 and creates no
      DurationMessage records

- [x] 11.5. API route: `POST /api/duration-analysis/[id]/override`
  - File: `app/api/duration-analysis/[id]/override/route.ts`
  - Validate `status === 'symptom_unmatched'`; return 400 otherwise
  - Set `overrideApplied = true`, `status = 'running'`
  - Load existing `da1Output`, `da2Output`, `categoryData` from DB
  - Build DA-3 prompt with override preamble noting the mismatch and that practitioner chose to proceed
  - Call `callLLM` with DA-3 config, persist `da3Output`, set `status = 'done'`
  - Emit `agent_complete` DA-3 + `run_complete` SSE events
  - Generate `contextSummary` as normal
  - Return 202 `{ status: 'resumed' }`
  - _Requirements: 3.11, 3.12_

- [x] 12. Checkpoint — verify API layer
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. UI: Form page — `app/duration-analysis/page.tsx`
  - Client Component (`'use client'`)
  - On mount: fetch `GET /api/unified-charts` to populate chart picker `<select>`
  - Form fields: chart picker, dateFrom `<input type="date">`, dateTo `<input type="date">`,
    category radio/tabs, symptoms `<textarea>`, question `<textarea>`
  - Client-side validation: unifiedChartId required; dateFrom required and < dateTo; category required
  - On submit: `POST /api/duration-analysis`; on 202 `router.push('/duration-analysis/' + analysisId)`
  - Show inline error on validation failure or API error
  - Use Tailwind dark theme consistent with existing pages (match `app/unified-charts/page.tsx` style)
  - _Requirements: 8.1, 8.2, 8.3_

- [x] 14. UI: Results page — `app/duration-analysis/[id]/page.tsx`
  - Client Component (`'use client'`)
  - On mount: fetch `GET /api/duration-analysis/[id]` to hydrate initial state
  - Open `EventSource` on `/api/duration-analysis/[id]/events`; handle all event types:
    `connected`, `agent_start`, `agent_complete`, `agent_error`, `symptom_gate`, `run_complete`
  - Close EventSource on terminal states; refetch full record on `run_complete`
  - Agent status panel: three rows (DA-1, DA-2, DA-3) with pulsing/solid/red dots
    (match pattern from `app/runs/[id]/page.tsx`)
  - DA-2 skipped indicator: grey badge when no symptoms were provided
  - Symptom gate banner: amber panel with DA-2 analysis text when
    `status === 'symptom_unmatched'`
  - Period table (after DA-1): columns — MD lord, AD lord, PD lord, Start, End,
    Intensity badge (color-coded: high=red, medium=amber, low=gray), Favorable badge
    (green/red), Analysis text with expand/collapse
  - Period table: add "Transit" column showing Saturn and Jupiter house from lagna with BAV score
    (e.g. "♄ H8 (3/8)" where 3 is Saturn's BAV score in that sign — red if ≤3, green if ≥4)
  - Expanded period row: show Bahiranga, Antaranga, and Activated Yogas as separate labelled sections
  - DA-3 forecast section (after DA-3): prominent `answer` field, then per-period
    accordion cards showing forecast, "why" (expandable), and recommendations list
  - DA-3 forecast cards: show Bahiranga, Antaranga, and Transit Why as separate
    collapsible sections within each card
  - Follow-up chat (when `status === 'done'`): textarea + send button; renders
    user messages right-aligned and assistant messages left-aligned
  - Chat input: add optional "Focus period" selector (dropdown from AD periods in
    da1Output) that populates `focusPeriod` in the chat request body
  - If `category === 'health'`: display persistent medical disclaimer banner (grey info bar,
    not dismissible, always visible regardless of pipeline status)
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 15. Navigation link
  - Add a "Duration Analysis" link to the main navigation (wherever the existing nav
    is defined — match the existing nav pattern)
  - _Requirements: 8.1_

- [x] 16. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use mocked `callLLM` to avoid real API costs during CI
- The SSE events route polls `DurationAnalysis` status/outputs directly (no separate
  `WaveOutput` rows) — emit agent lifecycle events based on which output fields
  transition from null to populated
- `sliceDashaTree` receives raw JSONB (dates are ISO strings, not `Date` objects) —
  coerce with `new Date(str)` inside the function
- `executeDurationPipeline` is fire-and-forget from the API route; never `await` it
  at the call site (same pattern as `executePipeline` in `orchestrator.ts`)
- `buildTransitOverlay` calls `computeTransits()` which uses Swiss Ephemeris — this runs server-side only, never in client components
- Transit overlay computation is best-effort: if ephemeris fails for a date, skip that AD and continue
- `contextSummary` is generated post-DA-3 synchronously — it's a simple string concat/summarisation, not an LLM call; use a deterministic template approach (not LLM) to avoid additional cost
- `lordAnnotations` are computed deterministically from stored DB data — no LLM, no ephemeris
- `focusPeriod` is purely a UX hint for DA-3; the model may ignore it if the question is more general
- Yoga activation is computed deterministically in `slicer.ts` — no LLM needed. It uses `relationships.houseLords` (already stored) for kendra/trikona house ownership checks
- BAV scores are a direct array index lookup from stored JSONB — O(1), no computation
- For paste-path charts: `ashtakavarga` may be null if not computed. Always default BAV scores to -1 and have DA-1 treat -1 as "BAV data not available for this chart"
- The `activatedYogas[]` list on each `PeriodLordAnnotation` is the single source of truth for yoga context. DA-1 reads it from `lordAnnotations` — it must NOT re-derive yogas from raw chart data
