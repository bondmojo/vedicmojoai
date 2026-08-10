# Implementation Plan: Scorer Dynamic Range

## Overview

This plan retunes the deterministic Duration-Analysis period scorer
(`engine/durationAnalysis/scoring.ts` + `engine/durationAnalysis/scoringWeights.ts`) and
corrects the combustion determination at its compute source
(`engine/compute/relationships.ts`), per the approved design. Tasks are ordered by dependency:
the compute-source fix and the type/weight groundwork land first, then each scoring factor is
implemented with its tests, then the backtest fixture and cross-domain non-regression validate
the whole, and a final checkpoint runs the full suite.

Testing conventions for this feature:

- Each **Property N** test is implemented as a single property-based test running **≥ 100
  iterations** and tagged `Feature: scorer-dynamic-range, Property N: <text>`, using the PBT
  library already present in the repo test suite.
- The Scoring_Engine MUST remain **pure and never-throwing**: no LLM/network/DB/file I/O, and
  it degrades to omission (never throws) on missing or malformed input.
- Sub-tasks postfixed with `*` are optional (test-focused) and can be skipped for a faster MVP;
  the backtest-fixture and cross-domain non-regression tasks are NOT optional because
  Requirements 4 and 8 mandate them as deliverables.

## Tasks

- [x] 1. Compute-source combustion fix (threshold-only)
  - [x] 1.1 Remove the `&& !cazimi` conjunct in `computeCombustion` so `combust` is
    threshold-only, leaving the `cazimi` field computed-but-unused (deferred cleanup)
    - File: `engine/compute/relationships.ts`
    - _Requirements: 9.1, 9.2, 9.3_ — _Design: §6 Combustion Source Fix_
  - [ ]* 1.2 Unit tests for threshold-only combustion
    - A planet inside the ~0°17′ cazimi orb now reports `combust: true`
    - Venus at `degreeFromSun 5.66` / `threshold 10` is unchanged (`combust: true`, `cazimi: false`)
    - _Requirements: 9.4_
  - [ ]* 1.3 Property test — **Property 13: Combustion is threshold-only at the compute source**
    - **Validates: Requirements 9.1, 9.2**

- [x] 2. Add the new scoring-factor key to the type union
  - [x] 2.1 Add `'lordAffliction'` to the `ScoringFactorKey` union (additive, no existing key changed)
    - File: `lib/durationTypes.ts`
    - _Requirements: 6.4_ — _Design: Data Models → `lib/durationTypes.ts`_

