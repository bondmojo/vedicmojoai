/**
 * engine/renderer.ts — Synthesis JSON → HTML report renderer.
 *
 * Takes the 4C synthesis output and generates a tabbed HTML report file.
 * Reports are stored at data/reports/{slug}.html with the path persisted in DB.
 */

import { prisma } from '@/lib/db'
import type { AgentId, Domain } from '@/lib/types'

// ─── Types ──────────────────────────────────────────────────────────

interface RenderInput {
  runId: string
  chartId: string
  clientName: string
  queryTypes: string[]
  synthesisJson: Record<string, unknown>
  overrideApplied: boolean
}

// 4C Synthesis — real schema from wave4_4c_synthesis.md

interface Synthesis4CScores {
  wealth_potential: number
  wealth_retention: number
  financial_freedom_pct: number
  health_resilience: number
}

interface YogaEntry {
  name: string
  active: boolean
  strength: string
  houses: number[]
  planets: string[]
  notes: string
}

interface PlanetEntry {
  name: string
  sign: string
  house: number
  dignity: string
  shadbala: string | number
  functional_role: string
  net_score: number | string
}

interface CashflowEntry {
  period: string
  dasha: string
  direction: string
  magnitude: string
  key_driver: string
  caution: string
}

interface CrossChannelEntry {
  channel_a: string
  channel_b: string
  interaction: string
  net_effect: string
  remarks: string
}

interface ConfidenceEntry {
  domain: string
  confidence: number
  data_quality: string
  limiting_factors: string
}

interface Synthesis4C {
  scores?: Synthesis4CScores
  executive_summary?: string
  lagna_lord_ruling?: string
  yogakaraka_status?: string
  yoga_registry?: YogaEntry[]
  planet_hierarchy?: PlanetEntry[]
  cashflow_timeline?: CashflowEntry[]
  property_analysis?: {
    d4_assessment?: string
    best_acquisition_periods?: string[]
  }
  health_analysis?: {
    score?: number
    primary_risks?: string[]
    protective_factors?: string[]
  }
  financial_freedom?: {
    score_pct?: number
    earliest_window?: string
    primary_enabler?: string
    primary_risk?: string
  }
  cross_channel_matrix?: CrossChannelEntry[]
  confidence_matrix?: ConfidenceEntry[]
  priority_alerts?: string[]
  corrections_applied?: string[]
  sade_sati_impact?: string
  atma_karaka_theme?: string
}

// ─── Main Renderer ──────────────────────────────────────────────────

/**
 * Renders the final HTML report from the 4C synthesis output.
 *
 * @param input - Render input with synthesis data and metadata.
 * @returns The file path where the report was written.
 */
export async function renderReport(input: RenderInput): Promise<string> {
  const { runId, clientName, queryTypes, synthesisJson, overrideApplied } = input

  const fs = await import('fs/promises')
  const path = await import('path')

  // Generate filename
  const slug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
  const querySlug = queryTypes.join('_')
  const filename = `${slug}_${timestamp}_${querySlug}.html`

  // Determine reports directory
  const reportsDir = process.env.REPORTS_DIR || path.join(process.cwd(), 'data', 'reports')
  await fs.mkdir(reportsDir, { recursive: true })

  const filePath = path.join(reportsDir, filename)
  const relativePath = `data/reports/${filename}`

  // Generate HTML
  const html = generateHTML(input)

  // Write file
  await fs.writeFile(filePath, html, 'utf-8')

  // Update run with report path
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: { reportPath: relativePath },
  })

  return relativePath
}

// ─── Markdown Renderer ──────────────────────────────────────────────

/**
 * Renders the final Markdown report from the 4C synthesis output.
 * Stores the .md file at data/reports/{slug}_{date}_{queries}.md
 * and updates PipelineRun.reportPath.
 *
 * @param input - Render input with synthesis data and metadata.
 * @returns The file path where the .md report was written.
 */
export async function renderMarkdownReport(input: RenderInput): Promise<string> {
  const { runId, clientName, queryTypes, synthesisJson, overrideApplied } = input

  const fs = await import('fs/promises')
  const path = await import('path')

  // Generate filename
  const slug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
  const querySlug = queryTypes.join('_')
  const filename = `${slug}_${timestamp}_${querySlug}.md`

  // Determine reports directory
  const reportsDir = process.env.REPORTS_DIR || path.join(process.cwd(), 'data', 'reports')
  await fs.mkdir(reportsDir, { recursive: true })

  const filePath = path.join(reportsDir, filename)
  const relativePath = `data/reports/${filename}`

  // Generate Markdown
  const md = generateMarkdown(input)

  // Write file
  await fs.writeFile(filePath, md, 'utf-8')

  // Update run with report path
  await prisma.pipelineRun.update({
    where: { id: runId },
    data: { reportPath: relativePath },
  })

  return relativePath
}

// ─── Markdown Generation ─────────────────────────────────────────────

