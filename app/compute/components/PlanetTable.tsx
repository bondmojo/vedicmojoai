/**
 * PlanetTable — Displays planetary positions in a sortable table.
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

interface Planet {
  planet: string
  longitude: number
  sign: string
  signNumber: number
  degreeInSign: number
  house: number
  retrograde: boolean
  speed: number
}

function formatDMS(decimalDeg: number): string {
  const deg = Math.floor(decimalDeg)
  const minFloat = (decimalDeg - deg) * 60
  const min = Math.floor(minFloat)
  const sec = Math.round((minFloat - min) * 60)
  return `${deg}°${min.toString().padStart(2, '0')}'${sec.toString().padStart(2, '0')}"`
}

export default function PlanetTable({ planets, lagna }: { planets: Planet[]; lagna: string }) {
  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
        <h3 className="text-sm font-semibold">Planetary Positions (D1)</h3>
        <p className="text-xs text-gray-500 mt-0.5">Lagna: {lagna} | Sidereal (Lahiri Ayanamsa)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-700">
              <th className="px-4 py-2 text-left">Planet</th>
              <th className="px-4 py-2 text-left">Sign</th>
              <th className="px-4 py-2 text-right">Degree</th>
              <th className="px-4 py-2 text-center">House</th>
              <th className="px-4 py-2 text-center">R</th>
              <th className="px-4 py-2 text-right">Speed</th>
              <th className="px-4 py-2 text-right">Longitude</th>
            </tr>
          </thead>
          <tbody>
            {planets.map((p) => (
              <tr key={p.planet} className="border-b border-gray-800 hover:bg-gray-800/30">
                <td className={`px-4 py-2 font-medium ${PLANET_COLORS[p.planet] ?? 'text-white'}`}>
                  {p.planet}
                </td>
                <td className="px-4 py-2 text-gray-300">{p.sign}</td>
                <td className="px-4 py-2 text-right font-mono text-gray-300">
                  {formatDMS(p.degreeInSign)}
                </td>
                <td className="px-4 py-2 text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-gray-700 text-xs font-medium">
                    {p.house}
                  </span>
                </td>
                <td className="px-4 py-2 text-center">
                  {p.retrograde && (
                    <span className="text-amber-400 font-bold text-xs">R</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs text-gray-500">
                  {p.speed.toFixed(4)}°/d
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs text-gray-500">
                  {p.longitude.toFixed(4)}°
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
