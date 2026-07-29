/**
 * Shared types for chart components.
 */

export interface ChartPlanet {
  planet: string
  signNumber: number
  house: number
  retrograde?: boolean
  /**
   * Panchadha-maitri dignity label in this varga (exalted/debilitated/
   * moolatrikona/own/great_friend/friend/neutral/enemy/great_enemy).
   * Absent for Rahu/Ketu. See engine/compute/dignity.ts.
   */
  dignity?: string
  /** True when the planet occupies the same sign here as in D1 (vargottama). */
  vargottama?: boolean
}

export interface ArudhaPada {
  abbr: string
  signNumber: number
  house_in_chart: number
}

export interface SpecialLagna {
  abbr: string
  signNumber: number
  house: number
}

export interface Upagraha {
  abbr: string
  signNumber: number
  house: number
}

export interface ChartData {
  lagna: string
  lagnaSignNumber: number
  division: number
  name: string
  shortName: string
  planets: ChartPlanet[]
  /** Only used on D1 */
  arudhaPadas?: ArudhaPada[]
  specialLagnas?: SpecialLagna[]
  upagrahas?: Upagraha[]
}

export const PLANET_ABBR: Record<string, string> = {
  Sun: 'Su', Moon: 'Mo', Mars: 'Ma', Mercury: 'Me',
  Jupiter: 'Ju', Venus: 'Ve', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke',
}

export const PLANET_COLORS: Record<string, string> = {
  Sun: '#000000',
  Moon: '#000000',
  Mars: '#000000',
  Mercury: '#000000',
  Jupiter: '#000000',
  Venus: '#000000',
  Saturn: '#000000',
  Rahu: '#000000',
  Ketu: '#000000',
}

export const SIGNS_SHORT = ['Ari','Tau','Gem','Can','Leo','Vir','Lib','Sco','Sag','Cap','Aqu','Pis']

/** One-letter dignity marker shown after the planet abbreviation (e.g. "Ju+", "Sa-"). */
const DIGNITY_MARKER: Record<string, string> = {
  exalted: '++',
  moolatrikona: '+',
  own: '+',
  great_friend: '',
  friend: '',
  neutral: '',
  enemy: '',
  great_enemy: '-',
  debilitated: '--',
}

/**
 * Suffix appended to a planet's cell label to show dignity/vargottama, mirroring
 * the existing `(abbr)` retrograde convention:
 *  - "^" for vargottama (same sign as D1) — a strong dignity in its own right.
 *  - "+"/"++" for own/moolatrikona/exalted, "-"/"--" for enemy-tier/debilitated.
 * Neutral/friend/great_friend get no suffix to keep charts readable.
 */
export function dignitySuffix(dignity?: string, vargottama?: boolean): string {
  const marker = dignity ? (DIGNITY_MARKER[dignity] ?? '') : ''
  return marker + (vargottama ? '^' : '')
}
