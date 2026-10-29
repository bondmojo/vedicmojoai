# Requirements Document: Full-Length Birth Mahadasha Sub-Periods (Vimshottari)

## Introduction

`engine/computeVimshottari.ts` builds the natal Vimshottari tree that every timing
feature reads: the Dasha tab, Duration Analysis and the Duration Analyser, the AI
pipeline's chart summary, the MCP `get_dasha_tree` / `get_active_dasha` tools, and
the Varshaphal dashas. The tree is also stored in `UnifiedChart.dashaTree`.

A senior-astrologer review of the Varshaphal dasha feature found that the
antardashas (ADs) and pratyantardashas (PDs) of the **birth (first) mahadasha**
were laid out wrongly. The engine called
`computeAntardashas(lord, birth, balanceDays)`: all nine ADs were squeezed into
the balance, starting at birth with the MD lord's own AD, and the PDs were
squeezed the same way.

The standard method (Parashara; Jagannatha Hora) runs the other way. The birth MD
is the full-length MD, which began before birth. Its ADs and PDs keep their full
proportions and are clipped at birth, so the AD and PD running at birth follow from
how far the Moon has travelled through its nakshatra.

Only dates inside the native's first MD are affected, but that MD lasts up to
about 20 years, so the error matters most for children and young adults.

**Known case.** Birth 1990-04-27 12:00, timezone +5.5, lat 28.6139, lon 77.209.
The natal Moon is about 42.77°, about 20.7% into Rohini (a Moon nakshatra).

| Instant | Engine before | Standard method |
|---|---|---|
| Birth | Moon / Moon / Moon | Moon / Rahu / Saturn |
| 1997 Varsha Pravesh | Moon / Venus / Jupiter | Moon / Venus / Saturn |

An independent check over 24 charts disagreed in 7, all inside the first MD.
Births 1975-11-03 03:15 IST Mumbai and 2001-07-19 22:40 UTC−4 New York also show
it.

> **Status:** implemented 2026-10-28 on branch `claude/competent-hamilton-155273`,
> not yet committed. The backfill has not been run against any database yet
> (task 6.1).

## Glossary

- **Birth_MD** — `mahadashas[0]`, the MD running at birth. Its lord is the lord of
  the Moon's birth nakshatra.
- **Elapsed_Fraction** — how far the Moon has travelled through its birth
  nakshatra, 0 to 1.
- **Balance** — the part of the Birth_MD left at birth:
  (1 − Elapsed_Fraction) × the lord's years. Stored as `balance_years` and as the
  Birth_MD's `duration_days`.
- **Full_Birth_MD** — the full-length Birth_MD, starting at birth − elapsed, where
  elapsed = full MD length − Balance.
- **Clip** — cutting a period to [birth, Birth_MD end]. A period that ends at or
  before birth is dropped; a period that straddles birth starts at birth.
- **Stored_Tree** — a serialized `DashaTree` in `UnifiedChart.dashaTree` (JSONB).

## Non-Goals

- **The nakshatra and balance arithmetic.** How `balance_years` is computed from
  the Moon's longitude is unchanged, including a floating-point quirk at exact
  nakshatra boundaries (design.md, Known Limitation).
- **The year length.** `YEAR_DAYS = 365.2425` stays the only year constant.
- **MDs 2–9.** They were already right and are not changed.
- **Stored LLM output.** Past AI Analysis reports and Duration Analysis runs keep
  the periods they were generated with. They are not re-run.
- **The Varshaphal Mudda dasha.** It is computed separately and is not touched.

## Requirements

### Requirement 1 — Birth-MD sub-periods from the full-length MD

**User story:** As a practitioner, I want the antardasha and pratyantardasha at
any date inside the first mahadasha to match the standard method, so that readings
for children and young adults are right.

**Acceptance criteria:**
1. WHEN the tree is computed, THEN the Birth_MD's ADs SHALL be laid out over the
   Full_Birth_MD: the first AD is the MD lord's own, each AD lasts
   full MD length × AD-lord years / 120, and the ADs follow the Vimshottari order.
2. Each of those ADs' PDs SHALL be laid out over the full, unclipped AD, by the
   same rule one level down.
3. The ADs and PDs SHALL then be Clipped. A clipped period's `duration_days` SHALL
   be its clipped length; a period that is not cut SHALL keep its computed value.
4. WHEN the Elapsed_Fraction is 0, THEN the Birth_MD SHALL have all nine ADs, each
   with all nine PDs, starting with the MD lord — the same as before this change.
5. The AD and PD running at birth SHALL be the AD and PD of the Full_Birth_MD at
   the Elapsed_Fraction.

### Requirement 2 — MD-level output unchanged

**User story:** As an API, MCP or UI consumer, I want the tree's shape and MD-level
dates unchanged, so that nothing downstream needs a code change.

**Acceptance criteria:**
1. `balance_years`, and every MD's `lord`, `start`, `end` and `duration_days`, SHALL
   be unchanged. The Birth_MD SHALL still start at birth and last the Balance.
2. MDs 2–9, with their ADs and PDs, SHALL be unchanged.
3. The `DashaTree` type and its JSON shape SHALL be unchanged. The Birth_MD MAY have
   fewer than nine ADs and its first AD fewer than nine PDs.
