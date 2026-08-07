import fs from 'node:fs'
import { RASHI_ATTRIBUTES } from '../../engine/compute/matchmakingTables'

const raw = JSON.parse(fs.readFileSync('scripts/oracle/output/ashtakoota_oracle_raw.json', 'utf8')) as { results: any[] }

function rashiFromNakshatraPada(nak: number, pada: number): number {
  const idx = (nak - 1) * 4 + (pada - 1)
  return Math.floor(idx / 9) + 1
}

const DUAL = new Set([9, 10])

// For each exact (nakshatra,pada) that falls in Sag/Cap, find its Vashya
// score against every NON-dual groom rashi, and see which of the two
// candidate groups (front-half vs back-half assignment) it's consistent with.
for (const dualNak of [19, 20, 21, 22, 23]) {
  for (let pada = 1; pada <= 4; pada++) {
    const rashi = rashiFromNakshatraPada(dualNak, pada)
    if (!DUAL.has(rashi)) continue
    // collect this exact position as BRIDE, against every non-dual groom rashi
    const perGroomGroup = new Map<string, Map<number, number>>()
    for (const entry of raw.results) {
      if (entry.error) continue
      if (entry.girl_nakshatra !== dualNak || entry.girl_pada !== pada) continue
      const groomRashi = rashiFromNakshatraPada(entry.boy_nakshatra, entry.boy_pada)
      if (DUAL.has(groomRashi)) continue
      const py = entry.poroutham?.vashya?.result?.[0]
      if (typeof py !== 'number') continue
      const groomGroup = RASHI_ATTRIBUTES[groomRashi].vashya
      let m = perGroomGroup.get(groomGroup)
      if (!m) { m = new Map(); perGroomGroup.set(groomGroup, m) }
      m.set(py, (m.get(py) ?? 0) + 1)
    }
    const summary = [...perGroomGroup.entries()]
      .map(([g, m]) => `${g}=${[...m.entries()].map(([v, c]) => `${v}(x${c})`).join('|')}`)
      .join(', ')
    console.log(`nak=${dualNak} pada=${pada} (rashi ${rashi}, ${RASHI_ATTRIBUTES[rashi].name}): ${summary}`)
  }
}
