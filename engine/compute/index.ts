/**
 * engine/compute/index.ts — Main entry point for the chart computation engine.
 */

import type { BirthInput, ComputedChart } from './types'
import {
  birthInputToJulianDay,
  computeAscendant,
  computePlanetPositions,
  computeSunrise,
  getAyanamsa,
} from './planets'
import { computeDivisionalCharts, vargaSignForLongitude } from './divisional'
import { computeNakshatras } from './nakshatras'
import { computeCharaKarakas } from './karakas'
import { computeAshtakavarga } from './ashtakavarga'
import { computeUpagrahas } from './upagrahas'
import { computeSpecialLagnas } from './specialLagnas'
import { computeArudhaPadas } from './arudhaPadas'
import type { ArudhaPlanetInput } from './arudhaPadas'
import { computePindaStrength } from './pindaStrength'
import { computeTransits } from './transits'

// Re-export all types
export type { BirthInput, ComputedChart } from './types'
export type {
  PlanetPosition,
  NakshatraInfo,
  DivisionalChart,
  DivisionalPlacement,
  CharaKaraka,
  AshtakavargaResult,
  Upagraha,
  SpecialLagna,
  ArudhaPada,
  PindaStrengthEntry,
  TransitPlanet,
  TransitAnalysis,
  SadeSatiInfo,
} from './types'

/**
 * Computes a complete Vedic chart from birth data.
 */
