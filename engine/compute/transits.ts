/**
 * engine/compute/transits.ts — Current Gochar (transit) + Sade Sati timeline.
 */

import swisseph from 'swisseph-v2'
import path from 'path'

// ─── Types ──────────────────────────────────────────────────────────

export interface TransitPlanet {
  planet: string
  longitude: number
  sign: string
  signNumber: number
  degreeInSign: number
  retrograde: boolean
  houseFromMoon: number
  houseFromLagna: number
}

export interface SadeSatiPeriod {
  phase: 'rising' | 'peak' | 'setting'
  phaseSign: string
  startApprox: string   // approximate year
  endApprox: string
  isCurrent: boolean
}

export interface SadeSatiInfo {
  active: boolean
  phase: 'rising' | 'peak' | 'setting' | null
  saturnSignNumber: number
  natalMoonSignNumber: number
  description: string
  /** All Sade Sati periods across the native's life (~30yr cycle) */
  allPeriods: SadeSatiPeriod[]
}

/** One contiguous passage of Saturn through the ±45° window (R6.1, R6.2). */
export interface DegreeSadeSatiPeriod {
  /** 1-based, contiguous, ascending by start across the whole scan horizon (R6.6). */
  sequence: number
  /** ISO-8601 UTC, bisection-refined (R6.8). */
  start: string
  end: string
  /** "Mon YYYY" display form, matching the sign-based reading's convention. */
  startApprox: string
  endApprox: string
  /** end − start in days (fractional). The machine-readable duration (R6.2). */
  durationDays: number
  /** True when [start, end) contains TransitAnalysis.asOf (R6.2, R6.10, R6.11). */
  isCurrent: boolean
  /** Integer 0–100, rounded half away from zero. Present only when isCurrent (R6.13). */
  completionPct?: number
  /** Days from asOf to `start`, fractional. Present only when start > asOf (R6.14). */
  startsInDays?: number
  /** R6.15, e.g. "Saturn ±45° from natal Moon (347.76°) - 12th, 1st, 2nd houses". */
  label: string
}

export interface DegreeSadeSatiInfo {
  /** Natal Moon sidereal longitude (0–360) the window is centred on. */
  natalMoonLongitude: number
  /** Half-width of the window in degrees. Always 45 for this reading (R6.1). */
  orbDeg: number
  /** True when asOf falls inside the window (R6.3). */
  active: boolean
  /** Shorter-arc separation |Saturn − natal Moon| at asOf, 0–180 (R6.3). */
  separationDeg: number
  /** The horizon actually scanned, so a divergence can be attributed (R6.9). */
  scanFromYear: number
  scanToYear: number
  /** Ascending by start; non-overlapping (R6.12). */
  allPeriods: DegreeSadeSatiPeriod[]
}

export interface MoonTransitPeriod {
  signNumber: number
  sign: string
  /** Duration: Moon transits ~2.25 days per sign */
  entryDate: string
  exitDate: string
  isCurrent: boolean
  /** House from natal Moon */
  houseFromMoon: number
}

export interface AscendantTransitPeriod {
  signNumber: number
  sign: string
  entryDate: string
  exitDate: string
  isCurrent: boolean
  /** House from natal lagna */
  houseFromLagna: number
}

export interface TransitAnalysis {
  asOf: string
  transits: TransitPlanet[]
  sadeSati: SadeSatiInfo
  /**
   * Degree-based Sade Sati — sibling of `sadeSati`, never nested inside it.
   * Optional: absent on charts computed before this addition, and absent when the
   * caller supplies no natal Moon longitude.
   */
  sadeSatiByDegree?: DegreeSadeSatiInfo
  ashtamaShani: boolean
  kantakaShani: boolean
  currentMoonSign: string
  natalMoonSign: string
  moonTransitSameAsNatal: boolean
  /** Moon transits for the next 27 signs (~60 days) */
  moonTransits: MoonTransitPeriod[]
  /** Ascendant transits for the next 12 signs (~1 day) */
  ascendantTransits: AscendantTransitPeriod[]
}

// ─── Constants ──────────────────────────────────────────────────────

