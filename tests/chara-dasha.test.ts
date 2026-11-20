/**
 * Chara Dasha (Parasara / PVR) — seed choice and Scorpio/Aquarius co-lords.
 *
 * The two real-chart fixtures carry only D1 signs and degrees (no names or birth
 * data). Their expected mahadasha lists were read from Jagannatha Hora:
 *
 *   - Aquarius lagna, Moon + Mercury in Cancer: the Moon sign is the seed (the
 *     Moon is in its own sign; the lagna lord and Sun-sign lord are not), so the
 *     dasha starts from Cancer, not the lagna. Aquarius takes Saturn (fixed sign)
 *     over Rahu (movable sign); Scorpio takes Ketu (aspected by Jupiter and its
 *     dispositor Venus) over Mars.
 *   - Taurus lagna: lagna and Sun share Taurus; Taurus beats the Moon sign
 *     (Pisces) because Venus has company and Jupiter does not.
 */
import { describe, it, expect } from 'vitest'
import { computeCharaDasha } from '../engine/compute/charaDasha'
import type { PlanetPosition } from '../engine/compute/types'

const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces']

/** PlanetPosition[] from { planet: [signNumber, degreeInSign] }. */
function chart(spec: Record<string, [number, number]>): PlanetPosition[] {
  return Object.entries(spec).map(([planet, [signNumber, degreeInSign]]) => ({
    planet,
    longitude: (signNumber - 1) * 30 + degreeInSign,
    latitude: 0,
    speed: 0,
    retrograde: planet === 'Rahu' || planet === 'Ketu',
    sign: SIGNS[signNumber - 1],
    signNumber,
    degreeInSign,
    house: 0,
  }))
}

const ANCHOR = new Date('2000-01-01T00:00:00Z')

/** First-cycle [sign, years] pairs. */
function firstCycle(r: ReturnType<typeof computeCharaDasha>): Array<[string, number]> {
  return r.periods.filter((p) => p.cycle === 1).map((p) => [p.sign, p.durationYears])
}

const AQUARIUS_LAGNA = chart({
  Sun: [3, 23.4984], Moon: [4, 21.5358], Mars: [9, 24.1706], Mercury: [4, 12.7554],
  Jupiter: [11, 29.1754], Venus: [5, 4.0603], Saturn: [8, 10.0318], Rahu: [1, 2.4162], Ketu: [7, 2.4162],
})

const TAURUS_LAGNA = chart({
  Sun: [2, 11.3523], Moon: [12, 17.7598], Mars: [7, 22.1147], Mercury: [1, 16.9517],
  Jupiter: [9, 18.271], Venus: [2, 5.6917], Saturn: [7, 17.8063], Rahu: [2, 12.9615], Ketu: [8, 12.9615],
})

describe('computeCharaDasha — Jagannatha Hora reference charts', () => {
  it('seeds an Aquarius-lagna chart from the Moon sign when the Moon is the strongest lord', () => {
    const r = computeCharaDasha(AQUARIUS_LAGNA, 11, ANCHOR)
    expect(r.lagnaSignNumber).toBe(11)
    expect(r.seedSignNumber).toBe(4)
    expect(r.seedReferences).toEqual(['moon'])
    expect(r.seedRule).toMatch(/own sign/)
    expect(r.ninthSignNumber).toBe(12) // Pisces, even-footed
    expect(r.direction).toBe('reverse')
    expect(firstCycle(r)).toEqual([
      ['Cancer', 12], ['Gemini', 1], ['Taurus', 3], ['Aries', 8], ['Pisces', 1], ['Aquarius', 3],
      ['Capricorn', 2], ['Sagittarius', 2], ['Scorpio', 11], ['Libra', 10], ['Virgo', 2], ['Leo', 2],
    ])
    expect(r.periods.filter((p) => p.cycle === 2).map((p) => p.durationYears)).toEqual([
      0, 11, 9, 4, 11, 9, 10, 10, 1, 2, 10, 10,
    ])
  })

  it('resolves that chart’s co-lords: Saturn for Aquarius, Ketu for Scorpio', () => {
    const r = computeCharaDasha(AQUARIUS_LAGNA, 11, ANCHOR)
    const aq = r.periods.find((p) => p.sign === 'Aquarius')!
    const sc = r.periods.find((p) => p.sign === 'Scorpio')!
    expect(aq.lord).toBe('Saturn')
    expect(aq.lordRule).toMatch(/dual > fixed > movable/)
    expect(sc.lord).toBe('Ketu')
    expect(sc.lordRule).toMatch(/Jupiter, Mercury and its dispositor/)
  })

  it('keeps a Taurus-lagna chart seeded from the lagna', () => {
    const r = computeCharaDasha(TAURUS_LAGNA, 2, ANCHOR)
    expect(r.seedSignNumber).toBe(2)
    expect(r.seedReferences).toEqual(['lagna', 'sun'])
    expect(r.seedRule).toMatch(/joined by more planets/)
    expect(r.direction).toBe('reverse')
    expect(firstCycle(r)).toEqual([
      ['Taurus', 12], ['Aries', 6], ['Pisces', 3], ['Aquarius', 9], ['Capricorn', 3], ['Sagittarius', 12],
      ['Scorpio', 11], ['Libra', 7], ['Virgo', 5], ['Leo', 3], ['Cancer', 4], ['Gemini', 10],
    ])
    const aq = r.periods.find((p) => p.sign === 'Aquarius')!
    const sc = r.periods.find((p) => p.sign === 'Scorpio')!
    expect(aq.lord).toBe('Rahu')
    expect(aq.lordRule).toMatch(/joined by more planets/)
    expect(sc.lord).toBe('Mars')
    expect(sc.lordRule).toMatch(/Ketu occupies Scorpio/)
  })

  it('orders antardashas from the seed: the progression with the seed moved last', () => {
    const r = computeCharaDasha(AQUARIUS_LAGNA, 11, ANCHOR)
    expect(r.periods[0].antardashas.map((a) => a.sign)).toEqual([
      'Gemini', 'Taurus', 'Aries', 'Pisces', 'Aquarius', 'Capricorn',
      'Sagittarius', 'Scorpio', 'Libra', 'Virgo', 'Leo', 'Cancer',
    ])
  })

  it('totals 144 years over two cycles', () => {
    for (const [planets, lagna] of [[AQUARIUS_LAGNA, 11], [TAURUS_LAGNA, 2]] as const) {
      const r = computeCharaDasha(planets, lagna, ANCHOR)
      expect(r.periods).toHaveLength(24)
      expect(r.periods.reduce((s, p) => s + p.durationYears, 0)).toBe(144)
    }
  })
})

