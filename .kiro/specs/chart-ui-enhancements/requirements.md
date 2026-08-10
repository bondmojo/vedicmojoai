# Requirements Document

## Introduction

This feature enhances the practitioner-facing chart visualisation on the Generate Chart page
(`app/page.tsx` and the components under `app/components/`) so that data the compute engine
already produces becomes visible, and so that the meaning of the existing colour coding is
documented in the interface rather than living only in the source.

Six changes are in scope:

1. Combusted planets surfaced in the Key Dignities panel on the Summary tab.
2. A reason statement explaining **why** each dignity label applies.
3. The Planets, Nakshatras and Karakas tabs merged into a single **Grahas** tab (one row per graha).
4. Bhinnashtakavarga rendered as per-planet chart diagrams, plus a bindu legend.
5. Sade Sati split into sign-based and degree-based readings, with non-current periods de-emphasised.
6. A new **Yogas** tab exposing the deterministic named-yoga catalogue.

**Data availability (verified against the codebase).** Five of the six items are pure UI work
because `POST /api/compute` returns the whole `ComputedChart` object:

| Need | Source field | Status |
|---|---|---|
| Combustion | `chart.relationships.combustion[]` (`combust`, `cazimi`, `nearCombust`, `degreeFromSun`, `threshold`, `moonStrictCombust`) | Already on the payload |
| Dignity label | `chart.divisionalCharts[].planets[].dignity`, `.vargottama` | Already on the payload |
| Dignity reason | Derivable from the tables in `engine/compute/dignity.ts`; no reason string is emitted today | New derivation needed |
| BAV / SAV | `chart.ashtakavarga.bav` (sign-indexed), `.byHouse` (pre-rotated), `.sav`, `.savTotal` | Already on the payload |
| Nakshatra + karaka rows | `chart.nakshatras`, `chart.charaKarakas` | Already on the payload |
| Named yogas | `chart.yogas[]` (`Yoga` — key, name, category, planets, houses, benefic, strength, activatingPlanets, evidence) | Already on the payload, not rendered anywhere |
| Sign-based Sade Sati | `chart.transits.sadeSati` (`active`, `phase`, `saturnSignNumber`, `natalMoonSignNumber`, `description`, `allPeriods[]`) | Already on the payload |
| Degree-based Sade Sati | — | **Compute-engine addition required** (`engine/compute/transits.ts`), modelled on PVR Narasimha Rao's implementation in Jagannatha Hora / PyJHora — already the calibration reference for `engine/compute/charaDasha.ts` and `docs/computation_chara_dasha.md` |

**Confirmed design decisions (user, requirements phase).**

- Planets / Nakshatras / Karakas merge into **one** `Grahas` tab as a single wide table, one row per
  graha. Karaka significations move out of the table into a tooltip or companion panel.
- Existing colour semantics are **documented as-is** via visible legends, with the hardcoded
  Tailwind palette in `AshtakavargaView.tsx` migrated to the semantic brand tokens in
  `lib/brandColors.ts`. Thresholds and meanings are unchanged.
- The degree-based Sade Sati reading follows **PVR Narasimha Rao's** contiguous-period model: one
  dated period per passage of Saturn through a 90° window centred on the natal Moon's sidereal
  longitude (±45°), with **no** `rising` / `peak` / `setting` subdivision. Those three phase names
  remain exclusive to the sign-based reading. The user-supplied Reference_Chart output is the
  calibration fixture: for natal Moon 347.76°, period #2 runs 2023-02-10 → 2030-05-09 and period #3
  runs 2052-03-20 → 2059-06-19.
- Moolatrikona becomes a **degree-range** test rather than a whole-sign test, matching PVR and BPHS.
  This is a **behaviour change to the existing dignity classifier**, not a presentational addition:
  `MOOLATRIKONA_SIGNS` in `engine/compute/dignity.ts` currently maps each planet to a whole sign, so
  `getVargaDignityLabel` will begin returning `own` instead of `moolatrikona` for degree-bearing D1
  placements that fall outside the classical range. Every existing consumer of the `dignity` label —
  the divisional-chart payload, the Key_Dignities_Panel, the Duration-Analysis scorer and the
  compute-path `wave1_delta` — sees the changed label. Scope is deliberately narrow: the degree test
  applies only where a degree within the sign is available (D1 placements); a divisional placement
  carrying only a sign keeps the existing sign-only rule, because no degree exists to test.

**Out of scope.** Changes to Wave 1–4 LLM agents, the `get_yogas` / MCP surface, the paste-source
(`Chart`) ingestion path, the AI Analysis and Duration Analysis pages, and the report renderer.

## Glossary

- **Generate_Chart_Page**: The chart computation page at `/` (`app/page.tsx`), which renders the
  tab strip and the result panes for a computed chart.
- **Compute_Engine**: The deterministic Swiss-Ephemeris modules under `engine/compute/`, entered
  through `computeFullChart()` and served by `POST /api/compute`.
- **Key_Dignities_Panel**: The "Key Dignities" card at the bottom of the Summary tab
  (`app/components/ChartSummaryTab.tsx`).
- **Grahas_Tab**: The new single tab replacing the current Planets, Nakshatras and Karakas tabs.
- **Ashtakavarga_View**: The Ashtakavarga tab component (`app/components/AshtakavargaView.tsx`),
  also embedded by `DurationComputationResults`.
