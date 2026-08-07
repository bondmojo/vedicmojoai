/**
 * engine/compute/matchmaking.test.ts — Task 4.4 tests for the Mangal Dosha +
 * composition additions to matchmaking.ts (`computeMangalDosha`,
 * `detectMangalCancellation`, `computeMatch`).
 *
 * Task 3's Ashtakoota scorers already have their own dedicated coverage
 * elsewhere per the plan (task 7); this file only covers what task 4.4
 * itself asks for: determinism, Mangal/koota degradation, and Mangal
 * detection across all three reference points plus a cancellation case.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  computeMatch,
  computeMangalDosha,
  detectMangalCancellation,
  computeAshtakootaMatch,
  type MatchNativeInput,
  type MangalNativeInput,
  type MatchNative,
} from './matchmaking'
import * as matchmakingTables from './matchmakingTables'
import type { PlanetPosition, AspectEdge } from './types'

// ─── Fixture helpers ─────────────────────────────────────────────────────

function koota(role: 'bride' | 'groom', nakshatraNumber: number, padaNumber: number): MatchNativeInput {
  return { role, nakshatraNumber, padaNumber }
}

function planet(name: string, signNumber: number): PlanetPosition {
  return {
    planet: name,
    longitude: (signNumber - 1) * 30 + 15,
    latitude: 0,
    speed: name === 'Mars' ? 0.5 : 1,
    retrograde: false,
    sign: `Sign${signNumber}`,
    signNumber,
    degreeInSign: 15,
    house: signNumber,
  }
}

function mangalInput(
  opts: { lagnaSignNumber: number; moonSignNumber?: number; venusSignNumber?: number; marsSignNumber: number; aspects?: AspectEdge[] }
): MangalNativeInput {
  const planets: PlanetPosition[] = [planet('Mars', opts.marsSignNumber)]
  if (opts.moonSignNumber !== undefined) planets.push(planet('Moon', opts.moonSignNumber))
  if (opts.venusSignNumber !== undefined) planets.push(planet('Venus', opts.venusSignNumber))
  return { planets, lagnaSignNumber: opts.lagnaSignNumber, aspects: opts.aspects ?? [] }
}

// Hand-verified house-from-sign arithmetic (houseFromSign(ref, target) =
// ((target - ref + 12) % 12) + 1) for each fixture below — see the report's
// uncertainty list for how these were picked.

/** Mars triggers ONLY from lagna (house 7 from lagna=1); Moon/Venus give safe (non-trigger) houses. */
const TRIGGERS_FROM_LAGNA_ONLY = mangalInput({ lagnaSignNumber: 1, moonSignNumber: 2, venusSignNumber: 3, marsSignNumber: 7 })
/** Mars triggers ONLY from Moon (house 7 from moon=12); lagna/Venus give safe houses. */
const TRIGGERS_FROM_MOON_ONLY = mangalInput({ lagnaSignNumber: 1, moonSignNumber: 12, venusSignNumber: 8, marsSignNumber: 6 })
/** Mars triggers ONLY from Venus (house 4 from venus=5); lagna/Moon give safe houses. */
const TRIGGERS_FROM_VENUS_ONLY = mangalInput({ lagnaSignNumber: 6, moonSignNumber: 10, venusSignNumber: 5, marsSignNumber: 8 })
/** Mars triggers from lagna (house 7) AND sits in its own sign (Aries, 1) — own-sign Bhanga should fire. */
const TRIGGERS_WITH_OWN_SIGN_CANCELLATION = mangalInput({ lagnaSignNumber: 7, moonSignNumber: 3, venusSignNumber: 4, marsSignNumber: 1 })
/** No reference point triggers (all safe houses): lagna=1->6, moon=2->5, venus=9->10 from Mars=6. */
const NOT_MANGLIK = mangalInput({ lagnaSignNumber: 1, moonSignNumber: 2, venusSignNumber: 9, marsSignNumber: 6 })

const VALID_BRIDE_KOOTA = koota('bride', 1, 1)
const VALID_GROOM_KOOTA = koota('groom', 14, 2)

// ─── Determinism (Requirement 1.2 / 1.5, task 4.4) ───────────────────────

