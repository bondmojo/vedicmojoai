import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface ModelSeed {
  waveId: string
  modelId: string
  provider: string
  temperature: number
  maxTokens: number
  promptVersion: string
}

const modelConfigs: ModelSeed[] = [
  // Wave 1 agents — fast extraction with Haiku
  { waveId: '1A', modelId: 'claude-haiku-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 4096, promptVersion: 'v1.0' },
  { waveId: '1B', modelId: 'claude-haiku-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 4096, promptVersion: 'v1.0' },
  { waveId: '1C', modelId: 'claude-haiku-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 4096, promptVersion: 'v1.0' },
  { waveId: '1D', modelId: 'claude-haiku-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 4096, promptVersion: 'v1.0' },

  // Wave 2 agents — domain analysis with Sonnet
  { waveId: '2A', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: '2B', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: '2C', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: '2D', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: '2E', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: '2F', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: '2G', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },

  // Wave 3 agents — cross-domain synthesis with Sonnet
  { waveId: '3A', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: '3B', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: '3C', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: '3D', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },

  // Wave 4 QA — deterministic validation with Sonnet
  { waveId: '4X', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.0, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: '4A', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.0, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: '4B', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.0, maxTokens: 8192, promptVersion: 'v1.0' },

  // Wave 4 Synthesis — final report generation with Opus
  { waveId: '4C', modelId: 'claude-opus-4-5', provider: 'anthropic', temperature: 0.0, maxTokens: 16384, promptVersion: 'v1.0' },

  // Verification agent
  { waveId: 'VERIFICATION', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.0, maxTokens: 8192, promptVersion: 'v1.0' },

  // Duration Analysis agents — sequential 3-agent pipeline (DA-2 is conditional on symptoms).
  // The domain step is registry-driven (engine/durationAnalysis/registry.ts): one row per
  // domain agent. The legacy 'DA-1' row is kept for backward compatibility.
  { waveId: 'DA-1', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: 'DA1-HEALTH',   modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: 'DA1-CAREER',   modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: 'DA1-WEALTH',   modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: 'DA1-MARRIAGE', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: 'DA1-PROPERTY', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: 'DA1-CASHFLOW', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },
  { waveId: 'DA-2', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.0, maxTokens: 4096, promptVersion: 'v1.0' },
  { waveId: 'DA-3', modelId: 'claude-sonnet-4-5', provider: 'anthropic', temperature: 0.3, maxTokens: 8192, promptVersion: 'v1.0' },
]

async function main() {
  console.log('Seeding ModelConfig table...')

  for (const config of modelConfigs) {
    await prisma.modelConfig.upsert({
      where: { waveId: config.waveId },
      update: {
        modelId: config.modelId,
        provider: config.provider,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        promptVersion: config.promptVersion,
      },
      create: {
        waveId: config.waveId,
        modelId: config.modelId,
        provider: config.provider,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        promptVersion: config.promptVersion,
      },
    })

    console.log(`  Upserted: ${config.waveId} → ${config.modelId}`)
  }

  console.log(`\nDone. ${modelConfigs.length} model configs seeded.`)
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
