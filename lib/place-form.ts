/**
 * lib/place-form.ts
 * -----------------
 * The birth-location contract shared by every form that collects birth data:
 * `app/page.tsx` (Chart Computation) and the `ComputeForm` in
 * `app/unified-charts/page.tsx`.
 *
 * Two forms previously modelled the same decision — "do we have a usable birth
 * location, and is there trustworthy place metadata to persist alongside it?" —
 * in two different ways. One validated in JS and stripped the picker selection
 * down to the persisted shape; the other did neither, so it selected a place and
 * then silently dropped it. This module is the single answer both call sites now
 * use, so they cannot drift again.
 *
 * Two invariants live here and nowhere else:
 *
 *   1. **The persisted place shape is exactly seven display fields.**
 *      `POST /api/unified-charts/from-compute` validates `place` with a
 *      `.strict()` Zod object, so an extra key is a 400 that rejects the whole
 *      save. A picker selection carries `latitude`/`longitude` too, so it must
 *      be stripped, never forwarded. Coordinates stay the top-level compute
 *      inputs; they are not part of `place`.
 *   2. **Location validation is explicit, in JS, and always yields a message.**
 *      The manual coordinate inputs live inside a closed-by-default `<details>`
 *      disclosure. Browser constraint validation on a control that is not
 *      focusable aborts submission *without firing the submit event*, so a
 *      `required` attribute down there made the Compute button do nothing at
 *      all. Constraints therefore belong to `validateBirthLocation`, whose
 *      failures the caller renders and announces.
 *
 * No React, no Prisma, no I/O: pure TypeScript, so it runs under the existing
 * `environment: 'node'` Vitest setup.
 *
 * See .kiro/specs/place-location-picker/design.md §Home Page Integration and
 * requirements 5.4, 7.1, 7.4, 8.1, 8.2.
 */

import { KIND_RANK, type PlaceKind } from '@/lib/places-normalize'

/**
 * The place metadata persisted inside `UnifiedChart.birthInput.place`, and the
 * exact key set the strict `place` schema on
 * `POST /api/unified-charts/from-compute` accepts.
 *
 * Structurally identical to `BirthPlace` in `lib/chart-mapper.ts`, with `kind`
 * narrowed to the four real settlement classes. Redeclared rather than imported
 * because `chart-mapper` pulls in Prisma, which this module must stay free of.
 */
export interface PersistedBirthPlace {
  id: string
  name: string
  kind: PlaceKind
  state: string
  district: string
  county: string | null
  label: string
}

/**
 * A picker selection: the persisted fields plus the coordinates the compute
 * engine consumes. Kept structural rather than importing `SelectedPlace` from
 * the picker (which re-exports the API route's type, and with it Prisma).
 */
export interface BirthPlaceSelection extends PersistedBirthPlace {
  latitude: number
  longitude: number
}

/**
 * Derived from `KIND_RANK` rather than written out again, so a new settlement
 * class cannot be accepted by the search layer but rejected here.
 */
export const PLACE_KINDS: readonly PlaceKind[] = Object.keys(KIND_RANK) as PlaceKind[]

/**
 * `Place.id` is a Prisma `uuid()`. Checked because a `place` whose id is not a
 * UUID is guaranteed to fail the route's `z.string().uuid()` and take the whole
 * save down with it — better to omit the metadata than lose the chart.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const LATITUDE_MIN = -90
export const LATITUDE_MAX = 90
export const LONGITUDE_MIN = -180
export const LONGITUDE_MAX = 180

/** Why a birth location was rejected. Drives which field to reveal. */
export type BirthLocationErrorReason =
  | 'location_required'
  | 'place_missing_coordinates'
  | 'coordinate_out_of_range'

/**
 * The practitioner-facing message for each failure. Held here so both forms say
 * the same thing, and so the tests can assert against a name rather than a
 * duplicated string literal.
 */
