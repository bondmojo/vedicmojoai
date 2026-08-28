/**
 * PlacePicker — searchable combobox over the `place` reference table, used
 * everywhere birth data is collected. Turns a typed place name into the
 * coordinates the compute engine already consumes.
 *
 * Presentation-only with respect to persistence: it owns nothing but its own
 * search state and reports a selection through `onSelect`. It never reads or
 * writes chart state, so both call sites (`app/page.tsx` and
 * `app/unified-charts/page.tsx`) stay the single owner of their form.
 *
 * Built on the same `Popover` + `Command` pairing as the saved-charts combobox
 * in `app/page.tsx`, with one deliberate difference: `shouldFilter={false}`.
 * Ranking happens server-side in `GET /api/places` — six relevance tiers, the
 * whole query as a phrase (exact → prefix → substring) ahead of the leading name
 * token plus administrative narrowing (exact → prefix → substring), `kindRank`
 * within each — and cmdk's default client-side filter would silently re-filter
 * and re-order results that are already ranked.
 *
 * See .kiro/specs/place-location-picker/design.md §Component Design.
 */

'use client'

import { useEffect, useId, useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { PlaceResult, PlaceSearchResponse } from '@/app/api/places/route'

/**
 * A picker selection is exactly a search result — the same shape the API
 * serializes, coordinates included. Aliased rather than redeclared so the
 * component and the route cannot drift.
 */
export type SelectedPlace = PlaceResult

/**
 * Search fires only at 3+ characters, matching the server-side short-circuit
 * in `GET /api/places`. Below it a substring pattern is shorter than a trigram
 * and would degrade to a sequential scan over 272k rows.
 */
const MIN_QUERY_LENGTH = 3

/**
 * Typing pause before a search is issued. Long enough that a name typed at
 * speed costs one request rather than one per letter, short enough that the
 * dropdown still feels attached to the keyboard.
 */
const DEBOUNCE_MS = 250

/**
 * A per-practitioner search preference. It intentionally belongs to the
 * picker rather than chart data: hamlet inclusion changes only which results
 * are searched, never the selected place's persisted identity.
 */
const INCLUDE_HAMLETS_STORAGE_KEY = 'vedicmojoai.place-picker.include-hamlets'

/**
 * The dataset is an OpenStreetMap (Nominatim) export, which is ODbL-licensed.
 * The rows live in a private database rather than being republished, so this is
 * courtesy rather than a strict obligation — but it is cheap insurance and the
 * dropdown footer is where the data is actually being consumed.
 *
 * See design.md §Open Risks #1.
 */
const ATTRIBUTION_TEXT = 'Place data © OpenStreetMap contributors, ODbL'

/**
 * Read lazily so server rendering (and privacy-restricted browsers where
 * storage throws) continues with the product default: hamlets excluded.
 */
function getStoredHamletPreference(): boolean {
  if (typeof window === 'undefined') return false

  try {
    return window.localStorage.getItem(INCLUDE_HAMLETS_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * An aborted `fetch` rejects like a failure but is one we caused, so it must
 * never reach the error state — the request it replaced is already on its way.
 *
 * Matched on `name` rather than `instanceof DOMException`, which is absent in
 * some non-browser environments the component's tests run under.
 */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

/**
 * The administrative hierarchy under a result's name: tehsil · district ·
 * state. This is what makes forty identically-named Rampurs tellable apart,
 * so state is load-bearing rather than decorative.
 *
 * `county` (the tehsil) is null on ~2.5% of rows, so the parts are filtered
 * before joining — a template string would leave an orphan " · " separator
 * where the tehsil should have been. `district` and `state` are non-null in
 * the schema; they are filtered too so the join can never produce a leading
 * or doubled separator regardless of what the API sends.
 *
 * Exported for the component test, which asserts both the full and the
 * degraded line without a DOM.
 */
export function formatPlaceSubtext(place: SelectedPlace): string {
  return [place.county, place.district, place.state].filter(Boolean).join(' · ')
}

export interface PlacePickerProps {
  /** The current selection, or null when coordinates were typed by hand. */
  value: SelectedPlace | null
  /** Called with the chosen place; the parent owns what happens next. */
  onSelect: (place: SelectedPlace) => void
  /**
   * Reveals the caller's manual coordinate inputs. Mandatory escape hatch:
   * the dataset is India-only and 272k rows are not every settlement.
   */
  onManualEntry: () => void
  disabled?: boolean
}

export default function PlacePicker({
  value,
  onSelect,
  onManualEntry,
  disabled,
}: PlacePickerProps) {
  const [open, setOpen] = useState(false)
  const commandListId = useId()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SelectedPlace[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The API measures its 3-character threshold against the NORMALIZED query,
  // which drops punctuation — so a query long enough to pass the local check
  // below can still be rejected server-side ("r.," normalizes to "r").
  // Tracked separately so that case gets a message about the characters that
  // actually count, rather than the local "type at least 3 letters" hint, which
  // would be plainly wrong for a query the practitioner has already typed past.
  const [queryTooShort, setQueryTooShort] = useState(false)
  // The response controls whether omission is active; the preference controls
  // the next request and remains visible to let the practitioner turn it off.
  const [truncated, setTruncated] = useState(false)
  const [hamletsExcluded, setHamletsExcluded] = useState(false)
  const [includeHamlets, setIncludeHamlets] = useState(getStoredHamletPreference)
  // Whether the pending search should skip the typing debounce. The debounce
  // exists to wait out a *keystroke*; the hamlet toggle is a deliberate click
  // on a query that has already finished being typed, so making it sit through
  // another 250 ms would be latency with nothing to coalesce (Requirement 6.4).
  const [skipDebounce, setSkipDebounce] = useState(false)

  // A disabled trigger must not leave its previously opened popover reachable
  // after the parent disables the field (for example, while a form submits).
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  // Storage is a convenience, never a prerequisite for search. A failed write
  // (for example, private browsing storage restrictions) leaves this session's
  // toggle state intact.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        INCLUDE_HAMLETS_STORAGE_KEY,
        String(includeHamlets),
      )
    } catch {
      // Ignore unavailable localStorage and retain the in-memory preference.
    }
  }, [includeHamlets])

  /**
   * The search itself: wait (or not), then one cancellable request per query
   * and hamlet-inclusion decision. This is the component's only fetch — the
   * toggle does not get a second, unguarded path to the API, it just changes
   * how long this one waits.
   *
   * Keyed on `query`, `includeHamlets` and `skipDebounce`, so the cleanup below
   * runs exactly when any of them makes a pending timer or in-flight request
   * stale. Nothing else in this component can re-trigger it, so a re-render
   * caused by setting `results` cannot start a second search.
   *
   * `skipDebounce` never changes on its own: both handlers that write it also
   * write the query or the preference in the same event, so React batches them
   * into one re-render and one search.
   *
   * The `AbortController` matters more than the debounce. Without it a slow
   * response for "ram" arriving after a fast one for "rampur" would overwrite
   * the correct results with results for a query the practitioner has already
   * moved past — a race the debounce narrows but cannot close, because it only
   * spaces out request *starts*, not their completions.
   */
  useEffect(() => {
    const trimmed = query.trim()

    // Below the threshold: clear rather than leave the previous, longer
    // query's results on screen underneath a shorter one. No request, no
    // timer — the server would short-circuit this with `query_too_short`
    // anyway, so the round trip would buy nothing.
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([])
      setTruncated(false)
      setHamletsExcluded(false)
      setLoading(false)
      setError(null)
      setQueryTooShort(false)
      return
    }

    const controller = new AbortController()

    // Set before the debounce elapses, not when the request starts: the
    // dropdown is open and showing the previous query's outcome, and a
    // 250 ms flash of "No place found" for a query not yet searched reads as
    // an answer rather than as waiting.
    setLoading(true)
    setError(null)

    async function runSearch(): Promise<void> {
      try {
        const searchParams = new URLSearchParams({ q: trimmed })
        if (includeHamlets) searchParams.set('includeHamlets', 'true')

        const res = await fetch(`/api/places?${searchParams.toString()}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`Place search failed: ${res.status}`)

        const data = (await res.json()) as PlaceSearchResponse
        setResults(data.results)
        setTruncated(data.truncated)
        setHamletsExcluded(data.hamletsExcluded)
        setQueryTooShort(data.reason === 'query_too_short')
        setLoading(false)
      } catch (err) {
        // Swallowed silently, and — importantly — without clearing `loading`:
        // this rejection is the *previous* query's, and the effect run that
        // aborted it has already set `loading` for the query now in flight.
        // Resolving it here would blank the spinner mid-search.
        if (isAbortError(err)) return

        console.error('Place search failed:', err)
        setResults([])
        setTruncated(false)
        setHamletsExcluded(false)
        setQueryTooShort(false)
        setError('Search unavailable')
        setLoading(false)
      }
    }

    // Still scheduled rather than called inline when the debounce is skipped,
    // so the toggle and a keystroke share one code path — and therefore one
    // AbortController lifecycle — differing only in the delay.
    const timer = setTimeout(() => {
      void runSearch()
    }, skipDebounce ? 0 : DEBOUNCE_MS)

    // Covers the query-changed, preference-changed and unmounted cases alike.
    // `clearTimeout` drops a search that never left, `abort` cancels one that
    // did; calling both is safe because at most one has anything to do. This is
    // what keeps a toggle from being overwritten by the response to the request
    // it replaced.
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, includeHamlets, skipDebounce])

  function handleQueryChange(nextQuery: string): void {
    // Clear the server's `query_too_short` reason immediately so a newly valid
    // query reaches the spinner rather than briefly showing the old message.
    setQueryTooShort(false)
    // Typing is what the debounce is for, so restore it.
    setSkipDebounce(false)
    setQuery(nextQuery)
  }

  function handleHamletToggle(): void {
    // Requirement 6.4: re-issue the current search *immediately*. Both updates
    // batch into a single re-render, so the effect runs once.
    setSkipDebounce(true)
    setIncludeHamlets((current) => !current)
  }

  const belowThreshold = query.trim().length < MIN_QUERY_LENGTH
  // The server judged the query too short even though it is not locally short.
  // Only punctuation can produce that disagreement: the local check counts raw
  // characters, the server's counts normalized ones. Telling the practitioner to
  // type three characters would be a lie about a query that already has three.
  const serverQueryTooShort = !belowThreshold && queryTooShort
  const showFooters =
    !belowThreshold && !serverQueryTooShort && !loading && !error

  function handleOpenChange(nextOpen: boolean): void {
    setOpen(disabled ? false : nextOpen)
  }

  function handleSelect(place: SelectedPlace): void {
    onSelect(place)
    setOpen(false)
  }

  function handleManualEntry(): void {
    setOpen(false)
    onManualEntry()
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={
            value
              ? `Birth location: ${value.label}`
              : 'Search for a birth location'
          }
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? commandListId : undefined}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          <span className="truncate">{value ? value.label : 'Search for a place…'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        {/* Server-ranked results — see the file header on shouldFilter. */}
        <Command shouldFilter={false}>
          {/* Typing only moves `query`; the effect above owns the search. */}
          <CommandInput
            aria-label="Search Indian settlements"
            value={query}
            onValueChange={handleQueryChange}
            placeholder="City, town or village…"
          />
          <CommandList id={commandListId}>
            {belowThreshold ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                Type at least 3 letters to search.
              </div>
            ) : loading ? (
              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="flex items-center justify-center gap-2 px-3 py-6 text-sm text-muted-foreground"
              >
                <span
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
                Searching places…
              </div>
            ) : error ? (
              <CommandGroup heading="Search unavailable.">
                <CommandItem
                  value="enter-coordinates-manually"
                  onSelect={handleManualEntry}
                  className="justify-center text-muted-foreground"
                >
                  Enter coordinates manually
                </CommandItem>
              </CommandGroup>
            ) : serverQueryTooShort ? (
              // Announced the same way as the loading row rather than styled as
              // a failure: this is a correctable instruction, not an error, and
              // it must not be conveyed by colour.
              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="px-3 py-6 text-center text-sm text-muted-foreground"
              >
                Enter at least 3 letters or numbers — punctuation does not count
                towards the search.
              </div>
            ) : results.length === 0 ? (
              <CommandGroup heading="No place found.">
                <CommandItem
                  value="enter-coordinates-manually"
                  onSelect={handleManualEntry}
                  className="justify-center text-muted-foreground"
                >
                  Enter coordinates manually
                </CommandItem>
              </CommandGroup>
            ) : (
              <CommandGroup>
                {results.map((place) => (
                  <CommandItem
                    key={place.id}
                    value={place.id}
                    onSelect={() => handleSelect(place)}
                    className="items-start gap-2"
                  >
                    {/* min-w-0 lets the two text lines truncate instead of
                        pushing the badge off the row. */}
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{place.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {formatPlaceSubtext(place)}
                      </div>
                    </div>
                    {/* The settlement class is spelled out, never encoded as a
                        colour — outline keeps it a readable text label. */}
                    <Badge variant="outline" className="shrink-0 font-normal">
                      {place.kind}
                    </Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          {/* One footer stack. The result-dependent rows come and go with the
              response; the attribution is always last so it never displaces
              the hint or the toggle the practitioner is reaching for. */}
          <div className="space-y-1 border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
            {showFooters && truncated ? (
              <p>Showing top {results.length} — add a district or state to narrow.</p>
            ) : null}
            {showFooters && (hamletsExcluded || includeHamlets) ? (
              <button
                type="button"
                aria-pressed={includeHamlets}
                onClick={handleHamletToggle}
                className="underline underline-offset-2 hover:text-foreground"
              >
                {includeHamlets ? 'Exclude hamlets' : 'Include hamlets'}
              </button>
            ) : null}
            <p>{ATTRIBUTION_TEXT}</p>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
