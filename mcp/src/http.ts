/**
 * http.ts — Thin HTTP client to the running VedicMojoAI Next.js app.
 *
 * The MCP server holds NO astrology logic; every tool is a call to an existing
 * (or the two new read-only) HTTP routes. Base URL and the optional shared
 * secret come from env:
 *   VEDICMOJO_BASE_URL  (default http://localhost:3000)
 *   MCP_TOKEN           (optional; sent as x-mcp-token, matched by lib/mcpAuth)
 *
 * NOTE: stdout is reserved for the MCP protocol — never console.log here; use
 * console.error (stderr) for diagnostics.
 */

const BASE_URL = (process.env.VEDICMOJO_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const MCP_TOKEN = process.env.MCP_TOKEN

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

function headers(json: boolean): Record<string, string> {
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  if (MCP_TOKEN) h['x-mcp-token'] = MCP_TOKEN
  return h
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function throwIfNotOk(res: Response, data: unknown, path: string): void {
  if (res.ok) return
  const msg =
    data && typeof data === 'object' && 'error' in data
      ? String((data as { error: unknown }).error)
      : `HTTP ${res.status} for ${path}`
  throw new ApiError(msg, res.status, data)
}

export const api = {
  async get(path: string): Promise<unknown> {
    const res = await fetch(`${BASE_URL}${path}`, { method: 'GET', headers: headers(false) })
    const data = await parse(res)
    throwIfNotOk(res, data, path)
    return data
  },

  async post(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify(body ?? {}),
    })
    const data = await parse(res)
    throwIfNotOk(res, data, path)
    return data
  },

  /** For text/markdown routes (the knowledge rubrics). */
  async getText(path: string): Promise<string> {
    const res = await fetch(`${BASE_URL}${path}`, { method: 'GET', headers: headers(false) })
    const text = await res.text()
    if (!res.ok) {
      let body: unknown = text
      try {
        body = JSON.parse(text)
      } catch {
        /* keep raw */
      }
      throwIfNotOk(res, body, path)
    }
    return text
  },
}

export const config = { BASE_URL, hasToken: Boolean(MCP_TOKEN) }
