import { describe, expect, it } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import GocharCharts, { buildGocharChart } from './GocharCharts'
import NorthIndianChart from './NorthIndianChart'
import { SectionUnavailable } from './SectionUnavailable'

const D1 = {
  division: 1,
  name: 'Rāśi',
  shortName: 'D1',
  lagna: 'Leo',
  lagnaSignNumber: 5,
  planets: [
    { planet: 'Sun', signNumber: 5, house: 1 },
    { planet: 'Moon', signNumber: 2, house: 10 },
  ],
}

const TRANSITS = [
  { planet: 'Sun', signNumber: 5, retrograde: false },
  { planet: 'Saturn', signNumber: 10, retrograde: true },
]

function walk(node: ReactNode, visit: (element: ReactElement) => void): void {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit))
  const element = node as ReactElement
  visit(element)
  walk(element.props.children, visit)
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf((node as ReactElement).props.children)
}

describe('GocharCharts', () => {
  it('anchors transit charts to the requested whole-sign reference', () => {
    const chart = buildGocharChart('From Birth Lagna', 5, TRANSITS)

    expect(chart.lagna).toBe('Leo')
    expect(chart.planets).toEqual([
      { planet: 'Sun', signNumber: 5, house: 1, retrograde: false },
      { planet: 'Saturn', signNumber: 10, house: 6, retrograde: true },
    ])
  })

  it('renders natal D1, the JHora-style Transit Moment Chart, and natal-reference Gochar charts', () => {
    const tree = GocharCharts({
      natalD1: D1,
      asOf: '2024-05-14T08:00:00.000Z',
      transits: TRANSITS,
      ascendantTransits: [{ signNumber: 3, isCurrent: true }],
    })
    const charts: ReactElement[] = []
    walk(tree, (element) => {
      if (element.type === NorthIndianChart) charts.push(element)
    })

    expect(textOf(tree)).toContain('Current Gochar charts')
    expect(textOf(tree)).toContain('2024-05-14T08:00:00.000Z')
    expect(charts).toHaveLength(4)
    expect(charts.map((chart) => chart.props.chart.name)).toEqual([
      'Natal Rāśi',
      'Transit Moment Chart',
      'From Birth Lagna',
      'From Natal Moon',
    ])
    expect(charts.slice(1).map((chart) => chart.props.chart.lagnaSignNumber)).toEqual([3, 5, 2])
    expect(charts[1].props.chart.planets.find((planet: { planet: string }) => planet.planet === 'Sun').house).toBe(3)
    expect(charts[2].props.chart.planets.find((planet: { planet: string }) => planet.planet === 'Sun').house).toBe(1)
    expect(charts[3].props.chart.planets.find((planet: { planet: string }) => planet.planet === 'Sun').house).toBe(4)
  })

  it('uses the shared unavailable state when natal D1 is not present', () => {
    const tree = GocharCharts({
      natalD1: undefined,
      asOf: '2024-05-14T08:00:00.000Z',
      transits: TRANSITS,
    })

    expect(tree.type).toBe(SectionUnavailable)
    expect(tree.props.section).toBe('Gochar charts')
  })
})
