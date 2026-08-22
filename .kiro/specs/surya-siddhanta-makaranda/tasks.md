# Implementation Plan: Sri Surya Siddhanta — Generalized Makaranda Profile

## Preconditions

- The approved requirements and design in this specification are the authority.
- `docs/reference/surya-siddhanta-makaranda/` is the local evidence bundle for
  JHora comparison. It is reference data, not executable code or runtime input.
- The India/Mojo JHora values are acceptance outputs only. Do not copy or reverse
  engineer JHora/PyJHora code.
- All production work uses strict TypeScript, pure engine functions, Prisma for DB
  changes, and the existing test conventions.

## Tasks

- [ ] 1. Establish profile contracts and golden fixtures
  - [~] 1.1 Add `CalculationProfileId`, `CalculationProfile`, a profile resolver,
    and immutable profile settings snapshots in `engine/compute/profiles.ts`.
    Define the current Drik/Lahiri profile and the approved SSS/Makaranda profile.
  - [~] 1.2 Extend birth-time parsing/JD conversion to preserve fractional seconds;
    retain existing whole-second API compatibility. Update every compute, Gochar,
    timeline, Varshaphal, unified-chart, and MCP birth-input schema and form so
    `HH:MM:SS.s...` is accepted and propagated without `Date.UTC` truncation.
  - [~] 1.3 Add hand-transcribed India and Mojo fixture data in a test-only module;
    do not parse `.jhd` or screenshots in tests. Record the source, first reader,
    and independent reviewer for every value.
  - [~] 1.4 Add failing golden-test skeletons for profile identity, India/Mojo
    natal values, and their split Vimshottari tests (seeded calendar mapping plus
    end-to-end Moon-to-Dasha).
  - _Requirements: 1.1–1.6, 2.4, 3, 6, 8.1–8.12_

- [ ] 2. Extract the existing Drik/Lahiri provider without behavior change
  - [~] 2.1 Define `AstronomyProvider` and move Swiss ephemeris sidereal planet,
    ascendant, and longitude-at-time operations out of `planets.ts`, `transits.ts`,
    and `gochar.ts` into `astronomy/drikLahiri.ts`. Make the precise-sunrise
    backwards-search origin and 72-hour bound an asserted provider invariant.
  - [~] 2.2 Thread the selected provider through `computeFullChart`, natal Gochar
    context, current transits, and Gochar range scans. Make profile input explicit
    on all supported birth-input route and MCP entry points.
  - [~] 2.3 Preserve all current Drik/Lahiri unit and integration outputs exactly;
    add regression tests before merging this extraction, including a pre-06:00
    local birth under legacy `sunriseMode: 'jhora'`.
  - _Requirements: 1.3–1.4, 4.3, 5.1_

- [ ] 3. Implement the standalone SSS/Makaranda natal provider
  - [~] 3.1 Implement pure-TypeScript normalized civil-time/JD and Makaranda
    day-count primitives with property tests for wraparound, supported-range
    boundaries, and fractional seconds. Enforce the 1800-01-01–2399-12-31 range
    with the specified typed range error. Do not call `swe_julday` on this path.
  - [~] 3.2 Implement the generalized Makaranda mean and corrected places for Sun,
    Moon, Mars, Mercury, Jupiter, Venus, and Saturn. Keep every intermediate term
    inspectable in development/test output.
  - [~] 3.3 Implement Sri Surya Siddhanta ayanamsa with no adjustment and mean
    Rahu; derive Ketu at exactly 180°. Assert both nodes' retrograde state and
    negative uniform model speed.
  - [~] 3.4 Implement the SSS/Makaranda Lagna calculation and whole-sign house
    attachment. Do not call Swiss house/sidereal APIs on this path.
  - [~] 3.5 Make the India and Mojo graha/Lagna golden tests pass within the agreed
    display tolerance; formula-unit-test and expose ayanamsa without inventing a
    direct JHora numeric assertion; add no hidden Drik fallback.
  - _Requirements: 2.1–2.8, 8.4, 8.10–8.11_

