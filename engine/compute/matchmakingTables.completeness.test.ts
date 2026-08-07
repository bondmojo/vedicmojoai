/**
 * engine/compute/matchmakingTables.completeness.test.ts — Task 1.5
 * completeness tests (Requirement 12.3).
 *
 * These guard against hand-transcription mistakes in matchmakingTables.ts —
 * a missing nakshatra/rashi row, a gap in the 14x14 Yoni matrix, or a typo'd
 * koota maximum should fail LOUDLY here rather than silently score wrong.
 */

import { describe, it, expect } from 'vitest'
import {
  NAKSHATRA_ATTRIBUTES,
  RASHI_ATTRIBUTES,
  YONI_ANIMALS,
  YONI_MATRIX,
  KOOTA_MAXIMA,
  TOTAL_KOOTA_MAXIMA,
  VASHYA_MATRIX,
  VASHYA_GROUPS,
  GANA_MATRIX,
  taraRemainder,
  isTaraInauspicious,
  isTaraTotalOverride,
  type Gana,
} from './matchmakingTables'

// GANA_MATRIX has no exported companion list of its row/column keys the way
// VASHYA_MATRIX now has VASHYA_GROUPS — derived from the matrix's own keys
// (cast through Gana, since Object.keys always returns string[]) so a
// future-added/removed Gana can't silently escape the completeness
// assertions below the way a hand-maintained literal array could.
const GANAS = Object.keys(GANA_MATRIX) as Gana[]

describe('NAKSHATRA_ATTRIBUTES — all 27 entries present and non-empty', () => {
  it('has exactly 27 keys, numbered 1..27', () => {
    const keys = Object.keys(NAKSHATRA_ATTRIBUTES).map(Number).sort((a, b) => a - b)
    expect(keys).toEqual(Array.from({ length: 27 }, (_, i) => i + 1))
  })

  it('every entry has non-empty gana/yoniAnimal/yoniGender/nadi and a matching nakshatraNumber', () => {
    for (let n = 1; n <= 27; n++) {
      const entry = NAKSHATRA_ATTRIBUTES[n]
      expect(entry, `nakshatra ${n} missing`).toBeTruthy()
      expect(entry.nakshatraNumber).toBe(n)
      expect(entry.name.length).toBeGreaterThan(0)
      expect(['Deva', 'Manushya', 'Rakshasa']).toContain(entry.gana)
      expect(entry.yoniAnimal.length).toBeGreaterThan(0)
      expect(['M', 'F']).toContain(entry.yoniGender)
      expect(['Aadi', 'Madhya', 'Antya']).toContain(entry.nadi)
    }
  })

  it('every yoniAnimal is one of the 14 canonical Yoni animals', () => {
    for (let n = 1; n <= 27; n++) {
      expect(YONI_ANIMALS).toContain(NAKSHATRA_ATTRIBUTES[n].yoniAnimal)
    }
  })

  it('each Gana group has exactly 9 nakshatras (9x3=27, per the classical assignment)', () => {
    const counts: Record<string, number> = { Deva: 0, Manushya: 0, Rakshasa: 0 }
    for (let n = 1; n <= 27; n++) counts[NAKSHATRA_ATTRIBUTES[n].gana]++
    expect(counts).toEqual({ Deva: 9, Manushya: 9, Rakshasa: 9 })
  })

  it('each Nadi group has exactly 9 nakshatras (9x3=27, per the classical assignment)', () => {
    const counts: Record<string, number> = { Aadi: 0, Madhya: 0, Antya: 0 }
    for (let n = 1; n <= 27; n++) counts[NAKSHATRA_ATTRIBUTES[n].nadi]++
    expect(counts).toEqual({ Aadi: 9, Madhya: 9, Antya: 9 })
  })

  it('every Yoni animal is used at least once, and 27 nakshatras cannot divide evenly across 14 animals', () => {
    // 14 animals x 2 = 28 slots, but there are only 27 nakshatras — so this
    // classical table cannot give every animal exactly 2 occurrences; exactly
    // one animal is necessarily a singleton (used once, not twice). This test
    // asserts the arithmetic that must hold for ANY valid transcription
    // (all animals present, total = 27, at most one singleton) rather than a
    // specific animal being the singleton, so it stays a completeness guard
    // rather than an assertion about which cell is uncertain.
    const counts: Record<string, number> = {}
    for (const animal of YONI_ANIMALS) counts[animal] = 0
    for (let n = 1; n <= 27; n++) counts[NAKSHATRA_ATTRIBUTES[n].yoniAnimal]++

    const values = Object.values(counts)
    expect(values.reduce((a, b) => a + b, 0)).toBe(27)
    for (const animal of YONI_ANIMALS) {
      expect(counts[animal], `yoni animal ${animal} count`).toBeGreaterThanOrEqual(1)
      expect(counts[animal], `yoni animal ${animal} count`).toBeLessThanOrEqual(2)
    }
    const singletons = values.filter((v) => v === 1)
    expect(singletons.length, 'exactly one animal must be a singleton (27 = 13x2 + 1)').toBe(1)
  })
})

