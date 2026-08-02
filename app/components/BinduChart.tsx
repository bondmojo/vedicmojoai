/**
 * BinduChart — a lightweight, standalone chart-style diagram for a single
 * Ashtakavarga bindu series (one graha's BAV, or SAV).
 *
 * Deliberately NOT a generalisation of NorthIndianChart / SouthIndianChart
 * and NOT a variant prop on either of them (see design.md, "`BinduChart` —
 * component strategy"): those two components take a `ChartData` shape this
 * diagram doesn't have, and their cell model is a variable-length list of
 * glyph items, whereas a bindu cell is exactly one integer plus one label.
 * Shared SVG geometry constants are still reused from `chartGeometry.ts` so
 * there is one source of truth for the North/South layouts.
 *
 * Placement rules (see design.md for the full rationale):
 *
 * - South Indian — fixed sign grid. Every cell is placed at the
 *   `SOUTH_LAYOUT` slot matching `cell.signNumber`. In sign mode the caller
 *   sets `signNumber = slot + 1` (Aries-first); in house mode the caller has
 *   already copied `byHouse[i].signNumber` onto `cell.signNumber`, so this
 *   component performs no house-to-sign arithmetic of its own (R5.5) — it
 *   only ever reads the sign number it was given.
 * - North Indian — fixed house positions.
 *     - House mode: `cell.house` is populated by the caller (slot i → house
 *       i+1, direct) and this component places the cell at `NORTH_CELL[cell.house]`
 *       verbatim.
 *     - Sign mode: `cell.house` is undefined (per the `BinduCell` contract) and
 *       `cell.signNumber` is `slot + 1`. Design.md's placement rule for this
 *       case is: "when `ashtakavarga.lagnaSignNumber` is present the cell that
 *       would be H1 holds the lagna sign; when it is absent the first cell
 *       holds Aries." That is lagna-relative positioning, not the byHouse
 *       arithmetic R5.5 forbids (R5.5 is scoped to house-mode/byHouse data), so
 *       this component performs it itself via the optional `lagnaSignNumber`
 *       prop — a prop the design's base `BinduChartProps` interface omits but
 *       that this placement rule cannot be satisfied without. When the prop is
 *       absent, the formula degrades exactly to "first cell holds Aries."
 */
'use client'

import type { BinduBand, BinduReckoning } from '@/lib/ashtakavargaBands'
import { bandOf, bandsFor } from '@/lib/ashtakavargaBands'
import { binduBandClass } from '@/lib/brandColors'
import { CANVAS, NORTH_CELL, NORTH_LINES, CELL_SIZE, GRID_SIZE, SOUTH_LAYOUT } from './chartGeometry'

export interface BinduCell {
  /** 0-based slot in the active index mode. */
  slot: number
  /** Sign 1–12 this cell holds. Drives South-Indian placement. Undefined when unknown. */
  signNumber?: number
  /** House 1–12 this cell represents. Drives North-Indian placement. Undefined in sign mode. */
  house?: number
  /** Rendered cell label — "H1" in house mode, "Ari" in sign mode. */
  label: string
  /** Bindu count, or null when absent / non-integer / out of range. */
  count: number | null
}

export interface BinduChartProps {
  /** Visible heading, e.g. "Sun" or "SAV". */
  title: string
  /** Accessible series name used in every cell's alt text: a graha name, or "SAV". */
  seriesLabel: string
  style: 'north' | 'south'
  reckoning: BinduReckoning
  /** Exactly 12 cells. */
  cells: BinduCell[]
  size?: number
  /** Optional caption, e.g. "Total: 39 bindus". */
  caption?: string
  /**
   * Lagna sign 1–12. Consulted ONLY for North-Indian sign-mode placement
   * (`style === 'north'` and every cell's `house` is undefined). Omitted or
   * undefined → the first cell holds Aries, matching design.md's stated
   * fallback for older charts with no `lagnaSignNumber`. Not part of the
   * design's base `BinduChartProps` listing — added because North sign-mode
   * placement is otherwise unspecifiable; see the file header comment.
   */
  lagnaSignNumber?: number
}

