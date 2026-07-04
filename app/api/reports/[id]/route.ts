/**
 * API: /api/reports/[id]
 * GET — Serve the HTML report file for a run
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import fs from 'fs/promises'
import path from 'path'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  // id here is the run ID
  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.id },
    select: { reportPath: true, status: true },
  })

  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  if (!run.reportPath) {
    return NextResponse.json(
      { error: 'No report generated for this run', status: run.status },
      { status: 404 }
    )
  }

  // Read and serve the HTML file
  const reportFullPath = path.join(process.cwd(), run.reportPath)

  try {
    const html = await fs.readFile(reportFullPath, 'utf-8')
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Report file not found on disk' },
      { status: 404 }
    )
  }
}
