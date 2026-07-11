/**
 * lib/types.ts — Shared TypeScript type definitions for VedicMojoAI.
 *
 * This file defines the complete type system used across the analysis pipeline,
 * from chart input through agent processing to final report output.
 */

// ─── Enums / Literal Types ──────────────────────────────────────────

/** The 12 zodiac signs in Vedic astrology. */
export type Sign =
  | 'Aries' | 'Taurus' | 'Gemini' | 'Cancer' | 'Leo' | 'Virgo'
  | 'Libra' | 'Scorpio' | 'Sagittarius' | 'Capricorn' | 'Aquarius' | 'Pisces'

/** The 9 classical Vedic planets (Navagraha). */
export type Planet = 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn' | 'Rahu' | 'Ketu'

/** Client gender — affects karaka selection in marriage analysis (2G). */
export type Gender = 'male' | 'female' | 'other'

/** The type of astrological query, determining which agents are executed. */
export type QueryType = 'generic' | 'health' | 'wealth' | 'career' | 'property' | 'marriage' | 'full'

/** Unique identifier for each agent in the pipeline. */
export type AgentId =
  | '1A' | '1B' | '1C' | '1D'
  | '2A' | '2B' | '2C' | '2D' | '2E' | '2F' | '2G'
  | '3A' | '3B' | '3C' | '3D'
  | '4X' | '4A' | '4B' | '4C'
  | 'verification'

/** Status of an entire analysis run. */
export type RunStatus = 'queued' | 'running' | 'done' | 'failed' | 'halted_for_review'

/** Status of an individual wave's output. */
export type WaveOutputStatus = 'running' | 'done' | 'failed' | 'skipped'

/** Domain classification for agent outputs. */
export type Domain =
  | 'foundation' | 'health' | 'wealth' | 'career'
  | 'marriage' | 'property' | 'cross_domain' | 'validation' | 'synthesis'

// ─── Chart Meta ─────────────────────────────────────────────────────

/** Metadata about the chart and the client. */
export interface ChartMeta {
  /** Display name for the client. Used in report filenames and UI. */
  client_name: string
  /** ISO 8601 datetime with timezone. Anchors the computed dasha tree. */
  birth_datetime: string
  /** Free-text birth location. For report display; not used in computation. */
  birth_place?: string
  /** Gender affects karaka selection in marriage agent (Venus vs Jupiter). */
  gender?: Gender
  /** Must be "Vedic (Jyotish) — Lahiri Ayanamsha" for V1. */
  system: string
  /** The ascendant sign name. */
  lagna_sign: Sign
  /** Lagna degree within its sign (0–30, decimal). */
  lagna_degree_decimal: number
  /** Lagna nakshatra name. */
  lagna_nakshatra?: string
  /** Lagna pada (1–4). */
  lagna_pada?: number
  /** Source description for provenance tracking. */
  source?: string
}

// ─── Natal Nakshatras (Planet Positions) ────────────────────────────

/** Position data for a single planet in the natal chart. */
export interface NatalPlanet {
  /** Planet name. All 9 classical bodies required. */
  body: Planet
  /** Sign the planet occupies in D1. */
  sign: Sign
  /** Sign number (1=Aries … 12=Pisces). */
  sign_no: number
  /** House number from lagna (1–12). */
  house: number
  /** Degree in DMS string format, e.g. "14°12'". */
  degree: string
  /** Degree as decimal within sign (0–30). Critical for dasha computation (Moon). */
  degree_decimal: number
  /** Nakshatra name. */
  nakshatra: string
  /** Nakshatra pada (1–4). */
  pada: number
  /** Free-text notes: "R" for retrograde, karaka labels, dignity notes. */
  notes?: string
}

// ─── Divisional Charts ──────────────────────────────────────────────

/** A single house in a divisional chart. */
export interface DivisionalHouse {
  /** House number (1–12). */
  house: number
  /** Sign occupying this house. */
  sign: Sign
  /** Planet names in this house (may include "As" for lagna marker). */
  occupants: string[]
}

