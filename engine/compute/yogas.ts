/**
 * engine/compute/yogas.ts — Deterministic Named-Yoga Engine (F1).
 *
 * Scans the geometry ALREADY computed by relationships.ts and dignity.ts and emits a
 * chart-wide, evidence-carrying Yoga[] catalogue. This module is the keystone for three
 * deferred build-list items:
 *   - F3 (Combustion→Grahan promotion): a Grahan detector reads combustion here.
 *   - F4 (Dusthana/Viparita & Dhana analyzer): Viparita + Dhana detectors live here.
 *   - F5 (Dharma-Karmadhipati / Raja-yoga substrate labeler): the chart-wide Raja
 *     detector emits an explicit `raja.dka` key here.
 *
 * PURITY GUARANTEE: no LLM calls, no network, no DB, no file I/O. Never throws —
 * a detector that hits missing/malformed input emits nothing (`[]`) rather than
 * throwing, and `computeYogas` swallows a misbehaving detector so the rest still run.
 *
 * SINGLE SOURCE OF TRUTH RULE: detectors consume the RelationshipGeometry tables
 * (conjunctions, aspects, mutualReception, combustion, houseLords) and dignity.ts
 * labels. They MUST NOT re-derive conjunctions/aspects/exchanges/dignity independently
 * — mirrors the existing 1D → 2A contract (`prompts/agents/wave1_1d_relationships.md`).
 *
 * Spec: .kiro/specs/named-yoga-engine/
 */

import type {
  PlanetPosition,
  AspectEdge,
  Conjunction,
  Parivartana,
  CombustionResult,
  Yoga,
  YogaCategory,
  YogaStrength,
  YogaEvidence,
} from './types'
import {
  SIGN_LORDS,
  isNaturalBenefic,
} from './relationships'
import {
  getVargaDignityLabel,
  EXALTATION_SIGNS,
  OWN_SIGNS,
  MOOLATRIKONA_SIGNS,
  DEBILITATION_SIGNS,
} from './dignity'

// ─── Input contract ───────────────────────────────────────────────────

export interface YogaInput {
  planets: PlanetPosition[]
  lagnaSignNumber: number
  /** relationships.houseLords[1] — D1 house (1–12) → lord name. */
  houseLordsD1: Record<number, string>
  /** relationships.aspects — graha drishti edges. */
  aspects: AspectEdge[]
  /** relationships.conjunctions. */
  conjunctions: Conjunction[]
  /** relationships.mutualReception. */
  mutualReception: Parivartana[]
  /** relationships.combustion. */
  combustion: CombustionResult[]
}

// ─── Shared helpers ────────────────────────────────────────────────────

/** Houses (from lagna) that `planet` lords, derived from houseLordsD1. */
export function ownedHousesOf(planet: string, houseLordsD1: Record<number, string>): number[] {
  const owned: number[] = []
  for (const [houseKey, lord] of Object.entries(houseLordsD1 ?? {})) {
    if (lord === planet) owned.push(Number(houseKey))
  }
  return owned.sort((a, b) => a - b)
}

/** Lookup a planet's position by name. Returns null when absent (graceful degradation). */
function findPlanet(planets: PlanetPosition[], name: string): PlanetPosition | null {
  return planets.find((p) => p.planet === name) ?? null
}

/** House-from-lagna of a house-from-lagna offset (1-indexed, e.g. nth(1)=same house). */
function houseFrom(baseHouse: number, nth: number): number {
  return ((baseHouse - 1 + nth - 1) % 12) + 1
}

/** Build a planet → D1 sign-number map (for getVargaDignityLabel's tatkalika lookup). */
function buildD1SignMap(planets: PlanetPosition[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const p of planets) map[p.planet] = p.signNumber
  return map
}

/** Combustion lookup by planet name. */
function findCombustion(combustion: CombustionResult[], planet: string): CombustionResult | null {
  return combustion.find((c) => c.planet === planet) ?? null
}

/** Sort a Yoga[] catalogue deterministically: category, then key, then planet list. */
function sortYogas(yogas: Yoga[]): Yoga[] {
  return [...yogas].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    if (a.key !== b.key) return a.key.localeCompare(b.key)
    return a.planets.join(',').localeCompare(b.planets.join(','))
  })
}

const KENDRA_HOUSES = new Set([1, 4, 7, 10])

/** Dignity labels that count as "strong" friendship-wise for a coarse strength grade. */
const STRONG_DIGNITY = new Set(['exalted', 'moolatrikona', 'own', 'great_friend'])
const WEAK_DIGNITY = new Set(['debilitated', 'great_enemy'])

