# Pre-Analysis Rules Reference

This document defines the eleven pre-analysis rules applied by the MojoAI Vedic Astrology engine before any synthesis or scoring pass begins. Every agent in the pipeline must evaluate these rules in order and propagate their results into the shared analysis context. Rules are applied sequentially; downstream rules may reference the outputs of earlier ones.

---

## Rule 1: Planet Dignity and Strength Classification

Each planet is assigned a dignity tier before any yoga or dasha analysis. Dignity determines the base multiplier applied to a planet's functional contribution throughout the report.

| Planet  | Direct threshold (Shadbala units) | Retrograde threshold (Shadbala units) |
|---------|-----------------------------------|---------------------------------------|
| Sun     | >= 390                            | n/a (Sun is never retrograde)         |
| Moon    | >= 360                            | n/a (Moon is never retrograde)        |
| Mars    | >= 300                            | >= 270                                |
| Mercury | >= 420                            | >= 380                                |
| Jupiter | >= 390                            | >= 350                                |
| Venus   | >= 390                            | >= 355                                |
| Saturn  | >= 300                            | >= 265                                |
| Rahu    | >= 200 (mean motion)              | >= 180                                |
| Ketu    | >= 200 (mean motion)              | >= 180                                |

**Cazimi note.** A planet within 1 degree of exact conjunction with the Sun (within the solar orb but at the heart of the Sun) is treated as Cazimi (combusted yet empowered). Cazimi planets receive a +1.5 dignity bonus rather than the standard combustion penalty. A planet between 1 degree and the standard combustion orb receives the normal combustion malus.

Dignity tiers in descending order: Exalted > Moolatrikona > Own sign > Great friend sign > Friend sign > Neutral sign > Enemy sign > Debilitated. Apply Neechabhanga adjustments per Rule 5 before finalising the tier.

---

## Rule 2: Ascendant (Lagna) Lock

The Lagna and its lord must be locked and validated before any house-based analysis proceeds. Validation steps:

1. Confirm the Lagna sign from the birth data with timezone-corrected sidereal time.
2. Identify the Lagna lord and its natal placement (sign, house, degree).
3. Classify the Lagna lord as strong, average, or weak using the Shadbala thresholds from Rule 1.
4. Record whether the Lagna lord is conjunct, aspected by, or in mutual reception with benefics or malefics.
5. Flag if the Lagna lord is combust, debilitated, or in the 6th, 8th, or 12th house without compensating dignity — this triggers a resilience penalty on the Wealth Potential and Health Resilience scores.

No house-based yoga detection (Rule 7) may run until the Lagna lock is confirmed.

---

## Rule 3: Functional Benefic and Malefic Classification

For the specific Lagna in force, each planet is labelled as a functional benefic (FB), functional malefic (FM), or neutral (N) before yoga evaluation. Natural benefics (Jupiter, Venus, unafflicted Mercury, waxing Moon) may be functional malefics for certain lagnas (e.g., Venus is FM for Sagittarius lagna as lord of 6th and 11th). Natural malefics (Sun, Mars, Saturn, Rahu, Ketu) may be functional benefics (e.g., Mars is FB for Cancer and Leo lagna as Yogakaraka).

Classification must reference the standard Parashari lord-of-houses table for the active Lagna. Kendradhipati dosha applies to Jupiter and Venus when they own a kendra (1, 4, 7, 10) without simultaneously owning a trikona (1, 5, 9). Flag the dosha in the planet record but do not fully negate the planet's benefic contribution — reduce its functional weight by 30 %.

---

## Rule 4: Yogakaraka Detection

A Yogakaraka is a single planet that simultaneously lords a kendra house (1, 4, 7, 10) and a trikona house (1, 5, 9). The lagna itself (1st house) counts for both categories; therefore a planet that lords the 1st and any other kendra or trikona qualifies.

**12-Lagna Yogakaraka table:**

