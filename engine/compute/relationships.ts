/**
 * engine/compute/relationships.ts — Deterministic Relationship Geometry (replaces LLM agent 1D).
 *
 * Computes all inter-planetary and sign-to-sign relationship geometry from the
 * Swiss-Ephemeris planet positions already produced by the compute engine:
 *
 *   - Conjunctions (incl. planet+upagraha same-sign pairs)
 *   - Graha Drishti (yoga-geometry special full aspects)
 *   - Rashi Drishti (Jaimini sign aspects)
 *   - Graha Yuddha (planetary war)
 *   - Mutual Reception (Parivartana)
 *   - Stelliums
 *   - Combustion (asta) incl. cazimi
 *   - Baladi Avastha
 *   - Gandanta / Sandhi
 *   - House lordships across the seven divisional charts
 *   - Upagraha placements
 *
 * It also exports two helpers reused by shadbala.ts (Batch 3):
 *   - gradedAspectStrengthBetweenHouses / computeGradedAspectContribution (FIX-9 Drik Bala)
 *   - isNaturalBenefic (FIX-9 benefic/malefic classification)
 *
 * Spec: .kiro/specs/deterministic-1c-1d/  (REQ-2.*, CORRECTIONS ADDENDUM FIX-9/10/11/13)
 *
 * All angular inputs are sidereal (Lahiri) longitudes in degrees.
 */

import { getSignName } from './planets'
import type {
  PlanetPosition,
  DivisionalChart,
  Upagraha,
  Conjunction,
  AspectEdge,
  RashiAspectEdge,
  PlanetaryWar,
  Parivartana,
  Stellium,
  CombustionResult,
  AvasthaResult,
  GandantaResult,
  SandhiResult,
  UpagrahaPlacement,
  HouseLordships,
  RelationshipGeometry,
} from './types'

// ─── Constants ──────────────────────────────────────────────────────

/** Single classical lord of each sign (1=Aries … 12=Pisces). */
export const SIGN_LORDS: Record<number, string> = {
  1: 'Mars', 2: 'Venus', 3: 'Mercury', 4: 'Moon', 5: 'Sun', 6: 'Mercury',
  7: 'Venus', 8: 'Mars', 9: 'Jupiter', 10: 'Saturn', 11: 'Saturn', 12: 'Jupiter',
}

/** Sign modality — movable (chara), fixed (sthira), dual (dvisvabhava). */
export const SIGN_MODALITY: Record<number, 'movable' | 'fixed' | 'dual'> = {
  1: 'movable', 2: 'fixed', 3: 'dual', 4: 'movable', 5: 'fixed', 6: 'dual',
  7: 'movable', 8: 'fixed', 9: 'dual', 10: 'movable', 11: 'fixed', 12: 'dual',
}

/**
 * Combustion thresholds (degrees from Sun), by motion direction.
 * FIX-13: for the Moon we emit both the standard 12° flag and a strict 8° flag.
 */
export const COMBUSTION_THRESHOLDS: Record<string, { direct: number; retro: number }> = {
  Moon:    { direct: 12, retro: 12 },
  Mars:    { direct: 17, retro: 17 },
  Mercury: { direct: 14, retro: 12 },
  Jupiter: { direct: 11, retro: 11 },
  Venus:   { direct: 10, retro: 8 },
  Saturn:  { direct: 15, retro: 15 },
}

/** Strict alternate Moon combustion threshold (FIX-13). */
export const MOON_STRICT_COMBUSTION = 8

/**
 * Natural benefics/malefics. Mercury and Moon are conditional — see
 * {@link isNaturalBenefic}. Mercury is benefic unless combust; Moon is
 * benefic when waxing, malefic when waning.
 */
export const NATURAL_BENEFICS = ['Jupiter', 'Venus', 'Mercury', 'Moon']
export const NATURAL_MALEFICS = ['Sun', 'Mars', 'Saturn', 'Rahu', 'Ketu']

/**
 * Yoga-geometry aspect table (special FULL aspects only). Every planet casts
 * the 7th aspect; Mars/Jupiter/Saturn add their special aspects; the nodes add
 * an optional Jaimini 5th/9th aspect. All are full-strength (60) here — the
 * graded quarter-aspect scheme used for Drik Bala lives in
 * {@link gradedAspectStrengthBetweenHouses}.
 *
 * `house` is the aspected house counted from the planet's own house
 * (1 = same house, 7 = seventh, etc.).
 */