/** Downgrade a strength grade by one level (strong→moderate→weak; weak stays weak). */
function downgrade(strength: YogaStrength): YogaStrength {
  if (strength === 'strong') return 'moderate'
  return 'weak'
}

// ─── Detector 1: Pancha Mahapurusha ────────────────────────────────────
// Mars/Mercury/Jupiter/Venus/Saturn in own OR exalted sign AND in a kendra
// (1/4/7/10) from lagna → Ruchaka/Bhadra/Hamsa/Malavya/Sasa respectively.
// A combust participant downgrades strength by one level (Requirement 2.1).

const MAHAPURUSHA_PLANETS: Record<string, { key: string; name: string }> = {
  Mars:    { key: 'mahapurusha.ruchaka', name: 'Ruchaka Yoga' },
  Mercury: { key: 'mahapurusha.bhadra',  name: 'Bhadra Yoga' },
  Jupiter: { key: 'mahapurusha.hamsa',   name: 'Hamsa Yoga' },
  Venus:   { key: 'mahapurusha.malavya', name: 'Malavya Yoga' },
  Saturn:  { key: 'mahapurusha.sasa',    name: 'Sasa Yoga' },
}

function detectPanchaMahapurusha(input: YogaInput): Yoga[] {
  const { planets } = input
  if (!planets?.length) return []
  const d1Signs = buildD1SignMap(planets)
  const results: Yoga[] = []

  for (const [planetName, meta] of Object.entries(MAHAPURUSHA_PLANETS)) {
    const p = findPlanet(planets, planetName)
    if (!p) continue
    if (!KENDRA_HOUSES.has(p.house)) continue

    // Pancha Mahapurusha forms in exaltation OR the planet's own rasi. Note that
    // getVargaDignityLabel resolves a planet sitting in its MOOLATRIKONA sign to
    // 'moolatrikona' (checked before 'own'), and every Mahapurusha planet's
    // moolatrikona sign IS one of its own signs (Mars→Aries, Mercury→Virgo,
    // Jupiter→Sagittarius, Venus→Libra, Saturn→Aquarius) — so it must count here,
    // otherwise the most common own-sign placements would silently never fire.
    const label = getVargaDignityLabel(planetName, p.signNumber, d1Signs)
    if (label !== 'exalted' && label !== 'own' && label !== 'moolatrikona') continue

    let strength: YogaStrength = label === 'exalted' ? 'strong' : 'moderate'
    const combustion = findCombustion(input.combustion, planetName)
    const evidence: YogaEvidence = {
      rule: meta.key,
      linkage: 'placement',
      ownedHouses: { [planetName]: ownedHousesOf(planetName, input.houseLordsD1) },
      dignity: { [planetName]: label },
    }
    if (combustion?.combust) {
      strength = downgrade(strength)
      evidence.afflictions = [
        { planet: planetName, kind: 'combust', detail: `degreeFromSun ${combustion.degreeFromSun}` },
      ]
    }

    results.push({
      key: meta.key,
      name: meta.name,
      category: 'mahapurusha',
      planets: [planetName],
      houses: [p.house],
      benefic: true,
      strength,
      activatingPlanets: [planetName],
      evidence,
    })
  }

  return results
}

// ─── Detector 2: Gaja Kesari ────────────────────────────────────────────
// Jupiter in a kendra (1/4/7/10) from the Moon. A fromLagna variant (Jupiter
// ALSO in a kendra from lagna) is noted in evidence but does not gate detection.

function detectGajaKesari(input: YogaInput): Yoga[] {
  const { planets } = input
  const jupiter = findPlanet(planets, 'Jupiter')
  const moon = findPlanet(planets, 'Moon')
  if (!jupiter || !moon) return []

  const nthFromMoon = ((jupiter.house - moon.house + 12) % 12) + 1
  if (!KENDRA_HOUSES.has(nthFromMoon)) return []

  const d1Signs = buildD1SignMap(planets)
  const label = getVargaDignityLabel('Jupiter', jupiter.signNumber, d1Signs)
  const combustion = findCombustion(input.combustion, 'Jupiter')

  let strength: YogaStrength = 'moderate'
  if (label && STRONG_DIGNITY.has(label) && !combustion?.combust) strength = 'strong'
  else if ((label && WEAK_DIGNITY.has(label)) || combustion?.combust) strength = 'weak'

  const notes: string[] = []
  if (KENDRA_HOUSES.has(jupiter.house)) notes.push('Jupiter also in kendra from lagna (fromLagna variant)')

  const evidence: YogaEvidence = {
    rule: 'combination.gaja_kesari',
    linkage: 'placement',
    dignity: label ? { Jupiter: label } : undefined,
    notes: notes.length ? notes : undefined,
  }
  if (combustion?.combust) {
    evidence.afflictions = [
      { planet: 'Jupiter', kind: 'combust', detail: `degreeFromSun ${combustion.degreeFromSun}` },
    ]
  }

  return [{
    key: 'combination.gaja_kesari',
    name: 'Gaja Kesari Yoga',
    category: 'combination',
    planets: ['Jupiter', 'Moon'],
    houses: [jupiter.house, moon.house].sort((a, b) => a - b),
    benefic: true,
    strength,
    activatingPlanets: ['Jupiter', 'Moon'],
    evidence,
  }]
}