describe('computeMatch — determinism', () => {
  it('identical (bride, groom) input twice produces deep-equal output', () => {
    const bride: MatchNative = { koota: koota('bride', 5, 3), mangal: TRIGGERS_FROM_LAGNA_ONLY }
    const groom: MatchNative = { koota: koota('groom', 20, 1), mangal: NOT_MANGLIK }

    const first = computeMatch(bride, groom)
    const second = computeMatch(
      { koota: { ...bride.koota }, mangal: { ...bride.mangal!, planets: [...bride.mangal!.planets] } },
      { koota: { ...groom.koota }, mangal: { ...groom.mangal!, planets: [...groom.mangal!.planets] } }
    )

    expect(second).toEqual(first)
  })
})

// ─── Degradation: Mangal input absent (Requirement 1.5) ──────────────────

describe('computeMatch — degradation when mangal input is absent from one native', () => {
  it('reports mangalDoshaCompatibility "unavailable" (never "matched") and still scores all 8 kootas', () => {
    const bride: MatchNative = { koota: VALID_BRIDE_KOOTA, mangal: TRIGGERS_FROM_LAGNA_ONLY }
    const groom: MatchNative = { koota: VALID_GROOM_KOOTA } // no `mangal` — e.g. a paste-source chart

    const result = computeMatch(bride, groom)

    expect(result.mangalDosha.compatibility).toBe('unavailable')
    expect(result.mangalDosha.groom.status).toBe('unavailable')
    expect(result.mangalDosha.bride.status).toBe('manglik') // bride's own data is still fully computed
    expect(result.ashtakoota.kootas).toHaveLength(8)
    expect(result.ashtakoota.kootas.every((k) => k.status === 'scored')).toBe(true)
    expect(result.ashtakoota.verdict).not.toBe('incomplete')
  })

  it('reports "unavailable" when BOTH natives lack mangal input, still scoring all 8 kootas', () => {
    const result = computeMatch({ koota: VALID_BRIDE_KOOTA }, { koota: VALID_GROOM_KOOTA })
    expect(result.mangalDosha.compatibility).toBe('unavailable')
    expect(result.mangalDosha.bride.status).toBe('unavailable')
    expect(result.mangalDosha.groom.status).toBe('unavailable')
    expect(result.ashtakoota.kootas.every((k) => k.status === 'scored')).toBe(true)
  })

  it('computeMangalDosha itself degrades to unavailable, never throwing, on null/malformed input', () => {
    expect(computeMangalDosha(null).status).toBe('unavailable')
    expect(computeMangalDosha(undefined).status).toBe('unavailable')
    expect(computeMangalDosha({ planets: [], lagnaSignNumber: 1, aspects: [] }).status).toBe('unavailable') // no Mars
    expect(
      computeMangalDosha({ planets: 'not-an-array' as unknown as PlanetPosition[], lagnaSignNumber: 1, aspects: [] }).status
    ).toBe('unavailable')
  })
})

// ─── Degradation: one koota's required attribute missing (Requirement 1.2) ─
//
// Every one of the 8 koota scorers shares the same (nakshatraNumber,
// padaNumber) validation gate (`validateNative`) and, past that gate, reads
// from tables the 1.5 completeness suite already proves are complete for
// every in-range value — so no legitimately-typed input can make exactly
// ONE of the 8 kootas unavailable while the rest score inside a single
// `computeAshtakootaMatch` call; corrupting nakshatra/pada corrupts all 8
// uniformly (see report). What CAN be demonstrated directly, and is what
// this test targets, is the specific contract task 3.10 documents: the
// per-scorer try/catch guard inside computeAshtakootaMatch contains one
// koota's unexpected failure (here, a table lookup throwing) without
// affecting the other 7 or throwing out of the composed call.

