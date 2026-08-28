/**
 * lib/places-normalize.ts
 * -----------------------
 * Pure normalization helpers for birth-place reference data.
 *
 * This is the single source of truth for how a place name is turned into its
 * searchable form. BOTH sides must go through it:
 *
 *   - ingestion  (scripts/load-places.ts) writes `Place.nameNorm`
 *   - query      (GET /api/places)        normalizes the user's search term
 *
 * If the two ever diverged, search would silently miss rows — so neither side
 * is allowed its own copy of this logic.
 *
 * No React, no Prisma, no I/O: pure TypeScript, so it runs under the existing
 * `environment: 'node'` Vitest setup.
 *
 * See .kiro/specs/place-location-picker/design.md §Normalization.
 */

/** The four settlement classes carried by the source dataset. */
export type PlaceKind = 'city' | 'town' | 'village' | 'hamlet'

/**
 * Search relevance order, persisted as `Place.kindRank` so ordering is a plain
 * Prisma `orderBy` rather than a raw ORDER BY CASE.
 *
 * This is what floats the four real "Rampur" towns above the forty-odd Rampur
 * villages when a practitioner searches an ambiguous name.
 */
export const KIND_RANK: Record<PlaceKind, number> = {
  city: 1,
  town: 2,
  village: 3,
  hamlet: 4,
}

/** Ordered `address` keys consulted when a row carries no top-level `name`. */
const ADDRESS_NAME_KEYS = [
  'hamlet',
  'village',
  'town',
  'city',
  'municipality',
] as const

/** The shape this module needs from a source NDJSON row. */
export interface RawPlaceRow {
  name?: string
  address?: Record<string, string | undefined>
}

/**
 * Normalizes a place name into its searchable form:
 * lowercase, diacritics folded, punctuation reduced to spaces, spaces collapsed.
 *
 *   "Haridwār"            → "haridwar"
 *   "St. Thomas Mount"    → "st thomas mount"
 *   "Sohra (Cherrapunji)" → "sohra cherrapunji"
 *
 * Diacritic folding is the load-bearing part: 3,356 names in the source data
 * carry macrons (Haridwār, Bāgeshwar, Balāngīr) that nobody types. Neither
 * `ILIKE` nor a trigram index folds them, so it has to happen here.
 *
 * Punctuation becomes a space rather than being deleted, so that the 542 dotted
 * names ("St. Thomas Mount", "B. Kothakota") match the way a user actually
 * types them — with a space where the dot was, not with the words run together.
 * Parenthetical content is kept, not stripped: in this dataset it often holds an
 * alternate name ("Sohra (Cherrapunji)", "Karanja (Laad)"), which the substring
 * stage of search can then find.
 *
 * Letters and digits of ANY script survive, so the 1,051 names containing digits
 * ("1 ALM ALDIN" — real survey codes in Rajasthan and Telangana) are preserved.
 *
 * Caveat, accepted for v1: stripping combining marks also strips the vowel signs
 * of Indic scripts, so a native-script name like "ગાંધીધામ" is mangled rather
 * than romanized. It is applied identically on both sides, so such a name still
 * matches itself; it simply cannot be reached by a Latin-script query. Indexing
 * `other_names` is the queued follow-up that addresses this properly.
 */
