#!/usr/bin/env npx tsx
/**
 * scripts/oracle/analyze_vashya.ts — task 9.3 deep-dive (read-only).
 *
 * The bucket-by-VashyaGroup pass in analyze_oracle.ts showed that PyJHora's
 * vasiya_porutham does NOT depend only on the two natives' VashyaGroup — the
 * same group-pair produced multiple distinct point values. This script
 * re-derives PyJHora's actual per-RASHI (12x12, not 5-group) matrix directly
 * from the oracle sweep, and checks whether it is symmetric (order-independent)
 * or directional, to see what PyJHora is actually keying on.
 *
 * Read-only. Never modifies matchmakingTables.ts.
 */
import fs from 'node:fs'
import path from 'node:path'
import { RASHI_ATTRIBUTES } from '../../engine/compute/matchmakingTables'

const RAW_PATH = path.join(__dirname, 'output', 'ashtakoota_oracle_raw.json')

interface OracleEntry {
  boy_nakshatra: number
  boy_pada: number
  girl_nakshatra: number
  girl_pada: number
  poroutham: Record<string, { result?: unknown }>
  error?: string
}

const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf8')) as { results: OracleEntry[] }

function rashiFromNakshatraPada(nakshatraNumber: number, padaNumber: number): number {
  const overallPadaIndex = (nakshatraNumber - 1) * 4 + (padaNumber - 1)
  return Math.floor(overallPadaIndex / 9) + 1
}

function pyPoints(entry: OracleEntry, key: string): number | null {
  const r = entry.poroutham[key]?.result
  if (!Array.isArray(r) || typeof r[0] !== 'number') return null
  return r[0]
}

// Calibrated in analyze_oracle.ts: boy = groom, girl = bride.
// (bridRashi, groomRashi) -> observed PyJHora point-value multiset
const cell = new Map<string, Map<number, number>>()

for (const entry of raw.results) {
  if (entry.error) continue
  const groomRashi = rashiFromNakshatraPada(entry.boy_nakshatra, entry.boy_pada)
  const brideRashi = rashiFromNakshatraPada(entry.girl_nakshatra, entry.girl_pada)
  const py = pyPoints(entry, 'vashya')
  if (py === null) continue
  const key = `${brideRashi},${groomRashi}`
  let m = cell.get(key)
  if (!m) {
    m = new Map()
    cell.set(key, m)
  }
  m.set(py, (m.get(py) ?? 0) + 1)
}

console.log('═══ Per-rashi-pair (12x12) Vashya matrix, as observed from PyJHora ═══')
console.log('Rows = bride rashi (1-12), Cols = groom rashi (1-12). Each cell: value (or MIXED if not constant).\n')

const rashiName = (n: number) => RASHI_ATTRIBUTES[n].name.slice(0, 3)

let header = '        '
for (let g = 1; g <= 12; g++) header += rashiName(g).padStart(6)
console.log(header)

let anyMixed = false
for (let b = 1; b <= 12; b++) {
  let row = rashiName(b).padEnd(8)
  for (let g = 1; g <= 12; g++) {
    const m = cell.get(`${b},${g}`)
    if (!m) {
      row += 'n/a'.padStart(6)
      continue
    }
    if (m.size === 1) {
      row += String([...m.keys()][0]).padStart(6)
    } else {
      anyMixed = true
      row += 'MIX'.padStart(6)
    }
  }
  console.log(row)
}

console.log(anyMixed ? '\n(MIX = still not constant even at full 12x12 rashi-pair granularity)' : '\n(Every cell is a single constant value at 12x12 rashi granularity.)')

// Symmetry check: does (bride=X, groom=Y) always equal (bride=Y, groom=X)?
console.log('\n═══ Symmetry check: is the 12x12 matrix symmetric (order-independent)? ═══')
let asymmetricPairs = 0
let checkedPairs = 0
for (let a = 1; a <= 12; a++) {
  for (let b = a + 1; b <= 12; b++) {
    const cellAB = cell.get(`${a},${b}`)
    const cellBA = cell.get(`${b},${a}`)
    if (!cellAB || !cellBA || cellAB.size !== 1 || cellBA.size !== 1) continue
    checkedPairs++
    const vAB = [...cellAB.keys()][0]
    const vBA = [...cellBA.keys()][0]
    if (vAB !== vBA) {
      asymmetricPairs++
      console.log(`  ASYMMETRIC: bride=${rashiName(a)},groom=${rashiName(b)} => ${vAB}   vs   bride=${rashiName(b)},groom=${rashiName(a)} => ${vBA}`)
    }
  }
}
console.log(`\n${asymmetricPairs} of ${checkedPairs} off-diagonal rashi pairs are directional (order changes the score).`)

// Cross-check against our own 5-group classification to see if grouping still explains rows/cols.
console.log('\n═══ Row grouping check: within one VashyaGroup, is PyJHora consistent per bride-rashi row? ═══')
for (let b = 1; b <= 12; b++) {
  const group = RASHI_ATTRIBUTES[b].vashya
  const values: string[] = []
  for (let g = 1; g <= 12; g++) {
    const m = cell.get(`${b},${g}`)
    if (m && m.size === 1) values.push(`${rashiName(g)}=${[...m.keys()][0]}`)
  }
  console.log(`  bride=${rashiName(b)} (${group}): ${values.join(', ')}`)
}

console.log('\nDone.')

// ─── Sag/Cap dual-sign deep-dive: does pinning to (nakshatra,pada), not just
// rashi, make the Sag/Cap cells deterministic? ───
console.log('\n═══ Sagittarius/Capricorn: does exact (nakshatra,pada) resolve the MIX? ═══')
const dualCell = new Map<string, Map<number, number>>()
for (const entry of raw.results) {
  if (entry.error) continue
  const groomRashi = rashiFromNakshatraPada(entry.boy_nakshatra, entry.boy_pada)
  const brideRashi = rashiFromNakshatraPada(entry.girl_nakshatra, entry.girl_pada)
  if (brideRashi !== 9 && brideRashi !== 10 && groomRashi !== 9 && groomRashi !== 10) continue
  const py = pyPoints(entry, 'vashya')
  if (py === null) continue
  // Key on the DUAL side's exact (nakshatra,pada) plus the OTHER side's rashi
  // (or exact position, if both are dual) — see which resolves it.
  const brideIsDual = brideRashi === 9 || brideRashi === 10
  const key = brideIsDual
    ? `brideDual nak=${entry.girl_nakshatra}/pada=${entry.girl_pada}(rashi${brideRashi}) vs groomRashi=${groomRashi}`
    : `groomDual nak=${entry.boy_nakshatra}/pada=${entry.boy_pada}(rashi${groomRashi}) vs brideRashi=${brideRashi}`
  let m = dualCell.get(key)
  if (!m) { m = new Map(); dualCell.set(key, m) }
  m.set(py, (m.get(py) ?? 0) + 1)
}
let dualMixed = 0, dualClean = 0
for (const [key, m] of [...dualCell.entries()].sort()) {
  if (m.size > 1) {
    dualMixed++
    console.log(`  STILL MIXED: ${key} => {${[...m.entries()].map(([v,c])=>`${v}(x${c})`).join(', ')}}`)
  } else {
    dualClean++
  }
}
console.log(`\n${dualClean} clean / ${dualMixed} still-mixed once keyed on exact (nakshatra,pada) for the dual side.`)
