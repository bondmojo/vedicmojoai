/**
 * /charts/[id] — Chart detail page (Server Component)
 * Shows chart summary, run history, and "New Run" button.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'

export default async function ChartDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const chart = await prisma.chart.findUnique({
    where: { id: params.id },
    include: {
      runs: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          runType: true,
          queryTypes: true,
          status: true,
          totalTokenIn: true,
          totalTokenOut: true,
          totalCostUsd: true,
          reportPath: true,
          overrideApplied: true,
          createdAt: true,
          completedAt: true,
        },
      },
    },
  })

  if (!chart) notFound()

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <Link href="/charts" className="text-sm text-gray-500 hover:text-gray-300 mb-2 block">
              ← Back to Charts
            </Link>
            <h1 className="text-3xl font-bold">{chart.clientName}</h1>
            <div className="flex items-center gap-4 mt-2 text-gray-400">
              <span>Lagna: <strong className="text-gray-200">{chart.lagna}</strong></span>
              {chart.yogakaraka && (
                <span>Yogakaraka: <strong className="text-gray-200">{chart.yogakaraka}</strong></span>
              )}
              <span>Moon: {Number(chart.moonLongitude).toFixed(2)}°</span>
            </div>
          </div>
          <div className="flex gap-3">
            <Link
              href={`/charts/${chart.id}/dasha`}
              className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 hover:border-indigo-500 hover:text-white transition-colors"
            >
              Dasha Timeline
            </Link>
            <Link
              href={`/charts/${chart.id}/run`}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
            >
              New Run
            </Link>
          </div>
        </div>

        {/* Run History */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Run History</h2>

          {chart.runs.length === 0 ? (
            <div className="text-center py-12 text-gray-500 border border-gray-700 rounded-lg">
              <p>No analysis runs yet.</p>
              <Link
                href={`/charts/${chart.id}/run`}
                className="inline-block mt-3 text-indigo-400 hover:text-indigo-300"
              >
                Start your first run →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {chart.runs.map((run) => (
                <Link
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className="block rounded-lg border border-gray-700 bg-gray-800/50 p-4 hover:border-indigo-500/50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <StatusBadge status={run.status} />
                      <div>
                        <div className="flex items-center gap-2">
                          {run.queryTypes.map((qt) => (
                            <span key={qt} className="px-2 py-0.5 rounded bg-gray-700 text-xs text-gray-300">
                              {qt}
                            </span>
                          ))}
                        </div>
                        <span className="text-xs text-gray-500 mt-1 block">
                          {run.runType === 'followup' ? 'Follow-up' : 'First query'}
                          {run.overrideApplied && ' • Override applied'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div className="text-gray-400">
                        ${Number(run.totalCostUsd).toFixed(4)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDate(run.createdAt)}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    done: 'bg-green-900/50 text-green-400 border-green-700',
    running: 'bg-blue-900/50 text-blue-400 border-blue-700',
    queued: 'bg-gray-700/50 text-gray-400 border-gray-600',
    failed: 'bg-red-900/50 text-red-400 border-red-700',
    halted_for_review: 'bg-amber-900/50 text-amber-400 border-amber-700',
  }

  return (
    <span className={`px-2 py-1 rounded border text-xs font-medium ${colors[status] ?? colors.queued}`}>
      {status === 'halted_for_review' ? 'halted' : status}
    </span>
  )
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
