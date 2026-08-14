# Requirements Document: Gochar Range & PD Integration

## Introduction

The current Gochar view reports the grahas' positions only at the moment a chart
is computed. Practitioners also need dated Gochar for an arbitrary period, and
need to inspect the transits active during a specific Vimshottari
Pratyantardasha (PD).

This feature adds deterministic date-range Gochar using the same Swiss Ephemeris,
Lahiri ayanamsa, and Parashari/Jagannatha Hora conventions already used by the
compute engine. It reports exact sign/house occupancy intervals; it does not
interpret their effects.

## Resolved Decisions

These were settled before design and are binding on the requirements below.

1. **All instants are UTC.** Computation, transport, and display are UTC
   throughout. No per-chart or per-user local-time rendering. See Requirement 8
   for the practitioner-facing consequence this creates.
2. **The Moon is opt-in.** The eight non-Moon grahas are always returned; the
   Moon is included only when explicitly requested. Rationale: the Moon changes
   sign roughly every 2.25 days, producing ~162 intervals per year — about 70%
   of both the row count and the ephemeris search cost of a full nine-graha
   range. Excluding it by default takes a one-year request from ~230 intervals
   to ~60. This also matches existing engine behaviour: the established transit
   path (`engine/durationAnalysis/transitOverlay.ts`) already reasons over
   Saturn, Jupiter, Rahu, and Ketu only.
3. **Houses are whole-sign.** Consistent with the existing `computeTransits`
   reckoning; no bhava/cusp house model is introduced.

## Non-Goals

- Transit interpretations, predictions, scoring, or LLM analysis.
- Planetary station dates, transit aspects to natal planets, or transit-over-natal
  conjunction analysis.
- Changes to persisted chart data, Prisma schema, or database migrations.
- Changes to the existing current-position `get_transits` MCP tool.
- Chara Dasha integration; this feature applies only to Vimshottari PDs.
- Local-time or per-timezone rendering of Gochar instants (see Decision 1).
- Bhava/cusp-based house reckoning (see Decision 3).

## Glossary

- **Gochar_Range** — all dated graha occupancy intervals overlapping one requested
  range.
- **Occupancy_Interval** — one contiguous period during which a graha occupies a
  sidereal sign, and therefore one whole-sign house from natal Moon and natal
  Lagna.
- **PD** — Vimshottari Pratyantardasha, nested within a Mahadasha and Antardasha.
- **Ingress** — the exact instant a graha enters a sidereal sign. A retrograde
  re-entry is a separate ingress and creates a separate interval.
- **Default_Grahas** — the eight grahas always returned: Sun, Mars, Mercury,
  Jupiter, Venus, Saturn, Rahu, and Ketu. Rahu/Ketu retain the node treatment
  already used by the compute engine.
- **Nine_Grahas** — Default_Grahas plus the Moon; returned only when the Moon is
  explicitly opted in.
- **Requested_Grahas** — the set actually returned for a given request: either
  Default_Grahas or Nine_Grahas.
- **Range_Bounds** — the resolved inclusive start instant and exclusive end
  instant, in UTC, that the engine actually computed over.

## Requirements

### Requirement 1 — Deterministic JHora/PVR-aligned Gochar range

**User story:** As a practitioner, I want to inspect Gochar over a chosen period,
so that I can review actual planetary house movement using the same model as the
native chart.

**Acceptance criteria:**

1. WHEN a valid range and natal Moon/Lagna context are supplied, THEN the Gochar
   engine SHALL return intervals for every graha in Requested_Grahas.
2. THE Gochar engine SHALL use Swiss Ephemeris sidereal positions with the Lahiri
   ayanamsa, matching the existing chart-compute and current-Gochar calculations.
3. FOR each interval, THE engine SHALL return the graha, sidereal sign name and
   number, whole-sign house from natal Moon, whole-sign house from natal Lagna,
   and exact UTC ISO-8601 start and end instants.
4. THE house numbers in 1.3 SHALL be computed by whole-sign reckoning from the
   natal Moon sign and natal Lagna sign respectively, identical to the existing
   `computeTransits` derivation. No bhava/cusp house model SHALL be used.
