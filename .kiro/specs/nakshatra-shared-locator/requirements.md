# Requirements Document: One Nakshatra Locator for the Whole Engine

## Introduction

`engine/compute/nakshatras.ts` was just fixed for a floating-point boundary bug.
It took the nakshatra index from `Math.floor(lon / span)` and the position from
`lon % span`. `360 / 27` rounds up, so at an exact boundary the two disagree: 40°
read as Rohini pada 4 with the last sub-lord. The fix added two private helpers:

- `normalizeLongitude(lon)` — [0, 360) without moving an in-range value.
- `locateInNakshatra(lon)` — index, fraction and pada from **one** quotient.

The same arithmetic is still copied in four other places, each with its own
version of the bug or of the lossy normalization:

| Place | What it does | Effect at an exact boundary |
|---|---|---|
| `engine/computeVimshottari.ts` | index from `floor(lon / span)`, elapsed fraction from `lon % span` | Moon at 40.0000° gets a ~0 Moon balance and a Mars MD from birth, instead of a full 10-year Moon MD |
| `engine/compute/matchmaking.ts` `computeBoundaryRisk` | `normalized % span` | distance ≈ 1e-15 instead of 0 (harmless); 39.0000°, 79.0000°, … report `atRisk: false` although they are exactly 1° from a boundary |
| `engine/compute/specialLagnas.ts` Sree Lagna | `normLong(moon) % span` | fraction ≈ 1 instead of 0 |
| `upagrahas.ts`, `gochar.ts`, `specialLagnas.ts`, `transits.ts` | `normLong = ((lon % 360) + 360) % 360` | rounds every in-range longitude onto a 2⁻⁴⁴° grid |

`nakshatras.ts` also redefines four tables that `engine/constants.ts` already
exports (`NAKSHATRA_SPAN_DEG`, `DASHA_SEQUENCE`, `TOTAL_DASHA_YEARS`, `NAKSHATRAS`).

A boundary is reachable: `UnifiedChart.moonLongitude` and `lagnaLongitude` are
`Decimal(8,4)`, so a stored 40.0000 arrives as exactly 40. The analyze route
recomputes the dasha tree from that stored value; matchmaking reads it too.

This feature makes `locateInNakshatra` the single source of nakshatra arithmetic.

> **Status:** implemented 2026-10-28 on branch `claude/adoring-moser-584cc0`, not
> yet committed. Supersedes the uncommitted `getNakshatraPosition` fix on branch
> `claude/youthful-chebyshev-d9d035` (design.md, Merge Notes).

## Glossary

- **Locator** — `locateInNakshatra(lon)` in `engine/compute/nakshatras.ts`.
- **Quotient** — `q = normalizedLong / NAKSHATRA_SPAN_DEG`; index = `floor(q)`,
  fraction = `q − index`.
- **Cut point** — a position counted in whole dasha years from 0° Ashwini
  (9 years per degree): a nakshatra start (120 × index), a pada start (+30, +60,
  +90) or a sub-lord start (+ cumulative lord years).
- **4-decimal longitude** — `k / 10000` for an integer `k` in [0, 3 600 000): every
  value a `Decimal(8,4)` column can hold in [0, 360).
- **Exact oracle** — integer arithmetic on `k` (for a 4-decimal longitude) or
  BigInt arithmetic on a double's mantissa (for any double); shares no code with
  the engine.
- **Drift** — any difference between the old and new output of a function, measured
  by a scratch sweep over random doubles.

## Non-Goals

- **The index rule.** The index still comes from `floor(q)`. Within an ulp of a
  nakshatra boundary it can differ from the exact index (one double in the whole
  sweep, design.md, Known Limitations). Fraction and pada stay consistent with it.
- **Other lossy normalizations** outside the files listed above (`divisional.ts`,
  `planets.ts`, `relationships.ts`, `index.ts`). They do no nakshatra arithmetic.
- **Stored data.** `UnifiedChart.nakshatras`, `dashaTree`, `specialLagnas` and
  `CompatibilityMatch.result` are not rewritten.
- **Matchmaking outside `computeBoundaryRisk`.** Owned by another change.

## Requirements

### Requirement 1 — One exported locator

**User story:** As an engine maintainer, I want one exported function that places a
longitude in its nakshatra, so that no module re-derives index, fraction or pada.

**Acceptance criteria:**
1. `engine/compute/nakshatras.ts` SHALL export `normalizeLongitude` and
   `locateInNakshatra`, and the `NakshatraLocation` type the locator returns.
2. `normalizeLongitude` SHALL return an in-range value unchanged, map −0 and a tiny
   negative value that rounds to 360 to 0, and keep NaN as NaN.
3. `locateInNakshatra` SHALL return `normalizedLong` in [0, 360),
   `nakshatraIndex` in 0–26, `fraction` in [0, 1) and `pada` in 1–4 for every
   finite input, with index and fraction from one quotient. NaN in SHALL give NaN
   index, fraction and pada.
4. Every longitude-taking function in `nakshatras.ts` SHALL go through the locator.
5. `nakshatras.ts` SHALL stay pure: no LLM, network, DB or file I/O.

### Requirement 2 — Vimshottari birth nakshatra from the locator

**User story:** As a practitioner, I want a Moon stored exactly on a nakshatra
boundary to start the full mahadasha of the new nakshatra's lord.

**Acceptance criteria:**
1. `computeVimshottari` SHALL take the birth nakshatra index and the elapsed
   fraction from `locateInNakshatra`.
2. A Moon at n × (360 / 27) for every n in 0–26, and at 40.0000, 80.0000, …,
   320.0000, SHALL give the full MD of the new nakshatra's lord, starting at birth.
