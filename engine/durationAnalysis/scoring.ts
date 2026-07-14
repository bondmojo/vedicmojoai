/**
 * engine/durationAnalysis/scoring.ts — Deterministic Period Scoring Engine (Phase 1).
 *
 * COMPUTE-FIRST, LLM-NARRATES CONTRACT
 * This engine produces a deterministic integer score (0–100), intensity band,
 * favorable flag, and an itemized ScoreBreakdown for every dasha period.
 * DA-1 receives these as authoritative and may only produce narrative prose.
 *
 * PURITY GUARANTEE: no LLM calls, no network, no DB, no file I/O.
 * Never throws on missing/malformed data — omits the affected factor, records
 * the omission, and scores from the remaining available factors.
 *
 * ⚠  Phase 1 weights are PROVISIONAL / UNCALIBRATED — scores must not be
 *    presented to end clients as calibrated until the Phase 2 Calibration_Gate.
 */

import type {
  DashaSlice,
  ScoringChartData,
  ScoreBreakdown,
  ScoreFactorContribution,
  ScoreOmission,
  ScoringFactorKey,
  PeakPeriod,
  ScoredDashaSlice,
  DomainScoringWeights,
} from '@/lib/durationTypes'
import type { TransitOverlay } from '@/lib/durationTypes'
import type { ShadbalPlanet } from '@/engine/compute/types'
import { WEIGHTS_VERSION } from './scoringWeights'

// ─── Exported constants (Requirements 2, 3.6) ────────────────────────

/** score ≥ 50 → favorable */
export const FAVORABLE_THRESHOLD = 50
/** |score − 50| ≥ 25 → 'high' intensity */
export const INTENSITY_HIGH_DELTA = 25
/** 12 ≤ |score − 50| < 25 → 'medium' intensity; else 'low' */
export const INTENSITY_MEDIUM_DELTA = 12
/** Period only qualifies as a peak when |score − 50| ≥ this (Req 3.6/3.7) */
export const PEAK_SIGNIFICANCE_DELTA = 12

/**
 * Calibration constant for the absolute Bhava Bala fallback normalization.
 * PROVISIONAL — calibrated against the Sanity_Backtest fixtures in task 10.4.
 * Intentionally > 8 (the old wrong cap) to avoid saturating real house strengths.
 */
export const BHAVA_RUPAS_CALIBRATION = 12

/** Mean SAV bindus per house (337 total / 12 houses ≈ 28). Used by natalHouseStrength. */
export const SAV_MEAN = 28

// ─── Internal dignity / friendship tables ────────────────────────────

const EXALTATION_SIGNS: Record<string, number> = {
  Sun: 1, Moon: 2, Mars: 10, Mercury: 6, Jupiter: 4, Venus: 12, Saturn: 7,
}
const DEBILITATION_SIGNS: Record<string, number> = {
  Sun: 7, Moon: 8, Mars: 4, Mercury: 12, Jupiter: 10, Venus: 6, Saturn: 1,
}
const MOOLATRIKONA_SIGNS: Record<string, number> = {
  Sun: 5, Moon: 2, Mars: 1, Mercury: 6, Jupiter: 9, Venus: 7, Saturn: 11,
}
const OWN_SIGNS: Record<string, number[]> = {
  Sun: [5], Moon: [4], Mars: [1, 8], Mercury: [3, 6],
  Jupiter: [9, 12], Venus: [2, 7], Saturn: [10, 11],
}
const SIGN_LORDS: Record<number, string> = {
  1: 'Mars', 2: 'Venus', 3: 'Mercury', 4: 'Moon', 5: 'Sun', 6: 'Mercury',
  7: 'Venus', 8: 'Mars', 9: 'Jupiter', 10: 'Saturn', 11: 'Saturn', 12: 'Jupiter',
}
const PERMANENT_FRIENDS: Record<string, string[]> = {
  Sun: ['Moon', 'Mars', 'Jupiter'],
  Moon: ['Sun', 'Mercury'],
  Mars: ['Sun', 'Moon', 'Jupiter'],
  Mercury: ['Sun', 'Venus'],
  Jupiter: ['Sun', 'Moon', 'Mars'],
  Venus: ['Mercury', 'Saturn'],
  Saturn: ['Mercury', 'Venus'],
}
const PERMANENT_ENEMIES: Record<string, string[]> = {
  Sun: ['Venus', 'Saturn'],
  Moon: [],
  Mars: ['Mercury'],
  Mercury: ['Moon'],
  Jupiter: ['Mercury', 'Venus'],
  Venus: ['Sun', 'Moon'],
  Saturn: ['Sun', 'Moon', 'Mars'],
}

// ─── Small helpers ────────────────────────────────────────────────────

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

/** Wrap a house number into the 1–12 range. */
function wrapHouse(h: number): number {
  return ((h - 1) % 12 + 12) % 12 + 1
}