- **Transits_View**: The Transits tab component (`app/components/TransitsView.tsx`).
- **Sade_Sati_Panel**: The Sade Sati sub-section of Transits_View.
- **Yogas_Tab**: The new tab rendering `chart.yogas`.
- **Legend**: A visible key within a pane that maps each colour band used in that pane to its
  numeric range or category name in text.
- **Dignity_Label**: One of `exalted`, `debilitated`, `moolatrikona`, `own`, `great_friend`,
  `friend`, `neutral`, `enemy`, `great_enemy` — the Panchadha-maitri classification produced by
  `engine/compute/dignity.ts`. Absent for Rahu and Ketu.
- **Dignity_Reason**: A short human-readable statement naming the classical rule that produced a
  Dignity_Label, e.g. "Aries is the Sun's exaltation sign", or for compound maitri, the permanent
  relation and the temporary relation that were combined.
- **Sign_Lord**: The classical ruling planet of a sign, per `SIGN_LORDS` in
  `engine/compute/dignity.ts`.
- **Vargottama**: A planet occupying the same sign in a divisional chart as it does in D1.
- **Combust**: A planet within its classical combustion threshold of the Sun
  (`COMBUSTION_THRESHOLDS` in `engine/compute/relationships.ts`), reported as `combust: true`.
- **Cazimi**: A planet within the innermost orb of the Sun, reported as `cazimi: true` — classically
  a strengthening rather than a weakening condition.
- **Near_Combust**: A planet approaching but not inside the combustion threshold, reported as
  `nearCombust: true`.
- **BAV** (Bhinnashtakavarga): Per-planet bindu counts, 0–8 per sign, for the seven non-nodal
  grahas.
- **SAV** (Sarvashtakavarga): The sum of all seven BAVs per sign, 0–56.
- **Bindu**: One benefic point in an Ashtakavarga reckoning.
- **Index_Mode**: The Ashtakavarga_View control selecting whether the 12 slots are read as zodiac
  signs or as houses counted from the lagna.
- **Sign_Based_Sade_Sati**: The reading already implemented — Saturn transiting the 12th, 1st or 2nd
  **sign** counted from the natal Moon's sign, with phases `rising`, `peak`, `setting` respectively.
- **Degree_Based_Sade_Sati**: The reading to be added, following PVR Narasimha Rao's reference
  implementation (Jagannatha Hora / PyJHora) — Saturn's sidereal longitude lying within 45° either
  side of the natal Moon's sidereal longitude, a 90° angular window taking ≈7.25 years to traverse at
  Saturn's mean motion. Each passage of Saturn through that window is reported as **one contiguous
  dated period**. The window is purely angular: it can span parts of four signs, it carries no
  `rising` / `peak` / `setting` subdivision, and membership is never decided by sign.
- **Sade_Sati_Period**: One dated period of either reading, carrying a start instant, an end instant,
  and whether it contains the reference instant reported as `TransitAnalysis.asOf`. A
  Sign_Based_Sade_Sati period additionally carries a phase name of `rising`, `peak` or `setting`; a
  Degree_Based_Sade_Sati period instead carries a sequence number.
- **Moolatrikona_Range**: The classical degree span within a planet's moolatrikona sign — Sun 0°
  through 20° of Leo, Moon 4° through 30° of Taurus, Mars 0° through 12° of Aries, Mercury 16°
  through 20° of Virgo, Jupiter 0° through 10° of Sagittarius, Venus 0° through 15° of Libra, Saturn
  0° through 20° of Aquarius — outside which the placement is classified as own sign rather than
  moolatrikona. The Moon's and Mercury's spans are never reached, because the moolatrikona sign of
  each of those two planets is also its exaltation sign and exaltation is tested first; for the
  remaining five planets the moolatrikona sign is also one of that planet's own signs.
- **Reference_Chart**: The "Mojo" chart (natal Moon sidereal longitude 347.76°, Taurus lagna) used as
  the calibration fixture across the computation documents, including
  `docs/computation_special_lagnas.md` and `docs/computation_chara_dasha.md`.
- **Named_Yoga**: One entry of the deterministic `Yoga[]` catalogue from `engine/compute/yogas.ts`.
- **Brand_Token**: A semantic CSS-variable-backed Tailwind class exported through
  `lib/brandColors.ts` (for example `text-favorable`, `text-cautionary`, `text-unfavorable`,
  `planetColorClass()`).
- **Non_Colour_Signal**: A text label, glyph, border style or ARIA attribute that conveys a status
  independently of hue.

## Requirements

### Requirement 1: Combustion in Key Dignities

**User Story:** As a practitioner scanning the Summary tab, I want combusted planets listed
alongside exaltation and debilitation, so that I can judge a planet's usable strength without
opening another tab.

#### Acceptance Criteria

1. WHEN the Summary tab renders and `chart.relationships.combustion` contains an entry whose
   `combust` is true, THE Key_Dignities_Panel SHALL display one chip for that entry's planet
   carrying the planet name and the text "Combust".