/** A complete divisional chart (D1, D4, D9, D10, D30, D7). */
export interface DivisionalChart {
  /** Chart identifier, e.g. "D9 Navamsa". */
  name: string
  /** Divisional chart lagna sign. */
  lagna?: Sign
  /** Lagna sign number (1–12). */
  lagna_sign_no?: number
  /** Exactly 12 house entries. */
  houses: DivisionalHouse[]
}

// ─── Shadbala ───────────────────────────────────────────────────────

/** The six strength components of Shadbala. */
export interface ShadbalaSixComponents {
  sthana: number
  dig: number
  kala: number
  cheshta: number
  naisargika: number
  drig: number
}

/** Shadbala strength data for a single planet. */
export interface ShadbalaEntry {
  /** Planet name (some samples use "planet", others "body"). */
  planet?: string
  /** Alias for planet name. Schema accepts either. */
  body?: string
  /** Total Shadbala in virupas. Null for Rahu/Ketu. */
  total_shadbala_virupas?: number | null
  /** Alias — vedic_chart_FINAL uses "total". */
  total?: number | null
  /** Required minimum virupas for this planet. */
  required?: number | null
  /** Alias for required. */
  required_virupas?: number | null
  /** Percentage of required (e.g. "142.3%" or numeric). */
  percent?: string | null
  /** Ratio alias (djma uses "ratio"). */
  ratio?: number | null
  /** Grade classification: "Strong" | "Weak" | null (for nodes). */
  grade?: string | null
  /** The six strength components. */
  six_balas?: ShadbalaSixComponents
  /** Alias for six_balas (djma uses "components"). */
  components?: ShadbalaSixComponents
  /** Ishta Phala (0–60). */
  ishta?: number | null
  /** Kashta Phala (0–60). */
  kashta?: number | null
  /** Additional notes (e.g., for nodes). */
  notes?: string | null
}

// ─── Ashtakavarga ───────────────────────────────────────────────────

/** Bindus for a single sign in Ashtakavarga. */
export interface SignBindu {
  /** Sign number (1–12). */
  sign_no: number
  /** Sign name. */
  sign: Sign
  /** Bindu points (0–8 for BAV; 0–56 for SAV). */
  points: number
}

/** SAV indexed by house (djma format). */
export interface SarvashtakavargaByHouse {
  house: number
  sign: Sign
  bindus: number
}

/** Individual planet's Bhinna Ashtakavarga. */
export interface PlanetAV {
  planet: string
  by_sign: SignBindu[]
}

/** Pinda strength entry for a planet. */
export interface PindaStrengthEntry {
  body: string
  rasi_pinda: number
  graha_pinda: number
  sodhya_pinda: number
  strength_pct: number
}

/** Complete Ashtakavarga data — accepts multiple format variants. */
export interface Ashtakavarga {
  /** SAV indexed by sign. */
  sarvashtakavarga?: { total: number; by_sign: SignBindu[] }
  /** SAV indexed by house (djma format). */
  sarvashtakavarga_by_house?: SarvashtakavargaByHouse[]
  /** Pre-computed SAV total. */
  sav_total?: number
  /** Individual planet BAV data. */
  individual_planet_av?: PlanetAV[]
  /** Pinda strength data. */
  pinda_strength?: PindaStrengthEntry[]
}

// ─── Root Schema: ChartInputV1 ──────────────────────────────────────

/**
 * ChartInputV1 — the validated contract for chart submission.
 * All agents consume data derived from this structure.
 * The engine computes the Vimshottari dasha tree from meta.birth_datetime
 * + the Moon's natal_nakshatras entry — it is NOT required as input.
 */
