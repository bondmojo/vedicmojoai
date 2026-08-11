/*
  Warnings:

  - Made the column `userId` on table `unified_chart` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "unified_chart" DROP CONSTRAINT "unified_chart_userId_fkey";

-- AlterTable
ALTER TABLE "unified_chart" ALTER COLUMN "userId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "unified_chart" ADD CONSTRAINT "unified_chart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
