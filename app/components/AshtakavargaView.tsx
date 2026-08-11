/**
 * AshtakavargaView — Displays Sarvashtakavarga and Bhinnashtakavarga chart
 * diagrams (North/South Indian) plus the numeric BAV/SAV tables.
 *
 * Props are unchanged — `{ data: AshtakavargaResult }` — so the existing
 * `DurationComputationResults` call site (`<AshtakavargaView data={categoryData.ashtakavarga} />`)
 * keeps working verbatim (R8.2).
 *
 * All eight diagrams (7 BAV + 1 SAV) render simultaneously, no selector
 * required (R5.1). Diagrams AND the numeric tables are derived from a single
 * `deriveBinduSlots(data, indexMode)` call per render, so no cell or label
 * can retain a value from a previously selected index mode (R5.4, R5.7).
 */

'use client'

import { useState } from 'react'
import type { AshtakavargaResult } from '@/engine/compute/types'
import { deriveBinduSlots, bandOf, BAV_PLANETS } from '@/lib/ashtakavargaBands'
import { binduBandClass, binduBandTextClass, planetColorClass } from '@/lib/brandColors'
import BinduChart, { type BinduCell } from './BinduChart'
import BinduLegend from './BinduLegend'
import { SectionUnavailable } from './SectionUnavailable'
import { guardSection, isArrayOfLength, isPlainObject } from './sectionGuards'

type IndexMode = 'sign' | 'house'
type DiagramStyle = 'north' | 'south'

/**
 * True when `arr` carries at least 12 usable (integer, 0–8) Bindu counts in
 * its first 12 slots (R5.9). Checked against the raw sign-indexed
 * `data.bav[planet]` regardless of the active Index_Mode, per the design's
 * "check `data.bav?.[planet]` presence/length before deriving" rule — this
 * decides whether to render the diagram at all, independent of which slot
 * labelling is currently selected.
 */
function hasUsableBav(arr: unknown): boolean {
  if (!Array.isArray(arr)) return false
  let usable = 0
  for (let i = 0; i < 12; i++) {
    const v = arr[i]
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 8) usable++
  }
  return usable >= 12
}

/** Sum of non-null counts, or null when every count is null. */
function sumCounts(counts: (number | null)[]): number | null {
  const usable = counts.filter((v): v is number => v != null)
  if (usable.length === 0) return null
  return usable.reduce((s, v) => s + v, 0)
}