- [ ] 4. Make the complete natal derivation profile-aware
  - [~] 4.1 Feed SSS positions into nakshatra, varga, karaka, Ashtakavarga,
    upagraha, special-lagna, arudha, relationship, shadbala, Jaimini, Bhava Bala,
    and named-yoga computation.
  - [~] 4.2 Split precise sunrise *instant* from Sun longitude at sunrise; obtain
    the latter from the active provider. Reject SSS `sunriseMode: 'jhora'` and
    surface a precise-sunrise calculation failure rather than falling back. Use the
    most recent sunrise at or before birth and assert the India Bhava/Hora Lagnas;
    treat a negative elapsed-sunrise value as an invariant failure only on the
    SSS/precise path. Raise `SunriseUnavailableError` after the explicit 72-hour
    backwards search bound. Preserve the Drik/JHora pre-06:00 anchor explicitly.
  - [~] 4.3 Run the India/Mojo varga and special-lagna screenshots as manual
    regression checks; promote only independently transcribed stable values into
    automated assertions.
  - [~] 4.4 Make SSS Chara Dasha and Varshaphal return an explicit unsupported
    temporal-convention error. Prove they cannot reach the Drik `YEAR_DAYS` or
    `365.25636` paths until their independent rule and oracle fixtures are added.
    Return HTTP 422 from Varshaphal, structured unsupported MCP results from
    `get_chara_dasha` / `compute_varshaphal`, and unavailable UI-tab states; add
    regression tests that rule out an unhandled 500.
  - _Requirements: 2.7, 4.1–4.5, 8.2_

- [ ] 5. Implement true-sidereal-solar-year Vimshottari
  - [~] 5.1 Refactor `computeVimshottari` to receive a profile year-basis strategy
    instead of importing a single global `YEAR_DAYS` value.
  - [~] 5.2 Implement and document the true-sidereal-solar-year strategy as an
    unwrapped SSS-Sun sidereal-longitude root finder. Test positive and negative
    fractional targets, 0°/360° rollover, backwards and forwards bracketing, and
    convergence to sub-second resolution.
  - [~] 5.3 Apply the approved Moon/D1/Krittika/zodiacal/forward settings. Given
    each accepted fixture Dasha seed, make all subsequent India/Mojo Mahadasha
    boundaries pass to displayed-second precision; separately make the
    end-to-end Moon-to-Dasha test pass within the documented four-hour initial
    tolerance. Make the India fractional Saturn balance a differential regression:
    the current fixed `YEAR_DAYS` conversion must miss the JHora seed by ≥60 hours.
  - [~] 5.4 Keep existing Drik dasha behavior covered by non-regression tests.
  - [~] 5.5 Add a capability gate that returns
    `PROFILE_FRACTIONAL_DASHA_UNVALIDATED` for SSS Antardasha, Pratyantardasha,
    and Duration Analysis until the new India/Mojo JHora AD/PD tables are encoded
    as passing test fixtures. Persist an MD-only tree with empty AD arrays and
    `fractionalDashaStatus: 'unvalidated'`; keep chart list/detail and natal AI
    analysis available, while checking the marker before all dasha/Duration
    slicers. Retain MD integrity checks while conditionally bypassing only the
    otherwise-required AD/PD-completeness checks for that marker. Assert every
    displayed boundary, lord order, and contiguity in both expansions; lift the
    gate only after those tests pass.
  - _Requirements: 3.1–3.7, 5.4–5.7, 8.5–8.8, 8.11–8.12_

