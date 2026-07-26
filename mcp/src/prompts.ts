/**
 * prompts.ts — Ready-to-run analysis workflows (executed by Claude Desktop, $0 API).
 *
 * Each MCP Prompt is a "recipe": it embeds the domain rubric (fetched from the
 * knowledge route) and instructs Claude which deterministic tools to call for
 * the given client, then how to structure the reading. Claude Desktop does the
 * reasoning — the MCP never calls a paid LLM.
 *
 * MCP prompt arguments are strings; optional args use z.string().optional().
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { api } from './http.js'

type Domain = 'career' | 'health' | 'wealth' | 'marriage' | 'property' | 'cashflow'
const DOMAINS: Domain[] = ['career', 'health', 'wealth', 'marriage', 'property', 'cashflow']

async function loadRubric(domain: Domain): Promise<string> {
  try {
    return await api.getText(`/api/knowledge/domains/${domain}`)
  } catch (err) {
    return `(Could not load the ${domain} rubric: ${
      err instanceof Error ? err.message : String(err)
    }. Call get_domain_knowledge("${domain}") once the app is running.)`
  }
}

function userMessage(text: string) {
  return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] }
}

const COMPUTE_FIRST =
  'COMPUTE-FIRST CONTRACT: the engine scores (0–100), intensity, favorable flags, and peak ' +
  'windows are authoritative. Narrate and explain them — never override or invent different scores.'

export function registerPrompts(server: McpServer): void {
  // ── Per-domain natal + timeline readings ──────────────────────────
  for (const domain of DOMAINS) {
    server.registerPrompt(
      `analyze_${domain}`,
      {
        title: `Analyze ${domain}`,
        description: `Produce a ${domain} reading for a client using the house rubric + deterministic engine data.`,
        argsSchema: {
          clientId: z.string().uuid().describe('UnifiedChart id (from list_clients)'),
          dateFrom: z.string().optional().describe('YYYY-MM-DD; default: today'),
          dateTo: z.string().optional().describe('YYYY-MM-DD; default: +3 years'),
        },
      },
      async (a) => {
        const rubric = await loadRubric(domain)
        const range =
          a.dateFrom || a.dateTo
            ? `Focus window: ${a.dateFrom ?? 'today'} → ${a.dateTo ?? '+3 years'}.`
            : 'Use the default ~3-year window.'
        return userMessage(
          [
            `You are a senior Vedic astrologer. Produce a ${domain.toUpperCase()} analysis for the client whose chart id is "${a.clientId}".`,
            '',
            'Steps:',
            `1. Call get_domain_dataset(chartId="${a.clientId}", domain="${domain}"${a.dateFrom ? `, dateFrom="${a.dateFrom}"` : ''}${a.dateTo ? `, dateTo="${a.dateTo}"` : ''}) — this returns the ${domain}-relevant vargas, significators, strengths, AND the scored MD/AD/PD timeline.`,
            `2. If you need more, call get_client_chart or the focused extractors (get_shadbala, get_divisional_chart, get_jaimini).`,
            '',
            range,
            COMPUTE_FIRST,
            '',
            'Apply this rubric strictly:',
            '--- DOMAIN RUBRIC ---',
            rubric,
            '--- END RUBRIC ---',
            '',
            'Output: (a) overall assessment, (b) key strengths & risks with chart evidence, (c) best periods and caution windows from the timeline (cite the engine scores/peaks), (d) a plain-language verdict. Do not present raw scores as calibrated probabilities.',
          ].join('\n')
        )
      }
    )
  }

  // ── Duration timeline (explicit range, one domain) ────────────────
  server.registerPrompt(
    'duration_timeline',
    {
      title: 'Duration timeline reading',
      description: 'Narrate the deterministic dasha-period timeline for a client, domain, and date range.',
      argsSchema: {
        clientId: z.string().uuid().describe('UnifiedChart id'),
        domain: z.enum(['health', 'career', 'wealth', 'marriage', 'property', 'cashflow']),
        dateFrom: z.string().describe('YYYY-MM-DD'),
        dateTo: z.string().describe('YYYY-MM-DD'),
      },
    },
    async (a) => {
      const rubric = await loadRubric(a.domain as Domain)
      return userMessage(
        [
          `Produce a ${a.domain.toUpperCase()} duration reading for chart "${a.clientId}" over ${a.dateFrom} → ${a.dateTo}.`,
          '',
          `1. Call get_timeline_periods(chartId="${a.clientId}", dateFrom="${a.dateFrom}", dateTo="${a.dateTo}", category="${a.domain}").`,
          '2. Walk the periods in order. For each significant peak (favorable or stress), explain WHY using the lords, activated yogas, and transit overlay.',
          '',
          COMPUTE_FIRST,
          '',
          '--- DOMAIN RUBRIC ---',
          rubric,
          '--- END RUBRIC ---',
          '',
          'Output a period-by-period narrative for the peaks, then a short overall trajectory. Cite the engine score for each period you highlight.',
        ].join('\n')
      )
    }
  )

  // ── Holistic natal reading ────────────────────────────────────────
  server.registerPrompt(
    'analyze_full_chart',
    {
      title: 'Full natal reading',
      description: 'Holistic natal synthesis for a client from the deterministic chart data.',
      argsSchema: { clientId: z.string().uuid().describe('UnifiedChart id') },
    },
    async (a) =>
      userMessage(
        [
          `You are a senior Vedic astrologer. Produce a holistic natal reading for chart "${a.clientId}".`,
          '',
          'Gather the foundation first:',
          `1. get_client_chart(chartId="${a.clientId}") for lagna, planets, house lords.`,
          `2. get_shadbala and get_jaimini for planetary strength and chara karakas.`,
          `3. get_active_dasha(chartId="${a.clientId}") for the current period, and get_dasha_tree for the arc.`,
          '',
          'Then synthesize: lagna & lagna lord, functional benefics/malefics, key yogas, atmakaraka theme, current dasha emphasis, and the 2–3 strongest life themes. Ground every claim in the chart data you fetched; note where evidence is mixed.',
        ].join('\n')
      )
  )
}
