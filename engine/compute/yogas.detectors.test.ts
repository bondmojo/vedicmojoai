/**
 * engine/compute/yogas.detectors.test.ts — Focused detector unit tests with
 * hand-built geometry (no ephemeris). Guards the two correctness fixes found in
 * the F1 semantic review plus a couple of core invariants.
 */

import { describe, it, expect } from 'vitest'
import { computeYogas } from './yogas'
import type { YogaInput } from './yogas'
import type { PlanetPosition } from './types'

/** Minimal PlanetPosition builder — only the fields the detectors read matter. */
function mkPlanet(planet: string, signNumber: number, house: number, degreeInSign = 15): PlanetPosition {
  return {
    planet,
    longitude: (signNumber - 1) * 30 + degreeInSign,
    latitude: 0,
    speed: 1,
    retrograde: false,
    sign: '',
    signNumber,
    degreeInSign,
    house,
  }
}

function baseInput(planets: PlanetPosition[], lagnaSignNumber: number, houseLordsD1: Record<number, string> = {}): YogaInput {
  return {
    planets,
    lagnaSignNumber,
    houseLordsD1,
    aspects: [],
    conjunctions: [],
    mutualReception: [],
    combustion: [],
  }
}

describe('detectPanchaMahapurusha — moolatrikona own-sign (review fix)', () => {
  it('fires Hamsa for Jupiter in its own/moolatrikona sign Sagittarius in a kendra', () => {
    // Sagittarius lagna → Jupiter in Sagittarius is house 1 (a kendra).
    // getVargaDignityLabel resolves Sagittarius (Jupiter's moolatrikona) to
    // 'moolatrikona' — which previously slipped through the exalted/own-only gate.
    const planets = [mkPlanet('Jupiter', 9, 1)]
    const yogas = computeYogas(baseInput(planets, 9))
    const hamsa = yogas.find((y) => y.key === 'mahapurusha.hamsa')
    expect(hamsa).toBeTruthy()
    expect(hamsa?.planets).toEqual(['Jupiter'])
    expect(hamsa?.evidence.dignity?.Jupiter).toBe('moolatrikona')
  })

  it('fires Sasa for Saturn in own/moolatrikona Aquarius in a kendra', () => {
    // Taurus lagna (2) → Aquarius (11) is house 10, a kendra.
    const planets = [mkPlanet('Saturn', 11, 10)]
    const yogas = computeYogas(baseInput(planets, 2))
    expect(yogas.some((y) => y.key === 'mahapurusha.sasa')).toBe(true)
  })

  it('still fires exalted (strong) and does NOT fire outside a kendra', () => {
    // Exalted Saturn (Libra, 7) in house 1 for Libra lagna (7) → kendra, strong.
    const strong = computeYogas(baseInput([mkPlanet('Saturn', 7, 1)], 7))
    const sasa = strong.find((y) => y.key === 'mahapurusha.sasa')
    expect(sasa?.strength).toBe('strong')
    // Same exalted Saturn but in house 3 (not a kendra) → no Mahapurusha.
    const notKendra = computeYogas(baseInput([mkPlanet('Saturn', 7, 3)], 5))
    expect(notKendra.some((y) => y.category === 'mahapurusha')).toBe(false)
  })
})

describe('detectKartari — requires hemming on BOTH sides (review fix)', () => {
  it('does NOT emit Papa Kartari for a lone malefic in the 2nd (empty 12th)', () => {
    // Aries lagna. Saturn alone in house 2, nothing in house 12.
    const planets = [mkPlanet('Saturn', 2, 2)]
    const yogas = computeYogas(baseInput(planets, 1))
    expect(yogas.some((y) => y.category === 'kartari')).toBe(false)
  })

  it('emits Papa Kartari when malefics hem the lagna from BOTH the 2nd and 12th', () => {
    // Aries lagna: Saturn in H2, Mars in H12 → both malefic, both sides occupied.
    const planets = [mkPlanet('Saturn', 2, 2), mkPlanet('Mars', 12, 12)]
    const yogas = computeYogas(baseInput(planets, 1))
    const papa = yogas.find((y) => y.key === 'kartari.papa')
    expect(papa).toBeTruthy()
    expect(papa?.benefic).toBe(false)
    expect(papa?.planets.sort()).toEqual(['Mars', 'Saturn'])
  })

  it('emits Shubha Kartari when benefics hem the lagna from both sides', () => {
    // Aries lagna: Jupiter in H2, Venus in H12 → both benefic.
    const planets = [mkPlanet('Jupiter', 2, 2), mkPlanet('Venus', 12, 12)]
    const yogas = computeYogas(baseInput(planets, 1))
    expect(yogas.some((y) => y.key === 'kartari.shubha')).toBe(true)
  })
})

describe('lunar yogas exclude nodes as forming planets (review fix)', () => {
  it('does not form Sunapha from Rahu alone in the 2nd from Moon', () => {
    // Moon in house 1; Rahu in house 2 (2nd from Moon); nothing else near Moon.
    const planets = [mkPlanet('Moon', 1, 1), mkPlanet('Rahu', 2, 2)]
    const yogas = computeYogas(baseInput(planets, 1))
    expect(yogas.some((y) => y.key === 'lunar.sunapha')).toBe(false)
  })

  it('forms Sunapha from a tara graha in the 2nd from Moon', () => {
    const planets = [mkPlanet('Moon', 1, 1), mkPlanet('Mercury', 2, 2)]
    const yogas = computeYogas(baseInput(planets, 1))
    expect(yogas.some((y) => y.key === 'lunar.sunapha')).toBe(true)
  })
})

describe('purity / determinism / degradation', () => {
  it('never throws and returns [] when planets are missing', () => {
    expect(computeYogas(baseInput([], 1))).toEqual([])
  })

  it('is deterministic and stably sorted for identical input', () => {
    const planets = [mkPlanet('Jupiter', 9, 1), mkPlanet('Moon', 1, 5), mkPlanet('Saturn', 11, 3)]
    const a = computeYogas(baseInput(planets, 9))
    const b = computeYogas(baseInput(planets, 9))
    expect(b).toEqual(a)
    const keys = a.map((y) => `${y.category}/${y.key}`)
    expect([...keys].sort()).toEqual(keys)
  })

  it('lord-based detectors are skipped (no throw) when houseLordsD1 is empty', () => {
    const planets = [mkPlanet('Jupiter', 9, 1)]
    const yogas = computeYogas(baseInput(planets, 9, {}))
    expect(yogas.some((y) => y.category === 'raja' || y.category === 'dhana' || y.category === 'viparita')).toBe(false)
  })
})
