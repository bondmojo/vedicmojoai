# Requirements: Sri Surya Siddhanta — Generalized Makaranda Profile

**Status:** Approved implementation specification; not implemented

## Introduction

VedicMojoAI currently computes all generated charts with the modern Swiss
Ephemeris / Drik astronomy path, Lahiri ayanamsa, true nodes, whole-sign houses,
and a fixed Gregorian mean year for Vimshottari. This feature adds a *second,
independent* deterministic calculation profile:

```text
surya_siddhanta_makaranda_v1
```

It calculates natal positions with a standalone implementation of **Sri Surya
Siddhanta (SSS), generalized Makaranda version**, uses **Sri Surya Siddhanta
ayanamsa** without an adjustment, uses **mean Rahu/Ketu**, retains whole-sign
houses, and uses **true sidereal solar years** for Vimshottari. The profile is
calibrated against the user-provided Jagannatha Hora (JHora) reference records in
`docs/reference/surya-siddhanta-makaranda/`.

JHora is an acceptance oracle only. The application MUST implement its own
classical formulas; it MUST NOT vendor, decompile, copy, or call JHora/PyJHora at
runtime.

## Glossary

- **Calculation Profile:** An immutable named bundle of astronomy, ayanamsa, node,
  dasha-year, house, and sunrise conventions used to compute a chart.
- **Drik/Lahiri Profile:** The existing modern Swiss Ephemeris + Lahiri profile.
- **SSS/Makaranda Profile:** `surya_siddhanta_makaranda_v1`, the new standalone
  Sri Surya Siddhanta generalized-Makaranda implementation.
- **True Sidereal Solar Year:** One complete sidereal revolution of the SSS Sun.
  It is a solved Sun-longitude event, not the current `365.2425`-day constant or
  another fixed number of days.
- **Oracle Fixture:** A version-controlled birth input and expected JHora output
  used solely to verify our independent implementation.

## Requirement 1: Independent Calculation Profiles

**User story:** As a practitioner, I want to generate charts under either Drik/
Lahiri or SSS/Makaranda rules so that one system never silently changes or
reinterprets the other.

### Acceptance criteria

1. The engine SHALL define stable IDs for `drik_lahiri_v1` and
   `surya_siddhanta_makaranda_v1`.
2. Every compute-path chart SHALL carry an immutable calculation-profile ID,
   profile version, and a machine-readable settings snapshot.
3. The SSS/Makaranda profile SHALL compute its planetary longitudes, mean nodes,
   ayanamsa, and ascendant without calling `swisseph.swe_calc*`,
   `swe_houses_ex`, or `swe_set_sid_mode` for those values.
4. The current Swiss/Lahiri result SHALL remain equal to its existing regression
   fixtures and preserve its existing route behaviour whenever `drik_lahiri_v1`
   is selected.
5. A profile selection SHALL never alter an existing saved chart. Saving the same
   birth details under another profile SHALL produce a distinct chart identity.
6. Paste-path charts SHALL not be labelled as SSS/Makaranda unless their supplied
   source explicitly proves that profile. Existing paste charts remain external/
   unspecified provenance.

## Requirement 2: SSS/Makaranda Astronomy Contract

**User story:** As a practitioner following the Makaranda tradition, I want the
engine to calculate the same foundational chart as the selected JHora method.

### Acceptance criteria

1. The SSS/Makaranda provider SHALL implement the generalized Makaranda version
   of Sri Surya Siddhanta for all nine grahas and the Lagna for civil dates from
   1800-01-01 through 2399-12-31 inclusive. A request outside that range SHALL
   fail with a typed range error; it SHALL never fall back to Drik/Swiss.
2. The provider SHALL use the Sri Surya Siddhanta ayanamsa with a zero additional
   correction. It SHALL expose the computed ayanamsa value and its provenance.
3. Rahu SHALL be the profile's mean node and SHALL report retrograde motion with
   a model-derived negative uniform longitudinal speed. Ketu SHALL be exactly
   Rahu + 180° normalized to `[0, 360)`, with the corresponding retrograde state
   and speed.
4. The provider SHALL retain fractional birth seconds end-to-end. Inputs such as
   the India fixture's saved `0.000167` hours SHALL not be silently rounded to a
   whole second by an input validator, UTC/JD conversion, identity hash,
   persistence mapper, or Dasha-seed operation.
5. The provider SHALL produce normalized absolute sidereal longitude, sign,
   degree-in-sign, house, retrograde state, and any speed data required by
   downstream deterministic modules.
6. The profile SHALL use whole-sign houses. House derivations after the ascendant
   is calculated SHALL remain profile-independent arithmetic.
