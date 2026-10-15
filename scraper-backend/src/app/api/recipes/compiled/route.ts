import { corsJson, corsPreflight } from "@/lib/cors";
import { compileFromDb, summarize } from "@/lib/recipe-compile/load";

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

  if (onlyId) {
    const c = compiled[0];
    if (!c) return corsJson({ error: "Recipe not found" }, { status: 404 });
    return corsJson({ priceDate, recipe: c });
  }

  return corsJson({
    priceDate,
    count: compiled.length,
    recipes: compiled.map(summarize),
  });
}

export function OPTIONS() {
  return corsPreflight();
}
