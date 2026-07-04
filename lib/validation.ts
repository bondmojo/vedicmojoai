/**
 * lib/validation.ts — Zod-based validation for ChartInputV1.
 *
 * Implements all 15 hard validation rules (V1–V15) from the schema spec,
 * plus soft warning checks (W1–W6). Uses Zod for schema definition and
 * throws ChartValidationError with field-level error details on failure.
 */

import { z } from 'zod'
import { ChartValidationError } from './errors'
import type { ChartInputV1 } from './types'

// ─── Constants ──────────────────────────────────────────────────────

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const

const PLANETS = [
  'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu',
] as const

/** Map sign name → sign number (1-indexed). */
const SIGN_TO_NUMBER: Record<string, number> = Object.fromEntries(
  SIGNS.map((sign, i) => [sign, i + 1])
)

// ─── Zod Schemas ────────────────────────────────────────────────────

const SignSchema = z.enum(SIGNS)
const PlanetSchema = z.enum(PLANETS)
const GenderSchema = z.enum(['male', 'female', 'other'])

/**
 * V1: client_name must be non-empty string.
 * V2: birth_datetime must be valid ISO 8601 with timezone.
 * V3: lagna_sign must be one of the 12 zodiac signs.
 * V4: lagna_degree_decimal must be 0–30.
 */
const ChartMetaSchema = z.object({
  client_name: z.string().min(1, 'V1: client_name must be non-empty'),
  birth_datetime: z.string().refine(
    (val) => {
      // ISO 8601 with timezone: must include T separator and timezone offset or Z
      const iso8601WithTz = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
      return iso8601WithTz.test(val) && !isNaN(Date.parse(val))
    },
    { message: 'V2: birth_datetime must be valid ISO 8601 with timezone' }
  ),
  birth_place: z.string().optional(),
  gender: GenderSchema.optional(),
  system: z.string().min(1),
  lagna_sign: SignSchema,
  lagna_degree_decimal: z.number().min(0, 'V4: lagna_degree_decimal must be >= 0').max(30, 'V4: lagna_degree_decimal must be <= 30'),
  lagna_nakshatra: z.string().optional(),
  lagna_pada: z.number().int().min(1).max(4).optional(),
  source: z.string().optional(),
})

/**
 * V6: degree_decimal must be 0–30.
 * V7: house must be 1–12.
 * V8: sign_no must be 1–12.
 * V9: pada must be 1–4.
 */
const NatalPlanetSchema = z.object({
  body: PlanetSchema,
  sign: SignSchema,
  sign_no: z.number().int().min(1, 'V8: sign_no must be 1–12').max(12, 'V8: sign_no must be 1–12'),
  house: z.number().int().min(1, 'V7: house must be 1–12').max(12, 'V7: house must be 1–12'),
  degree: z.string(),
  degree_decimal: z.number().min(0, 'V6: degree_decimal must be >= 0').max(30, 'V6: degree_decimal must be <= 30'),
  nakshatra: z.string().min(1),
  pada: z.number().int().min(1, 'V9: pada must be 1–4').max(4, 'V9: pada must be 1–4'),
  notes: z.string().optional(),
})

const DivisionalHouseSchema = z.object({
  house: z.number().int().min(1).max(12),
  sign: SignSchema,
  occupants: z.array(z.string()),
})

/** V12: Each divisional chart must have exactly 12 houses with unique numbers 1–12. */
const DivisionalChartSchema = z.object({
  name: z.string().min(1),
  lagna: SignSchema.optional(),
  lagna_sign_no: z.number().int().min(1).max(12).optional(),
  houses: z.array(DivisionalHouseSchema).refine(
    (houses) => houses.length === 12,
    { message: 'V12: Divisional chart must have exactly 12 houses' }
  ).refine(
    (houses) => {
      const nums = houses.map((h) => h.house).sort((a, b) => a - b)
      return nums.length === 12 && nums.every((n, i) => n === i + 1)
    },
    { message: 'V12: Divisional chart houses must have unique numbers 1–12' }
  ),
})

