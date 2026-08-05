/**
 * registerAll.ts — Builds one McpServer with every tool/resource/prompt
 * registered, bound to a given API client. Shared by both entry points:
 * server.ts (stdio, local Claude Desktop) and the Next.js app's
 * app/api/mcp/route.ts (Streamable HTTP, remote clients).
 *
 * The McpServer class is constructed here, using mcp/'s OWN installed copy of
 * @modelcontextprotocol/sdk — deliberately never imported into the Next.js
 * app itself. The root app and mcp/ each install their own copy of the SDK
 * (mcp/ is a separate, independently buildable package), and TypeScript
 * treats two classes with private fields from two physically distinct copies
 * as non-assignable even at identical versions. Keeping construction inside
 * mcp/src avoids that: app/api/mcp/route.ts only ever touches the transport
 * (a plain, public-members-only `Transport` interface, safe across copies)
 * and calls `.connect()` on the opaquely-typed server this returns.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ApiClient } from './http.js'
import { registerTools } from './tools.js'
import { registerResources } from './resources.js'
import { registerPrompts } from './prompts.js'

export function createMcpServer(api: ApiClient): McpServer {
  const server = new McpServer({ name: 'vedicmojo', version: '1.0.0' })
  registerTools(server, api)
  registerResources(server, api)
  registerPrompts(server, api)
  return server
}
