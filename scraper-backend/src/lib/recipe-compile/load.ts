import { prisma } from "@/lib/db";
import { ensureNutritionColumns, ensureRecipeColumns } from "@/lib/ensure-schema";
import { isMalformedName, parsePriceBasis } from "@/lib/da-units";
import { compareDate } from "@/lib/price-history";
import { yieldCount, type RefNutrition } from "@/lib/scrapers/recipe-structured";
import { ALIASES, CANONICALS, EXTRA_NUTRIENTS, MANUAL_PRICES } from "./catalog.generated.ts";
import { compileRecipe, type CompileContext, type CompiledRecipe, type DaPrice, type FnriFood } from "./compile.ts";

const DAY = 86400000;
/** A DA price older than this (before the snapshot day) is too stale to use. */
const PRICE_WINDOW_DAYS = 14;

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

type PriceRow = { name: string; price: number | null; sourceDate: Date };

async function loadInputs(onlyId: number | null, pricesSince: Date) {
  await Promise.all([ensureNutritionColumns(), ensureRecipeColumns()]);
  const [foods, priceRows, recipes] = await Promise.all([
    prisma.nutritionFact.findMany({
      select: { foodCode: true, calories: true, protein: true, fat: true, carbohydrates: true, sodium: true, fiber: true, calcium: true, iron: true, vitaminA: true, vitaminC: true },
    }),
    prisma.commodity.findMany({
      where: { sourceDate: { gte: pricesSince }, price: { not: null } },
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
  return { fnri: new Map<string, FnriFood>(foods.map((f) => [f.foodCode, f])), priceRows, recipes };
}
type Recipes = Awaited<ReturnType<typeof loadInputs>>["recipes"];

/**
 * DA prices as they stood on `asOf` (default: the newest data): the latest
 * price per DA name from the PRICE_WINDOW_DAYS before it. 0 means "not
 * surveyed that day", not free, so it is skipped.
 */
function daSnapshot(rows: PriceRow[], asOf?: string): { da: Map<string, DaPrice>; priceDate: string | null } {
  const until = asOf ? new Date(asOf).getTime() : Infinity;
  const from = asOf ? until - PRICE_WINDOW_DAYS * DAY : -Infinity;
  const da = new Map<string, DaPrice>();
  let priceDate: string | null = null;
  // Rows are ascending by date, so the last one wins.
  for (const p of rows) {
    const t = p.sourceDate.getTime();
    if (t > until || t < from || p.price == null || p.price <= 0 || isMalformedName(p.name)) continue;
    da.set(p.name, { price: p.price, unit: parsePriceBasis(p.name) });
    const iso = p.sourceDate.toISOString();
    if (!priceDate || iso > priceDate) priceDate = iso;
  }
  return { da, priceDate };
}

function compileAll(recipes: Recipes, fnri: Map<string, FnriFood>, da: Map<string, DaPrice>): CompiledFromDb[] {
  const ctx: CompileContext = { aliases: ALIASES, canonicals: CANONICALS, extraNutrients: EXTRA_NUTRIENTS, manualPrices: MANUAL_PRICES, fnri, da };
  return recipes.map((r): CompiledFromDb => {
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
}

/**
 * Compiles recipes from the database: recipe lines (with group headings), the
 * ingredient catalog, FNRI nutrients and the latest DA prices (last 14 days).
 */
export async function compileFromDb(onlyId: number | null): Promise<{ priceDate: string | null; recipes: CompiledFromDb[] }> {
  const { fnri, priceRows, recipes } = await loadInputs(onlyId, new Date(Date.now() - PRICE_WINDOW_DAYS * DAY));
  const { da, priceDate } = daSnapshot(priceRows);
  return { priceDate, recipes: compileAll(recipes, fnri, da) };
}

/**
 * Every recipe compiled twice: with the latest DA prices and with the prices on
 * the month-ago compare date (see price-history.ts). `compareDate` is null, and
 * `then` empty, while less than three weeks of prices are stored.
 */
export async function compileNowAndMonthAgo(): Promise<{
  latestDate: string | null; compareDate: string | null; now: CompiledFromDb[]; then: CompiledFromDb[];
}> {
  const { fnri, priceRows, recipes } = await loadInputs(null, new Date(Date.now() - 50 * DAY));
  const dates = priceRows.filter((p) => p.price != null && p.price > 0).map((p) => p.sourceDate.toISOString());
  const latestDate = dates.length ? dates[dates.length - 1] : null;
  const compare = latestDate ? compareDate(dates, latestDate) : null;
  const now = compileAll(recipes, fnri, daSnapshot(priceRows, latestDate ?? undefined).da);
  const then = compare ? compileAll(recipes, fnri, daSnapshot(priceRows, compare).da) : [];
  return { latestDate, compareDate: compare, now, then };
}
