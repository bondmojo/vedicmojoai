/**
 * lib/durationTypes.ts — TypeScript types for the Duration Analysis pipeline.
 *
 * Covers: DA-1 (Domain Analyser), DA-2 (Symptom Validator), DA-3 (Future Analyser),
 * period slicer, transit overlay, category extractor, and SSE events.
 *
 * Do NOT import from lib/types.ts — this file is intentionally standalone.
 */

// ─── Domain Types ────────────────────────────────────────────────────

export type DurationCategory =
  | 'health'
  | 'career'
  | 'wealth'
  | 'marriage'
  | 'property'
  | 'cashflow' // liquidity / "Money Agent" — distinct from wealth (accumulation)
  | 'family' // home/lineage/domestic happiness — deterministic-tab only, see registry.ts

export type DurationStatus =
  | 'queued'
  | 'running'
  | 'symptom_unmatched'
  | 'done'
  | 'failed'
  | 'cancelled' // practitioner cancelled (gate or mid-run); pipeline unwinds cooperatively

export type DurationAgentId = 'DA-1' | 'DA-2' | 'DA-3' | 'FOUNDATION'

// ─── Foundation Sub-Agents (Track 2) ─────────────────────────────────
// Natal-chart foundation agents that run ONCE per (chart, domain) BEFORE DA-1,
// producing durable structural context that DA-1 and DA-3 apply per period.

export type FoundationAgentId =
  | 'FOUND-PLANETS'
  | 'FOUND-NAKSHATRA'
  | 'FOUND-UPAGRAHA'
  | 'FOUND-BAV'

/** One foundation agent's JSON output. */
export interface FoundationAgentOutput {
  agent_id: string
  summary: string
  key_findings: string[]
}

/** Merged foundation outputs keyed by agent id — persisted in the foundationOutput column. */
export type FoundationOutput = Partial<Record<FoundationAgentId, FoundationAgentOutput>>

// ─── Period Lord Annotation ──────────────────────────────────────────
// Natal chart metadata for a dasha lord — computed deterministically, no LLM

export interface PeriodLordAnnotation {
  planet: string
  sign: string
  house: number
  nakshatra: string
  nakshatraLord: string    // lord of the nakshatra the planet occupies natally
  subLord: string          // KP sub-lord
  retrograde: boolean
  combust: boolean         // from relationships.combustion
  cazimi: boolean
  activatedYogas: string[] // yogas formed with this lord e.g. ["Raja Yoga (1st-5th lord exchange)"]
  ownsHouses: number[]     // houses this planet rules in D1 e.g. [6, 11]
  occupiesHouse: number    // natal house (same as house — explicit for prompt clarity)
  /** Jaimini Chara Karaka role (AK/AmK/BK/MK/PK/GK/DK), or null for Rahu/Ketu/absent karakas. */
  karakaRole: string | null
}

// ─── Transit Overlay ────────────────────────────────────────────────
// Transit state of key planets at each AD boundary in the date range

export interface TransitOverlay {
  adStart: string           // ISO date — the AD boundary this overlay was computed for
  adLord: string
  saturn: { sign: string; signNumber: number; houseFromLagna: number; houseFromMoon: number; retrograde: boolean }
  jupiter: { sign: string; signNumber: number; houseFromLagna: number; houseFromMoon: number; retrograde: boolean }
  rahu: { sign: string; signNumber: number; houseFromLagna: number }
  ketu: { sign: string; signNumber: number; houseFromLagna: number }
  sadeSatiActive: boolean
  sadeSatiPhase: 'rising' | 'peak' | 'setting' | null
  ashtamaShani: boolean
  kantakaShani: boolean
  saturnBavScore: number    // Saturn's bindhu count in its transit sign (0–8, -1 = unavailable)
  jupiterBavScore: number   // Jupiter's bindhu count in its transit sign (0–8, -1 = unavailable)
}

// ─── Dasha Slice ─────────────────────────────────────────────────────
// A single MD/AD/PD period entry returned by sliceDashaTree()

