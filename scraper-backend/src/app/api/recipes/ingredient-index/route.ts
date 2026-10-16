import { corsJson, corsPreflight } from "@/lib/cors";
import { compileFromDb } from "@/lib/recipe-compile/load";
import { ingredientIndex } from "@/lib/recipe-compile/ingredient-index.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Recipes change rarely and prices once a day: let the CDN keep the result for an hour.
const CACHE = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };

/**
 * Which catalog ingredients each recipe needs, with each one's cost per serving,
 * for the site's "Anong lulutuin?" finder (pick what you have, see what you can cook).
 *
 * GET /api/recipes/ingredient-index → { priceDate, ingredients: [{ slug, label, count }], recipes: [{ id, i, c }] }
 */
export async function GET() {
  const { priceDate, recipes } = await compileFromDb(null);
  return corsJson({ priceDate, ...ingredientIndex(recipes) }, { headers: CACHE });
}

export function OPTIONS() {
  return corsPreflight();
}
