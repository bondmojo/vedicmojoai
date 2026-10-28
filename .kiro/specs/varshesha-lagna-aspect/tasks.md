# Implementation Plan: Strength-First, Lagna-Aspect-Aware Varshesha (Phase 1 Tajika Aspects)

## Overview

This plan adds the sign-based Tajika aspect module (`engine/compute/tajikaAspects.ts`)
and rewrites `computeVarshesha` to pick the strongest office-holder that aspects the
Varsha Lagna, per the approved design. Tasks are dependency-ordered: types and the pure
aspect engine first, then the selection rewrite, then UI/MCP surface, then docs and a
full-suite checkpoint.

Tasks 1–5 were implemented on branch `missing-mcp-features` on 2026-10-28; this spec
records them after the fact. Task 7 fixes the 11 findings from a code review the
same day and supersedes parts of tasks 1–3. Task 8 applies an astrologer review
(Requirement 9) and reverses the "conjunction is not an aspect" choice in tasks 1–2.
Task 6 is still open.

Testing conventions for this feature:

- The Aspect_Engine and `computeVarshesha` MUST stay **pure and never-throwing**: no
  LLM/network/DB/file I/O; invalid input yields `null` or a non-qualifying candidate,
  never an exception.
- Selection tests use hand-built inputs (no ephemeris) so the rule is pinned
  independently of planetary positions.
- Run the suite on **Node 20** (`.nvmrc`); a newer Node cannot load the `swisseph-v2`
  addon built for Node 20.
- Sub-tasks postfixed with `*` are optional (test-focused); the real-chart invariant
  (2.5) is NOT optional because it replaces the old "most offices" test.

## Tasks

- [x] 1. Tajika aspect types and pure engine
  - [x] 1.1 Add `TajikaAspectKind`, `TajikaAspectNature` and `TajikaSignAspect` to the
    Varshaphal section of `engine/compute/types.ts`
    - _Requirements: 1.1_ — _Design: Data Models_
  - [x] 1.2 Create `engine/compute/tajikaAspects.ts`: `TAJIKA_ASPECT_BY_DISTANCE`,
    `getTajikaSignAspect(fromSign, toSign)` with an invalid-input `null` guard, and
    `TAJIKA_LAGNA_ASPECT_NATURES = ['friendly', 'inimical']` (moved to `varshaphal.ts`
    as `VARSHESHA_LAGNA_ASPECT_NATURES` in 7.3)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.7_ — _Design: Aspect Engine_
  - [x]* 1.3 `engine/compute/tajikaAspects.test.ts`: all 144 sign pairs, mutual symmetry,
    direction (Aries→Leo = 5, Leo→Aries = 9), invalid input → `null`
    - _Requirements: 5.1_

- [x] 2. Strength-first Varshesha selection
  - [x] 2.1 Extend `VarsheshaCandidate` with `officeCount` and `lagnaAspect`, and
    `VarshaphalResult.varshesha` with `lagnaAspect` and `selectionBasis`; replace the
    stale `varshesha` doc comment
    - File: `engine/compute/types.ts`
    - _Requirements: 3.1, 3.2_ — _Design: Data Models_
  - [x] 2.2 Rewrite `computeVarshesha`: new `annualPlanets` parameter; filter to
    candidates aspecting the Varsha Lagna; rank by PV, then office count, then office
    priority order; fall back to all five with `selectionBasis` set
    - File: `engine/compute/varshaphal.ts`
    - _Requirements: 2.1–2.6_ — _Design: Selection Algorithm_
  - [x] 2.3 Pass `annualChart.planets` from `computeVarshaphal`; update the file header,
    the function docstring and the `method` string (remove "deferred")
    - _Requirements: 3.3_
  - [x]* 2.4 Hand-built `computeVarshesha` tests in `tests/varshaphal.test.ts`: strong
    single-office beats weak two-office; strongest non-aspecting loses; conjunction does
    not qualify (reversed in 8.5); no-aspect fallback; PV tie → office count
    - _Requirements: 5.2_ — _Design: Worked example_
  - [x] 2.5 Replace the "most offices" invariant with the real-chart invariant for
    2024–2026 (aspect per candidate, office count, max PV of pool, `selectionBasis`)
    - _Requirements: 5.3_

