# Compute Engine (`engine/compute/`)

Deterministic astronomical calculations (Swiss Ephemeris):

| Module | Purpose |
|---|---|
| `planets.ts` | Planet longitudes, signs, houses |
| `nakshatras.ts` | Nakshatra, pada, sublord — and the engine's **only** nakshatra arithmetic. Exports `locateInNakshatra()` (+ `NakshatraLocation`), `normalizeLongitude()` and `distanceToNakshatraBoundary()`; `computeVimshottari`, matchmaking's `computeBoundaryRisk` and the Sree Lagna use them. The longitude-taking functions (`getNakshatraIndex`, `getPada`, `computeSubLord`, `computeNakshatraForLongitude`) all go through `locateInNakshatra()`, which returns index and fraction from **one** quotient (`q = lon / NAKSHATRA_SPAN_DEG`, `index = floor(q)`, `fraction = q − index`). Never pair `floor(lon / span)` with `lon % span`: the span rounds up, so at an exact boundary (40°, 80°, …) the two disagree. Pada (`padaAt()`) and sub-lord (`subLordAt()`, starting at Vimshottari entry `index % 9`) both use one exact test against whole-year cut points, `hasReachedYears()` (`9 × lon ≥ years` via TwoSum), so they agree at the shared pada-3 cut of Mars- and Mercury-led nakshatras. `normalizeLongitude()` leaves in-range values untouched (`((lon % 360) + 360) % 360` does not) and keeps NaN as NaN. Tables come from `engine/constants.ts`. Tests: `tests/nakshatra-pada-boundary.test.ts`, `tests/nakshatra-shared-locator.test.ts`. Spec: `.kiro/specs/nakshatra-shared-locator/` |
| `divisional.ts` | Divisional charts: D1/D2/D3/D4/D5/D6/D7/D9/D10/D12/D24/D30/D60 (D2/D3/D12 added for Shadbala/Vimsopaka; D5/D6/D24 added for practitioner coverage; D60 — Shashtiamsa — added 2026-07 for finest-grained dignity/Sanchita Karma review) |
| `dignity.ts` | Canonical panchadha-maitri dignity classifier (`getVargaDignityLabel`) shared by `divisional.ts`, `yogas.ts` and `durationAnalysis/scoring.ts` — single source of truth for exaltation/debilitation/moolatrikona/own/friendship tables. Carries `MOOLATRIKONA_RANGES` (classical `[fromDeg, toDeg)` spans within the moolatrikona sign) refining the `MOOLATRIKONA_SIGNS` gate when `getVargaDignityLabel`'s **optional trailing** `degreeInSign` is supplied — a usable degree outside the range falls through to `own`; omitted / non-finite / outside `[0, 30)` keeps the whole-sign rule. `getVargaDignityReason(planet, vargaSignNumber, d1SignByPlanet, degreeInSign?)` returns the matching `DignityReason` (`DignityRule` + `label` + a ≤160-char plain-text sentence); call it with the **same** `degreeInSign` as the label it explains or the two can disagree. Dependency-free, never throws |
| `charaDasha.ts` | **Jaimini Chara Dasha** (KN Rao/Parashara) — sign-based mahadashas + 12 equal antardashas. `computeCharaDasha(planets, lagnaSignNumber, birthDate)`. On-demand sibling like the Vimshottari tree (NOT inside `computeFullChart`); returned by `/api/compute` as `charaDasha`. See `docs/computation_chara_dasha.md` |
| `ashtakavarga.ts` | Bindhu scores per planet per sign (SIGN-indexed `bav`/`sav`), plus a pre-rotated house-indexed `byHouse` view (house 1 = lagna) |
| `karakas.ts` | Jaimini karaka assignments |
| `arudhaPadas.ts` | Arudha pada calculations |
| `specialLagnas.ts` | Hora, Ghati, Sree Lagna etc. Sree Lagna takes the Moon's nakshatra fraction from `locateInNakshatra()` |
| `pindaStrength.ts` | Rashi/Graha/Drishti Pinda |
| `transits.ts` | Current transit positions + **both Sade Sati readings**. The sign-based scan (`computeSadeSatiPeriods(natalMoonSignNumber, birthYear, asOfDate)`) now takes `asOfDate` as a **required** third parameter — every period's `isCurrent` derives from it instead of a wall-clock `new Date()`, which previously disagreed with `sadeSati.active` for any historical evaluation date (the scan-window endpoints deliberately stay wall-clock-derived). `computeDegreeSadeSati(natalMoonLongitude, birthYear, asOfDate)` adds the degree-based reading — Saturn within ±45° of the natal Moon, one contiguous period per passage, no rising/peak/setting phase — returned as the optional sibling `TransitAnalysis.sadeSatiByDegree` (`DegreeSadeSatiInfo`), never nested inside `sadeSati`. Shared helpers: `nextStateChange(startJd, coarseStepDays, stateAt)` (generalised from `nextSignChange` to any integer state, same 10-day coarse walk + 42-iteration bisection) and `mergeSegments(raw, gapDays)` (extracted from the inline retrograde-merge loop, `gapDays = 240`). `computeTransits` takes an optional trailing 7th `natalMoonLongitude` — supplied by `computeFullChart` step 13, deliberately **not** by `durationAnalysis/transitOverlay.ts`. See `docs/computation_transits_sadesati.md` |
| `upagrahas.ts` | Sub-planets (Gulika, Mandi etc.) |
| `shadbala.ts` | **Full 6-component Shadbala — deterministic replacement for LLM agent 1C** |
| `relationships.ts` | **Conjunctions, graha/rashi drishti, yuddha, parivartana, combustion, avastha… — deterministic replacement for LLM agent 1D** |
| `nakshatraRelationships.ts` | Sub-lords, depositor chains, nakshatra parivartana, clusters, Rahu/Ketu axis |
| `jaimini.ts` | Argala/Virodha Argala, Yogi/Avayogi points, special-lagna aspects, lord relationship map |
| `bhavaBala.ts` | Bhavadhipati / Bhava Dig / Bhava Drishti bala |
| `yogas.ts` | **Deterministic named-yoga catalogue** — Pancha Mahapurusha, Raja Yoga (incl. distinctly-keyed `raja.dka` for Dharma-Karmadhipati), Dhana, Viparita (Harsha/Sarala/Vimala), Neechabhanga, lunar (Sunapha/Anapha/Durudhara/Kemadruma), Gaja Kesari, Budha-Aditya, Parivartana, Kartari. `computeYogas(input)` reads ONLY the already-computed `RelationshipGeometry` tables (`relationships.ts`) + `dignity.ts` — never re-derives conjunctions/aspects/exchanges/dignity. Never throws; a detector missing its required table emits nothing. Runs in `computeFullChart` right after `relationships`, attached as `ComputedChart.yogas` / `UnifiedChart.yogas` (null on paste path). See `.kiro/specs/named-yoga-engine/`. |
| `varshaphal.ts` | **Tajika annual solar-return chart** — Varsha Pravesh (solar return), annual chart (reuses `computeFullChart`), Muntha, Panchavargeeya Bala, Varshesha (year lord: strongest office-holder that aspects the Varsha Lagna, office count as tie-break). On-demand only — NOT part of `computeFullChart`/`ComputedChart` |
| `varshaphalDashas.ts` | **Dashas for a Varsha year** — `sliceNatalVimshottari(tree, yearStart, yearEnd)` (natal MD/AD/PD overlapping the year, true dates, chain at the Varsha Pravesh) and `computeMuddaDasha(natalMoonLongitude, age, yearStart, yearEnd)` (Tajika Mudda: Vimshottari compressed into the year, classical starting lord, natal balance with the remainder closing the year, Vimshottari antardashas). Pure. `computeVarshaphal` builds the natal tree with `computeVimshottari` exactly as `/api/compute` does. See `.kiro/specs/varshaphal-dashas/` |
| `tajikaAspects.ts` | **Sign-based Tajika aspects (Phase 1)** — `getTajikaSignAspect(fromSign, toSign)`: sextile 3/11 and trine 5/9 friendly; conjunction (same sign), square 4/10 and opposition 7 inimical; 2/6/8/12 no aspect. Pure, never throws. Separate from Parashari Graha Drishti in `relationships.ts`. Deeptamsha orbs + applying/separating are Phase 2 |