4. The function SHALL stay pure: no LLM, network, DB or file I/O.

### Requirement 3 — Integrity checks

**Acceptance criteria:**
1. Integrity check 2 SHALL check that each MD's ADs run contiguously from the MD's
   start (within 1 second) and sum to the MD's `duration_days` (within 1 day). For
   the Birth_MD that is the Balance, starting at birth.
2. A failure SHALL throw `DashaIntegrityError`, as the existing checks do.

### Requirement 4 — Backfill of stored trees

**User story:** As an operator, I want one command that corrects the dasha tree of
every saved chart, so that existing clients see the corrected periods without
re-saving their charts.

**Acceptance criteria:**
1. `npm run db:backfill-birth-md` (`scripts/backfill-birth-mahadasha.ts`) SHALL
   rewrite `mahadashas[0].antardashas` of every `UnifiedChart.dashaTree` whose Birth_MD
   does not already match the standard layout.
2. The script SHALL rebuild the Birth_MD from its own stored `lord`, `start` and
   `duration_days` (falling back to `end − start`). It SHALL NOT recompute from
   `UnifiedChart.moonLongitude`, which is rounded to 4 decimals.
3. It SHALL NOT change `balance_years` or any MD-level field, and SHALL NOT touch
   MDs 2–9.
4. For a tree computed before the fix, the rebuilt Birth_MD SHALL equal what
   `computeVimshottari` now returns for the same Moon longitude and birth.
5. It SHALL be idempotent. A second run SHALL write nothing. The comparison SHALL
   ignore object key order, since JSONB does not keep it.
6. It SHALL skip, without writing, a tree with no MDs, an unknown lord, an
   unparseable date, or a Birth_MD longer than its lord's full MD.
7. `--dry-run` SHALL report what would change without writing.
8. Importing the script SHALL NOT connect to the database, so its pure function can
   be unit-tested.

### Requirement 5 — Consumers keep working

**Acceptance criteria:** each consumer SHALL work with a Birth_MD of fewer than nine
ADs and PDs, with no code change:
1. Dasha tab (`DashaTimeline.tsx`), Duration Analyser picker
   (`DashaPeriodPicker.tsx`), Copy-for-AI (`CopyForAIPanel.tsx`).
2. Duration Analysis slicer and extractor, `POST /api/timeline`, and
   `buildChartSummary`.
3. MCP `get_dasha_tree` / `get_active_dasha` (`activeDashaChain`).
4. The Varshaphal natal-dasha slice (`engine/compute/varshaphalDashas.ts`, on the
   `missing-mcp-features` branch), which reads the tree by time overlap.

### Requirement 6 — Verification

**Acceptance criteria:**
1. Tests SHALL pin the known cases: 1990 Delhi Moon/Rahu/Saturn at birth and
   Moon/Venus/Saturn at the 1997 Varsha Pravesh; 1975 Mumbai Rahu/Rahu/Saturn and
   2001 New York Jupiter/Saturn/Jupiter at birth.
2. An oracle that shares no code with the engine SHALL find the MD/AD/PD at any
   instant from a Full_Birth_MD started before birth. The engine SHALL match it at
   sampled instants across the whole tree, for Moon longitudes in all 27 nakshatras
   and a birth before 1970.
3. Tests SHALL check the layout invariants (Requirement 1.3–1.4, 2.1–2.3) and the
   backfill (Requirement 4.3–4.6).
4. The new tests SHALL fail against the pre-fix engine.
5. The full Vitest suite, ESLint and `tsc --noEmit` SHALL pass on Node 20.

### Requirement 7 — Documentation sync

**Acceptance criteria:** updated in the same change, per `Claude.md`'s table:
`docs/HLD.md` §3.5, `docs/ERD.md` (stored `dashaTree` semantics and the backfill),
`docs/DFD.md` (dasha-tree data store), `skills/backend/pre-analysis.md`,
`skills/engine-pipeline.md`, `.kiro/skills/engine-pipeline.md`, `Claude.md`, and
`docs/RELEASE_NOTES.md`. The release note SHALL say that dasha periods inside the
first MD change for existing charts and that the backfill must be run.

## Decisions Log (informational)

| Question | Decision |
|---|---|
| Rebuild stored trees from `moonLongitude` or from the stored Birth_MD? | From the stored Birth_MD. `moonLongitude` is `Decimal(8,4)`; recomputing from it would move `balance_years` and the MD 2–9 dates by up to ~1.3 hours. |
| Backfill `Wave1Cache.dashaTree` and `SavedChart.dashaTree` too? | No. Neither is read for dasha periods: `Wave1Cache.dashaTree` is a write-only snapshot (the analyze route recomputes the tree each run) and `SavedChart` is legacy; `db:migrate-saved` recomputes when promoting. |
| Fix the exact-boundary floating-point quirk in the balance too? | No. It changes `balance_years`, which this spec keeps fixed. Proposed as a follow-up. |
| Add a field for the Full_Birth_MD start? | No. The JSON shape stays as it is; the start can be derived as `start − (full − duration_days)`. |
