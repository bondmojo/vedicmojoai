/**
 * engine/constants.ts — Immutable constants for the VedicMojoAI pipeline.
 *
 * All astronomical, astrological, and pipeline configuration constants
 * are defined here. No magic numbers elsewhere in the codebase.
 */

import type { AgentId, Planet, QueryType } from '@/lib/types'

// ─── Astronomical Constants ─────────────────────────────────────────

/** Gregorian mean year in days. Single source of truth for dasha computation. */
export const YEAR_DAYS = 365.2425

/** Total Vimshottari cycle duration in years. */
export const TOTAL_DASHA_YEARS = 120

/** Each nakshatra spans this many degrees of the zodiac. */
export const NAKSHATRA_SPAN_DEG = 360 / 27 // 13.3333...

// ─── Nakshatra → Dasha Lord Mapping ─────────────────────────────────

export interface NakshatraInfo {
  index: number
  name: string
  lord: Planet
  years: number
}

/**
 * The 27 nakshatras in order, each with its ruling planet and
 * allocated Vimshottari dasha years. This sequence repeats 3 times
 * (starting at Ketu) to cover the full 120-year cycle.
 */
export const NAKSHATRAS: NakshatraInfo[] = [
  { index: 0, name: 'Ashwini', lord: 'Ketu', years: 7 },
  { index: 1, name: 'Bharani', lord: 'Venus', years: 20 },
  { index: 2, name: 'Krittika', lord: 'Sun', years: 6 },
  { index: 3, name: 'Rohini', lord: 'Moon', years: 10 },
  { index: 4, name: 'Mrigashira', lord: 'Mars', years: 7 },
  { index: 5, name: 'Ardra', lord: 'Rahu', years: 18 },
  { index: 6, name: 'Punarvasu', lord: 'Jupiter', years: 16 },
  { index: 7, name: 'Pushya', lord: 'Saturn', years: 19 },
  { index: 8, name: 'Ashlesha', lord: 'Mercury', years: 17 },
  { index: 9, name: 'Magha', lord: 'Ketu', years: 7 },
  { index: 10, name: 'Purva Phalguni', lord: 'Venus', years: 20 },
  { index: 11, name: 'Uttara Phalguni', lord: 'Sun', years: 6 },
  { index: 12, name: 'Hasta', lord: 'Moon', years: 10 },
  { index: 13, name: 'Chitra', lord: 'Mars', years: 7 },
  { index: 14, name: 'Swati', lord: 'Rahu', years: 18 },
  { index: 15, name: 'Vishakha', lord: 'Jupiter', years: 16 },
  { index: 16, name: 'Anuradha', lord: 'Saturn', years: 19 },
  { index: 17, name: 'Jyeshtha', lord: 'Mercury', years: 17 },
  { index: 18, name: 'Mula', lord: 'Ketu', years: 7 },
  { index: 19, name: 'Purva Ashadha', lord: 'Venus', years: 20 },
  { index: 20, name: 'Uttara Ashadha', lord: 'Sun', years: 6 },
  { index: 21, name: 'Shravana', lord: 'Moon', years: 10 },
  { index: 22, name: 'Dhanishtha', lord: 'Mars', years: 7 },
  { index: 23, name: 'Shatabhisha', lord: 'Rahu', years: 18 },
  { index: 24, name: 'Purva Bhadrapada', lord: 'Jupiter', years: 16 },
  { index: 25, name: 'Uttara Bhadrapada', lord: 'Saturn', years: 19 },
  { index: 26, name: 'Revati', lord: 'Mercury', years: 17 },
]

/**
 * Vimshottari dasha sequence: the order planets rule their mahadashas.
 * Starts from Ketu and cycles through all 9. Sum = 120 years.
 */
export const DASHA_SEQUENCE: { lord: Planet; years: number }[] = [
  { lord: 'Ketu', years: 7 },
  { lord: 'Venus', years: 20 },
  { lord: 'Sun', years: 6 },
  { lord: 'Moon', years: 10 },
  { lord: 'Mars', years: 7 },
  { lord: 'Rahu', years: 18 },
  { lord: 'Jupiter', years: 16 },
  { lord: 'Saturn', years: 19 },
  { lord: 'Mercury', years: 17 },
]

/** Map planet → dasha years for quick lookup. */
export const DASHA_YEARS: Record<Planet, number> = {
  Ketu: 7,
  Venus: 20,
  Sun: 6,
  Moon: 10,
  Mars: 7,
  Rahu: 18,
  Jupiter: 16,
  Saturn: 19,
  Mercury: 17,
}

// ─── Planner: Domain → Agent Mapping ────────────────────────────────

/**
 * Maps each query type to the Wave 2/3 agents that should run.
 * Wave 1 and Wave 4 are handled separately (always-run or sequential).
 */
export const DOMAIN_AGENTS: Record<QueryType, AgentId[]> = {
  health: ['2E', '3C'],
  wealth: ['2A', '2C', '3A', '3B'],
  career: ['2A', '2F', '3A', '3C'],
  property: ['2A', '2D', '3A'],
  marriage: ['2A', '2G', '3C'],
  generic: ['2A', '2B', '2C', '2E', '2F', '3A', '3C'],
  full: ['2A', '2B', '2C', '2D', '2E', '2F', '2G', '3A', '3B', '3C', '3D'],
}

