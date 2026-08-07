/**
 * engine/compute/matchmaking.invariants.test.ts — Task 7.1–7.4 of
 * .kiro/specs/marriage-matchmaking/tasks.md.
 *
 * `matchmakingTables.ts` is stamped `matchmaking-tables-v1.1-nadi-bhanga-fix`
 * (see MATCHMAKING_TABLES_VERSION) — task 9's PyJHora oracle sweep has run
 * and the per-koota values below reflect its findings (see
 * `docs/computation_matchmaking.md` for the full provenance writeup and its
 * KNOWN DIVERGENCE table — two cases deliberately not adopted (Varna,
 * Bhakoot), one unresolved (Vashya Sagittarius/Capricorn), one found-and-
 * fixed in code review (Nadi Bhanga's identical-nakshatra guard, tested
 * below)). This file asserts INTERNAL INVARIANTS (range, half-point steps,
 * sum consistency, role-structural symmetry) plus per-koota regression
 * values now that they are oracle-settled. The bottom of 7.1 runs the
 * committed, hand-curated oracle sample from task 9.2
 * (`./__fixtures__/ashtakootaOracleSample.ts`) — see that file's header for
 * how it was selected and cross-verified.
 */

import { describe, it, expect, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { NextRequest } from 'next/server'
import {
  computeAshtakootaMatch,
  computeMatch,
  longitudeToNakshatraPadaRashi,
  deriveVerdict,
  type MatchNativeInput,
} from './matchmaking'
import { KOOTA_MAXIMA, TOTAL_KOOTA_MAXIMA } from './matchmakingTables'
import { ASHTAKOOTA_ORACLE_SAMPLE } from './__fixtures__/ashtakootaOracleSample'
import type { KootaKey, AshtakootaResult } from './types'

// Only needed for the route-level assertion in 7.4's last test (a real
// POST /api/matchmaking call with a mocked prisma/auth) — every other
// describe block in this file is pure engine-level and never touches these.
vi.mock('@/lib/auth', () => ({
  resolveRequestUser: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    unifiedChart: { findUnique: vi.fn() },
    compatibilityMatch: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  },
}))

import { resolveRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { POST } from '../../app/api/matchmaking/route'

// ─── Shared fixture helper ──────────────────────────────────────────────

function koota(role: 'bride' | 'groom', nakshatraNumber: number, padaNumber: number): MatchNativeInput {
  return { role, nakshatraNumber, padaNumber }
}

// ═══════════════════════════════════════════════════════════════════════
// 7.1 — Exhaustive koota sweep: internal invariants only (no oracle yet)
// ═══════════════════════════════════════════════════════════════════════

describe('computeAshtakootaMatch — exhaustive 27x4 x 27x4 invariant sweep (7.1)', () => {
  it('never throws; every koota scores in-range half-point increments that sum exactly to gunaScore <= TOTAL_KOOTA_MAXIMA', () => {
    const violations: string[] = []
    let iterations = 0

    for (let bn = 1; bn <= 27; bn++) {
      for (let bp = 1; bp <= 4; bp++) {
        for (let gn = 1; gn <= 27; gn++) {
          for (let gp = 1; gp <= 4; gp++) {
            iterations++
            const label = `bride(${bn},${bp}) groom(${gn},${gp})`
            let result: AshtakootaResult
            try {
              result = computeAshtakootaMatch(koota('bride', bn, bp), koota('groom', gn, gp))
            } catch (e) {
              violations.push(`${label}: threw — ${e instanceof Error ? e.message : String(e)}`)
              continue
            }

            if (result.kootas.length !== 8) {
              violations.push(`${label}: expected 8 kootas, got ${result.kootas.length}`)
            }

            let sum = 0
            for (const k of result.kootas) {
              if (k.status !== 'scored') {
                violations.push(`${label}: koota ${k.key} status=${k.status} (expected 'scored' on well-formed input)`)
              }
              const max = KOOTA_MAXIMA[k.key]
              if (k.points < 0 || k.points > max) {
                violations.push(`${label}: koota ${k.key} points=${k.points} outside [0, ${max}]`)
              }
              if (!Number.isInteger(k.points * 2)) {
                violations.push(`${label}: koota ${k.key} points=${k.points} is not a 0.5 step`)
              }
              sum += k.points
            }

            if (Math.abs(result.gunaScore - sum) > 1e-9) {
              violations.push(`${label}: gunaScore=${result.gunaScore} != sum of koota points=${sum}`)
            }
            if (result.gunaScore > TOTAL_KOOTA_MAXIMA) {
              violations.push(`${label}: gunaScore=${result.gunaScore} > ${TOTAL_KOOTA_MAXIMA}`)
            }
            if (!Number.isInteger(result.gunaScore * 2)) {
              violations.push(`${label}: gunaScore=${result.gunaScore} is not a 0.5 step`)
            }
          }
        }
      }
    }

    expect(iterations).toBe(27 * 4 * 27 * 4)
    expect(violations.slice(0, 25), violations.length > 25 ? `...and ${violations.length - 25} more` : '').toEqual([])
  })

  // TASK 9.2 — committed, hand-curated oracle sample (NOT a raw dump — see
  // the fixture's own header for selection criteria and cross-verification).
  // Every entry here was chosen from a "clean" zone (no known divergence, no
  // Bhanga cancellation in play), so this is a genuine table-lookup check
  // against the oracle's own recorded output — never a snapshot of our own
  // code compared against itself.
  it.each(ASHTAKOOTA_ORACLE_SAMPLE)(
    'matches the task-9 PyJHora oracle sample — bride($bride.nakshatraNumber,$bride.padaNumber) groom($groom.nakshatraNumber,$groom.padaNumber): $note',
    ({ bride, groom, expected }) => {
      const result = computeAshtakootaMatch(
        { role: 'bride', ...bride },
        { role: 'groom', ...groom }
      )
      const byKey = Object.fromEntries(result.kootas.map((k) => [k.key, k.points])) as Record<KootaKey, number>

      expect(byKey.varna).toBe(expected.varna)
      expect(byKey.vashya).toBe(expected.vashya)
      expect(byKey.tara).toBe(expected.tara)
      expect(byKey.yoni).toBe(expected.yoni)
      expect(byKey.grahaMaitri).toBe(expected.grahaMaitri)
      expect(byKey.gana).toBe(expected.gana)
      expect(byKey.bhakoot).toBe(expected.bhakoot)
      expect(byKey.nadi).toBe(expected.nadi)
      expect(result.gunaScore).toBe(expected.gunaScore)
    }
  )
})

// ═══════════════════════════════════════════════════════════════════════
// 7.2 — Role-awareness
// ═══════════════════════════════════════════════════════════════════════

describe('computeAshtakootaMatch — role-awareness (7.2)', () => {
  it('(a) swapping BOTH which native holds the data AND which role tag it carries is byte-for-byte a no-op', () => {
    const bride = koota('bride', 5, 3)
    const groom = koota('groom', 20, 1)
    const original = computeAshtakootaMatch(bride, groom)

    // Swapping the data AND the role tag together, for both natives, just
    // hands the exact same two tagged objects back in reversed argument
    // order — and computeAshtakootaMatch resolves roles from the `.role`
    // field, never from argument position, so this must reproduce `original`
    // exactly. (Swapping the DATA alone, keeping role tags fixed to their
    // slot, is the DIFFERENT case asserted in (b) below.)
    const swappedBoth = computeAshtakootaMatch(groom, bride)

    expect(JSON.stringify(swappedBoth)).toBe(JSON.stringify(original))
  })

  it('(b) swapping which chart holds bride/groom WITHOUT swapping the role tags changes the Varna point when ranks differ', () => {
    // nakshatra 1 pada 1 -> rashi 1 (Aries, Kshatriya, VARNA_RANK 3)
    // nakshatra 7 pada 4 -> rashi 4 (Cancer, Brahmin, VARNA_RANK 4)
    const lowerRank = { nakshatraNumber: 1, padaNumber: 1 }
    const higherRank = { nakshatraNumber: 7, padaNumber: 4 }

    const original = computeAshtakootaMatch(
      { role: 'bride', ...lowerRank },
      { role: 'groom', ...higherRank }
    )
    const dataSwapped = computeAshtakootaMatch(
      { role: 'bride', ...higherRank },
      { role: 'groom', ...lowerRank }
    )

    const originalVarna = original.kootas.find((k) => k.key === 'varna')!.points
    const swappedVarna = dataSwapped.kootas.find((k) => k.key === 'varna')!.points

    expect(originalVarna).toBe(1) // groom rank 4 >= bride rank 3 -> full point
    expect(swappedVarna).toBe(0) // groom rank 3 < bride rank 4 -> zero
    expect(swappedVarna).not.toBe(originalVarna)
  })

  // Deliberately EXCLUDES 'vashya': VASHYA_MATRIX is directional for Keet
  // (Scorpio) — matchmakingTables.completeness.test.ts asserts
  // VASHYA_MATRIX.Chatushpad.Keet (2) !== VASHYA_MATRIX.Keet.Chatushpad (1) —
  // so "points unchanged under a same-role data swap" is FALSE in general for
  // vashya, not merely untested. Including it here (even with sample pairs
  // that happen never to touch rashi 8) would make this suite assert the
  // opposite of a property the completeness suite deliberately locks in, and
  // punish the correct fix the next time a Scorpio pair is added. Vashya's
  // OWN swap behavior (which correctly DOES change under a Keet-touching
  // swap) is covered directly below by the `brideChatushpadGroomKeet` /
  // `brideKeetGroomChatushpad` pair.
  const SYMMETRIC_UNDER_DATA_SWAP: KootaKey[] = ['yoni', 'grahaMaitri', 'bhakoot', 'nadi']
  const SAMPLE_PAIRS: Array<[number, number, number, number]> = [
    [1, 1, 14, 2],
    [3, 2, 19, 4],
    [9, 3, 25, 1],
  ]

  it.each(SAMPLE_PAIRS)(
    '(c) Yoni/Graha Maitri/Bhakoot/Nadi points, and Tara\'s summed total, are unchanged when the underlying data is swapped between roles — pair (%i,%i)/(%i,%i)',
    (bn, bp, gn, gp) => {
      const original = computeAshtakootaMatch(koota('bride', bn, bp), koota('groom', gn, gp))
      const dataSwapped = computeAshtakootaMatch(koota('bride', gn, gp), koota('groom', bn, bp))

      for (const key of SYMMETRIC_UNDER_DATA_SWAP) {
        const o = original.kootas.find((k) => k.key === key)!.points
        const s = dataSwapped.kootas.find((k) => k.key === key)!.points
        expect(s, `koota ${key} changed under a same-role data swap`).toBe(o)
      }

      // Tara is directional PER DIRECTION, but the two directions' points
      // are summed into one koota total — and addition is commutative, so
      // the TOTAL must stay swap-invariant even though it is not built from
      // a symmetric matrix the way Yoni/Vashya/etc. are.
      const originalTara = original.kootas.find((k) => k.key === 'tara')!.points
      const swappedTara = dataSwapped.kootas.find((k) => k.key === 'tara')!.points
      expect(swappedTara).toBe(originalTara)
    }
  )
})

// ═══════════════════════════════════════════════════════════════════════
// 7.3 — Per-koota unit tests (values read from matchmakingTables.ts)
// ═══════════════════════════════════════════════════════════════════════

describe('per-koota unit tests — positive (full points) and boundary/zero cases (7.3)', () => {
  function pointsFor(bride: MatchNativeInput, groom: MatchNativeInput, key: KootaKey): number {
    const result = computeAshtakootaMatch(bride, groom)
    return result.kootas.find((k) => k.key === key)!.points
  }

  // ── Varna (max 1): directional — 1 iff groom's VARNA_RANK >= bride's. ──
  it('Varna: full point when groom outranks bride (Shudra bride vs Brahmin groom)', () => {
    // nakshatra 5 pada 3 -> rashi 3 (Gemini, Shudra, rank 1)
    // nakshatra 7 pada 4 -> rashi 4 (Cancer, Brahmin, rank 4)
    const points = pointsFor(koota('bride', 5, 3), koota('groom', 7, 4), 'varna')
    expect(points).toBe(1)
  })
  it('Varna: zero when bride outranks groom (Brahmin bride vs Shudra groom)', () => {
    const points = pointsFor(koota('bride', 7, 4), koota('groom', 5, 3), 'varna')
    expect(points).toBe(0)
  })

  // ── Vashya (max 2): symmetric for 10 of 12 rashis; Keet (Scorpio) is
  //    directional (task 9.3, oracle-settled — see the Keet asymmetry test
  //    below). Not to be re-added to SYMMETRIC_UNDER_DATA_SWAP above. ──
  it('Vashya: full 2 points when both natives are in the same group (Manav)', () => {
    // nakshatra 14 pada 3 -> rashi 7 (Libra, Manav); nakshatra 5 pada 3 -> rashi 3 (Gemini, Manav)
    const points = pointsFor(koota('bride', 14, 3), koota('groom', 5, 3), 'vashya')
    expect(points).toBe(2)
  })
  it('Vashya: zero points for Keet (Scorpio) paired with a non-Keet group (Manav)', () => {
    // nakshatra 16 pada 4 -> rashi 8 (Scorpio, Keet)
    const points = pointsFor(koota('bride', 16, 4), koota('groom', 5, 3), 'vashya')
    expect(points).toBe(0)
  })
  it('Vashya: 0.5-step case (Chatushpad/Manav cross cell)', () => {
    // nakshatra 1 pada 1 -> rashi 1 (Aries, Chatushpad); nakshatra 5 pada 3 -> rashi 3 (Gemini, Manav)
    const points = pointsFor(koota('bride', 1, 1), koota('groom', 5, 3), 'vashya')
    expect(points).toBe(0.5)
  })
  it('Vashya: directional Keet asymmetry (bride=Chatushpad/groom=Keet scores 2, but the reverse scores only 1 — task 9.3)', () => {
    // nakshatra 1 pada 1 -> rashi 1 (Aries, Chatushpad); nakshatra 16 pada 4 -> rashi 8 (Scorpio, Keet)
    const brideChatushpadGroomKeet = pointsFor(koota('bride', 1, 1), koota('groom', 16, 4), 'vashya')
    const brideKeetGroomChatushpad = pointsFor(koota('bride', 16, 4), koota('groom', 1, 1), 'vashya')
    expect(brideChatushpadGroomKeet).toBe(2)
    expect(brideKeetGroomChatushpad).toBe(1)
  })

  // ── Tara (max 3): 1.5 per favorable direction, EXCEPT the whole koota is
  //    overridden to 0 when either direction's remainder is 1 (same
  //    nakshatra) or 9 (task 9.3, oracle-settled). Consequence: for any two
  //    DISTINCT, non-overridden nakshatras, the remainder pairing structure
  //    always puts exactly one direction in {3,5,7} and the other outside
  //    it — so the full 3 points is now mathematically UNREACHABLE for any
  //    real input; 1.5 is the practical ceiling. ──
  it('Tara: 1.5 points is the practical ceiling (full 3 is unreachable — see comment above)', () => {
    // taraRemainder(1,4)=4 (auspicious), taraRemainder(4,1)=7 (inauspicious) -> 1.5 + 0
    const points = pointsFor(koota('bride', 1, 1), koota('groom', 4, 1), 'tara')
    expect(points).toBe(1.5)
  })
  it('Tara: boundary 1.5 points when exactly one direction is inauspicious (the achievable floor, not 0)', () => {
    const points = pointsFor(koota('bride', 1, 1), koota('groom', 3, 1), 'tara')
    expect(points).toBe(1.5)
  })
  it('Tara: 0 points when both natives share the same nakshatra (total-override remainder 1 — task 9.3)', () => {
    const points = pointsFor(koota('bride', 1, 1), koota('groom', 1, 2), 'tara')
    expect(points).toBe(0)
  })
  it('Tara: 0 points on the adjacent-extreme remainder pair (2,9) — same override, task 9.3', () => {
    const points = pointsFor(koota('bride', 1, 1), koota('groom', 2, 1), 'tara')
    expect(points).toBe(0)
  })

  // ── Yoni (max 4): same animal -> 4; the 7 canonical Vaira (bitter-enemy) pairs -> 0. ──
  it('Yoni: full 4 points for the same animal (both Ashwini/Horse)', () => {
    const points = pointsFor(koota('bride', 1, 1), koota('groom', 1, 2), 'yoni')
    expect(points).toBe(4)
  })
  it('Yoni: zero points for a canonical Vaira (bitter-enemy) pair — Horse vs Buffalo', () => {
    // nakshatra 1 = Ashwini (Horse); nakshatra 13 = Hasta (Buffalo)
    const points = pointsFor(koota('bride', 1, 1), koota('groom', 13, 1), 'yoni')
    expect(points).toBe(0)
  })

  // ── Graha Maitri (max 5): same rashi lord -> 5; mutual naisargika enemy -> 0; neutral+enemy -> 0.5 (task 9.3). ──
  it('Graha Maitri: full 5 points when both rashis share the same lord (Mars: Aries vs Scorpio)', () => {
    const points = pointsFor(koota('bride', 1, 1), koota('groom', 16, 4), 'grahaMaitri')
    expect(points).toBe(5)
  })
  it('Graha Maitri: zero points for mutual naisargika enemies (Sun-lord Leo vs Venus-lord Taurus)', () => {
    const points = pointsFor(koota('bride', 10, 1), koota('groom', 3, 2), 'grahaMaitri')
    expect(points).toBe(0)
  })
  it('Graha Maitri: asymmetric friend/enemy scores a full 1, not 0.5 (task 9.3 — Moon-lord Cancer vs Mercury-lord Gemini)', () => {
    // Moon->Mercury=friend, Mercury->Moon=enemy (PERMANENT_FRIENDSHIP) -> friend+enemy = 1 (was 0.5 pre-9.3)
    const points = pointsFor(koota('bride', 7, 4), koota('groom', 5, 3), 'grahaMaitri')
    expect(points).toBe(1)
  })
  it('Graha Maitri: 0.5-step case now sits at neutral+enemy, not friend+enemy (task 9.3 — Mars-lord Aries vs Mercury-lord Gemini)', () => {
    // Mars->Mercury=enemy, Mercury->Mars=neutral (PERMANENT_FRIENDSHIP) -> enemy+neutral = 0.5
    const points = pointsFor(koota('bride', 1, 1), koota('groom', 5, 3), 'grahaMaitri')
    expect(points).toBe(0.5)
  })

  // ── Gana (max 6): directional matrix, bride row / groom column. ──
  it('Gana: full 6 points when both natives are Deva (Ashwini vs Punarvasu)', () => {
    const points = pointsFor(koota('bride', 1, 1), koota('groom', 7, 1), 'gana')
    expect(points).toBe(6)
  })
  it('Gana: zero points for Manushya bride vs Rakshasa groom (Bharani vs Krittika)', () => {
    const points = pointsFor(koota('bride', 2, 1), koota('groom', 3, 1), 'gana')
    expect(points).toBe(0)
  })

  // ── Bhakoot (max 7): rashi-distance dosha set {2,5,6,8,9,12}. ──
  it('Bhakoot: full 7 points for a non-dosha rashi distance (Aries -> Cancer, count 4)', () => {
    const points = pointsFor(koota('bride', 1, 1), koota('groom', 7, 4), 'bhakoot')
    expect(points).toBe(7)
  })
  it('Bhakoot: zero points for a dosha rashi distance (Aries -> Taurus, count 2)', () => {
    const points = pointsFor(koota('bride', 1, 1), koota('groom', 3, 2), 'bhakoot')
    expect(points).toBe(0)
  })

  // ── Nadi (max 8): different Nadi -> 8; same Nadi -> 0. ──
  it('Nadi: full 8 points for different Nadi (Ashwini/Aadi vs Bharani/Madhya)', () => {
    const points = pointsFor(koota('bride', 1, 1), koota('groom', 2, 1), 'nadi')
    expect(points).toBe(8)
  })
  it('Nadi: zero points for the same Nadi (Ashwini vs Ardra, both Aadi)', () => {
    const points = pointsFor(koota('bride', 1, 1), koota('groom', 6, 1), 'nadi')
    expect(points).toBe(0)
  })

  // ── Nadi Bhanga (cancellation): fires only for two DIFFERENT nakshatras
  //    sharing a lord — never for the identical nakshatra (regression for the
  //    bug found in review: firing on identical nakshatra turned the worst
  //    possible Nadi result into a false perfect 8/8). ──
  function kootaFor(bride: MatchNativeInput, groom: MatchNativeInput, key: KootaKey) {
    const result = computeAshtakootaMatch(bride, groom)
    return result.kootas.find((k) => k.key === key)!
  }
  it('Nadi Bhanga: fires for two DIFFERENT same-lord, same-Nadi nakshatras (Ashwini vs Mula, both Ketu/Aadi)', () => {
    const score = kootaFor(koota('bride', 1, 1), koota('groom', 19, 1), 'nadi')
    expect(score.points).toBe(8)
    expect(score.cancellation?.rule).toBe('nadi.same_nadi_same_nakshatra_lord')
  })
  it('Nadi Bhanga: does NOT fire for the identical nakshatra (Ashwini vs Ashwini) — the worst-case Nadi Dosha stays 0', () => {
    const score = kootaFor(koota('bride', 1, 1), koota('groom', 1, 3), 'nadi')
    expect(score.points).toBe(0)
    expect(score.cancellation).toBeUndefined()
  })

  // ── Bhakoot Bhanga (cancellation): fires when a dosha rashi-distance pair
  //    still shares the same Moon-rashi lord (detectBhakootCancellation) —
  //    previously exercised nowhere in the suite despite converting a 0 into
  //    a full 7, exactly the shape of risk the Nadi Bhanga tests above guard
  //    against for its sibling koota. ──
  it('Bhakoot Bhanga: fires for a dosha-distance pair sharing the same rashi lord (Aries/Scorpio, both Mars)', () => {
    // nakshatra 1 pada 1 -> rashi 1 (Aries, lord Mars); nakshatra 16 pada 4 ->
    // rashi 8 (Scorpio, lord Mars). Rashi distance count 8 is in the dosha
    // set {2,5,6,8,9,12}, so the base score is 0 before any cancellation.
    const score = kootaFor(koota('bride', 1, 1), koota('groom', 16, 4), 'bhakoot')
    expect(score.points).toBe(7)
    expect(score.cancellation?.rule).toBe('bhakoot.same_rashi_lord')
  })
  it('Bhakoot Bhanga: does NOT fire for a dosha-distance pair with DIFFERENT rashi lords (Aries/Taurus, Mars vs Venus)', () => {
    // nakshatra 1 pada 1 -> rashi 1 (Aries, lord Mars); nakshatra 3 pada 2 ->
    // rashi 2 (Taurus, lord Venus). Rashi distance count 2 is in the dosha
    // set, and the lords differ, so the dosha stands uncancelled.
    const score = kootaFor(koota('bride', 1, 1), koota('groom', 3, 2), 'bhakoot')
    expect(score.points).toBe(0)
    expect(score.cancellation).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// deriveVerdict — score-band boundary coverage
// ═══════════════════════════════════════════════════════════════════════
//
// Requirement 5.2 / NFR-8's four bands (<18 / 18-24 / 24-32 / >=32) had no
// direct boundary test anywhere in the suite — the only 'excellent' string
// elsewhere in the test tree is inert mock fixture data (a persisted-match
// API test), never an assertion on deriveVerdict's actual output. Tested
// directly against the exported function rather than by hunting for real
// nakshatra/pada pairs that happen to land on exact boundary values.

describe('deriveVerdict — score-band boundaries (Requirement 5.2 / NFR-8)', () => {
  it('below_average for scores under 18', () => {
    expect(deriveVerdict(0)).toBe('below_average')
    expect(deriveVerdict(17.5)).toBe('below_average')
  })
  it('average from 18 (inclusive) up to (not including) 24', () => {
    expect(deriveVerdict(18)).toBe('average')
    expect(deriveVerdict(23.5)).toBe('average')
  })
  it('good from 24 (inclusive) up to (not including) 32', () => {
    expect(deriveVerdict(24)).toBe('good')
    expect(deriveVerdict(31.5)).toBe('good')
  })
  it('excellent from 32 (inclusive) through the classical ceiling (36)', () => {
    expect(deriveVerdict(32)).toBe('excellent')
    expect(deriveVerdict(TOTAL_KOOTA_MAXIMA)).toBe('excellent')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 7.4 — Half-point integrity, engine -> route JSON -> Decimal(4,1) round-trip
// ═══════════════════════════════════════════════════════════════════════

const NAKSHATRA_SPAN_DEG = 360 / 27
const PADA_SPAN_DEG = NAKSHATRA_SPAN_DEG / 4

/** Mid-pada longitude — safely away from any nakshatra/pada boundary. */
function midPadaLongitude(nakshatraNumber: number, padaNumber: number): number {
  return (nakshatraNumber - 1) * NAKSHATRA_SPAN_DEG + (padaNumber - 1) * PADA_SPAN_DEG + PADA_SPAN_DEG / 2
}

/**
 * Finds a real (bride, groom) longitude pair whose gunaScore is fractional,
 * self-verifying the longitude -> (nakshatra, pada) round-trip via the
 * actual imported `longitudeToNakshatraPadaRashi` rather than hand-derived
 * arithmetic — so this cannot silently drift if that function's boundary
 * conventions ever change.
 */
function findFractionalGunaScoreFixture(): { brideLongitude: number; groomLongitude: number; gunaScore: number } {
  const brideLongitude = midPadaLongitude(1, 1)
  const brideNative = longitudeToNakshatraPadaRashi(brideLongitude)

  for (let gn = 1; gn <= 27; gn++) {
    for (let gp = 1; gp <= 4; gp++) {
      const groomLongitude = midPadaLongitude(gn, gp)
      const groomNative = longitudeToNakshatraPadaRashi(groomLongitude)
      const result = computeAshtakootaMatch(
        { role: 'bride', nakshatraNumber: brideNative.nakshatraNumber, padaNumber: brideNative.padaNumber },
        { role: 'groom', nakshatraNumber: groomNative.nakshatraNumber, padaNumber: groomNative.padaNumber }
      )
      if (!Number.isInteger(result.gunaScore)) {
        return { brideLongitude, groomLongitude, gunaScore: result.gunaScore }
      }
    }
  }
  throw new Error('test setup: no fractional gunaScore pair found in the fixed-bride sweep')
}

describe('half-point integrity end-to-end (7.4)', () => {
  it('a fractional gunaScore from computeMatch survives JSON serialization as a number, not a string', () => {
    const { brideLongitude, groomLongitude, gunaScore } = findFractionalGunaScoreFixture()
    expect(Number.isInteger(gunaScore)).toBe(false)

    const bride = longitudeToNakshatraPadaRashi(brideLongitude)
    const groom = longitudeToNakshatraPadaRashi(groomLongitude)
    const result = computeMatch(
      { koota: { role: 'bride', ...bride, moonLongitude: brideLongitude } },
      { koota: { role: 'groom', ...groom, moonLongitude: groomLongitude } }
    )
    expect(result.ashtakoota.gunaScore).toBe(gunaScore)

    // Simulates exactly what NextResponse.json() does to a route's payload —
    // JSON.stringify then JSON.parse — the one place a silent
    // number -> string coercion could sneak in.
    const roundTripped = JSON.parse(JSON.stringify({ result, tablesVersion: result.tablesVersion }))
    expect(typeof roundTripped.result.ashtakoota.gunaScore).toBe('number')
    expect(roundTripped.result.ashtakoota.gunaScore).toBe(gunaScore)
  })

  it('the same fractional gunaScore survives a simulated Prisma Decimal(4,1) round-trip losslessly', () => {
    const { gunaScore } = findFractionalGunaScoreFixture()
    expect(Number.isInteger(gunaScore)).toBe(false)

    // Decimal(4,1) is exact fixed-point — no live DB needed to prove the
    // round-trip is lossless, per the brief.
    const dec = new Prisma.Decimal(gunaScore)
    expect(Number(dec)).toBe(gunaScore)
    expect(dec.toFixed(1)).toBe(gunaScore.toFixed(1))
  })

  it('POST /api/matchmaking (mocked prisma.compatibilityMatch.create) round-trips a fractional gunaScore as a number in the response JSON', async () => {
    const { brideLongitude, groomLongitude, gunaScore } = findFractionalGunaScoreFixture()
    expect(Number.isInteger(gunaScore)).toBe(false)

    ;(resolveRequestUser as any).mockResolvedValue('user-1')

    const brideChart = {
      id: 'bride-chart',
      userId: 'user-1',
      name: 'Bride',
      source: 'paste',
      moonLongitude: brideLongitude,
      lagna: 'Aries',
      planets: null,
      relationships: null,
    }
    const groomChart = {
      id: 'groom-chart',
      userId: 'user-1',
      name: 'Groom',
      source: 'paste',
      moonLongitude: groomLongitude,
      lagna: 'Aries',
      planets: null,
      relationships: null,
    }

    ;(prisma.unifiedChart.findUnique as any).mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === 'bride-chart') return Promise.resolve(brideChart)
      if (where.id === 'groom-chart') return Promise.resolve(groomChart)
      return Promise.resolve(null)
    })
    ;(prisma.compatibilityMatch.create as any).mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'match-1',
        brideChartId: data.brideChartId,
        groomChartId: data.groomChartId,
        label: data.label ?? null,
        // Mirrors a real Decimal(4,1) column: constructed from the raw number
        // exactly as Prisma would persist/return it — never rounded here.
        gunaScore: new Prisma.Decimal(data.gunaScore as number),
        result: data.result,
        tablesVersion: data.tablesVersion,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      })
    )

    const request = new NextRequest('http://localhost:3000/api/matchmaking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brideChartId: 'bride-chart', groomChartId: 'groom-chart' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(201)
    const body = await response.json()

    expect(typeof body.gunaScore).toBe('number')
    expect(body.gunaScore).toBe(gunaScore)
    // The `create` call itself must have been given the raw, un-rounded number.
    const createCall = (prisma.compatibilityMatch.create as any).mock.calls[0][0]
    expect(createCall.data.gunaScore).toBe(gunaScore)
  })
})
