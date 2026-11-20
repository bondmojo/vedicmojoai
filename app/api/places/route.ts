/**
 * GET /api/places — offline place search over the `place` reference table.
 *
 * Turns a typed place name into the coordinates the compute engine already
 * consumes. Read-only: it never writes, and it never calls out to a geocoder —
 * the dataset is ingested once by `scripts/load-places.ts`.
 *
 * Query params:
 *   ?q=rampur bushahr   — a multi-word settlement name, matched as one phrase
 *   ?q=rampur shimla    — a name plus administrative narrowing
 *   ?limit=20           — 1-50, default 20
 *   ?includeHamlets=true — default false (hamlets are ingested but filtered out)
 *
 * A query is BOTH of those things at once, because nothing in the text says
 * which: `"rampur bushahr"` is a town in Shimla, `"rampur shimla"` is a town
 * plus its district. So both readings are retrieved, phrase first — see
 * §Ranking below.
 *
 * See .kiro/specs/place-location-picker/design.md §Search Design.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { resolveRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  MIN_PLACE_QUERY_LENGTH,
  parsePlaceQuery,
  type PlaceKind,
} from '@/lib/places-normalize'

/**
 * The stages share a budget of `limit * OVERFETCH` rows so that dedupe on
 * `(nameNorm, county, district, state)` has rows to spare, and so `truncated`
 * can be derived from the surplus instead of a second `COUNT` query.
 */
const OVERFETCH = 3

/**
 * Every retrieval stage is scoped to India.
 *
 * The dataset is India-only today (Requirement: Non-Goals — "Places outside
 * India"), and `Place.countryCode` defaults to `"in"`, so this filter changes
 * nothing about current results. It is here so that a future non-India ingest
 * cannot silently start leaking rows into a picker whose whole timezone story
 * ("every one of the 36 states is IST") assumes India. Widening the scope should
 * be a deliberate edit here, not a side effect of loading a file.
 *
 * Deliberately un-indexed: with every row `"in"` the column is useless as an
 * access path, and the planner will treat it as the cheap residual filter it is.
 */
const COUNTRY_SCOPE = { countryCode: 'in' } satisfies Prisma.PlaceWhereInput

// ─── Response contract ────────────────────────────────────────────────────

export interface PlaceResult {
  id: string
  name: string
  kind: PlaceKind
  state: string
  district: string
  county: string | null
  /** Serialized from Prisma `Decimal` — never returned as a Decimal object. */
  latitude: number
  longitude: number
  /** `"<name>, <county ?? district>, <state>"` */
  label: string
}

export interface PlaceSearchResponse {
  results: PlaceResult[]
  /** True when more matches exist than `limit` — drives the "narrow" hint. */
  truncated: boolean
  /** True when `kind = 'hamlet'` rows were filtered out — drives the toggle. */
  hamletsExcluded: boolean
  reason?: 'query_too_short'
}

// ─── Input validation ─────────────────────────────────────────────────────

/**
 * Query strings carry everything as text, so `limit` is coerced and
 * `includeHamlets` is matched against explicit literals. `z.coerce.boolean()`
 * would read the string `"false"` as `true`.
 */