// ─── Detector 7: Lunar yogas ─────────────────────────────────────────
// Sunapha (non-Sun planet in 2nd from Moon), Anapha (12th), Durudhara (both).
// Kemadruma: neither, AND no planet conjunct the Moon (Requirement 2.7).

function detectLunarYogas(input: YogaInput): Yoga[] {
  const { planets } = input
  const moon = findPlanet(planets, 'Moon')
  if (!moon) return []

  const house2 = houseFrom(moon.house, 2)
  const house12 = houseFrom(moon.house, 12)

  // Sunapha/Anapha/Durudhara are formed by the TARA grahas (Mars, Mercury,
  // Jupiter, Venus, Saturn) — the Sun is excluded by definition, and the shadowy
  // nodes (Rahu/Ketu) do not form these yogas in the standard BPHS treatment.
  const NON_FORMING = new Set(['Sun', 'Moon', 'Rahu', 'Ketu'])
  const formingGrahas = planets.filter((p) => !NON_FORMING.has(p.planet))
  const planetsIn2 = formingGrahas.filter((p) => p.house === house2).map((p) => p.planet)
  const planetsIn12 = formingGrahas.filter((p) => p.house === house12).map((p) => p.planet)
  // Kemadruma cancellation: ANY planet (Sun included) conjunct the Moon negates it.
  const conjunctMoon = planets.filter((p) => p.planet !== 'Moon' && p.house === moon.house)

  if (planetsIn2.length > 0 && planetsIn12.length > 0) {
    const involved = [...new Set([...planetsIn2, ...planetsIn12])].sort()
    return [{
      key: 'lunar.durudhara',
      name: 'Durudhara Yoga',
      category: 'lunar',
      planets: ['Moon', ...involved].sort(),
      houses: [moon.house, house2, house12].sort((a, b) => a - b),
      benefic: true,
      strength: 'strong',
      activatingPlanets: ['Moon', ...involved],
      evidence: { rule: 'lunar.durudhara', linkage: 'placement' },
    }]
  }
  if (planetsIn2.length > 0) {
    return [{
      key: 'lunar.sunapha',
      name: 'Sunapha Yoga',
      category: 'lunar',
      planets: ['Moon', ...planetsIn2].sort(),
      houses: [moon.house, house2].sort((a, b) => a - b),
      benefic: true,
      strength: 'moderate',
      activatingPlanets: ['Moon', ...planetsIn2],
      evidence: { rule: 'lunar.sunapha', linkage: 'placement' },
    }]
  }
  if (planetsIn12.length > 0) {
    return [{
      key: 'lunar.anapha',
      name: 'Anapha Yoga',
      category: 'lunar',
      planets: ['Moon', ...planetsIn12].sort(),
      houses: [moon.house, house12].sort((a, b) => a - b),
      benefic: true,
      strength: 'moderate',
      activatingPlanets: ['Moon', ...planetsIn12],
      evidence: { rule: 'lunar.anapha', linkage: 'placement' },
    }]
  }
  if (conjunctMoon.length === 0) {
    return [{
      key: 'lunar.kemadruma',
      name: 'Kemadruma Yoga',
      category: 'lunar',
      planets: ['Moon'],
      houses: [moon.house],
      benefic: false,
      strength: 'weak',
      activatingPlanets: ['Moon'],
      evidence: {
        rule: 'lunar.kemadruma',
        linkage: 'placement',
        notes: ['No planet in 2nd/12th from Moon, and none conjunct the Moon'],
      },
    }]
  }

  return []
}

// ─── Detector 8: Budha-Aditya ───────────────────────────────────────
// Sun and Mercury conjunct (read from `conjunctions`, not re-derived). Combustion
// of Mercury is recorded in evidence and downgrades strength (never dropped).

