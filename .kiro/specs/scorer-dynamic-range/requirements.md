# Requirements Document: Scorer Dynamic Range

## Introduction

The Duration Analysis deterministic period scorer (`engine/durationAnalysis/scoring.ts`,
weight table `engine/durationAnalysis/scoringWeights.ts`, current `WEIGHTS_VERSION =
'0.6.0-provisional'`) computes a 0–100 favorability score for every MD/AD/PD dasha period,
per life domain, from roughly 21 weighted, independently-normalized Scoring_Factors.

A validation pass against one real chart (chartId `3c1ee085-8845-4440-8983-e3a7c41773cc`,
"Mojo", Taurus lagna, Venus Mahadasha 2007–2027) compared the engine's `wealth`-category
scores for 2022-01-01 through 2026-07-31 (19 periods, via `get_timeline_periods`, all stamped
`weightsVersion: "0.6.0-provisional"`, `confidence: 1`) against the practitioner's
self-reported lived wealth/salary experience for the same span. Two problems were found:

1. **Compressed range.** The engine's wealth scores across the whole 4.5-year span never
   left the 58–71 band, while the lived experience spanned roughly 0–95. Factor-by-factor
   decomposition traced this to several Scoring_Factors — `naturalKaraka`, `mdLordDignity`,
   `natalHouseStrength`, `argalaOnDomainHouse`, and (mostly) `divisionalChartStrength` — that
   are pinned at or near a fixed value for the **entire 20-year Venus Mahadasha**, because
   their inputs derive only from the natal chart and/or the Mahadasha (MD) lord. With this
   much weight anchored to values that cannot move within the Mahadasha, the AD/PD-level and
   transit-level factors that DO change every few months or years cannot swing the score far
   from that anchor.
2. **A local inversion, not just compression.** The single highest score in the entire
   19-period window (70–71, Venus MD / Mercury AD / Saturn PD, May–Nov 2025) lands exactly
   inside the practitioner's self-reported WORST stretch (10–15/100). This happens because
   Saturn is exalted as PD lord in that period, and the scorer rewards a dignified sub-lord
   with no countervailing signal. Critically, Venus — the MD lord for the whole 20-year span
   and a natural wealth karaka — is natally combust in this chart (`degreeFromSun: 5.66`,
   `threshold: 10`, i.e. `combust: true`), and no Scoring_Factor currently reads combustion at
   all. The single most financially-relevant affliction in the chart is invisible to the score.

This feature fixes both problems in the existing deterministic scorer: it reduces the
dominance of natal/MD-constant factors so AD/PD/transit signals can move the score across a
wider range within one Mahadasha, and it adds a combustion-aware affliction signal so a
combust MD/AD/PD lord dampens the periods it governs. It also investigates the
`domainHouseActivation` transit aspect net, which was observed to normalize to its ceiling
("double transit") in effectively all 19 periods of the validation window.

**Guiding principle — classical Parashari (PVR Narasimha Rao) grounding.** Where a
classical-versus-Western astrological modeling choice arises, this feature's scoring
methodology follows the classical Parashari treatment as taught by P.V.R. Narasimha Rao (author
of *Vedic Astrology: An Integrated Approach* and creator of Jagannatha Hora / JHora), not
Hellenistic/Western concepts (see the **PVR_Treatment** Glossary entry). The concrete
consequence codified by this spec is the combustion (astangata) treatment (Requirement 3 and
Requirement 9): combustion is a graded affliction that is deepest at closest approach to the
Sun, with NO cazimi ("heart of the Sun") strengthening exception, because cazimi is a Western
concept absent from Parashari. The engine's existing combustion thresholds (Mars 17°, Saturn
15°, Mercury 14°, Moon 12°, Jupiter 11°, Venus 10°, with retrograde variants) already match the
classical/JHora set and are NOT changed by this feature — only the cazimi cancellation is
foreign and is being removed. This principle frames the spec; it is not itself a testable
requirement beyond what the requirements below encode.

## Non-Goals

The following are explicitly **out of scope** for this feature:

