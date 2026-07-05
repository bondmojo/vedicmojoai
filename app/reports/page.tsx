/**
 * /reports — All completed analysis reports.
 *
 * Lists all pipeline runs that have completed (status: done),
 * grouped by chart. Each links to the report viewer.
 */

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface ReportEntry {
  id: string
  chartId: string
  clientName: string
  lagna: string
  source: string | null
  runType: string
  queryTypes: string[]
  status: string
  totalTokenIn: number
  totalTokenOut: number
  totalCostUsd: number
  createdAt: string
  completedAt: string | null
}

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/reports')
      .then((res) => res.json())
      .then((data) => setReports(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Reports</h1>
          <p className="text-gray-500">Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Analysis Reports</h1>

        {reports.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg">No reports yet.</p>
            <p className="mt-2">Run an AI analysis on a chart to generate a report.</p>
            <Link href="/unified-charts" className="mt-4 inline-block text-indigo-400 hover:text-indigo-300">
              Go to Unified Charts &rarr;
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <Link
                key={report.id}
                href={`/runs/${report.id}/report`}
                className="block rounded-lg border border-gray-700 bg-gray-800/50 p-4 hover:border-indigo-500/50 hover:bg-gray-800 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium">{report.clientName}</h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                      <span>{report.lagna} Lagna</span>
                      {report.source && <SourceBadge source={report.source} />}
                      <span>[{report.queryTypes.join(', ')}]</span>
                      <span className="text-gray-600">{report.runType}</span>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-gray-300">
                      {(report.totalTokenIn + report.totalTokenOut).toLocaleString()} tokens
                    </div>
                    <div className="text-gray-500">${report.totalCostUsd.toFixed(4)}</div>
                    <div className="text-xs text-gray-600 mt-1">
                      {report.completedAt
                        ? formatDate(report.completedAt)
                        : formatDate(report.createdAt)}
                    </div>
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

function SourceBadge({ source }: { source: string }) {
  const styles = source === 'compute'
    ? 'bg-cyan-900/50 text-cyan-400'
    : 'bg-purple-900/50 text-purple-400'

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles}`}>
      {source}
    </span>
  )
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
