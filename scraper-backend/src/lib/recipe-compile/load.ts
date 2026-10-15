import { prisma } from "@/lib/db";
import { ensureNutritionColumns, ensureRecipeColumns } from "@/lib/ensure-schema";
import { isMalformedName, parsePriceBasis } from "@/lib/da-units";
import { yieldCount, type RefNutrition } from "@/lib/scrapers/recipe-structured";
import { ALIASES, CANONICALS, EXTRA_NUTRIENTS, MANUAL_PRICES } from "./catalog.generated.ts";
import { compileRecipe, type CompileContext, type CompiledRecipe, type DaPrice, type FnriFood } from "./compile.ts";

export interface CompiledFromDb extends CompiledRecipe {
  title: string;
  /** Panlasang Pinoy's recipeCategory, ", "-joined; null when the page has none or it hasn't been read. */
  course: string | null;
  /**
   * Panlasang Pinoy's own nutrition estimate, rescaled to this recipe's servings
   * as counted here (their total ÷ our servings), so it compares one-to-one with
   * perServing. Null when the page has none.
   */
  reference: RefNutrition | null;
}

/**
 * Compiles recipes from the database: recipe lines (with group headings), the
 * ingredient catalog, FNRI nutrients and the latest DA prices (last 14 days).
 */
export async function compileFromDb(onlyId: number | null): Promise<{ priceDate: string | null; recipes: CompiledFromDb[] }> {
  await Promise.all([ensureNutritionColumns(), ensureRecipeColumns()]);

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
        id: true, title: true, servings: true, course: true, yieldText: true, refNutrition: true,
        ingredients: { orderBy: { id: "asc" }, select: { id: true, name: true, amount: true, unit: true, rawText: true, groupName: true } },
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
  const ctx: CompileContext = { aliases: ALIASES, canonicals: CANONICALS, extraNutrients: EXTRA_NUTRIENTS, manualPrices: MANUAL_PRICES, fnri, da };

  const compiled = recipes.map((r): CompiledFromDb => {
    const c = compileRecipe({
      id: r.id, title: r.title, servings: r.servings,
      ingredients: r.ingredients.map((i) => ({ ...i, rawText: i.rawText.replace(/^▢\s*/, ""), group: i.groupName })),
      instructions: r.instructions.map((s) => s.text),
    }, ctx);
    const ref = r.refNutrition as RefNutrition | null;
    const scale = yieldCount(r.yieldText) / c.servings;
    const reference = ref
      ? (Object.fromEntries(Object.entries(ref).map(([k, v]) => [k, typeof v === "number" ? v * scale : null])) as unknown as RefNutrition)
      : null;
    return { ...c, title: r.title, course: r.course, reference };
  });
  return { priceDate, recipes: compiled };
}
