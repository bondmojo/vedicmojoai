import fs from 'node:fs'
import { RASHI_ATTRIBUTES, type VashyaGroup } from '../../engine/compute/matchmakingTables'

const raw = JSON.parse(fs.readFileSync('scripts/oracle/output/ashtakoota_oracle_raw.json', 'utf8')) as { results: any[] }

function rashiFromNakshatraPada(nak: number, pada: number): number {
  const idx = (nak - 1) * 4 + (pada - 1)
  return Math.floor(idx / 9) + 1
}

const DUAL = new Set([9, 10]) // Sagittarius, Capricorn — excluded, handled separately

const groups: VashyaGroup[] = ['Manav', 'Vanachar', 'Chatushpad', 'Jalachar', 'Keet']
const matrix = new Map<string, Map<number, number>>()

for (const entry of raw.results) {
  if (entry.error) continue
  const groomRashi = rashiFromNakshatraPada(entry.boy_nakshatra, entry.boy_pada)
  const brideRashi = rashiFromNakshatraPada(entry.girl_nakshatra, entry.girl_pada)
  if (DUAL.has(groomRashi) || DUAL.has(brideRashi)) continue
  const py = entry.poroutham?.vashya?.result?.[0]
  if (typeof py !== 'number') continue
  const brideGroup = RASHI_ATTRIBUTES[brideRashi].vashya
  const groomGroup = RASHI_ATTRIBUTES[groomRashi].vashya
  const key = `${brideGroup}->${groomGroup}`
  let m = matrix.get(key)
  if (!m) { m = new Map(); matrix.set(key, m) }
  m.set(py, (m.get(py) ?? 0) + 1)
}

console.log('export const VASHYA_MATRIX_CORRECTED = {')
for (const a of groups) {
  const parts: string[] = []
  for (const b of groups) {
    const m = matrix.get(`${a}->${b}`)
    if (!m) { parts.push(`${b}: undefined /* NO DATA */`); continue }
    if (m.size > 1) {
      parts.push(`${b}: undefined /* INCONSISTENT: ${[...m.entries()].map(([v,c])=>`${v}(x${c})`).join(',')} */`)
    } else {
      const [v, c] = [...m.entries()][0]
      parts.push(`${b}: ${v} /* n=${c} */`)
    }
  }
  console.log(`  ${a}: { ${parts.join(', ')} },`)
}
console.log('}')
