# Implementation Plan: Gochar Range & PD Integration

## Overview

One new deterministic engine module (`engine/compute/gochar.ts`), one new API
route (`POST /api/gochar`), one new MCP tool (`get_gochar`), and two UI
integration points (the Gochar section of `TransitsView`, and PD rows in
`DashaTimeline`). No schema change.

The plan follows the design's dependency order:

engine types/constants → **ephemeris setup + cusp-proximity adaptive scanner**
(the correctness-critical piece — built and proven before anything depends on it)
→ `computeGocharRange()` → minimal natal-context helper → date-bound parser
(`lib/gocharRange.ts`) → API route → MCP tool + cost guard → shared UI
(`GocharRangeTable`, `useGocharRange`) → Transits tab wiring → PD wiring →
manual JHora verification → documentation.

Task 2 is sequenced **before** the fixed-date regression tests in Task 3 and
carries its own fixture-derivation sub-task, because design.md is explicit that a
generic retrograde fixture does not exercise the defect the adaptive stepping
exists to fix — a naive implementation could pass every other engine test and
still silently drop ingress pairs near a station.

**Notation:** requirement references are prefixed `R` (e.g. `R2.10` = Requirement
2.10) to keep them distinct from task numbers, since Task 8 and Requirement 8
would otherwise collide.

Language: TypeScript / Next.js 14 / Vitest, consistent with the rest of the
compute engine. No new runtime dependency is required — the ephemeris, bisection
convention, and Zod validation patterns are all already in the repo.

Run tests single-shot only: `npx vitest run` (never watch mode).

## Tasks

- [ ] 1. Gochar engine types and stable constants (`engine/compute/gochar.ts`)
  - [ ] 1.1 Add `GocharGraha`, `GocharRangeInput`, `GocharOccupancyInterval`,
    `GocharRangeResult`, `NatalGocharContext` exactly as specified in
    design.md's "New module and public contracts"
    - New file `engine/compute/gochar.ts`. Do **not** put these types in
      `engine/compute/types.ts` — that module must stay free of the
      Swiss-Ephemeris-bearing import chain; re-export the public names from
      `engine/compute/index.ts` instead (mirroring how `computeYogas`/`YogaInput`
      are re-exported there today)
    - _Design: Compute Engine — "New module and public contracts"_
    - _Requirements: R1.1, R1.3_
  - [ ] 1.2 Add `DEFAULT_GOCHAR_GRAHAS` (8) and `ALL_GOCHAR_GRAHAS` (9) as
    `readonly` tuples, in the stable output order design.md specifies
    - _Design: Compute Engine — "Graha selection"_
    - _Requirements: R2.5, R7.2_
  - [ ] 1.3 Add `GOCHAR_BODY_IDS` as the single ephemeris-boundary widening
    point from loose `string` planet names to `GocharGraha`
    - Mirror `PLANET_IDS` from `engine/compute/transits.ts`. The ids there are
      **verified** as: Sun=0, Moon=1, Mercury=2, Venus=3, Mars=4, Jupiter=5,
      Saturn=6, Rahu=11. Ketu is **not** listed — it is always derived as
      Rahu + 180°
    - `computeGocharRange()` (Task 3) must iterate this constant, never
      `PLANET_IDS` with a cast
    - _Design: Compute Engine — "Type boundary with `transits.ts`"_
    - _Requirements: R1.2_
  - [ ] 1.4 Write the body-table drift test
    - File: `engine/compute/gochar.bodyIds.test.ts`. Assert `GOCHAR_BODY_IDS`
      entries against the literal id values `transits.ts` uses (listed in 1.3)
      for every `GocharGraha` except `'Ketu'`, and that `'Ketu'` is absent
    - _Design: Testing Strategy — "Body-table drift"_
    - _Requirements: R1.2_