function generateMarkdown(input: RenderInput): string {
  const { clientName, queryTypes, synthesisJson, overrideApplied } = input
  const s = synthesisJson as Synthesis4C
  const lines: string[] = []
  const date = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })

  // YAML frontmatter
  lines.push('---')
  lines.push(`title: "VedicMojoAI Analysis — ${clientName}"`)
  lines.push(`client: "${clientName}"`)
  lines.push(`generated: "${date}"`)
  lines.push(`query_types: [${queryTypes.join(', ')}]`)
  lines.push(`override_applied: ${overrideApplied}`)
  lines.push('---')
  lines.push('')

  // Title
  lines.push(`# VedicMojoAI Analysis Report`)
  lines.push('')
  lines.push(`**Client:** ${clientName}  **Generated:** ${date}  **Scope:** ${queryTypes.join(', ')}`)
  lines.push('')

  // Override warning
  if (overrideApplied) {
    lines.push('> WARNING: Override Applied — Critical errors were overridden by the practitioner.')
    lines.push('')
  }

  // Scores
  if (s.scores) {
    lines.push('## Scores')
    lines.push('')
    lines.push('| Metric | Value |')
    lines.push('|---|---|')
    if (s.scores.wealth_potential !== undefined) lines.push(`| Wealth Potential | ${s.scores.wealth_potential}/100 |`)
    if (s.scores.wealth_retention !== undefined) lines.push(`| Wealth Retention | ${s.scores.wealth_retention}/100 |`)
    if (s.scores.financial_freedom_pct !== undefined) lines.push(`| Financial Freedom | ${s.scores.financial_freedom_pct}% |`)
    if (s.scores.health_resilience !== undefined) lines.push(`| Health Resilience | ${s.scores.health_resilience}/10 |`)
    lines.push('')
  }

  // Executive Summary
  if (s.executive_summary) {
    lines.push('## Executive Summary')
    lines.push('')
    lines.push(s.executive_summary)
    lines.push('')
  }

  // Lagna Lord
  if (s.lagna_lord_ruling) {
    lines.push('### Lagna Lord')
    lines.push('')
    lines.push(s.lagna_lord_ruling)
    lines.push('')
  }

  // Yogakaraka
  if (s.yogakaraka_status) {
    lines.push('### Yogakaraka')
    lines.push('')
    lines.push(s.yogakaraka_status)
    lines.push('')
  }

  // Atma Karaka Theme
  if (s.atma_karaka_theme) {
    lines.push('### Atma Karaka Theme')
    lines.push('')
    lines.push(s.atma_karaka_theme)
    lines.push('')
  }

  // Sade Sati
  if (s.sade_sati_impact) {
    lines.push('### Sade Sati Impact')
    lines.push('')
    lines.push(s.sade_sati_impact)
    lines.push('')
  }

  // Priority Alerts
  if (s.priority_alerts?.length) {
    lines.push('## Priority Alerts')
    lines.push('')
    for (const alert of s.priority_alerts) {
      lines.push(`- ${alert}`)
    }
    lines.push('')
  }

  // Domain Analysis
  lines.push('## Domain Analysis')
  lines.push('')

  // Health
  if (s.health_analysis) {
    lines.push('### Health')
    lines.push('')
    const h = s.health_analysis
    if (h.score !== undefined) lines.push(`**Health Resilience Score:** ${h.score}/10`)
    if (h.primary_risks?.length) {
      lines.push('')
      lines.push('**Primary Risks:**')
      for (const r of h.primary_risks) lines.push(`- ${r}`)
    }
    if (h.protective_factors?.length) {
      lines.push('')
      lines.push('**Protective Factors:**')
      for (const f of h.protective_factors) lines.push(`- ${f}`)
    }
    lines.push('')
  }

  // Financial Freedom
  if (s.financial_freedom) {
    lines.push('### Financial Freedom')
    lines.push('')
    const ff = s.financial_freedom
    if (ff.score_pct !== undefined) lines.push(`**Freedom Score:** ${ff.score_pct}%`)
    if (ff.earliest_window) lines.push(`**Earliest Window:** ${ff.earliest_window}`)
    if (ff.primary_enabler) lines.push(`**Primary Enabler:** ${ff.primary_enabler}`)
    if (ff.primary_risk) lines.push(`**Primary Risk:** ${ff.primary_risk}`)
    lines.push('')
  }

  // Property
  if (s.property_analysis) {
    lines.push('### Property')
    lines.push('')
    const p = s.property_analysis
    if (p.d4_assessment) {
      lines.push('**D4 Property Assessment:**')
      lines.push('')
      lines.push(p.d4_assessment)
    }
    if (p.best_acquisition_periods?.length) {
      lines.push('')
      lines.push('**Best Acquisition Periods:**')
      for (const period of p.best_acquisition_periods) lines.push(`- ${period}`)
    }
    lines.push('')
  }

  // Cashflow Timeline
  if (s.cashflow_timeline?.length) {
    lines.push('## Cashflow Timeline')
    lines.push('')
    lines.push('| Period | Dasha | Direction | Magnitude | Key Driver | Caution |')
    lines.push('|--------|-------|-----------|-----------|------------|---------|')
    for (const e of s.cashflow_timeline) {
      const row = [
        e.period ?? '',
        e.dasha ?? '',
        e.direction ?? '',
        e.magnitude ?? '',
        e.key_driver ?? '',
        e.caution ?? '',
      ].map((c) => c.replace(/\|/g, '\\|')).join(' | ')
      lines.push(`| ${row} |`)
    }
    lines.push('')
  }

  // Yoga Registry
  if (s.yoga_registry?.length) {
    lines.push('## Yoga Registry')
    lines.push('')
    lines.push('| Yoga | Active | Strength | Houses | Planets | Notes |')
    lines.push('|------|--------|----------|--------|---------|-------|')
    for (const y of s.yoga_registry) {
      const row = [
        y.name ?? '',
        y.active ? 'Active' : 'Dormant',
        y.strength ?? '',
        (y.houses ?? []).join(', '),
        (y.planets ?? []).join(', '),
        y.notes ?? '',
      ].map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')
      lines.push(`| ${row} |`)
    }
    lines.push('')
  }

  // Planet Hierarchy
  if (s.planet_hierarchy?.length) {
    lines.push('## Planet Strengths')
    lines.push('')
    lines.push('| Planet | Sign | House | Dignity | Shadbala | Role | Net Score |')
    lines.push('|--------|------|-------|---------|----------|------|-----------|')
    for (const p of s.planet_hierarchy) {
      const row = [
        p.name ?? '',
        p.sign ?? '',
        p.house ?? '',
        p.dignity ?? '',
        p.shadbala ?? '',
        p.functional_role ?? '',
        p.net_score ?? '',
      ].map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')
      lines.push(`| ${row} |`)
    }
    lines.push('')
  }

  // Cross-Channel Matrix
  if (s.cross_channel_matrix?.length) {
    lines.push('## Cross-Chart Channel Matrix')
    lines.push('')
    lines.push('| Chart A | Chart B | Interaction | Net Effect | Remarks |')
    lines.push('|---------|---------|-------------|------------|---------|')
    for (const m of s.cross_channel_matrix) {
      const row = [
        m.channel_a ?? '',
        m.channel_b ?? '',
        m.interaction ?? '',
        m.net_effect ?? '',
        m.remarks ?? '',
      ].map((c) => String(c).replace(/\|/g, '\\|')).join(' | ')
      lines.push(`| ${row} |`)
    }
    lines.push('')
  }

  // Confidence Matrix
  if (s.confidence_matrix?.length) {
    lines.push('## Confidence Matrix')
    lines.push('')
    lines.push('| Domain | Confidence | Data Quality | Limiting Factors |')
    lines.push('|--------|------------|--------------|------------------|')
    for (const c of s.confidence_matrix) {
      const row = [
        c.domain ?? '',
        c.confidence !== undefined ? `${c.confidence}%` : '',
        c.data_quality ?? '',
        c.limiting_factors ?? '',
      ].map((val) => String(val).replace(/\|/g, '\\|')).join(' | ')
      lines.push(`| ${row} |`)
    }
    lines.push('')
  }

  // Corrections Applied
  if (s.corrections_applied?.length) {
    lines.push('## Corrections Applied')
    lines.push('')
    for (const c of s.corrections_applied) lines.push(`- ${c}`)
    lines.push('')
  }

  // Footer
  lines.push('---')
  lines.push('*Generated by VedicMojoAI Pipeline v1.0*')
  lines.push('')

  return lines.join('\n')
}

