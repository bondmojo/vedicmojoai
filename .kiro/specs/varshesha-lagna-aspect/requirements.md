# Requirements Document: Strength-First, Lagna-Aspect-Aware Varshesha (Phase 1 Tajika Aspects)

## Introduction

The Varshaphal engine (`engine/compute/varshaphal.ts`) picks a **Varshesha** (year
lord) from five office-holders (Panchadhikari): the Muntha lord, the Varsha Lagna
lord, the Janma (natal) Lagna lord, the Dinaratri lord and the Trirashi lord.

Before this feature, `computeVarshesha` ranked the five by **how many offices a
planet held**, with Panchavargeeya Bala only as the tie-break, and never checked
whether a candidate aspects the Varsha Lagna. Its own method note said so:
"Favourable-Lagna-aspect override deferred (needs Tajika aspects)". The aspect step
was skipped because the engine had no Tajika aspect code — only Parashari Graha
Drishti in `relationships.ts`, which is a different system.

The rule most Tajika texts give (Tajika Neelakanthi) runs the other way:

1. Find the five office-holders and their Panchavargeeya Bala.
2. The **strongest one that aspects the Varsha Lagna** becomes the year lord. The
   number of offices held only breaks a tie.

This feature adds a small, pure, **sign-based** Tajika aspect module
(`engine/compute/tajikaAspects.ts`) and rewrites `computeVarshesha` to apply that
rule.

> **Status:** implemented on branch `missing-mcp-features` (2026-10-28). This spec
> was written after the implementation to record the requirements, the decisions
> taken, and the verification that is still open (Requirement 7). A code review the
> same day found 11 gaps; all were fixed, including a day/night bug in the existing
> code that fed two of the five offices (Requirement 8). An astrologer review after
> that corrected three Tajika rules: the Trirashi table, conjunction with the Lagna,
> and the Moon's Kshetra in Taurus (Requirement 9).

## Guiding Principle (Tajika Neelakanthi)

Selection follows the Tajika Neelakanthi ordering: strength first, Lagna aspect as
the qualifying condition, office count only as a tie-break. Two points are
**implementation choices, not verified rules** (see Requirement 7):

- Inimical aspects (conjunction, square, opposition) count as "aspecting the
  Lagna", not only friendly ones.
- When no office-holder aspects the Lagna, the strongest of all five is taken.

The repo previously described JHora's method as "lordship count + favourable-Lagna-
aspect override + Panchavargeeya tiebreak". That description was never checked
against a JHora year-lord screen and is now marked unverified rather than asserted.

## Non-Goals

- **Deeptamsha orbs and applying/separating motion** (Phase 2). Aspects in this
  feature are decided by sign distance alone.
- **Tajika yogas** (Ithasala, Ishrafa, Nakta, Yamaya, Kamboola, …), **Sahams**,
  **Mudda / Patyayini dashas**, **Tri-pataki chakra**.
- **Panchavargeeya Bala scale reconciliation** against JHora (still Tier C item 9 in
  `docs/computation_varshaphal.md`).
- **Persistence.** Varshaphal stays stateless and on-demand; no DB change.
- **Claiming JHora parity** for the year lord. This needs a reference screen
  (Requirement 7).

## Glossary

- **Office_Holders** — the five Varshesha candidates (Panchadhikari). Day/night for
  the Dinaratri and Trirashi offices comes from the Varsha Pravesh: the annual Sun
  above the horizon, judged against the Ascendant degree (Requirement 8).
- **PV** — Panchavargeeya Bala, the Tajika 5-fold strength on the 0–20 scale
  (`PanchavargeeyaBalaEntry.finalBala`, rounded to 2 decimals).
- **Sign_Distance** — the inclusive count from one sign to another, where the same
  sign is 1 (the same arithmetic as the Muntha house count).
- **Tajika_Sign_Aspect** — an aspect decided by Sign_Distance: conjunction (1),
  sextile (3/11), trine (5/9), square (4/10), opposition (7).
- **Aspect_Engine** — the new pure module `engine/compute/tajikaAspects.ts`.
- **Selection_Basis** — which branch picked the winner: `aspects_lagna` or
  `no_candidate_aspects_lagna`.

