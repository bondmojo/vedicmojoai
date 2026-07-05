/**
 * engine/compute/nakshatraRelationships.ts — Nakshatra-level relationship geometry (REQ-6).
 *
 * Derives constellation-level (nakshatra) relationships from the per-planet
 * NakshatraInfo already produced by nakshatras.ts. Everything here is pure
 * arithmetic over the 9 planet entries:
 *
 *   - subLords            : the Vimshottari sub-lord of each planet's longitude
 *   - depositorChains     : 3-level nakshatra-lord depositor chains
 *   - nakshatraParivartana: nakshatra-level mutual reception (36-pair scan)
 *   - clusters            : planets sharing a nakshatra
 *   - rahuKetuAxis         : the Rahu/Ketu nakshatra axis entries
 *   - nakshatraLordGroups : planets grouped by their nakshatra lord (sympathy)
 *
 * Spec: .kiro/specs/deterministic-1c-1d/  (SCOPE FINALIZED — nakshatra relationships)
 */

import type {
  NakshatraInfo,
  NakshatraRelationships,
  NakshatraAxisEntry,
  PlanetPosition,
} from './types'

// The two lunar nodes are terminal in depositor chains: they do not "sit" in a
// depositor's constellation in a way that we continue the chain through.
const NODES = new Set(['Rahu', 'Ketu'])

/** Build a NakshatraAxisEntry from a nakshatra info record. */
function toAxisEntry(info: NakshatraInfo): NakshatraAxisEntry {
  return {
    planet: info.planet,
    nakshatra: info.nakshatra,
    pada: info.pada,
    nakshatraLord: info.nakshatraLord,
    subLord: info.subLord,
  }
}

/** Empty placeholder axis entry when Rahu/Ketu is unexpectedly absent. */
function emptyAxisEntry(planet: string): NakshatraAxisEntry {
  return { planet, nakshatra: '', pada: 0, nakshatraLord: '', subLord: '' }
}

/**
 * Builds the 3-level nakshatra-lord depositor chain for a starting planet.
 *
 * Level 1 is the planet's own nakshatra lord; level 2 is that lord's nakshatra
 * lord (found by locating where the lord itself is placed); level 3 continues
 * once more. The walk stops early when a lord is a node (Rahu/Ketu) or is not
 * among the placed planets. `selfReinforcing` is true when the chain revisits
 * the starting planet or otherwise loops back onto a lord already seen.
 */
function buildDepositorChain(
  startPlanet: string,
  byPlanet: Map<string, NakshatraInfo>
): { chain: string[]; selfReinforcing: boolean } {
  const chain: string[] = []
  const seen = new Set<string>([startPlanet])
  let current = startPlanet
  let selfReinforcing = false

  for (let level = 0; level < 3; level++) {
    const entry = byPlanet.get(current)
    if (!entry) break

    const lord = entry.nakshatraLord
    chain.push(lord)

    // Loop / self-reinforcement detection.
    if (lord === startPlanet || seen.has(lord)) {
      selfReinforcing = true
      break
    }
    seen.add(lord)

    // Nodes are terminal; also stop if the lord is not placed.
    if (NODES.has(lord) || !byPlanet.has(lord)) break

    current = lord
  }

  return { chain, selfReinforcing }
}

/**
 * Computes all nakshatra-level relationships for a chart.
 *
 * @param nakshatras   Per-planet nakshatra info (from computeNakshatras).
 * @param lagnaSubLord Optional sub-lord of the lagna; when supplied it is added
 *                     to the subLords list as a "Lagna" entry for convenience.
 */
export function computeNakshatraRelationships(
  nakshatras: NakshatraInfo[],
  lagnaSubLord?: string
): NakshatraRelationships {
  const byPlanet = new Map<string, NakshatraInfo>()
  for (const n of nakshatras) byPlanet.set(n.planet, n)

  // ── subLords ──────────────────────────────────────────────────────
  const subLords = nakshatras.map((n) => ({ planet: n.planet, subLord: n.subLord }))
  if (lagnaSubLord) subLords.push({ planet: 'Lagna', subLord: lagnaSubLord })

  // ── depositorChains ───────────────────────────────────────────────
  const depositorChains = nakshatras.map((n) => {
    const { chain, selfReinforcing } = buildDepositorChain(n.planet, byPlanet)
    return { planet: n.planet, chain, selfReinforcing }
  })

  // ── nakshatraParivartana (nakshatra-level mutual reception) ────────
  // A pair (A,B) reciprocates when A's nakshatra lord is B and B's is A.
  const nakshatraParivartana: { planet_a: string; planet_b: string }[] = []
  for (let i = 0; i < nakshatras.length; i++) {
    for (let j = i + 1; j < nakshatras.length; j++) {
      const a = nakshatras[i]
      const b = nakshatras[j]
      if (a.nakshatraLord === b.planet && b.nakshatraLord === a.planet) {
        nakshatraParivartana.push({ planet_a: a.planet, planet_b: b.planet })
      }
    }
  }

  // ── clusters (2+ planets sharing a nakshatra) ─────────────────────
  const byNakshatra = new Map<string, NakshatraInfo[]>()
  for (const n of nakshatras) {
    const list = byNakshatra.get(n.nakshatra)
    if (list) list.push(n)
    else byNakshatra.set(n.nakshatra, [n])
  }
  const clusters = [...byNakshatra.values()]
    .filter((list) => list.length >= 2)
    .map((list) => ({
      nakshatra: list[0].nakshatra,
      nakshatraLord: list[0].nakshatraLord,
      planets: list.map((n) => n.planet),
      count: list.length,
    }))

  // ── rahuKetuAxis ──────────────────────────────────────────────────
  const rahuInfo = byPlanet.get('Rahu')
  const ketuInfo = byPlanet.get('Ketu')
  const rahuKetuAxis = {
    rahu: rahuInfo ? toAxisEntry(rahuInfo) : emptyAxisEntry('Rahu'),
    ketu: ketuInfo ? toAxisEntry(ketuInfo) : emptyAxisEntry('Ketu'),
  }

  // ── nakshatraLordGroups (sympathy groups) ─────────────────────────
  const nakshatraLordGroups: Record<string, string[]> = {}
  for (const n of nakshatras) {
    ;(nakshatraLordGroups[n.nakshatraLord] ??= []).push(n.planet)
  }

  return {
    subLords,
    depositorChains,
    nakshatraParivartana,
    clusters,
    rahuKetuAxis,
    nakshatraLordGroups,
    computedAt: new Date().toISOString(),
  }
}
