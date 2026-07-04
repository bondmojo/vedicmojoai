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
    ? `<div class="override-banner">⚠ Override Applied — Critical errors were overridden by practitioner</div>`
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
    .content-body pre { white-space: pre-wrap; word-wrap: break-word; font-size: 0.85rem; line-height: 1.7; }
    .score-badge { display: inline-block; background: #312e81; color: #a78bfa; padding: 0.25rem 0.75rem; border-radius: 1rem; font-size: 0.8rem; font-weight: 600; margin: 0.25rem; }
    .finding { margin-bottom: 1rem; padding: 1rem; background: #12121a; border-radius: 0.5rem; border-left: 3px solid #6366f1; }
    .finding h4 { color: #a5b4fc; margin-bottom: 0.5rem; }
    footer { text-align: center; margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #333; color: #666; font-size: 0.8rem; }
    @media (max-width: 768px) { .container { padding: 1rem; } .tabs { flex-direction: column; } }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <h1>VedicMojoAI Analysis Report</h1>
      <div class="meta">${escapeHtml(clientName)} — Generated ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </header>

    ${overrideBanner}

    <nav class="tabs">
      ${tabsHTML}
    </nav>

    <main>
      ${tabContentHTML}
    </main>

    <footer>
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

// ─── Helpers ────────────────────────────────────────────────────────

interface TabDef {
  id: string
  label: string
  domain: string
}

function buildTabs(queryTypes: string[]): TabDef[] {
  const tabs: TabDef[] = []

  const domainTabs: Record<string, TabDef> = {
    health: { id: 'tab-health', label: 'Health', domain: 'health' },
    wealth: { id: 'tab-wealth', label: 'Wealth', domain: 'wealth' },
    career: { id: 'tab-career', label: 'Career', domain: 'career' },
    marriage: { id: 'tab-marriage', label: 'Marriage', domain: 'marriage' },
    property: { id: 'tab-property', label: 'Property', domain: 'property' },
  }

  // Add domain tabs based on query types
  for (const qt of queryTypes) {
    if (qt === 'full' || qt === 'generic') {
      // Add all available tabs
      tabs.push(...Object.values(domainTabs))
      break
    }
    if (domainTabs[qt]) {
      tabs.push(domainTabs[qt])
    }
  }

  // Dasha tab is always present
  tabs.push({ id: 'tab-dasha', label: 'Dasha Timeline', domain: 'dasha' })

  // Summary tab always first
  tabs.unshift({ id: 'tab-summary', label: 'Summary', domain: 'summary' })

  return tabs
}

function extractDomainContent(
  synthesisJson: Record<string, unknown>,
  domain: string
): string {
  // Try to extract domain-specific content from synthesis
  const domainData = synthesisJson[domain] ?? synthesisJson

  if (typeof domainData === 'string') {
    return `<pre>${escapeHtml(domainData)}</pre>`
  }

  // Format JSON findings as readable HTML
  return `<pre>${escapeHtml(JSON.stringify(domainData, null, 2))}</pre>`
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
