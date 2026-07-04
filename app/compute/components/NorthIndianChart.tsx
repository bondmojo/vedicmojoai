/**
 * NorthIndianChart — North Indian (Kundali) diamond chart using SVG.
 *
 * Correct geometry:
 * - Outer square
 * - Two main diagonals (TL→BR and TR→BL)
 * - Inner diamond connecting the 4 side-midpoints (TM, MR, BM, ML)
 * NO horizontal/vertical center lines.
 *
 * Houses are FIXED positions and proceed COUNTER-CLOCKWISE from the top:
 *   H1 = top rhombus, H2 = top-left(upper), H3 = left(upper),
 *   H4 = left rhombus, H5 = left(lower), H6 = bottom-left(lower),
 *   H7 = bottom rhombus, H8 = bottom-right(lower), H9 = right(lower),
 *   H10 = right rhombus, H11 = right(upper), H12 = top-right(upper)
 *
 * The SIGN occupying each house = (lagnaSign + house - 1). Planets are
 * placed by their house number.
 */
'use client'

import { PLANET_ABBR, PLANET_COLORS, SIGNS_SHORT, ChartData } from './chartTypes'

const S = 480
const M = S / 2 // 240

// Structure lines: outer square, 2 diagonals, inner diamond. No midlines.
const LINES = [
  `M 0,0 L ${S},0 L ${S},${S} L 0,${S} Z`,   // outer square
  `M 0,0 L ${S},${S}`,                         // diagonal TL→BR
  `M ${S},0 L 0,${S}`,                         // diagonal TR→BL
  `M ${M},0 L ${S},${M} L ${M},${S} L 0,${M} Z`, // inner diamond
]

// Cell centroids (counter-clockwise from top). Corner triangles nudged
// slightly toward center so text fits.
const CELL: Record<number, [number, number]> = {
  1:  [M, 118],        // top rhombus
  2:  [M - 118, 58],   // top-left upper triangle
  3:  [60, M - 118],   // left upper triangle
  4:  [118, M],        // left rhombus
  5:  [60, M + 118],   // left lower triangle
  6:  [M - 118, S - 58],// bottom-left lower triangle
  7:  [M, S - 118],    // bottom rhombus
  8:  [M + 118, S - 58],// bottom-right lower triangle
  9:  [S - 60, M + 118],// right lower triangle
  10: [S - 118, M],    // right rhombus
  11: [S - 60, M - 118],// right upper triangle
  12: [M + 118, 58],   // top-right upper triangle
}

// ─── Cell content ──────────────────────────────────────────────────

interface Item { label: string; color: string }

function getCellItems(house: number, chart: ChartData): Item[] {
  const items: Item[] = []

  for (const p of chart.planets) {
    if (p.house === house) {
      const abbr = PLANET_ABBR[p.planet] ?? p.planet.substring(0, 2)
      items.push({
        label: p.retrograde ? `(${abbr})` : abbr,
        color: PLANET_COLORS[p.planet] ?? '#e5e7eb',
      })
    }
  }
  if (chart.arudhaPadas) {
    for (const ap of chart.arudhaPadas) {
      if (ap.house_in_chart === house) items.push({ label: ap.abbr, color: '#f59e0b' })
    }
  }
  if (chart.specialLagnas) {
    for (const sl of chart.specialLagnas) {
      if (sl.house === house) items.push({ label: sl.abbr, color: '#e879f9' })
    }
  }
  if (chart.upagrahas) {
    for (const ug of chart.upagrahas) {
      if (ug.house === house) items.push({ label: `(${ug.abbr})`, color: '#9ca3af' })
    }
  }
  return items
}

function CellText({ house, chart, cx, cy }: { house: number; chart: ChartData; cx: number; cy: number }) {
  const items = getCellItems(house, chart)
  if (items.length === 0) return null

  const LH = 15, COL_W = 26
  const COLS = Math.min(items.length, 3)
  const rows: Item[][] = []
  for (let i = 0; i < items.length; i += COLS) rows.push(items.slice(i, i + COLS))

  const totalH = rows.length * LH
  const startY = cy - totalH / 2 + LH / 2

  return (
    <>
      {rows.map((row, ri) => {
        const rowW = row.length * COL_W
        const startX = cx - rowW / 2 + COL_W / 2
        return row.map((item, ci) => (
          <text key={`${house}-${ri}-${ci}`}
            x={startX + ci * COL_W} y={startY + ri * LH}
            textAnchor="middle" dominantBaseline="central"
            fontSize="12" fontWeight="500" fill={item.color}>
            {item.label}
          </text>
        ))
      })}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────

export default function NorthIndianChart({
  chart,
  size = 360,
}: {
  chart: ChartData
  size?: number
}) {
  const houses = Array.from({ length: 12 }, (_, i) => i + 1)

  // Sign number occupying a house
  const houseSign = (h: number) => ((chart.lagnaSignNumber - 1 + h - 1) % 12) + 1

  // Sign label sits between the cell centroid and the chart center (inner tip)
  const signLabelPos = (h: number): [number, number] => {
    const [cx, cy] = CELL[h]
    return [cx + (M - cx) * 0.42, cy + (M - cy) * 0.42]
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-white">{chart.shortName} — {chart.name}</h3>
        <span className="text-xs text-gray-500">Lagna: {chart.lagna}</span>
      </div>

      <svg viewBox={`0 0 ${S} ${S}`} width={size} height={size}
        className="block mx-auto" style={{ maxWidth: '100%', aspectRatio: '1 / 1' }}
        preserveAspectRatio="xMidYMid meet">

        <rect width={S} height={S} fill="#111827" rx={4} />

        {LINES.map((d, i) => (
          <path key={i} d={d} stroke="#374151" strokeWidth={1.5} fill="none" />
        ))}

        {/* Sign numbers (small, faded, at inner tip of each house) */}
        {houses.map((h) => {
          const [sx, sy] = signLabelPos(h)
          const sn = houseSign(h)
          return (
            <text key={`sign-${h}`} x={sx} y={sy}
              textAnchor="middle" dominantBaseline="central"
              fontSize="10" fill="#4b5563">
              {sn}
            </text>
          )
        })}

        {/* Lagna marker on H1 */}
        <g>
          <rect x={M - 18} y={CELL[1][1] - 40} width={36} height={15} rx={3} fill="#4f46e5" />
          <text x={M} y={CELL[1][1] - 32} textAnchor="middle" dominantBaseline="central"
            fontSize="9" fontWeight="bold" fill="white">Asc</text>
        </g>

        {/* Planet / arudha / special-lagna content */}
        {houses.map((h) => {
          const [cx, cy] = CELL[h]
          const adjCy = h === 1 ? cy + 8 : cy
          return <CellText key={h} house={h} chart={chart} cx={cx} cy={adjCy} />
        })}
      </svg>

      {/* Sign legend line */}
      <div className="mt-1 text-center text-[10px] text-gray-600">
        Sign numbers shown faded · Lagna in H1
      </div>
    </div>
  )
}