3. `tests/vimshottari-nakshatra-boundary.test.ts` SHALL be a verbatim copy of the
   file on branch `claude/youthful-chebyshev-d9d035`, and SHALL pass.
4. A Moon in [0, 360] SHALL be accepted, with 360 read as 0° (a `Decimal(8,4)`
   `moonLongitude` rounds a Moon in [359.99995°, 360°) up to 360.0000). Anything
   else, NaN included, SHALL throw `DashaIntegrityError`. Normalization changes no
   other accepted input. (Revised after review: originally "unchanged contract",
   under which a stored 360.0000 made AI Analysis return a 500.)
5. The change SHALL NOT create an import cycle.
6. Away from boundaries the MD lords SHALL be unchanged for every random longitude
   swept; `balance_years` MAY change in its last bits.

### Requirement 3 — Matchmaking boundary risk from the locator

**User story:** As a practitioner, I want the boundary-risk flag to be exact for
every stored Moon longitude.

**Acceptance criteria:**
1. `computeBoundaryRisk` SHALL take the distance to the nearest nakshatra boundary
   from `nakshatras.ts` (through the locator), not from its own `% span`.
2. For every 4-decimal longitude, `atRisk` SHALL match the exact oracle
   (distance ≤ `BOUNDARY_RISK_THRESHOLD_DEG`, inclusive).
3. Away from boundaries `atRisk` SHALL be unchanged for every random longitude
   swept, and `distanceToBoundaryDeg` SHALL differ by less than 1e-12°.
4. A Moon exactly on a boundary SHALL report distance 0.
5. Only `computeBoundaryRisk` and the `./nakshatras` import line of
   `matchmaking.ts` SHALL change.

### Requirement 4 — Sree Lagna from the locator

**Acceptance criteria:**
1. `computeSreeLagna` SHALL take the Moon's elapsed fraction from the locator.
2. A Moon exactly on a boundary SHALL give fraction 0, so Sree Lagna is the
   Lagna; with the Lagna exactly on a sign cusp it stays in that sign.
3. Away from boundaries the Sree Lagna sign SHALL be unchanged for every random
   input swept.

### Requirement 5 — Lossy normalizations

**Acceptance criteria:**
1. Each `normLong` copy in `upagrahas.ts`, `gochar.ts`, `specialLagnas.ts` and
   `transits.ts` SHALL be replaced with `normalizeLongitude` only if a scratch sweep
   shows no output change away from boundaries.
2. Each copy left in place SHALL be recorded in design.md with the measured reason.

### Requirement 6 — Shared constants

**Acceptance criteria:**
1. `nakshatras.ts` SHALL use `NAKSHATRA_SPAN_DEG`, `DASHA_SEQUENCE`,
   `TOTAL_DASHA_YEARS` and `NAKSHATRAS` from `engine/constants.ts` instead of its
   own copies, provided this creates no import cycle.
2. `getNakshatraData()` SHALL keep returning `{ name, lord }[]` in nakshatra order.

### Requirement 7 — Pada and sub-lord agree

**User story:** As a practitioner, I want the pada and the sub-lord never to name an
impossible pair, such as Mrigashira pada 3 with the Saturn sub (Saturn's sub lies
wholly in pada 2).

**Acceptance criteria:**
1. In Mars-led and Mercury-led nakshatras the 60-year sub-lord cut is the start of
   pada 3. Pada and sub-lord SHALL be decided by the same exact comparison against
   the cut points, so no double gets a sub-lord that lies outside its pada.
2. Every 4-decimal longitude SHALL still match the exact oracle (index, pada,
   sub-lord, degree in nakshatra, matchmaking rashi).
3. Where the locator's index is exact, pada and sub-lord SHALL match an exact
   BigInt oracle for every double near every cut point.
4. NaN SHALL still give a NaN pada (matchmaking reports the koota unavailable).

### Requirement 8 — Verification

**Acceptance criteria:**
1. Every function touched SHALL be swept old vs new on random doubles in a scratch
   script outside the repo; the counts SHALL be recorded in design.md.
2. New tests SHALL cover Requirements 3.2, 3.4, 4.2, 6.2 and 7.1–7.4.
3. The full Vitest suite, `tsc --noEmit` and ESLint SHALL pass on Node 20.

### Requirement 9 — Documentation

**Acceptance criteria:** updated in the same change: `docs/HLD.md`,
`.kiro/skills/engine-pipeline.md`, `skills/backend/compute-engine.md`,
`skills/backend/pre-analysis.md`. `docs/DFD.md` only if a flow changes (none does).
`Claude.md` and `docs/RELEASE_NOTES.md` text is proposed for the parent to merge.

## Decisions Log (informational)

| Question | Decision |
|---|---|
| Normalize inside `computeVimshottari`? | The locator normalizes. `computeVimshottari` accepts [0, 360] and rejects everything else, so the only accepted input normalization changes is 360, which reads as 0° (Requirement 2.4). |
| Boundary-risk distance from `min(fraction, 1 − fraction) × span`? | No. It misreads 6 threshold-edge 4-decimal longitudes (39.0000 → 1.0000000000000024). The distance from the located nakshatra's exact cut points misreads none. |
| Replace the lossy `normLong` copies? | Left in all four files: each feeds an emitted longitude, which would change in its last bits for 58–83% of random inputs (design.md, Lossy Normalizations). |
| Pada from the fraction or from the cut points? | From the cut points, by the exact `9 × lon ≥ years` comparison the sub-lord now uses too. |