const SIGNS = [
  'Aries','Taurus','Gemini','Cancer','Leo','Virgo',
  'Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces',
]

const PLANET_IDS: { name: string; id: number }[] = [
  { name: 'Sun',     id: 0  },
  { name: 'Moon',    id: 1  },
  { name: 'Mars',    id: 4  },
  { name: 'Mercury', id: 2  },
  { name: 'Jupiter', id: 5  },
  { name: 'Venus',   id: 3  },
  { name: 'Saturn',  id: 6  },
  { name: 'Rahu',    id: 11 },
]

// ─── Ephemeris ───────────────────────────────────────────────────────

let ephePathSet = false
function ensureEph(): void {
  if (ephePathSet) return
  try {
    const pkg = require.resolve('swisseph-v2/package.json')
    swisseph.swe_set_ephe_path(path.join(path.dirname(pkg), 'ephe'))
  } catch { /* fallback */ }
  ephePathSet = true
}

function normLong(lon: number): number { return ((lon % 360) + 360) % 360 }

function toJD(date: Date): number {
  return swisseph.swe_julday(
    date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600,
    swisseph.SE_GREG_CAL
  )
}

/** Convert a Julian Day (UT) back into a JS Date. */
function jdToDate(jd: number): Date {
  const r = swisseph.swe_revjul(jd, swisseph.SE_GREG_CAL) as any
  const hourFloat = r.hour ?? 0
  const hour = Math.floor(hourFloat)
  const minFloat = (hourFloat - hour) * 60
  const min = Math.floor(minFloat)
  const sec = Math.round((minFloat - min) * 60)
  return new Date(Date.UTC(r.year, r.month - 1, r.day, hour, min, sec))
}

function getSiderealLongitude(jd: number, bodyId: number): number {
  ensureEph()
  swisseph.swe_set_sid_mode(swisseph.SE_SIDM_LAHIRI, 0, 0)
  const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SIDEREAL | swisseph.SEFLG_SPEED
  const r = swisseph.swe_calc_ut(jd, bodyId, flags) as any
  return normLong(r.longitude ?? 0)
}

function getSignNumber(lon: number): number { return Math.floor(lon / 30) + 1 }

/** Sidereal sign (1–12) of a Swiss Ephemeris body at a given JD. */
function bodySignAt(jd: number, bodyId: number): number {
  return getSignNumber(getSiderealLongitude(jd, bodyId))
}

/** Sidereal ascendant sign (1–12) at a given JD for a location. */
function ascSignAt(jd: number, latitude: number, longitude: number): number {
  ensureEph()
  swisseph.swe_set_sid_mode(swisseph.SE_SIDM_LAHIRI, 0, 0)
  const h = swisseph.swe_houses_ex(jd, swisseph.SEFLG_SIDEREAL, latitude, longitude, 'W') as any
  return getSignNumber(normLong(h.ascendant ?? 0))
}

/**
 * Finds the JD at which `stateAt` first differs from its value at `startJd`,
 * searching forward. The boundary is refined by bisection.
 * Returns the first JD that lies in the new state.
 */
function nextStateChange<S>(
  startJd: number,
  coarseStepDays: number,
  stateAt: (jd: number) => S
): number {
  const startSign = stateAt(startJd)
  let lo = startJd
  let hi = startJd + coarseStepDays
  let guard = 0
  while (stateAt(hi) === startSign && guard < 5000) {
    lo = hi
    hi += coarseStepDays
    guard++
  }
  for (let i = 0; i < 42; i++) {
    const mid = (lo + hi) / 2
    if (stateAt(mid) === startSign) lo = mid
    else hi = mid
  }
  return hi
}

/**
 * Finds the JD at which the current sign began, searching backward from `startJd`.
 * Returns the first JD that lies in the sign occupied at `startJd`.
 */
function prevSignChange(
  startJd: number,
  coarseStepDays: number,
  signAt: (jd: number) => number
): number {
  const startSign = signAt(startJd)
  let hi = startJd
  let lo = startJd - coarseStepDays
  let guard = 0
  while (signAt(lo) === startSign && guard < 5000) {
    hi = lo
    lo -= coarseStepDays
    guard++
  }
  for (let i = 0; i < 42; i++) {
    const mid = (lo + hi) / 2
    if (signAt(mid) === startSign) hi = mid
    else lo = mid
  }
  return hi
}

