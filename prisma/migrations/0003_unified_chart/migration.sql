-- CreateTable: unified_chart
CREATE TABLE "unified_chart" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "birthInput" JSONB,
    "lagna" TEXT NOT NULL,
    "lagnaLongitude" DECIMAL(8,4) NOT NULL,
    "moonLongitude" DECIMAL(8,4) NOT NULL,
    "ayanamsa" DECIMAL(8,4) NOT NULL,
    "birthDatetime" TIMESTAMPTZ NOT NULL,
    "planets" JSONB,
    "nakshatras" JSONB,
    "divisionalCharts" JSONB,
    "karakas" JSONB,
    "ashtakavarga" JSONB,
    "upagrahas" JSONB,
    "specialLagnas" JSONB,
    "arudhaPadas" JSONB,
    "relationships" JSONB,
    "shadbala" JSONB,
    "jaimini" JSONB,
    "bhavaBala" JSONB,
    "transits" JSONB,
    "pindaStrength" JSONB,
    "dashaTree" JSONB,
    "chartInputV1" JSONB,
    "chartHash" TEXT NOT NULL,
    "sunriseMode" TEXT NOT NULL DEFAULT 'precise',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "unified_chart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique chart hash
CREATE UNIQUE INDEX "unified_chart_chartHash_key" ON "unified_chart"("chartHash");

-- CreateIndex: query indexes
CREATE INDEX "unified_chart_name_idx" ON "unified_chart"("name");
CREATE INDEX "unified_chart_lagna_idx" ON "unified_chart"("lagna");
CREATE INDEX "unified_chart_source_idx" ON "unified_chart"("source");

-- AlterTable: pipeline_run — add optional unifiedChartId FK
ALTER TABLE "pipeline_run" ADD COLUMN "unifiedChartId" TEXT;

-- CreateIndex: pipeline_run unifiedChartId
CREATE INDEX "pipeline_run_unifiedChartId_idx" ON "pipeline_run"("unifiedChartId");

-- AddForeignKey: pipeline_run → unified_chart
ALTER TABLE "pipeline_run" ADD CONSTRAINT "pipeline_run_unifiedChartId_fkey"
    FOREIGN KEY ("unifiedChartId") REFERENCES "unified_chart"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
