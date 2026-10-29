# Implementation Plan: One Nakshatra Locator for the Whole Engine

## Overview

Export the locator from `engine/compute/nakshatras.ts`, move every other copy of
nakshatra arithmetic onto it, and settle the pada/sub-lord pairing. Done on
2026-10-28 on branch `claude/adoring-moser-584cc0`.

Conventions for this feature:

- Compute modules stay **pure**: no LLM, network, DB or file I/O.
- Scratch sweeps live outside the repo (the session scratchpad), and compare a
  snapshot of each file taken before the change with the changed file.
- Run everything on **Node 20** (`PATH="/opt/homebrew/opt/node@20/bin:$PATH"`); in a
  nested worktree run ESLint as `npx eslint . --ext .ts,.tsx --no-eslintrc -c .eslintrc.json`.
- Another change owns the rest of `matchmaking.ts`, `matchmakingTables.ts`,
  `engine/compute/types.ts`, `app/api/matchmaking/**`, `docs/computation_matchmaking.md`
  and `docs/ERD.md`; this plan does not touch them.

## Tasks

- [x] 1. Shared locator (`engine/compute/nakshatras.ts`)
  - [x] 1.1 Export `normalizeLongitude`, `locateInNakshatra` and the
    `NakshatraLocation` type
    - _Requirements: 1.1–1.5_
  - [x] 1.2 Use `NAKSHATRA_SPAN_DEG`, `DASHA_SEQUENCE`, `TOTAL_DASHA_YEARS` and
    `NAKSHATRAS` from `engine/constants.ts`; keep `getNakshatraData()`'s
    `{ name, lord }[]` shape; check for import cycles
    - _Requirements: 6.1, 6.2_
  - [x] 1.3 Pada and sub-lord from one exact comparison, `9 × lon ≥ years`
    (`hasReachedYears`, TwoSum); NaN keeps a NaN pada
    - _Requirements: 7.1–7.4_ — _Design: Pada and Sub-Lord_
  - [x] 1.4 Export `distanceToNakshatraBoundary(lon)` built on the locator and the
    nakshatra's exact cut points
    - _Requirements: 3.1, 3.2, 3.4_ — _Design: Boundary Risk_

- [x] 2. Vimshottari (`engine/computeVimshottari.ts`)
  - [x] 2.1 Take the birth nakshatra index and elapsed fraction from
    `locateInNakshatra`; keep the [0, 360) input check
    - _Requirements: 2.1, 2.2, 2.4, 2.5_
  - [x] 2.2 Copy `tests/vimshottari-nakshatra-boundary.test.ts` verbatim from
    branch `claude/youthful-chebyshev-d9d035`; it fails before 2.1 and passes after
    - _Requirements: 2.3_

- [x] 3. Other modules
  - [x] 3.1 `matchmaking.ts` `computeBoundaryRisk`: distance from
    `distanceToNakshatraBoundary`; only that function and the `./nakshatras` import
    line change
    - _Requirements: 3.1–3.5_
  - [x] 3.2 `specialLagnas.ts` Sree Lagna: the Moon's fraction from the locator
    - _Requirements: 4.1–4.3_
  - [x] 3.3 Sweep each lossy `normLong` copy (`upagrahas.ts`, `gochar.ts`,
    `specialLagnas.ts`, `transits.ts`) against `normalizeLongitude`; replace only
    where outputs do not change; record the rest in design.md
    - _Requirements: 5.1, 5.2_ — _Design: Lossy Normalizations_

- [x] 4. Tests (`tests/nakshatra-shared-locator.test.ts`)
  - [x] 4.1 Locator contract: ranges, NaN, −0, exports, shared constants,
    `getNakshatraData()` shape
    - _Requirements: 1.2, 1.3, 6.2_
  - [x] 4.2 Pada/sub-lord: every double within 64 ulps of every cut point gets a
    possible pair and, where the index is exact, the BigInt oracle's pada and
    sub-lord; the 4-decimal oracle still holds; NaN pada
    - _Requirements: 7.1–7.4_
  - [x] 4.3 Boundary risk: exact `atRisk` for every 4-decimal longitude within
    0.005° of a boundary or a threshold edge; distance 0 on a boundary
    - _Requirements: 3.2, 3.4_
  - [x] 4.4 Sree Lagna: a boundary Moon gives Sree Lagna = Lagna
    - _Requirements: 4.2_

- [x] 5. Verification and documentation
  - [x] 5.1 Scratch sweeps old vs new for every touched function; counts in
    design.md, Measured Drift
    - _Requirements: 2.6, 3.3, 4.3, 8.1_
  - [x] 5.2 Full Vitest suite (73 files, 1301 tests), `tsc --noEmit` and ESLint
    (0 errors, 1 pre-existing warning in `app/duration-analysis/[id]/page.tsx`) on Node 20
    - _Requirements: 8.3_
  - [x] 5.3 `docs/HLD.md`, `.kiro/skills/engine-pipeline.md`,
    `skills/backend/compute-engine.md`, `skills/backend/pre-analysis.md`; propose
    `Claude.md` and `docs/RELEASE_NOTES.md` text
    - _Requirements: 9_

- [ ] 6. Open items
  - [ ] 6.1 Commit (not done: the user commits)
  - [x] 6.2 Decide whether `computeVimshottari` should accept a stored
    `moonLongitude` of 360.0000 (design.md, Open Questions): yes, done in 7.1
  - [x] 6.3 Delete the now-unused `NAKSHATRA_SPAN_DEG` constant in
    `matchmaking.ts` (outside this change's edit region)

- [x] 7. Review follow-ups
  - [x] 7.1 `computeVimshottari` accepts [0, 360] (360 reads as 0°) and rejects NaN with
    `DashaIntegrityError`; tests in `tests/nakshatra-shared-locator.test.ts`
    - _Requirements: 2.4_ — _Design: Vimshottari_
  - [x] 7.2 State the sweep baseline in design.md (the branch's earlier fix, not `main`) and add
    `main`'s figures from the independent review
  - [x] 7.3 Release note: the 4-decimal drift figure (about 1% of trees, up to 9 ms), not only
    the full-precision one
  - [x] 7.4 `docs/HLD.md`: pratyantardashas are populated for all 9 MDs, not "current + next"

## Dependency Notes

- Task 1 must land before tasks 2–4: they import from it.
- Task 2.2's test is identical on both branches; on merge keep this branch's
  `computeVimshottari.ts` (design.md, Merge Notes).
