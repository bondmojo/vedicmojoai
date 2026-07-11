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

export type DurationStatus =
  | 'queued'
  | 'running'
  | 'symptom_unmatched'
  | 'done'
  | 'failed'
  | 'cancelled' // practitioner cancelled (gate or mid-run); pipeline unwinds cooperatively

export type DurationAgentId = 'DA-1' | 'DA-2' | 'DA-3'

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
  shadbala?: unknown         // per DOMAIN_AGENT_REGISTRY extraColumns
  divisionalCharts?: unknown[] // per DOMAIN_AGENT_REGISTRY divisions (e.g. career = D9 + D10)
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