const ShadbalaSixComponentsSchema = z.object({
  sthana: z.number(),
  dig: z.number(),
  kala: z.number(),
  cheshta: z.number(),
  naisargika: z.number(),
  drig: z.number(),
})

const ShadbalaEntrySchema = z.object({
  planet: z.string().optional(),
  body: z.string().optional(),
  total_shadbala_virupas: z.number().nullable().optional(),
  total: z.number().nullable().optional(),
  required: z.number().nullable().optional(),
  required_virupas: z.number().nullable().optional(),
  percent: z.string().nullable().optional(),
  ratio: z.number().nullable().optional(),
  grade: z.string().nullable().optional(),
  six_balas: ShadbalaSixComponentsSchema.optional(),
  components: ShadbalaSixComponentsSchema.optional(),
  ishta: z.number().nullable().optional(),
  kashta: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
}).passthrough()

const SignBinduSchema = z.object({
  sign_no: z.number().int().min(1).max(12),
  sign: SignSchema,
  points: z.number().int().min(0),
})

const AshtakavargaSchema = z.object({
  sarvashtakavarga: z.object({
    total: z.number(),
    by_sign: z.array(SignBinduSchema),
  }).optional(),
  sarvashtakavarga_by_house: z.array(z.object({
    house: z.number().int().min(1).max(12),
    sign: SignSchema,
    bindus: z.number().int().min(0),
  })).optional(),
  sav_total: z.number().optional(),
  individual_planet_av: z.array(z.object({
    planet: z.string(),
    by_sign: z.array(SignBinduSchema),
  })).optional(),
  pinda_strength: z.array(z.object({
    body: z.string(),
    rasi_pinda: z.number(),
    graha_pinda: z.number(),
    sodhya_pinda: z.number(),
    strength_pct: z.number(),
  })).optional(),
}).passthrough()

/**
 * V11: All 5 required divisional charts must be present.
 * V10: D1_Rasi.houses must have exactly 12 entries (covered by DivisionalChartSchema).
 */
const DivisionalChartsSchema = z.object({
  D1_Rasi: DivisionalChartSchema,
  D4_Chaturthamsa: DivisionalChartSchema,
  D9_Navamsa: DivisionalChartSchema,
  D10_Dasamsa: DivisionalChartSchema,
  D30_Trimshamsa: DivisionalChartSchema,
  D7_Saptamsa: DivisionalChartSchema.optional(),
})

/** Full ChartInputV1 Zod schema. */
const ChartInputV1Schema = z.object({
  meta: ChartMetaSchema,
  natal_nakshatras: z.array(NatalPlanetSchema),
  divisional_charts: DivisionalChartsSchema,
  shadbala: z.array(ShadbalaEntrySchema),
  ashtakavarga: AshtakavargaSchema,
  vimshottari_dasha: z.record(z.unknown()).optional(),
  special_lagnas: z.array(z.object({
    name: z.string(),
    sign: SignSchema,
    sign_no: z.number().int().min(1).max(12).optional(),
    house: z.number().int().min(1).max(12).optional(),
    degree: z.string().nullable().optional(),
    degree_decimal: z.number().nullable().optional(),
    notes: z.string().optional(),
  })).optional(),
  karakas: z.array(z.object({
    type: z.string().optional(),
    role: z.string().optional(),
    planet: z.string(),
    degree: z.string().nullable().optional(),
    degree_decimal: z.number().nullable().optional(),
    sign: SignSchema.nullable().optional(),
    signification: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })).optional(),
  karakas_chara: z.object({
    sequence: z.array(z.object({
      rank: z.number().int(),
      role: z.string(),
      planet: z.string(),
      degree_in_sign: z.number(),
      note: z.string().optional(),
    })),
    note: z.string().optional(),
  }).optional(),
  upagrahas: z.array(z.object({
    name: z.string(),
    sign: SignSchema,
    sign_no: z.number().int().min(1).max(12),
    degree: z.string().optional(),
    degree_decimal: z.number().optional(),
    house: z.number().int().min(1).max(12).optional(),
  })).optional(),
  nakshatra_disha: z.array(z.object({
    body: z.string(),
    nakshatra: z.string(),
    direction: z.string(),
  })).optional(),
  saturn_transits: z.record(z.unknown()).optional(),
  varna_charts: z.array(z.object({
    varga: z.string(),
    signification: z.string(),
    lagna_sign: SignSchema,
    note: z.string().optional(),
  })).optional(),
  outer_planets_note: z.record(z.unknown()).optional(),
})

