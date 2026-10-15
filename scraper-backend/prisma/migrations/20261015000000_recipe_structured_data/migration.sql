-- Structured data from Panlasang Pinoy pages (schema.org Recipe JSON-LD and
-- WPRM ingredient groups). Additive and idempotent: the app also applies these
-- at runtime (src/lib/ensure-schema.ts), since deploys do not run
-- `prisma migrate deploy`.
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "course" TEXT;
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "cuisine" TEXT;
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "yieldText" TEXT;
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "refNutrition" JSONB;
ALTER TABLE "Recipe" ADD COLUMN IF NOT EXISTS "structuredAt" TIMESTAMP(3);
ALTER TABLE "RecipeIngredient" ADD COLUMN IF NOT EXISTS "groupName" TEXT;
