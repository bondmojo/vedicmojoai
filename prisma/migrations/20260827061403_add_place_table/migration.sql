-- Birth-place reference data backing the location picker
-- (.kiro/specs/place-location-picker). Populated out-of-band by
-- scripts/load-places.ts; the running app only ever reads this table.
--
-- pg_trgm must exist BEFORE the CREATE INDEX statements below, because
-- gin_trgm_ops is supplied by that extension. Prisma cannot generate this
-- line, so the migration was created with `migrate dev --create-only` and this
-- statement added by hand. Verified available on the target server
-- (PostgreSQL 16.14, pg_trgm 1.6).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateTable
CREATE TABLE "place" (
    "id" TEXT NOT NULL,
    "osmType" TEXT NOT NULL,
    "osmId" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNorm" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "kindRank" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "county" TEXT,
    "postcode" TEXT,
    "latitude" DECIMAL(9,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'in',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Two indexes on "nameNorm", one per search stage in GET /api/places. This
-- database's collation is en_US.utf8, under which a *default* btree cannot
-- serve LIKE 'q%' at all, so neither index is redundant:
--
--   prefix_idx (btree, text_pattern_ops) → stage 1, LIKE 'q%'. Rewrites the
--     pattern into a range scan ("nameNorm" >= 'q' AND "nameNorm" < 'r').
--   trgm_idx (GIN, gin_trgm_ops)         → stage 2, LIKE '%q%', which no btree
--     can serve at any collation.
--
-- The GIN index can technically answer a prefix query too, but measured on 40k
-- rows the planner declines to: a prefix matching exactly 1 row seq-scanned in
-- 19 ms, against 0.35 ms via the btree. Prefix is the common path, so it keeps
-- a dedicated index.
CREATE INDEX "place_nameNorm_prefix_idx" ON "place"("nameNorm" text_pattern_ops);

-- CreateIndex
CREATE INDEX "place_nameNorm_trgm_idx" ON "place" USING GIN ("nameNorm" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "place_state_idx" ON "place"("state");

-- CreateIndex
CREATE INDEX "place_district_idx" ON "place"("district");

-- CreateIndex
CREATE INDEX "place_kindRank_idx" ON "place"("kindRank");

-- CreateIndex
CREATE UNIQUE INDEX "place_osmType_osmId_key" ON "place"("osmType", "osmId");
