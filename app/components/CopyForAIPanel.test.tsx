/**
 * CopyForAIPanel birth-info payload tests (Requirement 8.2).
 *
 * The payload builder is pure, so the nullable place-selection contract can be
 * verified without a DOM renderer.
 */

import { describe, expect, it } from 'vitest'
import { buildPayload, type CopyForAIForm } from './CopyForAIPanel'

const BASE_FORM: CopyForAIForm = {
  name: 'Test Client',
  date: '1990-01-01',
  time: '12:00',
  timezone: '5.5',
  latitude: '18.6772446',
  longitude: '73.8981129',
  placeId: null,
  placeLabel: '',
  sunriseMode: 'precise',
}

function buildBirthInfo(form: CopyForAIForm): Record<string, unknown> {
  return buildPayload(
    new Set(['birth_info']),
    {},
    {},
    undefined,
    form,
    [],
  ).birth_info as Record<string, unknown>
}

describe('CopyForAIPanel — birth location payload', () => {
  it('omits place metadata for manually entered coordinates', () => {
    const birthInfo = buildBirthInfo(BASE_FORM)

    expect(birthInfo).toMatchObject({
      latitude: 18.6772446,
      longitude: 73.8981129,
    })
    expect(birthInfo).not.toHaveProperty('birth_place')
  })

  it('includes the selected place label only when a picker selection is active', () => {
    const birthInfo = buildBirthInfo({
      ...BASE_FORM,
      placeId: 'place-alandi',
      placeLabel: 'Alandi, Khed, Maharashtra',
    })

    expect(birthInfo.birth_place).toBe('Alandi, Khed, Maharashtra')
  })
})
