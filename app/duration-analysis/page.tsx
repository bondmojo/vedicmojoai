/**
 * /duration-analysis — Duration Analysis form
 *
 * Lets the practitioner pick a unified chart, a date range, a life domain,
 * optional symptoms, and an optional question, then POSTs to
 * /api/duration-analysis and redirects to the results page.
 */
'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { DurationCategory } from '@/lib/durationTypes'

interface AnalysisSummary {
  id: string
  chartName: string
  category: string
  dateFrom: string
  dateTo: string
  status: string
  totalCostUsd: number
  createdAt: string
}

const STATUS_STYLES: Record<string, string> = {
  queued:            'bg-gray-700/50 text-gray-400',
  running:           'bg-indigo-900/50 text-indigo-300',
  symptom_unmatched: 'bg-amber-900/50 text-amber-300',
  done:              'bg-green-900/50 text-green-400',
  failed:            'bg-red-900/50 text-red-400',
  cancelled:         'bg-gray-700/50 text-gray-300',
}

interface UnifiedChartSummary {
  id: string
  name: string
  lagna: string
}

// ─── LLM provider / model options ────────────────────────────────────
// Duration Analysis defaults to the server's seeded ModelConfig (Anthropic
// Sonnet). Practitioners can override the provider + model here, and paste a
// per-run API key when the server env key for that provider is missing.

type ProviderId = 'default' | 'anthropic' | 'openai'

const PROVIDER_OPTIONS: { id: ProviderId; label: string }[] = [
  { id: 'default',   label: 'Server default (Anthropic Sonnet)' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai',    label: 'OpenAI' },
]

const MODELS_BY_PROVIDER: Record<Exclude<ProviderId, 'default'>, { id: string; label: string }[]> = {
  anthropic: [
    { id: 'claude-opus-4-5',   label: 'Claude Opus 4.5' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5' },
  ],
  openai: [
    { id: 'gpt-5.5',      label: 'GPT-5.5' },
    { id: 'gpt-5.4',      label: 'GPT-5.4' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
  ],
}

const CATEGORIES: { key: DurationCategory; label: string }[] = [
  { key: 'health',   label: 'Health' },
  { key: 'career',   label: 'Career' },
  { key: 'wealth',   label: 'Wealth' },
  { key: 'cashflow', label: 'Money / Cashflow' },
  { key: 'marriage', label: 'Marriage' },
  { key: 'property', label: 'Property' },
]

interface FormErrors {
  unifiedChartId?: string
  dateFrom?: string
  dateTo?: string
}

export default function DurationAnalysisPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen p-6 bg-gray-950 text-gray-100">
        <div className="max-w-2xl mx-auto"><p className="text-gray-500">Loading…</p></div>
      </main>
    }>
      <DurationAnalysisForm />
    </Suspense>
  )
}

function DurationAnalysisForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedChartId = searchParams.get('chartId') ?? ''

  // Chart list
  const [charts, setCharts] = useState<UnifiedChartSummary[]>([])
  const [loadingCharts, setLoadingCharts] = useState(true)
  const [chartLoadError, setChartLoadError] = useState<string | null>(null)

  // Form state
  const [unifiedChartId, setUnifiedChartId] = useState(preselectedChartId)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [category, setCategory] = useState<DurationCategory>('health')
  const [symptoms, setSymptoms] = useState('')
  const [userQuestion, setUserQuestion] = useState('')

  // LLM override state
  const [provider, setProvider] = useState<ProviderId>('default')
  const [model, setModel] = useState<string>('')
  const [apiKey, setApiKey] = useState('')

  // Submission state
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [formErrors, setFormErrors] = useState<FormErrors>({})

  // Run history
  const [history, setHistory] = useState<AnalysisSummary[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  useEffect(() => {
    fetch('/api/duration-analysis')
      .then((r) => (r.ok ? r.json() : { analyses: [] }))
      .then((data) => setHistory(data.analyses ?? []))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false))
  }, [])

  // Load charts on mount
  useEffect(() => {
    async function fetchCharts() {
      try {
        const res = await fetch('/api/unified-charts')
        if (!res.ok) {
          setChartLoadError('Failed to load charts')
          return
        }
        const data: UnifiedChartSummary[] = await res.json()
        setCharts(data)
      } catch {
        setChartLoadError('Network error loading charts')
      } finally {
        setLoadingCharts(false)
      }
    }
    fetchCharts()
  }, [])

  function validate(): boolean {
    const errors: FormErrors = {}

    if (!unifiedChartId) {
      errors.unifiedChartId = 'Please select a chart'
    }
    if (!dateFrom) {
      errors.dateFrom = 'Date from is required'
    }
    if (!dateTo) {
      errors.dateTo = 'Date to is required'
    }
    if (dateFrom && dateTo && dateFrom >= dateTo) {
      errors.dateTo = 'Date from must be before date to'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    if (!validate()) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/duration-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unifiedChartId,
          dateFrom,
          dateTo,
          category,
          symptoms: symptoms.trim() || undefined,
          userQuestion: userQuestion.trim() || undefined,
          // LLM overrides — only sent when the practitioner picks a provider.
          provider: provider !== 'default' ? provider : undefined,
          model: provider !== 'default' && model ? model : undefined,
          apiKey: provider !== 'default' && apiKey.trim() ? apiKey.trim() : undefined,
        }),
      })

      const data = await res.json()

      if (res.status === 202) {
        router.push('/duration-analysis/' + data.analysisId)
        return
      }

      setSubmitError(data.error || `Request failed (${res.status})`)
    } catch {
      setSubmitError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen p-6 bg-gray-950 text-gray-100">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Duration Analysis</h1>
          <p className="mt-1 text-gray-400 text-sm">
            Select a chart, date range, and life domain to run a focused 3-agent dasha analysis.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-gray-700 bg-gray-800/50 p-6 space-y-6">

          {/* Chart Picker */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Chart <span className="text-red-400">*</span>
            </label>
            {loadingCharts ? (
              <div className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-gray-500 text-sm">
                Loading charts…
              </div>
            ) : chartLoadError ? (
              <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">
                {chartLoadError}
              </div>
            ) : (
              <select
                value={unifiedChartId}
                onChange={(e) => {
                  setUnifiedChartId(e.target.value)
                  setFormErrors((prev) => ({ ...prev, unifiedChartId: undefined }))
                }}
                className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-ink focus:border-indigo-500 focus:outline-none"
              >
                <option value="">— select a chart —</option>
                {charts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.lagna})
                  </option>
                ))}
              </select>
            )}
            {formErrors.unifiedChartId && (
              <p className="mt-1 text-xs text-red-400">{formErrors.unifiedChartId}</p>
            )}
            {!loadingCharts && !chartLoadError && charts.length === 0 && (
              <p className="mt-1 text-xs text-gray-500">
                No charts found. Compute or paste a chart first.
              </p>
            )}
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Date From <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  setFormErrors((prev) => ({ ...prev, dateFrom: undefined, dateTo: undefined }))
                }}
                className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-ink focus:border-indigo-500 focus:outline-none"
              />
              {formErrors.dateFrom && (
                <p className="mt-1 text-xs text-red-400">{formErrors.dateFrom}</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Date To <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setFormErrors((prev) => ({ ...prev, dateTo: undefined }))
                }}
                className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-ink focus:border-indigo-500 focus:outline-none"
              />
              {formErrors.dateTo && (
                <p className="mt-1 text-xs text-red-400">{formErrors.dateTo}</p>
              )}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    category === key
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-gray-900 border-gray-600 text-gray-300 hover:border-indigo-500 hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Symptoms */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Symptoms</label>
            <textarea
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Current symptoms or observations (optional)"
              className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-ink placeholder-gray-600 focus:border-indigo-500 focus:outline-none resize-y text-sm"
            />
            <p className="mt-0.5 text-xs text-gray-600 text-right">
              {symptoms.length}/2000
            </p>
          </div>

          {/* Question */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Question</label>
            <textarea
              value={userQuestion}
              onChange={(e) => setUserQuestion(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Your question (optional)"
              className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-ink placeholder-gray-600 focus:border-indigo-500 focus:outline-none resize-y text-sm"
            />
            <p className="mt-0.5 text-xs text-gray-600 text-right">
              {userQuestion.length}/2000
            </p>
          </div>

          {/* Model & API key (optional) */}
          <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-4 space-y-4">
            <div>
              <label className="block text-sm text-gray-300 font-medium mb-1">Model &amp; API Key</label>
              <p className="text-xs text-gray-500">
                Optional. Leave on server default to use the configured Anthropic model.
                Pick a provider to override the model for all 3 agents, and paste a key if the
                server has no key for that provider.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Provider */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => {
                    const next = e.target.value as ProviderId
                    setProvider(next)
                    // Default to the first model for the chosen provider.
                    setModel(next === 'default' ? '' : MODELS_BY_PROVIDER[next][0].id)
                  }}
                  className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-ink focus:border-indigo-500 focus:outline-none"
                >
                  {PROVIDER_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Model */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={provider === 'default'}
                  className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-ink focus:border-indigo-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {provider === 'default' ? (
                    <option value="">Server default</option>
                  ) : (
                    MODELS_BY_PROVIDER[provider].map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))
                  )}
                </select>
              </div>
            </div>

            {/* API key — only relevant when overriding the provider */}
            {provider !== 'default' && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  {provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                  placeholder="Leave blank to use the server's environment key"
                  className="w-full rounded-lg bg-gray-900 border border-gray-600 px-3 py-2 text-ink placeholder-gray-600 focus:border-indigo-500 focus:outline-none font-mono text-sm"
                />
                <p className="mt-1 text-xs text-gray-600">
                  Used only for this run and never stored. Blank falls back to the server key.
                </p>
              </div>
            )}
          </div>

          {/* Submit error */}
          {submitError && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded px-3 py-2">
              {submitError}
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={submitting || loadingCharts}
              className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Starting analysis…' : 'Run Duration Analysis'}
            </button>
            {submitting && (
              <span className="text-sm text-gray-400">Creating analysis job…</span>
            )}
          </div>
        </form>

        {/* Run history */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-200 mb-3">Recent analyses</h2>
          {loadingHistory ? (
            <p className="text-sm text-gray-500">Loading history…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-gray-500">No analyses yet — run your first one above.</p>
          ) : (
            <ul className="divide-y divide-gray-800 rounded-lg border border-gray-700 bg-gray-800/50">
              {history.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/duration-analysis/${a.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-gray-800 transition-colors"
                  >
                    <span className="font-medium text-gray-100">{a.chartName}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300 capitalize">
                      {a.category}
                    </span>
                    <span className="text-sm text-gray-400">
                      {a.dateFrom.slice(0, 10)} → {a.dateTo.slice(0, 10)}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_STYLES[a.status] ?? STATUS_STYLES.queued}`}>
                      {a.status.replace(/_/g, ' ')}
                    </span>
                    <span className="ml-auto text-xs text-gray-500">
                      {new Date(a.createdAt).toLocaleString()} · ${a.totalCostUsd.toFixed(3)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
