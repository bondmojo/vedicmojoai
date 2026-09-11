# Requirements Document: Place Location Picker

## Introduction

Birth location is currently entered as two raw decimal numbers. `app/page.tsx:403-414`
renders `<Input type="number" step="0.0000001">` for latitude and longitude, and
`app/unified-charts/page.tsx:124-283` (`ComputeForm`) renders the same pair with
`step="0.0001"`. A practitioner taking a client's birth details over the phone has to
look up coordinates for "Alandi, Khed taluka, Pune district" somewhere else, transcribe
seven decimal places, and hope they didn't transpose a digit. A single wrong digit in the
third decimal moves the birth point ~100 m (harmless); a wrong digit in the first moves it
~100 km and silently changes the lagna, the house cusps, and every time-based special
lagna. The form cannot detect this, because any number in `[-90, 90]` is valid input.

This feature replaces coordinate entry with a **searchable place picker** backed by an
offline OpenStreetMap-derived dataset of Indian settlements. The practitioner types a
place name; the dropdown shows the place as primary text with its tehsil, district and
state as secondary text; selecting it fills latitude, longitude and timezone
deterministically.

**Source dataset.** Four NDJSON files (`place_city`, `place-town`, `place-village`,
`place-hamlet`) totalling 348,845 rows / ~160 MB, surveyed at
`~/Documents/Mohit/in`. Field coverage across all rows:

| Field | Coverage | Use |
|---|---|---|
| `address.state` | 100.0% | Secondary text, disambiguation |
| `address.state_district` | 99.5% | Secondary text (district) |
| `address.county` | 97.5% | Secondary text (tehsil / taluka / mandal) |
| `address.city` | **1.5%** | Not usable as a general field |
| `location: [lon, lat]` | 100.0% | The coordinates |
| `osm_id` + `osm_type` | 100.0% | Stable identity |

After discarding unusable rows, **272,499 rows across 36 states** remain: 545 cities,
4,148 towns, 171,406 villages, 96,400 hamlets. Measured by replaying the full dataset
through `lib/places-normalize.ts`, the 76,346 discards break down as:

| Reason | Rows | What these are |
|---|---|---|
| no name field | 75,435 | Unnamed OSM place nodes: only `state` / `state_district` / `county`, no settlement name and no `other_names`. Nothing to recover. |
| no district | 899 | Neither `state_district` nor `county` |
| junk name | 11 | All eleven are the literal string `---` |
| no state | 1 | |
| bad coordinates | 0 | |

Note that junk names are a rounding error, not a real category — the overwhelming
majority of discards (98.8%) are rows that carry no settlement name at all.

**Why the secondary text is tehsil + district + state, not district + city.** `address.city`
is present on only 1.5% of rows — effectively only on the cities themselves. OSM carries no
"nearest city" for a village, so a District + City subtext would render blank for ~98% of
search results. Tehsil + district + state is the administrative hierarchy that is actually
present, and state is load-bearing:

```
Rampur   town      Rampur Naikin Tahsil · Sidhi            · Madhya Pradesh
Rampur   town      Rampur               · Shimla           · Himachal Pradesh
Rampur   town      Tapan                · Dakshin Dinajpur · West Bengal
Rampur   town      —                    · Rampur           · Uttar Pradesh
Rampur   village   Armoor mandal        · Nizamabad        · Telangana     (+40 more)
```

Without the state, a practitioner cannot tell these apart.

## Non-Goals

Explicitly **out of scope**:

- **Online geocoding.** No Nominatim/Google/Mapbox calls at runtime. The dataset is
  ingested once and queried locally. Search must work with no outbound network.
- **Reverse geocoding.** Deriving a place name from coordinates (e.g. labelling the
  ~4,900 already-saved charts that only have lat/long) is not attempted.
- **Places outside India.** The dataset is India-only. Non-India births continue to use
  manual coordinate entry, which is therefore **retained, not removed**.