/** Wrap a sign number into the 1–12 range. */
function wrapSign(s: number): number {
  return ((s - 1) % 12 + 12) % 12 + 1
}

/**
 * Derive the lagna (ascendant) sign number from any planet's signNumber + house.
 * In whole-sign houses: house = ((signNumber − lagnaSign) mod 12) + 1, so
 * lagnaSign = ((signNumber − 1) − (house − 1)) mod 12 + 1.
 * Returns null when no usable planet is available.
 */
function deriveLagnaSign(planets: ScoringChartData['planets']): number | null {
  if (!planets || planets.length === 0) return null
  for (const p of planets) {
    if (p.signNumber >= 1 && p.signNumber <= 12 && p.house >= 1 && p.house <= 12) {
      return wrapSign((p.signNumber - 1) - (p.house - 1) + 1)
    }
  }
  return null
}

/** Convert an owned/occupied sign number to its house-from-lagna. */
function signToHouse(signNumber: number, lagnaSign: number): number {
  return wrapHouse(signNumber - lagnaSign + 1)
}

/** Convert a house-from-lagna to its sign number. */
function houseToSign(house: number, lagnaSign: number): number {
  return wrapSign(lagnaSign + house - 1)
}

/** Lookup a natal planet by name — returns null when absent (graceful degradation). */
function findPlanet(
  planets: ScoringChartData['planets'],
  name: string
): { signNumber: number; house: number } | null {
  if (!planets) return null
  const p = planets.find((pl) => pl.planet === name)
  return p ? { signNumber: p.signNumber, house: p.house } : null
}

/** Lookup Shadbala data for a planet by name. Returns null when absent. */
function findShadbala(
  shadbala: ScoringChartData['shadbala'],
  name: string
): ShadbalPlanet | null {
  if (!shadbala?.planets) return null
  return shadbala.planets.find((p) => p.planet === name) ?? null
}

/** Derive dignities from sign number. Returns 'exalted'|'moolatrikona'|'own'|'great_friend'|
 *  'friend'|'neutral'|'enemy'|'great_enemy'|'debilitated'. */
function getDignityLabel(
  planet: string,
  signNumber: number,
  residingPlanetSignNumbers: number[]
): string {
  if (EXALTATION_SIGNS[planet] === signNumber) return 'exalted'
  if (DEBILITATION_SIGNS[planet] === signNumber) return 'debilitated'
  if (MOOLATRIKONA_SIGNS[planet] === signNumber) return 'moolatrikona'
  if (OWN_SIGNS[planet]?.includes(signNumber)) return 'own'

  // Permanent friendship with the sign's lord
  const signLord = SIGN_LORDS[signNumber]
  if (!signLord) return 'neutral'

  // Temporary (tatkalika) friendship: planets in 2/3/4/10/11/12 from each other
  const tempFriendHouses = new Set([2, 3, 4, 10, 11, 12])
  let tempFriend = false
  let tempEnemy = false
  for (const otherSign of residingPlanetSignNumbers) {
    const dist = ((otherSign - signNumber + 12) % 12) + 1
    if (tempFriendHouses.has(dist)) tempFriend = true
    else tempEnemy = true
  }

  const permFriends = PERMANENT_FRIENDS[planet] ?? []
  const permEnemies = PERMANENT_ENEMIES[planet] ?? []
  const isPermanentFriend = permFriends.includes(signLord)
  const isPermanentEnemy = permEnemies.includes(signLord)

  // Compound (naisargika + tatkalika)
  if (isPermanentFriend && tempFriend) return 'great_friend'
  if (isPermanentFriend && !tempEnemy) return 'friend'
  if (isPermanentEnemy && tempEnemy) return 'great_enemy'
  if (isPermanentEnemy && !tempFriend) return 'enemy'
  return 'neutral'
}

/** Map a dignity label to a normalized value n ∈ [0,1]. */
function dignityToNormalized(label: string): number {
  switch (label) {
    case 'exalted':      return 1.0
    case 'moolatrikona': return 0.9
    case 'own':          return 0.8
    case 'great_friend': return 0.7
    case 'friend':       return 0.6
    case 'neutral':      return 0.5
    case 'enemy':        return 0.3
    case 'great_enemy':  return 0.2
    case 'debilitated':  return 0.0
    default:             return 0.5
  }
}

// ─── Factor builders — 11 original factors (task 4.1a) ───────────────

type FactorResult =
  | { ok: true; normalized: number; value: unknown }
  | { ok: false; reason: string }