export interface DashaSlice {
  md: { lord: string; start: string; end: string }   // ISO strings
  ad: { lord: string; start: string; end: string }
  pd: { lord: string; start: string; end: string }
  lordAnnotations: {
    mdLord: PeriodLordAnnotation
    adLord: PeriodLordAnnotation
    pdLord: PeriodLordAnnotation
  }
}

// ─── Pipeline Input ──────────────────────────────────────────────────

export interface DurationPipelineInput {
  analysisId: string
  unifiedChartId: string
  dateFrom: Date
  dateTo: Date
  category: DurationCategory
  userQuestion?: string
  symptoms?: string
  /**
   * Optional LLM overrides selected in the UI. When set, they are applied to
   * ALL DA agents (DA-1/2/3), replacing the seeded ModelConfig provider/model.
   * Per-agent temperature and maxTokens still come from ModelConfig.
   * `apiKey` is used transiently for this run and never persisted.
   */
  overrideProvider?: string
  overrideModel?: string
  apiKey?: string
  emitEvent: (event: DurationSSEEvent) => void
}

// ─── Agent Output Contracts ──────────────────────────────────────────

export interface PeriodAnalysis {
  md: { lord: string; start: string; end: string }
  ad: { lord: string; start: string; end: string }
  pd: { lord: string; start: string; end: string }
  // Merged in deterministically by the pipeline after DA-1 returns (not emitted by the LLM).
  // Optional because a match miss leaves them absent rather than lying about the shape.
  lordAnnotations?: {
    mdLord: PeriodLordAnnotation
    adLord: PeriodLordAnnotation
    pdLord: PeriodLordAnnotation
  }
  transitContext?: TransitOverlay
  analysis: string
  key_factors: string[]
  transit_factors: string[]
  activated_yogas: string[]
  intensity: 'high' | 'medium' | 'low'
  favorable: boolean
  bahiranga: string
  antaranga: string
  /** Deterministic engine score (0–100). Absent on pre-feature legacy periods. */
  score?: number
  /** Full itemized breakdown produced by the scoring engine. Absent on legacy periods. */
  scoreBreakdown?: ScoreBreakdown
}

export interface DA1Output {
  agent_id: 'DA-1'
  category: DurationCategory
  date_range: { from: string; to: string }
  period_analysis: PeriodAnalysis[]
  overall_trend: string
  peak_stress_periods: Array<{ period: string; reason: string }>
  peak_favorable_periods: Array<{ period: string; reason: string }>
}

export interface SymptomDiagnosis {
  found: boolean
  confidence: 'high' | 'medium' | 'low'
  supporting_factors: string[]
  contradicting_factors: string[]
  analysis: string
  affected_periods: string[]
}

export interface DA2Output {
  agent_id: 'DA-2'
  symptom_diagnosis: SymptomDiagnosis
}

export interface PeriodForecast {
  period_label: string
  forecast: string
  bahiranga: string
  antaranga: string
  why: string
  transit_why: string
  recommendations: string[]
}

export interface DA3Output {
  agent_id: 'DA-3'
  answer: string
  period_forecasts: PeriodForecast[]
  summary: string
}

// ─── Category Chart Data ─────────────────────────────────────────────
// Category-scoped chart data passed to DA-1 (token-optimised)

export interface CategoryChartData {
  category: DurationCategory
  planets: unknown
  nakshatras: unknown        // ALL categories — nakshatra lords of dasha lords
  relationships: unknown     // ALL categories — combustion + yoga detection
  ashtakavarga: unknown      // ALL categories — BAV transit scores
  upagrahas?: unknown        // ALL categories — full upagraha table (Gulika, Mandi, …)
  shadbala?: unknown         // per DOMAIN_AGENT_REGISTRY extraColumns
  divisionalCharts?: unknown[] // per DOMAIN_AGENT_REGISTRY divisions (e.g. career = D1 + D9 + D10)
  jaimini?: unknown          // per DOMAIN_AGENT_REGISTRY extraColumns
  dashaTree: unknown
}

