/**
 * /unified-charts/[id]/analyze — Run AI Analysis page.
 *
 * Query type selector, free-text question field, and run button.
 * Shows source-specific info (compute charts skip Wave 1).
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

const QUERY_TYPES = [
  { id: 'generic', label: 'Generic', description: 'Balanced overview: wealth, health, career' },
  { id: 'health', label: 'Health', description: 'D30, H6/H8, disease significations' },
  { id: 'wealth', label: 'Wealth', description: 'H2/H11, Dhana yogas, accumulation periods' },
  { id: 'career', label: 'Career', description: 'D10, H10 yogas, career mode' },
  { id: 'property', label: 'Property', description: 'D4, H4, acquisition windows' },
  { id: 'marriage', label: 'Marriage', description: 'D9, H7, Venus/Jupiter karakas, timing' },
  { id: 'full', label: 'Full Analysis', description: 'All agents — comprehensive report' },
] as const

// ─── Model / Provider Options ───────────────────────────────────────

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openai', label: 'OpenAI' },
] as const

const MODELS_BY_PROVIDER: Record<string, { id: string; label: string; tier: string; cost: string }[]> = {
  anthropic: [
    { id: 'claude-opus-4-5', label: 'Claude Opus 4.5', tier: 'Final Synthesis (4C)', cost: '$15/$75 per 1M' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', tier: 'Specialists & QA (2–4)', cost: '$3/$15 per 1M' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', tier: 'Foundation (Wave 1)', cost: '$0.8/$4 per 1M' },
  ],
  openai: [
    { id: 'gpt-5.5', label: 'GPT-5.5', tier: 'Premium', cost: '$5/$20 per 1M' },
    { id: 'gpt-5.4', label: 'GPT-5.4', tier: 'General purpose', cost: '$2.5/$10 per 1M' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', tier: 'Fast/cheap', cost: '$0.15/$0.6 per 1M' },
  ],
}

type ModelPreset = 'default' | 'budget' | 'premium' | 'custom'

const MODEL_PRESETS: { id: ModelPreset; label: string; description: string }[] = [
  { id: 'default', label: 'Default (Recommended)', description: 'Haiku for Wave 1, Sonnet for 2–4, Opus for final synthesis' },
  { id: 'budget', label: 'Budget', description: 'Haiku for all waves — fast and cheap, lower quality' },
  { id: 'premium', label: 'Premium', description: 'Sonnet for all waves, Opus for final — highest quality' },
  { id: 'custom', label: 'Custom', description: 'Choose provider and model per wave tier' },
]

interface ChartMeta {
  id: string
  name: string
  source: 'compute' | 'paste'
  lagna: string
  birthDatetime: string
}

export default function AnalyzePage() {
  const router = useRouter()
  const params = useParams()
  const chartId = params.id as string

  const [chart, setChart] = useState<ChartMeta | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [userQuery, setUserQuery] = useState('')
  const [forceRerunWave1, setForceRerunWave1] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outputFormat, setOutputFormat] = useState<'html' | 'markdown'>('html')

  // Model selection state
  const [modelPreset, setModelPreset] = useState<ModelPreset>('default')
  const [customProvider, setCustomProvider] = useState('anthropic')
  const [customFoundationModel, setCustomFoundationModel] = useState('claude-haiku-4-5')
  const [customSpecialistModel, setCustomSpecialistModel] = useState('claude-sonnet-4-5')
  const [customSynthesisModel, setCustomSynthesisModel] = useState('claude-opus-4-5')

  useEffect(() => {
    fetch(`/api/unified-charts/${chartId}`)
      .then((res) => res.json())
      .then((data) => setChart(data))
      .catch(() => setError('Failed to load chart'))
  }, [chartId])

  function toggleType(type: string) {
    if (type === 'full') {
      setSelectedTypes(['full'])
      return
    }
    setSelectedTypes((prev) => {
      const filtered = prev.filter((t) => t !== 'full')
      return filtered.includes(type)
        ? filtered.filter((t) => t !== type)
        : [...filtered, type]
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Build model override config based on preset
    let modelOverride: Record<string, { provider: string; model: string }> | undefined
    if (modelPreset === 'budget') {
      modelOverride = {
        foundation: { provider: 'anthropic', model: 'claude-haiku-4-5' },
        specialist: { provider: 'anthropic', model: 'claude-haiku-4-5' },
        synthesis: { provider: 'anthropic', model: 'claude-haiku-4-5' },
      }
    } else if (modelPreset === 'premium') {
      modelOverride = {
        foundation: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
        specialist: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
        synthesis: { provider: 'anthropic', model: 'claude-opus-4-5' },
      }
    } else if (modelPreset === 'custom') {
      modelOverride = {
        foundation: { provider: customProvider, model: customFoundationModel },
        specialist: { provider: customProvider, model: customSpecialistModel },
        synthesis: { provider: customProvider, model: customSynthesisModel },
      }
    }

    try {
      const res = await fetch(`/api/unified-charts/${chartId}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queryTypes: selectedTypes.length > 0 ? selectedTypes : ['generic'],
          userQuery: userQuery || undefined,
          forceRerunWave1,
          outputFormat,
          modelOverride,
        }),
      })

      const data = await res.json()

      if (res.status === 202) {
        router.push(`/runs/${data.runId}`)
      } else {
        setError(data.error || 'Failed to start analysis')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  if (!chart) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-3xl mx-auto">
          <p className="text-gray-500">Loading chart...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Run AI Analysis</h1>
          <div className="flex items-center gap-3 mt-2 text-gray-400">
            <span className="text-lg">{chart.name}</span>
            <span className="text-sm">({chart.lagna} Lagna)</span>
            <SourceBadge source={chart.source} />
          </div>
        </div>

        {/* Wave strategy info */}
        <div className={`rounded-lg border p-4 mb-6 text-sm ${
          chart.source === 'compute'
            ? 'border-cyan-800 bg-cyan-900/20 text-cyan-300'
            : 'border-purple-800 bg-purple-900/20 text-purple-300'
        }`}>
          {chart.source === 'compute' ? (
            <p>
              <strong>Compute path:</strong> Foundation data (Wave 1) is already computed
              deterministically. The AI pipeline will start from Wave 2 (domain specialists).
            </p>
          ) : (
            <p>
              <strong>Paste path:</strong> The full Wave 1–4 pipeline will run, including
              foundation extraction by LLM agents (1A–1D).
            </p>
          )}
        </div>

        {/* Duration Analysis link */}
        <div className="rounded-lg border border-amber-800 bg-amber-900/20 p-4 mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-amber-300 font-medium">Duration Analysis</p>
            <p className="text-xs text-amber-400/70 mt-0.5">
              Focused dasha-period analysis for a specific date range and life domain (3-agent pipeline).
            </p>
          </div>
          <a
            href={`/duration-analysis?chartId=${chartId}`}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 transition-colors whitespace-nowrap"
          >
            Run Duration Analysis
          </a>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Query Type Selection */}
          <section>
            <h2 className="text-lg font-medium mb-3">Analysis Type</h2>
            <div className="grid grid-cols-2 gap-3">
              {QUERY_TYPES.map((qt) => (
                <button
                  key={qt.id}
                  type="button"
                  onClick={() => toggleType(qt.id)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    selectedTypes.includes(qt.id)
                      ? 'border-indigo-500 bg-indigo-900/20'
                      : 'border-gray-700 hover:border-gray-500'
                  }`}
                >
                  <span className="font-medium text-sm">{qt.label}</span>
                  <p className="text-xs text-gray-500 mt-1">{qt.description}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Free-text query */}
          <section>
            <h2 className="text-lg font-medium mb-3">Question (optional)</h2>
            <textarea
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              rows={3}
              className="w-full rounded-lg bg-gray-900 border border-gray-700 p-3 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              placeholder="e.g., When is the best period for career growth in the next 5 years?"
            />
          </section>

          {/* Output Format */}
          <section>
            <h2 className="text-lg font-medium mb-3">Output Format</h2>
            <div className="grid grid-cols-2 gap-3">
              {([
                {
                  id: 'html' as const,
                  label: 'HTML Report',
                  description: 'Interactive tabbed report — open in browser, best for sharing',
                },
                {
                  id: 'markdown' as const,
                  label: 'Markdown (.md)',
                  description: 'Plain .md file — displayed inline, downloadable for notes',
                },
              ]).map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setOutputFormat(fmt.id)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    outputFormat === fmt.id
                      ? 'border-indigo-500 bg-indigo-900/20'
                      : 'border-gray-700 hover:border-gray-500'
                  }`}
                >
                  <span className="font-medium text-sm">{fmt.label}</span>
                  <p className="text-xs text-gray-500 mt-1">{fmt.description}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Model / LLM Selection */}
          <section>
            <h2 className="text-lg font-medium mb-3">Model & LLM</h2>

            {/* Presets */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              {MODEL_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setModelPreset(preset.id)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    modelPreset === preset.id
                      ? 'border-indigo-500 bg-indigo-900/20'
                      : 'border-gray-700 hover:border-gray-500'
                  }`}
                >
                  <span className="font-medium text-sm">{preset.label}</span>
                  <p className="text-xs text-gray-500 mt-1">{preset.description}</p>
                </button>
              ))}
            </div>

            {/* Custom model selection */}
            {modelPreset === 'custom' && (
              <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4 space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Provider</label>
                  <select
                    value={customProvider}
                    onChange={(e) => {
                      setCustomProvider(e.target.value)
                      // Reset models to first available for new provider
                      const models = MODELS_BY_PROVIDER[e.target.value]
                      if (models) {
                        setCustomFoundationModel(models[models.length - 1].id)
                        setCustomSpecialistModel(models[Math.min(1, models.length - 1)].id)
                        setCustomSynthesisModel(models[0].id)
                      }
                    }}
                    className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Foundation (Wave 1)
                    </label>
                    <select
                      value={customFoundationModel}
                      onChange={(e) => setCustomFoundationModel(e.target.value)}
                      className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    >
                      {MODELS_BY_PROVIDER[customProvider]?.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-600 mt-1">Agents 1A–1D</p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Specialists (Wave 2–3)
                    </label>
                    <select
                      value={customSpecialistModel}
                      onChange={(e) => setCustomSpecialistModel(e.target.value)}
                      className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    >
                      {MODELS_BY_PROVIDER[customProvider]?.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-600 mt-1">Agents 2A–3D, 4X, 4A, 4B</p>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Final Synthesis (4C)
                    </label>
                    <select
                      value={customSynthesisModel}
                      onChange={(e) => setCustomSynthesisModel(e.target.value)}
                      className="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    >
                      {MODELS_BY_PROVIDER[customProvider]?.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-600 mt-1">Agent 4C (report)</p>
                  </div>
                </div>

                {/* Cost indicator */}
                <div className="text-xs text-gray-500 border-t border-gray-700 pt-3">
                  <span className="font-medium text-gray-400">Estimated cost per model:</span>
                  <div className="flex flex-wrap gap-3 mt-1">
                    {MODELS_BY_PROVIDER[customProvider]?.map((m) => (
                      <span key={m.id}>{m.label}: {m.cost}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Options (paste-path only) */}
          {chart.source === 'paste' && (
            <section>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceRerunWave1}
                  onChange={(e) => setForceRerunWave1(e.target.checked)}
                  className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-300">Force re-run Wave 1 (skip cache)</span>
              </label>
            </section>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-700 p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Starting Analysis...' : 'Run AI Analysis'}
          </button>
        </form>
      </div>
    </main>
  )
}

function SourceBadge({ source }: { source: string }) {
  const styles = source === 'compute'
    ? 'bg-cyan-900/50 text-cyan-400'
    : 'bg-purple-900/50 text-purple-400'

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles}`}>
      {source}
    </span>
  )
}
