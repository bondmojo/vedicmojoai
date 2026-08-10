# Implementation Plan: Marriage Matchmaking (Kundli Milan / Guna Milan)

## Overview

This plan builds the pure Ashtakoota + Mangal Dosha engine
(`engine/compute/matchmaking.ts`, backed by the new
`engine/compute/matchmakingTables.ts` reference data), persists results as
`CompatibilityMatch`, fixes the pre-existing chart-delete FK-cascade gap this
feature would otherwise regress, serves the result over `/api/matchmaking` +
a stateless `/preview`, renders it at `/matchmaking`, and exposes a
non-persisting `compute_match` MCP tool — per the approved design. Tasks are
dependency-ordered: static tables and types land first (no behavior depends on
them yet), then the pure engine (usable and fully testable standalone, since
the koota input space is finite and needs no birth data), then Prisma +ownership
plumbing, then the delete-cascade regression fix (must land before or with the
API routes, never after), then API/UI/MCP surfaces, then Wave 2-G gender
wiring, then the oracle harness and exhaustive verification, then docs.

Testing conventions for this feature:

- The engine (`matchmaking.ts` + `matchmakingTables.ts`) MUST remain **pure and
  never-throwing**: no ephemeris/LLM/network/DB/file I/O; a koota or dosha
  check hitting missing/malformed input reports `status: 'unavailable'` rather
  than throwing; identical inputs produce byte-for-byte identical output.
- **Half-points are load-bearing, not a rounding nuisance.** `points` and
  `gunaScore` are `number` (never an integer type); Vashya, Graha Maitri, and
  Tara all yield `.5` values. No koota calculator, no aggregation step, no
  route serializer, and no `Decimal` column read/write in this feature may
  round, floor, or truncate a fractional value at any point in the pipeline.
  Task 8.4 exists specifically to catch a regression here.
- **Role-awareness is structural, not conventional.** `computeAshtakootaMatch`
  takes explicit `bride`/`groom`-named parameters (never `a`/`b`), and
  `CompatibilityMatch` stores `brideChartId`/`groomChartId` (never a generic
  pair + role enum). No task in this plan may introduce an inferred role
  (e.g. from argument order, from list position, or from `UnifiedChart.gender`
  — gender only pre-fills the UI picker per task 4.2).
- **Paste-source charts get a full 8-koota `gunaScore`.** `UnifiedChart.moonLongitude`
  is a required scalar on both ingestion paths, so nothing in tasks 3–7 may
  gate koota scoring on `source === 'compute'`. Only Mangal Dosha (needs
  `planets` JSONB) degrades to `unavailable` on a paste chart — never silently
  reported as `matched`.
- **PyJHora is an external oracle only.** Task 9's harness runs it locally,
  outside this repository, to generate expected values for the test fixtures
  in task 7. It is never imported, vendored, committed, or deployed; nothing
  under `engine/`, `mcp/`, or `tests/` may import from a PyJHora path.
- Sub-tasks postfixed with `*` are optional (test-focused) and can be skipped
  for a faster MVP; task 5 (delete-cascade fix), task 7.1–7.2 (exhaustive koota
  sweep + role-awareness), task 7.6 (delete-cascade test), and task 7.7
  (ownership 404 tests) are **NOT optional** — Requirements 13, 10.3, 10.4,
  10.5, and 6.2 mandate them, and task 5 fixes a concrete regression this
  feature would otherwise introduce into an existing, shipped delete path.

## Tasks

