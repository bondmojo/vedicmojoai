# Implementation Plan: Deterministic Named-Yoga Engine (F1)

## Overview

This plan builds the pure named-yoga engine (`engine/compute/yogas.ts`), wires it into
chart computation + storage, feeds it to the Duration-Analysis slicer/scorer and Wave 2A,
and exposes it over MCP — per the approved design. Tasks are dependency-ordered: types and
the pure engine land first (usable standalone), then compute/storage integration, then the
slicer/scorer refactor, then Wave 2A + MCP exposure, then docs and a final full-suite
checkpoint.

Testing conventions for this feature:

- The Yoga_Engine MUST remain **pure and never-throwing**: no LLM/network/DB/file I/O; a
  detector hitting missing/malformed input emits nothing rather than throwing; identical
  inputs produce identical output.
- Detectors consume the `RelationshipGeometry` tables and `dignity.ts` labels; they MUST NOT
  re-derive conjunctions/aspects/exchanges/dignity.
- Sub-tasks postfixed with `*` are optional (test-focused) and can be skipped for a faster
  MVP; the end-to-end Mojo fixture (task 8) and slicer non-regression (task 6) are NOT
  optional — Requirements 7.2 and 5.1 mandate them.

## Tasks

- [ ] 1. Yoga types and module skeleton
  - [ ] 1.1 Add `YogaCategory`, `YogaStrength`, `YogaEvidence`, `Yoga` to
    `engine/compute/types.ts`; add `yogas: Yoga[]` to `ComputedChart`; re-export the new
    types from `engine/compute/index.ts`
    - _Requirements: 3.1, 3.5_ — _Design: Data Models_
  - [ ] 1.2 Create `engine/compute/yogas.ts` with the `YogaInput` interface, an empty
    `YOGA_REGISTRY` array, and `computeYogas(input): Yoga[]` that runs the registry, swallows
    per-detector errors, and sorts output by `(category, key, planets.join())`
    - _Requirements: 1.1, 1.2, 1.3_ — _Design: `computeYogas` input contract; Error Handling_
  - [ ] 1.3 Extract the shared `ownedHousesOf(planet, houseLordsD1)` helper (planet → houses
    it lords) used by the lord-based detectors
    - _Requirements: 1.4_ — _Design: Detector Specifications (shared helpers)_

- [ ] 2. Placement / dignity detectors (no house-lord dependency)
  - [ ] 2.1 `detectPanchaMahapurusha` — own/exalted + kendra-from-lagna → Ruchaka/Bhadra/
    Hamsa/Malavya/Sasa; combust participant downgrades strength; record dignity + house in evidence
    - File: `engine/compute/yogas.ts`
    - _Requirements: 2.1, 3.1, 3.3_ — _Design: Detector 1_
  - [ ] 2.2 `detectGajaKesari` — Jupiter in kendra from Moon; `fromLagna` variant noted in evidence
    - _Requirements: 2.2_ — _Design: Detector 2_
  - [ ] 2.3 `detectLunarYogas` — Sunapha/Anapha/Durudhara from Moon; Kemadruma when none & no co-tenant
    - _Requirements: 2.7_ — _Design: Detector 7_
  - [ ] 2.4 `detectBudhaAditya` — Sun+Mercury same sign (from `conjunctions`); Mercury combustion in evidence
    - _Requirements: 2.8, 3.3_ — _Design: Detector 8_
  - [ ]* 2.5 Unit tests (positive + negative) for detectors 2.1–2.4 with hand-built fixtures
    - _Requirements: 7.1_

- [ ] 3. Lord-based detectors (require `houseLordsD1`)
  - [ ] 3.1 `detectRajaYoga` — kendra-lord ↔ trikona-lord via conjunction / mutual graha aspect /
    parivartana; emit distinct `key: raja.dka` for the 9th-lord + 10th-lord case (F5); linkage +
    ownedHouses in evidence
    - _Requirements: 2.3_ — _Design: Detector 3; Dependency Map (F5)_
  - [ ] 3.2 `detectDhanaYoga` — association among lords of {2,5,9,11}+lagna (F4 part)
    - _Requirements: 2.4_ — _Design: Detector 4_
  - [ ] 3.3 `detectViparitaYoga` — 6/8/12 lord in 6/8/12 → Harsha/Sarala/Vimala (F4 part)
    - _Requirements: 2.5_ — _Design: Detector 5_
  - [ ] 3.4 `detectParivartana` — project `mutualReception` entries by `exchange_type`
    - _Requirements: 2.9_ — _Design: Detector 9_
  - [ ]* 3.5 Unit tests (positive + negative) for detectors 3.1–3.4
    - _Requirements: 7.1_

