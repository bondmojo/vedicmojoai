# Requirements Document: Marriage Matchmaking (Kundli Milan / Guna Milan)

## Introduction

VedicMojoAI today analyzes **one chart at a time**. `UnifiedChart` is single-owner,
single-native, and every deterministic compute module in `engine/compute/` (and
every LLM wave) takes exactly one chart's geometry as input — including the
existing `wave2_2g_marriage.md` (Wave 2-G) agent, which assesses **one person's**
marriage timing, spouse characteristics, and compatibility *indicators* from their
own D1/D9/dasha, not a comparison against a second person's chart.

This feature adds a genuinely new capability: **compatibility matching between two
charts** — classical Vedic horoscope matching (Kundli Milan), the practitioner
workflow of scoring a prospective bride/groom (or any two partners) against each
other before marriage. The core deliverable is the **Ashtakoota Guna Milan**
system — the traditional 8-factor, 36-point North Indian matching method — plus
**Mangal Dosha (Kuja Dosha)** compatibility between the two natives.

This is the first feature to operate on **two `UnifiedChart` rows at once**, which
is why it needs its own spec rather than folding into `chart-ui-enhancements` or
`duration-analysis`: it introduces a new relationship (`UnifiedChart` ↔
`UnifiedChart`), a new persisted entity, and a new practitioner workflow (pick two
saved charts, not one).

**Guiding principle — pin to JHora/PyJHora output, and do not misattribute the
36-point system to PVR.** The other compute specs in this repo
(`named-yoga-engine`, `scorer-dynamic-range`, `deterministic-1c-1d`) cite
"classical Parashari per P.V.R. Narasimha Rao" because the techniques they
implement (yogas, dignity, Chara Dasha, Sade Sati) genuinely are treated in that
tradition and are implemented in Jagannatha Hora. **Ashtakoota Guna Milan is
different and this spec must not borrow that framing uncritically:**

1. **The weighted 36-point Ashtakoota system is not a Parashari/PVR
   construction.** The 1/2/3/4/5/6/7/8 point allocation is a later North Indian
   codification popularized through muhurta and almanac (panchanga) tradition.
   Calling it "classical Parashari (PVR)" would be a misattribution.
2. **PVR's own doctrinal position is skeptical of mechanical koota counting.**
   His writing treats koota matching as a coarse first-pass screen, not the
   determinant, and directs the real judgment to each native's own 7th
   house / Venus / Jupiter condition, the D9, Kuja Dosha with proper
   cancellation, and the two natives' running dashas. A spec that presents a
   36-point total as *the* answer is not following PVR even though it computes
   numbers PVR's software will display.
3. **Jagannatha Hora's matching table is broader than 8 kootas.** It presents
   both the North Indian Ashtakoota and South Indian kutas (Rajju, Vedha,
   Mahendra, Stree Deergha, Dina) side by side. So restricting v1 to 8 kootas is
   a legitimate **scope cut**, but it must be stated as a scope cut — not, as an
   earlier draft of this document did, justified "per the Guiding Principle," which
   had it backwards.

**What this spec therefore commits to:** the *numbers* SHALL be pinned to
Jagannatha Hora / **PyJHora's compatibility module** output, exactly as
`divisional.ts` pins D2 to `PyJHora charts.py`, `shadbala.ts` pins the required-
Shadbala table to JHora, and `transits.sadeSati.test.ts` pins Sade Sati to "PVR
Narasimha Rao's implementation." Where a koota table has competing variants in
circulation (Requirement 12), the variant SHALL be chosen to match JHora output
and the choice recorded in a `docs/computation_matchmaking.md` written in the same
style as the existing `docs/computation_*.md` files, including a
**KNOWN DIVERGENCE** table where our output differs — the convention
`docs/computation_chara_dasha.md` already establishes.

**Reuse, don't recompute.** This feature is a **pure derivation over two
already-stored charts** — it MUST NOT call the ephemeris again, mirroring the rule
the `named-yoga-engine` spec imposes on itself relative to `relationships.ts`.
Specifically:

- The 8 kootas need only **`UnifiedChart.moonLongitude`**, a required scalar
  column present on *both* ingestion paths — so Guna Milan works for paste
  charts too (Requirement 1a, NFR-6).
- Mangal Dosha additionally needs Mars/Venus/lagna house positions from the
  `planets` JSONB, and the nakshatra/dignity/friendship helpers in
  `engine/compute/nakshatras.ts` and `engine/compute/dignity.ts` — compute-path
  only (Requirement 1b).

## Non-Goals

Explicitly **out of scope** for v1:

- **The South Indian Porutham system — Rajju, Vedha, Mahendra, Stree Deergha,
  Dina.** v1 targets the North Indian 8-factor (36-point) Ashtakoota system only.

  **This is a cut to one of two distinct systems, not a subset of one system.**
  The distinction matters and is easy to get wrong (unlike North/South *chart
  diagrams*, which are purely a rendering choice over identical data — cf.
  `app/components/NorthIndianChart.tsx` vs `SouthIndianChart.tsx`, both fed by
  one `ChartData`). North and South matchmaking read the same raw inputs (both
  natives' Moon nakshatra and Moon rashi) but are **not** two presentations of
  one calculation:
  - **Partially overlapping factor sets.** Gana, Yoni, Bhakoot/Rasi,
    Graha Maitri/Rasyadhipathi, and Vashya/Vasya appear in both (some under
    different names). **Varna and Nadi are North-only; Rajju, Vedha, Mahendra,
    and Stree Deergha are South-only.** Tara and Dina are related but use
    different favorable/unfavorable sets.
  - **Different scoring models.** Ashtakoota sums *weighted* points to 36 against
    a numeric threshold. Porutham is largely *pass/fail per factor*, with certain
    poruthams treated as near-mandatory regardless of how many others pass.
  - **Therefore different verdicts on the same pair.** Rajju — absent from
    Ashtakoota entirely — is often a hard reject in the South; Nadi — 8 of 36 and
    frequently a hard reject in the North — carries far less weight in the
    Southern set. A pair can score highly on Ashtakoota and still fail Rajju.

  Consequence: a practitioner working in the Southern tradition does not get a
  *reduced* answer from v1 — they get the **wrong framework**. So (a) the UI
  SHALL label its output as Ashtakoota / North Indian rather than as a generic
  "compatibility score"; (b) `docs/computation_matchmaking.md` SHALL record the
  Porutham system's absence as a known gap vs. JHora (which computes both, and
  displays two tables because it runs two systems — not because it renders one
  result twice); and (c) the schema/registry SHALL be extensible for a later
  Porutham addition, same posture as `named-yoga-engine`'s deferred Nabhasa
  yogas.
- **Western/tropical synastry** (aspect grids, composite charts, Davison charts).
  Not a Vedic practice; unrelated to this feature.
- **Muhurta / auspicious wedding-date selection.** A separate, already-distinct
  practitioner concern (timing an event), not matching two natives. May become a
  follow-on feature that *consumes* a completed match, but is not built here.