- **Regional-script and legacy-name search.** The dataset's `other_names` object carries
  Hindi/Tamil/Bengali names and `old_name` (Bangalore → Bengaluru). Indexing it is a
  clear follow-up, not v1.
- **Historical timezone / DST resolution.** The app stores a numeric UTC offset, and
  every Indian state is IST (+5.5). Pre-1942 Indian local-mean-time and the 1942-45 DST
  episodes are not modelled — the same limitation the app already has.
- **Map / pin-drop selection.** Text search only.
- **Place administration UI.** No CRUD for `Place` rows; corrections are made by
  re-running ingestion against a corrected dataset.
- **Population-based ranking.** `population` is present on only a fraction of rows and is
  explicitly not required; ranking uses settlement kind (see Requirement 3).
- **Committing the dataset to the repository.** 160 MB of NDJSON stays outside version
  control (Requirement 2.6).

## Glossary

- **Place_Store** — the new `Place` Prisma model and its Postgres table `place`.
- **Place_Loader** — `scripts/load-places.ts`, the idempotent NDJSON ingestion script.
- **Place_Search_API** — `GET /api/places`.
- **Place_Picker** — `app/components/PlacePicker.tsx`, the reusable combobox.
- **Kind** — settlement class: `city` | `town` | `village` | `hamlet`.
- **Kind_Rank** — integer ordering of Kind for search relevance (city=1 … hamlet=4).
- **Name_Norm** — the normalized, searchable form of a place name (lowercased,
  diacritics stripped, whitespace collapsed).
- **Phrase** — the whole search query normalized: `"Rampur, Himachal"` →
  `"rampur himachal"`. Matched against Name_Norm as one string, because a multi-word
  settlement name is one name.
- **Name_Token** — the leading token(s) of a query treated as the settlement name for
  administrative narrowing, grown until it reaches the 3-character floor.
- **Narrow_Tokens** — the remaining tokens, kept raw and matched against
  `state` / `district` / `county`.
- **Tehsil** — the sub-district administrative unit, carried in OSM as
  `address.county`; regionally called taluka, taluk, mandal, or tahsil.
- **Selected_Place** — the client-side object a picker selection yields:
  `{ id, name, kind, state, district, county, latitude, longitude, label }`.
- **Manual_Coords** — the retained latitude/longitude inputs, shown behind a
  disclosure, used for non-India births and unlisted places.
- **Chart_Hash** — the existing SHA-256 dedupe key over
  `{source, date, time, timezone, latitude, longitude, sunriseMode}`
  (`lib/chart-mapper.ts:83-91`).

## Requirements

### Requirement 1 — Place reference data model

**User story:** As an engine maintainer, I want Indian settlements in a queryable table
with a stable identity, so that search is fast, offline, and re-ingestion is safe.

**Acceptance criteria:**
1. A `Place` model SHALL be added to `prisma/schema.prisma` with fields: `id`,
   `osmType`, `osmId`, `name`, `nameNorm`, `kind`, `kindRank`, `state`, `district`,
   `county` (nullable), `postcode` (nullable), `latitude`, `longitude`,
   `countryCode` (default `"in"`), `createdAt`.
2. `latitude` SHALL be `Decimal @db.Decimal(9,7)` and `longitude`
   `Decimal @db.Decimal(10,7)`, preserving the 7-decimal precision the compute form
   already accepts.
3. `@@unique([osmType, osmId])` SHALL provide the stable natural key that makes
   re-ingestion idempotent.
4. `Place` SHALL carry **no `userId`** and SHALL NOT relate to `User` — it is shared
   reference data, not user content.
5. `kindRank` SHALL be persisted as a column (city=1, town=2, village=3, hamlet=4) so
   relevance ordering is expressible as a Prisma `orderBy` without raw SQL.
