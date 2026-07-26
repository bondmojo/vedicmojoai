/**
 * lib/mcpAuth.ts — Lightweight shared-secret guard for MCP-facing read routes.
 *
 * The MCP server is a separate local process that calls the Next.js API over
 * HTTP. These routes (`/api/timeline`, `/api/knowledge/**`) are new and only
 * meant for that trusted local caller, so we gate them behind an optional
 * shared secret:
 *
 *   • If `MCP_TOKEN` is unset (typical local dev) → allow all callers.
 *   • If `MCP_TOKEN` is set → require header `x-mcp-token` to match exactly.
 *
 * This keeps the surface closed on a shared LAN without forcing auth in a
 * solo-dev setup. Existing app routes are unaffected.
 */

import { NextRequest, NextResponse } from 'next/server'

/**
 * Returns a 401 NextResponse when the caller is missing/wrong, or `null` when
 * the request is allowed to proceed. Usage:
 *
 *   const auth = requireMcpToken(request)
 *   if (auth) return auth
 */
export function requireMcpToken(request: NextRequest): NextResponse | null {
  const expected = process.env.MCP_TOKEN?.trim()
  if (!expected) return null // no token configured → open (local dev)

  const provided = request.headers.get('x-mcp-token')?.trim()
  if (provided && provided === expected) return null

  return NextResponse.json(
    { error: 'Unauthorized', message: 'Missing or invalid x-mcp-token header' },
    { status: 401 }
  )
}
