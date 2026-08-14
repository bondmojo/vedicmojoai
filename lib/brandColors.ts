/**
 * Brand Color Utilities
 * ---------------------
 * Extracted color-mapping constructs that were previously hardcoded in
 * DurationComputationResults.tsx. All values now reference CSS-variable-backed
 * semantic Tailwind tokens defined in tailwind.config.ts / globals.css.
 *
 * Consuming components import from here instead of maintaining their own
 * color constants, keeping a single source of truth for brand color usage.
 */

import type { BinduBand } from '@/lib/ashtakavargaBands'

// ─── Planet Colors ────────────────────────────────────────────────────────────

/**
 * Maps each Navagraha to its semantic Tailwind text color class.
 * Falls back to `text-ink` for unknown planet names.
 */
export const PLANET_COLORS: Record<string, string> = {
  Sun: 'text-planet-sun',
  Moon: 'text-planet-moon',
  Mars: 'text-planet-mars',
  Mercury: 'text-planet-mercury',
  Jupiter: 'text-planet-jupiter',
  Venus: 'text-planet-venus',
  Saturn: 'text-planet-saturn',
  Rahu: 'text-planet-rahu',
  Ketu: 'text-planet-ketu',
  Ascendant: 'text-amber-400',
}

/** Safe planet color lookup with fallback to `text-ink`. */
export function planetColorClass(planet: string): string {
  return PLANET_COLORS[planet] ?? 'text-ink'
}

// ─── Dasha Period Level Styling ───────────────────────────────────────────────

/** Fallback for unknown period levels (gray-based). */
export const DEFAULT_LEVEL_STYLE = {
  bar: 'border-t-4 border-t-gray-600',
  pill: 'bg-gray-800 text-gray-300 border-gray-700',
}

/**
 * MD/AD/PD get distinct accent colours derived from the brand tokens.
 * - MD (Mahadasha) = Indigo (brand primary)
 * - AD (Antardasha) = Teal (distinct mid-level hue)
 * - PD (Pratyantardasha) = Gold (brand accent)
 *
 * Pill backgrounds use opacity modifiers on the period token itself,
 * keeping total CSS vars to exactly 3 for period levels.
 */
export const LEVEL_STYLE: Record<string, { bar: string; pill: string }> = {
  MD: {
    bar: 'border-t-4 border-t-period-md',
    pill: 'bg-period-md/20 text-period-md border-period-md/40',
  },
  AD: {
    bar: 'border-t-4 border-t-period-ad',
    pill: 'bg-period-ad/20 text-period-ad border-period-ad/40',
  },
  PD: {
    bar: 'border-t-4 border-t-period-pd',
    pill: 'bg-period-pd/20 text-period-pd border-period-pd/40',
  },
}

// ─── Sade Sati Phase Styling ──────────────────────────────────────────────────

/**
 * Sade Sati phase → combined class string (border + bg + text).
 * Uses the 9 semantic sade-sati tokens.
 */
export const SADE_SATI_STYLE: Record<string, string> = {
  rising: 'border-sade-sati-rising-border bg-sade-sati-rising-bg text-sade-sati-rising-text',
  peak: 'border-sade-sati-peak-border bg-sade-sati-peak-bg text-sade-sati-peak-text',
  setting: 'border-sade-sati-setting-border bg-sade-sati-setting-bg text-sade-sati-setting-text',
}

// ─── Role Classification ──────────────────────────────────────────────────────

type HouseRole = 'primary' | 'benefic' | 'malefic' | string

/**
 * Returns combined bg + text + border class string for a house role chip.
 * Primary role uses golden/amber to reinforce auspiciousness.
 */
export function roleChipClass(role: HouseRole): string {
  switch (role) {
    case 'primary':
      return 'bg-role-primary-bg text-role-primary-text border-role-primary-border'
    case 'benefic':
      return 'bg-role-benefic-bg text-role-benefic-text border-role-benefic-border'
    case 'malefic':
      return 'bg-role-malefic-bg text-role-malefic-text border-role-malefic-border'
    default:
      return 'bg-role-neutral-bg text-role-neutral-text border-role-neutral-border'
  }
}

// ─── Intensity / Favorability Badges ──────────────────────────────────────────

/**
 * Returns combined class string for a scored period's intensity badge.
 * - favorable → green family
 * - unfavorable + high → red family
 * - unfavorable + medium/low → amber/cautionary family
 */
export function intensityBadgeClass(intensity: string, favorable: boolean): string {
  if (favorable) return 'text-favorable bg-favorable-muted border-favorable/40'
  if (intensity === 'high') return 'text-unfavorable bg-unfavorable-muted border-unfavorable/40'
  return 'text-cautionary bg-cautionary-muted border-cautionary/40'
}

// ─── Planet Chip (Benefic/Malefic) ────────────────────────────────────────────

/**
 * Returns class string for a planet chip indicating benefic vs malefic nature.
 * Uses the role tokens for consistency.
 */
export function planetChipClass(benefic: boolean): string {
  return benefic
    ? 'bg-role-benefic-bg text-role-benefic-text border-role-benefic-border'
    : 'bg-role-malefic-bg text-role-malefic-text border-role-malefic-border'
}

// ─── Shadbala Grade ───────────────────────────────────────────────────────────

/**
 * Returns a label and class string for a planet's shadbala strength ratio.
 * Uses semantic favorability/cautionary tokens.
 */
export function shadbalaGrade(ratio: number): { label: string; className: string } {
  if (ratio >= 1) return { label: 'Strong', className: 'text-favorable bg-favorable-muted border-favorable/40' }
  if (ratio >= 0.75) return { label: 'Average', className: 'text-cautionary bg-cautionary-muted border-cautionary/40' }
  return { label: 'Weak', className: 'text-unfavorable bg-unfavorable-muted border-unfavorable/40' }
}

// ─── Ashtakavarga Bindu Band ───────────────────────────────────────────────────

/** Four-step favourability ladder used by the Ashtakavarga bindu bands. */
export const BAND_STYLE: Record<BinduBand, string> = {
  favorable: 'text-favorable bg-favorable-muted',
  moderate: 'text-moderate bg-moderate-muted',
  cautionary: 'text-cautionary bg-cautionary-muted',
  unfavorable: 'text-unfavorable bg-unfavorable-muted',
}

/** Class string for a bindu count's band, or the unavailable style when `band` is `null` (R4.9). */
export function binduBandClass(band: BinduBand | null): string {
  if (band === null) return 'text-gray-500'
  return BAND_STYLE[band]
}

/**
 * Text-only variant of `binduBandClass` — same band colour, no `bg-*-muted`
 * box behind the digit. Used by the plain BAV/SAV numeric table, which
 * otherwise renders every cell as a small filled rectangle; the diagrams
 * (`BinduChart`) keep the boxed styling since the cell rect IS the diagram.
 */
export function binduBandTextClass(band: BinduBand | null): string {
  if (band === null) return 'text-gray-500'
  return BAND_STYLE[band].split(' ').filter((c) => c.startsWith('text-')).join(' ')
}
