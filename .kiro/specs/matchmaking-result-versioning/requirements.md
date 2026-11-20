# Requirements Document: Matchmaking Result Versioning

## Introduction

Marriage Matchmaking (`.kiro/specs/marriage-matchmaking/`) persists every computed match as a
`CompatibilityMatch` row whose `result` JSONB is a **point-in-time snapshot** (OD-5): it is written
once, read back verbatim by `GET /api/matchmaking/[id]`, and never recomputed on view. The only
record of *how* a snapshot was produced is `tablesVersion`, stamped from
`MATCHMAKING_TABLES_VERSION` (`engine/compute/matchmakingTables.ts`) onto both the `result` JSON and
the `CompatibilityMatch.tablesVersion` column.

**The problem.** The nakshatra-boundary fix in `engine/compute/nakshatras.ts` changed how
`getNakshatraIndex`/`getPada` locate a longitude that sits exactly on a pada boundary. The
matchmaking engine derives each native's Moon `(nakshatra, pada)` from the stored
`UnifiedChart.moonLongitude` (`Decimal(8,4)`) through `longitudeToNakshatraPadaRashi`, and the
rashi follows from `(nakshatra, pada)`. A stored value can land exactly on a boundary. Replaying
every 4-decimal longitude in `[0, 360)` through the pre-fix and post-fix arithmetic gives:

| What changed | Where |
|---|---|
| Moon **rashi** | exactly 12 stored values: 30, 60, 80, 90, 150, 180, 200, 210, 270, 300, 320, 330.0000° |
| Moon **nakshatra** | nowhere |

So a match whose bride or groom Moon was stored at one of those 12 values can now score differently
on the four rashi-based kootas — **Varna, Vashya, Graha Maitri, Bhakoot** (and Bhakoot's
cancellation, which reads rashi lords). For example, 80.0000° was Punarvasu pada 4 (Cancer) and is
now Punarvasu pada 1 (Gemini). Tara, Yoni, Gana and Nadi read the nakshatra only and cannot change.

**No koota table changed.** `MATCHMAKING_TABLES_VERSION` is still
`'matchmaking-tables-v1.1-nadi-bhanga-fix'`, so a pre-fix snapshot and a post-fix snapshot of the
same pair carry identical stamps and cannot be told apart.

**User decision.** No backfill — existing rows are not rewritten. The practitioner will recompute
and re-save the matches they care about, and needs to tell old rows from new ones.

**What this spec adds.** A second, separate version stamp for everything that is not a table — the
engine's derivation and scoring logic — carried inside the existing `result` JSONB, read
defensively so that rows saved before it existed still load, and surfaced on the API and the saved
match page so an older snapshot is visibly labelled.

## Non-Goals

- **Backfilling or rewriting existing `CompatibilityMatch` rows.** Explicitly declined by the user.
  A saved snapshot remains the record of what the practitioner saw (OD-5).
- **Recomputing a saved match on view.** `GET /api/matchmaking/[id]` keeps returning the persisted
  `result` verbatim. Labelling a snapshot as older is not the same as silently replacing it.
- **A new Prisma column or migration.** The stamp lives inside the existing `result` JSONB.
  (See design.md §Migration for when a column would become necessary.)
- **A staleness marker on the list view (`GET /api/matchmaking`, `/matchmaking`).** The list route
  deliberately does not select the `result` blob (tested in `tests/ownership-matchmaking.test.ts`),
  so it cannot read a stamp that lives inside it. Recorded as an open question in design.md.
- **A one-click "recompute" button.** Re-running a pair is already possible from `/matchmaking`.
- **Changing `MATCHMAKING_TABLES_VERSION`.** No table changed.
- **Changing `computeBoundaryRisk` or `nakshatras.ts`.** Both belong to the boundary-fix work this
  spec versions; this spec only records that the engine changed.

## Glossary

- **Tables version** — `MATCHMAKING_TABLES_VERSION`: identifies the contents of the static koota
  tables in `matchmakingTables.ts` (nakshatra/rashi attributes, scoring matrices, Bhakoot/Nadi
  rules, koota maxima). Stamped as `tablesVersion`.
