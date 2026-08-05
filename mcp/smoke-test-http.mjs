/**
 * smoke-test-http.mjs — Exercises app/api/mcp/route.ts (the Streamable HTTP
 * transport) end to end against a running deployment. Not a unit test — a
 * live wiring check, same spirit as smoke-test.mjs (which does the stdio
 * path). Run:
 *
 *   node smoke-test-http.mjs <baseUrl> <mcpToken>
 *
 * baseUrl defaults to http://localhost:3000, mcpToken to $MCP_TOKEN.
 * Get a token from a logged-in account at /account → MCP Token → Generate.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const baseUrl = process.argv[2] ?? 'http://localhost:3000'
const token = process.argv[3] ?? process.env.MCP_TOKEN
if (!token) {
  console.error('Usage: node smoke-test-http.mjs <baseUrl> <mcpToken>  (or set MCP_TOKEN)')
  process.exit(1)
}

const url = new URL('/api/mcp', baseUrl)
const transport = new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
})
const client = new Client({ name: 'smoke-http', version: '1.0.0' })
await client.connect(transport)

const line = (s) => console.log(`\n=== ${s} ===`)

line(`connected → ${url}`)
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

line('list_clients (proves the token resolves to a real, scoped user)')
const clientsText = await call('list_clients', {})
let chartId = null
try {
  const arr = JSON.parse(clientsText)
  chartId = arr?.[0]?.id ?? null
} catch {}
console.log('picked chartId:', chartId)

line('compute_chart (ad-hoc birth data, no auth-independent state)')
await call('compute_chart', {
  date: '1990-05-15',
  time: '08:30',
  timezone: 5.5,
  latitude: 19.076,
  longitude: 72.8777,
  name: 'Test',
})

if (chartId) {
  line('extractor on a stored chart owned by this token')
  await call('get_shadbala', { chartId })
}

// Deliberately reused token in a second, independent connection — proves a
// fresh McpServer/api client is built per HTTP request, not leaked from a
// prior connection's module state.
line('second independent connection with the same token')
const transport2 = new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
})
const client2 = new Client({ name: 'smoke-http-2', version: '1.0.0' })
await client2.connect(transport2)
const r2 = await client2.listTools()
console.log('second connection tools:', r2.tools.length)
await client2.close()

await client.close()
console.log('\nSMOKE HTTP OK')
process.exit(0)
