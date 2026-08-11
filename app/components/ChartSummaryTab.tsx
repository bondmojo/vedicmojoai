/**
 * ChartSummaryTab — A single-page overview designed for Vedic astrologers.
 *
 * Layout (responsive 3-column grid on desktop):
 *   Left column:  Planet positions (compact) + Upagrahas
 *   Center:       Single chart (switchable via dropdown) — large and prominent
 *   Right column: Nakshatras + Karakas
 *   Bottom row:   Planet strength bar (Shadbala ratio) + key dignities
 *
 * Optimized for quick-glance interpretation: shows the most important data
 * an astrologer checks first when a chart is computed.
 */
'use client'

import { useState } from 'react'
import NorthIndianChart from './NorthIndianChart'
import SouthIndianChart from './SouthIndianChart'
import { planetColorClass } from '@/lib/brandColors'
import type { ChartData } from './chartTypes'
import KeyDignitiesPanel from './KeyDignitiesPanel'
import { SectionUnavailable } from './SectionUnavailable'
import { guardSection, isNonEmptyArray } from './sectionGuards'
import type {
  RelationshipGeometry,
  PlanetPosition,
  DivisionalChart as EngineDivisionalChart,
} from '@/engine/compute/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Types (matching the compute API response) ────────────────────────

// Structurally identical to the engine's D1 planet row — aliased so `planets`
// stays assignable to `KeyDignitiesPanel`'s `PlanetPosition[]` prop without a cast.
type PlanetRow = PlanetPosition

interface NakshatraRow {
  planet: string
  nakshatra: string
  pada: number
  nakshatraLord: string
  degreeInNakshatra: number
  subLord: string
}

interface KarakaEntry {
  planet: string
  karaka: string
  degree: number
}

interface Upagraha {
  name?: string
  abbr: string
  sign?: string
  signNumber: number
  house: number
}

interface ShadbalPlanet {
  planet: string
  components: { total: number }
}

interface ShadbalResult {
  planets: ShadbalPlanet[]
  strengthRanking: { planet: string; ratio: number }[]
}

// Structurally identical to the engine's `DivisionalChart` — aliased so
// `divisionalCharts` stays assignable to `KeyDignitiesPanel`'s prop without a cast.
type DivisionalChart = EngineDivisionalChart

interface ArudhaPadaRaw { abbr: string; signNumber: number; house_in_chart: number }
interface SpecialLagnaRaw { abbr: string; signNumber: number; house: number }
interface UpagrahaRaw { abbr: string; signNumber: number; house: number }

export interface ChartSummaryTabProps {
  planets: PlanetRow[]
  nakshatras: NakshatraRow[]
  divisionalCharts: DivisionalChart[]
  charaKarakas: KarakaEntry[]
  upagrahas: Upagraha[]
  specialLagnas?: SpecialLagnaRaw[]
  arudhaPadas?: ArudhaPadaRaw[]
  shadbala: ShadbalResult | null
  lagna: string
  /** Natal relationship geometry — only `.combustion` is read, threaded to `KeyDignitiesPanel` (R1.6). */
  relationships?: RelationshipGeometry | null
}

// ─── Helpers ──────────────────────────────────────────────────────────

const SIGN_ABBR = ['Ari','Tau','Gem','Can','Leo','Vir','Lib','Sco','Sag','Cap','Aqu','Pis']

function formatDeg(deg: number): string {
  const d = Math.floor(deg)
  const m = Math.floor((deg - d) * 60)
  return `${d}°${m.toString().padStart(2, '0')}'`
}

const KARAKA_SHORT: Record<string, string> = {
  AK: 'Atmakaraka',
  AmK: 'Amatyakaraka',
  BK: 'Bhratrukaraka',
  MK: 'Matrukaraka',
  PK: 'Putrakaraka',
  GK: 'Gnatikaraka',
  DK: 'Darakaraka',
  PiK: 'Pitrukaraka',
}

type ChartStyle = 'north' | 'south'

