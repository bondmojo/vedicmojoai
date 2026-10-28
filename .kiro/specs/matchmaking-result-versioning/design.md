# Design Document: Matchmaking Result Versioning

## Overview

Add a second version stamp, `engineVersion`, to every freshly computed `MatchResult`. It covers the
matchmaking *logic* (input derivation, scorers, cancellation detectors, verdict, boundary risk,
Mangal Dosha, composition) the way `tablesVersion` already covers the static koota tables. It lives
inside the existing `CompatibilityMatch.result` JSONB, so there is no schema change. Readers treat
a missing stamp as "predates v1", and the saved-match API and page label such a snapshot as
**stale**: a fresh computation of the same pair might differ.

The first value, `'matchmaking-engine-v1-pada-boundary-fix'`, marks results computed after the
nakshatra-boundary fix in `engine/compute/nakshatras.ts`.

## Why `tablesVersion` alone cannot do this

`MATCHMAKING_TABLES_VERSION` (`engine/compute/matchmakingTables.ts`) is documented as "bumped
whenever any table in this module changes". The boundary fix changed no table. It changed how a
stored `moonLongitude` becomes `(nakshatra, pada)`, and so — for 12 exact stored values — which
rashi the rashi-based kootas read. Pre-fix and post-fix snapshots therefore carry the same
`tablesVersion`.

The version history already shows the strain: `v1.1-nadi-bhanga-fix` was a bump for a logic fix in
`matchmaking.ts`'s `detectNadiCancellation`, not a table change. Bumping the tables version again
for a fix in `nakshatras.ts` would make the name describe neither what it covers nor what changed.

## Options considered

| # | Option | For | Against |
|---|---|---|---|
| A | Bump `MATCHMAKING_TABLES_VERSION` to `v1.2-pada-boundary-fix` | One-line change; the column and the JSON both change, so the list view could show it | The tables did not change, so the name stops being true. `scripts/oracle/README.md` and `docs/computation_matchmaking.md` tie each tables version to an oracle-verified table state, so a bump would falsely imply the tables were re-verified. A future table bump and a logic bump could no longer be told apart. |
| B | **Separate `engineVersion` inside the `result` JSONB** | Honest naming. No migration. A legacy row is identified by the field's absence, which every reader can test. MCP surfaces it for free (it passes the preview body through). | Not a column, so `GET /api/matchmaking` (list) cannot read it without selecting the `result` blob, which it deliberately does not. |
| C | Separate `engineVersion` **column** on `CompatibilityMatch` | Queryable; the list view can badge or filter by it | Needs a migration and a nullable column, duplicates what the JSON already holds, and the brief prefers no column. |
| D | Infer "pre-fix" from `createdAt` vs a deploy date | No code in the write path | Each environment (local, Cloud Run, Vercel) deploys at a different time; a timestamp says when, not what code. Rejected. |

## Decision

**Option B.** `MATCHMAKING_TABLES_VERSION` keeps its value and its meaning narrows to table contents
only. `MATCHMAKING_ENGINE_VERSION` is new, lives in `engine/compute/matchmakingVersion.ts`
(re-exported from `matchmaking.ts`), and is stamped by `computeMatch`. No column is needed for the user's stated workflow
(open a saved match, see that it is older, re-run it). The list-view gap is recorded under Open
Questions.

The `v1.1-nadi-bhanga-fix` tables bump is left as-is. Rewriting history would orphan rows that
carry that stamp. From this change on, a logic fix bumps the engine version, not the tables version.

## Data shape

```ts
// engine/compute/types.ts
export interface MatchResult {
  ashtakoota: AshtakootaResult
  mangalDosha: { bride; groom; compatibility }
  /** Static koota table contents — see MATCHMAKING_TABLES_VERSION. */
  tablesVersion: string
  /** Derivation + scoring logic — see MATCHMAKING_ENGINE_VERSION. Absent on rows saved before v1. */
  engineVersion: string
}

export interface MatchVersionInfo {
  tablesVersion: string | null   // null when missing / not a string / empty
  engineVersion: string | null   // null on every legacy row
  stale: boolean                 // either stamp null, or not what this build stamps
}
```

`engineVersion` is **required** on the engine type, because every result `computeMatch` returns
carries it. Persisted JSON is never typed as `MatchResult` on the read path: the GET route treats
`result` as opaque JSON, and the page's local mirror marks the field optional.