function detectBudhaAditya(input: YogaInput): Yoga[] {
  const conjunction = input.conjunctions?.find(
    (c) => c.planets.includes('Sun') && c.planets.includes('Mercury')
  )
  if (!conjunction) return []

  const mercuryCombustion = findCombustion(input.combustion, 'Mercury')
  const strength: YogaStrength = mercuryCombustion?.combust ? 'weak' : 'moderate'

  const evidence: YogaEvidence = {
    rule: 'combination.budha_aditya',
    linkage: 'conjunction',
  }
  if (mercuryCombustion?.combust) {
    evidence.afflictions = [
      { planet: 'Mercury', kind: 'combust', detail: `degreeFromSun ${mercuryCombustion.degreeFromSun}` },
    ]
  }

  return [{
    key: 'combination.budha_aditya',
    name: 'Budha-Aditya Yoga',
    category: 'combination',
    planets: ['Mercury', 'Sun'],
    houses: [conjunction.house],
    benefic: true,
    strength,
    activatingPlanets: ['Mercury', 'Sun'],
    evidence,
  }]
}

// ─── Detector 3: Raja Yoga (kendra-trikona association) ──────────────
// A kendra-lord and a trikona-lord linked by conjunction, mutual graha aspect, or
// parivartana. The 9th-lord + 10th-lord case is labeled distinctly as `raja.dka`
// (Dharma-Karmadhipati) — this is the seam F5 reads (Requirement 2.3, F5).

const TRIKONA_HOUSES = new Set([1, 5, 9])

/** Find a graha-aspect edge (either direction) between two planets, if any. */
function findMutualAspect(aspects: AspectEdge[], a: string, b: string): AspectEdge | null {
  return (
    aspects.find((e) => e.from === a && e.toPlanets.includes(b)) ??
    aspects.find((e) => e.from === b && e.toPlanets.includes(a)) ??
    null
  )
}

function findConjunction(conjunctions: Conjunction[], a: string, b: string): Conjunction | null {
  return conjunctions.find((c) => c.planets.includes(a) && c.planets.includes(b)) ?? null
}

function findParivartana(mutualReception: Parivartana[], a: string, b: string): Parivartana | null {
  return (
    mutualReception.find(
      (r) => (r.planet_a === a && r.planet_b === b) || (r.planet_a === b && r.planet_b === a)
    ) ?? null
  )
}