7. The SSS/Makaranda profile SHALL require `sunriseMode: 'precise'` for
   sunrise-dependent special lagnas. The anchor SHALL be the most recent precise
   astronomical sunrise at or before the birth instant, including for a birth
   before that day's sunrise. The precise provider SHALL search backwards for no
   more than 72 hours; no rise in that bound (for example, polar day/night) SHALL
   produce a typed `SunriseUnavailableError`. A request for `sunriseMode: 'jhora'`
   SHALL be rejected with a typed validation error, and neither case may silently
   select the legacy 06:00 JHora fallback or normalize a negative elapsed-sunrise
   value by adding 24 hours. This is an intentional, documented external
   astronomical boundary: SSS/Makaranda planetary longitudes at that moment still
   come from the SSS provider.
8. The Drik-only JHora controls shown in the reference UI (apparent/true
   position, refraction, aberration, gravitation, and nutation) SHALL NOT be
   represented as SSS/Makaranda settings; JHora explicitly declares them
   irrelevant while SSS is active.
9. The existing Drik `sunriseMode: 'jhora'` convention SHALL remain numerically
   unchanged: its anchor is the most recent local 06:00 at or before birth. A
   pre-06:00 Drik/JHora regression fixture SHALL prove that extracting the sunrise
   provider does not change that result.

## Requirement 3: Vimshottari Contract

**User story:** As a practitioner, I want dasha dates to follow the same calendar
convention as the SSS reference chart rather than merely use a changed Moon
longitude with the old year constant.

### Acceptance criteria

1. SSS/Makaranda Vimshottari SHALL start from Janma Tara (Moon) in the Rasi/D1
   chart.
2. It SHALL use the standard Krittika-to-Sun nakshatra ownership allocation.
3. It SHALL use the normal zodiacal direction, not the antizodiacal option.
4. Antardashas SHALL start from the running dasha lord and proceed forward in the
   order recorded by the JHora reference.
5. It SHALL use true sidereal solar years: one dasha year is one complete
   sidereal revolution of the SSS Sun. Each UTC boundary SHALL be found by
   solving the SSS Sun's unwrapped sidereal longitude for the required signed,
   integral or fractional number of solar revolutions; it SHALL not be calculated
   by multiplying by a fixed day count.
6. `YEAR_DAYS = 365.2425` SHALL remain available only to `drik_lahiri_v1` and
   MUST NOT be implicitly reused for SSS.
7. The implementation SHALL make the SSS Sun-longitude/root-finding calendar
   strategy explicit and unit-test it independently of Moon/nakshatra selection.

## Requirement 4: Derived Natal Data

**User story:** As a practitioner, I want all generated data to arise from one
profile-consistent natal foundation.

### Acceptance criteria

1. Nakshatras, padas, sub-lords, vargas, karakas, Ashtakavarga, upagrahas,
   special lagnas, arudhas, strengths, relationships, Jaimini, Bhava Bala, and
   yogas SHALL consume SSS/Makaranda natal positions when this profile is
   selected.
2. Derived modules that require a Sun-at-sunrise value SHALL receive the
   profile's SSS Sun longitude at the retained precise sunrise instant.
   India Bhava Lagna and Hora Lagna SHALL be regression assertions that prove a
   pre-sunrise birth anchors to the preceding day's sunrise; an elapsed-sunrise
   `+24h` recovery branch is forbidden on this path.
3. Existing Drik/Lahiri algorithms SHALL remain unchanged unless a profile input
   is explicitly threaded through them.
4. A result, report, or AI prompt SHALL never combine natal data from one profile
   with a dasha tree, transit overlay, or derived table from another profile.
5. Chara Dasha and Varshaphal/Varsha Pravesh SHALL be unsupported for
   `surya_siddhanta_makaranda_v1` in the initial release. Their respective
   Drik-only `YEAR_DAYS` and `365.25636` rules SHALL NOT be silently reused.
   They may be enabled only after a separately approved SSS temporal convention
   and JHora oracle fixtures establish the required rule. The Varshaphal HTTP
   route SHALL return HTTP 422 with
   `PROFILE_TEMPORAL_CONVENTION_UNRESOLVED`; the `get_chara_dasha` and
   `compute_varshaphal` MCP tools SHALL return a structured unsupported result
   carrying that code; and their UI tabs SHALL render an unavailable state. No
   unsupported SSS request may throw an unhandled error or receive a Drik result.

## Requirement 5: Transits, Gochar, and Duration Analysis

**User story:** As a practitioner, I want timing views and duration analysis to
use the same astronomy as the natal chart they explain.

### Acceptance criteria