export interface ChartInputV1 {
  /** Chart and client metadata. */
  meta: ChartMeta
  /** Exactly 9 entries (Sun–Ketu) with natal positions. */
  natal_nakshatras: NatalPlanet[]
  /** Divisional charts — 5 required, 1 optional. */
  divisional_charts: {
    D1_Rasi: DivisionalChart
    D4_Chaturthamsa: DivisionalChart
    D9_Navamsa: DivisionalChart
    D10_Dasamsa: DivisionalChart
    D30_Trimshamsa: DivisionalChart
    D7_Saptamsa?: DivisionalChart
  }
  /** Shadbala data — minimum 7 entries (classical planets). */
  shadbala: ShadbalaEntry[]
  /** Ashtakavarga data — SAV minimum required. */
  ashtakavarga: Ashtakavarga
  /** Legacy dasha input — stored for audit, ignored by agents. */
  vimshottari_dasha?: Record<string, unknown>
  /** Special lagnas (Sree, Hora, Upapada, etc.). */
  special_lagnas?: {
    name: string
    sign: Sign
    sign_no?: number
    house?: number
    degree?: string | null
    degree_decimal?: number | null
    notes?: string
  }[]
  /** Karaka assignments (AK, AmK, etc.). */
  karakas?: {
    type?: string
    role?: string
    planet: string
    degree?: string | null
    degree_decimal?: number | null
    sign?: Sign | null
    signification?: string | null
    notes?: string | null
  }[]
  /** Chara Karaka sequence with degrees. */
  karakas_chara?: {
    sequence: {
      rank: number
      role: string
      planet: string
      degree_in_sign: number
      note?: string
    }[]
    note?: string
  }
  /** Sub-planets (Gulika, Maandi, etc.). */
  upagrahas?: {
    name: string
    sign: Sign
    sign_no: number
    degree?: string
    degree_decimal?: number
    house?: number
  }[]
  /** Nakshatra-based directional analysis. */
  nakshatra_disha?: { body: string; nakshatra: string; direction: string }[]
  /** Saturn transit data (time-dependent). */
  saturn_transits?: Record<string, unknown>
  /** Varna chart lagna signs (D2, D3, D7). */
  varna_charts?: { varga: string; signification: string; lagna_sign: Sign; note?: string }[]
  /** Non-classical outer planets notes. */
  outer_planets_note?: Record<string, unknown>
}

// ─── Dasha Tree Types ───────────────────────────────────────────────

/** Pratyantardasha (sub-sub-period). */
export interface PratyanDasha {
  lord: Planet
  start: Date
  end: Date
  duration_days: number
}

/** Antardasha (sub-period) within a Mahadasha. */
export interface AntarDasha {
  lord: Planet
  start: Date
  end: Date
  duration_days: number
  pratyantardashas: PratyanDasha[]
}

/** Mahadasha (major period) — top level of the dasha tree. */
export interface MahaDasha {
  lord: Planet
  start: Date
  end: Date
  duration_days: number
  antardashas: AntarDasha[]
}

/** Complete Vimshottari dasha tree computed from Moon's position. */
export interface DashaTree {
  /** Remaining balance of the birth dasha (in years). */
  balance_years: number
  /** Ordered sequence of Mahadashas covering the full 120-year cycle. */
  mahadashas: MahaDasha[]
}

// ─── Pipeline Types ─────────────────────────────────────────────────

/** Alert generated during pre-analysis rule checking. */
export interface PreAnalysisAlert {
  /** Numeric rule identifier. */
  rule_id: number
  /** Human-readable rule name. */
  rule_name: string
  /** Alert severity level. */
  severity: 'info' | 'warning' | 'critical'
  /** Description of the issue or recommendation. */
  message: string
  /** Planets affected by this alert. */
  affected_planets?: Planet[]
  /** Houses affected by this alert. */
  affected_houses?: number[]
}

/** Execution plan generated by the orchestrator for a query. */
export interface ExecutionPlan {
  /** Ordered list of agents to execute. */
  agents: AgentId[]
  /** Explanation of why this plan was chosen. */
  rationale: string
  /** Query types that triggered this plan. */
  query_types: QueryType[]
  /** Whether this is a follow-up to a previous analysis. */
  is_followup: boolean
  /** Wave numbers skipped for this query type. */
  skipped_waves: number[]
}

