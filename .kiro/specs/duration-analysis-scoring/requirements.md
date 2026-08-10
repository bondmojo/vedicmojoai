# Requirements Document: Duration Analysis Scoring

## Introduction

This feature (Phase 1 of the approved Duration Analysis deepening roadmap) moves period
favorability in the Duration Analysis (DA) pipeline from LLM judgment to a deterministic,
auditable scoring engine, and wires already-computed astrological data (Chara karakas,
nakshatra relationships, Bhava Bala, Ishta/Kashta phala, domain special points) into the
DA context.

Today the DA pipeline slices the stored Vimshottari dasha tree over a date range and runs
three sequential LLM agents (DA-1 Domain Analyser, DA-2 Symptom Validator, DA-3 Future
Analyser). DA-1 currently decides each period's favorability and intensity by LLM judgment,
and the DA extractor (`engine/durationAnalysis/extractor.ts`) forwards only a subset of the
deterministic astrological data the compute engine (`engine/compute/`) already produces, so
most of that data never reaches the agents.

This feature establishes a **compute-first, LLM-narrates** contract: a new pure-TypeScript
Scoring Engine (`engine/durationAnalysis/scoring.ts`) decides each period's intensity,
favorable flag, and peak ranking from deterministic astrological factors, and DA-1 only
explains those decisions in narrative prose. The engine produces an itemized, persisted
Score Breakdown for every period so results are reproducible, backtestable, cheaper, and
astrologically more complete.

Scoring assumes the current computational substrate (Swiss Ephemeris + Lahiri ayanamsa +
True Node + Whole Sign houses). Changing that substrate is recorded as an out-of-scope Open
Decision (see below).

## Glossary

- **Scoring_Engine**: The new pure-TypeScript module `engine/durationAnalysis/scoring.ts`.
  Contains no LLM calls and no I/O. Exposes `scorePeriod()`.
- **Period_Score**: A deterministic integer favorability value in the range 0–100 for a
  single period within a given life domain. 0 = most challenging, 100 = most supportive.
- **Score_Breakdown**: The itemized record of every factor that contributed to a
  Period_Score, including each factor's value, weight, contribution, and any omissions.
  Persisted for audit.
- **Intensity_Band**: The mapping from a Period_Score to a discrete label
  (`high` / `medium` / `low`) using fixed constant thresholds.
- **Favorable_Flag**: The boolean derived from a Period_Score using a fixed constant
  threshold.
- **Karaka_Role**: A dasha lord's Jaimini Chara Karaka assignment: AK (Atmakaraka),
  AmK (Amatyakaraka), BK (Bhratrikaraka), MK (Matrikaraka), PK (Putrakaraka),
  GK (Gnatikaraka), or DK (Darakaraka).
- **Domain_Weights**: A per-category factor-combination table (`DOMAIN_SCORING_WEIGHTS`)
  declaring, for each category, its benefic houses, malefic houses, relevant Karaka_Role(s),
  relevant natural karakas, and per-factor weights.
- **Compute_First_Contract**: The rule that DA-1 consumes the engine's
  intensity / favorable / peaks as authoritative and must not override them; the LLM
  produces narrative fields only.
- **Scoring_Factor**: One deterministic astrological input to the Period_Score
  (e.g. lord dignity, total Shadbala, Ishta/Kashta ratio, house ownership, Karaka_Role
  relevance, activated yogas, Bhava Bala, transit BAV, Sade Sati state).
- **Peak_Period**: A period identified deterministically as an extreme within the analysis
  window: `peak_stress` (lowest Period_Score) or `peak_favorable` (highest Period_Score).
- **Transit_Overlay_Entry**: A single `TransitOverlay` object (keyed by AD start) supplying
  Saturn/Jupiter transit BAV scores, Sade Sati phase, ashtama-Shani, and kantaka-Shani flags
  for a period, as defined by the existing Duration Analysis feature.
- **Chart_Data**: The category-scoped `CategoryChartData` plus additional deterministic
  columns (shadbala, bhavaBala, jaimini, nakshatraRelationships, Ishta/Kashta phala, and
  domain special points) supplied to the Scoring_Engine and the DA extractor.
