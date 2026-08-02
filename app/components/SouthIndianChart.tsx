/**
 * SouthIndianChart — South Indian style chart using SVG.
 * Signs are fixed positions (Aries top-left row 0 col 1).
 * Lagna is highlighted with an indigo border.
 * Shows planets, Arudha Padas, Special Lagnas, Upagrahas.
 */
'use client'

import { PLANET_ABBR, PLANET_TEXT_CLASS, SIGNS_SHORT, ChartData, dignitySuffix } from './chartTypes'
import { CELL_SIZE, GRID_SIZE, SOUTH_LAYOUT } from './chartGeometry'

// ─── Sign grid layout (South Indian) ────────────────────────────────
// Fixed 4×4 grid. The 4 center cells are empty.
//
//  Pis(12) Ari(1)  Tau(2)  Gem(3)
//  Aqu(11) [    ]  [    ]  Can(4)
//  Cap(10) [    ]  [    ]  Leo(5)
//  Sag(9)  Sco(8)  Lib(7)  Vir(6)

const SI_LAYOUT = SOUTH_LAYOUT

/**
 * `color` is an inline hex `fill` for the fixed-hue Arudha/Special-Lagna/
 * Upagraha markers; `className` is the theme-responsive Tailwind class for
 * planet cells (`PLANET_TEXT_CLASS`) — exactly one of the two is set.
 */
interface CellContent {
  label: string
  color?: string
  className?: string
}

function getCellContent(signNumber: number, chart: ChartData): CellContent[] {
  const house = ((signNumber - chart.lagnaSignNumber + 12) % 12) + 1
  const items: CellContent[] = []

  for (const p of chart.planets) {
    if (p.signNumber === signNumber) {
      const abbr = PLANET_ABBR[p.planet] ?? p.planet.substring(0, 2)
      const label = (p.retrograde ? `(${abbr})` : abbr) + dignitySuffix(p.dignity, p.vargottama)
      items.push({ label, className: PLANET_TEXT_CLASS })
    }
  }

  if (chart.arudhaPadas) {
    for (const ap of chart.arudhaPadas) {
      if (ap.signNumber === signNumber) {
        items.push({ label: ap.abbr, color: '#f59e0b' })
      }
    }
  }

  if (chart.specialLagnas) {
    for (const sl of chart.specialLagnas) {
      if (sl.signNumber === signNumber) {
        items.push({ label: sl.abbr, color: '#e879f9' })
      }
    }
  }

  if (chart.upagrahas) {
    for (const ug of chart.upagrahas) {
      if (ug.signNumber === signNumber) {
        items.push({ label: `(${ug.abbr})`, color: '#9ca3af' })
      }
    }
  }

  return items
}

function SignCell({
  signNumber,
  row,
  col,
  chart,
}: {
  signNumber: number
  row: number
  col: number
  chart: ChartData
}) {
  const isLagna = signNumber === chart.lagnaSignNumber
  const cx = col * CELL_SIZE
  const cy = row * CELL_SIZE
  const items = getCellContent(signNumber, chart)
  const lineH = 13
  const rows: CellContent[][] = []
  for (let i = 0; i < items.length; i += 3) rows.push(items.slice(i, i + 3))
  const contentStartY = cy + 22

  return (
    <g>
      <rect
        x={cx} y={cy}
        width={CELL_SIZE} height={CELL_SIZE}
        className={`fill-white dark:fill-[#111827] ${isLagna ? '' : 'stroke-neutral-200 dark:stroke-[#374151]'}`}
        stroke={isLagna ? '#6366f1' : undefined}
        strokeWidth={isLagna ? 2 : 1}
      />
      {/* Sign name */}
      <text
        x={cx + 4} y={cy + 12}
        fontSize="9" fill={isLagna ? '#818cf8' : '#4b5563'}
        fontWeight={isLagna ? 'bold' : 'normal'}
      >
        {SIGNS_SHORT[signNumber - 1]}{isLagna ? ' ▲' : ''}
      </text>
      {/* Content items */}
      {rows.map((row, ri) => {
        const rowW = row.length * 22
        const startX = cx + CELL_SIZE / 2 - rowW / 2 + 11
        return row.map((item, ci) => (
          <text
            key={`${ri}-${ci}`}
            x={startX + ci * 22}
            y={contentStartY + ri * lineH}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="10"
            fill={item.color}
            className={item.className}
          >
            {item.label}
          </text>
        ))
      })}
    </g>
  )
}

export default function SouthIndianChart({
  chart,
  size = 360,
}: {
  chart: ChartData
  size?: number
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-ink">
          {chart.shortName} — {chart.name}
        </h3>
        <span className="text-xs text-gray-500">Lagna: {chart.lagna}</span>
      </div>
      <svg
        viewBox={`0 0 ${GRID_SIZE} ${GRID_SIZE}`}
        width={size}
        height={size}
        className="block mx-auto"
        style={{ maxWidth: '100%' }}
      >
        <rect width={GRID_SIZE} height={GRID_SIZE} className="fill-white dark:fill-[#111827]" />
        {/* Center 4 empty cells */}
        {[[1,1],[1,2],[2,1],[2,2]].map(([r, c]) => (
          <rect
            key={`empty-${r}-${c}`}
            x={c * CELL_SIZE} y={r * CELL_SIZE}
            width={CELL_SIZE} height={CELL_SIZE}
            className="fill-neutral-50 dark:fill-[#0f172a] stroke-neutral-200 dark:stroke-[#1f2937]" strokeWidth={1}
          />
        ))}
        {/* Sign cells */}
        {SI_LAYOUT.map(({ row, col, signNumber }) => (
          <SignCell
            key={signNumber}
            signNumber={signNumber}
            row={row}
            col={col}
            chart={chart}
          />
        ))}
      </svg>
    </div>
  )
}
