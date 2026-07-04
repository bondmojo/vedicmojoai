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

interface AshtakavargaData {
  bav: Record<string, number[]>
  sav: number[]
  savTotal: number
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

  return (
    <div className="space-y-6">
      {/* Sarvashtakavarga */}
      <div className="rounded-lg border border-gray-700 overflow-hidden">
        <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold">Sarvashtakavarga (SAV)</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Total: {data.savTotal} bindus | Sum of all 7 planet BAVs per sign
          </p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-12 gap-1">
            {/* Header row */}
            {SIGNS.map((sign, i) => (
              <div key={sign} className="text-center">
                <div className="text-[10px] text-gray-500 mb-1">{sign}</div>
                <div className={`rounded p-2 text-center font-mono text-sm font-bold ${getBinduColor(data.sav[i], true)}`}>
                  {data.sav[i]}
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
          <p className="text-xs text-gray-500 mt-0.5">Individual planet bindus per sign (0–8 scale)</p>
        </div>
        <div className="p-4">
          {/* Planet selector tabs */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setSelectedPlanet(null)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                selectedPlanet === null
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'border-gray-600 text-gray-400 hover:text-white'
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
                    {SIGNS.map((s) => (
                      <th key={s} className="px-2 py-1 text-center">{s}</th>
                    ))}
                    <th className="px-2 py-1 text-center font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {PLANETS.map((planet) => {
                    const bindus = data.bav[planet] ?? Array(12).fill(0)
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
                    <td className="px-2 py-1.5 text-white">SAV</td>
                    {data.sav.map((v, i) => (
                      <td key={i} className={`px-2 py-1.5 text-center font-mono ${getBinduColor(v, true)}`}>
                        {v}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-center font-mono text-white">
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
                {SIGNS.map((sign, i) => {
                  const bindus = data.bav[selectedPlanet]?.[i] ?? 0
                  return (
                    <div key={sign} className="text-center">
                      <div className="text-[10px] text-gray-500 mb-1">{sign}</div>
                      <div className={`rounded p-2 text-center font-mono text-lg font-bold ${getBinduColor(bindus, false)}`}>
                        {bindus}
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Total: {(data.bav[selectedPlanet] ?? []).reduce((s, v) => s + v, 0)} bindus
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
