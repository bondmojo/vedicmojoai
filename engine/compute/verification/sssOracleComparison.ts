import type {
  SssDashaLevel,
  SssFixture,
  SssFixtureDashaPeriod,
} from '../__fixtures__/suryaSiddhantaMakaranda'

export const SSS_ORACLE_ACCEPTANCE_TOLERANCES = Object.freeze({
  natalArcseconds: 1,
  seededMahadashaSeconds: 1,
  endToEndMoonToDashaHours: 4,
  fixedYearDaysDifferentialHours: 60,
})

export type SssOracleCheckStatus =
  | 'pass'
  | 'fail'
  | 'candidate_missing'
  | 'oracle_missing'

export interface SssCandidateBirthInput {
  readonly date: string
  readonly time: string
  readonly timezone: number
  readonly latitude: number
  readonly longitude: number
}

export interface SssCandidateLongitude {
  readonly body: string
  readonly longitude: number
  readonly nakshatra?: string
  readonly pada?: number
  readonly retrograde?: boolean
}

export interface SssCandidatePoint {
  readonly name: string
  readonly longitude: number
}

export interface SssCandidateDashaPeriod {
  readonly level: SssDashaLevel
  readonly parentLord?: string | null
  readonly lord: string
  readonly start: string
  readonly end: string
}

export interface SssCandidateDivisionalChart {
  readonly division: number
  readonly lagnaSign?: number
  readonly placements?: Readonly<Record<string, number>>
}

export interface SssCandidateProvenance {
  /** Versioned constants/equation set, never a label inferred from oracle output. */
  readonly parameterSetId: string
  /** Page/equation-level source IDs supporting the candidate calculation. */
  readonly formulaSourceIds: readonly string[]
}

/**
 * Normalized output accepted by the development-only PVR/JHora comparison
 * harness. Production chart output needs an explicit adapter into this shape;
 * the oracle comparator is never called by a runtime route.
 */
export interface SssOracleCandidate {
  readonly fixtureId: SssFixture['id']
  readonly candidateKind: 'research_prototype' | 'production_provider'
  readonly targetProfile: string
  /** Required only for a production-provider candidate. */
  readonly calculationProfile?: string
  readonly implementationId: string
  readonly provenance: SssCandidateProvenance
  readonly birth?: SssCandidateBirthInput
  readonly natal?: readonly SssCandidateLongitude[]
  readonly upagrahas?: readonly SssCandidatePoint[]
  readonly specialLagnas?: readonly SssCandidatePoint[]
  readonly additionalPoints?: readonly SssCandidatePoint[]
  readonly ayanamsa?: number
  readonly divisionalCharts?: readonly SssCandidateDivisionalChart[]
  readonly mahadasha?: readonly SssCandidateDashaPeriod[]
  readonly antardasha?: readonly SssCandidateDashaPeriod[]
  readonly pratyantardasha?: readonly SssCandidateDashaPeriod[]
}

export interface SssOracleDelta {
  readonly value: number
  readonly absoluteValue: number
  readonly unit: 'arcseconds' | 'seconds' | 'degrees'
}

export interface SssOracleTolerance {
  readonly value: number
  readonly unit: SssOracleDelta['unit']
}

export interface SssOracleCheck {
  readonly category: 'identity' | 'birth' | 'natal' | 'point' | 'ayanamsa' | 'varga' | 'dasha'
  readonly key: string
  readonly status: SssOracleCheckStatus
  readonly expected?: string | number | boolean
  readonly actual?: string | number | boolean
  readonly delta?: SssOracleDelta
  readonly tolerance?: SssOracleTolerance
  readonly evidence: string
  readonly note?: string
}

export interface SssOracleComparisonReport {
  readonly fixtureId: SssFixture['id']
  readonly implementationId: string
  readonly candidateKind: SssOracleCandidate['candidateKind']
  readonly targetProfile: string
  readonly calculationProfile?: string
  readonly outcome: 'pass' | 'fail' | 'incomplete' | 'partial'
  readonly releaseEligible: boolean
  readonly summary: Readonly<Record<SssOracleCheckStatus, number>>
  readonly checks: readonly SssOracleCheck[]
}

const PROFILE_ID = 'surya_siddhanta_makaranda_v1'
const EXACT_NUMBER_TOLERANCE = 1e-12
const COMPARISON_EPSILON = 1e-8

const NAKSHATRA_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  asresha: 'ashlesha',
  ashlesha: 'ashlesha',
  visakha: 'vishakha',
  vishakha: 'vishakha',
})

function shortestSignedLongitudeDelta(actual: number, expected: number): number {
  const delta = ((actual - expected + 540) % 360) - 180
  return Object.is(delta, -0) ? 0 : delta
}