- **Direction-aware house ownership.** `factorHouseOwnership` in `scoring.ts` already computes
  a signed value — positive for benefic/primary house links, negative for dusthana/malefic
  house links via both occupancy and ownership — and this was confirmed working correctly
  during investigation (e.g. Mars PD → house-ownership value −1.33, normalized 0.30; Jupiter
  PD → −1.0, normalized 0.35) in the Mojo chart's own period set. This feature MUST NOT modify
  `factorHouseOwnership`'s existing direction-aware logic.
- **A Named-Yoga Detection Engine or varga-internal aspect resolver.** This is tracked as a
  separate, not-yet-started follow-up spec. This feature MUST NOT take a build dependency on
  it and MUST only consume the `activatedYogas` signal the scorer already reads today, as-is.
  This feature MAY note where a future graded/signed yoga engine could plug in later, but MUST
  NOT implement one.
- **Replacing the deterministic scorer with a statistical/ML model.** The scorer remains the
  authoritative, auditable, feature-producing layer. Any statistical/ML calibration is deferred
  to a future phase gated on collecting labeled outcome data across many charts.
- **Exact numeric reproduction of one client's self-reported experience.** The Mojo-chart
  backtest (Requirement 4) is a single-chart (N=1), single-domain (wealth) validation signal —
  the best evidence available today, but not proof of general correctness across charts.
  Matching the direction of the lived-experience bands, and moving at least one end of the
  score distribution meaningfully closer to them, is sufficient; exact numeric matching is not
  required and not the bar for this feature.
- **Removing cazimi handling from the scorer.** The Scoring_Engine (`scoring.ts`) already does
  NOT reference the `cazimi` field (confirmed by audit); no scorer change is needed to stop
  consulting cazimi. The Vedically-correct combustion fix in Requirement 9 is made at the
  compute source (`engine/compute/relationships.ts`), not in `scoring.ts`. Fully deleting the
  `cazimi` field from types, the slicer, `periodInsights.ts`, and fixtures is a larger cleanup
  that MAY be deferred beyond this feature (see Requirement 9, Acceptance Criterion 3).

## Glossary

- **PVR_Treatment**: The classical Parashari astrological treatment as taught by P.V.R.
  Narasimha Rao (author of *Vedic Astrology: An Integrated Approach*, creator of Jagannatha
  Hora / JHora). This spec's governing principle: where a classical-versus-Western modeling
  choice arises, the Scoring_Engine SHALL follow the classical Parashari / PVR treatment and
  SHALL NOT adopt Hellenistic/Western concepts. The concrete consequence codified here is the
  combustion (astangata) treatment — combustion is a graded affliction, deepest at closest
  approach to the Sun, with no cazimi ("heart of the Sun") strengthening exception, because
  cazimi is a Western concept absent from Parashari (see Requirement 3 and Requirement 9). The
  engine's existing combustion thresholds are already classical/JHora-aligned and are not
  changed by this feature.
- **Scoring_Engine**: The deterministic, pure-TypeScript module `engine/durationAnalysis/scoring.ts`.
  Exposes `scorePeriod()`. No LLM calls, no I/O.
- **Mahadasha (MD) / Antardasha (AD) / Pratyantardasha (PD)**: The three nested levels of the
  Vimshottari dasha period hierarchy scored by the engine (major period / sub-period /
  sub-sub-period).
- **Period_Score**: The deterministic integer favorability value (0–100) the Scoring_Engine
  produces for one MD/AD/PD period within one life domain.
- **Score_Breakdown**: The itemized `ScoreBreakdown` record (factors, omissions, confidence,
  `weightsVersion`, etc.) produced alongside every Period_Score.
- **Scoring_Factor**: One deterministic, independently-normalized input to the Period_Score,
  identified by a `ScoringFactorKey` (e.g. `mdLordDignity`, `naturalKaraka`, `transitBav`).
- **Domain_Weights**: The per-category `DomainScoringWeights` entry in
  `DOMAIN_SCORING_WEIGHTS` (`scoringWeights.ts`) supplying benefic/malefic/primary houses,
  relevant karakas, the primary divisional chart, and the per-factor weight table.