2. WHEN a combustion entry has `cazimi` equal to true, THE Key_Dignities_Panel SHALL display the
   text "Cazimi" on that planet's single combustion chip in addition to the text "Combust" required
   by criterion 1, and SHALL style that chip with the favourable Brand_Token family, that styling
   taking precedence over the styling used for ordinary Combust chips.
3. WHEN a combustion entry has `nearCombust` equal to true and `combust` equal to false, THE
   Key_Dignities_Panel SHALL display a chip carrying the planet name and the text "Near combust",
   and SHALL NOT display the text "Combust" on that chip.
4. WHERE a combustion chip is displayed and that entry's `degreeFromSun` and `threshold` are both
   finite numbers, THE Key_Dignities_Panel SHALL display `degreeFromSun` rounded half away from zero
   to exactly one fractional digit with the trailing zero retained (a separation of zero displayed
   as "0.0"), followed by a degree symbol, together with the entry's `threshold` value in degrees
   exactly as that entry carries it.
5. WHEN the Moon's combustion entry has `moonStrictCombust` equal to true, THE Key_Dignities_Panel
   SHALL display the text "Combust (8° strict)" on the Moon's chip in addition to the text
   "Combust", and this flag being true SHALL be the only condition under which the text
   "Combust (8° strict)" is displayed.
6. IF `chart.relationships` is absent, `chart.relationships.combustion` is absent, or
   `chart.relationships.combustion` contains zero entries, THEN THE Key_Dignities_Panel SHALL render
   its remaining dignity and Vargottama chips unchanged, SHALL omit all combustion chips, and SHALL
   NOT surface an error indication.
7. THE Key_Dignities_Panel SHALL convey each combustion state — Combust, Cazimi, Near_Combust and
   the Moon's strict-threshold state — through a text label on the chip in addition to colour,
   satisfying the Non_Colour_Signal rule.
8. THE Key_Dignities_Panel SHALL display at most one combustion chip per planet, SHALL display a
   combustion chip only for planets carried as entries in `chart.relationships.combustion` (which
   carries no entry for the Sun, Rahu or Ketu), and SHALL order the combustion chips by ascending
   `degreeFromSun`, resolving equal values by the order of the entries in that array.
9. IF a combustion entry has `combust`, `cazimi` and `nearCombust` all equal to false and does not
   carry `moonStrictCombust` equal to true, THEN THE Key_Dignities_Panel SHALL omit any combustion
   chip for that planet.
10. IF a combustion entry's `degreeFromSun` or `threshold` is not a finite number, THEN THE
    Key_Dignities_Panel SHALL display that planet's combustion state labels without numeric values
    and SHALL display a text marker indicating that the separation from the Sun is unavailable.

### Requirement 2: Dignity Reasons

**User Story:** As a practitioner, I want to see why a planet is marked exalted, debilitated or an
enemy, so that I can verify the classification against the classical rule rather than trusting a
bare label.

#### Acceptance Criteria

1. WHEN the Key_Dignities_Panel displays a chip carrying a Dignity_Label, THE Key_Dignities_Panel
   SHALL render the Dignity_Reason for that chip as text that is reachable by moving keyboard focus
   to the chip and is exposed to assistive technology as the chip's accessible description, without
   requiring pointer hover.
2. WHERE the Dignity_Label is `exalted`, `debilitated`, `moolatrikona` or `own`, THE Dignity_Reason
   SHALL name the planet, the occupied sign, and exactly one of the matching tables
   (`EXALTATION_SIGNS`, `DEBILITATION_SIGNS`, `MOOLATRIKONA_SIGNS`, `OWN_SIGNS`), for example
   "Aries is the Sun's exaltation sign".
3. WHERE the Dignity_Label is `great_friend`, `friend`, `neutral`, `enemy` or `great_enemy` and both
   the planet's and the occupied sign lord's D1 sign numbers are present, THE Dignity_Reason SHALL
   name the lord of the occupied sign, the permanent (naisargika) relation between the planet and
   that lord as `friend`, `enemy` or `neutral`, and the temporary (tatkalika) relation as `friend` or
   `enemy` derived from the house count from the planet's D1 sign to that lord's D1 sign.
4. WHERE a planet is Vargottama in the displayed division, THE Key_Dignities_Panel SHALL render,
   under the same keyboard and assistive-technology reachability rule as criterion 1, a
   Dignity_Reason naming the displayed division, the varga sign occupied, and the D1 sign it matches.
5. THE Dignity_Reason SHALL be derived from the same tables that produced the Dignity_Label
   (`EXALTATION_SIGNS`, `DEBILITATION_SIGNS`, `MOOLATRIKONA_SIGNS`, `OWN_SIGNS`, `SIGN_LORDS`,
   `PERMANENT_FRIENDSHIP` in `engine/compute/dignity.ts`) and SHALL name exactly one rule, selected
   by the same precedence the Dignity_Label uses: exaltation, then debilitation, then moolatrikona,
   then own sign, then compound maitri.
6. FOR ALL planets in `PERMANENT_FRIENDSHIP` and all sign numbers 1 through 12, with both a complete
   map of D1 sign numbers and an empty map, THE derivation SHALL return a non-empty Dignity_Reason
   whose named rule matches the Dignity_Label returned by `getVargaDignityLabel` for the same inputs.