1. Current transits, Sade Sati, and Gochar occupancy ranges SHALL select the
   saved chart's calculation profile. Profile-sensitive unsaved-input routes
   (`POST /api/gochar`, `POST /api/timeline`, applicable compute routes, and
   MCP `chart.ts`) SHALL accept a validated optional profile ID and default it to
   `drik_lahiri_v1`; saved-chart routes SHALL use the saved profile as the source
   of truth. The unsupported SSS Varsha Pravesh endpoint SHALL fail as specified
   in Requirement 4.5.
2. The SSS/Makaranda transit provider SHALL evaluate its own longitudes and
   derive speeds numerically when required by ingress scanning; it SHALL not call
   the Swiss sidereal projection as a substitute.
3. Gochar response labels, page labels, reports, and MCP output SHALL identify the
   selected profile, rather than hard-code “Lahiri.”
4. After the fractional-dasha validation gate in criterion 7 has passed, Duration
   Analysis SHALL use the saved chart's profile-specific dasha tree and
   profile-specific transit overlay.
5. A duration-analysis run, report, and follow-up context SHALL retain the chart
   profile provenance used at launch.
6. SSS duration scores SHALL be labelled `profile_recalibration_pending` and
   SHALL NOT be presented as calibrated until an independent SSS back-test has
   established profile-specific weights and acceptance evidence.
7. The reference bundle supplies displayed Antardasha and Pratyantardasha
   expansions for India and Mojo. Until their test-only fixture transcription is
   implemented and all fractional-boundary assertions pass, an SSS chart SHALL
   persist an explicit MD-only Dasha tree: each Mahadasha has `antardashas: []`
   and the tree has `fractionalDashaStatus: 'unvalidated'`. Chart list/detail and
   natal AI Analysis SHALL remain available and visibly report that status; chart
   summaries SHALL omit active AD/PD timing rather than infer it. Dasha-integrity
   checks SHALL still enforce Mahadasha chronology, but SHALL skip only the
   AD/PD-completeness checks while this marker is present; the full checks remain
   mandatory for `fractionalDashaStatus: 'complete'`. `get_dasha_tree`,
   `get_active_dasha`, `POST /api/timeline`, and `POST /api/duration-analysis`
   SHALL check the marker before a slicer is called and return the structured code
   `PROFILE_FRACTIONAL_DASHA_UNVALIDATED` (HTTP 422 for HTTP routes; an equivalent
   structured unsupported result for MCP). Dasha/Duration UI surfaces SHALL show
   an unavailable state. This gate is independent of the score-recalibration label.

## Requirement 6: Persistence, Identity, and API

**User story:** As a practitioner, I need historical chart work to remain
reproducible while independently saving an SSS rendition of the same birth data.

### Acceptance criteria

1. `UnifiedChart` SHALL gain explicit profile/provenance fields through a Prisma
   migration. Existing compute charts SHALL be backfilled as `drik_lahiri_v1`;
   no numerical data or existing hashes are recalculated in that migration.
2. Canonical compute chart hashing and deduplication SHALL include profile identity
   and version in addition to the birth input and sunrise convention, using a
   documented stable, sorted-key canonical serializer. It SHALL NOT hash an
   open-ended `calculationSettings` JSON snapshot. To retain legacy Drik
   deduplication, `drik_lahiri_v1` SHALL deliberately use the exact pre-migration
   compute-hash payload; all non-legacy profiles SHALL use a versioned canonical
   identity containing the profile ID and version.
3. Wave-1 caching, legacy-Chart compatibility records, and any cache key derived
   from a chart SHALL be profile-safe.
4. `POST /api/compute` and `POST /api/unified-charts/from-compute` SHALL accept a
   validated profile selection, defaulting to `drik_lahiri_v1` until an explicit
   product decision changes that default.
5. List, detail, report, and MCP payloads SHALL return both a stable profile ID and
   human-readable profile label.
6. Changing a calculation profile from the UI SHALL create a new chart rather
   than use the existing in-place birth-data edit path.
7. Matchmaking inputs SHALL require the same calculation-profile ID and profile
   version for both charts. `POST /api/matchmaking` and
   `POST /api/matchmaking/preview` SHALL reject a mixed-profile pair with HTTP
   422 and a clear practitioner-facing explanation; they SHALL neither compute nor
   persist a mixed-profile score.

## Requirement 7: UI and Practitioner Safety

**User story:** As a practitioner, I need to see exactly which calculation system
produced a chart and compare independent charts without ambiguity.

### Acceptance criteria

1. The generation form SHALL offer the two calculation profiles with concise,
   accurate descriptions.
2. Chart pages, tables, dasha, transits, reports, copy-for-AI output, and exports
   SHALL display profile label and ayanamsa without calling an SSS chart “Lahiri.”