/** Lord dignity — reads signNumber from chartData.planets, handles Neechabhanga. */
function factorLordDignity(
  lord: string,
  chartData: ScoringChartData,
  activatedYogas: string[]
): FactorResult {
  const p = findPlanet(chartData.planets, lord)
  if (!p) return { ok: false, reason: `planet "${lord}" not found in chartData.planets` }

  const otherSigns = (chartData.planets ?? [])
    .filter((pl) => pl.planet !== lord)
    .map((pl) => pl.signNumber)

  let label = getDignityLabel(lord, p.signNumber, otherSigns)

  // Neechabhanga lift: a debilitated lord is lifted to neutral ONLY when the
  // cancellation yoga names THIS lord. The slicer emits
  // "Neechabhanga active — <lord> debilitation cancelled", so we match the lord
  // explicitly — otherwise the MD lord's cancellation would wrongly lift a
  // debilitated AD/PD lord (and vice-versa).
  const neechabhanga = activatedYogas.some(
    (y) => y.startsWith('Neechabhanga active') && y.includes(`${lord} debilitation cancelled`)
  )
  if (label === 'debilitated' && neechabhanga) label = 'neutral'

  return { ok: true, normalized: dignityToNormalized(label), value: label }
}

/** Average Shadbala strengthRatio for a set of lords. */
function factorShadbala(lords: string[], chartData: ScoringChartData): FactorResult {
  const ratios: number[] = []
  for (const lord of lords) {
    const s = findShadbala(chartData.shadbala, lord)
    if (s?.strengthRatio != null) ratios.push(s.strengthRatio)
  }
  if (ratios.length === 0) return { ok: false, reason: 'shadbala not available' }
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length
  return { ok: true, normalized: clamp(avg / 1.5, 0, 1), value: avg }
}

/** Average Ishta/Kashta beneficRatio (already 0–1). */
function factorIshtaKashta(lords: string[], chartData: ScoringChartData): FactorResult {
  const ratios: number[] = []
  for (const lord of lords) {
    const s = findShadbala(chartData.shadbala, lord)
    if (s?.beneficRatio != null) ratios.push(s.beneficRatio)
  }
  if (ratios.length === 0) return { ok: false, reason: 'shadbala (ishtaKashta) not available' }
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length
  return { ok: true, normalized: clamp(avg, 0, 1), value: avg }
}

/** House ownership: benefic/malefic houses + dusthana penalty → centered [0,1]. */
function factorHouseOwnership(
  lords: string[],
  chartData: ScoringChartData,
  domainWeights: DomainScoringWeights
): FactorResult {
  const planets = chartData.planets
  if (!planets) return { ok: false, reason: 'planets not available' }

  const lagnaSign = deriveLagnaSign(planets)
  if (lagnaSign == null) return { ok: false, reason: 'cannot derive lagna from planets' }

  const dusthana = new Set([6, 8, 12])
  const benefic = new Set(domainWeights.beneficHouses)
  const malefic = new Set(domainWeights.maleficHouses)

  let totalPoints = 0
  let lordCount = 0

  for (const lord of lords) {
    const p = planets.find((pl) => pl.planet === lord)
    if (!p) continue
    lordCount++

    let pts = 0

    // Occupies — p.house is already the house-from-lagna
    if (benefic.has(p.house)) pts += 1
    if (malefic.has(p.house)) pts -= 1
    if (dusthana.has(p.house)) pts -= 1

    // Owns — map each owned SIGN to its HOUSE-from-lagna before comparing
    const ownedSigns = Object.entries(SIGN_LORDS)
      .filter(([, l]) => l === lord)
      .map(([s]) => Number(s))
    for (const ownedSign of ownedSigns) {
      const ownedHouse = signToHouse(ownedSign, lagnaSign)
      if (benefic.has(ownedHouse)) pts += 1
      if (malefic.has(ownedHouse)) pts -= 1
      if (dusthana.has(ownedHouse)) pts -= 1
    }

    totalPoints += pts
  }

  if (lordCount === 0) return { ok: false, reason: 'no lord found in planets' }
  const avg = totalPoints / lordCount
  const normalized = clamp(0.5 + avg * 0.15, 0, 1)
  return { ok: true, normalized, value: avg }
}

/** Karaka Role: running lords vs domain relevantKarakaRoles. */
function factorKarakaRole(
  mdKaraka: string | null,
  adKaraka: string | null,
  domainWeights: DomainScoringWeights
): FactorResult {
  const relevant = new Set(domainWeights.relevantKarakaRoles)
  if (relevant.size === 0) return { ok: true, normalized: 0.5, value: 'neutral (no karakaRoles for domain)' }

  if (mdKaraka && relevant.has(mdKaraka)) return { ok: true, normalized: 1.0, value: `MD matches: ${mdKaraka}` }
  if (adKaraka && relevant.has(adKaraka)) return { ok: true, normalized: 0.8, value: `AD matches: ${adKaraka}` }
  return { ok: true, normalized: 0.5, value: 'no match' }
}