- [x] 3. UI and MCP surface
  - [x] 3.1 `app/components/VarshaphalView.tsx`: new fields on the local interfaces;
    `lagnaAspectLabel()` / `lagnaAspectColor()` helpers; aspect line and "×N offices" on
    candidate cards; aspect or fallback note on the Varshesha card
    - _Requirements: 4.1, 4.2, 4.3_ — _Design: UI_
  - [x] 3.2 `mcp/src/tools.ts`: update the `compute_varshaphal` description; no route or
    schema change
    - _Requirements: 3.4_ — _Design: API / MCP_
  - [ ] 3.3 Check the Varshaphal tab in a browser: aspect chips, "×N offices", and the
    Varshesha card on both branches
    - Not done: the local dev server needs a logged-in session and none was available
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 4. Documentation
  - [x] 4.1 Update in the same change: `docs/computation_varshaphal.md` (§2, §6 Tier C
    items 7–8, Tier D Phase 2 split, §7 open item), `docs/HLD.md`, `docs/DFD.md` (P8.4),
    `skills/backend/compute-engine.md`, `Claude.md`, `docs/RELEASE_NOTES.md` (Unreleased:
    the year lord can change)
    - _Requirements: 6, 7.1, 7.2, 7.3_ — _Design: Documentation_
  - [x] 4.2 Write this spec (`requirements.md`, `design.md`, `tasks.md`)

- [x] 5. Checkpoint
  - [x] 5.1 Full Vitest suite (70 files, 1147 tests), ESLint on changed files, and
    `tsc --noEmit` pass on Node 20; MCP cost guard passes
    - _Requirements: 5.4, 3.4_
  - [x] 5.2 Old-vs-new comparison for the test birth, 1990–2040: year lord changed in
    33 of 51 years, 2 via fallback, 16 of the 33 via an inimical aspect (re-measured
    after the review fixes in 7.9)
    - _Requirements: 5.5_ — _Design: Measured Impact_

- [ ] 6. Open items
  - [ ] 6.1 Verify the ordering against the Tajika Neelakanthi verse and one JHora
    year-lord screen for a known chart. Confirm or revise: inimical aspects
    (conjunction, square, opposition) counting; the strongest-of-five fallback and any
    Moon exception in it; the Sagittarius night Trirashi lord; and the PV friendship
    table, Drekkana type and fractions. Friendly-only is one edit to
    `VARSHESHA_LAGNA_ASPECT_NATURES`; the others are small edits in `varshaphal.ts`;
    each needs its tests and docs updated
    - _Requirements: 7.1, 7.2_
  - [ ] 6.2 Commit with a conventional message (`feat:`), excluding unrelated local
    changes
  - [ ] 6.3 Phase 2 — separate spec: deeptamsha orbs and applying/separating in
    `tajikaAspects.ts`

- [x] 7. Code-review fixes (2026-10-28)
  - [x] 7.1 Day/night from the horizon, not whole-sign houses: new exported
    `isSunAboveHorizon(sunLongitude, ascendantLongitude)` in `varshaphal.ts`;
    `dayVarsha` uses it with `annualChart.lagnaLongitude`
    - _Requirements: 8.1, 8.2_ — _Design: Day/Night of the Varsha Pravesh_
  - [x] 7.2 Day/night tests: `isSunAboveHorizon` unit cases and two real-chart
    regressions (05:30 birth, Varshaphal 1994 and 2000); the existing day/night test
    now checks the horizon rule instead of `house >= 7`
    - _Requirements: 8.3_
  - [x] 7.3 Move the counted-natures policy out of `tajikaAspects.ts` into
    `varshaphal.ts` as `VARSHESHA_LAGNA_ASPECT_NATURES`; build the `method` note's
    counted aspect kinds from it
    - _Requirements: 1.6, 2.7_ — _Design: Selection Algorithm_
  - [x] 7.4 Report the raw `lagnaAspect` on every candidate and add `aspectsLagna`;
    selection filters on `aspectsLagna`
    - _Requirements: 3.1_ — _Design: Data Models_
  - [x] 7.5 Freeze `TAJIKA_ASPECT_BY_DISTANCE` and its entries; test that the table is
    frozen and results are copies
    - _Requirements: 1.7_
  - [x] 7.6 UI: import `TajikaSignAspect` from the engine (drop the local copy);
    show uncounted aspects as "(not counted)"; highlight every card of the winning
    planet
    - _Requirements: 4.1, 4.4, 4.5_ — _Design: UI_
  - [x] 7.7 Tests: replace the redundant "strongest planet loses" case with a
    two-office version; add full-tie office-order, missing-planet and
    `aspectsLagna` cases; make the real-chart invariant independent (house-based
    expected aspects, rule oracle with office and tie-breaks); check the method note
    - _Requirements: 5.2, 5.3_
  - [x] 7.8 Docs: list all three unverified choices in `docs/computation_varshaphal.md`
    §7 (adds conjunction); rewrite item 8a for the horizon rule; add the day/night fix
    and `aspectsLagna` to the release notes; add `varshaphal.ts` and `tajikaAspects.ts`
    to the `.kiro/skills/nextjs-project-structure.md` tree; update the
    `skills/backend/compute-engine.md` Varshaphal note
    - _Requirements: 6, 7.2, 8.4_
  - [x] 7.9 Re-measure impact against the original code: 33 of 51 years changed;
    day/night flipped in 5, changing the year lord in 2; 4 via fallback; 14 of the 33
    via an inimical aspect. Day/night now matches the horizon in 300 of 300 charts
    - _Requirements: 5.5_ — _Design: Measured Impact_
  - [x] 7.10 Re-run the full suite, ESLint and `tsc --noEmit` on Node 20
    - _Requirements: 5.4_

