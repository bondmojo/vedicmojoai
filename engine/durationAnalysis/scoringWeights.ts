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
 */
export const WEIGHTS_VERSION = '0.4.0-provisional'

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
      mdLordDignity:       12,
      adLordDignity:       10,
      pdLordDignity:        5,
      shadbala:            10,
      ishtaKashta:          8,
      houseOwnership:      14,
      karakaRole:           6,
      naturalKaraka:        6,
      activatedYogas:       4,
      bhavaBala:            8,
      domainHouseActivation: 8,
      mdAdRelationship:     6,
      natalHouseStrength:   8,
      transitBav:           8,
      saturnAfflictions:   12,           // Saturn afflictions weigh heavily on health
      nakshatraDispositor:  6,
      dashaLordBav:         7,
      argalaOnDomainHouse:  5,
      divisionalChartStrength: 6,
      rashiDrishti:         5,
      rashiDispositorChain: 5,
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
      mdLordDignity:       13,
      adLordDignity:       11,
      pdLordDignity:        5,
      shadbala:            12,
      ishtaKashta:          7,
      houseOwnership:      14,
      karakaRole:           9,
      naturalKaraka:        7,
      activatedYogas:       7,
      bhavaBala:            8,
      domainHouseActivation: 10,
      mdAdRelationship:     6,
      natalHouseStrength:   8,
      transitBav:           8,
      saturnAfflictions:    7,
      nakshatraDispositor:  7,           // dispositor threads matter for career (e.g. AD-lord → 10th-lord)
      dashaLordBav:         8,
      argalaOnDomainHouse:  6,
      divisionalChartStrength: 9,        // D10 is domain knowledge's named PRIMARY career varga
      rashiDrishti:         5,
      rashiDispositorChain: 6,
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
      mdLordDignity:       12,
      adLordDignity:       10,
      pdLordDignity:        5,
      shadbala:            10,
      ishtaKashta:          8,
      houseOwnership:      15,
      karakaRole:           4,
      naturalKaraka:        8,
      activatedYogas:       8,
      bhavaBala:            8,
      domainHouseActivation: 9,
      mdAdRelationship:     6,
      natalHouseStrength:   9,
      transitBav:           8,
      saturnAfflictions:    6,
      nakshatraDispositor:  6,
      dashaLordBav:         8,           // per-planet BAV of H2/H11 is a strong wealth signal
      argalaOnDomainHouse:  6,
      divisionalChartStrength: 6,
      rashiDrishti:         5,
      rashiDispositorChain: 5,
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
      mdLordDignity:       12,
      adLordDignity:       11,
      pdLordDignity:        5,
      shadbala:             9,
      ishtaKashta:          7,
      houseOwnership:      14,
      karakaRole:          11,
      naturalKaraka:        9,
      activatedYogas:       6,
      bhavaBala:            7,
      domainHouseActivation: 9,
      mdAdRelationship:     7,
      natalHouseStrength:   8,
      transitBav:           8,
      saturnAfflictions:    7,
      nakshatraDispositor:  6,
      dashaLordBav:         6,
      argalaOnDomainHouse:  6,
      divisionalChartStrength: 9,        // D9 is domain knowledge's named PRIMARY marriage varga
      rashiDrishti:         5,
      rashiDispositorChain: 5,
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
      mdLordDignity:       12,
      adLordDignity:       10,
      pdLordDignity:        5,
      shadbala:             9,
      ishtaKashta:          7,
      houseOwnership:      16,
      karakaRole:           4,
      naturalKaraka:        8,
      activatedYogas:       7,
      bhavaBala:            9,
      domainHouseActivation: 10,
      mdAdRelationship:     6,
      natalHouseStrength:   9,
      transitBav:           8,
      saturnAfflictions:    6,
      nakshatraDispositor:  5,
      dashaLordBav:         7,
      argalaOnDomainHouse:  5,
      divisionalChartStrength: 8,        // D4 is domain knowledge's named PRIMARY property varga
      rashiDrishti:         5,
      rashiDispositorChain: 5,
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
      mdLordDignity:       11,
      adLordDignity:       11,
      pdLordDignity:        7,            // PD matters more for short-term liquidity
      shadbala:            10,
      ishtaKashta:          8,
      houseOwnership:      14,
      karakaRole:           4,
      naturalKaraka:        7,
      activatedYogas:       7,
      bhavaBala:            8,
      domainHouseActivation: 8,
      mdAdRelationship:     6,
      natalHouseStrength:   8,
      transitBav:           9,
      saturnAfflictions:    7,
      nakshatraDispositor:  5,
      dashaLordBav:         7,
      argalaOnDomainHouse:  5,
      divisionalChartStrength: 6,
      rashiDrishti:         5,
      rashiDispositorChain: 5,
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
      mdLordDignity:       12,
      adLordDignity:       10,
      pdLordDignity:        5,
      shadbala:             9,
      ishtaKashta:          7,
      houseOwnership:      16,
      karakaRole:           4,
      naturalKaraka:        8,
      activatedYogas:       7,
      bhavaBala:            9,
      domainHouseActivation: 10,
      mdAdRelationship:     6,
      natalHouseStrength:   9,
      transitBav:           8,
      saturnAfflictions:    6,
      nakshatraDispositor:  5,
      dashaLordBav:         7,
      argalaOnDomainHouse:  5,
      divisionalChartStrength: 8,
      rashiDrishti:         5,
      rashiDispositorChain: 5,
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
