/**
 * After cooking: how much vitamin C, vitamin A, iron and calcium is left on the plate.
 *
 * FNRI values are mostly for raw food. Each raw ingredient line gets a cooking method (from
 * the dish title, the steps and the frying the engine already found) and a cooking group
 * (cook-groups.tsv: leafy_veg, veg, animal). The share kept comes from retention-factors.tsv
 * (true retention, so no yield factor is needed for per-serving totals). Foods not in a group
 * (cooked or canned FNRI rows, condiments, oils, grains, dairy) keep all their nutrients, so
 * nothing is counted twice. Research and sources: research/cooking-nutrients/.
 */
import type { Appliance } from "./appliances.ts";

export const COOKED_KEYS = ["vitaminC", "vitaminA", "iron", "calcium"] as const;
export type CookedKey = (typeof COOKED_KEYS)[number];

export type CookMethod =
  | "raw" | "acid" | "blanch" | "boil_drained" | "boil_broth" | "stew" | "saute" | "steam"
  | "deep_fry" | "pan_fry" | "grill" | "bake" | "microwave" | "pressure" | "cooked";

export type Retention = Record<string, { factor: number | null; low: number | null; high: number | null; source: string }>;

const ACID = /\b(kinilaw|kilawin|kilawen|ceviche)\b/i;
const GRILL = /\b(inihaw|ihaw|grill(ed)?|inasal|barbecue|bbq|broiled|skewers?)\b/i;
const STEAM = /\b(steamed|pinasingawan|puto|kutsinta|siomai|siopao|suman)\b/i;
const SOUP = /\b(nilaga|nilagang|bulalo|sinigang|tinola|tinolang|sopas|molo|binakol|binacol|pesa|utan|laswa|dinengdeng|batchoy|lomi|mami|soup|sabaw|linat-an|kansi|pochero|puchero|arroz caldo|lugaw|goto|sinampalukan|bulanglang|suam|halang[- ]halang)\b/i;
const STEW = /\b(adobo|adobong|kaldereta|caldereta|menudo|afritada|mechado|paksiw|kare[- ]kare|ginataan|ginataang|laing|bicol express|pinakbet|pakbet|dinuguan|igado|estofado|asado|humba|stew|braised|curry|sarciado|pinangat)\b/i;
const SAUTE = /\b(ginisa|ginisang|guisado|gisado|chop ?suey|stir[- ]?fr(y|ied)|saut[eé]ed|gising[- ]gising|pancit|bihon|canton|sotanghon)\b/i;
const RAW = /\b(salads?|ensalada|ensaladang|shakes?|smoothies?|juice|lemonade|salsa|halo[- ]halo|float|parfait)\b/i;
const OVEN = /\b(bake|baked|roast(ed)?|oven)\b/i;
const BOIL_DRAIN = /\b(blanch(ed|ing)?)\b|\bboil[^.]{0,80}\bdrain/i;

export interface DishMethod { method: CookMethod; why: string }

/** The dish's main cooking method, strongest evidence first. "cooked" means unknown. */
export function dishMethod(title: string, steps: string, frying: "deep" | "shallow" | null, appliances: Appliance[]): DishMethod {
  const t = title;
  if (ACID.test(t)) return { method: "acid", why: "kinilaw: fish or vegetables in vinegar, no heat" };
  if (frying) return { method: frying === "deep" ? "deep_fry" : "pan_fry", why: frying === "deep" ? "deep-fried" : "pan-fried" };
  if (GRILL.test(t)) return { method: "grill", why: "grilled (from the title)" };
  if (STEAM.test(t)) return { method: "steam", why: "steamed (from the title)" };
  if (SOUP.test(t)) return { method: "boil_broth", why: "simmered in a broth that is eaten (from the title)" };
  if (STEW.test(t)) return { method: "stew", why: "stewed in a sauce that is eaten (from the title)" };
  if (SAUTE.test(t)) return { method: "saute", why: "sautéed / stir-fried (from the title)" };
  if (RAW.test(t)) {
    // Ensaladang kangkong, okra or ampalaya: the vegetables are often blanched and drained first.
    if (BOIL_DRAIN.test(steps)) return { method: "boil_drained", why: "salad of blanched or boiled vegetables, water drained (from the steps)" };
    return { method: "raw", why: "served raw or mostly raw (from the title)" };
  }
  if (appliances.includes("grill") || GRILL.test(steps)) return { method: "grill", why: "grilled (from the steps)" };
  if (appliances.includes("steamer")) return { method: "steam", why: "steamed (from the steps)" };
  if (appliances.includes("oven") || OVEN.test(t)) return { method: "bake", why: "baked or roasted in an oven" };
  if (appliances.includes("pressure_cooker")) return { method: "pressure", why: "pressure-cooked" };
  if (appliances.includes("microwave")) return { method: "microwave", why: "microwaved" };
  if (BOIL_DRAIN.test(steps)) return { method: "boil_drained", why: "boiled and drained (from the steps)" };
  return { method: "cooked", why: "cooking method not clear: a wide range is shown" };
}

/** A line's method: greens go in at the end of soups and stews; meat in a salad is cooked first. */
export function lineMethod(dish: CookMethod, group: string): CookMethod {
  if (dish === "raw") return group === "animal" ? "cooked" : "raw";
  if (group === "leafy_veg" && (dish === "boil_broth" || dish === "stew" || dish === "saute" || dish === "pressure")) return "blanch";
  return dish;
}

/** Share kept [factor, low, high] for a group, method and nutrient; foods without a group keep everything. */
export function retained(retention: Retention, group: string | undefined, method: CookMethod, key: CookedKey): [number, number, number] {
  if (!group) return [1, 1, 1];
  const r = retention[`${group}|${method}|${key}`] ?? retention[`${group}|cooked|${key}`];
  if (!r || r.factor == null) return [1, 1, 1];
  return [r.factor, r.low ?? r.factor, r.high ?? r.factor];
}
