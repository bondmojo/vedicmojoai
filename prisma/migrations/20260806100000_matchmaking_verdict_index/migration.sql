-- Denormalize result.ashtakoota.verdict onto its own column (same rationale
-- as the pre-existing gunaScore column) so GET /api/matchmaking (list) can
-- select it directly instead of fetching the full `result` JSONB per row.
ALTER TABLE "compatibility_match" ADD COLUMN "verdict" TEXT;

-- Backfill any pre-existing rows from the persisted result JSON. COALESCE
-- guards a row whose result shape is ever missing the field (should not
-- happen post-task-4.3, but this migration must not fail on it).
UPDATE "compatibility_match"
SET "verdict" = COALESCE("result"->'ashtakoota'->>'verdict', 'unknown')
WHERE "verdict" IS NULL;

ALTER TABLE "compatibility_match" ALTER COLUMN "verdict" SET NOT NULL;

-- CreateIndex
CREATE INDEX "compatibility_match_userId_createdAt_idx" ON "compatibility_match"("userId", "createdAt");