// ─── SSE Events ──────────────────────────────────────────────────────

export type DurationSSEEventType =
  | 'connected'
  | 'agent_start'
  | 'agent_complete'
  | 'agent_error'
  | 'symptom_gate'
    | 'run_complete'
  | 'run_cancelled'

export interface DurationSSEEvent {
  type: DurationSSEEventType
  agent_id?: DurationAgentId
  data?: Record<string, unknown>
  timestamp: string
}

// ─── Chat Request ────────────────────────────────────────────────────

export interface DurationChatRequest {
  message: string
  focusPeriod?: string  // e.g. "Jupiter MD / Saturn AD 2024-03" — anchors DA-3 response
}

// ─── Scoring Engine Types ─────────────────────────────────────────────
// Types for the deterministic compute-first scoring layer (Phase 1).
// See: engine/durationAnalysis/scoring.ts, engine/durationAnalysis/scoringWeights.ts

/**
 * The 21 deterministic scoring factors used by the Scoring Engine.
 * Three dignity factors + 12 chart/transit factors + 3 depth factors
 * (nakshatraDispositor, dashaLordBav, argalaOnDomainHouse) + 3 rashi-layer
 * factors (divisionalChartStrength, rashiDrishti, rashiDispositorChain).
 */
export type ScoringFactorKey =
  | 'mdLordDignity'
  | 'adLordDignity'
  | 'pdLordDignity'
  | 'shadbala'
  | 'ishtaKashta'
  | 'houseOwnership'
  | 'karakaRole'
  | 'naturalKaraka'
  | 'activatedYogas'
  | 'bhavaBala'
  | 'domainHouseActivation'
  | 'mdAdRelationship'
  | 'natalHouseStrength'
  | 'transitBav'
  | 'saturnAfflictions'
  | 'nakshatraDispositor'
  | 'dashaLordBav'
  | 'argalaOnDomainHouse'
  | 'divisionalChartStrength'
  | 'rashiDrishti'
  | 'rashiDispositorChain'

/** One applied factor's contribution record in the ScoreBreakdown. */
export interface ScoreFactorContribution {
  factor: ScoringFactorKey
  /** Raw astrological value before normalization (e.g. dignity string, strength ratio). */
  value: unknown
  /** Normalized value n_f ∈ [0, 1] fed into the formula. */
  normalized: number
  /** Weight w_f read from DomainScoringWeights.weights. */
  weight: number
  /** w_f × n_f — the points this factor contributed to the weighted sum. */
  contribution: number
}

/** An omitted factor recorded in the ScoreBreakdown. */
export interface ScoreOmission {
  factor: ScoringFactorKey
  /** Human-readable reason (e.g. "shadbala not available for paste-path chart"). */
  reason: string
  /** Primary omissions materially dent confidence; secondary are footnotes. */
  severity: 'primary' | 'secondary'
}

/**
 * Full itemized breakdown for a single period's score.
 * Persisted in the periodSlice JSONB column alongside score/intensity/favorable.
 */
export interface ScoreBreakdown {
  /** Integer Period_Score 0–100. */
  score: number
  /** Discrete intensity band derived from the score. */
  intensity: 'high' | 'medium' | 'low'
  /** True when score ≥ FAVORABLE_THRESHOLD (50). */
  favorable: boolean
  /** All Scoring_Factors that were applied (available data). */
  factors: ScoreFactorContribution[]
  /** All Scoring_Factors that were omitted (unavailable or malformed data). */
  omissions: ScoreOmission[]
  /** Sum of weights of the factors that were actually applied. */
  weightSumApplied: number
  /**
   * True when one or more primary factors were omitted due to missing chart data
   * (e.g. paste-path chart lacking shadbala). Signals the score is less reliable.
   */
  reducedConfidence: boolean
  /** Confidence ratio 0–1: proportion of primary-factor weight that was applied. */
  confidence: number
  /**
   * WEIGHTS_VERSION stamp from DOMAIN_SCORING_WEIGHTS.
   * Allows every persisted score to be traced to the exact weight table that produced it.
   */
  weightsVersion: string
}

