/**
 * DurationComputationResults — renders the deterministic /api/timeline
 * response for the Duration Analyser tab: scored sub-periods, a per-period
 * astrological Drivers panel (condition / control / drishti / nakshatra /
 * association + domain-house focus, built deterministically by
 * engine/durationAnalysis/periodInsights.ts), transit callouts, divisional
 * charts, planets, nakshatras, upagrahas, balas, and Ashtakavarga.
 */

'use client'

import { useState } from 'react'
import ChartGrid from './ChartGrid'
import PlanetTable from './PlanetTable'
import NakshatraTable from './NakshatraTable'
import AshtakavargaView from './AshtakavargaView'
import type {
  PeriodInsights,
  LordDriver,
  DomainHouseFocus,
  DomainContext,
  HouseRole,
  TaggedHouse,
} from '@/lib/durationTypes'

const PLANET_COLORS: Record<string, string> = {
  Sun: 'text-orange-400', Moon: 'text-slate-300', Mars: 'text-red-400',
  Mercury: 'text-green-400', Jupiter: 'text-yellow-400', Venus: 'text-pink-400',
  Saturn: 'text-blue-400', Rahu: 'text-gray-400', Ketu: 'text-purple-400',
}

// Human labels for the deterministic scoring engine's 21 ScoringFactorKey values
// (see lib/durationTypes.ts ScoringFactorKey / engine/durationAnalysis/scoring.ts).
const FACTOR_LABELS: Record<string, string> = {
  mdLordDignity: 'MD Lord Dignity',
  adLordDignity: 'AD Lord Dignity',
  pdLordDignity: 'PD Lord Dignity',
  shadbala: 'Shadbala Strength',
  ishtaKashta: 'Ishta/Kashta Phala',
  houseOwnership: 'House Ownership',
  karakaRole: 'Karaka Role',
  naturalKaraka: 'Natural Karaka',
  activatedYogas: 'Activated Yogas',
  bhavaBala: 'Bhava Bala',
  domainHouseActivation: 'Domain House Activation',
  mdAdRelationship: 'MD-AD Relationship',
  natalHouseStrength: 'Natal House Strength',
  transitBav: 'Transit Ashtakavarga',
  saturnAfflictions: 'Saturn Afflictions',
  nakshatraDispositor: 'Nakshatra Dispositor',
  dashaLordBav: 'Dasha Lord Ashtakavarga',
  argalaOnDomainHouse: 'Argala on Domain House',
  divisionalChartStrength: 'Divisional Chart Strength',
  rashiDrishti: 'Rashi Aspect (Drishti)',
  rashiDispositorChain: 'Rashi Dispositor Chain',
}

const SADE_SATI_STYLE: Record<string, string> = {
  rising: 'border-amber-600 bg-amber-900 text-amber-200',
  peak: 'border-red-600 bg-red-900 text-red-200',
  setting: 'border-blue-600 bg-blue-900 text-blue-200',
}

interface DashaLeg { lord: string; start: string; end: string }

interface ScoreFactorContribution {
  factor: string
  value: unknown
  normalized: number
  weight: number
  contribution: number
}
interface ScoreBreakdown {
  factors: ScoreFactorContribution[]
}

// Structurally match lib/durationTypes.ts TransitOverlay (subset the UI reads).
interface TransitOverlayRow {
  adStart: string
  adLord: string
  saturn: { sign: string; houseFromLagna: number; retrograde: boolean }
  jupiter: { sign: string; houseFromLagna: number; retrograde: boolean }
  sadeSatiActive: boolean
  sadeSatiPhase: 'rising' | 'peak' | 'setting' | null
  ashtamaShani: boolean
  kantakaShani: boolean
}

interface ScoredSlice {
  md: DashaLeg
  ad: DashaLeg
  pd: DashaLeg
  score: number
  intensity: 'high' | 'medium' | 'low'
  favorable: boolean
  insights?: PeriodInsights | null
  scoreBreakdown?: ScoreBreakdown
}