// ─── Validation Functions ───────────────────────────────────────────

/**
 * Validates raw input data against the ChartInputV1 schema.
 *
 * Applies all 15 hard validation rules (V1–V15). On failure, throws a
 * ChartValidationError with field-level error details.
 *
 * @param data - Raw (untrusted) chart data to validate.
 * @returns The validated and typed ChartInputV1 object.
 * @throws {ChartValidationError} When any validation rule fails.
 *
 * @example
 * ```typescript
 * import { validateChartInput } from '@/lib/validation'
 *
 * try {
 *   const chart = validateChartInput(rawJson)
 *   // chart is now typed as ChartInputV1
 * } catch (err) {
 *   if (err instanceof ChartValidationError) {
 *     console.log(err.fieldErrors) // { "meta.client_name": ["V1: client_name must be non-empty"] }
 *   }
 * }
 * ```
 */
export function validateChartInput(data: unknown): ChartInputV1 {
  const fieldErrors: Record<string, string[]> = {}

  // Phase 1: Zod structural validation
  const result = ChartInputV1Schema.safeParse(data)

  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join('.')
      if (!fieldErrors[path]) {
        fieldErrors[path] = []
      }
      fieldErrors[path].push(issue.message)
    }
    throw new ChartValidationError(
      `Chart validation failed with ${result.error.issues.length} error(s)`,
      fieldErrors
    )
  }

  const chart = result.data

  // Phase 2: Semantic validation rules that Zod cannot express alone

  // V5: natal_nakshatras must contain exactly 9 entries, one for each classical planet
  if (chart.natal_nakshatras.length !== 9) {
    fieldErrors['natal_nakshatras'] = [
      `V5: natal_nakshatras must contain exactly 9 entries, got ${chart.natal_nakshatras.length}`,
    ]
  } else {
    const bodies = new Set(chart.natal_nakshatras.map((p) => p.body))
    const missingPlanets = PLANETS.filter((p) => !bodies.has(p))
    if (missingPlanets.length > 0) {
      fieldErrors['natal_nakshatras'] = [
        `V5: natal_nakshatras missing entries for: ${missingPlanets.join(', ')}`,
      ]
    }
  }

  // V8 (extended): sign_no must match the named sign
  for (let i = 0; i < chart.natal_nakshatras.length; i++) {
    const planet = chart.natal_nakshatras[i]
    const expectedSignNo = SIGN_TO_NUMBER[planet.sign]
    if (expectedSignNo && planet.sign_no !== expectedSignNo) {
      const path = `natal_nakshatras[${i}].sign_no`
      if (!fieldErrors[path]) fieldErrors[path] = []
      fieldErrors[path].push(
        `V8: sign_no ${planet.sign_no} does not match sign "${planet.sign}" (expected ${expectedSignNo})`
      )
    }
  }

  // V13: shadbala must contain at least 7 entries covering Sun through Saturn
  if (chart.shadbala.length < 7) {
    fieldErrors['shadbala'] = [
      `V13: shadbala must contain at least 7 entries, got ${chart.shadbala.length}`,
    ]
  } else {
    const classicalPlanets = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']
    const coveredPlanets = new Set(
      chart.shadbala.map((e) => e.planet || e.body).filter(Boolean)
    )
    const missingClassical = classicalPlanets.filter((p) => !coveredPlanets.has(p))
    if (missingClassical.length > 0) {
      if (!fieldErrors['shadbala']) fieldErrors['shadbala'] = []
      fieldErrors['shadbala'].push(
        `V13: shadbala missing entries for classical planets: ${missingClassical.join(', ')}`,
      )
    }
  }

  // V14: ashtakavarga must have SAV data
  const hasAshtakavargaSAV =
    chart.ashtakavarga.sarvashtakavarga != null ||
    (chart.ashtakavarga.sarvashtakavarga_by_house != null &&
      chart.ashtakavarga.sarvashtakavarga_by_house.length > 0)
  if (!hasAshtakavargaSAV) {
    fieldErrors['ashtakavarga'] = [
      'V14: ashtakavarga must have SAV data (sarvashtakavarga or sarvashtakavarga_by_house)',
    ]
  }

  // V15: Moon entry must exist in natal_nakshatras
  const hasMoon = chart.natal_nakshatras.some((p) => p.body === 'Moon')
  if (!hasMoon) {
    const key = 'natal_nakshatras.Moon'
    fieldErrors[key] = ['V15: Moon entry must exist in natal_nakshatras (required for dasha computation)']
  }

  // If any semantic errors were found, throw
  if (Object.keys(fieldErrors).length > 0) {
    const errorCount = Object.values(fieldErrors).reduce((sum, arr) => sum + arr.length, 0)
    throw new ChartValidationError(
      `Chart validation failed with ${errorCount} error(s)`,
      fieldErrors
    )
  }

  return chart as unknown as ChartInputV1
}

