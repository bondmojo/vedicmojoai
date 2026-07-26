/**
 * GET /api/knowledge/[type]/[name] — Return one rubric file as expanded text.
 *
 *   type = "domains"     → prompts/domains/{name}.md   (canonical domain knowledge)
 *   type = "frameworks"  → prompts/agents/{name}.md    (analysis framework, includes expanded)
 *
 * Uses readPromptFile() so `{{include:...}}` directives are inlined — a caller
 * asking for the career framework gets the domain knowledge + DA-1 core stitched
 * together, exactly as the paid pipeline would assemble it.
 *
 * Security: `name` is strictly validated ([a-z0-9_-]) and verified against the
 * actual directory listing (allow-list), so no path traversal / arbitrary read.
 * No LLM, no DB.
 */

import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { requireMcpToken } from '@/lib/mcpAuth'
import { readPromptFile } from '@/engine/llm'

const NAME_RE = /^[a-z0-9_-]+$/i

const TYPE_TO_DIR: Record<string, string> = {
  domains: 'domains',
  frameworks: 'agents',
}

async function listNames(dir: string): Promise<Set<string>> {
  const entries = await fs.readdir(path.join(process.cwd(), 'prompts', dir))
  return new Set(entries.filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')))
}

export async function GET(
  request: NextRequest,
  { params }: { params: { type: string; name: string } }
) {
  const auth = requireMcpToken(request)
  if (auth) return auth

  const dir = TYPE_TO_DIR[params.type]
  if (!dir) {
    return NextResponse.json(
      { error: 'Unknown type', message: 'type must be "domains" or "frameworks"' },
      { status: 404 }
    )
  }

  if (!NAME_RE.test(params.name)) {
    return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
  }

  // Allow-list: the requested name must be a real file in the directory.
  let allowed: Set<string>
  try {
    allowed = await listNames(dir)
  } catch {
    return NextResponse.json({ error: 'Knowledge base unavailable' }, { status: 500 })
  }
  if (!allowed.has(params.name)) {
    return NextResponse.json(
      { error: 'Not found', message: `No ${params.type} rubric named "${params.name}"`, available: [...allowed].sort() },
      { status: 404 }
    )
  }

  // Bare filename → prompts/agents; "domains/x.md" → prompts/domains (see readPromptFile).
  const promptRef = dir === 'domains' ? `domains/${params.name}.md` : `${params.name}.md`

  try {
    const content = await readPromptFile(promptRef)
    return new NextResponse(content, {
      status: 200,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to read rubric', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
