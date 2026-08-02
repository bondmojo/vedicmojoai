/**
 * BinduLegend — a static, always-visible key mapping each band a BinduChart /
 * Ashtakavarga table can render to its swatch, marker glyph, inclusive range
 * and label (R4.2, R4.3, R4.7, R4.8).
 *
 * Exactly one entry per band `bandsFor(reckoning)` returns for the given
 * reckoning, no more and no fewer — SAV has 3, BAV has 4 — and every entry is
 * visible without hover, click or expansion.
 */
import type { BinduReckoning } from '@/lib/ashtakavargaBands'
import { bandsFor } from '@/lib/ashtakavargaBands'
import { binduBandClass } from '@/lib/brandColors'

export interface BinduLegendProps {
  reckoning: BinduReckoning
}

export default function BinduLegend({ reckoning }: BinduLegendProps) {
  const bands = bandsFor(reckoning)
  const title = reckoning === 'sav' ? 'SAV bands' : 'BAV bands'

  return (
    <div className="rounded-xl border border-border bg-card p-2 shadow-sm">
      <h4 className="text-xs font-semibold text-ink mb-1">{title}</h4>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {bands.map((descriptor) => (
          <li key={descriptor.band} className="flex items-center gap-1.5 text-xs">
            <span
              aria-hidden="true"
              className={`inline-block h-3 w-3 rounded-sm ${binduBandClass(descriptor.band)}`}
            />
            <span className="text-gray-600 dark:text-gray-400">{descriptor.marker}</span>
            <span className="text-ink">{descriptor.range}</span>
            <span className="text-gray-600 dark:text-gray-400">{descriptor.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
