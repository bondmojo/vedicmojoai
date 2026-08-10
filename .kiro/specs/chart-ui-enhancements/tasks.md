# Implementation Plan: Chart UI Enhancements

## Overview

Six practitioner-facing changes to the Generate Chart page, plus two genuine engine behaviour
changes the design isolates and bounds: the **moolatrikona degree-range rule** (an existing
classifier's output changes) and the **`asOf` / `isCurrent` fix** in the sign-based Sade Sati scan.

The plan follows the design's dependency order:

`fast-check` → engine dignity (ranges + reason) → dignity call sites + existing-test repairs →
engine transits (types mirrored into **both** declarations, generalised helpers, `asOf` fix, degree
scanner, `computeTransits` parameter, `index.ts` wiring) → pure `lib/` modules → shared UI
infrastructure → per-requirement UI components → tab strip → documentation.

The dignity call-site updates and the two existing-test repairs sit **immediately** after the
dignity change so the suite is never left red across unrelated tasks.

Language: TypeScript / React (Next.js 14, Vitest) — the design uses concrete TypeScript throughout,
so no language selection was required.

Property tests use `fast-check@3.23.2` (added in Task 1) and target the **thirteen** Correctness
Properties in `design.md`. Run single-shot only: `npx vitest --run` — never watch mode.

The design's stated defaults for all three Open Decisions are implemented as written
(Saptavargeeya Bala stays sign-only, the Yogas tab sits after Ashtakavarga, Sade Sati numbering is
horizon-relative). None of the three is a task.

## Tasks

- [x] 1. Add property-based testing infrastructure
  - [x] 1.1 Add `fast-check` as a pinned devDependency
    - Add `fast-check@3.23.2` to `devDependencies` in `package.json` — exact pinned version, no
      caret or range — and install it. It is the only new dependency this feature needs
    - _Design: Testing Strategy — "Runner and libraries actually in the repo"_
    - _Enables every property task below_

- [x] 2. Change moolatrikona to a degree-range test (`engine/compute/dignity.ts`)
  - **This alters an existing classifier's output.** Work the sub-tasks in order and do not widen
    the scope: `shadbala.ts:68` and `varshaphal.ts:69` keep their own independent sign-only
    `MOOLATRIKONA_SIGNS` copies and are **deliberately unchanged** (see Task 4's parent note).
  - [x] 2.1 Add `MOOLATRIKONA_RANGES` and the optional degree parameter on `getVargaDignityLabel`
    - Add the `MOOLATRIKONA_RANGES` table exactly as the design gives it (Sun `[0,20)` Leo, Moon
      `[4,30)` Taurus, Mars `[0,12)` Aries, Mercury `[16,20)` Virgo, Jupiter `[0,10)` Sagittarius,
      Venus `[0,15)` Libra, Saturn `[0,20)` Aquarius); **keep** `MOOLATRIKONA_SIGNS` — it remains
      the sign gate and the range only refines it
    - Add `degreeInSign?: number` as an **optional trailing** parameter so all 8 existing call sites
      stay valid; bounds are half-open `[from, to)`
    - "Usable" is `Number.isFinite(degreeInSign) && degreeInSign >= 0 && degreeInSign < 30`; a
      non-finite or out-of-range degree is treated as **"not supplied"**, i.e. the whole-sign rule
      applies — it must never degrade to `undefined`
    - Change **only** the moolatrikona branch: sign matches → usable degree inside range →
      `moolatrikona`; usable degree outside range → fall through to the own test; degree absent or
      unusable → `moolatrikona` (today's behaviour). Precedence
      (exaltation → debilitation → moolatrikona → own → maitri) is untouched
    - Keep the module dependency-free and keep its existing no-throw behaviour
    - _Design: Data Models — "Engine — moolatrikona degree ranges"; Error Handling (final paragraph)_
    - _Requirements: 2.12, 2.13, 2.14, 2.15_
  - [x] 2.2 Commit a frozen transcription of the pre-change whole-sign classifier
    - New test-support module (e.g. `engine/compute/__fixtures__/frozenWholeSignDignity.ts`) holding
      a verbatim transcription of `getVargaDignityLabel`'s pre-change body — the whole-sign
      moolatrikona test and its own local copies of the tables it reads
    - Consumed by Property 4 (task 2.4) and by the 9×12 regression test (task 2.5), so both
      migrations are checked against the **old** behaviour rather than against themselves
    - _Design: Testing Strategy — "Properties 4 and 11 both assert against frozen reference
      implementations"_
    - _Requirements: 2.13_
  - [x] 2.3 Write property test for the moolatrikona degree range
    - **Property 3: The moolatrikona degree range decides moolatrikona versus own**
    - **Validates: Requirements 2.12**
    - File: `engine/compute/dignity.moolatrikona.test.ts`, `numRuns: 100`. Quantify over the five
      reachable planets (Sun, Mars, Jupiter, Venus, Saturn) and degrees `[0, 30)`, biasing the
      generator with the exact `MOOLATRIKONA_RANGES` bounds so the half-open edges are hit. Assert
      the result is never a maitri label. Tag with
      `// Feature: chart-ui-enhancements, Property 3: The moolatrikona degree range decides moolatrikona versus own`
  - [x] 2.4 Write property test for degree-omitted parity with the frozen classifier
    - **Property 4: Omitting the degree reproduces today's sign-only label exactly**
    - **Validates: Requirements 2.13**
    - Same file as 2.3, `numRuns: 100`, asserting against the frozen module from 2.2 for both the
      three-argument call and a fourth argument that is non-finite, below 0, or at/above 30
  - [x] 2.5 Write the 9×12 table-driven regression test
    - Assert `getVargaDignityLabel(planet, sign, map)` — three arguments, no degree — matches the
      frozen classifier for all 9 planets × 12 signs, plus the two R2.14 rows: Moon in Taurus and
      Mercury in Virgo return `exalted` at **every** degree, including degrees inside their nominal
      moolatrikona ranges (their moolatrikona sign coincides with their exaltation sign, and
      exaltation is tested first)
    - _Design: Testing Strategy — "Regression guard on the dignity change"_
    - _Requirements: 2.13, 2.14_
    - Same file as 2.3

- [x] 3. Implement the dignity reason derivation (`engine/compute/dignity.ts`)
  - [x] 3.1 Add `getVargaDignityReason()`
    - Add `DignityRule` (seven members, including the two new `moolatrikona` and
      `moolatrikona_sign_only` rules), the `DignityReason` interface, a local
      `SIGN_NAMES` array (Aries…Pisces), and
      `getVargaDignityReason(planet, vargaSignNumber, d1SignByPlanet, degreeInSign?)`
    - The **same** optional trailing `degreeInSign` parameter with the **same** semantics as
      `getVargaDignityLabel`, so the reason cannot disagree with the label it explains
    - Select exactly one rule with the same precedence as the label; emit the design's
      reason-string templates verbatim, including the two moolatrikona templates (the in-range one
      names both bounds of the range as well as the sign; the sign-only one states that the sign
      alone was used because no degree was available)
    - Guard a non-integer / out-of-range `vargaSignNumber` and planets absent from
      `PERMANENT_FRIENDSHIP` by returning `undefined`. An `own` label reached by falling **out of**
      the range gets the plain `own` sentence. Keep the module dependency-free
    - _Design: Data Models — "Engine — dignity reason (`engine/compute/dignity.ts`)"_
    - _Requirements: 2.2, 2.3, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 2.13_
  - [x] 3.2 Write property test for reason/label agreement
    - **Property 1: Dignity reason agrees with the dignity label**
    - **Validates: Requirements 2.2, 2.3, 2.5, 2.6, 2.8, 2.9, 2.11**
    - File: `engine/compute/dignity.reason.test.ts`, `numRuns: 100`. Quantify over the four D1-map
      shapes (complete, empty, missing planet, missing sign lord) and the three degree cases
      (omitted, in `[0,30]`, non-finite/out-of-range); assert the ≤160-character cap and the absence
      of markup characters
  - [x] 3.3 Write property test for unusable varga signs and non-dignity planets
    - **Property 2: An unusable varga sign yields no reason**
    - **Validates: Requirements 2.7, 2.10**
    - Same file as 3.2, `numRuns: 100`

- [x] 4. Update the dignity call sites that carry a degree — and only those
  - **Pass a degree at exactly the call sites below.** The design inspected all 8 and deliberately
    leaves three without one: `scoring.ts:424` (Saturn **transit** dignity — `TransitOverlay.saturn`
    carries no longitude, and `NON_FRIENDLY_SATURN_DIGNITY` treats `moolatrikona` and `own`
    identically anyway), `scoring.ts:873` (divisional house-lord dignity) and `scoring.ts:888`
    (varga-lagna-lord dignity) — both varga placements with no varga longitude. **Do not "helpfully"
    add a degree at those three.**
  - **`shadbala.ts:68` and `varshaphal.ts:69` stay sign-only.** Each holds its own independent
    `MOOLATRIKONA_SIGNS` feeding a *score*, not a label: `dignityScoreForVarga` sums a dignity
    ladder over **seven** vargas and only D1 carries a degree, so a degree-aware rung would behave
    differently from the other six, and it feeds Sthana Bala — hence every planet's total, grade and
    the strength ranking — with no calibration fixture to validate the shift against. Kshetra Bala
    is conventionally sign-based Tajika. Leave both files untouched.
  - [x] 4.1 Pass the D1 degree in `divisional.ts` (two call sites)
    - At `divisional.ts:393` (`computeDivisionalCharts`) and `divisional.ts:448`
      (`computeSingleDivisionalChart`), pass `planet.longitude % 30` as the fourth argument **only
      when `varga.division === 1`**. D2–D60 keep the whole-sign rule, because this engine computes a
      varga *sign* and never a varga longitude
    - Both entry points must be edited together or the two diverge
    - _Design: Data Models — "Blast radius — every `getVargaDignityLabel` caller" (rows 1–2)_
    - _Requirements: 2.12, 2.15_
  - [x] 4.2 Pass the D1 degree at `yogas.ts`'s four call sites
    - `yogas.ts:148` (Pancha Mahapurusha gate), `:196` (Gaja Kesari / Jupiter), `:421` and `:424`
      (Raja / Dharma-Karmadhipati kendra + trikona lords), `:523` (Parivartana lords) — pass
      `p.degreeInSign` from the D1 `PlanetPosition` already in scope
    - **No yoga's firing changes**: the Mahapurusha gate accepts `exalted | own | moolatrikona` and
      `STRONG_DIGNITY` contains both `moolatrikona` and `own`. Only `evidence.dignity[planet]` text
      changes. The `yogas.ts:838` re-export is the same function object, so the optional parameter
      flows through with no edit
    - _Design: Data Models — "Blast radius" (rows 3–6)_
    - _Requirements: 2.12, 2.15_
  - [x] 4.3 Widen `findPlanet` and pass the degree at `scoring.ts:168`
    - Widen the local `findPlanet` (`engine/durationAnalysis/scoring.ts:104`) to also return
      `degreeInSign` (it is already on `ScoringChartData.planets`; only the local narrowing hides
      it), and pass it at the `factorLordDignity` call site on line 168
    - Leave `scoring.ts:424`, `:873` and `:888` calling with three arguments, per the parent note
    - Expect duration-analysis scores to move: `dignityToNormalized` scores `moolatrikona` 0.9 vs
      `own` 0.8, so an out-of-range MD/AD/PD lord's dignity factor drops 0.1 normalised. Task 5.2
      re-baselines the fixtures
    - _Design: Data Models — "Blast radius" (rows 7–9)_
    - _Requirements: 2.12, 2.15_

- [x] 5. Repair the two existing tests the dignity change breaks
  - These are repairs of existing suites, not new coverage, so they are **not** optional — skipping
    them leaves the suite red.
  - [x] 5.1 Update the Hamsa case in `engine/compute/yogas.detectors.test.ts`
    - `mkPlanet` defaults `degreeInSign = 15`, and the Hamsa test asserts
      `hamsa?.evidence.dignity?.Jupiter === 'moolatrikona'` for Jupiter at Sagittarius 15°. Jupiter's
      range is `[0, 10)`, so once task 4.2 passes the degree that becomes `'own'`
    - **Keep** the existing 15° case, changing its assertion to `'own'` — it still proves what the
      test exists for, that the gate accepts a non-exalted own-sign placement — and **add** a second
      case at Sagittarius 5° asserting `'moolatrikona'`
    - **Do not change `mkPlanet`'s `degreeInSign = 15` default**: that would silently shift every
      other detector test's geometry
    - _Design: Data Models — "Verified test breakage"_
    - _Requirements: 2.12, 2.15_
  - [x] 5.2 Re-baseline `engine/durationAnalysis/scoring.backtest.test.ts` where its fixtures move
    - Run the backtest suite after task 4.3. For every fixture whose MD/AD/PD lord sits in its
      moolatrikona sign **outside** the range, the dignity factor drops from 0.9 to 0.8 normalised
      and the period score genuinely changes — update the expected values to the new output
    - Treat changed output here as **expected**, not as a regression; but confirm per fixture that
      the only moved input is a dignity label going `moolatrikona` → `own`, and leave fixtures whose
      lords are all in range untouched. `WEIGHTS_VERSION` stays `0.2.0-provisional`
    - _Design: Data Models — "Blast radius" (row 7, `scoring.ts:168`)_
    - _Requirements: 2.12, 2.15_

- [x] 6. Checkpoint - dignity change is complete and the suite is green
  - Run `npx vitest --run engine/`. Ensure all tests pass, ask the user if questions arise.

- [x] 7. Add degree-based Sade Sati to the engine (`engine/compute/transits.ts`, `types.ts`, `index.ts`)
  - [x] 7.1 Declare the new transit types in **both** declaration sites
    - The transit types are declared **twice**: `engine/compute/transits.ts:11–86` (what the
      functions are typed against) and, structurally identical, `engine/compute/types.ts:193–250`.
      `engine/compute/index.ts:44–46` re-exports the **`types.ts`** copies and
      `ComputedChart.transits` is typed with the `types.ts` `TransitAnalysis`
    - Add `DegreeSadeSatiPeriod` and `DegreeSadeSatiInfo` (exactly the members the design lists) to
      **both** files, and add the optional sibling `sadeSatiByDegree?: DegreeSadeSatiInfo` to
      **both** `TransitAnalysis` declarations. Adding it to only one means `computeTransits` returns
      a field `ComputedChart` does not admit and the engine will not type-check
    - Leave `sadeSati`'s field name, nesting and six-member set untouched; the new field is a
      sibling, never nested inside it. Introduce **no** `SadeSatiPhaseName` type — the
      `'rising' | 'peak' | 'setting'` union stays inline on the sign-based types, and the degree
      reading has no phase at all
    - Preserve the existing duplication rather than collapsing it: `types.ts` is imported by pure
      modules and by `lib/`, and pointing it at `transits.ts` would pull in `swisseph-v2`
    - Re-export from `index.ts` alongside the existing three transit type re-exports
    - _Design: "Three corrections to earlier design claims" (1); Data Models — "Engine — degree-based
      Sade Sati", "Sibling field"_
    - _Requirements: 6.2, 8.3, 8.6_
  - [x] 7.2 Generalise the bisection and merge helpers
    - Rename `nextSignChange` → `nextStateChange(startJd, coarseStepDays, stateAt)` with the callback
      renamed `stateAt`; **body identical**, including the existing `for (let i = 0; i < 42; i++)`
      bisection. It is module-private, so update only its three in-file call sites
      (`computeSadeSatiPeriods`, `computeMoonTransits`, `computeAscendantTransits`), all of which
      keep passing their sign functions unchanged
    - **No tolerance parameter and no iteration cap** — the existing fixed 42 iterations are reused
      verbatim; a tolerance would make the new scanner coarser than the function beside it
    - Leave `prevSignChange` **exactly as it is**, name and body: the degree scanner forward-scans
      and never needs a backward search
    - Extract the inline merge loop in `computeSadeSatiPeriods` into
      `mergeSegments<K>(raw, gapDays)` and rewire that loop to call it with `gapDays = 240`, key =
      sign — behaviour-preserving
    - _Design: Data Models — "Engine — generalised helpers"; correction (2)_
    - _Requirements: 6.5, 6.8, 6.12_
  - [x] 7.3 Fix the `asOfDate` / `isCurrent` defect in `computeSadeSatiPeriods`
    - Add `asOfDate: Date` as a **required third parameter** (no default, so a caller cannot forget
      it); delete the function's `const now = new Date()`; set `nowMs = asOfDate.getTime()` and
      derive every period's `isCurrent` from it. `computeTransits` already holds `asOfDate` and
      passes it
    - **Scope is `isCurrent` only. The horizon endpoints deliberately STAY wall-clock-derived**
      (`1 Jan (birthYear − 33)` → `1 Jan (wall-clock year + 35)`), matching R6.9's literal "the 35th
      year after the present year". Moving the horizon to `asOfDate` would change the *number of
      periods returned* on the duration-analysis path — a far larger change than the bug being
      fixed. Do not move them
    - No observable output changes today: `index.ts` passes `new Date()`, and
      `engine/durationAnalysis/transitOverlay.ts` — the one non-present caller, invoking
      `computeTransits(moonSign, lagnaSign, birthYear, adDate)` per AD boundary — derives Sade Sati
      from the stored JSONB via `getSadeSatiPhaseFromStored` and **never reads `isCurrent`**, using
      only `transits[]`, `ashtamaShani` and `kantakaShani`. So `TransitOverlay` output, and every
      duration-analysis score, is unchanged
    - _Design: Data Models — "Engine — the `asOfDate` / `isCurrent` defect (R6.10)"_
    - _Requirements: 6.10, 6.11_
  - [x] 7.4 Implement `computeDegreeSadeSati()`
    - Signature exactly `computeDegreeSadeSati(natalMoonLongitude: number, birthYear: number, asOfDate: Date): DegreeSadeSatiInfo`
      — there is **no** `birthJulianDay` and **no** `horizonYears`; the horizon is derived from
      `birthYear` the same way `computeSadeSatiPeriods` derives it, so the two readings cannot drift
    - Separation: `sepAt(jd) = shorterArc(getSiderealLongitude(jd, 6), natalMoonLongitude)`, 0…180
    - Membership is a **boolean**: `insideAt(jd) = sepAt(jd) <= 45`. No sign test, no arc
      subdivision, no phase classifier, no `offsetAt`. Segments are cut wherever the boolean flips;
      pass it to `nextStateChange` as `(jd) => (insideAt(jd) ? 1 : 0)` so the existing integer-state
      signature and its 42-iteration bisection are reused unchanged
    - Horizon: `[toJD(1 Jan (birthYear − 33)), toJD(1 Jan (wall-clock year + 35))]` — the same
      window `computeSadeSatiPeriods` scans. Coarse step **10 days**, the step the existing Saturn
      sign scan uses
    - Merge with `mergeSegments(..., DEGREE_SADE_SATI_MERGE_GAP_DAYS)` and a single constant key, so a
      retrograde dip out of and back into the window collapses into one period while genuine passages
      (~29.5 years apart) never merge. That constant is **138 days**, this scan's own — deliberately
      smaller than the sign scan's 240 d, which over-merges the angular window; see design.md's
      "Why not the sign scan's 240 days"
    - After merging, number periods 1…N in ascending start order across the whole horizon; populate
      `start`/`end` (ISO UTC), `startApprox`/`endApprox` via the existing `fmtMonthYear`,
      `durationDays`, `isCurrent = asOf ∈ [start, end)`, `completionPct` (integer, half away from
      zero) **only** on the flagged period, `startsInDays` **only** where `start > asOf`, and the
      R6.15 `label` built as
      `` `Saturn ±45° from natal Moon (${lon.toFixed(2)}°) - 12th, 1st, 2nd houses` `` — the fixed
      classical trio, per-chart only in the longitude
    - Report `natalMoonLongitude`, `orbDeg: 45`, `active`, `separationDeg` (both read at `asOfDate`),
      `scanFromYear`, `scanToYear`, `allPeriods`
    - **Never throw**: a non-finite `natalMoonLongitude` returns
      `{ active: false, separationDeg: 0, allPeriods: [], … }`
    - Expose a **test-only** scan-window override on the internal scanner (not on the public
      `computeDegreeSadeSati` signature) so the property tests can run a shortened ~35-year horizon
      while production callers cannot set a non-conforming window
    - _Design: "The degree-based scanning algorithm"; Data Models — "Engine — new export and wiring";
      Error Handling (engine paragraph); correction (3)_
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 6.9, 6.11, 6.12, 6.13, 6.14, 6.15_
  - [x] 7.5 Add the single trailing parameter to `computeTransits()`
    - Append **one** optional parameter — `natalMoonLongitude?: number` — after `longitude`.
      There is no `birthJulianDay` parameter. Populate `sadeSatiByDegree` only when it is present and
      finite; omit the field entirely otherwise, leaving `sadeSati` untouched
    - Appending keeps `transitOverlay.ts`'s existing 4-argument call valid, and that call site
      deliberately does **not** pass it: enabling a second full-horizon Saturn scan per AD boundary
      would multiply ephemeris cost for a field the overlay never reads
    - _Design: Data Models — "Engine — new export and wiring"_
    - _Requirements: 6.1, 6.2, 8.3_
  - [x] 7.6 Wire `computeFullChart` (`engine/compute/index.ts`)
    - At step 13, pass `moon?.longitude` as the trailing seventh argument to `computeTransits`,
      after the existing `input.latitude` / `input.longitude`
    - _Design: Data Models — "Engine — new export and wiring" (code block)_
    - _Requirements: 6.1_

- [x] 8. Test the degree-based reading and the `asOf` fix
  - [x] 8.1 Write property test for the 45° orb bound
    - **Property 5: Every reported degree-based period's endpoints lie on the 45° orb**
    - **Validates: Requirements 6.1, 6.3, 6.4**
    - File: `engine/compute/transits.degreeSadeSati.test.ts`, `numRuns: 100`, using the shortened
      ~35-year test horizon; assert at start and at end only. Interior instants are deliberately NOT
      asserted — R6.5's merge means a reported period provably contains instants outside the orb, so
      the interior clause would contradict R6.5. Property 9's crossing check carries the rest of the
      weight
  - [x] 8.2 Write property test for the current flag across both readings
    - **Property 6: At most one period is current, in either reading, and only at `asOf`**
    - **Validates: Requirements 6.2, 6.10, 6.11**
    - Same file as 8.1, `numRuns: 100`. Generate evaluation instants spanning several decades either
      side of the present, so the case the wall-clock defect broke is actually exercised
    - The `sadeSati.active` clause is asserted in ONE direction only — `active ⟹ some sign-based period
      flagged current`. The converse is false by construction: a merged period stays flagged across the
      excursion the merge bridged, while `active` reads Saturn's instantaneous sign. `active` is left
      as the instantaneous reading rather than re-derived, because `TransitsView` consumes it and
      `transitOverlay.ts` already derives its own period-based flag independently
  - [x] 8.3 Write property test for ordering, non-overlap and merging
    - **Property 7: Periods are ascending, non-overlapping and correctly merged**
    - **Validates: Requirements 6.5, 6.12**
    - Same file as 8.1, `numRuns: 100`
  - [x] 8.4 Write property test for sequence numbering
    - **Property 8: Sequence numbers are contiguous from 1 in start order**
    - **Validates: Requirements 6.6**
    - Same file as 8.1, `numRuns: 100`
  - [x] 8.5 Write property test for boundary genuineness
    - **Property 9: Every reported boundary is a genuine 45°-separation crossing**
    - **Validates: Requirements 6.8**
    - Same file as 8.1, `numRuns: 100`; assert insideness differs across a small interval either
      side of every reported start and end
  - [x] 8.6 Write property test for the derived spans
    - **Property 10: The derived spans agree with the instants they came from**
    - **Validates: Requirements 6.13, 6.14**
    - Same file as 8.1, `numRuns: 100`; assert `completionPct` is an integer 0–100 matching the
      half-away-from-zero rule, `startsInDays` is present exactly on future-start periods, and
      `durationDays` equals end − start in days
  - [x] 8.7 Write the PVR calibration fixture test (R6.7)
    - One **full-horizon** `computeDegreeSadeSati` run for the Reference_Chart (natal Moon sidereal
      longitude **347.76°**), asserting the reported periods include one per R6.7 reference row —
      **1993-03-31 → 2000-06-30** (2648 d), **2023-02-10 → 2030-05-09** (2645 d) and
      **2052-03-20 → 2059-06-19** (2648 d) — each within **±3 days** on start, on end and on
      `durationDays`. Three independent passages, not two: the 1993 row is what pins R6.5's merge
      threshold from below, and the duration assertions are the sharp guard against a merge-threshold
      regression
    - Assert the R6.15 label string verbatim:
      `"Saturn ±45° from natal Moon (347.76°) - 12th, 1st, 2nd houses"`
    - **Assert dates and durations only, never sequence numbers.** PVR labels these `#1`, `#2` and
      `#3`; our horizon starts 33 years pre-birth, so our numbering legitimately differs
    - This is a genuine third-party cross-check of the scan, the merge rule and the bisection at
      once — it replaces the old self-referential "120-year regression anchor", which asserted our
      output against our output
    - _Design: Testing Strategy — "The calibration fixture (R6.7) — the most valuable test in the set"_
    - _Requirements: 6.1, 6.7, 6.15_
    - File: `engine/compute/transits.sadeSati.test.ts`
  - [x] 8.8 Write the `asOf` regression test for the sign-based reading
    - Compute `computeTransits` at a **historical** `asOfDate` and assert `sadeSati.allPeriods`
      flags current relative to that date, and that `sadeSati.active` and the flagged period agree —
      the exact disagreement the wall-clock `new Date()` produced
    - _Design: Testing Strategy — "`asOf` fix, sign-based side"_
    - _Requirements: 6.10, 6.11_
    - Same file as 8.7
  - [x] 8.9 Write the horizon-equality and unchanged-sign-baseline test
    - Assert `scanFromYear === birthYear − 33` and `scanToYear === wall-clock year + 35`, plus a
      frozen-baseline comparison confirming the sign-based period list for a fixed chart is
      unchanged by this work
    - _Design: Testing Strategy — "Horizon equality (R6.9)"_
    - _Requirements: 6.9_
    - Same file as 8.7

- [x] 9. Checkpoint - engine work is complete
  - Run `npx vitest --run engine/` and `npx tsc --noEmit`. Ensure all tests pass and both
    `TransitAnalysis` declarations type-check, ask the user if questions arise.

- [x] 10. Implement bindu band and slot derivation (`lib/ashtakavargaBands.ts`)
  - [x] 10.1 Implement the bands, descriptors and `deriveBinduSlots`
    - Implement `BinduReckoning`, `BinduBand`, `BandDescriptor`, `savBand`, `bavBand`, `bandOf`,
      `SAV_BANDS` (exactly 3), `BAV_BANDS` (exactly 4), `bandsFor`, `BAV_PLANETS`, `BinduSlots` and
      `deriveBinduSlots(data: AshtakavargaResult, indexMode)`
    - Thresholds transcribed **unchanged** from today's `getBinduColor`; markers are the glyphs
      `▲ = ▽ ▼`, pairwise distinct within each reckoning; `null` band for an absent, non-integer or
      out-of-range count
    - Pure TypeScript, no React import, importing `AshtakavargaResult` from `@/engine/compute/types`
      so the module runs in the existing `environment: 'node'` Vitest setup
    - House mode reads `byHouse` **verbatim** with no house-to-sign arithmetic; when `byHouse` is
      absent or not exactly 12 entries, fall back to the sign-indexed arrays with Aries-first labels
    - _Design: Components and Interfaces — "R4 + R5 — bindu bands, legends and diagrams";
      "`AshtakavargaView` changes"_
    - _Requirements: 4.2, 4.3, 4.4, 4.6, 4.9, 5.2, 5.5, 5.6, 5.7, 5.9_
  - [x] 10.2 Commit a frozen transcription of today's `getBinduColor` thresholds
    - New test-support module (e.g. `lib/__fixtures__/frozenBinduColor.ts`) holding today's
      `getBinduColor` threshold ladder verbatim, so Property 11 checks the migration against the old
      behaviour rather than against itself
    - _Design: Testing Strategy — "Properties 4 and 11 both assert against frozen reference
      implementations"_
    - _Requirements: 4.4_
  - [x] 10.3 Write property test for band assignment and marker distinctness
    - **Property 11: Bindu band assignment survives the token migration and band signals stay distinct**
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.6, 4.9**
    - File: `lib/ashtakavargaBands.test.ts`, `numRuns: 100`, asserting against the frozen module from
      10.2; include the hostile arbitrary (`NaN`, `-1`, `57`, `2.5`, `undefined`, `null`)
  - [x] 10.4 Write property test for SAV / BAV consistency
    - **Property 12: SAV cells equal the BAV column sums and total the reported savTotal**
    - **Validates: Requirements 5.2, 5.7**
    - Same file as 10.3, `numRuns: 100`. Add the house-mode fidelity example in the same file: given
      a `byHouse` array whose sav values contradict a naive rotation of `sav`, the derived slots
      match `byHouse` (R5.5)

- [x] 11. Add the `moderate` brand token
  - [x] 11.1 Add the CSS variables (`app/globals.css`)
    - Add `--color-moderate` / `--color-moderate-muted` to `:root` and `.dark`, with the design's
      exact values copied from the existing `role-neutral-*` pair
    - _Design: Components and Interfaces — "Brand token addition"_
    - _Requirements: 4.5_
  - [x] 11.2 Wire the token into Tailwind (`tailwind.config.ts`)
    - Add `moderate: themedColor("--color-moderate")` and
      `"moderate-muted": themedColor("--color-moderate-muted")` beside the other favourability
      tokens. The name is `moderate`, **not** `neutral` — `neutral` would shadow Tailwind's built-in
      palette that `NorthIndianChart` already uses via `stroke-neutral-200`
    - _Design: Components and Interfaces — "Brand token addition"_
    - _Requirements: 4.5_
  - [x] 11.3 Add `BAND_STYLE` and `binduBandClass()` (`lib/brandColors.ts`)
    - Add the four-step `BAND_STYLE` record and `binduBandClass(band: BinduBand | null): string`
      returning the unavailable style for `null`. Thresholds stay in `lib/ashtakavargaBands.ts`;
      only classes live here, which is what keeps the band property test free of Tailwind and React
    - _Design: Components and Interfaces — "Brand token addition"_
    - _Requirements: 4.5, 4.9_

- [x] 12. Checkpoint - pure lib modules are green
  - Run `npx vitest --run lib/`. Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement the shared UI infrastructure
  - [x] 13.1 Implement `SectionUnavailable` and `SectionBoundary` (`app/components/SectionUnavailable.tsx`)
    - `SectionUnavailable({ section })` renders exactly `"{section} data is unavailable for this
      chart."` with `role="status"`; `SectionBoundary` is a client error boundary that catches an
      unexpected throw inside a section and renders the same message — no exception type, stack or
      field path in either case
    - _Design: Components and Interfaces — "R8 — the unavailable-section mechanism"_
    - _Requirements: 8.1, 8.4, 8.5_
  - [x] 13.2 Implement the shape guards (`app/components/sectionGuards.ts`)
    - Implement `SectionState<T>`, `isArrayOfLength`, `isNonEmptyArray`, `hasNumberArrays` and
      `guardSection<T>(value, check)`, covering exactly the malformed shapes R8.1 enumerates: wrong
      type, an array where an object is expected, a sign-indexed collection whose length is not 12,
      a BAV collection without the 7 graha keys
    - _Design: Components and Interfaces — "R8 — the unavailable-section mechanism"_
    - _Requirements: 8.1_
  - [x] 13.3 Extract shared chart geometry (`app/components/chartGeometry.ts`)
    - Move `NORTH_LINES`, the `NORTH_CELL` centroids, `NORTH_SIGN_POS`, `SOUTH_LAYOUT`, `CELL_SIZE`,
      `GRID_SIZE` and `CANVAS` out of `NorthIndianChart.tsx` / `SouthIndianChart.tsx` into the new
      module and update both components to import them — a mechanical, behaviour-preserving move
      leaving one source of truth for the two layouts
    - _Design: Components and Interfaces — "`BinduChart` — component strategy" (shared geometry);
      Architecture — Component inventory_
    - _Requirements: 5.1, 5.3_

- [x] 14. Implement `KeyDignitiesPanel` (extracted from `ChartSummaryTab`)
  - [x] 14.1 Create `KeyDignitiesPanel.tsx`
    - Implement `KeyDignitiesPanelProps`; render one combustion chip per entry per the design's
      label-assembly table (Combust / `Combust · Cazimi` with favourable styling taking precedence /
      `Near combust` never reading "Combust" alone / the Moon's `Combust (8° strict)` marker emitted
      under no other condition / no chip when all three flags are false), ordered by ascending
      `degreeFromSun` with source order preserved on ties
    - Implement `roundHalfAwayFromZero1` and render `` `${…}° of ${threshold}°` `` when both values
      are finite, otherwise the `"separation unavailable"` marker
    - Keep the dignity/vargottama chip filter unchanged (skip `neutral`/`friend`/`great_friend`,
      skip Rahu/Ketu). Each chip is a native `<button type="button">` carrying
      `aria-describedby` pointing at an `sr-only` span holding the reason sentence, with a popover
      mirroring the same text on `:hover` and `:focus-visible` — reachable by keyboard, not
      hover-only
    - Call `getVargaDignityReason` with the **same** `degreeInSign` argument as the label it
      explains: read the degree from the same `planets[]` row as the placement and pass it **only
      when the selected division is D1**, mirroring `divisional.ts`
    - Add the local `vargottamaReasonText(divisionShortName, vargaSign, d1Sign)` for the vargottama
      reasons, exposed through the same `aria-describedby` mechanism
    - _Design: Components and Interfaces — "R1 + R2 — `KeyDignitiesPanel`"; Data Models — vargottama
      reasons paragraph_
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 2.1, 2.4, 2.7, 2.11_
  - [x] 14.2 Wire `ChartSummaryTab` to render `KeyDignitiesPanel`
    - Replace the inline Key Dignities card with `<KeyDignitiesPanel>`, passing `planets`,
      `divisionalCharts`, `selectedDivision` and `combustion` (threading `relationships` through)
    - _Design: Architecture — Component inventory ("`ChartSummaryTab.tsx` | Modify")_
    - _Requirements: 1.1, 1.6_
  - [x] 14.3 Write unit tests for combustion chip label assembly
    - The six distinguishable entry states, cazimi precedence over ordinary combust styling, and the
      Moon's `moonStrictCombust` case
    - _Design: Testing Strategy — Example-based unit tests_
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.9_
    - File: `app/components/KeyDignitiesPanel.test.tsx`
  - [x] 14.4 Write unit tests for `roundHalfAwayFromZero1`
    - `0 → "0.0"`, `0.05 → "0.1"`, `1.25 → "1.3"`, `-1.25 → "-1.3"`
    - _Design: Testing Strategy — Example-based unit tests_
    - _Requirements: 1.4_
    - Same file as 14.3
  - [x] 14.5 Write unit test for chip ordering with equal separations
    - Two entries with equal `degreeFromSun`, asserting source order is kept
    - _Design: Testing Strategy — Example-based unit tests_
    - _Requirements: 1.8_
    - Same file as 14.3

- [x] 15. Implement `GrahasTable`
  - [x] 15.1 Create `GrahasTable.tsx`
    - Implement `GrahasTableProps`; one row per `planets` entry in payload order, no rows for Lagna /
      upagrahas / special lagnas / arudha padas; the 14 columns from the design's column table
      (Graha, Sign, Degree via the `formatDMS` helper lifted from `PlanetTable`, House, R, D1
      Dignity, Nakshatra, Pada, Nak Lord, Sub Lord, Deg in Nak, Karaka, Speed, Longitude)
    - Move `KARAKA_SHORT` and `KARAKA_DESCRIPTIONS` in; the karaka cell is a
      `<button type="button" aria-describedby>` with a visually-hidden signification span and a
      popover on `:hover` and `:focus-visible` — a disclosure, not a column
    - Empty cells for a graha with no karaka assignment or no D1 dignity; when `nakshatras` or
      `charaKarakas` is absent or unmatched, render rows from `planets` + D1 and show
      `<SectionUnavailable section="Nakshatras" />` / `"Chara Karakas"` above the table
    - `<caption className="sr-only">`, `<th scope="col">` on all 14 headers, `<th scope="row">` for
      the graha, and an `overflow-x-auto` wrapper confining horizontal overflow inside the pane
    - Render the static legend line: *"Graha text colour identifies the graha only — it carries no
      strength or dignity meaning."* — no hover, click or expansion
    - _Design: Components and Interfaces — "R3 — `GrahasTable`"_
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.8, 3.9, 3.10, 4.1_
  - [x] 15.2 Delete `KarakaTable.tsx`
    - Remove the file once `app/page.tsx` no longer imports it (task 20.2). `PlanetTable.tsx` and
      `NakshatraTable.tsx` are **kept unchanged** — both are still consumed by
      `DurationComputationResults`
    - _Design: Architecture — Component inventory ("`KarakaTable.tsx` | **Deleted**")_
    - _Requirements: 3.1_
  - [x] 15.3 Write unit tests for `GrahasTable` guards and table semantics
    - Missing `nakshatras` / `charaKarakas` renders rows from `planets` + D1 with empty affected
      cells and the naming message; the table carries the required header and row-header structure
    - _Design: Testing Strategy — Example-based unit tests_
    - _Requirements: 3.4, 3.8, 3.9_
    - File: `app/components/GrahasTable.test.tsx`

- [x] 16. Implement the bindu diagrams and update `AshtakavargaView`
  - [x] 16.1 Create `BinduChart.tsx`
    - Implement `BinduCell` and `BinduChartProps`; South Indian fixed sign grid (sign mode: slot *i*
      → sign *i+1*; house mode: sign from `byHouse[i].signNumber`, so no arithmetic), North Indian
      fixed house positions (house mode: slot *i* → cell *i+1*; sign mode: lagna sign in the H1 cell
      when `lagnaSignNumber` is present, Aries first when it is absent, every cell labelling its own
      sign)
    - Each cell an SVG `<g role="img">` with
      `aria-label={`${seriesLabel}, ${label}, ${count} bindus, ${bandLabel}`}` (or `"count
      unavailable"`); the diagram `role="group"` with the series name; a `<table className="sr-only">`
      mirroring the 12 cells so the data is reachable as a table
    - Render the marker glyph immediately after the numeral (`39 ▲`) and always render the numeral as
      text; a cell whose count fails `bandOf` renders with no band colouring, the text `n/a` and no
      marker. Import geometry from `chartGeometry.ts`; do **not** generalise
      `NorthIndianChart`/`SouthIndianChart` or add a variant prop to them
    - _Design: Components and Interfaces — "`BinduChart` — component strategy"_
    - _Requirements: 4.6, 4.9, 5.1, 5.2, 5.3, 5.5, 5.6, 5.10_
  - [x] 16.2 Create `BinduLegend.tsx`
    - Render `bandsFor(reckoning)` as a static row — swatch, marker glyph, inclusive range, label —
      visible without hover, click or expansion, exactly one entry per band the pane renders and no
      entry for a band it does not
    - _Design: Components and Interfaces — "`BinduLegend`"_
    - _Requirements: 4.2, 4.3, 4.7, 4.8_
  - [x] 16.3 Modify `AshtakavargaView.tsx`
    - Props **unchanged** — still `{ data: AshtakavargaData }`, nothing added, renamed or newly
      required, so `DurationComputationResults`' call site keeps working verbatim
    - Remove the `selectedPlanet` selector; render all seven BAV diagrams plus the SAV diagram
      simultaneously; add internal `indexMode` (`hasByHouse ? 'house' : 'sign'`) and `diagramStyle`
      (`'north'` default) state using the Summary tab's two-button N/S toggle pattern
    - Derive diagrams **and** tables from a single `deriveBinduSlots(data, indexMode)` result in the
      same render, so no cell or label can retain a value from the previous mode; retain the existing
      numeric BAV/SAV tables below the diagrams; migrate all band colouring to the brand tokens with
      no literal Tailwind palette class left
    - Drop the local hand-copied `AshtakavargaData` / `AshtakavargaHouseEntry` interfaces in favour
      of importing `AshtakavargaResult` from `@/engine/compute/types`
    - Render both legends inside the pane holding the diagrams; omit the Index_Mode control with the
      unavailable message when `byHouse` is absent or not exactly 12 entries; omit a graha's diagram
      with a naming message when its `bav` entry is missing or short, leaving other diagrams, the
      tables and the legends unaffected
    - _Design: Components and Interfaces — "`AshtakavargaView` changes"_
    - _Requirements: 4.5, 4.7, 4.8, 5.1, 5.3, 5.4, 5.6, 5.7, 5.8, 5.9, 8.1, 8.2_
  - [x] 16.4 Write unit test for embedded-consumer parity
    - Render `AshtakavargaView` with the exact props `DurationComputationResults` already passes,
      asserting identical legend entries, band ranges and Non_Colour_Signals
    - _Design: Testing Strategy — Manual / review verification_
    - _Requirements: 4.8, 8.2_
    - File: `app/components/AshtakavargaView.test.tsx`
  - [x] 16.5 Write unit test for missing `byHouse`
    - `byHouse` absent or not exactly 12 entries → Index_Mode control omitted, sign-indexed rendering
      with Aries-first labels, unavailable message shown
    - _Design: Error Handling table_
    - _Requirements: 5.6_
    - Same file as 16.4
  - [x] 16.6 Write unit test for a missing or short graha `bav` entry
    - That graha's diagram omitted with a naming message; remaining diagrams, tables and legends
      unchanged
    - _Design: Error Handling table_
    - _Requirements: 5.9, 8.1_
    - Same file as 16.4

- [x] 17. Implement `SadeSatiPanel` (extracted from `TransitsView`)
  - [x] 17.1 Create `SadeSatiPanel.tsx`
    - Implement `SadeSatiPanelProps` (`signBased`, optional `degreeBased`, `asOf`, `birthDate`); two
      separately labelled groups, each naming its reading, each listing periods in engine order
    - The two groups render **different row shapes**: sign-based keeps the phase chip
      (`rising`/`peak`/`setting`) + `phaseSign` + `startApprox – endApprox`; degree-based leads with
      `#{sequence}`, the dates, the R6.15 label and a span the panel formats from `durationDays`
      (`7y 88d`) — **no phase chip**, because the degree reading has no phase subdivision
    - Current rows: emphasised styling, `aria-current="true"`, the text badge `CURRENT`, and for the
      degree group `"{completionPct}% elapsed"`. Non-current rows: `opacity-60`, the text badge
      `Not current`, and for a future degree period `"starts in {n} days"` from `startsInDays`
    - Divergence line above the groups when the two readings disagree on active, naming the reading
      that reports Sade Sati running and — for the sign side only — the phase it reports
    - Birth-year exclusion for both groups: sign-based keeps the existing
      `parseInt(endApprox.split(' ').pop())` parse verbatim; degree-based uses
      `new Date(p.end).getUTCFullYear() >= birthYear`. **Do not renumber** the degree periods — the
      sequence is horizon-relative, so the first displayed row is usually not `#1`
    - Type `TransitData.sadeSatiByDegree?: DegreeSadeSatiInfo` by importing the engine type rather
      than hand-copying a fourth declaration; leave `TransitsView`'s three existing local interfaces
      alone
    - Render `<SectionUnavailable section="Degree-based Sade Sati" />` in place of the second group
      when `degreeBased` is absent, leaving the sign-based group unchanged
    - _Design: Components and Interfaces — "R6 — `SadeSatiPanel`"_
    - _Requirements: 6.16, 6.17, 6.18, 6.19, 6.20, 6.21, 8.1_
  - [x] 17.2 Wire `TransitsView` to render `SadeSatiPanel`
    - Replace the Sade Sati branch body with
      `<SadeSatiPanel signBased={data.sadeSati} degreeBased={data.sadeSatiByDegree} asOf={data.asOf} birthDate={birthDate} />`,
      keeping `TransitsView`'s existing `{ data, birthDate }` props and its `sadesati` sub-tab
    - _Design: Components and Interfaces — "R6 — `SadeSatiPanel`" (closing paragraphs)_
    - _Requirements: 6.16, 6.20_
  - [x] 17.3 Write unit tests for `SadeSatiPanel`
    - The four boolean combinations of sign-based-active × degree-based-active for the divergence
      line; `degreeBased` absent renders `SectionUnavailable`; birth-year exclusion for both groups
      (end-year `birthYear − 1` omitted, `birthYear` retained, a period starting pre-birth and ending
      post-birth retained)
    - _Design: Testing Strategy — "Divergence line", "Birth-year exclusion (R6.21)"_
    - _Requirements: 6.19, 6.20, 6.21_
    - File: `app/components/SadeSatiPanel.test.tsx`

- [x] 18. Implement `YogasView`
  - [x] 18.1 Implement the pure yoga grouping helper (`app/components/yogaGrouping.ts`)
    - Group by `category` in the fixed order `mahapurusha, raja, dhana, viparita, lunar,
      neechabhanga, parivartana, kartari, combination`, omitting empty groups; place every entry
      whose category is outside those nine into a single trailing group labelled with that entry's
      own `category` value so nothing is dropped; order within a group by strength
      (`strong` → `moderate` → `weak`) then `name` ascending via `localeCompare` with a fixed `'en'`
      locale; no React import
    - _Design: Components and Interfaces — "R7 — `YogasView`" (grouping bullet)_
    - _Requirements: 7.4, 7.10_
  - [x] 18.2 Write property test for grouping totality and determinism
    - **Property 13: Yoga grouping and ordering are total and deterministic**
    - **Validates: Requirements 7.2, 7.4, 7.10**
    - File: `app/components/yogaGrouping.test.ts`, `numRuns: 100`, generating `Yoga[]` over the nine
      known categories plus injected unknown category strings
  - [x] 18.3 Create `YogasView.tsx`
    - Implement `YogasViewProps`; render every entry's `name`, `category`, all `planets`, all
      `houses`, benefic disposition (`Benefic`/`Malefic`) and strength grade
      (`Strong`/`Moderate`/`Weak`) as text alongside colour, nothing truncated or paginated, entry
      count equal to `yogas.length`; each group header shows the category name and its entry count
    - `activatingPlanets` under a visible "Activating dashas" label, `None recorded` when absent or
      empty; `evidence.afflictions` rendered per affliction with `kind` mapped to
      `Combust`/`Debilitated`/`Nodal` plus `detail` when present, and the entry marked
      `Afflicted (${n})`
    - `rule`, `notes`, `ownedHouses`, `dignity` and `linkage` inside a native `<details>` whose
      `<summary>` text switches between `Show evidence` and `Hide evidence` — the platform toggle,
      not the Radix `Accordion`
    - The two **distinct** messages: `yogas` present and empty → "No named yogas were detected for
      this chart."; `yogas` absent → `<SectionUnavailable section="Named yoga catalogue" />`
    - Use the grouping helper from 18.1
    - _Design: Components and Interfaces — "R7 — `YogasView`"_
    - _Requirements: 7.2, 7.3, 7.5, 7.6, 7.7, 7.8, 7.9, 7.11, 7.12_
  - [x] 18.4 Write unit test for the two distinct yoga messages
    - Assert the empty-catalogue message and the absent-catalogue message are both rendered in the
      right condition and are distinct from each other
    - _Design: Components and Interfaces — "R7 — `YogasView`" (message table)_
    - _Requirements: 7.9, 7.12_
    - File: `app/components/YogasView.test.tsx`

- [x] 19. Checkpoint - components are complete
  - Run `npx vitest --run`. Ensure all tests pass, ask the user if questions arise.

- [x] 20. Wire the tab strip (`app/page.tsx`)
  - [x] 20.1 Update the `Tab` union and `TABS` array
    - Replace `Planets` / `Nakshatras` / `Karakas` with a single `Grahas` entry in the slot `Planets`
      held; insert `Yogas` after `Ashtakavarga` and before `Dasha (Vimshottari)`. Final order:
      Summary · Grahas · Divisional Charts · Ashtakavarga · Yogas · Dasha (Vimshottari) ·
      Chara Dasha · Transits · Pinda Strength · Varshaphal (10 tabs)
    - _Design: Architecture — "Final tab order"; "Data-flow / tab-strip change"_
    - _Requirements: 3.1, 3.7, 7.1_
  - [x] 20.2 Replace the panes
    - Remove the `PlanetTable` / `NakshatraTable` / `KarakaTable` panes and their imports from
      `app/page.tsx`; render `<GrahasTable>` for the Grahas tab (sourcing the same `result.chart`
      fields the removed panes used, plus `divisionalCharts` for the D1 dignity column) and
      `<YogasView yogas={result.chart.yogas} />` for the Yogas tab
    - _Design: Architecture — "Data-flow / tab-strip change"_
    - _Requirements: 3.1, 3.7, 7.1, 8.6_
  - [x] 20.3 Write a smoke test for tab-strip resilience
    - Assert all ten tabs render and stay selectable when one pane's underlying data is malformed or
      absent — the tab strip never reads chart data
    - _Design: Error Handling table — "Tab strip"_
    - _Requirements: 8.5_
    - File: `app/page.test.tsx`

- [x] 21. Update documentation in the same change
  - [x] 21.1 Update the four existing documents
    - `skills/frontend/chart-visualization.md`: component table — remove `KarakaTable`; add
      `GrahasTable`, `BinduChart`, `BinduLegend`, `YogasView`, `SadeSatiPanel`, `KeyDignitiesPanel`,
      `SectionUnavailable`
    - `skills/backend/compute-engine.md`: update the `dignity.ts` row (`MOOLATRIKONA_RANGES`, the
      optional degree parameter, `getVargaDignityReason`) and the `transits.ts` row
      (`computeDegreeSadeSati`, `nextStateChange`/`mergeSegments`, the `asOfDate` parameter on
      `computeSadeSatiPeriods`)
    - `docs/HLD.md`: tab strip (11 → 10 tabs) and engine layout
    - `Claude.md`: keep the Claude Desktop brief current
    - _Design: Testing Strategy — "Documentation to update in the same change"; `Agents.md`
      Documentation Maintenance table_
  - [x] 21.2 Add the "Degree-Based Sade Sati" section to `docs/computation_transits_sadesati.md`
    - Place it **after** the existing sign-based section so the two read as alternatives, following
      the reconciliation pattern of the other `docs/computation_*.md` files: definition → numbered
      method steps → what is not implemented → inline ❓ Validation requests → summary table
    - **Definition and provenance**: Saturn's sidereal longitude within ±45° of the natal Moon's — a
      90° window taking ≈7.25 years to traverse — reported as one contiguous period per passage with
      **no** rising/peak/setting subdivision; credited to PVR Narasimha Rao's implementation in
      Jagannatha Hora / PyJHora, the same source `docs/computation_chara_dasha.md` credits
    - **Method**, numbered: same 33-years-before-birth → 35-years-after-present window as the
      sign-based scan; same 10-day coarse walk; same 42-iteration bisection, sub-second; a retrograde
      merge on the degree scan's **own 138-day** threshold rather than the sign scan's 240 d, with the
      reason and the (123.45 d, 152.46 d] calibration interval stated; sequence numbering from 1
      across the horizon
    - **Calibration table** for the Reference_Chart in the shape the other computation docs use:
      1993-03-31 → 2000-06-30, 2023-02-10 → 2030-05-09 and 2052-03-20 → 2059-06-19 as reference, the
      engine's output beside it, Δ ≤ 3 d on all three
    - **Why the readings can disagree**, with the worked geometry: Moon at Pisces 17.76° puts the
      ±45° window across Aquarius, Pisces, Aries **and** Taurus, so the angular reading can be
      running while the sign reading is not, and vice versa
    - **The `asOf` correction**, stated as a fix: both readings' current flags now come from the
      single instant the transit block reports, replacing a wall-clock read that disagreed with
      `sadeSati.active` for any historical evaluation date
    - Four ❓ Validation requests — the descriptive label (classical trio vs the up-to-four signs
      the arc touches); sequence numbering (horizon-relative as implemented vs first period ending
      at or after birth); whether ±45° symmetric is the school's convention or the window is anchored
      to the Moon's sign boundaries; and how long an excursion outside the orb ends a passage, since
      the reference periods pin the merge threshold only to (123.45 d, 152.46 d] — add rows 6–8 to the
      existing "Summary of Open Questions" table and rewrite row 5 as the threshold-value question
    - _Design: Testing Strategy — "`docs/computation_transits_sadesati.md` — new section"_
    - _Requirements: 6.1, 6.6, 6.7, 6.9, 6.10, 6.15_
  - [x] 21.3 Add the dignity / moolatrikona note
    - New `docs/computation_dignity.md`, or a section in the nearest existing reconciliation doc if
      one already covers dignity, in the same reconciliation pattern
    - Content: the classical range table as implemented with the sign each range belongs to; that
      the range applies **only where a degree exists** (D1) while D2–D60 keep the whole-sign rule
      because this engine computes a varga sign with no varga longitude; that the *label* is now
      degree-aware while Saptavargaja Bala (`shadbala.ts`) and Kshetra Bala (`varshaphal.ts`) remain
      sign-only, with the reason stated plainly rather than glossed; and that for the Moon and
      Mercury the range is unreachable because their moolatrikona sign coincides with their
      exaltation sign
    - Two ❓ Validation requests — is each range's upper bound exclusive (Sun's moolatrikona ending
      *at* 20°00'00" Leo) or inclusive; should Saptavargaja Bala's moolatrikona rung become
      degree-aware for D1 only, accepting that one of its seven rungs then behaves differently from
      the other six
    - _Design: Testing Strategy — "Dignity / moolatrikona note"; Open Decisions (1)_
    - _Requirements: 2.11, 2.12, 2.13, 2.14, 2.15_

- [x] 22. Final checkpoint
  - Run `npx vitest --run`, `npm run lint` and `npm run build`. Ensure all three pass, then walk the
    Grahas, Ashtakavarga, Transits and Yogas tabs keyboard-only and with a screen reader for the
    presentational criteria no installed test stack can assert (R2.1, R2.4, R3.5, R3.10, R4.1–R4.3,
    R5.4, R5.10, R4.8). Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. No core implementation
  task is marked optional.
- **Tasks 5.1 and 5.2 are test tasks but are deliberately NOT optional**: they repair existing
  suites that the dignity change breaks. Skipping them leaves the suite red.
- Every task cites the design section it implements and the requirement clause numbers it covers.
- Two engine behaviour changes carry real risk and are sequenced to contain it: the moolatrikona
  degree rule (tasks 2 → 4 → 5, with the call-site updates and existing-test repairs immediately
  after the change) and the `asOf` / `isCurrent` fix (task 7.3, verified by task 8.8).
- Three "do not change" instructions are load-bearing: `shadbala.ts` and `varshaphal.ts` keep their
  sign-only `MOOLATRIKONA_SIGNS`; `scoring.ts:424`, `:873` and `:888` keep calling
  `getVargaDignityLabel` with three arguments; and the `computeSadeSatiPeriods` horizon endpoints
  stay wall-clock-derived while only `isCurrent` moves to `asOf`.
- The transit types live in **two** files (`transits.ts` and `types.ts`) and both must gain the new
  declarations and the `sadeSatiByDegree` sibling or the engine will not type-check. The duplication
  is preserved, not fixed — collapsing it would make `types.ts` pull in `swisseph-v2`.
- `transits` is a schema-less nullable `Json` column with no Zod validator gating its shape, so the
  sibling field needs **no** Prisma migration and **no** validator change.
- Property tests cover the thirteen Correctness Properties in `design.md`; everything else is
  example-based, per the design's Testing Strategy. No DOM or component-testing library is installed
  or proposed, so presentational criteria are verified by the walkthrough in task 22.
- Properties 5–10 run over a shortened ~35-year test horizon via a test-only override on the
  internal scanner; the real horizon is exercised by the calibration fixture (task 8.7).
- The design's stated defaults for the three Open Decisions are implemented as written and are not
  tasks: Saptavargeeya Bala stays sign-only, the Yogas tab sits after Ashtakavarga, and Sade Sati
  numbering is horizon-relative.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2", "7.1", "10.1", "10.2", "11.1", "11.2", "13.1", "13.2", "13.3", "18.1"] },
    { "id": 1, "tasks": ["2.3", "3.1", "4.1", "4.2", "4.3", "7.2", "10.3", "11.3", "15.1", "16.1", "17.1", "18.2"] },
    { "id": 2, "tasks": ["2.4", "3.2", "5.1", "5.2", "7.3", "10.4", "14.1", "16.2", "18.3"] },
    { "id": 3, "tasks": ["2.5", "3.3", "7.4", "14.2", "15.3", "16.3", "17.2", "18.4"] },
    { "id": 4, "tasks": ["7.5", "14.3", "16.4", "17.3", "20.1"] },
    { "id": 5, "tasks": ["7.6", "14.4", "16.5", "20.2"] },
    { "id": 6, "tasks": ["8.1", "14.5", "15.2", "16.6", "20.3"] },
    { "id": 7, "tasks": ["8.2"] },
    { "id": 8, "tasks": ["8.3", "8.7"] },
    { "id": 9, "tasks": ["8.4", "8.8"] },
    { "id": 10, "tasks": ["8.5", "8.9"] },
    { "id": 11, "tasks": ["8.6"] },
    { "id": 12, "tasks": ["21.1", "21.2", "21.3"] }
  ]
}
```
