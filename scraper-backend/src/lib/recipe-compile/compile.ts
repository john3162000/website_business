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
import { isUnit, parseQuantity, type ParsedQuantity } from "./quantity.ts";
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
  /** Reference prices for items DA doesn't list (DTI SRP): ₱ per pack of packAmount g or ml. */
  manualPrices?: Record<string, { price: number | null; packAmount: number | null; packUnit: string; source: string }>;
  /** Fallback per-100 g nutrients by slug, for items FNRI doesn't have (approximate). */
  extraNutrients?: Record<string, FnriFood & { source?: string }>;
  fnri: Map<string, FnriFood>;
  da: Map<string, DaPrice>;
  /** PSA monthly NCR retail prices by PSA commodity name; used when DA has no price. */
  psa?: Map<string, PsaPrice>;
}
export interface PsaPrice {
  price: number;
  per: "kg" | "piece";
  /** First day of the month, ISO; shown as "PSA Sep 2026". */
  period: string;
}
export interface RecipeInput {
  id: number;
  title: string;
  servings: number | null;
  /**
   * group: the ingredient group heading on the page ("Marinade ingredients"), when there is one.
   * slug: a catalog ingredient chosen directly (the personal dish builder), skipping name matching.
   */
  ingredients: { id?: number; name: string; amount: string | null; unit: string | null; rawText?: string | null; group?: string | null; slug?: string | null }[];
  instructions?: string[];
}

export type LineStatus =
  | "ok" | "to-taste" | "optional" | "water" | "skipped" | "unmatched" | "no-weight" | "no-nutrition";

export interface CompiledLine {
  ingredientId?: number;
  text: string;
  /** Group heading the line sits under: from the page, or a heading line above it ("Marinade ingredients:"). */
  group: string | null;
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
  /** Where the price came from: "DA" (daily market prices) or e.g. "DTI SRP 11 May 2026". */
  priceSource: string | null;
  flags: string[];
}

