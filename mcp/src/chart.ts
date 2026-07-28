/**
 * chart.ts — Shared input schemas + a normalizer that reconciles the two chart
 * shapes the app returns.
 *
 * The extractor tools accept EITHER a stored `chartId` (→ GET /api/unified-charts/[id])
 * OR raw `birthData` (→ POST /api/compute). Those two responses name the same
 * domains differently, so we normalize to one accessor:
 *
 *   UnifiedChart (stored):  karakas,     jaimini,        nakshatras,  dashaTree (own field)
 *   ComputedChart (compute): charaKarakas, computedJaimini, nakshatras, dashaTree (top-level, sibling of `chart`)
 */

import { z } from 'zod'
import { api } from './http.js'

export const birthDataSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'time must be HH:MM or HH:MM:SS (24h)'),
  timezone: z.number().min(-12).max(14).describe('offset in hours, e.g. 5.5 for IST'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().optional(),
  sunriseMode: z.enum(['precise', 'jhora']).optional(),
})
export type BirthData = z.infer<typeof birthDataSchema>

/** The raw-shape fields shared by every extractor tool's inputSchema. */
export const chartRefShape = {
  chartId: z.string().uuid().optional().describe('Stored UnifiedChart id (from list_clients)'),
  birthData: birthDataSchema.optional().describe('Raw birth data to compute on the fly (unsaved)'),
}

export interface NormalizedChart {
  source: 'stored' | 'computed'
  name?: string
  planets: unknown
  nakshatras: unknown
  divisionalCharts: unknown
  karakas: unknown
  ashtakavarga: unknown
  upagrahas: unknown
  specialLagnas: unknown
  arudhaPadas: unknown
  relationships: unknown
  shadbala: unknown
  jaimini: unknown
  bhavaBala: unknown
  transits: unknown
  pindaStrength: unknown
  dashaTree: unknown
  /** Deterministic named-yoga catalogue (engine/compute/yogas.ts). Null on paste charts. */
  yogas: unknown
  /** Birth input (for stored compute-path charts); allows recomputation. */
  birthInput?: unknown
  /** Set for stored paste-source charts, which have no computed domains. */
  isPasteWithoutComputed?: boolean
}

function pick(obj: Record<string, unknown>, key: string): unknown {
  return obj[key] ?? null
}

/** Resolve a chart from either a stored id or raw birth data, normalized. */
export async function resolveChart(args: {
  chartId?: string
  birthData?: BirthData
}): Promise<NormalizedChart> {
  if (args.chartId) {
    const c = (await api.get(`/api/unified-charts/${args.chartId}`)) as Record<string, unknown>
    const isPaste = c.source === 'paste' && c.planets == null
    return {
      source: 'stored',
      name: c.name as string | undefined,
      planets: pick(c, 'planets'),
      nakshatras: pick(c, 'nakshatras'),
      divisionalCharts: pick(c, 'divisionalCharts'),
      karakas: pick(c, 'karakas'),
      ashtakavarga: pick(c, 'ashtakavarga'),
      upagrahas: pick(c, 'upagrahas'),
      specialLagnas: pick(c, 'specialLagnas'),
      arudhaPadas: pick(c, 'arudhaPadas'),
      relationships: pick(c, 'relationships'),
      shadbala: pick(c, 'shadbala'),
      jaimini: pick(c, 'jaimini'),
      bhavaBala: pick(c, 'bhavaBala'),
      transits: pick(c, 'transits'),
      pindaStrength: pick(c, 'pindaStrength'),
      dashaTree: pick(c, 'dashaTree'),
      yogas: pick(c, 'yogas'),
      birthInput: pick(c, 'birthInput'),
      isPasteWithoutComputed: isPaste,
    }
  }

  if (args.birthData) {
    const r = (await api.post('/api/compute', args.birthData)) as {
      chart: Record<string, unknown>
      dashaTree: unknown
    }
    const ch = r.chart
    return {
      source: 'computed',
      name: (args.birthData.name as string | undefined) ?? undefined,
      planets: pick(ch, 'planets'),
      nakshatras: pick(ch, 'nakshatras'),
      divisionalCharts: pick(ch, 'divisionalCharts'),
      karakas: pick(ch, 'charaKarakas'), // ComputedChart → charaKarakas
      ashtakavarga: pick(ch, 'ashtakavarga'),
      upagrahas: pick(ch, 'upagrahas'),
      specialLagnas: pick(ch, 'specialLagnas'),
      arudhaPadas: pick(ch, 'arudhaPadas'),
      relationships: pick(ch, 'relationships'),
      shadbala: pick(ch, 'shadbala'),
      jaimini: pick(ch, 'computedJaimini'), // ComputedChart → computedJaimini
      bhavaBala: pick(ch, 'bhavaBala'),
      transits: pick(ch, 'transits'),
      pindaStrength: pick(ch, 'pindaStrength'),
      dashaTree: r.dashaTree, // top-level sibling of `chart`
      yogas: pick(ch, 'yogas'),
    }
  }

  throw new Error('Provide either `chartId` (a saved chart) or `birthData`.')
}