6. The migration SHALL create **two** indexes on `nameNorm` — a btree with
   `text_pattern_ops` (named `place_nameNorm_prefix_idx`, serving prefix `LIKE 'q%'`)
   and a GIN with `gin_trgm_ops` (named `place_nameNorm_trgm_idx`, serving substring
   `LIKE '%q%'`) — plus btree indexes on `state`, `district` and `kindRank`.
   `CREATE EXTENSION IF NOT EXISTS pg_trgm` SHALL be prepended to the same migration via
   `--create-only`. Both name indexes are required: the target collation is `en_US.utf8`,
   under which a default btree cannot serve `LIKE 'q%'`, and the planner will not choose
   the GIN index for prefix queries (measured: 19 ms seq scan vs 0.35 ms btree index scan
   for a prefix matching one row in 40k). Verified target: PostgreSQL 16.14, `pg_trgm` 1.6.
7. `Place` SHALL NOT be added to the `DELETE /api/unified-charts/[id]` cascade
   transaction — no chart owns a place.

### Requirement 2 — Ingestion

**User story:** As an operator, I want to load the dataset with one command and re-run it
safely, so that setting up a new environment or correcting the data is routine.

**Acceptance criteria:**
1. `scripts/load-places.ts` SHALL be runnable via `npm run db:load-places` and accept
   `--dir <path>` (the directory holding the four NDJSON files) and `--kinds
   <csv>` (default: all four).
2. The loader SHALL stream each file line-by-line and SHALL NOT read a whole file into
   memory (the largest is 91 MB).
3. A row SHALL be **skipped**, and counted under a named reason, when any of the
   following holds: `resolvePlaceName` returns null (`noName`); the resolved name is
   junk per `isJunkPlaceName` (`junkName`); `address.state` is absent (`noState`);
   both `address.state_district` and `address.county` are absent (`noDistrict`);
   `location` is not a two-number array within valid coordinate ranges
   (`badLocation`). The loader SHALL report per-file counts of rows read, rows loaded,
   and rows skipped by each reason.
4. The place name SHALL be resolved by `resolvePlaceName` as `name`, falling back in
   order to `address.hamlet`, `address.village`, `address.town`, `address.city`,
   `address.municipality`. Junk detection SHALL be defined as
   `normalizePlaceName(name) === ''` rather than as its own punctuation blacklist, so
   the two cannot disagree about what is empty.
5. Rows SHALL be written with `createMany({ skipDuplicates: true })` in batches of
   5,000, so that re-running the loader over the same dataset SHALL leave the row count
   unchanged and SHALL NOT throw.
6. The dataset SHALL remain outside the repository. `--dir` SHALL default to
   `process.env.PLACES_DATA_DIR`, `.env.example` SHALL document that variable, and the
   NDJSON files SHALL NOT be committed. Because nothing reads NDJSON at runtime, the
   files SHALL NOT be added to `outputFileTracingIncludes` in `next.config.mjs`.
7. Given the surveyed dataset, a full load SHALL yield **272,499** rows (545 / 4,148 /
   171,406 / 96,400 by kind); a `--kinds city,town,village` load SHALL yield
   **176,099**. These figures were produced by replaying all 348,845 source rows through
   the shipped `lib/places-normalize.ts`, so they are exact, not estimates.
8. Because `skipDuplicates` cannot *correct* an existing row, the loader SHALL accept an
   explicit `--truncate` flag that empties the table first, and SHALL do so with
   `TRUNCATE TABLE "place"` rather than a 272,499-row `deleteMany({})` (which deletes
   row by row and leaves one dead tuple per row for autovacuum, immediately before the
   run inserts 272,499 fresh rows into that bloated heap). A successful load SHALL end
   with `ANALYZE "place"`, because `createMany` does not update `pg_statistic` and the
   ranked search depends on the planner choosing `place_nameNorm_prefix_idx` rather than
   a sequential scan. These two statements are the loader's only raw SQL and are exempt
   from Requirement 3.10: both are maintenance DDL rather than queries, both are frozen
   string constants with **no interpolation of any kind**, and Prisma exposes no
   equivalent for either.

### Requirement 3 — Search API

**User story:** As a practitioner typing a place name, I want the right settlement in the
first few results, so that I am not scrolling through forty identically-named villages.