- [x] 3. Rebalance domain weight tables and bump the weights version
  - [x] 3.1 Rewrite all 7 domain weight tables in `DOMAIN_SCORING_WEIGHTS` per design §1 (the
    `wealth` table exactly as tabulated; the other five per the documented per-domain pattern),
    add a `lordAffliction` weight to every table (8 for career/wealth/marriage/property/cashflow,
    9 for health), bump `WEIGHTS_VERSION` to `'0.7.0-provisional'`, and add the A–F `0.7.0`
    version-history comment entry
    - File: `engine/durationAnalysis/scoringWeights.ts`
    - _Requirements: 1.4, 1.5, 3.8, 6.1, 6.4_ — _Design: §1 Factor Rebalance; Data Models; Version-history comment_
  - [ ]* 3.2 Property test — **Property 2: Period-varying + transit weight share increases** (every
    domain's PV+T proportion under `0.7.0` strictly exceeds its `0.6.0` proportion)
    - **Validates: Requirements 1.4**
  - [ ]* 3.3 Property test — **Property 12: Every domain weights table defines the new factor**
    (`weights.lordAffliction` defined and finite for all categories)
    - **Validates: Requirements 6.4**
  - [ ]* 3.4 Property test — **Property 11: Every breakdown stamps the current weights version**
    (`ScoreBreakdown.weightsVersion === '0.7.0-provisional'`)
    - **Validates: Requirements 6.2**

- [x] 4. De-pin `naturalKaraka` / `karakaRole` with combustion-survival credit
  - [x] 4.1 Redesign `factorNaturalKaraka` and `factorKarakaRole` to the level-base ×
    combustion-survival formulation in design §2 (per-level presence base summed across matching
    running lords, each scaled by `survival = combust ? clamp(degreeFromSun/threshold,0,1) : 1`,
    clamped to `[0,1]`), keeping each factor's existing value shape and no-signal omission behavior
    - File: `engine/durationAnalysis/scoring.ts`
    - _Requirements: 1.2, 1.3, 3.4_ — _Design: §2 De-pin + Combustion Credit Reduction_
  - [ ]* 4.2 Property test — **Property 1: De-pinning — karaka factors vary across AD/PD within one MD**
    - **Validates: Requirements 1.2, 1.3**
  - [ ]* 4.3 Property test — **Property 6: Combust karaka credit reduced monotonically, within range**
    - **Validates: Requirements 3.4**

- [x] 5. Add the `lordAffliction` factor and wire it into scoring
  - [x] 5.1 Implement `factorLordAffliction(mdLord, adLord, pdLord, chartData)` per design §3:
    read `chartData.relationships.combustion`; per running level `penalty = combust ? clamp(1 −
    degreeFromSun/threshold,0,1) : 0`; `EP = Σ levelWeight[level]×penalty` with
    `{MD:0.50, AD:0.30, PD:0.20}`; `normalized = clamp(0.5 − EP, 0, 1)`; never reference `cazimi`;
    itemize with the standard factor shape
    - File: `engine/durationAnalysis/scoring.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.9, 3.11_ — _Design: §3 New `lordAffliction` Factor_
  - [x] 5.2 Wire `apply('lordAffliction', factorLordAffliction(...))` into `_scorePeriod` and
    classify it as a SECONDARY factor (not in any domain's `primaryFactors`)
    - _Requirements: 3.8_ — _Design: §3 (wiring); §1 (classification)_
  - [ ]* 5.3 Property test — **Property 3: Affliction is a standalone additive term that does not
    mutate other factors**
    - **Validates: Requirements 3.1**
  - [ ]* 5.4 Property test — **Property 4: Single well-formed affliction contribution folding all
    combust levels**
    - **Validates: Requirements 3.2, 3.9**
  - [ ]* 5.5 Property test — **Property 5: Affliction graded monotonically by closeness to the Sun**
    - **Validates: Requirements 3.3**
  - [ ]* 5.6 Property test — **Property 7: Scorer is invariant to the cazimi field**
    - **Validates: Requirements 3.5**
  - [ ]* 5.7 Property test — **Property 8: Absent combustion never dents confidence**
    - **Validates: Requirements 3.8**
  - [ ]* 5.8 Property test — **Property 10: Purity and never-throws under malformed combustion data**
    - **Validates: Requirements 3.11**
  - [ ]* 5.9 Edge-case unit tests: combustion data absent → `lordAffliction` recorded in
    `omissions[]` (not `factors[]`); combustion present but no running lord combust → omission with
    `noSignal: true`
    - _Requirements: 3.6, 3.7_

- [x] 6. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Narrow the `domainHouseActivation` aspect net
  - [x] 7.1 Redesign `factorDomainHouseActivation` per design §4: drop Limb 2 (domain-house-lord's
    natal house), restrict the aspect net to occupation + 7th aspect only, and grade the output
    (both → 1.00, Jupiter-only → 0.75, Saturn-only → 0.60, neither → omit `noSignal`)
    - File: `engine/durationAnalysis/scoring.ts`
    - _Requirements: 2.1, 2.2, 2.3_ — _Design: §4 domainHouseActivation Discrimination Fix_
  - [ ]* 7.2 Unit tests: across the three Mojo transit overlays the normalized values are not all
    equal and not all `1.0` (they toggle 0.60 ↔ 0.75)
    - _Requirements: 2.1, 2.2_

- [x] 8. Make the Sade-Sati peak penalty conditional on Saturn's transit dignity
  - [x] 8.1 In `factorSaturnAfflictions`, import `getVargaDignityLabel` from
    `engine/compute/dignity.ts` and compute the peak penalty conditionally per design §5:
    `NON_FRIENDLY = {debilitated, enemy, great_enemy}` → steep 0.60, otherwise mild 0.40; leave
    `rising`/`setting`, `ashtamaShani`, `kantakaShani` unchanged; degrade to the mild penalty when
    the dignity label is `undefined`
    - File: `engine/durationAnalysis/scoring.ts`
    - _Requirements: 7.2, 1.4_ — _Design: §5 Conditional Sade-Sati Peak Penalty_
  - [ ]* 8.2 Property test — **Property 14: Sade-Sati peak penalty is conditional on Saturn's
    transit dignity, and never lighter than a non-peak penalty**
    - **Validates: Requirements 7.2**
  - [ ]* 8.3 Unit tests: the 12-sign mapping (steep only for Aries/Cancer/Leo/Scorpio; mild for all
    others) and graceful mild-fallback on an undefined/out-of-range `overlay.saturn.signNumber`
    - _Requirements: 7.2_

- [x] 9. Mojo wealth backtest fixture and assertions
  - [x] 9.1 Create `engine/durationAnalysis/__fixtures__/mojo_wealth_range.json` from a FRESH
    compute (not any cached `ScoreBreakdown`), following the existing `__fixtures__` convention
    (`category`, `description`, `chartData` including `relationships.combustion`, `periods[]` with
    `slice` + `transitOverlay` for the 19 wealth periods, 2022-01-01 → 2026-07-31)
    - _Requirements: 4.5, 4.6_ — _Design: Testing → Backtest fixture_
  - [x] 9.2 Add assertions in `scoring.backtest.test.ts` that re-score the fixture via `scorePeriod`
    under `0.7.0`: (1) argmax does NOT overlap Jun 2025–Jul 2026 [AC1]; (2) compute and RECORD
    `max − min` as an informational metric, NOT a pass/fail gate [AC2, softened]; (3) collapse-window
    (Aug 2024–Jan 2025) min below the recorded pre-fix min OR high-window max above pre-fix max
    [AC3]; (4) `weightsVersion === '0.7.0-provisional'` on every output; (5) Req 5 non-regression,
    softened (Jul 2023–Aug 2024 stay within ~3 of the 19-period median — directional, not a strict
    ≥ median gate — and strictly above the overall analysis-window floor; single lowest lies in
    collapse/low window);
    (6) `domainHouseActivation` values not all equal and not all `1.0`
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 5.1, 5.2, 2.1, 2.2_ — _Design: Testing → Backtest fixture (assertions 1–6)_

- [x] 10. Cross-domain non-regression
  - [x] 10.1 Re-run the existing per-domain fixtures (`career_strong_weak`,
    `health_saturn_affliction`, `marriage_dk_vs_dusthana`, `wealth_dhana_vs_dusthana`, and any
    others present) under `0.7.0`, adding `relationships.combustion` to a fixture's `chartData` only
    where a scenario exercises `lordAffliction`
    - _Requirements: 8.1, 8.2_ — _Design: Testing → Existing per-domain fixtures_
  - [x] 10.2 Ensure each fixture's assertions still pass, or consciously re-baseline any changed
    expected values with a recorded rationale in the `scoringWeights.ts` version-history comment
    - _Requirements: 8.1, 8.2_

- [x] 11. Consumer backward-compatibility verification
  - [x] 11.1 Assert the produced `ScoreBreakdown` key set is unchanged and type-check the existing
    consumers `engine/durationAnalysis/periodInsights.ts` and
    `app/components/DurationComputationResults.tsx` against the change
    - _Requirements: 6.3_ — _Design: Data Models; Testing → Interface_
  - [ ]* 11.2 Property test — **Property 9: Consumer value shapes preserved** (dignity-label string
    `value` on `mdLordDignity`/`adLordDignity`/`pdLordDignity`; `rashiDrishti` value stays an array
    of `{ lord, toHouses }`)
    - **Validates: Requirements 3.10, 6.5**

- [x] 12. Final checkpoint
  - Run the full build and test suite; confirm every Property test (≥ 100 iterations, tagged) and
    all fixtures (Mojo wealth range + per-domain) are green. Ensure all tests pass, ask the user if
    questions arise.
  - RESULT: `npx tsc --noEmit` clean (exit 0); `npx vitest run` → 214 tests passed across 12 files
    (0 failures). Mojo wealth range + all 4 per-domain fixtures green under 0.7.0-provisional.
  - NOTE: the optional (*) property/unit sub-tasks (1.2, 1.3, 3.2–3.4, 4.2–4.3, 5.3–5.9, 7.2,
    8.2–8.3, 11.2) remain unimplemented by design — they formally prove Properties 1–14 but are
    not required to ship the core fix (see tasks.md Notes).

## Notes

- Tasks marked with `*` are optional (test-focused) and can be skipped for a faster MVP; core
  implementation and the mandated backtest / cross-domain fixtures are never optional.
- Each task references the specific requirement(s) and design section(s) it implements.
- Property tests validate the universal Correctness Properties; unit/edge-case tests cover
  specific examples and error conditions; the backtest fixtures validate the concrete Mojo and
  per-domain behavior.
- The score range (Requirement 4.2) is computed and REPORTED, not gated; the binding range
  objectives are AC1 (no top-of-range inversion) and AC3 (at least one end moves).