/**
 * A DashaSlice augmented with the engine score and breakdown.
 * Persisted in the periodSlice JSONB column after Step 0d.
 */
export interface ScoredDashaSlice extends DashaSlice {
  score: number
  intensity: 'high' | 'medium' | 'low'
  favorable: boolean
  scoreBreakdown: ScoreBreakdown
}

/** A deterministic peak period entry (most favorable or most stressful). */
export interface PeakPeriod {
  /** Human-readable label, e.g. "Jupiter MD / Saturn AD (2024-03 – 2026-09)". */
  label: string
  /** Stable key for the period: "<mdLord>/<adLord>/<pdLord>/<pd.start>". */
  periodKey: string
  score: number
  /** Top-3 contributing factors by contribution magnitude (from ScoreBreakdown.factors). */
  topFactors: { factor: ScoringFactorKey; contribution: number }[]
}

// ─── Period Insights (deterministic UI digest) ────────────────────────
// A curated, human-readable digest of drishti / control / nakshatra drivers
// per period. Built by engine/durationAnalysis/periodInsights.ts as a pure
// SELECTION + LABELING pass over data already computed and returned in the
// /api/timeline payload (relationships.aspects/rashiAspects, nakshatraRelationships,
// jaimini.argala, lordAnnotations, scoreBreakdown). NO new astrology.
// Exists because the deterministic Duration Analyser UI has no LLM to interpret
// the raw relationship arrays the MCP path hands to Claude Desktop.

/** How a house relates to the active domain (from DOMAIN_SCORING_WEIGHTS). */
export type HouseRole = 'primary' | 'benefic' | 'malefic' | 'neutral'

/** A house tagged with its sign and domain role — used for control display. */
export interface TaggedHouse {
  house: number
  sign: string
  role: HouseRole
}

/** One graha-drishti (planetary aspect) cast BY a dasha lord. */
export interface DrishtiCast {
  /** Aspect type, e.g. '7th', 'jupiter_5th', 'saturn_10th'. */
  type: string
  toHouse: number
  toSign: string
  toRole: HouseRole
  toPlanets: string[]
  /** True when the aspected house is the domain's primary or benefic house. */
  ontoDomain: boolean
}

/** One graha-drishti RECEIVED by a dasha lord (who aspects it). */
export interface DrishtiReceived {
  from: string
  type: string
  /** True when the aspecting planet is a natural benefic. */
  benefic: boolean
}

/**
 * Control + drishti for one dasha lord WITHIN one divisional chart (varga) — e.g.
 * Saturn's placement and aspects inside D10 for a career reading. House numbers
 * are varga-relative (counted from that varga's own lagna), and domain-house
 * significance carries over by classical convention (10th of D10 = career
 * result, same as 10th of D1).
 */
export interface VargaDriver {
  division: number
  /** e.g. "D10 — Dashamsa". */
  name: string
  occupies: TaggedHouse | null
  owns: TaggedHouse[]
  /** This lord's varga-aspects landing on the domain's primary house(s), within this varga. */
  aspectsOntoPrimary: number[]
}

