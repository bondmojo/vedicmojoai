# Design Document: Full-Length Birth Mahadasha Sub-Periods (Vimshottari)

## Overview

`computeVimshottari` now treats the birth mahadasha as the tail of a full-length MD
that began before birth. It lays the birth MD's antardashas and pratyantardashas
out over the full MD and clips them at birth. MD-level output (`balance_years`, every
MD's dates) and MDs 2–9 are unchanged. A one-off script corrects the trees already
stored in `UnifiedChart.dashaTree`.

## Guiding Principle (Parashara, JHora)

- **The birth MD is a full MD, already running.** The balance is what is left of it,
  not a shorter MD of its own.
- **Sub-periods keep full proportions.** An AD lasts MD × AD-lord years / 120 of the
  *full* MD, and a PD lasts AD × PD-lord years / 120 of the *full* AD.
- **Clip, don't compress.** Whatever ran before birth is cut off; nothing is
  stretched or shrunk to fit the balance.

## Architecture / Affected Modules

```mermaid
flowchart TD
    subgraph engine["engine/computeVimshottari.ts"]
        CV["computeVimshottari()<br/>MD 1: computeBirthMahadashaAntardashas()<br/>MDs 2–9: computeAntardashas() + computePratyantardashas()"]
        BM["computeBirthMahadashaAntardashas() (NEW, exported)<br/>full-length layout → clipPeriods()"]
        CP["clipPeriods() (NEW, private)"]
        IC["Integrity check 2 (UPDATED)<br/>contiguous from MD start + sum to duration"]
    end
    subgraph store["Stored trees"]
        UC["UnifiedChart.dashaTree (JSONB)"]
        BF["scripts/backfill-birth-mahadasha.ts (NEW)<br/>npm run db:backfill-birth-md"]
    end
    subgraph consumers["Consumers (unchanged code)"]
        UI["DashaTimeline · DashaPeriodPicker · CopyForAIPanel"]
        DA["durationAnalysis slicer/extractor · /api/timeline · chartSummary"]
        MCP["MCP get_dasha_tree / get_active_dasha"]
        VD["varshaphalDashas.ts (missing-mcp-features)"]
    end
    CV --> BM --> CP
    CV --> IC
    CV -->|from-compute save| UC
    BF -->|rewrites mahadashas[0].antardashas| UC
    BM --> BF
    UC --> UI & DA & MCP
    CV --> DA & VD
```

## Algorithm

`computeVimshottari` is unchanged up to the MD loop. For the birth MD
(`i === 0`) it calls `computeBirthMahadashaAntardashas(lord, birth, balanceDays)`:

1. `fullDays = DASHA_YEARS[lord] × YEAR_DAYS`.
2. `fullStart = birth + (balanceDays − fullDays)` — before birth by the elapsed time.
3. `end = birth + balanceDays` — the same `addDays` call as the MD's own `end`, so
   the two are identical to the millisecond.
4. Lay out the nine full-length ADs from `fullStart` with the existing
   `computeAntardashas`, and each AD's nine PDs with the existing
   `computePratyantardashas`, over the **unclipped** AD.
5. `clipPeriods(ads, birth, end)`, then `clipPeriods(ad.pratyantardashas, birth, end)`
   for each surviving AD.

`clipPeriods` keeps a period's object when it is not cut, gives a cut period
`start = max(start, birth)`, `end = min(end, mdEnd)` and
`duration_days = (end − start) / 86 400 000`, and drops a period whose clipped length
is zero or less. It never mutates its input.

Step 5 of `computeVimshottari` (PDs for every MD) now skips the birth MD, whose PDs
were laid out in step 4.

### Worked example (1990-04-27 12:00 IST, Delhi)

Moon 42.7665°, Rohini (40°–53.333°), Elapsed_Fraction 0.2075, so 2.075 of the Moon
MD's 10 years ran before birth and the balance is 7.925 years.

| AD (full Moon MD) | Years | Runs (years into full MD) | After clipping |
|---|---|---|---|
| Moon | 0.833 | 0.000–0.833 | dropped |
| Mars | 0.583 | 0.833–1.417 | dropped |
| **Rahu** | 1.500 | 1.417–2.917 | birth → +0.842 y |
| Jupiter | 1.333 | 2.917–4.250 | full |
| Saturn | 1.583 | 4.250–5.833 | full |
| Mercury | 1.417 | 5.833–7.250 | full |
| Ketu | 0.583 | 7.250–7.833 | full |
| Venus | 1.667 | 7.833–9.500 | full |
| Sun | 0.500 | 9.500–10.000 | full |

Inside the Rahu AD, 0.658 years have run at birth. Its PDs are Rahu 0.225,
Jupiter 0.200 (to 0.425) and Saturn 0.2375 (to 0.6625), so **Saturn** is running:
Moon / Rahu / Saturn. The old layout started the balance with Moon / Moon / Moon.

At the 1997 Varsha Pravesh, 9.075 years into the full Moon MD, the AD is Venus
(7.833–9.500). 1.242 years into Venus, the PD is Saturn (1.069–1.333):
Moon / Venus / Saturn. The old layout gave Moon / Venus / Jupiter.

## Data Model

No schema or type change. The `DashaTree` JSON shape is the same; only the birth MD's
`antardashas` differ:

| Field | Before | After |
|---|---|---|
| `balance_years`, MD `lord/start/end/duration_days` | — | unchanged |
| `mahadashas[0].antardashas.length` | 9 | 1–9 (ADs that ended before birth are dropped) |
| `mahadashas[0].antardashas[0].lord` | always the MD lord | the AD running at birth |
| first AD's `start` | birth | birth (clipped) |
| first AD's `duration_days` | balance × lord years / 120 | its clipped length |
| later ADs of MD 1 | compressed | full length |
| `pratyantardashas` of MD 1 | compressed | full length, first AD's clipped |
| MDs 2–9 | — | unchanged |

`computeBirthMahadashaAntardashas` is exported for the backfill script, alongside
the already-exported `computePratyantardashas`.

## Integrity Checks

- **Check 1** (MD contiguity) — unchanged.
- **Check 2** (updated) — each MD's ADs start at the MD start and run contiguously
  (within 1 s, like check 1), and their `duration_days` sum to the MD's (within 1
  day). For the birth MD this means the clipped ADs start at birth and sum to the
  balance. The contiguity part is new: the sum alone would pass a shifted layout.