3. Existing Lahiri charts SHALL remain selectable and viewable without migration.
4. The UI SHALL offer a non-destructive route to generate a second profile chart
   from the same birth details; a comparison view is a later increment, not a
   prerequisite for the first SSS release.
5. Accessibility and state-management patterns SHALL follow
   `.kiro/skills/ai-frontend.md` and its focused guides.

## Requirement 8: Oracle Validation and Guardrails

**User story:** As a maintainer, I need objective regression gates so an astronomy
change cannot silently drift from the agreed reference calculation.

### Acceptance criteria

1. The user-provided India and Mojo source records and JHora screenshots SHALL be
   preserved under `docs/reference/surya-siddhanta-makaranda/`.
2. Automated tests SHALL use independently transcribed expected values; tests
   SHALL never parse the JHora screenshots at runtime.
3. Before release, fixture transcriptions SHALL receive a two-pass human audit.
   The checked-in fixture record SHALL identify the evidence source, reviewer
   status, and any unresolved reading; automated tests SHALL use only that audited
   transcription.
4. The natal-graha, mean-node, and Lagna values for both fixtures SHALL match the
   documented reference display within a declared display-precision tolerance
   (initially one arcsecond, tightened when a textual JHora export is available).
   Ayanamsa SHALL be exposed and formula-unit-tested, but it SHALL not have a
   direct fixture equality assertion until a displayed numeric JHora value is
   supplied.
5. Calendar-mapping dasha tests, seeded with an accepted fixture Dasha start
   instant, SHALL reproduce all subsequent displayed Maha Dasha boundaries to one
   displayed second and the expected lord sequence/order. This isolates the SSS
   solar-year calendar from Moon-display precision, but cannot by itself reject a
   fixed-day model because each supplied Mahadasha boundary is at an integer
   Dasha-year offset. The fractional tests in criteria 6 and 12 provide that
   discrimination.
6. End-to-end Moon → Dasha tests SHALL use a tolerance mathematically compatible
   with the natal Moon tolerance: initially at most four hours for a one-arcsecond
   Moon tolerance. This is the discriminating calendar test: it SHALL include the
   India fractional Saturn-balance interval and prove that the current fixed-day
   `YEAR_DAYS = 365.2425` mapping misses the JHora Dasha seed by at least 60 hours.
   They may tighten only when the Moon fixture precision supports it; they SHALL
   not claim one-second end-to-end accuracy from an arcsecond natal oracle or
   relax this differential test.
7. Fixture tests SHALL prove Maha Dasha chronology (no gaps or overlaps) and
   classical-duration consistency under the SSS solar-revolution mapping.
8. Tests SHALL prove that Drik/Lahiri fixture behavior remains unchanged.
9. Tests SHALL prove profile hashing/cache separation: identical birth input under
   the two profile IDs cannot collide.
10. Tests SHALL verify no SSS provider path calls Swiss planetary, house,
    sidereal, or Julian-day APIs. The retained precise-sunrise instant helper is
    the only documented native boundary; it may not provide an SSS sidereal
    coordinate.
11. Tests SHALL exercise the SSS Sun root finder across the supported range,
    including positive and negative fractional-year targets, bracketing before
    the seed, and a rollover at 0°/360°.
12. Before the fractional-dasha validation gate is lifted, test fixtures SHALL
    transcribe and assert every displayed Antardasha and Pratyantardasha boundary
    in the India and Mojo expansions, including lord order and contiguity.

## Requirement 9: Documentation and Rollout

1. The implementation change SHALL update `Agents.md`, `.kiro/skills/`,
   `docs/ERD.md`, `docs/HLD.md`, `docs/DFD.md`, `Claude.md`, and current
   calculation documentation in the same change, as applicable. It SHALL update
   `docs/ChartInputV1_schema.md` and make `ChartInputV1.meta.system`
   profile-aware rather than a Lahiri-only literal.
2. Documentation SHALL distinguish **current behavior** (Drik/Lahiri) from the
   **planned/implemented SSS profile**. A planned feature MUST NOT be presented as
   already live.
3. The feature SHALL roll out with Drik/Lahiri remaining the default and with no
   backfill or overwrite of saved charts.

## Out of Scope

- Replacing the existing Drik/Lahiri profile or changing its calculations.
- Treating the Swiss `SE_SIDM_SURYASIDDHANTA` ayanamsa setting as a full SSS
  planetary engine.
- Runtime dependence on JHora, PyJHora, screenshots, or other external desktop
  software.
- A general `.jhd` file-import feature. The supplied `.jhd` files are reference
  inputs for this implementation, not an API contract.
- Enabling SSS Chara Dasha or Varshaphal/Varsha Pravesh before their separate
  temporal-rule and oracle-fixture decision.
