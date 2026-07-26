/**
 * / — Chart Computation UI (home page)
 */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import ChartSummaryTab from './components/ChartSummaryTab'
import ChartGrid from './components/ChartGrid'
import PlanetTable from './components/PlanetTable'
import NakshatraTable from './components/NakshatraTable'
import KarakaTable from './components/KarakaTable'
import AshtakavargaView from './components/AshtakavargaView'
import DashaTimeline from './components/DashaTimeline'
import CharaDashaView from './components/CharaDashaView'
import TransitsView from './components/TransitsView'
import PindaStrengthView from './components/PindaStrengthView'
import VarshaphalView from './components/VarshaphalView'
import CopyForAIPanel from './components/CopyForAIPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import PageHeader from './components/PageHeader'

type Tab = 'summary' | 'charts' | 'planets' | 'nakshatras' | 'karakas' | 'ashtakavarga' | 'dasha' | 'charadasha' | 'transits' | 'pinda' | 'varshaphal'

const TABS: { key: Tab; label: string }[] = [
  { key: 'summary',     label: 'Summary' },
  { key: 'charts',       label: 'Divisional Charts' },
  { key: 'planets',      label: 'Planets' },
  { key: 'nakshatras',   label: 'Nakshatras' },
  { key: 'karakas',      label: 'Karakas' },
  { key: 'ashtakavarga', label: 'Ashtakavarga' },
  { key: 'dasha',        label: 'Dasha (Vimshottari)' },
  { key: 'charadasha',   label: 'Chara Dasha' },
  { key: 'transits',     label: 'Transits' },
  { key: 'pinda',        label: 'Pinda Strength' },
  { key: 'varshaphal',   label: 'Varshaphal' },
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

// Saved charts are UnifiedChart rows — the single canonical store shared
// with AI Analysis and Duration Analysis (SavedChart is legacy/read-only).
interface SavedChartSummary {
  id: string
  name: string
  lagna: string
  source: string
  birthDatetime: string
  createdAt: string
}

export default function ComputePage() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '',
    date: '',
    time: '',
    timezone: '5.5',
    latitude: '',
    longitude: '',
    sunriseMode: 'precise' as 'precise' | 'jhora',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [result, setResult] = useState<any | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('summary')

  // Save chart state
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Id of the saved chart currently loaded into the form, if any — lets
  // Save Chart update that chart in place instead of creating a duplicate
  // when birth data is edited after loading.
  const [loadedChartId, setLoadedChartId] = useState<string | null>(null)

  // Run AI Analysis state
  const [analyzeSaving, setAnalyzeSaving] = useState(false)

  // Copy for AI panel
  const [showCopyPanel, setShowCopyPanel] = useState(false)

  // Saved charts list state
  const [savedCharts, setSavedCharts] = useState<SavedChartSummary[]>([])
  const [loadingCharts, setLoadingCharts] = useState(false)
  const [loadingChart, setLoadingChart] = useState<string | null>(null)

  // Load saved charts list (UnifiedChart — the canonical store)
  const fetchSavedCharts = useCallback(async () => {
    setLoadingCharts(true)
    try {
      const res = await fetch('/api/unified-charts')
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
      setActiveTab('summary')
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
      // Save to the canonical UnifiedChart store (same as AI Analysis / Duration Analysis).
      // existingChartId, when set, updates that chart in place instead of
      // creating a duplicate (see handleLoadChart / the "editing" banner).
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
          existingChartId: loadedChartId ?? undefined,
        }),
      })

      const data = await res.json()
      if (res.status === 201) {
        setSaveMessage('Chart saved to Unified Charts')
        setLoadedChartId(data.id) // further saves update this new chart, not duplicate it
        fetchSavedCharts() // Refresh the list
      } else if (res.status === 200) {
        setSaveMessage('Chart updated')
        fetchSavedCharts() // Refresh the list (name/lagna may have changed)
      } else if (res.status === 409) {
        setSaveMessage(`Already saved as "${data.name}" — rename it from the Unified Charts page if needed`)
      } else if (res.status === 404) {
        setLoadedChartId(null)
        setSaveMessage(`Save failed: ${data.error}`)
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
          existingChartId: loadedChartId ?? undefined,
        }),
      })

      const data = await res.json()

      if (res.status === 201 || res.status === 200 || res.status === 409) {
        // Created, updated, or already exists — navigate to analyze page
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
      const res = await fetch(`/api/unified-charts/${chartId}`)
      if (!res.ok) {
        setError('Failed to load chart')
        return
      }
      const data = await res.json()

      // Compute-sourced charts store the original BirthInput; paste-sourced
      // charts have no birth data to load into the compute form.
      const birth = data.birthInput as
        | { date?: string; time?: string; timezone?: number; latitude?: number; longitude?: number; sunriseMode?: string }
        | null
      if (data.source !== 'compute' || !birth?.date || !birth?.time) {
        setError('This chart was pasted as JSON — it has no birth data to load. View it on the Unified Charts page.')
        return
      }

      // Populate form with saved birth data
      const loadedForm = {
        name: data.name as string,
        date: birth.date,
        time: birth.time.length === 8 ? birth.time.slice(0, 5) : birth.time,
        timezone: String(birth.timezone ?? 5.5),
        latitude: String(birth.latitude ?? ''),
        longitude: String(birth.longitude ?? ''),
        sunriseMode: (birth.sunriseMode ?? data.sunriseMode ?? 'precise') as 'precise' | 'jhora',
      }
      setForm(loadedForm)

      // Recompute for display — deterministic and fast, avoids storing a
      // second copy of the display shape.
      const computeRes = await fetch('/api/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: loadedForm.name || undefined,
          date: loadedForm.date,
          time: loadedForm.time,
          timezone: parseFloat(loadedForm.timezone),
          latitude: parseFloat(loadedForm.latitude),
          longitude: parseFloat(loadedForm.longitude),
          sunriseMode: loadedForm.sunriseMode,
        }),
      })
      const computed = await computeRes.json()
      if (!computeRes.ok) {
        setError(computed.error || 'Failed to recompute chart')
        return
      }

      setResult(computed)
      setActiveTab('summary')
      setSaveMessage(null)
      setError(null)
      setLoadedChartId(chartId)
    } catch (err) {
      setError('Failed to load chart')
    } finally {
      setLoadingChart(null)
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <PageHeader
            title="Chart Computation"
            subtitle="Compute a Vedic chart from birth data, then save, analyse, or export it."
          />
          <div className="flex items-center gap-2">
            <Select
              value=""
              onValueChange={(chartId) => { if (chartId) handleLoadChart(chartId) }}
            >
              <SelectTrigger className="w-[240px] h-9 text-sm">
                <SelectValue placeholder={
                  loadingCharts
                    ? 'Loading charts…'
                    : loadingChart
                      ? 'Loading…'
                      : savedCharts.length > 0
                        ? 'Load Saved Chart'
                        : 'No saved charts'
                } />
              </SelectTrigger>
              <SelectContent>
                {savedCharts.map((chart) => (
                  <SelectItem key={chart.id} value={chart.id}>
                    {chart.name} ({chart.lagna})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Input Form */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Name (optional)</label>
                  <Input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Client name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Date of Birth *</label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Time of Birth *</label>
                  <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} required step="1" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Timezone *</label>
                  <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Latitude * <span className="text-muted-foreground/70">(±90, 7 decimals)</span></label>
                  <Input type="number" step="0.0000001" min="-90" max="90" value={form.latitude}
                    onChange={(e) => setForm({ ...form, latitude: e.target.value })} required placeholder="28.6139000"
                    className="font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Longitude * <span className="text-muted-foreground/70">(±180, 7 decimals)</span></label>
                  <Input type="number" step="0.0000001" min="-180" max="180" value={form.longitude}
                    onChange={(e) => setForm({ ...form, longitude: e.target.value })} required placeholder="77.2090000"
                    className="font-mono" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Sunrise Convention
                    <span className="ml-1 text-muted-foreground/70 font-normal">for BL · HL · GL · VL · PL</span>
                  </label>
                  <Select
                    value={form.sunriseMode}
                    onValueChange={(v) => setForm({ ...form, sunriseMode: v as 'precise' | 'jhora' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="precise">Precise — real astronomical sunrise</SelectItem>
                      <SelectItem value="jhora">JHora compatible — fixed 6:00 AM local</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.sunriseMode === 'jhora' && (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                      JHora mode uses a fixed 6 AM sunrise. Matches Jagannatha Hora output but is less accurate.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center gap-4 flex-wrap">
                <Button type="submit" disabled={loading}>
                  {loading ? 'Computing...' : 'Compute Chart'}
                </Button>

                {/* Save Chart Button */}
                {result && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleSaveChart}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Chart'}
                  </Button>
                )}

                {/* Run AI Analysis Button */}
                {result && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleRunAnalysis}
                    disabled={analyzeSaving}
                  >
                    {analyzeSaving ? 'Preparing...' : 'Run AI Analysis'}
                  </Button>
                )}

                {/* Copy for AI Button */}
                {result && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCopyPanel(true)}
                  >
                    Copy for AI
                  </Button>
                )}

                {/* Editing indicator — Save Chart updates this chart in place;
                    click "Save as new" to detach and create a separate chart instead. */}
                {loadedChartId && (
                  <span className="text-sm text-muted-foreground">
                    Editing a saved chart — Save Chart will update it.{' '}
                    <button
                      type="button"
                      onClick={() => setLoadedChartId(null)}
                      className="underline hover:text-foreground"
                    >
                      Save as new instead
                    </button>
                  </span>
                )}

                {/* Save feedback */}
                {saveMessage && (
                  <span className={`text-sm ${saveMessage.includes('failed') ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {saveMessage}
                  </span>
                )}

                {result && (
                  <span className="text-sm text-muted-foreground">
                    Lagna: <strong className="text-ink">{result.chart.lagna}</strong> ({result.chart.lagnaDegreeInSign.toFixed(2)}°)
                    {' '}| Ayanamsa: {result.chart.ayanamsa.toFixed(4)}°
                    {' '}| Sunrise: <span className={result.chart.sunriseMode === 'jhora' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}>
                      {result.chart.sunriseMode === 'jhora' ? 'JHora 6AM' : 'Precise'}
                    </span>
                    {result.chart.transits?.sadeSati?.active && (
                      <span className="ml-3 text-amber-600 dark:text-amber-400 font-medium">⚠ Sade Sati Active</span>
                    )}
                  </span>
                )}
              </div>

              {error && (
                <div className="mt-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded px-3 py-2">{error}</div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <div>
            {/* Tab Navigation */}
            <div className="flex flex-wrap gap-0.5 mb-6 border-b border-border">
              {TABS.map((tab) => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.key ? 'border-primary text-ink' : 'border-transparent text-muted-foreground hover:text-ink'
                  }`}>
                  {tab.label}
                  {tab.key === 'transits' && result.chart.transits?.sadeSati?.active && (
                    <span className="ml-1 text-amber-500">⚠</span>
                  )}
                </button>
              ))}
            </div>

            {activeTab === 'summary' && (
              <ChartSummaryTab
                planets={result.chart.planets}
                nakshatras={result.chart.nakshatras}
                divisionalCharts={result.chart.divisionalCharts}
                charaKarakas={result.chart.charaKarakas}
                upagrahas={result.chart.upagrahas}
                specialLagnas={result.chart.specialLagnas}
                arudhaPadas={result.chart.arudhaPadas}
                shadbala={result.chart.shadbala}
                lagna={result.chart.lagna}
              />
            )}
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
            {activeTab === 'charadasha' && (
              <CharaDashaView charaDasha={result.charaDasha} />
            )}
            {activeTab === 'transits' && (
              <TransitsView data={result.chart.transits} birthDate={form.date} />
            )}
            {activeTab === 'pinda' && (
              <PindaStrengthView data={result.chart.pindaStrength} />
            )}
            {activeTab === 'varshaphal' && (
              <VarshaphalView form={form} />
            )}
          </div>
        )}
      </div>

      {/* Copy for AI Panel */}
      {showCopyPanel && result && (
        <CopyForAIPanel
          chart={result.chart}
          dashaTree={result.dashaTree}
          charaDasha={result.charaDasha}
          form={form}
          onClose={() => setShowCopyPanel(false)}
        />
      )}
    </main>
  )
}
