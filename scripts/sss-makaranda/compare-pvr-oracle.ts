#!/usr/bin/env npx tsx
import fs from 'node:fs'
import path from 'node:path'
import { SURYA_SIDDHANTA_MAKARANDA_FIXTURES } from '../../engine/compute/__fixtures__/suryaSiddhantaMakaranda'
import {
  compareSssCandidateToPvrOracle,
  renderSssOracleComparisonMarkdown,
  type SssOracleCandidate,
} from '../../engine/compute/verification/sssOracleComparison'

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

const fixtureId = argument('--fixture')
if (fixtureId !== 'india' && fixtureId !== 'mojo') {
  fail('Usage: npm run sss:compare-pvr -- --fixture india|mojo [--candidate path.json] [--format markdown|json]')
}

const fixture = SURYA_SIDDHANTA_MAKARANDA_FIXTURES.find((entry) => entry.id === fixtureId)
if (!fixture) fail(`Unknown fixture: ${fixtureId}`)

const candidatePath = argument('--candidate')
const parsedCandidate: unknown = candidatePath
  ? JSON.parse(fs.readFileSync(path.resolve(candidatePath), 'utf8'))
  : {
      fixtureId,
      candidateKind: 'research_prototype',
      targetProfile: 'surya_siddhanta_makaranda_v1',
      implementationId: 'not-yet-implemented',
      provenance: {
        parameterSetId: '',
        formulaSourceIds: [],
      },
    } satisfies SssOracleCandidate

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

if (!isRecord(parsedCandidate) || !isRecord(parsedCandidate.provenance)) {
  fail('Candidate must be a JSON object with a provenance object.')
}
if (parsedCandidate.candidateKind !== 'research_prototype' && parsedCandidate.candidateKind !== 'production_provider') {
  fail('Candidate candidateKind must be research_prototype or production_provider.')
}
if (typeof parsedCandidate.targetProfile !== 'string' || typeof parsedCandidate.implementationId !== 'string') {
  fail('Candidate targetProfile and implementationId must be strings.')
}
if (
  typeof parsedCandidate.provenance.parameterSetId !== 'string' ||
  !Array.isArray(parsedCandidate.provenance.formulaSourceIds) ||
  !parsedCandidate.provenance.formulaSourceIds.every((entry) => typeof entry === 'string')
) {
  fail('Candidate provenance requires parameterSetId and a string[] formulaSourceIds.')
}

const candidate = parsedCandidate as unknown as SssOracleCandidate

if (candidate.fixtureId !== fixtureId) {
  fail(`Candidate fixtureId ${candidate.fixtureId} does not match --fixture ${fixtureId}`)
}

const report = compareSssCandidateToPvrOracle(fixture, candidate)
const format = argument('--format') ?? 'markdown'
if (format === 'json') {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else if (format === 'markdown') {
  process.stdout.write(renderSssOracleComparisonMarkdown(report))
} else {
  fail(`Unsupported format: ${format}`)
}

if (report.outcome === 'fail') process.exitCode = 2