// ─── HTML Generation ────────────────────────────────────────────────

function generateHTML(input: RenderInput): string {
  const { clientName, queryTypes, synthesisJson, overrideApplied } = input

  // Build domain tabs from query types
  const tabs = buildTabs(queryTypes)
  const tabsHTML = tabs.map((tab, i) => {
    const activeClass = i === 0 ? 'active' : ''
    return `<button class="tab-btn ${activeClass}" data-tab="${tab.id}">${tab.label}</button>`
  }).join('\n        ')

  const tabContentHTML = tabs.map((tab, i) => {
    const activeClass = i === 0 ? 'active' : ''
    const content = extractDomainContent(synthesisJson, tab.domain)
    return `
      <div class="tab-content ${activeClass}" id="${tab.id}">
        <h2>${tab.label}</h2>
        <div class="content-body">
          ${content}
        </div>
      </div>`
  }).join('\n')

  const overrideBanner = overrideApplied
    ? `<div class="override-banner">&#9888; Override Applied — Critical errors were overridden by practitioner</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VedicMojoAI Report — ${escapeHtml(clientName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f14; color: #e0e0e0; line-height: 1.6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    .header { text-align: center; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #333; }
    .header h1 { font-size: 2rem; color: #a78bfa; }
    .header .meta { color: #888; font-size: 0.9rem; margin-top: 0.5rem; }
    .override-banner { background: #7c2d12; border: 1px solid #ea580c; color: #fdba74; padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 1.5rem; text-align: center; font-weight: 500; }
    .tabs { display: flex; gap: 0.25rem; margin-bottom: 1.5rem; flex-wrap: wrap; border-bottom: 2px solid #333; }
    .tab-btn { background: transparent; border: none; color: #888; padding: 0.75rem 1.25rem; cursor: pointer; font-size: 0.95rem; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s; }
    .tab-btn:hover { color: #c4b5fd; }
    .tab-btn.active { color: #a78bfa; border-bottom-color: #a78bfa; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .tab-content h2 { font-size: 1.5rem; color: #c4b5fd; margin-bottom: 1rem; }
    .content-body { background: #1a1a24; border-radius: 0.75rem; padding: 1.5rem; border: 1px solid #2a2a3a; }
    /* Score cards */
    .score-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin: 0 0 1.5rem; }
    .score-card { background: #12121e; border: 1px solid #2a2a3a; border-radius: 0.5rem; padding: 1.25rem; text-align: center; }
    .score-value { font-size: 2rem; font-weight: 700; color: #f0a500; }
    .score-label { font-size: 0.8rem; color: #94a3b8; margin-top: 0.25rem; text-transform: capitalize; }
    /* Section headings */
    .section-heading { font-size: 1.1rem; font-weight: 600; color: #c4b5fd; margin: 1.25rem 0 0.6rem; border-bottom: 1px solid #2a2a3a; padding-bottom: 0.25rem; }
    .section-heading:first-child { margin-top: 0; }
    /* Prose paragraphs */
    .prose p { margin-bottom: 0.75rem; font-size: 0.95rem; color: #cbd5e1; line-height: 1.75; }
    .prose p:last-child { margin-bottom: 0; }
    /* Tables */
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; margin-top: 0.5rem; }
    .data-table th { background: #12121e; padding: 0.5rem 0.75rem; text-align: left; color: #94a3b8; font-weight: 600; border-bottom: 1px solid #2a2a3a; }
    .data-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid #1e1e2a; color: #cbd5e1; vertical-align: top; }
    .data-table tr:last-child td { border-bottom: none; }
    .yoga-inactive td { color: #64748b; }
    /* Dignity colours */
    .dignity-exalted { color: #22c55e; font-weight: 600; }
    .dignity-own, .dignity-moolatrikona { color: #60a5fa; font-weight: 600; }
    .dignity-friend { color: #a3e635; }
    .dignity-neutral { color: #94a3b8; }
    .dignity-enemy { color: #f97316; }
    .dignity-debilitated { color: #ef4444; }
    .dignity-neecha-bhanga { color: #facc15; }
    /* Direction badges */
    .badge { display: inline-block; padding: 1px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; vertical-align: middle; }
    .badge-positive { background: #14532d; color: #86efac; }
    .badge-negative { background: #7f1d1d; color: #fca5a5; }
    .badge-neutral   { background: #374151; color: #d1d5db; }
    /* Cashflow timeline */
    .timeline-list { display: flex; flex-direction: column; gap: 0.75rem; }
    .timeline-entry { background: #12121e; border-left: 4px solid #6366f1; padding: 0.9rem 1rem; border-radius: 0 0.4rem 0.4rem 0; }
    .timeline-entry.positive { border-left-color: #22c55e; }
    .timeline-entry.negative { border-left-color: #ef4444; }
    .timeline-entry.neutral  { border-left-color: #94a3b8; }
    .timeline-header { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; margin-bottom: 0.4rem; }
    .timeline-period { font-weight: 700; font-size: 0.95rem; }
    .timeline-dasha { color: #94a3b8; font-size: 0.85rem; }
    .timeline-magnitude { color: #f0a500; font-size: 0.85rem; }
    .timeline-body { font-size: 0.88rem; color: #94a3b8; line-height: 1.6; }
    .timeline-body strong { color: #cbd5e1; }
    /* Health / property info blocks */
    .info-block { background: #12121e; border: 1px solid #2a2a3a; border-radius: 0.4rem; padding: 1rem; margin-bottom: 0.75rem; }
    .info-block-title { font-size: 0.85rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .info-block ul { list-style: none; padding: 0; }
    .info-block ul li { font-size: 0.9rem; color: #cbd5e1; padding: 0.2rem 0; padding-left: 1rem; position: relative; }
    .info-block ul li::before { content: "•"; color: #6366f1; position: absolute; left: 0; }
    /* Financial freedom block */
    .ff-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
    .ff-cell { background: #12121e; border: 1px solid #2a2a3a; border-radius: 0.4rem; padding: 0.75rem; }
    .ff-cell-label { font-size: 0.78rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.25rem; }
    .ff-cell-value { font-size: 0.95rem; color: #e2e8f0; }
    .ff-score { font-size: 1.6rem; font-weight: 700; color: #f0a500; }
    /* Alerts */
    .alert-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .alert-item { background: #3b1a00; border: 1px solid #f97316; border-radius: 0.4rem; padding: 0.6rem 0.9rem; font-size: 0.9rem; color: #fed7aa; }
    /* Confidence matrix */
    .confidence-bar { display: inline-block; height: 6px; border-radius: 3px; background: #6366f1; vertical-align: middle; }
    /* Recommendations */
    .rec-list { list-style: none; padding: 0; counter-reset: rec; display: flex; flex-direction: column; gap: 0.6rem; }
    .rec-list li { counter-increment: rec; display: flex; gap: 0.75rem; font-size: 0.92rem; color: #cbd5e1; line-height: 1.6; }
    .rec-list li::before { content: counter(rec); min-width: 1.6rem; height: 1.6rem; background: #312e81; color: #a5b4fc; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700; flex-shrink: 0; margin-top: 0.05rem; }
    /* Generic definition list fallback */
    dl.fallback { display: grid; grid-template-columns: max-content 1fr; gap: 0.4rem 1rem; font-size: 0.88rem; }
    dl.fallback dt { color: #94a3b8; font-weight: 600; padding-top: 0.1rem; }
    dl.fallback dd { color: #cbd5e1; }
    /* Print */
    @media print {
      body { background: #fff; color: #000; }
      .tabs { display: none; }
      .tab-content { display: block !important; page-break-before: always; }
      .tab-content:first-child { page-break-before: avoid; }
      .content-body { background: #fff; border: 1px solid #ccc; }
      .score-card, .info-block, .ff-cell, .timeline-entry { background: #f5f5f5; border-color: #ccc; }
      .section-heading, .tab-content h2 { color: #333; }
      .score-value, .timeline-period, .ff-score { color: #b45309; }
      .data-table th { background: #f0f0f0; color: #555; }
      .data-table td { color: #222; }
    }
    @media (max-width: 768px) {
      .container { padding: 1rem; }
      .tabs { flex-direction: column; }
      .score-grid, .ff-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <h1>VedicMojoAI Analysis Report</h1>
      <div class="meta">${escapeHtml(clientName)} &mdash; Generated ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      <div class="meta" style="margin-top:0.25rem">
        <button onclick="window.print()" style="background:#312e81;color:#a5b4fc;border:none;padding:0.3rem 0.9rem;border-radius:0.3rem;cursor:pointer;font-size:0.8rem">&#128424; Print / Save PDF</button>
      </div>
    </header>

    ${overrideBanner}

    <nav class="tabs">
      ${tabsHTML}
    </nav>

    <main>
      ${tabContentHTML}
    </main>

    <footer style="text-align:center;margin-top:3rem;padding-top:1rem;border-top:1px solid #333;color:#666;font-size:0.8rem">
      <p>Generated by VedicMojoAI Pipeline v1.0</p>
    </footer>
  </div>

  <script>
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      });
    });
  </script>
</body>
</html>`
}

