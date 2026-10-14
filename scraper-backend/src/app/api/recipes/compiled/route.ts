import { prisma } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/cors";
import { ensureNutritionColumns } from "@/lib/ensure-schema";
import { isMalformedName, parsePriceBasis } from "@/lib/da-units";
import { ALIASES, CANONICALS, EXTRA_NUTRIENTS } from "@/lib/recipe-compile/catalog.generated.ts";
import { compileRecipe, type CompileContext, type DaPrice, type FnriFood } from "@/lib/recipe-compile/compile.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Per-serving nutrition and cost for every recipe, computed from the recipe
 * lines, the ingredient catalog (data/catalog), FNRI nutrients and the latest
 * DA prices. Recipes and FNRI are static; prices are joined on every request.
 *
 * GET /api/recipes/compiled           → summary per recipe
 * GET /api/recipes/compiled?id=123    → one recipe with per-line detail
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const onlyId = searchParams.get("id") ? Number(searchParams.get("id")) : null;
  await ensureNutritionColumns();

  const [foods, priceRows, recipes] = await Promise.all([
    prisma.nutritionFact.findMany({
      select: { foodCode: true, calories: true, protein: true, fat: true, carbohydrates: true, sodium: true, fiber: true, calcium: true, iron: true, vitaminA: true, vitaminC: true },
    }),
    prisma.commodity.findMany({
      where: { sourceDate: { gte: new Date(Date.now() - 14 * 86400000) }, price: { not: null } },
      orderBy: { sourceDate: "asc" },
      select: { name: true, price: true, sourceDate: true },
    }),
    prisma.recipe.findMany({
      where: onlyId ? { id: onlyId } : undefined,
      orderBy: { id: "asc" },
      select: {
        id: true, title: true, servings: true,
        ingredients: { orderBy: { id: "asc" }, select: { id: true, name: true, amount: true, unit: true, rawText: true } },
        instructions: { orderBy: { stepNumber: "asc" }, select: { text: true } },
      },
    }),
  ]);

  const fnri = new Map<string, FnriFood>(foods.map((f) => [f.foodCode, f]));
  // Latest price per DA name (rows are ascending by date, so the last one wins).
  const da = new Map<string, DaPrice>();
  let priceDate: string | null = null;
  for (const p of priceRows) {
    if (isMalformedName(p.name)) continue;
    da.set(p.name, { price: p.price, unit: parsePriceBasis(p.name) });
    const iso = p.sourceDate.toISOString();
    if (!priceDate || iso > priceDate) priceDate = iso;
  }
  const ctx: CompileContext = { aliases: ALIASES, canonicals: CANONICALS, extraNutrients: EXTRA_NUTRIENTS, fnri, da };

  const round = (v: number | null, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
  const compiled = recipes.map((r) =>
    compileRecipe({ ...r, ingredients: r.ingredients.map((i) => ({ ...i, rawText: i.rawText.replace(/^▢\s*/, "") })), instructions: r.instructions.map((s) => s.text) }, ctx)
  );

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
      servings: c.servings,
      servingsAssumed: c.servingsAssumed,
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
    })),
  });
}

export function OPTIONS() {
  return corsPreflight();
}
