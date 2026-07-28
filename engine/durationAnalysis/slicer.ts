/**
 * engine/durationAnalysis/slicer.ts — Period Slicer (pure function, no LLM).
 *
 * Reads a DashaTree (as stored in UnifiedChart.dashaTree JSONB) and returns
 * all MD/AD/PD combinations whose PD interval overlaps the requested date range,
 * annotated with lord natal chart data and yoga activations.
 *
 * Overlap condition: new Date(pd.start) < dateTo && new Date(pd.end) > dateFrom
 *
 * JSONB dates are ISO strings — coerced with new Date(str) internally.
 */

import type { DashaSlice, PeriodLordAnnotation } from '@/lib/durationTypes'

// ─── Debilitation table (planet → sign name) ────────────────────────
const DEBILITATION_SIGNS: Record<string, string> = {
  Sun: 'Libra',
  Moon: 'Scorpio',
  Mars: 'Cancer',
  Mercury: 'Pisces',
  Jupiter: 'Capricorn',
  Venus: 'Virgo',
  Saturn: 'Aries',
}

// Dispositor of each planet's DEBILITATION sign (Neechabhanga cancellation rule 1:
// "the lord of the debilitation sign is in a kendra from lagna or Moon").
const DEBIL_SIGN_LORD: Record<string, string> = {
  Sun: 'Venus',      // debil in Libra → Venus
  Moon: 'Mars',      // debil in Scorpio → Mars
  Mars: 'Moon',      // debil in Cancer → Moon
  Mercury: 'Jupiter',// debil in Pisces → Jupiter
  Jupiter: 'Saturn', // debil in Capricorn → Saturn
  Venus: 'Mercury',  // debil in Virgo → Mercury
  Saturn: 'Mars',    // debil in Aries → Mars
}

// Planet that is EXALTED in each planet's debilitation sign (Neechabhanga rule 2:
// "the planet exalted in that sign is in a kendra from lagna or Moon").
const EXALT_PLANET_IN_DEBIL_SIGN: Record<string, string> = {
  Sun: 'Saturn',     // Sun debil in Libra; Saturn exalts in Libra
  Moon: 'Mars',      // Moon debil in Scorpio; no classical exalt in Scorpio → use debil lord (Mars)
  Mars: 'Jupiter',   // Mars debil in Cancer; Jupiter exalts in Cancer
  Mercury: 'Venus',  // Mercury debil in Pisces; Venus exalts in Pisces
  Jupiter: 'Mars',   // Jupiter debil in Capricorn; Mars exalts in Capricorn
  Venus: 'Mercury',  // Venus debil in Virgo; Mercury exalts in Virgo
  Saturn: 'Sun',     // Saturn debil in Aries; Sun exalts in Aries
}

const KENDRA_HOUSES = new Set([1, 4, 7, 10])
const TRIKONA_HOUSES = new Set([1, 5, 9])
const DHANA_OWNER_HOUSES = new Set([2, 11])
const DHANA_OTHER_HOUSES = new Set([1, 5, 9])

// ─── Raw JSONB shape helpers ─────────────────────────────────────────

interface RawPd {
  lord: string
  start: string
  end: string
  duration_days?: number
}

interface RawAd {
  lord: string
  start: string
  end: string
  duration_days?: number
  pratyantardashas?: RawPd[]
}

interface RawMd {
  lord: string
  start: string
  end: string
  duration_days?: number
  antardashas?: RawAd[]
}

interface RawDashaTree {
  balance_years?: number
  mahadashas?: RawMd[]
}

// ─── Chart lookup helpers ─────────────────────────────────────────────

interface ChartInput {
  planets: unknown
  nakshatras: unknown
  relationships: unknown
  /** Stored CharaKaraka[] from UnifiedChart.karakas (may be absent for paste-path charts). */
  karakas?: unknown
  /**
   * Stored Yoga[] catalogue from UnifiedChart.yogas (engine/compute/yogas.ts).
   * Present (as an array, possibly empty) on compute-path charts; absent/null on
   * paste-path charts, which have no computed geometry to build a catalogue from.
   */
  yogas?: unknown
}