export const BIRTH_LOCATION_MESSAGES: Record<BirthLocationErrorReason, string> = {
  location_required: 'Select a place or enter both latitude and longitude.',
  place_missing_coordinates:
    'The selected place is missing coordinates. Please select it again or enter coordinates manually.',
  coordinate_out_of_range:
    'Latitude must be between -90 and 90, and longitude must be between -180 and 180.',
}

export type BirthLocationValidation =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: BirthLocationErrorReason; message: string }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * True when `value` carries every field the strict `place` schema requires, and
 * nothing about it would be rejected. Used both to validate a live picker
 * selection before persisting it and to decide whether a `birthInput.place`
 * loaded back out of the database is trustworthy enough to restore.
 */
export function isPersistedBirthPlace(value: unknown): value is PersistedBirthPlace {
  if (!isRecord(value)) return false

  const { id, name, kind, state, district, county, label } = value
  return (
    isNonEmptyString(id) &&
    UUID_PATTERN.test(id) &&
    isNonEmptyString(name) &&
    typeof kind === 'string' &&
    PLACE_KINDS.includes(kind as PlaceKind) &&
    isNonEmptyString(state) &&
    isNonEmptyString(district) &&
    (county === null || isNonEmptyString(county)) &&
    isNonEmptyString(label)
  )
}

export function isValidBirthCoordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
}

/**
 * Reduces a picker selection to the seven persisted fields, or `undefined` when
 * there is nothing trustworthy to persist.
 *
 * The stripping is the point: a `SelectedPlace` also carries `latitude` and
 * `longitude`, and the route's `place` schema is `.strict()`, so forwarding the
 * selection verbatim 400s the entire save rather than merely losing the label.
 *
 * `options.expectedPlaceId`, when supplied, gates the selection against the
 * form's own record of which place is current — a form restored from storage may
 * hold an id and a label without the rest of the metadata, which is enough to
 * compute with but not enough to persist. Omit the option entirely (as the
 * unified-charts form does, where the live selection is the only record) to skip
 * the gate; passing `undefined` explicitly is *not* the same as omitting it.
 */
export function persistedPlaceFromSelection(
  selection: unknown,
  options: { expectedPlaceId?: string | null } = {},
): PersistedBirthPlace | undefined {
  if (!isPersistedBirthPlace(selection)) return undefined

  if ('expectedPlaceId' in options && options.expectedPlaceId !== selection.id) {
    return undefined
  }

  const { id, name, kind, state, district, county, label } = selection
  return { id, name, kind, state, district, county, label }
}

/**
 * The one place either form decides whether it has a usable birth location.
 *
 * Deliberately reads the coordinate *strings* rather than the picker selection:
 * a selection only ever reaches the engine through the coordinates it wrote into
 * the form, so validating those covers the hand-typed path and the picked path
 * with the same check. `hasSelectedPlace` only refines the message — a place
 * that somehow produced no coordinates is a different problem from an empty
 * form, and telling them apart is what makes the message actionable.
 */
export function validateBirthLocation(draft: {
  latitude: string
  longitude: string
  hasSelectedPlace: boolean
}): BirthLocationValidation {
  if (draft.latitude.trim() === '' || draft.longitude.trim() === '') {
    const reason: BirthLocationErrorReason = draft.hasSelectedPlace
      ? 'place_missing_coordinates'
      : 'location_required'
    return { ok: false, reason, message: BIRTH_LOCATION_MESSAGES[reason] }
  }

  const latitude = Number(draft.latitude)
  const longitude = Number(draft.longitude)
  if (
    !isValidBirthCoordinate(latitude, LATITUDE_MIN, LATITUDE_MAX) ||
    !isValidBirthCoordinate(longitude, LONGITUDE_MIN, LONGITUDE_MAX)
  ) {
    return {
      ok: false,
      reason: 'coordinate_out_of_range',
      message: BIRTH_LOCATION_MESSAGES.coordinate_out_of_range,
    }
  }

  return { ok: true, latitude, longitude }
}