- **Natal_Constant_Factor**: A Scoring_Factor whose normalized value is determined wholly or
  predominantly by the natal chart and/or by the identity of the Mahadasha lord alone, and
  therefore does not vary (or varies only marginally) across the AD/PD sub-periods of a single
  Mahadasha. This feature identifies `naturalKaraka`, `mdLordDignity`, `natalHouseStrength`,
  `argalaOnDomainHouse`, and `divisionalChartStrength` as Natal_Constant_Factors, and
  `karakaRole` as exhibiting the same MD-lord-priority-lock behavior when the MD lord is the
  domain's relevant karaka.
- **Period_Varying_Factor**: A Scoring_Factor whose inputs depend on the specific AD and/or PD
  lord and therefore can change from one sub-period to the next within the same Mahadasha
  (e.g. `adLordDignity`, `pdLordDignity`, `shadbala`, `houseOwnership`, `bhavaBala`).
  `mdAdRelationship` and `activatedYogas` vary at AD granularity (not PD).
- **Transit_Level_Factor**: A Scoring_Factor whose inputs depend on the real calendar date
  rather than the natal chart or the running dasha lords (`transitBav`, `saturnAfflictions`,
  `domainHouseActivation`).
- **Domain_House_Activation**: The Scoring_Factor crediting a period when transiting
  Saturn/Jupiter, via occupation or graha-drishti (7th for all; Saturn 3rd/10th; Jupiter
  5th/9th), reach a domain's primary house(s) or the domain-house lord's natal house — the
  "aspect net" referenced throughout this document.
- **Combustion**: The natal condition (from `relationships.combustion`, a `CombustionResult[]`)
  where a planet's angular distance from the Sun (`degreeFromSun`) is below a planet- and
  motion-specific threshold (`threshold`, yielding `combust: true`), computed once per chart
  and available on every running lord via `ScoringChartData.relationships.combustion`. Per
  PVR_Treatment (classical Parashari astangata), this feature treats combustion strictly as
  a gradable affliction signal (graded by closeness to the Sun) and does not consult, reference,
  or special-case the `cazimi` field the data structure also happens to carry — see the
  explicit exclusion in Requirement 3.
- **Lord_Affliction_Factor**: The new Scoring_Factor introduced by this feature that dampens a
  period's score when a running lord (MD, and where applicable AD/PD) is combust, graded by
  closeness to the Sun.
- **Backtest_Chart**: Chart `3c1ee085-8845-4440-8983-e3a7c41773cc` ("Mojo"), used as the
  empirical validation reference for this feature per Requirement 4.
- **Weights_Version**: The `WEIGHTS_VERSION` string stamped onto every persisted
  Score_Breakdown, versioned per the existing convention documented in the comment history at
  the top of `scoringWeights.ts`.

---

## Requirements

### Requirement 1: Reduced Dominance of Natal and MD-Lord-Constant Factors

**User Story:** As a practitioner reading a Duration Analysis, I want a period's score to be
able to move meaningfully across the sub-periods of a single Mahadasha, so that AD/PD-level
and transit-level conditions are reflected in the score rather than being swamped by factors
that never change for the whole Mahadasha.

#### Acceptance Criteria

1. THE Scoring_Engine SHALL treat `naturalKaraka`, `mdLordDignity`, `natalHouseStrength`,
   `argalaOnDomainHouse`, and `divisionalChartStrength` as Natal_Constant_Factors requiring
   the dominance reduction described in this requirement.
2. IF the MD lord alone is a domain natural karaka listed in `relevantNaturalKarakas`, THEN
   THE Scoring_Engine SHALL NOT produce the identical maximum `naturalKaraka` normalized value
   for every AD/PD combination for the full duration of that Mahadasha regardless of which
   planet is the running AD or PD lord; the `naturalKaraka` normalized value SHALL be capable
   of differing across AD/PD combinations within the same Mahadasha.
3. IF the MD lord alone matches a domain's `relevantKarakaRoles`, THEN THE Scoring_Engine
   SHALL apply the same non-MD-exclusive treatment described in Acceptance Criterion 2 to the
   `karakaRole` factor.
