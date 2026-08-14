# Gochar UI and Range Workflow

Use this guide when changing the Transits → Gochar UI, Vimshottari PD Gochar
expansion, or the client call to `POST /api/gochar`.

## Boundaries and source of truth

- Current Gochar diagrams use the immutable `TransitAnalysis.asOf` snapshot:
  natal D1, the JHora-style Transit Moment Chart (moving Ascendant at the
  native's birthplace), Gochar from birth Lagna, and Gochar from natal Moon.
- Date-range Gochar is separate from those diagrams. It returns UTC whole-sign
  occupancy intervals from `POST /api/gochar`; it is not a moment chart.
- Pass `{ kind: 'unsaved', birthData }` captured with the displayed chart. Never
  derive Gochar from the live form or a loaded-chart ID that may no longer match
  the visible result.

## Client contracts

- Import response shapes only from `@/lib/gocharRange`. Do not import Gochar API
  types from `@/engine/compute`, which brings the native Swiss-Ephemeris chain
  into reach of the client bundle.
- Use `useGocharRange` rather than a component-local fetch. It owns source-aware
  caching, stale-response protection, and the single-message API error rule.
- Bare date inputs remain the inclusive dates selected by the practitioner;
  the API's next-UTC-midnight `dateTo` echo is an exclusive internal bound.
  Label every returned interval as UTC.
- Moon is opt-in. Without Moon the range cap is three years; with Moon it is one
  year. State both limits beside the checkbox.

## PD interaction and accessibility

- PD rows are real buttons. A selected PD sends its unmodified exact UTC ISO
  `start` and `end` instants; never truncate them to date strings.
- Keep one PD expansion open at once. A failed request retains the selected PD
  and offers retry; its Moon choice is local to that expansion.
- Render results with `GocharRangeTable`: semantic table markup, a narrow-width
  overflow wrapper, visible time-of-day, graha inclusion disclosure, and no
  visual-only status/error signal.

## Verification

Run the focused suites after changes:

```bash
npx vitest run app/components/GocharCharts.test.tsx app/components/GocharRangeTable.test.tsx app/components/TransitsView.gochar.test.tsx app/components/DashaTimeline.gochar.test.tsx app/components/useGocharRange.test.ts
npx tsc --noEmit
```