7. IF a planet carries no Dignity_Label because it is absent from `PERMANENT_FRIENDSHIP` (Rahu or
   Ketu), THEN THE Key_Dignities_Panel SHALL omit both the dignity chip and the Dignity_Reason for
   that planet and SHALL render the chips for the remaining planets.
8. IF the Dignity_Label is `great_friend`, `friend`, `neutral`, `enemy` or `great_enemy` and either
   the planet's or the occupied sign lord's D1 sign number is absent, THEN THE Dignity_Reason SHALL
   name the lord of the occupied sign and the permanent (naisargika) relation only, and SHALL state
   that no temporary (tatkalika) relation was available.
9. THE Dignity_Reason SHALL be a single plain-text sentence of at most 160 characters containing no
   markup.
10. IF the occupied sign number is absent or is not an integer from 1 through 12, THEN THE derivation
    SHALL return no Dignity_Reason, and THE Key_Dignities_Panel SHALL omit that chip's Dignity_Reason
    and SHALL render the remaining chips.
11. WHERE the Dignity_Reason asserts the Dignity_Label `moolatrikona`, THE Dignity_Reason SHALL name
    the Moolatrikona_Range that qualifies the placement as well as the sign, so that the statement
    identifies the degree span and not the whole sign.
12. WHERE a planet occupies its moolatrikona sign and the placement carries a degree within that
    sign, THE Compute_Engine SHALL report the Dignity_Label `moolatrikona` only where that degree
    falls inside the planet's Moolatrikona_Range, and SHALL report the Dignity_Label `own` where that
    degree falls outside the Moolatrikona_Range and the sign is one of the planet's own signs.
13. WHERE a placement carries a sign but no degree within that sign, THE Compute_Engine SHALL
    classify moolatrikona from the sign alone as `MOOLATRIKONA_SIGNS` does today, and THE
    Dignity_Reason SHALL state that the classification used the sign alone because no degree was
    available.
14. IF a planet's moolatrikona sign coincides with that planet's exaltation sign, THEN THE
    Compute_Engine SHALL report the Dignity_Label `exalted` for every placement in that sign, so
    that under the criterion 5 precedence the Moolatrikona_Range test is not reached for the Moon in
    Taurus or for Mercury in Virgo.
15. WHERE a placement occupies a planet's moolatrikona sign, that sign differs from the planet's
    exaltation sign, and the placement carries a degree outside the Moolatrikona_Range, THE
    Compute_Engine SHALL report the Dignity_Label `own`, because for each of the five planets whose
    Moolatrikona_Range is reachable — the Sun in Leo, Mars in Aries, Jupiter in Sagittarius, Venus
    in Libra and Saturn in Aquarius — the moolatrikona sign is also one of that planet's own signs,
    so that a degree outside a Moolatrikona_Range never reaches the compound maitri rule.

### Requirement 3: Merged Grahas Tab

**User Story:** As a practitioner, I want planetary positions, nakshatras and chara karakas on one
screen, so that I can read a graha's full signature without switching tabs.

#### Acceptance Criteria

1. THE Generate_Chart_Page SHALL present a single Grahas_Tab in its tab strip and SHALL not present
   the Planets, Nakshatras or Karakas tabs.
2. THE Grahas_Tab SHALL render exactly one row per entry of `chart.planets`, in the order those
   entries appear in `chart.planets` (Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Rahu, Ketu),
   and SHALL render no row for the Lagna, `chart.upagrahas`, `chart.specialLagnas` or
   `chart.arudhaPadas`.
3. THE Grahas_Tab SHALL render, for each graha row, one cell for each of: the sign name, the degree
   within the sign as whole degrees, whole minutes and whole seconds of arc, the house as an integer
   from 1 to 12, the retrograde state, the Dignity_Label in D1, the nakshatra name, the pada as an
   integer from 1 to 4, the nakshatra lord, the sub lord, and the chara karaka abbreviation.
4. WHERE a graha holds no chara karaka assignment or carries no Dignity_Label in D1, THE Grahas_Tab
   SHALL render an empty cell in the corresponding column of that graha's row.
5. WHEN the practitioner hovers the pointer over or moves keyboard focus to a graha row's chara
   karaka cell, THE Grahas_Tab SHALL present that karaka's full name and its signification text
   without adding a signification column to the table.
6. THE Grahas_Tab SHALL render a text marker identifying retrograde motion in the retrograde cell of
   every graha row whose retrograde state is true and of no other row, in addition to any colour,
   satisfying the Non_Colour_Signal rule.
7. THE Generate_Chart_Page SHALL preserve the Summary, Divisional Charts, Ashtakavarga, Dasha
   (Vimshottari), Chara Dasha, Transits, Pinda Strength and Varshaphal tabs.
8. IF `chart.nakshatras` or `chart.charaKarakas` is absent, or contains no entry matching a graha in
   `chart.planets`, THEN THE Grahas_Tab SHALL still render that graha's row with the cells sourced
   from `chart.planets` and the D1 divisional chart populated, SHALL render an empty cell in every
   column sourced from the absent data, and SHALL display a message naming the unavailable data.
9. THE Grahas_Tab SHALL render the graha rows as a single table in which every column named in
   criterion 3 carries a header cell associated with that column and every row carries the graha
   name as its row header, so that assistive technology announces both the column and the graha for
   each cell.
