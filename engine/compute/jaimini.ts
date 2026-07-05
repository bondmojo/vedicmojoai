/**
 * engine/compute/jaimini.ts — Jaimini / Sanketa-Nidhi geometry (Scope C).
 *
 * Pure geometry derived from the D1 planet positions and special lagnas:
 *
 *   - argala / virodhaArgala : intervention (argala) and counter-intervention
 *   - yogiPoint / avayogiPoint: Yogi & Avayogi sensitive points
 *   - specialLagnaAspects     : rashi (sign) aspects cast by each special lagna
 *   - lordRelationshipMap     : kendra/trikona substrate between D1 house lords
 *
 * Spec: .kiro/specs/deterministic-1c-1d/  (SCOPE FINALIZED — Jaimini module)
 *
 * SCHOOL-CHOICE APPROXIMATIONS (documented per the spec):
 *   • Yogi point: computed as Sun + Moon + 93°20' (93.3333°). Several published
 *     schools use exactly this constant; others add the value to the start of a
 *     specific nakshatra. We use the additive-longitude convention. The Avayogi
 *     is taken 186°40' (186.6667°) onward from the Yogi, the standard offset.
 *   • Argala: primary argala from the 2nd / 4th / 11th, secondary from the 5th.
 *     Some texts also treat planets in the 5th as primary and add 3rd-house
 *     argala from malefics; we model the common 2/4/11 (+5 secondary) scheme.
 *   • Virodha argala counters map 12→2, 10→4, 3→11, 9→5 (the classical pairs).
 */

import type {
  JaiminiGeometry,
  ArgalaEntry,
  VirodhaArgalaEntry,
  PlanetPosition,
  SpecialLagna,
} from './types'
import { RASHI_ASPECT_MATRIX, normLon } from './relationships'
import { getNakshatraIndex, getNakshatraName, getNakshatraLord } from './nakshatras'

// Argala-causing houses counted FROM the target sign.
const ARGALA_PRIMARY = [2, 4, 11]
const ARGALA_SECONDARY = [5]

// Virodha (counter) argala: house that counters → the argala house it neutralizes.
const VIRODHA_MAP: { counter: number; neutralizes: number }[] = [
  { counter: 12, neutralizes: 2 },
  { counter: 10, neutralizes: 4 },
  { counter: 3, neutralizes: 11 },
  { counter: 9, neutralizes: 5 },
]

const KENDRA = new Set([1, 4, 7, 10])
const TRIKONA = new Set([1, 5, 9])

/** Sign that is `nth` (1-based) from a base sign, wrapping the zodiac. */
function signNFrom(baseSign: number, nth: number): number {
  return ((baseSign - 1 + (nth - 1)) % 12) + 1
}

/** House (from the lagna) occupied by a given sign. */
function signToHouse(signNumber: number, lagnaSignNumber: number): number {
  return ((signNumber - lagnaSignNumber + 12) % 12) + 1
}

/** Names of planets occupying a given sign. */
function planetsInSign(signNumber: number, planets: PlanetPosition[]): string[] {
  return planets.filter((p) => p.signNumber === signNumber).map((p) => p.planet)
}

/**
 * Computes the full Jaimini geometry for a chart.
 *
 * @param planets         D1 planet positions.
 * @param lagnaSignNumber D1 ascendant sign (1–12).
 * @param specialLagnas   Special lagnas (Bhava/Hora/Ghati, etc.).
 * @param sunLon          Sun's sidereal longitude (for the Yogi point).
 * @param moonLon         Moon's sidereal longitude (for the Yogi point).
 * @param houseLordsD1    house (1–12) → lord name for the D1 chart.
 */
