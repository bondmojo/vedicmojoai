/**
 * engine/durationAnalysis/scoringWeights.ts
 *
 * Single source of truth for all per-domain scoring parameters.
 *
 * ⚠  PROVISIONAL / UNCALIBRATED (Requirement 12.4)
 * These weights are hand-seeded for Phase 1 and have NOT been validated against
 * real life-event outcomes. Scores produced from them MUST NOT be presented to end
 * clients as authoritative or calibrated until the Phase 2 Calibration_Gate
 * (Requirement 13) is passed.
 *
 * Bump WEIGHTS_VERSION on any change to DOMAIN_SCORING_WEIGHTS so that every
 * persisted ScoreBreakdown remains traceable to the exact weight table that produced it.
 */

import type {
  DurationCategory,
  DomainScoringWeights,
} from '@/lib/durationTypes'

import { DOMAIN_AGENT_REGISTRY } from './registry'

// ─── Weights version ─────────────────────────────────────────────────

/**
 * Semantic version stamped onto every persisted ScoreBreakdown.
 * The `0.x` major signals Phase 1 / provisional status.
 *
 * 0.2.0 — Track 1a: added three depth factors (nakshatraDispositor, dashaLordBav,
 *         argalaOnDomainHouse) at modest weights. They omit (ok:false) rather than
 *         default to 0.5 when there is no signal, so dilution of the core factors is
 *         bounded; none are added to `primaryFactors` (their legitimate omission on
 *         node lords / no-argala charts must not dent confidence). Backtest fixtures
 *         were re-baselined for this bump. STILL uncalibrated — see the warning above.
 *
 * 0.3.0 — Track 1c: added the Rashi layer — three factors closing the gap where D10
 *         (and the other domain-primary vargas), Jaimini whole-sign aspect, and a
 *         sign-lordship dispositor CHAIN were computed-but-unused by the scorer:
 *           - divisionalChartStrength: the domain's canonical PRIMARY varga
 *             (new `primaryDivision` field below — career=D10, marriage=D9, health=D30,
 *             wealth/cashflow=D2, property=D4), reading varga-house-lord dignity,
 *             varga-lagna-lord dignity, kendra occupancy, and dasha-lord activation.
 *           - rashiDrishti: Jaimini whole-sign aspect (relationships.rashiAspects) from
 *             a running lord's occupied SIGN onto a domain primary house.
 *           - rashiDispositorChain: sign-lord dispositor chain (up to depth 3) — distinct
 *             from the flat houseOwnership snapshot and from nakshatraDispositor's
 *             nakshatra-lord thread.
 *         All three omit (never default to 0.5) when their required data is absent.
 *         `divisionalChartStrength` IS a primary factor for career/marriage/property —
 *         domain knowledge names their varga PRIMARY (D10/D9/D4), so scoring those
 *         domains without it legitimately reduces confidence. Consequence: paste-path
 *         charts (no divisionalCharts column) now score career/marriage/property with
 *         reducedConfidence=true. rashiDrishti and rashiDispositorChain do NOT join
 *         `primaryFactors`. Backtest fixtures re-baselined for this bump.
 *         STILL uncalibrated — see the warning above.
 *
 * 0.4.0 — Duration Computation UI tab: added `family` (new domain, D4/D9/D1, primary
 *         varga shared with property). Also widened the divisional-chart set returned
 *         to career/health/cashflow (D1 + D9 always included alongside the domain's
 *         varga — career now D1/D9/D10, health switched from D30 to D1/D6/D9, cashflow
 *         now D1/D2/D9) per registry.ts. STILL uncalibrated.
 *
 * 0.5.0 — Dignity unification (NOT a weights-table change; the DOMAIN_SCORING_WEIGHTS
 *         numbers are untouched). The scorer's private, divergent dignity classifier
 *         (`getDignityLabel`, which computed tatkalika as an AGGREGATE over all
 *         co-resident planets and, inside divisionalChartStrength, sourced it from the
 *         VARGA positions) was replaced by the canonical `getVargaDignityLabel`
 *         (engine/compute/dignity.ts) — proper per-lord panchadha maitri with tatkalika
 *         drawn from D1, matching shadbala's Saptavargaja convention. Affects
 *         mdLordDignity/adLordDignity/pdLordDignity and divisionalChartStrength for the
 *         seven classical planets; node lords stay neutral as before. Version bumped so
 *         persisted ScoreBreakdowns remain reproducible from the (version, weights) pair
 *         even though the weight numbers did not change. Backtest re-verified: relative
 *         rankings and thresholds hold. STILL uncalibrated — see the warning above.
 *
 * 0.6.0 — Scoring decompression + dimensional rebalance:
 *         (A) No-signal factors now OMIT (exit the denominator) instead of 0.5-filling.
 *             Affected: karakaRole (no match), naturalKaraka (no match),
 *             activatedYogas (0 yogas), domainHouseActivation (no transit),
 *             rashiDrishti (no aspect). Effect: only factors with real evidence vote,
 *             so extreme periods (genuinely strong or weak) can reach true highs/lows
 *             instead of compressing toward neutral 50.
 *         (B) activatedYogas is now bidirectional: 0 yogas → omit (was 0.5 fill);
 *             1–3 yogas → 0.65–0.95 (up-only, as before). A future extension may
 *             penalize dusthana-indicator yogas (< 0.5).
 *         (C) Weights rebalanced into 4 orthogonal DIMENSIONS at ~25% each:
 *             Dignity/Strength (42): mdLord, adLord, pdLord, shadbala, ishtaKashta,
 *               divisionalChartStrength.
 *             House Connection (42): houseOwnership, bhavaBala, natalHouseStrength,
 *               rashiDispositorChain, argalaOnDomainHouse.
 *             Timing/Transit (42): transitBav, saturnAfflictions,
 *               domainHouseActivation, mdAdRelationship.
 *             Karaka/Yoga/Depth (42): karakaRole, naturalKaraka, activatedYogas,
 *               nakshatraDispositor, dashaLordBav, rashiDrishti.
 *             Previously the house dimension was ~55% of effective weight and transit
 *             was ~18% — now each dimension contributes equally, so timing factors
 *             (the ones that DISCRIMINATE between periods) carry proportional influence.
 *         Backtest re-baselined: relative rankings hold; separation (best − worst)
 *         widened materially (fixture deltas ~16–36, up from ~8–14).
 *         (D) Confidence semantics corrected for the omit change: a factor that
 *             evaluated cleanly but found NO SIGNAL this period (karakaRole/
 *             naturalKaraka/activatedYogas/domainHouseActivation/rashiDrishti no-match)
 *             is tagged `noSignal` on its omission and does NOT reduce confidence —
 *             only genuinely UNAVAILABLE chart data (missing shadbala/divisional/etc.)
 *             dents confidence. Without this, ordinary periods where the running lord
 *             simply isn't the domain karaka would have shown false reducedConfidence.
 *             This changes confidence/reducedConfidence metadata only — NOT the score.
 *         STILL uncalibrated — see the warning above.
 */
