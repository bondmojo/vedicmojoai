/**
 * tools.ts — Deterministic-data MCP tools (synchronous, no paid LLM).
 *
 * Every tool is a thin wrapper over a VedicMojoAI HTTP route. NONE of them call
 * the paid pipeline routes (POST /api/unified-charts/[id]/analyze,
 * POST /api/duration-analysis) — that is the whole point of this server.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { api, ApiError } from './http.js'
import {
  birthDataSchema,
  chartRefShape,
  resolveChart,
  activeDashaChain,
  type NormalizedChart,
} from './chart.js'

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

const ok = (data: unknown): ToolResult => ({
  content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
})

const fail = (message: string): ToolResult => ({
  content: [{ type: 'text', text: `Error: ${message}` }],
  isError: true,
})

/** Wrap a handler so ApiError/others become clean tool errors, not crashes. */
function guard(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  return fn().catch((err) => {
    if (err instanceof ApiError) return fail(`${err.message} (HTTP ${err.status})`)
    return fail(err instanceof Error ? err.message : String(err))
  })
}

const CATEGORY = z.enum(['health', 'career', 'wealth', 'marriage', 'property', 'cashflow'])

/** Guard extractor output for paste charts that lack computed domains. */
function extractOrGuide(chart: NormalizedChart, value: unknown, domain: string): ToolResult {
  if (chart.isPasteWithoutComputed) {
    return ok({
      note: `This is a paste-source chart with no computed ${domain}. Re-create it via compute, or pass birthData to compute on the fly.`,
      source: chart.source,
      [domain]: null,
    })
  }
  return ok({ source: chart.source, name: chart.name, [domain]: value })
}