/** Activated yogas count → [0.5, 0.95]. */
function factorActivatedYogas(activatedYogas: string[]): FactorResult {
  const count = activatedYogas.length
  const normalized = clamp(0.5 + Math.min(count, 3) * 0.15, 0, 1)
  return { ok: true, normalized, value: count }
}

/** Bhava Bala for houses activated by running lords — relative normalization. */
function factorBhavaBala(
  lords: string[],
  chartData: ScoringChartData
): FactorResult {
  const bhavaBala = chartData.bhavaBala
  if (!bhavaBala?.houses || bhavaBala.houses.length === 0) {
    return { ok: false, reason: 'bhavaBala not available' }
  }
  const planets = chartData.planets
  if (!planets) return { ok: false, reason: 'planets not available for bhavaBala house lookup' }

  const lagnaSign = deriveLagnaSign(planets)
  if (lagnaSign == null) return { ok: false, reason: 'cannot derive lagna for bhavaBala house lookup' }

  // Collect houses occupied/owned by lords (owned SIGNS mapped to HOUSES via lagna)
  const activatedHouses = new Set<number>()
  for (const lord of lords) {
    const p = planets.find((pl) => pl.planet === lord)
    if (p) activatedHouses.add(p.house)  // occupancy — already house-from-lagna
    for (const [sn, l] of Object.entries(SIGN_LORDS)) {
      if (l === lord) activatedHouses.add(signToHouse(Number(sn), lagnaSign))
    }
  }

  const activatedRupas: number[] = []
  for (const h of activatedHouses) {
    const entry = bhavaBala.houses.find((bh) => bh.house === h)
    if (entry?.rupas != null) activatedRupas.push(entry.rupas)
  }

  if (activatedRupas.length === 0) return { ok: false, reason: 'no activated houses found in bhavaBala' }

  const avgRupas = activatedRupas.reduce((a, b) => a + b, 0) / activatedRupas.length

  // Relative normalization (default): rank against chart min/max
  const allRupas = bhavaBala.houses.map((h) => h.rupas).filter((r) => r != null)
  let normalized: number
  if (allRupas.length >= 2) {
    const minR = Math.min(...allRupas)
    const maxR = Math.max(...allRupas)
    normalized = maxR === minR ? 0.5 : clamp((avgRupas - minR) / (maxR - minR), 0, 1)
  } else {
    // Absolute fallback with BHAVA_RUPAS_CALIBRATION
    normalized = clamp(avgRupas / BHAVA_RUPAS_CALIBRATION, 0, 1)
  }

  return { ok: true, normalized, value: avgRupas }
}

/** Transit BAV (Saturn + Jupiter avg bindus / 8). */
function factorTransitBav(overlay: TransitOverlay | null): FactorResult {
  if (!overlay) return { ok: false, reason: 'transitOverlay not available' }
  const scores = [overlay.saturnBavScore, overlay.jupiterBavScore].filter((s) => s >= 0)
  if (scores.length === 0) return { ok: false, reason: 'BAV scores unavailable (-1)' }
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  return { ok: true, normalized: clamp(avg / 8, 0, 1), value: avg }
}

/** Saturn afflictions (Sade Sati, ashtamaShani, kantakaShani). */
function factorSaturnAfflictions(overlay: TransitOverlay | null): FactorResult {
  if (!overlay) return { ok: false, reason: 'transitOverlay not available' }

  let score = 1.0
  if (overlay.sadeSatiActive) {
    if (overlay.sadeSatiPhase === 'peak') score -= 0.4
    else score -= 0.2  // rising or setting
  }
  if (overlay.ashtamaShani) score -= 0.3
  if (overlay.kantakaShani) score -= 0.2

  return { ok: true, normalized: clamp(score, 0, 1), value: {
    sadeSati: overlay.sadeSatiActive ? overlay.sadeSatiPhase : null,
    ashtamaShani: overlay.ashtamaShani,
    kantakaShani: overlay.kantakaShani,
  }}
}

// ─── Factor builders — 4 new factors (task 4.1b) ─────────────────────

/** Natural Karaka relevance: running lords vs domain relevantNaturalKarakas. */
function factorNaturalKaraka(
  mdLord: string,
  adLord: string,
  pdLord: string,
  domainWeights: DomainScoringWeights
): FactorResult {
  const relevant = new Set(domainWeights.relevantNaturalKarakas)
  if (relevant.size === 0) return { ok: true, normalized: 0.5, value: 'neutral (no natural karakas for domain)' }

  if (relevant.has(mdLord)) return { ok: true, normalized: 1.0, value: `MD matches: ${mdLord}` }
  if (relevant.has(adLord)) return { ok: true, normalized: 0.75, value: `AD matches: ${adLord}` }
  if (relevant.has(pdLord)) return { ok: true, normalized: 0.65, value: `PD matches: ${pdLord}` }
  return { ok: true, normalized: 0.5, value: 'no match' }
}

