/*
  Warnings:

  - A unique constraint covering the columns `[userId,chartHash]` on the table `unified_chart` will be added. If there are existing duplicate values, this will fail.
  - chartHash was previously globally unique; it is now unique per-user so two
    practitioners can independently save a chart for the same birth data.

*/
-- DropIndex
DROP INDEX "unified_chart_chartHash_key";

-- CreateIndex
CREATE UNIQUE INDEX "unified_chart_userId_chartHash_key" ON "unified_chart"("userId", "chartHash");
