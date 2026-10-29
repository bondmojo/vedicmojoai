/**
 * tests/vimshottari-birth-mahadasha.test.ts
 * -----------------------------------------
 * Validates: .kiro/specs/vimshottari-birth-mahadasha/ (Requirements 1–4).
 *
 * The birth (first) mahadasha is the tail of a full-length MD that began
 * before birth. Its antardashas and pratyantardashas keep their full
 * proportions and are clipped at birth, so the AD/PD running at birth comes
 * from the Moon's elapsed fraction of its nakshatra (Parashara, JHora) — not
 * from squeezing all nine ADs into the balance, starting with the MD lord.
 *
 * The oracle below shares no code with engine/computeVimshottari.ts: it walks
 * MD → AD → PD in plain millisecond arithmetic from the pre-birth start of the
 * full birth MD, with its own copy of the Vimshottari table.
 */

import { describe, it, expect } from 'vitest'
import { computeFullChart } from '../engine/compute'
import { computeVarshaphal } from '../engine/compute/varshaphal'
import { computeVimshottari, computePratyantardashas } from '../engine/computeVimshottari'
import { serializeDashaTree } from '../lib/chart-mapper'
import { repairBirthMahadasha, type StoredTree } from '../scripts/backfill-birth-mahadasha'
import type { DashaTree, Planet } from '../lib/types'

// ─── Independent oracle ─────────────────────────────────────────────

const ORACLE_SEQUENCE: [Planet, number][] = [
  ['Ketu', 7],
  ['Venus', 20],
  ['Sun', 6],
  ['Moon', 10],
  ['Mars', 7],
  ['Rahu', 18],
  ['Jupiter', 16],
  ['Saturn', 19],
  ['Mercury', 17],
]
const ORACLE_YEAR_MS = 365.2425 * 86_400_000
const ORACLE_NAKSHATRA_DEG = 360 / 27

interface OracleHit {
  chain: [Planet, Planet, Planet]
  /**
   * Distance (ms) from `atMs` to the nearest MD/AD/PD boundary, measured on the
   * unclipped layout — so a birth that falls on a sub-period boundary is caught.
   */
  margin: number
}

/** The MD/AD/PD running at `atMs`, or null outside [birth, end of the 9th MD). */
function oracleChain(moonLongitudeDeg: number, birthMs: number, atMs: number): OracleHit | null {
  if (atMs < birthMs) return null

  const nakshatra = Math.floor(moonLongitudeDeg / ORACLE_NAKSHATRA_DEG)
  const first = nakshatra % 9
  const elapsedFraction =
    (moonLongitudeDeg - nakshatra * ORACLE_NAKSHATRA_DEG) / ORACLE_NAKSHATRA_DEG

  // The birth MD began before birth: `elapsedFraction` of it had already run.
  let mdStart = birthMs - elapsedFraction * ORACLE_SEQUENCE[first][1] * ORACLE_YEAR_MS

  for (let i = 0; i < 9; i++) {
    const md = (first + i) % 9
    const mdLength = ORACLE_SEQUENCE[md][1] * ORACLE_YEAR_MS
    if (atMs < mdStart + mdLength) {
      let adStart = mdStart
      for (let j = 0; j < 9; j++) {
        const ad = (md + j) % 9
        const adLength = (mdLength * ORACLE_SEQUENCE[ad][1]) / 120
        if (atMs < adStart + adLength) {
          let pdStart = adStart
          for (let k = 0; k < 9; k++) {
            const pd = (ad + k) % 9
            const pdLength = (adLength * ORACLE_SEQUENCE[pd][1]) / 120
            if (atMs < pdStart + pdLength) {
              return {
                chain: [ORACLE_SEQUENCE[md][0], ORACLE_SEQUENCE[ad][0], ORACLE_SEQUENCE[pd][0]],
                margin: Math.min(atMs - pdStart, pdStart + pdLength - atMs),
              }
            }
            pdStart += pdLength
          }
        }
        adStart += adLength
      }
    }
    mdStart += mdLength
  }
  return null
}

// ─── Helpers ────────────────────────────────────────────────────────

/** The engine's MD/AD/PD at `atMs`, found the way consumers find it: [start, end). */
function engineChain(tree: DashaTree, atMs: number): [Planet, Planet, Planet] | null {
  const running = <T extends { start: Date; end: Date }>(periods: T[]) =>
    periods.find((p) => p.start.getTime() <= atMs && atMs < p.end.getTime())
  const md = running(tree.mahadashas)
  const ad = md && running(md.antardashas)
  const pd = ad && running(ad.pratyantardashas)
  return md && ad && pd ? [md.lord, ad.lord, pd.lord] : null
}