// ─── Tab Definitions ────────────────────────────────────────────────

interface TabDef {
  id: string
  label: string
  domain: string
}

function buildTabs(queryTypes: string[]): TabDef[] {
  const tabs: TabDef[] = []

  const domainTabs: Record<string, TabDef> = {
    health:   { id: 'tab-health',   label: 'Health',   domain: 'health' },
    wealth:   { id: 'tab-wealth',   label: 'Wealth',   domain: 'wealth' },
    career:   { id: 'tab-career',   label: 'Career',   domain: 'career' },
    marriage: { id: 'tab-marriage', label: 'Marriage', domain: 'marriage' },
    property: { id: 'tab-property', label: 'Property', domain: 'property' },
  }

  // Add domain tabs based on query types
  for (const qt of queryTypes) {
    if (qt === 'full' || qt === 'generic') {
      tabs.push(...Object.values(domainTabs))
      break
    }
    if (domainTabs[qt]) {
      tabs.push(domainTabs[qt])
    }
  }

  // Always present
  tabs.push({ id: 'tab-dasha',   label: 'Dasha Timeline', domain: 'dasha' })
  tabs.push({ id: 'tab-planets', label: 'Planets',         domain: 'planets' })
  tabs.push({ id: 'tab-yogas',   label: 'Yogas',           domain: 'yogas' })
  tabs.push({ id: 'tab-alerts',  label: 'Alerts & Confidence', domain: 'alerts' })

  // Summary always first
  tabs.unshift({ id: 'tab-summary', label: 'Summary', domain: 'summary' })

  return tabs
}