export function normalizePlaceName(raw: string): string {
  return raw
    .normalize('NFD')
    // Combining marks (Unicode category M) — the accents left behind by NFD.
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    // Anything that is not a letter, digit or space becomes a space.
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

/**
 * True when a name carries no searchable content — it normalizes to nothing.
 *
 * Defined in terms of `normalizePlaceName` rather than as its own punctuation
 * blacklist, so the two can never disagree about what is empty.
 *
 * Rare in practice: exactly 11 rows in the 348,845-row source dataset are junk,
 * and every one of them is the literal string "---". The far larger skip
 * category during ingestion is rows with no name *field* at all (75,435 of
 * them) — that is `resolvePlaceName` returning null, not this predicate.
 */
export function isJunkPlaceName(raw: string): boolean {
  return normalizePlaceName(raw) === ''
}

/**
 * Resolves the display name of a source row, or null when it has none.
 *
 * Prefers the top-level `name`, then falls back through the `address` keys that
 * can name a settlement. Returns null for the 75,435 rows (21.6% of the source
 * dataset) that carry only administrative parents — state, district, county —
 * with no settlement name and no `other_names`. Those are unnamed OSM place
 * nodes with nothing to recover; the loader skips them.
 */
export function resolvePlaceName(row: RawPlaceRow): string | null {
  const name = row.name?.trim()
  if (name) return name

  const address = row.address
  if (!address) return null

  for (const key of ADDRESS_NAME_KEYS) {
    const value = address[key]?.trim()
    if (value) return value
  }

  return null
}

/**
 * Narrows a source row's `type` to a `PlaceKind`, or null when unrecognized.
 * The loader derives kind from the filename it is reading and uses this only to
 * validate the row agrees, so an unexpected value is a skip rather than a throw.
 */
export function toPlaceKind(value: unknown): PlaceKind | null {
  return typeof value === 'string' && value in KIND_RANK
    ? (value as PlaceKind)
    : null
}

// ─── Search-query parsing ─────────────────────────────────────────────────

/**
 * Minimum length of a searchable pattern.
 *
 * A trigram is three characters, so a shorter `LIKE '%q%'` cannot use the
 * `gin_trgm_ops` index and would degrade to a sequential scan over 272k rows.
 * `GET /api/places` short-circuits below this; the picker enforces the same
 * threshold client-side.
 */
export const MIN_PLACE_QUERY_LENGTH = 3

export interface ParsedPlaceQuery {
  /**
   * The WHOLE query normalized — `"Rampur, Himachal"` → `"rampur himachal"`.
   *
   * This is what makes multi-word settlement names ("Rampur Bushahr", "Alandi
   * Devachi", "New Delhi", "St. Thomas Mount") reachable: they are matched
   * against `nameNorm` as a single phrase, because that is what they are.
   * Already normalized, so re-normalizing it is a no-op.
   */
  phrase: string
  /**
   * The leading token(s) treated as the settlement name for administrative
   * narrowing, normalized the same way ingestion normalized `nameNorm`.
   *
   * It is the FIRST token, grown by absorbing following tokens until it reaches
   * `MIN_PLACE_QUERY_LENGTH`. Growing matters for the 542 dotted names in the
   * dataset: `"St. Thomas Mount"` has a two-character first token (`st`), and a
   * threshold applied to that alone would reject a 16-character query as too
   * short. Growth stops as soon as the threshold is cleared, so
   * `"rampur shimla"` still yields the name `rampur` and keeps `shimla`
   * available for narrowing.
   */
  nameToken: string
  /**
   * The tokens `nameToken` did not absorb, kept RAW.
   *
   * They are matched with case-insensitive `contains` against the
   * administrative columns (`state` / `district` / `county`), which store
   * display text rather than normalized text — so normalizing them here would
   * fold away the very characters being matched (`Bāgeshwar` the district would
   * stop matching `Bāgeshwar` the typed token).
   *
   * Empty exactly when `nameToken === phrase`, i.e. when the whole query is the
   * name and there is nothing left to narrow with.
   */
  narrowTokens: string[]
}

/**
 * Splits a search query into the phrase, the name token, and the administrative
 * narrowing tokens.
 *
 * Splitting on commas AND whitespace is what makes `"rampur shimla"` and
 * `"rampur, himachal"` parse identically. Tokens that normalize to nothing
 * (a stray `"--"`) are dropped rather than carried into a narrowing clause that
 * could never match.
 *
 * Lives here, next to `normalizePlaceName`, because it is the query-side half of
 * the same contract: `phrase` and `nameToken` are compared against `nameNorm`,
 * which ingestion wrote through this module. A second copy of this logic in the
 * route would be free to drift from it.
 */
export function parsePlaceQuery(q: string): ParsedPlaceQuery {
  const tokens = q
    .split(/[,\s]+/u)
    .map((raw) => ({ raw, norm: normalizePlaceName(raw) }))
    .filter((token) => token.norm !== '')

  // Every `norm` is non-empty, trimmed and internally collapsed, so joining
  // them with single spaces yields an already-normalized string. That is what
  // lets `phrase` be compared against `nameNorm` directly.
  const phrase = tokens.map((token) => token.norm).join(' ')

  // Grow the name token until it clears the threshold or runs out of tokens.
  // When it runs out, `nameToken === phrase` — which is precisely the case the
  // route rejects as too short, so the guard ends up evaluated against the
  // whole typed name rather than against its first word.
  let absorbed = 0
  let nameToken = ''
  while (absorbed < tokens.length && nameToken.length < MIN_PLACE_QUERY_LENGTH) {
    absorbed += 1
    nameToken = tokens
      .slice(0, absorbed)
      .map((token) => token.norm)
      .join(' ')
  }

  return {
    phrase,
    nameToken,
    narrowTokens: tokens.slice(absorbed).map((token) => token.raw),
  }
}