function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/**
 * Merges adjacent segments that share the same `key` when the gap between
 * them is smaller than `gapDays`, so a retrograde dip out of and back into a
 * state collapses into one contiguous segment.
 */
function mergeSegments<K>(
  raw: { key: K; start: number; end: number }[],
  gapDays: number
): { key: K; start: number; end: number }[] {
  const merged: { key: K; start: number; end: number }[] = []
  for (const seg of raw) {
    const last = merged[merged.length - 1]
    if (last && last.key === seg.key && seg.start - last.end < gapDays) {
      last.end = seg.end
    } else {
      merged.push({ ...seg })
    }
  }
  return merged
}

// ─── Sade Sati Timeline ──────────────────────────────────────────────

/**
 * Computes all Sade Sati periods across the native's life using the real
 * Saturn ephemeris. Saturn's actual sign-ingress dates (including retrograde
 * re-entries) are found by scanning and refining boundaries, then the segments
 * in the three Sade Sati signs (12th, 1st, 2nd from natal Moon) are extracted.
 */
function computeSadeSatiPeriods(
  natalMoonSignNumber: number,
  birthYear: number,
  asOfDate: Date,
): SadeSatiPeriod[] {
  ensureEph()

  const moonMinus1 = ((natalMoonSignNumber - 2 + 12) % 12) + 1
  const moonPlus1  = (natalMoonSignNumber % 12) + 1
  const phaseOf = (sign: number): 'rising' | 'peak' | 'setting' | null => {
    if (sign === moonMinus1) return 'rising'
    if (sign === natalMoonSignNumber) return 'peak'
    if (sign === moonPlus1) return 'setting'
    return null
  }

  // Scan window: start 33 years before birth to cover a full Saturn cycle
  // (~29.5 years) with margin, since a Sade Sati visible in early childhood
  // can have begun up to ~32 years before the birth year.
  const startJd = toJD(new Date(Date.UTC(birthYear - 33, 0, 1)))
  const endJd   = toJD(new Date(Date.UTC(new Date().getUTCFullYear() + 35, 0, 1)))

  // Build contiguous Saturn-in-sign segments across the window.
  const satSign = (jd: number) => bodySignAt(jd, 6)
  const segments: { key: number; start: number; end: number }[] = []
  const STEP = 10 // days

  let curSign = satSign(startJd)
  let segStart = startJd
  let jd = startJd
  while (jd < endJd) {
    const next = Math.min(jd + STEP, endJd)
    const s = satSign(next)
    if (s !== curSign) {
      const boundary = nextStateChange(jd, STEP, satSign)
      segments.push({ key: curSign, start: segStart, end: boundary })
      curSign = satSign(boundary)
      segStart = boundary
      jd = boundary
    } else {
      jd = next
    }
  }
  segments.push({ key: curSign, start: segStart, end: endJd })

  // Extract relevant segments and merge retrograde-fragmented ones
  // (same sign, gap < ~8 months). This 240 d is the SIGN-based scan's own threshold and is
  // intentionally not shared with the degree-based scan, which needs a smaller one — see
  // `DEGREE_SADE_SATI_MERGE_GAP_DAYS`.
  const raw = segments
    .filter((seg) => phaseOf(seg.key) !== null)
    .sort((a, b) => a.start - b.start)

  const merged = mergeSegments(raw, 240)

  const nowMs = asOfDate.getTime()
  return merged.map((seg) => {
    const startD = jdToDate(seg.start)
    const endD = jdToDate(seg.end)
    return {
      phase: phaseOf(seg.key)!,
      phaseSign: SIGNS[seg.key - 1],
      startApprox: fmtMonthYear(startD),
      endApprox: fmtMonthYear(endD),
      isCurrent: nowMs >= startD.getTime() && nowMs < endD.getTime(),
    }
  })
}

// ─── Degree-Based Sade Sati ──────────────────────────────────────────