function detectRajaYoga(input: YogaInput): Yoga[] {
  const { houseLordsD1, planets, aspects, conjunctions, mutualReception } = input
  if (!houseLordsD1 || Object.keys(houseLordsD1).length === 0) return []

  // Distinct lords per kendra / trikona house (dedupe — one lord can own 2 houses).
  const kendraLords = new Set<string>()
  const trikonaLords = new Set<string>()
  for (const house of KENDRA_HOUSES) if (houseLordsD1[house]) kendraLords.add(houseLordsD1[house])
  for (const house of TRIKONA_HOUSES) if (houseLordsD1[house]) trikonaLords.add(houseLordsD1[house])

  const results: Yoga[] = []
  const seenPairs = new Set<string>()

  for (const kendraLord of kendraLords) {
    for (const trikonaLord of trikonaLords) {
      if (kendraLord === trikonaLord) continue // same planet owning both — not an association
      const pairKey = [kendraLord, trikonaLord].sort().join('/')
      if (seenPairs.has(pairKey)) continue

      const conjunction = findConjunction(conjunctions, kendraLord, trikonaLord)
      const aspect = findMutualAspect(aspects, kendraLord, trikonaLord)
      const parivartana = findParivartana(mutualReception, kendraLord, trikonaLord)
      const linkage: YogaEvidence['linkage'] | null = conjunction
        ? 'conjunction'
        : aspect
        ? 'graha_aspect'
        : parivartana
        ? 'parivartana'
        : null
      if (!linkage) continue

      seenPairs.add(pairKey)

      // DKA: specifically the 9th-lord + 10th-lord case.
      const isDka =
        (houseLordsD1[9] === kendraLord || houseLordsD1[9] === trikonaLord) &&
        (houseLordsD1[10] === kendraLord || houseLordsD1[10] === trikonaLord) &&
        houseLordsD1[9] !== houseLordsD1[10]

      const kendraPlanet = findPlanet(planets, kendraLord)
      const trikonaPlanet = findPlanet(planets, trikonaLord)
      const d1Signs = buildD1SignMap(planets)
      const kendraDignity = kendraPlanet
        ? getVargaDignityLabel(kendraLord, kendraPlanet.signNumber, d1Signs)
        : undefined
      const trikonaDignity = trikonaPlanet
        ? getVargaDignityLabel(trikonaLord, trikonaPlanet.signNumber, d1Signs)
        : undefined

      const kendraCombust = findCombustion(input.combustion, kendraLord)?.combust ?? false
      const trikonaCombust = findCombustion(input.combustion, trikonaLord)?.combust ?? false

      let strength: YogaStrength = 'moderate'
      const bothDignified =
        (!kendraDignity || STRONG_DIGNITY.has(kendraDignity)) &&
        (!trikonaDignity || STRONG_DIGNITY.has(trikonaDignity))
      if (bothDignified && !kendraCombust && !trikonaCombust) strength = 'strong'
      if ((kendraDignity && WEAK_DIGNITY.has(kendraDignity)) || (trikonaDignity && WEAK_DIGNITY.has(trikonaDignity))) {
        strength = 'weak'
      }

      const houses = [
        ...ownedHousesOf(kendraLord, houseLordsD1),
        ...ownedHousesOf(trikonaLord, houseLordsD1),
      ]
      const uniqueHouses = [...new Set(houses)].sort((a, b) => a - b)

      const evidence: YogaEvidence = {
        rule: isDka ? 'raja.dka' : 'raja.kendra_trikona',
        linkage,
        ownedHouses: {
          [kendraLord]: ownedHousesOf(kendraLord, houseLordsD1),
          [trikonaLord]: ownedHousesOf(trikonaLord, houseLordsD1),
        },
        dignity: {
          ...(kendraDignity ? { [kendraLord]: kendraDignity } : {}),
          ...(trikonaDignity ? { [trikonaLord]: trikonaDignity } : {}),
        },
      }
      const afflictions: YogaEvidence['afflictions'] = []
      if (kendraCombust) afflictions.push({ planet: kendraLord, kind: 'combust' })
      if (trikonaCombust) afflictions.push({ planet: trikonaLord, kind: 'combust' })
      if (afflictions.length) evidence.afflictions = afflictions

      results.push({
        key: isDka ? 'raja.dka' : 'raja.kendra_trikona',
        name: isDka ? 'Dharma-Karmadhipati Raja Yoga' : 'Raja Yoga (kendra-trikona)',
        category: 'raja',
        planets: [kendraLord, trikonaLord].sort(),
        houses: uniqueHouses,
        benefic: true,
        strength,
        activatingPlanets: [kendraLord, trikonaLord],
        evidence,
      })
    }
  }

  return results
}

// ─── Detector 4: Dhana Yoga ──────────────────────────────────────────
// Association (conjunction / mutual aspect / parivartana) among the lords of the
// wealth houses {2,5,9,11} and the lagna lord (Requirement 2.4, F4 part).

const DHANA_HOUSES = new Set([2, 5, 9, 11])

function detectDhanaYoga(input: YogaInput): Yoga[] {
  const { houseLordsD1, planets, aspects, conjunctions, mutualReception } = input
  if (!houseLordsD1 || Object.keys(houseLordsD1).length === 0) return []

  const dhanaAndLagnaHouses = new Set([...DHANA_HOUSES, 1])
  const lords = new Set<string>()
  for (const house of dhanaAndLagnaHouses) if (houseLordsD1[house]) lords.add(houseLordsD1[house])

  const lordList = [...lords]
  const results: Yoga[] = []
  const seenPairs = new Set<string>()

  for (let i = 0; i < lordList.length; i++) {
    for (let j = i + 1; j < lordList.length; j++) {
      const a = lordList[i]
      const b = lordList[j]
      if (a === b) continue
      const pairKey = [a, b].sort().join('/')
      if (seenPairs.has(pairKey)) continue

      const conjunction = findConjunction(conjunctions, a, b)
      const aspect = findMutualAspect(aspects, a, b)
      const parivartana = findParivartana(mutualReception, a, b)
      const linkage: YogaEvidence['linkage'] | null = conjunction
        ? 'conjunction'
        : aspect
        ? 'graha_aspect'
        : parivartana
        ? 'parivartana'
        : null
      if (!linkage) continue

      seenPairs.add(pairKey)

      const d1Signs = buildD1SignMap(planets)
      const dignities: Record<string, string> = {}
      for (const lord of [a, b]) {
        const p = findPlanet(planets, lord)
        const label = p ? getVargaDignityLabel(lord, p.signNumber, d1Signs) : undefined
        if (label) dignities[lord] = label
      }
      const dignifiedCount = Object.values(dignities).filter((l) => STRONG_DIGNITY.has(l)).length
      const strength: YogaStrength = dignifiedCount === 2 ? 'strong' : dignifiedCount === 1 ? 'moderate' : 'weak'

      const houses = [...new Set([...ownedHousesOf(a, houseLordsD1), ...ownedHousesOf(b, houseLordsD1)])].sort(
        (x, y) => x - y
      )

      results.push({
        key: 'dhana.association',
        name: 'Dhana Yoga',
        category: 'dhana',
        planets: [a, b].sort(),
        houses,
        benefic: true,
        strength,
        activatingPlanets: [a, b],
        evidence: {
          rule: 'dhana.association',
          linkage,
          ownedHouses: { [a]: ownedHousesOf(a, houseLordsD1), [b]: ownedHousesOf(b, houseLordsD1) },
          dignity: dignities,
        },
      })
    }
  }

  return results
}