**Acceptance criteria:**
1. `GET /api/places?q=&limit=&includeHamlets=` SHALL be added, SHALL resolve the caller
   with `resolveRequestUser` (`lib/auth.ts`), and SHALL return 401 when unauthenticated.
2. Input SHALL be Zod-validated: `q` string, `limit` integer 1-50 default 20,
   `includeHamlets` boolean default `false`. Invalid input SHALL return 400 with
   `details`.
3. WHEN the **whole normalized query** — the `phrase`: `q` with punctuation folded to
   spaces, tokens rejoined — is shorter than **3 characters**, THEN the route SHALL
   return `{ results: [], reason: 'query_too_short' }` with status 200 and SHALL NOT
   query the database. The threshold SHALL be measured against the phrase and **not**
   against the leading name token: a two-character first token is ordinary in real
   names (`"St. Thomas Mount"`, `"B. Kothakota"`), and rejecting a 16-character query
   on that basis told the practitioner to type more while they were already typing the
   right thing. The floor itself still has to exist: a trigram is three characters, so
   a shorter pattern cannot use `place_nameNorm_trgm_idx` and would degrade to a
   sequential scan over 272,499 rows.
4. `q` SHALL be read as **both** a settlement name and a name-plus-narrowing, because
   nothing in the text says which — `"rampur bushahr"` is one town's full name,
   `"rampur shimla"` is a town plus its district. Parsing SHALL live in
   `parsePlaceQuery()` (`lib/places-normalize.ts`, alongside the normalizer whose output
   `nameNorm` was written with) and SHALL split on commas and whitespace to yield:
   - `phrase` — the whole normalized query, matched against `nameNorm` with **no**
     administrative narrowing;
   - `nameToken` — the leading token, **grown** by absorbing following tokens until it
     reaches 3 characters, then stopping (so `"St. Thomas Mount"` yields `st thomas`,
     while `"rampur shimla"` still yields `rampur` and keeps `shimla` for narrowing);
   - `narrowTokens` — the tokens `nameToken` did not absorb, kept **raw** because the
     administrative columns hold display text, each of which SHALL additionally match
     (case-insensitive contains) at least one of `state`, `district`, or `county`.

   So `"rampur shimla"` and `"rampur, himachal"` both narrow to the Himachal Rampur,
   and `"rampur bushahr"` reaches the town actually named that.
5. Results SHALL be ordered by **six relevance tiers**, highest first: `phrase-exact`,
   `phrase-prefix`, `phrase-substring` (the whole `phrase` against `nameNorm`, no
   narrowing), then `token-exact`, `token-prefix`, `token-substring` (`nameToken`
   against `nameNorm`, with the `narrowTokens` narrowing applied). A phrase match
   therefore outranks a token match, including a phrase-substring match over a
   token-exact one: a row whose own name contains everything the practitioner typed
   satisfies every reading of the query. Within a tier, ordering SHALL be `kindRank`
   ascending, then `state`, then `district`, then `name`. The token tiers SHALL be
   skipped entirely when `narrowTokens` is empty — there `nameToken === phrase` and the
   three queries would be byte-identical to the phrase tiers — so a single-word query
   still costs at most three round trips. Ordering SHALL be deterministic for identical
   input.
6. Results SHALL be deduplicated on `(nameNorm, county, district, state)`, keeping the
   lowest `kindRank`, so cross-file duplicates do not consume result slots.
7. WHEN `includeHamlets` is `false`, THEN rows with `kind = 'hamlet'` SHALL be excluded
   from results; the response SHALL report `hamletsExcluded: true` so the client can
   surface the toggle.
8. The response SHALL include `truncated: boolean` (true when more matches exist than
   `limit`), enabling the "narrow your search" hint.
9. Each result SHALL carry `{ id, name, kind, state, district, county, latitude,
   longitude, label }` where `label` is the display string
   `"<name>, <county|district>, <state>"`. `latitude`/`longitude` SHALL be serialized as
   numbers, not Prisma `Decimal` objects.
