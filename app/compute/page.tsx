/**
 * /compute — Chart Computation UI
 *
 * Input form for DOB, time, timezone, lat/long.
 * Displays computed divisional charts (D1, D4, D7, D9, D10, D30),
 * planet positions, nakshatras, karakas, ashtakavarga, and dasha timeline.
 */

'use client'

import { useState } from 'react'
import ChartGrid from './components/ChartGrid'
import PlanetTable from './components/PlanetTable'
import NakshatraTable from './components/NakshatraTable'
import KarakaTable from './components/KarakaTable'
import AshtakavargaView from './components/AshtakavargaView'
import DashaTimeline from './components/DashaTimeline'

interface ComputeResult {
  chart: {
    lagna: string
    lagnaSignNumber: number
    lagnaLongitude: number
    lagnaDegreeInSign: number
    ayanamsa: number
    planets: Array<{
      planet: string
      longitude: number
      sign: string
      signNumber: number
      degreeInSign: number
      house: number
      retrograde: boolean
      speed: number
    }>
    nakshatras: Array<{
      planet: string
      nakshatra: string
      pada: number
      nakshatraLord: string
      degreeInNakshatra: number
    }>
    divisionalCharts: Array<{
      division: number
      name: string
      shortName: string
      lagna: string
      lagnaSignNumber: number
      planets: Array<{
        planet: string
        sign: string
        signNumber: number
        house: number
      }>
    }>
    charaKarakas: Array<{
      planet: string
      karaka: string
      karakaAbbr: string
      degreeInSign: number
    }>
    ashtakavarga: {
      bav: Record<string, number[]>
      sav: number[]
      savTotal: number
    }
  }
  dashaTree: {
    balance_years: number
    mahadashas: Array<{
      lord: string
      start: string
      end: string
      duration_days: number
      antardashas: Array<{
        lord: string
        start: string
        end: string
        duration_days: number
        pratyantardashas?: Array<{
          lord: string
          start: string
          end: string
          duration_days: number
        }>
      }>
    }>
  }
}

export default function ComputePage() {
  const [form, setForm] = useState({
    name: '',
    date: '',
    time: '',
    timezone: '5.5',
    latitude: '',
    longitude: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ComputeResult | null>(null)
  const [activeTab, setActiveTab] = useState<'charts' | 'planets' | 'nakshatras' | 'karakas' | 'ashtakavarga' | 'dasha'>('charts')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name || undefined,
          date: form.date,
          time: form.time,
          timezone: parseFloat(form.timezone),
          latitude: parseFloat(form.latitude),
          longitude: parseFloat(form.longitude),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Computation failed')
        return
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Chart Computation</h1>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="mb-8 rounded-lg border border-gray-700 bg-gray-800/50 p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name (optional)</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
                placeholder="Client name"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Date of Birth *</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
                className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Time of Birth *</label>
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                required
                step="1"
                className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Timezone (hours) *</label>
              <select
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="-12">UTC-12</option>
                <option value="-11">UTC-11</option>
                <option value="-10">UTC-10 (Hawaii)</option>
                <option value="-9">UTC-9 (Alaska)</option>
                <option value="-8">UTC-8 (PST)</option>
                <option value="-7">UTC-7 (MST)</option>
                <option value="-6">UTC-6 (CST)</option>
                <option value="-5">UTC-5 (EST)</option>
                <option value="-4">UTC-4</option>
                <option value="-3.5">UTC-3:30</option>
                <option value="-3">UTC-3</option>
                <option value="-2">UTC-2</option>
                <option value="-1">UTC-1</option>
                <option value="0">UTC+0 (GMT)</option>
                <option value="1">UTC+1 (CET)</option>
                <option value="2">UTC+2</option>
                <option value="3">UTC+3</option>
                <option value="3.5">UTC+3:30 (Iran)</option>
                <option value="4">UTC+4</option>
                <option value="4.5">UTC+4:30</option>
                <option value="5">UTC+5 (PKT)</option>
                <option value="5.5">UTC+5:30 (IST)</option>
                <option value="5.75">UTC+5:45 (Nepal)</option>
                <option value="6">UTC+6</option>
                <option value="6.5">UTC+6:30</option>
                <option value="7">UTC+7</option>
                <option value="8">UTC+8 (CST/SGT)</option>
                <option value="9">UTC+9 (JST)</option>
                <option value="9.5">UTC+9:30</option>
                <option value="10">UTC+10 (AEST)</option>
                <option value="11">UTC+11</option>
                <option value="12">UTC+12 (NZST)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Latitude *</label>
              <input
                type="number"
                step="0.0001"
                value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                required
                placeholder="28.6139"
                className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Longitude *</label>
              <input
                type="number"
                step="0.0001"
                value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                required
                placeholder="77.2090"
                className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Computing...' : 'Compute Chart'}
            </button>
            {result && (
              <span className="text-sm text-gray-400">
                Lagna: <strong className="text-white">{result.chart.lagna}</strong> ({result.chart.lagnaDegreeInSign.toFixed(2)}°)
                | Ayanamsa: {result.chart.ayanamsa.toFixed(4)}°
              </span>
            )}
          </div>

          {error && (
            <div className="mt-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">
              {error}
            </div>
          )}
        </form>

        {/* Results */}
        {result && (
          <div>
            {/* Tab Navigation */}
            <div className="flex gap-1 mb-6 border-b border-gray-700">
              {([
                { key: 'charts', label: 'Divisional Charts' },
                { key: 'planets', label: 'Planets' },
                { key: 'nakshatras', label: 'Nakshatras' },
                { key: 'karakas', label: 'Karakas' },
                { key: 'ashtakavarga', label: 'Ashtakavarga' },
                { key: 'dasha', label: 'Dasha' },
              ] as const).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-indigo-500 text-white'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'charts' && (
              <ChartGrid charts={result.chart.divisionalCharts} />
            )}
            {activeTab === 'planets' && (
              <PlanetTable planets={result.chart.planets} lagna={result.chart.lagna} />
            )}
            {activeTab === 'nakshatras' && (
              <NakshatraTable nakshatras={result.chart.nakshatras} />
            )}
            {activeTab === 'karakas' && (
              <KarakaTable karakas={result.chart.charaKarakas} />
            )}
            {activeTab === 'ashtakavarga' && (
              <AshtakavargaView data={result.chart.ashtakavarga} />
            )}
            {activeTab === 'dasha' && (
              <DashaTimeline dashaTree={result.dashaTree} />
            )}
          </div>
        )}
      </div>
    </main>
  )
}