/** Shape of a catalogue entry as stored in UnifiedChart.yogas (engine/compute/types.ts Yoga). */
interface RawYoga {
  key: string
  name: string
  category: string
  planets: string[]
  activatingPlanets?: string[]
}

interface RawCharaKaraka {
  planet: string
  karakaAbbr: string
}

/**
 * Returns the Jaimini Chara Karaka abbreviation (AK/AmK/BK/MK/PK/GK/DK) for a planet,
 * or null when the planet is not found in the karakas array (Rahu/Ketu are not assigned,
 * and absent/empty karakas data returns null for all planets).
 */
export function lookupKarakaRole(karakas: unknown, planet: string): string | null {
  if (!Array.isArray(karakas) || karakas.length === 0) return null
  const entry = (karakas as RawCharaKaraka[]).find((k) => k.planet === planet)
  return entry?.karakaAbbr ?? null
}

interface RawPlanet {
  planet: string
  sign: string
  house: number
  retrograde: boolean
  signNumber?: number
}

interface RawNakshatra {
  planet: string
  nakshatra: string
  nakshatraLord: string
  subLord: string
}

interface RawCombustion {
  planet: string
  combust: boolean
  cazimi: boolean
}

interface RawParivartana {
  planet_a: string
  sign_a: string
  planet_b: string
  sign_b: string
}

interface RawConjunction {
  planets: string[]
  sign: string
  house: number
}

interface RawRelationships {
  combustion?: RawCombustion[]
  mutualReception?: RawParivartana[]
  conjunctions?: RawConjunction[]
  houseLords?: Record<string | number, Record<string | number, string>>
}

function asRawDashaTree(v: unknown): RawDashaTree | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as RawDashaTree
  }
  return null
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function asObj(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  return {}
}

// ─── Lord annotation lookup ──────────────────────────────────────────

function lookupPlanet(planets: unknown, planet: string): RawPlanet | null {
  const arr = asArray<RawPlanet>(planets)
  return arr.find((p) => p.planet === planet) ?? null
}

function lookupNakshatra(nakshatras: unknown, planet: string): RawNakshatra | null {
  const arr = asArray<RawNakshatra>(nakshatras)
  return arr.find((n) => n.planet === planet) ?? null
}

function lookupCombustion(relationships: unknown, planet: string): { combust: boolean; cazimi: boolean } {
  const rel = asObj(relationships) as RawRelationships
  const entry = (rel.combustion ?? []).find((c) => c.planet === planet)
  return { combust: entry?.combust ?? false, cazimi: entry?.cazimi ?? false }
}

/**
 * Returns all D1 house numbers ruled by the given planet.
 * `relationships.houseLords` is shaped as { [division]: { [house]: "PlanetName" } }
 * Division 1 is keyed as either the number 1 or the string "1".
 */
function lookupOwnsHouses(relationships: unknown, planet: string): number[] {
  const rel = asObj(relationships) as RawRelationships
  const hl = rel.houseLords
  if (!hl) return []

  // Key may be number 1 or string "1"
  const d1 = (hl[1] ?? hl['1']) as Record<string | number, string> | undefined
  if (!d1) return []

  const owned: number[] = []
  for (const [houseKey, lord] of Object.entries(d1)) {
    if (lord === planet) {
      owned.push(Number(houseKey))
    }
  }
  return owned.sort((a, b) => a - b)
}

function buildAnnotation(
  planet: string,
  planets: unknown,
  nakshatras: unknown,
  relationships: unknown,
  activatedYogas: string[],
  karakas: unknown = null
): PeriodLordAnnotation {
  const p = lookupPlanet(planets, planet)
  const n = lookupNakshatra(nakshatras, planet)
  const { combust, cazimi } = lookupCombustion(relationships, planet)
  const ownsHouses = lookupOwnsHouses(relationships, planet)

  return {
    planet,
    sign: p?.sign ?? '',
    house: p?.house ?? 0,
    nakshatra: n?.nakshatra ?? '',
    nakshatraLord: n?.nakshatraLord ?? '',
    subLord: n?.subLord ?? '',
    retrograde: p?.retrograde ?? false,
    combust,
    cazimi,
    activatedYogas,
    ownsHouses,
    occupiesHouse: p?.house ?? 0,
    karakaRole: lookupKarakaRole(karakas, planet),
  }
}