export const WEIGHTS_VERSION = '0.6.0-provisional'

// ─── Configuration error ─────────────────────────────────────────────

/** Thrown when a category is in DOMAIN_AGENT_REGISTRY but absent from DOMAIN_SCORING_WEIGHTS. */
export class ScoringConfigError extends Error {
  constructor(category: string) {
    super(
      `ScoringConfigError: no DOMAIN_SCORING_WEIGHTS entry for category "${category}". ` +
        `Add an entry to DOMAIN_SCORING_WEIGHTS in engine/durationAnalysis/scoringWeights.ts.`
    )
    this.name = 'ScoringConfigError'
  }
}

// ─── Domain weights table ─────────────────────────────────────────────
// All six categories fully specified — no placeholder or "same as" entries
// (Requirements 9.5, 9.6). Maraka/badhaka sensitivity is represented via
// maleficHouses in Phase 1 (Requirement 9.7).

export const DOMAIN_SCORING_WEIGHTS: Record<DurationCategory, DomainScoringWeights> = {

  // ── Health ────────────────────────────────────────────────────────
  // Domain: body/vitality, disease, chronic conditions, longevity.
  // Saturn afflictions carry the most weight; house ownership (1/6/8) is critical.
  health: {
    category: 'health',
    beneficHouses: [1, 5, 9, 11],
    maleficHouses: [6, 8, 12],           // 6/8/12 also carry the dusthana penalty
    primaryHouses: [1, 6, 8],            // ascendant/body, disease house, chronic/longevity
    primaryDivision: 30,                  // Trimshamsa — misfortune/disease-quality varga
    relevantKarakaRoles: ['AK'],          // Atmakaraka — vitality indicator
    relevantNaturalKarakas: ['Sun', 'Moon', 'Saturn'],
    weights: {
      mdLordDignity:       10,
      adLordDignity:        8,
      pdLordDignity:        4,
      shadbala:             8,
      ishtaKashta:          8,
      houseOwnership:      12,
      karakaRole:           7,
      naturalKaraka:        7,
      activatedYogas:       5,
      bhavaBala:            8,
      domainHouseActivation: 10,
      mdAdRelationship:    10,
      natalHouseStrength:   8,
      transitBav:          10,
      saturnAfflictions:   12,           // Saturn afflictions weigh heavily on health
      nakshatraDispositor:  7,
      dashaLordBav:         7,
      argalaOnDomainHouse:  7,
      divisionalChartStrength: 4,
      rashiDrishti:         5,
      rashiDispositorChain: 7,
    },
    specialPoints: [
      { key: 'ghatiLagna', source: 'specialLagnas', selector: 'GL', confidence: 'primary'   },
      { key: 'gulika',     source: 'upagrahas',     selector: 'Gk', confidence: 'secondary' },
    ],
    primaryFactors: ['houseOwnership', 'saturnAfflictions', 'natalHouseStrength'],
  },

  // ── Career ────────────────────────────────────────────────────────
  // Domain: karma bhava (H10), public performance, professional rise/fall.
  // Shadbala and karakaRole (Amatyakaraka) are the core signals.
  career: {
    category: 'career',
    beneficHouses: [1, 2, 6, 9, 10, 11],
    maleficHouses: [8, 12],
    primaryHouses: [10],                  // karma bhava
    primaryDivision: 10,                  // Dashamsa — PRIMARY career varga per domain knowledge
    relevantKarakaRoles: ['AmK'],         // Amatyakaraka
    relevantNaturalKarakas: ['Sun', 'Saturn', 'Mercury'],
    weights: {
      mdLordDignity:       10,
      adLordDignity:        8,
      pdLordDignity:        4,
      shadbala:             8,
      ishtaKashta:          6,
      houseOwnership:      12,
      karakaRole:           9,
      naturalKaraka:        7,
      activatedYogas:       7,
      bhavaBala:            8,
      domainHouseActivation: 12,
      mdAdRelationship:    10,
      natalHouseStrength:   8,
      transitBav:          10,
      saturnAfflictions:   10,
      nakshatraDispositor:  7,
      dashaLordBav:         7,
      argalaOnDomainHouse:  7,
      divisionalChartStrength: 6,
      rashiDrishti:         5,
      rashiDispositorChain: 7,
    },
    specialPoints: [
      { key: 'arudhaLagna', source: 'arudhaPadas',   selector: 'AL', confidence: 'primary'   },
      { key: 'ghatiLagna',  source: 'specialLagnas', selector: 'GL', confidence: 'secondary' },
    ],
    primaryFactors: ['shadbala', 'karakaRole', 'domainHouseActivation', 'divisionalChartStrength'],
  },

  // ── Wealth ────────────────────────────────────────────────────────
  // Domain: long-term accumulation, H2/H11 gains, Dhana yogas.
  // House ownership and natural karakas (Jupiter/Venus) are the core signals.
  wealth: {
    category: 'wealth',
    beneficHouses: [1, 2, 5, 9, 11],
    maleficHouses: [6, 8, 12],
    primaryHouses: [2, 11],               // accumulation + gains
    primaryDivision: 2,                   // Hora — wealth/prosperity varga
    relevantKarakaRoles: [],
    relevantNaturalKarakas: ['Jupiter', 'Venus'],
    weights: {
      mdLordDignity:       10,
      adLordDignity:        8,
      pdLordDignity:        4,
      shadbala:             8,
      ishtaKashta:          6,
      houseOwnership:      12,
      karakaRole:           7,
      naturalKaraka:        9,
      activatedYogas:       7,
      bhavaBala:            8,
      domainHouseActivation: 10,
      mdAdRelationship:    10,
      natalHouseStrength:   8,
      transitBav:          10,
      saturnAfflictions:   10,
      nakshatraDispositor:  7,
      dashaLordBav:         7,
      argalaOnDomainHouse:  7,
      divisionalChartStrength: 6,
      rashiDrishti:         5,
      rashiDispositorChain: 7,
    },
    specialPoints: [
      { key: 'sreeLagna',  source: 'specialLagnas', selector: 'SL', confidence: 'primary'   },
      { key: 'horaLagna',  source: 'specialLagnas', selector: 'HL', confidence: 'primary'   },
      { key: 'ghatiLagna', source: 'specialLagnas', selector: 'GL', confidence: 'secondary' },
    ],
    primaryFactors: ['houseOwnership', 'naturalKaraka', 'natalHouseStrength'],
  },

  // ── Marriage ──────────────────────────────────────────────────────
  // Domain: partnership / spouse (H7), Darakaraka, Venus/Jupiter karakas.
  // Karaka role (DK) and natural karakas are the strongest signals.
  marriage: {
    category: 'marriage',
    beneficHouses: [1, 5, 7, 11],
    maleficHouses: [6, 8, 12],
    primaryHouses: [7],                   // spouse / partnership bhava
    primaryDivision: 9,                   // Navamsa — PRIMARY marriage varga
    relevantKarakaRoles: ['DK'],          // Darakaraka
    relevantNaturalKarakas: ['Venus', 'Jupiter'],
    weights: {
      mdLordDignity:       10,
      adLordDignity:        8,
      pdLordDignity:        4,
      shadbala:             8,
      ishtaKashta:          6,
      houseOwnership:      12,
      karakaRole:          10,
      naturalKaraka:        8,
      activatedYogas:       6,
      bhavaBala:            8,
      domainHouseActivation: 10,
      mdAdRelationship:    10,
      natalHouseStrength:   8,
      transitBav:          10,
      saturnAfflictions:   10,
      nakshatraDispositor:  6,
      dashaLordBav:         6,
      argalaOnDomainHouse:  7,
      divisionalChartStrength: 6,
      rashiDrishti:         6,
      rashiDispositorChain: 7,
    },
    specialPoints: [
      { key: 'upapadaLagna', source: 'arudhaPadas',   selector: 'UL', confidence: 'primary'   },
      { key: 'darakaraka',   source: 'karakas',        selector: 'DK', confidence: 'primary'   },
      { key: 'ghatiLagna',   source: 'specialLagnas',  selector: 'GL', confidence: 'secondary' },
    ],
    primaryFactors: ['karakaRole', 'houseOwnership', 'naturalKaraka', 'divisionalChartStrength'],
  },

  // ── Property ──────────────────────────────────────────────────────
  // Domain: land, fixed assets, vehicles (H4). Mars/Venus/Saturn are natural karakas.
  // House ownership and domainHouseActivation are the strongest signals.
  property: {
    category: 'property',
    beneficHouses: [1, 4, 9, 11],
    maleficHouses: [6, 8, 12],
    primaryHouses: [4],                   // land / vehicles / fixed assets
    primaryDivision: 4,                   // Chaturthamsa — PRIMARY property varga
    relevantKarakaRoles: [],
    relevantNaturalKarakas: ['Mars', 'Venus', 'Saturn'],
    weights: {
      mdLordDignity:       10,
      adLordDignity:        8,
      pdLordDignity:        4,
      shadbala:             8,
      ishtaKashta:          6,
      houseOwnership:      12,
      karakaRole:           7,
      naturalKaraka:        8,
      activatedYogas:       7,
      bhavaBala:            8,
      domainHouseActivation: 12,
      mdAdRelationship:    10,
      natalHouseStrength:   8,
      transitBav:          10,
      saturnAfflictions:   10,
      nakshatraDispositor:  5,
      dashaLordBav:         7,
      argalaOnDomainHouse:  7,
      divisionalChartStrength: 6,
      rashiDrishti:         6,
      rashiDispositorChain: 7,
    },
    specialPoints: [
      { key: 'ghatiLagna', source: 'specialLagnas', selector: 'GL', confidence: 'secondary' },
    ],
    primaryFactors: ['houseOwnership', 'domainHouseActivation', 'natalHouseStrength', 'divisionalChartStrength'],
  },

  // ── Cashflow ──────────────────────────────────────────────────────
  // Domain: liquidity — income vs expenses vs debt. "Money Agent", distinct from wealth.
  // H6 is favorable (loans/competition won); H8/H12 are malefic.
  // PD lord weight is higher than other domains — short-term liquidity is PD-sensitive.
  cashflow: {
    category: 'cashflow',
    beneficHouses: [1, 2, 6, 10, 11],    // H6 favorable for cashflow
    maleficHouses: [8, 12],
    primaryHouses: [2, 11],               // liquid funds + recurring gains
    primaryDivision: 2,                   // Hora — same liquidity/prosperity varga as wealth
    relevantKarakaRoles: [],
    relevantNaturalKarakas: ['Mercury', 'Venus'],
    weights: {
      mdLordDignity:       10,
      adLordDignity:        8,
      pdLordDignity:        5,
      shadbala:             8,
      ishtaKashta:          6,
      houseOwnership:      12,
      karakaRole:           7,
      naturalKaraka:        7,
      activatedYogas:       7,
      bhavaBala:            8,
      domainHouseActivation: 10,
      mdAdRelationship:    10,
      natalHouseStrength:   8,
      transitBav:          10,
      saturnAfflictions:   10,
      nakshatraDispositor:  5,
      dashaLordBav:         7,
      argalaOnDomainHouse:  7,
      divisionalChartStrength: 5,
      rashiDrishti:         7,
      rashiDispositorChain: 7,
    },
    specialPoints: [
      { key: 'horaLagna',  source: 'specialLagnas', selector: 'HL', confidence: 'primary'   },
      { key: 'ghatiLagna', source: 'specialLagnas', selector: 'GL', confidence: 'secondary' },
    ],
    primaryFactors: ['houseOwnership', 'transitBav', 'natalHouseStrength'],
  },

  // ── Family ────────────────────────────────────────────────────────
  // Domain: lineage, home, mother, domestic happiness (H2/H4). New for the
  // deterministic Duration Computation tab (see registry.ts) — modeled on
  // `property`'s weight distribution (same D4 primary division) since both
  // domains share their primary varga; houses/karakas adjusted for the
  // family lens (2nd house lineage added, natural karakas swapped to
  // Moon/Jupiter). Exact weights are a judgment call, same provisional
  // status as every other domain here — revisit once real outcomes exist.
  family: {
    category: 'family',
    beneficHouses: [1, 2, 4, 9, 11],
    maleficHouses: [6, 8, 12],
    primaryHouses: [2, 4],                // lineage/family wealth + home/mother
    primaryDivision: 4,                   // Chaturthamsa — shared PRIMARY varga with property
    relevantKarakaRoles: [],
    relevantNaturalKarakas: ['Moon', 'Jupiter'],
    weights: {
      mdLordDignity:       10,
      adLordDignity:        8,
      pdLordDignity:        4,
      shadbala:             8,
      ishtaKashta:          6,
      houseOwnership:      12,
      karakaRole:           7,
      naturalKaraka:        8,
      activatedYogas:       7,
      bhavaBala:            8,
      domainHouseActivation: 12,
      mdAdRelationship:    10,
      natalHouseStrength:   8,
      transitBav:          10,
      saturnAfflictions:   10,
      nakshatraDispositor:  5,
      dashaLordBav:         7,
      argalaOnDomainHouse:  7,
      divisionalChartStrength: 6,
      rashiDrishti:         6,
      rashiDispositorChain: 7,
    },
    specialPoints: [
      { key: 'ghatiLagna', source: 'specialLagnas', selector: 'GL', confidence: 'secondary' },
    ],
    primaryFactors: ['houseOwnership', 'domainHouseActivation', 'natalHouseStrength', 'divisionalChartStrength'],
  },
}

// ─── Resolver ────────────────────────────────────────────────────────

/**
 * Resolve the weight-table entry for a category.
 *
 * Throws `ScoringConfigError` when the category is present in
 * `DOMAIN_AGENT_REGISTRY` but absent from `DOMAIN_SCORING_WEIGHTS` — this
 * is a programmer/configuration error, surfaced loudly at pipeline start,
 * never silently swallowed (Requirement 9.4).
 */
export function resolveDomainWeights(category: DurationCategory): DomainScoringWeights {
  // Guard: every registered category must have a weights entry
  if (!(category in DOMAIN_AGENT_REGISTRY)) {
    throw new ScoringConfigError(category)
  }

  const weights = DOMAIN_SCORING_WEIGHTS[category]
  if (!weights) {
    throw new ScoringConfigError(category)
  }

  return weights
}
