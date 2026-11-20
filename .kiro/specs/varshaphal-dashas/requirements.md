# Requirements Document: Varshaphal Dashas (Natal Vimshottari + Tajika Mudda)

## Introduction

The Varshaphal (`engine/compute/varshaphal.ts`) casts the Tajika annual chart and
picks the year lord, but it carries no dasha. A practitioner reads an annual chart
against two timelines:

1. **The natal Vimshottari dasha running through the year** — the Mahadasha,
   Antardasha and Pratyantardasha that set what the year can deliver. The engine
   already computes the full natal tree (`engine/computeVimshottari.ts`), but the
   Varshaphal never consults it; over MCP, `get_active_dasha` gives only one date.
2. **Tajika Mudda dasha** — the Vimshottari sequence compressed into the Varsha year,
   used to time events within it. It is not implemented (`docs/computation_varshaphal.md`
   §2, Tier D item 11).

This feature adds both to `VarshaphalResult`, the Varshaphal tab and the MCP
`compute_varshaphal` tool.

> **Status:** implemented on branch `missing-mcp-features` (2026-10-28).

## Guiding Principle

- **Reuse the natal tree.** The natal periods come from the same `computeVimshottari`
  call the chart pages use (same Moon longitude, same UTC birth instant), so the
  Varshaphal never disagrees with the Dasha tab.
- **Mudda dasha follows the classical Tajika rule** for its starting lord (Janma
  nakshatra + completed years). Two points are method choices documented as
  unverified (Requirement 6): the first period's balance, and the year length.
- **Pure and stateless.** No DB, no LLM, no persistence; dates are ISO-8601 UTC strings.

## Non-Goals

- **Patyayini dasha** (depends on Tajika conventions still to be verified).
- **Mudda pratyantardashas** (a 360-day year makes them hours to days long).
- A dasha-aware **year-lord** rule or interpretation. Reading the two timelines is
  left to the practitioner or to Claude Desktop.
- Persistence or a new route.

## Glossary

- **Varsha_Year** — from this Varsha Pravesh (solar return) to the next one.
- **Natal_Tree** — the 120-year Vimshottari tree from the natal Moon longitude and the
  UTC birth instant.
- **Mudda_Dasha** — Vimshottari compressed into the Varsha_Year: each lord's share is
  its Vimshottari years ÷ 120 of the year.
- **Janma_Nakshatra_Number** — the natal Moon's nakshatra counted from Ashwini = 1.
- **Balance_Fraction** — the part of the natal Moon's nakshatra still to run at birth
  (1 − position in the nakshatra), as used for the natal Vimshottari balance.

## Requirements

### Requirement 1 — Natal Vimshottari through the Varsha year

**User story:** As a practitioner, I want to see which natal Mahadasha, Antardasha and
Pratyantardasha run during the Varsha year, so that I can read the annual chart
against the dasha.

**Acceptance criteria:**
1. The result SHALL carry the MD/AD/PD chain running at the Varsha Pravesh, or `null`
   WHEN the Varsha Pravesh is outside the Natal_Tree.
2. It SHALL list every antardasha (with its mahadasha) and every pratyantardasha (with
   its mahadasha and antardasha) that overlaps the Varsha_Year, in time order, with
   their true start and end dates (not clipped to the year).
3. The Natal_Tree SHALL be computed exactly as `POST /api/compute` computes it: the
   natal Moon's sidereal longitude and the UTC birth instant (local time minus the
   timezone offset).
4. WHEN the Varsha_Year lies outside the Natal_Tree, THEN the lists SHALL be empty and
   the computation SHALL NOT throw.

### Requirement 2 — Mudda dasha

**User story:** As a practitioner, I want the Tajika Mudda dasha for the year, so that
I can time events within it.

**Acceptance criteria:**
1. The starting lord SHALL be found by the classical rule: (Janma_Nakshatra_Number +
   completed years − 2) mod 9, where 1 = Sun, 2 = Moon, 3 = Mars, 4 = Rahu,
   5 = Jupiter, 6 = Saturn, 7 = Mercury, 8 = Ketu and 0 = Venus. At age 0 this is the
   natal nakshatra lord, and it advances one Vimshottari step per year.