// ─── Yoga activation ─────────────────────────────────────────────────

/**
 * Formats one chart-wide catalogue entry (engine/compute/yogas.ts Yoga) into the
 * legacy string shape `factorActivatedYogas` / `factorLordDignity` (scoring.ts)
 * already consume. Neechabhanga entries preserve the EXACT
 * "Neechabhanga active — <lord> debilitation cancelled" format the Neechabhanga
 * lift in `factorLordDignity` string-matches on.
 */
function formatCatalogueYoga(yoga: RawYoga): string {
  if (yoga.category === 'neechabhanga' && yoga.planets.length > 0) {
    return `Neechabhanga active — ${yoga.planets[0]} debilitation cancelled`
  }
  return `${yoga.name} — ${yoga.planets.join(' + ')}`
}

/**
 * Filters the chart-wide named-yoga catalogue (UnifiedChart.yogas, produced by
 * engine/compute/yogas.ts) to the entries whose participants include the running
 * MD or AD lord, per Design §"Slicer + scorer" (Requirement 5.1).
 */
function filterCatalogueYogas(catalogue: RawYoga[], mdLord: string, adLord: string): string[] {
  const runningLords = new Set([mdLord, adLord])
  return catalogue
    .filter((y) => {
      const participants = new Set([...(y.planets ?? []), ...(y.activatingPlanets ?? [])])
      return [...runningLords].some((lord) => participants.has(lord))
    })
    .map(formatCatalogueYoga)
}

/**
 * Computes the activatedYogas[] array for a MD+AD lord combination.
 * The same yogas array is shared across mdLord, adLord, and pdLord annotations
 * since it reflects the MD/AD relationship, not an individual lord.
 *
 * PREFERS the chart-wide named-yoga catalogue (`chart.yogas`, engine/compute/yogas.ts)
 * when present: the catalogue is filtered to entries involving the running MD/AD
 * lord (Requirement 5.1). Falls back to the legacy pair-scoped re-derivation below
 * when no catalogue is available — this is the ONLY path for paste-source charts,
 * which have no computed geometry to build a catalogue from (Requirement 5.2).
 */
function computeActivatedYogas(
  mdLord: string,
  adLord: string,
  planets: unknown,
  relationships: unknown,
  yogasCatalogue?: unknown
): string[] {
  if (Array.isArray(yogasCatalogue)) {
    return filterCatalogueYogas(yogasCatalogue as RawYoga[], mdLord, adLord)
  }
  return computeActivatedYogasPairScoped(mdLord, adLord, planets, relationships)
}

