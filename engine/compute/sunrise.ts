import { computeDrikSunriseInstant } from './astronomy/drikLahiri'

export interface ExternalSunriseInstant {
  readonly sunriseJulianDay: number
  /** True only when current Drik precise mode used its established 06:00 fallback. */
  readonly sunriseFallback: boolean
}

export interface SunriseReferences {
  /** The input-selected anchor for Bhava/Hora/Varnada/Kunda/Pranapada. */
  readonly selected: ExternalSunriseInstant
  /** The precise anchor used by Ghati Lagna when the selected mode is JHora. */
  readonly precise: ExternalSunriseInstant
}

/**
 * Resolves only the external astronomical/civil sunrise INSTANTS.
 *
 * The active astronomy provider must independently evaluate the Sun at every
 * returned instant. This seam prevents a future SSS chart from importing a
 * Swiss/Lahiri sidereal Sun while retaining the documented external sunrise
 * boundary. Current legacy Drik fallback behavior remains inside
 * computeDrikSunriseInstant; strict SSS 72-hour/polar handling is deferred to
 * Task 4 together with its provider and typed SunriseUnavailableError.
 */
export function resolveExternalSunriseReferences(input: {
  julianDay: number
  latitude: number
  longitude: number
  timezone: number
  sunriseMode: 'precise' | 'jhora'
}): SunriseReferences {
  const selected = computeDrikSunriseInstant(
    input.julianDay,
    input.latitude,
    input.longitude,
    input.timezone,
    input.sunriseMode
  )
  const precise = input.sunriseMode === 'precise'
    ? selected
    : computeDrikSunriseInstant(
      input.julianDay,
      input.latitude,
      input.longitude,
      input.timezone,
      'precise'
    )

  return { selected, precise }
}