**Varshaphal note:** `varshaphal.ts` imports `computeFullChart` from `index.ts`
(one-directional — `index.ts` never imports `varshaphal.ts`, so no cycle). The
solar-return instant is found by Newton iteration on the Sun's sidereal longitude
(`findSolarReturnJulianDay` in `planets.ts`). Panchavargeeya Bala uses documented
Neelakanthi maxima (Kshetra 30 / Uccha 20 / Hadda 15 / Drekkana 10 / Navamsa 5, ÷4)
with the Egyptian-term (Hadda) table; Kshetra is judged from the sign lord alone (no
moolatrikona credit). Exact Vishwa scales vary by text/software, so values are
indicative and the method is surfaced in the output. The Trirashi lord comes from the
Tajika Neelakanthi per-sign table (`TRIRASHI_LORDS` / `getTrirashiLord`), not one
Dorothean pair per element.
Day/night of the Varsha Pravesh comes from `isSunAboveHorizon` (Sun longitude vs the
Ascendant degree) — never whole-sign houses, which are wrong near sunrise/sunset.
Which Lagna aspects count for the Varshesha is `VARSHESHA_LAGNA_ASPECT_NATURES` in
`varshaphal.ts`; `tajikaAspects.ts` itself stays purely geometric.
`computeFullChart` treats the return instant as a birth, so `computeVarshaphal`
replaces the annual chart's `transits` with `computeTransits` run on the **natal**
Moon and Lagna as of the Varsha Pravesh — never read Sade Sati from the annual Moon.
Entry point: `POST /api/compute/varshaphal`; UI: the "Varshaphal" tab on `/compute`.

