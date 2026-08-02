/**
 * SadeSatiPanel — renders both Sade Sati readings (sign-based and degree-based)
 * side by side, extracted from TransitsView's `sadesati` sub-tab (R6).
 *
 * The two readings no longer carry the same members, so the two groups render
 * different row shapes: the sign-based group keeps the phase chip
 * (`rising`/`peak`/`setting`) the existing UI already has, while the
 * degree-based group leads with the sequence number and carries no phase at
 * all, since the ±45° window has no rising/peak/setting subdivision.
 */

import type { DegreeSadeSatiInfo, DegreeSadeSatiPeriod, SadeSatiInfo, SadeSatiPeriod } from '@/engine/compute/types'
import { SADE_SATI_STYLE } from '@/lib/brandColors'
import { SectionUnavailable } from './SectionUnavailable'
import { guardSection, isPlainObject } from './sectionGuards'

export interface SadeSatiPanelProps {
  /** Existing sign-based reading — shape untouched. */
  signBased: SadeSatiInfo
  /** Degree-based reading; absent on charts computed before the addition (R6.20). */
  degreeBased?: DegreeSadeSatiInfo
  /** The instant the pane uses for transit positions — `TransitAnalysis.asOf`. */
  asOf: string
  birthDate?: string
}

/**
 * Formats a fractional day count as "{years}y {days}d" (e.g. "7y 88d").
 *
 * The year length is a display convention, not something the engine should
 * freeze into stored JSON (see design.md, "Why durations are numbers"), so it
 * is picked here: 365.25 days/year, the average Gregorian year length, the
 * same convention the design's own discussion of this formatter uses.
 */
function formatSpan(durationDays: number): string {
  const DAYS_PER_YEAR = 365.25
  const years = Math.floor(durationDays / DAYS_PER_YEAR)
  const days = Math.round(durationDays - years * DAYS_PER_YEAR)
  return `${years}y ${days}d`
}

function fmtAsOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Text badge for a row's current/non-current state — a Non_Colour_Signal (R6.17, R6.18). */
function CurrentBadge({ isCurrent }: { isCurrent: boolean }) {
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded ${
        isCurrent ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-400'
      }`}
    >
      {isCurrent ? 'CURRENT' : 'Not current'}
    </span>
  )
}

function SignBasedRow({ period }: { period: SadeSatiPeriod }) {
  return (
    <div
      aria-current={period.isCurrent ? 'true' : undefined}
      className={`px-4 py-3 flex items-center justify-between ${
        period.isCurrent ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'opacity-60'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded border ${
            SADE_SATI_STYLE[period.phase] ?? 'border-gray-600 text-gray-400'
          }`}
        >
          {period.phase.toUpperCase()}
        </span>
        <span className="text-sm text-gray-300">
          Saturn in <span className="text-ink font-medium">{period.phaseSign}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">
          {period.startApprox} – {period.endApprox}
        </span>
        <CurrentBadge isCurrent={period.isCurrent} />
      </div>
    </div>
  )
}

function DegreeBasedRow({ period }: { period: DegreeSadeSatiPeriod }) {
  return (
    <div
      aria-current={period.isCurrent ? 'true' : undefined}
      className={`px-4 py-3 ${period.isCurrent ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'opacity-60'}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-gray-500">#{period.sequence}</span>
          <span className="text-sm text-gray-300">
            {period.startApprox} – {period.endApprox}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-mono">{formatSpan(period.durationDays)}</span>
          <CurrentBadge isCurrent={period.isCurrent} />
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-1">{period.label}</p>
      {period.isCurrent && period.completionPct !== undefined && (
        <p className="text-xs text-indigo-700 dark:text-indigo-400 mt-1">{period.completionPct}% elapsed</p>
      )}
      {!period.isCurrent && period.startsInDays !== undefined && (
        <p className="text-xs text-gray-500 mt-1">starts in {Math.round(period.startsInDays)} days</p>
      )}
    </div>
  )
}

