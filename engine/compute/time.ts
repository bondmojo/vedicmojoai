import type { BirthInput } from './types'

/** Documented API input: zero-padded hours/minutes and up to six fractional digits. */
export const BIRTH_TIME_PATTERN = /^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/

/**
 * Pre-schema persisted records may contain an unpadded local hour. This is
 * deliberately private to engine/migration compatibility; public route and MCP
 * schemas continue to use BIRTH_TIME_PATTERN.
 */
const LEGACY_BIRTH_TIME_PATTERN = /^\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/

export interface ParsedBirthTime {
  readonly hours: number
  readonly minutes: number
  readonly seconds: number
  readonly secondsSinceMidnight: number
}

/**
 * A numeric UTC carrier that retains the supplied fractional second independently
 * of JavaScript Date's millisecond resolution. `julianDayUt` is a convenient
 * IEEE-754 projection for astronomy APIs; consumers requiring the full six-digit
 * input precision must retain `utcDayNumber` plus `secondsSinceUtcMidnight`.
 */
export interface PreciseUtcInstant {
  /** Gregorian Julian-day number at UTC midnight. */
  readonly utcDayNumber: number
  /** [0, 86_400), retaining the parsed fractional second as a numeric value. */
  readonly secondsSinceUtcMidnight: number
  /** UTC Julian day (days begin at noon); use the split fields for finer transport. */
  readonly julianDayUt: number
}

function assertCompatibleBirthTime(time: string): void {
  if (!LEGACY_BIRTH_TIME_PATTERN.test(time)) {
    throw new RangeError('Time must be H:MM, HH:MM, H:MM:SS, HH:MM:SS, or include up to 6 fractional second digits')
  }
}

/**
 * Retains supplied fractional seconds while canonicalizing legacy persisted times.
 * API callers are still rejected before this function unless they match the
 * documented zero-padded BIRTH_TIME_PATTERN.
 */
export function normalizeBirthTime(time: string): string {
  assertCompatibleBirthTime(time)
  const [hourText, minuteText, secondText] = time.split(':')
  const parsed = parseBirthTime(time)
  const normalizedHour = String(parsed.hours).padStart(2, '0')
  const normalizedMinute = String(parsed.minutes).padStart(2, '0')
  if (secondText === undefined) return `${normalizedHour}:${normalizedMinute}:00`

  const [, fraction = ''] = secondText.split('.')
  const normalizedFraction = fraction.replace(/0+$/, '')
  return `${normalizedHour}:${normalizedMinute}:${String(Math.floor(parsed.seconds)).padStart(2, '0')}${
    normalizedFraction ? `.${normalizedFraction}` : ''
  }`
}

/** Parses a local civil time used by API inputs and pre-schema persisted records. */
export function parseBirthTime(time: string): ParsedBirthTime {
  assertCompatibleBirthTime(time)

  const [hourText, minuteText, secondText = '0'] = time.split(':')
  const hours = Number(hourText)
  const minutes = Number(minuteText)
  const seconds = Number(secondText)
  if (hours > 23 || minutes > 59 || seconds >= 60) {
    throw new RangeError('Time fields are outside their valid ranges')
  }

  return {
    hours,
    minutes,
    seconds,
    secondsSinceMidnight: hours * 3600 + minutes * 60 + seconds,
  }
}

/** Gregorian Julian-day number at 00:00 UTC, calculated without native ephemeris APIs. */
function gregorianUtcMidnightJulianDayNumber(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12)
  const y = year + 4_800 - a
  const m = month + 12 * a - 3
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32_045
  )
}

/**
 * Converts local civil input to a split UTC/JD carrier without Date.UTC's
 * integer-millisecond boundary. The API's six fractional digits are preserved
 * in `secondsSinceUtcMidnight`; the single-number JD necessarily has normal
 * floating-point precision limits at a contemporary epoch.
 */
export function birthInputToPreciseUtcInstant(
  input: Pick<BirthInput, 'date' | 'time' | 'timezone'>
): PreciseUtcInstant {
  const [yearText, monthText, dayText] = input.date.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const { secondsSinceMidnight } = parseBirthTime(input.time)

  const unnormalizedUtcSeconds = secondsSinceMidnight - input.timezone * 3600
  const dayOffset = Math.floor(unnormalizedUtcSeconds / 86_400)
  const utcSecondsSinceMidnight = unnormalizedUtcSeconds - dayOffset * 86_400
  const utcDayNumber = gregorianUtcMidnightJulianDayNumber(year, month, day) + dayOffset

  return {
    utcDayNumber,
    secondsSinceUtcMidnight: utcSecondsSinceMidnight,
    julianDayUt: utcDayNumber - 0.5 + utcSecondsSinceMidnight / 86_400,
  }
}

/**
 * Builds a legacy JavaScript Date from BirthInput fields.
 *
 * Date is intentionally constrained to millisecond precision. Use
 * birthInputToPreciseUtcInstant for astronomical or identity transport that
 * must retain all accepted fractional-second digits.
 */
export function birthInputToUtcDate(input: Pick<BirthInput, 'date' | 'time' | 'timezone'>): Date {
  const instant = birthInputToPreciseUtcInstant(input)
  const unixEpochJulianDayNumber = 2_440_588
  const unixMillis = Math.round(
    (instant.utcDayNumber - unixEpochJulianDayNumber) * 86_400_000 +
      instant.secondsSinceUtcMidnight * 1_000
  )
  return new Date(unixMillis)
}
