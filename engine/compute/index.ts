/**
 * engine/compute/index.ts — Main entry point for the chart computation engine.
 */

import type { BirthInput, ComputedChart } from './types'
import { calculationSettingsSnapshot, CalculationProfileValidationError, resolveCalculationProfile } from './profiles'
import { resolveAstronomyProvider } from './astronomy'
import { resolveExternalSunriseReferences } from './sunrise'
import { parseBirthTime } from './time'
import { computeDivisionalCharts, vargaSignForLongitude } from './divisional'
import { computeNakshatras, computeNakshatraForLongitude } from './nakshatras'
import { computeCharaKarakas } from './karakas'
import { computeAshtakavarga } from './ashtakavarga'
import { computeUpagrahas } from './upagrahas'
import { computeSpecialLagnas } from './specialLagnas'
import { computeArudhaPadas } from './arudhaPadas'
import type { ArudhaPlanetInput } from './arudhaPadas'
import { computePindaStrength } from './pindaStrength'
import { computeTransits } from './transits'
import { computeRelationshipGeometry } from './relationships'
import { computeShadbala } from './shadbala'
import { computeNakshatraRelationships } from './nakshatraRelationships'
import { computeJaimini } from './jaimini'
import { computeBhavaBala } from './bhavaBala'
import { computeYogas } from './yogas'

// Re-export all types
export type { BirthInput, ComputedChart } from './types'
export type { CalculationProfile, CalculationProfileId, CalculationSettingsSnapshot } from './profiles'
export {
  CalculationProfilePersistenceUnavailableError,
  CalculationProfileUnavailableError,
  CalculationProfileValidationError,
  calculationSettingsSnapshot,
  DEFAULT_CALCULATION_PROFILE_ID,
  DRIK_LAHIRI_V1,
  resolveCalculationProfile,
  SURYA_SIDDHANTA_MAKARANDA_V1,
} from './profiles'
export type { AstronomyProvider } from './astronomy'
export type {
  PlanetPosition,
  NakshatraInfo,
  DivisionalChart,
  DivisionalPlacement,
  CharaKaraka,
  AshtakavargaResult,
  AshtakavargaHouseEntry,
  Upagraha,
  SpecialLagna,
  ArudhaPada,
  PindaStrengthEntry,
  TransitPlanet,
  TransitAnalysis,
  SadeSatiInfo,
  DegreeSadeSatiPeriod,
  DegreeSadeSatiInfo,
  RelationshipGeometry,
  ShadbalResult,
  NakshatraRelationships,
  JaiminiGeometry,
  BhavaBalaResult,
  CharaDashaResult,
  CharaDashaPeriod,
  CharaAntardasha,
  Yoga,
  YogaCategory,
  YogaStrength,
  YogaEvidence,
  MatchRole,
  KootaKey,
  Cancellation,
  KootaEvidence,
  KootaScore,
  MatchVerdict,
  BoundaryRisk,
  AshtakootaResult,
  MangalDoshaNative,
  MatchResult,
} from './types'
export { computeCharaDasha } from './charaDasha'
export { computeYogas } from './yogas'
export type { YogaInput } from './yogas'
export { MATCHMAKING_TABLES_VERSION } from './matchmakingTables'
export type {
  GocharRangeInput,
  NatalGocharContext,
} from './gochar'
export type {
  GocharGraha,
  GocharOccupancyInterval,
  GocharRangeResult,
} from '@/lib/gocharRange'
export { DEFAULT_GOCHAR_GRAHAS, ALL_GOCHAR_GRAHAS, GOCHAR_BODY_IDS, computeGocharRange, GocharValidationError, resolveNatalGocharContext } from './gochar'

/**
 * Computes a complete Vedic chart from birth data.
 */
