/**
 * http.ts — Thin HTTP client to the running VedicMojoAI Next.js app.
 *
 * The MCP server holds NO astrology logic; every tool is a call to an existing
 * (or the two new read-only) HTTP routes. `createApiClient` builds one client
 * bound to a given token + base URL — the stdio server (server.ts) builds a
 * single default instance from env vars at startup; the Streamable HTTP route
 * (app/api/mcp/route.ts) builds one PER REQUEST from that request's own
 * Authorization/x-mcp-token header and origin, since a shared HTTP endpoint
 * serves many users concurrently and can't bake one token into the process.
 *
 * NOTE: stdout is reserved for the MCP protocol — never console.log here; use
 * console.error (stderr) for diagnostics.
 */

const DEFAULT_BASE_URL = (process.env.VEDICMOJO_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const DEFAULT_MCP_TOKEN = process.env.MCP_TOKEN

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

/**
 * @param token       per-user MCP token, sent as `x-mcp-token`
 * @param baseUrl     origin of the app to call
 * @param extraHeaders sent on every request — used by the HTTP route to carry
 *   a Vercel Deployment-Protection bypass on its self-referential calls
 */
export function createApiClient(
  token?: string,
  baseUrl: string = DEFAULT_BASE_URL,
  extraHeaders?: Record<string, string>
) {
  const base = baseUrl.replace(/\/$/, '')

  function headers(json: boolean): Record<string, string> {
    const h: Record<string, string> = { ...extraHeaders }
    if (json) h['Content-Type'] = 'application/json'
    if (token) h['x-mcp-token'] = token
    return h
  }

  return {
    async get(path: string): Promise<unknown> {
      const res = await fetch(`${base}${path}`, { method: 'GET', headers: headers(false) })
      const data = await parse(res)
      throwIfNotOk(res, data, path)
      return data
    },

    async post(path: string, body: unknown): Promise<unknown> {
      const res = await fetch(`${base}${path}`, {
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
      const res = await fetch(`${base}${path}`, { method: 'GET', headers: headers(false) })
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
}

export type ApiClient = ReturnType<typeof createApiClient>

/** Default client for the stdio server, bound at process startup from env. */
export const api = createApiClient(DEFAULT_MCP_TOKEN, DEFAULT_BASE_URL)

export const config = { BASE_URL: DEFAULT_BASE_URL, hasToken: Boolean(DEFAULT_MCP_TOKEN) }
