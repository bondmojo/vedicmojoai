/**
 * app/page.test.tsx
 * -------------------
 * Smoke test for tab-strip resilience (task 20.3).
 *
 * Claim under test: the tab-navigation block in `ComputePage` (`app/page.tsx`) is rendered
 * unconditionally from the static `TABS` array and the `activeTab` state — it never reads
 * `result.chart` or any pane-specific field (the one exception, `result.chart.transits?.sadeSati
 * ?.active` for the small warning glyph, is guarded by optional chaining and cannot throw). So all
 * ten tabs must render and stay selectable regardless of how malformed or absent the *pane* data
 * inside `result.chart` is (Design: Error Handling table — "Tab strip"; Requirement 8.5).
 *
 * Why this test looks the way it does
 * ------------------------------------
 * The repo has no DOM environment or component-testing library installed (no `jsdom`, no
 * `@testing-library/react` — design.md's Testing Strategy, "Runner and libraries actually in the
 * repo"), and adding one is out of scope for this feature. Every sibling test in this feature
 * (`YogasView.test.tsx`, `GrahasTable.test.tsx`, `SadeSatiPanel.test.tsx`, `KeyDignitiesPanel.
 * test.tsx`, `AshtakavargaView.test.tsx`) calls its component directly as a plain function and
 * inspects the returned React element tree structurally.
 *
 * `ComputePage` is far more stateful than any of those: 13 `useState` calls, one `useEffect`, one
 * `useCallback`, and `useRouter()` from `next/navigation`. Calling it directly requires:
 *   - A hook dispatcher stub (same mechanism `AshtakavargaView.test.tsx` already uses) that
 *     additionally covers `useEffect` (no-op — the effect body, and therefore the real
 *     `fetch('/api/unified-charts')` call inside `fetchSavedCharts`, is never invoked, exactly as
 *     happens when any component is called directly without a surrounding `render()`/commit) and
 *     `useCallback` (return the callback unchanged).
 *   - `next/navigation`'s `useRouter` mocked via `vi.mock`, since it has no meaning outside a real
 *     Next.js app router context.
 *   - No `fetch` mock is needed: `useEffect` never runs, so `fetchSavedCharts` is never called.
 *
 * Because JSX construction (`React.createElement`) does not execute a custom component's function
 * body — only `React.createElement('button', ...)` for native tags does anything eagerly — the
 * pane elements (`<GrahasTable .../>`, `<AshtakavargaView .../>`, etc.) are perfectly safe to
 * construct with garbage props: they are only ever *created* as element descriptors here, never
 * *invoked*. Each pane's own body is exercised by its own dedicated test file. This is what makes
 * the full-render approach both feasible and appropriately scoped for a tab-strip smoke test: we
 * exercise the real `ComputePage` function body and its real `TABS.map(...)` block, while the
 * malformed data flows into (but never executes) each pane.
 *
 * `activeTab` is stubbed via an index-based `useState` override (the 4th `useState` call in
 * source order) so every one of the ten tabs can be exercised as "active" in turn, each time
 * confirming: (a) the tab strip still renders exactly the same ten buttons in the same order with
 * working `onClick` handlers, and (b) constructing the whole page — including the JSX branch for
 * whichever pane is "active" — never throws, even though every pane-specific field on the malformed
 * chart is absent, wrongly typed, or empty.
 *
 * `vitest.config.ts` sets `esbuild.jsx: 'automatic'`, matching the existing sibling tests.
 *
 * _Design: Error Handling table — "Tab strip"_
 * _Requirements: 8.5_
 */

import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { ReactElement, ReactNode } from 'react'

// `useRouter` has no meaning outside a real Next.js app-router context; `ComputePage` only calls
// `router.push(...)` inside click handlers that are never invoked by this test, so a dummy no-op
// object is enough.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import ComputePage from './page'

