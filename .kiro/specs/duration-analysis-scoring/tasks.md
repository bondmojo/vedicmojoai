# Implementation Plan: Duration Analysis Scoring (Phase 1)

## Overview

Add a deterministic, compute-first scoring layer to the existing Duration Analysis (DA)
pipeline: a pure `engine/durationAnalysis/scoring.ts` engine that produces a 0–100 `score`,
`intensity` band, `favorable` flag, and an itemized `ScoreBreakdown` for every sliced period;
a `DOMAIN_SCORING_WEIGHTS` table as the single source of per-domain parameters; deterministic
peak identification; the compute-first / LLM-narrates contract for DA-1 and DA-3; persistence
inside the existing `periodSlice` JSONB; and additive exposure through
`GET /api/duration-analysis/[id]`.

This is **Phase 1 — engine + persistence + API only**. UI / report rendering of scores,
breakdowns, peaks, and the reduced-confidence flag is deferred to Phase 1.1 and is **not** in
this plan. All code is TypeScript. The scoring engine is pure (no LLM, network, DB, or file
I/O). No database migration is required — scores live in the existing `periodSlice` `Json?`
column and peaks are persisted inside `da1Output`.

Build order follows the design: types → weights table → slicer annotation → extractor
injection → scoring engine → pipeline integration → prompt updates → API → tests/backtest →
docs.

---

## Tasks

- [ ] 1. Scoring data model and configuration
  - [ ] 1.1 Add scoring types to `lib/durationTypes.ts`
    - Add `ScoringFactorKey` (the 15 factor keys), `DomainScoringWeights`,
      `DomainSpecialPointSpec`, `ResolvedSpecialPoint`, `DomainSpecialPoints`
    - Add `ScoreFactorContribution` (factor/value/weight/normalized/contribution),
      `ScoreOmission` (factor/reason/severity), `ScoreBreakdown` (score, intensity,
      favorable, factors[], omissions[], weightSumApplied, reducedConfidence, confidence,
      `weightsVersion`), `ScoredDashaSlice`, `PeakPeriod`, `ScoringChartData`
    - Extend `PeriodLordAnnotation` with `karakaRole: string | null`
    - Add optional `score?: number` and `scoreBreakdown?: ScoreBreakdown` to `PeriodAnalysis`
    - _Requirements: 1.1, 1.8, 4.1, 10.3, 11.2, 12.2_

  - [ ] 1.2 Implement `DOMAIN_SCORING_WEIGHTS` and resolver in `engine/durationAnalysis/scoringWeights.ts`
    - Define `WEIGHTS_VERSION = '0.1.0-provisional'` and the fully-specified six-domain
      `DOMAIN_SCORING_WEIGHTS` table (health, career, wealth, marriage, property, cashflow),
      each declaring `beneficHouses`, `maleficHouses`, `primaryHouses`, `relevantKarakaRoles`,
      `relevantNaturalKarakas`, a complete per-`ScoringFactorKey` `weights` map,
      `specialPoints` (each domain declares Ghati Lagna `GL`), and `primaryFactors`
    - Implement `resolveDomainWeights(category)` and `ScoringConfigError`; throw when a
      `DOMAIN_AGENT_REGISTRY` category is missing from `DOMAIN_SCORING_WEIGHTS`
    - Mark the table PROVISIONAL / UNCALIBRATED in code comments
    - _Requirements: 7.1, 7.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 12.1, 12.4_

  - [ ]* 1.3 Write property test for missing-weights configuration error
    - **Property 20: Configuration error on missing weights**
    - **Validates: Requirements 9.4**

  - [ ]* 1.4 Write property test for full six-domain configuration
    - **Property 28: All six domains are fully configured**
    - **Validates: Requirements 9.5, 9.6**

