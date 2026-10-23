import { corsJson, corsPreflight } from "@/lib/cors";
import { compileFromDb, type CompiledFromDb } from "@/lib/recipe-compile/load";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NUTRIENTS = [
  ["kcal", "kcal"], ["protein", "protein"], ["fat", "fat"], ["carbs", "carbs"], ["sodium", "sodium"], ["fiber", "fiber"],
] as const;
// Only recipes whose own estimate is nearly complete: missing ingredients would
// show up as "we're lower" without saying anything about the method.
const MIN_COVERAGE = 0.9;

function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);

/** Ratio ours ÷ reference per nutrient: median, quartiles and how many land within ±20% / ±50%. */
function stats(recipes: CompiledFromDb[]) {
  return Object.fromEntries(NUTRIENTS.map(([key, refKey]) => {
    const ratios = recipes
      .map((c) => ({ ours: c.perServing[key], ref: c.reference?.[refKey] ?? null }))
      .filter((x) => x.ref != null && x.ref > 0)
      .map((x) => x.ours / x.ref!)
      .sort((a, b) => a - b);
    const within = (f: number) => (ratios.length ? r2(ratios.filter((x) => x >= 1 / (1 + f) && x <= 1 + f).length / ratios.length) : null);
    return [key, {
      n: ratios.length,
      medianRatio: r2(quantile(ratios, 0.5)),
      p25: r2(quantile(ratios, 0.25)),
      p75: r2(quantile(ratios, 0.75)),
      within20pct: within(0.2),
      within50pct: within(0.5),
    }];
  }));
}

/**
 * Compares the site's per-serving nutrition with Panlasang Pinoy's own estimate
 * (WPRM's calculator, stored by /api/scrape/structured), for recipes where both
 * exist. The reference is another estimate, not ground truth: WPRM counts every
 * listed ingredient in full, frying oil and discarded marinades included, so a
 * ratio below 1 for fried dishes is expected. Use it to find outliers.
 *
 * GET /api/recipes/nutrition-check            → summary + 25 largest kcal gaps
 * GET /api/recipes/nutrition-check?limit=100  → more outliers
 */
export async function GET(request: Request) {
  const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 25));
  const { recipes } = await compileFromDb(null);

  const meals = recipes.filter((c) => !c.isArticle && !c.isCollection);
  const compared = meals.filter((c) => c.reference?.kcal && c.nutritionCoverageByWeight >= MIN_COVERAGE);
  const byMethod = {
    notFried: compared.filter((c) => !c.method.frying),
    shallowFried: compared.filter((c) => c.method.frying === "shallow"),
    deepFried: compared.filter((c) => c.method.frying === "deep"),
  };

  const outliers = compared
    .map((c) => ({ c, gap: Math.abs(Math.log(c.perServing.kcal / c.reference!.kcal!)) }))
    .filter((x) => Number.isFinite(x.gap))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, limit)
    .map(({ c }) => ({
      id: c.id,
      title: c.title,
      servings: c.servings,
      servingsAssumed: c.servingsAssumed,
      frying: c.method.frying,
      kcal: Math.round(c.perServing.kcal),
      refKcal: Math.round(c.reference!.kcal!),
      ratio: r2(c.perServing.kcal / c.reference!.kcal!),
      protein: Math.round(c.perServing.protein),
      refProtein: c.reference!.protein != null ? Math.round(c.reference!.protein) : null,
      fat: Math.round(c.perServing.fat),
      refFat: c.reference!.fat != null ? Math.round(c.reference!.fat) : null,
      nutritionCoverage: r2(c.nutritionCoverageByWeight),
    }));

  return corsJson({
    recipes: meals.length,
    withReference: meals.filter((c) => c.reference?.kcal).length,
    compared: compared.length,
    minNutritionCoverage: MIN_COVERAGE,
    note: "ratio = ours ÷ Panlasang Pinoy's estimate, per serving. Their calculator counts all listed frying oil and marinade, so fried and marinated dishes are expected to come out lower here.",
    all: stats(compared),
    notFried: { recipes: byMethod.notFried.length, ...stats(byMethod.notFried) },
    shallowFried: { recipes: byMethod.shallowFried.length, ...stats(byMethod.shallowFried) },
    deepFried: { recipes: byMethod.deepFried.length, ...stats(byMethod.deepFried) },
    largestKcalGaps: outliers,
  });
}

export function OPTIONS() {
  return corsPreflight();
}
