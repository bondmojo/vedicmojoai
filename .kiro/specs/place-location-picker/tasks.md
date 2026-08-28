# Implementation Plan: Place Location Picker

## Overview

Dependency-ordered. The data layer lands first and is verifiable on its own (a loaded table
you can query in `prisma studio`), then the search API, then the picker component, then the
two form call sites, then persistence, then docs.

Conventions for this feature:

- **`chartHash` must not change.** Task 6.1's regression test is the guard; it is not
  optional.
- **New `useState` calls in `ComputePage` go after the `activeTab` declaration.**
  `app/page.test.tsx` identifies `activeTab` by `useState` call index (the 6th); inserting
  state above it breaks the suite silently.
- **`location` in the source NDJSON is `[longitude, latitude]`** — longitude first. Getting
  this backwards is a silent ~100 km error that still produces a plausible chart. The
  Bengaluru fixture in task 2.6 (`12.9767936, 77.590082`) exists to catch it.
- Prisma for all queries; raw SQL only inside the migration.
- Sub-tasks marked `*` are test-focused and may be deferred for a faster MVP. Tasks 2.6,
  3.5 and 6.1 are **not** optional — they guard coordinate orientation, ranking, and hash
  stability respectively.

Measured ground truth for this feature, established in task 1 by replaying all 348,845
source rows through the shipped `lib/places-normalize.ts` (cross-checked against an
independent pass). Task 2.5 asserts these exactly rather than with a tolerance:

- usable **272,499** = city 545 / town 4,148 / village 171,406 / hamlet 96,400
- `--kinds city,town,village` = **176,099**
- skips: `noName` 75,435 · `noDistrict` 899 · `junkName` 11 (all literal `---`) ·
  `noState` 1 · `badLocation` 0

## Tasks

- [x] 1. Place reference data: schema, migration, normalization
  - [x] 1.1 Add the `Place` model to `prisma/schema.prisma` per the design (BigInt `osmId`,
    `Decimal(9,7)`/`Decimal(10,7)` coordinates, `kindRank`, `@@unique([osmType, osmId])`,
    indexes on `state`/`district`/`kindRank`, `@@map("place")`, no `userId`, no `User`
    relation)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_ — _Design: Data Model_
  - [x] 1.2 Generate the migration with
    `npx prisma migrate dev --create-only --name add_place_table`, then hand-prepend
    `CREATE EXTENSION IF NOT EXISTS pg_trgm` ahead of the `text_pattern_ops` btree and
    `gin_trgm_ops` GIN indexes on `"nameNorm"`, and apply
    - File: `prisma/migrations/20260827061403_add_place_table/migration.sql`
    - _Requirements: 1.6_ — _Design: The two name indexes_
    - Both name indexes are required: measured 19 ms seq scan (GIN only) vs 0.35 ms index
      scan (btree) for a prefix matching 1 of 40k rows. Column is `"nameNorm"` — this
      repo's Prisma fields carry no `@map`, so columns are camelCase. Explicit `map:`
      names needed or both indexes auto-name to `place_nameNorm_idx` and validation fails.
  - [x] 1.3 Create `lib/places-normalize.ts` — `normalizePlaceName` (NFD + combining-mark
    strip, lowercase, punctuation → space, collapse whitespace), `isJunkPlaceName`,
    `resolvePlaceName` (name → hamlet → village → town → city → municipality),
    `toPlaceKind`, `KIND_RANK`
    - _Requirements: 2.3, 2.4_ — _Design: Normalization_
  - [x] 1.4 Confirm `Place` is **not** added to the `DELETE /api/unified-charts/[id]`
    cascade transaction (`app/api/unified-charts/[id]/route.ts:167-232`) — assert by
    inspection, no code change expected
    - _Requirements: 1.7_
    - Verified: cascade is durationMessage → durationAnalysis → pipelineRun →
      compatibilityMatch → unifiedChart. No `place`, and no FK exists to require one.
  - [x] 1.5 `lib/places-normalize.test.ts` — case/diacritic/whitespace normalization; the
    real `---` junk sample; that `§U rural` is NOT junk; `resolvePlaceName` fallback chain
    + null case; idempotence
    - _Requirements: 10.2_
    - 24 tests passing, including 3 `fast-check` properties (idempotence, no
      leading/trailing/doubled spaces, `isJunkPlaceName` agrees with `normalizePlaceName`).