function birthUtc(date: string, time: string, timezone: number): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm, ss] = time.split(':').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hh, mm, ss || 0) - timezone * 3_600_000)
}

/** Deterministic PRNG (mulberry32) so sampled instants are reproducible. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/**
 * The pre-fix layout of the birth MD (all nine ADs squeezed into the balance,
 * starting with the MD lord at birth), serialized — what charts stored before
 * the fix carry.
 */
function compressedBirthMd(tree: DashaTree) {
  const md = tree.mahadashas[0]
  const lords = ORACLE_SEQUENCE.map(([lord]) => lord)
  const startIndex = lords.indexOf(md.lord)
  let cursor = md.start.getTime()
  return Array.from({ length: 9 }, (_, i) => {
    const [lord, years] = ORACLE_SEQUENCE[(startIndex + i) % 9]
    const durationDays = (md.duration_days * years) / 120
    const start = new Date(cursor)
    cursor += durationDays * 86_400_000
    return {
      lord,
      start: start.toISOString(),
      end: new Date(cursor).toISOString(),
      duration_days: durationDays,
      pratyantardashas: computePratyantardashas(md.lord, lord, start, durationDays).map((pd) => ({
        lord: pd.lord,
        start: pd.start.toISOString(),
        end: pd.end.toISOString(),
        duration_days: pd.duration_days,
      })),
    }
  })
}

// ─── Known charts (senior-astrologer review) ────────────────────────

const DELHI_1990 = {
  date: '1990-04-27',
  time: '12:00:00',
  timezone: 5.5,
  latitude: 28.6139,
  longitude: 77.209,
  name: 'Delhi 1990',
  sunriseMode: 'precise' as const,
}

function treeFor(birth: typeof DELHI_1990) {
  const chart = computeFullChart(birth)
  const moon = chart.planets.find((p) => p.planet === 'Moon')!
  const birthDate = birthUtc(birth.date, birth.time, birth.timezone)
  return { moon: moon.longitude, birthDate, tree: computeVimshottari(moon.longitude, birthDate) }
}

describe('birth mahadasha — known charts', () => {
  it('1990-04-27 Delhi: Moon/Rahu/Saturn at birth (was Moon/Moon/Moon)', () => {
    const { moon, birthDate, tree } = treeFor(DELHI_1990)
    // ~42.77°: about 20.7% into Rohini, a Moon nakshatra.
    expect(moon).toBeGreaterThan(42.7)
    expect(moon).toBeLessThan(42.8)
    expect(engineChain(tree, birthDate.getTime())).toEqual(['Moon', 'Rahu', 'Saturn'])
  })

  it('1990-04-27 Delhi: Moon/Venus/Saturn at the 1997 solar return (was Moon/Venus/Jupiter)', () => {
    const { tree } = treeFor(DELHI_1990)
    const pravesh = new Date(computeVarshaphal({ ...DELHI_1990, varshaYear: 1997 }).varshaPravesh.utcISO)
    expect(pravesh.getUTCFullYear()).toBe(1997)
    expect(engineChain(tree, pravesh.getTime())).toEqual(['Moon', 'Venus', 'Saturn'])
  })

  it('1975-11-03 03:15 IST Mumbai: Rahu/Rahu/Saturn at birth (was Rahu/Rahu/Rahu)', () => {
    const { birthDate, tree } = treeFor({
      ...DELHI_1990,
      date: '1975-11-03',
      time: '03:15:00',
      latitude: 19.076,
      longitude: 72.8777,
    })
    expect(engineChain(tree, birthDate.getTime())).toEqual(['Rahu', 'Rahu', 'Saturn'])
  })

  it('2001-07-19 22:40 UTC-4 New York: Jupiter/Saturn/Jupiter at birth (was Jupiter/Jupiter/Jupiter)', () => {
    const { birthDate, tree } = treeFor({
      ...DELHI_1990,
      date: '2001-07-19',
      time: '22:40:00',
      timezone: -4,
      latitude: 40.7128,
      longitude: -74.006,
    })
    expect(engineChain(tree, birthDate.getTime())).toEqual(['Jupiter', 'Saturn', 'Jupiter'])
  })
})

// ─── Oracle sweep ───────────────────────────────────────────────────

/**
 * Moon longitudes in every nakshatra, at several elapsed fractions. Exact
 * nakshatra boundaries (fraction 0) are left out: there `Math.floor(lon / span)`
 * and `lon % span` can disagree by one nakshatra in floating point — a
 * pre-existing balance quirk this spec does not change (see design.md).
 */
