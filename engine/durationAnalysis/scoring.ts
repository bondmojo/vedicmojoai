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
import { getVargaDignityLabel, SIGN_LORDS, PERMANENT_FRIENDSHIP } from '@/engine/compute/dignity'
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

// ─── Dignity / friendship tables ─────────────────────────────────────
// Sourced from the canonical `engine/compute/dignity.ts` (single source of
// truth): SIGN_LORDS and PERMANENT_FRIENDSHIP are imported above, and the
// exaltation/debilitation/moolatrikona/own tables live there too, consumed via
// getVargaDignityLabel(). This replaces the former local copies + the divergent
// aggregate-tatkalika `getDignityLabel` (unified per the dignity review).

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

/** Build a planet → D1 (rasi) sign-number map for canonical dignity lookups. */
function buildD1SignMap(planets: ScoringChartData['planets']): Record<string, number> {
  const map: Record<string, number> = {}
  for (const p of planets ?? []) map[p.planet] = p.signNumber
  return map
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
  // `noSignal: true` = the factor evaluated fine but found nothing this period
  // (legitimate — drop from the denominator but do NOT dent confidence).
  // Absent/false = required chart data was unavailable/malformed (DOES dent confidence).
  | { ok: false; reason: string; noSignal?: boolean }

/** Lord dignity — reads signNumber from chartData.planets, handles Neechabhanga. */
function factorLordDignity(
  lord: string,
  chartData: ScoringChartData,
  activatedYogas: string[]
): FactorResult {
  const p = findPlanet(chartData.planets, lord)
  if (!p) return { ok: false, reason: `planet "${lord}" not found in chartData.planets` }

  // Canonical panchadha-maitri dignity (shadbala-consistent): positional dignity
  // from the lord's own sign, tatkalika friendship with the sign-lord drawn from
  // D1. Node lords (Rahu/Ketu) carry no friendship dignity → treated as neutral,
  // preserving the prior behavior for nodes.
  const d1Signs = buildD1SignMap(chartData.planets)
  let label: string = getVargaDignityLabel(lord, p.signNumber, d1Signs) ?? 'neutral'

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
  if (relevant.size === 0) return { ok: false, reason: 'no karakaRoles defined for domain', noSignal: true }

  if (mdKaraka && relevant.has(mdKaraka)) return { ok: true, normalized: 1.0, value: `MD matches: ${mdKaraka}` }
  if (adKaraka && relevant.has(adKaraka)) return { ok: true, normalized: 0.8, value: `AD matches: ${adKaraka}` }
  return { ok: false, reason: 'no running lord matches a domain karakaRole', noSignal: true }
}

/** Activated yogas: omits when 0 (no signal); scales 1→3 → 0.65→0.95.
 * A negative-yoga marker (e.g. "Kemadruma", dusthana lord) could pull below 0.5
 * — future extension. */
function factorActivatedYogas(activatedYogas: string[]): FactorResult {
  const count = activatedYogas.length
  if (count === 0) return { ok: false, reason: 'no activated yogas for this period', noSignal: true }
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
  if (relevant.size === 0) return { ok: false, reason: 'no natural karakas defined for domain', noSignal: true }

  if (relevant.has(mdLord)) return { ok: true, normalized: 1.0, value: `MD matches: ${mdLord}` }
  if (relevant.has(adLord)) return { ok: true, normalized: 0.75, value: `AD matches: ${adLord}` }
  if (relevant.has(pdLord)) return { ok: true, normalized: 0.65, value: `PD matches: ${pdLord}` }
  return { ok: false, reason: 'no running lord is a domain natural karaka', noSignal: true }
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
  return { ok: false, reason: 'no transit activation of domain houses', noSignal: true }
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
  const permFriends = PERMANENT_FRIENDSHIP[mdLord]?.friends ?? []
  const permEnemies = PERMANENT_FRIENDSHIP[mdLord]?.enemies ?? []
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

// ─── Factor builders — 3 depth factors (Track 1a) ────────────────────

/** Natural benefics/malefics for argala classification.
 *  v1 static list — Mercury/Moon treated as benefic; conditional (association /
 *  waxing-Moon) classification is deferred. */
const ARGALA_BENEFICS = new Set(['Jupiter', 'Venus', 'Mercury', 'Moon'])
const ARGALA_MALEFICS = new Set(['Sun', 'Mars', 'Saturn', 'Rahu', 'Ketu'])

/**
 * Nakshatra Dispositor — whether each running lord's NATAL nakshatra dispositor
 * (the lord of the nakshatra the dasha lord occupies) owns or occupies a domain
 * house. Captures threads the whole-sign lordship of the dasha lord itself misses
 * (e.g. an AD lord whose nakshatra dispositor rules the domain's primary house).
 *
 * Uses the pre-computed lordAnnotations.*.nakshatraLord — no chain-building (v1).
 * Node dispositors (Rahu/Ketu) own no rasi sign, so only occupancy applies.
 * "Aspects" is intentionally NOT modelled (v1) — the codebase only has natal-aspect
 * logic for transiting Saturn/Jupiter. MD/AD/PD are weighted by dasha hierarchy.
 */
function factorNakshatraDispositor(
  dispositors: string[], // [mdNakLord, adNakLord, pdNakLord]
  chartData: ScoringChartData,
  domainWeights: DomainScoringWeights
): FactorResult {
  const planets = chartData.planets
  if (!planets) return { ok: false, reason: 'planets not available for nakshatraDispositor' }
  const lagnaSign = deriveLagnaSign(planets)
  if (lagnaSign == null) return { ok: false, reason: 'cannot derive lagna for nakshatraDispositor' }

  const primary = new Set(domainWeights.primaryHouses)
  const benefic = new Set(domainWeights.beneficHouses)
  const malefic = new Set([...domainWeights.maleficHouses, 6, 8, 12])
  const lordWeights = [0.4, 0.35, 0.25] // MD/AD/PD influence

  let weightedSum = 0
  let weightUsed = 0
  const detail: Array<{ dispositor: string; houses: number[]; n: number }> = []

  dispositors.forEach((dispositor, i) => {
    if (!dispositor) return
    const p = planets.find((pl) => pl.planet === dispositor)
    if (!p) return // dispositor position unavailable — skip this lord

    // Connected houses = occupancy ∪ owned (owned skipped for nodes: not a SIGN_LORDS value)
    const houses = new Set<number>()
    houses.add(p.house)
    for (const [sn, l] of Object.entries(SIGN_LORDS)) {
      if (l === dispositor) houses.add(signToHouse(Number(sn), lagnaSign))
    }

    const hs = [...houses]
    const primaryHit = hs.some((h) => primary.has(h))
    const beneficHit = hs.some((h) => benefic.has(h))
    const maleficHit = hs.some((h) => malefic.has(h))

    let n: number
    if (primaryHit && !maleficHit) n = 1.0
    else if (primaryHit && maleficHit) n = 0.65
    else if (beneficHit && !maleficHit) n = 0.65
    else if (maleficHit && !beneficHit) n = 0.3
    else n = 0.5

    weightedSum += n * lordWeights[i]
    weightUsed += lordWeights[i]
    detail.push({ dispositor, houses: hs, n })
  })

  if (weightUsed === 0) return { ok: false, reason: 'no usable nakshatra dispositor (missing positions)' }
  return { ok: true, normalized: clamp(weightedSum / weightUsed, 0, 1), value: detail }
}

/**
 * Dasha-Lord BAV — each running lord's OWN Bhinnashtakavarga bindus in the domain's
 * primaryHouses (per-planet BAV, complementing the SAV-only natalHouseStrength).
 *
 * BAV is computed for the 7 planets only — Rahu/Ketu have NO bav array
 * (engine/compute/ashtakavarga.ts), so a node lord is skipped, never fabricated.
 * `bav[planet]` is SIGN-indexed (0 = Aries); each primary HOUSE → SIGN via lagna.
 */
function factorDashaLordBav(
  lords: string[],
  chartData: ScoringChartData,
  domainWeights: DomainScoringWeights
): FactorResult {
  const bav = chartData.ashtakavarga?.bav
  if (!bav) return { ok: false, reason: 'ashtakavarga BAV not available' }
  const lagnaSign = deriveLagnaSign(chartData.planets)
  if (lagnaSign == null) return { ok: false, reason: 'cannot derive lagna for dashaLordBav' }

  const signs = domainWeights.primaryHouses.map((h) => houseToSign(h, lagnaSign))

  const bindus: number[] = []
  for (const lord of lords) {
    const lordBav = bav[lord]
    if (!Array.isArray(lordBav) || lordBav.length < 12) continue // Rahu/Ketu or missing → skip
    for (const sign of signs) {
      const b = lordBav[sign - 1]
      if (b != null) bindus.push(b)
    }
  }

  if (bindus.length === 0) {
    return { ok: false, reason: 'no per-planet BAV bindus for running lords (node lords / missing)' }
  }
  const avg = bindus.reduce((a, b) => a + b, 0) / bindus.length
  return { ok: true, normalized: clamp(avg / 8, 0, 1), value: avg }
}

/**
 * Argala on the domain's primary house(s) — net Jaimini intervention.
 * Primary argala (from the 2nd/4th/11th) whose offset is NOT neutralized by a
 * virodha argala contributes +1 per benefic planet, −1 per malefic planet.
 * No un-neutralized primary-house argala at all → omitted (keeps weight out of the
 * denominator rather than dragging the score toward a 0.5 neutral).
 */
function factorArgalaOnDomainHouse(
  chartData: ScoringChartData,
  domainWeights: DomainScoringWeights
): FactorResult {
  const jaimini = chartData.jaimini
  if (!jaimini?.argala) return { ok: false, reason: 'jaimini argala not available' }

  const primary = new Set(domainWeights.primaryHouses)
  const virodha = jaimini.virodhaArgala ?? []

  let net = 0
  let considered = 0

  for (const entry of jaimini.argala) {
    if (entry.type !== 'primary') continue // v1: primary argala only
    if (!primary.has(entry.targetHouse)) continue

    // Recover the argala offset (2/4/11) and check for a neutralizing virodha.
    const offset = ((entry.argalaFrom - entry.targetSign + 12) % 12) + 1
    const neutralized = virodha.some(
      (v) =>
        v.targetSign === entry.targetSign &&
        v.neutralizes === offset &&
        (v.counterPlanets?.length ?? 0) > 0
    )
    if (neutralized) continue

    for (const planet of entry.argalaPlanets) {
      if (ARGALA_BENEFICS.has(planet)) { net += 1; considered++ }
      else if (ARGALA_MALEFICS.has(planet)) { net -= 1; considered++ }
    }
  }

  if (considered === 0) return { ok: false, reason: 'no un-neutralized argala on domain primary houses' }
  return { ok: true, normalized: clamp(0.5 + net * 0.12, 0, 1), value: net }
}

const KENDRA_HOUSES = new Set([1, 4, 7, 10])

/**
 * Divisional Chart Strength — the D10-class gap closer. Domain knowledge names ONE
 * varga (domainWeights.primaryDivision) as PRIMARY for the domain (career: D10,
 * marriage: D9, health: D30, wealth/cashflow: D2, property: D4). Reads, WITHIN that
 * varga's own house-numbering from its own lagna: (a) the dignity of the varga's
 * domain-house lord, (b) the varga lagna-lord's own dignity (overall varga strength),
 * (c) whether the domain-house lord sits in a varga kendra, (d) how many of the
 * running MD/AD/PD lords occupy a varga kendra (activation). Every sub-signal is
 * centered at 0.5 = neutral so none floors/ceilings the blend.
 */
function factorDivisionalChartStrength(
  mdLord: string,
  adLord: string,
  pdLord: string,
  chartData: ScoringChartData,
  domainWeights: DomainScoringWeights
): FactorResult {
  const chart = chartData.divisionalCharts?.find((d) => d.division === domainWeights.primaryDivision)
  if (!chart) return { ok: false, reason: `primary divisional chart D${domainWeights.primaryDivision} not available` }
  const vargaLagnaSign = chart.lagnaSignNumber
  if (!vargaLagnaSign) return { ok: false, reason: 'varga lagna sign missing' }
  const vargaPlanets = chart.planets
  if (!vargaPlanets || vargaPlanets.length === 0) return { ok: false, reason: 'varga planets missing' }
  // Tatkalika for varga dignity is drawn from D1 positions (shadbala convention).
  const d1Signs = buildD1SignMap(chartData.planets)

  // (a) Domain-house lord's dignity + kendra occupancy, within the varga.
  const houseFindings: Array<{ house: number; lord: string; dignity: string; vargaHouse: number | null }> = []
  let dignitySum = 0
  let dignityCount = 0
  let lordInKendra = false

  for (const h of domainWeights.primaryHouses) {
    const sign = houseToSign(h, vargaLagnaSign)
    const lord = SIGN_LORDS[sign]
    const lp = vargaPlanets.find((p) => p.planet === lord)
    if (!lp) { houseFindings.push({ house: h, lord, dignity: 'unknown', vargaHouse: null }); continue }
    const label = getVargaDignityLabel(lord, lp.signNumber, d1Signs) ?? 'neutral'
    dignitySum += dignityToNormalized(label)
    dignityCount++
    if (KENDRA_HOUSES.has(lp.house)) lordInKendra = true
    houseFindings.push({ house: h, lord, dignity: label, vargaHouse: lp.house })
  }
  if (dignityCount === 0) return { ok: false, reason: 'domain-house lord not resolvable within varga' }
  const subHouseLordDignity = dignitySum / dignityCount

  // (b) Varga lagna-lord's own dignity — overall varga strength/stature.
  // Label computed ONCE and reused for both the normalized score and the
  // displayed value, so the breakdown always shows the dignity that was scored.
  const vargaLagnaLord = SIGN_LORDS[vargaLagnaSign]
  const llp = vargaPlanets.find((p) => p.planet === vargaLagnaLord)
  const vargaLagnaLordLabel = llp
    ? (getVargaDignityLabel(vargaLagnaLord, llp.signNumber, d1Signs) ?? 'neutral')
    : null
  const subLagnaLordDignity = vargaLagnaLordLabel ? dignityToNormalized(vargaLagnaLordLabel) : 0.5

  // (c) Domain-house lord in a varga kendra.
  const subKendraLord = lordInKendra ? 1.0 : 0.5

  // (d) Dasha-lord activation — how many of MD/AD/PD occupy a varga kendra.
  const dashaKendraCount = [mdLord, adLord, pdLord].filter((lord) => {
    const lp = vargaPlanets.find((p) => p.planet === lord)
    return lp != null && KENDRA_HOUSES.has(lp.house)
  }).length
  const subActivation = 0.5 + (dashaKendraCount / 3) * 0.5

  const normalized = clamp(
    0.35 * subHouseLordDignity + 0.25 * subLagnaLordDignity + 0.2 * subKendraLord + 0.2 * subActivation,
    0, 1
  )
  return {
    ok: true,
    normalized,
    value: {
      division: domainWeights.primaryDivision,
      vargaLagnaLord,
      vargaLagnaLordDignity: vargaLagnaLordLabel ?? 'unknown',
      houses: houseFindings,
      dashaLordsInVargaKendra: dashaKendraCount,
    },
  }
}

/**
 * Rashi Drishti — Jaimini whole-sign aspect. Reads the precomputed 36-edge
 * RASHI_ASPECT_MATRIX (engine/compute/relationships.ts, movable↔fixed / dual↔dual
 * sign-aspect scheme) and checks whether any running lord's OWN OCCUPIED SIGN casts
 * a rashi-aspect onto a domain primary house. Distinct from graha drishti (planet
 * aspect, already used for transits in domainHouseActivation) — this is sign-level.
 * MD/AD/PD priority mirrors karakaRole/naturalKaraka's existing convention.
 */
function factorRashiDrishti(
  mdLord: string,
  adLord: string,
  pdLord: string,
  chartData: ScoringChartData,
  domainWeights: DomainScoringWeights
): FactorResult {
  const rashiAspects = chartData.relationships?.rashiAspects
  if (!Array.isArray(rashiAspects) || rashiAspects.length === 0) {
    return { ok: false, reason: 'relationships.rashiAspects not available' }
  }
  const planets = chartData.planets
  if (!planets) return { ok: false, reason: 'planets not available' }

  const primary = new Set(domainWeights.primaryHouses)
  const lords: Array<{ name: string; w: number }> = [
    { name: mdLord, w: 1.0 },
    { name: adLord, w: 0.8 },
    { name: pdLord, w: 0.65 },
  ]

  let best: number | null = null
  const detail: Array<{ lord: string; toHouses: number[] }> = []
  for (const { name, w } of lords) {
    const p = planets.find((pl) => pl.planet === name)
    if (!p) continue
    const hits = rashiAspects.filter((e) => e.fromSignNumber === p.signNumber && primary.has(e.toHouse))
    if (hits.length === 0) continue
    detail.push({ lord: name, toHouses: [...new Set(hits.map((h) => h.toHouse))] })
    if (best === null || w > best) best = w
  }

  if (best === null) return { ok: false, reason: 'no rashi-drishti onto domain primary houses', noSignal: true }
  return { ok: true, normalized: best, value: detail }
}

/**
 * Build a sign-lord dispositor chain for one planet (parallels
 * nakshatraDispositor's chain-following, but through RASHI/sign lords, not
 * nakshatra lords). chain[0] = the lord of the sign the planet occupies, chain[1] =
 * that lord's own sign-lord, etc. Terminates on: no lord found, own-sign (self),
 * a repeat (cycle guard), or a node (Rahu/Ketu own no sign — SIGN_LORDS has no
 * entry mapping to them, so the chain simply cannot continue past one).
 */
function buildSignDispositorChain(
  planet: string,
  planets: NonNullable<ScoringChartData['planets']>,
  maxDepth = 3
): string[] {
  const chain: string[] = []
  let current = planet
  const seen = new Set<string>([planet])
  for (let i = 0; i < maxDepth; i++) {
    const p = planets.find((pl) => pl.planet === current)
    if (!p) break
    const lord = SIGN_LORDS[p.signNumber]
    if (!lord) break // node (Rahu/Ketu) — owns no sign, chain cannot continue
    // Skip an adjacent duplicate: an own-sign terminal is its own dispositor, and
    // re-pushing it would render e.g. ['Mars','Venus','Venus'] in the breakdown.
    if (chain[chain.length - 1] !== lord) chain.push(lord)
    if (lord === current || seen.has(lord)) break // own-sign or cycle — self-terminates
    seen.add(lord)
    current = lord
  }
  return chain
}

/**
 * Rashi Dispositor Chain — the "does the chain of rulers governing where the dasha
 * lord sits eventually lead into a domain house" lens. Distinct from houseOwnership
 * (the dasha lord's OWN placement/ownership) and from nakshatraDispositor (the
 * NAKSHATRA-lord thread) — this follows pure sign-lordship depth-first, up to 3
 * levels, and rewards/penalizes by how early the chain reaches a domain house.
 */
function factorRashiDispositorChain(
  mdLord: string,
  adLord: string,
  pdLord: string,
  chartData: ScoringChartData,
  domainWeights: DomainScoringWeights
): FactorResult {
  const planets = chartData.planets
  if (!planets) return { ok: false, reason: 'planets not available for rashiDispositorChain' }
  const lagnaSign = deriveLagnaSign(planets)
  if (lagnaSign == null) return { ok: false, reason: 'cannot derive lagna for rashiDispositorChain' }

  const primary = new Set(domainWeights.primaryHouses)
  const malefic = new Set([...domainWeights.maleficHouses, 6, 8, 12])
  const lordWeights = [0.4, 0.35, 0.25] // MD/AD/PD influence — mirrors nakshatraDispositor
  const depthBonus = [0.2, 0.12, 0.06]

  let weightedSum = 0
  let weightUsed = 0
  const detail: Array<{ lord: string; chain: string[]; hitDepth: number; n: number }> = []

  ;[mdLord, adLord, pdLord].forEach((lord, i) => {
    const chain = buildSignDispositorChain(lord, planets)
    let hitDepth = -1
    let maleficHit = false
    for (let d = 0; d < chain.length; d++) {
      const dispositor = chain[d]
      const dp = planets.find((pl) => pl.planet === dispositor)
      if (!dp) continue
      const houses = new Set<number>([dp.house])
      for (const [sn, l] of Object.entries(SIGN_LORDS)) {
        if (l === dispositor) houses.add(signToHouse(Number(sn), lagnaSign))
      }
      const hs = [...houses]
      if (hs.some((h) => primary.has(h))) {
        hitDepth = d
        maleficHit = hs.some((h) => malefic.has(h))
        break
      }
    }
    const n = hitDepth === -1 ? 0.5 : (maleficHit ? 0.5 - depthBonus[hitDepth] : 0.5 + depthBonus[hitDepth])
    weightedSum += n * lordWeights[i]
    weightUsed += lordWeights[i]
    detail.push({ lord, chain, hitDepth, n })
  })

  if (weightUsed === 0) return { ok: false, reason: 'no lords resolvable for rashiDispositorChain' }
  return { ok: true, normalized: clamp(weightedSum / weightUsed, 0, 1), value: detail }
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
    omissions.push({ factor: factorKey, reason: result.reason, severity, noSignal: result.noSignal })
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
  // Only DATA-UNAVAILABLE omissions dent confidence. A primary factor that evaluated
  // cleanly but found no signal this period (noSignal) is legitimate and must not.
  const omittedPrimary = new Set(
    omissions.filter((o) => o.severity === 'primary' && !o.noSignal).map((o) => o.factor)
  )
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

  // 3 depth factors (Track 1a)
  apply('nakshatraDispositor', factorNakshatraDispositor(
    [mdAnnot.nakshatraLord, adAnnot.nakshatraLord, pdAnnot.nakshatraLord], chartData, domainWeights))
  apply('dashaLordBav', factorDashaLordBav([mdLord, adLord, pdLord], chartData, domainWeights))
  apply('argalaOnDomainHouse', factorArgalaOnDomainHouse(chartData, domainWeights))

  // 3 Rashi-layer factors (Track 1c) — D10-class varga strength, Jaimini whole-sign
  // aspect, and a sign-lordship dispositor CHAIN (distinct from the flat houseOwnership
  // snapshot and from the nakshatra-lord chain).
  apply('divisionalChartStrength', factorDivisionalChartStrength(mdLord, adLord, pdLord, chartData, domainWeights))
  apply('rashiDrishti', factorRashiDrishti(mdLord, adLord, pdLord, chartData, domainWeights))
  apply('rashiDispositorChain', factorRashiDispositorChain(mdLord, adLord, pdLord, chartData, domainWeights))

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
