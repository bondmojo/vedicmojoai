/**
 * GET /api/runs/[id]/report-content
 *
 * Returns the raw content of the report file stored on disk (html or md).
 * Used by the report page to display markdown inline and to provide
 * a download link for .md files.
 *
 * - .md files: Content-Type text/plain (raw markdown text)
 * - .html files: Content-Type text/html
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import path from 'path'
import fs from 'fs/promises'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.id },
    select: { reportPath: true, status: true },
  })

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  if (!run.reportPath) {
    return NextResponse.json({ error: 'No report file for this run' }, { status: 404 })
  }

  const absPath = path.join(process.cwd(), run.reportPath)

  try {
    const content = await fs.readFile(absPath, 'utf-8')
    const isMd = run.reportPath.endsWith('.md')
    return new NextResponse(content, {
      headers: {
        'Content-Type': isMd ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Report file not found on disk' },
      { status: 404 }
    )
  }
}
