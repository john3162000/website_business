-- Reshape Commodity to match the DA "Daily Price Index" PDF (single prevailing
-- price per commodity, ALL-CAPS category headers, NCR region). The table holds
-- no data yet, so it is dropped and recreated.
DROP TABLE IF EXISTS "Commodity";

CREATE TABLE "Commodity" (
    "id" SERIAL NOT NULL,
    "category" TEXT,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "region" TEXT NOT NULL DEFAULT 'NCR',
    "sourceDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commodity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Commodity_name_region_sourceDate_key" ON "Commodity"("name", "region", "sourceDate");

CREATE INDEX "Commodity_name_sourceDate_idx" ON "Commodity"("name", "sourceDate");
