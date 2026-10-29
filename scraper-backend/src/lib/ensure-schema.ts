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
 * Recipe structured-data columns (prisma/migrations/20261015000000_recipe_structured_data,
 * 20261027000000_recipe_method_notes).
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
        ADD COLUMN IF NOT EXISTS "structuredAt" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "methodNotes" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "RecipeIngredient" ADD COLUMN IF NOT EXISTS "groupName" TEXT`);
  })().catch((err) => {
    recipeColumns = null; // retry on the next request
    throw err;
  });
  return recipeColumns;
}

/** PSA price table (prisma/migrations/20261016000000_psa_price). */
let psaTable: Promise<void> | null = null;

export function ensurePsaTable(): Promise<void> {
  psaTable ??= (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PsaPrice" (
        "id" SERIAL PRIMARY KEY,
        "commodity" TEXT NOT NULL,
        "category" TEXT,
        "unit" TEXT NOT NULL,
        "price" DOUBLE PRECISION NOT NULL,
        "period" TIMESTAMP(3) NOT NULL,
        "region" TEXT NOT NULL DEFAULT 'NCR',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "PsaPrice_commodity_region_period_key" ON "PsaPrice"("commodity", "region", "period")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PsaPrice_period_idx" ON "PsaPrice"("period")`);
  })().catch((err) => {
    psaTable = null; // retry on the next request
    throw err;
  });
  return psaTable;
}

/**
 * Pages the recipe crawl looked at and did not save (not a recipe, or a dish already listed from
 * another site), so the daily crawl doesn't fetch them again (prisma/migrations/20261029000000_recipe_skip).
 * Created here because deploys never run migrations.
 */
let recipeSkipTable: Promise<void> | null = null;

export function ensureRecipeSkipTable(): Promise<void> {
  recipeSkipTable ??= (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RecipeSkip" (
        "url" TEXT PRIMARY KEY,
        "reason" TEXT NOT NULL,
        "title" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`);
  })().catch((err) => {
    recipeSkipTable = null; // retry on the next request
    throw err;
  });
  return recipeSkipTable;
}