/** Legacy pair-scoped substrate derivation — the paste-path fallback (Requirement 5.2). */
function computeActivatedYogasPairScoped(
  mdLord: string,
  adLord: string,
  planets: unknown,
  relationships: unknown
): string[] {
  const yogas: string[] = []
  const rel = asObj(relationships) as RawRelationships

  // 1. Parivartana (Mutual Reception)
  const mutualReceptions = rel.mutualReception ?? []
  const parivartana = mutualReceptions.find(
    (mr) =>
      (mr.planet_a === mdLord && mr.planet_b === adLord) ||
      (mr.planet_a === adLord && mr.planet_b === mdLord)
  )
  if (parivartana) {
    yogas.push(
      `Mutual Reception Yoga — ${parivartana.sign_a} ↔ ${parivartana.sign_b}`
    )
  }

  // 2. Conjunction
  const conjunctions = rel.conjunctions ?? []
  const conjunction = conjunctions.find(
    (c) => c.planets.includes(mdLord) && c.planets.includes(adLord)
  )
  if (conjunction) {
    yogas.push(`Conjunction in ${conjunction.sign} H${conjunction.house}`)
  }

  // 3. Raja Yoga substrate — one lord owns kendra, other owns trikona
  const mdOwns = lookupOwnsHouses(relationships, mdLord)
  const adOwns = lookupOwnsHouses(relationships, adLord)

  const mdOwnsKendra = mdOwns.some((h) => KENDRA_HOUSES.has(h))
  const mdOwnsTrikona = mdOwns.some((h) => TRIKONA_HOUSES.has(h))
  const adOwnsKendra = adOwns.some((h) => KENDRA_HOUSES.has(h))
  const adOwnsTrikona = adOwns.some((h) => TRIKONA_HOUSES.has(h))

  if (
    (mdOwnsKendra && adOwnsTrikona) ||
    (mdOwnsTrikona && adOwnsKendra)
  ) {
    const kendraLord = mdOwnsKendra ? mdLord : adLord
    const trikonaLord = mdOwnsKendra ? adLord : mdLord
    yogas.push(
      `Raja Yoga substrate — ${kendraLord} kendra owner, ${trikonaLord} trikona owner`
    )
  }

  // 4. Dhana Yoga substrate — one owns 2nd/11th, other owns 1st/5th/9th
  const mdOwnsDhana = mdOwns.some((h) => DHANA_OWNER_HOUSES.has(h))
  const mdOwnsDhanaOther = mdOwns.some((h) => DHANA_OTHER_HOUSES.has(h))
  const adOwnsDhana = adOwns.some((h) => DHANA_OWNER_HOUSES.has(h))
  const adOwnsDhanaOther = adOwns.some((h) => DHANA_OTHER_HOUSES.has(h))

  if (
    (mdOwnsDhana && adOwnsDhanaOther) ||
    (mdOwnsDhanaOther && adOwnsDhana)
  ) {
    const dhanaLord = mdOwnsDhana ? mdLord : adLord
    const dhanaOtherLord = mdOwnsDhana ? adLord : mdLord
    const dhanaHouse = mdOwnsDhana
      ? mdOwns.find((h) => DHANA_OWNER_HOUSES.has(h))!
      : adOwns.find((h) => DHANA_OWNER_HOUSES.has(h))!
    const dhanaOtherHouse = mdOwnsDhana
      ? adOwns.find((h) => DHANA_OTHER_HOUSES.has(h))!
      : mdOwns.find((h) => DHANA_OTHER_HOUSES.has(h))!
    yogas.push(
      `Dhana Yoga substrate — ${dhanaLord} H${dhanaHouse} + ${dhanaOtherLord} H${dhanaOtherHouse}`
    )
  }

  // 5. Neechabhanga — debilitated lord with cancellation condition.
  //    Cancellation applies if EITHER the debilitation-sign dispositor OR the planet
  //    exalted in that sign sits in a kendra (1,4,7,10) from lagna OR from the Moon.
  const moon = lookupPlanet(planets, 'Moon')
  const isKendraFromLagna = (planet: RawPlanet | null): boolean =>
    !!planet && KENDRA_HOUSES.has(planet.house)
  const isKendraFromMoon = (planet: RawPlanet | null): boolean => {
    if (!planet || !moon || planet.signNumber == null || moon.signNumber == null) return false
    const houseFromMoon = ((planet.signNumber - moon.signNumber + 12) % 12) + 1
    return KENDRA_HOUSES.has(houseFromMoon)
  }

  for (const lord of [mdLord, adLord]) {
    const debilSign = DEBILITATION_SIGNS[lord]
    if (!debilSign) continue

    const p = lookupPlanet(planets, lord)
    if (!p || p.sign !== debilSign) continue

    // Two candidate cancellation planets: debilitation-sign dispositor and the exalter.
    const candidates = [DEBIL_SIGN_LORD[lord], EXALT_PLANET_IN_DEBIL_SIGN[lord]]
      .filter((name): name is string => Boolean(name))
      .map((name) => lookupPlanet(planets, name))

    const cancelled = candidates.some(
      (cp) => isKendraFromLagna(cp) || isKendraFromMoon(cp)
    )

    if (cancelled) {
      yogas.push(`Neechabhanga active — ${lord} debilitation cancelled`)
    }
  }

  return yogas
}

// ─── Main function ────────────────────────────────────────────────────

