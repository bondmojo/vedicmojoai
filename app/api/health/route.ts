/**
 * API: /api/health
 * GET — Health check endpoint for Docker/Cloud Run readiness probes
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import fs from 'fs/promises'
import path from 'path'

export async function GET() {
  const checks: Record<string, 'ok' | 'error'> = {}

  // Check DB connection
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = 'ok'
  } catch {
    checks.database = 'error'
  }

  // Check reports directory is writable
  try {
    const reportsDir = process.env.REPORTS_DIR || path.join(process.cwd(), 'data', 'reports')
    await fs.access(reportsDir, fs.constants.W_OK)
    checks.reports_dir = 'ok'
  } catch {
    checks.reports_dir = 'error'
  }

  const healthy = Object.values(checks).every((v) => v === 'ok')

  return NextResponse.json(
    { status: healthy ? 'healthy' : 'degraded', checks },
    { status: healthy ? 200 : 503 }
  )
}