- **DA_Extractor**: The deterministic `extractCategoryData()` function in
  `engine/durationAnalysis/extractor.ts`.
- **Period_Slicer**: The deterministic `sliceDashaTree()` function in
  `engine/durationAnalysis/slicer.ts`.
- **Reduced_Confidence**: A flag recorded in a Score_Breakdown when one or more expected
  Scoring_Factors were unavailable for the chart (e.g. paste-path charts lacking shadbala).
- **Natural_Karaka_Relevance**: A Scoring_Factor that credits a running lord (MD/AD/PD)
  when that lord is a domain natural significator (e.g. Venus/Jupiter for marriage,
  Sun/Saturn/Mercury for career), read from the Domain_Weights `relevantNaturalKarakas`
  list. Distinct from Karaka_Role relevance, which uses the chart-specific Jaimini Chara
  Karaka assignment.
- **Domain_House_Activation**: A Scoring_Factor that credits a period when transiting
  Saturn and/or Jupiter (the "double transit") occupy or aspect the domain's benefic
  house(s) or the domain-house lord, measured by transit house-from-lagna, rather than the
  transiting planet's generic Ashtakavarga bindus in its own sign.
- **MD_AD_Relationship**: A Scoring_Factor scoring the relationship between the MD lord and
  the AD lord — their combined permanent (naisargika) and temporary (tatkalika) friendship,
  with a penalty when the AD lord occupies the 6th or 8th house from the MD lord
  (shashtashtaka friction).
- **Natal_House_Strength**: A Scoring_Factor derived from the natal Ashtakavarga SAV
  (Sarvashtakavarga) bindus of the domain house(s), used as a static (transit-independent)
  favorability signal for the domain.
- **Weights_Version**: A version identifier (semantic version or content hash) carried by
  DOMAIN_SCORING_WEIGHTS and stamped onto every persisted Score_Breakdown, so scores remain
  traceable to the exact weight configuration that produced them across weight tunings.
- **Provisional_Weights**: The Phase 1 state of DOMAIN_SCORING_WEIGHTS: explicitly labeled
  provisional and uncalibrated. Scores produced from Provisional_Weights MUST NOT be
  presented to end clients as authoritative or calibrated until the Phase 2 calibration gate
  is passed.
- **Sanity_Backtest**: A lightweight Phase 1 test using a small curated fixture set of
  charts with expected relative rankings, asserting that the Scoring_Engine ranks them
  sensibly. Distinct from the full Phase 2 calibration gate.
- **Calibration_Gate**: The Phase 2 prerequisite — a curated N-chart set with known
  life-event outcomes, an accuracy/ranking metric, and a human sign-off — that must be
  passed before weights are frozen and scores are presented as calibrated. Out of scope for
  Phase 1.
- **Future_Analyser (DA-3)**: The third Duration Analysis agent, which produces a
  per-period forecast. In this feature DA-3 receives the engine per-period scores and the
  deterministic Peak_Periods and must remain consistent with the engine verdict.

---

## Open Decisions (Out of Build Scope)

The following decision is recorded for traceability but is explicitly **not implemented** by
this feature.

- **OD-1 — Surya Siddhanta computational basis.** The engine currently computes positions
  using Swiss Ephemeris with the Lahiri ayanamsa, True Node, and Whole Sign houses. Offering
  a Surya-Siddhanta computational basis is a foundational chart-accuracy decision: it would
  change the Moon's longitude, which shifts every Vimshottari dasha boundary, which in turn
  changes every Period_Score. Because the change propagates through the entire pipeline, it
  is treated as a separate foundational decision and is out of scope here. This feature's
  Scoring_Engine assumes the current Lahiri / Swiss Ephemeris substrate. No requirement in
  this document depends on resolving OD-1.

## Scope and Non-Goals (Phase 1)

- **In scope (Phase 1):** the deterministic Scoring_Engine, persistence of Period_Scores
  and Score_Breakdowns, deterministic Peak_Period identification, the compute-first /
  LLM-narrates contract for DA-1 and DA-3, and exposure of scores and breakdowns through
  the Duration_Analysis_API.
