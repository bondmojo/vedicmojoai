/**
 * KarakaTable — Displays Chara Karaka assignments.
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

const KARAKA_DESCRIPTIONS: Record<string, string> = {
  AK: 'Self, Soul — the planet representing the native',
  AmK: 'Career, Minister — professional life and associates',
  BK: 'Siblings, Courage — brothers, valor, co-borns',
  MK: 'Mother, Property — maternal figure, land, vehicles',
  PK: 'Children, Education — progeny, intelligence, creativity',
  GK: 'Enemies, Obstacles — illness, debts, opposition',
  DK: 'Spouse, Partnership — marriage partner, business partner',
  PiK: 'Father, Guru — paternal figure, spiritual teacher',
}

interface KarakaEntry {
  planet: string
  karaka: string
  karakaAbbr: string
  degreeInSign: number
}

export default function KarakaTable({ karakas }: { karakas: KarakaEntry[] }) {
  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
        <h3 className="text-sm font-semibold">Chara Karakas (Jaimini)</h3>
        <p className="text-xs text-gray-500 mt-0.5">Ranked by degree within sign (highest = Atmakaraka)</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-700">
              <th className="px-4 py-2 text-center">#</th>
              <th className="px-4 py-2 text-left">Karaka</th>
              <th className="px-4 py-2 text-left">Planet</th>
              <th className="px-4 py-2 text-right">Degree</th>
              <th className="px-4 py-2 text-left">Signification</th>
            </tr>
          </thead>
          <tbody>
            {karakas.map((k, i) => (
              <tr key={k.karakaAbbr} className="border-b border-gray-800 hover:bg-gray-800/30">
                <td className="px-4 py-2 text-center text-gray-500">{i + 1}</td>
                <td className="px-4 py-2">
                  <span className="font-medium text-white">{k.karakaAbbr}</span>
                  <span className="text-gray-500 ml-2 text-xs">{k.karaka}</span>
                </td>
                <td className={`px-4 py-2 font-medium ${PLANET_COLORS[k.planet] ?? 'text-white'}`}>
                  {k.planet}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs text-gray-400">
                  {k.degreeInSign.toFixed(2)}°
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">
                  {KARAKA_DESCRIPTIONS[k.karakaAbbr] ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