export function registerTools(server: McpServer): void {
  // ── Discovery ─────────────────────────────────────────────────────
  server.registerTool(
    'list_clients',
    {
      title: 'List / search clients (charts)',
      description:
        'List saved charts (each chart == one person/client). Optional filters: search by name, lagna sign, or source (compute|paste). Returns id, name, lagna, birthDatetime, run counts.',
      inputSchema: {
        search: z.string().optional().describe('Case-insensitive name contains'),
        lagna: z.string().optional().describe('Exact lagna sign, e.g. Taurus'),
        source: z.enum(['compute', 'paste']).optional(),
      },
    },
    async (a) =>
      guard(async () => {
        const q = new URLSearchParams()
        if (a.search) q.set('search', a.search)
        if (a.lagna) q.set('lagna', a.lagna)
        if (a.source) q.set('source', a.source)
        const qs = q.toString()
        return ok(await api.get(`/api/unified-charts${qs ? `?${qs}` : ''}`))
      })
  )

  server.registerTool(
    'get_client_chart',
    {
      title: 'Get a full stored chart',
      description:
        'Load a saved chart with all computed domains. Optionally return only certain sections to keep the payload small.',
      inputSchema: {
        chartId: z.string().uuid(),
        sections: z
          .array(z.string())
          .optional()
          .describe('Subset of keys to return, e.g. ["shadbala","dashaTree","divisionalCharts"]'),
      },
    },
    async (a) =>
      guard(async () => {
        const chart = (await api.get(`/api/unified-charts/${a.chartId}`)) as Record<string, unknown>
        if (!a.sections || a.sections.length === 0) return ok(chart)
        const keep = new Set(['id', 'name', 'source', 'lagna', ...a.sections])
        const sliced: Record<string, unknown> = {}
        for (const k of keep) if (k in chart) sliced[k] = chart[k]
        return ok(sliced)
      })
  )

  // ── Stateless computation (no DB, no LLM) ─────────────────────────
  server.registerTool(
    'compute_chart',
    {
      title: 'Compute a full natal chart from birth data',
      description:
        'Deterministic Swiss-Ephemeris computation: planets, 12 divisional charts, nakshatras, karakas, ashtakavarga, shadbala, relationships, Jaimini, bhava bala, plus the Vimshottari dasha tree. Nothing is saved.',
      inputSchema: birthDataSchema.shape,
    },
    async (a) => guard(async () => ok(await api.post('/api/compute', a)))
  )

  server.registerTool(
    'compute_varshaphal',
    {
      title: 'Compute a Varshaphal (annual Tajika) chart',
      description:
        'Annual solar-return chart for a given civil year: Varsha Pravesh instant, annual chart, Muntha, Panchavargeeya Bala, and the Varshesha (year lord).',
      inputSchema: { ...birthDataSchema.shape, varshaYear: z.number().int().min(1800).max(2399) },
    },
    async (a) => guard(async () => ok(await api.post('/api/compute/varshaphal', a)))
  )

  // ── Focused extractors (stored chartId OR raw birthData) ──────────
  const extractor = (
    name: string,
    title: string,
    description: string,
    project: (c: NormalizedChart) => { domain: string; value: unknown },
    extraShape: Record<string, z.ZodTypeAny> = {}
  ) =>
    server.registerTool(
      name,
      { title, description, inputSchema: { ...chartRefShape, ...extraShape } },
      async (a) =>
        guard(async () => {
          const chart = await resolveChart(a as { chartId?: string; birthData?: any })
          const { domain, value } = project(chart)
          return extractOrGuide(chart, value, domain)
        })
    )

  extractor('get_shadbala', 'Get Shadbala (six-fold strength)', 'Per-planet Shadbala with virupas/rupas, strength grade, and the overall strength ranking.', (c) => ({ domain: 'shadbala', value: c.shadbala }))
  extractor('get_ashtakavarga', 'Get Ashtakavarga', 'Bhinnashtakavarga (per graha) and Sarvashtakavarga bindus per house.', (c) => ({ domain: 'ashtakavarga', value: c.ashtakavarga }))
  extractor('get_relationships', 'Get planetary relationships/geometry', 'Conjunctions, graha & rashi aspects, planetary war, mutual reception, combustion, avastha, gandanta, stelliums.', (c) => ({ domain: 'relationships', value: c.relationships }))
  extractor('get_jaimini', 'Get Jaimini geometry + chara karakas', 'Chara karakas (AK…DK), argala/virodha argala, yogi/avayogi points, special-lagna aspects.', (c) => ({ domain: 'jaimini', value: { jaimini: c.jaimini, charaKarakas: c.karakas } }))
  extractor('get_bhava_bala', 'Get Bhava Bala (house strength)', 'Per-house strength: bhavadhipati bala, dig bala, drishti bala, totals.', (c) => ({ domain: 'bhavaBala', value: c.bhavaBala }))
  extractor('get_transits', 'Get transits + Sade Sati', "Current transits (from Moon and Lagna), Sade Sati phase/periods, Ashtama/Kantaka Shani. Reflects the chart's computation time.", (c) => ({ domain: 'transits', value: c.transits }))
  extractor('get_dasha_tree', 'Get the full Vimshottari dasha tree', 'Complete MD → AD → PD Vimshottari tree with start/end dates.', (c) => ({ domain: 'dashaTree', value: c.dashaTree }))

  server.registerTool(
    'get_divisional_chart',
    {
      title: 'Get divisional chart(s)',
      description:
        'Divisional (varga) charts. Supported: D1,D2,D3,D4,D5,D6,D7,D9,D10,D12,D24,D30. Pass `divisions` to filter (e.g. [1,9,10] for career).',
      inputSchema: { ...chartRefShape, divisions: z.array(z.number().int()).optional().describe('Varga numbers to keep, e.g. [1,9,10]') },
    },
    async (a) =>
      guard(async () => {
        const chart = await resolveChart(a as { chartId?: string; birthData?: any })
        if (chart.isPasteWithoutComputed) {
          return ok({ note: 'Paste-source chart with no computed divisional charts. Compute it first or pass birthData.', divisionalCharts: null })
        }
        let charts = (chart.divisionalCharts as Array<Record<string, unknown>> | null) ?? []
        const divisions = a.divisions as number[] | undefined
        if (divisions && divisions.length > 0) {
          const want = new Set(divisions)
          charts = charts.filter((d) => want.has(Number(d.division)))
        }
        return ok({ source: chart.source, name: chart.name, divisionalCharts: charts })
      })
  )

  server.registerTool(
    'get_active_dasha',
    {
      title: 'Get the running dasha at a date',
      description: 'Resolve the running Mahadasha / Antardasha / Pratyantardasha chain at a given date (defaults to today).',
      inputSchema: { ...chartRefShape, asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD; default today') },
    },
    async (a) =>
      guard(async () => {
        const chart = await resolveChart(a as { chartId?: string; birthData?: any })
        const at = (a.asOf as string | undefined) ?? new Date().toISOString().slice(0, 10)
        return ok(activeDashaChain(chart.dashaTree, `${at}T12:00:00.000Z`))
      })
  )

  // ── Timeline (deterministic duration backbone) ────────────────────
  server.registerTool(
    'get_timeline_periods',
    {
      title: 'Get scored dasha timeline (trigger points)',
      description:
        'Deterministic duration backbone (NO LLM): MD/AD/PD periods overlapping [dateFrom,dateTo], each with a category-weighted 0–100 score, intensity, favorable flag, transit (Sade Sati/BAV) overlay, and the peak favorable/stress windows. Narrate these; never override the scores.',
      inputSchema: {
        chartId: z.string().uuid(),
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        category: CATEGORY,
      },
    },
    async (a) =>
      guard(async () => {
        const data = (await api.post('/api/timeline', {
          unifiedChartId: a.chartId,
          dateFrom: a.dateFrom,
          dateTo: a.dateTo,
          category: a.category,
          includeCategoryData: false,
        })) as Record<string, unknown>
        return ok(data)
      })
  )

  server.registerTool(
    'get_domain_dataset',
    {
      title: 'Get the domain-scoped dataset + timeline',
      description:
        'The backend-scoped bundle for a life domain: only the relevant vargas + house lords + karakas + strength, PLUS the scored MD/AD/PD timeline. Use this to drive a domain reading. Dates default to a 3-year window from today.',
      inputSchema: {
        chartId: z.string().uuid(),
        domain: CATEGORY,
        dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      },
    },
    async (a) =>
      guard(async () => {
        const today = new Date()
        const from = (a.dateFrom as string | undefined) ?? today.toISOString().slice(0, 10)
        const to =
          (a.dateTo as string | undefined) ??
          new Date(
            Date.UTC(today.getUTCFullYear() + 3, today.getUTCMonth(), today.getUTCDate())
          )
            .toISOString()
            .slice(0, 10)
        const data = await api.post('/api/timeline', {
          unifiedChartId: a.chartId,
          dateFrom: from,
          dateTo: to,
          category: a.domain,
          includeCategoryData: true,
        })
        return ok(data)
      })
  )

  // ── Knowledge base (rubrics) ──────────────────────────────────────
  server.registerTool(
    'list_knowledge',
    {
      title: 'List available rubrics',
      description: 'List the domain-knowledge fragments and analysis frameworks available via get_domain_knowledge / get_framework.',
      inputSchema: {},
    },
    async () => guard(async () => ok(await api.get('/api/knowledge')))
  )
  server.registerTool(
    'get_domain_knowledge',
    {
      title: 'Get a domain knowledge rubric',
      description: 'Canonical Vedic domain knowledge (houses, karakas, yogas, timing rules) for one life domain — the same reference the paid pipeline uses.',
      inputSchema: { domain: CATEGORY },
    },
    async (a) => guard(async () => ok(await api.getText(`/api/knowledge/domains/${a.domain}`)))
  )
  server.registerTool(
    'get_framework',
    {
      title: 'Get an analysis framework prompt',
      description: 'A full analysis framework (include-expanded), e.g. "wave2_2f_career" or "duration_da1_health". Use list_knowledge for names.',
      inputSchema: { name: z.string().regex(/^[a-z0-9_-]+$/i) },
    },
    async (a) => guard(async () => ok(await api.getText(`/api/knowledge/frameworks/${a.name}`)))
  )

  // ── Existing paid reports (read-only, no NEW cost) ────────────────
  server.registerTool(
    'list_reports',
    {
      title: 'List completed AI reports',
      description: 'List AI-analysis runs already generated in the web app (status=done). Reading is free; the MCP never STARTS a paid run.',
      inputSchema: {},
    },
    async () => guard(async () => ok(await api.get('/api/reports')))
  )
  server.registerTool(
    'get_report',
    {
      title: 'Get a completed AI run',
      description: 'Fetch a pipeline run: status, planner output, per-agent wave outputs, cost. Optionally include the rendered HTML/Markdown report.',
      inputSchema: { runId: z.string().uuid(), includeContent: z.boolean().optional() },
    },
    async (a) =>
      guard(async () => {
        const run = await api.get(`/api/runs/${a.runId}`)
        if (!a.includeContent) return ok(run)
        let content: string | null = null
        try {
          content = await api.getText(`/api/runs/${a.runId}/report-content`)
        } catch {
          content = null
        }
        return ok({ run, renderedReport: content })
      })
  )
  server.registerTool(
    'list_duration_analyses',
    {
      title: 'List past duration analyses',
      description: 'List completed Duration-Analysis runs, optionally filtered by chart. Read-only.',
      inputSchema: { chartId: z.string().uuid().optional() },
    },
    async (a) =>
      guard(async () =>
        ok(await api.get(`/api/duration-analysis${a.chartId ? `?unifiedChartId=${a.chartId}` : ''}`))
      )
  )
  server.registerTool(
    'get_duration_analysis',
    {
      title: 'Get a past duration analysis',
      description: 'Fetch a stored Duration-Analysis run (period slice, transit overlay, DA-1/2/3 outputs, messages). Read-only.',
      inputSchema: { analysisId: z.string().uuid() },
    },
    async (a) => guard(async () => ok(await api.get(`/api/duration-analysis/${a.analysisId}`)))
  )
}
