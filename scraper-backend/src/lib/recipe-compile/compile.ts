/**
 * Recipe compilation: turns a recipe's ingredient lines into grams as bought,
 * grams as eaten, nutrients and cost. Pure — callers pass the catalog, FNRI
 * nutrients and DA prices — so it runs the same in tests and in API routes.
 *
 * Three quantities per line (see docs/integration-proposal.md §1):
 *   as written → gAP (as bought, incl. bones/peel/oil left in the pot)
 *             → gEaten = gAP × edible fraction × consumed fraction
 * Nutrition uses gEaten. Cost uses gAP (frying oil: absorbed + leftover ÷ reuses).
 */
import { parseQuantity, type ParsedQuantity } from "./quantity.ts";
import type { Alias, Canonical } from "./types.ts";

export interface Nutrients {
  kcal: number; protein: number; fat: number; carbs: number; sodium: number;
  fiber: number; calcium: number; iron: number; vitaminA: number; vitaminC: number;
}
export interface FnriFood {
  calories: number | null; protein: number | null; fat: number | null;
  carbohydrates: number | null; sodium: number | null;
  fiber?: number | null; calcium?: number | null; iron?: number | null; vitaminA?: number | null; vitaminC?: number | null;
}
const ZERO: Nutrients = { kcal: 0, protein: 0, fat: 0, carbs: 0, sodium: 0, fiber: 0, calcium: 0, iron: 0, vitaminA: 0, vitaminC: 0 };
export interface DaPrice {
  price: number | null;
  unit: { per: "kg" | "piece" | "bottle"; pieceGrams: number | null; bottleMl: number | null };
}
export interface CompileContext {
  aliases: Record<string, Alias>;
  canonicals: Record<string, Canonical>;
  /** Fallback per-100 g nutrients by slug, for items FNRI doesn't have (approximate). */
  extraNutrients?: Record<string, FnriFood & { source?: string }>;
  fnri: Map<string, FnriFood>;
  da: Map<string, DaPrice>;
}
export interface RecipeInput {
  id: number;
  title: string;
  servings: number | null;
  ingredients: { id?: number; name: string; amount: string | null; unit: string | null; rawText?: string | null }[];
  instructions?: string[];
}

export type LineStatus =
  | "ok" | "to-taste" | "optional" | "water" | "skipped" | "unmatched" | "no-weight" | "no-nutrition";

export interface CompiledLine {
  ingredientId?: number;
  text: string;
  slug: string | null;
  label: string | null;
  status: LineStatus;
  gAP: number | null;
  gEaten: number | null;
  /** Why gEaten differs from gAP, for the recipe pop-up. */
  reason: string | null;
  nutrients: Nutrients | null;
  /** Cost of what the recipe uses, ₱. Null when DA doesn't price this item. */
  cost: number | null;
  priced: boolean;
  flags: string[];
}

export interface CompiledRecipe {
  id: number;
  servings: number;
  servingsAssumed: boolean;
  method: { frying: "deep" | "shallow" | null; absorbedOilG: [number, number] | null };
  perServing: Nutrients & { kcalLow: number; kcalHigh: number };
  costPerServing: number | null;
  /** Share of weighed food lines with FNRI nutrition / with a DA price (0–1). Condiments DA doesn't sell lower costCoverage. */
  nutritionCoverage: number;
  costCoverage: number;
  lines: CompiledLine[];
}

const OIL_REUSES = 3;
const OIL_DENSITY = 0.92; // g/ml
const CUP_ML = 236.588;
const PINCH_G = 0.36;

const SIZE_WORDS = /\b(small|medium|large|big|jumbo|medium[- ]sized)\b/g;
const PREP_WORDS = /\b(fresh|chopped|minced|sliced|diced|crushed|grated|shredded|cubed|julienned|peeled|ripe|finely|thinly|roughly|coarsely|cut|into|pieces?|halved|quartered|beaten|softened|melted|cooked|raw|whole|boneless|skinless|lean)\b/g;

