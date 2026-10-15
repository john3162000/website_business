import { corsJson, corsPreflight } from "@/lib/cors";
import { compileFromDb } from "@/lib/recipe-compile/load";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Per-serving nutrition and cost for every recipe, computed from the recipe
 * lines, the ingredient catalog (data/catalog), FNRI nutrients and the latest
 * DA prices. Recipes and FNRI are static; prices are joined on every request.
 * `course` and `refKcal` come from the page's structured data (/api/scrape/structured).
 *
 * GET /api/recipes/compiled           → summary per recipe
 * GET /api/recipes/compiled?id=123    → one recipe with per-line detail
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const onlyId = searchParams.get("id") ? Number(searchParams.get("id")) : null;
  const { priceDate, recipes: compiled } = await compileFromDb(onlyId);
  const round = (v: number | null | undefined, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

  if (onlyId) {
    const c = compiled[0];
    if (!c) return corsJson({ error: "Recipe not found" }, { status: 404 });
    return corsJson({ priceDate, recipe: c });
  }

  return corsJson({
    priceDate,
    count: compiled.length,
    recipes: compiled.map((c) => ({
      id: c.id,
      isArticle: c.isArticle,
      isCollection: c.isCollection,
      servings: c.servings,
      servingsAssumed: c.servingsAssumed,
      course: c.course,
      frying: c.method.frying,
      kcal: round(c.perServing.kcal),
      kcalLow: round(c.perServing.kcalLow),
      kcalHigh: round(c.perServing.kcalHigh),
      protein: round(c.perServing.protein, 1),
      fat: round(c.perServing.fat, 1),
      carbs: round(c.perServing.carbs, 1),
      sodium: round(c.perServing.sodium),
      fiber: round(c.perServing.fiber, 1),
      calcium: round(c.perServing.calcium),
      iron: round(c.perServing.iron, 1),
      vitaminA: round(c.perServing.vitaminA),
      vitaminC: round(c.perServing.vitaminC, 1),
      cost: round(c.costPerServing, 2),
      nutritionCoverage: round(c.nutritionCoverage, 2),
      costCoverage: round(c.costCoverage, 2),
      nutritionCoverageByWeight: round(c.nutritionCoverageByWeight, 2),
      costCoverageByWeight: round(c.costCoverageByWeight, 2),
      // Panlasang Pinoy's own estimate per serving as counted here (reference only).
      refKcal: round(c.reference?.kcal),
    })),
  });
}

export function OPTIONS() {
  return corsPreflight();
}
