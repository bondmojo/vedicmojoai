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

import { PLANET_ABBR, PLANET_TEXT_CLASS, SIGNS_SHORT, ChartData, dignitySuffix } from './chartTypes'
import { CANVAS, NORTH_LINES, NORTH_CELL, NORTH_SIGN_POS } from './chartGeometry'

const S = CANVAS
const M = S / 2 // 240

// Structure lines: outer square, 2 diagonals, inner diamond. No midlines.
const LINES = NORTH_LINES

// Cell centroids (counter-clockwise from top). Corner triangles nudged
// slightly toward center so text fits.
const CELL = NORTH_CELL

// ─── Cell content ──────────────────────────────────────────────────

/**
 * `color` is an inline hex `fill` for the fixed-hue Arudha/Special-Lagna/
 * Upagraha markers; `className` is the theme-responsive Tailwind class for
 * planet cells (`PLANET_TEXT_CLASS`) — exactly one of the two is set.
 */
interface Item { label: string; color?: string; className?: string }

function getCellItems(house: number, chart: ChartData): Item[] {
  const items: Item[] = []

  for (const p of chart.planets) {
    if (p.house === house) {
      const abbr = PLANET_ABBR[p.planet] ?? p.planet.substring(0, 2)
      const label = (p.retrograde ? `(${abbr})` : abbr) + dignitySuffix(p.dignity, p.vargottama)
      items.push({ label, className: PLANET_TEXT_CLASS })
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
            fontSize="12" fontWeight="500" fill={item.color} className={item.className}>
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

  // Sign number label positions — placed at the VERTEX (corner) of each
  // triangle cell that is farthest from the chart center, so numbers never
  // overlap with planet/nakshatra content (which clusters at the centroid).
  // For rhombus houses, placed at the inner diamond vertex closest to center.
  //
  // Triangle vertex positions (outer corners):
  //   H2:  shares corner (0,0) with H3 — place near top-left corner
  //   H3:  shares corner (0,0) with H2 — place near top-left corner
  //   H5:  shares corner (0,480) with H6
  //   H6:  shares corner (0,480) with H5
  //   H8:  shares corner (480,480) with H9
  //   H9:  shares corner (480,480) with H8
  //   H11: shares corner (480,0) with H12
  //   H12: shares corner (480,0) with H11
  //
  // Each pair shares a corner, so offset slightly along the edge they own.
  const signLabelPos = (h: number): [number, number] => NORTH_SIGN_POS[h]

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-ink">{chart.shortName} — {chart.name}</h3>
        <span className="text-xs text-gray-500">Lagna: {chart.lagna}</span>
      </div>

      <svg viewBox={`0 0 ${S} ${S}`} width={size} height={size}
        className="block mx-auto" style={{ maxWidth: '100%', aspectRatio: '1 / 1' }}
        preserveAspectRatio="xMidYMid meet">

        <rect width={S} height={S} className="fill-white dark:fill-[#111827]" rx={4} />

        {LINES.map((d, i) => (
          <path key={i} d={d} className="stroke-neutral-200 dark:stroke-[#374151]" strokeWidth={1.5} fill="none" />
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
