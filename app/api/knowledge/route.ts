/**
 * GET /api/knowledge — Enumerate the available rubric resources.
 *
 * Returns the list of domain-knowledge fragments and analysis-framework prompts
 * that the MCP exposes as read-only Resources. Read straight from disk so the
 * list never drifts from the actual prompt files. Content is fetched per-item
 * from GET /api/knowledge/[type]/[name].
 *
 * This route reads only from prompts/domains and prompts/agents — no LLM, no DB.
 */

import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { resolveRequestUser } from '@/lib/auth'

async function listMarkdown(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path.join(process.cwd(), 'prompts', dir))
    return entries
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''))
      .sort()
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  const userId = await resolveRequestUser(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
  }

  const [domains, frameworks] = await Promise.all([
    listMarkdown('domains'),
    listMarkdown('agents'),
  ])

  return NextResponse.json({
    domains, // e.g. ["career","cashflow","health","marriage","property","wealth"]
    frameworks, // e.g. ["duration_da1_career", ..., "wave2_2f_career", ...]
    usage: {
      domain: 'GET /api/knowledge/domains/{name}',
      framework: 'GET /api/knowledge/frameworks/{name}',
    },
  })
}