/** The full driver digest for one MD/AD/PD lord. */
export interface LordDriver {
  level: 'MD' | 'AD' | 'PD'
  lord: string
  // Condition
  dignity: string | null
  retrograde: boolean
  combust: boolean
  cazimi: boolean
  karakaRole: string | null
  /** True when this lord is one of the domain's relevantNaturalKarakas. */
  isNaturalKaraka: boolean
  // Control (D1)
  owns: TaggedHouse[]
  occupies: TaggedHouse | null
  // Drishti (D1)
  aspectsCast: DrishtiCast[]
  aspectsReceived: DrishtiReceived[]
  /** Domain primary houses reached by this lord's Jaimini rashi (sign) aspect. */
  rashiDrishtiOnDomain: number[]
  // Control + drishti within the domain's OTHER divisional charts (e.g. D9/D10 for
  // career, D6/D9 for health) — every division in categoryData.divisionalCharts
  // besides D1, which the main control/drishti fields above already cover.
  vargas: VargaDriver[]
  // Nakshatra
  nakshatra: string
  nakshatraLord: string
  subLord: string
  /** Nakshatra depositor chain (star-lord → its star-lord → …). */
  nakshatraChain: string[]
  /** The planet this lord is in nakshatra-parivartana (star exchange) with, if any. */
  starExchangeWith: string | null
  // Association
  conjunctWith: string[]
  /** The planet this lord is in rashi mutual reception (parivartana) with, if any. */
  parivartanaWith: string | null
}

/** Per-domain-house focus: who governs / occupies / aspects each key house. */
export interface DomainHouseFocus {
  house: number
  sign: string
  role: HouseRole
  lord: string | null
  /** The natal house the house-lord occupies. */
  lordHouse: number | null
  lordDignity: string | null
  occupants: string[]
  aspectedBy: { planet: string; type: string; benefic: boolean }[]
  argalaFrom: { house: number; planets: string[]; type: 'primary' | 'secondary' }[]
  bhavaBalaRupas: number | null
  /** Sarvashtakavarga bindus in this house's sign (0–8 per planet summed; typ. 25–35). */
  savBindu: number | null
}

/** Compact per-domain model surfaced to the UI (and MCP) so houses can be labeled. */
export interface DomainContext {
  category: DurationCategory
  primaryHouses: number[]
  beneficHouses: number[]
  maleficHouses: number[]
  primaryDivision: number
  relevantKarakaRoles: string[]
  relevantNaturalKarakas: string[]
  /** Special-point labels declared by the domain (key + selector, e.g. arudhaLagna/AL). */
  specialPoints: { key: string; selector: string }[]
}

/** The full per-period insight digest attached to each scored slice in the response. */
export interface PeriodInsights {
  lords: LordDriver[]
  domainHouseFocus: DomainHouseFocus[]
  karakaSummary: {
    naturalKarakas: string[]
    /** Which of the MD/AD/PD lords are the domain's natural karakas. */
    amongRunningLords: string[]
    /** Human label when a running lord matches a relevant Jaimini karaka role, else null. */
    karakaRoleMatch: string | null
  }
}

// ─── Domain Special Points ────────────────────────────────────────────

/** Declares a special point a domain needs, as registered in DOMAIN_SCORING_WEIGHTS. */
export interface DomainSpecialPointSpec {
  /** Key used in the injected chart data (e.g. 'upapadaLagna', 'ghatiLagna'). */
  key: string
  /** Which stored column this point is resolved from. */
  source: 'arudhaPadas' | 'specialLagnas' | 'karakas' | 'upagrahas'
  /** The abbreviation or identifier used to look up the entry (e.g. 'UL', 'GL', 'DK'). */
  selector: string
  /**
   * Primary omissions materially dent the Score_Breakdown confidence;
   * secondary omissions are recorded as footnotes only.
   */
  confidence: 'primary' | 'secondary'
}

/**
 * A resolved special point as injected into the chart data for a domain.
 * When the point was found in stored chart data, value is present and omitted is false.
 * When the point was declared but unavailable, omitted is true and value is undefined.
 */
export interface ResolvedSpecialPoint {
  key: string
  /** The resolved longitude / sign / house data, or undefined when omitted. */
  value?: unknown
  /** True when the point was declared by the domain but unavailable in this chart. */
  omitted: boolean
}

/** Map of all resolved special points for a domain (keyed by DomainSpecialPointSpec.key). */
export type DomainSpecialPoints = Record<string, ResolvedSpecialPoint>

