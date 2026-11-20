/**
 * lib/place-form.test.ts
 * ----------------------
 * Covers the two invariants `lib/place-form.ts` exists to hold, both of which
 * had a real failure behind them:
 *
 *   1. `persistedPlaceFromSelection` must STRIP a picker selection to exactly the
 *      seven display fields. `POST /api/unified-charts/from-compute` validates
 *      `place` with a `.strict()` Zod object, so leaking the selection's
 *      `latitude`/`longitude` through is not a cosmetic slip — it 400s the whole
 *      save and the practitioner loses the chart, not just the label.
 *   2. `validateBirthLocation` must always return an actionable message for an
 *      unusable location. It is the only thing standing between a closed
 *      "Enter coordinates manually" disclosure and a Compute button that does
 *      nothing.
 *
 * Pure module, so `environment: 'node'` with no DOM and no mocks.
 *
 * _Requirements: 5.4, 7.1, 7.4, 8.1_
 */

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  BIRTH_LOCATION_MESSAGES,
  isPersistedBirthPlace,
  isValidBirthCoordinate,
  LATITUDE_MAX,
  LATITUDE_MIN,
  LONGITUDE_MAX,
  LONGITUDE_MIN,
  PLACE_KINDS,
  persistedPlaceFromSelection,
  validateBirthLocation,
  type BirthPlaceSelection,
} from './place-form'

// ─── Fixtures ────────────────────────────────────────────────────────────

const PLACE_ID = '6f4f34a5-5f74-4a61-a6d8-8eb6a4dc6d35'

/** Exactly the shape `PlacePicker` hands back: persisted fields + coordinates. */
const SELECTION: BirthPlaceSelection = {
  id: PLACE_ID,
  name: 'Alandi',
  kind: 'village',
  state: 'Maharashtra',
  district: 'Pune',
  county: 'Khed',
  latitude: 18.6772446,
  longitude: 73.8981129,
  label: 'Alandi, Khed, Maharashtra',
}

/** The seven keys the strict route schema accepts — no more, no less. */
const PERSISTED_KEYS = ['id', 'name', 'kind', 'state', 'district', 'county', 'label'] as const

// ─── PLACE_KINDS ─────────────────────────────────────────────────────────

describe('PLACE_KINDS', () => {
  it('is derived from the search layer\u2019s KIND_RANK, so the two cannot disagree', () => {
    expect([...PLACE_KINDS].sort()).toEqual(['city', 'hamlet', 'town', 'village'])
  })
})

// ─── isPersistedBirthPlace ───────────────────────────────────────────────

describe('isPersistedBirthPlace', () => {
  it('accepts a complete place', () => {
    const { latitude: _lat, longitude: _lon, ...place } = SELECTION
    expect(isPersistedBirthPlace(place)).toBe(true)
  })

  it('accepts a null county — the tehsil is absent on ~2.5% of rows', () => {
    expect(isPersistedBirthPlace({ ...SELECTION, county: null })).toBe(true)
  })

  it.each([
    ['a non-record', 'Alandi'],
    ['null', null],
    ['an array', [SELECTION]],
    ['a non-UUID id', { ...SELECTION, id: 'osm-node-123' }],
    ['a blank name', { ...SELECTION, name: '   ' }],
    ['an unknown kind', { ...SELECTION, kind: 'metropolis' }],
    ['a missing state', { ...SELECTION, state: undefined }],
    ['a blank district', { ...SELECTION, district: '' }],
    ['a blank county (rather than null)', { ...SELECTION, county: '  ' }],
    ['a missing label', { ...SELECTION, label: undefined }],
    ['only an id and label, as a restored form holds', { id: PLACE_ID, label: SELECTION.label }],
  ])('rejects %s', (_description, value) => {
    expect(isPersistedBirthPlace(value)).toBe(false)
  })
})

// ─── persistedPlaceFromSelection ─────────────────────────────────────────

describe('persistedPlaceFromSelection', () => {
  it('strips the selection to exactly the seven persisted fields', () => {
    const place = persistedPlaceFromSelection(SELECTION)

    expect(place).toEqual({
      id: PLACE_ID,
      name: 'Alandi',
      kind: 'village',
      state: 'Maharashtra',
      district: 'Pune',
      county: 'Khed',
      label: 'Alandi, Khed, Maharashtra',
    })
  })

  it('never forwards coordinates — the route\u2019s place schema is .strict() and would 400', () => {
    const place = persistedPlaceFromSelection(SELECTION)

    expect(Object.keys(place!).sort()).toEqual([...PERSISTED_KEYS].sort())
    expect(place).not.toHaveProperty('latitude')
    expect(place).not.toHaveProperty('longitude')
  })

  it('returns undefined for no selection', () => {
    expect(persistedPlaceFromSelection(null)).toBeUndefined()
    expect(persistedPlaceFromSelection(undefined)).toBeUndefined()
  })

  it('returns undefined for a selection that would fail the strict schema', () => {
    expect(persistedPlaceFromSelection({ ...SELECTION, id: 'osm-node-123' })).toBeUndefined()
  })

  it('accepts a selection whose id matches the form\u2019s expectedPlaceId', () => {
    expect(persistedPlaceFromSelection(SELECTION, { expectedPlaceId: PLACE_ID })).toBeDefined()
  })

  it.each([
    ['a stale selection', 'ac0b8f79-9e2f-4d67-9a3f-8b1e2c5d4a63'],
    ['coordinates edited by hand, which clear placeId', null],
  ])('returns undefined when expectedPlaceId reflects %s', (_description, expectedPlaceId) => {
    expect(persistedPlaceFromSelection(SELECTION, { expectedPlaceId })).toBeUndefined()
  })

  it('skips the id gate when expectedPlaceId is omitted, as the unified-charts form does', () => {
    expect(persistedPlaceFromSelection(SELECTION, {})).toBeDefined()
  })
})

