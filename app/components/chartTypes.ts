/**
 * Shared types for chart components.
 */

export interface ChartPlanet {
  planet: string
  signNumber: number
  house: number
  retrograde?: boolean
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
  Sun: '#f97316',     // orange
  Moon: '#94a3b8',    // slate
  Mars: '#ef4444',    // red
  Mercury: '#22c55e', // green
  Jupiter: '#eab308', // yellow
  Venus: '#ec4899',   // pink
  Saturn: '#60a5fa',  // blue
  Rahu: '#9ca3af',    // gray
  Ketu: '#a855f7',    // purple
}

export const SIGNS_SHORT = ['Ari','Tau','Gem','Can','Leo','Vir','Lib','Sco','Sag','Cap','Aqu','Pis']
