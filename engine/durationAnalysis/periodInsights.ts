/**
 * engine/durationAnalysis/periodInsights.ts
 *
 * buildPeriodInsights — pure function, no LLM, no DB.
 *
 * Turns a scored MD/AD/PD period + its category chart data into a curated,
 * human-readable digest of the astrological drivers a senior astrologer reads:
 * Control (house ownership tagged by domain relevance), Drishti (graha aspects
 * cast/received + Jaimini rashi-drishti onto domain houses), Nakshatra threads
 * (star-lord depositor chain + star-exchange), association (conjunction /
 * parivartana), plus a per-domain-house focus block.
 *
 * This is a SELECTION + LABELING pass over data ALREADY computed and returned in
 * the /api/timeline payload — relationships.aspects/rashiAspects, jaimini.argala,
 * nakshatraRelationships, lordAnnotations, and scoreBreakdown. It performs NO new
 * astrology and reuses the compute-layer helpers (houseToSign, SIGN_LORDS,
 * NATURAL_BENEFICS/MALEFICS, getSignName) so it cannot drift from the engine.
 *
 * Why it exists: the MCP path hands the raw relationship arrays to Claude Desktop
 * and the LLM interprets them. The deterministic Duration Analyser UI has no LLM,
 * so this digest does that selection deterministically for on-screen display.
 *
 * Every facet degrades gracefully — a missing column (paste-path chart with no
 * jaimini / divisionalCharts, or an absent nakshatra thread) simply yields an
 * empty sub-section; the function never throws.
 */

import type {
  ScoredDashaSlice,
  DomainScoringWeights,
  PeriodInsights,
  LordDriver,
  VargaDriver,
  DomainHouseFocus,
  TaggedHouse,
  HouseRole,
  DrishtiCast,
  DrishtiReceived,
  PeriodLordAnnotation,
  ScoreBreakdown,
} from '@/lib/durationTypes'
import type {
  PlanetPosition,
  AspectEdge,
  RashiAspectEdge,
  Conjunction,
  Parivartana,
  BhavaBalaHouse,
  DivisionalChart,
  DivisionalPlacement,
} from '@/engine/compute/types'
import {
  SIGN_LORDS,
  NATURAL_BENEFICS,
  houseToSign,
  getPlanetsInHouse,
  computeGrahaDrishti,
} from '@/engine/compute/relationships'
import { getSignName } from '@/engine/compute/planets'

// ─── Loosely-typed view of the category chart data this digest reads ──────

interface InsightsChartData {
  planets?: unknown
  relationships?: unknown
  nakshatraRelationships?: unknown
  jaimini?: unknown
  bhavaBala?: unknown
  ashtakavarga?: unknown
  divisionalCharts?: unknown
}

// ─── Small local helpers (pure) ───────────────────────────────────────────

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

/** Derive the D1 lagna sign from any planet's (signNumber, house-from-lagna). */
function deriveLagnaSign(planets: PlanetPosition[]): number | null {
  for (const p of planets) {
    if (p.signNumber >= 1 && p.signNumber <= 12 && p.house >= 1 && p.house <= 12) {
      return ((p.signNumber - 1 - (p.house - 1) + 12) % 12) + 1
    }
  }
  return null
}

/** Tag a house-from-lagna with the domain role it plays. primary wins over benefic/malefic. */
function roleFor(house: number, dw: DomainScoringWeights): HouseRole {
  if (dw.primaryHouses.includes(house)) return 'primary'
  if (dw.maleficHouses.includes(house)) return 'malefic'
  if (dw.beneficHouses.includes(house)) return 'benefic'
  return 'neutral'
}

function taggedHouse(house: number, lagnaSign: number, dw: DomainScoringWeights): TaggedHouse {
  return { house, sign: getSignName(houseToSign(house, lagnaSign)), role: roleFor(house, dw) }
}

/** Read a factor's raw value from the score breakdown by factor key. */
function factorValue(breakdown: ScoreBreakdown | undefined, factor: string): unknown {
  return breakdown?.factors?.find((f) => f.factor === factor)?.value
}

/** Dignity label for a running lord (mdLordDignity/adLordDignity/pdLordDignity value). */
function dignityOf(breakdown: ScoreBreakdown | undefined, level: 'MD' | 'AD' | 'PD'): string | null {
  const key = level === 'MD' ? 'mdLordDignity' : level === 'AD' ? 'adLordDignity' : 'pdLordDignity'
  const v = factorValue(breakdown, key)
  return typeof v === 'string' ? v : null
}

