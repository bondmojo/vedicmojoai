/**
 * KeyDignitiesPanel — the "Key Dignities" card on the Summary tab (R1 + R2),
 * extracted out of `ChartSummaryTab.tsx`.
 *
 * Three chip families, all sharing the same accessible-disclosure pattern
 * (native `<button type="button" aria-describedby>` + a hidden `sr-only`
 * reason span + a hover/focus popover mirroring it, matching
 * `GrahasTable.tsx`'s `KarakaCell`):
 *
 *   - Dignity chips  — read the currently-selected division's `dignity` label
 *     (`selectedDivision`, not always D1), skipping `neutral`/`friend`/
 *     `great_friend` and Rahu/Ketu, exactly as the pre-extraction inline card
 *     did. The reason sentence comes from `getVargaDignityReason`, called
 *     with the SAME `degreeInSign` the label was computed with: the D1 degree
 *     from the matching `planets[]` row, passed only when `selectedDivision`
 *     is D1 — mirroring `divisional.ts`'s `varga.division === 1` guard.
 *   - Vargottama chips — read the selected division's `vargottama` flag
 *     (never set for D1 itself, so this family is naturally empty when D1 is
 *     selected). The reason sentence is the local `vargottamaReasonText`,
 *     since it needs the division's display name — presentation data that
 *     does not belong in `engine/compute/dignity.ts`.
 *   - Combustion chips — one per `combustion[]` entry, built from the design's
 *     label-assembly table, ordered by ascending `degreeFromSun` with a
 *     stable sort (source order preserved on ties). Omitted entirely when
 *     `combustion` is absent or not an array (R1.6).
 *
 * Spec: .kiro/specs/chart-ui-enhancements/ — design.md "R1 + R2 —
 * KeyDignitiesPanel".
 */
'use client'

import type { ReactNode } from 'react'
import type { PlanetPosition, DivisionalChart, CombustionResult } from '@/engine/compute/types'
import { getVargaDignityReason, type DignityLabel } from '@/engine/compute/dignity'
import { planetColorClass } from '@/lib/brandColors'
import { SectionUnavailable } from './SectionUnavailable'
import { guardSection } from './sectionGuards'

/** Structurally identical to the engine's D1 planet row; aliased to match design.md's naming. */
export type PlanetRow = PlanetPosition

export interface KeyDignitiesPanelProps {
  planets: PlanetRow[]
  divisionalCharts: DivisionalChart[]
  /** Division currently selected on the Summary tab; dignity/vargottama chips read this varga. */
  selectedDivision: number
  /** Undefined / malformed → dignity + vargottama chips still render, combustion chips omitted (R1.6). */
  combustion?: CombustionResult[]
}

// ─── Shared chip primitive (button + sr-only reason + hover/focus popover) ──

interface ChipProps {
  idBase: string
  className: string
  label: ReactNode
  reason: string
}

function Chip({ idBase, className, label, reason }: ChipProps) {
  const reasonId = `${idBase}-reason`
  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-describedby={reasonId}
        className={`peer text-[11px] px-2 py-1 rounded-md border ${className}`}
      >
        {label}
      </button>
      <span id={reasonId} className="sr-only">
        {reason}
      </span>
      <span
        role="presentation"
        className="invisible absolute left-1/2 top-full z-10 mt-1 w-64 -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1.5 text-left text-xs font-normal normal-case text-popover-foreground shadow-md peer-hover:visible peer-focus-visible:visible"
      >
        {reason}
      </span>
    </span>
  )
}

// ─── Dignity chips ────────────────────────────────────────────────────

const DIGNITY_CHIP_LABEL: Partial<Record<DignityLabel, string>> = {
  exalted: '⬆ Exalted',
  debilitated: '⬇ Debilitated',
  own: '◆ Own',
  moolatrikona: '◆ MK',
  enemy: '↓ Enemy',
  great_enemy: '⬇ Gt.Enemy',
}

/** Dignity labels the panel never turns into a chip — unchanged from the pre-extraction filter. */
const SKIPPED_DIGNITY_LABELS = new Set<DignityLabel>(['neutral', 'friend', 'great_friend'])

function dignityChipClass(dignity: DignityLabel): string {
  return dignity === 'exalted' || dignity === 'own' || dignity === 'moolatrikona'
    ? 'bg-favorable-muted text-favorable border-favorable/30'
    : 'bg-unfavorable-muted text-unfavorable border-unfavorable/30'
}

// ─── Vargottama chips ─────────────────────────────────────────────────

/**
 * Local reason text for a Vargottama chip (R2.4). Not in `dignity.ts` — it
 * needs the division's display name, which is presentation data.
 */
function vargottamaReasonText(divisionShortName: string, vargaSign: string, d1Sign: string): string {
  return `Vargottama in ${divisionShortName}: ${vargaSign} here matches the D1 sign ${d1Sign}.`
}

// ─── Combustion chips ─────────────────────────────────────────────────

/** Rounds half away from zero to one fractional digit, retaining the trailing zero ("0.0"). */
function roundHalfAwayFromZero1(v: number): string {
  const scaled = Math.round(Math.abs(v) * 10 + Number.EPSILON) / 10
  return (v < 0 ? -scaled : scaled).toFixed(1)
}