- **Out of scope (deferred to Phase 1.1):** the UI and report presentation of scores,
  Score_Breakdowns, Peak_Periods, and the Reduced_Confidence flag. Phase 1 delivers the
  engine, persistence, and API only; no practitioner-facing rendering of these values is
  built in Phase 1.
- **Out of scope (Phase 2 prerequisite):** the full Calibration_Gate (see Requirement 13).
  Phase 1 weights are Provisional_Weights and must not be presented to end clients as
  calibrated.

---

## Requirements

### Requirement 1: Deterministic Period Scoring Engine

**User Story:** As a Vedic astrologer, I want each dasha period scored by a deterministic
engine, so that favorability is reproducible and auditable rather than dependent on LLM
judgment.

#### Acceptance Criteria

1. THE Scoring_Engine SHALL expose a pure function
   `scorePeriod(period, chartData, transitOverlayEntry, domainWeights)` that returns an
   object containing a `score` (integer, 0–100) and a `breakdown` (Score_Breakdown).

2. THE Scoring_Engine SHALL NOT perform any LLM call, network request, database access, or
   file I/O.

3. WHEN `scorePeriod` is called twice with equal `period`, `chartData`,
   `transitOverlayEntry`, and `domainWeights` inputs, THE Scoring_Engine SHALL return an
   identical `score` and an equivalent `breakdown` on both calls.

4. WHEN `scorePeriod` computes a Period_Score, THE Scoring_Engine SHALL combine the following
   Scoring_Factors: MD lord dignity, AD lord dignity, PD lord dignity, each running lord's
   total Shadbala, the Ishta/Kashta phala benefic ratio of the running lords, house ownership
   evaluated against the domain's benefic and malefic houses (applying a dusthana penalty for
   ownership or occupation of houses 6, 8, or 12), Karaka_Role relevance to the domain,
   Natural_Karaka_Relevance of the running lords, Domain_House_Activation from the transiting
   Saturn/Jupiter double transit, the MD_AD_Relationship between the MD and AD lords,
   Natal_House_Strength from the domain house SAV bindus, activated yogas for the MD/AD
   combination, the Bhava Bala of the houses activated by the running lords, transit BAV of
   Saturn and Jupiter from the Transit_Overlay_Entry, and the Sade Sati / ashtama-Shani /
   kantaka-Shani state of Saturn from the Transit_Overlay_Entry.

9. WHEN a running lord (MD, AD, or PD) is a domain natural karaka listed in the
   Domain_Weights `relevantNaturalKarakas`, THE Scoring_Engine SHALL increase the
   Period_Score contribution via the Natural_Karaka_Relevance factor, reading the karaka
   list from the Domain_Weights rather than from hardcoded per-domain values.

10. WHEN transiting Saturn and/or Jupiter occupy or aspect the domain's benefic house(s) or
    the domain-house lord (evaluated by transit house-from-lagna), THE Scoring_Engine SHALL
    increase the Period_Score contribution via the Domain_House_Activation factor, computed
    independently of the transiting planet's generic BAV in its own sign.

11. WHEN both the MD lord and the AD lord are available, THE Scoring_Engine SHALL score the
    MD_AD_Relationship using their combined permanent and temporary friendship, AND WHERE
    the AD lord occupies the 6th or 8th house from the MD lord, THE Scoring_Engine SHALL
    apply a shashtashtaka penalty to that factor's contribution.

12. WHERE natal Ashtakavarga SAV bindus are available for the domain house(s), THE
    Scoring_Engine SHALL incorporate the Natal_House_Strength factor as a
    transit-independent favorability signal for the domain.

13. THE Scoring_Engine SHALL normalize each Scoring_Factor so that discrimination is
    preserved across the factor's realistic observed value range rather than saturating at
    the range extremes; specifically, THE Scoring_Engine SHALL calibrate the Bhava Bala
    normalization constant to the observed distribution of Bhava Bala rupas (which routinely
    exceed 8 rupas) so that stronger and weaker houses map to distinguishable normalized
    values rather than a saturated maximum.

