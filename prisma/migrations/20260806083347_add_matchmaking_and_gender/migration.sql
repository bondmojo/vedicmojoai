-- AlterTable
ALTER TABLE "unified_chart" ADD COLUMN     "gender" TEXT;

-- CreateTable
CREATE TABLE "compatibility_match" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brideChartId" TEXT NOT NULL,
    "groomChartId" TEXT NOT NULL,
    "label" TEXT,
    "gunaScore" DECIMAL(4,1) NOT NULL,
    "result" JSONB NOT NULL,
    "tablesVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compatibility_match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compatibility_match_userId_idx" ON "compatibility_match"("userId");

-- CreateIndex
CREATE INDEX "compatibility_match_brideChartId_idx" ON "compatibility_match"("brideChartId");

-- CreateIndex
CREATE INDEX "compatibility_match_groomChartId_idx" ON "compatibility_match"("groomChartId");

-- AddForeignKey
ALTER TABLE "compatibility_match" ADD CONSTRAINT "compatibility_match_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compatibility_match" ADD CONSTRAINT "compatibility_match_brideChartId_fkey" FOREIGN KEY ("brideChartId") REFERENCES "unified_chart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compatibility_match" ADD CONSTRAINT "compatibility_match_groomChartId_fkey" FOREIGN KEY ("groomChartId") REFERENCES "unified_chart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