/** Domain primary houses reached by a lord's Jaimini rashi aspect (from the rashiDrishti factor). */
function rashiDrishtiHousesFor(breakdown: ScoreBreakdown | undefined, lord: string): number[] {
  const v = factorValue(breakdown, 'rashiDrishti')
  if (!Array.isArray(v)) return []
  const entry = (v as Array<{ lord?: string; toHouses?: number[] }>).find((e) => e.lord === lord)
  return Array.isArray(entry?.toHouses) ? entry!.toHouses! : []
}

// ─── Per-varga (divisional-chart) control + drishti ────────────────────────

/**
 * computeGrahaDrishti only reads `.planet`/`.house` off each entry — DivisionalPlacement
 * carries both, so this cast is safe even though the varga chart's placements are a
 * lighter shape than the natal PlanetPosition (no longitude/latitude/speed).
 */
function asAspectInput(planets: DivisionalPlacement[]): PlanetPosition[] {
  return planets as unknown as PlanetPosition[]
}

/**
 * Control + drishti for ONE lord within ONE divisional chart — house numbers are
 * counted from the varga's own lagna (classical convention: Nth house of a varga
 * carries the same significance as the Nth house of D1).
 */
function buildVargaDriver(lord: string, chart: DivisionalChart, dw: DomainScoringWeights): VargaDriver | null {
  const vargaLagnaSign = chart.lagnaSignNumber
  // House OWNERSHIP only needs the varga's own lagna (SIGN_LORDS lookup) — not the
  // planet placements — so this only bails when the lagna itself is unresolvable.
  if (!vargaLagnaSign) return null
  const vargaPlanets = chart.planets ?? []

  const lp = vargaPlanets.find((p) => p.planet === lord)
  const occupies: TaggedHouse | null = lp
    ? { house: lp.house, sign: lp.sign || getSignName(houseToSign(lp.house, vargaLagnaSign)), role: roleFor(lp.house, dw) }
    : null

  const owns: TaggedHouse[] = []
  for (let house = 1; house <= 12; house++) {
    const sign = houseToSign(house, vargaLagnaSign)
    if (SIGN_LORDS[sign] === lord) owns.push(taggedHouse(house, vargaLagnaSign, dw))
  }

  let aspectsOntoPrimary: number[] = []
  if (lp) {
    const vargaAspects = computeGrahaDrishti(asAspectInput(vargaPlanets), vargaLagnaSign)
    const primary = new Set(dw.primaryHouses)
    aspectsOntoPrimary = [...new Set(
      vargaAspects.filter((e) => e.from === lord && primary.has(e.toHouse)).map((e) => e.toHouse)
    )]
  }

  return { division: chart.division, name: `D${chart.division} — ${chart.name}`, occupies, owns, aspectsOntoPrimary }
}

function buildVargaDrivers(lord: string, divisionalCharts: DivisionalChart[], dw: DomainScoringWeights): VargaDriver[] {
  return divisionalCharts
    .filter((c) => c.division !== 1)
    .map((c) => buildVargaDriver(lord, c, dw))
    .filter((v): v is VargaDriver => v !== null)
}

// ─── Per-lord driver ───────────────────────────────────────────────────────