export function computeFullChart(input: BirthInput): ComputedChart {
  // Step 1: Julian Day (UT)
  const julianDay = birthInputToJulianDay(input)

  // Step 2: Ayanamsa
  const ayanamsa = getAyanamsa(julianDay)

  // Step 3: Ascendant
  const ascendant = computeAscendant(julianDay, input.latitude, input.longitude)

  // Step 4: Planetary positions
  const planets = computePlanetPositions(julianDay, ascendant.signNumber)

  // Step 5: Nakshatras
  const nakshatras = computeNakshatras(planets)

  // Step 6: Divisional charts (D1, D4, D7, D9, D10, D30)
  const divisionalCharts = computeDivisionalCharts(planets, ascendant.longitude)

  // Step 7: Chara Karakas
  const charaKarakas = computeCharaKarakas(planets)

  // Step 8: Ashtakavarga
  const ashtakavarga = computeAshtakavarga(planets, ascendant.signNumber)

  // Step 9: Upagrahas (birth time in seconds from midnight)
  const [h, m, s] = input.time.split(':').map(Number)
  const birthTimeSeconds = h * 3600 + m * 60 + (s || 0)
  const [year, month, day] = input.date.split('-').map(Number)
  const birthDateLocal = new Date(year, month - 1, day)

  const upagrahas = computeUpagrahas(
    planets,
    ascendant.signNumber,
    ascendant.longitude,
    birthDateLocal,
    birthTimeSeconds
  )

  // Step 10: Special Lagnas
  // Get D9 lagna sign number from divisional charts
  const d9Chart = divisionalCharts.find((c) => c.division === 9)
  const d9LagnaSignNumber = d9Chart?.lagnaSignNumber ?? ascendant.signNumber

  // Atmakaraka is the first chara karaka (AK)
  const ak = charaKarakas[0]
  const akInD9 = d9Chart?.planets.find((p) => p.planet === ak?.planet)
  const d9AKSignNumber = akInD9?.signNumber ?? d9LagnaSignNumber

  // Actual sunrise → origin for the time-based lagnas (Bhava/Hora/Ghati).
  // Mode is controlled by the caller: 'precise' uses real astronomical sunrise,
  // 'jhora' uses fixed 6 AM local to match Jagannatha Hora's convention.
  const sunriseMode = input.sunriseMode ?? 'precise'
  const { sunriseJulianDay, sunLongitudeAtSunrise, sunriseFallback } = computeSunrise(
    julianDay,
    input.latitude,
    input.longitude,
    input.timezone,
    sunriseMode
  )
  let elapsedHoursSinceSunrise = (julianDay - sunriseJulianDay) * 24
  if (elapsedHoursSinceSunrise < 0) elapsedHoursSinceSunrise += 24

  // Ghati Lagna (GL) always needs the precise astronomical sunrise regardless
  // of sunriseMode — JHora does not apply the 6 AM convention to GL.
  // In precise mode these values are the same as above; in jhora mode we
  // compute an additional precise sunrise to feed GL.
  let sunLongitudeAtPreciseSunrise = sunLongitudeAtSunrise
  let elapsedHoursFromPreciseSunrise = elapsedHoursSinceSunrise
  if (sunriseMode === 'jhora') {
    const precise = computeSunrise(julianDay, input.latitude, input.longitude, input.timezone, 'precise')
    sunLongitudeAtPreciseSunrise = precise.sunLongitudeAtSunrise
    elapsedHoursFromPreciseSunrise = (julianDay - precise.sunriseJulianDay) * 24
    if (elapsedHoursFromPreciseSunrise < 0) elapsedHoursFromPreciseSunrise += 24
  }

  const specialLagnas = computeSpecialLagnas({
    planets,
    lagnaSignNumber: ascendant.signNumber,
    lagnaLongitude: ascendant.longitude,
    sunLongitudeAtSunrise,
    elapsedHoursSinceSunrise,
    sunLongitudeAtPreciseSunrise,
    elapsedHoursFromPreciseSunrise,
    d9AKSignNumber,
  })

  // Step 11: Arudha Padas
  const arudhaPadas = computeArudhaPadas(ascendant.signNumber, planets)

  // Step 11b: Per-varga arudhas + projected special lagnas/upagrahas.
  // Each divisional chart gets its own arudha padas (computed from that varga's
  // rashi positions) and the special lagnas / upagrahas projected via longitude.
  for (const dc of divisionalCharts) {
    const vargaArudhas = computeArudhaPadas(
      dc.lagnaSignNumber,
      dc.planets.map((p): ArudhaPlanetInput => ({
        planet: p.planet,
        signNumber: p.signNumber,
      }))
    )
    dc.arudhaPadas = vargaArudhas.map((a) => ({
      abbr: a.abbr,
      signNumber: a.signNumber,
      house_in_chart: a.house_in_chart,
    }))

    dc.specialLagnas = specialLagnas.map((sl) => {
      // Most special lagnas have a genuine ecliptic longitude and project
      // correctly into any varga. The exception is KS (Karakamsa), whose
      // longitude is stored as (d9AKSignNumber-1)×30 — a D9-derived pseudo-
      // longitude. For D9 the projection is coincidentally correct; for other
      // vargas the result has no classical basis and should be interpreted
      // with caution.
      const signNumber = vargaSignForLongitude(sl.longitude, dc.division)
      return {
        abbr: sl.abbr,
        signNumber,
        house: ((signNumber - dc.lagnaSignNumber + 12) % 12) + 1,
      }
    })

    dc.upagrahas = upagrahas.map((u) => {
      const signNumber = vargaSignForLongitude(u.longitude, dc.division)
      return {
        abbr: u.abbr,
        signNumber,
        house: ((signNumber - dc.lagnaSignNumber + 12) % 12) + 1,
      }
    })
  }

  // Step 12: Pinda Strength
  const pindaStrength = computePindaStrength(planets, divisionalCharts)

  // Step 13: Current transits (Gochar)
  const moon = planets.find((p) => p.planet === 'Moon')
  const birthYear = parseInt(input.date.split('-')[0])
  const transits = computeTransits(
    moon?.signNumber ?? 1,
    ascendant.signNumber,
    birthYear,
    new Date(),
    input.latitude,
    input.longitude
  )

  return {
    input,
    sunriseMode: sunriseFallback ? 'jhora' : sunriseMode,
    sunriseFallback,
    julianDay,
    ayanamsa,
    lagna: ascendant.sign,
    lagnaSignNumber: ascendant.signNumber,
    lagnaLongitude: ascendant.longitude,
    lagnaDegreeInSign: ascendant.degreeInSign,
    planets,
    nakshatras,
    divisionalCharts,
    charaKarakas,
    ashtakavarga,
    upagrahas,
    specialLagnas,
    arudhaPadas,
    pindaStrength,
    transits,
  }
}