```ts
// engine/compute/matchmakingVersion.ts (re-exported from matchmaking.ts)
export const MATCHMAKING_ENGINE_VERSION = 'matchmaking-engine-v1-pada-boundary-fix'

export function describeMatchVersion(
  stamps: { tablesVersion?: unknown; engineVersion?: unknown } | null | undefined
): MatchVersionInfo
```

`describeMatchVersion` is pure and never throws. Both live in `matchmakingVersion.ts`, which
imports only the dependency-free `matchmakingTables.ts`. Review found that putting them in
`matchmaking.ts` made `GET /api/matchmaking/[id]` (and DELETE, in the same file) load the Swiss
Ephemeris native addon through `relationships.ts` → `planets.ts`, so an addon load failure would
also break viewing and deleting saved matches. The route imports `matchmakingVersion.ts` directly;
`matchmaking.ts` re-exports both names for existing callers.

The v1 stamp also covers the boundary-risk change made alongside the pada fix:
`computeBoundaryRisk` now measures from the located nakshatra's exact edges
(`distanceToNakshatraBoundary`), so a Moon stored exactly 1° from a boundary (39, 79, … 359.0000°)
is at risk. Scores do not change for those.

### Bump rules

| Change | Bump |
|---|---|
| Any value in `matchmakingTables.ts` (attributes, matrices, Bhakoot/Nadi rules, maxima) | `MATCHMAKING_TABLES_VERSION` |
| Longitude → nakshatra/pada/rashi derivation, including `nakshatras.ts`'s `getNakshatraIndex`/`getPada` | `MATCHMAKING_ENGINE_VERSION` |
| A koota scorer, a cancellation detector, `deriveVerdict`, boundary-risk arithmetic or threshold, Mangal Dosha rules, `computeMatch` composition | `MATCHMAKING_ENGINE_VERSION` |
| Wording of evidence `notes` or `limitations` only | Neither required |

A change that touches both bumps both.

## Every reader and writer of the version

Found with `grep -rn "MATCHMAKING_TABLES_VERSION\|tablesVersion"` across `engine`, `app`, `lib`,
`mcp/src`, `scripts`, `tests`, `prisma` and `docs`.

| Site | Role today | Change |
|---|---|---|
| `engine/compute/matchmakingTables.ts` `MATCHMAKING_TABLES_VERSION` | Defines the tables stamp | Value unchanged; doc comment narrowed to tables only, points to the engine version |
| `engine/compute/types.ts` `MatchResult.tablesVersion` | Type | Comment narrowed; add `engineVersion`; add `MatchVersionInfo` |
| `engine/compute/matchmaking.ts` `computeMatch` | Stamps `tablesVersion` | Also stamps `engineVersion`; adds the constant and `describeMatchVersion` |
| `engine/compute/index.ts` | Re-exports the tables constant | Also re-exports `MATCHMAKING_ENGINE_VERSION`, `describeMatchVersion`, `MatchVersionInfo` |
| `app/api/matchmaking/_shared.ts` `computeMatchResult` | Calls `computeMatch` | None — the result it returns now carries the stamp |
| `app/api/matchmaking/route.ts` POST | Writes the column from the constant; returns the column | Returns `engineVersion` too. `result` (persisted verbatim) already carries it |
| `app/api/matchmaking/route.ts` GET (list) | Reads neither | None |
| `app/api/matchmaking/preview/route.ts` | Returns `result.tablesVersion` | Returns `result.engineVersion` too |
| `app/api/matchmaking/[id]/route.ts` GET | Returns the column | Adds `engineVersion` (from `result`, `null` if absent) and `stale`, via `describeMatchVersion` |
| `app/matchmaking/[id]/page.tsx` | Shows `tables {tablesVersion}` | Shows the engine version too; stale caution; local `engineVersion?` |
| `app/matchmaking/page.tsx` (list) | Does not show a version | None |
| `mcp/src/tools.ts` `compute_match` | Passes the preview body through | None — gains `engineVersion` automatically |
| `prisma/schema.prisma` `CompatibilityMatch.tablesVersion` | Column | None |
| `engine/compute/matchmaking.invariants.test.ts` (lines ~492, ~550) | Round-trips `tablesVersion` | None; still passes |
| `tests/ownership-matchmaking.test.ts` (lines ~146, ~193, ~273) | Mocks and asserts `tablesVersion`; the GET fixture has no `engineVersion` | None; the fixture now exercises the legacy path |
| `scripts/oracle/*.ts` | Use `AshtakootaResult`, never `MatchResult` | None |
| Docs: `computation_matchmaking.md`, `ERD.md`, `HLD.md` §8.4 | Describe the tables stamp | Updated (task 5) |
| Docs: `DFD.md` (~362, ~1201), `.kiro/skills/database-prisma.md` (~160), `scripts/oracle/README.md` (~122), `mcp/README.md`, `CLAUDE.md`, `RELEASE_NOTES.md` | Describe the tables stamp | Outside this change's file ownership; proposed text goes to the parent |