const PlaceSearchParamsSchema = z.object({
  q: z.string(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  includeHamlets: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

/**
 * Reads the params Zod cares about, dropping absent ones so schema defaults
 * apply (`searchParams.get` yields `null`, which would fail a `.default()`).
 */
function readSearchParams(searchParams: URLSearchParams): Record<string, string> {
  const raw: Record<string, string> = {}
  for (const key of ['q', 'limit', 'includeHamlets'] as const) {
    const value = searchParams.get(key)
    if (value !== null) raw[key] = value
  }
  return raw
}

// ─── Where fragments ──────────────────────────────────────────────────────

/**
 * Turns the narrowing tokens into an AND of ORs over the administrative
 * columns: every token must match at least one of `state` / `district` /
 * `county`, but a single token need not know which one it is. That is what
 * lets `"rampur shimla"` (district) and `"rampur himachal"` (state) both
 * resolve to the same row.
 *
 * `mode: 'insensitive'` is required here and deliberately absent from the
 * `nameNorm` matching: these columns hold display text (`"Himachal Pradesh"`),
 * not text pre-normalized by `lib/places-normalize.ts`, so the operator has to
 * do the case folding.
 *
 * Returns `[]` when the whole query was the name, which is a valid empty `AND`.
 */
function buildNarrowing(narrowTokens: string[]): Prisma.PlaceWhereInput[] {
  return narrowTokens.map((token) => ({
    OR: [
      { state: { contains: token, mode: 'insensitive' as const } },
      { district: { contains: token, mode: 'insensitive' as const } },
      { county: { contains: token, mode: 'insensitive' as const } },
    ],
  }))
}

/**
 * Hamlets are always ingested (96,400 of 272,499 rows) and excluded at query
 * time, so flipping the default never means re-running ingestion. An empty
 * fragment spreads into the `where` as a no-op when they are wanted.
 */
function buildKindWhere(includeHamlets: boolean): Prisma.PlaceWhereInput {
  return includeHamlets ? {} : { kind: { not: 'hamlet' } }
}

// ─── Ranked retrieval ─────────────────────────────────────────────────────

/**
 * Only the columns the response needs, plus the two dedupe needs: `nameNorm`
 * is part of the dedupe key, and `kindRank` decides which row survives.
 *
 * `Place.postcode` is deliberately absent, and deliberately not removed from
 * the model either: it is part of the spec'd `Place` shape (Requirement 1.1),
 * ingested at 43.8% coverage, and stored so a future feature (postal-code
 * search, address rendering) has it without a 272k-row re-ingest. Nothing reads
 * it today, and search must not — a partially-populated column would rank and
 * label rows inconsistently.
 */
const CANDIDATE_COLUMNS = {
  id: true,
  name: true,
  nameNorm: true,
  kind: true,
  kindRank: true,
  state: true,
  district: true,
  county: true,
  latitude: true,
  longitude: true,
} satisfies Prisma.PlaceSelect

export type PlaceCandidate = Prisma.PlaceGetPayload<{ select: typeof CANDIDATE_COLUMNS }>

/**
 * Ordering *within* a tier. The tiering itself comes from which stage produced
 * the row, so this never has to express "exact before prefix" — that would
 * need the `ORDER BY CASE` this design exists to avoid.
 *
 * `name` last makes the order total, which is what keeps identical input
 * returning identical results (Requirement 3.5).
 */
const BASE_ORDER: Prisma.PlaceOrderByWithRelationInput[] = [
  { kindRank: 'asc' },
  { state: 'asc' },
  { district: 'asc' },
  { name: 'asc' },
]

/**
 * One relevance tier: a `nameNorm` predicate plus the narrowing that applies to
 * it. Tier order is array order, and each tier is one ordered query.
 */
interface RetrievalStage {
  /**
   * Which tier this stage is, used to name the failing stage in the 500 log.
   * `"…-substring"` failing points at the trigram GIN index; `"…-exact"` or
   * `"…-prefix"` at the btree or the connection itself.
   */
  tier:
    | 'phrase-exact'
    | 'phrase-prefix'
    | 'phrase-substring'
    | 'token-exact'
    | 'token-prefix'
    | 'token-substring'
  /** Matched against `nameNorm`. Never with `mode: 'insensitive'` — see below. */
  nameNorm: Prisma.StringFilter | string
  /** Administrative narrowing — empty for the phrase tiers. */
  narrowing: Prisma.PlaceWhereInput[]
}

/**
 * The six relevance tiers, highest first.
 *
 * §Ranking. A query string is ambiguous by construction: `"rampur bushahr"` is
 * one settlement's full name, `"rampur shimla"` is a settlement plus its
 * district, and the text does not say which. So both readings are retrieved and
 * the phrase reading is ranked above the narrowing reading:
 *
 *   1-3. PHRASE — the whole normalized query against `nameNorm`, exact then
 *        prefix then substring, with NO narrowing. This is what makes multi-word
 *        primary names reachable at all: `"rampur bushahr"`, `"alandi devachi"`,
 *        `"new delhi"`, `"st. thomas mount"`. Ranked first because a row whose
 *        own name is everything the user typed is the best answer available —
 *        there is no interpretation of the query it fails to satisfy.
 *   4-6. TOKEN + NARROWING — the leading name token against `nameNorm`, again
 *        exact/prefix/substring, with every remaining token required to match
 *        `state`, `district` or `county` (Requirement 3.4). This is the tier that
 *        keeps `"rampur shimla"` and `"rampur, himachal"` narrowing.
 *
 * The token tiers are omitted entirely when there is nothing to narrow with
 * (`narrowTokens` empty), because `nameToken === phrase` there and the three
 * queries would be byte-identical to the phrase tiers. A single-word query
 * therefore still costs at most three round trips, exactly as before; only a
 * multi-token query can reach six, and only when the shared budget is still
 * unspent after the phrase tiers.
 *
 * A row can legitimately satisfy both families — a settlement actually named
 * "Rampur Shimla" in Shimla district matches `phrase-exact` and `token-prefix`.
 * Dedupe on `(nameNorm, county, district, state)` collapses it to one result at
 * its phrase-tier position, so overlap costs a slot in the over-fetch and never
 * a duplicate row.
 */
function buildStages(
  phrase: string,
  nameToken: string,
  narrowing: Prisma.PlaceWhereInput[]
): RetrievalStage[] {
  const tiersFor = (
    pattern: string,
    kind: 'phrase' | 'token',
    stageNarrowing: Prisma.PlaceWhereInput[]
  ): RetrievalStage[] => [
    { tier: `${kind}-exact`, nameNorm: pattern, narrowing: stageNarrowing },
    {
      tier: `${kind}-prefix`,
      // `startsWith` is a superset of the equality above, so the exact tier has
      // to be subtracted or every exact match would come back a second time.
      nameNorm: { startsWith: pattern, not: pattern },
      narrowing: stageNarrowing,
    },
    {
      tier: `${kind}-substring`,
      // Subtracting the whole prefix set with a predicate rather than with
      // `id: { notIn: [...] }` keeps this query independent of how many rows its
      // predecessors happened to return.
      nameNorm: { contains: pattern, not: { startsWith: pattern } },
      narrowing: stageNarrowing,
    },
  ]

  const phraseTiers = tiersFor(phrase, 'phrase', [])
  if (narrowing.length === 0) return phraseTiers
  return [...phraseTiers, ...tiersFor(nameToken, 'token', narrowing)]
}

/**
 * Runs the ranking as one ordered query per tier rather than a single query
 * partitioned afterwards. Each stage uses the index built for it — the
 * `text_pattern_ops` btree serves both the equality and the prefix scan, the
 * trigram GIN index serves the substring scan — and no stage needs the
 * `ORDER BY CASE` this design exists to avoid.
 *
 * The tier must be decided in SQL, not after the fetch. A single
 * `startsWith` stage with `take: overfetch` and a post-hoc
 * `nameNorm === token` partition looks equivalent and is not: the window is
 * ordered by `BASE_ORDER`, which interleaves exact and prefix matches, so the
 * `take` can cut off exact matches while prefix matches sit inside the window.
 * Measured against the loaded table, `q=rampur` reached only 13 of its 112
 * exact non-hamlet matches that way, and filled the remaining result slots
 * with `Rampura` / `Rampurhat` / `Rampuram Thanda` while the Rampurs of
 * Maharashtra, Odisha, Punjab, Rajasthan and Telangana never appeared.
 *
 * Each stage takes only the budget its predecessors left, and the loop stops
 * once the budget is spent: a lower tier can never outrank a higher one, so
 * there is nothing a further round trip could contribute.
 *
 * The returned array is the ranked candidate list — concatenation in stage
 * order, which is tier order.
 */
async function retrieveCandidates({
  stages,
  kindWhere,
  overfetch,
}: {
  stages: RetrievalStage[]
  kindWhere: Prisma.PlaceWhereInput
  /** `limit * OVERFETCH` — the ceiling shared across every stage. */
  overfetch: number
}): Promise<PlaceCandidate[]> {
  const candidates: PlaceCandidate[] = []

  for (const stage of stages) {
    if (candidates.length >= overfetch) break

    // No `mode: 'insensitive'` on any `nameNorm` filter. That would emit ILIKE,
    // which the `text_pattern_ops` btree cannot serve — the whole point of these
    // stages. Case folding already happened on both sides via
    // normalizePlaceName(), which additionally folds diacritics that ILIKE would
    // leave alone (so `Rāmpur` is reachable by typing `rampur`).
    try {
      const batch = await prisma.place.findMany({
        where: {
          nameNorm: stage.nameNorm,
          ...COUNTRY_SCOPE,
          ...kindWhere,
          AND: stage.narrowing,
        },
        select: CANDIDATE_COLUMNS,
        orderBy: BASE_ORDER,
        take: overfetch - candidates.length,
      })
      candidates.push(...batch)
    } catch (error) {
      // Naming the stage is the difference between "search is down" and "the
      // substring stage is down" — a connection problem versus a missing trigram
      // index. The caller turns this into the 500 the picker reads as
      // "Search unavailable"; the cause is preserved for the log.
      throw new Error(`place search stage "${stage.tier}" failed`, { cause: error })
    }
  }

  return candidates
}

// ─── Dedupe ───────────────────────────────────────────────────────────────

/**
 * `(nameNorm, county, district, state)` — the tuple that identifies a
 * settlement independently of which OSM object described it. `@@unique([osmType,
 * osmId])` keeps a node and a relation for the same village as two rows, and
 * without this collapse both would consume result slots and read as duplicates
 * to the practitioner.
 *
 * A null `county` interpolates as the literal `"null"`, which is fine: it is a
 * stable value and cannot collide with a real county name, since a real one
 * would have to be the string `"null"`.
 */
function candidateDedupeKey(candidate: PlaceCandidate): string {
  return [
    candidate.nameNorm,
    candidate.county,
    candidate.district,
    candidate.state,
  ].join('|')
}

/**
 * Collapses duplicate settlements, keeping the lowest `kindRank` per
 * Requirement 3.6 — if the same place appears as both a `town` and a `village`
 * row, the town is the more useful description.
 *
 * Position comes from the *first* member of a group, so a survivor promoted on
 * `kindRank` inherits its group's position and does not jump the ranking.
 *
 * The promotion is defensive rather than load-bearing: the dedupe key is built
 * from exactly the columns every stage filters on — `nameNorm` decides the tier,
 * and `county`/`district`/`state` decide the narrowing — so every member of a
 * group is retrieved by the same set of stages, and within a stage `BASE_ORDER`
 * already delivers rows `kindRank`-ascending, making the first member the
 * lowest. Comparing anyway keeps Requirement 3.6 true of this function itself
 * instead of true only as long as `BASE_ORDER` leads with `kindRank`.
 *
 * This is also what makes the phrase and token families safe to concatenate: a
 * row retrieved by both (a settlement whose full name is the phrase, sitting in
 * a district the query also names) collapses here to one result at its
 * phrase-tier position.
 */
function dedupeByLowestKindRank(candidates: PlaceCandidate[]): PlaceCandidate[] {
  const survivors = new Map<string, PlaceCandidate>()
  const keyOrder: string[] = []

  for (const candidate of candidates) {
    const key = candidateDedupeKey(candidate)
    const incumbent = survivors.get(key)
    if (incumbent === undefined) {
      survivors.set(key, candidate)
      keyOrder.push(key)
    } else if (candidate.kindRank < incumbent.kindRank) {
      survivors.set(key, candidate)
    }
  }

  return keyOrder.map((key) => survivors.get(key) as PlaceCandidate)
}

// ─── Serialization ────────────────────────────────────────────────────────

/**
 * The display string the picker's trigger and the form's `placeLabel` both
 * show: `"<name>, <county ?? district>, <state>"`.
 *
 * `county` is the tehsil and the more specific parent, so it wins when present
 * (97.5% of rows); the 2.5% without one fall back to the district rather than
 * rendering an orphan `", ,"`. The `||` also absorbs an empty-string county,
 * which `??` would let through into exactly that broken label.
 */
function buildLabel(candidate: PlaceCandidate): string {
  const parent = candidate.county || candidate.district
  return `${candidate.name}, ${parent}, ${candidate.state}`
}

/**
 * Maps a retrieved row onto the wire contract.
 *
 * Two things matter here:
 *
 *   - `.toNumber()` on both coordinates. Prisma `Decimal` serializes as
 *     `{"s":1,"e":1,"d":[...]}`, which JSON.parse would hand the compute form a
 *     coordinate it cannot use — a bug that only surfaces once the value
 *     reaches the ephemeris. `Decimal(9,7)`/`Decimal(10,7)` fits an IEEE-754
 *     double exactly at this magnitude, so nothing is lost.
 *   - `nameNorm` and `kindRank` are dropped. They exist to rank and dedupe
 *     server-side; the client has no use for them and must not start ranking.
 */
function toPlaceResult(candidate: PlaceCandidate): PlaceResult {
  return {
    id: candidate.id,
    name: candidate.name,
    // `Place.kind` is a plain String column; only the loader writes it, and it
    // writes what `toPlaceKind()` validated. Narrowing again here would need a
    // fallback for a value that cannot exist.
    kind: candidate.kind as PlaceKind,
    state: candidate.state,
    district: candidate.district,
    county: candidate.county,
    latitude: candidate.latitude.toNumber(),
    longitude: candidate.longitude.toNumber(),
    label: buildLabel(candidate),
  }
}

// ─── Route handler ────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await resolveRequestUser(request)
  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Sign in required.' },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(request.url)
  const parsed = PlaceSearchParamsSchema.safeParse(readSearchParams(searchParams))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { q, limit, includeHamlets } = parsed.data
  const { phrase, nameToken, narrowTokens } = parsePlaceQuery(q)

  // Short-circuit BEFORE any database work, and do it against the whole
  // normalized query rather than against its first word. A two-character FIRST
  // token is common in real names — `"St. Thomas Mount"`, `"B. Kothakota"` — and
  // rejecting a 16-character query because of it told the user to type more
  // while they were already typing the right thing.
  //
  // The guard itself still has to exist: a pattern shorter than a trigram cannot
  // use the `gin_trgm_ops` index, so `"ra"` would mean a sequential scan over
  // 272k rows for a result the picker would not show anyway. `phrase` is the
  // longest pattern any stage will use, so it is the right thing to measure —
  // and `nameToken` grew until it either cleared the threshold or consumed the
  // whole phrase, so `nameToken` is at least this long too whenever we proceed.
  if (phrase.length < MIN_PLACE_QUERY_LENGTH) {
    const tooShort: PlaceSearchResponse = {
      results: [],
      truncated: false,
      hamletsExcluded: !includeHamlets,
      reason: 'query_too_short',
    }
    return NextResponse.json(tooShort)
  }

  // Shared by every retrieval stage: `AND: narrowing` composes with any
  // `nameNorm` operator, and `...kindWhere` spreads in the hamlet exclusion.
  const narrowing = buildNarrowing(narrowTokens)
  const kindWhere = buildKindWhere(includeHamlets)

  let candidates: PlaceCandidate[]
  try {
    candidates = await retrieveCandidates({
      stages: buildStages(phrase, nameToken, narrowing),
      kindWhere,
      overfetch: limit * OVERFETCH,
    })
  } catch (error) {
    // Search degrading must never block chart computation: the picker reads a
    // 500 as "Search unavailable" and falls back to manual coordinate entry.
    console.error('Place search query failed:', error)
    return NextResponse.json({ error: 'Place search failed' }, { status: 500 })
  }

  const deduped = dedupeByLowestKindRank(candidates)

  // Derived from the over-fetch surplus rather than a `COUNT` query: the stages
  // fetched up to `limit * OVERFETCH` between them, so a post-dedupe list longer
  // than `limit` proves more matches exist without a second round trip. It can
  // under-report when dedupe consumes the entire surplus, which is the right
  // way to be wrong — the hint appears only when narrowing would actually help.
  const truncated = deduped.length > limit

  const response: PlaceSearchResponse = {
    results: deduped.slice(0, limit).map(toPlaceResult),
    truncated,
    // Reported even when no hamlet was actually filtered out: the picker uses
    // it to offer the toggle, and it cannot know whether a hamlet was waiting.
    hamletsExcluded: !includeHamlets,
  }

  return NextResponse.json(response)
}