describe('RASHI_ATTRIBUTES — all 12 entries present and non-empty', () => {
  it('has exactly 12 keys, numbered 1..12', () => {
    const keys = Object.keys(RASHI_ATTRIBUTES).map(Number).sort((a, b) => a - b)
    expect(keys).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
  })

  it('every entry has non-empty varna/vashya and a matching rashiNumber', () => {
    for (let r = 1; r <= 12; r++) {
      const entry = RASHI_ATTRIBUTES[r]
      expect(entry, `rashi ${r} missing`).toBeTruthy()
      expect(entry.rashiNumber).toBe(r)
      expect(entry.name.length).toBeGreaterThan(0)
      expect(['Brahmin', 'Kshatriya', 'Vaishya', 'Shudra']).toContain(entry.varna)
      expect(['Manav', 'Vanachar', 'Chatushpad', 'Jalachar', 'Keet']).toContain(entry.vashya)
    }
  })

  it('each Varna group has exactly 3 rashis (3x4=12, per the classical element assignment)', () => {
    const counts: Record<string, number> = { Brahmin: 0, Kshatriya: 0, Vaishya: 0, Shudra: 0 }
    for (let r = 1; r <= 12; r++) counts[RASHI_ATTRIBUTES[r].varna]++
    expect(counts).toEqual({ Brahmin: 3, Kshatriya: 3, Vaishya: 3, Shudra: 3 })
  })
})

describe('YONI_MATRIX — all 14x14 cells covered', () => {
  it('has a row for every one of the 14 canonical Yoni animals', () => {
    expect(YONI_ANIMALS.length).toBe(14)
    for (const animal of YONI_ANIMALS) {
      expect(YONI_MATRIX[animal], `missing row for ${animal}`).toBeTruthy()
    }
  })

  it('every (row, column) cell across all 14x14=196 combinations is a defined number 0-4', () => {
    let cellCount = 0
    for (const a of YONI_ANIMALS) {
      for (const b of YONI_ANIMALS) {
        const value = YONI_MATRIX[a][b]
        expect(value, `YONI_MATRIX[${a}][${b}] missing`).toBeTypeOf('number')
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(4)
        cellCount++
      }
    }
    expect(cellCount).toBe(196)
  })

  it('is symmetric (Yoni is a non-directional koota)', () => {
    for (const a of YONI_ANIMALS) {
      for (const b of YONI_ANIMALS) {
        expect(YONI_MATRIX[a][b]).toBe(YONI_MATRIX[b][a])
      }
    }
  })

  it('every diagonal cell (same animal) is 4 (the "same" tier)', () => {
    for (const a of YONI_ANIMALS) {
      expect(YONI_MATRIX[a][a]).toBe(4)
    }
  })

  it('includes the mandatory 0-point bitter-enemy tier', () => {
    const values = new Set<number>()
    for (const a of YONI_ANIMALS) {
      for (const b of YONI_ANIMALS) values.add(YONI_MATRIX[a][b])
    }
    expect(values.has(0)).toBe(true)
  })

  it('exercises all five tiers (0, 1, 2, 3, 4) somewhere in the matrix', () => {
    const values = new Set<number>()
    for (const a of YONI_ANIMALS) {
      for (const b of YONI_ANIMALS) values.add(YONI_MATRIX[a][b])
    }
    expect([...values].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4])
  })
})

