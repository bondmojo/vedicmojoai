/**
 * GET /api/runs/[id]/report-content
 *
 * Returns the raw report content (html or md). Reads from the database first
 * (PipelineRun.reportHtml/reportMarkdown); falls back to disk for legacy
 * reports generated before database-backed storage existed. Disk is not
 * writable on serverless (Vercel), so it can only ever serve pre-existing files.
 *
 * - .md files: Content-Type text/plain (raw markdown text)
 * - .html files: Content-Type text/html
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveRequestUser } from '@/lib/auth'
import path from 'path'
import fs from 'fs/promises'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await resolveRequestUser(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Sign in required.' }, { status: 401 })
  }

  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.id },
    select: {
      reportPath: true,
      reportHtml: true,
      reportMarkdown: true,
      status: true,
      unifiedChart: { select: { userId: true } },
    },
  })

  if (!run || run.unifiedChart?.userId !== userId) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  if (!run.reportPath) {
    return NextResponse.json({ error: 'No report file for this run' }, { status: 404 })
  }

  const isMd = run.reportPath.endsWith('.md')
  const dbContent = isMd ? run.reportMarkdown : run.reportHtml

  if (dbContent) {
    return new NextResponse(dbContent, {
      headers: {
        'Content-Type': isMd ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
      },
    })
  }

  const absPath = path.join(process.cwd(), run.reportPath)

  try {
    const content = await fs.readFile(absPath, 'utf-8')
    return new NextResponse(content, {
      headers: {
        'Content-Type': isMd ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Report content not found in database or on disk' },
      { status: 404 }
    )
  }
}
