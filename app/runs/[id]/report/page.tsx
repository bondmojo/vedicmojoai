/**
 * /runs/[id]/report — Report viewer page (Server Component)
 * Serves the HTML report in an iframe or fetches and renders inline.
 */

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import Link from 'next/link'

export default async function ReportViewerPage({
  params,
}: {
  params: { id: string }
}) {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      reportPath: true,
      status: true,
      queryTypes: true,
      overrideApplied: true,
      chart: { select: { clientName: true, id: true } },
    },
  })

  if (!run) notFound()

  if (!run.reportPath) {
    return (
      <main className="min-h-screen p-8 flex flex-col items-center justify-center">
        <p className="text-gray-400 mb-4">
          {run.status === 'halted_for_review'
            ? 'Report not generated — run is halted for review.'
            : run.status === 'running'
            ? 'Report is being generated...'
            : 'No report available for this run.'}
        </p>
        <Link href={`/runs/${run.id}`} className="text-indigo-400 hover:text-indigo-300">
          ← Back to Run
        </Link>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-700 bg-gray-900">
        <div className="flex items-center gap-4">
          <Link href={`/runs/${run.id}`} className="text-sm text-gray-500 hover:text-gray-300">
            ← Run Details
          </Link>
          <span className="text-sm text-gray-400">
            {run.chart.clientName} — {run.queryTypes.join(', ')}
          </span>
          {run.overrideApplied && (
            <span className="px-2 py-0.5 rounded bg-amber-900/50 text-amber-400 text-xs">Override Applied</span>
          )}
        </div>
        <a
          href={`/api/reports/${run.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          Open in new tab ↗
        </a>
      </div>

      {/* Report iframe */}
      <iframe
        src={`/api/reports/${run.id}`}
        className="flex-1 w-full border-0"
        title="Analysis Report"
      />
    </main>
  )
}