export const ASPECT_HOUSES: Record<
  string,
  { house: number; type: string; school: 'parashari' | 'jaimini_optional' }[]
> = {
  ALL:     [{ house: 7, type: '7th', school: 'parashari' }],
  Mars:    [{ house: 4, type: 'mars_4th', school: 'parashari' }, { house: 8, type: 'mars_8th', school: 'parashari' }],
  Jupiter: [{ house: 5, type: 'jupiter_5th', school: 'parashari' }, { house: 9, type: 'jupiter_9th', school: 'parashari' }],
  Saturn:  [{ house: 3, type: 'saturn_3rd', school: 'parashari' }, { house: 10, type: 'saturn_10th', school: 'parashari' }],
  Rahu:    [{ house: 5, type: 'node_5th', school: 'jaimini_optional' }, { house: 9, type: 'node_9th', school: 'jaimini_optional' }],
  Ketu:    [{ house: 5, type: 'node_5th', school: 'jaimini_optional' }, { house: 9, type: 'node_9th', school: 'jaimini_optional' }],
}

// ─── Geometry helpers ───────────────────────────────────────────────

/** Normalize a longitude to [0, 360). */
export function normLon(x: number): number {
  return ((x % 360) + 360) % 360
}

/** Shortest angular distance between two longitudes (0–180°). */
export function arcDist(a: number, b: number): number {
  const d = Math.abs(normLon(a) - normLon(b))
  return d > 180 ? 360 - d : d
}

/** Sign number (1–12) occupying a given house counted from the lagna. */
export function houseToSign(house: number, lagnaSignNumber: number): number {
  return ((lagnaSignNumber - 1 + house - 1) % 12) + 1
}

/** Names of planets sitting in a given house (from lagna). */
export function getPlanetsInHouse(house: number, planets: PlanetPosition[]): string[] {
  return planets.filter((p) => p.house === house).map((p) => p.planet)
}

/** Names of planets sitting in a given sign. */
export function getPlanetsInSign(signNumber: number, planets: PlanetPosition[]): string[] {
  return planets.filter((p) => p.signNumber === signNumber).map((p) => p.planet)
}

/**
 * Precomputed 12×12 Rashi Drishti (Jaimini sign-aspect) matrix.
 * REQ-2.3 / FIX: dual signs aspect the other three dual signs; movable signs
 * aspect all fixed signs EXCEPT the adjacent one; fixed signs aspect all
 * movable signs EXCEPT the adjacent one.
 *
 * The "adjacent" sign that must be excluded differs by modality:
 *   - movable (from): exclude the NEXT sign (2nd from it, a fixed sign)
 *     excludedFixed    = (from % 12) + 1
 *   - fixed (from):   exclude the PREVIOUS sign (12th from it, a movable sign)
 *     excludedMovable  = ((from - 2 + 12) % 12) + 1
 * Yields exactly 36 directional edges (12 signs × 3 each).
 */
function buildRashiAspectMatrix(): Record<number, number[]> {
  const matrix: Record<number, number[]> = {}
  for (let from = 1; from <= 12; from++) {
    const mod = SIGN_MODALITY[from]
    if (mod === 'dual') {
      matrix[from] = [3, 6, 9, 12].filter((s) => s !== from)
    } else if (mod === 'movable') {
      const excludedFixed = (from % 12) + 1
      matrix[from] = [2, 5, 8, 11].filter((s) => s !== excludedFixed)
    } else {
      const excludedMovable = ((from - 2 + 12) % 12) + 1
      matrix[from] = [1, 4, 7, 10].filter((s) => s !== excludedMovable)
    }
  }
  return matrix
}

/** Built once at module load. */
export const RASHI_ASPECT_MATRIX: Record<number, number[]> = buildRashiAspectMatrix()

// ─── Exported helpers reused by shadbala.ts (Batch 3) ────────────────

