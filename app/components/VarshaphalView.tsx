/**
 * VarshaphalView — Tajika annual solar-return chart.
 *
 * Casts an annual chart for a chosen year (the moment the Sun returns to its
 * natal longitude) and shows the Varsha Pravesh instant, Varsha Lagna, Muntha,
 * the year lord (Varshesha) with its five candidates, Panchavargeeya Bala, and
 * the annual planets + annual Shadbala.
 *
 * Self-contained: it fetches /api/compute/varshaphal using the current birth
 * form so the practitioner can flip between years without recomputing the natal
 * chart.
 */
'use client'

import { useState } from 'react'

const PLANET_COLORS: Record<string, string> = {
  Sun: 'text-orange-400', Moon: 'text-slate-300', Mars: 'text-red-400',
  Mercury: 'text-green-400', Jupiter: 'text-yellow-400', Venus: 'text-pink-400',
  Saturn: 'text-blue-400', Rahu: 'text-gray-400', Ketu: 'text-purple-400',
}

interface ComputeForm {
  name: string
  date: string
  time: string
  timezone: string
  latitude: string
  longitude: string
  sunriseMode: 'precise' | 'jhora'
}

interface PanchavargeeyaEntry {
  planet: string
  kshetraBala: number
  ucchaBala: number
  haddaBala: number
  drekkanaBala: number
  navamsaBala: number
  total: number
  finalBala: number
  grade: string
}

interface Candidate {
  office: string
  planet: string
  officeLabel: string
  panchavargeeyaBala: number
}

interface ShadbalPlanetLite {
  planet: string
  totalRupas: number
  requiredRupas: number
  strengthRatio: number
  grade: string
}

interface VarshaphalData {
  varshaYear: number
  age: number
  varshaPravesh: {
    date: string
    time: string
    utcISO: string
    weekday: string
    weekdayLord: string
  }
  annualChart: {
    lagna: string
    lagnaDegreeInSign: number
    ayanamsa: number
    planets: { planet: string; sign: string; degreeInSign: number; house: number; retrograde: boolean }[]
    shadbala: { planets: ShadbalPlanetLite[] }
  }
  muntha: { sign: string; signNumber: number; house: number; lord: string }
  dayBirth: boolean
  panchavargeeyaBala: PanchavargeeyaEntry[]
  candidates: Candidate[]
  varshesha: { planet: string; officeLabel: string; panchavargeeyaBala: number }
  method: string
}

const CURRENT_YEAR = new Date().getUTCFullYear()

function pvGradeColor(grade: string): string {
  switch (grade) {
    case 'Extraordinary': return 'text-emerald-300 bg-emerald-900/30 border-emerald-700'
    case 'VeryStrong': return 'text-green-400 bg-green-900/30 border-green-700'
    case 'Powerful': return 'text-lime-400 bg-lime-900/30 border-lime-700'
    case 'Ordinary': return 'text-yellow-400 bg-yellow-900/30 border-yellow-700'
    default: return 'text-red-400 bg-red-900/30 border-red-700'
  }
}

function shadGradeColor(grade: string): string {
  if (grade === 'Strong') return 'text-green-400'
  if (grade === 'Average') return 'text-yellow-400'
  return 'text-red-400'
}