export interface CompiledRecipe {
  id: number;
  /** No ingredient lines: an article or guide, not a recipe. */
  isArticle: boolean;
  /** Round-up post holding several recipes in one card ("Easy Sisig Recipes"): totals are combined. */
  isCollection: boolean;
  servings: number;
  servingsAssumed: boolean;
  method: { frying: "deep" | "shallow" | null; absorbedOilG: [number, number] | null };
  perServing: Nutrients & { kcalLow: number; kcalHigh: number };
  costPerServing: number | null;
  /** Share of weighed food lines with FNRI nutrition / with a DA price (0–1). Condiments DA doesn't sell lower costCoverage. */
  nutritionCoverage: number;
  costCoverage: number;
  /** Same, weighted by grams as bought: a priced pinch of salt can't hide an unpriced 1 kg fish. Unmatched lines count as unweighed. */
  nutritionCoverageByWeight: number;
  costCoverageByWeight: number;
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

const HEAD_NOUNS = /^(broth|stock|juice|sauce|noodles?|powder|oil|cubes?|paste|flour|extract|flavou?ring|wine|vinegar|milk|cream|chips|mix|soup|rinds?|skin|bones?|fat|water|leaves|seeds?|spread|jam|syrup|balls?|sausages?|patties|burgers?|nuggets?|crackers?|cake|bread)$/;

/**
 * Generic names ("coconut", "corn", "mushroom", "vanilla") marked [exact] in the alias note
 * match only the whole name, never as part of a longer one: "young coconut meat" is not
 * grated coconut, "cream style corn" is not corn on the cob, "vanilla ice cream" is not extract.
 */
const exactOnly = (a: Alias) => a.note?.includes("[exact]") ?? false;

// Alias keys sorted longest first, for "find a known ingredient inside the line".
let aliasKeysByLength: string[] | null = null;
let aliasKeysSource: Record<string, Alias> | null = null;

function containedAlias(text: string, aliases: Record<string, Alias>): Alias | null {
  if (aliasKeysSource !== aliases) {
    aliasKeysSource = aliases;
    aliasKeysByLength = Object.keys(aliases)
      .filter((k) => aliases[k].lineClass === "FOOD" && k.length >= 3 && !/\d/.test(k) && !exactOnly(aliases[k]))
      .sort((a, b) => b.length - a.length);
  }
  const t = ` ${text.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()} `;
  for (const k of aliasKeysByLength!) {
    const needle = ` ${k.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()} `;
    const at = t.indexOf(needle);
    if (at < 0) continue;
    // English names are head-final: in "pork broth" or "rice noodles" the food is
    // the last noun, so a match followed by a form-changing noun is not this food.
    const next = t.slice(at + needle.length).trim().split(" ")[0] ?? "";
    if (HEAD_NOUNS.test(next)) continue;
    return aliases[k];
  }
  return null;
}

// Words around a food name that don't change which food it is: "* mushrooms",
// "of pasta", "serving teriyaki sauce", "chives for garnish", "whipped cream as needed".
const LEAD_NOISE = /^(?:[^a-z0-9]+|(?:a|an|of|servings?)\s+)+/;
const TRAIL_NOISE = /\s+(?:for (?:garnish(?:ing)?|topping|serving|dipping|wrapping)|as needed|if desired|(?:with )?(?:bones?|skin|seeds?|heads?) (?:removed|discarded))\b.*$/;

function lookupAlias(name: string, aliases: Record<string, Alias>, contained = true): Alias | null {
  let k = nameKey(name);
  if (aliases[k]) return aliases[k];
  k = k.replace(LEAD_NOISE, "").replace(TRAIL_NOISE, "").trim();
  if (aliases[k]) return aliases[k];
  // "olive or sesame oil", "balaw or bagoong alamang": try each option in order.
  const options = k.split(/\s+or\s+/);
  if (options.length > 1) for (const o of options) { const a = aliases[o.trim()]; if (a && !exactOnly(a)) return a; }
  const stripped = k.replace(SIZE_WORDS, " ").replace(/\s+/g, " ").trim();
  if (aliases[stripped]) return aliases[stripped];
  const bare = stripped.replace(PREP_WORDS, " ").replace(/[,()]/g, " ").replace(/\s+/g, " ").trim();
  if (aliases[bare]) return aliases[bare];
  if (bare.endsWith("es") && aliases[bare.slice(0, -2)]) return aliases[bare.slice(0, -2)];
  if (bare.endsWith("s") && aliases[bare.slice(0, -1)]) return aliases[bare.slice(0, -1)];
  if (aliases[`${bare}s`]) return aliases[`${bare}s`];
  // A note after a comma, semicolon or bracket: "chickpeas, water removed", "bamboo shoot; cut in 2 inch length".
  const head = k.split(/\s*[;,(]/)[0].trim();
  if (head && head !== k) { const h = lookupAlias(head, aliases, false); if (h) return h; }
  // Last resort: the longest known ingredient name inside the line
  // ("slab 2 pounds pork belly" → pork belly, "grams of pasta" → pasta).
  return contained ? containedAlias(k, aliases) : null;
}

// ── Scraper leftovers: the name span holds a unit, size or filler word, not the food ──
// "1 slab 2 pounds pork belly" was split as name "slab", "3 tablespoons butter" as name
// "tablespoons", "A pinch of nutmeg" has no amount span. These words are re-read as the
// amount and unit, and the food is taken from the rest of the line.
const FILLER = /^(a|an|one|of|thick|thin|small|medium|large|big|jumbo|slabs?|servings?|hint|drops?|envelopes?|sheets?|cobs?|bags?|jars?|sticks?)$/;
const MODIFIER = /^(dried|fresh|organic)$/;
const SIZE = /^(small|medium|large|big|jumbo)$/;
// Water with only adjectives or a purpose around it: "lukewarm water", "additional water
// for boiling", "of ice cold water placed in a large bowl", "water enough to cover the leg".
const WATER_NAME = /^(?:(?:a|of|additional|extra|more|some|warm|lukewarm|tepid|hot|cold|ice|ice-cold|iced|boiling|clean|tap|distilled|filtered|plain|enough|rice|annatto|soaking)\s+)*water\b(?!\s*(?:chestnuts?|spinach|melons?|cress|crackers?))/;
const WATER_ALIAS: Alias = { lineClass: "WATER", slugs: [], size: null, note: null };
// "Juice of 2 lemons", "juice from 8 limes": a count of fruit, juiced.
const JUICE_OF = /^juice (?:of|from) (?:the )?(\d+(?:\.\d+)?|an?|one) (lemon|lime|orange|calamansi)(?:e?s)?\b/;

interface LineSource { amount: string | null; unit: string | null; name: string }

function reread(ing: { name: string; amount: string | null; unit: string | null }, text: string): LineSource | null {
  const key = nameKey(ing.name).replace(/^[^a-z0-9]+/, "").replace(/[.,;]+$/, "");
  const juice = key.match(JUICE_OF);
  if (juice) return { amount: /^\d/.test(juice[1]) ? juice[1] : "1", unit: null, name: `${juice[2]} juice` };
  const words = key.split(" ");
  // Units that are also food words ("whole chicken", "cloves", "rib eye", "head lettuce") stay in the name.
  const lead = (w: string) => FILLER.test(w) || (isUnit(w) && !/^(whole|cloves?|heads?|ribs?|stems?|cubes?|blocks?|[a-z])$/.test(w));
  const nameLost = words.every((w) => lead(w) || MODIFIER.test(w));
  // A leading size word alone ("small bottle gourd") is read by parseQuantity as usual.
  if (!nameLost && (!lead(words[0]) || SIZE.test(words[0]))) return null;
  // Name lost: the food is in the rest of the line, after the amount and unit as written.
  let rest = nameLost ? text : ing.name;
  if (nameLost) {
    if (ing.amount && rest.startsWith(ing.amount)) rest = rest.slice(ing.amount.length).trimStart();
    if (ing.unit && rest.toLowerCase().startsWith(ing.unit.toLowerCase())) rest = rest.slice(ing.unit.length).trimStart();
  }
  let amount = ing.amount, unit = ing.unit, size: string | null = null;
  const tokens = rest.split(/\s+/).filter(Boolean);
  while (tokens.length && lead(tokens[0].toLowerCase())) {
    const w = tokens.shift()!.toLowerCase();
    if (/^(a|an|one)$/.test(w)) { if (!/\d/.test(amount ?? "")) amount = "1"; }
    else if (/^(hint|drops?)$/.test(w)) unit ??= "dash";
    else if (SIZE.test(w)) size = w;
    else if (isUnit(w)) unit ??= w;
  }
  // "1 serving 3 1/2 cups marinara sauce": a single serving given as a measured amount.
  const inner = tokens.join(" ").match(/^(\d+(?:\s+\d+\/\d+|[./]\d+)?)\s+(\S+)\s+(.*)$/);
  if (inner && isUnit(inner[2]) && (!amount || amount === "1" || /^(cups?|tablespoons?|tbsp|teaspoons?|tsp|quarts?|pints?|liters?|l|ml)\.?$/i.test(inner[2])) && !/^(oz|ounces?|g|grams?|kg|ml|lbs?|pounds?)\.?$/i.test(inner[2])) {
    return { amount: inner[1], unit: inner[2], name: inner[3] };
  }
  // Mass inside the rest ("2 pounds pork belly") is a package size: parseQuantity reads it.
  return { amount, unit: unit ?? size, name: tokens.join(" ") };
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
  // A weight written in the name ("1 slab 2 pounds pork belly") beats a piece guess.
  if (q.packageAmount && q.packageKind === "mass") return n * q.packageAmount;
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

// ── Marinades, brines and dredging: lines that are only partly eaten ──
// Factors are author heuristics [heur], to be calibrated against the
// Panlasang Pinoy reference (/api/recipes/nutrition-check).
type Section = "marinade" | "brine" | "dredge";
const MARINADE_DISCARDED = 0.2;   // drained and thrown away: the meat keeps ≈20%
const MARINADE_DRAINED = 0.3;     // fried or grilled dish, fate not stated: usually drained first
const MARINADE_BASTED = 0.5;      // brushed on while grilling
const BRINE_KEPT = 0.1;           // like salted boiling water that is drained
const DREDGE_DRY_KEPT = 0.3;      // flour/starch/crumbs: most stays in the dredging plate
const DREDGE_WET_KEPT = 0.6;      // egg or milk wash
const PROTEIN_DIET = /^(MEAT|POULTRY|FISH|SEAFOOD)$/;
const GRILLED = /\b(grill(ed|ing)?|inihaw|ihaw|barbecue|bbq|broil(ed)?|roast(ed)?|skewers?)\b/i;

/** What a group heading or a line's own note says about the line. */
export function sectionOf(heading: string | null | undefined, text = ""): Section | null {
  const t = text.toLowerCase();
  if (/\bfor (dredging|coating|breading)\b/.test(t)) return "dredge";
  if (/\bfor (the )?brin(e|ing)\b/.test(t)) return "brine";
  if (/\bfor (the )?marinade\b|\bfor marinating\b/.test(t)) return "marinade";
  const h = (heading ?? "").toLowerCase();
  if (!h) return null;
  if (/\bbrin(e|ing)\b/.test(h)) return "brine";
  if (/marinad|marinate/.test(h)) return "marinade";
  if (/dredg|breading|coating|\bto coat\b|crumb/.test(h)) return "dredge";
  return null;
}

// "the marinade", not "the marinade ingredients" (that's the marinating step).
const MARINADE = String.raw`\bmarinade\b(?!\s+ingredients)`;
const MARINADE_DISCARD = new RegExp(String.raw`\bdiscard(ing|ed)?\b[^.]{0,40}${MARINADE}|${MARINADE}[^.]{0,30}\bdiscard`, "i");
// Poured into the pan ("pour-in the marinade", "add the reserved marinade", "the marinade … simmer").
// "Add the pork to the marinade" is marinating, so `add` must be followed by the marinade itself.
const MARINADE_REUSED = new RegExp(
  String.raw`\b(pour|reserved?|remaining|leftover)\b[^.]{0,25}${MARINADE}|\badd(?:[\s-]+(?:in|the|reserved|remaining|all|of))*[\s-]+${MARINADE.slice(2)}|${MARINADE}[^.]{0,40}\b(simmer|boil|bring|reduce)\b`,
  "i",
);
const FRY_WORD = /\bfr(y|ied|ying)\b/i;

/** How much of a marinade ends up eaten, from what the steps say happens to it. */
function marinadeFate(steps: string, title: string, fried: boolean): { kept: number; reason: string } {
  if (MARINADE_DISCARD.test(steps)) {
    return { kept: MARINADE_DISCARDED, reason: `marinade is discarded: ≈${MARINADE_DISCARDED * 100}% stays on the food` };
  }
  if (MARINADE_REUSED.test(steps)) return { kept: 1, reason: "marinade is cooked with the dish" };
  if (/\bbast(e|ing)\b/i.test(steps)) {
    return { kept: MARINADE_BASTED, reason: `marinade is used for basting: ≈${MARINADE_BASTED * 100}% counted` };
  }
  const notGrill = (s: string) => s.replace(/\bno[- ]grill\b/gi, "");
  const frying = fried || FRY_WORD.test(steps);
  if (frying || GRILLED.test(notGrill(title)) || GRILLED.test(notGrill(steps))) {
    return { kept: MARINADE_DRAINED, reason: `marinade is usually drained before ${frying ? "frying" : "grilling"}: ≈${MARINADE_DRAINED * 100}% counted` };
  }
  return { kept: 1, reason: "marinade stays with the dish" };
}

/** Uptake as a fraction of the fried food's weight: [low, high] (≈, Bognár / frying literature). */
function uptakeRange(title: string, deep: boolean): [number, number] {
  if (FATTY_PORK.test(title)) return [0.01, 0.03];
  if (WRAPPED.test(title)) return deep ? [0.08, 0.15] : [0.06, 0.12];
  if (COATED.test(title)) return deep ? [0.08, 0.14] : [0.05, 0.1];
  return deep ? [0.03, 0.07] : [0.02, 0.05];
}

/** Lines whose ingredient isn't in the catalog yet. */
export function unknownLineCount(c: Pick<CompiledRecipe, "lines">): number {
  return c.lines.filter((l) => l.status === "unmatched").length;
}

/**
 * A recipe with any ingredient not in the catalog is hidden from rankings and lists:
 * its cost and nutrition would leave that ingredient out. It is not deleted, and
 * shows again as soon as the catalog learns the ingredient.
 */
export function isHidden(c: Pick<CompiledRecipe, "lines">): boolean {
  return unknownLineCount(c) > 0;
}

export function compileRecipe(r: RecipeInput, ctx: CompileContext): CompiledRecipe {
  const lines: CompiledLine[] = [];
  const steps = (r.instructions ?? []).join(" ");
  type Work = { line: CompiledLine; c: Canonical | null; q: ParsedQuantity | null; ep: number; section: Section | null };
  const work: Work[] = [];
  // Some recipes write their group headings as ingredient lines ("Marinade ingredients:").
  let headingLine: string | null = null;

  for (const ing of r.ingredients) {
    const text = (ing.rawText || [ing.amount, ing.unit, ing.name].filter(Boolean).join(" ")).trim();
    const flags: string[] = [];
    const group = ing.group ?? headingLine;
    const base: CompiledLine = { ingredientId: ing.id, text, group, slug: null, label: null, status: "ok", gAP: null, gEaten: null, reason: null, nutrients: null, cost: null, priced: false, priceSource: null, flags };

    if (/:\s*$/.test(ing.name.trim())) {
      headingLine = ing.name.trim().replace(/:\s*$/, "");
      lines.push({ ...base, group: null, status: "skipped", reason: "section header" }); continue;
    }
    const picked: Alias | null = ing.slug && ctx.canonicals[ing.slug] ? { lineClass: "FOOD", slugs: [ing.slug], size: null, note: null } : null;
    const direct = picked ?? ctx.aliases[nameKey(ing.name)];
    const reparsed = direct && direct.lineClass !== "UNIT_ONLY" && !JUICE_OF.test(nameKey(ing.name)) ? null : reread({ name: ing.name, amount: ing.amount, unit: ing.unit }, text);
    const src: LineSource = reparsed ?? { name: ing.name, amount: ing.amount, unit: ing.unit };
    if (reparsed && !reparsed.name) { lines.push({ ...base, status: "skipped", reason: "unit only" }); continue; }
    // Water first: "water for cooking the pasta" is not pasta.
    const alias = (reparsed ? null : direct)
      ?? (WATER_NAME.test(nameKey(src.name).replace(LEAD_NOISE, "")) ? WATER_ALIAS : null)
      ?? lookupAlias(parseQuantity(src.amount, src.unit, src.name).name, ctx.aliases)
      ?? lookupAlias(src.name, ctx.aliases);
    if (!alias) { lines.push({ ...base, status: "unmatched", reason: "ingredient not in catalog yet" }); continue; }
    if (alias.lineClass === "HEADER") {
      headingLine = ing.name.trim();
      lines.push({ ...base, group: null, status: "skipped", reason: "header" }); continue;
    }
    if (alias.lineClass === "UNIT_ONLY" || alias.lineClass === "EQUIPMENT") {
      lines.push({ ...base, status: "skipped", reason: alias.lineClass.toLowerCase().replace("_", " ") }); continue;
    }
    if (alias.lineClass === "WATER") { lines.push({ ...base, status: "water", gEaten: 0, reason: "water: 0 kcal, not priced" }); continue; }
    if (alias.lineClass === "TO_TASTE") { lines.push({ ...base, status: "to-taste", slug: alias.slugs[0] ?? null, reason: "to taste: not counted" }); continue; }

    // Optional items are left out of nutrition and cost (proposal §5.3 E).
    if (/\boptional\b/i.test(text)) { lines.push({ ...base, status: "optional", slug: alias.slugs[0] ?? null, reason: "optional: not counted" }); continue; }

    let slug = alias.slugs[0];
    // "1 cup rice cooked", "2 cups cooked jasmine rice": measured cooked, not raw.
    if (slug === "rice_white_raw" && /\b(cooked|leftover|steamed)\b/i.test(text)) slug = "rice_white_cooked";
    const c = ctx.canonicals[slug] ?? null;
    if (!c) { lines.push({ ...base, status: "unmatched", reason: `no catalog entry for ${slug}` }); continue; }
    const q = parseQuantity(src.amount, src.unit, src.name);
    flags.push(...q.flags);
    if (q.unit === "to-taste" || (q.value === null && /\bto taste\b|\bas needed\b/i.test(text))) { lines.push({ ...base, slug, label: c.label, status: "to-taste", reason: "to taste: not counted" }); continue; }
    const gAP = gramsAP(q, c, alias, flags, text);
    // Edible portion applies to weighed and counted items; volume lines are already trimmed.
    const ep = q.kind === "volume" ? 1 : (c.epPct ?? 100) / 100;
    const line: CompiledLine = { ...base, slug, label: c.label, gAP };
    if (gAP === null) { line.status = "no-weight"; line.reason = "no amount or unknown unit weight"; }
    lines.push(line);
    // The meat or fish listed inside a marinade group is still eaten whole.
    const section = PROTEIN_DIET.test(c.dietClass ?? "") ? null : sectionOf(group, text);
    work.push({ line, c, q, ep, section });
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

  const marinade = work.some((w) => w.section === "marinade") ? marinadeFate(steps, r.title, frying !== null) : null;

  // Non-oil lines first, so the fried food's weight is known.
  for (const w of work) {
    if (w === medium || w.line.gAP === null || !w.c) continue;
    let nf = 1;
    if (w.c.role === "removed_aromatic") { nf = 0; w.line.reason = "removed before serving"; }
    else if (w.section === "marinade" && marinade && marinade.kept < 1) { nf = marinade.kept; w.line.reason = marinade.reason; }
    else if (w.section === "brine") { nf = BRINE_KEPT; w.line.reason = `brine is drained: ≈${BRINE_KEPT * 100}% stays in the meat`; }
    else if (w.section === "dredge") {
      const wet = /egg|milk|cream|water/.test(w.line.slug ?? "");
      nf = wet ? DREDGE_WET_KEPT : DREDGE_DRY_KEPT;
      w.line.reason = `for dredging or breading: ≈${Math.round(nf * 100)}% sticks to the food`;
    }
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
  let gTotal = 0, gWithNutrition = 0, gPriced = 0;
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
    if (line.gAP !== null) { priceable++; gTotal += line.gAP; }
    const hadNutrition = line.nutrients !== null;
    // Price sources in order: DA (daily), PSA (monthly palengke), then the SM / DTI reference prices.
    const setCost = (lc: number, source: string) => { line.cost = lc; line.priced = true; line.priceSource = source; priced++; cost += lc; };
    if (line.gAP !== null) {
      const used = w === medium && absorbed ? (absorbed[0] + absorbed[1]) / 2 + (line.gAP - (absorbed[0] + absorbed[1]) / 2) / OIL_REUSES : line.gAP;
      const da = c.daName ? lineCost(c, used, ctx.da.get(c.daName), c.role === "frying_oil_candidate") : null;
      const p = c.psaName ? ctx.psa?.get(c.psaName) : undefined;
      const g = c.cookedPerRaw ? used / c.cookedPerRaw : used;
      const psa = p ? (p.per === "kg" ? (p.price / 1000) * g : c.gEach ? (p.price / c.gEach) * g : null) : null;
      const m = line.slug ? ctx.manualPrices?.[line.slug] : undefined;
      if (da !== null) setCost(da, "DA");
      else if (psa !== null && p) setCost(psa, `PSA ${new Date(p.period).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}`);
      else if (m && m.price != null && m.packAmount) {
        // Packs sold by volume: grams → ml through the catalog's grams-per-cup.
        const amount = m.packUnit === "ml" ? (c.gPerCup ? line.gAP / (c.gPerCup / CUP_ML) : line.gAP) : line.gAP;
        setCost((m.price / m.packAmount) * amount, m.source);
      }
    }
    if (line.gAP !== null) {
      if (hadNutrition) gWithNutrition += line.gAP;
      if (line.priced) gPriced += line.gAP;
    }
  }

  const unweighed = lines.filter((l) => l.status === "unmatched" || l.status === "no-weight").length;
  const servingsAssumed = !r.servings || r.servings < 1;
  const servings = servingsAssumed ? 4 : r.servings!;
  const per = (v: number) => v / servings;
  const slugCounts = new Map<string, number>();
  for (const l of lines) if (l.slug) slugCounts.set(l.slug, (slugCounts.get(l.slug) ?? 0) + 1);
  const repeats = [...slugCounts.values()].filter((v) => v >= 3).length;
  // Recipes with a separate sauce or marinade list repeat salt/garlic/onion once
  // or twice; a round-up of several dishes repeats many ingredients 3+ times.
  const isCollection = /\b(recipes|ways|variations)\b/i.test(r.title) || repeats >= 3;
  return {
    id: r.id,
    isArticle: r.ingredients.length === 0,
    isCollection,
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
    // Unmatched lines have no weight; count each as a typical 100 g so they still lower coverage.
    nutritionCoverageByWeight: gTotal + unweighed * 100 ? gWithNutrition / (gTotal + unweighed * 100) : 0,
    costCoverageByWeight: gTotal + unweighed * 100 ? gPriced / (gTotal + unweighed * 100) : 0,
    lines,
  };
}