// ─── Cell → CSS class helpers ───────────────────────────────────────────────

/**
 * `binduBandClass` returns HTML-oriented classes (`text-X` + `bg-X-muted`)
 * intended for chips/table cells. The cell rect intentionally uses only the
 * text half — a colour-filled box was tried here previously but the fill
 * class doesn't survive Tailwind's static scan (it's assembled from a string
 * at runtime), and it also visually duplicated the grid structure. The cell
 * outline alone (via `stroke-*`) defines the diagram cell; the count itself
 * carries the band colour.
 */
function svgClassesForBand(band: BinduBand | null): { textClass: string } {
  const cls = binduBandClass(band)
  const textClass = cls.split(' ').find((p) => p.startsWith('text-')) ?? 'text-gray-500'
  return { textClass }
}

function bandLabelFor(reckoning: BinduReckoning, band: BinduBand | null): string {
  if (band === null) return 'unavailable'
  return bandsFor(reckoning).find((b) => b.band === band)?.label ?? band
}

function markerFor(reckoning: BinduReckoning, band: BinduBand | null): string {
  if (band === null) return ''
  return bandsFor(reckoning).find((b) => b.band === band)?.marker ?? ''
}

// ─── Placement ───────────────────────────────────────────────────────────────

interface PlacedCell {
  cell: BinduCell
  cx: number
  cy: number
}

function placeSouth(cells: BinduCell[]): PlacedCell[] {
  const bySign = new Map<number, BinduCell>()
  for (const cell of cells) {
    if (cell.signNumber != null) bySign.set(cell.signNumber, cell)
  }
  const placed: PlacedCell[] = []
  for (const { row, col, signNumber } of SOUTH_LAYOUT) {
    const cell = bySign.get(signNumber)
    if (!cell) continue
    placed.push({
      cell,
      cx: col * CELL_SIZE + CELL_SIZE / 2,
      cy: row * CELL_SIZE + CELL_SIZE / 2,
    })
  }
  return placed
}

function placeNorth(cells: BinduCell[], lagnaSignNumber?: number): PlacedCell[] {
  const effectiveLagna = lagnaSignNumber ?? 1
  const placed: PlacedCell[] = []
  for (const cell of cells) {
    let house: number | undefined
    if (cell.house != null) {
      // House mode: slot i → cell i+1, direct.
      house = cell.house
    } else if (cell.signNumber != null) {
      // Sign mode: the cell that would be H1 holds the lagna sign (or Aries
      // when lagnaSignNumber is absent, since effectiveLagna defaults to 1).
      house = ((cell.signNumber - effectiveLagna + 12) % 12) + 1
    }
    if (house == null || !NORTH_CELL[house]) continue
    const [cx, cy] = NORTH_CELL[house]
    placed.push({ cell, cx, cy })
  }
  return placed
}

// ─── Cell rendering ──────────────────────────────────────────────────────────

const CELL_W = 68
const CELL_H = 34

function BinduCellGroup({
  placed,
  seriesLabel,
  reckoning,
}: {
  placed: PlacedCell
  seriesLabel: string
  reckoning: BinduReckoning
}) {
  const { cell, cx, cy } = placed
  const band = bandOf(cell.count, reckoning)
  const { textClass } = svgClassesForBand(band)
  const marker = markerFor(reckoning, band)
  const bandLabel = bandLabelFor(reckoning, band)

  const displayText = band !== null ? `${cell.count}${marker ? ` ${marker}` : ''}` : 'n/a'
  const ariaLabel =
    band !== null
      ? `${seriesLabel}, ${cell.label}, ${cell.count} bindus, ${bandLabel}`
      : `${seriesLabel}, ${cell.label}, count unavailable`

  return (
    <g role="img" aria-label={ariaLabel}>
      <rect
        x={cx - CELL_W / 2}
        y={cy - CELL_H / 2}
        width={CELL_W}
        height={CELL_H}
        rx={4}
        className="stroke-neutral-200 dark:stroke-[#374151] fill-none"
        strokeWidth={1}
      />
      <text
        x={cx}
        y={cy - 7}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="9"
        className="fill-gray-500 dark:fill-gray-400"
      >
        {cell.label}
      </text>
      <text
        x={cx}
        y={cy + 7}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="13"
        fontWeight="600"
        fill="currentColor"
        className={textClass}
      >
        {displayText}
      </text>
    </g>
  )
}