// ─── Hook dispatcher stub ────────────────────────────────────────────────
//
// Same mechanism as `AshtakavargaView.test.tsx`'s `callWithStubbedUseState`, extended to also
// cover the two additional hooks `ComputePage` calls: `useEffect` (no-op, so the real
// `fetch('/api/unified-charts')` call inside `fetchSavedCharts` never runs) and `useCallback`
// (returns the callback unchanged, matching a real first render).

const REACT_INTERNALS = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
    ReactCurrentDispatcher: { current: unknown }
  }
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED

/**
 * Runs `fn` with a minimal hook dispatcher installed. `useState` calls are matched by their
 * 0-based call order in `ComputePage`'s source (`form`=0, `loading`=1, `error`=2, `result`=3,
 * `activeTab`=4, `saving`=5, `saveMessage`=6, `loadedChartId`=7, `analyzeSaving`=8,
 * `showCopyPanel`=9, `savedCharts`=10, `loadingCharts`=11, `loadingChart`=12); `stateOverrides`
 * substitutes a value for specific call indices (used here for `result` and `activeTab`) while
 * every other call returns its own initializer verbatim, exactly like a real first render.
 * `useEffect` is a no-op; `useCallback` returns its callback unchanged.
 */
function callWithStubbedHooks<T>(fn: () => T, stateOverrides: Record<number, unknown> = {}): T {
  const dispatcher = REACT_INTERNALS.ReactCurrentDispatcher
  const previous = dispatcher.current
  let callIndex = 0
  dispatcher.current = {
    useState: (initial: unknown) => {
      const idx = callIndex++
      const value =
        idx in stateOverrides ? stateOverrides[idx] : typeof initial === 'function' ? (initial as () => unknown)() : initial
      return [value, () => {}]
    },
    useEffect: () => {},
    useCallback: (cb: unknown) => cb,
  }
  try {
    return fn()
  } finally {
    dispatcher.current = previous
  }
}

// `result` is the 4th `useState` call (0-indexed 3); `activeTab` is the 5th (0-indexed 4).
const RESULT_STATE_INDEX = 3
const ACTIVE_TAB_STATE_INDEX = 4

// ─── Tree-walking helpers (mirrors the sibling component tests) ────────────

/** Flattens a React node (string, number, element, or nested array of these) to its visible text. */
function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node === 'object' && 'props' in (node as ReactElement)) {
    return textOf((node as ReactElement).props?.children)
  }
  return ''
}

/**
 * Depth-first walk of a rendered element tree, invoking `visit` on every element node found.
 * Deliberately does NOT expand custom (function or forwardRef) components — the whole point of
 * this smoke test is that pane components (`GrahasTable`, `AshtakavargaView`, `YogasView`, etc.)
 * are merely *constructed* as element descriptors here and never *invoked*, so their malformed
 * props can never throw during this test. Only native DOM tags (`'button'`, `'div'`, …) are
 * visited, which is all that is needed to find the tab-strip buttons.
 */
function walk(node: ReactNode, visit: (el: ReactElement) => void): void {
  if (node === null || node === undefined || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') return
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, visit))
    return
  }
  if (typeof node === 'object' && 'props' in (node as ReactElement)) {
    const el = node as ReactElement
    if (typeof el.type === 'string') visit(el)
    walk(el.props?.children, visit)
    return
  }
}

/** Collects every native element in the tree whose `type` matches `tag` (e.g. `'button'`). */
function findAll(root: ReactNode, tag: string): ReactElement[] {
  const found: ReactElement[] = []
  walk(root, (el) => {
    if (el.type === tag) found.push(el)
  })
  return found
}

// ─── Fixture — a chart whose non-tab-strip pane data is malformed or absent ────────────────────

const EXPECTED_TABS: { key: string; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'grahas', label: 'Grahas' },
  { key: 'charts', label: 'Divisional Charts' },
  { key: 'ashtakavarga', label: 'Ashtakavarga' },
  { key: 'yogas', label: 'Yogas' },
  { key: 'dasha', label: 'Dasha (Vimshottari)' },
  { key: 'charadasha', label: 'Chara Dasha' },
  { key: 'transits', label: 'Transits' },
  { key: 'pinda', label: 'Pinda Strength' },
  { key: 'varshaphal', label: 'Varshaphal' },
]