/**
 * Domain House Activation — double transit (Saturn + Jupiter) onto the domain's
 * primaryHouses OR the domain-house lord (Requirement 1.10). Considers direct
 * occupation and graha-drishti (7th for all; 3rd/10th for Saturn; 5th/9th for Jupiter).
 *
 * The domain-house lord limb: for each primary house, resolve its sign (via lagna)
 * and that sign's lord, then check whether transiting Saturn/Jupiter occupy or
 * aspect the LORD's natal house. This is skipped gracefully when planets/lagna
 * are unavailable — the primaryHouses limb still applies.
 */
function factorDomainHouseActivation(
  overlay: TransitOverlay | null,
  domainWeights: DomainScoringWeights,
  chartData: ScoringChartData
): FactorResult {
  if (!overlay) return { ok: false, reason: 'transitOverlay not available' }
  const primary = new Set(domainWeights.primaryHouses)

  function getAspectedHouses(houseFromLagna: number, planet: 'saturn' | 'jupiter'): Set<number> {
    const houses = new Set<number>()
    const wrap = (h: number) => ((h - 1 + 12) % 12) + 1
    houses.add(houseFromLagna)
    houses.add(wrap(houseFromLagna + 6))  // 7th aspect (all planets)
    if (planet === 'saturn') {
      houses.add(wrap(houseFromLagna + 2))  // 3rd aspect
      houses.add(wrap(houseFromLagna + 9))  // 10th aspect
    }
    if (planet === 'jupiter') {
      houses.add(wrap(houseFromLagna + 4))  // 5th aspect
      houses.add(wrap(houseFromLagna + 8))  // 9th aspect
    }
    return houses
  }

  const saturnAspects = getAspectedHouses(overlay.saturn.houseFromLagna, 'saturn')
  const jupiterAspects = getAspectedHouses(overlay.jupiter.houseFromLagna, 'jupiter')

  // Limb 1: transit onto the domain's primary house(s)
  let saturnActivates = [...primary].some((h) => saturnAspects.has(h))
  let jupiterActivates = [...primary].some((h) => jupiterAspects.has(h))

  // Limb 2 (Req 1.10): transit onto the domain-house LORD's natal house
  const lagnaSign = deriveLagnaSign(chartData.planets)
  if (lagnaSign != null && chartData.planets) {
    const domainLordHouses = new Set<number>()
    for (const h of primary) {
      const sign = houseToSign(h, lagnaSign)
      const lord = SIGN_LORDS[sign]
      const lp = chartData.planets.find((p) => p.planet === lord)
      if (lp) domainLordHouses.add(lp.house)
    }
    if ([...domainLordHouses].some((h) => saturnAspects.has(h))) saturnActivates = true
    if ([...domainLordHouses].some((h) => jupiterAspects.has(h))) jupiterActivates = true
  }

  if (saturnActivates && jupiterActivates) return { ok: true, normalized: 1.0, value: 'double transit' }
  if (saturnActivates || jupiterActivates) return { ok: true, normalized: 0.7, value: saturnActivates ? 'Saturn only' : 'Jupiter only' }
  return { ok: true, normalized: 0.5, value: 'no transit activation' }
}

/**
 * MD/AD relationship — permanent + temporary friendship with shashtashtaka penalty.
 * Permanent friendship uses the BPHS naisargika maitri table.
 * Temporary friendship: AD lord in 2/3/4/10/11/12 from MD lord = temp friend.
 * Shashtashtaka: AD lord in 6th or 8th from MD lord → penalty −0.3.
 */
function factorMdAdRelationship(
  mdLord: string,
  adLord: string,
  chartData: ScoringChartData
): FactorResult {
  const mdPlanet = findPlanet(chartData.planets, mdLord)
  const adPlanet = findPlanet(chartData.planets, adLord)
  if (!mdPlanet || !adPlanet) {
    return { ok: false, reason: `planet positions not available for mdAdRelationship (${mdLord}/${adLord})` }
  }

  // Permanent relationship of AD lord to MD lord (is adLord in MD lord's friend/enemy list?)
  const permFriends = PERMANENT_FRIENDS[mdLord] ?? []
  const permEnemies = PERMANENT_ENEMIES[mdLord] ?? []
  const isPermanentFriend = permFriends.includes(adLord)
  const isPermanentEnemy = permEnemies.includes(adLord)

  // Temporary (tatkalika) friendship: planets in 2/3/4/10/11/12 from each other
  const tempFriendHouses = new Set([2, 3, 4, 10, 11, 12])
  const houseOfAdFromMd = ((adPlanet.signNumber - mdPlanet.signNumber + 12) % 12) + 1
  const isTempFriend = tempFriendHouses.has(houseOfAdFromMd)

  // Compound relationship base score
  let base: number
  if (isPermanentFriend && isTempFriend) base = 1.0
  else if (isPermanentFriend && !isTempFriend) base = 0.65
  else if (isPermanentEnemy && !isTempFriend) base = 0.1
  else if (isPermanentEnemy && isTempFriend) base = 0.35
  else if (isTempFriend) base = 0.6    // neutral + temp friend
  else base = 0.4                       // neutral + temp enemy

  // Shashtashtaka penalty: AD in 6th or 8th from MD lord
  const shashtashtaka = houseOfAdFromMd === 6 || houseOfAdFromMd === 8
  if (shashtashtaka) base -= 0.3

  return { ok: true, normalized: clamp(base, 0, 1), value: {
    houseOfAdFromMd, isPermanentFriend, isPermanentEnemy, isTempFriend, shashtashtaka,
  }}
}