- [ ] 2. Deterministic annotation and extraction
  - [ ] 2.1 Add Karaka_Role tagging to `engine/durationAnalysis/slicer.ts`
    - Extend the `sliceDashaTree` `chart` param with `karakas: unknown` (stored `CharaKaraka[]`)
    - Add `lookupKarakaRole(karakas, planet): string | null` returning `karakaAbbr`, `null`
      for any planet absent from the array (nodes Rahu/Ketu, and empty/absent `karakas`)
    - Set `karakaRole` in `buildAnnotation`
    - _Requirements: 4.1, 4.2, 4.4_

  - [ ]* 2.2 Write property test for Karaka_Role tagging
    - **Property 11: Karaka_Role tagging**
    - **Validates: Requirements 4.1, 4.2**

  - [ ] 2.3 Extend `engine/durationAnalysis/extractor.ts` with deterministic injection
    - Inject `nakshatraRelationships` on-demand via
      `computeNakshatraRelationships(nakshatras, lagnaSubLord)` (derive `lagnaSubLord` from a
      Lagna/Ascendant entry in `nakshatras`, else call without it); omit the key entirely when
      `nakshatras` is absent/empty
    - Inject `bhavaBala` (null/empty when the column is absent), `ishtaKashta` (from stored
      `shadbala`), `ashtakavarga` SAV (null when absent), and natal `planets`
    - Resolve per-domain special points from `DOMAIN_SCORING_WEIGHTS[category].specialPoints`
      into `ResolvedSpecialPoint`, marking unavailable points explicitly `omitted: true`
      (never silently dropped, never a placeholder)
    - Add `toScoringChartData(categoryData, chart): ScoringChartData` assembling
      shadbala/bhavaBala/karakas/ashtakavarga/planets/specialPoints for the engine
    - Extend `CategoryChartData` and `ScoringChartData` accordingly
    - _Requirements: 5.1, 5.3, 6.1, 6.3, 7.2, 7.3, 7.4_

  - [ ]* 2.4 Write property test for nakshatra-relationship injection
    - **Property 13: Nakshatra-relationship injection**
    - **Validates: Requirements 5.1, 5.3**

  - [ ]* 2.5 Write property test for declared special-point representation
    - **Property 15: Declared special points are always represented**
    - **Validates: Requirements 7.3, 7.4**