5. THE Scoring_Engine SHALL return every Period_Score as an integer bounded within the
   inclusive range 0 to 100.

6. IF an input required by a Scoring_Factor is unavailable, THEN THE Scoring_Engine SHALL
   omit that factor from the Period_Score calculation, record the omission in the
   Score_Breakdown, and return a score computed from the remaining available factors.

7. IF any Scoring_Factor input is unavailable, malformed, or absent, THEN THE Scoring_Engine
   SHALL complete the calculation and return a result without raising an exception.

8. WHEN `scorePeriod` returns, THE Score_Breakdown SHALL itemize, for each Scoring_Factor
   applied, the factor name, the raw factor value used, the weight applied, and the resulting
   contribution to the Period_Score.

---

### Requirement 2: Intensity Band and Favorable Flag Derivation

**User Story:** As a Vedic astrologer, I want intensity and favorability derived from the
numeric score by fixed rules, so that the labels shown to practitioners are consistent and
explainable.

#### Acceptance Criteria

1. WHEN a Period_Score is available for a period, THE Scoring_Engine SHALL derive an
   Intensity_Band value of `high`, `medium`, or `low` using fixed constant score thresholds.

2. WHEN a Period_Score is available for a period, THE Scoring_Engine SHALL derive the
   Favorable_Flag as a boolean using a fixed constant score threshold.

3. WHEN two periods have equal Period_Scores, THE Scoring_Engine SHALL assign them the same
   Intensity_Band and the same Favorable_Flag.

4. WHEN the Period_Slicer produces the period set for an analysis, THE Pipeline SHALL persist
   the `score`, Intensity_Band, and Favorable_Flag onto each period before DA-1 is invoked.

---

### Requirement 3: Deterministic Peak Period Identification

**User Story:** As a Vedic astrologer, I want the most stressful and most favorable periods
identified by score, so that peaks are objective and not chosen by the LLM.

#### Acceptance Criteria

1. WHEN all periods in the analysis window have Period_Scores, THE Scoring_Engine SHALL
   identify the lowest-scoring period(s) as `peak_stress` and the highest-scoring period(s)
   as `peak_favorable`.

2. WHEN identifying Peak_Periods, THE Scoring_Engine SHALL rank periods by Period_Score.

3. THE Pipeline SHALL treat the engine-identified Peak_Periods as authoritative, and DA-1
   SHALL NOT select or reorder Peak_Periods.

4. WHEN a Peak_Period is returned, THE Scoring_Engine SHALL include for that period a label,
   its Period_Score, and the top contributing Scoring_Factors drawn from its Score_Breakdown.

5. WHEN two or more periods share the same extreme Period_Score, THE Scoring_Engine SHALL
   include all tied periods in the corresponding Peak_Period ranking using a deterministic
   tie-order.

6. THE Scoring_Engine SHALL label a period as a Peak_Period only when that period's
   Period_Score deviates from neutral (or from the analysis-window median) by at least a
   fixed minimum significance threshold.

7. WHILE all periods in the analysis window fall within the significance threshold of
   neutral (a flat window), THE Scoring_Engine SHALL return fewer Peak_Periods, or none,
   rather than reporting near-neutral extremes as meaningful peaks.

---

### Requirement 4: Karaka Role Tagging

**User Story:** As a Vedic astrologer, I want each period lord tagged with its Chara Karaka
role, so that scoring can weight periods where the running lord is the domain's significator.

#### Acceptance Criteria

1. WHEN the Period_Slicer annotates each period lord, THE Period_Slicer SHALL add the lord's
   Karaka_Role to the `PeriodLordAnnotation`.

2. WHERE a period lord is a node (Rahu or Ketu) that is not included in the Chara Karaka
   scheme, THE Period_Slicer SHALL set that lord's Karaka_Role to null.

3. WHEN the Scoring_Engine evaluates a period, THE Scoring_Engine SHALL increase the
   Period_Score contribution for a running lord whose Karaka_Role matches the domain's
   relevant Karaka_Role in the Domain_Weights (for example DK for marriage, AmK for career).