function longitudeCheck(
  category: SssOracleCheck['category'],
  key: string,
  evidence: string,
  expected: number,
  actual: number | undefined
): SssOracleCheck {
  const tolerance = SSS_ORACLE_ACCEPTANCE_TOLERANCES.natalArcseconds
  if (actual === undefined) {
    return {
      category,
      key,
      status: 'candidate_missing',
      expected,
      evidence,
      tolerance: { value: tolerance, unit: 'arcseconds' },
    }
  }
  const deltaArcseconds = shortestSignedLongitudeDelta(actual, expected) * 3_600
  return {
    category,
    key,
    status: Math.abs(deltaArcseconds) <= tolerance + COMPARISON_EPSILON ? 'pass' : 'fail',
    expected,
    actual,
    delta: {
      value: deltaArcseconds,
      absoluteValue: Math.abs(deltaArcseconds),
      unit: 'arcseconds',
    },
    tolerance: { value: tolerance, unit: 'arcseconds' },
    evidence,
  }
}

function semanticNakshatraCheck(
  key: string,
  evidence: string,
  expected: string,
  actual: string | undefined
): SssOracleCheck {
  if (actual === undefined) {
    return { category: 'natal', key, status: 'candidate_missing', expected, evidence }
  }
  const normalize = (value: string): string => {
    const token = value.toLowerCase().replaceAll(/[^a-z]/g, '')
    return NAKSHATRA_ALIASES[token] ?? token
  }
  return {
    category: 'natal',
    key,
    status: normalize(actual) === normalize(expected) ? 'pass' : 'fail',
    expected,
    actual,
    evidence,
    note: actual === expected ? undefined : 'Compared through the explicit JHora/engine spelling-alias map.',
  }
}

function uniquenessCheck(
  category: SssOracleCheck['category'],
  key: string,
  evidence: string,
  values: readonly string[] | undefined
): SssOracleCheck {
  if (values === undefined) {
    return { category, key, status: 'candidate_missing', expected: 'unique entries', evidence }
  }
  const duplicates = [...new Set(values.filter((value, index) => values.indexOf(value) !== index))]
  return {
    category,
    key,
    status: duplicates.length === 0 ? 'pass' : 'fail',
    expected: 'unique entries',
    actual: duplicates.length === 0 ? 'unique entries' : `duplicates: ${duplicates.join(', ')}`,
    evidence,
  }
}

function requiredMetadataCheck(
  key: string,
  evidence: string,
  present: boolean
): SssOracleCheck {
  return {
    category: 'identity',
    key,
    status: present ? 'pass' : 'candidate_missing',
    expected: true,
    actual: present,
    evidence,
  }
}

function exactCheck(
  category: SssOracleCheck['category'],
  key: string,
  evidence: string,
  expected: string | number | boolean,
  actual: string | number | boolean | undefined
): SssOracleCheck {
  if (actual === undefined) {
    return { category, key, status: 'candidate_missing', expected, evidence }
  }
  const equal = typeof expected === 'number' && typeof actual === 'number'
    ? Math.abs(actual - expected) <= EXACT_NUMBER_TOLERANCE
    : actual === expected
  return { category, key, status: equal ? 'pass' : 'fail', expected, actual, evidence }
}

function timestampCheck(
  key: string,
  evidence: string,
  expected: string,
  actual: string | undefined
): SssOracleCheck {
  const tolerance = SSS_ORACLE_ACCEPTANCE_TOLERANCES.seededMahadashaSeconds
  if (actual === undefined) {
    return {
      category: 'dasha',
      key,
      status: 'candidate_missing',
      expected,
      evidence,
      tolerance: { value: tolerance, unit: 'seconds' },
    }
  }
  const expectedMs = Date.parse(expected)
  const actualMs = Date.parse(actual)
  if (!Number.isFinite(expectedMs) || !Number.isFinite(actualMs)) {
    return {
      category: 'dasha',
      key,
      status: 'fail',
      expected,
      actual,
      evidence,
      note: 'Expected and actual dasha boundaries must be ISO-8601 timestamps with offsets.',
    }
  }
  const deltaSeconds = (actualMs - expectedMs) / 1_000
  return {
    category: 'dasha',
    key,
    status: Math.abs(deltaSeconds) <= tolerance + COMPARISON_EPSILON ? 'pass' : 'fail',
    expected,
    actual,
    delta: {
      value: deltaSeconds,
      absoluteValue: Math.abs(deltaSeconds),
      unit: 'seconds',
    },
    tolerance: { value: tolerance, unit: 'seconds' },
    evidence,
  }
}

