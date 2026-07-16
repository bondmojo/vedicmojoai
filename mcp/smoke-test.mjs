/**
 * smoke-test.mjs — Spawns the built MCP server over stdio and exercises it end
 * to end against the running Next.js app (localhost:3000). Not a unit test — a
 * live wiring check. Run: `node smoke-test.mjs`
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const transport = new StdioClientTransport({ command: 'node', args: ['dist/server.js'] })
const client = new Client({ name: 'smoke', version: '1.0.0' })
await client.connect(transport)

const line = (s) => console.log(`\n=== ${s} ===`)

line('capabilities')
const tools = await client.listTools()
const resources = await client.listResources()
const prompts = await client.listPrompts()
console.log('tools:', tools.tools.map((t) => t.name).join(', '))
console.log('resources:', resources.resources.map((r) => r.uri).join(', '))
console.log('prompts:', prompts.prompts.map((p) => p.name).join(', '))

const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args })
  const text = r.content?.[0]?.text ?? ''
  console.log(`[${name}] isError=${!!r.isError} len=${text.length} :: ${text.slice(0, 180).replace(/\n/g, ' ')}`)
  return text
}

line('list_clients')
const clientsText = await call('list_clients', {})
let chartId = null
try {
  const arr = JSON.parse(clientsText)
  chartId = arr?.[0]?.id ?? null
} catch {}
console.log('picked chartId:', chartId)

line('list_knowledge / get_domain_knowledge')
await call('list_knowledge', {})
await call('get_domain_knowledge', { domain: 'career' })

line('compute_chart (ad-hoc birth data)')
await call('compute_chart', { date: '1990-05-15', time: '08:30', timezone: 5.5, latitude: 19.076, longitude: 72.8777, name: 'Test' })

if (chartId) {
  line('extractors on stored chart')
  await call('get_shadbala', { chartId })
  await call('get_divisional_chart', { chartId, divisions: [1, 9, 10] })
  await call('get_active_dasha', { chartId })
  line('get_timeline_periods (career)')
  await call('get_timeline_periods', { chartId, dateFrom: '2026-01-01', dateTo: '2028-12-31', category: 'career' })
  line('get_domain_dataset (career, default window)')
  await call('get_domain_dataset', { chartId, domain: 'career' })
}

line('get a prompt (analyze_career)')
if (chartId) {
  const p = await client.getPrompt({ name: 'analyze_career', arguments: { clientId: chartId } })
  const t = p.messages?.[0]?.content?.text ?? ''
  console.log('analyze_career prompt len:', t.length, '::', t.slice(0, 160).replace(/\n/g, ' '))
}

line('read a resource (knowledge://domains/health)')
const res = await client.readResource({ uri: 'knowledge://domains/health' })
console.log('resource len:', res.contents?.[0]?.text?.length ?? 0)

await client.close()
console.log('\nSMOKE OK')
process.exit(0)
