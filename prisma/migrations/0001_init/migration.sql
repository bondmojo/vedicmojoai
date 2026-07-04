-- CreateTable
CREATE TABLE "chart" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "lagna" TEXT NOT NULL,
    "yogakaraka" TEXT,
    "chartJson" JSONB NOT NULL,
    "chartHash" TEXT NOT NULL,
    "moonLongitude" DECIMAL(8,4) NOT NULL,
    "birthDatetime" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_run" (
    "id" TEXT NOT NULL,
    "chartId" TEXT NOT NULL,
    "runType" TEXT NOT NULL,
    "queryTypes" TEXT[],
    "userQuery" TEXT,
    "isFollowup" BOOLEAN NOT NULL DEFAULT false,
    "parentRunId" TEXT,
    "plannerOutput" JSONB,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "reportPath" TEXT,
    "totalTokenIn" INTEGER NOT NULL DEFAULT 0,
    "totalTokenOut" INTEGER NOT NULL DEFAULT 0,
    "totalCostUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "haltReason" JSONB,
    "overrideApplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ,

    CONSTRAINT "pipeline_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wave1_cache" (
    "id" TEXT NOT NULL,
    "chartHash" TEXT NOT NULL,
    "chartSummary" TEXT NOT NULL,
    "wave1Delta" JSONB NOT NULL,
    "dashaTree" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wave1_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wave_output" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "waveNumber" INTEGER NOT NULL,
    "domain" TEXT NOT NULL,
    "outputJson" JSONB,
    "factSummary" TEXT,
    "promptVersion" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "tokenIn" INTEGER NOT NULL DEFAULT 0,
    "tokenOut" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMPTZ NOT NULL,
    "completedAt" TIMESTAMPTZ,

    CONSTRAINT "wave_output_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_message" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "agentId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_config" (
    "id" TEXT NOT NULL,
    "waveId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "temperature" DECIMAL(3,2) NOT NULL,
    "maxTokens" INTEGER NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "model_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chart_chartHash_key" ON "chart"("chartHash");

-- CreateIndex
CREATE INDEX "pipeline_run_chartId_idx" ON "pipeline_run"("chartId");

-- CreateIndex
CREATE INDEX "pipeline_run_status_idx" ON "pipeline_run"("status");

-- CreateIndex
CREATE UNIQUE INDEX "wave1_cache_chartHash_key" ON "wave1_cache"("chartHash");

-- CreateIndex
CREATE INDEX "wave_output_runId_domain_idx" ON "wave_output"("runId", "domain");

-- CreateIndex
CREATE INDEX "wave_output_runId_waveNumber_idx" ON "wave_output"("runId", "waveNumber");

-- CreateIndex
CREATE UNIQUE INDEX "wave_output_runId_agentId_key" ON "wave_output"("runId", "agentId");

-- CreateIndex
CREATE INDEX "run_message_runId_idx" ON "run_message"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "model_config_waveId_key" ON "model_config"("waveId");

-- AddForeignKey
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_chartId_fkey" FOREIGN KEY ("chartId") REFERENCES "chart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "pipeline_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wave_output" ADD CONSTRAINT "wave_output_runId_fkey" FOREIGN KEY ("runId") REFERENCES "pipeline_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_message" ADD CONSTRAINT "run_message_runId_fkey" FOREIGN KEY ("runId") REFERENCES "pipeline_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