/**
 * Slices the raw DashaTree JSONB to return all MD/AD/PD combinations whose
 * PD interval overlaps [dateFrom, dateTo). Each entry is annotated with
 * lord natal chart metadata and computed yoga activations.
 *
 * @param dashaTree  - Raw JSONB from UnifiedChart.dashaTree (dates are ISO strings)
 * @param dateFrom   - Start of the analysis window (inclusive)
 * @param dateTo     - End of the analysis window (exclusive)
 * @param chart      - Subset of the UnifiedChart JSONB used for annotation
 * @returns          - { slices, truncated } — slices sorted by pd.start ascending,
 *                      capped at 200 entries; truncated=true when the cap was applied.
 */
export const MAX_PERIOD_SLICES = 200

export interface SliceResult {
  slices: DashaSlice[]
  truncated: boolean
}

export function sliceDashaTree(
  dashaTree: unknown,
  dateFrom: Date,
  dateTo: Date,
  chart: {
    planets: unknown
    nakshatras: unknown
    relationships: unknown
    /** Stored CharaKaraka[] — optional; absent for paste-path/pre-migration charts. */
    karakas?: unknown
    /** Stored Yoga[] catalogue — optional; absent for paste-path/pre-migration charts. */
    yogas?: unknown
  }
): SliceResult {
  const tree = asRawDashaTree(dashaTree)
  if (!tree || !Array.isArray(tree.mahadashas)) {
    return { slices: [], truncated: false }
  }

  const results: DashaSlice[] = []

  for (const md of tree.mahadashas) {
    if (!md || typeof md !== 'object') continue
    const adList = asArray<RawAd>(md.antardashas)

    for (const ad of adList) {
      if (!ad || typeof ad !== 'object') continue
      const pdList = asArray<RawPd>(ad.pratyantardashas)

      for (const pd of pdList) {
        if (!pd || typeof pd !== 'object') continue
        if (!pd.start || !pd.end) continue

        const pdStart = new Date(pd.start)
        const pdEnd = new Date(pd.end)

        // Overlap check: pd.start < dateTo AND pd.end > dateFrom
        if (pdStart < dateTo && pdEnd > dateFrom) {
          // Compute yoga activations once per MD/AD combination
          const activatedYogas = computeActivatedYogas(
            md.lord,
            ad.lord,
            chart.planets,
            chart.relationships,
            chart.yogas
          )

          const mdAnnotation = buildAnnotation(
            md.lord,
            chart.planets,
            chart.nakshatras,
            chart.relationships,
            activatedYogas,
            chart.karakas
          )
          const adAnnotation = buildAnnotation(
            ad.lord,
            chart.planets,
            chart.nakshatras,
            chart.relationships,
            activatedYogas,
            chart.karakas
          )
          const pdAnnotation = buildAnnotation(
            pd.lord,
            chart.planets,
            chart.nakshatras,
            chart.relationships,
            activatedYogas,
            chart.karakas
          )

          results.push({
            md: {
              lord: md.lord,
              start: typeof md.start === 'string' ? md.start : new Date(md.start as Date).toISOString(),
              end: typeof md.end === 'string' ? md.end : new Date(md.end as Date).toISOString(),
            },
            ad: {
              lord: ad.lord,
              start: typeof ad.start === 'string' ? ad.start : new Date(ad.start as Date).toISOString(),
              end: typeof ad.end === 'string' ? ad.end : new Date(ad.end as Date).toISOString(),
            },
            pd: {
              lord: pd.lord,
              start: typeof pd.start === 'string' ? pd.start : new Date(pd.start as Date).toISOString(),
              end: typeof pd.end === 'string' ? pd.end : new Date(pd.end as Date).toISOString(),
            },
            lordAnnotations: {
              mdLord: mdAnnotation,
              adLord: adAnnotation,
              pdLord: pdAnnotation,
            },
          })
        }
      }
    }
  }

  // Sort by pd.start ascending
  results.sort((a, b) => {
    const aTime = new Date(a.pd.start).getTime()
    const bTime = new Date(b.pd.start).getTime()
    return aTime - bTime
  })

  // Truncate to first MAX_PERIOD_SLICES entries, flagging when the cap applied
  if (results.length > MAX_PERIOD_SLICES) {
    return { slices: results.slice(0, MAX_PERIOD_SLICES), truncated: true }
  }

  return { slices: results, truncated: false }
}
