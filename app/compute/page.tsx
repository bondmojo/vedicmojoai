/**
 * /compute — Chart Computation UI
 */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ChartGrid from './components/ChartGrid'
import PlanetTable from './components/PlanetTable'
import NakshatraTable from './components/NakshatraTable'
import KarakaTable from './components/KarakaTable'
import AshtakavargaView from './components/AshtakavargaView'
import DashaTimeline from './components/DashaTimeline'
import TransitsView from './components/TransitsView'
import PindaStrengthView from './components/PindaStrengthView'
import CopyForAIPanel from './components/CopyForAIPanel'

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

interface SavedChartSummary {
  id: string
  name: string
  birthDate: string
  birthTime: string
  timezone: number
  latitude: number
  longitude: number
  sunriseMode: string
  lagna: string
  lagnaLongitude: number
  moonLongitude: number
  ayanamsa: number
  createdAt: string
  updatedAt: string
}

export default function ComputePage() {
  const router = useRouter()
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

  // Save chart state
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Run AI Analysis state
  const [analyzeSaving, setAnalyzeSaving] = useState(false)

  // Copy for AI panel
  const [showCopyPanel, setShowCopyPanel] = useState(false)

  // Saved charts list state
  const [savedCharts, setSavedCharts] = useState<SavedChartSummary[]>([])
  const [loadingCharts, setLoadingCharts] = useState(false)
  const [showSavedCharts, setShowSavedCharts] = useState(false)
  const [loadingChart, setLoadingChart] = useState<string | null>(null)

  // Load saved charts list
  const fetchSavedCharts = useCallback(async () => {
    setLoadingCharts(true)
    try {
      const res = await fetch('/api/compute/charts')
      if (res.ok) {
        const data = await res.json()
        setSavedCharts(data)
      }
    } catch {
      // Silently fail — list is non-critical
    } finally {
      setLoadingCharts(false)
    }
  }, [])

  useEffect(() => {
    fetchSavedCharts()
  }, [fetchSavedCharts])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSaveMessage(null)
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

  async function handleSaveChart() {
    if (!result) return
    setSaving(true)
    setSaveMessage(null)

    try {
      const res = await fetch('/api/compute/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name || 'Unnamed Chart',
          birthDate: form.date,
          birthTime: form.time,
          timezone: parseFloat(form.timezone),
          latitude: parseFloat(form.latitude),
          longitude: parseFloat(form.longitude),
          sunriseMode: form.sunriseMode,
          chartData: result.chart,
          dashaTree: result.dashaTree,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        setSaveMessage(data.isUpdate ? 'Chart updated successfully' : 'Chart saved successfully')
        fetchSavedCharts() // Refresh the list
      } else {
        setSaveMessage(`Save failed: ${data.error}`)
      }
    } catch (err) {
      setSaveMessage('Save failed: Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleRunAnalysis() {
    if (!result) return
    setAnalyzeSaving(true)
    setSaveMessage(null)

    try {
      // Save to UnifiedChart via Path A (compute), then navigate to analyze
      const res = await fetch('/api/unified-charts/from-compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name || 'Unnamed Chart',
          date: form.date,
          time: form.time,
          timezone: parseFloat(form.timezone),
          latitude: parseFloat(form.latitude),
          longitude: parseFloat(form.longitude),
          sunriseMode: form.sunriseMode,
        }),
      })

      const data = await res.json()

      if (res.status === 201 || res.status === 409) {
        // Created or already exists — navigate to analyze page
        const chartId = data.id
        router.push(`/unified-charts/${chartId}/analyze`)
      } else {
        setSaveMessage(`Failed: ${data.error || 'Unknown error'}`)
      }
    } catch (err) {
      setSaveMessage('Failed to save for analysis: Network error')
    } finally {
      setAnalyzeSaving(false)
    }
  }

  async function handleLoadChart(chartId: string) {
    setLoadingChart(chartId)
    try {
      const res = await fetch(`/api/compute/charts/${chartId}`)
      if (!res.ok) {
        setError('Failed to load chart')
        return
      }
      const data = await res.json()

      // Populate form with saved birth data
      setForm({
        name: data.name,
        date: data.birthDate,
        time: data.birthTime,
        timezone: String(data.timezone),
        latitude: String(data.latitude),
        longitude: String(data.longitude),
        sunriseMode: data.sunriseMode as 'precise' | 'jhora',
      })

      // Set the result directly (no need to recompute)
      setResult({
        success: true,
        chart: data.chartData,
        dashaTree: data.dashaTree,
      })
      setActiveTab('charts')
      setShowSavedCharts(false)
      setSaveMessage(null)
      setError(null)
    } catch (err) {
      setError('Failed to load chart')
    } finally {
      setLoadingChart(null)
    }
  }

  async function handleDeleteChart(chartId: string) {
    if (!confirm('Delete this saved chart?')) return
    try {
      const res = await fetch(`/api/compute/charts/${chartId}`, { method: 'DELETE' })
      if (res.ok) {
        fetchSavedCharts()
      }
    } catch {
      // Silently fail
    }
  }

  return (
    <main className="min-h-screen p-6 bg-gray-950 text-gray-100">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Chart Computation</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/charts/newjson"
              className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-400 hover:border-amber-500 hover:text-amber-300 transition-colors"
            >
              Insert JSON
            </Link>
            <button
              onClick={() => setShowSavedCharts(!showSavedCharts)}
              className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:border-indigo-500 hover:text-white transition-colors"
            >
              {showSavedCharts ? 'Hide' : 'Load'} Saved Charts
              {savedCharts.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded bg-indigo-600/50 text-xs">
                  {savedCharts.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Saved Charts Panel */}
        {showSavedCharts && (
          <div className="mb-6 rounded-lg border border-gray-700 bg-gray-800/50 p-4">
            <h2 className="text-lg font-semibold mb-3">Saved Charts</h2>
            {loadingCharts ? (
              <p className="text-gray-400 text-sm">Loading...</p>
            ) : savedCharts.length === 0 ? (
              <p className="text-gray-500 text-sm">No saved charts yet. Compute a chart and click Save.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {savedCharts.map((chart) => (
                  <div
                    key={chart.id}
                    className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-900/50 px-4 py-3 hover:border-indigo-500/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-white truncate">{chart.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                          {chart.lagna}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {chart.birthDate} {chart.birthTime} | Lat: {chart.latitude.toFixed(4)}° Lon: {chart.longitude.toFixed(4)}°
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleLoadChart(chart.id)}
                        disabled={loadingChart === chart.id}
                        className="rounded px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                      >
                        {loadingChart === chart.id ? 'Loading...' : 'Load'}
                      </button>
                      <button
                        onClick={() => handleDeleteChart(chart.id)}
                        className="rounded px-3 py-1.5 text-xs font-medium bg-red-900/50 text-red-400 hover:bg-red-900 border border-red-800 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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

            {/* Save Chart Button */}
            {result && (
              <button
                type="button"
                onClick={handleSaveChart}
                disabled={saving}
                className="rounded-lg border border-emerald-600 bg-emerald-900/30 px-5 py-2.5 text-sm font-semibold text-emerald-400 hover:bg-emerald-900/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : 'Save Chart'}
              </button>
            )}

            {/* Run AI Analysis Button */}
            {result && (
              <button
                type="button"
                onClick={handleRunAnalysis}
                disabled={analyzeSaving}
                className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {analyzeSaving ? 'Preparing...' : 'Run AI Analysis'}
              </button>
            )}

            {/* Copy for AI Button */}
            {result && (
              <button
                type="button"
                onClick={() => setShowCopyPanel(true)}
                className="rounded-lg border border-violet-600 bg-violet-900/30 px-5 py-2.5 text-sm font-semibold text-violet-300 hover:bg-violet-900/60 transition-colors"
              >
                Copy for AI
              </button>
            )}

            {/* Save feedback */}
            {saveMessage && (
              <span className={`text-sm ${saveMessage.includes('failed') ? 'text-red-400' : 'text-emerald-400'}`}>
                {saveMessage}
              </span>
            )}

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

      {/* Copy for AI Panel */}
      {showCopyPanel && result && (
        <CopyForAIPanel
          chart={result.chart}
          dashaTree={result.dashaTree}
          form={form}
          onClose={() => setShowCopyPanel(false)}
        />
      )}
    </main>
  )
}
