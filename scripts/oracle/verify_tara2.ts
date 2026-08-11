#!/usr/bin/env npx tsx
/**
 * scripts/oracle/verify_tara2.ts — confirms the Tara koota's whole-score
 * override rule (task 9.3) against the full oracle sweep: 100% match.
 *
 * A simpler-looking fix (add remainders 1 and 9 to the ordinary per-direction
 * inauspicious set) was tried first and found WRONG — it computes 1.5 for the
 * (remainder 2, remainder 9) case where the oracle shows an unconditional 0.
 * This script tests the correct model instead: EITHER direction's remainder
 * being 1 or 9 zeroes the WHOLE koota, pre-empting the per-direction sum
 * entirely. See matchmakingTables.ts's TARA_TOTAL_OVERRIDE_REMAINDERS.
 *
 * Read-only. Never modifies matchmakingTables.ts.
 */
import fs from 'node:fs'

const raw = JSON.parse(fs.readFileSync('scripts/oracle/output/ashtakoota_oracle_raw.json', 'utf8')) as { results: any[] }

function rawCount(from: number, to: number): number {
  return ((to - from + 27) % 27) + 1
}
function remainder(from: number, to: number): number {
  const r = rawCount(from, to) % 9
  return r === 0 ? 9 : r
}

const INAUSP = new Set([3, 5, 7])
const OVERRIDE = new Set([1, 9])

let matched = 0, total = 0
for (const entry of raw.results) {
  if (entry.error) continue
  const brideNak = entry.girl_nakshatra
  const groomNak = entry.boy_nakshatra
  const b2g = remainder(brideNak, groomNak)
  const g2b = remainder(groomNak, brideNak)

  let ours: number
  if (OVERRIDE.has(b2g) || OVERRIDE.has(g2b)) {
    ours = 0
  } else {
    ours = (INAUSP.has(b2g) ? 0 : 1.5) + (INAUSP.has(g2b) ? 0 : 1.5)
  }

  const py = entry.poroutham?.tara?.result?.[0]
  if (typeof py !== 'number') continue
  total++
  if (Math.abs(py - ours) < 1e-9) matched++
}
console.log(`Either-side-override hypothesis: ${matched}/${total} = ${(matched/total*100).toFixed(2)}%`)