export function nameKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function lookupAlias(name: string, aliases: Record<string, Alias>): Alias | null {
  const k = nameKey(name);
  if (aliases[k]) return aliases[k];
  const stripped = k.replace(SIZE_WORDS, " ").replace(/\s+/g, " ").trim();
  if (aliases[stripped]) return aliases[stripped];
  const bare = stripped.replace(PREP_WORDS, " ").replace(/[,()]/g, " ").replace(/\s+/g, " ").trim();
  if (aliases[bare]) return aliases[bare];
  if (bare.endsWith("es") && aliases[bare.slice(0, -2)]) return aliases[bare.slice(0, -2)];
  if (bare.endsWith("s") && aliases[bare.slice(0, -1)]) return aliases[bare.slice(0, -1)];
  return null;
}

/** Grams as purchased for one line, or null when no weight is known. */
function gramsAP(q: ParsedQuantity, c: Canonical, alias: Alias, flags: string[], text = ""): number | null {
  const size = q.size ?? alias.size;
  const each = size === "small" ? c.gEachSmall ?? c.gEach : size === "large" ? c.gEachLarge ?? c.gEach : c.gEach;
  const noteUnit = alias.note?.match(/unit:(\w+)/)?.[1] ?? null;
  const n = q.value;

  if (q.kind === "mass") return n === null ? null : n * q.perUnit!;
  if (q.kind === "volume") {
    if (n === null) return null;
    const ml = n * q.perUnit!;
    if (c.gPerCup) return (ml / CUP_ML) * c.gPerCup;
    flags.push("density-assumed-1");
    return ml;
  }
  if (q.kind === "vague") {
    if (q.unit === "pinch" || q.unit === "dash") return (n ?? 1) * PINCH_G;
    return null;
  }
  const unit = q.unit ?? noteUnit ?? "piece";
  if (n === null) return unit === "pinch" || unit === "dash" ? PINCH_G : null;

  const byUnit: Record<string, number | null> = {
    clove: c.gClove, head: c.gHead, thumb: c.gThumb, bunch: c.gBunch, stalk: c.gStalk, slice: c.gSlice,
    strip: c.gSlice ?? c.gEach, pinch: PINCH_G, dash: PINCH_G, knob: c.gThumb,
  };
  if (unit in byUnit) {
    const g = byUnit[unit];
    if (g) return n * g;
    if (each) { flags.push(`no-${unit}-weight:used-piece`); return n * each; }
    return null;
  }
  if (unit === "can" || unit === "pack" || unit === "bottle") {
    if (q.packageAmount) return n * q.packageAmount;
    // Package size only in the full line text: "1 can diced tomatoes 14 oz".
    const m = text.match(/(\d+(?:\.\d+)?)\s*(oz|ounces?|g|grams?|ml)\b/i);
    if (m) {
      const per = /^o/i.test(m[2]) ? 28.3495 : 1;
      flags.push("package-from-text");
      return n * parseFloat(m[1]) * per;
    }
  }
  return each ? n * each : null;
}

function scaled(f: FnriFood, g: number, k: number): Nutrients {
  const m = (v: number | null | undefined) => ((v ?? 0) * g * k) / 100;
  return {
    kcal: m(f.calories), protein: m(f.protein), fat: m(f.fat), carbs: m(f.carbohydrates), sodium: m(f.sodium),
    fiber: m(f.fiber), calcium: m(f.calcium), iron: m(f.iron), vitaminA: m(f.vitaminA), vitaminC: m(f.vitaminC),
  };
}

function lineCost(c: Canonical, gUsed: number, da: DaPrice | undefined, isOil: boolean): number | null {
  if (!da || da.price == null) return null;
  const g = c.cookedPerRaw ? gUsed / c.cookedPerRaw : gUsed;
  if (da.unit.per === "kg") return (da.price / 1000) * g;
  if (da.unit.per === "piece") return da.unit.pieceGrams ? (da.price / da.unit.pieceGrams) * g : null;
  if (da.unit.per === "bottle") {
    const ml = isOil ? g / OIL_DENSITY : g;
    return da.unit.bottleMl ? (da.price / da.unit.bottleMl) * ml : null;
  }
  return null;
}