10. WHILE the rendered graha table is wider than the available viewport width, THE Grahas_Tab SHALL
    confine the horizontal overflow to a scrollable region inside the pane, so that every column
    named in criterion 3 is reachable and no column is clipped without the Generate_Chart_Page
    itself scrolling horizontally.

### Requirement 4: Colour Legends and Token Migration

**User Story:** As a practitioner, I want the colour coding explained inside the interface, so that
I can read a pane correctly without inspecting the source.

#### Acceptance Criteria

1. WHEN the Grahas_Tab renders, THE Grahas_Tab SHALL display a Legend, visible without hover, click
   or expansion, stating that graha text colour identifies the graha and carries no strength or
   dignity meaning.
2. WHEN the Ashtakavarga_View renders, THE Ashtakavarga_View SHALL display a Legend, visible without
   hover, click or expansion, stating the three SAV bands as inclusive integer Bindu ranges that
   cover 0 through 56 with no overlap and no gap: 30 through 56, 25 through 29, and 0 through 24.
3. WHEN the Ashtakavarga_View renders, THE Ashtakavarga_View SHALL display a Legend, visible without
   hover, click or expansion, stating the four BAV bands as inclusive integer Bindu ranges that cover
   0 through 8 with no overlap and no gap: 5 through 8, 4, 3, and 0 through 2.
4. FOR ALL integer SAV Bindu counts 0 through 56 and all integer BAV Bindu counts 0 through 8, THE
   Ashtakavarga_View SHALL assign, after the Brand_Token migration, the same band that the count was
   assigned before the migration, so that no count changes band.
5. THE Ashtakavarga_View SHALL express every SAV band colour and every BAV band colour through a
   Brand_Token from `lib/brandColors.ts`, retaining no literal Tailwind palette class for band
   colouring.
6. THE Ashtakavarga_View SHALL pair each band with a Non_Colour_Signal that is distinct from the
   Non_Colour_Signal of every other band of the same reckoning, and SHALL render each cell's Bindu
   count as text, so that a count's band is determinable without perceiving hue.
7. WHERE a Legend is displayed, THE Legend SHALL carry exactly one entry for each band rendered in
   the pane that contains it, and no entry for a band that pane does not render.
8. WHEN `DurationComputationResults` embeds the Ashtakavarga_View, THE Ashtakavarga_View SHALL
   display the same Legend entries, band ranges and Non_Colour_Signals that it displays on the
   Generate_Chart_Page.
9. IF a Bindu count is absent, non-integer, or outside 0 through 56 for SAV or 0 through 8 for BAV,
   THEN THE Ashtakavarga_View SHALL render that cell without band colouring, SHALL render a text
   marker indicating the count is unavailable, and SHALL continue rendering the remaining cells and
   the Legend.

### Requirement 5: Bhinnashtakavarga Chart Diagrams

**User Story:** As a practitioner, I want each planet's Bhinnashtakavarga drawn as a chart diagram,
so that I can read bindu distribution in the same visual layout I use for the rasi chart.

#### Acceptance Criteria

1. THE Ashtakavarga_View SHALL render seven BAV chart diagrams simultaneously, one for each graha in
   `chart.ashtakavarga.bav` in the order Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, each
   diagram containing exactly 12 cells, each cell holding one integer Bindu count in the range 0
   through 8 inclusive, and SHALL require no selector interaction to reveal any of the seven.
2. THE Ashtakavarga_View SHALL render one SAV chart diagram containing exactly 12 cells, each cell
   holding one integer Bindu count in the range 0 through 56 inclusive, where FOR ALL 12 cell
   indices the SAV cell value equals the sum of the seven BAV cell values at the same index, and the
   sum of the 12 SAV cell values equals `chart.ashtakavarga.savTotal`.
3. THE Ashtakavarga_View SHALL offer a diagram style control with exactly the two options North
   Indian and South Indian, SHALL default to North Indian to match the style control already present
   on the Summary tab, and SHALL render all eight diagrams in the single selected style.
4. WHEN the practitioner activates the Index_Mode control to switch between sign and house, THE
   Ashtakavarga_View SHALL redraw all eight diagrams and the numeric BAV and SAV tables in the
   selected index mode within 500 milliseconds of the activation, leaving no diagram cell, table cell
   or cell label displaying a value from the previously selected index mode.
5. WHILE the Index_Mode is house, THE Ashtakavarga_View SHALL read every diagram Bindu count from
   `chart.ashtakavarga.byHouse` as supplied, SHALL label the 12 cells H1 through H12 where H1 is the
   lagna sign, and SHALL perform no house-to-sign arithmetic of its own.
6. IF `chart.ashtakavarga.byHouse` is absent or does not contain exactly 12 entries, THEN THE
   Ashtakavarga_View SHALL omit the Index_Mode control, SHALL render all eight diagrams from the
   sign-indexed `bav` and `sav` arrays, SHALL label the 12 cells with the sign names in zodiacal
   order starting from Aries, and SHALL display a message stating that the house-indexed view is
   unavailable for the chart.
7. THE Ashtakavarga_View SHALL retain the existing numeric BAV and SAV tables alongside the
   diagrams, where FOR ALL seven grahas, both index modes and all 12 cell indices, the Bindu count
   shown in a diagram cell equals the Bindu count shown in the corresponding table cell.