- [ ] 3. Checkpoint — verify config, slicer, and extractor layers
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Scoring engine — `engine/durationAnalysis/scoring.ts`
  - [ ] 4.1a Implement the core scoring formula and the 11 original factors
    - Export constants `FAVORABLE_THRESHOLD`, `INTENSITY_HIGH_DELTA`, `INTENSITY_MEDIUM_DELTA`,
      `PEAK_SIGNIFICANCE_DELTA`, and provisional `BHAVA_RUPAS_CALIBRATION`
    - Implement the weight-normalized average formula scaled to an integer 0–100, with omitted
      factors dropping from both numerator and denominator; empty factor set → neutral 50 with
      `reducedConfidence = true`
    - Implement the 11 original factors: `mdLordDignity`, `adLordDignity`, `pdLordDignity`
      (dignity ladder, Neechabhanga lift), `shadbala`, `ishtaKashta`, `houseOwnership` (domain
      benefic/malefic + 6/8/12 dusthana penalty), `karakaRole`, `activatedYogas`, `bhavaBala`
      (non-saturating relative normalization, absolute fallback via provisional
      `BHAVA_RUPAS_CALIBRATION` — Req 1.13), `transitBav`, `saturnAfflictions`
    - Use array-based Shadbala access (`shadbala.planets.find(p => p.planet === lord)`)
    - Never throw on missing/malformed data — degrade to omissions
    - _Requirements: 1.1, 1.2, 1.3, 1.4 (partial), 1.5, 1.6, 1.7, 1.13, 4.3, 6.2, 9.2, 9.3, 11.1_

  - [ ] 4.1b Implement the four new astrological factors
    - Export constant `SAV_MEAN`
    - Implement `naturalKaraka` (running lords vs domain `relevantNaturalKarakas` — Req 1.9)
    - Implement `domainHouseActivation` (Saturn/Jupiter double transit via house-from-lagna +
      graha-drishti onto the domain's `primaryHouses` — Req 1.10)
    - Implement `mdAdRelationship` (naisargika + tatkalika maitri with the shashtashtaka 6/8
      penalty — Req 1.11)
    - Implement `natalHouseStrength` (domain-house SAV bindus vs `SAV_MEAN` — Req 1.12)
    - Never throw on missing/malformed data — degrade to omissions
    - _Requirements: 1.4 (completes), 1.9, 1.10, 1.11, 1.12_

  - [ ] 4.1c Implement derivations, confidence, itemization, and version stamp
    - Derive `intensity` band and `favorable` flag as pure functions of the score
    - Record each applied factor's `value`/`weight`/`normalized`/`contribution`
    - Record every omission with severity; set `reducedConfidence`/`confidence` from primary vs
      secondary omissions
    - Stamp `weightsVersion = WEIGHTS_VERSION` on every breakdown
    - _Requirements: 1.8, 2.1, 2.2, 2.3, 11.2, 11.4, 12.2_

  - [ ] 4.2 Implement `identifyPeaks` with the significance floor
    - Rank scored periods by score; return up to `topN` (default 3) `peakStress` (lowest) and
      `peakFavorable` (highest); include all ties with deterministic tie-order (ascending
      `pd.start`, then md/ad/pd lord triple)
    - Apply the significance floor: `peakStress` requires `score ≤ 50 − PEAK_SIGNIFICANCE_DELTA`,
      `peakFavorable` requires `score ≥ 50 + PEAK_SIGNIFICANCE_DELTA`; a flat window returns
      fewer peaks or none
    - Build each `PeakPeriod` with label, `periodKey`, score, and top-3 `topFactors` by contribution
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7_

  - [ ]* 4.3 Write property test for bounded integer score
    - **Property 1: Score is a bounded integer**
    - **Validates: Requirements 1.1, 1.5**

  - [ ]* 4.4 Write property test for determinism
    - **Property 2: Determinism**
    - **Validates: Requirements 1.3**

  - [ ]* 4.5 Write property test for full factor set on complete data
    - **Property 3: Full data applies the complete factor set**
    - **Validates: Requirements 1.4**

  - [ ]* 4.6 Write property test for graceful degradation
    - **Property 4: Graceful degradation on missing inputs**
    - **Validates: Requirements 1.6, 4.4, 6.3, 11.1**

  - [ ]* 4.7 Write property test for never-throw on malformed input
    - **Property 5: Never throws on malformed input**
    - **Validates: Requirements 1.7, 10.4**

  - [ ]* 4.8 Write property test for factor itemization
    - **Property 6: Factor itemization**
    - **Validates: Requirements 1.8, 10.3**

  - [ ]* 4.9 Write property test for intensity/favorable purity
    - **Property 7: Intensity band and favorable flag are pure functions of the score**
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [ ]* 4.10 Write property test for Karaka_Role relevance monotonicity
    - **Property 12: Karaka_Role relevance is monotonic**
    - **Validates: Requirements 4.3**

  - [ ]* 4.11 Write property test for Bhava Bala contribution monotonicity
    - **Property 14: Bhava Bala contribution is monotonic**
    - **Validates: Requirements 6.2**

  - [ ]* 4.12 Write property test for weight-driven scoring
    - **Property 16: Scoring is driven entirely by the supplied weights**
    - **Validates: Requirements 9.2, 9.3**

  - [ ]* 4.13 Write property test for omission-driven confidence
    - **Property 19: Omissions determine confidence, weighted by severity**
    - **Validates: Requirements 11.2, 11.4**

  - [ ]* 4.14 Write property test for Natural_Karaka relevance monotonicity
    - **Property 21: Natural_Karaka relevance is monotonic**
    - **Validates: Requirements 1.9**

  - [ ]* 4.15 Write property test for Domain_House_Activation double transit
    - **Property 22: Domain_House_Activation credits the double transit**
    - **Validates: Requirements 1.10**

  - [ ]* 4.16 Write property test for MD_AD_Relationship shashtashtaka penalty
    - **Property 23: MD_AD_Relationship applies a shashtashtaka penalty**
    - **Validates: Requirements 1.11**

  - [ ]* 4.17 Write property test for Natal_House_Strength monotonicity
    - **Property 24: Natal_House_Strength is monotonic in SAV bindus**
    - **Validates: Requirements 1.12**

  - [ ]* 4.18 Write property test for non-saturating Bhava Bala normalization
    - **Property 25: Bhava Bala normalization does not saturate**
    - **Validates: Requirements 1.13**

  - [ ]* 4.19 Write property test for weights-version stamping
    - **Property 27: Every breakdown is stamped with the weights version**
    - **Validates: Requirements 12.2, 12.3**

  - [ ]* 4.20 Write property test for breakdown serialization round-trip
    - **Property 18: Score breakdown survives serialization round-trip**
    - **Validates: Requirements 10.3, 10.4**

  - [ ]* 4.21 Write property test for peaks being score extremes
    - **Property 8: Peaks are the score extremes**
    - **Validates: Requirements 3.1, 3.2**

  - [ ]* 4.22 Write property test for peak entry contents
    - **Property 9: Peak entries carry label, score, and top factors**
    - **Validates: Requirements 3.4**

  - [ ]* 4.23 Write property test for tied-extreme completeness and ordering
    - **Property 10: Tied extremes are complete and deterministically ordered**
    - **Validates: Requirements 3.5**

  - [ ]* 4.24 Write property test for the peak significance floor
    - **Property 26: Peaks respect the significance floor**
    - **Validates: Requirements 3.6, 3.7**

- [ ] 5. Checkpoint — verify scoring engine
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Pipeline integration — `engine/durationAnalysis/index.ts`
  - [ ] 6.1 Add Step 0d scoring and persist scored slices + peaks
    - After extraction: `resolveDomainWeights(category)`, build `toScoringChartData`, index
      transit overlay by AD start, call `scorePeriod` per period, then `identifyPeaks`
    - Persist `periodSlice` as `ScoredDashaSlice[]` (score/intensity/favorable/scoreBreakdown
      with `weightsVersion`); scoring runs once over the whole window before batching so peaks
      are global and batch-independent
    - _Requirements: 2.4, 3.3, 10.1_

  - [ ] 6.2 Implement the compute-first merge and authoritative peaks
    - Extend `mergePeriodContext` to overwrite each `period_analysis[i].intensity`/`.favorable`
      with the engine values and attach `score` + `scoreBreakdown`; discard model-emitted
      verdicts even for unmatched periods (engine value always wins)
    - Replace `da1Output.peak_stress_periods` / `peak_favorable_periods` with the engine's
      `peakStress`/`peakFavorable` (mapped to the existing `{ period, reason }` shape); stop
      concatenating LLM peaks in `mergeDA1Outputs`
    - _Requirements: 3.3, 8.1, 8.3, 8.4_

  - [ ] 6.3 Inject engine verdicts and peaks into DA-3 via `buildDA3Prompt`
    - Build a compact scored-period summary (one row per AD: score/intensity/favorable + top
      factors) from persisted `ScoredDashaSlice[]` and inject it with the deterministic
      `peakStress`/`peakFavorable` as authoritative context
    - _Requirements: 14.1_

  - [ ]* 6.4 Write property test for the compute-first merge
    - **Property 17: Compute-first merge always yields engine verdicts**
    - **Validates: Requirements 8.3, 8.4**

- [ ] 7. Prompt updates
  - [ ] 7.1 Add the Compute-First Contract block to `prompts/agents/duration_da1_domain_analyser.md`
    - Instruct the model that engine `score`/`intensity`/`favorable`/`score_breakdown` are
      authoritative; it must narrate only, must not change intensity/favorable, must not select
      or reorder peaks, must use injected `nakshatraRelationships`/`bhavaBala`/special points
      rather than re-deriving them, and must note reduced confidence when flagged
    - _Requirements: 5.2, 8.2_

  - [ ] 7.2 Add the Consistency Contract block to `prompts/agents/duration_da3_future_analyser.md`
    - Instruct the model that each period's engine verdict is authoritative and MUST NOT be
      reversed (no favorable→challenging or challenging→favorable flip), it may add nuance but
      not flip direction or contradict the intensity band, and it must not select, reorder, or
      invent peaks
    - _Requirements: 14.4_

  - [ ] 7.3 Add a DA-2 clarifying comment to `prompts/agents/duration_da2_symptom_validator.md`
    - Add a one-line comment stating that DA-2 is intentionally UNAFFECTED by the compute-first
      contract: it validates whether the reported symptoms match the chart's indications and
      does not judge period favorability, so there is nothing for it to override
    - This is a clarifying note only — do NOT add any DA-2 behavioral change
    - _Requirements: 14.x context / note only_

- [ ] 8. Duration Analysis API — `app/api/duration-analysis/[id]/route.ts`
  - [ ] 8.1 Surface scores, breakdowns, and peaks additively
    - Add a top-level `peaks: { peakStress, peakFavorable }` field read from persisted
      `da1Output`; confirm `periodSlice` scores/breakdowns pass through verbatim (JSONB)
    - Preserve the legacy score-absent contract: pre-feature period slices are returned verbatim
      with no synthesized score/breakdown and trigger no recomputation or rescoring
    - _Requirements: 10.2, 11.5, 11.6_

- [ ] 9. Checkpoint — verify pipeline, prompts, and API
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Verification and calibration
  - [ ]* 10.1 Write integration test for the compute-first pipeline
    - Run `executeDurationPipeline` (DA-1 mocked via `callAgentJson` seam) on a stored
      compute-path chart; assert persisted `periodSlice` entries carry
      score/intensity/favorable/scoreBreakdown with a `weightsVersion` stamp, DA-1's emitted
      intensity/favorable are overwritten by engine values, and `GET /api/duration-analysis/[id]`
      surfaces scores + breakdowns + peaks
    - _Requirements: 8.3, 8.4, 10.1, 10.2, 12.2_

  - [ ]* 10.2 Write integration test for the legacy verbatim contract
    - Assert a legacy `DurationAnalysis` row (period slices without scores) is returned verbatim
      with no synthesized score and triggers no rescoring on read
    - _Requirements: 11.5, 11.6_

  - [ ]* 10.3 Write integration test for DA-3 forecast consistency
    - **Property 29: DA-3 forecast never flips the engine verdict** (integration/prompt-verified,
      not PBT): invoke DA-3 (mocked LLM seam) with seeded engine per-period verdicts + peaks and
      assert the returned per-period direction never contradicts the injected
      `favorable`/`intensity`
    - **Validates: Requirements 14.2, 14.3, 14.4**

  - [ ] 10.4 Add the Sanity_Backtest fixture suite and pin calibration constants
    - Add ≈4–8 curated chart JSON fixtures under `engine/durationAnalysis/__fixtures__/`, each
      with an expected relative ranking for a domain + window
    - Assert `scorePeriod`/`identifyPeaks` produce orderings consistent with the expected
      relative rankings, and pin `BHAVA_RUPAS_CALIBRATION` and `SAV_MEAN` against the observed
      fixture distribution so normalization never regresses to a saturating cap
    - **Calibration ordering:** this task recalibrates the provisional `BHAVA_RUPAS_CALIBRATION`
      (used by 4.1a's `bhavaBala`) and `SAV_MEAN` (used by 4.1b's `natalHouseStrength`) — the
      exact constants the engine property tests for 4.1a/4.1b assert against. After 10.4 shifts
      these constants, the engine property tests (task 4 sub-tasks, especially Properties 24 and
      25) MUST be re-run so a constant shift can't silently invalidate earlier green tests
    - _Requirements: 1.13, 13.1, 13.2_

- [ ] 11. Documentation and roadmap
  - [ ] 11.1 Update maintenance docs to reflect the scoring layer
    - Per the AGENTS.md documentation-maintenance rule, update `Agents.md`, `docs/HLD.md`,
      `docs/DFD.md`, `docs/ERD.md`, and the relevant skills (`skills/engine-pipeline.md`,
      `skills/backend/duration-analysis.md`, `Claude.md`) to describe Step 0d scoring, the
      `DOMAIN_SCORING_WEIGHTS` table, deterministic peaks, the compute-first/LLM-narrates
      contract, and score/breakdown persistence in `periodSlice`
    - _Requirements: 8.1, 10.1_

  - [ ] 11.2 Flip `docs/ROADMAP.md` Phase 1 status
    - Update the Phase Summary row and the Phase 1 section status once the tasks above are done
    - _Requirements: 12.4_

- [ ] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Confirm the engine property tests were re-run after task 10.4 recalibrated
    `BHAVA_RUPAS_CALIBRATION` and `SAV_MEAN`, so no earlier green test was silently invalidated
    by a constant shift.

---

## Notes

- Tasks marked with `*` are optional (property/integration tests) and can be skipped for a
  faster path; core implementation and the Sanity_Backtest (10.4) are not optional.
- Property-based tests use `fast-check` (≥100 iterations each) under Vitest and are tagged
  `Feature: duration-analysis-scoring, Property N: <text>`. They target the pure engine with
  generated `DashaSlice` / `ScoringChartData` / `TransitOverlay` / `DomainScoringWeights`
  inputs, including generators that randomly omit columns and special points.
- Property 29 is verified by the DA-3 integration test + prompt Consistency Contract wording,
  not by a property-based test.
- DA-2 (Symptom Validator) is intentionally UNAFFECTED by the compute-first contract: although it
  now receives period entries carrying engine verdicts, it only validates whether the reported
  symptoms match the chart's indications and does not judge period favorability, so there is
  nothing for it to override. Task 7.3 adds a clarifying comment to its prompt — no behavioral
  change.
- The engine property tests (task 4 sub-tasks) MUST be re-run after task 10.4 recalibrates the
  provisional `BHAVA_RUPAS_CALIBRATION` and `SAV_MEAN` constants, since those tests assert against
  the constants; the final checkpoint (task 12) confirms this re-run.
- The scoring engine is pure — no LLM, network, DB, or file I/O. It never throws on bad data;
  it omits the affected factor and records the omission. Config errors (missing weights) are
  loud and early via `ScoringConfigError` from `resolveDomainWeights`.
- No database migration: scores persist inside the existing `periodSlice` `Json?` column and
  peaks inside `da1Output`. The dedicated `peaks Json?` column is optional and out of scope.
- Phase 1 weights are provisional/uncalibrated (`WEIGHTS_VERSION = 0.1.0-provisional`); scores
  must not be presented to end clients as calibrated until the Phase 2 Calibration_Gate.
- UI / report rendering of scores, breakdowns, peaks, and the reduced-confidence flag is
  deferred to Phase 1.1 and is intentionally absent from this plan.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4", "2.1", "2.3"] },
    { "id": 2, "tasks": ["2.2", "2.4", "2.5", "4.1a"] },
    { "id": 3, "tasks": ["4.1b"] },
    { "id": 4, "tasks": ["4.1c", "4.14", "4.15", "4.16", "4.17", "4.18"] },
    { "id": 5, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "4.11", "4.12", "4.13", "4.19", "4.20"] },
    { "id": 6, "tasks": ["4.21", "4.22", "4.23", "4.24", "6.1", "7.1", "7.3"] },
    { "id": 7, "tasks": ["6.2", "8.1", "10.4"] },
    { "id": 8, "tasks": ["6.3", "7.2", "6.4"] },
    { "id": 9, "tasks": ["10.1", "10.2", "10.3", "11.1"] },
    { "id": 10, "tasks": ["11.2"] }
  ]
}
```
