import {
  CalculationProfileUnavailableError,
  type CalculationProfile,
} from '../profiles'
import { drikLahiriProvider } from './drikLahiri'
import type { AstronomyProvider } from './types'

/** Resolve a profile to its astronomy implementation. No profile may silently fall back. */
export function resolveAstronomyProvider(profile: CalculationProfile): AstronomyProvider {
  if (profile.id === 'drik_lahiri_v1') return drikLahiriProvider
  throw new CalculationProfileUnavailableError(
    profile.id,
    'Sri Surya Siddhanta — Generalized Makaranda is defined but its standalone astronomical provider has not been implemented yet.'
  )
}

export type { AstronomyAscendant, AstronomyBody, AstronomyLongitudeSample, AstronomyProvider } from './types'
export { drikLahiriProvider } from './drikLahiri'