4. IF Jaimini Chara Karaka data is unavailable for the chart, THEN THE Period_Slicer SHALL
   set each lord's Karaka_Role to null and THE Scoring_Engine SHALL omit the Karaka_Role
   factor and record the omission in the Score_Breakdown.

---

### Requirement 5: Nakshatra Relationship Injection

**User Story:** As a Vedic astrologer, I want the nakshatra relationship layer injected into
the DA context, so that DA-1 reasons from the computed hidden layer instead of re-deriving it.

#### Acceptance Criteria

1. WHEN the DA_Extractor builds category chart data for any category, THE DA_Extractor SHALL
   include the computed `nakshatraRelationships` data, containing depositor chains, sub-lords,
   nakshatra parivartana, and nakshatra clusters.

2. WHEN DA-1 references the nakshatra-lord hidden layer or sub-lord significators, THE DA-1
   prompt SHALL instruct the model to use the injected `nakshatraRelationships` data and
   SHALL NOT re-derive nakshatra lords, sub-lords, or depositor chains from raw positions.

3. IF `nakshatraRelationships` data is unavailable for the chart, THEN THE DA_Extractor SHALL
   omit the key from the category chart data rather than emitting a partial or placeholder
   structure.

---

### Requirement 6: Bhava Bala Injection

**User Story:** As a Vedic astrologer, I want Bhava Bala injected and scored, so that the
strength of the houses a running lord activates influences period favorability.

#### Acceptance Criteria

1. WHERE Bhava Bala has been computed for a chart, THE DA_Extractor SHALL include the
   `bhavaBala` data in the category chart data for every category.

2. WHEN the Scoring_Engine evaluates a period, THE Scoring_Engine SHALL incorporate the
   Bhava Bala of the houses owned or occupied by the running lords into the Period_Score.

3. IF `bhavaBala` data is unavailable for the chart, THEN THE DA_Extractor SHALL include the
   `bhavaBala` key with a null or empty value to indicate the calculation was attempted, AND
   THE Scoring_Engine SHALL omit the Bhava Bala factor and record the omission in the
   Score_Breakdown.

---

### Requirement 7: Domain Special-Point Injection

**User Story:** As a Vedic astrologer, I want each domain's already-computed special points
injected into the DA context, so that domain prompts reference points that are actually
present in the data.

#### Acceptance Criteria

1. THE DOMAIN_SCORING_WEIGHTS registry SHALL declare, for each category, that category's
   required special points, following the existing one-entry-per-domain registry pattern.

2. WHEN the DA_Extractor builds category chart data, THE DA_Extractor SHALL include the
   special points declared for that category from the already-computed chart data, including:
   Upapada Lagna and Darakaraka for `marriage`; Arudha Lagna for `career`; the Special Lagnas
   Hora Lagna, Ghati Lagna, and Sree Lagna for `wealth`, `health`, and `career` as declared;
   and the relevant Upagrahas declared for the category.

3. WHEN a domain prompt references a special point, THE DA_Extractor SHALL ensure that the
   referenced special point is present in the injected category chart data for that category.

4. IF a declared special point is unavailable for the chart, THEN THE DA_Extractor SHALL
   explicitly mark that special point as omitted in the injected category chart data, rather
   than silently excluding it or emitting a placeholder value.

5. THE DOMAIN_SCORING_WEIGHTS registry SHALL declare the required special points for every
   one of the six categories, including Ghati Lagna (GL) for each category whose analysis
   depends on it, so that no category is left without an explicit special-point declaration.

---

### Requirement 8: Compute-First / LLM-Narrates Contract

**User Story:** As a product owner, I want DA-1 to explain the engine's decisions rather than
make its own, so that favorability is deterministic while narrative stays rich.

#### Acceptance Criteria

1. WHEN DA-1 is invoked for a period, THE Pipeline SHALL provide the engine's `score`,
   Intensity_Band, Favorable_Flag, and Score_Breakdown to DA-1 as authoritative input.

2. THE DA-1 prompt SHALL instruct the model to produce only narrative fields (for example
   `analysis`, `bahiranga`, `antaranga`, and factor prose) and SHALL instruct the model that
   it must not change the intensity or favorable values.