- [x] 2. Ingestion script
  - [x] 2.1 Create `scripts/load-places.ts`: `--dir` (default `process.env.PLACES_DATA_DIR`),
    `--kinds` (default all four), `--truncate` (explicit opt-in). Stream each file with
    `readline` over `createReadStream`; never `readFile`
    - _Requirements: 2.1, 2.2, 2.6_ — _Design: Ingestion Design_
  - [x] 2.2 Implement the row filter and mapping: skip on junk name / missing `state` /
    missing both `state_district` and `county` / malformed `location`; assert
    `-90 ≤ location[1] ≤ 90` and `-180 ≤ location[0] ≤ 180`; map
    `latitude = location[1]`, `longitude = location[0]`
    - _Requirements: 2.3, 2.4_ — _Design: Ingestion Design (lon-first warning)_
  - [x] 2.3 Batch `createMany({ data, skipDuplicates: true })` every 5,000 rows; print a
    per-file summary of `read / loaded / skipped{junkName, noState, noDistrict,
    badLocation, parseError}`
    - _Requirements: 2.5_ — _Design: Error Handling_
  - [x] 2.4 Add `"db:load-places": "npx tsx scripts/load-places.ts"` to `package.json`;
    add `PLACES_DATA_DIR` to `.env.example`
    - _Requirements: 2.1, 2.6_
  - [x] 2.5 Run the loader against `~/Documents/Mohit/in` and verify the counts against the
    design table (272,499 exact; 545 / 4,148 / 171,406 / 96,400 by kind)
    - _Requirements: 2.7_ — _Design: Ingestion Design (expected results table)_
  - [x] 2.6 `tests/places-loader.test.ts` — Bengaluru fixture pins
    `(12.9767936, 77.590082)` proving lat/long orientation; each skip reason; loading the
    same fixture twice yields an unchanged row count
    - _Requirements: 10.5_

- [x] 3. Search API
  - [x] 3.1 Create `app/api/places/route.ts` with `GET`: `resolveRequestUser` → 401;
    Zod-validate `q` / `limit` (1-50, default 20) / `includeHamlets` (default false) → 400
    with `details`
    - _Requirements: 3.1, 3.2_ — _Design: Search Design_
  - [x] 3.2 Parse `q` into `nameToken` + `narrowTokens` (split `/[,\s]+/`, normalize the
    name token). Return `{ results: [], reason: 'query_too_short' }` with **no DB call**
    when `nameToken.length < 3`
    - _Requirements: 3.3, 3.4_ — _Design: Query parsing_
  - [x] 3.3 Build the `narrowing` clause (AND of ORs over `state` / `district` / `county`
    with `contains` + `mode: 'insensitive'`) and the `kindWhere` hamlet exclusion
    - _Requirements: 3.4, 3.7_ — _Design: Query parsing_
  - [x] 3.4 Implement the two-stage retrieval: `startsWith` stage (no `mode:
    'insensitive'` — that would defeat the `text_pattern_ops` index), then a `contains`
    stage excluding stage-1 ids; over-fetch `limit * 3`
    - _Requirements: 3.5, 3.10_ — _Design: Two-stage ranked retrieval_
  - [x] 3.5 Merge into exact → prefix → substring tiers, dedupe on
    `(nameNorm, county, district, state)` keeping the lowest `kindRank`, derive
    `truncated` from the over-fetch (no `COUNT` query), slice to `limit`
    - _Requirements: 3.5, 3.6, 3.8_ — _Design: Two-stage ranked retrieval_
  - [x] 3.6 Serialize the response: `Decimal.toNumber()` for both coordinates, build
    `label` as `"<name>, <county ?? district>, <state>"`, include `truncated` and
    `hamletsExcluded`
    - _Requirements: 3.9, 3.7_ — _Design: Response_
  - [x] 3.7 Verify end-to-end against the loaded table: `q=rampur` returns the town/city
    Rampurs before the village Rampurs with `truncated: true`; `q=rampur shimla` returns
    exactly the Himachal row
    - _Requirements: 3.4, 3.5_ — _Design: Worked example_
  - [x] 3.8 `tests/places-api.test.ts` per the design's testing table, following the
    `vi.mock('@/lib/auth')` + `vi.mock('@/lib/db')` pattern of `tests/gochar-api.test.ts`
    - _Requirements: 10.1_

