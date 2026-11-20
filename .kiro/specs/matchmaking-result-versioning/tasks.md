# Implementation Plan: Matchmaking Result Versioning

## Overview

Dependency-ordered: the engine stamp and its type land first, then the read helper, then the routes
that return it, then the page that shows it, then tests, then docs.

Conventions for this change:

- **No schema change.** The stamp lives inside the existing `CompatibilityMatch.result` JSONB.
  If any task seems to need a column, stop and raise it instead of migrating.
- **`MATCHMAKING_TABLES_VERSION` keeps its value.** No table changed.
- **Snapshots stay verbatim.** No reader recomputes or rewrites a persisted `result`.
- **File ownership.** Another change is editing `computeBoundaryRisk` and the `from './nakshatras'`
  import in `engine/compute/matchmaking.ts`, and `engine/compute/nakshatras.ts` itself. This plan
  does not touch them. `CLAUDE.md` and `docs/RELEASE_NOTES.md` are merged by the parent change.

## Tasks

- [x] 1. Engine version stamp
  - [x] 1.1 Add `MATCHMAKING_ENGINE_VERSION = 'matchmaking-engine-v1-pada-boundary-fix'` to
    `engine/compute/matchmaking.ts`, with a doc comment giving the bump rules (design.md §Bump
    rules)
    - _Requirements: 1.1, 1.4, 1.5_ — _Design: Data shape, Bump rules_
  - [x] 1.2 Add `engineVersion: string` to `MatchResult` and narrow the `tablesVersion` comment in
    `engine/compute/types.ts`
    - _Requirements: 1.2, NFR-5_ — _Design: Data shape_
  - [x] 1.3 Stamp `engineVersion` in `computeMatch`
    - _Requirements: 1.2, 1.7_
  - [x] 1.4 Narrow `MATCHMAKING_TABLES_VERSION`'s doc comment in `matchmakingTables.ts` to table
    contents only (value unchanged), pointing logic changes at the engine version
    - _Requirements: 1.3, NFR-5_

- [x] 2. Reading the stamp
  - [x] 2.1 Add `MatchVersionInfo` to `engine/compute/types.ts`
    - _Requirements: 2.1_ — _Design: Data shape_
  - [x] 2.2 Add pure, never-throwing `describeMatchVersion(stamps)` to `matchmaking.ts`: missing /
    non-string / empty → `null`; `stale` when either stamp is `null` or not current
    - _Requirements: 2.1, 2.2, 2.3, NFR-4_
  - [x] 2.3 Re-export `MATCHMAKING_ENGINE_VERSION`, `describeMatchVersion` and `MatchVersionInfo`
    from `engine/compute/index.ts`
    - _Requirements: 1.1_

- [x] 3. Routes
  - [x] 3.1 `POST /api/matchmaking`: return `engineVersion` beside `tablesVersion`; the persisted
    `result` already carries it via `computeMatch`
    - File: `app/api/matchmaking/route.ts`
    - _Requirements: 2.5, 1.6_
  - [x] 3.2 `POST /api/matchmaking/preview`: return `engineVersion`
    - File: `app/api/matchmaking/preview/route.ts`
    - _Requirements: 2.5_
  - [x] 3.3 `GET /api/matchmaking/[id]`: add `engineVersion` (from `result`, guarded for a
    non-object `result`) and `stale` via `describeMatchVersion`; keep `result` verbatim
    - File: `app/api/matchmaking/[id]/route.ts`
    - _Requirements: 2.4, NFR-1, NFR-3_
  - [x] 3.4 Confirm, by inspection, that `GET /api/matchmaking` (list) and `mcp/src/tools.ts`
    `compute_match` need no change
    - _Requirements: 2.6, 2.7_

- [x] 4. Saved match page
  - [x] 4.1 `/matchmaking/[id]`: add optional `engineVersion` to the local result mirror and
    `engineVersion` / `stale` to `MatchDetail`; show `engine <version | unversioned>` beside the
    tables version; show the stale caution when `stale`
    - File: `app/matchmaking/[id]/page.tsx`
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 5. Tests (`tests/matchmaking-result-versioning.test.ts`) — not optional
  - [x] 5.1 Bride and groom Moon at `Prisma.Decimal('80.0000')` through `computeMatchResult`:
    Punarvasu pada 1, `rashiNumber: 3` in Varna/Vashya/Graha Maitri/Bhakoot evidence, Graha Maitri
    lord Mercury
    - _Requirements: 4.1, 4.4_
  - [x] 5.2 Moon at `30.0000`: Krittika pada 2, `rashiNumber: 2` (Taurus)
    - _Requirements: 4.2_
  - [x] 5.3 Ordinary longitude: pre-fix and post-fix derivations agree and give an identical
    `MatchResult` apart from `engineVersion`; at `80.0000` they disagree
    - _Requirements: 4.3_
  - [x] 5.4 Stamp present on new results; `describeMatchVersion` for current, legacy, older-tables
    and malformed stamps
    - _Requirements: 4.5, 4.6_
  - [x] 5.5 Routes with mocked Prisma/auth: POST persists and returns `engineVersion`; preview
    returns it; GET legacy → `engineVersion: null, stale: true`, `result` unchanged; GET current →
    `stale: false`; GET non-object `result` → 200
    - _Requirements: 4.5, 2.4, 2.5_

- [x] 6. Documentation
  - [x] 6.1 `docs/computation_matchmaking.md`: Versioning section and a boundary-note pointer to
    the engine version
    - _Requirements: 5.1_
  - [x] 6.2 `docs/ERD.md`: `CompatibilityMatch.result` carries `engineVersion`, no new column
    - _Requirements: 5.2_
  - [x] 6.3 `docs/HLD.md` §8.4: name both stamps where the diagram names `tablesVersion` (re-read
    the file first; another change edits other sections)
    - _Requirements: 5.3_
  - [x] 6.4 Draft the `CLAUDE.md` and `docs/RELEASE_NOTES.md` text for the parent change
    - _Requirements: 5.4_

- [x] 7. Checkpoint
  - [x] 7.1 `npx vitest run`, `npx tsc --noEmit`, and ESLint all pass
    - _Requirements: NFR-1, NFR-4_

- [x] 8. Review follow-ups
  - [x] 8.1 Move `MATCHMAKING_ENGINE_VERSION` and `describeMatchVersion` to
    `engine/compute/matchmakingVersion.ts`; the `[id]` route imports it directly so reading or
    deleting a saved match no longer loads the Swiss Ephemeris addon
    - _Requirements: NFR-1_ — _Design: Data shape_
  - [x] 8.2 Record the boundary-risk change (39, 79, … 359.0000° now at risk) in the v1 history,
    `docs/computation_matchmaking.md` and `design.md`
    - _Requirements: 1.4, 5.1_
  - [x] 8.3 Rename two tests that claimed more than they check (the ordinary-pair comparison
    isolates the derivation; the non-object `result` cases prove the API answers, not the page)
    - _Requirements: 4.3, 2.4_