4. THE Scoring_Engine SHALL rebalance the weighting of the Natal_Constant_Factors relative to
   the Period_Varying_Factors and Transit_Level_Factors such that, for every category entry in
   `DOMAIN_SCORING_WEIGHTS`, the combined weight assigned to Period_Varying_Factors and
   Transit_Level_Factors, as a proportion of that category's total factor weight, is greater
   than under `WEIGHTS_VERSION` `0.6.0-provisional`.
5. WHEN the rebalancing in Acceptance Criterion 4 is applied, THE Scoring_Engine SHALL
   preserve the existing `DomainScoringWeights.weights` per-factor table structure (keyed by
   `ScoringFactorKey`) rather than introducing a different weighting mechanism.

---

### Requirement 2: Domain House Activation Aspect-Net Discrimination

**User Story:** As a developer maintaining the scorer, I want the `domainHouseActivation`
factor to actually discriminate between periods, so that a transit signal carrying significant
weight is not effectively a constant.

#### Acceptance Criteria

1. THE Scoring_Engine's `domainHouseActivation` factor SHALL be evaluated for whether its
   current aspect net (direct occupation plus graha-drishti: 7th aspect for all transiting
   planets, Saturn's 3rd/10th, Jupiter's 5th/9th, applied to both the domain's primary
   house(s) and the domain-house lord's natal house) produces materially different normalized
   values across the periods of a representative multi-year analysis window, rather than
   normalizing to its maximum ("double transit") value for a large majority of those periods.
2. IF the evaluation in Acceptance Criterion 1 confirms the aspect net does not discriminate
   meaningfully across a representative multi-year window (as observed in the 19-period
   Backtest_Chart wealth validation, where it normalized to 1.0 in effectively all periods),
   THEN THE Scoring_Engine SHALL be modified — by narrowing the aspect net, reweighting the
   factor, or another targeted change — so that `domainHouseActivation` varies across periods
   rather than remaining pinned near its ceiling for the whole analysis window.
3. IF the evaluation in Acceptance Criterion 1 does not confirm a discrimination problem for a
   given domain, THEN the non-discriminating behavior for that domain SHALL be explicitly
   documented as an accepted tradeoff rather than left unaddressed and unexplained.

---

### Requirement 3: Combustion-Aware Lord Affliction Dampening

**User Story:** As a Vedic astrologer, I want a combust dasha lord to visibly dampen the
periods it governs, so that a natally afflicted Mahadasha lord is not invisible to the score.

#### Acceptance Criteria

1. WHEN the Scoring_Engine evaluates a period whose MD lord has `combust: true` in the
   chart's combustion data, THE Scoring_Engine SHALL lower the Period_Score by emitting a
   standalone, additive Lord_Affliction_Factor — a distinct `ScoringFactorKey` itemized in the
   Score_Breakdown like any other Scoring_Factor — rather than by modifying, multiplying, or
   otherwise adjusting the dignity or shadbala contributions of the combust lord's other
   Scoring_Factors (the karaka-significator credit reduction required by Acceptance Criterion 4
   is a separate, itemized mechanism and is NOT precluded by this criterion).
2. WHERE the AD lord's or PD lord's `combust` flag is `true`, THE Scoring_Engine SHALL fold
   that lord's affliction into the same standalone Lord_Affliction_Factor described in
   Acceptance Criterion 1.
3. WHEN grading the Lord_Affliction_Factor described in Acceptance Criteria 1 and 2, THE
   Scoring_Engine SHALL scale the affliction by the combust lord's closeness to the Sun, using
   `degreeFromSun` relative to `threshold` from the chart's combustion data (a lord nearer to
   the Sun relative to its threshold SHALL receive an affliction at least as large as a lord
   farther from the Sun relative to its threshold), rather than applying a single fixed
   penalty whenever `combust` is `true`.
