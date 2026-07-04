/**
 * ChartGrid — Renders all divisional charts in a South Indian style grid layout.
 * Each chart is a 4×4 grid representing 12 houses (signs) with planets placed inside.
 */

'use client'

const SIGNS_SHORT = ['Ari', 'Tau', 'Gem', 'Can', 'Leo', 'Vir', 'Lib', 'Sco', 'Sag', 'Cap', 'Aqu', 'Pis']

const PLANET_ABBR: Record<string, string> = {
  Sun: 'Su',
  Moon: 'Mo',
  Mars: 'Ma',
  Mercury: 'Me',
  Jupiter: 'Ju',
  Venus: 'Ve',
  Saturn: 'Sa',
  Rahu: 'Ra',
  Ketu: 'Ke',
}

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

interface DivisionalChart {
  division: number
  name: string
  shortName: string
  lagna: string
  lagnaSignNumber: number
  planets: Array<{
    planet: string
    sign: string
    signNumber: number
    house: number
  }>
}

/**
 * South Indian chart layout — fixed sign positions.
 * The 4×4 grid (16 cells) has 12 sign cells and 4 corner cells form part of signs.
 * Layout maps sign numbers to grid positions.
 *
 * South Indian style:
 *   Pisces(12) | Aries(1) | Taurus(2) | Gemini(3)
 *   Aqua(11)   |                       | Cancer(4)
 *   Capri(10)  |                       | Leo(5)
 *   Sag(9)     | Scorpio(8)| Libra(7) | Virgo(6)
 */
const SOUTH_INDIAN_LAYOUT: { row: number; col: number; signNumber: number }[] = [
  { row: 0, col: 0, signNumber: 12 }, // Pisces
  { row: 0, col: 1, signNumber: 1 },  // Aries
  { row: 0, col: 2, signNumber: 2 },  // Taurus
  { row: 0, col: 3, signNumber: 3 },  // Gemini
  { row: 1, col: 3, signNumber: 4 },  // Cancer
  { row: 2, col: 3, signNumber: 5 },  // Leo
  { row: 3, col: 3, signNumber: 6 },  // Virgo
  { row: 3, col: 2, signNumber: 7 },  // Libra
  { row: 3, col: 1, signNumber: 8 },  // Scorpio
  { row: 3, col: 0, signNumber: 9 },  // Sagittarius
  { row: 2, col: 0, signNumber: 10 }, // Capricorn
  { row: 1, col: 0, signNumber: 11 }, // Aquarius
]

function SingleChart({ chart }: { chart: DivisionalChart }) {
  // Group planets by sign number
  const planetsBySign: Record<number, string[]> = {}
  for (const p of chart.planets) {
    if (!planetsBySign[p.signNumber]) planetsBySign[p.signNumber] = []
    planetsBySign[p.signNumber].push(p.planet)
  }

  // Build the 4×4 grid
  const grid: (null | { signNumber: number })[][] = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => null)
  )

  for (const cell of SOUTH_INDIAN_LAYOUT) {
    grid[cell.row][cell.col] = { signNumber: cell.signNumber }
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">{chart.shortName} — {chart.name}</h3>
        <span className="text-xs text-gray-500">Lagna: {chart.lagna}</span>
      </div>

      <div className="grid grid-cols-4 gap-px bg-gray-700 border border-gray-700 rounded">
        {grid.flat().map((cell, idx) => {
          if (!cell) {
            // Center cells (empty in South Indian)
            return (
              <div key={idx} className="bg-gray-900/50 h-16" />
            )
          }

          const isLagna = cell.signNumber === chart.lagnaSignNumber
          const planets = planetsBySign[cell.signNumber] || []

          return (
            <div
              key={idx}
              className={`bg-gray-900 h-16 p-1 relative ${isLagna ? 'ring-1 ring-inset ring-indigo-500/50' : ''}`}
            >
              {/* Sign label */}
              <span className={`text-[9px] absolute top-0.5 left-1 ${isLagna ? 'text-indigo-400' : 'text-gray-600'}`}>
                {SIGNS_SHORT[cell.signNumber - 1]}
                {isLagna && ' ▲'}
              </span>

              {/* Planets */}
              <div className="mt-3 flex flex-wrap gap-0.5">
                {planets.map((p) => (
                  <span
                    key={p}
                    className={`text-[10px] font-medium ${PLANET_COLORS[p] ?? 'text-gray-300'}`}
                  >
                    {PLANET_ABBR[p] ?? p.substring(0, 2)}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ChartGrid({ charts }: { charts: DivisionalChart[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {charts.map((chart) => (
        <SingleChart key={chart.shortName} chart={chart} />
      ))}
    </div>
  )
}
