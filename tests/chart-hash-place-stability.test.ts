/**
 * tests/chart-hash-place-stability.test.ts
 *
 * Two guarantees about what `mapComputedToUnified` hands to Prisma:
 *
 *  1. Chart_Hash stability (Requirement 7.2) — `place` is NOT part of the hashed
 *     input set, so a picker-derived save and a hand-typed save of the same
 *     coordinates still dedupe against each other (Requirement 9.3).
 *  2. The persisted `birthInput` JSON shape (Requirement 7.1) — the nested
 *     `place` object when a place was resolved, and NO `place` key at all when
 *     one wasn't.
 *
 * On (2): Prisma 5's JSON-protocol argument serializer drops object properties
 * whose value is `undefined` (it never reaches the query engine, so it cannot
 * land as SQL `null`). That makes `{ place: undefined }` and an absent key
 * equivalent *on the wire* — but not equivalent to `'place' in birthInput`
 * checks, nor to `toEqual`, which treats an explicit-undefined key as absent
 * and would pass either way. Hence the key-absence assertions below use
 * `toHaveProperty` / `Object.keys`.
 */
import crypto from 'crypto'
import { describe, expect, it } from 'vitest'
import {
  buildChartInputV1FromUnified,
  mapComputedToUnified,
  type BirthPlace,
  type SerializedDashaTree,
} from '@/lib/chart-mapper'
import type { ComputedChart } from '@/engine/compute/types'

const BIRTH_INPUT = {
  date: '1990-01-01',
  time: '10:00:00',
  timezone: 5.5,
  latitude: 18.6772446,
  longitude: 73.8981129,
  name: 'Hash Stability Test',
  sunriseMode: 'precise' as const,
}

const DASHAS: SerializedDashaTree = {
  balance_years: 0,
  mahadashas: [],
}

const PLACE: BirthPlace = {
  id: '8f14e45f-ceea-467a-9f5e-6f0f1c3b2a10',
  name: 'Alandi',
  kind: 'village',
  state: 'Maharashtra',
  district: 'Pune',
  county: 'Khed',
  label: 'Alandi, Khed, Maharashtra',
}

/**
 * The exact key set `BirthPlaceSchema` in POST /api/unified-charts/from-compute
 * accepts. That schema is `.strict()`, so anything extra — notably latitude /
 * longitude, which stay top-level compute inputs — would be rejected at the
 * route boundary and must never be smuggled inside `place`.
 */
const BIRTH_PLACE_KEYS = ['id', 'name', 'kind', 'state', 'district', 'county', 'label'] as const

/** Minimal real mapper input: only fields consumed by mapComputedToUnified matter here. */
const CHART = {
  input: BIRTH_INPUT,
  lagna: 'Aries',
  lagnaLongitude: 12.34,
  planets: [{ planet: 'Moon', longitude: 123.45 }],
  ayanamsa: 24.1,
  sunriseMode: 'precise',
} as ComputedChart

function birthInputOf(place?: BirthPlace): Record<string, unknown> {
  const mapped = mapComputedToUnified(CHART, DASHAS, 'Hash Stability Test', place)
  return mapped.birthInput as unknown as Record<string, unknown>
}

describe('mapComputedToUnified — chart hash place stability (Requirement 7.2)', () => {
  it('produces an identical chartHash with and without a resolved place', () => {
    const withoutPlace = mapComputedToUnified(CHART, DASHAS, 'Hash Stability Test')
    const withPlace = mapComputedToUnified(CHART, DASHAS, 'Hash Stability Test', PLACE)

    expect(withPlace.chartHash).toBe(withoutPlace.chartHash)
  })

  it('ignores the place identity entirely — two different places, same coordinates, same hash (Requirement 9.3)', () => {
    const pickerSave = mapComputedToUnified(CHART, DASHAS, 'Hash Stability Test', PLACE)
    const otherPlaceSave = mapComputedToUnified(CHART, DASHAS, 'Hash Stability Test', {
      ...PLACE,
      id: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
      name: 'Somewhere Else',
      label: 'Somewhere Else, Khed, Maharashtra',
    })
    const handTypedSave = mapComputedToUnified(CHART, DASHAS, 'Hash Stability Test')

    expect(pickerSave.chartHash).toBe(handTypedSave.chartHash)
    expect(otherPlaceSave.chartHash).toBe(handTypedSave.chartHash)
  })

  it('hashes exactly {source, date, time, timezone, latitude, longitude, sunriseMode}, in that order', () => {
    // Independently recomputed rather than a magic digest: this pins both the
    // key SET and the insertion order that JSON.stringify depends on. Every
    // chart saved before this feature carries a hash from this exact shape, so
    // adding, removing or reordering a key here silently orphans ~4,900 rows.
    const expected = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          source: 'compute',
          date: BIRTH_INPUT.date,
          time: BIRTH_INPUT.time,
          timezone: BIRTH_INPUT.timezone,
          latitude: BIRTH_INPUT.latitude,
          longitude: BIRTH_INPUT.longitude,
          sunriseMode: BIRTH_INPUT.sunriseMode,
        }),
      )
      .digest('hex')

    expect(mapComputedToUnified(CHART, DASHAS, 'Hash Stability Test', PLACE).chartHash).toBe(expected)
  })

  it('still changes the hash when a hashed coordinate changes', () => {
    const moved = mapComputedToUnified(
      { ...CHART, input: { ...BIRTH_INPUT, latitude: 18.6772447 } } as ComputedChart,
      DASHAS,
      'Hash Stability Test',
      PLACE,
    )

    expect(moved.chartHash).not.toBe(
      mapComputedToUnified(CHART, DASHAS, 'Hash Stability Test', PLACE).chartHash,
    )
  })
})