// ─── Domain Content Router ──────────────────────────────────────────

function extractDomainContent(
  synthesisJson: Record<string, unknown>,
  domain: string
): string {
  // Cast to the known 4C shape — fields are all optional so partial data is fine
  const s = synthesisJson as Synthesis4C

  switch (domain) {
    case 'summary':
      return renderSummary(s)
    case 'health':
      return renderHealth(s)
    case 'wealth':
      return renderWealth(s)
    case 'career':
      return renderCareer(s)
    case 'marriage':
      return renderMarriage(s)
    case 'property':
      return renderProperty(s)
    case 'dasha':
      return renderDasha(s)
    case 'planets':
      return renderPlanetHierarchy(s.planet_hierarchy)
    case 'yogas':
      return renderYogaRegistry(s.yoga_registry)
    case 'alerts':
      return renderAlertsAndConfidence(s)
    default:
      return renderGenericObject(synthesisJson)
  }
}

// ─── Section Renderers ──────────────────────────────────────────────

function renderSummary(s: Synthesis4C): string {
  const parts: string[] = []

  if (s.scores) {
    parts.push(renderScoreCards(s.scores))
  }

  if (s.executive_summary) {
    parts.push(
      `<h3 class="section-heading">Executive Summary</h3>` +
      renderProse(s.executive_summary)
    )
  }

  if (s.lagna_lord_ruling) {
    parts.push(
      `<h3 class="section-heading">Lagna Lord</h3>` +
      renderProse(s.lagna_lord_ruling)
    )
  }

  if (s.yogakaraka_status) {
    parts.push(
      `<h3 class="section-heading">Yogakaraka Status</h3>` +
      renderProse(s.yogakaraka_status)
    )
  }

  if (s.atma_karaka_theme) {
    parts.push(
      `<h3 class="section-heading">Atma Karaka Theme</h3>` +
      renderProse(s.atma_karaka_theme)
    )
  }

  if (s.sade_sati_impact) {
    parts.push(
      `<h3 class="section-heading">Sade Sati Impact</h3>` +
      renderProse(s.sade_sati_impact)
    )
  }

  if (s.priority_alerts?.length) {
    const items = s.priority_alerts.map(a => `<li class="alert-item">${escapeHtml(a)}</li>`).join('')
    parts.push(`<h3 class="section-heading">Priority Alerts</h3><ul class="alert-list">${items}</ul>`)
  }

  if (s.financial_freedom) {
    parts.push(
      `<h3 class="section-heading">Financial Freedom</h3>` +
      renderFinancialFreedom(s.financial_freedom)
    )
  }

  if (s.cashflow_timeline?.length) {
    parts.push(
      `<h3 class="section-heading">Cashflow Timeline</h3>` +
      renderCashflowTimeline(s.cashflow_timeline)
    )
  }

  if (s.corrections_applied?.length) {
    const items = s.corrections_applied.map(c => `<li>${escapeHtml(c)}</li>`).join('')
    parts.push(`<h3 class="section-heading">Corrections Applied</h3><ul class="rec-list">${items}</ul>`)
  }

  return parts.length ? parts.join('\n') : '<p>No summary data available.</p>'
}

