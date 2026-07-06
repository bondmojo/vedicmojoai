/**
 * tests/renderer.test.ts
 * Unit tests for renderReport() (HTML) and renderMarkdownReport() (Markdown)
 * in engine/renderer.ts.
 *
 * Uses the real 4C synthesis schema — no domain_findings key.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock Prisma ──────────────────────────────────────────────────────
vi.mock('@/lib/db', () => ({
  prisma: {
    pipelineRun: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}))

// ── Mock fs/promises so no real files are written ────────────────────
const mockMkdir = vi.fn().mockResolvedValue(undefined)
const mockWriteFile = vi.fn().mockResolvedValue(undefined)

vi.mock('fs/promises', () => ({
  default: {
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
  },
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
}))

// ── Import after mocks are registered ────────────────────────────────
import { renderReport, renderMarkdownReport } from '../engine/renderer'
import { prisma } from '../lib/db'

// ── Real 4C synthesis fixture (correct schema keys) ──────────────────
const MOCK_SYNTHESIS = {
  scores: {
    wealth_potential: 72,
    wealth_retention: 65,
    financial_freedom_pct: 45,
    health_resilience: 8,
  },
  executive_summary: 'Strong chart with good wealth yoga active until 2027.',
  lagna_lord_ruling: 'Jupiter rules the chart with strength in own sign.',
  yogakaraka_status: 'Saturn as yogakaraka is well-placed in the 10th house.',
  yoga_registry: [
    {
      name: 'Dhana Yoga',
      active: true,
      strength: 'Strong',
      houses: [2, 5],
      planets: ['Jupiter', 'Venus'],
      notes: 'Wealth accumulation indicated',
    },
  ],
  planet_hierarchy: [
    {
      name: 'Jupiter',
      sign: 'Sagittarius',
      house: 1,
      dignity: 'Own Sign',
      shadbala: '1.8',
      functional_role: 'Lagna Lord',
      net_score: 85,
    },
  ],
  cashflow_timeline: [
    {
      period: '2025-2026',
      dasha: 'Jupiter-Venus',
      direction: 'positive',
      magnitude: 'High',
      key_driver: 'Career growth',
      caution: 'Avoid speculation',
    },
  ],
  health_analysis: {
    score: 8,
    primary_risks: ['Digestive issues during Saturn periods'],
    protective_factors: ['Strong Sun in 5th', 'Mars in good dignity'],
  },
  financial_freedom: {
    score_pct: 62,
    earliest_window: '2026-2028',
    primary_enabler: 'Jupiter-Mercury dasha activation',
    primary_risk: 'Over-leveraged real estate',
  },
  property_analysis: {
    d4_assessment: 'D4 chart shows strong 4th house with benefic influence.',
    best_acquisition_periods: ['Jupiter-Venus 2025', 'Saturn-Mercury 2028'],
  },
  priority_alerts: [
    'Avoid major financial commitments during Saturn-Rahu period',
  ],
  cross_channel_matrix: [
    {
      channel_a: 'D1',
      channel_b: 'D9 Navamsa',
      interaction: 'Mutual reception between 7th lords',
      net_effect: 'positive',
      remarks: 'Marriage partnership strengthened',
    },
    {
      channel_a: 'D1',
      channel_b: 'D10 career',
      interaction: '10th lord in strong position',
      net_effect: 'positive',
      remarks: 'Career advancement supported',
    },
  ],
  confidence_matrix: [
    {
      domain: 'wealth',
      confidence: 85,
      data_quality: 'High',
      limiting_factors: 'Transit data incomplete',
    },
  ],
  sade_sati_impact: 'Not currently in Sade Sati. Next phase begins 2028.',
  atma_karaka_theme: 'Jupiter as Atma Karaka indicates wisdom and dharma.',
  corrections_applied: ['Adjusted Moon nakshatra based on tropical-sidereal conversion'],
}

const BASE_INPUT = {
  runId: 'run-001',
  chartId: 'chart-001',
  clientName: 'Test Client',
  queryTypes: ['wealth', 'health'],
  synthesisJson: MOCK_SYNTHESIS,
  overrideApplied: false,
}

// ─── renderReport (HTML) ────────────────────────────────────────────

describe('renderReport (HTML)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    ;(prisma.pipelineRun.update as ReturnType<typeof vi.fn>).mockResolvedValue({})
  })

  it('should return a relative path matching data/reports/*.html', async () => {
    const result = await renderReport(BASE_INPUT)
    expect(result).toMatch(/^data\/reports\/.+\.html$/)
  })

  it('should call fs.writeFile once with the HTML content', async () => {
    await renderReport(BASE_INPUT)
    expect(mockWriteFile).toHaveBeenCalledOnce()
    const [, content] = mockWriteFile.mock.calls[0]
    expect(typeof content).toBe('string')
    expect(content.length).toBeGreaterThan(100)
  })

  it('should produce valid HTML with DOCTYPE and body structure', async () => {
    await renderReport(BASE_INPUT)
    const html: string = mockWriteFile.mock.calls[0][1]
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<html')
    expect(html).toContain('</html>')
    expect(html).toContain('<body')
    expect(html).toContain('</body>')
  })

  it('should contain tab-summary (always present)', async () => {
    await renderReport(BASE_INPUT)
    const html: string = mockWriteFile.mock.calls[0][1]
    expect(html).toContain('tab-summary')
  })

  it('should contain tab-dasha (always present)', async () => {
    await renderReport(BASE_INPUT)
    const html: string = mockWriteFile.mock.calls[0][1]
    expect(html).toContain('tab-dasha')
  })

  it('should contain tab-wealth for queryTypes=["wealth"]', async () => {
    await renderReport(BASE_INPUT)
    const html: string = mockWriteFile.mock.calls[0][1]
    expect(html).toContain('tab-wealth')
  })

  it('should contain tab-health for queryTypes=["wealth","health"]', async () => {
    await renderReport(BASE_INPUT)
    const html: string = mockWriteFile.mock.calls[0][1]
    expect(html).toContain('tab-health')
  })

  it('should NOT contain tab-career when career is not in queryTypes', async () => {
    await renderReport(BASE_INPUT)
    const html: string = mockWriteFile.mock.calls[0][1]
    expect(html).not.toContain('id="tab-career"')
  })

  it('should contain all 5 domain tabs when queryTypes=["full"]', async () => {
    await renderReport({ ...BASE_INPUT, queryTypes: ['full'] })
    const html: string = mockWriteFile.mock.calls[0][1]
    expect(html).toContain('tab-health')
    expect(html).toContain('tab-wealth')
    expect(html).toContain('tab-career')
    expect(html).toContain('tab-marriage')
    expect(html).toContain('tab-property')
  })

  it('should render executive_summary as prose text, not JSON', async () => {
    await renderReport(BASE_INPUT)
    const html: string = mockWriteFile.mock.calls[0][1]
    expect(html).toContain('Strong chart with good wealth yoga active until 2027')
    // Should not appear as a JSON key-value pair
    expect(html).not.toContain('"executive_summary"')
  })

  it('should render score values in score cards', async () => {
    await renderReport(BASE_INPUT)
    const html: string = mockWriteFile.mock.calls[0][1]
    // Score values appear in score-value divs, not as JSON
    expect(html).toContain('72')   // wealth_potential
    expect(html).toContain('65')   // wealth_retention
    expect(html).not.toContain('"wealth_potential"')
  })

  it('should render cashflow_timeline as HTML timeline entries, not JSON', async () => {
    await renderReport(BASE_INPUT)
    const html: string = mockWriteFile.mock.calls[0][1]
    expect(html).toContain('2025-2026')
    expect(html).toContain('Jupiter-Venus')
    expect(html).toContain('Career growth')
    // Should not appear as a JSON string (no raw key-value syntax)
    expect(html).not.toContain('"key_driver"')
  })

  it('should render health_analysis fields without raw JSON', async () => {
    await renderReport({ ...BASE_INPUT, queryTypes: ['health'] })
    const html: string = mockWriteFile.mock.calls[0][1]
    expect(html).toContain('Digestive issues during Saturn periods')
    expect(html).toContain('Strong Sun in 5th')
    expect(html).not.toContain('"primary_risks"')
    expect(html).not.toContain('"protective_factors"')
  })

  it('should escape HTML special characters in clientName', async () => {
    await renderReport({ ...BASE_INPUT, clientName: '<script>alert(1)</script>' })
    const html: string = mockWriteFile.mock.calls[0][1]
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
  })

  it('should render override-banner when overrideApplied=true', async () => {
    await renderReport({ ...BASE_INPUT, overrideApplied: true })
    const html: string = mockWriteFile.mock.calls[0][1]
    expect(html).toContain('override-banner')
    expect(html).toContain('Override Applied')
  })

  it('should NOT render override-banner element when overrideApplied=false', async () => {
    await renderReport(BASE_INPUT)
    const html: string = mockWriteFile.mock.calls[0][1]
    // The CSS class definition will always be in <style>, but the <div> element
    // should only appear when overrideApplied=true
    expect(html).not.toContain('<div class="override-banner"')
  })

  it('should update PipelineRun.reportPath in DB', async () => {
    await renderReport(BASE_INPUT)
    expect(prisma.pipelineRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-001' },
        data: expect.objectContaining({
          reportPath: expect.stringMatching(/data\/reports\/.+\.html/),
        }),
      })
    )
  })

  it('should render yoga name in the yogas tab', async () => {
    await renderReport(BASE_INPUT)
    const html: string = mockWriteFile.mock.calls[0][1]
    expect(html).toContain('Dhana Yoga')
    expect(html).not.toContain('"yoga_registry"')
  })

  it('should render planet name in the planets tab', async () => {
    await renderReport(BASE_INPUT)
    const html: string = mockWriteFile.mock.calls[0][1]
    expect(html).toContain('Jupiter')
    expect(html).toContain('Sagittarius')
    expect(html).not.toContain('"planet_hierarchy"')
  })

  it('should render priority alerts without raw JSON', async () => {
    await renderReport(BASE_INPUT)
    const html: string = mockWriteFile.mock.calls[0][1]
    expect(html).toContain('Avoid major financial commitments during Saturn-Rahu period')
    expect(html).not.toContain('"priority_alerts"')
  })

  it('should contain print media query styles', async () => {
    await renderReport(BASE_INPUT)
    const html: string = mockWriteFile.mock.calls[0][1]
    expect(html).toContain('@media print')
  })
})

// ─── renderMarkdownReport (Markdown) ───────────────────────────────

describe('renderMarkdownReport (Markdown)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    ;(prisma.pipelineRun.update as ReturnType<typeof vi.fn>).mockResolvedValue({})
  })

  it('should return a relative path matching data/reports/*.md', async () => {
    const result = await renderMarkdownReport(BASE_INPUT)
    expect(result).toMatch(/^data\/reports\/.+\.md$/)
  })

  it('should call fs.writeFile once with Markdown content', async () => {
    await renderMarkdownReport(BASE_INPUT)
    expect(mockWriteFile).toHaveBeenCalledOnce()
    const [, content] = mockWriteFile.mock.calls[0]
    expect(typeof content).toBe('string')
  })

  it('should contain a YAML frontmatter block', async () => {
    await renderMarkdownReport(BASE_INPUT)
    const md: string = mockWriteFile.mock.calls[0][1]
    expect(md).toContain('---')
    expect(md).toContain('title:')
  })

  it('should start with an H1 heading after frontmatter', async () => {
    await renderMarkdownReport(BASE_INPUT)
    const md: string = mockWriteFile.mock.calls[0][1]
    expect(md).toContain('# VedicMojoAI Analysis Report')
  })

  it('should contain a Scores table with markdown table syntax', async () => {
    await renderMarkdownReport(BASE_INPUT)
    const md: string = mockWriteFile.mock.calls[0][1]
    expect(md).toContain('## Scores')
    expect(md).toMatch(/\|.*\|.*\|/)
    expect(md).toContain('Wealth Potential')
    expect(md).toContain('72')
  })

  it('should contain executive_summary as prose text', async () => {
    await renderMarkdownReport(BASE_INPUT)
    const md: string = mockWriteFile.mock.calls[0][1]
    expect(md).toContain('## Executive Summary')
    expect(md).toContain('Strong chart with good wealth yoga active until 2027')
  })

  it('should contain Cashflow Timeline as a markdown table', async () => {
    await renderMarkdownReport(BASE_INPUT)
    const md: string = mockWriteFile.mock.calls[0][1]
    expect(md).toContain('## Cashflow Timeline')
    expect(md).toContain('2025-2026')
    expect(md).toContain('Jupiter-Venus')
    expect(md).toContain('Career growth')
  })

  it('should contain Yoga Registry as a markdown table', async () => {
    await renderMarkdownReport(BASE_INPUT)
    const md: string = mockWriteFile.mock.calls[0][1]
    expect(md).toContain('## Yoga Registry')
    expect(md).toContain('Dhana Yoga')
    expect(md).toContain('Active')
  })

  it('should contain Planet Strengths section', async () => {
    await renderMarkdownReport(BASE_INPUT)
    const md: string = mockWriteFile.mock.calls[0][1]
    expect(md).toContain('## Planet Strengths')
    expect(md).toContain('Jupiter')
    expect(md).toContain('Sagittarius')
  })

  it('should contain Health Analysis section with correct keys', async () => {
    await renderMarkdownReport(BASE_INPUT)
    const md: string = mockWriteFile.mock.calls[0][1]
    expect(md).toContain('### Health')
    expect(md).toContain('Digestive issues during Saturn periods')
    expect(md).toContain('Strong Sun in 5th')
    // Should NOT be raw JSON
    expect(md).not.toContain('"primary_risks"')
  })

  it('should contain Financial Freedom section', async () => {
    await renderMarkdownReport(BASE_INPUT)
    const md: string = mockWriteFile.mock.calls[0][1]
    expect(md).toContain('### Financial Freedom')
    expect(md).toContain('62%')
    expect(md).toContain('2026-2028')
  })

  it('should contain Property Analysis section', async () => {
    await renderMarkdownReport(BASE_INPUT)
    const md: string = mockWriteFile.mock.calls[0][1]
    expect(md).toContain('### Property')
    expect(md).toContain('D4 Property Assessment')
    expect(md).toContain('Jupiter-Venus 2025')
  })

  it('should NOT contain raw JSON key-value syntax', async () => {
    await renderMarkdownReport(BASE_INPUT)
    const md: string = mockWriteFile.mock.calls[0][1]
    // No "key": "value" JSON pairs should appear outside frontmatter
    const bodyAfterFrontmatter = md.split('---').slice(2).join('---')
    expect(bodyAfterFrontmatter).not.toMatch(/"[a-z_]+":\s*"/)
    expect(bodyAfterFrontmatter).not.toMatch(/"[a-z_]+":\s*\[/)
  })

  it('should contain override warning when overrideApplied=true', async () => {
    await renderMarkdownReport({ ...BASE_INPUT, overrideApplied: true })
    const md: string = mockWriteFile.mock.calls[0][1]
    expect(md).toContain('Override Applied')
  })

  it('should NOT contain override warning blockquote when overrideApplied=false', async () => {
    await renderMarkdownReport(BASE_INPUT)
    const md: string = mockWriteFile.mock.calls[0][1]
    // frontmatter has override_applied: false but the WARNING blockquote should be absent
    expect(md).not.toContain('> WARNING: Override Applied')
  })

  it('should update PipelineRun.reportPath in DB', async () => {
    await renderMarkdownReport(BASE_INPUT)
    expect(prisma.pipelineRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-001' },
        data: expect.objectContaining({
          reportPath: expect.stringMatching(/data\/reports\/.+\.md/),
        }),
      })
    )
  })

  it('should contain a footer separator line', async () => {
    await renderMarkdownReport(BASE_INPUT)
    const md: string = mockWriteFile.mock.calls[0][1]
    expect(md).toContain('Generated by VedicMojoAI')
  })
})