const SWEEP_FRACTIONS = [1e-7, 0.0001, 0.0517, 0.2075, 0.4863, 0.8311, 0.9999]
const SWEEP_LONGITUDES = Array.from({ length: 27 }, (_, n) =>
  SWEEP_FRACTIONS.map((f) => (n + f) * ORACLE_NAKSHATRA_DEG)
).flat()

// One modern birth and one before the Unix epoch (negative timestamps).
const SWEEP_BIRTHS = [new Date('1990-04-27T06:30:00Z'), new Date('1948-01-30T11:47:00Z')]

describe('birth mahadasha — independent oracle sweep', () => {
  it('matches the oracle MD/AD/PD at sampled instants across the whole tree', () => {
    const random = prng(20261028)
    let compared = 0
    const mismatches: string[] = []

    for (const birth of SWEEP_BIRTHS) {
      for (const moon of SWEEP_LONGITUDES) {
        const tree = computeVimshottari(moon, birth)
        const birthMs = birth.getTime()
        const firstEnd = tree.mahadashas[0].end.getTime()
        const lastEnd = tree.mahadashas[8].end.getTime()

        // Birth itself, 120 instants inside the birth MD, 40 anywhere.
        const instants = [birthMs]
        for (let i = 0; i < 120; i++) instants.push(birthMs + random() * (firstEnd - birthMs))
        for (let i = 0; i < 40; i++) instants.push(birthMs + random() * (lastEnd - birthMs))

        for (const at of instants) {
          const expected = oracleChain(moon, birthMs, at)
          // Skip instants within a second of a boundary: the engine keeps
          // millisecond Dates and may sit a few ms off the float oracle there.
          if (!expected || expected.margin < 1000) continue
          const actual = engineChain(tree, at)
          compared++
          if (JSON.stringify(actual) !== JSON.stringify(expected.chain)) {
            mismatches.push(
              `moon=${moon.toFixed(4)} birth=${birth.toISOString()} at=${new Date(at).toISOString()}: ` +
                `engine ${actual?.join('/')} vs oracle ${expected.chain.join('/')}`
            )
          }
        }
      }
    }

    expect(mismatches.slice(0, 10)).toEqual([])
    expect(compared).toBeGreaterThan(SWEEP_BIRTHS.length * SWEEP_LONGITUDES.length * 150)
  })
})

// ─── Structural invariants ──────────────────────────────────────────