export function computeFullChart(input: BirthInput): ComputedChart {
  const profile = resolveCalculationProfile(input.calculationProfile)
  const sunriseMode = input.sunriseMode ?? 'precise'
  if (profile.id === 'surya_siddhanta_makaranda_v1' && sunriseMode === 'jhora') {
    throw new CalculationProfileValidationError(
      profile.id,
      'Sri Surya Siddhanta — Generalized Makaranda requires sunriseMode "precise"; the legacy JHora 06:00 convention is unavailable for this profile.'
    )
  }
  const provider = resolveAstronomyProvider(profile)

  // Step 1: Julian Day (UT)
  const julianDay = provider.birthInputToJulianDay(input)

  // Step 2: Ayanamsa
  const ayanamsa = provider.getAyanamsa(julianDay)

  // Step 3: Ascendant
  const ascendant = provider.computeAscendant(julianDay, input.latitude, input.longitude)

  // Step 4: Planetary positions
  const planets = provider.computePlanets(julianDay, ascendant.signNumber)

  // Step 5: Nakshatras — EXACTLY one entry per graha (9 entries). Everything
  // downstream that reasons about planet-to-planet nakshatra geometry
  // (nakshatraRelationships.ts) depends on this array staying planets-only.
  const planetNakshatras = computeNakshatras(planets)

  // Step 5b: Ascendant (Lagna) Nakshatra — PVR/JHora methodology: the same
  // sidereal longitude→nakshatra arithmetic used for the grahas, applied to the
  // lagna degree. Kept OUT of `planetNakshatras` so it can never be mistaken for
  // a graha by the relationship/parivartana/cluster scans; it is exposed as its
  // own `ascendantNakshatra` field and appended to the display array below.
  const ascendantNakshatra = computeNakshatraForLongitude(ascendant.longitude, 'Ascendant')

  // Step 6: Divisional charts (D1, D2, D3, D4, D5, D6, D7, D9, D10, D12, D24, D30, D60)
  const divisionalCharts = computeDivisionalCharts(planets, ascendant.longitude)

  // Step 7: Chara Karakas
  const charaKarakas = computeCharaKarakas(planets)

  // Step 8: Ashtakavarga
  const ashtakavarga = computeAshtakavarga(planets, ascendant.signNumber)

  // Step 9: Upagrahas (birth time in seconds from midnight)
  const birthTimeSeconds = parseBirthTime(input.time).secondsSinceMidnight
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

  // The sunrise module returns only retained external instants. The selected
  // provider, not the native sunrise bridge, supplies every sidereal Sun value.
  const sunriseReferences = resolveExternalSunriseReferences({
    julianDay,
    latitude: input.latitude,
    longitude: input.longitude,
    timezone: input.timezone,
    sunriseMode,
  })
  const sunriseJulianDay = sunriseReferences.selected.sunriseJulianDay
  const sunriseFallback = sunriseReferences.selected.sunriseFallback
  const sunLongitudeAtSunrise = provider.longitudeAt(sunriseJulianDay, 'Sun').longitude
  let elapsedHoursSinceSunrise = (julianDay - sunriseJulianDay) * 24
  // Preserves the Drik/JHora pre-06:00 result: legacy mode intentionally keeps
  // same-day 06:00 as its raw anchor, then represents it as the prior civil-day
  // elapsed interval. The SSS profile cannot select this mode.
  if (elapsedHoursSinceSunrise < 0) elapsedHoursSinceSunrise += 24

  // Ghati Lagna always needs the precise astronomical sunrise regardless of
  // sunriseMode. In JHora mode the precise external instant is separate, but
  // its Sun longitude still comes from the active provider.
  const preciseSunriseJulianDay = sunriseReferences.precise.sunriseJulianDay
  let sunLongitudeAtPreciseSunrise = provider.longitudeAt(preciseSunriseJulianDay, 'Sun').longitude
  let elapsedHoursFromPreciseSunrise = (julianDay - preciseSunriseJulianDay) * 24
  if (elapsedHoursFromPreciseSunrise < 0) elapsedHoursFromPreciseSunrise += 24

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
    input.longitude,
    moon?.longitude,
    provider,
  )

  // Step 14: Deterministic relationship / strength modules (replaces LLM agents).
  const sunLon = planets.find((p) => p.planet === 'Sun')?.longitude ?? 0
  const moonLon = planets.find((p) => p.planet === 'Moon')?.longitude ?? 0
  const elongation = (((moonLon - sunLon) % 360) + 360) % 360
  const waxingMoon = elongation < 180

  // Local sunrise as seconds-from-midnight, derived from the sunrise Julian Day
  // (UT) already computed for the special lagnas: shift by the timezone to get
  // local JD, then take the day-fraction (+0.5 since JD days begin at noon).
  const localSunriseJD = sunriseJulianDay + input.timezone / 24
  const sunriseDayFraction = (((localSunriseJD + 0.5) % 1) + 1) % 1
  const sunriseSeconds = Math.round(sunriseDayFraction * 86400)
  // APPROX: half-day day-length assumption (sunset = sunrise + 12h).
  const sunsetSeconds = sunriseSeconds + 43200

  const relationships = computeRelationshipGeometry(
    planets,
    ascendant.signNumber,
    divisionalCharts,
    upagrahas
  )

  const shadbala = computeShadbala(
    planets,
    divisionalCharts,
    birthDateLocal,
    birthTimeSeconds,
    sunriseSeconds,
    sunsetSeconds,
    ascendant.longitude,
    ayanamsa,
    relationships.combustion // FIX-F: single combustion source
  )

  // The lagna's sub-lord is exactly the Ascendant nakshatra entry's sub-lord
  // (same longitude, same computeSubLord call) — reuse it instead of
  // recomputing, and pass the PLANETS-ONLY array so the lagna appears exactly
  // once in `subLords` (as the 'Lagna' entry this function adds itself) and
  // never inside the planet-to-planet parivartana / cluster / sympathy scans.
  const lagnaSubLord = ascendantNakshatra.subLord
  const computedNakshatra = computeNakshatraRelationships(planetNakshatras, lagnaSubLord)

  const computedJaimini = computeJaimini(
    planets,
    ascendant.signNumber,
    specialLagnas,
    sunLon,
    moonLon,
    relationships.houseLords[1] ?? {}
  )

  const bhavaBala = computeBhavaBala(
    shadbala,
    relationships,
    planets,
    ascendant.signNumber,
    waxingMoon,
    relationships.combustion // FIX-F: same single combustion source
  )

  // Step 15: Named-yoga catalogue (deterministic, no LLM) — runs after relationships
  // so it can consume houseLords/aspects/conjunctions/mutualReception/combustion as
  // the single source of truth (never re-derives them).
  const yogas = computeYogas({
    planets,
    lagnaSignNumber: ascendant.signNumber,
    houseLordsD1: relationships.houseLords[1] ?? {},
    aspects: relationships.aspects,
    conjunctions: relationships.conjunctions,
    mutualReception: relationships.mutualReception,
    combustion: relationships.combustion,
  })

  return {
    input,
    calculationProfile: profile.id,
    calculationSettings: calculationSettingsSnapshot(profile),
    sunriseMode: sunriseFallback ? 'jhora' : sunriseMode,
    sunriseFallback,
    julianDay,
    ayanamsa,
    lagna: ascendant.sign,
    lagnaSignNumber: ascendant.signNumber,
    lagnaLongitude: ascendant.longitude,
    lagnaDegreeInSign: ascendant.degreeInSign,
    planets,
    // Display/serialization array: the 9 grahas followed by the Ascendant. The
    // Ascendant is LAST so any consumer that slices/zips the first 9 against
    // `planets` is unaffected. Readers that need grahas only must filter on
    // `planet !== 'Ascendant'` (or use `planets`); readers that want the lagna
    // nakshatra should prefer the `ascendantNakshatra` field below.
    nakshatras: [...planetNakshatras, ascendantNakshatra],
    ascendantNakshatra,
    divisionalCharts,
    charaKarakas,
    ashtakavarga,
    upagrahas,
    specialLagnas,
    arudhaPadas,
    pindaStrength,
    transits,
    relationships,
    shadbala,
    computedNakshatra,
    computedJaimini,
    bhavaBala,
    yogas,
  }
}