10. Database access SHALL go through Prisma. Raw SQL SHALL appear only in the migration
    (Requirement 1.6) and in the Place_Loader's two maintenance statements
    (Requirement 2.8), per `.kiro/skills/database-prisma.md`. No **query** — anything
    reading or writing rows — SHALL be hand-written SQL.
11. Every retrieval tier SHALL be scoped to `countryCode: 'in'`. The dataset is
    India-only today and the column defaults to `"in"`, so this changes no current
    result; it is there so a future non-India ingest cannot silently leak rows into a
    picker whose timezone behaviour (Requirement 5.2) assumes India.

### Requirement 4 — Picker component and dropdown presentation

**User story:** As a practitioner, I want to recognise the right place at a glance, so
that I can pick it confidently without cross-checking coordinates elsewhere.

**Acceptance criteria:**
1. `app/components/PlacePicker.tsx` SHALL be a client component built on the existing
   `Popover` + `Command` primitives, matching the saved-charts combobox pattern at
   `app/page.tsx:331-370`.
2. `Command` SHALL be given `shouldFilter={false}` — filtering is server-side. (cmdk's
   default client-side filtering would silently re-filter the already-ranked results.)
3. Each result row SHALL render the place name as **primary text** and
   `"<tehsil> · <district> · <state>"` as **secondary sub-text** in a smaller, muted
   style, with the `kind` shown as a `Badge`. WHEN `county` is absent (2.5% of rows),
   THEN the secondary line SHALL degrade to `"<district> · <state>"` with no empty
   separator.
4. Search SHALL fire only at **3 or more characters**, debounced 250 ms. Below the
   threshold the dropdown SHALL show "Type at least 3 letters to search."
5. Every in-flight request SHALL be cancelled via `AbortController` when the query
   changes, so a slow earlier response cannot overwrite a newer one.
6. WHILE a request is in flight, the dropdown SHALL show a single spinner row. The
   page-level progress bar SHALL NOT be used for search.
7. WHEN the API returns no results, THEN the dropdown SHALL show "No place found" plus
   an **"enter coordinates manually"** action that reveals Manual_Coords. This escape
   hatch is mandatory: 273k rows do not cover every settlement, and the dataset is
   India-only.
8. WHEN the response has `truncated: true`, THEN a footer SHALL read "Showing top N —
   add a district or state to narrow."
9. WHEN the response has `hamletsExcluded: true`, THEN a footer toggle "Include hamlets"
   SHALL be shown (Requirement 6).
10. Keyboard navigation (arrow keys, Enter, Escape) SHALL work via cmdk defaults. The
    trigger SHALL carry `role="combobox"`; the loading row SHALL be announced via
    `aria-live="polite"`; state SHALL never be conveyed by colour alone.
11. The component SHALL be presentation-only with respect to persistence: props
    `value: Selected_Place | null`, `onSelect(place)`, `onManualEntry()`,
    `disabled?`. It SHALL NOT read or write chart state.