- [ ] 2. Ephemeris setup + cusp-proximity adaptive boundary scanner
  - **This is the correctness-critical task.** Do not let Task 3's fixed-date
    regression tests substitute for it: per design.md an ordinary retrograde
    fixture spans weeks and cannot exercise the defect 2.2 exists to close
  - [ ] 2.1 Establish sidereal ephemeris setup — do this FIRST, before any
    scanning logic
    - Every swisseph entry point in `transits.ts` performs these three steps, and
      the Gochar module MUST do the same:
      ```ts
      ensureEph()                                              // ephemeris path
      swisseph.swe_set_sid_mode(swisseph.SE_SIDM_LAHIRI, 0, 0)  // Lahiri
      const flags = swisseph.SEFLG_SWIEPH
                  | swisseph.SEFLG_SIDEREAL                    // NOT tropical
                  | swisseph.SEFLG_SPEED                       // longitudeSpeed
      ```
    - **Why this is not boilerplate.** Two silent failure modes if omitted:
      1. Without `SEFLG_SIDEREAL` + `SE_SIDM_LAHIRI`, longitudes are **tropical**
         — every sign and house is wrong by roughly the ayanamsa (~24°), while
         every structural test (ordering, coverage, clipping) still passes. This
         would violate R1.2 undetectably.
      2. Without `SEFLG_SPEED`, `longitudeSpeed` is absent/zero, so
         `stepIsSafe()` (2.2) always returns `true`, the adaptive refinement
         **never engages**, and the entire purpose of this task is silently
         defeated with no failing test.
    - `ensureEph()` is currently module-private in `transits.ts`. Either export it
      for reuse or replicate the same guarded path-setup in the Gochar module —
      do not skip it
    - _Design: Resolved Design Decisions — "Ephemeris/model"; Compute Engine —
      "Use the same body IDs and Lahiri sidereal flags as `transits.ts`"_
    - _Requirements: R1.2, R1.5_
  - [ ] 2.2 Write the sidereal-setup assertion test
    - File: `engine/compute/gochar.sidereal.test.ts`. For one fixed JD, assert
      the Gochar module's own longitude reader returns a **sidereal** value —
      i.e. it differs from the tropical longitude for the same body/JD by
      approximately the Lahiri ayanamsa (compare against `getAyanamsa()` with a
      tolerance, do not hardcode ~24°). Also assert the returned record carries a
      non-zero `longitudeSpeed` for a fast body, proving `SEFLG_SPEED` is set
    - This is the guard for both silent failure modes in 2.1 and must exist
      before 2.3 is written
    - _Requirements: R1.2, R1.5_
  - [ ] 2.3 Implement `degreesToNearestCusp()` and `stepIsSafe()`
    - Exactly as given in design.md's "Cusp-proximity refinement" — distance to
      the nearest 30° cusp in `[0, 15]`, and a safety check using the body's
      **instantaneous** `longitudeSpeed` from the same `swe_calc_ut` call that
      produced the longitude (never a hardcoded mean motion)
    - Constants: `MIN_STEP_DAYS = 1/24` (1 hour floor), `CUSP_SAFETY_FACTOR = 2`
    - _Design: Compute Engine — "Cusp-proximity refinement (required for
      correctness)"_
    - _Requirements: R1.5, R2.7, R2.8_
  - [ ] 2.4 Implement the end-bounded, adaptive-step state-change scanner
    - New internal helper distinct from `transits.ts`'s `nextStateChange()`
      (which scans forward unbounded, guarded at 5000 iterations, and cannot be
      reused as-is per design.md)
    - Per body: advance by the base coarse step (Moon 0.25d; Sun/Mars/Mercury/
      Venus 1d; Jupiter/Saturn/Rahu 5d — Ketu shares Rahu's instants and is never
      scanned separately); before accepting "no change" at a step, call
      `stepIsSafe()` and halve the step (down to `MIN_STEP_DAYS`) when unsafe;
      stop and return `end` if no state change is found before the requested end
    - Once a change is bracketed, refine with the existing unmodified
      42-iteration bisection convention
    - _Design: Compute Engine — "Range scan algorithm", "Cusp-proximity
      refinement"_
    - _Requirements: R1.5, R2.6, R2.7, R2.8_
  - [ ] 2.5 Derive and pin cusp-proximity fixture instants
    - Write a throwaway local search (run once; not committed as a script) that
      walks a wide horizon per slow graha (Jupiter, Saturn, Rahu) looking for an
      instant within ~0.5° of a 30° cusp with `|longitudeSpeed|` near zero
    - Pin the discovered UTC instants as named constants in the 2.6 test file,
      with a comment recording how each was found, so the suite stays fast,
      deterministic, and reproducible without re-running ephemeris search at
      test time
    - _Design: Testing Strategy — "Derive the fixture, do not guess a date"_
    - _Requirements: R2.7, R2.8_
  - [ ] 2.6 Write cusp-proximity differential, round-trip, and cost-guard tests
    - File: `engine/compute/gochar.cuspProximity.test.ts`
    - **Differential assertion**: for each pinned window, the adaptive scanner
      SHALL return strictly more intervals than a deliberately naive fixed-step
      scan (same base step, `stepIsSafe()` stubbed to always return `true`) over
      the identical window — proves the refinement does work; a bare
      "coverage is contiguous" assertion would pass even with a dropped pair
    - **Round-trip integrity**: where a dip is found, assert the sign sequence is
      `A → B → A`, the middle interval's duration is under one day, and both
      boundaries are bisection-refined (not coarse-step-aligned)
    - **Cost guard**: assert a range containing no near-cusp station performs no
      more `stateAt()`/ephemeris samples than the naive fixed-step baseline —
      the refinement must not degrade into a whole-range fine scan
    - _Design: Testing Strategy — "Cusp-proximity tests (the correctness-critical
      case)"_
    - _Requirements: R2.7, R2.8, R2.9_