/**
 * Merge threshold for the DEGREE-based scan, in days (R6.5).
 *
 * Deliberately SMALLER than the 240 d the sign-based `computeSadeSatiPeriods` uses, and
 * NOT a shared constant with it. The two scans bound different things:
 *
 *  - A *sign* boundary is a hard edge. A retrograde dip back across it is short, because
 *    Saturn has to be within roughly a degree of the boundary for the loop to carry it
 *    over at all, so 240 d comfortably brackets every sign fragment.
 *  - The *angular* window's edge is crossed at whatever speed Saturn happens to have, and
 *    a retrograde loop straddling it can hold Saturn outside the orb for most of the loop
 *    plus the direct motion either side of it. Genuine excursions out of the ±45° window
 *    therefore run materially longer than sign fragments, and 240 d over-merges: it
 *    swallows real exits and reports a passage that runs hundreds of days past its end.
 *
 * 138 days is calibrated against the three reference periods PVR Narasimha Rao's
 * implementation reports for the Reference_Chart (natal Moon 347.76°, born 1984) —
 * 1993-03-31 → 2000-06-30, 2023-02-10 → 2030-05-09 and 2052-03-20 → 2059-06-19. Those
 * three passages between them constrain the threshold to the half-open interval
 * (123.45 d, 152.46 d]: the 1993 passage's 123.45 d gap and the 2052 passage's 88.76 d gap
 * must both be bridged, while the 1993 passage's 152.46 d gap and the 2052 passage's
 * 190.07 d gap must not be. 138 sits essentially at the midpoint of that interval, ~14.5 d
 * of margin either side, and coincides with Saturn's mean retrograde span measured over the
 * same horizon (138.0 d over 105 loops, range 133.7–141.4 d) — the natural physical scale
 * of a retrograde excursion out of the window.
 *
 * The classical round candidate, 182 d (6 months), does NOT fit: it would bridge the 1993
 * passage's 152.46 d gap and report that passage ending 2001-03-19 instead of 2000-06-30,
 * 263 d late. The gap distribution across natal Moon longitudes is a smooth continuum from
 * ~4 d to ~232 d with no natural cut, so this threshold is a calibrated judgement rather
 * than a derived quantity — see the open question in `docs/computation_transits_sadesati.md`.
 */
const DEGREE_SADE_SATI_MERGE_GAP_DAYS = 138

/** Shorter-arc angular separation between two longitudes, 0…180. */
function shorterArc(a: number, b: number): number {
  const d = Math.abs(((a - b + 360) % 360))
  return Math.min(d, 360 - d)
}

/** Rounds an integer percentage half away from zero (values here are always 0–100). */
function roundHalfAwayFromZeroInt(v: number): number {
  return v < 0 ? -Math.round(-v) : Math.round(v)
}

/**
 * Scans `[startJd, endJd]` for contiguous segments where Saturn's sidereal longitude
 * lies within 45° (shorter arc) of `natalMoonLongitude`, using the same 10-day coarse
 * walk and `nextStateChange` bisection the sign-based scan uses, then merges segments
 * separated by less than `DEGREE_SADE_SATI_MERGE_GAP_DAYS` (a retrograde dip out of and
 * back into the window). That threshold is this scan's own — see its comment for why it
 * is smaller than the sign-based scan's 240 d.
 */
function scanDegreeSadeSatiSegments(
  natalMoonLongitude: number,
  startJd: number,
  endJd: number
): { key: number; start: number; end: number }[] {
  const insideAt = (jd: number): boolean =>
    shorterArc(getSiderealLongitude(jd, 6), natalMoonLongitude) <= 45
  const stateAt = (jd: number): number => (insideAt(jd) ? 1 : 0)
  const STEP = 10 // days

  const segments: { key: number; start: number; end: number }[] = []
  let curState = stateAt(startJd)
  let segStart = startJd
  let jd = startJd
  while (jd < endJd) {
    const next = Math.min(jd + STEP, endJd)
    const s = stateAt(next)
    if (s !== curState) {
      const boundary = nextStateChange(jd, STEP, stateAt)
      segments.push({ key: curState, start: segStart, end: boundary })
      curState = stateAt(boundary)
      segStart = boundary
      jd = boundary
    } else {
      jd = next
    }
  }
  segments.push({ key: curState, start: segStart, end: endJd })

  const raw = segments.filter((seg) => seg.key === 1)
  return mergeSegments(raw, DEGREE_SADE_SATI_MERGE_GAP_DAYS)
}

