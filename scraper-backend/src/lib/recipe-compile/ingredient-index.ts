import type { CompiledRecipe } from "./compile.ts";

/** Lines you have to buy or have on hand: not to-taste, optional, water, skipped or unknown. */
const NEEDED = new Set(["ok", "no-weight", "no-nutrition"]);

export interface IngredientIndex {
  /** Catalog ingredients used by at least one recipe, most used first. */
  ingredients: { slug: string; label: string; count: number }[];
  /** Per recipe: indexes into `ingredients`, and each one's cost per serving (₱, null when unpriced). */
  recipes: { id: number; i: number[]; c: (number | null)[] }[];
}

/**
 * Which catalog ingredients each recipe needs, for the "Anong lulutuin?" finder
 * (pick what you have, see what you can cook). A slug used twice in a recipe is
 * listed once, with its costs added.
 */
export function ingredientIndex(recipes: CompiledRecipe[]): IngredientIndex {
  const labels = new Map<string, string>();
  const counts = new Map<string, number>();
  const perRecipe = recipes.filter((r) => !r.isArticle).map((r) => {
    const need = new Map<string, number | null>();
    for (const l of r.lines) {
      if (!l.slug || !NEEDED.has(l.status)) continue;
      labels.set(l.slug, l.label || l.slug);
      const prev = need.get(l.slug);
      const cost = l.cost == null ? null : l.cost / (r.servings || 4);
      need.set(l.slug, prev == null ? cost : cost == null ? prev : prev + cost);
    }
    for (const s of need.keys()) counts.set(s, (counts.get(s) || 0) + 1);
    return { id: r.id, need };
  });
  const ingredients = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([slug, count]) => ({ slug, label: labels.get(slug)!, count }));
  const pos = new Map(ingredients.map((x, n) => [x.slug, n]));
  return {
    ingredients,
    recipes: perRecipe.filter((r) => r.need.size).map((r) => ({
      id: r.id,
      i: [...r.need.keys()].map((s) => pos.get(s)!),
      c: [...r.need.values()].map((v) => (v == null ? null : Math.round(v * 100) / 100)),
    })),
  };
}
