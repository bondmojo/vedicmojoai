/**
 * chartGeometry.ts — shared SVG layout constants for NorthIndianChart and
 * SouthIndianChart.
 *
 * Extracted verbatim from both components (mechanical, behaviour-preserving
 * move) so the two layouts have one source of truth instead of two
 * independent copies. No values changed.
 */

// ─── South Indian (4×4 grid) sizing — also reused as the North Indian
// canvas size below, since both charts render into a 480×480 viewBox. ────
export const CELL_SIZE = 120
export const GRID_SIZE = 4 * CELL_SIZE // 480

// ─── North Indian (diamond) canvas ──────────────────────────────────
/** SVG viewBox side length for the North Indian diamond chart. */
export const CANVAS = 480
const NORTH_M = CANVAS / 2 // 240

/**
 * Structure lines: outer square, 2 diagonals, inner diamond. No midlines.
 */
export const NORTH_LINES = [
  `M 0,0 L ${CANVAS},0 L ${CANVAS},${CANVAS} L 0,${CANVAS} Z`,   // outer square
  `M 0,0 L ${CANVAS},${CANVAS}`,                                 // diagonal TL→BR
  `M ${CANVAS},0 L 0,${CANVAS}`,                                 // diagonal TR→BL
  `M ${NORTH_M},0 L ${CANVAS},${NORTH_M} L ${NORTH_M},${CANVAS} L 0,${NORTH_M} Z`, // inner diamond
]

/**
 * Cell centroids (counter-clockwise from top), keyed by house 1–12. Corner
 * triangles nudged slightly toward center so text fits.
 */
export const NORTH_CELL: Record<number, [number, number]> = {
  1:  [NORTH_M, 118],          // top rhombus
  2:  [NORTH_M - 118, 58],     // top-left upper triangle
  3:  [60, NORTH_M - 118],     // left upper triangle
  4:  [118, NORTH_M],          // left rhombus
  5:  [60, NORTH_M + 118],     // left lower triangle
  6:  [NORTH_M - 118, CANVAS - 58], // bottom-left lower triangle
  7:  [NORTH_M, CANVAS - 118], // bottom rhombus
  8:  [NORTH_M + 118, CANVAS - 58], // bottom-right lower triangle
  9:  [CANVAS - 60, NORTH_M + 118], // right lower triangle
  10: [CANVAS - 118, NORTH_M], // right rhombus
  11: [CANVAS - 60, NORTH_M - 118], // right upper triangle
  12: [NORTH_M + 118, 58],     // top-right upper triangle
}

const NORTH_SIGN_PAD = 22 // padding from outer edge

/**
 * Sign-number label positions (small, faded, at the vertex of each cell
 * farthest from the chart center), keyed by house 1–12.
 */
export const NORTH_SIGN_POS: Record<number, [number, number]> = {
  // Rhombus houses: at the diamond vertex (inner tip toward center)
  1:  [NORTH_M, NORTH_SIGN_PAD + 10],
  4:  [NORTH_SIGN_PAD + 10, NORTH_M],
  7:  [NORTH_M, CANVAS - NORTH_SIGN_PAD - 10],
  10: [CANVAS - NORTH_SIGN_PAD - 10, NORTH_M],
  // Triangle houses: at the outer corner vertex of each triangle
  2:  [NORTH_SIGN_PAD + 40, NORTH_SIGN_PAD],
  3:  [NORTH_SIGN_PAD, NORTH_SIGN_PAD + 40],
  5:  [NORTH_SIGN_PAD, CANVAS - NORTH_SIGN_PAD - 40],
  6:  [NORTH_SIGN_PAD + 40, CANVAS - NORTH_SIGN_PAD],
  8:  [CANVAS - NORTH_SIGN_PAD - 40, CANVAS - NORTH_SIGN_PAD],
  9:  [CANVAS - NORTH_SIGN_PAD, CANVAS - NORTH_SIGN_PAD - 40],
  11: [CANVAS - NORTH_SIGN_PAD, NORTH_SIGN_PAD + 40],
  12: [CANVAS - NORTH_SIGN_PAD - 40, NORTH_SIGN_PAD],
}

// ─── South Indian (4×4 grid) layout ─────────────────────────────────
// Fixed 4×4 grid. The 4 center cells are empty.
//
//  Pis(12) Ari(1)  Tau(2)  Gem(3)
//  Aqu(11) [    ]  [    ]  Can(4)
//  Cap(10) [    ]  [    ]  Leo(5)
//  Sag(9)  Sco(8)  Lib(7)  Vir(6)

/** Row/col plus the zodiac sign occupying that fixed cell. */
export const SOUTH_LAYOUT: { row: number; col: number; signNumber: number }[] = [
  { row: 0, col: 0, signNumber: 12 },
  { row: 0, col: 1, signNumber: 1  },
  { row: 0, col: 2, signNumber: 2  },
  { row: 0, col: 3, signNumber: 3  },
  { row: 1, col: 3, signNumber: 4  },
  { row: 2, col: 3, signNumber: 5  },
  { row: 3, col: 3, signNumber: 6  },
  { row: 3, col: 2, signNumber: 7  },
  { row: 3, col: 1, signNumber: 8  },
  { row: 3, col: 0, signNumber: 9  },
  { row: 2, col: 0, signNumber: 10 },
  { row: 1, col: 0, signNumber: 11 },
]