/**
 * Natal House Strength — SAV bindus for domain primaryHouses / (2 × SAV_MEAN).
 *
 * IMPORTANT: `ashtakavarga.sav` is a 12-element array indexed by SIGN
 * (sav[0] = Aries … sav[11] = Pisces), NOT by house-from-lagna. Each domain
 * primary HOUSE must be converted to its SIGN via the lagna before indexing.
 */
function factorNatalHouseStrength(
  chartData: ScoringChartData,
  domainWeights: DomainScoringWeights
): FactorResult {
  const sav = chartData.ashtakavarga?.sav
  if (!sav || sav.length < 12) return { ok: false, reason: 'ashtakavarga SAV not available' }

  const lagnaSign = deriveLagnaSign(chartData.planets)
  if (lagnaSign == null) return { ok: false, reason: 'cannot derive lagna for SAV house→sign mapping' }

  const primaryBindus = domainWeights.primaryHouses
    .map((h) => sav[houseToSign(h, lagnaSign) - 1])
    .filter((b): b is number => b != null)

  if (primaryBindus.length === 0) return { ok: false, reason: 'no SAV bindus for primaryHouses' }

  const avg = primaryBindus.reduce((a, b) => a + b, 0) / primaryBindus.length
  const normalized = clamp(avg / (2 * SAV_MEAN), 0, 1)
  return { ok: true, normalized, value: avg }
}

// ─── Core scorer (tasks 4.1c) ─────────────────────────────────────────

/**
 * Derive intensity band from score. Pure function of the integer score.
 * equal scores always produce equal band (Requirement 2.3).
 */
function deriveIntensity(score: number): 'high' | 'medium' | 'low' {
  const delta = Math.abs(score - 50)
  if (delta >= INTENSITY_HIGH_DELTA) return 'high'
  if (delta >= INTENSITY_MEDIUM_DELTA) return 'medium'
  return 'low'
}

/** Derive the favorable flag. Pure function of the integer score (Requirement 2.2). */
function deriveFavorable(score: number): boolean {
  return score >= FAVORABLE_THRESHOLD
}

/** Add a factor contribution to the accumulator. */
function applyFactor(
  factorKey: ScoringFactorKey,
  weight: number,
  result: FactorResult,
  contributions: ScoreFactorContribution[],
  omissions: ScoreOmission[],
  domainWeights: DomainScoringWeights
): { weightedSum: number; weightSum: number } {
  if (!result.ok) {
    const severity = domainWeights.primaryFactors.includes(factorKey) ? 'primary' : 'secondary'
    omissions.push({ factor: factorKey, reason: result.reason, severity })
    return { weightedSum: 0, weightSum: 0 }
  }
  const contribution = weight * result.normalized
  contributions.push({
    factor: factorKey,
    value: result.value,
    normalized: result.normalized,
    weight,
    contribution,
  })
  return { weightedSum: contribution, weightSum: weight }
}

/** Compute confidence: fraction of primary-factor weight that was actually applied. */
function computeConfidence(
  domainWeights: DomainScoringWeights,
  omissions: ScoreOmission[]
): { reducedConfidence: boolean; confidence: number } {
  const omittedPrimary = new Set(omissions.filter((o) => o.severity === 'primary').map((o) => o.factor))
  const primaryKeys = domainWeights.primaryFactors
  if (primaryKeys.length === 0) return { reducedConfidence: false, confidence: 1.0 }

  const totalPrimaryWeight = primaryKeys.reduce((sum, k) => sum + (domainWeights.weights[k] ?? 0), 0)
  const omittedPrimaryWeight = primaryKeys
    .filter((k) => omittedPrimary.has(k))
    .reduce((sum, k) => sum + (domainWeights.weights[k] ?? 0), 0)

  const confidence = totalPrimaryWeight > 0
    ? clamp(1 - omittedPrimaryWeight / totalPrimaryWeight, 0, 1)
    : 1.0

  return { reducedConfidence: omittedPrimaryWeight > 0, confidence }
}