- [x] 4. PlacePicker component
  - [x] 4.1 Create `app/components/PlacePicker.tsx` on `Popover` + `Command` with
    **`shouldFilter={false}`**; props `{ value, onSelect, onManualEntry, disabled? }`;
    internal state only, no chart state
    - _Requirements: 4.1, 4.2, 4.11_ — _Design: Component Design_
  - [x] 4.2 Implement the fetch discipline: 250 ms debounce, `AbortController` cancelling
    the previous request on every query change, `AbortError` swallowed silently
    - _Requirements: 4.4, 4.5_ — _Design: Fetch discipline_
  - [x] 4.3 Render the result row: name as primary text, `[county, district,
    state].filter(Boolean).join(' · ')` as muted secondary text, `kind` as a `Badge`
    - _Requirements: 4.3_ — _Design: Result row_
  - [x] 4.4 Implement every dropdown state from the design table: below-threshold hint,
    spinner row with `aria-live="polite"`, error state, empty state with the
    **"enter coordinates manually"** action, `truncated` footer, `hamletsExcluded` footer
    toggle
    - _Requirements: 4.6, 4.7, 4.8, 4.9_ — _Design: Dropdown states_
  - [x] 4.5 Wire the hamlet toggle: re-issue the current search with
    `includeHamlets=true`, persist the choice in `localStorage` under a namespaced key,
    seed initial state from it
    - _Requirements: 6.2, 6.3, 6.4, 6.5_ — _Design: Hamlet Toggle_
  - [x] 4.6 Accessibility pass: `role="combobox"` on the trigger, keyboard nav via cmdk
    defaults, `kind` conveyed as text not colour
    - _Requirements: 4.10_
  - [x] 4.7 `app/components/PlacePicker.test.tsx` in the existing structural no-jsdom style
    - _Requirements: 10.3_

- [x] 5. Home page integration
  - [x] 5.1 Extend `ComputeForm` in `app/page.tsx` with `placeId: string | null` and
    `placeLabel: string`; update the initial state and `handleLoadChart`'s `loadedForm`.
    Leave `birthInputFromForm` unchanged
    - _Requirements: 5.1_ — _Design: Home Page Integration_
  - [x] 5.2 Replace the Latitude/Longitude grid cells: `PlacePicker` in the first, the
    read-only coordinate readout plus the "Enter coordinates manually" disclosure in the
    second. Keep `md:grid-cols-3`. **Any new `useState` goes after `activeTab`**
    - _Requirements: 5.3, 5.4_ — _Design: Home Page Integration_
  - [x] 5.3 Implement the transition table: selection sets coordinates + `timezone='5.5'`;
    manual coordinate edits clear `placeId`/`placeLabel`; validation requires either a
    selected place or both coordinates
    - _Requirements: 5.2, 5.4, 5.5_ — _Design: Home Page Integration (transitions)_
  - [x] 5.4 Confirm a place selection registers as a birth-data change for the save-gating
    flags (`birthDataDirty`) added by the companion UI work
    - _Requirements: 5.6_
  - [x] 5.5 Run `npm test` and confirm `app/page.test.tsx` still passes; if the `useState`
    index shifted, fix the stub rather than reordering product code
    - _Requirements: 10.6_ — _Design: Home Page Integration_