- [ ] 3. `computeGocharRange()` — public entry point
  - [ ] 3.1 Implement input validation and the per-graha scan loop
    - Validate finite natal sign numbers in `1..12`, finite `start`/`end` dates,
      and `start < end`; throw a typed validation error otherwise (the engine is
      not responsible for request-shape validation — that is the API's job)
    - Select `DEFAULT_GOCHAR_GRAHAS` or `ALL_GOCHAR_GRAHAS` per `includeMoon`
    - Per selected graha: resolve the sign at `start`, open the first interval
      there (clipped, never backtracked), run the Task 2 scanner to `end`,
      closing/reopening intervals at each bisection-refined boundary, emit a
      final interval ending exactly at `end`
    - Derive `houseFromMoon`/`houseFromLagna` with the exact whole-sign formula
      from `transits.ts` (`((signNumber - natalX + 12) % 12) + 1`)
    - Sort by the stable graha order (Task 1.2's constant order) then start
      instant; return `GocharRangeResult` with `includedGrahas` and
      `moonIncluded` always populated
    - _Design: Compute Engine — "Range scan algorithm"_
    - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.6, R1.7, R2.5, R2.6, R2.9, R8.1_
  - [ ] 3.2 Re-export `computeGocharRange`, `GocharGraha`,
    `GocharRangeResult`, `GocharOccupancyInterval`, `DEFAULT_GOCHAR_GRAHAS`,
    `ALL_GOCHAR_GRAHAS` from `engine/compute/index.ts`
    - _Design: Compute Engine — "New module and public contracts"_
  - [ ] 3.3 Write fixed-date regression tests
    - File: `engine/compute/gochar.range.test.ts`. For a fixed natal
      Moon/Lagna sign pair and a fixed one-year range: stable graha order,
      requested-range clipping at both ends, first/last interval boundary
      equality with the resolved `Range_Bounds`, and complete non-overlapping
      chronological per-graha coverage of the range for all 8 default grahas
    - Also assert every emitted `start`/`end` string ends in `Z` (UTC), so a
      local-time serialization regression fails loudly (R8.1)
    - _Design: Testing Strategy — "Fixed-date regression tests"_
    - _Requirements: R1.1, R1.7, R2.6, R2.9, R7.1, R8.1_
  - [ ] 3.4 Write Moon opt-in tests
    - Same file as 3.3. `includeMoon: false` returns exactly
      `DEFAULT_GOCHAR_GRAHAS` (8, no `'Moon'` entry); `includeMoon: true` returns
      all 9. Coverage assertions from 3.3 must be re-run per returned graha, not
      against a hardcoded count of 9
    - _Design: Testing Strategy — "Moon tests"_
    - _Requirements: R1.1, R2.5, R7.2_
  - [ ] 3.5 Write whole-sign house arithmetic tests
    - Same file as 3.3, against 2–3 known Moon/Lagna sign combinations, including
      a wrap-around case (e.g. natal sign 11 or 12) to exercise the `% 12`
      modulo correctly
    - _Design: Compute Engine — house formula_
    - _Requirements: R1.4_

- [ ] 4. Minimal natal-context helper (avoid `computeFullChart()`)
  - [ ] 4.1 Implement `resolveNatalGocharContext(input: BirthInput)`
    - Co-locate with the Gochar module or in `engine/compute/planets.ts`, using
      only existing exports: `birthInputToJulianDay()` → `computeAscendant()` →
      `computePlanetPositions()`, exactly as given in design.md. Throw if the
      Moon position is not found
    - Do **not** call `computeFullChart()` anywhere in this feature's request
      path — it additionally computes 13 vargas, shadbala, ashtakavarga, yogas,
      jaimini, bhava bala, and the Sade Sati scans, which is disproportionate
      cost for two sign numbers
    - _Design: API Design — "Minimal natal context (do not call
      computeFullChart())"_
    - _Requirements: R1.6, R5.3_
  - [ ] 4.2 Write the natal-context equivalence test
    - File: `engine/compute/gochar.natalContext.test.ts`. For a fixed birth
      input, assert `resolveNatalGocharContext()` returns the identical two sign
      numbers `computeFullChart()` would (`chart.planets.find(p =>
      p.planet==='Moon').signNumber` and `chart.lagnaSignNumber`) — this is the
      guard that makes skipping the full chart safe. This test is allowed to be
      slower than the rest of the suite since it calls `computeFullChart()` once
    - _Design: Testing Strategy — "Natal-context equivalence"_
    - _Requirements: R1.6_

- [ ] 5. Date-bound parsing and span policy (`lib/gocharRange.ts`)
  - [ ] 5.1 Implement `parseGocharBounds(dateFrom, dateTo)`
    - Bare `YYYY-MM-DD` → that date's `00:00:00.000Z` (dateFrom) / the following
      UTC midnight (dateTo); a full ISO instant (must carry `Z`) is used
      verbatim; mixed bare/full input across the two fields is supported under
      those independent rules; return the normalized echo strings alongside the
      resolved `start`/`end` `Date`s; never apply a timezone offset at any step
    - `start >= end` throws a typed validation error
    - _Design: Compute Engine — "Date-bound parsing and span policy"_
    - _Requirements: R2.1, R2.2, R2.3, R2.4, R2.11, R8.1_
  - [ ] 5.2 Implement `validateGocharSpan(bounds, includeMoon)`
    - Duration-based check (not calendar-year label comparison): throws when the
      resolved `end - start` exceeds 366 days with `includeMoon: true`, or 1096
      days with `includeMoon: false`
    - _Design: Compute Engine — "The limits are duration limits, not
      calendar-year label comparisons"_
    - _Requirements: R2.10_
  - [ ] 5.3 Write date-parser and span-policy unit tests
    - File: `lib/gocharRange.test.ts`. Cover: bare dates, full ISO instants,
      mixed bounds, reversed bounds, malformed input, no-timezone-offset
      application (assert against explicit UTC millis, not
      `Date.prototype.toString()` which is locale/TZ-dependent in Node), and — for
      each `includeMoon` tier — a request at exactly the permitted boundary
      (passes) and one millisecond beyond it (fails)
    - _Design: Testing Strategy — "Date parser tests", "Span tests"_
    - _Requirements: R7.3, R7.4_
  - [ ] 5.4 Write the "span cap never blocks a PD" invariant test
    - Same file as 5.3. Assert a **203-day** span (the longest possible
      Vimshottari PD — Venus–Venus–Venus, `20 × 20/120 × 20/120` years) passes
      `validateGocharSpan()` for `includeMoon: false` **and** `includeMoon: true`
    - Without this, a later tightening of the cap would break PD Gochar (Task 10)
      while leaving the whole suite green — R4.8 is otherwise an unverified claim
    - _Requirements: R4.8_

- [ ] 6. `POST /api/gochar` route
  - [ ] 6.1 Implement the Zod request schema and handler
    - New file `app/api/gochar/route.ts`. `resolveRequestUser(request)` first,
      401 if absent, following the exact convention in
      `app/api/timeline/route.ts`
    - Zod schema: `dateFrom: string`, `dateTo: string`, `includeMoon:
      z.boolean().optional().default(false)`, plus an object-level
      `.refine()` requiring exactly one of `unifiedChartId` (uuid) /
      `birthData`. Return 400 with `error.flatten().fieldErrors` on failure,
      matching the existing route convention
    - For `unifiedChartId`: `prisma.unifiedChart.findUnique` selecting only
      `moonLongitude`/`lagnaLongitude`/`userId`; 404 if missing or
      `userId !== callerId`; derive signs via `Math.floor(longitude/30)+1`
    - For `birthData`: call `resolveNatalGocharContext()` (Task 4.1); 400 (not
      500) if it throws
    - Call `parseGocharBounds()` + `validateGocharSpan()` (Task 5); 400 on
      either throwing
    - Call `computeGocharRange()` (Task 3) with the resolved context; wrap in
      try/catch and return 500 only for an unexpected ephemeris failure
    - Response: `GocharRangeResult` fields plus `dateFrom`, `dateTo` (normalized
      echo) and `ayanamsa: 'Lahiri'`, exactly matching `GocharApiResponse`
    - No `prisma.unifiedChart.update`, no pipeline-run creation, no
      `waitUntil()`/SSE — the route is synchronous and read-only end to end
    - _Design: API Design — "POST /api/gochar"_
    - _Requirements: R5.1, R5.2, R5.3, R5.4, R5.5, R5.6, R5.7, R5.8, R8.1_
  - [ ] 6.2 Write route tests
    - File: `tests/gochar-api.test.ts`, mirroring the mocking conventions in
      `tests/mcp-auth.test.ts` / `tests/mcp-token-routes.test.ts`. Cover:
      missing auth (401); malformed JSON (400); neither/both chart sources
      (400); unowned/nonexistent `unifiedChartId` (404); reversed/malformed
      dates (400); same-day request (valid, non-empty result); both span-cap
      tiers at the boundary and one unit beyond (400); `includeMoon` omitted
      defaults to 8 grahas; response always carries `includedGrahas` +
      `moonIncluded`; no `prisma...update`/`create` call occurs for any request
      in this suite
    - _Design: Testing Strategy — "Route tests"_
    - _Requirements: R7.4_

- [ ] 7. MCP `get_gochar` tool
  - [ ] 7.1 Register the tool in `mcp/src/tools.ts`
    - Add beside `get_transits`/`get_dasha_tree`. Input:
      `{ chartId?, birthData?, dateFrom, dateTo, includeMoon? }` following the
      existing chart-reference convention used by the other extractor tools in
      this file; reject an absent or dual chart reference before forwarding
    - Map `chartId` → `unifiedChartId`; POST to the **literal** string
      `'/api/gochar'` only. This is not stylistic: `tests/mcp-cost-guard.test.ts`
      statically scans for `api.post('<literal>')` and separately asserts every
      call site's first argument starts with a quote/backtick — a variable or
      concatenated path would be invisible to the guard and fail the
      literal-path test
    - Preserve `birthData` unchanged; return the API's JSON body via the existing
      `ok()`/`guard()` helpers — no transformation, no LLM call
    - Tool description SHALL state explicitly: (a) instants are UTC; (b) the
      Moon is excluded unless `includeMoon: true`; (c) `includedGrahas` in the
      response is authoritative for what was computed — so an absent Moon is
      never narrated as "did not change house"
    - _Design: MCP Design_
    - _Requirements: R6.1, R6.2, R6.3, R6.4, R6.6, R8.4_
  - [ ] 7.2 Add `/api/gochar` to `ALLOWED_POST_ROUTES` in
    `tests/mcp-cost-guard.test.ts`
    - One-line addition to the existing `Set` in that file — the same pattern
      the `marriage-matchmaking` and `user-management` specs used for their own
      additions. Do not modify any other guard logic in that file
    - _Design: MCP Design — "Add /api/gochar to ALLOWED_POST_ROUTES"_
    - _Requirements: R6.5_
  - [ ] 7.3 Write MCP tool tests
    - File: **`tests/mcp-gochar.test.ts`** — not `mcp/src/`. Every existing MCP
      test lives in `tests/` (`mcp-auth`, `mcp-token-routes`, `mcp-cost-guard`);
      `mcp/` is a separate package with its own `package.json`, `node_modules`,
      and `tsconfig.json`, and the root `vitest.config.ts`'s `@` alias resolves
      to the repo root, which `mcp/src` does not use
    - Cover: tool registration/schema shape; request forwarding with `chartId`
      mapped to `unifiedChartId`; `birthData` passed through unchanged;
      `includeMoon` omitted forwards as omitted (the API applies the default, not
      the tool); rejection when both/neither chart reference is supplied
    - Re-run `npx vitest run tests/mcp-cost-guard.test.ts` after 7.1/7.2 and
      confirm it still passes with no modification beyond 7.2's one line
    - _Design: Testing Strategy — "MCP tool tests"_
    - _Requirements: R7.6_

- [ ] 8. Shared UI: `GocharRangeTable` and `useGocharRange`
  - [ ] 8.1 Implement `GocharRangeTable` (`app/components/GocharRangeTable.tsx`)
    - Props: `GocharRangeResult` (or the API response shape) plus an optional
      label. Groups `intervals` by `planet` in the array's own stable order (no
      re-sorting); columns Graha / From (UTC) / To (UTC) / Sign / H/Moon /
      H/Lagna, using the existing overflow-x table pattern and semantic
      `<table>`/`<th scope="col">` markup already used by `GrahasTable.tsx`
    - UTC formatter includes `HH:mm` (never date-only), per design.md's
      "Sub-day intervals must remain legible" — use the `Intl.DateTimeFormat`
      snippet from design.md with `timeZone: 'UTC'`, never
      `toLocaleDateString()` without it
    - Render `includedGrahas` (and whether the Moon was included) above the
      table, so an MCP-initiated or PD-triggered omission is visible, not just
      inferable from row absence
    - _Design: UI Design — "Shared types and rendering"_
    - _Requirements: R3.5, R3.6, R8.1, R8.2_
  - [ ] 8.2 Implement `useGocharRange` (`app/components/useGocharRange.ts`)
    - Discriminated `GocharRequestSource` union
      (`{ kind: 'saved'; unifiedChartId }` | `{ kind: 'unsaved'; birthData }`)
      exactly as in design.md — never a `birthData`-only shape. Maps the union
      onto the API's mutually-exclusive fields
    - `request()` POSTs to `/api/gochar`; discard a response if a newer request
      (tracked by a monotonically increasing id, not arrival order) has since
      been issued; on failure, preserve the caller's last dates/`includeMoon`
      rather than clearing them
    - Response cache keyed on `source + dateFrom + dateTo + includeMoon` in a
      component-lifetime `Map`; a cache hit resolves synchronously and SHALL
      NOT set `loading: true`
    - _Design: UI Design — "Shared types and rendering" (hook + cache)_
    - _Requirements: R3.7, R4.6_
  - [ ] 8.3 Write component tests for `GocharRangeTable` and `useGocharRange`
    - Follow the existing "call the component directly as a function, inspect
      the returned element tree" pattern from `GrahasTable.test.tsx` /
      `YogasView.test.tsx` — no `@testing-library/react`, no new dependency
    - Cover: UTC labelling present at the point of display; a sub-day interval
      renders visibly distinct `From`/`To` values; `includedGrahas` rendered;
      hook default Moon-excluded state; failed request preserves prior
      dates/`includeMoon`; a superseded in-flight request's response is
      discarded; a cache hit does not toggle `loading`
    - _Design: Testing Strategy — "Component tests"_
    - _Requirements: R7.5_