## API changes

| Route | Added fields |
|---|---|
| `POST /api/matchmaking` (201) | `engineVersion: string` (and inside the persisted `result`) |
| `POST /api/matchmaking/preview` | `engineVersion: string` |
| `GET /api/matchmaking/[id]` | `engineVersion: string \| null`, `stale: boolean` |
| `GET /api/matchmaking` | none |

All additions are new keys; no existing key changes meaning or type. The GET route reads the stamp
with an object guard, so a `result` that is `null`, an array or a scalar yields
`engineVersion: null` instead of a throw.

## UI

`/matchmaking/[id]` header: `tables <tablesVersion> · engine <engineVersion | "unversioned">`.

When `stale` is true, an amber caution sits above the score:

> Computed with an older matchmaking engine or table version. This saved result is shown exactly as
> it was computed. Run this pair again from Matchmaking and save it to get current scoring.

It does not say the score is wrong — for most legacy rows it is not.

## Migration and compatibility

- **No migration.** No Prisma change. Existing rows are never rewritten (user decision).
- **Legacy rows** have no `result.engineVersion`, so they load as `engineVersion: null, stale: true`.
  Every legacy row is labelled stale, including the large majority the boundary fix cannot change.
  That is deliberate: the label promises only that a fresh computation might differ.
- **Finding the legacy rows the boundary fix can actually change.** The routes always pass the
  stored Moon longitude into the engine, so each saved `result.ashtakoota.boundaryRisk[]` entry
  records it as `moonLongitude`. A legacy row needs re-running only if either entry's
  `moonLongitude` is one of 30, 60, 80, 90, 150, 180, 200, 210, 270, 300, 320 or 330. Any other
  legacy row whose `tablesVersion` is current recomputes to the same koota scores.
- **Rollback.** A build without this change reads rows saved with it fine: the extra JSON key is
  ignored and `tablesVersion` is unchanged.
- **Concurrent boundary-risk work.** If `computeBoundaryRisk` changes in the same change set as the
  boundary fix, v1 covers it. If it changes later in a way that alters `atRisk` or
  `distanceToBoundaryDeg` for the same input, that is another engine bump.
- **When a column would be needed.** Only if the list view must badge, filter or sort by engine
  version without fetching `result`. That would be a nullable `engineVersion String?` column
  populated from the JSON — a migration this change does not make.

## Open questions

1. Should the list view (`/matchmaking`) badge stale rows? It needs either the `result` blob in the
   list query (reversing a tested design choice) or a column (a migration).
2. Should the stale caution on a saved match offer a one-click "recompute and save" that re-POSTs
   the same bride/groom chart ids? `GET /api/matchmaking/[id]` does not return the chart ids today.

## Testing strategy

New file `tests/matchmaking-result-versioning.test.ts`:

- **Boundary through the route input builder.** `computeMatchResult` from `_shared.ts` with
  `moonLongitude: new Prisma.Decimal('80.0000')` as bride, then as groom: Punarvasu pada 1;
  `rashiNumber: 3` in the Varna, Vashya, Graha Maitri and Bhakoot evidence; Graha Maitri lord
  Mercury. Same for `30.0000` (Krittika pada 2, `rashiNumber: 2`).
- **Ordinary longitude does not move.** A local copy of the pre-fix arithmetic and the shipped
  derivation agree at `123.4567`. The `MatchResult` built from either derivation is identical apart
  from `engineVersion`. At `80.0000` the two disagree, which shows the test can tell them apart.
- **Stamp.** New results carry both constants; the engine stamp differs from the tables stamp.
- **`describeMatchVersion`.** Current → not stale; legacy (no engine stamp) → `null`, stale; older
  tables stamp → stale; `null`, `undefined`, numbers and empty strings → `null`, stale, no throw.
- **Routes (mocked Prisma/auth).** POST persists `result.engineVersion` and returns it; preview
  returns it; GET on a legacy row returns `engineVersion: null, stale: true` and the `result`
  verbatim; GET on a current row returns `stale: false`; GET on a non-object `result` returns 200.

Existing suites (`matchmaking.test.ts`, `matchmaking.invariants.test.ts`,
`ownership-matchmaking.test.ts`, `mcp-cost-guard.test.ts`) must pass unchanged.