- [ ] 4. Remaining detectors
  - [ ] 4.1 `detectNeechabhanga` — lift the debilitation/cancellation tables and rule from
    `slicer.ts` (`DEBIL_SIGN_LORD`, `EXALT_PLANET_IN_DEBIL_SIGN`, kendra-from-lagna-or-Moon) into
    the engine as the single source of truth
    - _Requirements: 2.6, 5.1_ — _Design: Detector 6_
  - [ ] 4.2 `detectKartari` — Papa/Shubha hemming of lagna/house via `isNaturalBenefic`
    - _Requirements: 2.10_ — _Design: Detector 10_
  - [ ] 4.3 Register all detectors in `YOGA_REGISTRY`; set `benefic` per design table
    - _Requirements: 2, 3.1_ — _Design: Detector Specifications (benefic field)_
  - [ ]* 4.4 Unit tests for 4.1–4.2; determinism test (identical input → deep-equal, twice);
    degradation tests (drop each input table → affected detector empty, no throw)
    - _Requirements: 1.2, 1.3, 7.1, 7.3_

- [ ] 5. Compute pipeline + persistence
  - [ ] 5.1 Call `computeYogas` in `computeFullChart` after `relationships`; attach `yogas`
    - File: `engine/compute/index.ts`
    - _Requirements: 4.1_ — _Design: Integration → Compute + storage_
  - [ ] 5.2 Add `yogas Json?` to `UnifiedChart` (Prisma schema + migration)
    - File: `prisma/schema.prisma`
    - _Requirements: 4.2_
  - [ ] 5.3 Write `computed.yogas` in the compute-path mapper; leave `null` on paste path
    - File: `lib/unified-chart-create.ts`
    - _Requirements: 4.2, 4.3_

- [ ] 6. Duration-Analysis slicer/scorer consumption
  - [ ] 6.1 Refactor `computeActivatedYogas` to filter the chart-wide catalogue by the running
    MD/AD lord (via `activatingPlanets`/`planets`), preserving the string shape consumed by
    `factorActivatedYogas` and the Neechabhanga match in `factorLordDignity`; retain the
    pair-scoped derivation as the paste-path fallback
    - File: `engine/durationAnalysis/slicer.ts`
    - _Requirements: 5.1, 5.2_ — _Design: Integration → Slicer + scorer_
  - [ ] 6.2 Re-verify existing Duration-Analysis fixtures; if `activatedYogas` outputs change
    materially, bump `WEIGHTS_VERSION` and re-baseline affected backtests
    - Files: `engine/durationAnalysis/scoringWeights.ts`, `__fixtures__/*`
    - _Requirements: 5.3_
  - [ ]* 6.3 Slicer test: a period whose MD/AD lord participates in a catalogue yoga surfaces it;
    paste-path (no catalogue) falls back without throwing
    - _Requirements: 5.1, 5.2_

- [ ] 7. wave1_delta + Wave 2A + MCP exposure
  - [ ] 7.1 Include the yoga catalogue in the compute-path `wave1Delta`
    - File: `app/api/unified-charts/[id]/analyze/route.ts`
    - _Requirements: 4.4_
  - [ ] 7.2 Update `wave2_2a_yogas.md`: when a deterministic `yogas` catalogue is supplied, treat
    it as the single source of truth (validate/interpret, do not re-derive formation)
    - File: `prompts/agents/wave2_2a_yogas.md`
    - _Requirements: 4.4_
  - [ ] 7.3 Expose the stored catalogue over an HTTP route and add `get_yogas` to the MCP server
    (thin wrapper, `extractOrGuide` for paste charts, no paid-route calls)
    - Files: MCP-serving route, `mcp/src/tools.ts`
    - _Requirements: 6.1, 6.2_
  - [ ]* 7.4 MCP cost-guard test still passes (no POST to `/analyze` or `/duration-analysis`)
    - _Requirements: 6.1_

- [ ] 8. End-to-end validation + documentation
  - [ ] 8.1 End-to-end fixture: `computeFullChart` on the "Mojo" Taurus-lagna chart asserts
    expected named yogas incl. a Viparita/Harsha candidate and Budha-Aditya + combust-Venus evidence
    - _Requirements: 7.2_
  - [ ] 8.2 Update docs in the same change: `docs/ERD.md`, `docs/HLD.md`,
    `.kiro/skills/backend/compute-engine.md` + `engine-pipeline.md`, `Agents.md`, `Claude.md`;
    extend the `deterministic-1c-1d` cross-reference
    - _Requirements: 8.1, 8.2_
  - [ ] 8.3 Checkpoint — run the full type-check + test suite; confirm purity/never-throw and
    determinism hold end to end
    - _Requirements: 1.1, 1.2, 1.3_

## Dependency Notes

- Tasks 1–4 deliver a standalone, tested pure engine with **no** downstream coupling — mergeable
  on their own.
- Task 5 makes the catalogue exist on charts; task 6 is the only behavior-affecting change to the
  scorer and is gated by fixture re-verification.
- F3/F4/F5 are **follow-up specs** that consume this catalogue; they are out of scope here but
  unblocked once tasks 1–5 land (Viparita/Dhana detectors → F4, `raja.dka` label → F5, and a
  Grahan detector + combustion read → F3).
```