export default function AshtakavargaView({ data: rawData }: { data: AshtakavargaResult }) {
  // Root-prop guard (R8.1). Runs BEFORE the hooks so `hasByHouse` can be derived
  // safely, but the early return comes AFTER them: a conditional hook call would
  // change the hook count when `data` arrives late, which React forbids.
  const section = guardSection<AshtakavargaResult>(rawData, isPlainObject)
  const hasByHouse = section.ok && isArrayOfLength(section.data.byHouse, 12)
  const [indexMode, setIndexMode] = useState<IndexMode>(hasByHouse ? 'house' : 'sign')
  const [diagramStyle, setDiagramStyle] = useState<DiagramStyle>('north')

  if (!section.ok) return <SectionUnavailable section="Ashtakavarga" />
  const data = section.data

  // Single derivation per render — diagrams and tables both read from `slots`.
  const slots = deriveBinduSlots(data, indexMode)

  const buildCells = (counts: (number | null)[]): BinduCell[] =>
    counts.map((count, i) => ({
      slot: i,
      signNumber: slots.signNumbers[i],
      house: indexMode === 'house' ? slots.houses[i] : undefined,
      label: slots.labels[i],
      count,
    }))

  const savCells = buildCells(slots.sav)
  const savTotal = slots.savTotal ?? sumCounts(slots.sav)

  return (
    <div className="space-y-6">
      {/* ─── Controls ─── */}
      <div className="flex flex-wrap items-center gap-6">
        {hasByHouse ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Index by:</span>
            <div className="inline-flex rounded-lg border border-gray-600 overflow-hidden">
              <button
                onClick={() => setIndexMode('sign')}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  indexMode === 'sign' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-ink'
                }`}
              >
                Sign
              </button>
              <button
                onClick={() => setIndexMode('house')}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  indexMode === 'house' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-ink'
                }`}
              >
                House (from Lagna)
              </button>
            </div>
          </div>
        ) : (
          <SectionUnavailable section="House-indexed Ashtakavarga" />
        )}

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">Diagram style:</span>
          <div className="inline-flex rounded-lg border border-gray-600 overflow-hidden">
            <button
              onClick={() => setDiagramStyle('north')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                diagramStyle === 'north' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-ink'
              }`}
            >
              North Indian
            </button>
            <button
              onClick={() => setDiagramStyle('south')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                diagramStyle === 'south' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-ink'
              }`}
            >
              South Indian
            </button>
          </div>
        </div>
      </div>

      {/* ─── Diagrams pane (SAV + 7 BAV) + both legends ─── */}
      <div className="rounded-lg border border-gray-700 overflow-hidden">
        <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold">Ashtakavarga Diagrams</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {indexMode === 'house' && hasByHouse
              ? `House 1 = ${data.byHouse![0]?.sign ?? '—'} (Lagna)`
              : 'Indexed by zodiac sign, starting from Aries'}
          </p>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            <BinduChart
              title="SAV"
              seriesLabel="SAV"
              style={diagramStyle}
              reckoning="sav"
              cells={savCells}
              lagnaSignNumber={data.lagnaSignNumber}
              caption={savTotal != null ? `Total: ${savTotal} bindus` : undefined}
            />
            {BAV_PLANETS.map((planet) => {
              if (!hasUsableBav(data.bav?.[planet])) {
                return <SectionUnavailable key={planet} section={`${planet} Bhinnashtakavarga`} />
              }
              const cells = buildCells(slots.bav[planet])
              const total = sumCounts(slots.bav[planet])
              return (
                <BinduChart
                  key={planet}
                  title={planet}
                  seriesLabel={planet}
                  style={diagramStyle}
                  reckoning="bav"
                  cells={cells}
                  lagnaSignNumber={data.lagnaSignNumber}
                  caption={total != null ? `Total: ${total} bindus` : undefined}
                />
              )
            })}
          </div>

          <div className="flex flex-wrap gap-4">
            <BinduLegend reckoning="sav" />
            <BinduLegend reckoning="bav" />
          </div>
        </div>
      </div>

      {/* ─── Numeric BAV/SAV tables (retained), same `slots` as the diagrams ─── */}
      <div className="rounded-lg border border-gray-700 overflow-hidden">
        <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold">Ashtakavarga Tables</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Bindu counts per {indexMode === 'house' ? 'house (0–8 scale for BAV, 0–56 for SAV)' : 'sign (0–8 scale for BAV, 0–56 for SAV)'}
          </p>
        </div>
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-700">
                <th className="px-2 py-1 text-left">Planet</th>
                {slots.labels.map((label, i) => (
                  <th key={`${label}-${i}`} className="px-2 py-1 text-center">{label}</th>
                ))}
                <th className="px-2 py-1 text-center font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {BAV_PLANETS.map((planet) => {
                const counts = slots.bav[planet]
                const total = sumCounts(counts)
                return (
                  <tr key={planet} className="border-b border-gray-800">
                    <td className={`px-2 py-1.5 font-medium ${planetColorClass(planet)}`}>
                      {planet}
                    </td>
                    {counts.map((count, i) => (
                      <td key={i} className={`px-2 py-1.5 text-center font-mono ${binduBandTextClass(bandOf(count, 'bav'))}`}>
                        {count != null ? count : 'n/a'}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-center font-mono font-bold text-gray-300">
                      {total != null ? total : 'n/a'}
                    </td>
                  </tr>
                )
              })}
              {/* SAV row */}
              <tr className="border-t-2 border-gray-600 font-bold">
                <td className="px-2 py-1.5 text-ink">SAV</td>
                {slots.sav.map((count, i) => (
                  <td key={i} className={`px-2 py-1.5 text-center font-mono ${binduBandTextClass(bandOf(count, 'sav'))}`}>
                    {count != null ? count : 'n/a'}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center font-mono text-ink">
                  {savTotal != null ? savTotal : 'n/a'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
