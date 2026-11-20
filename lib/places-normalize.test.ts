/**
 * lib/places-normalize.test.ts
 * ----------------------------
 * Validates: Requirements 2.3, 2.4, 10.2 of the place-location-picker spec.
 *
 * Every input string below is a REAL value from the source dataset
 * (~/Documents/Mohit/in/*.ndjson, 348,845 rows), not an invented example. The
 * counts quoted in comments were measured by replaying the whole dataset
 * through these functions.
 *
 * Why this module is worth its own test: it is the one piece of logic that both
 * ingestion and query depend on. If normalization drifted between the two,
 * search would return nothing for affected rows and no error would be raised
 * anywhere.
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  normalizePlaceName,
  isJunkPlaceName,
  resolvePlaceName,
  toPlaceKind,
  parsePlaceQuery,
  KIND_RANK,
  MIN_PLACE_QUERY_LENGTH,
} from './places-normalize'

describe('normalizePlaceName', () => {
  it('folds the macron diacritics that 3,356 real names carry', () => {
    // Nobody types the macron, so without folding these rows are unreachable.
    expect(normalizePlaceName('Haridwār')).toBe('haridwar')
    expect(normalizePlaceName('Bāgeshwar')).toBe('bageshwar')
    expect(normalizePlaceName('Balāngīr')).toBe('balangir')
    expect(normalizePlaceName('Bālumāth')).toBe('balumath')
    expect(normalizePlaceName('Baijnāth')).toBe('baijnath')
  })

  it('lowercases', () => {
    expect(normalizePlaceName('NEW DELHI')).toBe('new delhi')
    expect(normalizePlaceName('Bengaluru')).toBe('bengaluru')
  })

  it('turns punctuation into a space rather than deleting it', () => {
    // 542 real names contain a dot, mostly abbreviated initials. Deleting the
    // dot would give "stthomas"/"bkothakota", which nobody types; a space is
    // what the user actually enters.
    expect(normalizePlaceName('St. Thomas Mount Cantonment'))
      .toBe('st thomas mount cantonment')
    expect(normalizePlaceName('B. Kothakota')).toBe('b kothakota')
    expect(normalizePlaceName('Dr. Ambedkar Nagar')).toBe('dr ambedkar nagar')
    expect(normalizePlaceName('A. H. Palya')).toBe('a h palya')
  })

  it('keeps parenthetical content, which often holds an alternate name', () => {
    // 761 real names are parenthesized. Stripping the parenthetical would lose
    // "Cherrapunji" entirely — the name most people would actually search for.
    expect(normalizePlaceName('Sohra (Cherrapunji)')).toBe('sohra cherrapunji')
    expect(normalizePlaceName('Karanja (Laad)')).toBe('karanja laad')
    expect(normalizePlaceName('Pudukkottai (North)')).toBe('pudukkottai north')
  })

  it('preserves digits, which 1,051 real names depend on', () => {
    // Survey/plot codes in Rajasthan and Telangana. Not junk.
    expect(normalizePlaceName('1 ALM ALDIN')).toBe('1 alm aldin')
    expect(normalizePlaceName('29 -A. Chinta -Makulapalle'))
      .toBe('29 a chinta makulapalle')
    expect(normalizePlaceName('1 NKR (Lambidhab)')).toBe('1 nkr lambidhab')
  })

  it('collapses runs of whitespace and trims', () => {
    expect(normalizePlaceName('  New   Delhi  ')).toBe('new delhi')
    expect(normalizePlaceName('Alandi\t\tKhed')).toBe('alandi khed')
  })

  it('reduces a name with no letters or digits to the empty string', () => {
    expect(normalizePlaceName('---')).toBe('')
    expect(normalizePlaceName('   ')).toBe('')
    expect(normalizePlaceName('.,-_/')).toBe('')
    expect(normalizePlaceName('')).toBe('')
  })

  it('is idempotent — normalizing an already-normalized name is a no-op', () => {
    // Load-bearing: ingestion normalizes once, query normalizes again on the
    // way in. A non-idempotent transform would desynchronize the two.
    fc.assert(
      fc.property(fc.string(), (s) => {
        const once = normalizePlaceName(s)
        expect(normalizePlaceName(once)).toBe(once)
      }),
      { numRuns: 500 }
    )
  })

  it('never emits leading, trailing or doubled spaces', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const out = normalizePlaceName(s)
        expect(out).toBe(out.trim())
        expect(out).not.toMatch(/\s\s/)
      }),
      { numRuns: 500 }
    )
  })
})

describe('isJunkPlaceName', () => {
  it('rejects "---", the only junk name in the dataset', () => {
    // Exactly 11 of 348,845 rows are junk, and every one is this string.
    expect(isJunkPlaceName('---')).toBe(true)
  })

  it('rejects punctuation-only and blank names', () => {
    expect(isJunkPlaceName('')).toBe(true)
    expect(isJunkPlaceName('   ')).toBe(true)
    expect(isJunkPlaceName('–—.,')).toBe(true)
  })

  it('ACCEPTS "§U rural" — an odd name is still a name', () => {
    // A real row in Karanpur Tehsil, Sri Ganganagar, Rajasthan. An earlier
    // draft of the spec listed this as junk; it is not. The leading § is
    // stripped as punctuation and "u rural" remains, which is searchable.
    expect(isJunkPlaceName('§U rural')).toBe(false)
    expect(normalizePlaceName('§U rural')).toBe('u rural')
  })

  it('accepts ordinary and digit-bearing names', () => {
    expect(isJunkPlaceName('Alandi')).toBe(false)
    expect(isJunkPlaceName('1 ALM ALDIN')).toBe(false)
    expect(isJunkPlaceName('Haridwār')).toBe(false)
  })

  it('agrees with normalizePlaceName by construction', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(isJunkPlaceName(s)).toBe(normalizePlaceName(s) === '')
      }),
      { numRuns: 500 }
    )
  })
})

describe('resolvePlaceName', () => {
  it('prefers the top-level name', () => {
    expect(
      resolvePlaceName({ name: 'Bengaluru', address: { city: 'Ignored' } })
    ).toBe('Bengaluru')
  })

  it('falls back through the address keys in order', () => {
    // Real shape: hamlet rows frequently carry the settlement name only under
    // address.village or address.hamlet.
    expect(resolvePlaceName({ address: { hamlet: 'Sultanpur' } })).toBe('Sultanpur')
    expect(resolvePlaceName({ address: { village: 'Alandi' } })).toBe('Alandi')
    expect(resolvePlaceName({ address: { town: 'Abhayapuri' } })).toBe('Abhayapuri')
    expect(resolvePlaceName({ address: { city: 'Abohar' } })).toBe('Abohar')
    expect(resolvePlaceName({ address: { municipality: 'Aboi' } })).toBe('Aboi')
  })

  it('prefers hamlet over village when both are present', () => {
    expect(
      resolvePlaceName({ address: { hamlet: 'Chosen', village: 'Other' } })
    ).toBe('Chosen')
  })

  it('returns null for a row carrying only administrative parents', () => {
    // 75,435 real rows (21.6% of the dataset) look exactly like this: unnamed
    // OSM place nodes with no settlement name and no other_names to recover.
    // This is the loader's single largest skip category.
    expect(
      resolvePlaceName({
        address: {
          county: 'Begusarai',
          state_district: 'Begusarai',
          state: 'Bihar',
          country: 'India',
        },
      })
    ).toBeNull()
  })

  it('returns null when there is no address at all', () => {
    expect(resolvePlaceName({})).toBeNull()
  })

  it('treats a whitespace-only name as absent and keeps looking', () => {
    expect(resolvePlaceName({ name: '   ', address: { village: 'Alandi' } }))
      .toBe('Alandi')
    expect(resolvePlaceName({ name: '   ', address: {} })).toBeNull()
  })

  it('does not resolve a name from unrelated address keys', () => {
    // county/state_district are administrative parents, never the settlement.
    expect(
      resolvePlaceName({ address: { county: 'Khed', state_district: 'Pune' } })
    ).toBeNull()
  })
})

describe('parsePlaceQuery', () => {
  it('normalizes the whole query into a searchable phrase', () => {
    // The phrase is what makes a multi-word settlement name reachable: these
    // are all real names, and none of their second words is an administrative
    // unit that could narrow anything.
    expect(parsePlaceQuery('Rampur Bushahr').phrase).toBe('rampur bushahr')
    expect(parsePlaceQuery('Alandi Devachi').phrase).toBe('alandi devachi')
    expect(parsePlaceQuery('St. Thomas Mount').phrase).toBe('st thomas mount')
  })

  it('treats a comma exactly like a space', () => {
    expect(parsePlaceQuery('rampur, himachal')).toEqual(
      parsePlaceQuery('rampur himachal')
    )
  })

  it('keeps the first token as the name when it is long enough to search', () => {
    const { nameToken, narrowTokens } = parsePlaceQuery('rampur shimla')

    expect(nameToken).toBe('rampur')
    expect(narrowTokens).toEqual(['shimla'])
  })

  it('grows the name token past a short first word', () => {
    // "st" is two characters. Measuring a threshold against it alone rejected
    // the whole 16-character query; growing absorbs "thomas" and clears it.
    expect(parsePlaceQuery('St. Thomas Mount')).toMatchObject({
      nameToken: 'st thomas',
      narrowTokens: ['Mount'],
    })
    expect(parsePlaceQuery('B. Kothakota')).toMatchObject({
      nameToken: 'b kothakota',
      narrowTokens: [],
    })
  })

  it('stops growing as soon as the threshold is cleared', () => {
    // Otherwise "rampur shimla" would swallow its own narrowing token and
    // Requirement 3.4 would stop working.
    expect(parsePlaceQuery('rampur shimla himachal').nameToken).toBe('rampur')
  })

  it('keeps narrowing tokens raw so diacritics still match display columns', () => {
    // `state` / `district` / `county` store display text, matched with
    // case-insensitive `contains`. Folding the macron here would stop the token
    // matching the district it was copied from.
    expect(parsePlaceQuery('kotdwara Bāgeshwar').narrowTokens).toEqual(['Bāgeshwar'])
  })

  it('drops tokens that carry nothing searchable', () => {
    // A stray separator would otherwise become a narrowing clause that can
    // never match, silently emptying the result set.
    expect(parsePlaceQuery('rampur -- shimla')).toMatchObject({
      phrase: 'rampur shimla',
      nameToken: 'rampur',
      narrowTokens: ['shimla'],
    })
  })

  it('yields an empty parse for a query with no letters or digits', () => {
    for (const q of ['', '   ', '---', ',,']) {
      expect(parsePlaceQuery(q)).toEqual({ phrase: '', nameToken: '', narrowTokens: [] })
    }
  })

  it('leaves a genuinely short query short, so the route can refuse to query', () => {
    // A pattern shorter than a trigram cannot use the GIN index. These are the
    // queries that must still short-circuit.
    for (const q of ['r', 'ra', 'r.,']) {
      expect(parsePlaceQuery(q).phrase.length).toBeLessThan(MIN_PLACE_QUERY_LENGTH)
    }
  })

  it('reassembles: phrase is the name token followed by the normalized narrowing', () => {
    // Load-bearing invariant. The route measures its length guard on `phrase`
    // and concludes `nameToken` is long enough too; that only holds if the two
    // are built from the same tokens.
    fc.assert(
      fc.property(fc.string(), (q) => {
        const { phrase, nameToken, narrowTokens } = parsePlaceQuery(q)
        const reassembled = [nameToken, ...narrowTokens.map(normalizePlaceName)]
          .filter(Boolean)
          .join(' ')
        expect(reassembled).toBe(phrase)
      }),
      { numRuns: 500 }
    )
  })

  it('emits an already-normalized phrase and name token', () => {
    // Both are compared against `Place.nameNorm` directly, so a second pass
    // through the normalizer must be a no-op.
    fc.assert(
      fc.property(fc.string(), (q) => {
        const { phrase, nameToken } = parsePlaceQuery(q)
        expect(normalizePlaceName(phrase)).toBe(phrase)
        expect(normalizePlaceName(nameToken)).toBe(nameToken)
      }),
      { numRuns: 500 }
    )
  })

  it('either clears the threshold or has consumed the whole phrase', () => {
    // This is what lets the route guard on `phrase` alone: whenever it decides
    // to query, `nameToken` is at least MIN_PLACE_QUERY_LENGTH long as well.
    fc.assert(
      fc.property(fc.string(), (q) => {
        const { phrase, nameToken, narrowTokens } = parsePlaceQuery(q)
        if (nameToken.length < MIN_PLACE_QUERY_LENGTH) {
          expect(nameToken).toBe(phrase)
          expect(narrowTokens).toEqual([])
        }
      }),
      { numRuns: 500 }
    )
  })

  it('has narrowing tokens only when the phrase is more than the name', () => {
    fc.assert(
      fc.property(fc.string(), (q) => {
        const { phrase, nameToken, narrowTokens } = parsePlaceQuery(q)
        expect(narrowTokens.length === 0).toBe(nameToken === phrase)
      }),
      { numRuns: 500 }
    )
  })
})

describe('KIND_RANK and toPlaceKind', () => {
  it('ranks city above town above village above hamlet', () => {
    // This ordering is what lifts the four real "Rampur" towns above the
    // forty-odd Rampur villages in search results.
    expect(KIND_RANK.city).toBeLessThan(KIND_RANK.town)
    expect(KIND_RANK.town).toBeLessThan(KIND_RANK.village)
    expect(KIND_RANK.village).toBeLessThan(KIND_RANK.hamlet)
  })

  it('assigns hamlet the last rank, so it sorts last when included', () => {
    const ranks = Object.values(KIND_RANK)
    expect(KIND_RANK.hamlet).toBe(Math.max(...ranks))
  })

  it('narrows the four known kinds and rejects anything else', () => {
    expect(toPlaceKind('city')).toBe('city')
    expect(toPlaceKind('hamlet')).toBe('hamlet')
    expect(toPlaceKind('suburb')).toBeNull()
    expect(toPlaceKind('administrative')).toBeNull()
    expect(toPlaceKind(undefined)).toBeNull()
    expect(toPlaceKind(42)).toBeNull()
  })
})
