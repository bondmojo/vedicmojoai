# Implementation Plan: Varshaphal Dashas (Natal Vimshottari + Tajika Mudda)

## Overview

Adds the natal Vimshottari periods running through the Varsha year and the Tajika
Mudda dasha to the Varshaphal result, tab and MCP tool. Types and the pure module come
first, then the `computeVarshaphal` wiring, then UI/MCP, tests, docs and a full-suite
checkpoint.

Testing conventions for this feature:

- `varshaphalDashas.ts` MUST stay pure: no DB, LLM, network or file I/O.
- Mudda and slice tests use hand-built inputs (no ephemeris), so the rules are pinned
  independently of planetary positions.
- Run the suite on **Node 20** (`.nvmrc`).
- Sub-tasks postfixed with `*` are optional (test-focused).

## Tasks

- [x] 1. Types and pure module
  - [x] 1.1 Add `VarshaNatalAntardasha`, `VarshaNatalPratyantardasha`,
    `VarshaNatalDasha`, `MuddaAntardasha`, `MuddaDashaPeriod`, `MuddaDasha` and
    `VarshaphalResult.dashas` to `engine/compute/types.ts`
    - _Requirements: 3.1_ — _Design: Data Models_
  - [x] 1.2 Create `engine/compute/varshaphalDashas.ts` with
    `sliceNatalVimshottari` and `computeMuddaDasha`
    - _Requirements: 1.1, 1.2, 1.4, 2.1–2.7_ — _Design: Natal Vimshottari Slice, Mudda Dasha_

- [x] 2. Wire into `computeVarshaphal`
  - [x] 2.1 Find the next Varsha Pravesh; build the natal tree with
    `computeVimshottari` from the natal Moon and UTC birth instant; attach `dashas`
    - _Requirements: 1.3, 2.4, 3.1_
  - [x] 2.2 Extend the `method` note
    - _Requirements: 3.2_

- [x] 3. UI and MCP
  - [x] 3.1 `VarshaphalView.tsx`: "Dashas for the Year" section (natal card, Mudda
    card), dates in the birth timezone
    - _Requirements: 4.1, 4.2, 4.3_ — _Design: UI_
  - [x] 3.2 `mcp/src/tools.ts`: `compute_varshaphal` description
    - _Requirements: 3.3_
  - [ ] 3.3 Check the tab in a browser
    - Not done: the local dev server needs a logged-in session and none was available

- [x] 4. Tests
  - [x]* 4.1 `engine/compute/varshaphalDashas.test.ts`: Mudda starting lord vs the
    classical formula, tiling, order, proportions, 360-day table, zero remainder,
    antardashas; natal slice overlap, order, chain, out-of-range
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 4.2 `tests/varshaphal.test.ts`: real-chart Mudda year bounds, yearly advance,
    natal chain at the Varsha Pravesh
    - _Requirements: 5.4_

- [x] 5. Documentation
  - [x] 5.1 `docs/computation_varshaphal.md`, `docs/HLD.md`, `docs/DFD.md`,
    `skills/backend/compute-engine.md`, `skills/backend/api-routes.md`,
    `.kiro/skills/nextjs-project-structure.md`, `Claude.md`, `docs/RELEASE_NOTES.md`
    - _Requirements: 6, 7_

- [x] 6. Checkpoint
  - [x] 6.1 Full Vitest suite, ESLint on changed files and `tsc --noEmit` on Node 20;
    MCP cost guard passes; rebuild `mcp/dist`
    - _Requirements: 5.5, 3.3_

- [ ] 7. Open items
  - [ ] 7.1 Verify the Mudda balance and year-length conventions against a Tajika text
    and a JHora Mudda screen for a known chart
    - _Requirements: 6.1_
  - [ ] 7.2 Patyayini dasha — separate spec
    - _Requirements: 6.2_