describe('mapComputedToUnified — persisted birthInput shape (Requirement 7.1)', () => {
  it('nests the full place object alongside the untouched engine input', () => {
    const birthInput = birthInputOf(PLACE)

    expect(birthInput).toEqual({ ...BIRTH_INPUT, place: PLACE })
    // The engine's own input fields survive verbatim — `place` is additive only.
    for (const [key, value] of Object.entries(BIRTH_INPUT)) {
      expect(birthInput[key]).toEqual(value)
    }
    expect(birthInput.place).toEqual(PLACE)
  })

  it('stores exactly the BirthPlace keys — no coordinates smuggled inside place', () => {
    const place = birthInputOf(PLACE).place as Record<string, unknown>

    expect(Object.keys(place).sort()).toEqual([...BIRTH_PLACE_KEYS].sort())
    expect(place).not.toHaveProperty('latitude')
    expect(place).not.toHaveProperty('longitude')
  })

  it('keeps a null county (2.5% of rows) as null rather than dropping the key', () => {
    const place = birthInputOf({ ...PLACE, county: null }).place as Record<string, unknown>

    expect(place).toHaveProperty('county')
    expect(place.county).toBeNull()
  })

  it('omits the place KEY entirely when no place was resolved', () => {
    const birthInput = birthInputOf()

    // Key absence, not `undefined` equality: `{ place: undefined }` satisfies
    // both `toEqual({...})` and `birthInput.place === undefined`.
    expect(birthInput).not.toHaveProperty('place')
    expect(Object.keys(birthInput)).not.toContain('place')
    expect('place' in birthInput).toBe(false)
    expect(Object.keys(birthInput).sort()).toEqual(Object.keys(BIRTH_INPUT).sort())
  })

  it('round-trips through JSON identically to the raw engine input when no place was resolved', () => {
    expect(JSON.parse(JSON.stringify(birthInputOf()))).toEqual(BIRTH_INPUT)
  })
})

describe('persisted birthInput → chartInputV1.meta.birth_place round-trip (Requirement 7.6)', () => {
  /** The consumer side, fed the mapper's own output as Postgres would return it. */
  function readBirthPlace(place?: BirthPlace): string | undefined {
    const stored = JSON.parse(JSON.stringify(birthInputOf(place)))
    return buildChartInputV1FromUnified({
      source: 'compute',
      chartInputV1: null,
      planets: [],
      nakshatras: [],
      divisionalCharts: [],
      karakas: [],
      ashtakavarga: null,
      upagrahas: [],
      specialLagnas: [],
      shadbala: null,
      birthInput: stored,
      lagna: 'Aries',
      lagnaLongitude: 12.34,
      moonLongitude: 123.45,
      ayanamsa: 24.1,
      birthDatetime: new Date('1990-01-01T04:30:00Z'),
      name: 'Hash Stability Test',
    })?.meta.birth_place
  }

  it('surfaces the stored place label, never the client name', () => {
    expect(readBirthPlace(PLACE)).toBe(PLACE.label)
    expect(readBirthPlace(PLACE)).not.toBe(BIRTH_INPUT.name)
  })

  it('leaves birth_place absent when the chart was saved without a place', () => {
    expect(readBirthPlace()).toBeUndefined()
  })
})