- [ ] 9. Transits tab: Gochar range form
  - [ ] 9.1 Add the range form to `TransitsView`'s existing `gochar` section
    - Below the current current-position table (which remains the section's
      default view, unchanged). Native `dateFrom`/`dateTo` date inputs; an
      unchecked-by-default `includeMoon` checkbox; a submit action disabled while
      `loading`
    - The `includeMoon` label SHALL state **both** span tiers — enabling it
      increases row count substantially and lowers the maximum span from
      3 years to 1 year. Stating only the one-year figure leaves a user unable to
      explain why a previously-accepted 2-year range now fails
    - Success renders `GocharRangeTable`; failure renders a `role="status"`
      message without clearing the form's current date/checkbox state (reuse
      `useGocharRange`'s failure-preservation from Task 8.2, don't re-implement
      it here)
    - THE UI states the data is Lahiri sidereal Gochar (near the existing
      "Sidereal Lahiri" text already in this section)
    - _Design: UI Design — "Transits tab"_
    - _Requirements: R3.1, R3.2, R3.3, R3.4, R3.5, R3.6, R3.7, R3.8_
  - [ ] 9.2 Wire chart context into `TransitsView` from `app/page.tsx`
    - `TransitsView` currently receives `data` and `birthDate`; extend its props
      to also receive a `GocharRequestSource`
    - **Use `{ kind: 'unsaved', birthData }` built from the CURRENT form state.**
      Do **not** pass `loadedChartId` as `{ kind: 'saved' }` from this page:
      `loadedChartId` remains set while the user edits the form (the page renders
      an "Editing a saved chart — Save Chart will update it" banner for exactly
      this state), so a `saved` source would compute natal context from the
      **stored** chart while the screen shows **edited** data — a silent
      wrong-chart result. If a `saved` source is ever wanted here, it must be
      gated on the form being unmodified since load/save
    - The existing static `result.chart.transits`-driven current-position
      display, Sade Sati panel, and Moon/Ascendant transit sections are unchanged
    - _Design: UI Design — "Update app/page.tsx to pass the current computed
      form's birthData into TransitsView"_
    - _Requirements: R3.1_
  - [ ] 9.3 Write UI tests for the Transits tab range form
    - New `app/components/TransitsView.gochar.test.tsx` using the same
      direct-function-call pattern. Cover: default unchecked Moon state;
      loading-disabled submit; error state retains prior selection; the
      `includeMoon` label mentions both span tiers; narrow-viewport table remains
      via the existing overflow-x pattern (assert the wrapper class, not layout)
    - _Design: Testing Strategy — "Component tests"_
    - _Requirements: R7.5_

