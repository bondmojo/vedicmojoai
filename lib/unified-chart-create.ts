/**
 * lib/unified-chart-create.ts — shared UnifiedChart creation from birth data.
 *
 * The single implementation of "Path A": compute the full chart via Swiss
 * Ephemeris, compute the Vimshottari dasha tree, map to the UnifiedChart
 * shape, dedup on chartHash, persist. Used by:
 *   - POST /api/unified-charts/from-compute (route is a thin wrapper)
 *   - scripts/migrate-saved-to-unified.ts (SavedChart → UnifiedChart promotion)
 */

import { prisma } from '@/lib/db'
import { computeFullChart } from '@/engine/compute'
import { computeVimshottari } from '@/engine/computeVimshottari'
import { mapComputedToUnified, serializeDashaTree } from '@/lib/chart-mapper'

export interface BirthDataInput {
  name: string
  date: string // YYYY-MM-DD
  time: string // HH:MM or HH:MM:SS
  timezone: number
  latitude: number
  longitude: number
  sunriseMode: 'precise' | 'jhora'
}

export interface CreateUnifiedResult {
  status: 'created' | 'duplicate'
  id: string
  name: string
  lagna?: string
  birthDatetime?: Date
  createdAt?: Date
}

/**
 * Computes and persists a UnifiedChart (source="compute") from birth data.
 * Returns status="duplicate" with the EXISTING chart when the same birth
 * data (chartHash) is already stored — the name is not updated in that case.
 *
 * @throws when the ephemeris computation fails (e.g. Moon position missing).
 */
export async function createUnifiedChartFromBirthData(
  input: BirthDataInput
): Promise<CreateUnifiedResult> {
  // Normalize time to HH:MM:SS
  const time = input.time.length === 5 ? `${input.time}:00` : input.time

  // Compute the full chart via Swiss Ephemeris
  const chart = computeFullChart({
    date: input.date,
    time,
    timezone: input.timezone,
    latitude: input.latitude,
    longitude: input.longitude,
    name: input.name,
    sunriseMode: input.sunriseMode,
  })

  // Compute Vimshottari Dasha from Moon longitude
  const moonPlanet = chart.planets.find((p) => p.planet === 'Moon')
  if (!moonPlanet) {
    throw new Error('Moon position could not be computed')
  }

  // Build birth datetime (UTC) for dasha computation
  const [year, month, day] = input.date.split('-').map(Number)
  const [hours, minutes, seconds] = time.split(':').map(Number)
  const birthUtcMillis =
    Date.UTC(year, month - 1, day, hours, minutes, seconds || 0) -
    input.timezone * 3600 * 1000
  const birthDate = new Date(birthUtcMillis)

  const dashaTree = computeVimshottari(moonPlanet.longitude, birthDate)
  const serializedDasha = serializeDashaTree(dashaTree)

  // Map to UnifiedChart create input
  const createInput = mapComputedToUnified(chart, serializedDasha, input.name)

  // Dedup on chartHash (same birth data)
  const existing = await prisma.unifiedChart.findUnique({
    where: { chartHash: createInput.chartHash },
    select: { id: true, name: true },
  })

  if (existing) {
    return { status: 'duplicate', id: existing.id, name: existing.name }
  }

  const saved = await prisma.unifiedChart.create({
    data: createInput,
    select: {
      id: true,
      name: true,
      lagna: true,
      birthDatetime: true,
      createdAt: true,
    },
  })

  return {
    status: 'created',
    id: saved.id,
    name: saved.name,
    lagna: saved.lagna,
    birthDatetime: saved.birthDatetime,
    createdAt: saved.createdAt,
  }
}