// ─── Public API ───────────────────────────────────────────────────────

export interface PeriodScoreResult {
  score: number
  breakdown: ScoreBreakdown
}

/**
 * Score a single dasha period deterministically.
 *
 * Pure function — no LLM, no network, no DB, no file I/O.
 * Never throws: missing/malformed inputs degrade to omissions.
 *
 * @param period         - The dasha slice (includes lordAnnotations with karakaRole)
 * @param chartData      - Scoring-focused chart data (assembled by toScoringChartData)
 * @param transitEntry   - Transit overlay for this AD boundary, or null
 * @param domainWeights  - Resolved domain weight table entry
 */
export function scorePeriod(
  period: DashaSlice,
  chartData: ScoringChartData,
  transitEntry: TransitOverlay | null,
  domainWeights: DomainScoringWeights
): PeriodScoreResult {
  try {
    return _scorePeriod(period, chartData, transitEntry, domainWeights)
  } catch {
    // Absolute last-resort guard — the engine must never throw
    const breakdown: ScoreBreakdown = {
      score: 50,
      intensity: 'low',
      favorable: true,
      factors: [],
      omissions: [{ factor: 'mdLordDignity', reason: 'unexpected error in scoring engine', severity: 'primary' }],
      weightSumApplied: 0,
      reducedConfidence: true,
      confidence: 0,
      weightsVersion: WEIGHTS_VERSION,
    }
    return { score: 50, breakdown }
  }
}

function _scorePeriod(
  period: DashaSlice,
  chartData: ScoringChartData,
  transitEntry: TransitOverlay | null,
  domainWeights: DomainScoringWeights
): PeriodScoreResult {
  const mdLord = period.md.lord
  const adLord = period.ad.lord
  const pdLord = period.pd.lord
  const { mdLord: mdAnnot, adLord: adAnnot, pdLord: pdAnnot } = period.lordAnnotations
  // Union the yoga lists across all three lord annotations (design: lordAnnotations.*.activatedYogas).
  // The slicer currently emits the same list on all three, but unioning is robust to that changing
  // and ensures every lord's own yogas count toward the activatedYogas factor.
  const activatedYogas = Array.from(new Set([
    ...(mdAnnot.activatedYogas ?? []),
    ...(adAnnot.activatedYogas ?? []),
    ...(pdAnnot.activatedYogas ?? []),
  ]))

  const contributions: ScoreFactorContribution[] = []
  const omissions: ScoreOmission[] = []
  const W = domainWeights.weights

  let weightedSum = 0
  let weightSum = 0

  function apply(factorKey: ScoringFactorKey, result: FactorResult) {
    const w = W[factorKey] ?? 0
    if (w === 0) return  // zero-weight factor — skip silently
    const { weightedSum: ws, weightSum: wt } = applyFactor(factorKey, w, result, contributions, omissions, domainWeights)
    weightedSum += ws
    weightSum += wt
  }

  // 11 original factors
  apply('mdLordDignity', factorLordDignity(mdLord, chartData, activatedYogas))
  apply('adLordDignity', factorLordDignity(adLord, chartData, activatedYogas))
  apply('pdLordDignity', factorLordDignity(pdLord, chartData, activatedYogas))
  apply('shadbala',      factorShadbala([mdLord, adLord, pdLord], chartData))
  apply('ishtaKashta',   factorIshtaKashta([mdLord, adLord, pdLord], chartData))
  apply('houseOwnership', factorHouseOwnership([mdLord, adLord, pdLord], chartData, domainWeights))
  apply('karakaRole',    factorKarakaRole(mdAnnot.karakaRole, adAnnot.karakaRole, domainWeights))
  apply('activatedYogas', factorActivatedYogas(activatedYogas))
  apply('bhavaBala',     factorBhavaBala([mdLord, adLord, pdLord], chartData))
  apply('transitBav',    factorTransitBav(transitEntry))
  apply('saturnAfflictions', factorSaturnAfflictions(transitEntry))

  // 4 new factors
  apply('naturalKaraka', factorNaturalKaraka(mdLord, adLord, pdLord, domainWeights))
  apply('domainHouseActivation', factorDomainHouseActivation(transitEntry, domainWeights, chartData))
  apply('mdAdRelationship', factorMdAdRelationship(mdLord, adLord, chartData))
  apply('natalHouseStrength', factorNatalHouseStrength(chartData, domainWeights))

  // Final score
  let score: number
  if (weightSum === 0) {
    // No factors available — neutral with full reduced confidence
    score = 50
  } else {
    score = Math.round(clamp((weightedSum / weightSum) * 100, 0, 100))
  }

  const intensity = deriveIntensity(score)
  const favorable = deriveFavorable(score)
  const { reducedConfidence, confidence } = computeConfidence(domainWeights, omissions)

  const breakdown: ScoreBreakdown = {
    score,
    intensity,
    favorable,
    factors: contributions,
    omissions,
    weightSumApplied: weightSum,
    reducedConfidence: reducedConfidence || weightSum === 0,
    confidence: weightSum === 0 ? 0 : confidence,
    weightsVersion: WEIGHTS_VERSION,
  }

  return { score, breakdown }
}