- [ ] 10. Vimshottari PD Gochar
  - [ ] 10.1 Convert PD rows to focusable controls with a `View Gochar` action
    - In `DashaTimeline.tsx`, the PD row is currently a plain `<div>` (inside the
      `ad.pratyantardashas.map((pd, k) => ...)` block). Replace its wrapper with
      a `<button type="button">` (or equivalent focusable control) carrying the
      existing `{md.lord}-{ad.lord}-{pd.lord}` label plus a clearly labelled
      `View Gochar` action, matching the accessibility bar already set by the
      MD/AD buttons in this file
    - _Design: UI Design — "Vimshottari PD rows"_
    - _Requirements: R4.1_
  - [ ] 10.2 Add PD Gochar expansion state and exact-instant request wiring
    - `DashaTimeline` accepts the same `GocharRequestSource` context as
      `TransitsView` (Task 9.2, same stale-context caveat applies) via a new prop
    - One `selectedPD` state (identified by `[mdIndex, adIndex, pdIndex]`) plus
      one `useGocharRange` instance, mirroring the existing single-expansion
      pattern already used for `expandedMD`/`expandedAD` in this file
    - Selecting `View Gochar` calls `request()` with the PD's **exact** `pd.start`
      /`pd.end` ISO strings (never truncated to calendar dates — this is why
      R2.1 allows full-instant `dateFrom`/`dateTo`) and `includeMoon: false`; the
      expansion renders the MD–AD–PD label, the exact UTC range requested, an
      `includeMoon` opt-in checkbox local to that PD, and `GocharRangeTable` on
      success
    - Selecting a different PD's action clears the previous result and opens
      only the new one; selecting the same PD's action again closes it
    - A failed PD request shows an accessible error with a retry action, without
      losing the selected PD
    - _Design: UI Design — "Vimshottari PD rows"_
    - _Requirements: R4.2, R4.3, R4.4, R4.5, R4.6, R4.7_
  - [ ] 10.3 Write `DashaTimeline` PD-Gochar tests
    - Cover: PD row is a real focusable control; selecting it forwards the PD's
      exact ISO `start`/`end` (not a date-truncated version) to the request
      function; opening a second PD closes the first; a failed PD request
      surfaces retry without deselecting; the PD's `includeMoon` checkbox
      defaults unchecked independent of the Transits-tab form's own checkbox
      state
    - _Design: Testing Strategy — "PD action-to-date-range wiring"_
    - _Requirements: R7.5_