/**
 * FIX-9 graded aspect strength (in virupas) for Drik Bala. Applies to EVERY
 * planet, unlike the yoga-geometry aspects which only use special full aspects.
 *
 * Distance is counted in houses from `fromHouse` to `toHouse` (1 = same house):
 *   3rd / 10th  → 15   (¼ aspect)
 *   5th / 9th   → 30   (½ aspect)
 *   4th / 8th   → 45   (¾ aspect)
 *   7th         → 60   (full)
 *   else        → 0
 * Then special aspects are upgraded to full (60):
 *   Jupiter 5th/9th, Mars 4th/8th, Saturn 3rd/10th.
 */
export function gradedAspectStrengthBetweenHouses(
  fromHouse: number,
  toHouse: number,
  fromPlanet: string
): number {
  const nth = (((toHouse - fromHouse) % 12) + 12) % 12 + 1 // 1..12
  let strength = 0
  if (nth === 3 || nth === 10) strength = 15
  else if (nth === 5 || nth === 9) strength = 30
  else if (nth === 4 || nth === 8) strength = 45
  else if (nth === 7) strength = 60

  // Special-aspect upgrades to full strength.
  if (fromPlanet === 'Jupiter' && (nth === 5 || nth === 9)) strength = 60
  if (fromPlanet === 'Mars' && (nth === 4 || nth === 8)) strength = 60
  if (fromPlanet === 'Saturn' && (nth === 3 || nth === 10)) strength = 60

  return strength
}

/**
 * Convenience alias with the (fromPlanet, fromHouse, toHouse) argument order.
 * Same value as {@link gradedAspectStrengthBetweenHouses}.
 */
export function computeGradedAspectContribution(
  fromPlanet: string,
  fromHouse: number,
  toHouse: number
): number {
  return gradedAspectStrengthBetweenHouses(fromHouse, toHouse, fromPlanet)
}

/**
 * Natural benefic/malefic classification (FIX-9).
 *   - Jupiter / Venus: always benefic (but combust ⇒ malefic).
 *   - Mercury: benefic unless combust.
 *   - Moon: benefic when waxing, malefic when waning.
 *   - Sun / Mars / Saturn / Rahu / Ketu: always malefic.
 */
export function isNaturalBenefic(
  planet: string,
  opts: { waxingMoon?: boolean; combust?: boolean } = {}
): boolean {
  const { waxingMoon = true, combust = false } = opts
  switch (planet) {
    case 'Jupiter':
    case 'Venus':
      return !combust // combust benefic ⇒ malefic (FIX-9)
    case 'Mercury':
      return !combust
    case 'Moon':
      return waxingMoon
    default:
      return false // Sun, Mars, Saturn, Rahu, Ketu
  }
}

// ─── 1. Conjunctions ─────────────────────────────────────────────────

/** Minimum pairwise shortest-arc distance among a set of longitudes. */
function minPairwiseOrb(longitudes: number[]): number {
  let min = Infinity
  for (let i = 0; i < longitudes.length; i++) {
    for (let j = i + 1; j < longitudes.length; j++) {
      const d = arcDist(longitudes[i], longitudes[j])
      if (d < min) min = d
    }
  }
  return min === Infinity ? 0 : min
}

/**
 * REQ-2.1 — Conjunctions. Two or more planets in the same sign form a
 * conjunction. When upagrahas are supplied, planet+upagraha same-sign clusters
 * are also emitted with `involvesUpagraha` (and `gulikaAffliction` when Gulika,
 * abbr 'Gu', participates).
 */