// ─── identifyPeaks (task 4.2) ─────────────────────────────────────────

/**
 * Rank already-scored periods and return the extreme sets.
 *
 * Significance floor (Requirements 3.6/3.7):
 *   peakStress    → score ≤ 50 − minSignificance
 *   peakFavorable → score ≥ 50 + minSignificance
 * A flat window (all scores within ±minSignificance of neutral) returns fewer
 * peaks or none — never surfacing near-neutral extremes as meaningful.
 *
 * Tie-order: ascending pd.start, then md/ad/pd lord triple (deterministic).
 *
 * @param scored        - Slice+result pairs (from scorePeriod)
 * @param topN          - Max number of peaks per set (default 3; ties beyond topN are included)
 * @param minSignificance - Significance floor (default PEAK_SIGNIFICANCE_DELTA = 12)
 */
export function identifyPeaks(
  scored: Array<{ period: DashaSlice; result: PeriodScoreResult }>,
  topN = 3,
  minSignificance = PEAK_SIGNIFICANCE_DELTA
): { peakStress: PeakPeriod[]; peakFavorable: PeakPeriod[] } {
  if (scored.length === 0) return { peakStress: [], peakFavorable: [] }

  // Deterministic sort: ascending pd.start, then lord triple
  const sorted = [...scored].sort((a, b) => {
    const tA = new Date(a.period.pd.start).getTime()
    const tB = new Date(b.period.pd.start).getTime()
    if (tA !== tB) return tA - tB
    const tripleA = `${a.period.md.lord}/${a.period.ad.lord}/${a.period.pd.lord}`
    const tripleB = `${b.period.md.lord}/${b.period.ad.lord}/${b.period.pd.lord}`
    return tripleA.localeCompare(tripleB)
  })

  const stressFloor = FAVORABLE_THRESHOLD - minSignificance      // ≤ 38
  const favorableFloor = FAVORABLE_THRESHOLD + minSignificance   // ≥ 62

  // Identify extreme scores (only within qualifying range)
  const stressCandidates = sorted.filter((s) => s.result.score <= stressFloor)
  const favorableCandidates = sorted.filter((s) => s.result.score >= favorableFloor)

  function buildPeaks(
    candidates: typeof sorted,
    pickLowest: boolean
  ): PeakPeriod[] {
    if (candidates.length === 0) return []

    // Rank by score extremity FIRST (Requirement 3.2). `candidates` is already
    // pre-sorted by pd.start then lord-triple, and Array.sort is stable, so equal
    // scores retain that deterministic tie-order (Requirement 3.5).
    const byScore = [...candidates].sort((a, b) =>
      pickLowest
        ? a.result.score - b.result.score
        : b.result.score - a.result.score
    )

    // Take up to topN by score, but include ALL periods tied at the topN-th
    // (cutoff) score so no tied extreme is silently dropped.
    const cutoffIndex = Math.min(topN, byScore.length) - 1
    const cutoffScore = byScore[cutoffIndex].result.score
    const selected = byScore.filter((c) =>
      pickLowest ? c.result.score <= cutoffScore : c.result.score >= cutoffScore
    )

    return selected.map((entry): PeakPeriod => {
      const { period, result } = entry
      // For a FAVORABLE peak, surface the factors that drove the score UP (highest
      // contribution). For a STRESS peak, surface the DRAGS — the factors that fell
      // furthest short of their weight — i.e. largest weight × (1 − normalized).
      const top3 = [...result.breakdown.factors]
        .sort((a, b) =>
          pickLowest
            ? b.weight * (1 - b.normalized) - a.weight * (1 - a.normalized)
            : b.contribution - a.contribution
        )
        .slice(0, 3)
        .map((f) => ({ factor: f.factor, contribution: f.contribution }))

      const label = `${period.md.lord} MD / ${period.ad.lord} AD / ${period.pd.lord} PD ` +
        `(${period.pd.start.slice(0, 7)} – ${period.pd.end.slice(0, 7)})`

      const periodKey = `${period.md.lord}/${period.ad.lord}/${period.pd.lord}/${period.pd.start}`

      return { label, periodKey, score: result.score, topFactors: top3 }
    })
  }

  return {
    peakStress:    buildPeaks(stressCandidates, true),
    peakFavorable: buildPeaks(favorableCandidates, false),
  }
}

// ─── Re-export resolveDomainWeights + ScoringConfigError for convenience ─

export { resolveDomainWeights, ScoringConfigError } from './scoringWeights'