4. WHEN a running MD, AD, or PD lord that is a domain natural karaka listed in
   `relevantNaturalKarakas` — or that matches the domain's `relevantKarakaRoles` — has
   `combust: true`, THE Scoring_Engine SHALL reduce that lord's `naturalKaraka` and/or
   `karakaRole` credit, scaled by the lord's closeness to the Sun (`degreeFromSun` relative to
   `threshold`, as in Acceptance Criterion 3), rather than expressing the combustion affliction
   solely as the flat, whole-score Lord_Affliction_Factor of Acceptance Criteria 1–3, because
   per PVR_Treatment combustion (astangata) primarily damages a planet's ability to deliver its
   karaka / natural-significator results. This reduction SHALL operate within the existing value
   range of the `naturalKaraka` and `karakaRole` factors — treating a combust karaka as a weaker
   karaka — without introducing a new `ScoringFactorKey` for it or changing those factors'
   value shape or meaning, and SHALL also serve as a de-pinning driver for `naturalKaraka` and
   `karakaRole` consistent with Requirement 1, Acceptance Criteria 2 and 3. This directly
   addresses the Backtest_Chart case in which the combust natural wealth karaka (Venus) running
   the Mahadasha otherwise holds `naturalKaraka` pinned at its maximum value.
5. THE Scoring_Engine SHALL NOT reference, read, or special-case the `cazimi` field of the
   chart's combustion data anywhere in the Lord_Affliction_Factor, the karaka-credit reduction
   of Acceptance Criterion 4, or elsewhere in the Scoring_Engine; combustion SHALL be treated
   strictly as a gradable affliction per PVR_Treatment (classical Parashari astangata), with no
   strengthening exception of any kind, because cazimi is a Western concept absent from
   Parashari.
6. IF combustion data is unavailable for the chart, THEN THE Scoring_Engine SHALL omit the
   Lord_Affliction_Factor for the affected period and record the omission in the
   Score_Breakdown, consistent with the engine's existing graceful-degradation behavior for
   other Scoring_Factors, rather than assuming a non-combust default.
7. WHEN combustion data is present for the chart but none of the running MD/AD/PD lords is
   combust, THE Scoring_Engine SHALL omit the Lord_Affliction_Factor as a no-signal omission
   (`noSignal: true`, matching the engine's existing no-signal convention used by
   `karakaRole`, `naturalKaraka`, `activatedYogas`, and similar factors), so that the absence
   of combustion does not dilute the Period_Score toward neutral.
8. THE Scoring_Engine SHALL classify the Lord_Affliction_Factor as a SECONDARY factor for the
   purpose of the Score_Breakdown confidence calculation, so that its legitimate no-signal
   omission on the common non-combustion case (Acceptance Criterion 7) does not reduce
   `confidence`, consistent with its `noSignal` treatment.
9. WHEN the Lord_Affliction_Factor is applied, THE Scoring_Engine SHALL itemize it in the
   Score_Breakdown with the same shape as other Scoring_Factors (factor key, raw value,
   weight, contribution).
10. THE Scoring_Engine SHALL NOT change the `value` shape of the existing `mdLordDignity`,
    `adLordDignity`, or `pdLordDignity` factors (each a dignity-label string) in order to
    incorporate combustion awareness, because `engine/durationAnalysis/periodInsights.ts`
    parses that string shape directly (`dignityOf()`) to build the practitioner-facing Drivers
    panel.
11. THE Lord_Affliction_Factor and the karaka-credit reduction of Acceptance Criterion 4 SHALL
    preserve the Scoring_Engine's existing purity and never-throws guarantees: they SHALL remain
    pure with no LLM calls, no network, no database access, and no file I/O, and SHALL degrade
    to omission (per Acceptance Criteria 6 and 7) on missing or malformed combustion data rather
    than throwing.

---

### Requirement 4: Backtest Validation Against the Mojo Chart's Lived Wealth Experience

**User Story:** As the product owner validating this fix, I want the rebalanced engine to
remove the specific top-of-range inversion found in the Mojo chart's wealth timeline and to move
at least one end of its score distribution toward the practitioner's lived experience, with the
achieved score range computed and reported as a directional indicator, so the fix is validated
against the concrete case that revealed the problem, not only against synthetic fixtures.

#### Acceptance Criteria

1. WHEN the post-fix Scoring_Engine scores the `wealth`-category periods for the
   Backtest_Chart over 2022-01-01 to 2026-07-31, THE highest-scoring period in that window
   SHALL NOT be one of the periods overlapping the practitioner-reported worst lived-experience
   window (June/July 2025 through July 2026, reported at 10–15/100). This is a PRIMARY,
   required range objective.