export function computeConjunctions(
  planets: PlanetPosition[],
  lagnaSignNumber: number,
  upagrahas?: Upagraha[]
): Conjunction[] {
  const conjunctions: Conjunction[] = []

  for (let signNumber = 1; signNumber <= 12; signNumber++) {
    const inSign = planets.filter((p) => p.signNumber === signNumber)
    if (inSign.length < 2) continue

    const house = ((signNumber - lagnaSignNumber + 12) % 12) + 1
    const orb = minPairwiseOrb(inSign.map((p) => p.longitude))
    const isSandhi = inSign.some((p) => p.degreeInSign < 1 || p.degreeInSign > 29)

    conjunctions.push({
      planets: inSign.map((p) => p.planet),
      sign: getSignName(signNumber),
      signNumber,
      house,
      orb: Number(orb.toFixed(2)),
      isSandhi,
    })
  }

  // Planet + upagraha same-sign conjunctions.
  if (upagrahas && upagrahas.length) {
    for (let signNumber = 1; signNumber <= 12; signNumber++) {
      const planetsInSign = planets.filter((p) => p.signNumber === signNumber)
      const upagrahasInSign = upagrahas.filter((u) => u.signNumber === signNumber)
      if (planetsInSign.length === 0 || upagrahasInSign.length === 0) continue

      const house = ((signNumber - lagnaSignNumber + 12) % 12) + 1
      const allLons = [
        ...planetsInSign.map((p) => p.longitude),
        ...upagrahasInSign.map((u) => u.longitude),
      ]
      const orb = minPairwiseOrb(allLons)
      const upagrahaAbbrs = upagrahasInSign.map((u) => u.abbr)
      const isSandhi =
        planetsInSign.some((p) => p.degreeInSign < 1 || p.degreeInSign > 29) ||
        upagrahasInSign.some((u) => u.degreeInSign < 1 || u.degreeInSign > 29)

      conjunctions.push({
        planets: planetsInSign.map((p) => p.planet),
        sign: getSignName(signNumber),
        signNumber,
        house,
        orb: Number(orb.toFixed(2)),
        isSandhi,
        involvesUpagraha: true,
        upagrahaAbbrs,
        gulikaAffliction: upagrahaAbbrs.includes('Gu'),
      })
    }
  }

  return conjunctions
}

// ─── 2. Stelliums ────────────────────────────────────────────────────

/**
 * REQ-2.6 — Stelliums. Three or more planets in one sign. `isStrong` when that
 * sign's lord is among the planets present.
 */
export function computeStelliums(
  planets: PlanetPosition[],
  lagnaSignNumber: number
): Stellium[] {
  const stelliums: Stellium[] = []

  for (let signNumber = 1; signNumber <= 12; signNumber++) {
    const inSign = planets.filter((p) => p.signNumber === signNumber)
    if (inSign.length < 3) continue

    const house = ((signNumber - lagnaSignNumber + 12) % 12) + 1
    const lord = SIGN_LORDS[signNumber]
    const isStrong = inSign.some((p) => p.planet === lord)

    stelliums.push({
      sign: getSignName(signNumber),
      signNumber,
      house,
      planets: inSign.map((p) => p.planet),
      count: inSign.length,
      isStrong,
    })
  }

  return stelliums
}

// ─── 3. Graha Yuddha (Planetary War) ─────────────────────────────────

const WAR_PLANETS = ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']

/**
 * REQ-2.4 — Graha Yuddha. Pairs of the five true "star" planets (Mars,
 * Mercury, Jupiter, Venus, Saturn) within 1°.
 *
 * FIX-10: we determine the winner by LOWER degree-in-sign (our convention).
 * Classical texts also weigh latitude/brightness — not modelled here.
 */
export function computeGrahaYuddha(planets: PlanetPosition[]): PlanetaryWar[] {
  const wars: PlanetaryWar[] = []
  const eligible = planets.filter((p) => WAR_PLANETS.includes(p.planet))

  for (let i = 0; i < eligible.length; i++) {
    for (let j = i + 1; j < eligible.length; j++) {
      const a = eligible[i]
      const b = eligible[j]
      const separation = arcDist(a.longitude, b.longitude)
      if (separation > 1) continue

      // Winner: lower degree-in-sign (closer to sign start). FIX-10.
      const winner = a.degreeInSign <= b.degreeInSign ? a.planet : b.planet
      const loser = winner === a.planet ? b.planet : a.planet

      wars.push({
        planet_a: a.planet,
        planet_b: b.planet,
        separation_deg: Number(separation.toFixed(2)),
        winner,
        loser,
        intense: separation < 0.5,
      })
    }
  }

  return wars
}

// ─── 4. Graha Drishti (yoga-geometry aspects) ────────────────────────

/**
 * REQ-2.2 — Graha Drishti. Yoga-geometry full aspects (see {@link ASPECT_HOUSES}).
 * Every aspect edge is full strength (60). Upagrahas can be aspect TARGETS
 * (they do not cast aspects) and appear in `toUpagrahas` when supplied.
 */