// ─── Detector 5: Viparita Raja Yoga ──────────────────────────────────
// Lord of 6/8/12 placed in a (possibly different) 6/8/12 house.
// Harsha = 6th lord in 6/8/12, Sarala = 8th lord, Vimala = 12th lord.
// Classically benefic-in-outcome despite dusthana inputs (Requirement 2.5, F4 part).

const VIPARITA_HOUSES: Record<number, { key: string; name: string }> = {
  6: { key: 'viparita.harsha', name: 'Harsha Yoga' },
  8: { key: 'viparita.sarala', name: 'Sarala Yoga' },
  12: { key: 'viparita.vimala', name: 'Vimala Yoga' },
}

function detectViparitaYoga(input: YogaInput): Yoga[] {
  const { houseLordsD1, planets } = input
  if (!houseLordsD1 || Object.keys(houseLordsD1).length === 0) return []

  const dusthana = new Set([6, 8, 12])
  const results: Yoga[] = []

  for (const [houseStr, meta] of Object.entries(VIPARITA_HOUSES)) {
    const ownerHouse = Number(houseStr)
    const lord = houseLordsD1[ownerHouse]
    if (!lord) continue
    const p = findPlanet(planets, lord)
    if (!p || !dusthana.has(p.house)) continue

    const strength: YogaStrength = p.house === ownerHouse ? 'strong' : 'moderate'

    results.push({
      key: meta.key,
      name: meta.name,
      category: 'viparita',
      planets: [lord],
      houses: [ownerHouse, p.house].filter((h, i, arr) => arr.indexOf(h) === i).sort((a, b) => a - b),
      benefic: true,
      strength,
      activatingPlanets: [lord],
      evidence: {
        rule: meta.key,
        linkage: 'placement',
        ownedHouses: { [lord]: ownedHousesOf(lord, houseLordsD1) },
        notes: [`${lord} owns H${ownerHouse}, placed in H${p.house} (dusthana-in-dusthana cancellation)`],
      },
    })
  }

  return results
}

// ─── Detector 9: Parivartana (projection) ────────────────────────────
// Projects relationships.mutualReception entries by their existing exchange_type.
// This is a PROJECTION, not a re-derivation (Requirement 2.9).

const PARIVARTANA_META: Record<Parivartana['exchange_type'], { key: string; name: string; strength: YogaStrength; benefic: boolean }> = {
  maha:   { key: 'parivartana.maha',   name: 'Maha Parivartana Yoga',   strength: 'strong',   benefic: true },
  simple: { key: 'parivartana.simple', name: 'Simple Parivartana Yoga', strength: 'moderate', benefic: true },
  kahala: { key: 'parivartana.kahala', name: 'Kahala Parivartana Yoga', strength: 'moderate', benefic: true },
  dainya: { key: 'parivartana.dainya', name: 'Dainya Parivartana Yoga', strength: 'weak',      benefic: false },
}

function detectParivartana(input: YogaInput): Yoga[] {
  return (input.mutualReception ?? []).map((r) => {
    const meta = PARIVARTANA_META[r.exchange_type]
    return {
      key: meta.key,
      name: meta.name,
      category: 'parivartana' as YogaCategory,
      planets: [r.planet_a, r.planet_b].sort(),
      houses: [r.house_a, r.house_b].sort((a, b) => a - b),
      benefic: meta.benefic,
      strength: meta.strength,
      activatingPlanets: [r.planet_a, r.planet_b],
      evidence: {
        rule: meta.key,
        linkage: 'parivartana',
        notes: [`${r.planet_a} (${r.sign_a}/H${r.house_a}) ↔ ${r.planet_b} (${r.sign_b}/H${r.house_b})`],
      },
    }
  })
}

