-- CreateTable
CREATE TABLE "duration_analysis" (
    "id" TEXT NOT NULL,
    "unifiedChartId" TEXT NOT NULL,
    "dateFrom" TIMESTAMPTZ NOT NULL,
    "dateTo" TIMESTAMPTZ NOT NULL,
    "category" TEXT NOT NULL,
    "userQuestion" TEXT,
    "symptoms" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "periodSlice" JSONB,
    "transitOverlay" JSONB,
    "contextSummary" TEXT,
    "overrideApplied" BOOLEAN NOT NULL DEFAULT false,
    "da1Output" JSONB,
    "da2Output" JSONB,
    "da3Output" JSONB,
    "totalTokenIn" INTEGER NOT NULL DEFAULT 0,
    "totalTokenOut" INTEGER NOT NULL DEFAULT 0,
    "totalCostUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "duration_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duration_message" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "agentId" TEXT,
    "focusPeriod" TEXT,
    "tokenIn" INTEGER NOT NULL DEFAULT 0,
    "tokenOut" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duration_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "duration_analysis_unifiedChartId_idx" ON "duration_analysis"("unifiedChartId");

-- CreateIndex
CREATE INDEX "duration_analysis_status_idx" ON "duration_analysis"("status");

-- CreateIndex
CREATE INDEX "duration_message_analysisId_idx" ON "duration_message"("analysisId");

-- AddForeignKey
ALTER TABLE "duration_analysis" ADD CONSTRAINT "duration_analysis_unifiedChartId_fkey" FOREIGN KEY ("unifiedChartId") REFERENCES "unified_chart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duration_message" ADD CONSTRAINT "duration_message_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "duration_analysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