export function computeGrahaDrishti(
  planets: PlanetPosition[],
  lagnaSignNumber: number,
  upagrahas?: Upagraha[]
): AspectEdge[] {
  const edges: AspectEdge[] = []

  for (const p of planets) {
    const entries = [
      ...ASPECT_HOUSES.ALL,
      ...(ASPECT_HOUSES[p.planet] ?? []),
    ]

    for (const entry of entries) {
      const toHouse = ((p.house - 1 + entry.house - 1) % 12) + 1
      const toSign = houseToSign(toHouse, lagnaSignNumber)
      const toPlanets = getPlanetsInHouse(toHouse, planets)
      const toUpagrahas = upagrahas
        ? upagrahas.filter((u) => u.house === toHouse).map((u) => u.abbr)
        : []

      edges.push({
        from: p.planet,
        fromHouse: p.house,
        toHouse,
        toSign,
        toPlanets,
        toUpagrahas,
        type: entry.type,
        strength: 60,
        school: entry.school,
      })
    }
  }

  return edges
}

// ─── 5. Rashi Drishti (Jaimini sign aspects) ─────────────────────────

/**
 * REQ-2.3 — Rashi Drishti. All 36 directional sign-aspect edges from
 * {@link RASHI_ASPECT_MATRIX}. Emitted even when the aspected sign is empty.
 */
export function computeRashiDrishti(
  planets: PlanetPosition[],
  lagnaSignNumber: number
): RashiAspectEdge[] {
  const edges: RashiAspectEdge[] = []

  for (let fromSign = 1; fromSign <= 12; fromSign++) {
    const mod = SIGN_MODALITY[fromSign]
    const type: RashiAspectEdge['type'] =
      mod === 'movable' ? 'movable_to_fixed' : mod === 'fixed' ? 'fixed_to_movable' : 'dual_to_dual'
    const fromHouse = ((fromSign - lagnaSignNumber + 12) % 12) + 1

    for (const toSign of RASHI_ASPECT_MATRIX[fromSign]) {
      const toHouse = ((toSign - lagnaSignNumber + 12) % 12) + 1
      edges.push({
        fromSign: getSignName(fromSign),
        fromSignNumber: fromSign,
        fromHouse,
        toSign: getSignName(toSign),
        toSignNumber: toSign,
        toHouse,
        toPlanets: getPlanetsInSign(toSign, planets),
        type,
      })
    }
  }

  return edges
}

// ─── 6. Mutual Reception (Parivartana) ───────────────────────────────

const KENDRA_TRIKONA = new Set([1, 4, 5, 7, 9, 10])
const DUSTHANA_6_8_12 = new Set([6, 8, 12])

/**
 * REQ-2.5 / FIX-11 — Mutual Reception (Parivartana). For each unique pair,
 * a reception exists when lord(A.sign) === B and lord(B.sign) === A.
 *
 * Classification (priority dainya > kahala > maha > simple — dusthana dominates):
 *   dainya : any involved house is 6, 8 or 12
 *   kahala : a 3rd house is involved
 *   maha   : both houses are in a kendra (1,4,7,10) or trikona (1,5,9)
 *   simple : none of the above
 */
export function computeMutualReception(
  planets: PlanetPosition[],
  lagnaSignNumber: number
): Parivartana[] {
  const receptions: Parivartana[] = []

  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i]
      const b = planets[j]
      if (SIGN_LORDS[a.signNumber] === b.planet && SIGN_LORDS[b.signNumber] === a.planet) {
        const houseA = a.house
        const houseB = b.house

        let exchange_type: Parivartana['exchange_type']
        if (DUSTHANA_6_8_12.has(houseA) || DUSTHANA_6_8_12.has(houseB)) {
          exchange_type = 'dainya'
        } else if (houseA === 3 || houseB === 3) {
          exchange_type = 'kahala'
        } else if (KENDRA_TRIKONA.has(houseA) && KENDRA_TRIKONA.has(houseB)) {
          exchange_type = 'maha'
        } else {
          exchange_type = 'simple'
        }

        receptions.push({
          planet_a: a.planet,
          sign_a: a.sign,
          house_a: houseA,
          planet_b: b.planet,
          sign_b: b.sign,
          house_b: houseB,
          exchange_type,
        })
      }
    }
  }

  return receptions
}