// ─── Detector 6: Neechabhanga Raja Yoga ──────────────────────────────
// A debilitated planet whose debilitation is cancelled by the documented BPHS
// conditions: the debilitation-sign's dispositor OR the planet exalted in that
// sign sits in a kendra (1/4/7/10) from lagna OR from the Moon. Lifted verbatim
// from the tables previously duplicated in engine/durationAnalysis/slicer.ts —
// this engine is now the single source of truth (Requirement 2.6, 5.1).

/** Dispositor of each planet's DEBILITATION sign (BPHS Neechabhanga rule 1). */
const DEBIL_SIGN_LORD: Record<string, string> = {
  Sun: 'Venus',       // debil in Libra → Venus
  Moon: 'Mars',       // debil in Scorpio → Mars
  Mars: 'Moon',       // debil in Cancer → Moon
  Mercury: 'Jupiter', // debil in Pisces → Jupiter
  Jupiter: 'Saturn',  // debil in Capricorn → Saturn
  Venus: 'Mercury',   // debil in Virgo → Mercury
  Saturn: 'Mars',     // debil in Aries → Mars
}

/** Planet EXALTED in each planet's debilitation sign (BPHS Neechabhanga rule 2). */
const EXALT_PLANET_IN_DEBIL_SIGN: Record<string, string> = {
  Sun: 'Saturn',      // Sun debil in Libra; Saturn exalts in Libra
  Moon: 'Mars',       // Moon debil in Scorpio; no classical exalt in Scorpio → use debil lord (Mars)
  Mars: 'Jupiter',    // Mars debil in Cancer; Jupiter exalts in Cancer
  Mercury: 'Venus',   // Mercury debil in Pisces; Venus exalts in Pisces
  Jupiter: 'Mars',    // Jupiter debil in Capricorn; Mars exalts in Capricorn
  Venus: 'Mercury',   // Venus debil in Virgo; Mercury exalts in Virgo
  Saturn: 'Sun',      // Saturn debil in Aries; Sun exalts in Aries
}

function detectNeechabhanga(input: YogaInput): Yoga[] {
  const { planets } = input
  if (!planets?.length) return []
  const moon = findPlanet(planets, 'Moon')
  const results: Yoga[] = []

  for (const [planetName, debilSign] of Object.entries(DEBILITATION_SIGNS)) {
    const p = findPlanet(planets, planetName)
    if (!p || p.signNumber !== debilSign) continue // not debilitated — nothing to cancel

    const candidateNames = [DEBIL_SIGN_LORD[planetName], EXALT_PLANET_IN_DEBIL_SIGN[planetName]].filter(
      (n): n is string => Boolean(n)
    )

    let cancelSource: string | null = null
    let cancelVia: 'lagna' | 'moon' | null = null
    for (const candidate of candidateNames) {
      const cp = findPlanet(planets, candidate)
      if (!cp) continue
      if (KENDRA_HOUSES.has(cp.house)) {
        cancelSource = candidate
        cancelVia = 'lagna'
        break
      }
      if (moon) {
        const nthFromMoon = ((cp.house - moon.house + 12) % 12) + 1
        if (KENDRA_HOUSES.has(nthFromMoon)) {
          cancelSource = candidate
          cancelVia = 'moon'
          break
        }
      }
    }
    if (!cancelSource) continue

    const combustion = findCombustion(input.combustion, planetName)
    const evidence: YogaEvidence = {
      rule: 'neechabhanga.cancellation',
      linkage: 'placement',
      dignity: { [planetName]: 'debilitated' },
      notes: [`Cancelled by ${cancelSource} in kendra from ${cancelVia === 'lagna' ? 'lagna' : 'Moon'}`],
    }
    if (combustion?.combust) {
      evidence.afflictions = [
        { planet: planetName, kind: 'combust', detail: `degreeFromSun ${combustion.degreeFromSun}` },
      ]
    }

    results.push({
      key: 'neechabhanga.cancellation',
      name: 'Neechabhanga Raja Yoga',
      category: 'neechabhanga',
      planets: [planetName],
      houses: [p.house],
      benefic: true,
      strength: 'moderate', // v1 flat grade — see design.md Detector 6
      activatingPlanets: [planetName],
      evidence,
    })
  }

  return results
}

