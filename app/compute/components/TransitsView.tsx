/**
 * TransitsView — Sade Sati timeline, Moon transits, Ascendant transits, Gochar table.
 */
'use client'
import { useState } from 'react'

const PLANET_COLORS: Record<string, string> = {
  Sun:'text-orange-400',Moon:'text-slate-300',Mars:'text-red-400',
  Mercury:'text-green-400',Jupiter:'text-yellow-400',Venus:'text-pink-400',
  Saturn:'text-blue-400',Rahu:'text-gray-400',Ketu:'text-purple-400',
}

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
interface SadeSatiPeriod { phase:string;phaseSign:string;startApprox:string;endApprox:string;isCurrent:boolean }
interface SadeSatiInfo { active:boolean;phase:string|null;saturnSignNumber:number;natalMoonSignNumber:number;description:string;allPeriods:SadeSatiPeriod[] }
interface MoonTransit { signNumber:number;sign:string;entryDate:string;exitDate:string;isCurrent:boolean;houseFromMoon:number }
interface AscTransit { signNumber:number;sign:string;entryDate:string;exitDate:string;isCurrent:boolean;houseFromLagna:number }
interface TransitData {
  asOf:string;transits:TransitPlanet[];sadeSati:SadeSatiInfo;
  ashtamaShani:boolean;kantakaShani:boolean;
  currentMoonSign:string;natalMoonSign:string;moonTransitSameAsNatal:boolean;
  moonTransits?:MoonTransit[];ascendantTransits?:AscTransit[]
}

const PHASE_COLORS: Record<string, string> = {
  rising:'border-amber-600 bg-amber-900/20 text-amber-300',
  peak:'border-red-600 bg-red-900/20 text-red-300',
  setting:'border-blue-600 bg-blue-900/20 text-blue-300',
}

export default function TransitsView({ data, birthDate }: { data: TransitData; birthDate?: string }) {
  const [section, setSection] = useState<'gochar'|'sadesati'|'moon'|'asc'>('gochar')

  // Filter out Sade Sati periods that fully ended before the native was born.
  // Periods that started pre-birth but overlap the birth date are kept — they
  // are genuinely active during the native's early life.
  const sadeSatiPeriods = (data.sadeSati.allPeriods ?? []).filter((p) => {
    if (!birthDate) return true
    // endApprox is "Mon YYYY" — extract year conservatively
    const endYear = parseInt(p.endApprox.split(' ').pop() ?? '9999')
    return endYear >= new Date(birthDate).getFullYear()
  })

  // Moon and Ascendant transits always list forward from "now" so they can
  // never pre-date the DOB. No filtering needed there.

  return (
    <div className="space-y-4">
      {/* Alerts */}
      {data.sadeSati.active && (
        <div className="rounded-lg border border-amber-700 bg-amber-900/20 px-4 py-3">
          <span className="text-amber-300 font-semibold text-sm">⚠ Sade Sati Active — {data.sadeSati.phase?.toUpperCase()} Phase</span>
          <p className="text-xs text-amber-500 mt-0.5">{data.sadeSati.description}</p>
        </div>
      )}
      {data.ashtamaShani && <div className="rounded-lg border border-red-700 bg-red-900/20 px-3 py-2 text-xs text-red-400 font-medium">Ashtama Shani — Saturn in 8th from natal Moon</div>}
      {data.kantakaShani && <div className="rounded-lg border border-orange-700 bg-orange-900/20 px-3 py-2 text-xs text-orange-400 font-medium">Kantaka Shani — Saturn in 4th from natal Moon</div>}

      {/* Sub-section tabs */}
      <div className="inline-flex rounded-lg border border-gray-700 overflow-hidden">
        {(['gochar','sadesati','moon','asc'] as const).map(k => (
          <button key={k} onClick={()=>setSection(k)}
            className={`px-4 py-1.5 text-xs font-medium transition-colors ${section===k?'bg-indigo-600 text-white':'bg-gray-800 text-gray-400 hover:text-white'}`}>
            {k==='gochar'?'Gochar':k==='sadesati'?'Sade Sati':k==='moon'?'Moon Transits':'Asc Transits'}
          </button>
        ))}
      </div>

      {/* ── Gochar Table ── */}
      {section === 'gochar' && (
        <div className="rounded-lg border border-gray-700 overflow-hidden">
          <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700 flex justify-between">
            <div>
              <h3 className="text-sm font-semibold">Current Gochar Positions</h3>
              <p className="text-xs text-gray-500 mt-0.5">As of {fmtDate(data.asOf)} | Sidereal Lahiri</p>
            </div>
            <div className="text-xs text-gray-500 text-right">
              Natal Moon: <span className="text-slate-300">{data.natalMoonSign}</span><br/>
              Transit Moon: <span className={data.moonTransitSameAsNatal?'text-yellow-400':'text-white'}>{data.currentMoonSign}</span>
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
                {data.transits.map(t => (
                  <tr key={t.planet} className="border-b border-gray-800 hover:bg-gray-800/30">
                    <td className={`px-3 py-2 font-medium ${PLANET_COLORS[t.planet]??'text-white'}`}>{t.planet}</td>
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
      )}

      {/* ── Sade Sati Timeline ── */}
      {section === 'sadesati' && (
        <div className="rounded-lg border border-gray-700 overflow-hidden">
          <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
            <h3 className="text-sm font-semibold">Sade Sati Periods</h3>
            <p className="text-xs text-gray-500 mt-0.5">Saturn transit through 3 signs around natal Moon ({data.sadeSati.natalMoonSignNumber ? `H${data.sadeSati.natalMoonSignNumber}` : ''}). ~7.5 year cycle every ~30 years.</p>
          </div>
          <div className="divide-y divide-gray-800">
            {sadeSatiPeriods.map((p, i) => (
              <div key={i} className={`px-4 py-3 flex items-center justify-between ${p.isCurrent ? 'bg-indigo-900/20' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded border ${PHASE_COLORS[p.phase] ?? 'border-gray-600 text-gray-400'}`}>
                    {p.phase.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-300">Saturn in <span className="text-white font-medium">{p.phaseSign}</span></span>
                  {p.isCurrent && <span className="text-xs bg-indigo-600 text-white px-1.5 py-0.5 rounded">CURRENT</span>}
                </div>
                <div className="text-xs text-gray-500 text-right">
                  {p.startApprox} – {p.endApprox}
                </div>
              </div>
            ))}
            {sadeSatiPeriods.length === 0 && (
              <p className="px-4 py-4 text-sm text-gray-500">No Sade Sati periods in lifetime.</p>
            )}
          </div>
        </div>
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