/**
 * `result.chart` carries only the handful of fields the page itself reads directly (unconditionally,
 * outside any `activeTab === '…'` branch): `lagna`, `lagnaDegreeInSign`, `ayanamsa`, `sunriseMode`.
 * Every field a *pane* reads is deliberately absent, wrongly typed, or empty — `planets` is `null`,
 * `nakshatras` is a string, `charaKarakas` is a number, `ashtakavarga` is `null`, `yogas` is
 * `undefined`, `transits` is `undefined` (safe: the tab strip only reads it via `?.`). This is the
 * "malformed or absent" pane data the task requires; none of it is capable of reaching the tab
 * strip's own rendering logic.
 */
function buildMalformedResult() {
  return {
    chart: {
      lagna: 'Leo',
      lagnaDegreeInSign: 12.34,
      ayanamsa: 24.1,
      sunriseMode: 'precise',
      planets: null,
      nakshatras: 'not-an-array',
      divisionalCharts: undefined,
      charaKarakas: 42,
      upagrahas: undefined,
      specialLagnas: undefined,
      arudhaPadas: undefined,
      shadbala: undefined,
      relationships: undefined,
      ashtakavarga: null,
      yogas: undefined,
      transits: undefined,
      pindaStrength: undefined,
    },
    dashaTree: undefined,
    charaDasha: undefined,
  }
}

/** Renders `ComputePage` with the malformed result installed and `activeTab` forced to `tabKey`. */
function renderPageWithActiveTab(tabKey: string): ReactElement {
  return callWithStubbedHooks(() => ComputePage(), {
    [RESULT_STATE_INDEX]: buildMalformedResult(),
    [ACTIVE_TAB_STATE_INDEX]: tabKey,
  }) as ReactElement
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('ComputePage — tab-strip resilience (R8.5)', () => {
  it('renders all ten tabs, in order, with the expected labels, when the active tab is Summary', () => {
    const el = renderPageWithActiveTab('summary')
    const buttons = findAll(el, 'button')

    expect(buttons).toHaveLength(EXPECTED_TABS.length)
    expect(buttons.map((b) => textOf(b).trim())).toEqual(EXPECTED_TABS.map((t) => t.label))
  })

  it('gives every tab button a working (function) onClick handler, so every tab stays selectable', () => {
    const el = renderPageWithActiveTab('summary')
    const buttons = findAll(el, 'button')

    expect(buttons).toHaveLength(10)
    for (const button of buttons) {
      expect(typeof button.props.onClick).toBe('function')
      // Invoking it must not throw — it only calls the (stubbed, no-op) `setActiveTab` setter.
      expect(() => button.props.onClick()).not.toThrow()
    }
  })

  it.each(EXPECTED_TABS.map((t) => t.key))(
    'renders all ten tabs unchanged, and does not throw, with malformed pane data while "%s" is the active tab',
    (activeKey) => {
      let el!: ReactElement
      expect(() => {
        el = renderPageWithActiveTab(activeKey)
      }).not.toThrow()

      const buttons = findAll(el, 'button')
      expect(buttons).toHaveLength(10)
      expect(buttons.map((b) => textOf(b).trim())).toEqual(EXPECTED_TABS.map((t) => t.label))
      expect(buttons.map((b) => textOf(b).trim())).toEqual(
        buttons.map((b) => textOf(b).trim())
      )
    }
  )

  it('renders identical tab-strip buttons regardless of which tab is active — the strip never reads chart data', () => {
    const perTabButtonTexts = EXPECTED_TABS.map((t) => {
      const el = renderPageWithActiveTab(t.key)
      return findAll(el, 'button').map((b) => textOf(b).trim())
    })

    const first = perTabButtonTexts[0]
    for (const texts of perTabButtonTexts) {
      expect(texts).toEqual(first)
    }
  })
})