/**
 * Shared implementation behind `computeDegreeSadeSati`. `testHorizon`, when supplied,
 * replaces the production R6.9 scan window with a caller-chosen one — used only by
 * property tests to keep the ephemeris cost of each generated case bounded (~35 years
 * instead of the full ~68+ years). It is not reachable from the public
 * `computeDegreeSadeSati` signature, so production callers cannot set a
 * non-conforming window.
 */
function computeDegreeSadeSatiInternal(
  natalMoonLongitude: number,
  birthYear: number,
  asOfDate: Date,
  testHorizon?: { start: Date; end: Date }
): DegreeSadeSatiInfo {
  const scanFromYear = birthYear - 33
  const scanToYear = new Date().getUTCFullYear() + 35

  if (!Number.isFinite(natalMoonLongitude)) {
    return {
      natalMoonLongitude,
      orbDeg: 45,
      active: false,
      separationDeg: 0,
      scanFromYear,
      scanToYear,
      allPeriods: [],
    }
  }

  ensureEph()

  const startJd = testHorizon
    ? toJD(testHorizon.start)
    : toJD(new Date(Date.UTC(scanFromYear, 0, 1)))
  const endJd = testHorizon
    ? toJD(testHorizon.end)
    : toJD(new Date(Date.UTC(scanToYear, 0, 1)))

  const merged = scanDegreeSadeSatiSegments(natalMoonLongitude, startJd, endJd)

  const nowMs = asOfDate.getTime()
  const label = `Saturn ±45° from natal Moon (${natalMoonLongitude.toFixed(2)}°) - 12th, 1st, 2nd houses`

  const allPeriods: DegreeSadeSatiPeriod[] = merged.map((seg, idx) => {
    const startD = jdToDate(seg.start)
    const endD = jdToDate(seg.end)
    const startMs = startD.getTime()
    const endMs = endD.getTime()
    const isCurrent = nowMs >= startMs && nowMs < endMs

    const period: DegreeSadeSatiPeriod = {
      sequence: idx + 1,
      start: startD.toISOString(),
      end: endD.toISOString(),
      startApprox: fmtMonthYear(startD),
      endApprox: fmtMonthYear(endD),
      durationDays: seg.end - seg.start,
      isCurrent,
      label,
    }

    if (isCurrent) {
      period.completionPct = roundHalfAwayFromZeroInt((100 * (nowMs - startMs)) / (endMs - startMs))
    }
    if (startMs > nowMs) {
      period.startsInDays = (startMs - nowMs) / 86400000
    }

    return period
  })

  const separationDeg = shorterArc(getSiderealLongitude(toJD(asOfDate), 6), natalMoonLongitude)
  const active = separationDeg <= 45

  return {
    natalMoonLongitude,
    orbDeg: 45,
    active,
    separationDeg,
    scanFromYear,
    scanToYear,
    allPeriods,
  }
}

/**
 * Degree-based Sade Sati: Saturn's sidereal longitude within ±45° (shorter arc) of the
 * natal Moon's, scanned over the SAME horizon `computeSadeSatiPeriods` uses —
 * `1 Jan (birthYear − 33)` → `1 Jan (wall-clock year + 35)` — so the two readings cannot
 * drift apart (R6.9). Never throws: a non-finite `natalMoonLongitude` degrades to an
 * inactive, period-less result rather than throwing.
 *
 * @param natalMoonLongitude  Natal Moon sidereal longitude in degrees.
 * @param birthYear           Native's birth year — sets the horizon start.
 * @param asOfDate            Instant used for `active`, `separationDeg`, `isCurrent`,
 *                            `completionPct` and `startsInDays`.
 */
export function computeDegreeSadeSati(
  natalMoonLongitude: number,
  birthYear: number,
  asOfDate: Date
): DegreeSadeSatiInfo {
  return computeDegreeSadeSatiInternal(natalMoonLongitude, birthYear, asOfDate)
}