8. THE Ashtakavarga_View SHALL apply the Requirement 4 BAV bands to the seven BAV diagrams, the
   Requirement 4 SAV bands to the SAV diagram, SHALL display the Legend for both band sets within
   the pane holding the diagrams, and SHALL pair each diagram cell's band with a Non_Colour_Signal.
9. IF `chart.ashtakavarga.bav` carries no entry for one of the seven grahas, or that entry carries
   fewer than 12 integer Bindu counts, THEN THE Ashtakavarga_View SHALL omit that graha's diagram,
   SHALL display a message naming that graha as unavailable, and SHALL render the remaining
   diagrams, the numeric tables and the Legend unchanged.
10. THE Ashtakavarga_View SHALL expose each diagram as data to assistive technology, providing for
    every cell an accessible text that states the series it belongs to (the graha name for a BAV
    diagram or SAV for the SAV diagram), the cell label for the active Index_Mode, and the cell's
    Bindu count.

### Requirement 6: Sign-Based and Degree-Based Sade Sati

**User Story:** As a practitioner, I want to see both the sign-based and the degree-based Sade Sati
readings with the running period highlighted, so that I can judge how close Saturn actually is to the
natal Moon rather than relying on sign boundaries alone.

#### Acceptance Criteria

1. THE Compute_Engine SHALL compute Degree_Based_Sade_Sati from the Saturn ephemeris and the natal
   Moon's sidereal longitude as contiguous dated periods, reporting exactly one period per passage of
   Saturn's sidereal longitude through the 90-degree window centred on the natal Moon's sidereal
   longitude, matching PVR Narasimha Rao's reference implementation.
2. THE Compute_Engine SHALL report each Degree_Based_Sade_Sati period with a sequence number, a start
   instant, an end instant, a duration, and a current flag stating whether the period contains the
   reference instant reported as `TransitAnalysis.asOf`.
3. THE Compute_Engine SHALL decide whether an instant lies inside the Degree_Based_Sade_Sati window
   solely from the shorter-arc angular separation between Saturn's sidereal longitude and the natal
   Moon's sidereal longitude being at most 45 degrees, and SHALL apply no sign-membership test, so
   that a window spanning parts of four signs is still reported as one period.
4. FOR ALL Degree_Based_Sade_Sati periods reported for a chart, the shorter-arc angular separation
   between Saturn's sidereal longitude and the natal Moon's sidereal longitude SHALL be at most 45
   degrees at the period start instant and at the period end instant, and each of those two instants
   SHALL be a crossing of that 45-degree separation. This criterion does NOT constrain the instants
   strictly between a period's start and its end: criterion 5 requires a period to bridge a short
   excursion back out of the window, so a reported period necessarily contains interior instants whose
   separation exceeds 45 degrees.
   *(Amended: this criterion previously required the bound to hold "at every instant from the period
   start through the period end inclusive", which contradicted criterion 5's merge rule outright — no
   implementation can satisfy both. Scoped to the endpoints, which is what criterion 3's membership
   rule actually decides.)*
5. THE Compute_Engine SHALL merge two consecutive window segments separated by a gap shorter than 138
   days, as arises when Saturn retrogrades back out of and then into the window, into one period whose
   start is the earlier segment's start and whose end is the later segment's end, and SHALL report
   segments separated by a gap of 138 days or more as separate periods. The 138-day threshold is
   specific to Degree_Based_Sade_Sati and SHALL NOT change the separate 240-day merge rule
   `computeSadeSatiPeriods` applies to Sign_Based_Sade_Sati in `engine/compute/transits.ts`: the
   angular window's edge admits materially longer genuine excursions than a sign boundary does, so
   240 days over-merges the angular scan. 138 days is calibrated against criterion 7's reference
   periods, which between them admit only thresholds in the interval (123.45 days, 152.46 days], and
   coincides with Saturn's mean retrograde span of about 138 days.
   *(Amended: the threshold was 240 days, borrowed from the sign-based scan. At 240 days the engine
   cannot satisfy criterion 7 — it reports the 1993 passage ending 2001-03-19 and the 2052 passage
   ending 2060-02-28, 263 and 255 days past the reference dates.)*
6. THE Compute_Engine SHALL number the reported Degree_Based_Sade_Sati periods sequentially from 1 in
   ascending start order across the whole scan horizon, and SHALL report that sequence number with
   each period.
7. WHEN the Compute_Engine computes Degree_Based_Sade_Sati for the Reference_Chart, whose natal Moon
   sidereal longitude is 347.76 degrees, THE Compute_Engine SHALL report one period per row of the
   following table whose start instant falls within 3 days of that row's start date, whose end instant
   falls within 3 days of that row's end date, and whose reported duration falls within 3 days of that
   row's duration:

   | Reference start | Reference end | Reference duration |
   |---|---|---|
   | 1993-03-31 | 2000-06-30 | 7y 91d (2648 days) |
   | 2023-02-10 | 2030-05-09 | 7y 88d (2645 days) |
   | 2052-03-20 | 2059-06-19 | 7y 91d (2648 days) |

   The 3-day tolerance accommodates the ayanamsa variant and date rounding of the third-party
   implementation the reference dates were taken from; at Saturn's mean motion of roughly 2 arcminutes
   per day, 3 days corresponds to about 6 arcminutes of separation. The durations are asserted as well
   as the dates because the reference's three durations cluster tightly at 7y 88–91d, which makes a
   duration a sharper guard on criterion 5's merge threshold than an end date alone. The criterion
   constrains dates and durations only, never sequence numbers: criterion 9's horizon begins 33 years
   before birth, so the engine's numbering is horizon-relative and legitimately differs from the
   reference's.
   *(Amended: the 1993-03-31 → 2000-06-30 period and the three durations were added after the
   reference implementation supplied them. A third independent passage is what pins criterion 5's
   merge threshold from below.)*