// ─── 7. Combustion ───────────────────────────────────────────────────

const CAZIMI_ORB = 0.283 // ~0°17'

/**
 * REQ-2.7 / FIX-13 — Combustion (asta). Excludes the Sun. `combust` is
 * threshold-only (degreeFromSun < threshold); per classical Parashari astangata
 * there is no cazimi strengthening exception, so a planet within the cazimi orb
 * (`cazimi`, within 0°17') is still combust — in fact the most deeply combust.
 * `cazimi` is still computed and reported but no longer cancels `combust`.
 * `nearCombust` when within 1.5× threshold but not combust. For the Moon, the
 * strict 8° flag is also emitted alongside the standard 12° result.
 */
export function computeCombustion(planets: PlanetPosition[]): CombustionResult[] {
  const results: CombustionResult[] = []
  const sun = planets.find((p) => p.planet === 'Sun')
  if (!sun) return results

  for (const p of planets) {
    if (p.planet === 'Sun') continue
    const thresholds = COMBUSTION_THRESHOLDS[p.planet]
    if (!thresholds) continue // Rahu/Ketu have no combustion

    const degreeFromSun = arcDist(p.longitude, sun.longitude)
    const retrogradeThresholdApplied = p.retrograde
    const threshold = retrogradeThresholdApplied ? thresholds.retro : thresholds.direct

    const cazimi = degreeFromSun < CAZIMI_ORB
    const combust = degreeFromSun < threshold
    const nearCombust = degreeFromSun < threshold * 1.5 && !combust

    const result: CombustionResult = {
      planet: p.planet,
      degreeFromSun: Number(degreeFromSun.toFixed(2)),
      combust,
      cazimi,
      nearCombust,
      threshold,
      retrogradeThresholdApplied,
    }

    if (p.planet === 'Moon') {
      result.moonStrictCombust = degreeFromSun < MOON_STRICT_COMBUSTION && !cazimi
    }

    results.push(result)
  }

  return results
}

// ─── 8. Avastha (Baladi) ─────────────────────────────────────────────

const AVASTHA_ODD: AvasthaResult['avastha'][] = ['Bala', 'Kumara', 'Yuva', 'Vriddha', 'Mrita']
const AVASTHA_EVEN: AvasthaResult['avastha'][] = ['Mrita', 'Vriddha', 'Yuva', 'Kumara', 'Bala']

const AVASTHA_STRENGTH: Record<AvasthaResult['avastha'], AvasthaResult['avasthaStrength']> = {
  Yuva: 'Strong',
  Kumara: 'Moderate',
  Bala: 'Moderate',
  Vriddha: 'Weak',
  Mrita: 'VeryWeak',
}

/**
 * REQ-2.9 / FIX-12 — Baladi Avastha. Five 6° bands per sign. Odd signs run
 * Bala→Mrita; even signs run reversed (Mrita→Bala).
 */
export function computeAvastha(planets: PlanetPosition[]): AvasthaResult[] {
  return planets.map((p) => {
    const bandIndex = Math.min(4, Math.floor(p.degreeInSign / 6))
    const isOdd = p.signNumber % 2 === 1
    const avastha = (isOdd ? AVASTHA_ODD : AVASTHA_EVEN)[bandIndex]
    return {
      planet: p.planet,
      avastha,
      avasthaStrength: AVASTHA_STRENGTH[avastha],
    }
  })
}

// ─── 9. Gandanta ─────────────────────────────────────────────────────

const GANDANTA_ORB = 0.8 // 0°48'
const GANDANTA_JUNCTIONS: { longitude: number; label: string }[] = [
  { longitude: 0, label: 'Pisces-Aries' },     // end of Pisces → start of Aries
  { longitude: 120, label: 'Cancer-Leo' },     // end of Cancer → start of Leo
  { longitude: 240, label: 'Scorpio-Sagittarius' }, // end of Scorpio → start of Sagittarius
]

/**
 * REQ-2.10 — Gandanta. Water→fire junctions at 0°/120°/240°. A planet within
 * 0°48' of a junction is gandanta.
 */