// ─── Accessible mirror table ─────────────────────────────────────────────────

function BinduMirrorTable({
  cells,
  seriesLabel,
  reckoning,
}: {
  cells: BinduCell[]
  seriesLabel: string
  reckoning: BinduReckoning
}) {
  return (
    <table className="sr-only">
      <caption>{seriesLabel} bindu counts</caption>
      <thead>
        <tr>
          <th scope="col">Cell</th>
          <th scope="col">Bindus</th>
          <th scope="col">Band</th>
        </tr>
      </thead>
      <tbody>
        {cells.map((cell) => {
          const band = bandOf(cell.count, reckoning)
          return (
            <tr key={cell.slot}>
              <th scope="row">{cell.label}</th>
              <td>{cell.count != null ? cell.count : 'unavailable'}</td>
              <td>{bandLabelFor(reckoning, band)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function BinduChart({
  title,
  seriesLabel,
  style,
  reckoning,
  cells,
  size = 220,
  caption,
  lagnaSignNumber,
}: BinduChartProps) {
  const placed = style === 'south' ? placeSouth(cells) : placeNorth(cells, lagnaSignNumber)
  const viewBoxSize = style === 'south' ? GRID_SIZE : CANVAS

  return (
    <div className="rounded-xl border border-border bg-card p-2 shadow-sm">
      <h4 className="text-xs font-semibold text-ink text-center mb-1">{title}</h4>

      <svg
        role="group"
        aria-label={seriesLabel}
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        width={size}
        height={size}
        className="block mx-auto"
        style={{ maxWidth: '100%', aspectRatio: '1 / 1' }}
        preserveAspectRatio="xMidYMid meet"
      >
        <rect width={viewBoxSize} height={viewBoxSize} className="fill-white dark:fill-[#111827]" rx={4} />

        {style === 'south' ? (
          <>
            {[[1, 1], [1, 2], [2, 1], [2, 2]].map(([r, c]) => (
              <rect
                key={`empty-${r}-${c}`}
                x={c * CELL_SIZE}
                y={r * CELL_SIZE}
                width={CELL_SIZE}
                height={CELL_SIZE}
                className="fill-neutral-50 dark:fill-[#0f172a] stroke-neutral-200 dark:stroke-[#1f2937]"
                strokeWidth={1}
              />
            ))}
            {SOUTH_LAYOUT.map(({ row, col }) => (
              <rect
                key={`cell-${row}-${col}`}
                x={col * CELL_SIZE}
                y={row * CELL_SIZE}
                width={CELL_SIZE}
                height={CELL_SIZE}
                className="fill-none stroke-neutral-200 dark:stroke-[#374151]"
                strokeWidth={1}
              />
            ))}
          </>
        ) : (
          NORTH_LINES.map((d, i) => (
            <path key={i} d={d} className="stroke-neutral-200 dark:stroke-[#374151]" strokeWidth={1.5} fill="none" />
          ))
        )}

        {placed.map((p) => (
          <BinduCellGroup key={p.cell.slot} placed={p} seriesLabel={seriesLabel} reckoning={reckoning} />
        ))}
      </svg>

      {caption && <div className="mt-1 text-center text-[10px] text-gray-600">{caption}</div>}

      <BinduMirrorTable cells={cells} seriesLabel={seriesLabel} reckoning={reckoning} />
    </div>
  )
}