function compareNamedLongitudes(
  category: 'point',
  prefix: string,
  evidence: string,
  expected: readonly { readonly name: string; readonly longitude: number }[],
  actual: readonly SssCandidatePoint[] | undefined
): SssOracleCheck[] {
  const actualByName = new Map((actual ?? []).map((point) => [point.name, point]))
  return expected.map((point) =>
    longitudeCheck(category, `${prefix}.${point.name}.longitude`, evidence, point.longitude, actualByName.get(point.name)?.longitude)
  )
}

function parentLord(
  period: SssFixtureDashaPeriod,
  periods: readonly SssFixtureDashaPeriod[]
): string | null {
  if (period.parentId === null) return null
  return periods.find((candidate) => candidate.id === period.parentId)?.lord ?? null
}

function dashaKey(level: SssDashaLevel, parent: string | null, lord: string): string {
  return `${level}:${parent ?? 'root'}:${lord}`
}

function compareDashaLevel(
  expected: readonly SssFixtureDashaPeriod[],
  actual: readonly SssCandidateDashaPeriod[] | undefined,
  allExpected: readonly SssFixtureDashaPeriod[],
  evidence: string
): SssOracleCheck[] {
  const expectedKeys = expected.map((period) =>
    dashaKey(period.level, parentLord(period, allExpected), period.lord)
  )
  const actualKeys = actual?.map((period) =>
    dashaKey(period.level, period.parentLord ?? null, period.lord)
  )
  const actualByKey = new Map(
    (actual ?? []).map((period) => [dashaKey(period.level, period.parentLord ?? null, period.lord), period])
  )
  const checks: SssOracleCheck[] = [
    uniquenessCheck('dasha', `dasha.${expected[0]?.level ?? 'unknown'}.uniqueSemanticKeys`, evidence, actualKeys),
    exactCheck(
      'dasha',
      `dasha.${expected[0]?.level ?? 'unknown'}.semanticOrder`,
      evidence,
      expectedKeys.join(' > '),
      actualKeys?.join(' > ')
    ),
  ]
  checks.push(...expected.flatMap((period) => {
    const parent = parentLord(period, allExpected)
    const key = dashaKey(period.level, parent, period.lord)
    const candidate = actualByKey.get(key)
    return [
      exactCheck('dasha', `dasha.${key}.lord`, evidence, period.lord, candidate?.lord),
      timestampCheck(`dasha.${key}.start`, evidence, period.start, candidate?.start),
      timestampCheck(`dasha.${key}.end`, evidence, period.end, candidate?.end),
    ]
  }))
  return checks
}

function reportOutcome(summary: Readonly<Record<SssOracleCheckStatus, number>>): SssOracleComparisonReport['outcome'] {
  if (summary.fail > 0) return 'fail'
  if (summary.candidate_missing > 0) return 'incomplete'
  if (summary.oracle_missing > 0) return 'partial'
  return 'pass'
}