5. THE engine SHALL determine every sign boundary through ephemeris-based search
   and bisection refinement; it SHALL NOT estimate ingress instants from average
   planetary motion.
6. THE engine SHALL be pure with respect to application state: it SHALL make no
   LLM call, database write, network request, or persisted-chart mutation.
7. WHEN identical inputs are supplied twice, THEN the returned range data SHALL
   be deterministic and ordered consistently.

### Requirement 2 — Range semantics, Moon opt-in, and retrograde handling

**User story:** As a practitioner, I want dated rows whenever a graha changes
houses, including when it returns during retrograde motion, so that a period does
not hide materially different transit phases.

**Acceptance criteria:**

1. THE public range inputs SHALL be `dateFrom` and `dateTo`. EACH SHALL accept
   either a `YYYY-MM-DD` calendar date or a full ISO-8601 UTC instant, so that a
   caller needing sub-day precision (see Requirement 4.2) is not forced to widen
   its range to whole days.
2. WHEN a bare `YYYY-MM-DD` is supplied, THEN `dateFrom` SHALL resolve to
   `00:00:00.000Z` of that date and `dateTo` SHALL resolve to the following UTC
   midnight, making `dateTo` inclusive as a calendar date and the resolved end
   bound exclusive.
3. WHEN a full ISO-8601 UTC instant is supplied, THEN it SHALL be used verbatim
   as the bound, with the start inclusive and the end exclusive.
4. ALL instants in the request, computation, response, and display SHALL be UTC.
   THE engine SHALL NOT apply a chart, server, or browser timezone offset.
5. THE Moon SHALL be excluded by default. THE public inputs SHALL provide an
   `includeMoon` boolean defaulting to `false`; WHEN `false` the response SHALL
   cover Default_Grahas, and WHEN `true` it SHALL cover Nine_Grahas.
6. WHEN the requested range starts or ends within an Occupancy_Interval, THEN the
   returned interval SHALL be clipped to the resolved Range_Bounds.
7. WHEN a graha leaves a sign and subsequently re-enters that sign because of
   retrograde motion, THEN each contiguous stay SHALL be returned as its own
   dated Occupancy_Interval; the engine SHALL NOT merge those intervals.
8. WHEN retrograde motion near a station produces an Occupancy_Interval shorter
   than one day, THEN that interval SHALL still be returned. THE engine SHALL NOT
   apply a minimum-duration filter, since a silently dropped interval would break
   the coverage guarantee in 2.9.
9. FOR each graha in Requested_Grahas, THE returned intervals SHALL be
   chronological, non-overlapping, and collectively cover the complete resolved
   Range_Bounds. THIS guarantee is scoped to Requested_Grahas only; a graha
   absent because the Moon was not opted in SHALL NOT be treated as a coverage
   violation.
10. THE maximum inclusive requested span SHALL be one year WHEN `includeMoon` is
    `true`, and three years WHEN `includeMoon` is `false`. A request exceeding
    the applicable limit SHALL fail validation before ephemeris range
    computation. THE two-tier limit exists because the Moon is the dominant cost
    driver (Decision 2); excluding it makes multi-year reviews of the slow
    grahas — the common Saturn/Rahu use case — affordable.
11. WHEN `dateFrom` is at or after the resolved exclusive end bound, malformed, or
    otherwise invalid, THEN the caller SHALL receive a validation error and no
    partial Gochar result.

### Requirement 3 — Gochar range experience in the Transits tab

**User story:** As a practitioner, I want to view Gochar for any supported period
from the Gochar view, so that I can move beyond the current-position snapshot.

**Acceptance criteria:**

1. THE range experience SHALL be added to the existing **Gochar section of the
   Transits tab** (`TransitsView`), not as a new top-level tab.
2. THE existing current Gochar position table SHALL remain the default view of
   that section.
3. THE Gochar section SHALL provide accessible `dateFrom` and `dateTo` controls,
   an accessible `includeMoon` control defaulting to unchecked, and a clear
   action to request range Gochar.
