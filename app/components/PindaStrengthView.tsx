/**
 * PindaStrengthView — Displays Pinda Strength analysis per planet.
 */
'use client'

const PLANET_COLORS: Record<string, string> = {
  Sun: 'text-orange-400', Moon: 'text-slate-300', Mars: 'text-red-400',
  Mercury: 'text-green-400', Jupiter: 'text-yellow-400', Venus: 'text-pink-400',
  Saturn: 'text-blue-400', Rahu: 'text-gray-400', Ketu: 'text-purple-400',
}

interface PindaEntry {
  planet: string; uchcha_bala: number; sapta_varga_bala: number
  ojha_yugma_bala: number; kendradi_bala: number; drekana_bala: number
  total: number; pct: number; grade: string
}

function Bar({ value, max = 20, color }: { value: number; max?: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="h-1.5 w-full bg-gray-700 rounded">
      <div className="h-1.5 rounded transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  )
}

function gradeColor(grade: string): string {
  if (grade === 'Strong') return 'text-green-400 bg-green-900/30 border-green-700'
  if (grade === 'Average') return 'text-yellow-400 bg-yellow-900/30 border-yellow-700'
  return 'text-red-400 bg-red-900/30 border-red-700'
}

function totalBarColor(pct: number): string {
  if (pct >= 80) return '#22c55e'
  if (pct >= 50) return '#eab308'
  return '#ef4444'
}

export default function PindaStrengthView({ data }: { data: PindaEntry[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-700 bg-gray-800/30 px-4 py-3">
        <h3 className="text-sm font-semibold">Pinda (Cosmic Body) Strength</h3>
        <p className="text-xs text-gray-500 mt-1">
          5 components: Uccha (exaltation) + Saptha Varga (7-chart dignity) +
          Ojha/Yugma (odd/even) + Kendradi (house type) + Drekana (decanate).
          Each 0–20 pts; total 0–100.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.map((e) => (
          <div key={e.planet} className="rounded-lg border border-gray-700 bg-gray-800/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className={`font-semibold text-sm ${PLANET_COLORS[e.planet] ?? 'text-ink'}`}>
                {e.planet}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 font-mono">{e.total.toFixed(1)}/100</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${gradeColor(e.grade)}`}>
                  {e.grade}
                </span>
              </div>
            </div>

            {/* Total bar */}
            <div className="mb-3">
              <div className="h-2.5 w-full bg-gray-700 rounded">
                <div
                  className="h-2.5 rounded transition-all"
                  style={{ width: `${Math.min(e.pct, 100)}%`, backgroundColor: totalBarColor(e.pct) }}
                />
              </div>
            </div>

            {/* Sub-components */}
            <div className="space-y-1.5 text-xs">
              {[
                { label: 'Uccha Bala', value: e.uchcha_bala, color: '#f97316' },
                { label: 'Saptha Varga', value: e.sapta_varga_bala, color: '#6366f1' },
                { label: 'Ojha/Yugma', value: e.ojha_yugma_bala, color: '#22c55e' },
                { label: 'Kendradi', value: e.kendradi_bala, color: '#eab308' },
                { label: 'Drekana', value: e.drekana_bala, color: '#ec4899' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-24 text-gray-500 shrink-0">{label}</span>
                  <div className="flex-1">
                    <Bar value={value} max={20} color={color} />
                  </div>
                  <span className="w-8 text-right text-gray-400 font-mono">{value.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