**Divisional dignity/vargottama (2026-07):** every `DivisionalPlacement` (in every
varga, D1–D60) now carries an optional `dignity` (panchadha-maitri label from
`dignity.ts`; `undefined` for Rahu/Ketu) and `vargottama` (true when the varga sign
equals the D1 sign; never set for D1 itself, applies to all bodies incl. nodes).
Both are additive/optional — charts computed before this change simply lack them.
`durationAnalysis/scoring.ts`'s dignity factors (`mdLordDignity`/`adLordDignity`/
`pdLordDignity`/`divisionalChartStrength`) were unified onto the same `dignity.ts`
classifier (previously a private, less-correct copy) — see `scoringWeights.ts`
`WEIGHTS_VERSION` 0.5.0 changelog.

**Shadbala JHora-alignment (2026-07):** `shadbala.ts` now books **Ayana Bala** as a
Kaala Bala term for all seven planets (declination-based; Sun doubled), sets both
luminaries' **Cheshta Bala = 0**, and uses **Sun required = 5.0 rupas** (300 virupas).
This changes natal Shadbala too (same engine). Remaining JHora divergences (uncapped
epicyclic Cheshta, true-bhava Dig, complementary Ishta/Kashta, signed Yuddha) are
spec-gated Tier B — see `docs/computation_varshaphal.md` §4–6.

**Rules:**
- Pure functions — no DB, no side effects
- All use `swisseph-v2` for ephemeris calculations
- Types defined in `engine/compute/types.ts`
- `computeFullChart()` (index.ts) orchestrates every module and returns `ComputedChart`
- Called by the compute API and the unified-chart ingestion routes — never by LLM agents

## Deterministic Wave 1 (compute path)

Charts with `source="compute"` **skip LLM Wave 1**. The foundation data that agents
1C (Shadbala) and 1D (Relationship Geometry) would produce is computed
deterministically by the modules above and stored in `UnifiedChart` domain columns.

In `/api/unified-charts/[id]/analyze`:
- `resolvePlan()` runs, then all Wave 1 (`'1'`-prefixed) agents are stripped and
  wave 1 is marked skipped.
- `wave1_delta` is assembled from the chart's domain columns (`planets`,
  `nakshatras`, `shadbala`, `bhavaBala`, `relationships`, `jaimini`, `ashtakavarga`,
  `yogas`) shaped as `1A`/`1B`/`1C`/`1D` deltas — `yogas` rides under `1D`.
- `executePipeline()` is called with `wave1Source: "compute"`.

The legacy `Chart` / `source="paste"` path still runs LLM Wave 1 (agents 1A–1D
remain in `AGENT_CATALOGUE` and `ALWAYS_RUN_FIRST_QUERY`).
