# Implementation Plan: Full-Length Birth Mahadasha Sub-Periods (Vimshottari)

## Overview

This plan fixes the layout of the birth mahadasha's antardashas and
pratyantardashas in `engine/computeVimshottari.ts`, adds a backfill for stored
trees, and pins the method with an independent oracle. Tasks 1–5 were done on
2026-10-28 on branch `claude/competent-hamilton-155273`; task 6 is open.

Testing conventions for this feature:

- `computeVimshottari` stays a **pure** function: no LLM, network, DB or file I/O.
- The oracle in the test file shares no code with the engine.
- Run the suite on **Node 20** (`PATH="/opt/homebrew/opt/node@20/bin:$PATH"`); a
  newer Node cannot load the `swisseph-v2` addon.

## Tasks

- [x] 1. Engine
  - [x] 1.1 Add `computeBirthMahadashaAntardashas(mdLord, birth, balanceDays)`
    (exported): full-length ADs from `birth − elapsed`, full-length PDs per AD, then
    clip to [birth, birth + balance]
    - _Requirements: 1.1, 1.2, 1.3, 1.5_ — _Design: Algorithm_
  - [x] 1.2 Add private `clipPeriods()`: drop periods with no length left, give cut
    periods their clipped `start`/`end`/`duration_days`, never mutate input
    - _Requirements: 1.3_
  - [x] 1.3 Use it for MD 1 in `computeVimshottari`; step 5 computes PDs for MDs
    2–9 only
    - _Requirements: 1.4, 2.1, 2.2, 2.3, 2.4_
  - [x] 1.4 Integrity check 2: ADs contiguous from the MD start, and sum to the MD
    duration (the balance for MD 1)
    - _Requirements: 3.1, 3.2_ — _Design: Integrity Checks_

- [x] 2. Backfill
  - [x] 2.1 `scripts/backfill-birth-mahadasha.ts`: exported
    `repairBirthMahadasha(tree)` rebuilds `mahadashas[0].antardashas` from the stored
    birth MD; field-by-field comparison (key-order-insensitive); skips unusable
    trees; `--dry-run`; Prisma created in `main()` behind an argv guard
    - _Requirements: 4.1–4.8_ — _Design: Backfill_
  - [x] 2.2 `package.json`: `db:backfill-birth-md`
    - _Requirements: 4.1_

- [x] 3. Tests (`tests/vimshottari-birth-mahadasha.test.ts`)
  - [x] 3.1 Known charts: 1990 Delhi at birth and at the 1997 Varsha Pravesh, 1975
    Mumbai, 2001 New York
    - _Requirements: 6.1_
  - [x] 3.2 Independent oracle sweep: 27 nakshatras × 7 fractions × 2 births (one
    before 1970), 161 instants each, boundaries within 1 s skipped
    - _Requirements: 6.2_
  - [x] 3.3 Layout invariants for every swept Moon; zero-elapsed full layout; ADs
    dropped before birth; MDs 2–9 unchanged in form
    - _Requirements: 1.3, 1.4, 2.1–2.3, 6.3_
  - [x] 3.4 Backfill: old layout → exact new engine output with MDs 2–9 byte-equal;
    idempotent under JSONB key order; birth MD without PDs filled; unusable trees
    skipped
    - _Requirements: 4.3–4.6, 6.3_
  - [x] 3.5 Run the new tests against the pre-fix engine: 9 of 202 fail (known
    charts, oracle sweep, AD-dropping case, three backfill cases); all pass after
    the fix
    - _Requirements: 6.4_

- [x] 4. Consumer audit
  - [x] 4.1 Read every consumer listed in the design's Consumer Audit; none assumes
    nine ADs/PDs or a lord-led first AD; no code change needed
    - _Requirements: 5.1–5.4_ — _Design: Consumer Audit_

- [x] 5. Documentation and checkpoint
  - [x] 5.1 `docs/HLD.md` §3.5, `docs/ERD.md`, `docs/DFD.md`,
    `skills/backend/pre-analysis.md`, `skills/engine-pipeline.md`,
    `.kiro/skills/engine-pipeline.md`, `Claude.md`, `docs/RELEASE_NOTES.md`
    (Unreleased: first-MD periods change for existing charts; run the backfill)
    - _Requirements: 7_
  - [x] 5.2 This spec (`requirements.md`, `design.md`, `tasks.md`)
  - [x] 5.3 Full Vitest suite (70 files, 1340 tests), ESLint (0 errors; run with
    `--no-eslintrc -c .eslintrc.json` inside a worktree, which otherwise also picks
    up the parent checkout's config) and `tsc --noEmit` pass on Node 20
    - _Requirements: 6.5_
  - [x] 5.4 Measured impact over 2000 random Moon longitudes (design.md, Measured
    Impact)

- [ ] 6. Open items
  - [ ] 6.1 Run `npm run db:backfill-birth-md -- --dry-run`, then without
    `--dry-run`, on each environment (local, Cloud Run, Vercel/Supabase). Not done:
    no database was available to this change
    - _Requirements: 4.1_
  - [ ] 6.2 Commit with a conventional message (`fix:`), excluding unrelated local
    changes
  - [ ] 6.3 Follow-up spec: make the nakshatra index and the elapsed fraction come
    from one division, so a Moon at an exact nakshatra boundary gets the full MD
    (design.md, Known Limitation). This changes `balance_years` for those charts
  - [ ] 6.4 Check the Dasha tab and the Duration Analyser picker in a browser for a
    chart whose Moon is mid-nakshatra (birth MD starts with a non-lord AD). Not done:
    needs a running database and a logged-in session

## Dependency Notes

- Task 1 is the only behaviour change. It changes every date inside the first MD
  below the MD level for almost every chart; the release note says so.
- Task 6.1 must follow the deploy of task 1. Until it runs, stored trees (Dasha tab,
  Duration Analyser, Duration Analysis, MCP tools reading a saved chart) still show
  the old birth-MD periods, while freshly computed trees (`/api/compute`, the analyze
  route, `compute_chart`) show the new ones.
- `engine/compute/varshaphalDashas.ts` (branch `missing-mcp-features`) needs no
  change; once both land, its natal chain inside the first MD is correct.
