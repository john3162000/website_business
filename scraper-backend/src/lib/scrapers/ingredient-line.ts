/**
 * Helpers for recipe sites that only publish schema.org Recipe JSON-LD (no WP Recipe Maker
 * markup): split a "2 tbsp fish sauce" string into amount / unit / name like the WPRM spans,
 * pull the step text (used only for method notes, never stored), and a dish key that says when
 * two sites have the same dish ("Chicken Adobo Recipe" = "Easy Filipino Chicken Adobo").
 *
 * Pure: no network, so the crawler and the tests share them.
 */
import { isUnit } from "../recipe-compile/quantity.ts";

const FRACTIONS = "½¼¾⅓⅔⅛⅜⅝⅞⅕";
// "1", "1.5", "1/2", "1 1/2", "½", "1½", "2-3", "2 to 3", "1/2 - 1"
// Longest forms first, so "1 1/2" isn't read as "1".
const NUM = `(?:\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\s*\\/\\s*\\d+|\\d+(?:\\.\\d+)?(?:\\s*[${FRACTIONS}])?|[${FRACTIONS}])`;
const AMOUNT_RE = new RegExp(`^(${NUM}(?:\\s*(?:-|–|to)\\s*${NUM})?)(?=\\s|$|[a-z(])\\s*(.*)$`, "i");

export interface SplitLine {
  rawText: string;
  amount?: string;
  unit?: string;
  name: string;
}

/** Decodes the few HTML entities JSON-LD strings carry ("&amp;", "&#8217;", "&frac12;"). */
export function decodeEntities(s: string): string {
  return s
    .replace(/&frac12;/g, "½").replace(/&frac14;/g, "¼").replace(/&frac34;/g, "¾")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/**
 * Page text as a person reads it: entities decoded, a broken JSON escape ("u0026" for "&") fixed,
 * zero-width characters dropped, spaces collapsed, and "1 & ½" / "1 and 1/2" written "1 ½".
 */
export function cleanText(s: string): string {
  return decodeEntities(s)
    .replace(/\\?u0026/g, "&")
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\b(\d+)\s*(?:&|and)\s*(\d+\s*\/\s*\d+|[½¼¾⅓⅔⅛⅜⅝⅞⅕])/g, "$1 $2")
    .trim();
}

/**
 * "2 tbsp fish sauce" → {amount "2", unit "tbsp", name "fish sauce"}; "1 (14 oz) can coconut milk"
 * keeps the package in the name for parseQuantity; "salt and pepper to taste" has no amount.
 */
export function splitIngredientLine(text: string): SplitLine {
  const rawText = cleanText(decodeEntities(text).replace(/<[^>]+>/g, " ").replace(/^\s*▢\s*/, ""));
  const m = rawText.match(AMOUNT_RE);
  if (!m) return { rawText, name: rawText };
  const amount = m[1].replace(/\s+/g, " ").trim();
  let rest = m[2];
  // "1 (14 oz) can coconut milk": the unit comes after the package size.
  const pkg = rest.match(/^(\([^)]*\))\s*(.*)$/);
  const head = pkg ? pkg[2] : rest;
  const word = head.match(/^([a-z]+\.?(?:\s+oz\.?)?)(?=\s|$)\s*(.*)$/i);
  if (word && isUnit(word[1]) && !/^(whole|t|c|l)$/i.test(word[1])) {
    rest = pkg ? `${pkg[1]} ${word[2]}` : word[2];
    return { rawText, amount, unit: word[1], name: rest.replace(/^of\s+/i, "").trim() || rawText };
  }
  return { rawText, amount, name: rest.trim() || rawText };
}

type Json = Record<string, unknown>;

/** The step texts from recipeInstructions: a string, HowToStep list, or HowToSection groups. */
export function instructionTexts(v: unknown): string[] {
  const out: string[] = [];
  const walk = (x: unknown) => {
    if (x == null) return;
    if (typeof x === "string") {
      for (const part of decodeEntities(x).replace(/<[^>]+>/g, "\n").split(/\n+/)) if (part.trim()) out.push(part.trim());
      return;
    }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (typeof x === "object") {
      const o = x as Json;
      if (o.itemListElement) walk(o.itemListElement);
      else if (typeof o.text === "string") walk(o.text);
      else if (typeof o.name === "string") walk(o.name);
    }
  };
  walk(v);
  return out;
}

/** ISO-8601 duration ("PT1H30M") → minutes, or null. */
export function isoMinutes(v: unknown): number | null {
  const m = String(v ?? "").match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  const min = (+(m[1] ?? 0)) * 1440 + (+(m[2] ?? 0)) * 60 + +(m[3] ?? 0);
  return min > 0 ? min : null;
}

/** The image URL from a JSON-LD image field (string, array, or ImageObject). */
export function jsonLdImage(v: unknown): string | undefined {
  const first = Array.isArray(v) ? v[0] : v;
  if (typeof first === "string") return first || undefined;
  if (first && typeof first === "object") {
    const u = (first as Json).url ?? (first as Json)["@id"];
    return typeof u === "string" && /^https?:/.test(u) ? u : undefined;
  }
  return undefined;
}

// Words that don't change which dish it is.
const DISH_NOISE = /\b(recipes?|easy|simple|quick|best|the|ultimate|perfect|homemade|authentic|classic|special|delicious|yummy|filipino|pinoy|pilipino|philippine|style|version|how|to|make|cook|cooking|a|an|my|our|with|and|na|ng|sa|at|ang)\b/g;

/**
 * A dish's identity across sites: lowercase, no accents, no "(Filipino style)" parentheticals or
 * "Recipe"/"Easy"/"Pinoy" noise, words sorted ("Adobong Manok" and "Manok Adobong" stay apart only
 * by spelling). Two titles with the same key are the same dish.
 */
export function dishKey(title: string): string {
  const words = decodeEntities(title)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(DISH_NOISE, " ")
    .split(/\s+/)
    .filter(Boolean);
  return [...new Set(words)].sort().join(" ");
}