export function compareSssCandidateToPvrOracle(
  fixture: SssFixture,
  candidate: SssOracleCandidate
): SssOracleComparisonReport {
  const evidence = fixture.source
  const checks: SssOracleCheck[] = [
    exactCheck('identity', 'identity.fixtureId', evidence, fixture.id, candidate.fixtureId),
    exactCheck('identity', 'identity.targetProfile', evidence, PROFILE_ID, candidate.targetProfile),
    requiredMetadataCheck(
      'identity.parameterSetIdPresent',
      evidence,
      candidate.provenance.parameterSetId.trim().length > 0
    ),
    requiredMetadataCheck(
      'identity.formulaSourcesPresent',
      evidence,
      candidate.provenance.formulaSourceIds.length > 0
    ),
  ]

  if (candidate.candidateKind === 'production_provider') {
    checks.push(exactCheck(
      'identity',
      'identity.calculationProfile',
      evidence,
      PROFILE_ID,
      candidate.calculationProfile
    ))
  }

  if (candidate.calculationProfile === 'drik_lahiri_v1' || candidate.targetProfile !== PROFILE_ID) {
    checks.push({
      category: 'identity',
      key: 'identity.noDrikSubstitution',
      status: 'fail',
      expected: PROFILE_ID,
      actual: candidate.calculationProfile ?? candidate.targetProfile,
      evidence,
      note: 'Drik/Lahiri output is not a candidate implementation of the PVR/JHora SSS oracle.',
    })
  }

  checks.push(
    exactCheck('birth', 'birth.date', evidence, fixture.birth.date, candidate.birth?.date),
    exactCheck('birth', 'birth.time', evidence, fixture.birth.time, candidate.birth?.time),
    exactCheck('birth', 'birth.timezone', evidence, fixture.birth.timezone, candidate.birth?.timezone),
    exactCheck('birth', 'birth.latitude', evidence, fixture.birth.latitude, candidate.birth?.latitude),
    exactCheck('birth', 'birth.longitude', evidence, fixture.birth.longitude, candidate.birth?.longitude)
  )

  const natalByBody = new Map((candidate.natal ?? []).map((position) => [position.body, position]))
  checks.push(uniquenessCheck('natal', 'natal.uniqueBodies', evidence, candidate.natal?.map((position) => position.body)))
  for (const expected of fixture.natal) {
    const actual = natalByBody.get(expected.body)
    checks.push(
      longitudeCheck('natal', `natal.${expected.body}.longitude`, evidence, expected.longitude, actual?.longitude),
      semanticNakshatraCheck(`natal.${expected.body}.nakshatra`, evidence, expected.nakshatra, actual?.nakshatra),
      exactCheck('natal', `natal.${expected.body}.pada`, evidence, expected.pada, actual?.pada),
      exactCheck('natal', `natal.${expected.body}.retrograde`, evidence, expected.retrograde, actual?.retrograde)
    )
  }

  checks.push(
    ...compareNamedLongitudes('point', 'upagraha', evidence, fixture.upagrahas, candidate.upagrahas),
    ...compareNamedLongitudes('point', 'specialLagna', evidence, fixture.specialLagnas, candidate.specialLagnas),
    ...compareNamedLongitudes('point', 'additionalPoint', evidence, fixture.additionalPoints, candidate.additionalPoints)
  )

  checks.push({
    category: 'ayanamsa',
    key: 'ayanamsa.longitude',
    status: 'oracle_missing',
    actual: candidate.ayanamsa,
    evidence,
    note: 'The screenshots establish the selected SSS ayanamsa mode, but no numeric ayanamsa value is transcribed.',
  })
  checks.push({
    category: 'varga',
    key: 'varga.machineReadablePlacements',
    status: 'oracle_missing',
    actual: candidate.divisionalCharts?.length,
    evidence,
    note: 'Varga screenshots exist, but their placements have not received a machine-readable two-pass transcription.',
  })

  const allExpectedDashas = [
    ...fixture.mahadasha,
    ...fixture.antardasha,
    ...fixture.pratyantardasha,
  ]
  checks.push(
    ...compareDashaLevel(fixture.mahadasha, candidate.mahadasha, allExpectedDashas, fixture.dasha.source),
    ...compareDashaLevel(fixture.antardasha, candidate.antardasha, allExpectedDashas, fixture.dasha.source),
    ...compareDashaLevel(fixture.pratyantardasha, candidate.pratyantardasha, allExpectedDashas, fixture.dasha.source)
  )

  const summary: Record<SssOracleCheckStatus, number> = {
    pass: 0,
    fail: 0,
    candidate_missing: 0,
    oracle_missing: 0,
  }
  for (const check of checks) summary[check.status] += 1

  return {
    fixtureId: fixture.id,
    implementationId: candidate.implementationId,
    candidateKind: candidate.candidateKind,
    targetProfile: candidate.targetProfile,
    calculationProfile: candidate.calculationProfile,
    outcome: reportOutcome(summary),
    releaseEligible:
      reportOutcome(summary) === 'pass' && fixture.transcription.humanReleaseAudit !== 'pending',
    summary,
    checks,
  }
}

function display(value: unknown): string {
  if (value === undefined) return '—'
  return String(value).replaceAll('|', '\\|')
}

export function renderSssOracleComparisonMarkdown(report: SssOracleComparisonReport): string {
  const noteworthy = report.checks.filter((check) => check.status !== 'pass')
  const lines = [
    `# SSS/Makaranda PVR Oracle Comparison — ${report.fixtureId}`,
    '',
    `- Implementation: \`${report.implementationId}\``,
    `- Candidate kind: \`${report.candidateKind}\``,
    `- Target profile: \`${report.targetProfile}\``,
    `- Registered profile: \`${report.calculationProfile ?? 'not registered (research only)'}\``,
    `- Outcome: **${report.outcome}**`,
    `- Release eligible: **${report.releaseEligible ? 'yes' : 'no'}**`,
    `- Checks: ${report.summary.pass} pass, ${report.summary.fail} fail, ${report.summary.candidate_missing} candidate missing, ${report.summary.oracle_missing} oracle missing`,
    '',
    '## Non-passing and unavailable checks',
    '',
    '| Status | Check | Expected | Actual | Delta | Evidence / note |',
    '|---|---|---:|---:|---:|---|',
  ]
  for (const check of noteworthy) {
    const delta = check.delta ? `${check.delta.value.toFixed(6)} ${check.delta.unit}` : '—'
    lines.push(
      `| ${check.status} | ${check.key} | ${display(check.expected)} | ${display(check.actual)} | ${delta} | ${display(check.note ?? check.evidence)} |`
    )
  }
  lines.push('')
  return lines.join('\n')
}