- [ ] 1. Static koota reference tables (`engine/compute/matchmakingTables.ts`)
  - [ ] 1.1 Per-nakshatra attribute table (27 entries): `gana`
    (Deva/Manushya/Rakshasa), `yoni` (animal + fixed gender), `nadi`
    (Aadi/Madhya/Antya), keyed by nakshatra number 1–27 — a provenance comment
    naming the classical/secondary source transcribed from (never PyJHora's
    Python literals, per Requirement 12.5)
    - _Requirements: 12.1, 12.5_ — _Design: Data Models (matchmakingTables.ts)_
  - [ ] 1.2 Per-rashi attribute table (12 entries): `varna`
    (Brahmin/Kshatriya/Vaishya/Shudra) and `vashya`
    (Manav/Vanachar/Chatushpad/Jalachar/Keet), keyed by rashi number 1–12,
    same provenance-comment convention
    - _Requirements: 12.1, 12.5_ — _Design: Data Models (matchmakingTables.ts)_
  - [ ] 1.3 Pairwise scoring matrices: Varna compatibility (directional, max 1),
    Vashya compatibility (max 2, with its 0.5 cases), Tara remainder→points
    (max 3, 1.5 per direction), Yoni 14×14 five-tier friendship/enmity matrix
    (max 4, including the 0-point bitter-enemy tier), Graha Maitri
    friendship→points (max 5, with its 0.5 cases, keyed off
    `dignity.ts`'s `PERMANENT_FRIENDSHIP` grades — not re-deriving friendship),
    Gana compatibility (max 6, directionality flagged pending oracle
    verification in task 9)
    - _Requirements: 12.1, 12.2, 12.4_ — _Design: Koota Specifications table_
  - [ ] 1.4 Bhakoot rashi-distance rule (2-12/5-9/6-8 → 0, else 7) and Nadi
    same/different rule (0 / 8) as small pure functions or lookup tables
    co-located in the same module (kept explicit, not folded into 1.3, since
    both are all-or-nothing rather than matrix lookups)
    - _Requirements: 2.7, 2.8_ — _Design: Koota Specifications table_
  - [ ] 1.5* Completeness tests (Requirement 12.3): all 27 nakshatra entries
    present with non-empty `gana`/`yoni`/`nadi`; all 12 rashi entries present
    with non-empty `varna`/`vashya`; the Yoni matrix covers all 14×14 cells;
    the 8 koota maxima (1,2,3,4,5,6,7,8) sum to exactly 36 — a hand-transcription
    typo fails loudly here rather than silently scoring wrong
    - _Requirements: 12.3_

- [ ] 2. Matchmaking types
  - [ ] 2.1 Add `MatchRole`, `KootaKey`, `KootaScore`, `AshtakootaResult`,
    `MangalDoshaNative`, `MatchResult`, `Cancellation`, `KootaEvidence`,
    `BoundaryRisk`, `MatchVerdict` to `engine/compute/types.ts` — `points` and
    `gunaScore` typed `number` (fractional), never an integer type
    - _Requirements: 5.4, 2.9_ — _Design: Data Models (New types)_
  - [ ] 2.2 Re-export the new types from `engine/compute/index.ts` alongside
    the other domain result types
    - _Requirements: 5.4_ — _Design: Data Models_
  - [ ] 2.3 Define and export the `MATCHMAKING_TABLES_VERSION` constant that
    task 4.3 stamps onto every `MatchResult` and task 6.1 persists — bumped
    whenever a koota table changes, so a stored snapshot records which tables
    produced it (the `WEIGHTS_VERSION` precedent). Without this, 4.3 has
    nothing to stamp.
    - _Requirements: 5.1_ — _Design: Versioning_

- [ ] 3. Pure engine — Ashtakoota (`engine/compute/matchmaking.ts`)
  - [ ] 3.1 `longitudeToNakshatraPadaRashi(longitude)` helper — pure, derives
    `(nakshatraNumber, padaNumber, rashiNumber)` from a Moon sidereal
    longitude, reusing `nakshatras.ts` nakshatra-index derivation (not
    re-implementing it); pada resolves the straddled rashi (Krittika pada 1 →
    Aries, padas 2–4 → Taurus)
    - _Requirements: 1c, 1.4_ — _Design: Input Contracts_
  - [ ] 3.2 `scoreVarna(bride, groom)` — directional: 1 point when groom's
    Varna rank ≥ bride's, else 0
    - _Requirements: 2.1, 1.3_ — _Design: Koota Specifications #1_
  - [ ] 3.3 `scoreVashya(bride, groom)` — via the Vashya matrix (task 1.3),
    0.5-step values preserved exactly
    - _Requirements: 2.2_ — _Design: Koota Specifications #2_
  - [ ] 3.4 `scoreTara(bride, groom)` — count bride→groom and groom→bride Moon
    nakshatra distance mod 9; remainder 3/5/7 inauspicious; 1.5 points per
    favorable direction; both directional counts + remainders recorded in
    evidence
    - _Requirements: 2.3_ — _Design: Koota Specifications #3_
  - [ ] 3.5 `scoreYoni(bride, groom)` — five-tier lookup (same 4 / friendly 3 /
    neutral 2 / enemy 1 / bitter-enemy 0) via the 14×14 matrix
    - _Requirements: 2.4_ — _Design: Koota Specifications #4_
  - [ ] 3.6 `scoreGrahaMaitri(bride, groom)` — naisargika-only, reads
    `dignity.ts`'s exported `PERMANENT_FRIENDSHIP` between the two Moon-rashi
    lords; explicitly does NOT call `getVargaDignityLabel` (that blends in
    tatkalika friendship, the wrong relation for this koota) — call out this
    exclusion in a code comment, not just the evidence
    - _Requirements: 2.5_ — _Design: Koota Specifications #5; "Explicitly NOT used"_
  - [ ] 3.7 `scoreGana(bride, groom)` — via the Gana matrix (task 1.3);
    directionality applied per the table pinned in task 9 (may need
    revisiting once oracle results land — flag in evidence which direction
    was checked)
    - _Requirements: 2.6, 1.3_ — _Design: Koota Specifications #6_
  - [ ] 3.8 `scoreBhakoot(bride, groom)` — rashi-distance rule (task 1.4);
    wires in `detectBhakootCancellation` (task 3.11)
    - _Requirements: 2.7_ — _Design: Koota Specifications #7_
  - [ ] 3.9 `scoreNadi(bride, groom)` — same/different Nadi rule (task 1.4);
    wires in `detectNadiCancellation` (task 3.11)
    - _Requirements: 2.8_ — _Design: Koota Specifications #8_
  - [ ] 3.10 `computeAshtakootaMatch(bride, groom): AshtakootaResult` — runs
    the 8 scorers in fixed order, sums to `gunaScore` (fractional, never
    rounded), derives `verdict` from the score-band table (`<18` / `18–24` /
    `24–32` / `32–36`, with a code comment stating the bands are
    almanac/commercial-software convention, NOT PVR — NFR-8), computes
    per-native `boundaryRisk` (task 3.12), and assembles `limitations`
    (Requirement 5.5 boilerplate text); wraps the koota loop so one
    unexpected scorer error is contained and the rest still run, mirroring
    `yogas.ts`'s per-detector guard
    - _Requirements: 1.1, 1.2, 1.5, 2.9, 5.1, 5.2, 5.5_ — _Design: Input Contracts (computeAshtakootaMatch); Error Handling_
  - [ ] 3.11 Cancellation (Bhanga) registry — `detectNadiCancellation` and
    `detectBhakootCancellation` as named, individually testable detector
    functions returning a `Cancellation` (rule name + satisfying condition)
    recorded in the koota's `evidence`, never applied silently — mirrors
    `yogas.ts`'s `Neechabhanga` evidence pattern; which variants ship is
    decided from the oracle sweep in task 9, not from prose
    - _Requirements: 4.1, 4.2, 4.3_ — _Design: Cancellation registry_
  - [ ] 3.12 `computeBoundaryRisk(moonLongitude)` — per-native distance in
    degrees to the nearest nakshatra boundary and a `boundaryRisk` flag at the
    exported, tunable **1.0°** threshold constant; pure arithmetic on
    `moonLongitude`, no new astronomical computation
    - _Requirements: 14.1, 14.2, 14.4_ — _Design: OD-12_

- [ ] 4. Pure engine — Mangal Dosha + composition
  - [ ] 4.1 `computeMangalDosha(input: MangalNativeInput): MangalDoshaNative` —
    Mars house-from check for lagna/Moon/Venus per houses 1/2/4/7/8/12,
    recording `marsHouseFrom` for all three reference points and
    `triggeredFrom` listing which fired; implements exactly the rule in
    `prompts/domains/marriage.md` (Mars in 1/2/4/7/8/12 from lagna/Moon/Venus,
    cancelled by own/exalted sign, benefic aspect, or matching dosha in
    partner) — any deviation from that file SHALL be applied to the file in
    the same change
    - _Requirements: 3.0, 3.1_ — _Design: Mangal Dosha Design_
  - [ ] 4.2 `detectMangalCancellation` — own/exaltation dignity check via
    `dignity.ts` (`OWN_SIGNS`/`EXALTATION_SIGNS`) and benefic-aspect check via
    `relationships.aspects` (never re-derived, per NFR-2); records which
    condition fired
    - _Requirements: 3.2, 4.1, 4.2_ — _Design: Mangal Dosha Design_
  - [ ] 4.3 `computeMatch(bride, groom): MatchResult` — composes
    `computeAshtakootaMatch` + `computeMangalDosha` per native, derives the
    pairwise `mangalDoshaCompatibility` verdict (`matched` when both/neither
    Manglik post-cancellation, `mismatched` when only one uncancelled,
    `cancelled` when a per-native Bhanga fired, `unavailable` when either
    native's `mangal` input is absent — never reported as `matched`), and
    stamps `tablesVersion`; Mangal Dosha reported as a field beside
    `gunaScore`, never folded into the 36-point total
    - _Requirements: 1.5, 3.3, 3.4, 5.1, 5.3_ — _Design: Input Contracts (computeMatch); Mangal Dosha Design_
  - [ ]* 4.4 Determinism test — identical `(bride, groom)` input twice →
    deep-equal output; degradation tests — drop `mangal` from one native →
    `mangalDoshaCompatibility === 'unavailable'` and all 8 kootas still score;
    drop a koota's required attribute → that koota `status: 'unavailable'`,
    remaining 7 still score, no throw
    - _Requirements: 1.2, 1.5_

- [ ] 5. Chart-delete cascade fix (regression prevention, NOT optional)

  > **Build order within this pair:** task 6.1–6.3 (schema + migration + `prisma
  > generate`) MUST be applied *before* 5.1 is written — `prisma.compatibilityMatch`
  > does not exist on the generated client until then, so 5.1 will not type-check
  > on its own. The two tasks are numbered 5-then-6 because the *regression* is the
  > reason the schema change is constrained, but the *edit* order is 6 → 5.

  - [ ] 5.1 Update `DELETE /api/unified-charts/[id]` — add
    `prisma.compatibilityMatch.deleteMany({ where: { OR: [{ brideChartId: params.id }, { groomChartId: params.id }] } })`
    to the existing `$transaction` array in
    `app/api/unified-charts/[id]/route.ts`, **before** the `unifiedChart.delete`
    call and in the same FK-order comment block already documenting
    "Cascade isn't automatic with Prisma"
    - File: `app/api/unified-charts/[id]/route.ts`
    - _Requirements: 13.1, 13.2, 13.3(a)_ — _Design: Chart deletion (Requirement 13)_
  - [ ] 5.2 This task MUST land in the same PR as task 6 (the Prisma model) —
    a `CompatibilityMatch` FK relation without this fix reintroduces exactly
    the FK-violation-as-500 regression Requirement 13's Rationale describes;
    do not merge task 6 alone
    - _Requirements: 13_

- [ ] 6. Prisma — `CompatibilityMatch` model + `UnifiedChart.gender`
  - [ ] 6.1 Add `CompatibilityMatch` model per design.md's schema
    (`id`, `userId`→`User`, `brideChartId`/`groomChartId`→`UnifiedChart` via
    two named relations `MatchBride`/`MatchGroom`, `label String?`,
    `gunaScore Decimal @db.Decimal(4,1)`, `result Json`, `tablesVersion
    String`, `createdAt @db.Timestamptz`), `@@index([userId])`,
    `@@index([brideChartId])`, `@@index([groomChartId])`,
    `@@map("compatibility_match")` — following `.kiro/skills/database-prisma.md`
    conventions
    - File: `prisma/schema.prisma`
    - _Requirements: 6.1, 6.1a_ — _Design: Prisma — CompatibilityMatch_
  - [ ] 6.2 Add `UnifiedChart.gender String?` (nullable, additive-only — no
    tightening step, gender is genuinely optional) and the reverse relations
    (`matchesAsBride`/`matchesAsGroom` or equivalent) on `UnifiedChart`
    - File: `prisma/schema.prisma`
    - _Requirements: OD-6 (design.md Resolved Decisions)_ — _Design: Prisma — UnifiedChart.gender_
  - [ ] 6.3 Generate and apply the migration (`npm run db:migrate`); confirm it
    is purely additive (new table + new nullable column, no data loss)
    - _Requirements: 6.1_
  - [ ] 6.4 Idempotent backfill script populating `UnifiedChart.gender` from
    `chartInputV1.meta.gender` where present, rows without it left `null`, in
    the spirit of `prisma/backfill-owner.ts`; add an `npm run db:backfill-gender`
    script entry
    - File: `prisma/backfill-gender.ts`
    - _Requirements: OD-6_ — _Design: Prisma — UnifiedChart.gender (Backfill)_

- [ ] 7. Unit + integration tests
  - [ ] 7.1 Exhaustive koota sweep (Requirement 10.3) — compare
    `computeAshtakootaMatch` output across the 27×4×27×4 = 11,664
    `(nakshatra, pada, role)` combination space, or a deterministic documented
    sample if runtime demands, against the oracle fixture generated in task 9;
    assert every divergence is either fixed or recorded in
    `docs/computation_matchmaking.md`'s KNOWN DIVERGENCE table (task 9.3)
    before this test is considered green
    - _Requirements: 10.3, 10.3a_
  - [ ] 7.2 Role-awareness tests (Requirement 1.3/10.4) — (a) swapping both
    charts *and* roles is byte-for-byte a no-op; (b) swapping charts *without*
    swapping roles changes the Varna point when the two Varna ranks differ
    (and is asserted to change it, not asserted away); (c) each symmetric
    koota (Yoni, Graha Maitri, Bhakoot, Nadi, Vashya, and Tara's summed total)
    individually asserted symmetric under a same-role swap
    - _Requirements: 1.3, 10.4_
  - [ ] 7.3 Per-koota unit tests — one positive (full points) and one
    boundary/zero case per koota using hand-built `(nakshatra, pada)`
    fixtures, including Yoni's five tiers (the 0-point bitter-enemy tier
    specifically) and the 0.5-step cases in Vashya and Graha Maitri
    - _Requirements: 10.1_
  - [ ] 7.4 Half-point integrity test — assert a known pair yields a
    fractional `gunaScore` (e.g. `27.5`) and that the value survives
    unchanged through `computeMatch` → API response JSON → `Decimal(4,1)`
    round-trip (write task 8's route/DB layer first, or stub it, so this test
    has something to round-trip through)
    - _Requirements: 2.9_
  - [ ] 7.5 Mangal Dosha tests — all three reference points (lagna/Moon/Venus)
    independently trigger detection; at least one documented cancellation
    case per Requirement 4 fires and is recorded in evidence;
    `compatibility === 'unavailable'` (never `'matched'`) when `planets` is
    absent for either native; second chart fixture sourced as synthetic or
    already-public data, not client data (Requirement 10.3b) — reuse the
    "Mojo" chart convention from `yogas.mojo.test.ts` if suitable, or add one
    new synthetic fixture under `engine/compute/__fixtures__/`
    - _Requirements: 10.2, 3.1, 3.2, 3.3_
  - [ ] 7.6 Delete-cascade test (NOT optional) — deleting a chart that
    participates in a `CompatibilityMatch` succeeds (not 500) and leaves no
    orphaned `CompatibilityMatch` rows; asserted separately for the bride-side
    FK and the groom-side FK
    - _Requirements: 13.4_
  - [ ] 7.7 Ownership tests (NOT optional) — `POST /api/matchmaking`,
    `POST /api/matchmaking/preview`, and `GET /api/matchmaking/[id]` each
    return 404 (never 403, never 200 with leaked data) when *either*
    `chartAId`/`chartBId` belongs to a different user
    - _Requirements: 10.5, 6.2_
  - [ ]* 7.8 Role-field validation test — `POST /api/matchmaking` missing
    `brideChartId` or `groomChartId` returns a field-level 400, never silently
    defaults or infers a role from argument order (task 8.1's structural
    encoding is what makes this a plain required-field check)
    - _Requirements: 6.1b_

- [ ] 8. API routes
  - [ ] 8.1 `POST /api/matchmaking` — Zod-validate
    **`{brideChartId, groomChartId, label?}`**. Roles are carried by the *field
    names*, matching the structural choice in design.md §Data Models — there is
    no separate `roles` object. This supersedes Requirement 7.1's
    `{chartAId, chartBId, roles}` shape, which predates that decision and would
    reintroduce exactly the order-confusion the structural encoding exists to
    prevent. It also makes 6.1b free: a role cannot be "absent" when the field
    name *is* the role, so Zod's ordinary required-field error covers it with no
    bespoke validation. Then: `resolveRequestUser`; verify both charts owned by the caller (404 on
    either mismatch); derive each native's `MatchNativeInput` via
    `longitudeToNakshatraPadaRashi(chart.moonLongitude)` plus role; derive
    `MangalNativeInput` from `chart.planets`/lagna/`relationships.aspects`
    when `source === 'compute'`, omit (→ `unavailable`) otherwise; call
    `computeMatch`; persist a `CompatibilityMatch` row (`gunaScore` written as
    the exact `Decimal(4,1)`, never rounded); return the created record
    - File: `app/api/matchmaking/route.ts`
    - _Requirements: 7.1, 6.2, 6.1a, 6.1b_ — _Design: Integration Design → API routes_
  - [ ] 8.2 `POST /api/matchmaking/preview` — identical to 8.1 minus the
    `CompatibilityMatch` write; this is the only matchmaking route the MCP
    tool (task 10) is permitted to call
    - File: `app/api/matchmaking/preview/route.ts`
    - _Requirements: 9.1a(a)_ — _Design: Integration Design → API routes; OD-10_
  - [ ] 8.3 `GET /api/matchmaking` — lists the caller's saved matches,
    `WHERE userId = <resolved>`, ordered newest-first, summary fields only
    (id, label, gunaScore, verdict, chart names, createdAt) to keep the list
    payload light
    - File: `app/api/matchmaking/route.ts`
    - _Requirements: 7.2, 6.4_ — _Design: Integration Design → API routes_
  - [ ] 8.4 `GET /api/matchmaking/[id]` — ownership-checked (404 on mismatch),
    returns full `MatchResult` from the persisted `result` JSON (never
    recomputed, per OD-5); when a referenced chart no longer exists (should
    not occur post-task-5, but defensive), still renders the persisted
    `result` without throwing
    - File: `app/api/matchmaking/[id]/route.ts`
    - _Requirements: 7.2, 6.2, 13.5 (defensive only — OD-9 cascade is primary)_ — _Design: Integration Design → API routes_
  - [ ] 8.5 `DELETE /api/matchmaking/[id]` — ownership-checked identically to
    `UnifiedChart` delete
    - File: `app/api/matchmaking/[id]/route.ts`
    - _Requirements: 7.3_ — _Design: Integration Design → API routes_
  - [ ] 8.6 Update `tests/mcp-cost-guard.test.ts`'s `ALLOWED_POST_ROUTES` to
    add `/api/matchmaking/preview` **only** — `/api/matchmaking` (the
    persisting route) SHALL NOT be added, since it is never called from
    `mcp/src/*` — made explicitly in this feature's own change, called out in
    the PR description per the `user-management` 8.7 precedent
    - File: `tests/mcp-cost-guard.test.ts`
    - _Requirements: 7.4, 9.1b_ — _Design: Testing Strategy → Cost guard_

- [ ] 9. Oracle verification harness (dev-only, external, AGPL-safe)
  - [ ] 9.1 A dev-only script (outside `engine/`, `mcp/`, and any deployed
    path — e.g. `scripts/oracle/` or documented as a local-only, gitignored
    tool) that runs PyJHora's `Ashtakoota` class locally to emit expected
    `(gunaScore, per-koota points)` for a documented sample (or the full
    11,664-row space) of `(nakshatra, pada, nakshatra, pada)` combinations;
    PyJHora itself is never added as a dependency, imported, vendored, or
    committed to this repository
    - _Requirements: 10.3c, 12.5_ — _Design: Testing Strategy → Oracle harness; OD-13_
  - [ ] 9.2 Transcribe a documented sample of the oracle's output into a
    committed test fixture (used by task 7.1) — the fixture SHALL be
    hand-curated/documented values, not a raw copy of PyJHora's generated CSV,
    absent the explicit sign-off Open Decision 13 calls for
    - _Requirements: 10.3c_ — _Design: Testing Strategy → Oracle harness_
  - [ ] 9.3 Use the oracle run to settle the two variant questions flagged in
    Requirement 12.4/1.3: Varna/Gana directionality and the Graha Maitri point
    gradations — freeze `matchmakingTables.ts` (task 1.3/3.7) once settled,
    and record any residual divergence in `docs/computation_matchmaking.md`'s
    KNOWN DIVERGENCE table (authored in task 12.3)
    - _Requirements: 12.4, 1.3, 10.3a_

- [ ] 10. MCP exposure
  - [ ] 10.1 Add `compute_match` to `mcp/src/tools.ts` — accepts two chart
    identifiers plus their bride/groom roles, resolves each via the same
    ownership pattern `get_client_chart`/`list_clients` use, and POSTs only to
    `/api/matchmaking/preview` (never `/api/matchmaking`) — the persisting
    route stays unreachable from MCP, preserving the "MCP reads, the app
    writes" posture (OD-10)
    - File: `mcp/src/tools.ts`
    - _Requirements: 9.1, 9.1a_ — _Design: Integration Design → MCP_
  - [ ] 10.2 Unowned/unknown chart handling uses the existing `extractOrGuide`
    convention — standard not-found guidance, never a stack trace or an
    ownership-revealing error
    - File: `mcp/src/tools.ts`
    - _Requirements: 9.2_ — _Design: Integration Design → MCP_
  - [ ]* 10.3 MCP cost-guard test (task 8.6) still passes with `compute_match`
    added — no POST to `/analyze`, `/duration-analysis`, or
    `/api/matchmaking` (only `/api/matchmaking/preview`)
    - _Requirements: 9.1b, 7.4_

- [ ] 11. UI (`app/matchmaking/`)
  - [ ] 11.1 Picker page — two chart selectors sourced from the caller's own
    saved `UnifiedChart` list (reusing the existing chart-picker pattern from
    `unified-charts`), an explicit, required bride/groom role assignment per
    chart (pre-filled from `UnifiedChart.gender` when set, never inferred
    silently), an optional label field, a non-blocking warning when both
    selectors reference the same chart, and submit → `POST /api/matchmaking`
    - File: `app/matchmaking/page.tsx` (or `new/page.tsx`)
    - _Requirements: 8.1_ — _Design: Integration Design → UI_
  - [ ] 11.2 Result view — `gunaScore`/36 with its band shown as guidance (not
    a verdict of record); 8-koota breakdown table (name, points/max, one-line
    evidence); per-native Mangal Dosha status with `triggeredFrom` and any
    cancellation reason; combined `mangalDoshaCompatibility` surfaced as a
    flagged caveat when `mismatched`, independent of a favorable `gunaScore`
    band; explicit "Ashtakoota / North Indian Guna Milan" label, never a
    generic "compatibility score"; renders `limitations` inline, not behind a
    tooltip; renders boundary-risk and paste-ayanamsa cautions inline when set
    - File: `app/matchmaking/[id]/page.tsx`
    - _Requirements: 8.2, 3.4, 5.5, 14.2, 14.3_ — _Design: Integration Design → UI_
  - [ ] 11.3 List view — the practitioner's previously saved matches with
    quick access to each result
    - File: `app/matchmaking/page.tsx`
    - _Requirements: 8.3_ — _Design: Integration Design → UI_
  - [ ] 11.4 Add "Marriage Matchmaking" to primary navigation alongside the
    other four practitioner-facing features
    - _Requirements: 8.4_ — _Design: Integration Design → UI_

- [ ] 12. Wave 2-G gender wiring
  - [ ] 12.1 In `lib/chart-mapper.ts`'s `buildChartInputV1FromUnified`
    (compute path), prefer the passed-through `UnifiedChart.gender` column
    when set, falling back to any existing `chartInputV1.meta.gender`, and
    only then to the current default — write the resolved value into the
    synthesized `ChartInputV1.meta.gender` so `buildChartSummary`
    (`engine/chartSummary.ts:39`) and `{{gender}}` in
    `prompts/agents/wave2_2g_marriage.md` see it without their own changes
    - File: `lib/chart-mapper.ts`
    - _Requirements: OD-6_ — _Design: Prisma — UnifiedChart.gender (Wave 2-G wiring)_
  - [ ] 12.2 Confirm `lib/validation.ts:383-386`'s `W2` warning still fires
    when gender falls through to the default even after 12.1 — the default
    is preserved as a last resort, only its priority changes
    - File: `lib/validation.ts`
    - _Requirements: OD-6_
  - [ ]* 12.3 Test: a compute-path chart with `UnifiedChart.gender = 'female'`
    and no `chartInputV1.meta.gender` produces a synthesized `ChartInputV1`
    with `meta.gender === 'female'`, and karaka assignment in 2G reflects it
    - _Requirements: OD-6_

- [ ] 13. Documentation
  - [ ] 13.1 `docs/ERD.md` — new `CompatibilityMatch` model, new
    `UnifiedChart.gender` column
    - _Requirements: 11.1, 6.5_
  - [ ] 13.2 `docs/HLD.md` (new routes, new `/matchmaking` page, new compute
    module), `docs/DFD.md` (new process + data flow for two-chart matching),
    `.kiro/skills/nextjs-project-structure.md`, `.kiro/skills/database-prisma.md`
    - _Requirements: 11.1_
  - [ ] 13.3 New `docs/computation_matchmaking.md`, in the style of
    `docs/computation_chara_dasha.md` — each koota's rule and point table with
    its pinned source; the directional kootas (Requirement 1.3) and how they
    were settled (task 9.3); the Mangal Dosha rule and its link to
    `prompts/domains/marriage.md`; the JHora comparison including a KNOWN
    DIVERGENCE table (Requirement 10.3a); the South Indian Porutham system's
    absence recorded as a known v1 gap; and the explicit statement that the
    36-point system and its score bands are almanac/commercial-software
    convention, not PVR (NFR-8)
    - File: `docs/computation_matchmaking.md`
    - _Requirements: 11.3, NFR-8_
  - [ ] 13.4 `mcp/README.md` — document `compute_match` alongside the existing
    `get_*` tools, noting explicitly that it wraps `/api/matchmaking/preview`
    and persists nothing
    - _Requirements: 11.2, 9.3_
  - [ ] 13.5 `Claude.md` — add Marriage Matchmaking as the fifth
    practitioner-facing feature (the "Four practitioner-facing features"
    section becomes five), matching the level of detail given to Varshaphal
    - _Requirements: 11.1_

- [ ] 14. Final checkpoint
  - [ ] 14.1 Run the full type-check + test suite (`npm run lint`,
    `npx vitest run`); confirm purity/never-throw and determinism hold
    end-to-end for `matchmaking.ts`
    - _Requirements: 1.1, 1.2, NFR-1_
  - [ ] 14.2 Confirm `tests/mcp-cost-guard.test.ts` passes with only
    `/api/matchmaking/preview` in the allow-list
    - _Requirements: NFR-5_
  - [ ] 14.3 Manual smoke pass: compute a match for two paste-source charts
    (full 8-koota score, Mangal Dosha `unavailable`) and two compute-source
    charts (full score + full Mangal Dosha), confirming NFR-6 end-to-end
    - _Requirements: NFR-6_

## Dependency Notes

- Tasks 1–2 (tables + types) and task 3–4 (pure engine) deliver a standalone,
  fully testable engine with **no** downstream coupling — mergeable on their
  own, and task 7's exhaustive sweep/role-awareness/Mangal Dosha tests can run
  against it before any Prisma or route work exists.
- Task 5 (delete-cascade fix) and task 6 (Prisma model) are a single unit —
  see task 5.2. Do not add the `CompatibilityMatch` FK relations without the
  cascade fix landing in the same change.
- Task 8 (API routes) depends on tasks 3–4 (engine), 6 (schema), and 5 (cascade
  fix, so the delete path is already safe once matches can exist). Task 8.2
  (`/preview`) has no persistence dependency and could land slightly ahead of
  8.1/8.3/8.5 if useful for unblocking task 10 (MCP) early.
- Task 9 (oracle harness) is dev-only tooling; it can run in parallel with
  tasks 1–8 but task 7.1's exhaustive sweep and the final table freeze
  (task 9.3) block calling the koota tables (task 1) "done" — treat task 1 as
  provisional until task 9.3 confirms it.
- Task 10 (MCP) depends on task 8.2 (`/preview`) and task 8.6 (cost-guard
  allow-list); task 11 (UI) depends on tasks 8.1/8.3/8.4/8.5 (full CRUD) and
  6.2/6.4 (gender column + backfill, for role pre-fill).
- Task 12 (Wave 2-G gender wiring) depends only on task 6.2 (schema) — it can
  land independently of the matchmaking engine/UI entirely, since it fixes a
  latent Wave 2-G defaulting bug that predates this feature.
- Task 13 (docs) and task 14 (checkpoint) close out once the preceding surface
  work lands; task 13.3 additionally depends on task 9.3 (divergence table
  needs the frozen tables).