// ─── isValidBirthCoordinate ──────────────────────────────────────────────

describe('isValidBirthCoordinate', () => {
  it.each([
    ['a mid-range value', 18.6772446, true],
    ['the minimum', LATITUDE_MIN, true],
    ['the maximum', LATITUDE_MAX, true],
    ['just past the maximum', 90.0000001, false],
    ['NaN', Number.NaN, false],
    ['Infinity', Number.POSITIVE_INFINITY, false],
    ['a numeric string', '18.6772446', false],
    ['null', null, false],
  ])('treats %s correctly', (_description, value, expected) => {
    expect(isValidBirthCoordinate(value, LATITUDE_MIN, LATITUDE_MAX)).toBe(expected)
  })
})

// ─── validateBirthLocation ───────────────────────────────────────────────

describe('validateBirthLocation', () => {
  it('accepts a complete pair and returns the parsed numbers', () => {
    const result = validateBirthLocation({
      latitude: '18.6772446',
      longitude: '73.8981129',
      hasSelectedPlace: true,
    })

    expect(result).toEqual({ ok: true, latitude: 18.6772446, longitude: 73.8981129 })
  })

  it.each([
    ['both coordinates blank', '', ''],
    ['only latitude', '18.6772446', ''],
    ['only longitude', '', '73.8981129'],
    ['whitespace', '   ', '   '],
  ])('asks for a place or both coordinates when %s and no place is selected', (_d, latitude, longitude) => {
    const result = validateBirthLocation({ latitude, longitude, hasSelectedPlace: false })

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({
      reason: 'location_required',
      message: BIRTH_LOCATION_MESSAGES.location_required,
    })
  })

  it('distinguishes a selected place that produced no coordinates', () => {
    const result = validateBirthLocation({ latitude: '', longitude: '', hasSelectedPlace: true })

    expect(result).toMatchObject({
      ok: false,
      reason: 'place_missing_coordinates',
      message: BIRTH_LOCATION_MESSAGES.place_missing_coordinates,
    })
  })

  it.each([
    ['latitude past +90', '90.0000001', '73.8981129'],
    ['latitude past -90', '-90.0000001', '73.8981129'],
    ['longitude past +180', '18.6772446', '180.0000001'],
    ['longitude past -180', '18.6772446', '-180.0000001'],
    ['unparseable text', 'north', 'east'],
  ])('rejects %s with the range message', (_description, latitude, longitude) => {
    const result = validateBirthLocation({ latitude, longitude, hasSelectedPlace: false })

    expect(result).toMatchObject({
      ok: false,
      reason: 'coordinate_out_of_range',
      message: BIRTH_LOCATION_MESSAGES.coordinate_out_of_range,
    })
  })

  it('accepts the exact range boundaries', () => {
    expect(
      validateBirthLocation({ latitude: '-90', longitude: '180', hasSelectedPlace: false }).ok,
    ).toBe(true)
  })

  // Property: a rejection is never silent. This is the whole point of moving the
  // constraint out of the `required` attribute — a failure the practitioner
  // cannot see is exactly the regression being fixed.
  it('always pairs a failure with a non-empty, actionable message', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constantFrom('', '   ', 'north', '1e999', '-'),
          fc.double({ noNaN: true }).map(String),
          fc.string(),
        ),
        fc.oneof(
          fc.constantFrom('', '   ', 'east', '1e999', '-'),
          fc.double({ noNaN: true }).map(String),
          fc.string(),
        ),
        fc.boolean(),
        (latitude, longitude, hasSelectedPlace) => {
          const result = validateBirthLocation({ latitude, longitude, hasSelectedPlace })
          if (result.ok) return true
          return (
            result.message.trim().length > 0 &&
            result.message === BIRTH_LOCATION_MESSAGES[result.reason]
          )
        },
      ),
    )
  })

  // Property: whenever it says ok, the numbers it hands back are safe to send to
  // `POST /api/compute`, whose Zod schema applies the same bounds.
  it('only reports ok with finite, in-range coordinates', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -200, max: 200, noNaN: true }),
        fc.double({ min: -400, max: 400, noNaN: true }),
        (latitude, longitude) => {
          const result = validateBirthLocation({
            latitude: String(latitude),
            longitude: String(longitude),
            hasSelectedPlace: false,
          })
          if (!result.ok) return true
          return (
            isValidBirthCoordinate(result.latitude, LATITUDE_MIN, LATITUDE_MAX) &&
            isValidBirthCoordinate(result.longitude, LONGITUDE_MIN, LONGITUDE_MAX)
          )
        },
      ),
    )
  })
})