function renderHealth(s: Synthesis4C): string {
  const parts: string[] = []
  const h = s.health_analysis

  if (!h) return '<p>No health analysis data available.</p>'

  if (h.score !== undefined) {
    parts.push(`
      <div class="info-block">
        <div class="info-block-title">Health Resilience Score</div>
        <div class="score-value" style="font-size:1.8rem">${h.score}<span style="font-size:1rem;color:#94a3b8"> / 10</span></div>
      </div>`)
  }

  if (h.primary_risks?.length) {
    const items = h.primary_risks.map(r => `<li>${escapeHtml(r)}</li>`).join('')
    parts.push(`
      <div class="info-block">
        <div class="info-block-title">Primary Risks</div>
        <ul>${items}</ul>
      </div>`)
  }

  if (h.protective_factors?.length) {
    const items = h.protective_factors.map(f => `<li>${escapeHtml(f)}</li>`).join('')
    parts.push(`
      <div class="info-block">
        <div class="info-block-title">Protective Factors</div>
        <ul>${items}</ul>
      </div>`)
  }

  return parts.length ? parts.join('\n') : '<p>No health analysis data available.</p>'
}

function renderWealth(s: Synthesis4C): string {
  const parts: string[] = []

  if (s.scores) {
    const w = s.scores
    const wealthCards = [
      { label: 'Wealth Potential', value: w.wealth_potential, unit: '/100' },
      { label: 'Wealth Retention', value: w.wealth_retention, unit: '/100' },
    ]
    const items = wealthCards.map(c => `
      <div class="score-card">
        <div class="score-value">${c.value ?? '—'}</div>
        <div class="score-label">${c.label}${c.unit}</div>
      </div>`).join('')
    parts.push(`<div class="score-grid">${items}</div>`)
  }

  if (s.financial_freedom) {
    parts.push(
      `<h3 class="section-heading">Financial Freedom</h3>` +
      renderFinancialFreedom(s.financial_freedom)
    )
  }

  if (s.cashflow_timeline?.length) {
    parts.push(
      `<h3 class="section-heading">Cashflow Timeline</h3>` +
      renderCashflowTimeline(s.cashflow_timeline)
    )
  }

  return parts.length ? parts.join('\n') : '<p>No wealth data available.</p>'
}

function renderCareer(s: Synthesis4C): string {
  // 4C has no dedicated career object — surface cross-channel matrix and planet hierarchy
  const parts: string[] = []

  if (s.executive_summary) {
    parts.push(
      `<h3 class="section-heading">Overall Context</h3>` +
      renderProse(s.executive_summary)
    )
  }

  const careerChannels = s.cross_channel_matrix?.filter(c =>
    [c.channel_a, c.channel_b].some(ch =>
      ['D10', 'career', 'profession'].some(k => ch.toLowerCase().includes(k))
    )
  )
  if (careerChannels?.length) {
    parts.push(
      `<h3 class="section-heading">Career-Relevant Chart Interactions (D10)</h3>` +
      renderCrossChannelMatrix(careerChannels)
    )
  }

  if (s.planet_hierarchy?.length) {
    parts.push(
      `<h3 class="section-heading">Planet Strengths</h3>` +
      renderPlanetHierarchy(s.planet_hierarchy)
    )
  }

  if (!parts.length) {
    return '<p>Career analysis is synthesised across wave outputs. See the Summary and Planets tabs for detailed findings.</p>'
  }

  return parts.join('\n')
}

function renderMarriage(s: Synthesis4C): string {
  // 4C has no dedicated marriage object — surface cross-channel matrix and planet hierarchy
  const parts: string[] = []

  const marriageChannels = s.cross_channel_matrix?.filter(c =>
    [c.channel_a, c.channel_b].some(ch =>
      ['D9', 'navamsa', 'marriage', 'D7'].some(k => ch.toLowerCase().includes(k))
    )
  )
  if (marriageChannels?.length) {
    parts.push(
      `<h3 class="section-heading">Marriage-Relevant Chart Interactions (D9/D7)</h3>` +
      renderCrossChannelMatrix(marriageChannels)
    )
  }

  if (s.yogakaraka_status) {
    parts.push(
      `<h3 class="section-heading">Yogakaraka &amp; Partnership Strength</h3>` +
      renderProse(s.yogakaraka_status)
    )
  }

  if (!parts.length) {
    return '<p>Marriage analysis is synthesised across wave outputs. See the Summary and Yogas tabs for detailed findings.</p>'
  }

  return parts.join('\n')
}

function renderProperty(s: Synthesis4C): string {
  const p = s.property_analysis
  if (!p) return '<p>No property analysis data available.</p>'

  const parts: string[] = []

  if (p.d4_assessment) {
    parts.push(
      `<h3 class="section-heading">D4 Property Assessment</h3>` +
      renderProse(p.d4_assessment)
    )
  }

  if (p.best_acquisition_periods?.length) {
    const items = p.best_acquisition_periods.map(period =>
      `<li class="alert-item" style="background:#0f2a1a;border-color:#22c55e;color:#86efac">${escapeHtml(period)}</li>`
    ).join('')
    parts.push(
      `<h3 class="section-heading">Best Acquisition Periods</h3>` +
      `<ul class="alert-list">${items}</ul>`
    )
  }

  return parts.length ? parts.join('\n') : '<p>No property analysis data available.</p>'
}