// ─── Detector 10: Kartari Yoga (Papa / Shubha) ───────────────────────
// The lagna hemmed between malefics (Papa) or benefics (Shubha) in the 2nd and
// 12th houses from it. Benefic/malefic classification reuses `isNaturalBenefic`
// (Requirement 2.10). v1 scope: lagna only (the classical BPHS convention);
// per-house generalization is deferred. Mercury/Venus/Moon conditional
// classification uses combustion where available; Moon's waxing/waning state is
// not part of YogaInput, so `isNaturalBenefic`'s default (waxing) is used — a
// documented v1 simplification, recorded in evidence.notes.

function detectKartari(input: YogaInput): Yoga[] {
  const { planets, combustion } = input
  if (!planets?.length) return []

  const lagnaHouse = 1
  const house2 = houseFrom(lagnaHouse, 2)
  const house12 = houseFrom(lagnaHouse, 12)
  const planetsIn2 = planets.filter((p) => p.house === house2)
  const planetsIn12 = planets.filter((p) => p.house === house12)
  // Kartari ("scissors") requires the lagna to be HEMMED — both the 2nd AND the
  // 12th must be occupied. A planet on only one side is not a hemming (guards a
  // one-sided false positive, e.g. a lone malefic in H2 with an empty H12).
  if (planetsIn2.length === 0 || planetsIn12.length === 0) return []

  const classified = [...planetsIn2, ...planetsIn12].map((p) => {
    const isCombust = findCombustion(combustion, p.planet)?.combust ?? false
    return { planet: p.planet, house: p.house, benefic: isNaturalBenefic(p.planet, { combust: isCombust }) }
  })

  const allBenefic = classified.every((c) => c.benefic)
  const allMalefic = classified.every((c) => !c.benefic)
  if (!allBenefic && !allMalefic) return []

  const notes = [
    `Flanking planets: ${classified.map((c) => `${c.planet} (H${c.house})`).join(', ')}`,
    "v1: lagna only; Moon classified as waxing-benefic by default (waxing/waning state not modeled here)",
  ]

  if (allBenefic) {
    return [{
      key: 'kartari.shubha',
      name: 'Shubha Kartari Yoga',
      category: 'kartari',
      planets: classified.map((c) => c.planet).sort(),
      houses: [lagnaHouse, house2, house12].sort((a, b) => a - b),
      benefic: true,
      strength: 'moderate',
      activatingPlanets: classified.map((c) => c.planet),
      evidence: { rule: 'kartari.shubha', linkage: 'placement', notes },
    }]
  }

  return [{
    key: 'kartari.papa',
    name: 'Papa Kartari Yoga',
    category: 'kartari',
    planets: classified.map((c) => c.planet).sort(),
    houses: [lagnaHouse, house2, house12].sort((a, b) => a - b),
    benefic: false,
    strength: 'moderate',
    activatingPlanets: classified.map((c) => c.planet),
    evidence: { rule: 'kartari.papa', linkage: 'placement', notes },
  }]
}

// ─── Detector registry ──────────────────────────────────────────────

type Detector = (input: YogaInput) => Yoga[]

const YOGA_REGISTRY: Detector[] = [
  detectPanchaMahapurusha, // 1
  detectGajaKesari,        // 2
  detectRajaYoga,          // 3 (incl. raja.dka — F5 seam)
  detectDhanaYoga,         // 4
  detectViparitaYoga,      // 5 (F4 part)
  detectNeechabhanga,      // 6
  detectLunarYogas,        // 7
  detectBudhaAditya,       // 8
  detectParivartana,       // 9
  detectKartari,           // 10
]

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Compute the full named-yoga catalogue for a chart. Pure, deterministic, never
 * throws. Runs every registered detector; a detector that throws or is otherwise
 * unable to evaluate is skipped (its contribution is dropped, not the whole call).
 */
export function computeYogas(input: YogaInput): Yoga[] {
  const results: Yoga[] = []
  for (const detector of YOGA_REGISTRY) {
    try {
      const found = detector(input)
      if (Array.isArray(found) && found.length > 0) results.push(...found)
    } catch {
      // Never throw — a misbehaving detector is swallowed; the rest still run.
      continue
    }
  }
  return sortYogas(results)
}

// Re-exported for detector modules / tests in later tasks.
export {
  findPlanet,
  houseFrom,
  buildD1SignMap,
  findCombustion,
  SIGN_LORDS,
  isNaturalBenefic,
  getVargaDignityLabel,
  EXALTATION_SIGNS,
  OWN_SIGNS,
  MOOLATRIKONA_SIGNS,
  DEBILITATION_SIGNS,
}
export type { YogaCategory, YogaStrength, YogaEvidence }