/**
 * Returns soft warnings (W1–W6) for an already-validated chart.
 *
 * These do not prevent chart submission but inform the practitioner
 * about limitations in the analysis due to missing optional data.
 *
 * @param chart - A validated ChartInputV1 object.
 * @returns Array of warning strings, empty if no warnings.
 *
 * @example
 * ```typescript
 * const warnings = getValidationWarnings(chart)
 * // ["W2: gender not specified — defaulting to 'male' for 2G karaka assignment"]
 * ```
 */
export function getValidationWarnings(chart: ChartInputV1): string[] {
  const warnings: string[] = []

  // W1: vimshottari_dasha present — will be ignored
  if (chart.vimshottari_dasha != null) {
    warnings.push(
      'W1: vimshottari_dasha is present in input — it will be ignored (engine computes authoritative dasha tree)'
    )
  }

  // W2: gender absent — defaults to 'male'
  if (!chart.meta.gender) {
    warnings.push(
      "W2: meta.gender not specified — defaulting to 'male' for karaka assignment in marriage analysis (2G)"
    )
  }

  // W3: saturn_transits present — may be stale
  if (chart.saturn_transits != null) {
    warnings.push(
      'W3: saturn_transits data is present — note this is time-dependent and may be stale'
    )
  }

  // W4: special_lagnas absent — UL-based marriage analysis limited
  if (!chart.special_lagnas || chart.special_lagnas.length === 0) {
    warnings.push(
      'W4: special_lagnas absent — Upapada Lagna (UL) based marriage analysis in 2G will be limited'
    )
  }

  // W5: D7_Saptamsa absent — progeny analysis unavailable
  if (!chart.divisional_charts.D7_Saptamsa) {
    warnings.push(
      'W5: D7_Saptamsa divisional chart absent — progeny analysis in 2G will be unavailable'
    )
  }

  // W6: individual_planet_av absent — per-planet house strength unavailable
  if (
    !chart.ashtakavarga.individual_planet_av ||
    chart.ashtakavarga.individual_planet_av.length === 0
  ) {
    warnings.push(
      'W6: individual_planet_av absent in ashtakavarga — per-planet house strength unavailable for 2B analysis'
    )
  }

  return warnings
}
