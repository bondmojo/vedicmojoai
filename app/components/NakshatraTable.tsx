/**
 * NakshatraTable — Displays nakshatra details for all planets.
 */

'use client'

const PLANET_COLORS: Record<string, string> = {
  Sun: 'text-orange-400',
  Moon: 'text-slate-300',
  Mars: 'text-red-400',
  Mercury: 'text-green-400',
  Jupiter: 'text-yellow-400',
  Venus: 'text-pink-400',
  Saturn: 'text-blue-400',
  Rahu: 'text-gray-400',
  Ketu: 'text-purple-400',
}

interface NakshatraEntry {
  planet: string
  nakshatra: string
  pada: number
  nakshatraLord: string
  degreeInNakshatra: number
}

export default function NakshatraTable({ nakshatras }: { nakshatras: NakshatraEntry[] }) {
  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
        <h3 className="text-sm font-semibold">Nakshatra Positions</h3>
        <p className="text-xs text-gray-500 mt-0.5">27 Nakshatras with Pada and Vimshottari Lord</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-700">
              <th className="px-4 py-2 text-left">Planet</th>
              <th className="px-4 py-2 text-left">Nakshatra</th>
              <th className="px-4 py-2 text-center">Pada</th>
              <th className="px-4 py-2 text-left">Lord</th>
              <th className="px-4 py-2 text-right">Deg in Nakshatra</th>
            </tr>
          </thead>
          <tbody>
            {nakshatras.map((n) => (
              <tr key={n.planet} className="border-b border-gray-800 hover:bg-gray-800/30">
                <td className={`px-4 py-2 font-medium ${PLANET_COLORS[n.planet] ?? 'text-ink'}`}>
                  {n.planet}
                </td>
                <td className="px-4 py-2 text-gray-300">{n.nakshatra}</td>
                <td className="px-4 py-2 text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-gray-700 text-xs font-medium">
                    {n.pada}
                  </span>
                </td>
                <td className={`px-4 py-2 ${PLANET_COLORS[n.nakshatraLord] ?? 'text-gray-300'}`}>
                  {n.nakshatraLord}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs text-gray-500">
                  {n.degreeInNakshatra.toFixed(2)}°
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