interface Upagraha { name?: string; abbr: string; sign?: string; signNumber: number; house: number }
interface ShadbalPlanet { planet: string; components: { total: number } }
interface ShadbalResult { planets: ShadbalPlanet[]; strengthRanking: { planet: string; ratio: number }[] }
interface BhavaBalaHouse { house: number; total: number; rupas: number }
interface BhavaBalaResult { houses: BhavaBalaHouse[] }

// Structurally match the (unexported) prop shapes of the reused table/grid
// components so we can pass categoryData straight through without `any`.
interface PlanetRow {
  planet: string
  longitude: number
  sign: string
  signNumber: number
  degreeInSign: number
  house: number
  retrograde: boolean
  speed: number
}
interface NakshatraRow {
  planet: string
  nakshatra: string
  pada: number
  nakshatraLord: string
  degreeInNakshatra: number
}
interface RawDivisionalChart {
  division: number
  name: string
  shortName: string
  lagna: string
  lagnaSignNumber: number
  planets: Array<{ planet: string; signNumber: number; house: number; retrograde?: boolean }>
  arudhaPadas?: Array<{ abbr: string; signNumber: number; house_in_chart: number }>
  specialLagnas?: Array<{ abbr: string; signNumber: number; house: number }>
  upagrahas?: Array<{ abbr: string; signNumber: number; house: number }>
}

export interface TimelineResponse {
  category: string
  dateFrom: string
  dateTo: string
  periodCount: number
  periods: ScoredSlice[]
  domainContext?: DomainContext
  transitOverlay?: TransitOverlayRow[]
  categoryData?: {
    planets?: PlanetRow[]
    nakshatras?: NakshatraRow[]
    ashtakavarga?: { bav: Record<string, number[]>; sav: number[]; savTotal: number }
    upagrahas?: Upagraha[] | null
    shadbala?: ShadbalResult | null
    bhavaBala?: BhavaBalaResult | null
    divisionalCharts?: RawDivisionalChart[]
  }
}

// ─── Small display helpers ────────────────────────────────────────────────

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function roleChipClass(role: HouseRole): string {
  switch (role) {
    case 'primary': return 'bg-amber-900 text-amber-200 border-amber-700'
    case 'benefic': return 'bg-emerald-900 text-emerald-200 border-emerald-700'
    case 'malefic': return 'bg-red-900 text-red-200 border-red-700'
    default: return 'bg-gray-800 text-gray-300 border-gray-700'
  }
}

function intensityBadgeClass(intensity: string, favorable: boolean): string {
  if (favorable) return 'text-green-300 bg-green-900 border-green-700'
  if (intensity === 'high') return 'text-red-300 bg-red-900 border-red-700'
  return 'text-amber-300 bg-amber-900 border-amber-700'
}

function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function shadbalaGrade(ratio: number): { label: string; className: string } {
  if (ratio >= 1) return { label: 'Strong', className: 'text-green-300 bg-green-900 border-green-700' }
  if (ratio >= 0.75) return { label: 'Average', className: 'text-yellow-300 bg-yellow-900 border-yellow-700' }
  return { label: 'Weak', className: 'text-red-300 bg-red-900 border-red-700' }
}

function formatFactorValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.length ? value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ') : '—'
  try {
    return JSON.stringify(value)
  } catch {
    return '—'
  }
}

function findOverlay(period: ScoredSlice, transitOverlay: TransitOverlayRow[]): TransitOverlayRow | null {
  return (
    transitOverlay.find((o) => o.adStart === period.ad.start) ??
    transitOverlay.find((o) => o.adLord === period.ad.lord) ??
    null
  )
}

function HouseChip({ h }: { h: TaggedHouse }) {
  return (
    <span className={`text-[11px] px-1.5 py-0.5 rounded border ${roleChipClass(h.role)}`}>
      {ordinal(h.house)} {h.sign}
    </span>
  )
}

// ─── Existing data tables (reused sections) ───────────────────────────────

