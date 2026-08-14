import { describe, expect, it } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import GocharRangeTable, { formatGocharUtc } from './GocharRangeTable'
import type { GocharRangeResult } from '@/lib/gocharRange'

const RESULT: GocharRangeResult = {
  rangeStart: '2024-01-01T00:00:00.000Z',
  rangeEnd: '2024-01-03T00:00:00.000Z',
  includedGrahas: ['Sun', 'Mars'],
  moonIncluded: false,
  intervals: [
    { planet: 'Sun', sign: 'Capricorn', signNumber: 10, houseFromMoon: 1, houseFromLagna: 10, start: '2024-01-01T12:01:00.000Z', end: '2024-01-01T12:43:00.000Z' },
    { planet: 'Sun', sign: 'Sagittarius', signNumber: 9, houseFromMoon: 12, houseFromLagna: 9, start: '2024-01-01T12:43:00.000Z', end: '2024-01-03T00:00:00.000Z' },
    { planet: 'Mars', sign: 'Capricorn', signNumber: 10, houseFromMoon: 1, houseFromLagna: 10, start: '2024-01-01T00:00:00.000Z', end: '2024-01-03T00:00:00.000Z' },
  ],
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node === 'object' && 'props' in (node as ReactElement)) return textOf((node as ReactElement).props.children)
  return ''
}

function walk(node: ReactNode, visit: (element: ReactElement) => void): void {
  if (node === null || node === undefined || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit))
  const element = node as ReactElement
  visit(element)
  walk(element.props.children, visit)
}

function findAll(root: ReactNode, tag: string): ReactElement[] {
  const found: ReactElement[] = []
  walk(root, (element) => {
    if (element.type === tag) found.push(element)
  })
  return found
}

describe('GocharRangeTable', () => {
  it('labels intervals as UTC and discloses the returned grahas and Moon choice', () => {
    const tree = GocharRangeTable({ result: RESULT, label: 'Gochar range intervals' })
    const text = textOf(tree)

    expect(text).toContain('Included grahas: Sun, Mars')
    expect(text).toContain('Moon: not included')
    expect(text).toContain('Every interval is UTC.')
    expect(text).toContain(`Resolved UTC range: ${RESULT.rangeStart} → ${RESULT.rangeEnd}`)
    expect(text).toContain('From (UTC)')
    expect(text).toContain('To (UTC)')
  })

  it('keeps sub-day From and To values visibly distinct and groups in returned order', () => {
    const tree = GocharRangeTable({ result: RESULT })
    const text = textOf(tree)
    const rowGroups = findAll(tree, 'th').filter((element) => element.props.scope === 'rowgroup')

    expect(formatGocharUtc(RESULT.intervals[0].start)).not.toBe(formatGocharUtc(RESULT.intervals[0].end))
    expect(text).toContain(formatGocharUtc(RESULT.intervals[0].start))
    expect(text).toContain(formatGocharUtc(RESULT.intervals[0].end))
    expect(rowGroups.map((element) => textOf(element))).toEqual(['Sun', 'Mars'])
  })

  it('uses semantic column headers and an overflow wrapper for narrow viewports', () => {
    const tree = GocharRangeTable({ result: RESULT })
    const headers = findAll(tree, 'th').filter((element) => element.props.scope === 'col')
    const wrappers = findAll(tree, 'div').filter((element) => String(element.props.className).includes('overflow-x-auto'))

    expect(headers).toHaveLength(6)
    expect(wrappers).toHaveLength(1)
  })
})