// ── Frying detection (proposal §5.2), from title, instructions and oil volume ──
const FRY_TITLE = /\b(lumpia|shanghai|turon|okoy|ukoy|maruya|empanada|bunuelos|buñuelos|donuts?|doughnuts?|chicharon|chicharron|crispy|prito|pritong|fried|kawali|bagnet|calamares|rebosado|tempura|tokwa|nuggets?|fritters?|karioka|camote cue|banana cue|kwek|tokneneng)\b/i;
const WRAPPED = /\b(lumpia|shanghai|turon|empanada|okoy|ukoy|maruya|bunuelos|buñuelos|donuts?|doughnuts?|fritters?|karioka|spring rolls?|wonton)\b/i;
const COATED = /\b(crispy|fried chicken|calamares|rebosado|tempura|nuggets?|breaded|tokwa|kwek|tokneneng)\b/i;
const FATTY_PORK = /\b(lechon kawali|chicharon|chicharron|crispy pata|bagnet|crispy pork)\b/i;
const DEEP_FRY_STEP = /\bdeep[- ]?fr(y|ied|ying)\b|\bfry\b[^.]{0,60}\buntil (golden|crisp)/i;
const PAN_FRY_STEP = /\bpan[- ]?fr(y|ied|ying)\b|\bfry (each|both) sides?\b|\bshallow[- ]?fr/i;
const BAKE_VETO = /\b(bake|baked|oven|preheat|cake|cookies?|bread|muffins?|brownies?|leche flan|bibingka|puto|ensaymada|dressing|vinaigrette)\b/i;
const LIQUID_SLUG = /(water|broth|stock|sauce|milk|cream|vinegar|juice|wine|soda|beer|oil|syrup|ketchup|mayonnaise)/;

/** Uptake as a fraction of the fried food's weight: [low, high] (≈, Bognár / frying literature). */
function uptakeRange(title: string, deep: boolean): [number, number] {
  if (FATTY_PORK.test(title)) return [0.01, 0.03];
  if (WRAPPED.test(title)) return deep ? [0.08, 0.15] : [0.06, 0.12];
  if (COATED.test(title)) return deep ? [0.08, 0.14] : [0.05, 0.1];
  return deep ? [0.03, 0.07] : [0.02, 0.05];
}