function UpagrahaTable({ upagrahas }: { upagrahas: Upagraha[] }) {
  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-ink">Upagrahas</h3>
        <p className="text-xs text-gray-500 mt-0.5">Shadow sub-points (Gulika, Mandi, …)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-700">
              <th className="px-4 py-2 text-left">Upagraha</th>
              <th className="px-4 py-2 text-left">Sign</th>
              <th className="px-4 py-2 text-center">House</th>
            </tr>
          </thead>
          <tbody>
            {upagrahas.map((u) => (
              <tr key={u.abbr} className="border-b border-gray-800 last:border-0">
                <td className="px-4 py-2 text-ink">{u.name ?? u.abbr} <span className="text-gray-500">({u.abbr})</span></td>
                <td className="px-4 py-2 text-gray-300">{u.sign ?? '—'}</td>
                <td className="px-4 py-2 text-center text-gray-300">{u.house}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ShadbalaTable({ shadbala }: { shadbala: ShadbalResult }) {
  const ratioByPlanet = new Map(shadbala.strengthRanking.map((r) => [r.planet, r.ratio]))
  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-ink">Shadbala</h3>
        <p className="text-xs text-gray-500 mt-0.5">Six-fold planetary strength (Rupas)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-700">
              <th className="px-4 py-2 text-left">Planet</th>
              <th className="px-4 py-2 text-right">Total (Rupas)</th>
              <th className="px-4 py-2 text-right">Ratio</th>
              <th className="px-4 py-2 text-left">Grade</th>
            </tr>
          </thead>
          <tbody>
            {shadbala.planets.map((p) => {
              const ratio = ratioByPlanet.get(p.planet) ?? 0
              const grade = shadbalaGrade(ratio)
              return (
                <tr key={p.planet} className="border-b border-gray-800 last:border-0">
                  <td className={`px-4 py-2 font-medium ${PLANET_COLORS[p.planet] ?? 'text-ink'}`}>{p.planet}</td>
                  <td className="px-4 py-2 text-right text-gray-300 font-mono">{p.components.total.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right text-gray-300 font-mono">{ratio.toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${grade.className}`}>{grade.label}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BhavaBalaTable({ bhavaBala }: { bhavaBala: BhavaBalaResult }) {
  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-ink">Bhava Bala</h3>
        <p className="text-xs text-gray-500 mt-0.5">Per-house strength</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-700">
              <th className="px-4 py-2 text-left">House</th>
              <th className="px-4 py-2 text-right">Total</th>
              <th className="px-4 py-2 text-right">Rupas</th>
            </tr>
          </thead>
          <tbody>
            {bhavaBala.houses.map((h) => (
              <tr key={h.house} className="border-b border-gray-800 last:border-0">
                <td className="px-4 py-2 text-ink">House {h.house}</td>
                <td className="px-4 py-2 text-right text-gray-300 font-mono">{h.total.toFixed(2)}</td>
                <td className="px-4 py-2 text-right text-gray-300 font-mono">{h.rupas.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Drivers panel ────────────────────────────────────────────────────────

function DomainContextHeader({ ctx }: { ctx: DomainContext }) {
  const karakas = [
    ...ctx.relevantKarakaRoles,
    ...ctx.relevantNaturalKarakas,
  ].join(', ')
  // Mirrored gray surface + mirrored text (theme-safe); highlights are solid chips.
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-300">
        <span className="capitalize font-semibold text-ink">{ctx.category} lens</span>
        <span className="flex items-center gap-1">
          Key house{ctx.primaryHouses.length > 1 ? 's' : ''}:
          {ctx.primaryHouses.map((h) => (
            <span key={h} className="px-1.5 py-0.5 rounded border bg-amber-900 text-amber-200 border-amber-700">{ordinal(h)}</span>
          ))}
        </span>
        <span>Primary varga: <span className="text-ink font-medium">D{ctx.primaryDivision}</span></span>
        {karakas && <span>Karakas: <span className="text-ink font-medium">{karakas}</span></span>}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-gray-400">
        <span>Benefic houses: {ctx.beneficHouses.join(', ')}</span>
        <span>Malefic houses: {ctx.maleficHouses.join(', ')}</span>
      </div>
    </div>
  )
}

/** Solid chip for a planet, coloured benefic (emerald) / malefic (red) — theme-safe. */
function planetChipClass(benefic: boolean): string {
  return benefic
    ? 'bg-emerald-900 text-emerald-200 border-emerald-700'
    : 'bg-red-900 text-red-200 border-red-700'
}

function LordCard({ driver }: { driver: LordDriver }) {
  const color = PLANET_COLORS[driver.lord] ?? 'text-ink'
  const domainAspects = driver.aspectsCast.filter((a) => a.ontoDomain)
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wide">{driver.level}</span>
          <span className={`text-sm font-semibold ${color}`}>{driver.lord}</span>
          {driver.dignity && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700 capitalize">{driver.dignity}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {driver.karakaRole && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-900 text-indigo-200 border border-indigo-700">{driver.karakaRole}</span>
          )}
          {driver.isNaturalKaraka && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-900 text-emerald-200 border border-emerald-700">karaka</span>
          )}
        </div>
      </div>

      {/* Condition flags */}
      {(driver.retrograde || driver.combust || driver.cazimi) && (
        <div className="flex gap-1 flex-wrap">
          {driver.retrograde && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">Retrograde</span>}
          {driver.combust && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900 text-red-200 border border-red-800">Combust</span>}
          {driver.cazimi && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900 text-amber-200 border border-amber-800">Cazimi</span>}
        </div>
      )}

      {/* Control */}
      <div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Controls</div>
        {driver.owns.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {driver.owns.map((h) => <HouseChip key={h.house} h={h} />)}
          </div>
        ) : (
          <span className="text-xs text-gray-600">— (node owns no sign)</span>
        )}
        {driver.occupies && (
          <div className="mt-1 text-[11px] text-gray-400">
            Sits in <span className={`px-1.5 py-0.5 rounded border ${roleChipClass(driver.occupies.role)}`}>{ordinal(driver.occupies.house)} {driver.occupies.sign}</span>
          </div>
        )}
      </div>

      {/* Drishti */}
      <div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Drishti (aspects)</div>
        {domainAspects.length > 0 && (
          <div className="text-[11px] text-gray-300">
            Casts onto domain:{' '}
            {domainAspects.map((a, i) => (
              <span key={i} className={`inline-block mr-1 mb-1 px-1.5 py-0.5 rounded border ${roleChipClass(a.toRole)}`}>
                {ordinal(a.toHouse)} {a.toSign}{a.toPlanets.length ? ` · ${a.toPlanets.join('/')}` : ''}
              </span>
            ))}
          </div>
        )}
        {driver.rashiDrishtiOnDomain.length > 0 && (
          <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-1 flex-wrap">
            Rashi-drishti →
            {driver.rashiDrishtiOnDomain.map((h) => (
              <span key={h} className="px-1.5 py-0.5 rounded border bg-amber-900 text-amber-200 border-amber-700">{ordinal(h)}</span>
            ))}
          </div>
        )}
        {driver.aspectsReceived.length > 0 && (
          <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-1 flex-wrap">
            Aspected by:
            {driver.aspectsReceived.map((a, i) => (
              <span key={i} className={`px-1.5 py-0.5 rounded border ${planetChipClass(a.benefic)}`}>{a.from}</span>
            ))}
          </div>
        )}
        {domainAspects.length === 0 && driver.rashiDrishtiOnDomain.length === 0 && driver.aspectsReceived.length === 0 && (
          <span className="text-xs text-gray-600">no domain-relevant aspects</span>
        )}
      </div>

      {/* Vargas — control + drishti within the domain's other divisional charts
          (e.g. D9/D10 for career, D6/D9 for health) — houses counted from that
          varga's own lagna. */}
      {driver.vargas.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Vargas</div>
          <div className="space-y-1">
            {driver.vargas.map((v) => (
              <div key={v.division} className="text-[11px] text-gray-300">
                <span className="text-gray-500">{v.name.split(' — ')[0]}</span>
                {v.occupies && (
                  <span className="ml-1">
                    sits <span className={`px-1.5 py-0.5 rounded border ${roleChipClass(v.occupies.role)}`}>{ordinal(v.occupies.house)} {v.occupies.sign}</span>
                  </span>
                )}
                {v.owns.length > 0 && (
                  <span className="ml-1 flex items-center gap-1 flex-wrap mt-0.5">
                    owns {v.owns.map((h) => <HouseChip key={h.house} h={h} />)}
                  </span>
                )}
                {v.aspectsOntoPrimary.length > 0 && (
                  <span className="ml-1 flex items-center gap-1 flex-wrap mt-0.5">
                    → aspects
                    {v.aspectsOntoPrimary.map((h) => (
                      <span key={h} className="px-1.5 py-0.5 rounded border bg-amber-900 text-amber-200 border-amber-700">{ordinal(h)}</span>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nakshatra */}
      <div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Nakshatra</div>
        <div className="text-[11px] text-gray-300">
          {driver.nakshatra || '—'}
          {driver.nakshatraLord && <span className="text-gray-500"> · lord {driver.nakshatraLord}</span>}
          {driver.subLord && <span className="text-gray-500"> · sub {driver.subLord}</span>}
        </div>
        {driver.nakshatraChain.length > 0 && (
          <div className="text-[11px] text-gray-400 mt-0.5">Star chain: {driver.nakshatraChain.join(' → ')}</div>
        )}
        {driver.starExchangeWith && (
          <div className="text-[11px] text-gray-400 mt-0.5">
            Star exchange with <span className="px-1.5 py-0.5 rounded border bg-emerald-900 text-emerald-200 border-emerald-700">{driver.starExchangeWith}</span>
          </div>
        )}
      </div>

      {/* Association */}
      {(driver.conjunctWith.length > 0 || driver.parivartanaWith) && (
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Association</div>
          {driver.conjunctWith.length > 0 && (
            <div className="text-[11px] text-gray-300">Conjunct: {driver.conjunctWith.join(', ')}</div>
          )}
          {driver.parivartanaWith && (
            <div className="text-[11px] text-gray-400 flex items-center gap-1">
              Parivartana with <span className="px-1.5 py-0.5 rounded border bg-emerald-900 text-emerald-200 border-emerald-700">{driver.parivartanaWith}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DomainHouseCard({ focus }: { focus: DomainHouseFocus }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/40 p-3 text-xs space-y-1">
      <div className="flex items-center justify-between">
        <span className={`px-1.5 py-0.5 rounded border ${roleChipClass(focus.role)}`}>{ordinal(focus.house)} · {focus.sign}</span>
        {focus.savBindu != null && <span className="text-gray-500">SAV {focus.savBindu}</span>}
      </div>
      <div className="text-gray-300">
        Lord: <span className={PLANET_COLORS[focus.lord ?? ''] ?? 'text-ink'}>{focus.lord ?? '—'}</span>
        {focus.lordHouse != null && <span className="text-gray-500"> in {ordinal(focus.lordHouse)}</span>}
        {focus.lordDignity && <span className="text-gray-500"> ({focus.lordDignity})</span>}
      </div>
      {focus.occupants.length > 0 && (
        <div className="text-gray-400">Occupants: {focus.occupants.join(', ')}</div>
      )}
      {focus.aspectedBy.length > 0 && (
        <div className="text-gray-400 flex items-center gap-1 flex-wrap">
          Aspected by:
          {focus.aspectedBy.map((a, i) => (
            <span key={i} className={`px-1.5 py-0.5 rounded border ${planetChipClass(a.benefic)}`}>{a.planet}</span>
          ))}
        </div>
      )}
      {focus.argalaFrom.length > 0 && (
        <div className="text-gray-400">
          Argala from: {focus.argalaFrom.map((a) => `${ordinal(a.house)}${a.planets.length ? ` (${a.planets.join('/')})` : ''}`).join(', ')}
        </div>
      )}
      {focus.bhavaBalaRupas != null && (
        <div className="text-gray-500">Bhava Bala: {focus.bhavaBalaRupas.toFixed(2)} rupas</div>
      )}
    </div>
  )
}

function TransitCallouts({ overlay }: { overlay: TransitOverlayRow }) {
  return (
    <div className="space-y-2">
      {overlay.sadeSatiActive && overlay.sadeSatiPhase && (
        <div className={`rounded-lg border px-3 py-2 text-xs font-medium ${SADE_SATI_STYLE[overlay.sadeSatiPhase]}`}>
          Sade Sati — {overlay.sadeSatiPhase} phase active
        </div>
      )}
      {overlay.ashtamaShani && (
        <div className="rounded-lg border border-red-700 bg-red-900 px-3 py-2 text-xs font-medium text-red-200">
          Ashtama Shani — Saturn in 8th from natal Moon
        </div>
      )}
      {overlay.kantakaShani && (
        <div className="rounded-lg border border-orange-700 bg-orange-900 px-3 py-2 text-xs font-medium text-orange-200">
          Kantaka Shani — Saturn in 4th from natal Moon
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-gray-700 bg-gray-900/40 px-3 py-2 text-xs">
          <span className="text-blue-400 font-medium">Saturn</span>
          <span className="text-gray-400"> transit — House {overlay.saturn.houseFromLagna} from Lagna</span>
          {overlay.saturn.retrograde && <span className="text-gray-500"> (retrograde)</span>}
        </div>
        <div className="rounded-lg border border-gray-700 bg-gray-900/40 px-3 py-2 text-xs">
          <span className="text-yellow-400 font-medium">Jupiter</span>
          <span className="text-gray-400"> transit — House {overlay.jupiter.houseFromLagna} from Lagna</span>
          {overlay.jupiter.retrograde && <span className="text-gray-500"> (retrograde)</span>}
        </div>
      </div>
    </div>
  )
}

function FactorBreakdown({ factors }: { factors: ScoreFactorContribution[] }) {
  const top = [...factors].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
  if (top.length === 0) return null
  return (
    <details className="rounded-lg border border-gray-700 overflow-hidden">
      <summary className="bg-gray-800/50 px-4 py-3 border-b border-gray-700 cursor-pointer text-sm font-semibold text-ink">
        Full scoring-factor breakdown
      </summary>
      <div className="divide-y divide-gray-800">
        {top.map((f, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2 text-xs gap-3">
            <div className="min-w-0">
              <div className="text-ink font-medium">{FACTOR_LABELS[f.factor] ?? f.factor}</div>
              <div className="text-gray-500 truncate">{formatFactorValue(f.value)}</div>
            </div>
            <span className={`shrink-0 font-mono px-2 py-0.5 rounded ${f.contribution >= 0 ? 'text-green-300 bg-green-900' : 'text-red-300 bg-red-900'}`}>
              {f.contribution >= 0 ? '+' : ''}{f.contribution.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    </details>
  )
}

function PeriodDrivers({
  period,
  overlay,
  domainContext,
}: {
  period: ScoredSlice
  overlay: TransitOverlayRow | null
  domainContext?: DomainContext
}) {
  const insights = period.insights
  const factors = period.scoreBreakdown?.factors

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold text-ink">
        Period Drivers — {period.md.lord} MD / {period.ad.lord} AD / {period.pd.lord} PD
      </h3>

      {domainContext && <DomainContextHeader ctx={domainContext} />}

      {insights?.karakaSummary && (insights.karakaSummary.amongRunningLords.length > 0 || insights.karakaSummary.karakaRoleMatch) && (
        <div className="rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-2 text-xs text-gray-300">
          {insights.karakaSummary.amongRunningLords.length > 0 && (
            <span>Domain karaka running: <span className="font-medium text-ink">{insights.karakaSummary.amongRunningLords.join(', ')}</span>. </span>
          )}
          {insights.karakaSummary.karakaRoleMatch && <span className="text-ink">{insights.karakaSummary.karakaRoleMatch}.</span>}
        </div>
      )}

      {insights?.lords && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {insights.lords.map((d) => <LordCard key={d.level} driver={d} />)}
        </div>
      )}

      {overlay && <TransitCallouts overlay={overlay} />}

      {insights?.domainHouseFocus && insights.domainHouseFocus.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-ink mb-2">Domain-House Focus</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {insights.domainHouseFocus.map((f) => <DomainHouseCard key={f.house} focus={f} />)}
          </div>
        </div>
      )}

      {factors && <FactorBreakdown factors={factors} />}
    </section>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────

export default function DurationComputationResults({
  result,
  lagna,
}: {
  result: TimelineResponse
  lagna: string
}) {
  const { periods, categoryData, transitOverlay = [], domainContext } = result
  const first = periods[0]
  const [selectedIdx, setSelectedIdx] = useState(0)
  const selected = periods[selectedIdx] ?? first

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-ink capitalize">{result.category} — Computation</h3>
            <p className="text-xs text-gray-400 mt-1">
              {formatDateShort(result.dateFrom)} → {formatDateShort(result.dateTo)} · {result.periodCount} period{result.periodCount === 1 ? '' : 's'}
            </p>
          </div>
          {first && (
            <span className={`text-xs px-3 py-1 rounded-full border font-medium ${intensityBadgeClass(first.intensity, first.favorable)}`}>
              {first.favorable ? 'Favorable' : 'Unfavorable'} · {first.intensity} · score {first.score}
            </span>
          )}
        </div>
      </div>

      {/* Sub-periods */}
      {periods.length > 1 && (
        <div className="rounded-lg border border-gray-700 overflow-hidden">
          <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
            <h3 className="text-sm font-semibold text-ink">Scored Sub-Periods</h3>
            <p className="text-xs text-gray-500 mt-0.5">Click a period to see its drivers below</p>
          </div>
          <div className="divide-y divide-gray-800 max-h-80 overflow-y-auto">
            {periods.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedIdx(i)}
                className={`w-full flex items-center justify-between px-4 py-2 text-xs text-left transition-colors ${
                  i === selectedIdx ? 'bg-indigo-900/60' : 'hover:bg-gray-800/40'
                }`}
              >
                <span className="text-ink">{p.md.lord}-{p.ad.lord}-{p.pd.lord}</span>
                <span className="text-gray-500">{formatDateShort(p.pd.start)} → {formatDateShort(p.pd.end)}</span>
                <span className={`px-2 py-0.5 rounded-full border ${intensityBadgeClass(p.intensity, p.favorable)}`}>
                  {p.score}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!first && (
        <p className="text-sm text-gray-500">No dasha periods overlap this range.</p>
      )}

      {/* Period Drivers */}
      {selected && <PeriodDrivers period={selected} overlay={findOverlay(selected, transitOverlay)} domainContext={domainContext} />}

      {/* Divisional Charts */}
      {categoryData?.divisionalCharts && categoryData.divisionalCharts.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-ink mb-3">Divisional Charts</h3>
          <ChartGrid charts={categoryData.divisionalCharts} upagrahas={categoryData.upagrahas ?? undefined} />
        </section>
      )}

      {/* Planets */}
      {categoryData?.planets && (
        <section>
          <PlanetTable planets={categoryData.planets} lagna={lagna} />
        </section>
      )}

      {/* Nakshatras */}
      {categoryData?.nakshatras && (
        <section>
          <NakshatraTable nakshatras={categoryData.nakshatras} />
        </section>
      )}

      {/* Upagrahas */}
      {categoryData?.upagrahas && categoryData.upagrahas.length > 0 && (
        <section>
          <UpagrahaTable upagrahas={categoryData.upagrahas} />
        </section>
      )}

      {/* Balas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {categoryData?.shadbala && (
          <section>
            <ShadbalaTable shadbala={categoryData.shadbala} />
          </section>
        )}
        {categoryData?.bhavaBala && (
          <section>
            <BhavaBalaTable bhavaBala={categoryData.bhavaBala} />
          </section>
        )}
      </div>

      {/* Ashtakavarga */}
      {categoryData?.ashtakavarga && (
        <section>
          <h3 className="text-sm font-semibold text-ink mb-3">Ashtakavarga</h3>
          <AshtakavargaView data={categoryData.ashtakavarga} />
        </section>
      )}
    </div>
  )
}