describe('VASHYA_MATRIX — all 5x5 cells covered', () => {
  it('has a row for every one of the 5 Vashya groups', () => {
    for (const group of VASHYA_GROUPS) {
      expect(VASHYA_MATRIX[group], `missing row for ${group}`).toBeTruthy()
    }
  })

  it('every (bride, groom) cell across all 5x5=25 combinations is a defined number 0-2 in 0.5 steps', () => {
    let cellCount = 0
    for (const a of VASHYA_GROUPS) {
      for (const b of VASHYA_GROUPS) {
        const value = VASHYA_MATRIX[a][b]
        expect(value, `VASHYA_MATRIX[${a}][${b}] missing`).toBeTypeOf('number')
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(2)
        expect(value * 2, `VASHYA_MATRIX[${a}][${b}] must be a 0.5 step`).toBe(Math.round(value * 2))
        cellCount++
      }
    }
    expect(cellCount).toBe(25)
  })

  it('every diagonal cell (same group) is 2 (max compatibility)', () => {
    for (const group of VASHYA_GROUPS) {
      expect(VASHYA_MATRIX[group][group]).toBe(2)
    }
  })

  it('is directional for Keet vs Chatushpad/Jalachar (task 9.3 oracle finding) — NOT symmetric', () => {
    expect(VASHYA_MATRIX.Chatushpad.Keet).toBe(2)
    expect(VASHYA_MATRIX.Keet.Chatushpad).toBe(1)
    expect(VASHYA_MATRIX.Jalachar.Keet).toBe(2)
    expect(VASHYA_MATRIX.Keet.Jalachar).toBe(1)
  })
})

describe('GANA_MATRIX — all 3x3 cells covered', () => {
  it('has a row for every one of the 3 Ganas', () => {
    for (const gana of GANAS) {
      expect(GANA_MATRIX[gana], `missing row for ${gana}`).toBeTruthy()
    }
  })

  it('every (bride, groom) cell across all 3x3=9 combinations is a defined number 0-6', () => {
    let cellCount = 0
    for (const a of GANAS) {
      for (const b of GANAS) {
        const value = GANA_MATRIX[a][b]
        expect(value, `GANA_MATRIX[${a}][${b}] missing`).toBeTypeOf('number')
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(6)
        cellCount++
      }
    }
    expect(cellCount).toBe(9)
  })

  it('every diagonal cell (same Gana) is 6 (max compatibility)', () => {
    for (const gana of GANAS) {
      expect(GANA_MATRIX[gana][gana]).toBe(6)
    }
  })

  it('is directional for Deva<->Manushya and Rakshasa<->Deva (task 9.3 oracle-settled cells) — NOT symmetric', () => {
    expect(GANA_MATRIX.Deva.Manushya).toBe(6)
    expect(GANA_MATRIX.Manushya.Deva).toBe(5)
    expect(GANA_MATRIX.Rakshasa.Deva).toBe(1)
    expect(GANA_MATRIX.Deva.Rakshasa).toBe(0)
  })
})

describe('KOOTA_MAXIMA — sums to exactly 36 (JHora/classical convention), Varna capped at 1', () => {
  it('the eight maxima are 1,2,3,4,5,6,7,8 in koota order', () => {
    expect(KOOTA_MAXIMA).toEqual({
      varna: 1,
      vashya: 2,
      tara: 3,
      yoni: 4,
      grahaMaitri: 5,
      gana: 6,
      bhakoot: 7,
      nadi: 8,
    })
  })

  it('sum to exactly 36, matching TOTAL_KOOTA_MAXIMA', () => {
    const sum = Object.values(KOOTA_MAXIMA).reduce((a, b) => a + b, 0)
    expect(sum).toBe(36)
    expect(sum).toBe(TOTAL_KOOTA_MAXIMA)
  })

  it('Varna is capped at 1, not the classically-cited 3 (the eight maxima only sum to 36 this way)', () => {
    expect(KOOTA_MAXIMA.varna).toBe(1)
  })
})

describe('Tara — a documented fact, not a table value: no pair can ever score above 1.5 of its declared 3', () => {
  // KOOTA_MAXIMA.tara stays the classical 3 (JHora shows a fixed "X / 36"
  // regardless of per-koota reachability, and this engine matches that
  // display convention — see KOOTA_MAXIMA's doc comment). This test instead
  // locks in the underlying mathematical fact directly against the
  // low-level primitives: for any two nakshatras, at most one direction's
  // remainder can ever be a plain-auspicious one.
  it('for every one of the 27x27 directed nakshatra pairs, at most one direction is ever plain-auspicious', () => {
    let bothAuspiciousCount = 0
    for (let a = 1; a <= 27; a++) {
      for (let b = 1; b <= 27; b++) {
        const ab = taraRemainder(a, b)
        const ba = taraRemainder(b, a)
        const abAuspicious = !isTaraTotalOverride(ab) && !isTaraInauspicious(ab)
        const baAuspicious = !isTaraTotalOverride(ba) && !isTaraInauspicious(ba)
        if (abAuspicious && baAuspicious) bothAuspiciousCount++
      }
    }
    expect(bothAuspiciousCount).toBe(0)
  })
})