- **LLM narrative interpretation of a match** (e.g. a Wave-style "why this pairing
  works" essay). v1 emits structured, deterministic scoring + evidence only —
  same separation `named-yoga-engine` draws between detection and narrative. A
  future wave/agent MAY consume this feature's output exactly as Wave 2A consumes
  `yogas`, but authoring that agent is not part of this spec.
- **Matching a chart against another practitioner's chart.** Both charts in a
  match MUST belong to the same session user in v1 (see Requirement 6); no
  cross-account sharing, invite links, or "send this match to the other family."
- **Remedies content** (gemstones, pujas, mantras prescribed for a dosha). Only
  the presence/cancellation of a dosha is computed, not remedial prescriptions.
- **Batch/bulk matching** (one chart against many candidates in one call). v1 is
  strictly pairwise, one match at a time.
- **Editing a saved match.** A match is a point-in-time computation; re-running
  produces a new `MatchRequest` row rather than mutating one in place (mirrors
  `PipelineRun` / `DurationAnalysis` being append-only records).

## Glossary

- **Ashtakoota** — the classical 8-factor (`koota`) compatibility system, 36 points
  total, scored from the two natives' Moon nakshatra/rashi and (for Graha Maitri)
  Moon-sign lord.
- **Koota** — one of the 8 scored factors: **Varna** (1 pt max), **Vashya** (2),
  **Tara** (3), **Yoni** (4), **Graha Maitri** (5), **Gana** (6), **Bhakoot** (7),
  **Nadi** (8).
- **Mangal Dosha / Kuja Dosha / Manglik** — an affliction from Mars occupying
  specific houses (classically 1, 2, 4, 7, 8, 12 from lagna, Moon, or Venus,
  depending on school) in a native's chart, relevant to marital harmony and
  traditionally required to be matched or cancelled between the two natives.
- **Dosha cancellation (Bhanga)** — a documented classical exception (e.g. same
  nakshatra pairing for Nadi, specific rashi-pair exemptions for Bhakoot, or a
  benefic association cancelling Kuja Dosha) that nullifies an otherwise-present
  dosha. Evidence-carrying, not a silent override — mirrors `Neechabhanga` in
  `named-yoga-engine`.
- **Native** — one of the two people being matched (Partner A / Partner B; the
  UI MAY label them "Bride"/"Groom" or "Partner 1"/"Partner 2").
- **MatchRequest** — the new persisted entity representing one computed match
  between two `UnifiedChart` rows.
- **Guna score** — the total Ashtakoota points achieved out of 36.
- **PVR_Treatment** — the classical Parashari convention per P.V.R. Narasimha Rao,
  as already referenced by `scorer-dynamic-range` and `named-yoga-engine`.

## Requirements

### Requirement 1 — Pure, deterministic Ashtakoota engine

**User story:** As an engine maintainer, I want Guna Milan scoring to be a pure
function over two already-computed charts' nakshatra/planet data, so that it is
deterministic, auditable, and consistent with the `engine/compute/` purity
guarantee the rest of the engine follows.

**Acceptance criteria:**
1. A new pure module (e.g. `engine/compute/matchmaking.ts`) SHALL expose a
   `computeAshtakootaMatch(nativeA, nativeB)` entry point returning a structured
   `MatchResult`. It SHALL perform no ephemeris call, LLM call, network, DB, or
   file I/O.
1a. **The 8 kootas SHALL take only the Moon's sidereal longitude (plus each
   native's role) as astronomical input — not the `nakshatras` JSONB.** Every
   koota is derived from Moon nakshatra, Moon rashi, and Moon-rashi lord, all of
   which follow from one number. This matters because **`UnifiedChart.moonLongitude`
   is a required, non-nullable scalar column populated on *both* ingestion
   paths** — the paste path derives it from the pasted Moon entry
   (`lib/chart-mapper.ts:149-150`), even though it leaves `nakshatras` null.
   Depending on the `nakshatras` JSONB would therefore make the feature
   needlessly unavailable for every paste chart when the data is in fact
   present. See Requirement 1.5 and NFR-6.
1b. Mangal Dosha (Requirement 3) additionally requires Mars, Venus, and lagna
   **house** positions, which live in the `planets` JSONB — compute-path only.
   This is the one part of the feature that genuinely degrades on paste charts.
1c. **`(nakshatra, pada)` — not nakshatra alone — is the koota input
   granularity, and SHALL be the module's internal interface.** A nakshatra
   spans 13°20′ and can straddle two rashis (Krittika pada 1 falls in Aries,
   padas 2–4 in Taurus), so the pada is what resolves the Moon *rashi* that
   Varna, Vashya, Bhakoot, and Graha Maitri all depend on. The reference
   implementation confirms this: PyJHora's `Ashtakoota` constructor takes
   `(boy_nakshatra_number, boy_paadham_number, girl_nakshatra_number,
   girl_paadham_number)` and its precomputed dataset is keyed over all
   27×4×27×4 combinations (Open Decision 8).
   Practical consequence: `computeAshtakootaMatch` SHALL accept
   `(nakshatra, pada, role)` per native — derived from `moonLongitude` at the
   call site — so that the engine is **directly comparable to the reference
   oracle and testable without any birth data at all** (Requirement 10.3).
2. WHEN the same two inputs are supplied twice (in the same order), THEN the
   output SHALL be byte-for-byte identical.
3. **Ashtakoota is NOT fully symmetric — the engine SHALL be role-aware.**
   **Varna** is directional (the point is awarded when the *groom's* varna is
   equal to or higher than the *bride's*; swapping the two natives changes the
   score), and several circulating **Gana** tables are directional as well
   (bride-Rakshasa/groom-Deva scored differently from the reverse). Therefore:
   - `computeAshtakootaMatch` SHALL take an explicit **bride/groom role** per
     native (Requirement 6.1), never infer it from argument order, and never
     assume symmetry.
   - The symmetry contract SHALL be stated as: swapping the two natives **while
     also swapping their roles** SHALL produce an identical result. Swapping
     positional order *without* swapping roles SHALL be expected to change
     Varna (and possibly Gana) — and a test SHALL pin that asymmetry rather
     than assert it away.
   - Kootas expected to be symmetric (Yoni, Graha Maitri, Bhakoot, Nadi,
     Vashya — and Tara, whose two directional counts are summed) SHALL each be
     individually covered by a symmetry test, so the distinction is explicit in
     the test suite rather than assumed.
   - **Which kootas are directional SHALL be established from the oracle, not
     from this document.** Role-awareness itself is confirmed architecturally:
     PyJHora's `Ashtakoota` constructor is keyed `(boy_nakshatra, boy_paadham,
     girl_nakshatra, girl_paadham)` and its dataset is named
     `all_nak_pad_boy_girl.csv` — a symmetric system would need only half that
     table. Inspection so far confirms directional handling in the
     Tara/Dina count and in the South-only mahendra and sthree-dheerga checks;
     **Varna's and Gana's directionality is asserted here from the classical
     rule and SHALL be verified against oracle output before the tables are
     frozen** (Requirement 10.3). If the oracle disagrees, the oracle wins and
     the divergence is recorded per 10.3a.
4. The engine SHALL reuse `engine/compute/nakshatras.ts` nakshatra/pada/lord data
   and `engine/compute/dignity.ts`'s `PERMANENT_FRIENDSHIP` table. It SHALL NOT
   re-implement nakshatra-index, rashi, or naisargika-friendship derivation.
   **However, the koota *attribute* tables do not exist in this repo today** —
   `NAKSHATRA_DATA` in `nakshatras.ts` carries only `{name, lord}`, and there is
   no rashi→Varna or rashi→Vashya table anywhere in `engine/`. Those new static
   tables are in scope and are specified in Requirement 12.
5. WHEN a required input is missing or malformed, THEN the affected koota(s) or
   dosha check SHALL be skipped/flagged `unavailable` rather than throwing, and
   everything else SHALL still compute — mirroring the degrade-don't-throw
   contract of `yogas.ts` and the scorer. Concretely, per 1a/1b:
   - **Both `source="compute"` and `source="paste"` charts SHALL produce a full
     8-koota `gunaScore`** (`moonLongitude` is always present).
   - **Only Mangal Dosha SHALL degrade** to `unavailable` on a paste chart, and
     WHEN it does, `mangalDoshaCompatibility` SHALL report `unavailable` — never
     be silently reported as `matched` (which would read as an all-clear the
     engine never established).

### Requirement 2 — The 8 Ashtakoota factors

**User story:** As a practitioner, I want the full traditional 8-koota score
computed, so that the match result matches what a client expects from a classical
Kundli Milan and is directly comparable to reference software.

**Acceptance criteria — each koota SHALL be computed per its classical rule and
carry its own point value and max:**
1. **Varna** (max 1) — from each native's Moon-rashi Varna class (Brahmin =
   water signs, Kshatriya = fire, Vaishya = earth, Shudra = air). **Directional:**
   1 point WHEN the groom's Varna rank is equal to or higher than the bride's,
   else 0 (see Requirement 1.3).
2. **Vashya** (max 2) — from each native's Moon-rashi Vashya group (Manav,
   Vanachar, Chatushpad, Jalachar, Keet); scored by the classical group
   compatibility table. **Half-point values (0.5) occur in this table** and SHALL
   be represented exactly, not rounded (see 2.9).
3. **Tara** (max 3) — count from native A's Moon nakshatra to native B's and
   reduce mod 9, then repeat in the reverse direction. A remainder of **3, 5, or
   7** is inauspicious. **Each favorable direction contributes 1.5 points**
   (1.5 + 1.5 = 3). Both directional counts and remainders SHALL be recorded in
   evidence.
4. **Yoni** (max 4) — from each native's Moon-nakshatra Yoni (animal symbol,
   including its fixed male/female gender) scored on the **five-tier** classical
   table: same yoni = 4, friendly = 3, neutral = 2, enemy = 1, **bitter/mortal
   enemy = 0**. (An earlier draft of this document listed only four tiers and
   omitted the 0-point case — the zero tier is mandatory.)
5. **Graha Maitri** (max 5) — from the **naisargika (permanent) friendship only**
   between the two Moon-rashi lords, read from `engine/compute/dignity.ts`'s
   exported `PERMANENT_FRIENDSHIP` table. It SHALL **NOT** use
   `getVargaDignityLabel` or any panchadha/compound friendship: that function
   blends *tatkalika* (temporary, position-derived) friendship per its own file
   header, which is the wrong relation for this koota. `relationships.ts` is not a
   source here — it exports only `NATURAL_BENEFICS`/`NATURAL_MALEFICS`, no
   friendship table. Graded values include **0.5**, so 2.9 applies.
6. **Gana** (max 6) — from each native's Moon-nakshatra Gana (Deva/Manushya/
   Rakshasa) and the classical Gana compatibility table. The chosen table's
   **directionality** SHALL be pinned per Requirement 1.3 and Requirement 12.
7. **Bhakoot** (max 7) — from the rashi distance between the two Moon signs
   (specifically the classically-inauspicious 2-12, 5-9, 6-8 placements), scored
   0 or 7 (all-or-nothing per tradition), with documented cancellation exceptions
   (Requirement 4) recorded in evidence rather than silently changing the score.
8. **Nadi** (max 8) — from each native's Moon-nakshatra Nadi (Aadi/Madhya/Antya);
   same Nadi scores 0 unless a documented exception (Requirement 4) applies;
   different Nadi scores the full 8.
9. The sum of all 8 kootas SHALL equal `gunaScore`, maximum 36; each koota's
   `{name, points, maxPoints, evidence}` SHALL be individually retrievable from
   `MatchResult`, not just the total.
   **`points` and `gunaScore` SHALL be typed as fractional numbers, not
   integers** — Vashya, Graha Maitri, and Tara all yield half-point values, so a
   legitimate total is e.g. `27.5` or `31.5`. Any UI, band comparison
   (Requirement 5.2), or test fixture SHALL handle halves; nothing SHALL round
   the stored value.

### Requirement 3 — Mangal Dosha (Kuja Dosha) compatibility

**User story:** As a practitioner, I want each native's Manglik status detected
and compared, so that I can tell the family whether Mars affliction is matched,
mismatched, or cancelled — independent of, and reported alongside, the Guna
score.

**Acceptance criteria:**
0. **This repo already states the rule and it SHALL be the source of truth.**
   `prompts/domains/marriage.md` (the canonical marriage domain file, shared by
   Wave 2-G and the duration-analysis marriage domain) defines Kuja Dosha as
   "Mars ... placed in 1/2/4/7/8/12 from lagna, Moon, or Venus, unless cancelled
   by own/exalted sign, benefic aspect, or matching dosha in partner." The
   deterministic engine SHALL implement exactly that rule so the deterministic
   and LLM paths cannot drift; any deviation SHALL be applied to that file in the
   same change (the `named-yoga-engine`→`wave2_2a_yogas.md` precedent).
1. For each native independently, the engine SHALL determine Manglik status from
   Mars's placement in houses **1, 2, 4, 7, 8, 12** counted from **lagna, Moon,
   and Venus** (the three reference points named in the domain file), recording
   which reference point(s) trigger the dosha in evidence — not collapsing to a
   single yes/no without provenance.
2. The engine SHALL apply the cancellation (Bhanga) conditions named in the
   domain file — Mars in its own or exaltation sign, and benefic aspect on Mars
   (read from `relationships.aspects`, never re-derived, per NFR-2) — and record
   which condition fired, per native, mirroring how `yogas.ts` records
   `Neechabhanga` evidence. Note the domain file's third condition, "matching
   dosha in partner," is **pairwise, not per-native**, and is therefore handled
   in 3.3 as the `matched` verdict rather than as a per-native cancellation.
3. The engine SHALL compare the two natives' (post-cancellation) Manglik status
   and report a `mangalDoshaCompatibility` verdict: **matched** (both Manglik or
   both non-Manglik), **mismatched** (only one Manglik, uncancelled), or
   **cancelled** (a dosha was present but nullified by 3.2).
4. Mangal Dosha compatibility SHALL be reported as a distinct field from
   `gunaScore` — it SHALL NOT be folded into or silently subtracted from the
   36-point Ashtakoota total, since the two are classically independent checks.

### Requirement 4 — Dosha-cancellation registry

**User story:** As a maintainer, I want cancellation rules for Nadi, Bhakoot, and
Mangal doshas expressed as a documented, evidence-carrying registry, so that
exceptions are auditable and extensible rather than hard-coded booleans.

**Acceptance criteria:**
1. Cancellation conditions for Nadi dosha (e.g. same Nadi but the **same**
   nakshatra-lord, or a documented paired-nakshatra exemption), Bhakoot dosha
   (e.g. same Moon-sign lord, or an exalted/own-sign lord exemption), and Mangal
   Dosha (Requirement 3.2) SHALL each live in a named, individually testable
   detector function, analogous to `named-yoga-engine`'s per-yoga detectors.
2. Each fired cancellation SHALL be recorded in the relevant koota's/dosha's
   `evidence`, naming the rule and the satisfying condition — never applied
   silently.
3. **Deferred (schema-ready, not implemented in v1):** cancellation variants
   documented only in regional/non-PVR sources are out of scope; the registry
   SHALL be structured so they can be added later without a schema change.
4. **A cancellation rule SHALL be sanity-checked by its fire rate across the
   full 11,664-pair space before it is accepted.** An earlier draft of 4.1
   named the Nadi exemption as "same Nadi but *different* nakshatra-lord";
   measured, that form fires on **76.5%** of all same-Nadi pairs, which
   repeals the most heavily weighted koota rather than excepting it. The
   corrected same-lord form, and Bhakoot Bhanga's measured **8.3%**, are the
   shape an exemption should have. Any new or revised detector SHALL report
   its fire rate in the task 9 sweep, and a rate that nullifies the majority
   of a dosha's cases SHALL be treated as evidence the rule is inverted.

### Requirement 5 — Match result schema, verdict, and score bands

**User story:** As a practitioner, I want one structured result with an overall
recommendation band, so that I can give the family a clear answer without manually
summing 8 numbers myself.

**Acceptance criteria:**
1. `MatchResult` SHALL include: `gunaScore` (0-36), `kootas` (the 8 entries per
   Requirement 2.9), `mangalDosha` (per-native detail + `mangalDoshaCompatibility`
   per Requirement 3), and an overall `verdict`.
2. `verdict` SHALL be derived from a documented score-band table (e.g. `<18`
   "not recommended", `18–24` "average — proceed with caution", `24–32` "good
   match", `32–36` "excellent match"), with exact thresholds recorded in
   `design.md`. **These bands are almanac/commercial-software convention and
   SHALL NOT be attributed to PVR Narasimha Rao or to Parashara** — no classical
   source fixes them, and they vary between publishers. The band table SHALL
   carry an explicit provenance comment saying so, and the UI SHALL present the
   band as guidance rather than a verdict of record (Requirement 5.5).
3. WHEN `mangalDoshaCompatibility` is `mismatched` (Requirement 3.3), THEN the
   `verdict` payload SHALL surface that as a **flagged caveat** even if
   `gunaScore` alone would land in a favorable band — the two checks are
   reported together, not merged into one number (Requirement 3.4).
4. The new types SHALL live in `engine/compute/types.ts` (or a sibling
   `matchmaking` types module) and be re-exported from `engine/compute/index.ts`
   alongside the other domain result types, per existing convention.
5. **The koota total SHALL NOT be presented as the final word.** Per the Guiding
   Principle (point 2), `MatchResult` SHALL carry a `limitations` field, and the
   UI (Requirement 8.2) SHALL render it, stating that Ashtakoota is a coarse
   screen and that a full assessment requires each native's own 7th house /
   Venus / Jupiter condition, D9, and running dashas — the analysis
   `prompts/domains/marriage.md` and Wave 2-G already perform per chart. This is
   a deliberate guard against the deterministic number being read as more
   authoritative than it is.

### Requirement 6 — Data model and ownership

**User story:** As a practitioner, I want to save a computed match tied to the two
charts I ran it on, so that I can revisit it later without recomputing, and so
that my matches stay private to me like every other chart-derived record in this
app.

**Acceptance criteria:**
1. A new Prisma model (e.g. `MatchRequest`) SHALL be added with at least: `id`
   (uuid), `chartAId`/`chartBId` (FKs → `UnifiedChart`), `userId` (FK → `User`),
   `label` (optional, e.g. "Priya × Rahul"), `result` (`Json` — the full
   `MatchResult`), `createdAt`. It SHALL follow `.kiro/skills/database-prisma.md`
   conventions (`@@map(...)` snake_case, `Timestamptz`).
1a. **The model SHALL carry an explicit bride/groom role per side** (e.g.
   `brideChartId` / `groomChartId`, or a `roleA`/`roleB` pair), because Varna —
   and possibly Gana — are directional (Requirement 1.3). **This role SHALL NOT
   be inferred from chart gender:** `UnifiedChart` has **no `gender` column**
   (verified against `prisma/schema.prisma`); gender exists only as an
   *optional* field on `ChartInputV1.meta.gender` (`lib/types.ts:54`) and is
   absent entirely from `BirthInput` (`engine/compute/types.ts`), so it is
   unavailable for most compute-path charts. The role SHALL therefore be
   supplied explicitly by the caller at match time (Requirement 7.1) and
   persisted on the `MatchRequest` row.
1b. WHEN the caller does not supply roles, THEN the request SHALL be rejected
   with a field-level validation error rather than silently defaulting — a
   silently-guessed role produces a wrong Varna point with no visible signal.
2. WHEN a match is requested, THEN the system SHALL verify **both**
   `chartAId` and `chartBId` resolve to `UnifiedChart` rows owned by the
   requesting user (via `resolveRequestUser`, per `user-management`
   Requirement 8.2) before computing anything; a mismatch on **either** chart
   SHALL return `404`, never `403`, consistent with `user-management`
   Requirement 5.4 and Decision 5.
3. `chartAId` and `chartBId` SHALL be permitted to reference the same
   `UnifiedChart` only if the caller explicitly intends self-comparison; the
   system SHALL NOT special-case or block this (no product reason to forbid it),
   but the UI SHOULD warn before submitting an identical pair.
4. `GET /api/matchmaking` (list) SHALL filter to `WHERE userId = <session user>`,
   identical in spirit to `UnifiedChart` list scoping.
5. `docs/ERD.md` SHALL be updated in the same change that adds `MatchRequest`,
   per `Claude.md`'s documentation-maintenance table.

### Requirement 7 — API routes

**User story:** As the UI and MCP layer, I want stable HTTP endpoints for
computing and retrieving matches, so that both surfaces share one implementation.

**Acceptance criteria:**
1. `POST /api/matchmaking` SHALL accept `{chartAId, chartBId, roles, label?}`
   — where `roles` explicitly designates which chart is the bride and which the
   groom (Requirement 6.1a/6.1b) — enforce
   Requirement 6.2's ownership check on both charts, call
   `computeAshtakootaMatch` (Requirement 1), persist a `MatchRequest` row, and
   return the created record including `MatchResult`.
2. `GET /api/matchmaking` SHALL list the caller's saved matches (Requirement
   6.4), and `GET /api/matchmaking/[id]` SHALL return one match's full detail,
   enforcing the same ownership check (`404` on mismatch, per Requirement 6.2).
3. A delete path (`DELETE /api/matchmaking/[id]`) SHALL be provided, ownership-
   checked identically, consistent with `UnifiedChart` delete.
4. This feature SHALL introduce no new call sites into `mcp/src/*.ts` beyond
   Requirement 8; `tests/mcp-cost-guard.test.ts`'s `ALLOWED_POST_ROUTES`
   allow-list SHALL be updated **explicitly, in this feature's own change** to
   include `/api/matchmaking` — mirroring the precedent set by
   `user-management` Requirement 8.7 ("not pre-approved here" for any new POST
   call site) — since a match computation is a deterministic, non-LLM POST like
   `/api/compute/varshaphal`, not a paid pipeline launch.

### Requirement 8 — Practitioner-facing UI

**User story:** As a practitioner, I want a page where I pick two of my saved
charts and see the match result laid out clearly, so that I can walk a family
through it without leaving the app.

**Acceptance criteria:**
1. A new page (e.g. `/matchmaking`) SHALL let the practitioner pick two charts
   from their own saved `UnifiedChart` list (reusing the existing chart-picker
   pattern from `unified-charts`), **assign the bride/groom role to each**
   (Requirement 6.1a — required, not inferred), optionally label the pair, and
   submit.
2. The result view SHALL display: the `gunaScore` out of 36 with a visual
   band/verdict; a breakdown table of all 8 kootas (name, points/max, one-line
   evidence); each native's Mangal Dosha status and the combined
   `mangalDoshaCompatibility` verdict with its cancellation reason when
   applicable (Requirement 3.2).
2a. The result SHALL be **labelled as Ashtakoota / North Indian Guna Milan**, not
   as a generic "compatibility score" — the South Indian Porutham system is a
   different calculation yielding different verdicts, and v1 does not compute it
   (see Non-Goals). It SHALL also render the `limitations` field from
   Requirement 5.5.
3. A list view (e.g. `/matchmaking` index or a tab) SHALL show the practitioner's
   previously saved matches (Requirement 7.2) with quick access to each result.
4. The feature SHALL be reachable from the existing navigation alongside the
   other four practitioner-facing features (`Claude.md`'s "Four
   practitioner-facing features" section becomes five; that section SHALL be
   updated in the same change per Requirement 11).

### Requirement 9 — MCP exposure

**User story:** As a Claude Desktop user on the free MCP path, I want to run a
Guna Milan match between two of my saved charts, so that the same deterministic
scoring is available without a paid pipeline run.

**Acceptance criteria:**
1. The MCP server (`mcp/src/tools.ts`) SHALL expose a deterministic tool (e.g.
   `compute_match`) accepting two chart identifiers **and their bride/groom
   roles** (Requirement 6.1a), resolved the same way
   `get_client_chart`/`list_clients` resolve a caller's own charts — consistent
   with the cost-guard boundary (it MUST NOT call `/analyze` or
   `/duration-analysis`).
1a. **This would be the first MCP tool that writes to the database, and that
   boundary SHALL be decided explicitly, not crossed by accident.** Every
   existing tool in `mcp/src/tools.ts` is a read-only `get`, and all three
   currently-allowed POSTs in `tests/mcp-cost-guard.test.ts`'s
   `ALLOWED_POST_ROUTES` — `/api/compute`, `/api/compute/varshaphal`,
   `/api/timeline` — are **stateless: they persist nothing**. A `compute_match`
   that POSTs to `/api/matchmaking` would create a `MatchRequest` row, meaning
   Claude Desktop could silently fill a practitioner's saved-match list.
   `design.md` SHALL choose (Open Decision 10) between:
   - **(a)** a `persist: false` option (or a separate stateless
     `/api/matchmaking/preview` route) so the MCP path computes without saving —
     preserving the "MCP reads, the app writes" invariant. **Proposed.**
   - **(b)** allowing the write, in which case the cost guard's allow-list
     addition (Requirement 7.4) SHALL be accompanied by a note in
     `mcp/README.md` stating plainly that this tool persists.
1b. Whichever option is chosen, the cost-guard test's allow-list change SHALL be
   made explicitly in this feature's PR and called out in the description — the
   `user-management` Requirement 8.7 precedent ("NOT pre-approved here").
2. WHEN either referenced chart does not belong to the calling user (resolved
   via the MCP token per `user-management` Requirement 8), THEN the tool SHALL
   surface the same not-found guidance pattern used elsewhere (`extractOrGuide`
   convention), not a stack trace or ownership-revealing error.
3. `mcp/README.md` and the relevant `docs/HLD.md` / `docs/DFD.md` MCP sections
   SHALL be updated in the same change to list the new tool, per Requirement 11.

### Requirement 10 — Verification

**User story:** As a maintainer, I want fixture-based tests against known
reference pairs, so that scoring is pinned and regressions are caught, the same
discipline `named-yoga-engine` and `scorer-dynamic-range` already apply.

**Acceptance criteria:**
1. Unit tests SHALL cover each of the 8 koota calculators with at least one
   positive (full points) and one boundary/zero case, using deterministic
   hand-built nakshatra/rashi fixtures — not live ephemeris computation.
2. Unit tests SHALL cover Mangal Dosha detection (all three reference points:
   lagna, Moon, Venus) and at least one documented cancellation case per
   Requirement 4.
3. **The koota engine SHALL be pinned against the reference oracle
   exhaustively, not by a single hand-checked example.** Because the kootas take
   only `(nakshatra, pada, role)` per native (Requirement 1c), the input space is
   finite and small: 27×4×27×4 = **11,664 combinations**, which is exactly the
   space PyJHora precomputes in `all_nak_pad_boy_girl.csv` (Open Decision 8).
   The test suite SHALL compare our output across that space — or a
   deterministic, documented sample of it if runtime demands — rather than
   asserting one pair. This is a materially stronger bar than the
   one-fixture standard used elsewhere in the repo, and it is available here
   only because the input space is enumerable.
3b. **This dissolves the "second birth record" problem for the kootas.** No real
   birth data is needed to verify Guna Milan — `(nakshatra, pada)` pairs are
   synthetic inputs. A second *chart* fixture is still required, but **only for
   Mangal Dosha** (Requirement 3), which needs full house positions. The repo
   has one file in `engine/compute/__fixtures__/` and one inlined birth record
   (the "Mojo" chart in `yogas.mojo.test.ts`), so that second record must still
   be sourced — and SHOULD be synthetic or already-public rather than client
   data.
3c. **The oracle SHALL be used externally, not vendored** (Open Decision 13):
   expected values SHALL be generated by running PyJHora outside this repository
   in a dev-only harness. PyJHora SHALL NOT be imported, vendored, bundled, or
   deployed, and its generated CSVs SHALL NOT be committed here without the
   explicit sign-off Open Decision 13 calls for. WHERE that sign-off is not
   given, the committed fixture SHALL be a documented sample of expected values
   transcribed from an oracle run, not a copy of the upstream dataset.
3a. WHERE our output diverges from JHora, the divergence SHALL be documented in a
   **KNOWN DIVERGENCE** table in `docs/computation_matchmaking.md`, following the
   format of `docs/computation_chara_dasha.md` §4 — recorded and explained, never
   silently tolerated and never papered over by adjusting the expected value.
4. Tests SHALL assert the **role-aware** symmetry contract of Requirement 1.3 —
   specifically: (a) swapping both charts *and* roles is a no-op; (b) swapping
   charts *without* roles changes the Varna point when the two natives' Varna
   ranks differ; (c) each symmetric koota is individually asserted symmetric —
   and the degrade-don't-throw contract (Requirement 1.5: missing input → koota
   flagged `unavailable`, never a throw).
5. An ownership test SHALL assert `POST /api/matchmaking` and
   `GET /api/matchmaking/[id]` return `404` (not `403`, not `200` with leaked
   data) when either chart belongs to a different user (Requirement 6.2).

### Requirement 11 — Documentation sync

**User story:** As per `Claude.md`, I want the architecture docs updated in the
same change, so the reference never drifts and this becomes the app's fifth
practitioner-facing feature in every doc that enumerates them.

**Acceptance criteria:**
1. WHEN this feature merges, THEN `docs/ERD.md` (new `MatchRequest` model),
   `docs/HLD.md` (new routes, new UI page, new compute module), `docs/DFD.md`
   (new process + data flow for two-chart matching), the relevant
   `.kiro/skills/*` (`nextjs-project-structure.md`, `database-prisma.md`), and
   `Claude.md` itself (adding Marriage Matchmaking as the fifth
   practitioner-facing feature) SHALL be updated in the same change.
2. `mcp/README.md` SHALL document the new `compute_match` tool alongside the
   existing `get_*` tools (Requirement 9.3).
3. A new **`docs/computation_matchmaking.md`** SHALL be authored in the same
   style as the existing `docs/computation_*.md` files (`computation_chara_dasha.md`,
   `computation_divisional_charts.md`, `computation_transits_sadesati.md`),
   covering: each koota's rule and point table with its pinned source; the
   directional kootas (Requirement 1.3); the Mangal Dosha rule and its link to
   `prompts/domains/marriage.md`; the JHora comparison including a
   **KNOWN DIVERGENCE** table (Requirement 10.3a); and the explicit statement
   that the 36-point system and its score bands are almanac convention, not PVR
   (NFR-8).

### Requirement 12 — Koota attribute tables (new static reference data)

**User story:** As a maintainer, I want the classical koota lookup tables added
as explicit, sourced, individually-testable constants, so that scoring rests on
pinned reference data rather than values inlined at the point of use.

**Rationale — these tables do not exist in the repo today.** This was verified
against the current code: `nakshatras.ts`'s `NAKSHATRA_DATA` carries only
`{name, lord}` for the 27 nakshatras, and no rashi→Varna or rashi→Vashya mapping
exists anywhere under `engine/`. Requirement 1.4's "reuse, don't re-implement"
therefore covers nakshatra indexing, rashi derivation, and naisargika friendship
only — the koota attributes below are genuinely new and must be budgeted for.

**Acceptance criteria:**
1. The following SHALL be added as exported, documented constants (co-located in
   the matchmaking module, or extended onto `NAKSHATRA_DATA` if that proves
   cleaner — a design-time call):
   - **Per nakshatra (27 entries):** `gana` (Deva/Manushya/Rakshasa),
     `yoni` (animal + its fixed gender), `nadi` (Aadi/Madhya/Antya).
   - **Per rashi (12 entries):** `varna` (Brahmin/Kshatriya/Vaishya/Shudra) and
     `vashya` (Manav/Vanachar/Chatushpad/Jalachar/Keet).
   - **Pairwise scoring tables:** Varna compatibility, Vashya compatibility
     (with its 0.5 cases), Tara remainder→points, Yoni 14×14
     friendship/enmity (five-tier, per Requirement 2.4), Graha Maitri
     friendship→points (with its 0.5 cases), Gana compatibility (with its
     directionality pinned).
2. Each table SHALL carry a provenance comment naming the source it was pinned
   to and, where variants exist, which variant was chosen and why — the
   convention `dignity.ts`, `shadbala.ts`, and `divisional.ts` already follow.
3. Each table SHALL be verified for completeness by test (27 nakshatra entries,
   12 rashi entries, 14 yonis, total-points-reachable = 36) so a typo in a
   hand-transcribed table fails loudly rather than silently scoring wrong.
4. WHERE a table has competing variants in circulation (notably Graha Maitri's
   point gradations and Gana's directional cases), the variant SHALL be chosen
   to match JHora output per the Guiding Principle, and the alternative recorded
   in `docs/computation_matchmaking.md`. **Variant selection SHALL be driven by
   comparing computed output against the oracle (Requirement 10.3), never by
   reading upstream prose** — PyJHora's own README states varna as "0-3 points"
   where its code sets `varna_max_score = 1`, and only `1` makes the eight
   maxima sum to 36 (Open Decision 8).
5. **Transcription source is constrained by Open Decision 13 (AGPL).** The
   tables SHALL be transcribed from classical/secondary sources describing these
   traditional attributions — not copy-pasted from PyJHora's Python literals —
   with the oracle used to *verify* the result rather than to supply it. Each
   table's provenance comment (12.2) SHALL name the source actually used.

### Requirement 13 — Referential integrity with chart deletion

**User story:** As a practitioner, I want deleting a chart to keep working after
this feature ships, so that a saved match doesn't silently break the delete
button on a chart I no longer want.

**Rationale — this is a concrete regression, not a hypothetical.**
`DELETE /api/unified-charts/[id]` ([route.ts:184-199](app/api/unified-charts/[id]/route.ts:184))
does **not** rely on database cascade. It hand-deletes dependents in FK order
inside a `$transaction` — duration messages → duration analyses → pipeline runs →
chart — with an explicit comment that "Cascade isn't automatic with Prisma."
Adding two `UnifiedChart` FKs from `MatchRequest` without touching that route
means **any chart used in a match will fail to delete with a foreign-key
violation, surfacing as a 500**. Nothing in the current spec catches this.

**Acceptance criteria:**
1. `DELETE /api/unified-charts/[id]` SHALL be updated **in this feature's own
   change** to remove dependent `MatchRequest` rows within the same
   `$transaction`, in correct FK order, following the existing pattern in that
   route.
2. Deletion SHALL account for the fact that a `MatchRequest` references **two**
   charts: deleting *either* chart SHALL be handled, i.e. the cleanup SHALL
   match on `chartAId = id OR chartBId = id`, not on one column.
3. The delete semantics SHALL be decided explicitly in `design.md` (Open
   Decision 9) between: **(a) cascade** — delete matches referencing the chart;
   **(b) preserve** — make the chart FKs nullable and null them out, keeping the
   match readable because `result` is a self-contained JSON snapshot; or
   **(c) block** — refuse the chart delete with a clear message. Proposed:
   **(a) cascade**, matching how `PipelineRun`/`DurationAnalysis` are already
   treated, and consistent with the practitioner's expectation that deleting a
   client removes their derived records.
4. A test SHALL assert that deleting a chart which participates in a match
   succeeds (not 500) and leaves no orphaned `MatchRequest` rows.
5. WHERE option (b) is chosen instead, the match detail view (Requirement 8) and
   `GET /api/matchmaking/[id]` SHALL render a match whose chart has been deleted
   without throwing — chart name/link absent, `result` still shown.

### Requirement 14 — Nakshatra-boundary and ayanamsa confidence

**User story:** As a practitioner, I want to be warned when a match rests on a
Moon sitting near a nakshatra boundary, so that I don't present a 32/36 score as
firm when a 20-minute birth-time correction would change it.

**Rationale.** Ashtakoota is unusually brittle in a way the rest of this engine
is not. The Moon travels ~13°/day and a nakshatra spans 13°20′, so the Moon
changes nakshatra roughly once a day — a birth time off by an hour or two can
flip Gana, Yoni, Nadi, and Tara **simultaneously**, swinging the total by many
points. Unlike a dasha date or a Shadbala figure, the koota output has no
gradient: it jumps. Presenting it without a confidence signal overstates it.

**Acceptance criteria:**
1. `MatchResult` SHALL carry, per native, the Moon's **distance in degrees to the
   nearest nakshatra boundary** and a derived `boundaryRisk` flag.
2. WHEN either native's Moon falls within a configurable threshold of a nakshatra
   boundary (proposed: **1°**, ≈ 2 hours of lunar motion), THEN the result SHALL
   be flagged and the UI (Requirement 8.2) SHALL display a caution stating which
   kootas would change and that birth-time accuracy is material here.
3. **Ayanamsa provenance SHALL be surfaced when a paste chart is involved.**
   `mapPastedToUnified` stores `ayanamsa: 0` with the comment "Not available in
   pasted input" (`lib/chart-mapper.ts:168`) — so for a paste chart we do **not**
   know which ayanamsa produced the pasted Moon position. If it was computed
   under a non-Lahiri ayanamsa (Raman, KP), the Moon nakshatra can differ from
   ours near a boundary. WHEN either native is a paste chart, the result SHALL
   record that its ayanamsa is unverified, and this SHALL compound the 14.2
   caution rather than being reported separately.
4. This requirement adds **no** new astronomical computation — boundary distance
   is arithmetic on the `moonLongitude` the engine already reads (Requirement 1a).

## Non-Functional Requirements

| # | Requirement |
|---|---|
| NFR-1 | **Determinism:** identical chart-pair input SHALL always produce an identical `MatchResult` (Requirement 1.2). |
| NFR-2 | **No re-computation of ephemeris data:** the engine SHALL read only already-stored values off each `UnifiedChart` — the `moonLongitude` scalar for the kootas (Requirement 1a) and the `planets` JSONB for Mangal Dosha (Requirement 1b) — and SHALL never call Swiss Ephemeris directly (mirrors `named-yoga-engine` Requirement 1.4). |
| NFR-3 | **Ownership isolation:** a match SHALL be computable/viewable only when both constituent charts belong to the requesting user, enforced identically across UI, `/api/matchmaking`, and MCP (Requirements 6.2, 9.2). |
| NFR-4 | **Evidence over silent scoring:** every non-obvious scoring decision — a partial koota point, a fired cancellation, a Mangal Dosha reference point — SHALL be recorded in structured evidence, not just a bare number (Requirements 2, 3, 4). |
| NFR-5 | **Cost-guard compliance:** no code path introduced by this feature SHALL call `/analyze` or `/duration-analysis`; `tests/mcp-cost-guard.test.ts` SHALL pass with the explicit allow-list addition from Requirement 7.4. |
| NFR-6 | **Paste-source charts SHALL get a full Guna score, not a degraded one.** Unlike `shadbala`/`divisionalCharts`/`yogas`, Ashtakoota does **not** need a compute-path chart: `UnifiedChart.moonLongitude` is required and populated on both paths (Requirement 1a), so all 8 kootas compute for every chart. Only Mangal Dosha degrades to `unavailable` (Requirement 1b/1.5). An implementation that gates the whole feature on `source === "compute"` fails this NFR. |
| NFR-7 | **JHora parity is the correctness bar** (Guiding Principle): koota output SHALL be pinned to Jagannatha Hora / PyJHora, with divergences documented in `docs/computation_matchmaking.md`, per the precedent in `docs/computation_chara_dasha.md` and `docs/computation_divisional_charts.md`. |
| NFR-8 | **No misattribution:** code comments, UI copy, and docs SHALL NOT describe the 36-point Ashtakoota system or its score bands as "classical Parashari" or "per PVR Narasimha Rao" (Guiding Principle points 1-2). Attribution SHALL name the actual convention being followed. |

## Open Decisions (proposed defaults — confirm before `design.md`)

These are modeling calls with no existing precedent in the codebase to defer to.
Reasonable defaults are proposed inline in the requirements above; flagging them
here so a design pass can confirm or override before implementation:

1. **Exact score-band thresholds and label wording** for `verdict`
   (Requirement 5.2) — proposed `<18 / 18-24 / 24-32 / 32-36`. The **18.0**
   lower bound is corroborated: it is PyJHora's own default
   `minimum_compatibility_score` (Open Decision 8). The 24 and 32 upper
   boundaries remain **unattributable to any classical source** (see 5.2) and
   are purely a product/presentation call.
2. **Which Bhakoot/Nadi cancellation variants to include in v1** (Requirement
   4.3) — proposed: whichever set reproduces JHora's output, since the Guiding
   Principle now pins to JHora rather than to a text.
3. ~~**Whether Graha Maitri reuses `relationships.ts`'s friendship table**~~ —
   **CLOSED by code inspection.** `relationships.ts` has no friendship table at
   all (only `NATURAL_BENEFICS`/`NATURAL_MALEFICS`, lines 83–84). The naisargika
   table is `PERMANENT_FRIENDSHIP` in `dignity.ts:75`, and Graha Maitri must use
   it *directly* — not `getVargaDignityLabel`, which blends in tatkalika
   friendship. Now specified in Requirement 2.5; no decision needed.
4. **Entity naming** — `MatchRequest` vs. `CompatibilityMatch` vs. `KundliMatch`
   (Requirement 6.1) is a placeholder; pick one consistent name across schema,
   routes, and UI at design time.
5. **Whether a saved `MatchRequest` should be re-computed on demand (live) or
   always served from the persisted `result` JSON** (Requirement 6.1) — proposed:
   persisted/static, matching how `PipelineRun`/`DurationAnalysis` results are
   read, not re-run, on every view.
6. ~~**How bride/groom roles are captured, and whether to add `UnifiedChart.gender`**~~
   — **RESOLVED: do both.** Role lives on the match record (it is a property of
   the *pairing* — the same chart can be either side in different matches),
   **and** a `UnifiedChart.gender` column is added. The column pre-fills the
   role picker and independently fixes a latent gap: gender currently reaches
   Wave 2-G only via optional `ChartInputV1.meta.gender`, and
   `lib/validation.ts:383-386` silently **defaults absent gender to 'male'**
   for 2G karaka selection (`engine/chartSummary.ts:39`), which is wrong for
   roughly half of all charts. Role on the match stays authoritative; gender is
   a convenience default, never the decider. See `design.md` §Data Models.
7. **NEW — whether to pursue JHora parity on the South Indian kutas** (Rajju,
   Vedha, Mahendra, Stree Deergha, Dina) in a v2, given JHora displays them
   (Guiding Principle point 3). Proposed: defer, but record the gap in
   `docs/computation_matchmaking.md` from day one.
8. ~~**Whether PyJHora's compatibility module exists to pin against**~~ —
   **RESOLVED: it does.** `src/jhora/horoscope/match/compatibility.py` in
   [naturalstupid/PyJHora](https://github.com/naturalstupid/PyJHora) exposes an
   `Ashtakoota` class alongside a `Match` class, plus two precomputed data files
   (`all_nak_pad_boy_girl.csv` for North, `all_nak_pad_boy_girl_south.csv` for
   South). Findings, and what each settles:
   - **Constructor is `(boy_nakshatra_number, boy_paadham_number,
     girl_nakshatra_number, girl_paadham_number, method="North")`.** Confirms
     both role-awareness (Requirement 6.1a) and that **pada, not nakshatra
     alone, is the input granularity** (Requirement 1c below).
   - **Per-koota maxima confirm our table:** varna `1`, vasiya `2.0`, nakshathra
     (Tara/Dina) `3.0`, gana `6`, yoni `4`, raasi_adhipathi (Graha Maitri) `5.0`,
     raasi (Bhakoot) `7`, naadi `8` — summing to exactly 36.
   - **Half-points confirmed:** the score runs "0 to 36 in steps of 0.5,"
     validating Requirement 2.9's fractional-number requirement.
   - **Its own README contradicts its code** — the README lists varna as
     "0-3 points" while the constant is `varna_max_score = 1` (and only `1`
     makes the total close at 36). A concrete illustration of why Requirement
     12.4 pins to *output*, never to prose.
   - **Default minimum score is `18.0`**, matching the lower band in
     Requirement 5.2 (the upper 24/32 bands remain unattributed).
   - **North and South are one class with a `method` switch and two separate
     data files**, and the South total is 10 rather than 36 — independent
     confirmation of the Non-Goals section's "two systems, not two renderings."
   - `compatibility_score()` returns the four South-only checks (mahendra,
     vedha, rajju, sthree_dheerga) as booleans **even in North mode**, again
     confirming weighted-points vs. pass/fail as the structural difference.
   **Consequence:** Requirement 12 is transcription rather than research — but
   see Open Decision 13, which gates *how* that transcription may happen.
9. **NEW — chart-delete semantics for a referenced match** (Requirement 13.3):
   cascade / preserve-with-nullable-FK / block. Proposed: **cascade**, matching
   `PipelineRun` and `DurationAnalysis`.
10. **NEW — whether the MCP `compute_match` tool persists** (Requirement 9.1a).
   Proposed: **no** — expose a stateless compute path so MCP keeps its
   read-only-by-convention posture and Claude Desktop can't quietly populate the
   practitioner's saved-match list.
11. **NEW — the second test fixture birth record** (Requirement 10.3b). One does
   not exist in the repo; the pair should be synthetic or already-public rather
   than real client data.
12. **NEW — nakshatra-boundary warning threshold** (Requirement 14.2). Proposed
   **1°** (≈2 hours of lunar motion); needs a practitioner's judgment on whether
   that is too noisy or not conservative enough.
13. ~~**PyJHora is AGPL-3.0 and this app is network-served**~~ — **RESOLVED:
   oracle-only, never vendor.** PyJHora SHALL be run locally as a dev-only
   oracle to generate expected test values; the koota tables SHALL be
   transcribed from classical/secondary sources rather than from its Python
   literals; and nothing from it enters this repository or the deployment.
   AGPL restricts *conveying*, not private use, so this posture carries no
   license obligation. Encoded in Requirements 10.3c and 12.5. Retained below
   for the reasoning:
   - The AGPL's §13 network clause is triggered by exactly this deployment
     shape: if the app incorporates AGPL code or a derivative work and users
     interact with it over a network, the served version must offer its
     Corresponding Source under the AGPL. A closed-source Vercel deployment
     that vendors PyJHora code would not satisfy that.
   - **Note the pre-existing exposure:** `divisional.ts:223` already cites
     "PyJHora charts.py `_hora_chart_by_pvr_method`" as the source of the D2
     mapping. That is one derived mapping; this feature would deepen the
     relationship substantially (≈8 tables plus an 11,664-row dataset), which is
     a difference in kind worth deciding on deliberately rather than by
     precedent.
   - **The distinction that likely matters:** the classical koota tables
     themselves (Gana/Yoni/Nadi per nakshatra, Varna/Vashya per rashi) are
     centuries-old traditional facts, and a table of facts generally does not
     attract copyright on its own. Copying PyJHora's *source*, its specific
     expression, or shipping its generated CSVs is a different matter.
   - **Proposed safe posture, pending that call:** (a) transcribe the classical
     tables from classical/secondary sources, not by copy-pasting PyJHora's
     Python literals; (b) use PyJHora strictly as an **external oracle** run
     outside this repo in a dev-only harness to generate expected test values —
     never imported, vendored, or deployed; (c) treat checking a bulk generated
     CSV into this repo as requiring explicit sign-off. Requirement 12.5 and
     Requirement 10.3c encode this.

## Dependency Map (informational)

```
Marriage Matchmaking (this spec)
   ├── depends on nakshatras.ts / planets.ts / dignity.ts (Requirement 1) — read-only, no changes needed
   ├── depends on user-management (Requirements 6, 9) — resolveRequestUser + 404-not-403 convention, already shipped
   └── future, NOT in this spec: an LLM narrative wave consuming MatchResult,
       analogous to how Wave 2A consumes engine/compute/yogas.ts's catalogue
```