/** The combustion chip's label-assembly table (design.md), as an ordered list of text fragments. */
function combustionChipParts(entry: CombustionResult): string[] {
  const parts: string[] = []
  if (entry.combust && entry.cazimi) parts.push('Combust · Cazimi')
  else if (entry.combust) parts.push('Combust')
  else if (entry.nearCombust) parts.push('Near combust')
  // Emitted under no other condition (R1.5) — additive to whatever base text above produced.
  if (entry.moonStrictCombust === true) parts.push('Combust (8° strict)')
  return parts
}

function combustionChipClass(entry: CombustionResult): string {
  // Cazimi's favourable styling takes precedence over ordinary combust styling.
  if (entry.combust && entry.cazimi) return 'bg-favorable-muted text-favorable border-favorable/30'
  if (entry.combust || entry.moonStrictCombust) return 'bg-unfavorable-muted text-unfavorable border-unfavorable/30'
  return 'bg-cautionary-muted text-cautionary border-cautionary/30'
}

/** `"{deg}° of {threshold}°"` when both are finite, else the "separation unavailable" marker (R1.10). */
function combustionSeparationText(entry: CombustionResult): string {
  return Number.isFinite(entry.degreeFromSun) && Number.isFinite(entry.threshold)
    ? `${roundHalfAwayFromZero1(entry.degreeFromSun)}° of ${entry.threshold}°`
    : 'separation unavailable'
}

// ─── Component ────────────────────────────────────────────────────────

export default function KeyDignitiesPanel({
  planets,
  divisionalCharts,
  selectedDivision,
  combustion,
}: KeyDignitiesPanelProps) {
  // Root-prop guard (R8.1). The test is `Array.isArray`, NOT `isNonEmptyArray`: the
  // three chip families are independent, and the combustion family is built from
  // `combustion[]` alone. An empty `planets` array is therefore a legitimate input
  // that yields no dignity/vargottama chips while combustion chips still render —
  // the mirror of R1.6, which requires the reverse. Only a non-array `planets` (null,
  // undefined, an object, a primitive) makes the card unrenderable.
  const planetRows = guardSection<PlanetRow[]>(planets, (v): v is PlanetRow[] => Array.isArray(v))
  if (!planetRows.ok) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Key Dignities</h3>
        <SectionUnavailable section="Key Dignities" />
      </div>
    )
  }

  const rows = planetRows.data
  const selectedChart = Array.isArray(divisionalCharts)
    ? divisionalCharts.find((c) => c.division === selectedDivision)
    : undefined

  // D1 sign-by-planet map for the compound-maitri reason derivation — `planets`
  // IS the D1 (rasi) row list, exactly what `divisional.ts`'s `buildD1SignMap` builds.
  const d1SignByPlanet: Record<string, number> = {}
  for (const p of rows) d1SignByPlanet[p.planet] = p.signNumber

  const dignityChips = rows
    .filter((p) => p.planet !== 'Rahu' && p.planet !== 'Ketu')
    .map((p) => {
      const placement = selectedChart?.planets?.find((cp) => cp.planet === p.planet)
      if (!placement) return null
      const dignity = placement.dignity
      if (!dignity || SKIPPED_DIGNITY_LABELS.has(dignity)) return null
      const chipLabel = DIGNITY_CHIP_LABEL[dignity]
      if (!chipLabel) return null

      const reason = getVargaDignityReason(
        p.planet,
        placement.signNumber,
        d1SignByPlanet,
        selectedDivision === 1 ? p.degreeInSign : undefined
      )

      return (
        <Chip
          key={`dig-${p.planet}`}
          idBase={`dignity-${p.planet}`}
          className={dignityChipClass(dignity)}
          label={
            <>
              <span className={planetColorClass(p.planet)}>{p.planet}</span> {chipLabel}
            </>
          }
          reason={reason?.text ?? `${p.planet}: ${dignity}.`}
        />
      )
    })

  const vargottamaChips = selectedChart
    ? rows.map((p) => {
        const placement = selectedChart.planets?.find((cp) => cp.planet === p.planet)
        if (!placement?.vargottama) return null
        const d1Row = rows.find((dp) => dp.planet === p.planet)

        return (
          <Chip
            key={`vg-${p.planet}`}
            idBase={`vargottama-${p.planet}`}
            className="bg-gold-900/20 text-gold-400 border-gold-700/30"
            label={
              <>
                <span className={planetColorClass(p.planet)}>{p.planet}</span> Vargottama
              </>
            }
            reason={vargottamaReasonText(selectedChart.shortName, placement.sign, d1Row?.sign ?? '')}
          />
        )
      })
    : []

  const combustionChips = Array.isArray(combustion)
    ? [...combustion]
        .sort((a, b) => a.degreeFromSun - b.degreeFromSun) // stable — ties keep source order
        .map((entry) => {
          const parts = combustionChipParts(entry)
          if (parts.length === 0) return null // R1.9

          const separation = combustionSeparationText(entry)

          return (
            <Chip
              key={`comb-${entry.planet}`}
              idBase={`combustion-${entry.planet}`}
              className={combustionChipClass(entry)}
              label={
                <>
                  <span className={planetColorClass(entry.planet)}>{entry.planet}</span>{' '}
                  {parts.join(' · ')} · {separation}
                </>
              }
              reason={`${entry.planet}: ${parts.join(', ')} — separation from the Sun ${separation}.`}
            />
          )
        })
    : []

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Key Dignities</h3>
      <div className="flex flex-wrap gap-2">
        {dignityChips}
        {vargottamaChips}
        {combustionChips}
      </div>
    </div>
  )
}