- **Check 3** (total) — unchanged.

## Backfill (`scripts/backfill-birth-mahadasha.ts`)

Modelled on `scripts/backfill-pratyantardashas.ts`; run with
`npm run db:backfill-birth-md` (add `-- --dry-run` to report without writing).

- **Source of truth is the stored birth MD.** `lord`, `start` (birth) and
  `duration_days` (balance; `end − start` if missing) feed
  `computeBirthMahadashaAntardashas`. `UnifiedChart.moonLongitude` is
  `Decimal(8,4)`; recomputing from it would move the balance by up to ~0.05 days
  and the dates of MDs 2–9 with it. Using the stored MD means the result equals what
  the fixed engine returns for the original full-precision Moon (a test checks this).
- **Only `mahadashas[0].antardashas` is replaced.** Nothing else in the tree is
  touched.
- **Idempotent.** The rebuilt ADs are compared with the stored ones field by field
  (lord, start/end instants, `duration_days` within 1e-9 days, and the same for every
  PD), not with `JSON.stringify`, because JSONB returns keys in its own order. A
  match means no write.
- **Unusable trees are skipped**: no MDs, an unknown lord, unparseable dates, a
  non-positive balance, or a balance longer than the lord's full MD.
- **No connect on import.** `PrismaClient` is created inside `main()`, and `main()`
  runs only when `process.argv[1]` names the script — the same guard as
  `scripts/load-places.ts` — so the test can import `repairBirthMahadasha`.
- **Order with `db:backfill-pd` does not matter.** That script only fills ADs with
  no PDs; this one rebuilds the birth MD's PDs itself.

Not backfilled, by decision (requirements.md, Decisions Log):

| Store | Why not |
|---|---|
| `Wave1Cache.dashaTree` | Write-only snapshot; the analyze route recomputes the tree on every run. |
| `SavedChart.dashaTree` | Legacy and unread; `db:migrate-saved` recomputes when promoting. |
| `PipelineRun` reports, `DurationAnalysis` rows | LLM output generated from the old periods. Re-run the analysis if it covers the first MD. |

