/**
 * /charts — Chart list page (Server Component)
 * Lists all submitted charts with run counts and last run date.
 */

import Link from 'next/link'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function ChartsPage() {
  const charts = await prisma.chart.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { runs: true } },
      runs: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true, status: true },
      },
    },
  })

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Charts</h1>
          <Link
            href="/compute"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            + New Chart
          </Link>
        </div>

        {charts.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">No charts submitted yet.</p>
            <p className="mt-2">Submit a ChartInputV1 JSON to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {charts.map((chart) => (
              <Link
                key={chart.id}
                href={`/charts/${chart.id}`}
                className="block rounded-lg border border-gray-700 bg-gray-800/50 p-4 hover:border-indigo-500/50 hover:bg-gray-800 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium">{chart.clientName}</h3>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
                      <span>Lagna: {chart.lagna}</span>
                      {chart.yogakaraka && (
                        <span>YK: {chart.yogakaraka}</span>
                      )}
                      <span>{chart._count.runs} run{chart._count.runs !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    {chart.runs[0] && (
                      <div className="flex items-center gap-2">
                        <StatusBadge status={chart.runs[0].status} />
                        <span>{formatDate(chart.runs[0].createdAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    done: 'bg-green-900/50 text-green-400',
    running: 'bg-blue-900/50 text-blue-400',
    queued: 'bg-gray-700/50 text-gray-400',
    failed: 'bg-red-900/50 text-red-400',
    halted_for_review: 'bg-amber-900/50 text-amber-400',
  }

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? colors.queued}`}>
      {status}
    </span>
  )
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