/**
 * TEST-ONLY. Identical to `computeDegreeSadeSati` but accepts an explicit `testHorizon`
 * that replaces the production R6.9 scan window. Property tests use this to run a
 * shortened ~35-year horizon so each generated case covers one or two Saturn passages
 * instead of a full ~68+-year scan. There is no equivalent parameter on
 * `computeDegreeSadeSati` itself, so no production caller can set a non-conforming
 * window.
 */
export function computeDegreeSadeSatiWithTestHorizon(
  natalMoonLongitude: number,
  birthYear: number,
  asOfDate: Date,
  testHorizon: { start: Date; end: Date }
): DegreeSadeSatiInfo {
  return computeDegreeSadeSatiInternal(natalMoonLongitude, birthYear, asOfDate, testHorizon)
}

// ─── Moon Transit Listing ────────────────────────────────────────────

/**
 * Returns Moon transits for the next 27 sign changes (~60 days) using the real
 * lunar ephemeris. Each sign's entry/exit is the actual ingress moment, so the
 * (variable) ~2.2–2.5 day duration per sign is exact rather than assumed.
 */
function computeMoonTransits(
  natalMoonSignNumber: number,
  asOfDate: Date
): MoonTransitPeriod[] {
  const transits: MoonTransitPeriod[] = []
  const moonSign = (jd: number) => bodySignAt(jd, 1)

  const nowJd = toJD(asOfDate)
  const nowMs = asOfDate.getTime()

  // Start of the sign the Moon currently occupies.
  let entryJd = prevSignChange(nowJd, 0.25, moonSign)

  for (let i = 0; i < 27; i++) {
    // `entryJd` is the bisection-converged boundary: the first JD in the new sign.
    // Read the sign directly at entryJd — no epsilon offset needed.
    const sign = moonSign(entryJd)
    const exitJd = nextStateChange(entryJd, 0.25, moonSign)
    const entryD = jdToDate(entryJd)
    const exitD = jdToDate(exitJd)

    transits.push({
      signNumber: sign,
      sign: SIGNS[sign - 1],
      entryDate: entryD.toISOString(),
      exitDate: exitD.toISOString(),
      isCurrent: nowMs >= entryD.getTime() && nowMs < exitD.getTime(),
      houseFromMoon: ((sign - natalMoonSignNumber + 12) % 12) + 1,
    })

    entryJd = exitJd
  }

  return transits
}

// ─── Ascendant Transit Listing ───────────────────────────────────────

/**
 * Returns ascendant (lagna) transits for the next 12 signs (~24 hours) using
 * real house computation. Ascendant sign durations vary strongly by sign and
 * latitude (from well under an hour to ~2.5 hours), so exact sign-change moments
 * are found rather than assuming a fixed 2 hours per sign.
 */
function computeAscendantTransits(
  natalLagnaSignNumber: number,
  asOfDate: Date,
  latitude: number,
  longitude: number
): AscendantTransitPeriod[] {
  const transits: AscendantTransitPeriod[] = []
  const ascSign = (jd: number) => ascSignAt(jd, latitude, longitude)

  const nowJd = toJD(asOfDate)
  const nowMs = asOfDate.getTime()

  // Coarse step ~10 minutes — smaller than the fastest-rising sign.
  const COARSE = 10 / (24 * 60)

  // Start of the sign currently rising.
  let entryJd = prevSignChange(nowJd, COARSE, ascSign)

  for (let i = 0; i < 12; i++) {
    // `entryJd` is bisection-precise; read the sign directly without any offset.
    // An ascendant sign at high latitudes can last under an hour, so even a
    // 1-minute epsilon could cross into the adjacent sign.
    const sign = ascSign(entryJd)
    const exitJd = nextStateChange(entryJd, COARSE, ascSign)
    const entryD = jdToDate(entryJd)
    const exitD = jdToDate(exitJd)

    transits.push({
      signNumber: sign,
      sign: SIGNS[sign - 1],
      entryDate: entryD.toISOString(),
      exitDate: exitD.toISOString(),
      isCurrent: nowMs >= entryD.getTime() && nowMs < exitD.getTime(),
      houseFromLagna: ((sign - natalLagnaSignNumber + 12) % 12) + 1,
    })

    entryJd = exitJd
  }

  return transits
}

