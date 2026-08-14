/** Shared, UTC-labelled Gochar occupancy interval table. */
'use client'

import type { GocharRangeResult } from '@/lib/gocharRange'

export interface GocharRangeTableProps {
  result: GocharRangeResult
  label?: string
}

/** Always includes a UTC date and time, keeping sub-day re-entry intervals legible. */
export function formatGocharUtc(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

export default function GocharRangeTable({ result, label }: GocharRangeTableProps) {
  const groups = new Map<string, typeof result.intervals>()
  for (const interval of result.intervals) {
    const group = groups.get(interval.planet) ?? []
    group.push(interval)
    groups.set(interval.planet, group)
  }

  return (
    <section className="rounded-lg border border-gray-700 overflow-hidden" aria-label={label ?? 'Gochar range'}>
      <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700 space-y-1">
        {label && <h3 className="text-sm font-semibold">{label}</h3>}
        <p className="text-xs text-gray-400">
          Included grahas: <span className="text-gray-200">{result.includedGrahas.join(', ')}</span>
        </p>
        <p className="text-xs text-gray-500">
          Moon: {result.moonIncluded ? 'included' : 'not included'} · Every interval is UTC.
        </p>
        <p className="text-xs text-gray-500">
          Resolved UTC range: <code className="text-gray-300">{result.rangeStart}</code> → <code className="text-gray-300">{result.rangeEnd}</code>
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <caption className="sr-only">Dated Lahiri sidereal Gochar occupancy intervals in UTC</caption>
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-700">
              <th scope="col" className="px-3 py-2 text-left">Graha</th>
              <th scope="col" className="px-3 py-2 text-left">From (UTC)</th>
              <th scope="col" className="px-3 py-2 text-left">To (UTC)</th>
              <th scope="col" className="px-3 py-2 text-left">Sign</th>
              <th scope="col" className="px-3 py-2 text-center">H/Moon</th>
              <th scope="col" className="px-3 py-2 text-center">H/Lagna</th>
            </tr>
          </thead>
          {[...groups.entries()].map(([planet, intervals]) => (
            <tbody key={planet} className="border-b border-gray-800 last:border-b-0">
              {intervals.map((interval, index) => (
                <tr key={`${interval.start}-${interval.end}`} className="hover:bg-gray-800/30">
                  {index === 0 && (
                    <th scope="rowgroup" rowSpan={intervals.length} className="px-3 py-2 text-left align-top font-medium text-gray-100">
                      {planet}
                    </th>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-300">{formatGocharUtc(interval.start)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-300">{formatGocharUtc(interval.end)}</td>
                  <td className="px-3 py-2 text-gray-200">{interval.sign}</td>
                  <td className="px-3 py-2 text-center">{interval.houseFromMoon}</td>
                  <td className="px-3 py-2 text-center">{interval.houseFromLagna}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  )
}