| Lagna       | Yogakaraka Planet | Kendra lordship | Trikona lordship |
|-------------|-------------------|-----------------|------------------|
| Aries       | Sun               | —               | (no single-planet YK; Sun lords 5th only) — see note |
| Taurus      | Saturn            | 10th            | 9th              |
| Gemini      | Venus             | 4th             | 9th              |
| Cancer      | Mars              | 10th            | 5th              |
| Leo         | Mars              | 4th             | 9th              |
| Virgo       | Venus             | 7th             | 9th (also 2nd)   |
| Libra       | Saturn            | 4th             | 5th              |
| Scorpio     | Moon              | 9th (also 4th)  | 9th              |
| Sagittarius | (none)            | —               | —                |
| Capricorn   | Venus             | 4th             | 9th              |
| Aquarius    | Venus             | 4th             | 9th              |
| Pisces      | Mars              | (co-lord 1st)   | 9th              |

Note: For Aries and Pisces the traditional single-planet Yogakaraka is disputed across schools. Apply the system defined in the active school configuration parameter (`engine.settings.yoga_school`). When no Yogakaraka exists for the Lagna, set `yogakaraka_status.present = false` and skip Yogakaraka-dependent score bonuses.

---

## Rule 5: Neechabhanga (Cancellation of Debilitation)

A debilitated planet does not automatically retain its full debilitation penalty. Four classical conditions cancel the debilitation; each condition met reduces the debilitation penalty by 25 % (four conditions met = full cancellation, treated as the planet being in a neutral sign).

**Four Neechabhanga conditions:**

1. The lord of the sign in which the planet is debilitated is in a kendra (1, 4, 7, 10) from the Lagna or from the Moon.
2. The planet that gets exalted in the same sign where the debilitated planet sits is in a kendra from the Lagna or from the Moon.
3. The debilitated planet itself is in a kendra from the Lagna or from the Moon.
4. The dispositor of the debilitated planet (lord of the sign it occupies) conjuncts or aspects the debilitated planet.

**Scoring table:**

| Conditions met | Debilitation status           | Dignity adjustment               |
|----------------|-------------------------------|----------------------------------|
| 0              | Full debilitation             | Apply full debilitation malus    |
| 1              | Partial cancellation (weak)   | Reduce malus by 25 %             |
| 2              | Partial cancellation (moderate)| Reduce malus by 50 %            |
| 3              | Near-full cancellation        | Reduce malus by 75 %             |
| 4              | Full Neechabhanga             | Treat as neutral sign placement  |

Record the number of conditions met per debilitated planet in `corrections_applied` so the synthesis agent can surface this in the report.

---

## Rule 6: Strength Indicator Priority Ordering

When two or more strength signals conflict (e.g., a planet is in its own sign but combust), resolve priority using the following ordered list. Higher-ranked indicators dominate lower-ranked ones when computing the net strength score.

1. Cazimi status (within 1° of Sun — overrides combustion penalty entirely)
2. Exaltation or Moolatrikona
3. Own sign placement
4. Neechabhanga Raj Yoga (full cancellation per Rule 5)
5. Dig Bala (directional strength: Sun/Mars in 10th, Moon/Venus in 4th, Mercury/Jupiter in 1st, Saturn in 7th)
6. Aspect from a strong Yogakaraka or natural benefic in good dignity
7. Combustion malus (subtract after all positive indicators are summed)
8. Debilitation malus (subtract after combustion, reduced by Neechabhanga fraction)

Apply indicators 1–6 additively to the base Shadbala score, then subtract 7 and 8 in that order.

---

## Rule 7: Yoga Detection Gate

Yoga detection must not run until Rules 1–6 are complete. Each yoga is evaluated against the following gate conditions before being registered:

- The planets forming the yoga must have a net strength score above the minimum threshold for their dignity tier (per Rule 1 adjusted by Rules 5 and 6).
- At least one planet in the yoga must be a functional benefic for the active Lagna (Rule 3), unless the yoga is a Raj Yoga formed by the Yogakaraka (Rule 4).
- If both planets forming a Dhana Yoga are in dusthana houses (6, 8, 12), the yoga is recorded as present but marked `active = false` and contributes zero score bonus.

