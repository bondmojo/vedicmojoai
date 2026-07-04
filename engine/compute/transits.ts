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
 * Finds the JD at which `signAt` first differs from its value at `startJd`,
 * searching forward. The boundary is refined by bisection.
 * Returns the first JD that lies in the new sign.
 */
function nextSignChange(
  startJd: number,
  coarseStepDays: number,
  signAt: (jd: number) => number
): number {
  const startSign = signAt(startJd)
  let lo = startJd
  let hi = startJd + coarseStepDays
  let guard = 0
  while (signAt(hi) === startSign && guard < 5000) {
    lo = hi
    hi += coarseStepDays
    guard++
  }
  for (let i = 0; i < 42; i++) {
    const mid = (lo + hi) / 2
    if (signAt(mid) === startSign) lo = mid
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

// ─── Sade Sati Timeline ──────────────────────────────────────────────

/**
 * Computes all Sade Sati periods across the native's life using the real
 * Saturn ephemeris. Saturn's actual sign-ingress dates (including retrograde
 * re-entries) are found by scanning and refining boundaries, then the segments
 * in the three Sade Sati signs (12th, 1st, 2nd from natal Moon) are extracted.
 */
function computeSadeSatiPeriods(
  natalMoonSignNumber: number,
  birthYear: number
): SadeSatiPeriod[] {
  ensureEph()
  const now = new Date()

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
  const endJd   = toJD(new Date(Date.UTC(now.getUTCFullYear() + 35, 0, 1)))

  // Build contiguous Saturn-in-sign segments across the window.
  const satSign = (jd: number) => bodySignAt(jd, 6)
  const segments: { sign: number; start: number; end: number }[] = []
  const STEP = 10 // days

  let curSign = satSign(startJd)
  let segStart = startJd
  let jd = startJd
  while (jd < endJd) {
    const next = Math.min(jd + STEP, endJd)
    const s = satSign(next)
    if (s !== curSign) {
      const boundary = nextSignChange(jd, STEP, satSign)
      segments.push({ sign: curSign, start: segStart, end: boundary })
      curSign = satSign(boundary)
      segStart = boundary
      jd = boundary
    } else {
      jd = next
    }
  }
  segments.push({ sign: curSign, start: segStart, end: endJd })

  // Extract relevant segments and merge retrograde-fragmented ones
  // (same sign, gap < ~8 months).
  const raw = segments
    .filter((seg) => phaseOf(seg.sign) !== null)
    .sort((a, b) => a.start - b.start)

  const merged: { sign: number; start: number; end: number }[] = []
  for (const seg of raw) {
    const last = merged[merged.length - 1]
    if (last && last.sign === seg.sign && seg.start - last.end < 240) {
      last.end = seg.end
    } else {
      merged.push({ ...seg })
    }
  }

  const nowMs = now.getTime()
  return merged.map((seg) => {
    const startD = jdToDate(seg.start)
    const endD = jdToDate(seg.end)
    return {
      phase: phaseOf(seg.sign)!,
      phaseSign: SIGNS[seg.sign - 1],
      startApprox: fmtMonthYear(startD),
      endApprox: fmtMonthYear(endD),
      isCurrent: nowMs >= startD.getTime() && nowMs < endD.getTime(),
    }
  })
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
    const exitJd = nextSignChange(entryJd, 0.25, moonSign)
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
    const exitJd = nextSignChange(entryJd, COARSE, ascSign)
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
  longitude: number = 77.2
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

  const allPeriods = computeSadeSatiPeriods(natalMoonSignNumber, birthYear)

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

  return {
    asOf: asOfDate.toISOString(),
    transits,
    sadeSati,
    ashtamaShani: satFromMoon === 8,
    kantakaShani: satFromMoon === 4,
    currentMoonSign: moonT.sign,
    natalMoonSign: SIGNS[natalMoonSignNumber - 1],
    moonTransitSameAsNatal: moonT.signNumber === natalMoonSignNumber,
    moonTransits,
    ascendantTransits: ascTransits,
  }
}