export default function VarshaphalView({ form }: { form: ComputeForm }) {
  const [year, setYear] = useState<number>(CURRENT_YEAR)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<VarshaphalData | null>(null)

  const canCompute = form.date && form.time && form.latitude && form.longitude

  async function handleCompute() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/compute/varshaphal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name || undefined,
          date: form.date,
          time: form.time,
          timezone: parseFloat(form.timezone),
          latitude: parseFloat(form.latitude),
          longitude: parseFloat(form.longitude),
          sunriseMode: form.sunriseMode,
          varshaYear: year,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Varshaphal computation failed')
        return
      }
      setData(json.varshaphal)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header + year selector */}
      <div className="rounded-lg border border-gray-700 bg-gray-800/30 px-4 py-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-semibold">Varshaphal — Tajika Annual Chart</h3>
            <p className="text-xs text-gray-500 mt-1">
              Annual chart cast for the moment the Sun returns to its natal longitude (Varsha Pravesh).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">Year</label>
            <input
              type="number"
              min={1800}
              max={2399}
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value || String(CURRENT_YEAR), 10))}
              className="w-24 rounded-lg bg-gray-900 border border-gray-600 px-3 py-1.5 text-ink focus:border-indigo-500 focus:outline-none font-mono"
            />
            <button
              type="button"
              onClick={handleCompute}
              disabled={loading || !canCompute}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Computing...' : 'Compute Annual Chart'}
            </button>
          </div>
        </div>
        {!canCompute && (
          <p className="mt-2 text-xs text-amber-500">Compute a natal chart first (birth data is required).</p>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">{error}</div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4">
              <div className="text-xs text-gray-500">Varsha Pravesh (Solar Return)</div>
              <div className="text-sm text-ink mt-1 font-mono">{data.varshaPravesh.date}</div>
              <div className="text-sm text-ink font-mono">{data.varshaPravesh.time} <span className="text-gray-500">local</span></div>
              <div className="text-xs text-gray-400 mt-1">
                {data.varshaPravesh.weekday} · lord {data.varshaPravesh.weekdayLord}
              </div>
              <div className="text-[10px] text-gray-600 mt-1">Year {data.varshaYear} · age {data.age} · {data.dayBirth ? 'day birth' : 'night birth'}</div>
            </div>

            <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4">
              <div className="text-xs text-gray-500">Varsha Lagna (Annual Asc.)</div>
              <div className="text-lg text-ink mt-1 font-semibold">{data.annualChart.lagna}</div>
              <div className="text-xs text-gray-400">{data.annualChart.lagnaDegreeInSign.toFixed(2)}°</div>
              <div className="text-[10px] text-gray-600 mt-1">Ayanamsa {data.annualChart.ayanamsa.toFixed(4)}°</div>
            </div>

            <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4">
              <div className="text-xs text-gray-500">Muntha</div>
              <div className="text-lg text-ink mt-1 font-semibold">{data.muntha.sign}</div>
              <div className="text-xs text-gray-400">House {data.muntha.house} · lord {data.muntha.lord}</div>
            </div>

            <div className="rounded-lg border border-amber-700/60 bg-amber-900/20 p-4">
              <div className="text-xs text-amber-500/80">Varshesha (Year Lord)</div>
              <div className={`text-lg mt-1 font-semibold ${PLANET_COLORS[data.varshesha.planet] ?? 'text-ink'}`}>
                {data.varshesha.planet}
              </div>
              <div className="text-xs text-gray-400">{data.varshesha.officeLabel}</div>
              <div className="text-[10px] text-gray-500 mt-1">Panchavargeeya {data.varshesha.panchavargeeyaBala.toFixed(2)}/20</div>
            </div>
          </div>

          {/* Year-lord candidates */}
          <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4">
            <h4 className="text-sm font-semibold mb-2">Year-Lord Candidates (Panchadhikari)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
              {data.candidates.map((c) => {
                const isWinner = c.planet === data.varshesha.planet && c.officeLabel === data.varshesha.officeLabel
                return (
                  <div
                    key={c.office}
                    className={`rounded-lg border p-3 ${isWinner ? 'border-amber-600 bg-amber-900/20' : 'border-gray-700 bg-gray-900/40'}`}
                  >
                    <div className="text-[11px] text-gray-500 leading-tight">{c.officeLabel}</div>
                    <div className={`text-sm font-semibold mt-1 ${PLANET_COLORS[c.planet] ?? 'text-ink'}`}>{c.planet}</div>
                    <div className="text-xs text-gray-400 font-mono">{c.panchavargeeyaBala.toFixed(2)}/20</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Panchavargeeya Bala table */}
          <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4 overflow-x-auto">
            <h4 className="text-sm font-semibold mb-2">Panchavargeeya Bala (Tajika 5-fold strength)</h4>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left py-1.5 pr-3">Planet</th>
                  <th className="text-right px-2">Kshetra /30</th>
                  <th className="text-right px-2">Uccha /20</th>
                  <th className="text-right px-2">Hadda /15</th>
                  <th className="text-right px-2">Drekkana /10</th>
                  <th className="text-right px-2">Navamsa /5</th>
                  <th className="text-right px-2">Final /20</th>
                  <th className="text-left pl-3">Grade</th>
                </tr>
              </thead>
              <tbody>
                {data.panchavargeeyaBala.map((e) => (
                  <tr key={e.planet} className="border-b border-gray-800">
                    <td className={`py-1.5 pr-3 font-medium ${PLANET_COLORS[e.planet] ?? 'text-ink'}`}>{e.planet}</td>
                    <td className="text-right px-2 text-gray-300 font-mono">{e.kshetraBala.toFixed(2)}</td>
                    <td className="text-right px-2 text-gray-300 font-mono">{e.ucchaBala.toFixed(2)}</td>
                    <td className="text-right px-2 text-gray-300 font-mono">{e.haddaBala.toFixed(2)}</td>
                    <td className="text-right px-2 text-gray-300 font-mono">{e.drekkanaBala.toFixed(2)}</td>
                    <td className="text-right px-2 text-gray-300 font-mono">{e.navamsaBala.toFixed(2)}</td>
                    <td className="text-right px-2 text-ink font-mono font-semibold">{e.finalBala.toFixed(2)}</td>
                    <td className="pl-3">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${pvGradeColor(e.grade)}`}>{e.grade}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Annual planets + annual Shadbala */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4 overflow-x-auto">
              <h4 className="text-sm font-semibold mb-2">Annual Planets</h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-700">
                    <th className="text-left py-1.5 pr-3">Planet</th>
                    <th className="text-left px-2">Sign</th>
                    <th className="text-right px-2">Deg</th>
                    <th className="text-right px-2">House</th>
                  </tr>
                </thead>
                <tbody>
                  {data.annualChart.planets.map((p) => (
                    <tr key={p.planet} className="border-b border-gray-800">
                      <td className={`py-1.5 pr-3 font-medium ${PLANET_COLORS[p.planet] ?? 'text-ink'}`}>
                        {p.planet}{p.retrograde ? ' (R)' : ''}
                      </td>
                      <td className="px-2 text-gray-300">{p.sign}</td>
                      <td className="text-right px-2 text-gray-400 font-mono">{p.degreeInSign.toFixed(2)}°</td>
                      <td className="text-right px-2 text-gray-400 font-mono">{p.house}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4 overflow-x-auto">
              <h4 className="text-sm font-semibold mb-2">Annual Shadbala (Parashari)</h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-700">
                    <th className="text-left py-1.5 pr-3">Planet</th>
                    <th className="text-right px-2">Rupas</th>
                    <th className="text-right px-2">Required</th>
                    <th className="text-right px-2">Ratio</th>
                    <th className="text-left pl-3">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {data.annualChart.shadbala.planets
                    .filter((p) => p.requiredRupas > 0)
                    .map((p) => (
                      <tr key={p.planet} className="border-b border-gray-800">
                        <td className={`py-1.5 pr-3 font-medium ${PLANET_COLORS[p.planet] ?? 'text-ink'}`}>{p.planet}</td>
                        <td className="text-right px-2 text-gray-300 font-mono">{p.totalRupas.toFixed(2)}</td>
                        <td className="text-right px-2 text-gray-500 font-mono">{p.requiredRupas.toFixed(1)}</td>
                        <td className="text-right px-2 text-gray-300 font-mono">{p.strengthRatio.toFixed(2)}</td>
                        <td className={`pl-3 font-medium ${shadGradeColor(p.grade)}`}>{p.grade}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Method note */}
          <p className="text-[11px] text-gray-600 leading-relaxed">
            <span className="text-gray-500 font-medium">Method:</span> {data.method}
          </p>
        </div>
      )}
    </div>
  )
}