function renderDasha(s: Synthesis4C): string {
  const parts: string[] = []

  if (s.cashflow_timeline?.length) {
    parts.push(
      `<h3 class="section-heading">Cashflow Timeline by Dasha</h3>` +
      renderCashflowTimeline(s.cashflow_timeline)
    )
  }

  if (s.sade_sati_impact) {
    parts.push(
      `<h3 class="section-heading">Sade Sati Impact</h3>` +
      renderProse(s.sade_sati_impact)
    )
  }

  return parts.length ? parts.join('\n') : '<p>No dasha timeline data available.</p>'
}

function renderAlertsAndConfidence(s: Synthesis4C): string {
  const parts: string[] = []

  if (s.priority_alerts?.length) {
    const items = s.priority_alerts.map(a => `<li class="alert-item">${escapeHtml(a)}</li>`).join('')
    parts.push(`<h3 class="section-heading">Priority Alerts</h3><ul class="alert-list">${items}</ul>`)
  }

  if (s.confidence_matrix?.length) {
    parts.push(
      `<h3 class="section-heading">Confidence Matrix</h3>` +
      renderConfidenceMatrix(s.confidence_matrix)
    )
  }

  if (s.corrections_applied?.length) {
    const items = s.corrections_applied.map(c => `<li>${escapeHtml(c)}</li>`).join('')
    parts.push(`<h3 class="section-heading">Corrections Applied</h3><ul class="rec-list">${items}</ul>`)
  }

  if (s.cross_channel_matrix?.length) {
    parts.push(
      `<h3 class="section-heading">Cross-Chart Channel Matrix</h3>` +
      renderCrossChannelMatrix(s.cross_channel_matrix)
    )
  }

  return parts.length ? parts.join('\n') : '<p>No alert or confidence data available.</p>'
}

// ─── Component Helpers ──────────────────────────────────────────────

function renderScoreCards(scores: Synthesis4CScores): string {
  const cards = [
    { label: 'Wealth Potential',    value: scores.wealth_potential,    unit: '/100' },
    { label: 'Wealth Retention',    value: scores.wealth_retention,    unit: '/100' },
    { label: 'Financial Freedom',   value: scores.financial_freedom_pct, unit: '%' },
    { label: 'Health Resilience',   value: scores.health_resilience,   unit: '/10' },
  ]
  const items = cards.map(c => `
    <div class="score-card">
      <div class="score-value">${c.value ?? '—'}</div>
      <div class="score-label">${c.label} <span style="font-size:0.75rem">${c.unit}</span></div>
    </div>`).join('')
  return `<div class="score-grid">${items}</div>`
}

function renderFinancialFreedom(ff: NonNullable<Synthesis4C['financial_freedom']>): string {
  return `
    <div class="ff-grid">
      <div class="ff-cell">
        <div class="ff-cell-label">Freedom Score</div>
        <div class="ff-score">${ff.score_pct ?? '—'}<span style="font-size:1rem;color:#94a3b8">%</span></div>
      </div>
      <div class="ff-cell">
        <div class="ff-cell-label">Earliest Window</div>
        <div class="ff-cell-value">${escapeHtml(ff.earliest_window ?? '—')}</div>
      </div>
      <div class="ff-cell">
        <div class="ff-cell-label">Primary Enabler</div>
        <div class="ff-cell-value">${escapeHtml(ff.primary_enabler ?? '—')}</div>
      </div>
      <div class="ff-cell">
        <div class="ff-cell-label">Primary Risk</div>
        <div class="ff-cell-value" style="color:#fca5a5">${escapeHtml(ff.primary_risk ?? '—')}</div>
      </div>
    </div>`
}

function renderCashflowTimeline(entries: CashflowEntry[]): string {
  if (!entries.length) return '<p>No cashflow timeline data.</p>'
  const items = entries.map(e => {
    const dir = (e.direction ?? '').toLowerCase()
    const dirClass = dir === 'positive' ? 'positive' : dir === 'negative' ? 'negative' : 'neutral'
    const badgeClass = `badge-${dirClass}`
    return `
    <div class="timeline-entry ${dirClass}">
      <div class="timeline-header">
        <span class="timeline-period">${escapeHtml(e.period ?? '')}</span>
        <span class="timeline-dasha">${escapeHtml(e.dasha ?? '')}</span>
        <span class="badge ${badgeClass}">${escapeHtml(e.direction ?? '')}</span>
        <span class="timeline-magnitude">${escapeHtml(e.magnitude ?? '')}</span>
      </div>
      <div class="timeline-body">
        <strong>Driver:</strong> ${escapeHtml(e.key_driver ?? '—')}<br>
        <strong>Caution:</strong> ${escapeHtml(e.caution ?? '—')}
      </div>
    </div>`
  }).join('')
  return `<div class="timeline-list">${items}</div>`
}