## Consumer Audit

Every consumer finds periods by time (`start <= t < end`) or by overlap with a
range. None assumes nine ADs per MD or that the first AD belongs to the MD lord.

| Consumer | How it reads the tree | Result |
|---|---|---|
| `app/components/DashaTimeline.tsx` | MD bar widths from MD `duration_days`; lists `md.antardashas` / `ad.pratyantardashas`; current period via `isActive(start, end)` | Shows the clipped birth MD; no change |
| `app/components/DashaPeriodPicker.tsx` | Pills from `md.antardashas` / `ad.pratyantardashas`; row hidden when empty | Fewer pills for MD 1; no change |
| `app/components/CopyForAIPanel.tsx` | Copies the tree as-is | No change |
| `engine/durationAnalysis/slicer.ts` | PD overlap with the date range | No change |
| `engine/durationAnalysis/extractor.ts`, `/api/timeline` | Pass the stored tree to the slicer | No change |
| `engine/durationAnalysis/index.ts` | Matches slices by MD/AD/PD lord triple | Triples stay unique; no change |
| `engine/chartSummary.ts` | Current MD/AD/PD by `now` in [start, end) | No change |
| `mcp/src/chart.ts` `activeDashaChain` | `findRunning` by [start, end) | No change |
| `engine/compute/varshaphalDashas.ts` | Overlap with the Varsha year; chain at Varsha Pravesh by [start, end) | No change; its natal chain is now correct |

## Testing Strategy

`tests/vimshottari-birth-mahadasha.test.ts`:

- **Known charts** through `computeFullChart` (and `computeVarshaphal` for the 1997
  Varsha Pravesh) — the four cases in Requirement 6.1.
- **Independent oracle.** Its own copy of the Vimshottari table, plain millisecond
  arithmetic, and the full birth MD started at `birth − fraction × years`. It walks
  MD → AD → PD to the instant and reports the distance to the nearest boundary of the
  *unclipped* layout. The sweep covers 27 nakshatras × 7 elapsed fractions × 2 births
  (1990 and 1948, a negative timestamp) × 161 instants (birth, 120 in the birth MD,
  40 across the tree). Instants within 1 s of a boundary are skipped, because the
  engine's Dates are millisecond-truncated.
- **Invariants** for every swept Moon: birth MD starts at birth with the balance;
  ADs and PDs are contiguous, start at or after birth and sum to their parent; the
  last AD is the full AD of the lord before the MD lord; MDs 2–9 have nine ADs and
  PDs led by their own lord; zero elapsed keeps the full nine-AD layout.
- **Backfill**: an old-layout tree is rebuilt into exactly the new engine output;
  JSONB key order and an already-fixed tree give no write; a birth MD stored
  without PDs is filled; unusable trees are skipped.

All of these except the invariants fail against the pre-fix engine (9 of 202
tests), and pass after it.

## Measured Impact

Old vs new over 2000 uniformly random Moon longitudes (one birth), 200 random
instants each in the birth MD and in the first 20 years of life:

| Measure | Changed |
|---|---|
| AD at birth | 88.2% of charts |
| AD or PD at birth | 98.9% of charts |
| AD at a random instant in the birth MD | 75.3% |
| AD or PD at a random instant in the birth MD | 95.5% |
| AD in the first 20 years of life | 22.5% |
| AD or PD in the first 20 years of life | 31.9% |

The mean birth MD (balance) was 6.76 years. Charts whose Moon is near the start of
its nakshatra change least.

## Known Limitation (unchanged by this spec)

At an exact nakshatra boundary, `Math.floor(lon / span)` and `lon % span` can
disagree in floating point. For a Moon at exactly 40° the index is Rohini (Moon) but
the remainder is `13.333…`, so the balance is ≈ 0 and Mars MD starts at birth;
the right answer is a full 10-year Moon MD. A Swiss Ephemeris longitude almost never
lands exactly on a boundary, but a 4-decimal stored or pasted longitude (40.0000)
can. Fixing it changes `balance_years`, which this spec keeps fixed, so it is a
separate follow-up (tasks.md 6.3). The oracle sweep avoids exact boundaries.