describe('computeCharaDasha — seed tie-breaks', () => {
  it('prefers the sign whose oddity differs from the lord’s sign when two references share a lord', () => {
    // Lagna + Moon in Gemini, Sun in Virgo, Mercury in Cancer (even): Gemini (odd) wins.
    const planets = chart({
      Sun: [6, 2], Moon: [3, 10], Mercury: [4, 5], Mars: [1, 3], Jupiter: [10, 4], Venus: [5, 6],
      Saturn: [7, 8], Rahu: [12, 9], Ketu: [6, 9],
    })
    const r = computeCharaDasha(planets, 3, ANCHOR)
    expect(r.seedSignNumber).toBe(3)
    expect(r.seedRule).toMatch(/oddity/)
  })

  it('uses the lagna when Lagna, Moon and Sun share a sign', () => {
    const planets = chart({
      Sun: [5, 2], Moon: [5, 10], Mercury: [4, 5], Mars: [1, 3], Jupiter: [10, 4], Venus: [6, 6],
      Saturn: [7, 8], Rahu: [12, 9], Ketu: [6, 9],
    })
    const r = computeCharaDasha(planets, 5, ANCHOR)
    expect(r.seedSignNumber).toBe(5)
    expect(r.seedReferences).toEqual(['lagna', 'moon', 'sun'])
  })
})

describe('computeCharaDasha — Scorpio/Aquarius co-lords', () => {
  // Saturn in Pisces and Rahu in Sagittarius: both alone, both dual signs, neither
  // exalted, and no help from Jupiter/Mercury (both in Aries). Advancement decides,
  // with the node's measured backwards (30° − degree).
  const base = {
    Sun: [5, 1], Moon: [4, 1], Mars: [1, 1], Mercury: [1, 2], Jupiter: [1, 3], Venus: [2, 1],
  } as Record<string, [number, number]>

  it('falls through to advancement and reads node degrees backwards', () => {
    const saturnAhead = computeCharaDasha(chart({ ...base, Saturn: [12, 10], Rahu: [9, 25], Ketu: [3, 25] }), 1, ANCHOR)
    const aq1 = saturnAhead.periods.find((p) => p.sign === 'Aquarius')!
    expect(aq1.lord).toBe('Saturn') // 10° vs Rahu 30 − 25 = 5°
    expect(aq1.lordRule).toMatch(/more advanced/)
    expect(aq1.durationYears).toBe(11) // Aquarius counts reverse to Pisces: 12 − 1

    const rahuAhead = computeCharaDasha(chart({ ...base, Saturn: [12, 10], Rahu: [9, 5], Ketu: [3, 5] }), 1, ANCHOR)
    const aq2 = rahuAhead.periods.find((p) => p.sign === 'Aquarius')!
    expect(aq2.lord).toBe('Rahu') // 30 − 5 = 25° vs Saturn 10°
    expect(aq2.durationYears).toBe(2) // Aquarius → Sagittarius reverse: 3 − 1
  })

  it('gives 12 years when both co-lords occupy the sign', () => {
    const r = computeCharaDasha(chart({ ...base, Saturn: [11, 10], Rahu: [11, 20], Ketu: [5, 20] }), 1, ANCHOR)
    const aq = r.periods.find((p) => p.sign === 'Aquarius' && p.cycle === 1)!
    expect(aq.durationYears).toBe(12)
    expect(aq.lordRule).toMatch(/both co-lords/)
  })
})