- **Engine version** — `MATCHMAKING_ENGINE_VERSION` (new): identifies the logic that turns stored
  chart data into a `MatchResult` *other than* the tables — the longitude → nakshatra/pada/rashi
  derivation (including the `nakshatras.ts` helpers it calls), the koota scorers, the cancellation
  detectors, verdict derivation, boundary-risk arithmetic, Mangal Dosha logic, and composition.
  Stamped as `engineVersion`.
- **Legacy row** — a `CompatibilityMatch` whose `result` has no `engineVersion` (saved before this
  spec shipped, i.e. before the boundary fix).
- **Stale** — a saved snapshot whose tables version or engine version differs from what the
  running build would stamp, or is missing. Stale means *a fresh computation might differ*, not
  that the saved score is wrong.

## Requirements

### Requirement 1 — Separate engine version stamp

**User story:** As a practitioner re-saving matches after the boundary fix, I want every newly
computed result to record which engine version produced it, so that I can tell a pre-fix snapshot
from a post-fix one even though the koota tables did not change.

**Acceptance criteria:**
1. A string constant `MATCHMAKING_ENGINE_VERSION` SHALL be exported from
   `engine/compute/matchmaking.ts` and re-exported from `engine/compute/index.ts` beside
   `MATCHMAKING_TABLES_VERSION`.
2. `computeMatch` SHALL stamp it onto every `MatchResult` as `engineVersion`, beside the existing
   `tablesVersion`. `MatchResult.engineVersion` SHALL be a required `string` on the engine type,
   because every freshly computed result carries it.
3. `MATCHMAKING_TABLES_VERSION` SHALL NOT change for this fix. Its doc comment SHALL be narrowed to
   say it versions table contents only, and point to `MATCHMAKING_ENGINE_VERSION` for logic changes.
4. The engine version SHALL be bumped whenever a change outside `matchmakingTables.ts` can change a
   score, status, verdict, cancellation, boundary-risk flag or Mangal Dosha status for the same
   stored chart data — including a change to the `nakshatras.ts` helpers the derivation calls.
   Wording-only changes to evidence notes or `limitations` text need not bump it.
5. The first stamped value SHALL name the change that motivated it:
   `'matchmaking-engine-v1-pada-boundary-fix'`. A result with no `engineVersion` is treated as
   predating v1.
6. The stamp SHALL live inside the existing `result` JSONB. No Prisma schema change and no
   migration.
7. The engine SHALL remain pure and never-throwing (marriage-matchmaking Requirement 1.1).

### Requirement 2 — Readers tolerate rows without the stamp

**User story:** As a practitioner opening a match saved before this change, I want it to load
exactly as before and be labelled as computed by an unversioned engine, so that nothing breaks and
I can see which matches to re-run.

**Acceptance criteria:**
1. A pure, never-throwing helper `describeMatchVersion(stamps)` SHALL accept
   `{ tablesVersion?: unknown; engineVersion?: unknown }` (or `null`/`undefined`) and return
   `MatchVersionInfo = { tablesVersion: string | null; engineVersion: string | null; stale: boolean }`.
2. A stamp that is missing, not a string, or empty SHALL be reported as `null`.
3. `stale` SHALL be `true` WHEN either stamp is `null` or differs from the constant the running
   build stamps; otherwise `false`.
4. `GET /api/matchmaking/[id]` SHALL add `engineVersion` (`null` for a legacy row) and `stale` to
   its response, derived through `describeMatchVersion` from the `tablesVersion` column and
   `result.engineVersion`. It SHALL keep returning `result` verbatim (never recomputed), and SHALL
   NOT throw WHEN the persisted `result` is not an object.
5. `POST /api/matchmaking` and `POST /api/matchmaking/preview` SHALL add `engineVersion` to their
   responses beside `tablesVersion`. The persisted `result` SHALL carry `engineVersion`.
6. The MCP `compute_match` tool passes the preview body through unchanged, so it SHALL surface
   `engineVersion` with no change to `mcp/src`; `tests/mcp-cost-guard.test.ts` SHALL still pass.
7. `GET /api/matchmaking` (list) SHALL be unchanged and SHALL still not select `result`.
8. Every existing reader and writer of `tablesVersion` SHALL keep working unchanged.

