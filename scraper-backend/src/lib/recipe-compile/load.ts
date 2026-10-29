import { prisma } from "@/lib/db";
import { ensureNutritionColumns, ensurePsaTable, ensureRecipeColumns } from "@/lib/ensure-schema";
import { isMalformedName, parsePriceBasis } from "@/lib/da-units";
import { compareDate } from "@/lib/price-history";
import { yieldCount, type RefNutrition } from "@/lib/scrapers/recipe-structured";
import { ALIASES, CANONICALS, COOK_GROUPS, DERIVED_PRICES, EXTRA_NUTRIENTS, MANUAL_PRICES, RETENTION } from "./catalog.generated.ts";
import { psaSnapshot, type PsaRow } from "./psa-snapshot.ts";
import { compileRecipe, unknownLineCount, type CompileContext, type CompiledRecipe, type DaPrice, type FnriFood, type PsaPrice } from "./compile.ts";

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
        id: true, title: true, servings: true, course: true, yieldText: true, refNutrition: true, methodNotes: true,
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

/** PSA prices are monthly and about a month behind: one older than this (before the snapshot day) isn't used. */

/** PSA monthly NCR rows from ~6 months back; empty until the first PSA import. */
async function loadPsa(): Promise<PsaRow[]> {
  await ensurePsaTable();
  return prisma.psaPrice.findMany({
    where: { region: { in: ["NCR", "PH"] }, period: { gte: new Date(Date.now() - 200 * DAY) } },
    orderBy: { period: "asc" },
    select: { commodity: true, unit: true, price: true, period: true, region: true },
  });
}