- [x] 6. Persistence
  - [x] 6.1 Add `BirthPlace` to `lib/chart-mapper.ts`, add the optional 4th `place`
    argument to `mapComputedToUnified`, set `birthInput: { ...chart.input, place }`, and
    **leave `computeChartHash`'s input set untouched**. Add
    `tests/chart-hash-place-stability.test.ts` asserting the hash is identical with and
    without `place`
    - _Requirements: 7.1, 7.2, 7.3, 10.4_ — _Design: Threading `place` without touching the engine_
  - [x] 6.2 Add optional Zod-validated `place` to `ComputeInputSchema` in
    `app/api/unified-charts/from-compute/route.ts`; add `place?: BirthPlace` to
    `BirthDataInput` in `lib/unified-chart-create.ts` and forward it to the mapper
    - _Requirements: 7.4_
  - [x] 6.3 Send `place` from `handleSaveChart` and `handleRunAnalysis` in `app/page.tsx`
    when `placeId` is set
    - _Requirements: 7.1, 7.4_
  - [x] 6.4 Restore the place in `handleLoadChart` from `birthInput.place`; when absent,
    open with Manual_Coords populated and visible and no error
    - _Requirements: 7.5, 9.1_
  - [x] 6.5 Fix `lib/chart-mapper.ts:345`: `birth_place: birthInput?.place?.label ??
    undefined` (currently `birthInput?.name`, i.e. the client's name)
    - _Requirements: 7.6_ — _Design: The `birth_place` fix_
  - [x] 6.6 Verify `engine/compute/types.ts`'s `BirthInput` was **not** modified
    - _Requirements: 7.3_

- [x] 7. Second call site and shared shape
  - [x] 7.1 Adopt `PlacePicker` in the `ComputeForm` component of
    `app/unified-charts/page.tsx:124-283`, keeping its surrounding Tailwind styling
    - _Requirements: 8.1_
  - [x] 7.2 Update the re-declared `ComputeForm` interface in
    `app/components/VarshaphalView.tsx:22-30` and its consumption in
    `app/components/CopyForAIPanel.tsx`; both must work with `placeId === null`
    - _Requirements: 8.2_
  - [x] 7.3 Confirm `POST /api/compute` and `POST /api/compute/varshaphal` are unchanged
    - _Requirements: 8.3_

- [x] 8. Backward-compatibility verification
  - [x] 8.1 Load a chart saved before this feature: it loads, recomputes, and saves with no
    error and no place label
    - _Requirements: 9.1_
  - [x] 8.2 Confirm a paste-sourced chart is unaffected (still rejected by `handleLoadChart`
    with the existing message)
    - _Requirements: 9.2_
  - [x] 8.3 Confirm picker-derived and hand-typed identical coordinates produce the same
    `chartHash` and still deduplicate
    - _Requirements: 9.3_
  - [x] 8.4 With an empty `place` table, confirm the picker shows the empty state with the
    manual escape hatch and chart computation still works
    - _Requirements: 9.4_

- [x] 9. Documentation (same change, per `Agents.md`)
  - [x] 9.1 `docs/ERD.md` — `Place` model, indexes, no `User` relation, absent from the
    delete cascade
    - _Requirements: 11.1_
  - [x] 9.2 `docs/HLD.md` — `GET /api/places`, `PlacePicker`, `scripts/load-places.ts`
    - _Requirements: 11.2_
  - [x] 9.3 `docs/DFD.md` — place resolution → coordinates → compute flow
    - _Requirements: 11.3_
  - [x] 9.4 `.kiro/skills/database-prisma.md` — `pg_trgm` requirement, `Place` as unowned
    reference data
    - _Requirements: 11.4_
  - [x] 9.5 `.kiro/skills/nextjs-project-structure.md` — `PLACES_DATA_DIR`; dataset
    deliberately not in `outputFileTracingIncludes`
    - _Requirements: 11.5_
  - [x] 9.6 `Claude.md` brief update; `README.md` + `.env.example` document the one-off
    `npm run db:load-places` step
    - _Requirements: 11.6, 11.7_

- [x] 10. Final checkpoint
  - [x] 10.1 `npm run lint` and `npm test` clean
  - [x] 10.2 `npx tsc --noEmit` clean (catches the `ComputeForm` shape change across all
    four coupled files)
  - [x] 10.3 Manual pass: search "alandi" (3-char threshold, two-line rows), "rampur"
    (kind ranking + truncation hint), "rampur shimla" (narrowing), a hamlet name with the
    toggle off then on, empty-result escape hatch, select → compute → save → reload →
    place label restored

## Deferred to follow-ups

- Searching `other_names` / `old_name` so "Bangalore" finds Bengaluru and regional-script
  names match (Design → Open Risks #3 — the most likely source of "search is broken"
  feedback)
- OSM/ODbL attribution placement (Design → Open Risks #1 — needs a product decision)
- Reverse-geocoding a place label onto charts saved before this feature
- Non-India place coverage