## Requirements

### Requirement 1 — Pure, sign-based Tajika aspect function

**User story:** As an engine maintainer, I want a single pure function that says
whether two signs are in Tajika aspect, so that the Varshesha rule (and later the
Phase 2 orb work) builds on one tested source of truth.

**Acceptance criteria:**
1. WHEN `getTajikaSignAspect(fromSign, toSign)` is called with sign numbers 1–12,
   THEN it SHALL return `{ kind, nature, distance }` where `distance` is the
   Sign_Distance from `fromSign` to `toSign`, and:
   - 1 (same sign) → `conjunction`, `inimical` (paired with the opposition as the
     open inimical aspect, pratyaksha shatru)
   - 3 or 11 → `sextile`, `friendly`
   - 5 or 9 → `trine`, `friendly`
   - 4 or 10 → `square`, `inimical`
   - 7 → `opposition`, `inimical`
2. WHEN the Sign_Distance is 2, 6, 8 or 12, THEN it SHALL return `null`.
3. Aspects SHALL be mutual: swapping the arguments SHALL give the same `kind` and
   `nature`.
4. WHEN either argument is not an integer in 1–12, THEN it SHALL return `null` and
   SHALL NOT throw.
5. The Aspect_Engine SHALL perform no LLM call, network, DB or file I/O, and SHALL
   NOT reuse or alter the Parashari Graha Drishti tables in `relationships.ts`.
6. The Aspect_Engine SHALL stay purely geometric: rule-specific policy (which
   aspects count for the Varshesha) SHALL live with the rule, not in this module.
7. The aspect table SHALL be frozen at runtime, and `getTajikaSignAspect` SHALL
   return a copy, so no caller can change later results.

### Requirement 2 — Strength-first Varshesha selection

**User story:** As a practitioner, I want the year lord picked by the Tajika rule,
so that a strong planet aspecting the Varsha Lagna is not outranked by a weaker
planet that merely holds more offices.

**Acceptance criteria:**
1. The five Office_Holders and how they are derived SHALL be unchanged.
2. A candidate SHALL qualify WHEN its annual-chart sign has a Tajika_Sign_Aspect to
   the Varsha Lagna sign AND that aspect's `nature` is listed in
   `VARSHESHA_LAGNA_ASPECT_NATURES` in `varshaphal.ts` (default: `friendly` and
   `inimical`).
3. WHEN at least one candidate qualifies, THEN the winner SHALL be the qualifying
   candidate with the highest PV; equal PV SHALL go to the higher office count, then
   to office priority order (Muntha lord, Varsha Lagna lord, Janma Lagna lord,
   Dinaratri lord, Trirashi lord).
4. WHEN no candidate qualifies, THEN the same ranking SHALL run over all five
   candidates and Selection_Basis SHALL be `no_candidate_aspects_lagna`.
5. A candidate whose planet sits in the Varsha Lagna sign SHALL qualify by
   conjunction (an inimical aspect), so a Varsha Lagna lord in its own Lagna can be
   year lord.
6. PV SHALL be compared at the rounded value the result already reports, so that a
   tie a practitioner can see on screen is treated as a tie.
7. Switching the rule to friendly-only SHALL need a code change to
   `VARSHESHA_LAGNA_ASPECT_NATURES` alone. The `method` note SHALL be built from
   that list. Docs and this spec describe the current setting and are edited by
   hand when it changes.

### Requirement 3 — Additive result schema

**User story:** As an API or MCP consumer, I want to see why a planet won, without
any existing field changing shape.

**Acceptance criteria:**
1. Each `VarsheshaCandidate` SHALL carry `officeCount: number`,
   `lagnaAspect: TajikaSignAspect | null` (the raw aspect, whether or not it
   counts) and `aspectsLagna: boolean` (whether it counts for selection).
2. `VarshaphalResult.varshesha` SHALL carry `lagnaAspect: TajikaSignAspect | null`
   and `selectionBasis: 'aspects_lagna' | 'no_candidate_aspects_lagna'`.
3. Existing fields SHALL keep their names and types. The `method` string SHALL
   describe the new rule and SHALL NOT say the aspect step is deferred.