export function computeGandanta(planets: PlanetPosition[]): GandantaResult[] {
  return planets.map((p) => {
    let nearest = GANDANTA_JUNCTIONS[0]
    let minDist = Infinity
    for (const j of GANDANTA_JUNCTIONS) {
      const d = arcDist(p.longitude, j.longitude)
      if (d < minDist) {
        minDist = d
        nearest = j
      }
    }
    const gandanta = minDist < GANDANTA_ORB
    return {
      planet: p.planet,
      gandanta,
      junctionPoint: gandanta ? nearest.label : undefined,
      degreesFromJunction: gandanta ? Number(minDist.toFixed(3)) : undefined,
    }
  })
}

// ─── 10. Sandhi ──────────────────────────────────────────────────────

/**
 * REQ-2.11 — Sandhi. A planet within 1° of a sign boundary: ingress (0–1°) or
 * egress (29–30°).
 */
export function computeSandhi(planets: PlanetPosition[]): SandhiResult[] {
  return planets.map((p) => {
    const ingress = p.degreeInSign < 1
    const egress = p.degreeInSign > 29
    const sandhi = ingress || egress
    return {
      planet: p.planet,
      sandhi,
      type: ingress ? 'ingress' : egress ? 'egress' : undefined,
      degreeInSign: Number(p.degreeInSign.toFixed(3)),
    }
  })
}

// ─── 11. House Lordships ─────────────────────────────────────────────

const LORDSHIP_DIVISIONS = [1, 4, 7, 9, 10, 30]

/**
 * REQ-2.8 — House lordships for D1, D4, D7, D9, D10, D30. For each chart's
 * lagna: sign of house H = ((lagnaSignNumber - 1 + H - 1) % 12) + 1; lord =
 * SIGN_LORDS[sign].
 */
export function computeHouseLordships(divisionalCharts: DivisionalChart[]): HouseLordships {
  const houseLords: HouseLordships = {}

  for (const division of LORDSHIP_DIVISIONS) {
    const chart = divisionalCharts.find((c) => c.division === division)
    if (!chart) continue

    const lagnaSignNumber = chart.lagnaSignNumber
    houseLords[division] = {}
    for (let house = 1; house <= 12; house++) {
      const signNumber = ((lagnaSignNumber - 1 + house - 1) % 12) + 1
      houseLords[division][house] = SIGN_LORDS[signNumber]
    }
  }

  return houseLords
}

// ─── 12. Upagraha Placements ─────────────────────────────────────────

/**
 * Upagraha placements (abbr, name, signNumber, house) relative to the lagna.
 */
export function computeUpagrahaPlacements(
  upagrahas: Upagraha[],
  lagnaSignNumber: number
): UpagrahaPlacement[] {
  return upagrahas.map((u) => ({
    abbr: u.abbr,
    name: u.name,
    signNumber: u.signNumber,
    house: ((u.signNumber - lagnaSignNumber + 12) % 12) + 1,
  }))
}

// ─── 13. Assembly ────────────────────────────────────────────────────

/**
 * REQ-2 — Assemble the full RelationshipGeometry for a chart.
 */
export function computeRelationshipGeometry(
  planets: PlanetPosition[],
  lagnaSignNumber: number,
  divisionalCharts: DivisionalChart[],
  upagrahas?: Upagraha[]
): RelationshipGeometry {
  return {
    conjunctions: computeConjunctions(planets, lagnaSignNumber, upagrahas),
    aspects: computeGrahaDrishti(planets, lagnaSignNumber, upagrahas),
    rashiAspects: computeRashiDrishti(planets, lagnaSignNumber),
    grahaYuddha: computeGrahaYuddha(planets),
    mutualReception: computeMutualReception(planets, lagnaSignNumber),
    stelliums: computeStelliums(planets, lagnaSignNumber),
    combustion: computeCombustion(planets),
    avastha: computeAvastha(planets),
    gandanta: computeGandanta(planets),
    sandhi: computeSandhi(planets),
    upagrahaPlacements: upagrahas ? computeUpagrahaPlacements(upagrahas, lagnaSignNumber) : [],
    houseLords: computeHouseLordships(divisionalCharts),
    computedAt: new Date().toISOString(),
  }
}
