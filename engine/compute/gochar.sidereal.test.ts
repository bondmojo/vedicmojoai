/**
 * engine/compute/gochar.sidereal.test.ts — Sidereal-setup assertion test.
 *
 * This is the guard for the two silent failure modes the Gochar module's
 * ephemeris setup can have (design.md: Resolved Design Decisions —
 * "Ephemeris/model"; tasks 2.1/2.2):
 *
 *  1. Missing `SEFLG_SIDEREAL` + `SE_SIDM_LAHIRI` → every longitude is
 *     **tropical**, so every sign and house is wrong by roughly the ayanamsa
 *     (~24°) while every structural test (ordering, coverage, clipping) still
 *     passes. Caught here by recomputing the *tropical* longitude for the same
 *     body/JD independently and asserting the difference equals the Lahiri
 *     ayanamsa from `getAyanamsa()` — the ayanamsa is never hardcoded, so this
 *     stays correct as the ayanamsa drifts with epoch.
 *
 *  2. Missing `SEFLG_SPEED` → `longitudeSpeed` comes back absent/zero, so
 *     `stepIsSafe()` always returns `true`, the adaptive cusp-proximity
 *     refinement never engages, and the correctness-critical scanner is
 *     silently defeated with no other failing test. Caught here by asserting a
 *     non-zero (and physically plausible) `longitudeSpeed` for a fast body.
 *
 * The tropical comparison is computed straight from `swisseph-v2` in this file
 * — mirroring `transits.degreeSadeSati.test.ts`'s convention of replicating
 * ephemeris access independently rather than reusing the helper under test.
 *
 * Requirements: R1.2, R1.5
 */

import { describe, expect, it } from 'vitest'
import swisseph from 'swisseph-v2'
import path from 'path'
import { getSiderealLongitude, GOCHAR_BODY_IDS } from './gochar'
import { getAyanamsa } from './planets'

// ─── Independent ephemeris access (deliberately not imported from gochar.ts) ──

let ephePathSet = false
function ensureEph(): void {
  if (ephePathSet) return
  try {
    const pkg = require.resolve('swisseph-v2/package.json')
    swisseph.swe_set_ephe_path(path.join(path.dirname(pkg), 'ephe'))
  } catch {
    /* swisseph falls back to its built-in Moshier ephemeris */
  }
  ephePathSet = true
}

function normLong(lon: number): number {
  return ((lon % 360) + 360) % 360
}

/**
 * The body's **tropical** longitude — `SEFLG_SWIEPH` only, deliberately with
 * no `SEFLG_SIDEREAL`, so the sidereal offset can be measured.
 */
function tropicalLongitude(jd: number, bodyId: number): number {
  ensureEph()
  const r = swisseph.swe_calc_ut(jd, bodyId, swisseph.SEFLG_SWIEPH) as any
  return normLong(r.longitude ?? 0)
}

/** One fixed instant: 2024-01-01T00:00:00Z. */
const FIXED_JD = (() => {
  ensureEph()
  return swisseph.swe_julday(2024, 1, 1, 0, swisseph.SE_GREG_CAL)
})()

const bodyId = (graha: string): number => {
  const entry = GOCHAR_BODY_IDS.find((e) => e.graha === graha)
  if (!entry) throw new Error(`no GOCHAR_BODY_IDS entry for ${graha}`)
  return entry.id
}

