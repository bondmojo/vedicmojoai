import fs from 'node:fs'
import { NAKSHATRA_ATTRIBUTES, YONI_ANIMALS } from '../../engine/compute/matchmakingTables'

const raw = JSON.parse(fs.readFileSync('scripts/oracle/output/ashtakoota_oracle_raw.json', 'utf8')) as { results: any[] }

const cell = new Map<string, Map<number, number>>() // "brideAnimal,groomAnimal" -> value multiset

for (const entry of raw.results) {
  if (entry.error) continue
  const brideAnimal = NAKSHATRA_ATTRIBUTES[entry.girl_nakshatra].yoniAnimal
  const groomAnimal = NAKSHATRA_ATTRIBUTES[entry.boy_nakshatra].yoniAnimal
  const py = entry.poroutham?.yoni?.result?.[0]
  if (typeof py !== 'number') continue
  const key = `${brideAnimal},${groomAnimal}`
  let m = cell.get(key)
  if (!m) { m = new Map(); cell.set(key, m) }
  m.set(py, (m.get(py) ?? 0) + 1)
}

console.log('═══ Symmetry check ═══')
let asym = 0, checked = 0
for (const a of YONI_ANIMALS) {
  for (const b of YONI_ANIMALS) {
    if (a >= b) continue
    const ab = cell.get(`${a},${b}`)
    const ba = cell.get(`${b},${a}`)
    if (!ab || !ba || ab.size !== 1 || ba.size !== 1) continue
    checked++
    const vab = [...ab.keys()][0], vba = [...ba.keys()][0]
    if (vab !== vba) { asym++; console.log(`  ASYMMETRIC: ${a}->${b}=${vab}  vs  ${b}->${a}=${vba}`) }
  }
}
console.log(`${asym} of ${checked} pairs asymmetric.\n`)

console.log('═══ Inconsistent cells (not a single constant value) ═══')
let inconsistentCount = 0
for (const [key, m] of cell.entries()) {
  if (m.size > 1) {
    inconsistentCount++
    console.log(`  ${key}: {${[...m.entries()].map(([v,c])=>`${v}(x${c})`).join(', ')}}`)
  }
}
console.log(`${inconsistentCount} inconsistent cells.\n`)

console.log('═══ Tier classification (bride->groom, using sorted/symmetric key since mostly symmetric) ═══')
const tiers: Record<number, string[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] }
const seen = new Set<string>()
for (const a of YONI_ANIMALS) {
  for (const b of YONI_ANIMALS) {
    const sortedKey = [a, b].sort().join('|')
    if (a === b || seen.has(sortedKey)) continue
    seen.add(sortedKey)
    const ab = cell.get(`${a},${b}`)
    if (!ab || ab.size !== 1) continue
    const v = [...ab.keys()][0]
    if (tiers[v]) tiers[v].push(sortedKey)
  }
}
for (const t of [0, 1, 3, 4]) {
  console.log(`  tier ${t} (${tiers[t].length} pairs): ${tiers[t].join('; ')}`)
}
console.log('\nDone.')

console.log('\n═══ TS-ready arrays ═══')
function toTs(pairs: string[]) {
  return pairs.map(p => { const [a,b] = p.split('|'); return `  ['${a}', '${b}'],` }).join('\n')
}
console.log('YONI_ENEMY_PAIRS (tier 1):')
console.log(toTs(tiers[1]))
console.log('\nYONI_FRIEND_PAIRS (tier 3):')
console.log(toTs(tiers[3]))
