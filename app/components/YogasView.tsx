/**
 * YogasView — the new Yogas tab (R7): renders the deterministic named-yoga catalogue
 * (`chart.yogas`, `engine/compute/yogas.ts`) grouped by category.
 *
 * Every entry's name, category, planets, houses, benefic disposition and strength grade are
 * rendered as text alongside colour — nothing truncated or paginated, entry count always equals
 * `yogas.length` (R7.2, R7.3, R7.8). The rest of the evidence (`rule`, `notes`, `ownedHouses`,
 * `dignity`, `linkage`) sits behind a native `<details>`/`<summary>` disclosure rather than the
 * repo's Radix `Accordion`, so the Enter/Space toggle and the exposed state come from the platform
 * (R7.6).
 *
 * Spec: .kiro/specs/chart-ui-enhancements/
 */
'use client'

import { useState } from 'react'
import type { Yoga, YogaEvidence } from '@/engine/compute/types'
import { planetChipClass, planetColorClass } from '@/lib/brandColors'
import { SectionUnavailable } from './SectionUnavailable'
import { guardSection } from './sectionGuards'
import { groupYogas } from './yogaGrouping'

export interface YogasViewProps {
  /** Absent on charts computed before the yoga engine, or on paste-path charts (R7.12). */
  yogas?: Yoga[]
}

/** Human-readable category header text, e.g. "neechabhanga" -> "Neechabhanga". */
function categoryLabel(category: string): string {
  return category
    .split(', ')
    .map((c) => (c.length > 0 ? c[0].toUpperCase() + c.slice(1) : c))
    .join(', ')
}

/** Strength grade -> display text + colour class, text always rendered alongside colour (R7.8). */
const STRENGTH_STYLE: Record<Yoga['strength'], { label: string; className: string }> = {
  strong: { label: 'Strong', className: 'text-favorable bg-favorable-muted border-favorable/40' },
  moderate: { label: 'Moderate', className: 'text-cautionary bg-cautionary-muted border-cautionary/40' },
  weak: { label: 'Weak', className: 'text-unfavorable bg-unfavorable-muted border-unfavorable/40' },
}

/** `evidence.afflictions[].kind` -> display text (R7.5). */
const AFFLICTION_KIND_LABEL: Record<string, string> = {
  combust: 'Combust',
  debilitated: 'Debilitated',
  nodal: 'Nodal',
}

/**
 * Native `<details>`/`<summary>` disclosure for the remaining evidence fields (`rule`, `notes`,
 * `ownedHouses`, `dignity`, `linkage`). The summary text itself switches between "Show evidence"
 * and "Hide evidence" so the collapsed/expanded state is a Non_Colour_Signal (R7.6), which requires
 * local state since native `<details>` alone does not expose its open state as text.
 */