/**
 * Agents that ALWAYS run on the first query for a chart.
 * Does NOT apply to follow-up queries.
 */
export const ALWAYS_RUN_FIRST_QUERY: AgentId[] = [
  '1A', '1B', '1C', '1D', '2B', '4X', '4A', '4B', '4C',
]

/** Wave 4 agents in execution order (strictly sequential). */
export const WAVE4_SEQUENCE: AgentId[] = ['4X', '4A', '4B', '4C']

// ─── Agent Metadata ─────────────────────────────────────────────────

export interface AgentMeta {
  id: AgentId
  name: string
  wave: number
  domain: string
  promptFile: string
}

/** Complete agent catalogue with metadata for each pipeline agent. */
export const AGENT_CATALOGUE: AgentMeta[] = [
  { id: '1A', name: 'Chart Extraction', wave: 1, domain: 'foundation', promptFile: 'wave1_1a_extraction.md' },
  { id: '1B', name: 'Nakshatra Analysis', wave: 1, domain: 'foundation', promptFile: 'wave1_1b_nakshatra.md' },
  { id: '1C', name: 'Bala Deep Audit', wave: 1, domain: 'foundation', promptFile: 'wave1_1c_bala.md' },
  { id: '1D', name: 'Relationship Geometry', wave: 1, domain: 'foundation', promptFile: 'wave1_1d_relationships.md' },
  { id: '2A', name: 'Yoga Detection', wave: 2, domain: 'cross_domain', promptFile: 'wave2_2a_yogas.md' },
  { id: '2B', name: 'Ashtakavarga Analysis', wave: 2, domain: 'cross_domain', promptFile: 'wave2_2b_ashtakavarga.md' },
  { id: '2C', name: 'Wealth Analysis', wave: 2, domain: 'wealth', promptFile: 'wave2_2c_wealth.md' },
  { id: '2D', name: 'Property Analysis', wave: 2, domain: 'property', promptFile: 'wave2_2d_property.md' },
  { id: '2E', name: 'Health Analysis', wave: 2, domain: 'health', promptFile: 'wave2_2e_health.md' },
  { id: '2F', name: 'Career Analysis', wave: 2, domain: 'career', promptFile: 'wave2_2f_career.md' },
  { id: '2G', name: 'Marriage & Relationships', wave: 2, domain: 'marriage', promptFile: 'wave2_2g_marriage.md' },
  { id: '3A', name: 'Cashflow Timeline', wave: 3, domain: 'wealth', promptFile: 'wave3_3a_cashflow.md' },
  { id: '3B', name: 'Financial Freedom', wave: 3, domain: 'wealth', promptFile: 'wave3_3b_freedom.md' },
  { id: '3C', name: 'Cross-Channel Synthesis', wave: 3, domain: 'cross_domain', promptFile: 'wave3_3c_crosschannel.md' },
  { id: '3D', name: 'Lagna Lord Deep Dive', wave: 3, domain: 'cross_domain', promptFile: 'wave3_3d_lagnalord.md' },
  { id: '4X', name: 'Fact Consolidation', wave: 4, domain: 'synthesis', promptFile: 'wave4_4x_consolidation.md' },
  { id: '4A', name: 'Error Detection', wave: 4, domain: 'validation', promptFile: 'wave4_4a_errors.md' },
  { id: '4B', name: 'Validation', wave: 4, domain: 'validation', promptFile: 'wave4_4b_validation.md' },
  { id: '4C', name: 'Final Synthesis', wave: 4, domain: 'synthesis', promptFile: 'wave4_4c_synthesis.md' },
  { id: 'verification', name: 'Continuity Verification', wave: 5, domain: 'validation', promptFile: 'verification.md' },
]

// ─── Sign Constants ─────────────────────────────────────────────────

/** Sign name → sign number (1-indexed). */
export const SIGN_NUMBER: Record<string, number> = {
  Aries: 1, Taurus: 2, Gemini: 3, Cancer: 4, Leo: 5, Virgo: 6,
  Libra: 7, Scorpio: 8, Sagittarius: 9, Capricorn: 10, Aquarius: 11, Pisces: 12,
}

/** Sign number → sign name. */
export const NUMBER_TO_SIGN: Record<number, string> = {
  1: 'Aries', 2: 'Taurus', 3: 'Gemini', 4: 'Cancer', 5: 'Leo', 6: 'Virgo',
  7: 'Libra', 8: 'Scorpio', 9: 'Sagittarius', 10: 'Capricorn', 11: 'Aquarius', 12: 'Pisces',
}

/**
 * Yogakaraka planets for each lagna.
 * Null = no yogakaraka for this lagna (Aries, Gemini, Virgo, Scorpio, Sagittarius, Pisces).
 */
export const YOGAKARAKA: Record<string, Planet | null> = {
  Aries: null,
  Taurus: 'Saturn',
  Gemini: null,
  Cancer: 'Mars',
  Leo: 'Mars',
  Virgo: null,
  Libra: 'Saturn',
  Scorpio: null,
  Sagittarius: null,
  Capricorn: 'Venus',
  Aquarius: 'Venus',
  Pisces: null,
}
