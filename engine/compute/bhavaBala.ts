/**
 * engine/compute/bhavaBala.ts — Bhava Bala (house strength).
 *
 * Combines three house-level strength contributions into a per-house total:
 *
 *   - bhavadhipatiBala : total Shadbala (virupas) of the house lord.
 *   - bhavaDigBala     : directional strength proxy by house nature
 *                        (kendra 60 / panapara 30 / apoklima 15).
 *   - bhavaDrishtiBala : net graded aspect cast onto the house
 *                        (benefic aspects add, malefic subtract).
 *
 * Spec: .kiro/specs/deterministic-1c-1d/  (SCOPE FINALIZED — Bhava Bala module)
 *
 * APPROXIMATION (documented per the spec): classical Bhava Digbala derives
 * from the house's occupying rashi and a day/night lookup. Here we use a
 * simplified kendra/panapara/apoklima proxy (60/30/15) for directional weight.
 */

import type {
  BhavaBalaResult,
  BhavaBalaHouse,
  ShadbalResult,
  RelationshipGeometry,
  PlanetPosition,
  CombustionResult,
} from './types'
import { SIGN_LORDS, gradedAspectStrengthBetweenHouses, isNaturalBenefic } from './relationships'

const NODES = new Set(['Rahu', 'Ketu'])

/** Simplified Bhava Digbala proxy by house nature (see file header). */
function bhavaDigByHouse(house: number): number {
  if (house === 1 || house === 4 || house === 7 || house === 10) return 60 // kendra
  if (house === 2 || house === 5 || house === 8 || house === 11) return 30 // panapara
  return 15 // apoklima (3, 6, 9, 12)
}

/**
 * Computes Bhava Bala for all 12 houses.
 *
 * @param shadbala        Full Shadbala result (source of bhavadhipati bala).
 * @param relationships   Relationship geometry (reserved; not required here).
 * @param planets         D1 planet positions (aspect sources).
 * @param lagnaSignNumber D1 ascendant sign (1–12).
 * @param waxingMoon      Whether the Moon is waxing (benefic/malefic split).
 * @param combustion      Single combustion source (FIX-D/F): a combust benefic
 *                        is treated as malefic, exactly as in Drik Bala.
 */
export function computeBhavaBala(
  shadbala: ShadbalResult,
  relationships: RelationshipGeometry,
  planets: PlanetPosition[],
  lagnaSignNumber: number,
  waxingMoon: boolean,
  combustion: CombustionResult[] = []
): BhavaBalaResult {
  // Fast lookup: lord name → total Shadbala (virupas).
  const shadbalaTotalOf = new Map<string, number>()
  for (const sp of shadbala.planets) {
    shadbalaTotalOf.set(sp.planet, sp.components.total)
  }

  // FIX-D: combustion lookup so a combust benefic counts as malefic (as in Drik).
  const combustByPlanet: Record<string, boolean> = {}
  for (const c of combustion) combustByPlanet[c.planet] = c.combust

  const houses: BhavaBalaHouse[] = []

  for (let house = 1; house <= 12; house++) {
    // ── Bhavadhipati Bala: house lord's total Shadbala ──────────────
    const signOfHouse = ((lagnaSignNumber - 1 + house - 1) % 12) + 1
    const lord = SIGN_LORDS[signOfHouse]
    const bhavadhipatiBala =
      NODES.has(lord) ? 0 : shadbalaTotalOf.get(lord) ?? 0

    // ── Bhava Dig Bala: directional proxy by house nature ───────────
    const bhavaDigBala = bhavaDigByHouse(house)

    // ── Bhava Drishti Bala: net graded aspect onto this house ───────
    let beneficSum = 0
    let maleficSum = 0
    for (const x of planets) {
      if (x.planet === 'Rahu' || x.planet === 'Ketu') continue // FIX-C: nodes cast no aspect
      const contribution = gradedAspectStrengthBetweenHouses(x.house, house, x.planet)
      if (contribution <= 0) continue
      if (isNaturalBenefic(x.planet, { waxingMoon, combust: combustByPlanet[x.planet] })) {
        beneficSum += contribution
      } else {
        maleficSum += contribution
      }
    }
    const bhavaDrishtiBala = (beneficSum - maleficSum) / 4

    const total = bhavadhipatiBala + bhavaDigBala + bhavaDrishtiBala
    houses.push({
      house,
      bhavadhipatiBala,
      bhavaDigBala,
      bhavaDrishtiBala,
      total,
      rupas: total / 60,
    })
  }

  return {
    houses,
    computedAt: new Date().toISOString(),
  }
}