// ─── Component ────────────────────────────────────────────────────────

export default function ChartSummaryTab({
  planets,
  nakshatras,
  divisionalCharts,
  charaKarakas,
  upagrahas,
  specialLagnas,
  arudhaPadas,
  shadbala,
  lagna,
  relationships,
}: ChartSummaryTabProps) {
  const [selectedDivision, setSelectedDivision] = useState('1')
  const [chartStyle, setChartStyle] = useState<ChartStyle>('north')

  // Root-prop guard (R8.1), after the hooks so the hook count never varies. The
  // two props every column of this pane is built from are `planets` and
  // `divisionalCharts`; the rest are optional and already degrade to an omitted
  // card. `KeyDignitiesPanel` carries the same guard for its own card.
  const planetRows = guardSection<PlanetRow[]>(planets, isNonEmptyArray)
  const vargas = guardSection<DivisionalChart[]>(divisionalCharts, isNonEmptyArray)
  if (!planetRows.ok || !vargas.ok) return <SectionUnavailable section="Summary" />

  const selectedChart = vargas.data.find((c) => String(c.division) === selectedDivision)

  const chartData: ChartData | null = selectedChart
    ? {
        lagna: selectedChart.lagna,
        lagnaSignNumber: selectedChart.lagnaSignNumber,
        division: selectedChart.division,
        name: selectedChart.name,
        shortName: selectedChart.shortName,
        planets: selectedChart.planets,
        arudhaPadas: selectedChart.arudhaPadas ?? (selectedChart.division === 1 ? arudhaPadas : undefined),
        specialLagnas: selectedChart.specialLagnas ?? (selectedChart.division === 1 ? specialLagnas : undefined),
        upagrahas: selectedChart.upagrahas ?? (selectedChart.division === 1 ? (upagrahas?.map((u) => ({ abbr: u.abbr, signNumber: u.signNumber, house: u.house }))) : undefined),
      }
    : null

  // Shadbala ratio map for quick access
  const ratioMap = new Map(shadbala?.strengthRanking?.map((r) => [r.planet, r.ratio]) ?? [])

  return (
    <div className="space-y-6">
      {/* ─── Main 3-column layout ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-5">

        {/* ─── LEFT COLUMN: Planets + Upagrahas ─── */}
        <div className="space-y-4">
          {/* Planet Positions */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Graha Positions</h3>
            <div className="space-y-1.5">
              {planetRows.data.map((p) => (
                <div key={p.planet} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`font-medium w-[52px] ${planetColorClass(p.planet)}`}>
                      {p.planet}{p.retrograde ? ' ®' : ''}
                    </span>
                  </div>
                  <span className="text-muted-foreground font-mono text-[11px]">
                    {p.sign} {formatDeg(p.degreeInSign)}
                  </span>
                  <span className="text-muted-foreground/70 text-[10px] w-[28px] text-right">
                    H{p.house}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Upagrahas */}
          {(upagrahas?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Upagrahas</h3>
              <div className="space-y-1">
                {upagrahas!.map((u) => (
                  <div key={u.abbr} className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="text-ink font-medium">{u.name ?? u.abbr}</span>
                    <span>{u.sign ?? SIGN_ABBR[u.signNumber - 1]} · H{u.house}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── CENTER: Chart with selector ─── */}
        <div className="flex flex-col items-center">
          {/* Chart controls */}
          <div className="flex items-center justify-center gap-3 mb-3 w-full">
            <Select value={selectedDivision} onValueChange={setSelectedDivision}>
              <SelectTrigger className="w-[180px] h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {vargas.data.map((c) => (
                  <SelectItem key={c.division} value={String(c.division)}>
                    {c.shortName} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="inline-flex rounded-md border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setChartStyle('north')}
                className={`px-3 py-1.5 text-[10px] font-medium transition-colors ${chartStyle === 'north' ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}
              >
                N
              </button>
              <button
                type="button"
                onClick={() => setChartStyle('south')}
                className={`px-3 py-1.5 text-[10px] font-medium transition-colors ${chartStyle === 'south' ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}
              >
                S
              </button>
            </div>
          </div>

          {/* Chart display */}
          {chartData && (
            chartStyle === 'north'
              ? <NorthIndianChart chart={chartData} size={380} />
              : <SouthIndianChart chart={chartData} size={380} />
          )}
        </div>

        {/* ─── RIGHT COLUMN: Nakshatras + Karakas ─── */}
        <div className="space-y-4">
          {/* Nakshatras */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Nakshatras</h3>
            <div className="space-y-1.5">
              {(nakshatras ?? []).map((n) => (
                <div key={n.planet} className="flex items-center justify-between text-xs">
                  <span className={`font-medium w-[52px] ${planetColorClass(n.planet)}`}>{n.planet}</span>
                  <span className="text-ink text-[11px] truncate flex-1 text-right">
                    {n.nakshatra} <span className="text-muted-foreground">P{n.pada}</span>
                  </span>
                  <span className="text-muted-foreground/70 text-[10px] ml-2 w-[24px] text-right">
                    {n.nakshatraLord.substring(0, 2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Chara Karakas */}
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Chara Karakas</h3>
            <div className="space-y-2">
              {(charaKarakas ?? []).map((k) => {
                const isAbbreviated = k.karaka in KARAKA_SHORT
                const label = isAbbreviated ? KARAKA_SHORT[k.karaka] : k.karaka
                const abbr = isAbbreviated ? k.karaka : Object.entries(KARAKA_SHORT).find(([, v]) => v === k.karaka)?.[0] ?? ''
                return (
                  <div key={k.karaka} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground/80 w-[100px] shrink-0 truncate">{label}</span>
                    <span className={`font-medium ${planetColorClass(k.planet)}`}>{k.planet}</span>
                    {abbr && (
                      <span className="text-gold-500 font-semibold w-[32px] text-right shrink-0">{abbr}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Bottom: Shadbala Strength Bar ─── */}
      {shadbala && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Planetary Strength (Shadbala Ratio)
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
            {shadbala.strengthRanking.map((entry) => {
              const ratio = entry.ratio
              const barPct = Math.min(ratio / 1.5, 1) * 100 // normalize: 1.5 = full bar
              const gradeColor = ratio >= 1
                ? 'bg-emerald-500'
                : ratio >= 0.75
                  ? 'bg-amber-500'
                  : 'bg-red-500'
              const textColor = ratio >= 1
                ? 'text-emerald-700 dark:text-emerald-400'
                : ratio >= 0.75
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-red-700 dark:text-red-400'
              return (
                <div key={entry.planet} className="flex flex-col items-center gap-1.5">
                  <span className={`text-xs font-semibold ${planetColorClass(entry.planet)}`}>
                    {entry.planet.substring(0, 3)}
                  </span>
                  {/* Vertical bar */}
                  <div className="w-4 h-14 bg-muted rounded-full overflow-hidden flex flex-col-reverse border border-border">
                    <div
                      className={`w-full rounded-full ${gradeColor}`}
                      style={{ height: `${barPct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono font-medium text-foreground">
                    {ratio.toFixed(2)}
                  </span>
                  <span className={`text-[10px] font-medium ${textColor}`}>
                    {ratio >= 1 ? 'Strong' : ratio >= 0.75 ? 'Avg' : 'Weak'}
                  </span>
                </div>
              )
            })}
          </div>
          {/* Legend */}
          <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> ≥ 1.0 Strong</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> 0.75–1.0 Average</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> &lt; 0.75 Weak</span>
          </div>
        </div>
      )}

      {/* ─── Key Dignities (quick scan) ─── */}
      <KeyDignitiesPanel
        planets={planets}
        divisionalCharts={divisionalCharts}
        selectedDivision={Number(selectedDivision)}
        combustion={relationships?.combustion}
      />
    </div>
  )
}