function buildLordDriver(
  level: 'MD' | 'AD' | 'PD',
  ann: PeriodLordAnnotation,
  ctx: {
    lagnaSign: number
    dw: DomainScoringWeights
    breakdown: ScoreBreakdown | undefined
    aspects: AspectEdge[]
    conjunctions: Conjunction[]
    mutualReception: Parivartana[]
    depositorChains: Array<{ planet: string; chain: string[] }>
    nakshatraParivartana: Array<{ planet_a: string; planet_b: string }>
    divisionalCharts: DivisionalChart[]
  }
): LordDriver {
  const lord = ann.planet
  const { lagnaSign, dw, breakdown } = ctx

  // Control
  const owns: TaggedHouse[] = (ann.ownsHouses ?? []).map((h) => taggedHouse(h, lagnaSign, dw))
  const occupies: TaggedHouse | null =
    ann.occupiesHouse > 0
      ? { house: ann.occupiesHouse, sign: ann.sign || getSignName(houseToSign(ann.occupiesHouse, lagnaSign)), role: roleFor(ann.occupiesHouse, dw) }
      : null

  // Drishti cast — domain-relevant aspects first
  const aspectsCast: DrishtiCast[] = ctx.aspects
    .filter((e) => e.from === lord)
    .map((e) => {
      const toRole = roleFor(e.toHouse, dw)
      return {
        type: e.type,
        toHouse: e.toHouse,
        toSign: getSignName(e.toSign),
        toRole,
        toPlanets: e.toPlanets ?? [],
        ontoDomain: toRole === 'primary' || toRole === 'benefic',
      }
    })
    .sort((a, b) => Number(b.ontoDomain) - Number(a.ontoDomain))

  // Drishti received — dedupe by aspecting planet + type
  const seenReceived = new Set<string>()
  const aspectsReceived: DrishtiReceived[] = []
  for (const e of ctx.aspects) {
    if (!e.toPlanets?.includes(lord)) continue
    const key = `${e.from}:${e.type}`
    if (seenReceived.has(key)) continue
    seenReceived.add(key)
    aspectsReceived.push({ from: e.from, type: e.type, benefic: NATURAL_BENEFICS.includes(e.from) })
  }

  // Nakshatra thread
  const chainEntry = ctx.depositorChains.find((c) => c.planet === lord)
  const starExchange = ctx.nakshatraParivartana.find((p) => p.planet_a === lord || p.planet_b === lord)
  const starExchangeWith = starExchange ? (starExchange.planet_a === lord ? starExchange.planet_b : starExchange.planet_a) : null

  // Association
  const conjunctWith = ctx.conjunctions
    .filter((c) => c.planets?.includes(lord))
    .flatMap((c) => c.planets.filter((p) => p !== lord))
  const reception = ctx.mutualReception.find((r) => r.planet_a === lord || r.planet_b === lord)
  const parivartanaWith = reception ? (reception.planet_a === lord ? reception.planet_b : reception.planet_a) : null

  return {
    level,
    lord,
    dignity: dignityOf(breakdown, level),
    retrograde: ann.retrograde,
    combust: ann.combust,
    cazimi: ann.cazimi,
    karakaRole: ann.karakaRole,
    isNaturalKaraka: dw.relevantNaturalKarakas.includes(lord),
    owns,
    occupies,
    aspectsCast,
    aspectsReceived,
    rashiDrishtiOnDomain: rashiDrishtiHousesFor(breakdown, lord),
    vargas: buildVargaDrivers(lord, ctx.divisionalCharts, dw),
    nakshatra: ann.nakshatra,
    nakshatraLord: ann.nakshatraLord,
    subLord: ann.subLord,
    nakshatraChain: chainEntry?.chain ?? [],
    starExchangeWith,
    conjunctWith: [...new Set(conjunctWith)],
    parivartanaWith,
  }
}

// ─── Domain-house focus ────────────────────────────────────────────────────

