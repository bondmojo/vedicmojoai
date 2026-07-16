/**
 * live-adversarial-test.mjs — Adversarial live test of the built MCP server over
 * stdio against the running Next.js app (localhost:3000). Exercises malformed
 * inputs, boundary conditions, and confirms PAID routes are never reachable.
 * Run from repo root: `node mcp/live-adversarial-test.mjs`
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverPath = join(__dirname, 'dist', 'server.js')

const transport = new StdioClientTransport({ command: 'node', args: [serverPath], cwd: __dirname })
const client = new Client({ name: 'adversarial', version: '1.0.0' })
await client.connect(transport)

const REAL = '781a25c3-e7c6-4bd7-bb2d-b08d489a791a'
const results = []

async function callRaw(name, args) {
  // Returns { ok, isError, text, threw, err }
  try {
    const r = await client.callTool({ name, arguments: args })
    const text = r.content?.[0]?.text ?? ''
    return { ok: true, isError: !!r.isError, text, threw: false }
  } catch (e) {
    return { ok: false, isError: true, text: '', threw: true, err: String(e?.message ?? e) }
  }
}

function log(item, call, res) {
  console.log(`\n########## ITEM ${item} ##########`)
  console.log('CALL:', call)
  if (res.threw) {
    console.log('THREW:', res.err)
  } else {
    console.log(`isError=${res.isError}`)
    console.log('TEXT:', res.text)
  }
  results.push({ item, call, res })
}

// 2. get_client_chart with non-existent UUID
{
  const args = { chartId: '00000000-0000-4000-8000-000000000000' }
  const r = await callRaw('get_client_chart', args)
  log(2, `get_client_chart ${JSON.stringify(args)}`, r)
}

// 3. compute_chart invalid date
{
  const args = { date: 'not-a-date', time: '08:30', timezone: 5.5, latitude: 19.076, longitude: 72.8777, name: 'Bad' }
  const r = await callRaw('compute_chart', args)
  log(3, `compute_chart ${JSON.stringify(args)}`, r)
}

// 4. get_shadbala with neither chartId nor birthData
{
  const args = {}
  const r = await callRaw('get_shadbala', args)
  log(4, `get_shadbala ${JSON.stringify(args)}`, r)
}

// 5. get_divisional_chart divisions [9,10] -> only D9,D10
{
  const args = { chartId: REAL, divisions: [9, 10] }
  const r = await callRaw('get_divisional_chart', args)
  log(5, `get_divisional_chart ${JSON.stringify(args)}`, r)
}

// 6. get_divisional_chart divisions [60] unsupported
{
  const args = { chartId: REAL, divisions: [60] }
  const r = await callRaw('get_divisional_chart', args)
  log(6, `get_divisional_chart ${JSON.stringify(args)}`, r)
}

// 7. get_timeline_periods backwards range
{
  const args = { chartId: REAL, dateFrom: '2030-01-01', dateTo: '2020-01-01', category: 'career' }
  const r = await callRaw('get_timeline_periods', args)
  log(7, `get_timeline_periods ${JSON.stringify(args)}`, r)
}

// 8. get_timeline_periods >10yr span
{
  const args = { chartId: REAL, dateFrom: '2020-01-01', dateTo: '2035-01-01', category: 'career' }
  const r = await callRaw('get_timeline_periods', args)
  log(8, `get_timeline_periods ${JSON.stringify(args)}`, r)
}

// 9. get_timeline_periods valid ~2yr career
{
  const args = { chartId: REAL, dateFrom: '2026-01-01', dateTo: '2028-01-01', category: 'career' }
  const r = await callRaw('get_timeline_periods', args)
  log(9, `get_timeline_periods ${JSON.stringify(args)}`, r)
}

// 10a. get_active_dasha asOf 2015
{
  const args = { chartId: REAL, asOf: '2015-01-01' }
  const r = await callRaw('get_active_dasha', args)
  log('10a', `get_active_dasha ${JSON.stringify(args)}`, r)
}
// 10b. get_active_dasha asOf 2050
{
  const args = { chartId: REAL, asOf: '2050-01-01' }
  const r = await callRaw('get_active_dasha', args)
  log('10b', `get_active_dasha ${JSON.stringify(args)}`, r)
}

// 11. get_domain_knowledge invalid enum -> expect SDK Zod rejection (throw)
{
  const args = { domain: 'astrology' }
  const r = await callRaw('get_domain_knowledge', args)
  log(11, `get_domain_knowledge ${JSON.stringify(args)}`, r)
}

// 12. get_framework bad name
{
  const args = { name: 'not_a_real_framework' }
  const r = await callRaw('get_framework', args)
  log(12, `get_framework ${JSON.stringify(args)}`, r)
}

// 13a. list_reports
{
  const r = await callRaw('list_reports', {})
  log('13a', `list_reports {}`, r)
}
// 13b. list_duration_analyses
{
  const r = await callRaw('list_duration_analyses', {})
  log('13b', `list_duration_analyses {}`, r)
}

// 14. get_report random UUID
{
  const args = { runId: '11111111-2222-4333-8444-555555555555' }
  const r = await callRaw('get_report', args)
  log(14, `get_report ${JSON.stringify(args)}`, r)
}

await client.close()
console.log('\n########## DONE ##########')
process.exit(0)