describe('computeAshtakootaMatch — one koota fails, the other 7 still score (no throw)', () => {
  it('contains an unexpected error from a single koota (yoniPoints throwing) via the per-scorer guard', () => {
    const spy = vi.spyOn(matchmakingTables, 'yoniPoints').mockImplementation(() => {
      throw new Error('simulated unexpected table failure')
    })
    try {
      expect(() => computeAshtakootaMatch(VALID_BRIDE_KOOTA, VALID_GROOM_KOOTA)).not.toThrow()
      const result = computeAshtakootaMatch(VALID_BRIDE_KOOTA, VALID_GROOM_KOOTA)
      const yoni = result.kootas.find((k) => k.key === 'yoni')!
      expect(yoni.status).toBe('unavailable')
      const others = result.kootas.filter((k) => k.key !== 'yoni')
      expect(others).toHaveLength(7)
      expect(others.every((k) => k.status === 'scored')).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it('a koota scorer given malformed input alone reports unavailable, independent of any other koota', () => {
    // scoreYoni-equivalent path: computeAshtakootaMatch with an out-of-range
    // pada on one native makes every koota unavailable together (the shared
    // gate) — recorded here as the actual, uniform degrade behavior, distinct
    // from the per-scorer-throw guard tested above.
    const malformedBride: MatchNativeInput = { role: 'bride', nakshatraNumber: 1, padaNumber: 0 }
    const result = computeAshtakootaMatch(malformedBride, VALID_GROOM_KOOTA)
    expect(result.kootas).toHaveLength(8)
    expect(result.kootas.every((k) => k.status === 'unavailable')).toBe(true)
    expect(result.verdict).toBe('incomplete')
  })
})

// ─── Mangal detection across all three reference points ──────────────────

describe('computeMangalDosha — detection from each reference point independently', () => {
  it('triggers from lagna only', () => {
    const result = computeMangalDosha(TRIGGERS_FROM_LAGNA_ONLY)
    expect(result.status).toBe('manglik')
    expect(result.triggeredFrom).toEqual(['lagna'])
    expect(result.marsHouseFrom.lagna).toBe(7)
    expect([1, 2, 4, 7, 8, 12]).not.toContain(result.marsHouseFrom.moon)
    expect([1, 2, 4, 7, 8, 12]).not.toContain(result.marsHouseFrom.venus)
  })

  it('triggers from Moon only', () => {
    const result = computeMangalDosha(TRIGGERS_FROM_MOON_ONLY)
    expect(result.status).toBe('manglik')
    expect(result.triggeredFrom).toEqual(['moon'])
    expect(result.marsHouseFrom.moon).toBe(7)
  })

  it('triggers from Venus only', () => {
    const result = computeMangalDosha(TRIGGERS_FROM_VENUS_ONLY)
    expect(result.status).toBe('manglik')
    expect(result.triggeredFrom).toEqual(['venus'])
    expect(result.marsHouseFrom.venus).toBe(4)
  })

  it('reports not_manglik when no reference point triggers', () => {
    const result = computeMangalDosha(NOT_MANGLIK)
    expect(result.status).toBe('not_manglik')
    expect(result.triggeredFrom).toEqual([])
    expect(result.cancellations).toEqual([])
  })

  it('degrades a single missing reference point (Moon absent from planets) without failing the others', () => {
    const input = mangalInput({ lagnaSignNumber: 1, venusSignNumber: 3, marsSignNumber: 7 }) // no Moon
    const result = computeMangalDosha(input)
    expect(result.marsHouseFrom.moon).toBeNull()
    expect(result.status).toBe('manglik') // lagna still triggers
    expect(result.triggeredFrom).toContain('lagna')
  })

  it('reports "unavailable" — never a confident "not_manglik" — when ALL THREE reference points fail to resolve', () => {
    // lagnaSignNumber is out of range (invalid) AND Moon/Venus are both
    // absent from `planets` — there is no reference point left standing to
    // determine anything from, so this must NOT fall through to the
    // no-trigger "not_manglik" branch (a confident all-clear built on zero
    // data).
    const input: MangalNativeInput = { planets: [planet('Mars', 7)], lagnaSignNumber: 0, aspects: [] }
    const result = computeMangalDosha(input)
    expect(result.marsHouseFrom).toEqual({ lagna: null, moon: null, venus: null })
    expect(result.status).toBe('unavailable')
    expect(result.status).not.toBe('not_manglik')
    expect(result.triggeredFrom).toEqual([])
  })
})

// ─── Cancellation (Requirement 4.1/4.2) ───────────────────────────────────

describe('computeMangalDosha / detectMangalCancellation — Bhanga', () => {
  it('records an own-sign cancellation when Mars triggers Mangal Dosha but sits in Aries/Scorpio', () => {
    const result = computeMangalDosha(TRIGGERS_WITH_OWN_SIGN_CANCELLATION)
    expect(result.status).toBe('manglik') // status is the RAW determination — never flipped by a cancellation
    expect(result.cancellations).toHaveLength(1)
    expect(result.cancellations[0].rule).toBe('mangal.own_sign')
  })

  it('records an exaltation cancellation when Mars sits in Capricorn (sign 10)', () => {
    const cancellations = detectMangalCancellation(planet('Mars', 10), [])
    expect(cancellations).toHaveLength(1)
    expect(cancellations[0].rule).toBe('mangal.exalted_sign')
  })

  it('records a benefic-aspect cancellation when a natural benefic aspects Mars', () => {
    const jupiterAspectsMars: AspectEdge = {
      from: 'Jupiter',
      fromHouse: 3,
      toHouse: 7,
      toSign: 9,
      toPlanets: ['Mars'],
      toUpagrahas: [],
      type: '5th',
      strength: 60,
      school: 'parashari',
    }
    const cancellations = detectMangalCancellation(planet('Mars', 7), [jupiterAspectsMars])
    expect(cancellations.some((c) => c.rule === 'mangal.benefic_aspect')).toBe(true)
  })

  it('records no cancellation when Mars is neither own/exalted nor benefic-aspected', () => {
    const cancellations = detectMangalCancellation(planet('Mars', 7), [])
    expect(cancellations).toEqual([])
  })

  it('never throws on a null/undefined Mars position', () => {
    expect(detectMangalCancellation(null, [])).toEqual([])
    expect(detectMangalCancellation(undefined, undefined)).toEqual([])
  })
})

// ─── mangalDoshaCompatibility derivation (Requirement 3.3) ────────────────

describe('computeMatch — mangalDoshaCompatibility derivation', () => {
  it('"matched" when both natives are manglik (matching dosha in partner)', () => {
    const result = computeMatch(
      { koota: VALID_BRIDE_KOOTA, mangal: TRIGGERS_FROM_LAGNA_ONLY },
      { koota: VALID_GROOM_KOOTA, mangal: TRIGGERS_FROM_MOON_ONLY }
    )
    expect(result.mangalDosha.bride.status).toBe('manglik')
    expect(result.mangalDosha.groom.status).toBe('manglik')
    expect(result.mangalDosha.compatibility).toBe('matched')
  })

  it('"matched" when neither native is manglik', () => {
    const result = computeMatch(
      { koota: VALID_BRIDE_KOOTA, mangal: NOT_MANGLIK },
      { koota: VALID_GROOM_KOOTA, mangal: NOT_MANGLIK }
    )
    expect(result.mangalDosha.compatibility).toBe('matched')
  })

  it('"mismatched" when only one native is manglik and uncancelled', () => {
    const result = computeMatch(
      { koota: VALID_BRIDE_KOOTA, mangal: TRIGGERS_FROM_LAGNA_ONLY },
      { koota: VALID_GROOM_KOOTA, mangal: NOT_MANGLIK }
    )
    expect(result.mangalDosha.compatibility).toBe('mismatched')
  })

  it('"cancelled" when a per-native Bhanga fired, even if that leaves both effectively non-manglik', () => {
    const result = computeMatch(
      { koota: VALID_BRIDE_KOOTA, mangal: TRIGGERS_WITH_OWN_SIGN_CANCELLATION },
      { koota: VALID_GROOM_KOOTA, mangal: NOT_MANGLIK }
    )
    expect(result.mangalDosha.bride.cancellations.length).toBeGreaterThan(0)
    expect(result.mangalDosha.compatibility).toBe('cancelled')
  })

  // REGRESSION GUARD (added in review). Requirement 3.3 compares
  // POST-cancellation status, so a fired Bhanga is not a higher-precedence
  // outcome that short-circuits the comparison. A bride who is
  // Manglik-but-cancelled paired with a groom who is Manglik-and-uncancelled
  // is, post-cancellation, non-Manglik against Manglik — a real 'mismatched'.
  // An earlier draft evaluated 'cancelled' first and reported this pair as
  // 'cancelled', attaching the most reassuring word in the enum to one of the
  // riskiest configurations. Do not let that come back.
  it('"mismatched" when one native is manglik-but-cancelled and the other is manglik-and-uncancelled', () => {
    const result = computeMatch(
      { koota: VALID_BRIDE_KOOTA, mangal: TRIGGERS_WITH_OWN_SIGN_CANCELLATION },
      { koota: VALID_GROOM_KOOTA, mangal: TRIGGERS_FROM_LAGNA_ONLY }
    )
    expect(result.mangalDosha.bride.status).toBe('manglik')
    expect(result.mangalDosha.bride.cancellations.length).toBeGreaterThan(0)
    expect(result.mangalDosha.groom.status).toBe('manglik')
    expect(result.mangalDosha.groom.cancellations).toEqual([])
    expect(result.mangalDosha.compatibility).toBe('mismatched')
  })

  // REGRESSION GUARD (added in review). When the pairing is malformed the 8
  // kootas all report `unavailable`, so Mangal Dosha must refuse to guess too
  // rather than falling back to argument position — otherwise a pair the
  // engine just declared unscorable still emits an affirmative 'matched',
  // the "unestablished result as an all-clear" failure mode design.md names
  // as the worst one available here.
  it('reports "unavailable" — never "matched" — when the pairing carries two of the same role', () => {
    const result = computeMatch(
      { koota: koota('bride', 1, 1), mangal: NOT_MANGLIK },
      { koota: koota('bride', 14, 2), mangal: NOT_MANGLIK }
    )
    expect(result.ashtakoota.verdict).toBe('incomplete')
    expect(result.ashtakoota.kootas.every((k) => k.status === 'unavailable')).toBe(true)
    expect(result.mangalDosha.bride.status).toBe('unavailable')
    expect(result.mangalDosha.groom.status).toBe('unavailable')
    expect(result.mangalDosha.compatibility).toBe('unavailable')
  })
})

// ─── Role-awareness (structural, mirrors task 3's contract for computeMatch) ─

describe('computeMatch — role resolution is structural, not positional', () => {
  it('computeMatch(x, y) and computeMatch(y, x) are identical when roles are left alone', () => {
    const bride: MatchNative = { koota: koota('bride', 5, 3), mangal: TRIGGERS_FROM_LAGNA_ONLY }
    const groom: MatchNative = { koota: koota('groom', 20, 1), mangal: TRIGGERS_FROM_MOON_ONLY }

    const a = computeMatch(bride, groom)
    const b = computeMatch(groom, bride) // swapped argument order, roles untouched

    expect(b).toEqual(a)
  })
})

// ─── Task 7.5 — Mangal Dosha tests ────────────────────────────────────────
//
// Requirements 10.2, 3.1, 3.2, 3.3. Every fixture in this file (and this
// section) is synthetic — built entirely from `planet()`/`mangalInput()`
// hand-picked sign numbers, never real birth/client data (Requirement
// 10.3b). No "Mojo"-style named chart fixture was needed since the
// synthetic per-reference-point fixtures above already isolate each
// condition precisely; nothing under `engine/compute/__fixtures__/` was
// added because none of these assertions need a full natal chart, only
// Mars/lagna/Moon/Venus signs and an optional aspect list.

describe('Task 7.5 — Mangal Dosha: all three reference points independently trigger detection', () => {
  it('lagna, Moon, and Venus each independently trigger `manglik` with the OTHER two reference points safe', () => {
    const lagnaOnly = computeMangalDosha(TRIGGERS_FROM_LAGNA_ONLY)
    const moonOnly = computeMangalDosha(TRIGGERS_FROM_MOON_ONLY)
    const venusOnly = computeMangalDosha(TRIGGERS_FROM_VENUS_ONLY)

    expect(lagnaOnly.status).toBe('manglik')
    expect(lagnaOnly.triggeredFrom).toEqual(['lagna'])

    expect(moonOnly.status).toBe('manglik')
    expect(moonOnly.triggeredFrom).toEqual(['moon'])

    expect(venusOnly.status).toBe('manglik')
    expect(venusOnly.triggeredFrom).toEqual(['venus'])
  })
})

describe('Task 7.5 — Mangal Dosha: each documented Requirement 4 cancellation condition fires and is asserted by rule', () => {
  it('own-sign cancellation (Mars in Aries/Scorpio) fires with rule "mangal.own_sign"', () => {
    const result = computeMangalDosha(TRIGGERS_WITH_OWN_SIGN_CANCELLATION)
    expect(result.status).toBe('manglik')
    expect(result.cancellations.map((c) => c.rule)).toContain('mangal.own_sign')
  })

  it('exalted-sign cancellation (Mars in Capricorn) fires with rule "mangal.exalted_sign"', () => {
    // Mars triggers from lagna (house 7 from lagna=Cancer=4) while sitting in
    // its exaltation sign (Capricorn=10) — exercised through the full
    // computeMangalDosha pipeline, not detectMangalCancellation in isolation.
    const exaltedTrigger = mangalInput({ lagnaSignNumber: 4, moonSignNumber: 1, venusSignNumber: 2, marsSignNumber: 10 })
    const result = computeMangalDosha(exaltedTrigger)
    expect(result.status).toBe('manglik')
    expect(result.cancellations.map((c) => c.rule)).toContain('mangal.exalted_sign')
  })

  it('benefic-aspect cancellation (a natural benefic aspects Mars) fires with rule "mangal.benefic_aspect"', () => {
    const jupiterAspectsMars: AspectEdge = {
      from: 'Jupiter',
      fromHouse: 3,
      toHouse: 7,
      toSign: 9,
      toPlanets: ['Mars'],
      toUpagrahas: [],
      type: '5th',
      strength: 60,
      school: 'parashari',
    }
    const triggerWithBeneficAspect = mangalInput({
      lagnaSignNumber: 1,
      moonSignNumber: 2,
      venusSignNumber: 3,
      marsSignNumber: 7,
      aspects: [jupiterAspectsMars],
    })
    const result = computeMangalDosha(triggerWithBeneficAspect)
    expect(result.status).toBe('manglik')
    expect(result.cancellations.map((c) => c.rule)).toContain('mangal.benefic_aspect')
  })

  it('"matching dosha in partner" (marriage.md\'s third cancellation condition) surfaces as compatibility "matched" when both natives are manglik', () => {
    // This condition is inherently pairwise (see detectMangalCancellation's
    // header comment) so it is NOT recorded as a per-native `Cancellation` —
    // it surfaces as the pairwise `compatibility` verdict instead.
    const result = computeMatch(
      { koota: VALID_BRIDE_KOOTA, mangal: TRIGGERS_FROM_LAGNA_ONLY },
      { koota: VALID_GROOM_KOOTA, mangal: TRIGGERS_FROM_MOON_ONLY }
    )
    expect(result.mangalDosha.bride.status).toBe('manglik')
    expect(result.mangalDosha.groom.status).toBe('manglik')
    expect(result.mangalDosha.compatibility).toBe('matched')
  })
})

describe('Task 7.5 — Mangal Dosha: compatibility is "unavailable", never "matched", when planets is absent for either native', () => {
  it('reports "unavailable" when the BRIDE lacks planets (paste-source chart)', () => {
    const result = computeMatch({ koota: VALID_BRIDE_KOOTA }, { koota: VALID_GROOM_KOOTA, mangal: NOT_MANGLIK })
    expect(result.mangalDosha.bride.status).toBe('unavailable')
    expect(result.mangalDosha.compatibility).toBe('unavailable')
    expect(result.mangalDosha.compatibility).not.toBe('matched')
  })

  it('reports "unavailable" when the GROOM lacks planets (paste-source chart)', () => {
    const result = computeMatch({ koota: VALID_BRIDE_KOOTA, mangal: NOT_MANGLIK }, { koota: VALID_GROOM_KOOTA })
    expect(result.mangalDosha.groom.status).toBe('unavailable')
    expect(result.mangalDosha.compatibility).toBe('unavailable')
    expect(result.mangalDosha.compatibility).not.toBe('matched')
  })

  it('reports "unavailable" — never "matched" — even when the other native would otherwise be not_manglik (no false all-clear)', () => {
    // NOT_MANGLIK alone might read as reassuring; the missing side must still
    // dominate to 'unavailable', never let a present-but-clean native imply
    // an all-clear for the pair.
    const result = computeMatch({ koota: VALID_BRIDE_KOOTA, mangal: NOT_MANGLIK }, { koota: VALID_GROOM_KOOTA })
    expect(result.mangalDosha.bride.status).toBe('not_manglik')
    expect(result.mangalDosha.groom.status).toBe('unavailable')
    expect(result.mangalDosha.compatibility).toBe('unavailable')
  })
})