### Requirement 3 — Saved match page shows the engine version

**User story:** As a practitioner viewing a saved match, I want to see which engine version
computed it and be told when it is older than the running engine, so that I know to re-run it
before presenting the score.

**Acceptance criteria:**
1. `/matchmaking/[id]` SHALL show the engine version beside the tables version in its header.
   WHEN `engineVersion` is `null`, THEN it SHALL read as unversioned rather than blank.
2. WHEN `stale` is `true`, THEN the page SHALL show a caution stating that the snapshot was computed
   by an older engine or table version, is shown as it was saved, and that computing the same pair
   again and saving it gives current scoring. It SHALL NOT state that the saved score is wrong.
3. The page's local mirror of `MatchResult` SHALL type `engineVersion` as optional, since persisted
   rows may lack it.

### Requirement 4 — Koota-level boundary tests

**User story:** As a maintainer, I want tests that drive a boundary Moon through the same input
builder the routes use, so that a regression in the derivation shows up as a wrong koota, not just
a wrong pada.

**Acceptance criteria:**
1. WHEN either the bride's or the groom's Moon is stored at `80.0000`°, THEN
   `buildMatchNative`/`computeMatchResult` (`app/api/matchmaking/_shared.ts`) SHALL score it as
   Punarvasu pada 1 in Gemini: the Varna, Vashya, Graha Maitri and Bhakoot evidence SHALL carry
   `rashiNumber: 3`, and the Graha Maitri evidence SHALL name Mercury as the Moon-rashi lord.
   Both roles SHALL be tested.
2. WHEN a Moon is stored at `30.0000`°, THEN it SHALL be scored as Krittika pada 2 in Taurus
   (`rashiNumber: 2`).
3. WHEN a Moon is stored at an ordinary longitude away from every boundary, THEN the pre-fix and
   post-fix derivations SHALL agree, and the `MatchResult` SHALL be identical apart from
   `engineVersion`.
4. Stored longitudes SHALL be supplied as `Prisma.Decimal` values parsed from 4-decimal strings,
   exactly as `UnifiedChart.moonLongitude` arrives from the database.
5. Tests SHALL assert that new results carry `engineVersion === MATCHMAKING_ENGINE_VERSION` and
   `tablesVersion === MATCHMAKING_TABLES_VERSION`; that `POST /api/matchmaking` persists the stamp
   inside `result`; and that `GET /api/matchmaking/[id]` reports a legacy row as
   `engineVersion: null, stale: true` while returning its `result` unchanged.
6. Tests SHALL cover `describeMatchVersion` for current, legacy, older-tables and malformed inputs.

### Requirement 5 — Documentation

**User story:** As a maintainer, I want the two version stamps and their bump rules documented
where the matchmaking engine is documented, so that the next logic fix bumps the right one.

**Acceptance criteria:**
1. `docs/computation_matchmaking.md` SHALL gain a Versioning section: what each stamp covers, when
   each is bumped, how legacy rows read, what `stale` means, and how to find saved matches that the
   boundary fix can actually change. Its boundary note SHALL reference the engine version.
2. `docs/ERD.md` SHALL note that `CompatibilityMatch.result` carries `engineVersion` beside
   `tablesVersion`, with no new column.
3. `docs/HLD.md` §8.4 SHALL be touched only where it names the stamp on `MatchResult`.
4. `CLAUDE.md` and `docs/RELEASE_NOTES.md` are merged by the parent change; this spec supplies the
   proposed text but does not edit them.

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NFR-1 | **Backward compatibility:** every `CompatibilityMatch` row saved before this change SHALL load and render without error; no row is rewritten. |
| NFR-2 | **No schema change:** no Prisma model, column, index or migration is added (Requirement 1.6). |
| NFR-3 | **Snapshot integrity:** no reader recomputes or mutates a persisted `result` (OD-5). |
| NFR-4 | **Purity:** `MATCHMAKING_ENGINE_VERSION` and `describeMatchVersion` add no I/O to `engine/compute/` and never throw. |
| NFR-5 | **Honest naming:** `tablesVersion` continues to mean table contents only. |