2. WHEN the post-fix Scoring_Engine scores the same `wealth`-category periods, THE backtest
   SHALL compute and report the resulting score range (maximum minus minimum) across the 19
   periods as a directional indicator, and that range SHOULD trend wider than the pre-fix
   spread; however, a strict numeric increase over the pre-fix spread SHALL NOT itself be a
   required pass/fail condition. The range objective SHALL be considered satisfied when
   Acceptance Criteria 1 and 3 both hold — that is, range-widening is a REPORTED, DIRECTIONAL
   indicator SUBORDINATE to the top-of-range inversion removal (Acceptance Criterion 1) and to
   at least one end of the distribution moving materially toward lived experience (Acceptance
   Criterion 3), not a hard numeric gate. The reference pre-fix spread is the freshly measured
   `WEIGHTS_VERSION` `0.6.0-provisional` baseline of 58–70 (spread 12); the earlier "58–71,
   spread 13" figure was an approximate bound, and because range is no longer a hard gate the
   1-point discrepancy is immaterial.
3. WHEN the post-fix Scoring_Engine scores the same `wealth`-category periods, AT LEAST ONE of
   the following SHALL hold (this is a PRIMARY, required range objective): (a) the minimum score
   among periods overlapping the August 2024–January 2025 collapse window is lower than the
   pre-fix minimum score for that window, OR (b) the maximum score among periods overlapping the
   January 2022–June 2023 high-experience window is higher than the pre-fix maximum score for
   that window.
4. THE Scoring_Engine SHALL NOT be required to reproduce the practitioner's exact reported
   lived-experience values (e.g. 90–95, 0, 10–15) for the Backtest_Chart; only the directional
   improvements in Acceptance Criteria 1–3 are required.
5. THE feature SHALL record the Backtest_Chart validation as a fixture following the existing
   fixture convention in `engine/durationAnalysis/__fixtures__/` (see
   `scoring.backtest.test.ts` and its `README.md`), so the check can be re-run automatically
   on future weight changes rather than performed as a one-off manual comparison.
6. WHEN validating the Backtest_Chart, THE feature SHALL score the Backtest_Chart periods by
   executing the post-fix Scoring_Engine directly (fresh computation under the new
   `WEIGHTS_VERSION`), and SHALL NOT read any persisted or cached `ScoreBreakdown` for the
   Backtest_Chart (which is `source="compute"` and whose breakdowns may be cached under the
   prior `0.6.0-provisional` version), so that the fixture asserts against genuinely
   new-version output rather than stale `0.6.0-provisional` numbers.

---

### Requirement 5: Non-Regression on Currently-Tracking Periods

**User Story:** As a product owner, I want periods where the scorer already tracks lived
experience reasonably well to keep doing so after the fix, so the fix does not trade one
failure for another.

#### Acceptance Criteria

1. WHEN the post-fix Scoring_Engine scores the `wealth`-category periods for the
   Backtest_Chart overlapping July 2023–August 2024 (practitioner-reported lived experience
   ~70/100; pre-fix engine range ~65–69), THE resulting scores for that window SHALL remain
   clearly above the collapse/low-experience floor and within a small tolerance of the post-fix
   19-period median — they SHALL NOT fall more than a few points (a tolerance of ~3) below that
   median — rather than being required to sit strictly at or above the exact median. This is a
   directional non-regression indicator, not a strict numeric gate: as the score distribution
   widens under the post-fix `WEIGHTS_VERSION`, a tracking period landing a point or two below
   the freshly-computed median (for example 57 against a median of 58) SHALL NOT itself
   constitute a regression, provided the window as a whole continues to track in the upper
   portion of the distribution and stays well above the collapse and low-experience windows.
   Consistent with the range treatment in Requirement 4, Acceptance Criterion 2, the exact
   median comparison is REPORTED as a directional indicator rather than enforced as a hard
   pass/fail threshold; the binding non-regression gate is Acceptance Criterion 2 (no
   out-of-window period becomes the single lowest) together with the tracking window staying
   above the collapse/low-experience floor.