// ─── Main Export ─────────────────────────────────────────────────────

export function computeTransits(
  natalMoonSignNumber: number,
  natalLagnaSignNumber: number,
  birthYear: number = 1984,
  asOfDate: Date = new Date(),
  latitude: number = 28.6,
  longitude: number = 77.2,
  natalMoonLongitude?: number
): TransitAnalysis {
  ensureEph()
  swisseph.swe_set_sid_mode(swisseph.SE_SIDM_LAHIRI, 0, 0)
  const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SIDEREAL | swisseph.SEFLG_SPEED
  const jd = toJD(asOfDate)

  const transits: TransitPlanet[] = []

  for (const { name, id } of PLANET_IDS) {
    const result = swisseph.swe_calc_ut(jd, id, flags) as any
    let lon = normLong(result.longitude ?? 0)
    const speed = result.longitudeSpeed ?? 0

    const addPlanet = (pname: string, plon: number, pspeed: number) => {
      const sn = getSignNumber(plon)
      transits.push({
        planet: pname, longitude: plon, sign: SIGNS[sn - 1], signNumber: sn,
        degreeInSign: plon % 30, retrograde: pspeed < 0,
        houseFromMoon: ((sn - natalMoonSignNumber + 12) % 12) + 1,
        houseFromLagna: ((sn - natalLagnaSignNumber + 12) % 12) + 1,
      })
    }

    addPlanet(name, lon, speed)
    if (name === 'Rahu') {
      addPlanet('Ketu', normLong(lon + 180), speed)
    }
  }

  // Sade Sati
  const saturnT = transits.find(t => t.planet === 'Saturn')!
  const satSign = saturnT.signNumber
  const moonMinus1 = ((natalMoonSignNumber - 2 + 12) % 12) + 1
  const moonPlus1  = (natalMoonSignNumber % 12) + 1

  let phase: SadeSatiInfo['phase'] = null
  if (satSign === moonMinus1) phase = 'rising'
  else if (satSign === natalMoonSignNumber) phase = 'peak'
  else if (satSign === moonPlus1) phase = 'setting'
  const active = phase !== null

  const allPeriods = computeSadeSatiPeriods(natalMoonSignNumber, birthYear, asOfDate)

  const sadeSati: SadeSatiInfo = {
    active, phase, saturnSignNumber: satSign, natalMoonSignNumber,
    description: active
      ? `Sade Sati ${phase} phase — Saturn in ${SIGNS[satSign - 1]}, Moon sign ${SIGNS[natalMoonSignNumber - 1]}`
      : `No active Sade Sati — Saturn in ${SIGNS[satSign - 1]}, Moon sign ${SIGNS[natalMoonSignNumber - 1]}`,
    allPeriods,
  }

  const satFromMoon = ((satSign - natalMoonSignNumber + 12) % 12) + 1
  const moonT = transits.find(t => t.planet === 'Moon')!

  const moonTransits = computeMoonTransits(natalMoonSignNumber, asOfDate)
  const ascTransits  = computeAscendantTransits(natalLagnaSignNumber, asOfDate, latitude, longitude)

  const sadeSatiByDegree = Number.isFinite(natalMoonLongitude)
    ? computeDegreeSadeSati(natalMoonLongitude as number, birthYear, asOfDate)
    : undefined

  return {
    asOf: asOfDate.toISOString(),
    transits,
    sadeSati,
    ...(sadeSatiByDegree ? { sadeSatiByDegree } : {}),
    ashtamaShani: satFromMoon === 8,
    kantakaShani: satFromMoon === 4,
    currentMoonSign: moonT.sign,
    natalMoonSign: SIGNS[natalMoonSignNumber - 1],
    moonTransitSameAsNatal: moonT.signNumber === natalMoonSignNumber,
    moonTransits,
    ascendantTransits: ascTransits,
  }
}