describe('gochar getSiderealLongitude — sidereal setup (failure mode 1)', () => {
  const ayanamsa = getAyanamsa(FIXED_JD)

  it('reports a plausible Lahiri ayanamsa at the fixed JD (sanity for the comparison)', () => {
    // Not the assertion itself — just confirms `getAyanamsa()` returned a real
    // value, so the per-body checks below are comparing against something.
    expect(Number.isFinite(ayanamsa)).toBe(true)
    expect(ayanamsa).toBeGreaterThan(0)
  })

  it.each(GOCHAR_BODY_IDS.map((e) => e.graha))(
    '%s: sidereal longitude differs from tropical by exactly the Lahiri ayanamsa',
    (graha) => {
      const id = bodyId(graha)
      const sidereal = getSiderealLongitude(FIXED_JD, id).longitude
      const tropical = tropicalLongitude(FIXED_JD, id)

      // Swisseph's sidereal longitude is the tropical longitude minus the
      // ayanamsa, normalized. Compared modulo 360 so a body near 0° Aries
      // does not produce a spurious ~360° difference.
      //
      // Tolerance: 0.01° (36 arcsec). The residual is ~0.0015° (5 arcsec),
      // from `swe_calc_ut`'s sidereal projection differing very slightly from
      // the bare `swe_get_ayanamsa_ut` value `getAyanamsa()` reads. That is
      // three orders of magnitude below the ~24° error a missing
      // SEFLG_SIDEREAL/SE_SIDM_LAHIRI would produce, and well below a
      // different-ayanamsa mistake (the next-closest common ayanamsa,
      // Raman/KP, differs from Lahiri by minutes of arc, not seconds).
      const offset = normLong(tropical - sidereal)
      expect(Math.abs(offset - ayanamsa)).toBeLessThan(0.01)
    }
  )

  it('does not return tropical longitudes (the offset is not ~0)', () => {
    const id = bodyId('Jupiter')
    const sidereal = getSiderealLongitude(FIXED_JD, id).longitude
    const tropical = tropicalLongitude(FIXED_JD, id)
    const offset = normLong(tropical - sidereal)
    // If SEFLG_SIDEREAL/SE_SIDM_LAHIRI were dropped, this offset collapses to 0.
    expect(offset).toBeGreaterThan(1)
  })

  it('returns longitudes normalized to [0, 360)', () => {
    for (const { id } of GOCHAR_BODY_IDS) {
      const { longitude } = getSiderealLongitude(FIXED_JD, id)
      expect(longitude).toBeGreaterThanOrEqual(0)
      expect(longitude).toBeLessThan(360)
    }
  })
})

describe('gochar getSiderealLongitude — SEFLG_SPEED (failure mode 2)', () => {
  it('returns a non-zero longitudeSpeed for the Moon (a fast body)', () => {
    const { longitudeSpeed } = getSiderealLongitude(FIXED_JD, bodyId('Moon'))
    expect(longitudeSpeed).not.toBe(0)
    // The Moon moves ~11–15°/day; a missing SEFLG_SPEED yields 0/undefined→0.
    expect(Math.abs(longitudeSpeed)).toBeGreaterThan(10)
    expect(Math.abs(longitudeSpeed)).toBeLessThan(16)
  })

  it('returns a non-zero longitudeSpeed for the Sun', () => {
    const { longitudeSpeed } = getSiderealLongitude(FIXED_JD, bodyId('Sun'))
    expect(Math.abs(longitudeSpeed)).toBeGreaterThan(0.9)
    expect(Math.abs(longitudeSpeed)).toBeLessThan(1.1)
  })

  it('returns a finite longitudeSpeed for every scanned body', () => {
    for (const { id } of GOCHAR_BODY_IDS) {
      const { longitudeSpeed } = getSiderealLongitude(FIXED_JD, id)
      expect(Number.isFinite(longitudeSpeed)).toBe(true)
    }
  })

  it('returns longitude and speed from the same call (speed sign matches motion)', () => {
    // A one-hour forward difference must agree in sign with the reported
    // instantaneous speed — proves the speed belongs to the same sample rather
    // than being a stale/defaulted value.
    const id = bodyId('Mercury')
    const { longitude, longitudeSpeed } = getSiderealLongitude(FIXED_JD, id)
    const later = getSiderealLongitude(FIXED_JD + 1 / 24, id).longitude
    let delta = later - longitude
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    expect(Math.sign(delta)).toBe(Math.sign(longitudeSpeed))
  })
})