function compileAll(recipes: Recipes, fnri: Map<string, FnriFood>, da: Map<string, DaPrice>, psa: Map<string, PsaPrice>): CompiledFromDb[] {
  const ctx: CompileContext = { aliases: ALIASES, canonicals: CANONICALS, extraNutrients: EXTRA_NUTRIENTS, manualPrices: MANUAL_PRICES, derivedPrices: DERIVED_PRICES, cookGroups: COOK_GROUPS, retention: RETENTION, fnri, da, psa };
  return recipes.map((r): CompiledFromDb => {
    const c = compileRecipe({
      id: r.id, title: r.title, servings: r.servings,
      ingredients: r.ingredients.map((i) => ({ ...i, rawText: i.rawText.replace(/^▢\s*/, ""), group: i.groupName })),
      // Newer recipes keep method notes instead of the steps (see methodNotes in compile.ts).
      instructions: r.instructions.length ? r.instructions.map((s) => s.text) : r.methodNotes ? [r.methodNotes] : [],
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
  return { priceDate, recipes: compileAll(recipes, fnri, da, psaSnapshot(await loadPsa())) };
}

/**
 * Every recipe compiled twice: with the latest DA prices and with the prices on
 * the month-ago compare date (see price-history.ts). `compareDate` is null, and
 * `then` empty, while less than three weeks of prices are stored.
 */
export async function compileNowAndMonthAgo(days = 30): Promise<{
  latestDate: string | null; compareDate: string | null; now: CompiledFromDb[]; then: CompiledFromDb[];
}> {
  const { fnri, priceRows, recipes } = await loadInputs(null, new Date(Date.now() - 50 * DAY));
  const dates = priceRows.filter((p) => p.price != null && p.price > 0).map((p) => p.sourceDate.toISOString());
  const latestDate = dates.length ? dates[dates.length - 1] : null;
  // A week or two back needs at least 5 or 10 days of history; a month back, 21.
  const compare = latestDate ? compareDate(dates, latestDate, days, days >= 30 ? 21 : Math.round(days * 0.7)) : null;
  const psaRows = await loadPsa();
  const now = compileAll(recipes, fnri, daSnapshot(priceRows, latestDate ?? undefined).da, psaSnapshot(psaRows, latestDate ?? undefined));
  const then = compare ? compileAll(recipes, fnri, daSnapshot(priceRows, compare).da, psaSnapshot(psaRows, compare)) : [];
  return { latestDate, compareDate: compare, now, then };
}

const round = (v: number | null | undefined, d = 0) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

/** The per-recipe summary the site reads (/api/recipes/compiled list, and personal dishes). */
export function summarize(c: CompiledRecipe & { course?: string | null; reference?: RefNutrition | null }) {
  return {
    id: c.id,
    isArticle: c.isArticle,
    isCollection: c.isCollection,
    // Ingredients not in the catalog yet: the site hides these recipes (they stay in the database).
    unknownLines: unknownLineCount(c),
    hidden: unknownLineCount(c) > 0,
    // An unpriced protein or a big unpriced share: the cost shown is too low (ranked last on the site).
    costIncomplete: c.costGaps.items.length > 0,
    costGaps: c.costGaps.items.slice(0, 3),
    unpricedShare: c.costGaps.share,
    servings: c.servings,
    servingsAssumed: c.servingsAssumed,
    course: c.course ?? null,
    frying: c.method.frying,
    appliances: c.appliances,
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
    // After cooking losses (research/cooking-nutrients): [best, low, high] per serving.
    cooked: {
      method: c.afterCooking.method,
      vitaminC: [round(c.afterCooking.perServing.vitaminC.value, 1), round(c.afterCooking.perServing.vitaminC.low, 1), round(c.afterCooking.perServing.vitaminC.high, 1)],
      vitaminA: [round(c.afterCooking.perServing.vitaminA.value), round(c.afterCooking.perServing.vitaminA.low), round(c.afterCooking.perServing.vitaminA.high)],
      iron: [round(c.afterCooking.perServing.iron.value, 1), round(c.afterCooking.perServing.iron.low, 1), round(c.afterCooking.perServing.iron.high, 1)],
      calcium: [round(c.afterCooking.perServing.calcium.value), round(c.afterCooking.perServing.calcium.low), round(c.afterCooking.perServing.calcium.high)],
    },
    cost: round(c.costPerServing, 2),
    nutritionCoverage: round(c.nutritionCoverage, 2),
    costCoverage: round(c.costCoverage, 2),
    nutritionCoverageByWeight: round(c.nutritionCoverageByWeight, 2),
    costCoverageByWeight: round(c.costCoverageByWeight, 2),
    // Panlasang Pinoy's own estimate per serving as counted here (reference only).
    refKcal: round(c.reference?.kcal),
  };
}

/**
 * Catalog ingredients for the personal dish picker: label, slug, the units it can
 * be measured in, and where its price comes from today.
 */
export async function ingredientList() {
  const since = new Date(Date.now() - PRICE_WINDOW_DAYS * DAY);
  const rows = await prisma.commodity.findMany({ where: { sourceDate: { gte: since }, price: { not: null } }, orderBy: { sourceDate: "asc" }, select: { name: true, price: true, sourceDate: true } });
  const { da } = daSnapshot(rows);
  const psa = psaSnapshot(await loadPsa());
  return Object.entries(CANONICALS)
    .filter(([, c]) => c.role !== "water")
    .map(([slug, c]) => ({
      slug,
      label: c.label,
      units: [
        "g", "kg",
        ...(c.gPerCup ? ["cup", "tbsp", "tsp"] : []),
        ...(c.gEach ? ["piece"] : []),
        ...(c.gClove ? ["clove"] : []), ...(c.gHead ? ["head"] : []), ...(c.gBunch ? ["bunch"] : []),
        ...(c.gStalk ? ["stalk"] : []), ...(c.gSlice ? ["slice"] : []), ...(c.gThumb ? ["thumb"] : []),
      ],
      priceSource: c.daName && da.get(c.daName) ? "DA" : c.psaName && psa.get(c.psaName) ? "PSA" : MANUAL_PRICES[slug]?.price != null ? MANUAL_PRICES[slug].source : null,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export type DishInput = { title: string; servings: number | null; ingredients: { name: string; amount: string | null; unit: string | null; slug?: string | null }[]; instructions?: string[] };

/**
 * A personal dish compiled with today's prices, plus its cost per serving on
 * every day of stored DA history (SM/DTI reference prices stay fixed).
 */
export async function compileDish(dish: DishInput) {
  await ensureNutritionColumns();
  const [foods, priceRows] = await Promise.all([
    prisma.nutritionFact.findMany({
      select: { foodCode: true, calories: true, protein: true, fat: true, carbohydrates: true, sodium: true, fiber: true, calcium: true, iron: true, vitaminA: true, vitaminC: true },
    }),
    prisma.commodity.findMany({
      where: { sourceDate: { gte: new Date(Date.now() - 50 * DAY) }, price: { not: null } },
      orderBy: { sourceDate: "asc" },
      select: { name: true, price: true, sourceDate: true },
    }),
  ]);
  const fnri = new Map<string, FnriFood>(foods.map((f) => [f.foodCode, f]));
  const psaRows = await loadPsa();
  const ctx = (da: Map<string, DaPrice>, psa: Map<string, PsaPrice>): CompileContext => ({ aliases: ALIASES, canonicals: CANONICALS, extraNutrients: EXTRA_NUTRIENTS, manualPrices: MANUAL_PRICES, derivedPrices: DERIVED_PRICES, cookGroups: COOK_GROUPS, retention: RETENTION, fnri, da, psa });
  const input = { id: 0, ...dish };
  const now = daSnapshot(priceRows);
  const compiled = compileRecipe(input, ctx(now.da, psaSnapshot(psaRows)));
  const days = [...new Set(priceRows.filter((p) => p.price != null && p.price > 0).map((p) => p.sourceDate.toISOString()))];
  const history = days.map((date) => {
    const c = compileRecipe(input, ctx(daSnapshot(priceRows, date).da, psaSnapshot(psaRows, date)));
    return { date, cost: round(c.costPerServing, 2), costCoverage: round(c.costCoverageByWeight, 2) };
  });
  return { priceDate: now.priceDate, summary: summarize(compiled), lines: compiled.lines, history };
}
