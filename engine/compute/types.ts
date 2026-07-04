/**
 * engine/compute/types.ts — Types for the chart computation engine.
 */

export interface BirthInput {
  /** Date of birth as ISO string or 'YYYY-MM-DD' */
  date: string
  /** Time of birth as 'HH:MM:SS' (24h format) */
  time: string
  /** Timezone offset in hours (e.g., +5.5 for IST) */
  timezone: number
  /** Geographic latitude (positive = North, negative = South) */
  latitude: number
  /** Geographic longitude (positive = East, negative = West) */
  longitude: number
  /** Client name (optional) */
  name?: string
}

export interface PlanetPosition {
  planet: string
  /** Sidereal longitude 0–360 */
  longitude: number
  /** Latitude */
  latitude: number
  /** Daily speed in longitude (negative = retrograde) */
  speed: number
  /** Is retrograde */
  retrograde: boolean
  /** Zodiac sign name */
  sign: string
  /** Sign number (1=Aries ... 12=Pisces) */
  signNumber: number
  /** Degree within sign (0–30) */
  degreeInSign: number
  /** House number in D1 (whole sign from lagna) */
  house: number
}

export interface NakshatraInfo {
  planet: string
  nakshatra: string
  nakshatraIndex: number
  pada: number
  nakshatraLord: string
  /** Degree within nakshatra (0–13.333) */
  degreeInNakshatra: number
}

export interface DivisionalPlacement {
  planet: string
  /** Sign in the divisional chart */
  sign: string
  signNumber: number
  /** House from divisional lagna */
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
}

export interface CharaKaraka {
  planet: string
  karaka: string
  karakaAbbr: string
  degreeInSign: number
}

export interface AshtakavargaResult {
  /** Bhinnashtakavarga: per-planet bindus for each sign (planet → 12 values) */
  bav: Record<string, number[]>
  /** Sarvashtakavarga: total bindus per sign (12 values, index 0=Aries) */
  sav: number[]
  /** Total SAV points */
  savTotal: number
}

export interface ComputedChart {
  /** Input data echoed back */
  input: BirthInput
  /** Julian Day (UT) */
  julianDay: number
  /** Ayanamsa value used (Lahiri) */
  ayanamsa: number
  /** Ascendant (lagna) sign */
  lagna: string
  lagnaSignNumber: number
  lagnaLongitude: number
  lagnaDegreeInSign: number
  /** Planet positions in D1 */
  planets: PlanetPosition[]
  /** Nakshatra details for all planets */
  nakshatras: NakshatraInfo[]
  /** Divisional charts */
  divisionalCharts: DivisionalChart[]
  /** Chara Karakas */
  charaKarakas: CharaKaraka[]
  /** Ashtakavarga */
  ashtakavarga: AshtakavargaResult
}
