/**
 * tests/mcp-cost-guard.test.ts — Safety guarantee for the MCP server.
 *
 * The whole point of the MCP server is to let Claude Desktop reason at $0 API
 * cost, so it must NEVER trigger the paid LLM pipelines. This test statically
 * scans mcp/src and asserts:
 *   1. Every `api.post('<path>')` targets an allow-listed deterministic route.
 *   2. The paid analyze route path ("/analyze") is never referenced. (Tool and
 *      prompt NAMES like `analyze_career` are fine — only the route is banned.)
 *
 * A pure file-content scan — no imports, no runtime — so it can't drift from
 * the compiled behavior via mocking.
 */

import { describe, it, expect } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'

const MCP_SRC = path.resolve(__dirname, '..', 'mcp', 'src')

// The only routes the MCP is permitted to POST to. All are deterministic /
// read-style and cost nothing in LLM tokens.
const ALLOWED_POST_ROUTES = new Set(['/api/compute', '/api/compute/varshaphal', '/api/timeline'])

async function readSrcFiles(): Promise<Array<{ file: string; content: string }>> {
  const entries = await fs.readdir(MCP_SRC)
  const out: Array<{ file: string; content: string }> = []
  for (const e of entries) {
    if (!e.endsWith('.ts')) continue
    out.push({ file: e, content: await fs.readFile(path.join(MCP_SRC, e), 'utf-8') })
  }
  return out
}

describe('MCP cost guard', () => {
  it('only POSTs to allow-listed deterministic routes', async () => {
    const files = await readSrcFiles()
    const postPathRe = /api\.post\(\s*['"`]([^'"`]+)['"`]/g
    const violations: string[] = []

    for (const { file, content } of files) {
      for (const m of content.matchAll(postPathRe)) {
        const route = m[1]
        if (!ALLOWED_POST_ROUTES.has(route)) {
          violations.push(`${file}: api.post('${route}')`)
        }
      }
    }

    expect(violations, `Disallowed POST targets found:\n${violations.join('\n')}`).toEqual([])
  })

  it('never CALLS the paid analyze route (any api.* method)', async () => {
    const files = await readSrcFiles()
    // Scan actual api.get/post/getText call paths — not comments or names — so
    // `analyze_career` (a prompt name) and doc comments are ignored.
    const callRe = /api\.(?:get|post|getText)\(\s*[`'"]([^`'"]+)[`'"]/g
    const offenders: string[] = []
    for (const { file, content } of files) {
      for (const m of content.matchAll(callRe)) {
        if (/analyze/i.test(m[1])) offenders.push(`${file}: ${m[1]}`)
      }
    }
    expect(offenders, `api call to an analyze route:\n${offenders.join('\n')}`).toEqual([])
  })

  it('references duration-analysis only via GET (reads), never POST (create)', async () => {
    const files = await readSrcFiles()
    const badPost: string[] = []
    for (const { file, content } of files) {
      // Any api.post to a duration-analysis path would be a paid create/override.
      const re = /api\.post\(\s*['"`]([^'"`]*duration-analysis[^'"`]*)['"`]/g
      for (const m of content.matchAll(re)) badPost.push(`${file}: ${m[1]}`)
    }
    expect(badPost, `Paid duration-analysis POST found:\n${badPost.join('\n')}`).toEqual([])
  })

  it('every api.get/post/getText call site uses a literal path (no indirection)', async () => {
    // The three checks above scan for literal/template-literal path strings
    // directly inside api.post(/api.get(/api.getText(. That only works if
    // every call site actually passes a literal as its first argument. If a
    // call instead passed a bare identifier (`const p = '...'; api.post(p)`),
    // a concatenation (`api.post('/api' + '/x')`), or a renamed/aliased import
    // of `api`, the path would be invisible to those regexes and could hide a
    // call to a paid route. This test asserts the invariant those checks rely
    // on: every api.get/post/getText call's first argument starts with a
    // quote or backtick, i.e. is a string or template literal.
    const files = await readSrcFiles()
    // Matches the call plus whatever the first argument token actually is,
    // so we can tell literals apart from identifiers/expressions.
    const callRe = /api\.(get|post|getText)\(\s*([^)]*)/g
    const offenders: string[] = []

    for (const { file, content } of files) {
      for (const m of content.matchAll(callRe)) {
        const method = m[1]
        const firstArgStart = m[2].trimStart()
        const isLiteral = /^['"`]/.test(firstArgStart)
        if (!isLiteral) {
          const snippet = firstArgStart.slice(0, 40).split('\n')[0]
          offenders.push(`${file}: api.${method}(${snippet}...) — first argument is not a string/template literal`)
        }
      }
    }

    expect(
      offenders,
      `Non-literal path argument(s) found — these calls can't be audited by the ` +
        `literal-path regex checks above and could hide a call to a paid route:\n${offenders.join('\n')}`
    ).toEqual([])
  })
})