3. WHEN DA-1 returns output, THE Pipeline SHALL overwrite any model-emitted intensity or
   favorable values with the engine-computed Intensity_Band and Favorable_Flag during the
   deterministic merge.

4. IF DA-1 emits an intensity or favorable value that differs from the engine value, THEN
   THE Pipeline SHALL retain the engine value in the persisted period and discard the
   model-emitted value.

---

### Requirement 9: Domain-Specific Scoring Weights

**User Story:** As a developer, I want all domain scoring parameters in one table, so that
adding or tuning a domain requires no per-domain logic scattered through the engine.

#### Acceptance Criteria

1. THE DOMAIN_SCORING_WEIGHTS table SHALL be keyed by category and SHALL declare, per
   category, the benefic houses, the malefic houses, the relevant Karaka_Role(s), the
   relevant natural karakas, and the per-factor weights.

2. WHEN the Scoring_Engine computes a Period_Score, THE Scoring_Engine SHALL read all
   per-domain parameters from the Domain_Weights supplied to `scorePeriod`.

3. THE Scoring_Engine SHALL NOT hardcode per-domain benefic houses, malefic houses, karakas,
   or factor weights outside the DOMAIN_SCORING_WEIGHTS table.

4. IF a category is present in the DOMAIN_AGENT_REGISTRY but absent from
   DOMAIN_SCORING_WEIGHTS, THEN THE Scoring_Engine SHALL raise a configuration error
   identifying the missing category.

5. THE DOMAIN_SCORING_WEIGHTS table SHALL fully specify all six categories — health,
   career, wealth, marriage, property, and cashflow — and for each of the six categories
   SHALL declare its benefic houses, its malefic houses, its relevant Karaka_Role(s), its
   relevant natural karakas, its per-factor weights, and its declared special points,
   including Ghati Lagna (GL) where the category requires it.

6. THE DOMAIN_SCORING_WEIGHTS table SHALL NOT leave any of the six categories as an
   unspecified, placeholder, or "same shape as another category" entry; every category's
   parameters SHALL be explicitly declared.

7. WHERE a category requires maraka or badhaka sensitivity in Phase 1, THE
   DOMAIN_SCORING_WEIGHTS table SHALL represent that sensitivity through the category's
   `maleficHouses` weighting; a dedicated maraka Scoring_Factor is deferred beyond Phase 1.

---

### Requirement 10: Score Auditability

**User Story:** As a Vedic astrologer, I want to inspect the factor breakdown behind every
period's score, so that I can audit and backtest the engine's decisions.

#### Acceptance Criteria

1. WHEN the Pipeline persists the period slice for an analysis, THE Pipeline SHALL persist the
   Score_Breakdown for every period alongside its period slice entry.

2. WHEN `GET /api/duration-analysis/[id]` is called for an existing analysis, THE
   Duration_Analysis_API SHALL include each period's Period_Score and Score_Breakdown in the
   response body.

3. WHEN a Score_Breakdown is persisted, THE Score_Breakdown SHALL retain the per-factor
   itemization (factor name, value, weight, contribution) and any recorded omissions defined
   in Requirement 1.

4. IF a Score_Breakdown's per-factor data is missing or corrupted at persistence time, THEN
   THE Pipeline SHALL persist the incomplete Score_Breakdown and handle the missing per-factor
   data gracefully without failing the analysis.

---

### Requirement 11: Backward Compatibility

**User Story:** As a practitioner using existing charts, I want scoring to work on charts
that lack the full deterministic data set, so that paste-path and pre-migration charts still
receive scores without recomputation.

#### Acceptance Criteria

1. IF a chart lacks `shadbala`, `bhavaBala`, or `jaimini` data (for example a paste-path or
   pre-migration chart), THEN THE Scoring_Engine SHALL produce a Period_Score from the
   available Scoring_Factors.

2. WHEN the Scoring_Engine produces a Period_Score with one or more Scoring_Factors omitted
   due to unavailable data, THE Scoring_Engine SHALL set a Reduced_Confidence flag in the
   Score_Breakdown.

3. THE feature SHALL NOT require recomputation of existing compute-path charts in order to
   produce Period_Scores for them.