// ─── Domain Scoring Weights ────────────────────────────────────────────
// Defined in engine/durationAnalysis/scoringWeights.ts; types live here for
// importability without creating a circular dependency.

/** Per-domain parameter table for the Scoring Engine. */
export interface DomainScoringWeights {
  category: DurationCategory
  /** Houses considered favorable for this domain (e.g. career: [1,2,6,9,10,11]). */
  beneficHouses: number[]
  /** Houses considered unfavorable for this domain. 6/8/12 also get the dusthana penalty. */
  maleficHouses: number[]
  /**
   * The domain's defining houses for domainHouseActivation and natalHouseStrength.
   * (e.g. marriage: [7], career: [10], wealth: [2,11])
   */
  primaryHouses: number[]
  /**
   * The single divisional chart (varga) canonical domain knowledge names as PRIMARY for this
   * domain (e.g. career: 10 = Dashamsa, marriage: 9 = Navamsa, health: 30 = Trimshamsa).
   * Used by divisionalChartStrength. Must be one of the numbers in the domain's
   * DOMAIN_AGENT_REGISTRY.divisions (registry.ts) — that's what makes the chart available.
   */
  primaryDivision: number
  /** Jaimini Chara Karaka abbreviations relevant to this domain (e.g. ['DK'] for marriage). */
  relevantKarakaRoles: string[]
  /** Natural significator planets for this domain (e.g. marriage: ['Venus','Jupiter']). */
  relevantNaturalKarakas: string[]
  /** Per-factor weights (weights need not sum to any fixed total). */
  weights: Record<ScoringFactorKey, number>
  /** Special points declared by this domain (resolved by extractor at runtime). */
  specialPoints: DomainSpecialPointSpec[]
  /**
   * Factors whose omission materially dents confidence (primary severity).
   * Missing primary factor → reducedConfidence = true in the breakdown.
   */
  primaryFactors: ScoringFactorKey[]
}

// ─── Scoring Chart Data ────────────────────────────────────────────────
// Thin scoring-focused view of the chart assembled by the extractor.
// Keeps the engine free of the full CategoryChartData prompt payload.

import type {
  ShadbalResult,
  BhavaBalaResult,
  CharaKaraka,
  AshtakavargaResult,
  PlanetPosition,
  JaiminiGeometry,
  DivisionalChart,
  RelationshipGeometry,
} from '@/engine/compute/types'

export interface ScoringChartData {
  category: DurationCategory
  /** Array-indexed ShadbalPlanet[]. Access with .find(p => p.planet === lord). */
  shadbala?: ShadbalResult | null
  /** Per-house Bhava Bala (total + rupas). */
  bhavaBala?: BhavaBalaResult | null
  /** Jaimini Chara Karaka assignments (karakaAbbr). */
  karakas?: CharaKaraka[] | null
  /**
   * Natal Sarvashtakavarga. `sav` is SIGN-indexed (sav[0] = Aries … sav[11] = Pisces),
   * NOT house-indexed — see engine/compute/ashtakavarga.ts. The scoring engine converts
   * each domain house → sign via the lagna before indexing (factorNatalHouseStrength).
   */
  ashtakavarga?: AshtakavargaResult | null
  /** Natal D1 planet positions — used for dignity, house ownership, mdAdRelationship. */
  planets?: PlanetPosition[] | null
  /** Jaimini geometry (argala / virodhaArgala) — used by argalaOnDomainHouse. */
  jaimini?: JaiminiGeometry | null
  /**
   * Domain-filtered divisional charts (per DOMAIN_AGENT_REGISTRY.divisions — already
   * filtered by extractCategoryData, e.g. career = [D9, D10]). Used by
   * divisionalChartStrength to read the domain's primaryDivision varga.
   */
  divisionalCharts?: DivisionalChart[] | null
  /** Natal relationship geometry — used by rashiDrishti (relationships.rashiAspects). */
  relationships?: RelationshipGeometry | null
  /** Domain special points resolved by the extractor. */
  specialPoints?: DomainSpecialPoints
}