8. THE Compute_Engine SHALL refine every reported Degree_Based_Sade_Sati start and end instant to the
   same precision the existing Sign_Based_Sade_Sati sign-ingress scan in `computeSadeSatiPeriods`
   achieves, by applying that same bisection procedure to the 45-degree separation crossing in place
   of a sign boundary.
9. THE Compute_Engine SHALL scan for Degree_Based_Sade_Sati periods over the horizon
   `computeSadeSatiPeriods` already uses for Sign_Based_Sade_Sati — from 1 January of the 33rd year
   before the native's birth year through 1 January of the 35th year after the present year — so that
   both readings cover the same span and a divergence between them is attributable to the readings
   rather than to differing horizons.
10. THE Compute_Engine SHALL determine the current flag of every Sign_Based_Sade_Sati period and of
    every Degree_Based_Sade_Sati period from the single instant reported as `TransitAnalysis.asOf`,
    replacing the present use of the wall-clock instant in `computeSadeSatiPeriods`, so that the two
    readings are compared at one instant.
11. FOR ALL charts, at most one Degree_Based_Sade_Sati period SHALL carry a current flag of true, and
    a current flag SHALL be true only where the period start instant is at or before, and the period
    end instant is after, the instant reported as `TransitAnalysis.asOf`.
12. FOR ALL Degree_Based_Sade_Sati periods reported for a chart, THE Compute_Engine SHALL order them
    by ascending start instant with each period's start instant at or after the preceding period's
    end instant, so that no two reported periods overlap.
13. WHERE a Degree_Based_Sade_Sati period carries a current flag of true, THE Compute_Engine SHALL
    report a completion percentage equal to the elapsed span from that period's start to the instant
    reported as `TransitAnalysis.asOf`, divided by that period's duration, expressed as a percentage
    rounded half away from zero to the nearest integer.
14. WHERE a Degree_Based_Sade_Sati period's start instant falls after the instant reported as
    `TransitAnalysis.asOf`, THE Compute_Engine SHALL report the span from that instant to the period's
    start instant.
15. THE Compute_Engine SHALL report, for each Degree_Based_Sade_Sati period, a descriptive label
    naming the 45-degree orb, the natal Moon's sidereal longitude in degrees, and the houses the
    window spans, in the form "Saturn ±45° from natal Moon (347.76°) - 12th, 1st, 2nd houses", where
    that house text is descriptive and the membership decision remains the angular test of
    criterion 3.
16. THE Sade_Sati_Panel SHALL present the Sign_Based_Sade_Sati and Degree_Based_Sade_Sati readings as
    separately labelled groups, each label naming which of the two readings its group represents, and
    SHALL list the Sade_Sati_Period entries within each group in the order the Compute_Engine
    reported them.
17. WHERE a Sade_Sati_Period carries a current flag of true, THE Sade_Sati_Panel SHALL render that
    period with the emphasised styling and SHALL render a text marker identifying it as current.
18. WHERE a Sade_Sati_Period carries a current flag of false, THE Sade_Sati_Panel SHALL render that
    period in the de-emphasised (greyed) styling and SHALL pair that styling with a Non_Colour_Signal
    that distinguishes it from the current period without reliance on hue.
19. WHEN the Sign_Based_Sade_Sati and Degree_Based_Sade_Sati readings disagree on whether any of their
    periods contains the instant reported as `TransitAnalysis.asOf`, THE Sade_Sati_Panel SHALL display
    text naming the reading that reports Sade Sati as running and, for the sign-based reading, the
    phase name it reports.
20. IF the computed chart carries no Degree_Based_Sade_Sati data, THEN THE Sade_Sati_Panel SHALL
    render the Sign_Based_Sade_Sati group unchanged and SHALL display a message stating that the
    degree-based reading is unavailable for that chart.
21. THE Sade_Sati_Panel SHALL omit, from both the Sign_Based_Sade_Sati and the Degree_Based_Sade_Sati
    group, every Sade_Sati_Period whose end instant falls before the start of the native's birth year,
    retaining the existing exclusion behaviour.

### Requirement 7: Yogas Tab

**User Story:** As a practitioner, I want the named yogas the engine already detects shown in the
interface, so that I can review the catalogue and its evidence without running an AI analysis.

#### Acceptance Criteria

1. THE Generate_Chart_Page SHALL present a Yogas_Tab labelled "Yogas" in its tab strip.
2. THE Yogas_Tab SHALL render exactly one entry per element of `chart.yogas`, such that the number
   of rendered entries equals `chart.yogas.length`, and SHALL NOT truncate, paginate or otherwise
   withhold any element.