2. THE post-fix Scoring_Engine SHALL NOT cause any period outside the August 2024–January
   2025 collapse window and outside the February 2025–July 2026 low-experience window to
   become the single lowest-scoring period in the 2022–2026 `wealth` analysis window for the
   Backtest_Chart.

---

### Requirement 6: Weights Versioning and Backward-Compatible Persistence

**User Story:** As a developer shipping this change, I want it version-stamped and structurally
backward compatible, so existing consumers of scored periods keep working without modification.

#### Acceptance Criteria

1. WHEN this feature's changes to `DOMAIN_SCORING_WEIGHTS` and/or the Scoring_Engine are
   shipped, THE Scoring_Engine SHALL bump `WEIGHTS_VERSION` to a new value distinct from
   `'0.6.0-provisional'`, following the existing version-history comment convention in
   `scoringWeights.ts`.
2. WHEN the Scoring_Engine persists a Score_Breakdown produced under the new weights, THE
   Score_Breakdown SHALL stamp the new `WEIGHTS_VERSION` onto that breakdown.
3. THE `ScoreBreakdown` TypeScript interface (`score`, `intensity`, `favorable`, `factors[]`,
   `omissions[]`, `weightSumApplied`, `reducedConfidence`, `confidence`, `weightsVersion`)
   SHALL remain structurally unchanged by this feature, so that existing consumers — DA-1
   prompt construction, `app/components/DurationComputationResults.tsx`, and
   `engine/durationAnalysis/periodInsights.ts` — continue to compile and render without
   modification.
4. IF this feature introduces a new Scoring_Factor (for example the Lord_Affliction_Factor),
   THEN THE new factor SHALL be added as an additional `ScoringFactorKey` value and an
   additional entry in each domain's `weights` table, rather than changing the shape or
   meaning of any existing `ScoringFactorKey`.
5. THE Scoring_Engine SHALL preserve the existing `value` shape of the `rashiDrishti` factor
   (an array of `{ lord, toHouses }` entries), because `periodInsights.ts`
   (`rashiDrishtiHousesFor()`) parses that specific shape to build the practitioner-facing
   Drivers panel.

---

### Requirement 7: Genuine Downside Range

**User Story:** As the product owner validating this fix, I want the engine to be mechanically
capable of producing genuinely low scores for genuinely weak periods, so that the
range-widening outcome required by Requirement 4 is actually reachable rather than aspirational.

*Rationale: de-pinning the Natal_Constant_Factors (Requirement 1, Acceptance Criteria 1–3) and
reweighting toward Period_Varying_Factors and Transit_Level_Factors (Requirement 1, Acceptance
Criterion 4) cannot, by themselves, drive a Period_Score materially below the pre-fix floor of
~58 if most Scoring_Factors remain centered near 0.5. Reaching a genuinely low score requires a
real penalty channel — enough Scoring_Factors able to reach low normalized values.*

#### Acceptance Criteria

1. THE Scoring_Engine SHALL be able to produce genuinely low Period_Scores — materially below
   the pre-fix achieved floor of ~58 — for periods whose evidence is genuinely weak, such that
   the range-widening outcome required by Requirement 4 (Acceptance Criteria 2 and 3) is
   mechanically reachable and not merely aspirational.
2. THE combination of de-pinning the Natal_Constant_Factors (Requirement 1), reweighting
   toward Period_Varying_Factors and Transit_Level_Factors (Requirement 1, Acceptance
   Criterion 4), and the new Lord_Affliction_Factor (Requirement 3) SHALL form a real penalty
   channel — enough Scoring_Factors able to reach low normalized values — rather than leaving
   all Scoring_Factors anchored near a neutral midpoint, so that a genuinely low Period_Score is
   mechanically attainable for a genuinely weak period.
3. THE feature SHALL NOT prescribe an exact numeric floor for the Period_Score; the sufficiency
   of the downside mechanism SHALL be validated by the Backtest_Chart range-widening assertions
   in Requirement 4 rather than by a fixed numeric threshold.
