/**
 * CopyForAIPanel — Select chart sections and copy them as LLM-ready JSON.
 *
 * Opened by the "Copy for AI" button on the compute page. Shows grouped
 * checkboxes; on "Copy" builds a clean JSON payload and writes it to the
 * clipboard, ready to paste into ChatGPT, Gemini, etc.
 */

'use client'

import { useState, useMemo } from 'react'

// ─── Division metadata ───────────────────────────────────────────────

const DIV_META: Record<number, string> = {
  1: 'Rashi (Natal)',
  2: 'Hora (Wealth)',
  3: 'Drekkana (Siblings)',
  4: 'Chaturthamsha (Property)',
  7: 'Saptamsha (Children)',
  9: 'Navamsha (Marriage / Dharma)',
  10: 'Dashamsha (Career)',
  12: 'Dwadashamsha (Parents)',
  16: 'Shodashamsha (Vehicles / Pleasure)',
  20: 'Vimshamsha (Spiritual)',
  24: 'Siddhamsha (Learning)',
  27: 'Saptavimshamsha (Strength)',
  30: 'Trimshamsha (Misfortune)',
  40: 'Khavedamsha',
  45: 'Akshavedamsha',
  60: 'Shashtiamsha',
}

// ─── Section definitions ─────────────────────────────────────────────

type SectionId =
  | 'birth_info' | 'lagna_meta' | 'planets' | 'nakshatras'
  | 'shadbala' | 'bhava_bala' | 'pinda_strength' | 'ashtakavarga'
  | 'chara_karakas' | 'special_lagnas' | 'upagrahas' | 'arudha_padas'
  | 'dasha' | 'transits' | 'sade_sati'
  | 'relationships' | 'nakshatra_rel' | 'jaimini'

interface Section {
  id: SectionId
  label: string
  group: string
}

const FIXED_SECTIONS: Section[] = [
  // Core
  { id: 'birth_info',     label: 'Birth Info',                          group: 'Core Chart' },
  { id: 'lagna_meta',     label: 'Lagna & Ayanamsa',                    group: 'Core Chart' },
  { id: 'planets',        label: 'Planetary Positions (D1)',             group: 'Core Chart' },
  { id: 'nakshatras',     label: 'Nakshatras',                          group: 'Core Chart' },
  // Strengths
  { id: 'shadbala',       label: 'Shadbala',                            group: 'Strengths' },
  { id: 'bhava_bala',     label: 'Bhava Bala',                          group: 'Strengths' },
  { id: 'pinda_strength', label: 'Pinda Strength',                      group: 'Strengths' },
  { id: 'ashtakavarga',   label: 'Ashtakavarga',                        group: 'Strengths' },
  // Special factors
  { id: 'chara_karakas',  label: 'Chara Karakas',                       group: 'Special Factors' },
  { id: 'special_lagnas', label: 'Special Lagnas (BL, HL, GL, VL, PL)', group: 'Special Factors' },
  { id: 'upagrahas',      label: 'Upagrahas',                           group: 'Special Factors' },
  { id: 'arudha_padas',   label: 'Arudha Padas',                        group: 'Special Factors' },
  // Timing
  { id: 'dasha',          label: 'Vimshottari Dasha',                   group: 'Timing' },
  { id: 'transits',       label: 'Transits (Gochar)',                   group: 'Timing' },
  { id: 'sade_sati',      label: 'Sade Sati',                           group: 'Timing' },
  // Relationships
  { id: 'relationships',  label: 'Planetary Relationships',             group: 'Relationships' },
  { id: 'nakshatra_rel',  label: 'Nakshatra Relationships',             group: 'Relationships' },
  { id: 'jaimini',        label: 'Jaimini Geometry',                    group: 'Relationships' },
]

// ─── Props ───────────────────────────────────────────────────────────

interface Props {
  chart: Record<string, unknown>
  dashaTree: Record<string, unknown>
  form: {
    name: string
    date: string
    time: string
    timezone: string
    latitude: string
    longitude: string
    sunriseMode: string
  }
  onClose: () => void
}

// ─── JSON builders ───────────────────────────────────────────────────

