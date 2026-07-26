/**
 * resources.ts — Read-only knowledge Resources (the canonical domain rubrics).
 *
 * The six domain-knowledge fragments are the stable, high-value reference the
 * paid pipeline reasons from. Exposed as MCP Resources so the practitioner can
 * attach them as context in Claude Desktop. (The ~29 agent frameworks are
 * reachable via the `get_framework` tool instead of 29 resource registrations.)
 *
 * Content is fetched lazily per read (GET /api/knowledge/domains/{name}), so the
 * server registers instantly and never fails at startup if the app is briefly
 * unavailable.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { api } from './http.js'

const DOMAINS = ['career', 'health', 'wealth', 'marriage', 'property', 'cashflow'] as const

export function registerResources(server: McpServer): void {
  for (const domain of DOMAINS) {
    server.registerResource(
      `domain-${domain}`,
      `knowledge://domains/${domain}`,
      {
        title: `${domain[0].toUpperCase()}${domain.slice(1)} domain knowledge`,
        description: `Canonical Vedic ${domain} rubric (houses, karakas, yogas, timing rules).`,
        mimeType: 'text/markdown',
      },
      async (uri) => {
        const text = await api.getText(`/api/knowledge/domains/${domain}`)
        return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] }
      }
    )
  }
}