function EvidenceDetails({ evidence }: { evidence: YogaEvidence }) {
  const [open, setOpen] = useState(false)

  const ownedHousesEntries = evidence.ownedHouses ? Object.entries(evidence.ownedHouses) : []
  const dignityEntries = evidence.dignity ? Object.entries(evidence.dignity) : []

  return (
    <details
      className="mt-2 text-xs"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer text-gray-400 hover:text-ink select-none">
        {open ? 'Hide evidence' : 'Show evidence'}
      </summary>
      <div className="mt-2 space-y-2 pl-3 border-l border-gray-700 text-gray-400">
        <p>
          <span className="text-gray-500">Rule: </span>
          {evidence.rule}
        </p>
        {evidence.linkage && (
          <p>
            <span className="text-gray-500">Linkage: </span>
            {evidence.linkage}
          </p>
        )}
        {ownedHousesEntries.length > 0 && (
          <div>
            <span className="text-gray-500">Owned houses: </span>
            <ul className="list-none">
              {ownedHousesEntries.map(([planet, houses]) => (
                <li key={planet}>
                  <span className={planetColorClass(planet)}>{planet}</span>: {houses.join(', ')}
                </li>
              ))}
            </ul>
          </div>
        )}
        {dignityEntries.length > 0 && (
          <div>
            <span className="text-gray-500">Dignity: </span>
            <ul className="list-none">
              {dignityEntries.map(([planet, dignity]) => (
                <li key={planet}>
                  <span className={planetColorClass(planet)}>{planet}</span>: {dignity}
                </li>
              ))}
            </ul>
          </div>
        )}
        {evidence.notes && evidence.notes.length > 0 && (
          <div>
            <span className="text-gray-500">Notes: </span>
            <ul className="list-disc list-inside">
              {evidence.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}

function YogaEntryCard({ yoga }: { yoga: Yoga }) {
  const strengthStyle = STRENGTH_STYLE[yoga.strength] ?? STRENGTH_STYLE.weak
  const afflictions = yoga.evidence?.afflictions ?? []
  const activatingPlanets = yoga.activatingPlanets ?? []

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <h4 className="text-sm font-semibold text-ink">{yoga.name}</h4>
          <p className="text-xs text-gray-500">{yoga.category}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${planetChipClass(yoga.benefic)}`}
          >
            {yoga.benefic ? 'Benefic' : 'Malefic'}
          </span>
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${strengthStyle.className}`}
          >
            {strengthStyle.label}
          </span>
          {afflictions.length > 0 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border text-unfavorable bg-unfavorable-muted border-unfavorable/40">
              {`Afflicted (${afflictions.length})`}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-400">
        <p>
          <span className="text-gray-500">Planets: </span>
          {yoga.planets.map((p, i) => (
            <span key={p}>
              {i > 0 && ', '}
              <span className={planetColorClass(p)}>{p}</span>
            </span>
          ))}
        </p>
        <p>
          <span className="text-gray-500">Houses: </span>
          {yoga.houses.join(', ')}
        </p>
      </div>

      <p className="mt-2 text-xs text-gray-400">
        <span className="text-gray-500">Activating dashas: </span>
        {activatingPlanets.length > 0
          ? activatingPlanets.map((p, i) => (
              <span key={p}>
                {i > 0 && ', '}
                <span className={planetColorClass(p)}>{p}</span>
              </span>
            ))
          : 'None recorded'}
      </p>

      {afflictions.length > 0 && (
        <div className="mt-2 text-xs">
          <span className="text-gray-500">Afflictions: </span>
          <ul className="list-disc list-inside text-gray-400">
            {afflictions.map((a, i) => (
              <li key={i}>
                <span className={planetColorClass(a.planet)}>{a.planet}</span>
                {' — '}
                {AFFLICTION_KIND_LABEL[a.kind] ?? a.kind}
                {a.detail ? ` (${a.detail})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {yoga.evidence && <EvidenceDetails evidence={yoga.evidence} />}
    </div>
  )
}

export default function YogasView({ yogas }: YogasViewProps) {
  // Absent, null or not an array -> the catalogue is unavailable (R7.12, R8.1).
  // Present but empty is a DIFFERENT message (R7.9) — no yoga was detected, which
  // is a finding about the chart rather than missing data.
  const catalogue = guardSection<Yoga[]>(yogas, (v): v is Yoga[] => Array.isArray(v))
  if (!catalogue.ok) {
    return <SectionUnavailable section="Named yoga catalogue" />
  }

  if (catalogue.data.length === 0) {
    return <p className="text-sm text-gray-500">No named yogas were detected for this chart.</p>
  }

  const detected = catalogue.data
  const groups = groupYogas(detected)

  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-500">
        {detected.length} {detected.length === 1 ? 'yoga' : 'yogas'} detected across {groups.length}{' '}
        {groups.length === 1 ? 'category' : 'categories'}.
      </p>
      {groups.map((group) => (
        <div key={group.category} className="space-y-3">
          <h3 className="text-sm font-semibold text-ink border-b border-gray-700 pb-1">
            {categoryLabel(group.category)}{' '}
            <span className="text-gray-500 font-normal">({group.yogas.length})</span>
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {group.yogas.map((yoga) => (
              <YogaEntryCard key={yoga.key} yoga={yoga} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
