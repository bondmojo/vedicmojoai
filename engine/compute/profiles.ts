/**
 * Immutable calculation-profile contracts.
 *
 * A profile is a scientific/reproducibility boundary, not a UI preference. Its
 * identifier and version are deliberately stable so later persistence work can
 * store a complete snapshot with a chart.
 */

export type CalculationProfileId =
  | 'drik_lahiri_v1'
  | 'surya_siddhanta_makaranda_v1'

export type AstronomyMethod =
  | 'swiss_ephemeris_drik'
  | 'sri_surya_siddhanta_generalized_makaranda'

export interface CalculationProfile {
  readonly id: CalculationProfileId
  readonly version: string
  readonly label: string
  readonly astronomy: AstronomyMethod
  readonly ayanamsa: 'lahiri' | 'sri_surya_siddhanta'
  readonly ayanamsaAdjustmentArcseconds: number
  readonly nodeModel: 'true' | 'mean'
  readonly houseSystem: 'whole_sign'
  readonly sunriseConvention: 'precise_astronomical' | 'jhora_6am'
  readonly vimshottari: {
    readonly seed: 'moon_janma_tara'
    readonly division: 'D1'
    readonly firstNakshatra: 'Krittika'
    readonly firstNakshatraLord: 'Sun'
    readonly direction: 'zodiacal_forward'
    readonly yearBasis: 'gregorian_mean' | 'true_sidereal_solar_revolution'
  }
  /** Stable provenance strings, not a mutable display description. */
  readonly formulaSources: readonly string[]
}

export type CalculationSettingsSnapshot = Readonly<CalculationProfile>

export const DRIK_LAHIRI_V1: CalculationProfile = Object.freeze({
  id: 'drik_lahiri_v1',
  version: '1.0.0',
  label: 'Drik — Lahiri',
  astronomy: 'swiss_ephemeris_drik',
  ayanamsa: 'lahiri',
  ayanamsaAdjustmentArcseconds: 0,
  nodeModel: 'true',
  houseSystem: 'whole_sign',
  sunriseConvention: 'precise_astronomical',
  vimshottari: Object.freeze({
    seed: 'moon_janma_tara',
    division: 'D1',
    firstNakshatra: 'Krittika',
    firstNakshatraLord: 'Sun',
    direction: 'zodiacal_forward',
    yearBasis: 'gregorian_mean',
  }),
  formulaSources: Object.freeze(['Swiss Ephemeris', 'Lahiri ayanamsa']),
})

export const SURYA_SIDDHANTA_MAKARANDA_V1: CalculationProfile = Object.freeze({
  id: 'surya_siddhanta_makaranda_v1',
  version: '1.0.0',
  label: 'Sri Surya Siddhanta — Generalized Makaranda',
  astronomy: 'sri_surya_siddhanta_generalized_makaranda',
  ayanamsa: 'sri_surya_siddhanta',
  ayanamsaAdjustmentArcseconds: 0,
  nodeModel: 'mean',
  houseSystem: 'whole_sign',
  sunriseConvention: 'precise_astronomical',
  vimshottari: Object.freeze({
    seed: 'moon_janma_tara',
    division: 'D1',
    firstNakshatra: 'Krittika',
    firstNakshatraLord: 'Sun',
    direction: 'zodiacal_forward',
    yearBasis: 'true_sidereal_solar_revolution',
  }),
  formulaSources: Object.freeze([
    'Sri Surya Siddhanta — generalized Makaranda version',
    'Sri Surya Siddhanta ayanamsa (no adjustment)',
  ]),
})

export const DEFAULT_CALCULATION_PROFILE_ID: CalculationProfileId = 'drik_lahiri_v1'

const PROFILES: Readonly<Record<CalculationProfileId, CalculationProfile>> = Object.freeze({
  drik_lahiri_v1: DRIK_LAHIRI_V1,
  surya_siddhanta_makaranda_v1: SURYA_SIDDHANTA_MAKARANDA_V1,
})

/** Raised when a runtime profile value is missing, malformed, or violates profile input rules. */
export class CalculationProfileValidationError extends Error {
  readonly code = 'CALCULATION_PROFILE_INVALID'
  readonly calculationProfile: unknown

  constructor(calculationProfile: unknown, message?: string) {
    super(message ?? `Unknown calculation profile: ${String(calculationProfile)}`)
    this.name = 'CalculationProfileValidationError'
    this.calculationProfile = calculationProfile
  }
}

/** Raised when an API asks for a known profile whose provider is not available yet. */
export class CalculationProfileUnavailableError extends Error {
  readonly code = 'CALCULATION_PROFILE_UNAVAILABLE'
  readonly calculationProfile: CalculationProfileId

  constructor(calculationProfile: CalculationProfileId, message?: string) {
    super(message ?? `Calculation profile ${calculationProfile} is not available yet.`)
    this.name = 'CalculationProfileUnavailableError'
    this.calculationProfile = calculationProfile
  }
}

/**
 * Prevents a pre-migration SSS computation from reaching legacy Drik deduplication.
 * Task 6 replaces this temporary safety boundary with persisted profile provenance
 * and profile-aware canonical identities.
 */
export class CalculationProfilePersistenceUnavailableError extends Error {
  readonly code = 'CALCULATION_PROFILE_PERSISTENCE_UNAVAILABLE'
  readonly calculationProfile: Exclude<CalculationProfileId, 'drik_lahiri_v1'>

  constructor(calculationProfile: Exclude<CalculationProfileId, 'drik_lahiri_v1'>) {
    super(
      `Calculation profile ${calculationProfile} cannot be persisted until profile-safe chart identity and provenance are available.`
    )
    this.name = 'CalculationProfilePersistenceUnavailableError'
    this.calculationProfile = calculationProfile
  }
}

export function isCalculationProfileId(value: unknown): value is CalculationProfileId {
  return value === 'drik_lahiri_v1' || value === 'surya_siddhanta_makaranda_v1'
}

/** Resolve untyped runtime input without allowing an accidental Drik fallback. */
export function resolveCalculationProfile(
  id: unknown = DEFAULT_CALCULATION_PROFILE_ID
): CalculationProfile {
  if (!isCalculationProfileId(id)) {
    throw new CalculationProfileValidationError(id)
  }
  return PROFILES[id]
}

/**
 * Return a frozen profile-owned snapshot. This is intentionally not serialized
 * or hashed here; profile-aware persistence is Task 6.
 */
export function calculationSettingsSnapshot(profile: CalculationProfile): CalculationSettingsSnapshot {
  return profile
}