4. THE `includeMoon` control SHALL indicate that enabling it substantially
   increases the number of returned rows and reduces the maximum span to one year
   (Requirement 2.10).
5. WHEN the range request succeeds, THEN the section SHALL render an interval
   table grouped by graha, showing each interval's start, end, sign, house from
   Moon, and house from Lagna.
6. THE UI SHALL identify the data as Lahiri sidereal Gochar, SHALL label all
   displayed instants as UTC, and SHALL state which grahas were included.
7. WHILE a request is pending, THE action control SHALL expose a disabled/loading
   state; WHEN it fails, THE UI SHALL present a readable error without discarding
   the user's selected dates or `includeMoon` choice.
8. THE range result table SHALL remain usable at narrow viewport widths through
   responsive layout or horizontal table scrolling.

### Requirement 4 — Vimshottari PD Gochar

**User story:** As a practitioner, I want to open Gochar directly for a PD, so
that I can see every house occupied by each graha during that sub-period.

**Acceptance criteria:**

1. EACH displayed Vimshottari PD row SHALL provide a clearly labelled `View
   Gochar` action. PD rows are currently non-interactive elements and SHALL
   become properly focusable controls to carry this action.
2. WHEN the practitioner selects that action, THEN the application SHALL request
   Gochar using the PD's exact UTC start and end instants — passed as ISO-8601
   instants per Requirement 2.1, NOT truncated to calendar dates — so that the
   returned intervals cannot extend beyond the true PD boundaries.
3. THE expanded PD result SHALL identify the MD–AD–PD chain and the exact UTC
   range used.
4. IF a graha occupies more than one house during the PD, THEN the table SHALL
   show each house occupancy as a separate row with its applicable UTC dates.
5. AT most one PD Gochar expansion SHALL be open at a time, consistent with the
   existing single-expansion behaviour for Mahadasha and Antardasha rows, so that
   the dasha hierarchy remains readable.
6. THE PD Gochar request SHALL default to `includeMoon = false`; the practitioner
   MAY opt the Moon in for a PD.
7. WHEN a PD range cannot be loaded, THEN the PD row SHALL show an accessible
   error state and remain available for retry.
8. THE span limit in Requirement 2.10 SHALL never block a valid PD request: the
   longest possible Vimshottari PD is Venus–Venus–Venus at
   `20 × (20/120) × (20/120)` years ≈ 203 days, which is inside even the
   one-year `includeMoon = true` limit.

### Requirement 5 — HTTP API

**User story:** As a frontend or integration consumer, I want a deterministic
Gochar endpoint, so that all interfaces use one validated implementation.

**Acceptance criteria:**

1. THE application SHALL expose `POST /api/gochar` as a deterministic, read-only
   computation endpoint.
2. THE endpoint SHALL require an authenticated caller.
3. THE request SHALL contain `dateFrom`, `dateTo`, an optional `includeMoon`
   boolean defaulting to `false`, and exactly one chart source: `unifiedChartId`
   for a saved chart or `birthData` for an unsaved calculation.
4. WHEN `unifiedChartId` is used, THEN the endpoint SHALL verify that the chart
   belongs to the authenticated user; an absent or non-owned chart SHALL return
   `404`.
5. WHEN request validation fails, THEN the endpoint SHALL return `400` with
   field-level validation details. WHEN valid chart context cannot be derived,
   THEN it SHALL return an appropriate non-success response without leaking data.
6. A successful response SHALL include the normalized request echo, the resolved
   inclusive-start and exclusive-end UTC Range_Bounds, the Lahiri ayanamsa
   identifier, the ordered Occupancy_Intervals, and an explicit
   `includedGrahas: string[]` plus `moonIncluded: boolean`.
7. THE `includedGrahas` and `moonIncluded` fields in 5.6 SHALL be present on every
   successful response, so that a consumer can never mistake an
   intentionally-omitted Moon for a Moon that did not change house during the
   period.
