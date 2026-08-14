/**
 * tools.ts — Deterministic-data MCP tools (synchronous, no paid LLM).
 *
 * Every tool is a thin wrapper over a VedicMojoAI HTTP route. NONE of them call
 * the paid pipeline routes (POST /api/unified-charts/[id]/analyze,
 * POST /api/duration-analysis) — that is the whole point of this server.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ApiError, type ApiClient } from './http.js'
import {
  birthDataSchema,
  chartRefShape,
  resolveChart,
  resolveCharaDasha,
  runningCharaPeriod,
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

export function registerTools(server: McpServer, api: ApiClient): void {
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
        'Deterministic Swiss-Ephemeris computation: planets, 13 divisional charts (D1–D60), nakshatras, karakas, ashtakavarga, shadbala, relationships, Jaimini, bhava bala, plus the Vimshottari dasha tree and the Jaimini Chara Dasha. Nothing is saved. NOTE: `nakshatras` carries the 9 grahas PLUS a final entry with `planet: "Ascendant"` — the Lagna nakshatra/pada/lord/sub-lord. Filter it out when you need grahas only.',
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
          const chart = await resolveChart(api, a as { chartId?: string; birthData?: any })
          const { domain, value } = project(chart)
          return extractOrGuide(chart, value, domain)
        })
    )

  extractor('get_shadbala', 'Get Shadbala (six-fold strength)', 'Per-planet Shadbala with virupas/rupas, strength grade, and the overall strength ranking.', (c) => ({ domain: 'shadbala', value: c.shadbala }))
  extractor('get_ashtakavarga', 'Get Ashtakavarga', 'Bhinnashtakavarga (per graha) and Sarvashtakavarga bindus. `bav`/`sav` are SIGN-indexed (0=Aries); `byHouse` (house 1 = lagna) is the pre-rotated house-indexed view — use it directly, no house/sign math needed. `byHouse`/`lagnaSignNumber` are absent on charts computed before this field existed.', (c) => ({ domain: 'ashtakavarga', value: c.ashtakavarga }))
  extractor('get_relationships', 'Get planetary relationships/geometry', 'Conjunctions, graha & rashi aspects, planetary war, mutual reception, combustion, avastha, gandanta, stelliums.', (c) => ({ domain: 'relationships', value: c.relationships }))
  extractor('get_jaimini', 'Get Jaimini geometry + chara karakas', 'Chara karakas (AK…DK), argala/virodha argala, yogi/avayogi points, special-lagna aspects.', (c) => ({ domain: 'jaimini', value: { jaimini: c.jaimini, charaKarakas: c.karakas } }))
  extractor('get_yogas', 'Get the deterministic named-yoga catalogue', 'Chart-wide named yogas (Pancha Mahapurusha, Raja incl. Dharma-Karmadhipati, Dhana, Viparita Harsha/Sarala/Vimala, Neechabhanga, Sunapha/Anapha/Durudhara/Kemadruma, Gaja Kesari, Budha-Aditya, Parivartana, Kartari) computed deterministically (no LLM) from planetary geometry — each entry carries participating planets/houses, a benefic flag, a coarse strength grade, and evidence (dignity, linkage, afflictions). Null on paste-source charts with no computed geometry.', (c) => ({ domain: 'yogas', value: c.yogas }))
  extractor('get_bhava_bala', 'Get Bhava Bala (house strength)', 'Per-house strength: bhavadhipati bala, dig bala, drishti bala, totals.', (c) => ({ domain: 'bhavaBala', value: c.bhavaBala }))
  extractor('get_transits', 'Get transits + Sade Sati', "Current transits (from Moon and Lagna), Sade Sati phase/periods, Ashtama/Kantaka Shani. Reflects the chart's computation time.", (c) => ({ domain: 'transits', value: c.transits }))
  extractor('get_dasha_tree', 'Get the full Vimshottari dasha tree', 'Complete MD → AD → PD Vimshottari tree with start/end dates.', (c) => ({ domain: 'dashaTree', value: c.dashaTree }))

  server.registerTool(
    'get_gochar',
    {
      title: 'Get date-ranged Gochar',
      description:
        'Dated Lahiri sidereal Gochar occupancy intervals by whole-sign house from the natal Moon and Lagna. ' +
        'All returned instants are UTC. The Moon is excluded unless `includeMoon: true`; use `includedGrahas` ' +
        'in the response as the authoritative list of what was computed, so an absent Moon is never treated ' +
        'as a Moon that did not change house.',
      inputSchema: {
        ...chartRefShape,
        dateFrom: z.string().describe('YYYY-MM-DD or a full UTC ISO-8601 instant ending in Z'),
        dateTo: z.string().describe('YYYY-MM-DD or a full UTC ISO-8601 instant ending in Z'),
        includeMoon: z.boolean().optional().describe('Include the Moon; defaults to false and limits the range to one year'),
      },
    },
    async (a) =>
      guard(async () => {
        const chartId = a.chartId as string | undefined
        const birthData = a.birthData
        if ((chartId !== undefined) === (birthData !== undefined)) {
          return fail('Provide exactly one of `chartId` or `birthData`.')
        }

        const data = await api.post('/api/gochar', {
          dateFrom: a.dateFrom,
          dateTo: a.dateTo,
          ...(a.includeMoon === undefined ? {} : { includeMoon: a.includeMoon }),
          ...(chartId !== undefined ? { unifiedChartId: chartId } : { birthData }),
        })
        return ok(data)
      })
  )

  server.registerTool(
    'get_divisional_chart',
    {
      title: 'Get divisional chart(s)',
      description:
        'Divisional (varga) charts. Supported: D1,D2,D3,D4,D5,D6,D7,D9,D10,D12,D24,D30,D60. Pass `divisions` to filter ' +
        '(e.g. [1,9,10] for career). Each planet placement includes `dignity` (panchadha-maitri label: exalted/' +
        'debilitated/moolatrikona/own/great_friend/friend/neutral/enemy/great_enemy; absent for Rahu/Ketu) and ' +
        '`vargottama` (true when the sign matches D1 — a strong dignity in its own right, reported separately from `dignity`).',
      inputSchema: { ...chartRefShape, divisions: z.array(z.number().int()).optional().describe('Varga numbers to keep, e.g. [1,9,10]') },
    },
    async (a) =>
      guard(async () => {
        let chart = await resolveChart(api, a as { chartId?: string; birthData?: any })
        if (chart.isPasteWithoutComputed) {
          return ok({ note: 'Paste-source chart with no computed divisional charts. Compute it first or pass birthData.', divisionalCharts: null })
        }
        let charts = (chart.divisionalCharts as Array<Record<string, unknown>> | null) ?? []
        const divisions = a.divisions as number[] | undefined

        // If requested divisions are missing from stored data (e.g. D60 on
        // charts saved before it was added), or the stored set is incomplete
        // (fewer than 13 vargas), recompute from birthInput when possible.
        const EXPECTED_VARGA_COUNT = 13
        const storedDivs = new Set(charts.map((d) => Number(d.division)))
        const hasMissing = divisions
          ? divisions.some((d) => !storedDivs.has(d))
          : charts.length < EXPECTED_VARGA_COUNT
        if (hasMissing && chart.source === 'stored' && a.chartId) {
          // Use the birthInput already resolved from the stored chart
          const birth = chart.birthInput as
            | { date?: string; time?: string; timezone?: number; latitude?: number; longitude?: number; sunriseMode?: string }
            | null
          if (birth?.date && birth?.time) {
            chart = await resolveChart(api, {
              birthData: {
                date: birth.date,
                time: birth.time,
                timezone: birth.timezone!,
                latitude: birth.latitude!,
                longitude: birth.longitude!,
                name: chart.name,
                sunriseMode: (birth.sunriseMode ?? 'precise') as 'precise' | 'jhora',
              },
            })
            charts = (chart.divisionalCharts as Array<Record<string, unknown>> | null) ?? []
          }
        }

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
        const chart = await resolveChart(api, a as { chartId?: string; birthData?: any })
        const at = (a.asOf as string | undefined) ?? new Date().toISOString().slice(0, 10)
        return ok(activeDashaChain(chart.dashaTree, `${at}T12:00:00.000Z`))
      })
  )

  server.registerTool(
    'get_chara_dasha',
    {
      title: 'Get the Jaimini Chara Dasha (sign/rasi dasha)',
      description:
        'Chara Dasha (KN Rao / Parashara method): SIGN-based mahadashas with 12 equal antardashas each, ' +
        'plus direction, per-sign lord + duration, and the full dated timeline. Distinct from the planet-based ' +
        'Vimshottari dasha (use get_dasha_tree for that). Pass `asOf` to also resolve the running MD/AD at a date.',
      inputSchema: { ...chartRefShape, asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('YYYY-MM-DD; also return the running period at this date') },
    },
    async (a) =>
      guard(async () => {
        const { name, charaDasha } = await resolveCharaDasha(api, a as { chartId?: string; birthData?: any })
        if (!charaDasha) {
          return ok({ note: 'Paste-source chart with no birth data — Chara Dasha needs planet positions. Pass birthData to compute on the fly.', charaDasha: null })
        }
        const out: Record<string, unknown> = { name, charaDasha }
        if (a.asOf) {
          out.running = runningCharaPeriod(charaDasha, `${a.asOf as string}T12:00:00.000Z`)
        }
        return ok(out)
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

  // ── Matchmaking (read-only preview — NEVER persists a CompatibilityMatch,
  //    and only ever POSTs to /api/matchmaking/preview, never the persisting
  //    /api/matchmaking — see tests/mcp-cost-guard.test.ts) ────────────
  server.registerTool(
    'compute_match',
    {
      title: 'Compute an Ashtakoota (Guna Milan) + Mangal Dosha marriage match',
      description:
        'Score marriage compatibility between two SAVED charts: the 8-koota Ashtakoota (Guna Milan, ' +
        'max 36 points) score plus Mangal Dosha (Kuja Dosha) compatibility. Both charts must already be ' +
        'saved (use list_clients to find their ids) and owned by the caller — this tool does not accept ' +
        'raw birthData. Read-only: it never saves a CompatibilityMatch record; use the app UI to persist ' +
        'a match. The bride/groom role is encoded by which parameter each id is passed as, matching the ' +
        "app's own POST /api/matchmaking request shape. IMPORTANT: several kootas (Varna, Vashya, Gana) " +
        'are directional — swapping which chart is bride vs groom can change the score. This tool has no ' +
        "way to read a chart's gender, so do not infer the role from the client's name; confirm which " +
        'chart is the bride and which is the groom with the user before calling.',
      inputSchema: {
        brideChartId: z.string().uuid().describe('Saved chart id for the bride (from list_clients)'),
        groomChartId: z.string().uuid().describe('Saved chart id for the groom (from list_clients)'),
      },
    },
    async (a) =>
      // Ownership/not-found handling: /api/matchmaking/preview already returns
      // a single undifferentiated 404 ("Chart not found") whether a chart id
      // doesn't exist or belongs to a different user — the same pattern
      // get_client_chart's underlying route uses. `guard()` turns that into a
      // clean tool-error message here too, never a stack trace.
      guard(async () =>
        ok(
          await api.post('/api/matchmaking/preview', {
            brideChartId: a.brideChartId,
            groomChartId: a.groomChartId,
          })
        )
      )
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
