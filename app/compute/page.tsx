/**
 * /compute — Chart Computation UI
 */
'use client'

import { useState } from 'react'
import ChartGrid from './components/ChartGrid'
import PlanetTable from './components/PlanetTable'
import NakshatraTable from './components/NakshatraTable'
import KarakaTable from './components/KarakaTable'
import AshtakavargaView from './components/AshtakavargaView'
import DashaTimeline from './components/DashaTimeline'
import TransitsView from './components/TransitsView'
import PindaStrengthView from './components/PindaStrengthView'

type Tab = 'charts' | 'planets' | 'nakshatras' | 'karakas' | 'ashtakavarga' | 'dasha' | 'transits' | 'pinda'

const TABS: { key: Tab; label: string }[] = [
  { key: 'charts',       label: 'Divisional Charts' },
  { key: 'planets',      label: 'Planets' },
  { key: 'nakshatras',   label: 'Nakshatras' },
  { key: 'karakas',      label: 'Karakas' },
  { key: 'ashtakavarga', label: 'Ashtakavarga' },
  { key: 'dasha',        label: 'Dasha' },
  { key: 'transits',     label: 'Transits' },
  { key: 'pinda',        label: 'Pinda Strength' },
]

const TIMEZONES = [
  ['-12','UTC-12'],['-11','UTC-11'],['-10','UTC-10 (Hawaii)'],['-9','UTC-9 (Alaska)'],
  ['-8','UTC-8 (PST)'],['-7','UTC-7 (MST)'],['-6','UTC-6 (CST)'],['-5','UTC-5 (EST)'],
  ['-4','UTC-4'],['-3.5','UTC-3:30'],['-3','UTC-3'],['-2','UTC-2'],['-1','UTC-1'],
  ['0','UTC+0 (GMT)'],['1','UTC+1 (CET)'],['2','UTC+2'],['3','UTC+3'],
  ['3.5','UTC+3:30 (Iran)'],['4','UTC+4'],['4.5','UTC+4:30'],
  ['5','UTC+5 (PKT)'],['5.5','UTC+5:30 (IST)'],['5.75','UTC+5:45 (Nepal)'],
  ['6','UTC+6'],['6.5','UTC+6:30'],['7','UTC+7'],['8','UTC+8 (CST/SGT)'],
  ['9','UTC+9 (JST)'],['9.5','UTC+9:30'],['10','UTC+10 (AEST)'],
  ['11','UTC+11'],['12','UTC+12 (NZST)'],
]

export default function ComputePage() {
  const [form, setForm] = useState({
    name: 'Mojo',
    date: '1984-05-26',
    time: '07:00:00',
    timezone: '5.5',
    latitude: '24.9386518',
    longitude: '74.6270884',
    sunriseMode: 'precise' as 'precise' | 'jhora',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [result, setResult] = useState<any | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('charts')

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
          date: form.date, time: form.time,
          timezone: parseFloat(form.timezone),
          latitude: parseFloat(form.latitude),
          longitude: parseFloat(form.longitude),
          sunriseMode: form.sunriseMode,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Computation failed'); return }
      setResult(data)
      setActiveTab('charts')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen p-6 bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Chart Computation</h1>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="mb-8 rounded-lg border border-gray-700 bg-gray-800/50 p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name (optional)</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
                placeholder="Client name" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Date of Birth *</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required
                className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Time of Birth *</label>
              <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required step="1"
                className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Timezone *</label>
              <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none">
                {TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Latitude * <span className="text-gray-600">(±90, 7 decimals)</span></label>
              <input type="number" step="0.0000001" min="-90" max="90" value={form.latitude}
                onChange={(e) => setForm({ ...form, latitude: e.target.value })} required placeholder="28.6139000"
                className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none font-mono" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Longitude * <span className="text-gray-600">(±180, 7 decimals)</span></label>
              <input type="number" step="0.0000001" min="-180" max="180" value={form.longitude}
                onChange={(e) => setForm({ ...form, longitude: e.target.value })} required placeholder="77.2090000"
                className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none font-mono" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Sunrise Convention
                <span className="ml-1 text-gray-600 font-normal">for BL · HL · GL · VL · PL</span>
              </label>
              <select
                value={form.sunriseMode}
                onChange={(e) => setForm({ ...form, sunriseMode: e.target.value as 'precise' | 'jhora' })}
                className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="precise">Precise — real astronomical sunrise</option>
                <option value="jhora">JHora compatible — fixed 6:00 AM local</option>
              </select>
              {form.sunriseMode === 'jhora' && (
                <p className="mt-1 text-xs text-amber-500">
                  JHora mode uses a fixed 6 AM sunrise. Matches Jagannatha Hora output but is less accurate.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4 flex-wrap">
            <button type="submit" disabled={loading}
              className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {loading ? 'Computing...' : 'Compute Chart'}
            </button>
            {result && (
              <span className="text-sm text-gray-400">
                Lagna: <strong className="text-white">{result.chart.lagna}</strong> ({result.chart.lagnaDegreeInSign.toFixed(2)}°)
                {' '}| Ayanamsa: {result.chart.ayanamsa.toFixed(4)}°
                {' '}| Sunrise: <span className={result.chart.sunriseMode === 'jhora' ? 'text-amber-400' : 'text-emerald-400'}>
                  {result.chart.sunriseMode === 'jhora' ? 'JHora 6AM' : 'Precise'}
                </span>
                {result.chart.transits?.sadeSati?.active && (
                  <span className="ml-3 text-amber-400 font-medium">⚠ Sade Sati Active</span>
                )}
              </span>
            )}
          </div>

          {error && (
            <div className="mt-3 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">{error}</div>
          )}
        </form>

        {/* Results */}
        {result && (
          <div>
            {/* Tab Navigation */}
            <div className="flex flex-wrap gap-0.5 mb-6 border-b border-gray-700">
              {TABS.map((tab) => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.key ? 'border-indigo-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'
                  }`}>
                  {tab.label}
                  {tab.key === 'transits' && result.chart.transits?.sadeSati?.active && (
                    <span className="ml-1 text-amber-400">⚠</span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === 'charts' && (
              <ChartGrid
                charts={result.chart.divisionalCharts}
                arudhaPadas={result.chart.arudhaPadas}
                specialLagnas={result.chart.specialLagnas}
                upagrahas={result.chart.upagrahas}
              />
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
            {activeTab === 'transits' && (
              <TransitsView data={result.chart.transits} birthDate={form.date} />
            )}
            {activeTab === 'pinda' && (
              <PindaStrengthView data={result.chart.pindaStrength} />
            )}
          </div>
        )}
      </div>
    </main>
  )
}