// ─── Active-dasha walker ─────────────────────────────────────────────
// Finds the running MD → AD → PD chain at a given instant from a serialized
// dasha tree ({ mahadashas: [{ lord, start, end, antardashas: [...] }] }).

interface Period {
  lord: string
  start: string
  end: string
  antardashas?: Period[]
  pratyantardashas?: Period[]
}

function findRunning(periods: Period[] | undefined, atMs: number): Period | null {
  if (!Array.isArray(periods)) return null
  for (const p of periods) {
    const s = new Date(p.start).getTime()
    const e = new Date(p.end).getTime()
    if (atMs >= s && atMs < e) return p
  }
  return null
}

// ─── Chara Dasha (Jaimini rasi dasha) resolver ───────────────────────
// Chara Dasha is a pure function of the D1 sign positions + birth instant, so
// for stored charts we recompute it from the chart's `birthInput` when a
// `charaDasha` column isn't present — no DB migration needed. birthData charts
// get it straight from /api/compute.

interface CharaPeriodLite {
  sign: string
  signNumber: number
  start: string
  end: string
  antardashas?: { sign: string; signNumber: number; start: string; end: string }[]
}

export async function resolveCharaDasha(args: {
  chartId?: string
  birthData?: BirthData
}): Promise<{ name?: string; charaDasha: unknown }> {
  if (args.birthData) {
    const r = (await api.post('/api/compute', args.birthData)) as { charaDasha?: unknown }
    return { name: args.birthData.name, charaDasha: r.charaDasha ?? null }
  }

  if (args.chartId) {
    const c = (await api.get(`/api/unified-charts/${args.chartId}`)) as Record<string, unknown>
    // Future-proof: use a stored charaDasha column if one ever exists.
    if (c.charaDasha) return { name: c.name as string | undefined, charaDasha: c.charaDasha }
    const birth = c.birthInput as
      | { date?: string; time?: string; timezone?: number; latitude?: number; longitude?: number; sunriseMode?: string }
      | null
    if (c.source === 'compute' && birth?.date && birth?.time) {
      const r = (await api.post('/api/compute', {
        date: birth.date,
        time: birth.time,
        timezone: birth.timezone,
        latitude: birth.latitude,
        longitude: birth.longitude,
        name: c.name,
        sunriseMode: birth.sunriseMode ?? (c.sunriseMode as string | undefined) ?? 'precise',
      })) as { charaDasha?: unknown }
      return { name: c.name as string | undefined, charaDasha: r.charaDasha ?? null }
    }
    return { name: c.name as string | undefined, charaDasha: null }
  }

  throw new Error('Provide either `chartId` (a saved chart) or `birthData`.')
}

/** Resolve the running Chara mahadasha + antardasha at an instant. */
export function runningCharaPeriod(charaDasha: unknown, atIso: string): unknown {
  const cd = charaDasha as { periods?: CharaPeriodLite[] } | null
  if (!cd || !Array.isArray(cd.periods)) return { error: 'No usable Chara Dasha.' }
  const atMs = new Date(atIso).getTime()
  const maha = cd.periods.find((p) => {
    const s = new Date(p.start).getTime()
    const e = new Date(p.end).getTime()
    return atMs >= s && atMs < e
  })
  if (!maha) return { asOf: atIso, running: null, note: 'Date is outside the computed Chara Dasha span.' }
  const antar = (maha.antardashas ?? []).find((a) => {
    const s = new Date(a.start).getTime()
    const e = new Date(a.end).getTime()
    return atMs >= s && atMs < e
  })
  return {
    asOf: atIso,
    mahadasha: { sign: maha.sign, start: maha.start, end: maha.end },
    antardasha: antar ? { sign: antar.sign, start: antar.start, end: antar.end } : null,
    label: [maha.sign, antar?.sign].filter(Boolean).join(' / '),
  }
}

export function activeDashaChain(dashaTree: unknown, atIso: string): unknown {
  const tree = dashaTree as { mahadashas?: Period[] } | null
  if (!tree || !Array.isArray(tree.mahadashas)) {
    return { error: 'Chart has no usable dasha tree.' }
  }
  const atMs = new Date(atIso).getTime()
  const md = findRunning(tree.mahadashas, atMs)
  if (!md) return { asOf: atIso, running: null, note: 'Date is outside the computed dasha span.' }
  const ad = findRunning(md.antardashas, atMs)
  const pd = ad ? findRunning(ad.pratyantardashas, atMs) : null

  const strip = (p: Period | null) =>
    p ? { lord: p.lord, start: p.start, end: p.end } : null

  return {
    asOf: atIso,
    mahadasha: strip(md),
    antardasha: strip(ad),
    pratyantardasha: strip(pd),
    label: [md?.lord, ad?.lord, pd?.lord].filter(Boolean).join(' / '),
  }
}