12. WHEN the response carries `reason: 'query_too_short'` for a query that is **not**
    locally short, THEN the dropdown SHALL say so in terms of the characters that
    actually count ("Enter at least 3 letters or numbers — punctuation does not count
    towards the search") rather than repeating the below-threshold hint. Only
    punctuation can produce that disagreement — the local check counts raw characters,
    the server's counts normalized ones — and telling the practitioner to type three
    characters would be a lie about a query that already has more. It SHALL be announced
    as a `role="status"` instruction, not styled as a failure.
13. The dropdown SHALL carry an always-visible attribution footer
    ("Place data © OpenStreetMap contributors, ODbL"), rendered last in the footer
    stack so it never displaces the truncation hint or the hamlet toggle. This resolves
    the attribution risk the design flagged: the data is queried from a private
    database rather than republished, so this is cheap insurance rather than a strict
    ODbL obligation, and the dropdown is where the data is actually consumed.

### Requirement 5 — Home page integration

**User story:** As a practitioner, I want the picker to fill in the technical fields and
still let me verify them, so that I trust the chart I am about to compute.

**Acceptance criteria:**
1. `ComputeForm` in `app/page.tsx` SHALL gain `placeId: string | null` and
   `placeLabel: string` alongside the existing `latitude`/`longitude` strings.
2. WHEN a place is selected, THEN `latitude`, `longitude`, `placeId` and `placeLabel`
   SHALL be set from the result, and `timezone` SHALL be set to `'5.5'` (every one of
   the 36 states in the dataset is IST). The timezone field SHALL remain editable.
3. The resolved coordinates SHALL be displayed **read-only** beneath the picker
   (e.g. `18.6772446, 73.8981129`) with a control to switch to Manual_Coords. Silent
   coordinate substitution is not acceptable in a chart application.
4. Manual_Coords SHALL be retained behind a disclosure ("Enter coordinates manually"),
   and the form SHALL require *either* a selected place *or* both coordinates. That
   constraint SHALL be enforced in JavaScript — `validateBirthLocation()` in
   `lib/place-form.ts` — and SHALL NOT be expressed as `required` / `min` / `max`
   attributes on the manual coordinate inputs. Those inputs sit inside a
   closed-by-default `<details>`, and browser constraint validation on a control that
   is not focusable **aborts submission without firing the submit handler**: with
   `required` present, the Compute button did nothing at all and said nothing about why.
   On failure the form SHALL therefore render a visible `role="alert"` message and
   auto-open the disclosure so the fields the message names are reachable. `onInvalid`
   on those inputs SHALL still reveal the disclosure, covering any residual native check
   (a browser's `badInput` on a number field).
5. WHEN the practitioner edits Manual_Coords after selecting a place, THEN `placeId`
   SHALL be cleared and `placeLabel` SHALL be marked as no longer authoritative, so a
   stale place name is never persisted against hand-edited coordinates.
6. A place selection changes `latitude`/`longitude` and therefore SHALL count as a
   birth-data change for the save-gating rules being implemented separately
   (`birthDataDirty`).

### Requirement 6 — Hamlet toggle

**User story:** As a practitioner, I want hamlets out of my way by default but reachable
when a client was actually born in one, so that common searches stay clean without losing
coverage.

**Acceptance criteria:**
1. Hamlets SHALL be **ingested by default** (they are 96,400 of 272,499 rows and cost
   nothing meaningful in Postgres), and SHALL be **excluded from search results by
   default**.
2. The exclusion SHALL be controlled by the `includeHamlets` request parameter
   (Requirement 3.7), so changing the decision never requires re-running ingestion.
3. The Place_Picker SHALL render an "Include hamlets" toggle in the dropdown footer
   whenever the response reports `hamletsExcluded: true`.
4. Toggling it SHALL immediately re-issue the current search with
   `includeHamlets=true`, and the choice SHALL persist for the session via
   `localStorage` under a namespaced key.
5. WHEN hamlets are included, THEN they SHALL still rank last by `kindRank` and their
   rows SHALL carry a visible `hamlet` badge.
6. The Place_Loader's `--kinds` flag SHALL still permit an operator to omit hamlets from
   ingestion entirely; the API's default exclusion SHALL be unaffected by that choice.

### Requirement 7 — Persisting the place on the chart

**User story:** As a practitioner reloading a saved client, I want to see "Alandi, Khed,
Pune" rather than two decimals, so that I can confirm I opened the right chart.

**Acceptance criteria:**
1. The selected place SHALL be persisted inside the existing `UnifiedChart.birthInput`
   JSON column as a nested `place` object
   `{ id, name, kind, state, district, county, label }`. No new scalar column SHALL be
   added to `UnifiedChart`.
2. `place` SHALL be **excluded from Chart_Hash**. The hashed input set
   (`lib/chart-mapper.ts:83-91`) SHALL remain exactly
   `{source, date, time, timezone, latitude, longitude, sunriseMode}`, so that every
   already-saved chart keeps its current hash and no backfill is required.
3. The place SHALL be threaded through as an explicit mapper argument
   (`mapComputedToUnified(chart, dashaTree, name, place?)`), setting
   `birthInput: { ...chart.input, place }`. The engine's `BirthInput` type
   (`engine/compute/types.ts:5`) SHALL NOT gain UI-facing fields — `engine/` must not
   depend on `app/` concerns.
4. `POST /api/unified-charts/from-compute` SHALL accept an optional `place` object,
   Zod-validated, and pass it to `createUnifiedChartFromBirthData`. It SHALL be
   optional so existing callers and the MCP path are unaffected.
5. WHEN `handleLoadChart` loads a chart whose `birthInput.place` is present, THEN the
   picker SHALL display that label and the coordinate readout SHALL show the stored
   coordinates. WHEN `place` is absent (every chart saved before this feature), THEN the
   form SHALL open with Manual_Coords populated and visible, with no error.
6. `lib/chart-mapper.ts:345` currently sets `birth_place: birthInput?.name` — the
   **client's name**, not a place — which propagates into `chartInputV1.meta` and thence
   into every LLM agent's context. It SHALL be corrected to
   `birthInput?.place?.label ?? undefined`.

### Requirement 8 — Second call site and shared shape

**User story:** As a maintainer, I want one picker used everywhere birth data is
collected, so that the two forms do not drift further apart.

**Acceptance criteria:**
1. The `ComputeForm` component in `app/unified-charts/page.tsx:124-283` SHALL adopt
   Place_Picker. Its raw-Tailwind inputs SHALL be reconciled with the shared component
   (the picker is built from `components/ui` primitives; the surrounding form may keep
   its existing styling).
2. The `ComputeForm` interface re-declared in `app/components/VarshaphalView.tsx:22-30`
   and consumed in `app/components/CopyForAIPanel.tsx` SHALL be updated for the new
   fields. Both SHALL continue to function when `placeId` is `null`.
3. `POST /api/compute` and `POST /api/compute/varshaphal` SHALL be unchanged — they take
   coordinates and SHALL continue to. The picker is an input-resolution layer above
   them, not a change to the compute contract.
4. Both forms SHALL share one birth-location contract, `lib/place-form.ts`
   (`PersistedBirthPlace`, `isPersistedBirthPlace`, `persistedPlaceFromSelection`,
   `validateBirthLocation`, the coordinate bounds), rather than each modelling "do we
   have a usable location, and is there trustworthy metadata to persist?" its own way.
   The module SHALL stay free of React and Prisma so it runs under the suite's
   `environment: 'node'` setup.
5. The `ComputeForm` in `app/unified-charts/page.tsx` SHALL forward the selected place
   to `POST /api/unified-charts/from-compute` — stripped by
   `persistedPlaceFromSelection()` to exactly the seven persisted display fields of
   Requirement 7.1, never the picker selection verbatim. The route's `place` schema is
   `.strict()`, so forwarding the selection's `latitude`/`longitude` would 400 the whole
   save rather than merely losing the label. Coordinates remain top-level compute
   inputs and are not part of `place`.

### Requirement 9 — Backward compatibility

**Acceptance criteria:**
1. Charts saved before this feature (no `birthInput.place`) SHALL load, recompute, save,
   and analyse exactly as they do today.
2. Paste-sourced charts (`source="paste"`) SHALL be unaffected; they have no
   `birthInput` birth data and are already rejected by `handleLoadChart`.
3. A chart saved via the picker and a chart saved with the same coordinates typed by
   hand SHALL produce the same Chart_Hash and therefore SHALL still deduplicate against
   each other.
4. WHEN the `place` table is empty (a deployment where ingestion has not been run), THEN
   the picker SHALL show "No place found" with the manual-entry escape hatch and the
   page SHALL remain fully usable. An unseeded environment SHALL NOT block chart
   computation.

### Requirement 10 — Testing

**Acceptance criteria:**
1. `tests/places-api.test.ts` SHALL cover: 401 unauthenticated; 400 invalid input; the
   3-character short-circuit against the whole phrase (asserting **no** Prisma call, and
   that a long query with a two-character first token is *not* rejected);
   exact-before-prefix-before-substring ordering and phrase-before-token ordering; the
   token tiers being skipped when there is nothing to narrow with; `kindRank`
   tie-breaking; multi-token narrowing; hamlet exclusion by default and inclusion when
   requested; dedupe; `truncated` flag. It SHALL follow the `vi.mock('@/lib/auth')` +
   `vi.mock('@/lib/db')` pattern of `tests/gochar-api.test.ts`.
2. `lib/places-normalize.test.ts` SHALL cover Name_Norm (case, macron diacritics,
   dotted initials, parentheticals, digits, whitespace), the junk-name predicate
   including the real `---` sample, `resolvePlaceName`'s fallback chain and its null
   case, and `KIND_RANK` ordering. It SHALL assert idempotence of
   `normalizePlaceName` — ingestion normalizes once and query normalizes again, so a
   non-idempotent transform would desynchronize the two.
3. `app/components/PlacePicker.test.tsx` SHALL follow the structural, no-jsdom
   convention of the existing `app/components/*.test.tsx` files and assert the
   below-threshold hint, the loading row, the empty state with escape hatch, the
   two-line row content, and the degraded secondary line when `county` is null.
4. A Chart_Hash regression test SHALL assert that adding `place` to `birthInput` leaves
   the hash for fixed coordinates unchanged (Requirement 7.2).
5. The Place_Loader SHALL have an idempotency test over a small fixture: loading twice
   yields the same row count.
6. `tests/place-schema-indexes.test.ts` SHALL statically guard `prisma/schema.prisma`
   and the `place` migration — no database connection, just `readFileSync` — because
   every one of the three things they encode is something a routine `prisma migrate dev`
   will quietly try to undo: the `text_pattern_ops` operator class does not round-trip
   (Prisma regenerates a `DROP`/`CREATE` pair the author must delete by hand), removing
   the `@@index` declarations instead makes Prisma propose dropping the live indexes
   (search then silently degrades to sequential scans, ~50x slower, with no error), and
   the hand-added `CREATE EXTENSION IF NOT EXISTS pg_trgm` cannot be regenerated at all,
   without which the GIN index creation fails outright on a fresh database. It SHALL also
   assert the extension precedes both index statements, the `(osmType, osmId)` key, and
   `@@map("place")` (the literal the loader's TRUNCATE/ANALYZE hard-code).
7. `lib/place-form.test.ts` SHALL cover the shared contract of Requirement 8.4: the
   seven-field strip (asserting `latitude`/`longitude` are dropped), the
   `expectedPlaceId` gate including omitted-vs-explicitly-`undefined`, and each
   `validateBirthLocation` outcome — empty fields with and without a selected place, and
   out-of-range coordinates.

### Requirement 11 — Documentation

**Acceptance criteria:**
1. `docs/ERD.md` SHALL document the `Place` model, its indexes, and its deliberate lack
   of a `User` relation.
2. `docs/HLD.md` SHALL document `GET /api/places`, `PlacePicker`, and the ingestion
   script.
3. `docs/DFD.md` SHALL document the place-resolution flow into chart computation.
4. `.kiro/skills/database-prisma.md` SHALL note the `pg_trgm` dependency, that `Place`
   is unowned reference data, the loader's narrow raw-SQL exemption (Requirement 2.8),
   and the static schema guard (Requirement 10.6) — otherwise the next author reads the
   loader's TRUNCATE/ANALYZE as a rule violation to "fix".
5. `.kiro/skills/nextjs-project-structure.md` SHALL note `PLACES_DATA_DIR` and that the
   dataset is deliberately not traced into the deployment bundle.
6. `Claude.md` SHALL be updated per the `Agents.md` documentation-maintenance table.
7. `README.md` SHALL document the one-off `npm run db:load-places` setup step.
8. `skills/backend/api-routes.md` SHALL list `GET /api/places`, and the frontend skills
   SHALL document `PlacePicker`, the `lib/place-form.ts` contract, and the
   disclosure/`required` rule of Requirement 5.4 together with its reason.