4. WHERE a period's remaining Scoring_Factors supply sufficient countervailing positive signal,
   THE Scoring_Engine SHALL be permitted to produce a Period_Score that is not genuinely low
   even while the de-pinning, reweighting, and Lord_Affliction_Factor mechanisms are active,
   because Acceptance Criteria 1 and 2 require the mechanical capability to reach a low score
   for a genuinely weak period rather than a guarantee that every period these mechanisms touch
   attains a low score.

---

### Requirement 8: Cross-Domain Non-Regression

**User Story:** As a developer shipping a global weight change, I want the existing per-domain
backtest fixtures to remain meaningful, so that a rebalance justified by one wealth chart does
not silently break the health, career, marriage, or property domains.

*Rationale: the weight rebalance in Requirement 1, Acceptance Criterion 4 is global — it touches
all six category entries in `DOMAIN_SCORING_WEIGHTS` (health, career, wealth, marriage, property,
cashflow) — but the Backtest_Chart validation (Requirement 4) and the non-regression checks
(Requirement 5) cover only the wealth domain on a single chart.*

#### Acceptance Criteria

1. WHEN the global weight rebalance (Requirement 1) and the new Lord_Affliction_Factor
   (Requirement 3) are applied, THE existing per-domain backtest fixtures under
   `engine/durationAnalysis/__fixtures__/` (including `career_strong_weak.json`,
   `health_saturn_affliction.json`, `marriage_dk_vs_dusthana.json`,
   `wealth_dhana_vs_dusthana.json`, and any other fixtures present in that directory) and
   their assertions in `scoring.backtest.test.ts` SHALL either continue to pass, OR be
   consciously re-baselined with a recorded rationale in the `scoringWeights.ts` version-history
   comment, consistent with how prior versions `0.2.0`–`0.6.0` re-baselined fixtures.
2. THE feature SHALL NOT silently break or delete existing non-wealth fixture assertions; any
   change to a non-wealth fixture's expected values SHALL be accompanied by the recorded
   rationale required by Acceptance Criterion 1.

---

### Requirement 9: Vedically-Correct Combustion Determination at the Compute Source

**User Story:** As a Vedic astrologer, I want the `combust` flag the scorer consumes to reflect
classical Parashari astangata, so that a planet extremely close to the Sun is treated as the
most deeply combust rather than exempted as "cazimi."

*Rationale: a code audit found that `engine/compute/relationships.ts` currently cancels the
combust flag for planets within a cazimi orb of the Sun:*

```
const CAZIMI_ORB = 0.283 // ~0°17'
const cazimi  = degreeFromSun < CAZIMI_ORB
const combust = degreeFromSun < threshold && !cazimi   // cazimi CANCELS combust
```

*i.e. a planet within ~0°17' of the Sun is flagged `combust: false` because it is treated as a
Hellenistic/Western strengthening state. In classical Vedic (Parashari) astangata, a planet that
close to the Sun is the MOST deeply combust, not exempt. Because Requirement 3's
Lord_Affliction_Factor consumes the `combust` flag, that flag must be Vedically correct.*

#### Acceptance Criteria

1. THE combustion determination that the Scoring_Engine relies on SHALL treat a planet as
   combust based solely on its angular distance from the Sun (`degreeFromSun`) being within the
   applicable `threshold`, and SHALL NOT exempt or cancel combustion for planets extremely
   close to the Sun on the basis of the cazimi concept.
2. THE feature SHALL neutralize the cazimi cancellation of the `combust` flag by removing the
   `&& !cazimi` condition in `engine/compute/relationships.ts`, so that `combust` becomes
   threshold-only.
3. WHERE fully removing the `cazimi` field from types, the slicer, `periodInsights.ts`, and
   fixtures constitutes a larger cleanup, THAT cleanup MAY be deferred; however, the
   cancellation of the `combust` flag described in Acceptance Criterion 2 MUST be neutralized as
   part of this feature.
4. THE change in Acceptance Criteria 1 and 2 SHALL NOT alter the Backtest_Chart wealth result,
   because in the Backtest_Chart the wealth-relevant combust lord (Venus) is 5.66° from the Sun
   — far outside the ~0°17' cazimi orb — and is therefore already `combust: true`; the change
   corrects other charts and is a prerequisite for a Vedically-correct affliction signal.
