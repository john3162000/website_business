import { prisma } from "@/lib/db";

/**
 * Deploys build with `prisma generate && next build` and never run migrations,
 * so additive columns are applied here, once per server instance. Every
 * statement is `ADD COLUMN IF NOT EXISTS`, so this is safe to repeat and
 * matches prisma/migrations/20261014000000_nutrition_fnri_meta.
 */
let nutritionColumns: Promise<void> | null = null;

export function ensureNutritionColumns(): Promise<void> {
  nutritionColumns ??= (async () => {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "NutritionFact"
        ADD COLUMN IF NOT EXISTS "sodium" DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS "altNames" TEXT,
        ADD COLUMN IF NOT EXISTS "scientificName" TEXT,
        ADD COLUMN IF NOT EXISTS "ediblePortion" DOUBLE PRECISION`);
  })().catch((err) => {
    nutritionColumns = null; // retry on the next request
    throw err;
  });
  return nutritionColumns;
}