- [ ] 6. Add profile provenance and safe persistence
  - [~] 6.1 Add calculation profile/version/settings fields to `UnifiedChart` via
    Prisma migration; backfill existing compute records as Drik/Lahiri without
    recomputing data or hashes.
  - [~] 6.2 Make canonical chart hashes, legacy compatibility hashes, and Wave-1
    cache identity profile-aware. Use recursively sorted canonical serialization,
    never hash open-ended settings JSON, and retain the exact pre-migration hash
    payload for `drik_lahiri_v1` so old and newly submitted default charts dedupe.
  - [~] 6.3 Update mappers, `ChartInputV1` synthesis, and generated metadata so
    SSS charts state their actual system and paste charts preserve unknown/external
    provenance. Make `ChartInputV1.meta.system` profile-aware and update
    `docs/ChartInputV1_schema.md` in the same change.
  - [~] 6.4 Add migration and dedup tests proving same birth input / different
    profile produces distinct saved charts and separate caches.
  - _Requirements: 1.2, 1.5–1.6, 6.1–6.3, 8.9_

- [ ] 7. Complete profile-sensitive time features
  - [~] 7.1 Implement SSS longitude evaluation for current transits, date-ranged
    Gochar ingress refinement, and degree Sade Sati. Leave SSS Varsha Pravesh
    explicitly unavailable.
  - [~] 7.2 Thread profile provenance into Duration Analysis slicing, transit
    overlay, scores, persistent runs, and follow-up context; expose the visible
    `profile_recalibration_pending` score status until SSS calibration exists.
    Do this only after task 5.5's fractional-dasha capability gate is lifted.
  - [~] 7.3 Add profile-consistency guards so a saved chart, dasha tree, and
    transit overlay cannot be mixed across profiles.
  - [~] 7.4 Reject mismatched profile ID/version in matchmaking preview and
    persistence routes with HTTP 422; add route and UI regression tests proving
    no mixed-profile score is created.
  - _Requirements: 4.4–4.5, 5.1–5.6, 6.7_

- [ ] 8. Expose independent profile charts in API, UI, reports, and MCP
  - [~] 8.1 Add validated `calculationProfile` input to every supported compute,
    save, Gochar, timeline, and MCP birth-input route, and return profile ID/label
    in list/detail responses. Saved charts always override a caller-supplied
    profile with their persisted identity.
  - [~] 8.2 Add the calculation-profile selector and a non-destructive
    “generate as separate chart” flow in the chart UI. Permit fractional-second
    time entry and constrain SSS to precise sunrise in the form.
  - [~] 8.3 Replace universal Lahiri wording in chart tables, Dasha, Gochar,
    reports, Copy-for-AI, API responses, and MCP descriptions with profile-driven
    labels.
  - [~] 8.4 Verify existing Lahiri UI snapshots and interactions still work.
  - _Requirements: 5.1–5.6, 6.4–6.7, 7.1–7.5_

- [ ] 9. Validate, document, and stage the release
  - [~] 9.1 Run full type-check, unit, integration, API, and UI test suites.
  - [~] 9.2 Verify India and Mojo against JHora screenshots; record any remaining
    discrepancies with exact component and magnitude before release. Re-audit all
    fixture values, MD ordering, and SSS supported-range boundaries.
  - [~] 9.3 Update `Agents.md`, `.kiro/skills/`, `docs/ERD.md`, `docs/HLD.md`,
    `docs/DFD.md`, `Claude.md`, `docs/ChartInputV1_schema.md`, relevant compute
    documents, API/MCP docs, and `docs/ROADMAP.md` in the same implementation
    change.
  - [~] 9.4 Release with Drik/Lahiri as default and no automatic recomputation of
    existing charts. Promote SSS availability only after practitioner fixture
    sign-off.
  - _Requirements: 8, 9_

## Dependency Notes

- Tasks 1–3 are the core scientific milestone. Task 3 must not be hidden behind
  UI/database work, and its golden tests gate every later task.
- Task 5 cannot be accepted merely because a Moon nakshatra matches; the true
  sidereal solar-year mapping needs independent date-boundary verification.
- Tasks 6–8 are required before saved SSS charts are exposed to AI Analysis,
  duration work, reports, or MCP. A natal-only temporary tool is permissible only
  if it is explicitly labelled non-persistent and cannot enter the pipeline.