export function compileRecipe(r: RecipeInput, ctx: CompileContext): CompiledRecipe {
  const lines: CompiledLine[] = [];
  const steps = (r.instructions ?? []).join(" ");
  type Work = { line: CompiledLine; c: Canonical | null; q: ParsedQuantity | null; ep: number };
  const work: Work[] = [];

  for (const ing of r.ingredients) {
    const text = (ing.rawText || [ing.amount, ing.unit, ing.name].filter(Boolean).join(" ")).trim();
    const flags: string[] = [];
    const base: CompiledLine = { ingredientId: ing.id, text, slug: null, label: null, status: "ok", gAP: null, gEaten: null, reason: null, nutrients: null, cost: null, priced: false, flags };

    if (/:\s*$/.test(ing.name.trim())) { lines.push({ ...base, status: "skipped", reason: "section header" }); continue; }
    const alias = lookupAlias(ing.name, ctx.aliases);
    if (!alias) { lines.push({ ...base, status: "unmatched", reason: "ingredient not in catalog yet" }); continue; }
    if (alias.lineClass === "HEADER" || alias.lineClass === "UNIT_ONLY" || alias.lineClass === "EQUIPMENT") {
      lines.push({ ...base, status: "skipped", reason: alias.lineClass.toLowerCase().replace("_", " ") }); continue;
    }
    if (alias.lineClass === "WATER") { lines.push({ ...base, status: "water", gEaten: 0, reason: "water: 0 kcal, not priced" }); continue; }
    if (alias.lineClass === "TO_TASTE") { lines.push({ ...base, status: "to-taste", slug: alias.slugs[0] ?? null, reason: "to taste: not counted" }); continue; }

    // Optional items are left out of nutrition and cost (proposal §5.3 E).
    if (/\boptional\b/i.test(text)) { lines.push({ ...base, status: "optional", slug: alias.slugs[0] ?? null, reason: "optional: not counted" }); continue; }

    const slug = alias.slugs[0];
    const c = ctx.canonicals[slug] ?? null;
    if (!c) { lines.push({ ...base, status: "unmatched", reason: `no catalog entry for ${slug}` }); continue; }
    const q = parseQuantity(ing.amount, ing.unit, ing.name);
    flags.push(...q.flags);
    if (q.unit === "to-taste") { lines.push({ ...base, slug, label: c.label, status: "to-taste", reason: "to taste: not counted" }); continue; }
    const gAP = gramsAP(q, c, alias, flags, text);
    // Edible portion applies to weighed and counted items; volume lines are already trimmed.
    const ep = q.kind === "volume" ? 1 : (c.epPct ?? 100) / 100;
    const line: CompiledLine = { ...base, slug, label: c.label, gAP };
    if (gAP === null) { line.status = "no-weight"; line.reason = "no amount or unknown unit weight"; }
    lines.push(line);
    work.push({ line, c, q, ep });
  }

  // Frying: the largest frying-capable oil line with ≥ 1 cup (or 1/2–1 cup + fry evidence).
  const oils = work.filter((w) => w.c?.role === "frying_oil_candidate" && w.line.gAP !== null);
  const titleFry = FRY_TITLE.test(r.title);
  const veto = BAKE_VETO.test(r.title) && !titleFry;
  let frying: "deep" | "shallow" | null = null;
  let medium: Work | null = null;
  if (oils.length && !veto) {
    medium = oils.reduce((a, b) => (b.line.gAP! > a.line.gAP! ? b : a));
    const ml = medium.line.gAP! / OIL_DENSITY;
    if (ml >= CUP_ML * 0.99) frying = "deep";
    else if (ml >= 115 && (titleFry || DEEP_FRY_STEP.test(steps) || PAN_FRY_STEP.test(steps))) frying = DEEP_FRY_STEP.test(steps) ? "deep" : "shallow";
    else medium = null;
  }

  // Boil-then-fry dishes (lechon kawali, crispy pata): the salt goes into boiling
  // water that is drained away; only a little stays in the meat (≈10%).
  const boilDrain = frying !== null && FATTY_PORK.test(r.title);

  // Non-oil lines first, so the fried food's weight is known.
  for (const w of work) {
    if (w === medium || w.line.gAP === null || !w.c) continue;
    let nf = 1;
    if (w.c.role === "removed_aromatic") { nf = 0; w.line.reason = "removed before serving"; }
    else if (boilDrain && /^salt/.test(w.line.slug ?? "")) { nf = 0.1; w.line.reason = "in the boiling water that is drained: ≈10% stays in the meat"; }
    w.line.gEaten = w.line.gAP * w.ep * nf;
    if (w.ep < 1 && nf === 1) w.line.reason = `≈${Math.round(w.ep * 100)}% edible (peel, bones or shells removed)`;
  }

  let absorbed: [number, number] | null = null;
  if (medium && frying) {
    const oilG = medium.line.gAP!;
    // The fried food: solid lines (not sauces/liquids), plus flour/starch/crumb coatings.
    const isFried = (w: Work) => {
      if (w === medium || !w.line.gEaten || !w.line.slug) return false;
      if (w.q?.kind === "volume") return /flour|starch|crumb|panko/.test(w.line.slug);
      return !LIQUID_SLUG.test(w.line.slug);
    };
    const fryMass = work.filter(isFried).reduce((s, w) => s + (w.line.gEaten ?? 0), 0);
    const [lo, hi] = uptakeRange(r.title, frying === "deep");
    const fallback = frying === "deep" ? [0.08, 0.15] : [0.25, 0.4];
    absorbed = fryMass > 0
      ? [Math.min(oilG, lo * fryMass), Math.min(oilG, hi * fryMass)]
      : [fallback[0] * oilG, fallback[1] * oilG];
    if (fryMass === 0) medium.line.flags.push("fried-food-weight-unknown");
    const mid = (absorbed[0] + absorbed[1]) / 2;
    medium.line.gEaten = mid;
    medium.line.reason = `${frying === "deep" ? "deep-frying" : "pan-frying"} oil: ≈ ${Math.round(absorbed[0])}–${Math.round(absorbed[1])} g absorbed of ${Math.round(oilG)} g; cost counts absorbed + leftover ÷ ${OIL_REUSES} reuses`;
  } else if (medium) {
    medium.line.gEaten = medium.line.gAP;
  }

  // Fatty pork that is boiled then fried or deep-fried renders fat into the oil.
  const fatFactor = frying && FATTY_PORK.test(r.title) ? 0.7 : 1;

  let kcalLow = 0, kcalHigh = 0;
  const total: Nutrients = { ...ZERO };
  let foodLines = 0, withNutrition = 0, priceable = 0, priced = 0;
  let cost = 0;

  for (const w of work) {
    const { line, c } = w;
    if (!c) continue;
    foodLines++;
    const extra = !c.fnriCode && line.slug ? ctx.extraNutrients?.[line.slug] : undefined;
    const f = c.fnriCode ? ctx.fnri.get(c.fnriCode) : extra;
    if (extra) line.flags.push(`nutrition≈${extra.source ?? "approx"}`);
    if (line.gEaten !== null && f) {
      const n = scaled(f, line.gEaten, c.nutrScale ?? 1);
      if (fatFactor < 1 && /^pork_(belly|hock|skin|leg)/.test(line.slug ?? "")) {
        const lost = n.fat * (1 - fatFactor);
        n.fat -= lost; n.kcal -= lost * 9;
        line.reason = `fat renders into the frying oil: ≈ ${Math.round((1 - fatFactor) * 100)}% of its fat removed`;
      }
      line.nutrients = n;
      withNutrition++;
      for (const k of Object.keys(total) as (keyof Nutrients)[]) total[k] += n[k];
      if (w === medium && absorbed && f.calories != null) {
        kcalLow += (absorbed[0] * f.calories) / 100;
        kcalHigh += (absorbed[1] * f.calories) / 100;
      } else { kcalLow += n.kcal; kcalHigh += n.kcal; }
    } else if (line.gEaten === 0) {
      line.nutrients = { ...ZERO };
      withNutrition++;
    } else if (line.gEaten !== null && !f) {
      line.status = line.status === "ok" ? "no-nutrition" : line.status;
      if (!line.reason) line.reason = "no FNRI match yet";
    }
    if (line.gAP !== null) priceable++;
    if (c.daName && line.gAP !== null) {
      const used = w === medium && absorbed ? (absorbed[0] + absorbed[1]) / 2 + (line.gAP - (absorbed[0] + absorbed[1]) / 2) / OIL_REUSES : line.gAP;
      const lc = lineCost(c, used, ctx.da.get(c.daName), c.role === "frying_oil_candidate");
      if (lc !== null) { line.cost = lc; line.priced = true; priced++; cost += lc; }
    }
  }

  const servingsAssumed = !r.servings || r.servings < 1;
  const servings = servingsAssumed ? 4 : r.servings!;
  const per = (v: number) => v / servings;
  return {
    id: r.id,
    servings,
    servingsAssumed,
    method: { frying, absorbedOilG: absorbed },
    perServing: {
      ...(Object.fromEntries(Object.entries(total).map(([k, v]) => [k, per(v)])) as unknown as Nutrients),
      kcalLow: per(kcalLow), kcalHigh: per(kcalHigh),
    },
    costPerServing: priced ? per(cost) : null,
    nutritionCoverage: foodLines ? withNutrition / foodLines : 0,
    costCoverage: priceable ? priced / priceable : 0,
    lines,
  };
}