2. Each lord's full period SHALL be its Vimshottari years ÷ 120 of the Varsha_Year
   length, in Vimshottari order from the starting lord.
3. The starting lord's first period SHALL run for Balance_Fraction of its full length;
   the rest of that period SHALL close the year, so the periods exactly fill the
   Varsha_Year. A zero-length remainder SHALL be omitted.
4. The Varsha_Year length SHALL be the time from this Varsha Pravesh to the next.
5. Each period SHALL carry its nine antardashas in Vimshottari proportion, starting
   with the period's lord, clipped to the part of the period inside the year.
6. Each period SHALL say whether it is `full`, the opening `balance`, or the closing
   `remainder`.
7. The module SHALL be pure and SHALL NOT throw for any finite Moon longitude in
   0–360, non-negative age and a year end after the year start.

### Requirement 3 — Result schema and MCP

**Acceptance criteria:**
1. `VarshaphalResult` SHALL gain `dashas: { natalVimshottari, mudda }`; no existing
   field SHALL change.
2. The `method` note SHALL describe both dashas and the Mudda conventions.
3. `POST /api/compute/varshaphal` SHALL pass the new field through with no route
   change; the MCP `compute_varshaphal` description SHALL mention it, and the MCP cost
   guard SHALL still pass.

### Requirement 4 — Varshaphal tab

**Acceptance criteria:**
1. The tab SHALL show the natal MD/AD/PD at the Varsha Pravesh and a table of the
   antardashas overlapping the year, with the pratyantardashas available on demand.
2. The tab SHALL show the Mudda dasha periods with dates, days and the
   balance/remainder marking, with each period's antardashas available on demand.
3. Dates SHALL be shown in the birth timezone, like the Varsha Pravesh time.

### Requirement 5 — Verification

**Acceptance criteria:**
1. The Mudda starting lord SHALL be tested against the classical formula, written
   independently in the test, for all 27 nakshatras over a range of ages.
2. Tests SHALL check that Mudda periods tile the year exactly, follow Vimshottari order
   and proportions (including the classical 360-day table when the year is 360 days),
   and that antardashas tile each period.
3. Tests SHALL check the natal slice against a `computeVimshottari` tree: overlap, order,
   the chain at the Varsha Pravesh, and an out-of-range year.
4. A real-chart test SHALL check that the Mudda year runs from this Varsha Pravesh to
   the next and that its starting lord advances one step a year.
5. The full suite, ESLint and `tsc --noEmit` SHALL pass on Node 20.

### Requirement 6 — Open verification

**Acceptance criteria:**
1. `docs/computation_varshaphal.md` SHALL list as unverified: the first-period balance
   (natal Balance_Fraction, with the remainder closing the year) and the year length
   (return to return, where the classical table assumes 360 days).
2. The docs SHALL say Patyayini dasha is still not implemented.

### Requirement 7 — Documentation sync

**Acceptance criteria:** updated in the same change: `docs/computation_varshaphal.md`,
`docs/HLD.md`, `docs/DFD.md`, `skills/backend/compute-engine.md`,
`skills/backend/api-routes.md`, `.kiro/skills/nextjs-project-structure.md`, `Claude.md`,
`docs/RELEASE_NOTES.md`, and the MCP `compute_varshaphal` description. No `docs/ERD.md`
change (nothing persisted).

## Decisions Log (informational)

| Question | Decision |
|---|---|
| Which dashas? | Natal Vimshottari MD/AD/PD through the year, and Tajika Mudda dasha (2026-10-28, product owner). |
| Mudda year length | This Varsha Pravesh to the next, so the periods end at the next return. The classical 3-days-per-year table (360 days) gives the proportions. |
| Mudda first-period balance | The natal Balance_Fraction, with the rest of that period closing the year. |
| Natal period dates | True period bounds, not clipped to the year, so a practitioner sees when each period really begins and ends. |