export default function SadeSatiPanel({ signBased, degreeBased, asOf, birthDate }: SadeSatiPanelProps) {
  // Each reading is guarded independently, so a malformed one replaces only its
  // own group and leaves the other rendering (R8.1). `degreeBased` already had
  // this per-group treatment for the absent case (R6.20); this extends the same
  // handling to the sign-based group and to null / wrongly-typed values.
  const sign = guardSection<SadeSatiInfo>(signBased, isPlainObject)
  const degree = guardSection<DegreeSadeSatiInfo>(degreeBased, isPlainObject)

  const birthYearRaw = birthDate ? new Date(birthDate).getFullYear() : undefined
  const birthYear = Number.isFinite(birthYearRaw) ? birthYearRaw : undefined

  // Birth-year exclusion (R6.21): sign-based keeps the existing
  // `endApprox.split(' ').pop()` year parse verbatim.
  const signPeriods = (sign.ok && Array.isArray(sign.data.allPeriods) ? sign.data.allPeriods : []).filter((p) => {
    if (birthYear === undefined) return true
    const endYear = parseInt(p.endApprox.split(' ').pop() ?? '9999')
    return endYear >= birthYear
  })

  // Degree-based carries real ISO instants, so the exclusion is exact rather
  // than a string parse. Sequence numbers are NOT renumbered after filtering —
  // they are horizon-relative (R6.6), so the first displayed row is usually
  // not #1.
  const degreePeriods = (degree.ok && Array.isArray(degree.data.allPeriods) ? degree.data.allPeriods : []).filter((p) => {
    if (birthYear === undefined) return true
    return new Date(p.end).getUTCFullYear() >= birthYear
  })

  // Divergence line (R6.19): the two readings disagree on whether Sade Sati
  // is currently active. Only computable when both readings are present.
  const signActive = sign.ok ? sign.data.active : undefined
  const degreeActive = degree.ok ? degree.data.active : undefined
  const divergent =
    signActive !== undefined && degreeActive !== undefined && signActive !== degreeActive
  const divergenceText = !divergent
    ? null
    : signActive
      ? `Readings disagree: the sign-based reading reports Sade Sati running${
          sign.ok && sign.data.phase ? ` (${sign.data.phase} phase)` : ''
        }; the degree-based reading does not.`
      : `Readings disagree: the degree-based reading reports Sade Sati running; the sign-based reading does not.`

  const asOfText = typeof asOf === 'string' && !Number.isNaN(new Date(asOf).getTime())
    ? fmtAsOf(asOf)
    : null

  return (
    <div className="space-y-4">
      {asOfText && <p className="text-xs text-gray-500">As of {asOfText}</p>}

      {divergenceText && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-4 py-3">
          <p className="text-xs text-amber-800 dark:text-amber-400">{divergenceText}</p>
        </div>
      )}

      {/* ── Sign-based group ── */}
      <div className="rounded-lg border border-gray-700 overflow-hidden">
        <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold">
            Sign-based — Saturn through the 12th, 1st and 2nd sign from the natal Moon
          </h3>
        </div>
        {sign.ok ? (
          <div className="divide-y divide-gray-800">
            {signPeriods.map((p, i) => (
              <SignBasedRow key={i} period={p} />
            ))}
            {signPeriods.length === 0 && (
              <p className="px-4 py-4 text-sm text-gray-500">No Sade Sati periods in lifetime.</p>
            )}
          </div>
        ) : (
          <div className="px-4 py-4">
            <SectionUnavailable section="Sign-based Sade Sati" />
          </div>
        )}
      </div>

      {/* ── Degree-based group ── */}
      <div className="rounded-lg border border-gray-700 overflow-hidden">
        <div className="bg-gray-800/50 px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold">
            Degree-based — Saturn within 45° of the natal Moon&apos;s sidereal longitude
          </h3>
        </div>
        {degree.ok ? (
          <div className="divide-y divide-gray-800">
            {degreePeriods.map((p) => (
              <DegreeBasedRow key={p.sequence} period={p} />
            ))}
            {degreePeriods.length === 0 && (
              <p className="px-4 py-4 text-sm text-gray-500">No Sade Sati periods in lifetime.</p>
            )}
          </div>
        ) : (
          <div className="px-4 py-4">
            <SectionUnavailable section="Degree-based Sade Sati" />
          </div>
        )}
      </div>
    </div>
  )
}