function renderYogaRegistry(yogas: YogaEntry[] | undefined): string {
  if (!yogas?.length) return '<p>No yoga data available.</p>'
  const sorted = [...yogas].sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0))
  const rows = sorted.map(y => `
    <tr class="${y.active ? '' : 'yoga-inactive'}">
      <td>${escapeHtml(y.name ?? '')}</td>
      <td>${y.active ? '<span class="badge badge-positive">Active</span>' : '<span class="badge badge-neutral">Dormant</span>'}</td>
      <td>${escapeHtml(y.strength ?? '')}</td>
      <td>${(y.houses ?? []).join(', ')}</td>
      <td>${(y.planets ?? []).map(escapeHtml).join(', ')}</td>
      <td>${escapeHtml(y.notes ?? '')}</td>
    </tr>`).join('')
  return `
    <table class="data-table">
      <thead><tr>
        <th>Yoga</th><th>Status</th><th>Strength</th>
        <th>Houses</th><th>Planets</th><th>Notes</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

function renderPlanetHierarchy(planets: PlanetEntry[] | undefined): string {
  if (!planets?.length) return '<p>No planet hierarchy data available.</p>'
  const dignityClass: Record<string, string> = {
    exalted: 'dignity-exalted',
    'own sign': 'dignity-own',
    own: 'dignity-own',
    moolatrikona: 'dignity-moolatrikona',
    friend: 'dignity-friend',
    neutral: 'dignity-neutral',
    enemy: 'dignity-enemy',
    debilitated: 'dignity-debilitated',
    'neecha-bhanga': 'dignity-neecha-bhanga',
  }
  const rows = planets.map((p, i) => {
    const cls = dignityClass[(p.dignity ?? '').toLowerCase()] ?? ''
    return `
    <tr>
      <td style="color:#94a3b8;font-size:0.8rem">${i + 1}</td>
      <td>${escapeHtml(p.name ?? '')}</td>
      <td>${escapeHtml(p.sign ?? '')}</td>
      <td>${p.house ?? ''}</td>
      <td class="${cls}">${escapeHtml(p.dignity ?? '')}</td>
      <td>${escapeHtml(String(p.shadbala ?? ''))}</td>
      <td>${escapeHtml(p.functional_role ?? '')}</td>
      <td>${escapeHtml(String(p.net_score ?? ''))}</td>
    </tr>`
  }).join('')
  return `
    <table class="data-table">
      <thead><tr>
        <th>#</th><th>Planet</th><th>Sign</th><th>House</th>
        <th>Dignity</th><th>Shadbala</th><th>Role</th><th>Score</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

function renderCrossChannelMatrix(matrix: CrossChannelEntry[]): string {
  if (!matrix.length) return '<p>No cross-channel data.</p>'
  const rows = matrix.map(m => {
    const dir = (m.net_effect ?? '').toLowerCase()
    const badgeClass = dir === 'positive' ? 'badge-positive' : dir === 'negative' ? 'badge-negative' : 'badge-neutral'
    return `
    <tr>
      <td>${escapeHtml(m.channel_a ?? '')}</td>
      <td>${escapeHtml(m.channel_b ?? '')}</td>
      <td>${escapeHtml(m.interaction ?? '')}</td>
      <td><span class="badge ${badgeClass}">${escapeHtml(m.net_effect ?? '')}</span></td>
      <td>${escapeHtml(m.remarks ?? '')}</td>
    </tr>`
  }).join('')
  return `
    <table class="data-table">
      <thead><tr>
        <th>Chart A</th><th>Chart B</th><th>Interaction</th>
        <th>Net Effect</th><th>Remarks</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

function renderConfidenceMatrix(matrix: ConfidenceEntry[]): string {
  if (!matrix.length) return '<p>No confidence data.</p>'
  const rows = matrix.map(m => {
    const pct = typeof m.confidence === 'number' ? Math.min(100, Math.max(0, m.confidence)) : 0
    const bar = `<span class="confidence-bar" style="width:${pct}px;max-width:100px"></span>`
    return `
    <tr>
      <td>${escapeHtml(m.domain ?? '')}</td>
      <td>${pct}% ${bar}</td>
      <td>${escapeHtml(m.data_quality ?? '')}</td>
      <td>${escapeHtml(m.limiting_factors ?? '')}</td>
    </tr>`
  }).join('')
  return `
    <table class="data-table">
      <thead><tr>
        <th>Domain</th><th>Confidence</th><th>Data Quality</th><th>Limiting Factors</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

/** Render a plain string as paragraphs, preserving double-newline breaks. */
function renderProse(text: string): string {
  const escaped = escapeHtml(text)
  const paras = escaped.split(/\n\n+/).map(p =>
    `<p>${p.replace(/\n/g, '<br>')}</p>`
  ).join('')
  return `<div class="prose">${paras}</div>`
}

/**
 * Generic fallback: render an unknown object as a definition list rather than
 * raw JSON. Used when a domain key has no specific renderer.
 */
function renderGenericObject(obj: unknown): string {
  if (obj === null || obj === undefined) return '<p>No content available.</p>'
  if (typeof obj === 'string') return renderProse(obj)
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    return `<p>${escapeHtml(String(obj))}</p>`
  }
  const entries = Object.entries(obj as Record<string, unknown>)
  if (!entries.length) return '<p>No content.</p>'
  const items = entries.map(([k, v]) => {
    const label = k.replace(/_/g, ' ')
    const val = v === null || v === undefined
      ? '<em>—</em>'
      : typeof v === 'string'
        ? escapeHtml(v)
        : Array.isArray(v)
          ? `<em>${v.length} item${v.length !== 1 ? 's' : ''}</em>`
          : typeof v === 'object'
            ? `<em>[object]</em>`
            : escapeHtml(String(v))
    return `<dt>${escapeHtml(label)}</dt><dd>${val}</dd>`
  }).join('')
  return `<dl class="fallback">${items}</dl>`
}

// ─── Utilities ──────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