4. WHEN scoring an existing compute-path chart that already has the full deterministic data
   set, THE Scoring_Engine SHALL apply all Scoring_Factors without setting the
   Reduced_Confidence flag.

5. WHERE an existing DurationAnalysis row was created before this feature and its
   `periodSlice` entries carry no Period_Score or Score_Breakdown, THE Duration_Analysis_API
   SHALL return those period entries verbatim without a score or breakdown.

6. WHEN a consumer encounters a `periodSlice` entry whose Period_Score or Score_Breakdown is
   absent, THE consumer SHALL treat that period as unscored legacy data, AND THE Pipeline
   SHALL NOT trigger recomputation or rescoring of that existing analysis.

---

### Requirement 12: Weights Versioning and Provisional Status

**User Story:** As a developer tuning the scoring weights, I want every score stamped with
the weight version that produced it and Phase 1 weights flagged provisional, so that scores
stay traceable across tunings and are never presented as calibrated before calibration.

#### Acceptance Criteria

1. THE DOMAIN_SCORING_WEIGHTS registry SHALL carry a Weights_Version identifier expressed as
   a semantic version or a content hash.

2. WHEN the Scoring_Engine persists a Score_Breakdown, THE Scoring_Engine SHALL stamp the
   Weights_Version that produced that Score_Breakdown onto the persisted record.

3. WHEN the Weights_Version changes between two analyses, THE persisted Score_Breakdowns
   SHALL retain their respective Weights_Version stamps so that each score remains traceable
   to the weight configuration that produced it.

4. THE Phase 1 DOMAIN_SCORING_WEIGHTS SHALL be labeled as Provisional_Weights (provisional
   and uncalibrated).

5. WHILE the weights are Provisional_Weights, THE system SHALL NOT present Period_Scores to
   end clients as authoritative or calibrated.

6. THE system SHALL treat passing the Phase 2 Calibration_Gate (Requirement 13) as the
   precondition for presenting Period_Scores as calibrated.

---

### Requirement 13: Phased Calibration

**User Story:** As a product owner, I want a lightweight sanity backtest in Phase 1 and a
full calibration gate recorded as a Phase 2 prerequisite, so that the engine is sanity
checked now and only frozen as calibrated after rigorous validation.

#### Acceptance Criteria

1. THE Phase 1 deliverable SHALL include a Sanity_Backtest: a small curated fixture set of
   charts, each with an expected relative ranking.

2. WHEN the Sanity_Backtest runs, THE test SHALL assert that the Scoring_Engine ranks the
   fixture charts consistently with their expected relative rankings.

3. THE full Calibration_Gate — a curated N-chart set with known life-event outcomes, an
   accuracy or ranking metric, and a human sign-off before weights are frozen — SHALL be a
   Phase 2 prerequisite and SHALL be out of scope for Phase 1.

4. THE requirements SHALL record the Phase 2 Calibration_Gate as a dependency that must be
   satisfied before Provisional_Weights are frozen and Period_Scores are presented as
   calibrated.

---

### Requirement 14: DA-3 Forecast Consistency

**User Story:** As a Vedic astrologer, I want the Future Analyser forecast to stay
consistent with the engine's deterministic verdict, so that the narrative explains the
score rather than contradicting it.

#### Acceptance Criteria

1. WHEN the Future_Analyser (DA-3) is invoked, THE Pipeline SHALL provide DA-3 with the
   engine per-period Period_Scores (with Intensity_Band and Favorable_Flag) and the
   deterministic Peak_Periods.

2. WHEN DA-3 produces a forecast for a period, THE DA-3 forecast SHALL remain consistent
   with that period's engine intensity and Favorable_Flag.

3. THE DA-3 forecast for a period SHALL NOT flip a favorable period to challenging or a
   challenging period to favorable relative to the engine verdict; DA-3 MAY add nuance and
   explain the reasons behind the verdict.

4. THE DA-3 prompt SHALL instruct the model to keep its forecast consistent with the engine
   verdict and SHALL forbid the model from reversing the engine's favorable or intensity
   determination for any period.