/** Options for making an LLM API call. */
export interface LLMCallOptions {
  /** Model identifier (e.g., "claude-3-5-sonnet-20241022"). */
  model: string
  /** LLM provider. */
  provider: 'anthropic' | 'openai' | 'google'
  /** Complete prompt to send (the volatile part when cachedPrefix is set). */
  prompt: string
  /** Sampling temperature (0–1). */
  temperature: number
  /** Maximum output tokens. */
  maxTokens: number
  /**
   * Optional stable prompt prefix sent BEFORE `prompt`. On Anthropic it is
   * marked with cache_control (ephemeral) so byte-identical prefixes across
   * calls hit the prompt cache; on other providers it is simply prepended
   * (OpenAI caches long repeated prefixes automatically server-side).
   */
  cachedPrefix?: string
  /**
   * Optional per-call API key override. When set, it is used instead of the
   * provider's environment key (ANTHROPIC_API_KEY / OPENAI_API_KEY). Used
   * transiently — never persisted. Falls back to the env key when omitted.
   */
  apiKey?: string
}

/** Response from an LLM API call. */
export interface LLMResponse {
  /** Raw text content from the model. */
  content: string
  /** Input token count. */
  tokenIn: number
  /** Output token count. */
  tokenOut: number
  /** Estimated cost in USD. */
  costUsd: number
}

/** Structured output from a single agent execution. */
export interface AgentOutput {
  /** Which agent produced this output. */
  agent_id: AgentId
  /** Domain classification of the output. */
  domain: Domain
  /** Agent version string. */
  version: string
  /** Core findings from the agent's analysis. */
  findings: Record<string, unknown>
  /** Numeric scores (e.g., health_score, wealth_score). */
  scores?: Record<string, number>
  /** Timing predictions tied to dasha periods. */
  timing?: { lord: Planet; start: string; end: string; description: string }[]
  /** Flags for cross-agent communication. */
  flags?: string[]
}

/** Server-Sent Event emitted during pipeline execution. */
export interface SSEEvent {
  /** Event type for client-side routing. */
  type: 'agent_start' | 'agent_complete' | 'agent_error' | 'run_complete' | 'critical_error' | 'token_count'
  /** Agent that triggered this event. */
  agent_id?: AgentId
  /** Wave number (1–4) associated with this event. */
  wave_number?: number
  /** Event-specific payload. */
  data?: Record<string, unknown>
  /** ISO 8601 timestamp of the event. */
  timestamp: string
}

// ─── Error Detection Types (Wave 4A output) ─────────────────────────

/** Result of Wave 4A error detection across all agent outputs. */
export interface ErrorDetectionResult {
  /** List of errors found during cross-validation. */
  errors_found: {
    /** Name of the check that identified the error. */
    check: string
    /** Human-readable error description. */
    description: string
    /** Location in the output data. */
    location: string
    /** Error severity classification. */
    severity: 'minor' | 'moderate' | 'critical'
    /** Which waves are affected. */
    affects_waves: number[]
    /** Suggested correction. */
    correction_suggestion: string
  }[]
  /** Count of critical errors. */
  critical_errors: number
  /** Count of moderate errors. */
  moderate_errors: number
  /** Count of minor errors. */
  minor_errors: number
}

// ─── Validation Types (Wave 4B output) ──────────────────────────────

/** Result of Wave 4B cross-validation and confidence scoring. */
export interface ValidationResult {
  /** Per-finding confidence assessment. */
  confidence_matrix: {
    /** The finding being assessed. */
    finding: string
    /** Domain of the finding. */
    domain: Domain
    /** Confidence score (0–1). */
    confidence: number
    /** Whether the finding was verified by multiple agents. */
    cross_verified: boolean
    /** Agents that contributed to this finding. */
    source_agents: AgentId[]
  }[]
  /** Aggregate confidence score across all findings (0–1). */
  overall_confidence: number
}
