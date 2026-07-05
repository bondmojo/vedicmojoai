-- CreateTable
CREATE TABLE "saved_chart" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "birthDate" TEXT NOT NULL,
    "birthTime" TEXT NOT NULL,
    "timezone" DECIMAL(4,2) NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "sunriseMode" TEXT NOT NULL DEFAULT 'precise',
    "lagna" TEXT NOT NULL,
    "lagnaLongitude" DECIMAL(8,4) NOT NULL,
    "moonLongitude" DECIMAL(8,4) NOT NULL,
    "ayanamsa" DECIMAL(8,4) NOT NULL,
    "chartData" JSONB NOT NULL,
    "dashaTree" JSONB,
    "inputHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "saved_chart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saved_chart_inputHash_key" ON "saved_chart"("inputHash");

-- CreateIndex
CREATE INDEX "saved_chart_name_idx" ON "saved_chart"("name");

-- CreateIndex
CREATE INDEX "saved_chart_lagna_idx" ON "saved_chart"("lagna");