- [ ] 11. Manual JHora/PVR verification (pre-release gate)
  - [ ] 11.1 Compare a fixed Gochar range against Jagannatha Hora reference
    output
    - Pick one fixed natal chart and one fixed date range covering at least one
      ingress per default graha. Convert the JHora local-time ingress display to
      UTC **before** comparing (per R8.3 — a local-midnight ingress can
      legitimately land on an adjacent calendar date in JHora's display). Record
      the fixture inputs, the JHora local-time readings, the UTC conversion, and
      the Gochar output side by side in the PR description or a spec note
    - This is a practitioner sign-off gate, not an automated test — do not skip
      it even though Tasks 1–10 are independently verifiable by the suite
    - _Design: Testing Strategy — "Manual practitioner acceptance"_
    - _Requirements: R7.7_

- [ ] 12. Documentation sync
  - [ ] 12.1 Update `docs/computation_transits_sadesati.md`
    - Add the range-scan algorithm summary (including the cusp-proximity
      refinement and why a fixed step is insufficient), the Moon opt-in default
      and rationale, the two-tier span cap, and the UTC-vs-JHora-local-time
      disclosure note from R8.3
    - _Requirements: R7.8, R8.3_
  - [ ] 12.2 Update `Agents.md`, `Claude.md`, `docs/HLD.md`, `docs/DFD.md`,
    `docs/ERD.md`, the MCP README, and the relevant backend/frontend skill
    guides
    - `docs/ERD.md`: note explicitly that no schema change occurred — Gochar
      reads existing `moonLongitude`/`lagnaLongitude` scalars only
    - MCP README: list `get_gochar` alongside the other deterministic range tool
      (`get_timeline_periods`), not beside the paid-pipeline tools
    - Per this workspace's own `Agents.md` documentation-maintenance rule, these
      updates land in **this feature's own change**, not a follow-up
    - _Requirements: R7.8_
