/**
 * engine/compute/types.ts — Types for the chart computation engine.
 */

export interface BirthInput {
  date: string
  time: string
  timezone: number
  latitude: number
  longitude: number
  name?: string
  /**
   * Controls the sunrise reference point used for time-based special lagnas
   * (Bhava/Hora/Ghati Lagna, Varnada, Kunda, Pranapada):
   *
   *   "precise" — uses real astronomical sunrise via Swiss Ephemeris.
   *               Astronomically accurate; may differ from software like
   *               Jagannatha Hora that uses the simplified convention.
   *
   *   "jhora"   — uses a fixed 6:00 AM local time as sunrise, matching
   *               the convention used by Jagannatha Hora (PVR Narasimha Rao).
   *               Useful for cross-verification against JHora charts.
   *
   * Defaults to "precise".
   */
  sunriseMode?: 'precise' | 'jhora'
}

export interface PlanetPosition {
  planet: string
  longitude: number
  latitude: number
  speed: number
  retrograde: boolean
  sign: string
  signNumber: number
  degreeInSign: number
  house: number
}

export interface NakshatraInfo {
  planet: string
  nakshatra: string
  nakshatraIndex: number
  pada: number
  nakshatraLord: string
  degreeInNakshatra: number
}

export interface DivisionalPlacement {
  planet: string
  sign: string
  signNumber: number
  house: number
  retrograde?: boolean
}

/** An arudha pada as placed within a specific chart (for display). */
export interface ChartArudhaMark {
  abbr: string
  signNumber: number
  house_in_chart: number
}

/** A special lagna / upagraha as placed within a specific chart (for display). */
export interface ChartPointMark {
  abbr: string
  signNumber: number
  house: number
}

export interface DivisionalChart {
  division: number
  name: string
  shortName: string
  lagna: string
  lagnaSignNumber: number
  lagnaDegreee: number
  planets: DivisionalPlacement[]
  /** Arudha padas computed within this varga (A1–A12). */
  arudhaPadas?: ChartArudhaMark[]
  /** Special lagnas projected into this varga. */
  specialLagnas?: ChartPointMark[]
  /** Upagrahas projected into this varga. */
  upagrahas?: ChartPointMark[]
}

export interface CharaKaraka {
  planet: string
  karaka: string
  karakaAbbr: string
  degreeInSign: number
}

export interface AshtakavargaResult {
  bav: Record<string, number[]>
  sav: number[]
  savTotal: number
}

// ─── New types ───────────────────────────────────────────────────────

export interface Upagraha {
  name: string
  abbr: string
  longitude: number
  sign: string
  signNumber: number
  degreeInSign: number
  house: number
}

export interface SpecialLagna {
  name: string
  abbr: string
  longitude: number
  sign: string
  signNumber: number
  degreeInSign: number
  house: number
}

export interface ArudhaPada {
  house: number
  name: string
  abbr: string
  signNumber: number
  sign: string
  house_in_chart: number
}

export interface PindaStrengthEntry {
  planet: string
  uchcha_bala: number
  sapta_varga_bala: number
  ojha_yugma_bala: number
  kendradi_bala: number
  drekana_bala: number
  total: number
  pct: number
  grade: string
}

export interface TransitPlanet {
  planet: string
  longitude: number
  sign: string
  signNumber: number
  degreeInSign: number
  retrograde: boolean
  houseFromMoon: number
  houseFromLagna: number
}

export interface SadeSatiPeriod {
  phase: 'rising' | 'peak' | 'setting'
  phaseSign: string
  startApprox: string
  endApprox: string
  isCurrent: boolean
}

export interface SadeSatiInfo {
  active: boolean
  phase: 'rising' | 'peak' | 'setting' | null
  saturnSignNumber: number
  natalMoonSignNumber: number
  description: string
  allPeriods: SadeSatiPeriod[]
}

export interface MoonTransitPeriod {
  signNumber: number
  sign: string
  entryDate: string
  exitDate: string
  isCurrent: boolean
  houseFromMoon: number
}

export interface AscendantTransitPeriod {
  signNumber: number
  sign: string
  entryDate: string
  exitDate: string
  isCurrent: boolean
  houseFromLagna: number
}

export interface TransitAnalysis {
  asOf: string
  transits: TransitPlanet[]
  sadeSati: SadeSatiInfo
  ashtamaShani: boolean
  kantakaShani: boolean
  currentMoonSign: string
  natalMoonSign: string
  moonTransitSameAsNatal: boolean
  moonTransits: MoonTransitPeriod[]
  ascendantTransits: AscendantTransitPeriod[]
}

// ─── Full chart result ───────────────────────────────────────────────

export interface ComputedChart {
  input: BirthInput
  sunriseMode: 'precise' | 'jhora'
  /** true when precise sunrise was requested but swe_rise_trans failed — 6 AM was used instead */
  sunriseFallback: boolean
  julianDay: number
  ayanamsa: number
  lagna: string
  lagnaSignNumber: number
  lagnaLongitude: number
  lagnaDegreeInSign: number
  planets: PlanetPosition[]
  nakshatras: NakshatraInfo[]
  divisionalCharts: DivisionalChart[]
  charaKarakas: CharaKaraka[]
  ashtakavarga: AshtakavargaResult
  upagrahas: Upagraha[]
  specialLagnas: SpecialLagna[]
  arudhaPadas: ArudhaPada[]
  pindaStrength: PindaStrengthEntry[]
  transits: TransitAnalysis
}