export function computeJaimini(
  planets: PlanetPosition[],
  lagnaSignNumber: number,
  specialLagnas: SpecialLagna[],
  sunLon: number,
  moonLon: number,
  houseLordsD1: Record<number, string>
): JaiminiGeometry {
  // ── Argala ────────────────────────────────────────────────────────
  const argala: ArgalaEntry[] = []
  for (let targetSign = 1; targetSign <= 12; targetSign++) {
    const targetHouse = signToHouse(targetSign, lagnaSignNumber)

    const emit = (offsets: number[], type: 'primary' | 'secondary') => {
      for (const offset of offsets) {
        const argalaSign = signNFrom(targetSign, offset)
        const argalaPlanets = planetsInSign(argalaSign, planets)
        if (argalaPlanets.length === 0) continue
        argala.push({
          targetSign,
          targetHouse,
          argalaFrom: argalaSign,
          argalaPlanets,
          type,
          kind: 'argala',
        })
      }
    }

    emit(ARGALA_PRIMARY, 'primary')
    emit(ARGALA_SECONDARY, 'secondary')
  }

  // ── Virodha Argala (counter-argala) ───────────────────────────────
  const virodhaArgala: VirodhaArgalaEntry[] = []
  for (let targetSign = 1; targetSign <= 12; targetSign++) {
    for (const { counter, neutralizes } of VIRODHA_MAP) {
      const counterSign = signNFrom(targetSign, counter)
      const counterPlanets = planetsInSign(counterSign, planets)
      if (counterPlanets.length === 0) continue
      virodhaArgala.push({
        targetSign,
        counterFrom: counterSign,
        counterPlanets,
        neutralizes,
      })
    }
  }

  // ── Yogi & Avayogi points ─────────────────────────────────────────
  const yogiLon = normLon(sunLon + moonLon + 93.3333)
  const yogiSign = Math.floor(yogiLon / 30) + 1
  const yogiNakIdx = getNakshatraIndex(yogiLon)
  const yogiPoint = {
    longitude: Number(yogiLon.toFixed(4)),
    signNumber: yogiSign,
    nakshatra: getNakshatraName(yogiNakIdx),
    yogiPlanet: getNakshatraLord(yogiNakIdx),
  }

  const avayogiLon = normLon(yogiLon + 186.6667)
  const avayogiSign = Math.floor(avayogiLon / 30) + 1
  const avayogiNakIdx = getNakshatraIndex(avayogiLon)
  const avayogiPoint = {
    longitude: Number(avayogiLon.toFixed(4)),
    signNumber: avayogiSign,
    nakshatra: getNakshatraName(avayogiNakIdx),
    avayogiPlanet: getNakshatraLord(avayogiNakIdx),
  }

  // ── Special-lagna rashi aspects ───────────────────────────────────
  const specialLagnaAspects = specialLagnas.map((sl) => ({
    lagna: sl.abbr,
    signNumber: sl.signNumber,
    aspectsHouses: (RASHI_ASPECT_MATRIX[sl.signNumber] ?? []).map((s) =>
      signToHouse(s, lagnaSignNumber)
    ),
  }))

  // ── Lord-to-lord kendra/trikona substrate (Raja-yoga seed) ────────
  // Current house of a lord = house of the planet with that name.
  const currentHouseOf = new Map<string, number>()
  for (const p of planets) currentHouseOf.set(p.planet, p.house)

  const lordRelationshipMap: JaiminiGeometry['lordRelationshipMap'] = []
  for (let a = 1; a <= 12; a++) {
    for (let b = a + 1; b <= 12; b++) {
      // Only house pairs forming a kendra–trikona substrate qualify.
      const kendraTrikonaPair =
        (KENDRA.has(a) && TRIKONA.has(b)) || (TRIKONA.has(a) && KENDRA.has(b))
      if (!kendraTrikonaPair) continue

      const lordA = houseLordsD1[a]
      const lordB = houseLordsD1[b]
      if (!lordA || !lordB) continue

      const houseA = currentHouseOf.get(lordA)
      const houseB = currentHouseOf.get(lordB)
      if (houseA === undefined || houseB === undefined) continue

      // Angular relationship between the lords' CURRENT positions (symmetric).
      const rel = ((houseB - houseA + 12) % 12) + 1 // 1..12
      const isKendra = rel === 1 || rel === 4 || rel === 7 || rel === 10
      const isTrikona = rel === 1 || rel === 5 || rel === 9

      let relationship: 'kendra' | 'trikona' | 'kendra_trikona' | 'none'
      if (rel === 1) relationship = 'kendra_trikona'
      else if (isKendra) relationship = 'kendra'
      else if (isTrikona) relationship = 'trikona'
      else relationship = 'none'

      lordRelationshipMap.push({ lordA, houseA, lordB, houseB, relationship })
    }
  }

  return {
    argala,
    virodhaArgala,
    yogiPoint,
    avayogiPoint,
    specialLagnaAspects,
    lordRelationshipMap,
    computedAt: new Date().toISOString(),
  }
}