4. `POST /api/compute/varshaphal` and the MCP `compute_varshaphal` tool SHALL pass
   the new fields through with no route change. The MCP cost guard
   (`tests/mcp-cost-guard.test.ts`) SHALL still pass.

### Requirement 4 — Varshaphal tab display

**User story:** As a practitioner, I want to see each candidate's aspect to the
Lagna, so that I can check the year-lord pick by eye.

**Acceptance criteria:**
1. Each candidate card SHALL show its Lagna aspect ("Trine to Lagna · friendly",
   "Square to Lagna · inimical") or "No aspect to Lagna", styled by nature. An
   aspect that does not count SHALL be shown with "(not counted)", never hidden.
2. A candidate holding more than one office SHALL show "×N offices".
3. The Varshesha card SHALL show the winner's Lagna aspect, or, WHEN Selection_Basis
   is `no_candidate_aspects_lagna`, a note that no office-holder aspects the Lagna.
4. Every candidate card belonging to the winning planet SHALL be highlighted, not
   only the card for its first office.
5. The UI SHALL use the engine's `TajikaSignAspect` type rather than a local copy.

### Requirement 5 — Verification

**User story:** As a maintainer, I want the rule pinned by tests that do not depend
on ephemeris output, so that a later change cannot quietly revert it.

**Acceptance criteria:**
1. An exhaustive test SHALL cover all 144 sign pairs for Requirement 1.
2. Hand-built `computeVarshesha` tests SHALL cover:
   - a strong single-office planet beating a weaker two-office planet;
   - the strongest planet losing because it does not aspect the Lagna, even with
     two offices;
   - a candidate in the Varsha Lagna qualifying by conjunction, and a Varsha Lagna
     lord in its own Lagna winning;
   - the no-aspect fallback;
   - a PV tie broken by office count;
   - a full tie (equal PV and offices) broken by office order, set up so that
     alphabetical order would give a different answer;
   - a candidate missing from the annual planets not qualifying.
3. A real-chart invariant SHALL check years 2024–2026 for the existing test birth.
   Expected aspects SHALL come from each planet's whole-sign house (computed by
   `planets.ts`), not from `getTajikaSignAspect`, and the expected winner from an
   oracle written from this rule, including office and tie-breaks.
4. The full Vitest suite, ESLint and `tsc --noEmit` SHALL pass on Node 20 (the
   version pinned in `.nvmrc`).
5. An informational old-vs-new comparison across 1990–2040 SHALL be run and its
   result recorded in the design.

### Requirement 6 — Documentation sync

**Acceptance criteria:** updated in the same change, per `Claude.md`'s table:
`docs/computation_varshaphal.md`, `docs/HLD.md`, `docs/DFD.md`,
`skills/backend/compute-engine.md`, `.kiro/skills/nextjs-project-structure.md`
(engine/compute tree), `Claude.md`, `docs/RELEASE_NOTES.md`, and the MCP
`compute_varshaphal` description. No `docs/ERD.md` change (nothing persisted).

### Requirement 7 — Open verification (gate before claiming parity)

**User story:** As the product owner, I want the unverified parts of the rule kept
visible, so that nobody presents the year lord as JHora-identical before it is
checked.

**Acceptance criteria:**
1. `docs/computation_varshaphal.md` §7 SHALL keep an open item to verify the
   ordering against the Tajika Neelakanthi verse and a JHora year-lord screen.
2. That item SHALL name what is still unverified: whether inimical aspects
   (conjunction, square, opposition) qualify for the Lagna check; the
   strongest-of-five fallback and any Moon exception in it; the Sagittarius night
   Trirashi lord; and the Panchavargeeya friendship table, Drekkana type and
   dignity fractions.
3. `docs/RELEASE_NOTES.md` SHALL state that the year lord can change for an
   existing chart and year.

### Requirement 8 — Horizon-based day/night of the Varsha Pravesh

**User story:** As a practitioner, I want a year that begins just after sunrise
counted as a day year, so that the Dinaratri and Trirashi offices, and therefore
the year lord, are right for charts cast near the horizon.