3. THE Yogas_Tab SHALL render, for each entry, the yoga `name`, its `category`, every graha listed
   in `planets`, every house number listed in `houses`, its benefic disposition, and its strength
   grade, with no one of those six fields omitted for any entry.
4. THE Yogas_Tab SHALL group entries by `category` and SHALL present the groups in the fixed order
   mahapurusha, raja, dhana, viparita, lunar, neechabhanga, parivartana, kartari, combination,
   omitting any of those groups that contains zero entries, placing every entry whose `category` is
   none of those nine values in a single trailing group labelled with that entry's `category` value
   so that no entry is dropped, and labelling each rendered group with its category name and the
   number of entries in that group.
5. WHERE an entry carries `evidence.afflictions` with one or more elements, THE Yogas_Tab SHALL
   display, for each affliction, the affliction's `planet`, its `kind` rendered as the text
   "Combust" for `combust`, "Debilitated" for `debilitated` or "Nodal" for `nodal`, and its `detail`
   where present, and SHALL mark the entry itself with the Non_Colour_Signal text "Afflicted"
   followed by the number of afflictions, so that a combust or cancelled yoga is not presented as
   unqualified.
6. WHERE an entry carries `evidence.rule`, `evidence.notes`, `evidence.ownedHouses`,
   `evidence.dignity` or `evidence.linkage`, THE Yogas_Tab SHALL make that evidence available
   through a control that is reachable by keyboard focus and toggled by the Enter key or the Space
   key, and SHALL expose that control's collapsed or expanded state as a Non_Colour_Signal.
7. THE Yogas_Tab SHALL render every graha listed in an entry's `activatingPlanets` under a visible
   label identifying them as the dashas that classically fire the yoga.
8. THE Yogas_Tab SHALL render an entry's benefic disposition as the text "Benefic" when `benefic` is
   true and the text "Malefic" when `benefic` is false, and its strength grade as the text "Strong"
   for `strong`, "Moderate" for `moderate` or "Weak" for `weak`, in addition to any colour, so that
   both values are determinable without perceiving hue and the Non_Colour_Signal rule is satisfied.
9. IF `chart.yogas` is present and contains zero elements, THEN THE Yogas_Tab SHALL render no
   category groups and SHALL display a message stating that no named yogas were detected for the
   chart.
10. THE Yogas_Tab SHALL order the entries within each category group by strength grade descending,
    that is `strong` before `moderate` before `weak`, and SHALL order entries of equal strength by
    `name` in ascending lexicographic order, so that repeated renders of the same chart produce an
    identical entry order.
11. IF an entry's `activatingPlanets` is absent or contains zero elements, THEN THE Yogas_Tab SHALL
    render, in place of the graha list for that entry, the text "None recorded".
12. IF `chart.yogas` is absent from the computed chart, THEN THE Yogas_Tab SHALL render its remaining
    content and SHALL display a message stating that the named-yoga catalogue is unavailable for that
    chart, distinct from the message required when the catalogue is present and empty.

### Requirement 8: Backward Compatibility and Shared Consumers

**User Story:** As a practitioner with charts saved before these fields existed, I want the enhanced
panes to render whatever data is present, so that an older chart still opens.

#### Acceptance Criteria

1. IF a field required by a pane is absent from the computed chart, is null, or holds a value whose
   type or entry count differs from the shape the pane expects (for example an array where an object
   is expected, a sign-indexed collection with an entry count other than 12, or a BAV collection
   with an entry count other than 7), THEN THE Generate_Chart_Page SHALL render every other section
   of that pane and SHALL display, in place of the affected section only, a message naming that
   section and stating that its data is unavailable.
2. WHEN `DurationComputationResults` embeds the Ashtakavarga_View, THE Ashtakavarga_View SHALL
   render the diagrams, tables and Legend from the props the embedding component already passes,
   requiring no added, renamed or newly required prop on that component.
3. THE Compute_Engine SHALL keep the field name, the nesting position and the complete six-member set
   of `chart.transits.sadeSati` — `active`, `phase`, `saturnSignNumber`, `natalMoonSignNumber`,
   `description` and `allPeriods[]` — unchanged, and SHALL report the Degree_Based_Sade_Sati data
   under a separate sibling field, so that the existing read-only MCP tools and the stored
   UnifiedChart columns continue to validate against the transits shape after the addition.
4. THE Generate_Chart_Page SHALL restrict every unavailable-section message to the section name and
   the statement of unavailability, excluding exception type, call stack and field-path text.
5. WHEN the Generate_Chart_Page renders a computed chart in which one or more panes have absent or
   malformed data, THE Generate_Chart_Page SHALL render the tab strip and all remaining panes and
   SHALL keep every tab selectable.
6. WHEN a chart computed before the Degree_Based_Sade_Sati addition is opened, THE
   Generate_Chart_Page SHALL render the Summary, Grahas_Tab, Divisional Charts, Ashtakavarga_View,
   Dasha (Vimshottari), Chara Dasha, Transits_View, Pinda Strength, Varshaphal and Yogas_Tab panes
   with the same content those panes render for a newly computed chart carrying identical values in
   the fields that both charts contain.
