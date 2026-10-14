-- FNRI directory metadata and sodium. Additive and idempotent: the app also
-- applies these at runtime (src/lib/ensure-schema.ts), since deploys do not
-- run `prisma migrate deploy`.
ALTER TABLE "NutritionFact" ADD COLUMN IF NOT EXISTS "sodium" DOUBLE PRECISION;
ALTER TABLE "NutritionFact" ADD COLUMN IF NOT EXISTS "altNames" TEXT;
ALTER TABLE "NutritionFact" ADD COLUMN IF NOT EXISTS "scientificName" TEXT;
ALTER TABLE "NutritionFact" ADD COLUMN IF NOT EXISTS "ediblePortion" DOUBLE PRECISION;
