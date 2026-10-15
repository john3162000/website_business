-- PSA OpenSTAT monthly retail prices (NCR). Idempotent: the app also creates
-- this at runtime (src/lib/ensure-schema.ts), since deploys don't run migrations.
CREATE TABLE IF NOT EXISTS "PsaPrice" (
  "id" SERIAL PRIMARY KEY,
  "commodity" TEXT NOT NULL,
  "category" TEXT,
  "unit" TEXT NOT NULL,
  "price" DOUBLE PRECISION NOT NULL,
  "period" TIMESTAMP(3) NOT NULL,
  "region" TEXT NOT NULL DEFAULT 'NCR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "PsaPrice_commodity_region_period_key" ON "PsaPrice"("commodity", "region", "period");
CREATE INDEX IF NOT EXISTS "PsaPrice_period_idx" ON "PsaPrice"("period");