Yogas that pass the gate are written to `yoga_registry` with name, active flag, strength rating (weak / moderate / strong / exceptional), houses involved, planets, and notes.

---

## Rule 8: Dasha-Antardasha Applicability Filter

Only dashas whose lord has a net strength score above 3.0 (on a 0–10 scale) are written to `cashflow_timeline` as actionable periods. Dashas with lord strength below 3.0 are recorded with direction = "neutral" and magnitude = "low" to indicate a dormant period rather than an active one.

Sub-periods (antardasha) are included only when the antardasha lord is also the Yogakaraka, a strong functional benefic, or the Lagna lord. All other sub-periods are collapsed into the parent dasha entry with a "mixed" direction tag.

The cashflow timeline must cover a minimum forward window of 10 years from the report generation date unless the chart has fewer remaining dasha years.

---

## Rule 9: Sade Sati Phase Detection

Sade Sati (Saturn's 7.5-year transit over the Moon sign and its two flanking signs) is evaluated in three phases:

- **Phase 1 (Rising):** Saturn transiting the 12th sign from natal Moon. Effects are latent; financial and relational stress begins to build.
- **Peak (Core):** Saturn transiting over the natal Moon sign directly. Effects are most acute across all life domains.
- **Phase 3 (Setting):** Saturn transiting the 2nd sign from natal Moon. Resolution and release; some material recovery typical.

If the subject is currently in any Sade Sati phase, the engine applies a resilience penalty to both Wealth Retention and Health Resilience scores:

- Phase 1 or Phase 3: -0.5 points each
- Peak phase: -1.25 points

Record the active phase, start date, end date, and net score impact in `sade_sati_impact`. If Sade Sati is not active, set `sade_sati_impact.active = false` and apply no penalty.

---

## Rule 10: Atma Karaka Identification and Theme Assignment

The Atma Karaka (AK) is the planet with the highest degree (ignoring sign, counting minutes and seconds) in the natal chart. Rahu and Ketu are excluded from AK calculation in the Parashari system; include them only if the active school configuration sets `engine.settings.jaimini_mode = true`.

Once identified, assign the soul-level theme from the following mapping:

- Sun as AK: authority, ego transcendence, father-figure lessons, leadership dharma
- Moon as AK: emotional intelligence, nurturing, public life, mother-figure lessons
- Mars as AK: courage, discipline, property and land matters, conflict resolution
- Mercury as AK: communication, intellect, trade, siblings, adaptability
- Jupiter as AK: wisdom, teaching, expansion, children, dharmic growth
- Venus as AK: relationships, aesthetics, luxury, creative expression, partnership karma
- Saturn as AK: service, perseverance, delay before reward, karmic debt settlement
- Rahu as AK (Jaimini only): unconventional path, foreign connections, material obsession before detachment

Record the AK planet, degree, and theme in `atma_karaka_theme`. The theme feeds into the executive summary narrative and into the financial freedom qualitative commentary.

---

## Rule 11: Cross-Channel Interaction Scan

After all individual planet and yoga analyses are complete, a cross-channel scan identifies interactions between the four primary life channels — Wealth, Health, Relationships, and Dharma — and records the net synergy or friction between them.

For each channel pair, evaluate:

1. Whether the lords of the houses governing both channels are mutually friendly, neutral, or inimical.
2. Whether any planet simultaneously aspects or conjuncts lords of both channels (a cross-channel bridge).
3. Whether dashas of lords from conflicting channels overlap in the cashflow timeline, creating periods of resource competition.

Each pair is scored:

- **Synergistic:** lords mutually friendly, bridge planet present, no dasha conflict — net effect = positive
- **Neutral:** mixed signals, no strong bridge or friction — net effect = neutral
- **Friction:** lords inimical, dasha overlap with resource competition — net effect = negative

Results are written to `cross_channel_matrix` as rows with channel_a, channel_b, interaction type, net_effect, and remarks. The cross-channel scan must complete before the confidence matrix is computed, as channel friction is a key factor in reducing confidence scores.