function buildDomainHouseFocus(
  house: number,
  ctx: {
    lagnaSign: number
    dw: DomainScoringWeights
    planets: PlanetPosition[]
    aspects: AspectEdge[]
    argala: Array<{ targetHouse: number; argalaFrom: number; argalaPlanets: string[]; type: 'primary' | 'secondary' }>
    bhavaHouses: BhavaBalaHouse[]
    sav: number[]
    runningDignity: Record<string, string | null>
  }
): DomainHouseFocus {
  const { lagnaSign, dw, planets } = ctx
  const signNumber = houseToSign(house, lagnaSign)
  const lord = SIGN_LORDS[signNumber] ?? null
  const lordPlanet = lord ? planets.find((p) => p.planet === lord) : undefined

  const aspectedBy = ctx.aspects
    .filter((e) => e.toHouse === house)
    .map((e) => ({ planet: e.from, type: e.type, benefic: NATURAL_BENEFICS.includes(e.from) }))
  // dedupe by planet + type
  const seen = new Set<string>()
  const aspectedByUnique = aspectedBy.filter((a) => {
    const k = `${a.planet}:${a.type}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  return {
    house,
    sign: getSignName(signNumber),
    role: roleFor(house, dw),
    lord,
    lordHouse: lordPlanet?.house ?? null,
    lordDignity: lord ? ctx.runningDignity[lord] ?? null : null,
    occupants: getPlanetsInHouse(house, planets),
    aspectedBy: aspectedByUnique,
    argalaFrom: ctx.argala
      .filter((a) => a.targetHouse === house)
      .map((a) => ({ house: a.argalaFrom, planets: a.argalaPlanets ?? [], type: a.type })),
    bhavaBalaRupas: ctx.bhavaHouses.find((h) => h.house === house)?.rupas ?? null,
    savBindu: Array.isArray(ctx.sav) ? ctx.sav[signNumber - 1] ?? null : null,
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Build the per-period driver digest. Pure; returns null only when the slice has
 * no lord annotations (nothing to describe).
 */
export function buildPeriodInsights(
  slice: ScoredDashaSlice,
  categoryData: InsightsChartData,
  domainWeights: DomainScoringWeights
): PeriodInsights | null {
  const ann = slice.lordAnnotations
  if (!ann) return null

  const planets = asArray<PlanetPosition>(categoryData.planets)
  const lagnaSign = deriveLagnaSign(planets)
  if (lagnaSign == null) return null

  const rel = (categoryData.relationships ?? {}) as {
    aspects?: unknown
    conjunctions?: unknown
    mutualReception?: unknown
  }
  const nak = (categoryData.nakshatraRelationships ?? {}) as {
    depositorChains?: unknown
    nakshatraParivartana?: unknown
  }
  const jaimini = (categoryData.jaimini ?? {}) as { argala?: unknown }
  const bhava = (categoryData.bhavaBala ?? {}) as { houses?: unknown }
  const ashtaka = (categoryData.ashtakavarga ?? {}) as { sav?: unknown }

  const aspects = asArray<AspectEdge>(rel.aspects)
  const conjunctions = asArray<Conjunction>(rel.conjunctions)
  const mutualReception = asArray<Parivartana>(rel.mutualReception)
  const depositorChains = asArray<{ planet: string; chain: string[] }>(nak.depositorChains)
  const nakshatraParivartana = asArray<{ planet_a: string; planet_b: string }>(nak.nakshatraParivartana)
  const argala = asArray<{ targetHouse: number; argalaFrom: number; argalaPlanets: string[]; type: 'primary' | 'secondary' }>(jaimini.argala)
  const bhavaHouses = asArray<BhavaBalaHouse>(bhava.houses)
  const sav = Array.isArray(ashtaka.sav) ? (ashtaka.sav as number[]) : []
  const divisionalCharts = asArray<DivisionalChart>(categoryData.divisionalCharts)

  const lordCtx = {
    lagnaSign,
    dw: domainWeights,
    breakdown: slice.scoreBreakdown,
    aspects,
    conjunctions,
    mutualReception,
    depositorChains,
    nakshatraParivartana,
    divisionalCharts,
  }

  const lords: LordDriver[] = [
    buildLordDriver('MD', ann.mdLord, lordCtx),
    buildLordDriver('AD', ann.adLord, lordCtx),
    buildLordDriver('PD', ann.pdLord, lordCtx),
  ]

  // Dignity map for the running lords — reused to label a domain-house lord when
  // it happens to be a running lord (no independent dignity recompute).
  const runningDignity: Record<string, string | null> = {}
  for (const d of lords) runningDignity[d.lord] = d.dignity

  const focusCtx = { lagnaSign, dw: domainWeights, planets, aspects, argala, bhavaHouses, sav, runningDignity }
  const domainHouseFocus: DomainHouseFocus[] = [...domainWeights.primaryHouses]
    .sort((a, b) => a - b)
    .map((h) => buildDomainHouseFocus(h, focusCtx))

  const runningLords = [ann.mdLord.planet, ann.adLord.planet, ann.pdLord.planet]
  const amongRunningLords = [...new Set(runningLords.filter((l) => domainWeights.relevantNaturalKarakas.includes(l)))]

  // Karaka-role match: does a running lord carry a Jaimini role the domain cares about?
  let karakaRoleMatch: string | null = null
  const relevantRoles = new Set(domainWeights.relevantKarakaRoles)
  for (const d of lords) {
    if (d.karakaRole && relevantRoles.has(d.karakaRole)) {
      karakaRoleMatch = `${d.karakaRole} = ${d.level} lord (${d.lord})`
      break
    }
  }

  return {
    lords,
    domainHouseFocus,
    karakaSummary: {
      naturalKarakas: domainWeights.relevantNaturalKarakas,
      amongRunningLords,
      karakaRoleMatch,
    },
  }
}
