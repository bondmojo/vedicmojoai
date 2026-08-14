/**
 * MCP get_gochar tool — registration and forwarding contract.
 *
 * The MCP server is intentionally only an HTTP adapter. These tests exercise
 * the registered handler directly so no astronomy code, database, or live
 * Next.js server is involved.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerTools } from '../mcp/src/tools.js'

type McpToolServer = Parameters<typeof registerTools>[0]
type McpApiClient = Parameters<typeof registerTools>[1]

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

interface RegisteredTool {
  config: {
    title?: string
    description?: string
    inputSchema: Record<string, { isOptional?: () => boolean }>
  }
  handler: (input: Record<string, unknown>) => Promise<ToolResult>
}

const CHART_ID = 'b1dd76ce-4a90-4a81-8f47-38d3913cbd5d'
const BIRTH_DATA = {
  date: '1990-04-27',
  time: '12:00:00',
  timezone: 5.5,
  latitude: 28.6139,
  longitude: 77.209,
  sunriseMode: 'precise',
}

function makeHarness(): { tools: Map<string, RegisteredTool>; api: McpApiClient } {
  const tools = new Map<string, RegisteredTool>()
  const server = {
    registerTool(
      name: string,
      config: RegisteredTool['config'],
      handler: RegisteredTool['handler']
    ): void {
      tools.set(name, { config, handler })
    },
  } as unknown as McpToolServer
  const api = {
    get: vi.fn(),
    post: vi.fn(),
    getText: vi.fn(),
  } as unknown as McpApiClient

  registerTools(server, api)
  return { tools, api }
}

describe('MCP get_gochar', () => {
  let tools: Map<string, RegisteredTool>
  let api: McpApiClient

  beforeEach(() => {
    vi.clearAllMocks()
    ;({ tools, api } = makeHarness())
  })

  it('registers the expected schema and required UTC/Moon disclosure', () => {
    const tool = tools.get('get_gochar')

    expect(tool).toBeDefined()
    expect(tool?.config.title).toBe('Get date-ranged Gochar')
    expect(tool?.config.description).toContain('UTC')
    expect(tool?.config.description).toContain('Moon is excluded unless `includeMoon: true`')
    expect(tool?.config.description).toContain('`includedGrahas`')
    expect(tool?.config.inputSchema.chartId).toBeDefined()
    expect(tool?.config.inputSchema.birthData).toBeDefined()
    expect(tool?.config.inputSchema.dateFrom).toBeDefined()
    expect(tool?.config.inputSchema.dateTo).toBeDefined()
    expect(tool?.config.inputSchema.includeMoon?.isOptional?.()).toBe(true)
  })

  it('maps chartId to unifiedChartId and preserves omitted includeMoon', async () => {
    vi.mocked(api.post).mockResolvedValue({ moonIncluded: false, includedGrahas: ['Sun'] })
    const tool = tools.get('get_gochar')!

    const result = await tool.handler({
      chartId: CHART_ID,
      dateFrom: '2024-01-01',
      dateTo: '2024-01-01',
    })

    expect(api.post).toHaveBeenCalledWith('/api/gochar', {
      unifiedChartId: CHART_ID,
      dateFrom: '2024-01-01',
      dateTo: '2024-01-01',
    })
    expect(result.isError).toBeUndefined()
    expect(result.content[0].text).toContain('"moonIncluded": false')
  })

  it('passes unsaved birthData through unchanged and forwards includeMoon when supplied', async () => {
    vi.mocked(api.post).mockResolvedValue({ moonIncluded: true, includedGrahas: ['Moon'] })
    const tool = tools.get('get_gochar')!

    await tool.handler({
      birthData: BIRTH_DATA,
      dateFrom: '2024-01-01T06:00:00Z',
      dateTo: '2024-01-02T06:00:00Z',
      includeMoon: true,
    })

    expect(api.post).toHaveBeenCalledWith('/api/gochar', {
      birthData: BIRTH_DATA,
      dateFrom: '2024-01-01T06:00:00Z',
      dateTo: '2024-01-02T06:00:00Z',
      includeMoon: true,
    })
    const payload = vi.mocked(api.post).mock.calls[0][1] as { birthData: unknown }
    expect(payload.birthData).toBe(BIRTH_DATA)
  })

  it.each([
    ['no chart reference', { dateFrom: '2024-01-01', dateTo: '2024-01-01' }],
    ['two chart references', { chartId: CHART_ID, birthData: BIRTH_DATA, dateFrom: '2024-01-01', dateTo: '2024-01-01' }],
  ])('rejects %s before forwarding', async (_label, input) => {
    const tool = tools.get('get_gochar')!

    const result = await tool.handler(input)

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('exactly one')
    expect(api.post).not.toHaveBeenCalled()
  })
})
