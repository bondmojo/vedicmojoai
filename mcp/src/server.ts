#!/usr/bin/env node
/**
 * server.ts — VedicMojo MCP server entry point.
 *
 * A thin, read-only MCP server that lets Claude Desktop act as the astrologer
 * at $0 API cost: it exposes VedicMojoAI's deterministic computations (Tools),
 * the canonical domain rubrics (Resources), and ready-to-run analysis workflows
 * (Prompts). It NEVER invokes the paid LLM pipelines.
 *
 * Transport: stdio (launched by Claude Desktop). stdout is the protocol channel
 * — all diagnostics go to stderr.
 *
 * Env: VEDICMOJO_BASE_URL (default http://localhost:3000), MCP_TOKEN (optional).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerTools } from './tools.js'
import { registerResources } from './resources.js'
import { registerPrompts } from './prompts.js'
import { config } from './http.js'

async function main(): Promise<void> {
  const server = new McpServer({ name: 'vedicmojo', version: '1.0.0' })

  registerTools(server)
  registerResources(server)
  registerPrompts(server)

  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error(
    `[vedicmojo-mcp] ready → ${config.BASE_URL} (auth: ${config.hasToken ? 'on' : 'off'})`
  )
}

main().catch((err) => {
  console.error('[vedicmojo-mcp] fatal:', err)
  process.exit(1)
})
