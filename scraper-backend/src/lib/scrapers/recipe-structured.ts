/**
 * Structured data on a Panlasang Pinoy recipe page, beyond what the recipe
 * scraper stores: the schema.org Recipe JSON-LD that WP Recipe Maker emits
 * (yield, course, cuisine, per-serving nutrition) and the ingredient group
 * headings ("Marinade", "For dredging") that the flat ingredient list loses.
 *
 * Pure: takes page HTML, so it runs the same in tests, the scraper and the
 * backfill route.
 */
import * as cheerio from "cheerio";

/** Panlasang Pinoy's own per-serving estimate (WPRM's nutrition calculator). A reference to compare against, not ground truth. */
export interface RefNutrition {
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  sodium: number | null;
  fiber: number | null;
  sugar: number | null;
  saturatedFat: number | null;
  cholesterol: number | null;
}

export interface StructuredRecipe {
  /** Servings from recipeYield, only when the yield is counted in servings or people (not "24 pieces"). */
  yieldServings: number | null;
  yieldText: string | null;
  courses: string[];
  cuisines: string[];
  nutrition: RefNutrition | null;
  /** One entry per non-empty `.wprm-recipe-ingredient`, in page order: the line text and its group heading. */
  ingredients: { rawText: string; group: string | null }[];
}

type JsonObject = Record<string, unknown>;

export function findRecipeJsonLd($: ReturnType<typeof cheerio.load>): JsonObject | null {
  let found: JsonObject | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    let json: unknown;
    try {
      json = JSON.parse($(el).text());
    } catch {
      return;
    }
    const items: unknown[] = Array.isArray(json)
      ? json
      : json && typeof json === "object" && Array.isArray((json as JsonObject)["@graph"])
        ? ((json as JsonObject)["@graph"] as unknown[])
        : [json];
    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      const type = (it as JsonObject)["@type"];
      if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) {
        found = it as JsonObject;
        return;
      }
    }
  });
  return found;
}

const strings = (v: unknown): string[] =>
  (Array.isArray(v) ? v : v == null ? [] : [v]).map((s) => String(s).trim()).filter(Boolean);

/** "1170 kcal", "85 g", "2233 mg", "0.2 g" → number. */
function amount(v: unknown): number | null {
  if (v == null) return null;
  const m = String(v).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/**
 * WPRM writes recipeYield as ["4", "4 people"]: the bare number, then the number
 * with its unit. Only servings-like units count as servings; "24 pieces" or
 * "1 cake" says how much the recipe makes, not how many it feeds.
 */
export function parseYield(v: unknown): { servings: number | null; text: string | null } {
  const all = strings(v);
  if (!all.length) return { servings: null, text: null };
  const withUnit = all.find((s) => /[a-z]/i.test(s)) ?? null;
  const text = withUnit ?? all[0];
  const m = text.match(/(\d+(?:\.\d+)?)(?:\s*(?:-|to|–)\s*(\d+(?:\.\d+)?))?\s*(.*)$/i);
  if (!m) return { servings: null, text };
  const unit = m[3].trim().toLowerCase();
  const servingsUnit = unit === "" || /^(servings?|people|persons?|pax|serves|portions?|bowls?|plates?)\b/.test(unit);
  if (!servingsUnit) return { servings: null, text };
  // A range ("4-6 servings") counts as its lower end, like a cook reading it.
  const n = Math.round(parseFloat(m[1]));
  return { servings: n >= 1 && n <= 100 ? n : null, text };
}

/**
 * How many portions WPRM divided its nutrition by: the yield's number whatever
 * its unit ("24 pieces" → 24), or 1 when there is no yield (then the nutrition
 * is for the whole recipe).
 */
export function yieldCount(yieldText: string | null | undefined): number {
  const m = (yieldText ?? "").match(/\d+(?:\.\d+)?/);
  const n = m ? parseFloat(m[0]) : NaN;
  return n >= 1 ? n : 1;
}

function parseNutrition(v: unknown): RefNutrition | null {
  if (!v || typeof v !== "object") return null;
  const n = v as JsonObject;
  const out: RefNutrition = {
    kcal: amount(n.calories),
    protein: amount(n.proteinContent),
    fat: amount(n.fatContent),
    carbs: amount(n.carbohydrateContent),
    sodium: amount(n.sodiumContent),
    fiber: amount(n.fiberContent),
    sugar: amount(n.sugarContent),
    saturatedFat: amount(n.saturatedFatContent),
    cholesterol: amount(n.cholesterolContent),
  };
  return out.kcal == null && out.protein == null && out.fat == null && out.carbs == null ? null : out;
}

export function parseStructured(html: string): StructuredRecipe {
  const $ = cheerio.load(html);
  const recipe = findRecipeJsonLd($);
  const y = parseYield(recipe?.recipeYield);

  // Same selector and empty-line rule as the recipe scraper, so the list lines up
  // with the stored RecipeIngredient rows.
  const ingredients: StructuredRecipe["ingredients"] = [];
  $(".wprm-recipe-ingredient").each((_, el) => {
    const rawText = $(el).text().replace(/\s+/g, " ").trim();
    if (!rawText) return;
    const heading = $(el).closest(".wprm-recipe-ingredient-group").find(".wprm-recipe-group-name").first().text();
    const group = heading.replace(/\s+/g, " ").trim() || null;
    ingredients.push({ rawText, group });
  });

  return {
    yieldServings: y.servings,
    yieldText: y.text,
    courses: strings(recipe?.recipeCategory),
    cuisines: strings(recipe?.recipeCuisine),
    nutrition: parseNutrition(recipe?.nutrition),
    ingredients,
  };
}

/** Lowercased, whitespace-collapsed, without the "▢ " checkbox WPRM prints. */
export function normalizeLine(s: string): string {
  return s.replace(/^▢\s*/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Group heading for each stored ingredient row, by matching the page's lines.
 * Same count and text → by position. Otherwise each row takes the next unused
 * page line with the same text, so an edited recipe still maps what it can.
 */
export function alignGroups(stored: { rawText: string }[], page: StructuredRecipe["ingredients"]): (string | null)[] {
  if (stored.length === page.length && stored.every((s, i) => normalizeLine(s.rawText) === normalizeLine(page[i].rawText))) {
    return page.map((p) => p.group);
  }
  const used = new Set<number>();
  let from = 0;
  return stored.map((s) => {
    const key = normalizeLine(s.rawText);
    for (let i = from; i < page.length; i++) {
      if (!used.has(i) && normalizeLine(page[i].rawText) === key) {
        used.add(i);
        from = i + 1;
        return page[i].group;
      }
    }
    return null;
  });
}