8. THE endpoint SHALL not persist a chart, update a chart, create a pipeline run,
   or invoke a paid analysis route.

### Requirement 6 — MCP `get_gochar` tool

**User story:** As a Claude Desktop practitioner, I want to request dated Gochar
through MCP, so that I can use it in a read/compute-only consultation workflow.

**Acceptance criteria:**

1. THE MCP server SHALL expose a `get_gochar` tool accepting required `dateFrom`
   and `dateTo`, an optional `includeMoon` defaulting to `false`, plus exactly one
   standard chart reference: `chartId` or `birthData`.
2. THE tool SHALL delegate to `POST /api/gochar`; it SHALL not import compute
   engine logic directly.
3. THE tool SHALL return the API's deterministic Gochar range data without LLM
   interpretation.
4. THE tool description SHALL state explicitly that the Moon is excluded unless
   `includeMoon` is set, that all instants are UTC, and that the response's
   `includedGrahas` field is authoritative — so an absent Moon is never narrated
   as "the Moon did not change house in this period".
5. `/api/gochar` SHALL be added to the `ALLOWED_POST_ROUTES` allow-list in
   `tests/mcp-cost-guard.test.ts` in this feature's own change, mirroring the
   precedent set by the `marriage-matchmaking` and `user-management` specs. The
   guard is a static source scan, not a runtime check; paid pipeline routes SHALL
   remain absent from `mcp/src`.
6. THE existing `get_transits` tool SHALL retain its current snapshot behavior;
   `get_gochar` is the date-range counterpart.

### Requirement 7 — Quality, accessibility, and regression protection

**User story:** As a maintainer, I want this feature to be accurate, safe, and
consistent with existing chart behavior.

**Acceptance criteria:**

1. Unit tests SHALL verify range clipping, chronological/non-overlapping interval
   ordering, complete per-graha coverage of Range_Bounds, whole-sign house
   reckoning, and separate retrograde re-entry intervals including sub-day ones.
2. Unit tests SHALL verify that `includeMoon = false` returns exactly
   Default_Grahas, that `includeMoon = true` returns Nine_Grahas, and that the
   coverage guarantee is asserted per returned graha rather than against a fixed
   count of nine.
3. Unit tests SHALL verify that bare-date and full-ISO-instant bounds resolve as
   specified in Requirements 2.2 and 2.3, and that no timezone offset is applied
   at any layer.
4. API tests SHALL cover authentication, ownership isolation, source exclusivity,
   malformed/reversed bounds, same-day requests, the `includeMoon` default, and
   both tiers of the span limit in Requirement 2.10.
5. UI tests SHALL cover range loading/error states, the `includeMoon` default and
   its persistence across a failed request, and PD-action-to-exact-instant
   wiring.
6. MCP tests SHALL verify registration, request forwarding, `includeMoon`
   defaulting, and cost-guard compliance.
7. A practitioner-facing manual check SHALL compare a fixed Gochar range against
   Jagannatha Hora/PVR reference output before release. THE comparison SHALL be
   performed in UTC, converting the JHora reading to UTC first (see Requirement
   8), so that a local-time display difference is not misread as an ephemeris
   defect.
8. Documentation updated with implementation SHALL state that this feature adds
   positional Gochar timing only, in UTC, and does not add transit interpretation
   or persistence.

### Requirement 8 — UTC disclosure

**User story:** As a practitioner cross-checking against Jagannatha Hora, I want
to know the reported instants are UTC, so that a one-day boundary difference does
not look like a calculation error.

**Acceptance criteria:**

1. ALL Gochar instants SHALL be reported in UTC across the engine, API, MCP, and
   UI (Decision 1).
2. THE UI SHALL label displayed Gochar instants as UTC at the point of display,
   not only in surrounding help text.
3. THE feature documentation SHALL note that because Jagannatha Hora displays
   ingress in local time, an ingress occurring near local midnight may appear
   under an adjacent calendar date in JHora, and that this is a display-timezone
   difference rather than a positional disagreement.
4. THE MCP tool description SHALL state that returned instants are UTC
   (Requirement 6.4).
