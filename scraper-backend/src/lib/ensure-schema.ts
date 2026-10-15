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

/**
 * Recipe structured-data columns (prisma/migrations/20261015000000_recipe_structured_data).
 * Prisma selects every scalar column on create/update/include, so any route that
 * touches Recipe or RecipeIngredient must await this before its first query.
 */
let recipeColumns: Promise<void> | null = null;

export function ensureRecipeColumns(): Promise<void> {
  recipeColumns ??= (async () => {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Recipe"
        ADD COLUMN IF NOT EXISTS "course" TEXT,
        ADD COLUMN IF NOT EXISTS "cuisine" TEXT,
        ADD COLUMN IF NOT EXISTS "yieldText" TEXT,
        ADD COLUMN IF NOT EXISTS "refNutrition" JSONB,
        ADD COLUMN IF NOT EXISTS "structuredAt" TIMESTAMP(3)`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "RecipeIngredient" ADD COLUMN IF NOT EXISTS "groupName" TEXT`);
  })().catch((err) => {
    recipeColumns = null; // retry on the next request
    throw err;
  });
  return recipeColumns;
}
