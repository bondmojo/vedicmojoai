/**
 * AshtakavargaView — Displays Sarvashtakavarga and Bhinnashtakavarga grids.
 */

'use client'

import { useState } from 'react'

const SIGNS = ['Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir', 'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis']
const PLANETS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']

const PLANET_COLORS: Record<string, string> = {
  Sun: 'text-orange-400',
  Moon: 'text-slate-300',
  Mars: 'text-red-400',
  Mercury: 'text-green-400',
  Jupiter: 'text-yellow-400',
  Venus: 'text-pink-400',
  Saturn: 'text-blue-400',
}

interface AshtakavargaHouseEntry {
  house: number
  signNumber: number
  sign: string
  sav: number
  bav: Record<string, number>
}

interface AshtakavargaData {
  bav: Record<string, number[]>
  sav: number[]
  savTotal: number
  /** Absent on charts computed/stored before this field existed. */
  lagnaSignNumber?: number
  /** House-indexed view (house 1 = lagna sign). Same back-compat caveat. */
  byHouse?: AshtakavargaHouseEntry[]
}

function getBinduColor(value: number, isSAV: boolean): string {
  if (isSAV) {
    if (value >= 30) return 'text-green-400 bg-green-900/20'
    if (value >= 25) return 'text-gray-200 bg-gray-800'
    return 'text-red-400 bg-red-900/20'
  }
  // BAV: max is 8
  if (value >= 5) return 'text-green-400 bg-green-900/20'
  if (value >= 4) return 'text-gray-200 bg-gray-800'
  if (value >= 3) return 'text-yellow-400 bg-yellow-900/20'
  return 'text-red-400 bg-red-900/20'
}

export default function AshtakavargaView({ data }: { data: AshtakavargaData }) {
  const [selectedPlanet, setSelectedPlanet] = useState<string | null>(null)
  const hasByHouse = !!data.byHouse && data.byHouse.length === 12
  const [indexMode, setIndexMode] = useState<'sign' | 'house'>(hasByHouse ? 'house' : 'sign')

  // Unified 12-slot view for the active index mode. In 'house' mode, slot i
  // is house i+1 (from the lagna); in 'sign' mode it's the natural zodiac
  // sign i+1 — using the pre-rotated `byHouse` array directly, no house/sign
  // math performed here.
  const savBySlot = indexMode === 'house' && data.byHouse ? data.byHouse.map((h) => h.sav) : data.sav
  const labelBySlot = indexMode === 'house' && data.byHouse
    ? data.byHouse.map((h) => `H${h.house}`)
    : SIGNS
  const bavBySlot = (planet: string): number[] =>
    indexMode === 'house' && data.byHouse
      ? data.byHouse.map((h) => h.bav[planet] ?? 0)
      : (data.bav[planet] ?? Array(12).fill(0))

  return (
    <div className="space-y-6">
      {hasByHouse && (
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
      )}

      {/* Sarvashtakavarga */}
      <div className="rounded-lg border border-gray-700 overflow-hidden">
        <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold">Sarvashtakavarga (SAV)</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Total: {data.savTotal} bindus | Sum of all 7 planet BAVs per sign
            {indexMode === 'house' && data.byHouse && ` | House 1 = ${data.byHouse[0].sign} (Lagna)`}
          </p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-12 gap-1">
            {/* Header row */}
            {labelBySlot.map((label, i) => (
              <div key={label} className="text-center">
                <div className="text-[10px] text-gray-500 mb-1">{label}</div>
                <div className={`rounded p-2 text-center font-mono text-sm font-bold ${getBinduColor(savBySlot[i], true)}`}>
                  {savBySlot[i]}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bhinnashtakavarga — Planet selector */}
      <div className="rounded-lg border border-gray-700 overflow-hidden">
        <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold">Bhinnashtakavarga (BAV)</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Individual planet bindus per {indexMode === 'house' ? 'house (0–8 scale)' : 'sign (0–8 scale)'}
          </p>
        </div>
        <div className="p-4">
          {/* Planet selector tabs */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setSelectedPlanet(null)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                selectedPlanet === null
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'border-gray-600 text-gray-400 hover:text-ink'
              }`}
            >
              All
            </button>
            {PLANETS.map((planet) => (
              <button
                key={planet}
                onClick={() => setSelectedPlanet(planet)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  selectedPlanet === planet
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : `border-gray-600 ${PLANET_COLORS[planet]} hover:border-gray-400`
                }`}
              >
                {planet}
              </button>
            ))}
          </div>

          {/* Grid */}
          {selectedPlanet === null ? (
            // Show all planets in a table
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-700">
                    <th className="px-2 py-1 text-left">Planet</th>
                    {labelBySlot.map((label) => (
                      <th key={label} className="px-2 py-1 text-center">{label}</th>
                    ))}
                    <th className="px-2 py-1 text-center font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {PLANETS.map((planet) => {
                    const bindus = bavBySlot(planet)
                    const total = bindus.reduce((s, v) => s + v, 0)
                    return (
                      <tr key={planet} className="border-b border-gray-800">
                        <td className={`px-2 py-1.5 font-medium ${PLANET_COLORS[planet]}`}>
                          {planet}
                        </td>
                        {bindus.map((b, i) => (
                          <td key={i} className={`px-2 py-1.5 text-center font-mono ${getBinduColor(b, false)}`}>
                            {b}
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-center font-mono font-bold text-gray-300">
                          {total}
                        </td>
                      </tr>
                    )
                  })}
                  {/* SAV row */}
                  <tr className="border-t-2 border-gray-600 font-bold">
                    <td className="px-2 py-1.5 text-ink">SAV</td>
                    {savBySlot.map((v, i) => (
                      <td key={i} className={`px-2 py-1.5 text-center font-mono ${getBinduColor(v, true)}`}>
                        {v}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-center font-mono text-ink">
                      {data.savTotal}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            // Single planet expanded view
            <div>
              <h4 className={`text-sm font-medium mb-2 ${PLANET_COLORS[selectedPlanet]}`}>
                {selectedPlanet} Bhinnashtakavarga
              </h4>
              <div className="grid grid-cols-12 gap-1">
                {labelBySlot.map((label, i) => {
                  const bindus = bavBySlot(selectedPlanet)[i] ?? 0
                  return (
                    <div key={label} className="text-center">
                      <div className="text-[10px] text-gray-500 mb-1">{label}</div>
                      <div className={`rounded p-2 text-center font-mono text-lg font-bold ${getBinduColor(bindus, false)}`}>
                        {bindus}
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Total: {bavBySlot(selectedPlanet).reduce((s, v) => s + v, 0)} bindus
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