function buildPayload(
  selected: Set<string>,
  chart: Record<string, unknown>,
  dashaTree: Record<string, unknown>,
  form: Props['form'],
  availableDivisions: number[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  if (selected.has('birth_info')) {
    out.birth_info = {
      name: form.name || null,
      birth_date: form.date,
      birth_time: form.time,
      timezone_offset_hours: parseFloat(form.timezone),
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
      sunrise_convention: form.sunriseMode,
    }
  }

  if (selected.has('lagna_meta')) {
    out.lagna_meta = {
      lagna: chart.lagna,
      lagna_sign_number: chart.lagnaSignNumber,
      lagna_longitude: chart.lagnaLongitude,
      lagna_degree_in_sign: chart.lagnaDegreeInSign,
      ayanamsa_lahiri: chart.ayanamsa,
    }
  }

  if (selected.has('planets')) {
    out.planetary_positions = (chart.planets as unknown[])?.map((p: unknown) => {
      const pl = p as Record<string, unknown>
      return {
        planet: pl.planet,
        sign: pl.sign,
        sign_number: pl.signNumber,
        house: pl.house,
        degree_in_sign: pl.degreeInSign,
        longitude: pl.longitude,
        retrograde: pl.retrograde,
        speed: pl.speed,
      }
    })
  }

  if (selected.has('nakshatras')) {
    out.nakshatras = chart.nakshatras
  }

  // Divisional charts — include each selected Dxx
  const selectedDivs = availableDivisions.filter((d) => selected.has(`d${d}`))
  if (selectedDivs.length > 0) {
    const divCharts = chart.divisionalCharts as Array<Record<string, unknown>>
    const divisional: Record<string, unknown> = {}
    for (const d of selectedDivs) {
      const dc = divCharts?.find((c) => c.division === d)
      if (dc) {
        const key = `D${d}_${(DIV_META[d] ?? '').split(' ')[0].toLowerCase()}`
        divisional[key] = {
          division: dc.division,
          name: dc.name,
          lagna: dc.lagna,
          lagna_sign_number: dc.lagnaSignNumber,
          planets: (dc.planets as unknown[])?.map((p: unknown) => {
            const pl = p as Record<string, unknown>
            return { planet: pl.planet, sign_number: pl.signNumber, house: pl.house, retrograde: pl.retrograde }
          }),
        }
      }
    }
    out.divisional_charts = divisional
  }

  if (selected.has('shadbala')) {
    out.shadbala = chart.shadbala
  }

  if (selected.has('bhava_bala')) {
    out.bhava_bala = chart.bhavaBala
  }

  if (selected.has('pinda_strength')) {
    out.pinda_strength = chart.pindaStrength
  }

  if (selected.has('ashtakavarga')) {
    out.ashtakavarga = chart.ashtakavarga
  }

  if (selected.has('chara_karakas')) {
    out.chara_karakas = chart.charaKarakas
  }

  if (selected.has('special_lagnas')) {
    out.special_lagnas = chart.specialLagnas
  }

  if (selected.has('upagrahas')) {
    out.upagrahas = chart.upagrahas
  }

  if (selected.has('arudha_padas')) {
    out.arudha_padas = chart.arudhaPadas
  }

  if (selected.has('dasha')) {
    out.vimshottari_dasha = dashaTree
  }

  if (selected.has('transits')) {
    const tr = chart.transits as Record<string, unknown> | undefined
    out.transits_gochar = tr
      ? { planets: tr.planets, date: tr.date }
      : null
  }

  if (selected.has('sade_sati')) {
    const tr = chart.transits as Record<string, unknown> | undefined
    out.sade_sati = tr ? tr.sadeSati : null
  }

  if (selected.has('relationships')) {
    out.planetary_relationships = chart.relationships
  }

  if (selected.has('nakshatra_rel')) {
    out.nakshatra_relationships = chart.computedNakshatra
  }

  if (selected.has('jaimini')) {
    out.jaimini_geometry = chart.computedJaimini
  }

  return out
}

// ─── Component ───────────────────────────────────────────────────────

export default function CopyForAIPanel({ chart, dashaTree, form, onClose }: Props) {
  // Discover which divisional charts are present in the data
  const availableDivisions = useMemo(() => {
    const divs = chart.divisionalCharts as Array<Record<string, unknown>> | undefined
    return (divs ?? []).map((d) => d.division as number).sort((a, b) => a - b)
  }, [chart])

  // All item IDs (fixed + per-division)
  const allIds = useMemo(() => [
    ...FIXED_SECTIONS.map((s) => s.id),
    ...availableDivisions.map((d) => `d${d}`),
  ], [availableDivisions])

  const [selected, setSelected] = useState<Set<string>>(() => new Set(allIds))
  const [copied, setCopied] = useState(false)

  // Group fixed sections
  const groups = useMemo(() => {
    const map: Record<string, Section[]> = {}
    for (const s of FIXED_SECTIONS) {
      if (!map[s.group]) map[s.group] = []
      map[s.group].push(s)
    }
    return map
  }, [])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleGroup(ids: string[]) {
    setSelected((prev) => {
      const allOn = ids.every((id) => prev.has(id))
      const next = new Set(prev)
      ids.forEach((id) => allOn ? next.delete(id) : next.add(id))
      return next
    })
  }

  function selectAll() { setSelected(new Set(allIds)) }
  function deselectAll() { setSelected(new Set()) }

  async function handleCopy() {
    const payload = buildPayload(selected, chart, dashaTree, form, availableDivisions)
    const json = JSON.stringify(payload, null, 2)
    await navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const selCount = selected.size
  const totalCount = allIds.length

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Drawer */}
      <div className="relative h-full w-full max-w-md bg-gray-950 border-l border-gray-700 flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Copy Chart for AI</h2>
            <p className="text-xs text-gray-500 mt-0.5">Select sections → Copy JSON → Paste into ChatGPT / Gemini</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Global controls */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800 shrink-0">
          <span className="text-xs text-gray-500">{selCount} / {totalCount} selected</span>
          <button onClick={selectAll}   className="text-xs text-indigo-400 hover:text-indigo-300 underline">Select all</button>
          <button onClick={deselectAll} className="text-xs text-gray-500 hover:text-gray-300 underline">Deselect all</button>
        </div>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

          {/* Fixed groups */}
          {Object.entries(groups).map(([groupName, sections]) => {
            const ids = sections.map((s) => s.id)
            const allOn = ids.every((id) => selected.has(id))
            return (
              <div key={groupName}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{groupName}</h3>
                  <button
                    onClick={() => toggleGroup(ids)}
                    className="text-xs text-gray-600 hover:text-gray-400 underline"
                  >
                    {allOn ? 'Deselect' : 'Select'} all
                  </button>
                </div>
                <div className="space-y-1">
                  {sections.map((s) => (
                    <label key={s.id} className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                        className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500 focus:ring-1"
                      />
                      <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Divisional charts group */}
          {availableDivisions.length > 0 && (() => {
            const divIds = availableDivisions.map((d) => `d${d}`)
            const allOn = divIds.every((id) => selected.has(id))
            return (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Divisional Charts</h3>
                  <button
                    onClick={() => toggleGroup(divIds)}
                    className="text-xs text-gray-600 hover:text-gray-400 underline"
                  >
                    {allOn ? 'Deselect' : 'Select'} all
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {availableDivisions.map((d) => (
                    <label key={d} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selected.has(`d${d}`)}
                        onChange={() => toggle(`d${d}`)}
                        className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500 focus:ring-1"
                      />
                      <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
                        <span className="font-mono text-indigo-400">D{d}</span>
                        {' '}
                        <span className="text-gray-500 text-xs">{DIV_META[d]?.split(' ')[0]}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Footer: Copy button */}
        <div className="shrink-0 px-5 py-4 border-t border-gray-700 bg-gray-900/50">
          <button
            onClick={handleCopy}
            disabled={selCount === 0}
            className="w-full rounded-lg py-3 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed
              bg-indigo-600 text-white hover:bg-indigo-500 active:scale-[0.98]"
          >
            {copied
              ? '✓ Copied to clipboard!'
              : `Copy ${selCount > 0 ? selCount + ' section' + (selCount > 1 ? 's' : '') : ''} as JSON`}
          </button>
          <p className="text-xs text-gray-600 mt-2 text-center">
            Paste directly into ChatGPT, Gemini, Claude, or any AI chat
          </p>
        </div>
      </div>
    </div>
  )
}
