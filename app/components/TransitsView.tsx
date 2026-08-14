/**
 * TransitsView — Sade Sati timeline, Moon transits, Ascendant transits, Gochar table.
 */
'use client'
import { useState } from 'react'
import type { DegreeSadeSatiInfo } from '@/engine/compute/types'
import SadeSatiPanel from './SadeSatiPanel'
import { SectionUnavailable } from './SectionUnavailable'
import { guardSection, isPlainObject } from './sectionGuards'
import { planetColorClass } from '@/lib/brandColors'
import GocharRangeTable from './GocharRangeTable'
import { useGocharRange, type GocharRequestSource } from './useGocharRange'
import GocharCharts from './GocharCharts'

function dms(dec: number) {
  const d = Math.floor(dec), m = Math.floor((dec-d)*60), s = Math.round(((dec-d)*60-m)*60)
  return `${d}°${m.toString().padStart(2,'0')}'${s.toString().padStart(2,'0')}"`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
}
function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'})
}

interface TransitPlanet { planet:string;longitude:number;sign:string;signNumber:number;degreeInSign:number;retrograde:boolean;houseFromMoon:number;houseFromLagna:number }
interface SadeSatiPeriod { phase:'rising'|'peak'|'setting';phaseSign:string;startApprox:string;endApprox:string;isCurrent:boolean }
interface SadeSatiInfo { active:boolean;phase:'rising'|'peak'|'setting'|null;saturnSignNumber:number;natalMoonSignNumber:number;description:string;allPeriods:SadeSatiPeriod[] }
interface MoonTransit { signNumber:number;sign:string;entryDate:string;exitDate:string;isCurrent:boolean;houseFromMoon:number }
interface AscTransit { signNumber:number;sign:string;entryDate:string;exitDate:string;isCurrent:boolean;houseFromLagna:number }
interface TransitData {
  asOf:string;transits:TransitPlanet[];sadeSati:SadeSatiInfo;sadeSatiByDegree?:DegreeSadeSatiInfo;
  ashtamaShani:boolean;kantakaShani:boolean;
  currentMoonSign:string;natalMoonSign:string;moonTransitSameAsNatal:boolean;
  moonTransits?:MoonTransit[];ascendantTransits?:AscTransit[]
}

interface TransitsViewProps {
  data: TransitData
  birthDate?: string
  /** Birth-data snapshot paired with the chart currently displayed. */
  gocharSource: GocharRequestSource
  /** Natal D1 paired with the chart currently displayed. */
  natalD1?: unknown
}

function utcCalendarDate(iso: string | undefined): string {
  if (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso)) return iso.slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