- [x] 8. Astrologer-review fixes (2026-10-28)
  - [x] 8.1 Replace the one-pair-per-element triplicity table with the Neelakanthi
    per-sign `TRIRASHI_LORDS` and exported `getTrirashiLord(sign, dayVarsha)` in
    `varshaphal.ts`; Sagittarius night = Saturn, source disagreement noted
    - _Requirements: 9.1_ — _Design: Trirashi Lord and Kshetra Bala_
  - [x] 8.2 Add `1 → conjunction, inimical` to `TAJIKA_ASPECT_BY_DISTANCE` and
    `'conjunction'` to `TajikaAspectKind`; a planet in the Varsha Lagna now qualifies.
    Method note: "counted: conjunction, sextile, square, trine, opposition"
    - _Requirements: 1.1, 2.5, 9.3_ — _Design: Aspect Engine_
  - [x] 8.3 `computeKshetraBala` (now exported) reads the sign lord only; drop
    `MOOLATRIKONA_SIGNS`
    - _Requirements: 9.2_
  - [x] 8.4 UI label "In Lagna (conjunction)"; MCP `compute_varshaphal` description
    says a planet in the Lagna counts
    - _Requirements: 4.1_
  - [x] 8.5 Tests: 144-pair table and a conjunction case in `tajikaAspects.test.ts`;
    house-1 row in the real-chart invariant; conjunction-qualifies and
    Lagna-lord-in-own-Lagna cases; the two cases that relied on a planet in the Lagna
    not counting moved to the 12th; 24 Trirashi cells, real-chart Trirashi office,
    Kshetra scores and the 2026 Mars regression
    - _Requirements: 5.1, 5.2, 9.4_
  - [x] 8.6 Docs: `docs/computation_varshaphal.md` (Tier C 8, 8b, 8c; §7 open list),
    `docs/RELEASE_NOTES.md`, `Claude.md`, `skills/backend/compute-engine.md`, this spec
    - _Requirements: 6, 7.2, 9.5_
  - [x] 8.7 Measure against the pre-fix code: year lord changed in 90 of 306 charts
    (6 birth times × 1990–2040), 14 of 51 for the 12:00 birth; engine matches an
    independent oracle in 306 of 306. Full suite, ESLint and `tsc --noEmit` on Node 20
    - _Requirements: 5.4, 5.5_ — _Design: Measured Impact_

- [x] 9. Annual-chart Sade Sati (2026-10-28)
  - [x] 9.1 `computeVarshaphal`: natal Moon via `computePlanetPositions`; replace
    `annualChart.transits` with `computeTransits` on the natal Moon and Lagna at the
    Varsha Pravesh; method note and `annualChart` doc comment updated
    - _Requirements: 10.1, 10.3_ — _Design: Annual-Chart Transits and Sade Sati_
  - [x] 9.2 Tests: natal-Moon reckoning (sign and degree reading), `asOf` = Varsha
    Pravesh, inactive 2026 / active 2030, identical period lists across years,
    houses from natal Moon and Lagna
    - _Requirements: 10.2, 10.4_
  - [x] 9.3 Docs: `docs/computation_varshaphal.md` item 8d, `docs/DFD.md` P8.4,
    `docs/RELEASE_NOTES.md`, `skills/backend/compute-engine.md`, MCP
    `compute_varshaphal` description (rebuild `mcp/dist` to reach Claude Desktop)

## Dependency Notes

- Task 1 is standalone and mergeable on its own; nothing else imports the aspect
  module yet.
- Task 2 is the only behaviour-changing task: it changes the year lord for an existing
  chart and year (33 of 51 years for the test birth). The release note says so.
- Task 6.1 can flip the rule to friendly-only without touching the selection code;
  Phase 2 (6.3) extends `tajikaAspects.ts` and does not need this spec reopened unless
  the Lagna check itself moves to orbs.