**Acceptance criteria:**
1. `dayVarsha` SHALL be true WHEN the annual Sun's longitude lies 180°–360° ahead
   of the annual Ascendant longitude (`isSunAboveHorizon`), and false otherwise.
2. It SHALL NOT be derived from whole-sign houses. A Sun in the Lagna sign that has
   already risen SHALL count as day; a Sun in the 7th sign that has already set
   SHALL count as night.
3. Unit tests SHALL cover both of those cases and the 0°/360° wrap, and regression
   tests SHALL pin one real chart of each kind from the test birth.
4. The release notes SHALL record the fix, since it can change `dayVarsha`, the
   Dinaratri and Trirashi lords, and the year lord for existing charts.

### Requirement 9 — Tajika rule corrections (astrologer review)

**User story:** As a practitioner, I want the office-holders and their strengths to
follow the Tajika rules a senior astrologer would apply, so that the year lord is
the one the texts give.

**Acceptance criteria:**
1. The Trirashi lord SHALL come from the Tajika Neelakanthi per-sign table
   (`getTrirashiLord(varshaLagnaSignNumber, dayVarsha)`): for each element, the
   first sign takes the day/night triplicity pair, the second sign swaps it, and the
   third sign takes the participating ruler by day and night. Sagittarius by night
   SHALL be Saturn, with the source disagreement documented.
2. Kshetra Bala SHALL be the planet's naisargika dignity toward the lord of its sign,
   with no moolatrikona credit. The Moon in Taurus SHALL score 7.5, not 30.
3. A planet in the Varsha Lagna SHALL count as aspecting it (Requirement 1.1, 2.5).
4. Tests SHALL pin all 24 Trirashi cells against a table written in the test file,
   the real-chart Trirashi office for 2024–2026, the Kshetra scores including the
   Moon in Taurus, and the 2026 test-birth year whose year lord this changes (Virgo
   Lagna by day: Moon is Trirashi lord, Mars is year lord).
5. The release notes SHALL say the year lord can change again for existing charts.

### Requirement 10 — Annual-chart Sade Sati from the natal Moon

**User story:** As a practitioner reading a Varshaphal through MCP, I want Sade Sati
judged from my natal Moon at the start of the year, so that it does not change with
the year I ask for or the day I ask.

**Acceptance criteria:**
1. `annualChart.transits` SHALL be computed from the natal Moon (sign and longitude)
   and natal Lagna, with `asOf` equal to the Varsha Pravesh instant.
2. The Sade Sati period list SHALL be the same for any Varsha year of one birth.
3. Transit `houseFromMoon` / `houseFromLagna` SHALL count from the natal Moon and
   Lagna.
4. Tests SHALL pin these on the test birth (natal Moon Taurus): inactive at the 2026
   Varsha Pravesh, active at the 2030 one.

## Decisions Log (informational)

Taken with the product owner on 2026-10-28, before implementation:

| Question | Decision |
|---|---|
| Which aspects count as "aspecting the Varsha Lagna"? | Any Tajika aspect, friendly or inimical, tagged by nature. Reconfirmed after the impact run showed inimical aspects decide about a third of years. |
| What if no office-holder aspects the Lagna? | Strongest of the five, office count as tie-break. |
| How much of the aspect layer to build now? | Phase 1: sign-based module only. Deeptamsha orbs follow in Phase 2. |
| Fix the 11 code-review findings? | Yes, all of them, including the pre-existing whole-sign day/night bug (Requirement 8). |
| Fix the Varshaphal Sade Sati? | Yes: natal Moon and Lagna, evaluated at the Varsha Pravesh (Requirement 10). |
| Fix the astrologer-review findings? | Yes: Neelakanthi Trirashi table, a planet in the Lagna counts as a conjunction (reverses the earlier "conjunction is not an aspect" choice), no moolatrikona in Kshetra (Requirement 9). |

## Dependency Map (informational)

- **Phase 2** (deeptamsha orbs, applying/separating) extends `tajikaAspects.ts` and
  unblocks Ithasala/Ishrafa yogas, then Sahams and Mudda dasha (Tier D in
  `docs/computation_varshaphal.md`).
- A JHora year-lord screen for one known chart would close Requirement 7 and the
  PV scale reconciliation (Tier C item 9) together.