describe('birth mahadasha — layout', () => {
  const birth = new Date('1990-04-27T06:30:00Z')

  it.each(SWEEP_LONGITUDES)('moon %f: clipped ADs/PDs tile [birth, MD end] and sum to the balance', (moon) => {
    const tree = computeVimshottari(moon, birth)
    const md = tree.mahadashas[0]

    // MD-level fields are the balance, as before the fix.
    expect(md.start.getTime()).toBe(birth.getTime())
    expect(md.duration_days).toBeCloseTo(tree.balance_years * 365.2425, 6)

    expect(md.antardashas.length).toBeGreaterThan(0)
    expect(md.antardashas.length).toBeLessThanOrEqual(9)
    expect(md.antardashas[0].start.getTime()).toBe(birth.getTime())
    expect(Math.abs(md.antardashas.at(-1)!.end.getTime() - md.end.getTime())).toBeLessThan(1000)

    let adCursor = birth.getTime()
    let adSum = 0
    for (const ad of md.antardashas) {
      expect(Math.abs(ad.start.getTime() - adCursor)).toBeLessThan(1000)
      expect(ad.end.getTime()).toBeGreaterThan(ad.start.getTime())
      adCursor = ad.end.getTime()
      adSum += ad.duration_days

      let pdCursor = ad.start.getTime()
      let pdSum = 0
      expect(ad.pratyantardashas.length).toBeGreaterThan(0)
      for (const pd of ad.pratyantardashas) {
        expect(Math.abs(pd.start.getTime() - pdCursor)).toBeLessThan(1000)
        expect(pd.start.getTime()).toBeGreaterThanOrEqual(birth.getTime())
        pdCursor = pd.end.getTime()
        pdSum += pd.duration_days
      }
      expect(Math.abs(pdSum - ad.duration_days)).toBeLessThan(1 / 86_400)
    }
    expect(Math.abs(adSum - md.duration_days)).toBeLessThan(1 / 86_400)

    // The birth MD always ends with the full, unclipped AD of the lord that
    // precedes the MD lord in the Vimshottari order.
    const lords = ORACLE_SEQUENCE.map(([lord]) => lord)
    const lastAd = md.antardashas.at(-1)!
    expect(lastAd.lord).toBe(lords[(lords.indexOf(md.lord) + 8) % 9])
  })

  it.each([
    [0, 'Ketu', ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury']],
    [40 + 1e-9, 'Moon', ['Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury', 'Ketu', 'Venus', 'Sun']],
  ])('a Moon at the very start of its nakshatra (%f) keeps the full nine-AD layout', (moon, lord, adLords) => {
    const tree = computeVimshottari(moon as number, birth)
    const md = tree.mahadashas[0]
    expect(md.lord).toBe(lord)
    expect(md.antardashas.map((ad) => ad.lord)).toEqual(adLords)
    expect(md.antardashas.every((ad) => ad.pratyantardashas.length === 9)).toBe(true)
    expect(md.antardashas[0].pratyantardashas[0].lord).toBe(lord)
  })

  it('drops the ADs that ended before birth', () => {
    // 1990 Delhi: Moon and Mars ADs ran entirely before birth.
    const tree = computeVimshottari(42.76653743591333, birth)
    expect(tree.mahadashas[0].antardashas.map((ad) => ad.lord)).toEqual(
      ['Rahu', 'Jupiter', 'Saturn', 'Mercury', 'Ketu', 'Venus', 'Sun']
    )
    // Rahu AD: Rahu and Jupiter PDs ran before birth; Saturn is running.
    expect(tree.mahadashas[0].antardashas[0].pratyantardashas[0].lord).toBe('Saturn')
  })

  it('leaves MDs 2–9 as full, unclipped nine-AD periods starting with the MD lord', () => {
    const tree = computeVimshottari(42.76653743591333, birth)
    for (let i = 1; i < 9; i++) {
      const md = tree.mahadashas[i]
      expect(md.start.getTime()).toBe(tree.mahadashas[i - 1].end.getTime())
      expect(md.antardashas).toHaveLength(9)
      expect(md.antardashas[0].lord).toBe(md.lord)
      expect(md.antardashas[0].start.getTime()).toBe(md.start.getTime())
      for (const ad of md.antardashas) {
        expect(ad.pratyantardashas).toHaveLength(9)
        expect(ad.pratyantardashas[0].lord).toBe(ad.lord)
      }
    }
  })
})

// ─── Backfill (scripts/backfill-birth-mahadasha.ts) ─────────────────

describe('backfill-birth-mahadasha', () => {
  const birth = new Date('1990-04-27T06:30:00Z')

  it('rebuilds a pre-fix tree into exactly what the engine now produces, touching only the birth MD', () => {
    const fixed = serializeDashaTree(computeVimshottari(42.76653743591333, birth))
    const stored = JSON.parse(JSON.stringify(fixed)) as StoredTree & typeof fixed
    stored.mahadashas[0].antardashas = compressedBirthMd(computeVimshottari(42.76653743591333, birth))
    const laterMds = JSON.stringify(stored.mahadashas.slice(1))

    expect(stored.mahadashas[0].antardashas[0].lord).toBe('Moon') // the bug
    expect(repairBirthMahadasha(stored)).toBe(true)
    expect(stored).toEqual(fixed)
    expect(JSON.stringify(stored.mahadashas.slice(1))).toBe(laterMds)
    expect(stored.balance_years).toBe(fixed.balance_years)
  })

  it('is idempotent, and ignores key order the way JSONB returns it', () => {
    const fixed = serializeDashaTree(computeVimshottari(187.4863351817594, birth))
    const reordered = JSON.parse(
      JSON.stringify(fixed, (_key, value) =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1)))
          : value
      )
    ) as StoredTree

    expect(repairBirthMahadasha(reordered)).toBe(false)
    expect(repairBirthMahadasha(fixed as StoredTree)).toBe(false)
  })

  it('fills a birth MD stored without pratyantardashas', () => {
    const fixed = serializeDashaTree(computeVimshottari(83.65445793903736, birth))
    const stored = JSON.parse(JSON.stringify(fixed)) as StoredTree & typeof fixed
    for (const ad of stored.mahadashas[0].antardashas) (ad as { pratyantardashas?: unknown }).pratyantardashas = undefined

    expect(repairBirthMahadasha(stored)).toBe(true)
    expect(stored).toEqual(fixed)
  })

  it('leaves trees it cannot interpret untouched', () => {
    expect(repairBirthMahadasha({})).toBe(false)
    expect(repairBirthMahadasha({ mahadashas: [] })).toBe(false)
    const badLord = { mahadashas: [{ lord: 'Pluto', start: birth.toISOString(), end: birth.toISOString() }] }
    expect(repairBirthMahadasha(badLord)).toBe(false)
    const tooLong = {
      mahadashas: [
        { lord: 'Sun', start: birth.toISOString(), end: '2010-01-01T00:00:00.000Z', duration_days: 7300 },
      ],
    }
    expect(repairBirthMahadasha(tooLong)).toBe(false)
  })
})