export default function TransitsView({ data: rawData, birthDate, gocharSource, natalD1 }: TransitsViewProps) {
  const [section, setSection] = useState<'gochar'|'sadesati'|'moon'|'asc'>('gochar')
  const [dateFrom, setDateFrom] = useState(() => utcCalendarDate(rawData?.asOf))
  const [dateTo, setDateTo] = useState(() => utcCalendarDate(rawData?.asOf))
  const [includeMoon, setIncludeMoon] = useState(false)
  const gochar = useGocharRange(gocharSource)

  // Root-prop guard (R8.1), after the hook so the hook count never varies.
  const guarded = guardSection<TransitData>(rawData, isPlainObject)
  if (!guarded.ok) return <SectionUnavailable section="Transits" />
  const data = guarded.data

  // Moon and Ascendant transits always list forward from "now" so they can
  // never pre-date the DOB. No filtering needed there.

  return (
    <div className="space-y-4">
      {/* Alerts */}
      {data.sadeSati?.active && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-4 py-3">
          <span className="text-amber-800 dark:text-amber-300 font-semibold text-sm">⚠ Sade Sati Active — {data.sadeSati.phase?.toUpperCase()} Phase</span>
          <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">{data.sadeSati.description}</p>
        </div>
      )}
      {data.ashtamaShani && <div className="rounded-lg border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-400 font-medium">Ashtama Shani — Saturn in 8th from natal Moon</div>}
      {data.kantakaShani && <div className="rounded-lg border border-orange-300 bg-orange-50 dark:border-orange-700 dark:bg-orange-900/20 px-3 py-2 text-xs text-orange-700 dark:text-orange-400 font-medium">Kantaka Shani — Saturn in 4th from natal Moon</div>}

      {/* Sub-section tabs */}
      <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden">
        {(['gochar','sadesati','moon','asc'] as const).map(k => (
          <button key={k} onClick={()=>setSection(k)}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${section===k?'bg-indigo-600 text-white':'bg-gray-800 text-gray-400 hover:text-ink'}`}>
            {k==='gochar'?'Gochar':k==='sadesati'?'Sade Sati':k==='moon'?'Moon Transits':'Asc Transits'}
          </button>
        ))}
      </div>

      {/* ── Gochar Table ── */}
      {section === 'gochar' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-700 overflow-hidden">
            <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700 flex justify-between">
              <div>
                <h3 className="text-sm font-semibold">Current Gochar Positions</h3>
                <p className="text-xs text-gray-500 mt-0.5">As of {fmtDate(data.asOf)} | Sidereal Lahiri</p>
              </div>
              <div className="text-xs text-gray-500 text-right">
                Natal Moon: <span className="text-slate-300">{data.natalMoonSign}</span><br/>
                Transit Moon: <span className={data.moonTransitSameAsNatal?'text-yellow-400':'text-ink'}>{data.currentMoonSign}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-700">
                    <th className="px-3 py-2 text-left">Planet</th>
                    <th className="px-3 py-2 text-left">Sign</th>
                    <th className="px-3 py-2 text-right">Degree</th>
                    <th className="px-3 py-2 text-center">R</th>
                    <th className="px-3 py-2 text-center">H/Moon</th>
                    <th className="px-3 py-2 text-center">H/Lagna</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(data.transits) ? data.transits : []).map(t => (
                    <tr key={t.planet} className="border-b border-gray-800 hover:bg-gray-800/30">
                      <td className={`px-3 py-2 font-medium ${planetColorClass(t.planet)}`}>{t.planet}</td>
                      <td className="px-3 py-2 text-gray-300">{t.sign}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-300">{dms(t.degreeInSign)}</td>
                      <td className="px-3 py-2 text-center text-xs text-amber-400 font-bold">{t.retrograde?'R':''}</td>
                      <td className="px-3 py-2 text-center"><span className="inline-flex items-center justify-center w-6 h-6 rounded bg-gray-700 text-xs">{t.houseFromMoon}</span></td>
                      <td className="px-3 py-2 text-center"><span className="inline-flex items-center justify-center w-6 h-6 rounded bg-gray-700 text-xs">{t.houseFromLagna}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <GocharCharts
            natalD1={natalD1}
            asOf={data.asOf}
            transits={Array.isArray(data.transits) ? data.transits : []}
            ascendantTransits={data.ascendantTransits}
          />

          <section className="rounded-lg border border-gray-700 bg-gray-900/30 p-4" aria-labelledby="gochar-range-heading">
            <div className="mb-3">
              <h3 id="gochar-range-heading" className="text-sm font-semibold">Gochar by date range</h3>
              <p className="mt-0.5 text-xs text-gray-500">Lahiri sidereal Gochar. Calendar dates are inclusive; returned intervals are UTC.</p>
            </div>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                void gochar.request({ dateFrom, dateTo, includeMoon })
              }}
            >
              <label className="flex flex-col gap-1 text-xs text-gray-300" htmlFor="gochar-date-from">
                From date
                <input
                  id="gochar-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-gray-100"
                  required
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-gray-300" htmlFor="gochar-date-to">
                To date (inclusive)
                <input
                  id="gochar-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-sm text-gray-100"
                  required
                />
              </label>
              <label className="flex max-w-sm items-start gap-2 text-xs text-gray-300" htmlFor="gochar-include-moon">
                <input
                  id="gochar-include-moon"
                  type="checkbox"
                  checked={includeMoon}
                  onChange={(event) => setIncludeMoon(event.target.checked)}
                  className="mt-0.5"
                />
                <span>Include Moon (many more rows; maximum range becomes 1 year instead of 3 years).</span>
              </label>
              <button
                type="submit"
                disabled={gochar.loading}
                className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {gochar.loading ? 'Loading Gochar…' : 'View Gochar'}
              </button>
            </form>
            {gochar.error && (
              <p role="status" className="mt-3 rounded border border-red-800 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                {gochar.error}
              </p>
            )}
          </section>

          {gochar.result && <GocharRangeTable result={gochar.result} label="Gochar range intervals" />}
        </div>
      )}

      {/* ── Sade Sati Timeline ── */}
      {section === 'sadesati' && (
        <SadeSatiPanel
          signBased={data.sadeSati}
          degreeBased={data.sadeSatiByDegree}
          asOf={data.asOf}
          birthDate={birthDate}
        />
      )}

      {/* ── Moon Transits ── */}
      {section === 'moon' && (
        <div className="rounded-lg border border-gray-700 overflow-hidden">
          <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
            <h3 className="text-sm font-semibold">Moon Transits (~60 days)</h3>
            <p className="text-xs text-gray-500 mt-0.5">Moon spends ~2.25 days per sign. Natal Moon: <span className="text-slate-300">{data.natalMoonSign}</span></p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-700">
                  <th className="px-3 py-2 text-left">Sign</th>
                  <th className="px-3 py-2 text-left">Entry</th>
                  <th className="px-3 py-2 text-left">Exit</th>
                  <th className="px-3 py-2 text-center">H/Moon</th>
                </tr>
              </thead>
              <tbody>
                {(data.moonTransits ?? []).map((t, i) => (
                  <tr key={i} className={`border-b border-gray-800 ${t.isCurrent ? 'bg-indigo-900/20' : 'hover:bg-gray-800/20'}`}>
                    <td className="px-3 py-2 text-gray-200 font-medium flex items-center gap-2">
                      {t.sign}
                      {t.isCurrent && <span className="text-[10px] bg-indigo-600 text-white px-1 rounded">NOW</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">{fmtDateShort(t.entryDate)}</td>
                    <td className="px-3 py-2 text-xs text-gray-400">{fmtDateShort(t.exitDate)}</td>
                    <td className="px-3 py-2 text-center"><span className="inline-flex items-center justify-center w-6 h-6 rounded bg-gray-700 text-xs">{t.houseFromMoon}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Ascendant Transits ── */}
      {section === 'asc' && (
        <div className="rounded-lg border border-gray-700 overflow-hidden">
          <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
            <h3 className="text-sm font-semibold">Ascendant Transits (~24 hrs)</h3>
            <p className="text-xs text-gray-500 mt-0.5">The ascendant transits each sign in ~2 hours as the Earth rotates.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-700">
                  <th className="px-3 py-2 text-left">Sign</th>
                  <th className="px-3 py-2 text-left">Entry</th>
                  <th className="px-3 py-2 text-left">Exit</th>
                  <th className="px-3 py-2 text-center">H/Lagna</th>
                </tr>
              </thead>
              <tbody>
                {(data.ascendantTransits ?? []).map((t, i) => (
                  <tr key={i} className={`border-b border-gray-800 ${t.isCurrent ? 'bg-indigo-900/20' : 'hover:bg-gray-800/20'}`}>
                    <td className="px-3 py-2 text-gray-200 font-medium flex items-center gap-2">
                      {t.sign}
                      {t.isCurrent && <span className="text-[10px] bg-indigo-600 text-white px-1 rounded">NOW</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">{fmtDate(t.entryDate)}</td>
                    <td className="px-3 py-2 text-xs text-gray-400">{fmtDate(t.exitDate)}</td>
                    <td className="px-3 py-2 text-center"><span className="inline-flex items-center justify-center w-6 h-6 rounded bg-gray-700 text-xs">{t.houseFromLagna}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
