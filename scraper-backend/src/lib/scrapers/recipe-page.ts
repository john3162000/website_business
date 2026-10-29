/**
 * Reads one recipe page into what the crawl stores. Two kinds of page:
 *  - WP Recipe Maker (Panlasang Pinoy and many food blogs): amount / unit / name come from the
 *    recipe card's own spans, with ingredient group headings;
 *  - any other page with schema.org Recipe JSON-LD: recipeIngredient strings, split here.
 * The steps are read only to derive method notes (compile.ts methodNotes); they are not stored.
 *
 * Pure: takes the page HTML, so tests run it on saved snippets.
 */
import * as cheerio from "cheerio";
import { findRecipeJsonLd, parseStructured, type RefNutrition } from "./recipe-structured.ts";
import { cleanText, instructionTexts, isoMinutes, jsonLdImage, splitIngredientLine } from "./ingredient-line.ts";

export interface ScrapedIngredient {
  rawText: string;
  name: string;
  amount?: string;
  unit?: string;
  groupName?: string;
}

export interface ScrapedRecipe {
  title: string;
  url: string;
  imageUrl?: string;
  servings?: number;
  prepTime?: number;
  cookTime?: number;
  course?: string;
  cuisine?: string;
  yieldText?: string;
  refNutrition?: RefNutrition;
  ingredients: ScrapedIngredient[];
  /** Read for method notes only; never saved. */
  instructions: string[];
}

function parseTime(text: string): number | null {
  const hourMatch = text.match(/(\d+)\s*h(our)?/i);
  const minMatch = text.match(/(\d+)\s*m(in)?/i);
  let minutes = 0;
  if (hourMatch) minutes += parseInt(hourMatch[1]) * 60;
  if (minMatch) minutes += parseInt(minMatch[1]);
  return minutes > 0 ? minutes : null;
}

const text = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/**
 * The recipe on a page, or null when the page has no recipe title. `requireRecipe` (new sources):
 * also null unless the page has a recipe card or Recipe JSON-LD with at least two ingredients, so
 * articles and roundups are skipped instead of saved.
 */
export function parseRecipePage(html: string, url: string, requireRecipe = false): ScrapedRecipe | null {
  const $ = cheerio.load(html);
  const ld = findRecipeJsonLd($);
  const wprm = $(".wprm-recipe-ingredient").length > 0;

  const title = $(".wprm-recipe-name").first().text().trim() || text(ld?.name) || (requireRecipe ? "" : $("h1").first().text().trim());
  if (!title) return null;

  // Images are often lazy-loaded: in the raw HTML `src` is an inline SVG placeholder and the real
  // URL lives in `data-src`/`data-lazy-src`. Prefer those, and reject any data: URI.
  const pickImage = (selector: string): string | undefined => {
    const el = $(selector).first();
    const candidate = el.attr("data-lazy-src") || el.attr("data-src") || el.attr("src") || undefined;
    return candidate && !candidate.startsWith("data:") ? candidate : undefined;
  };
  const imageUrl =
    pickImage(".wprm-recipe-image img") ||
    jsonLdImage(ld?.image) ||
    $("meta[property='og:image']").attr("content") ||
    pickImage("article img") ||
    undefined;

  const structured = parseStructured(html);

  const ingredients: ScrapedIngredient[] = [];
  const instructions: string[] = [];
  let servings: number | undefined;
  let prepTime: number | undefined;
  let cookTime: number | undefined;

  if (wprm) {
    const servingsText = $(".wprm-recipe-servings").first().text().trim();
    servings = (servingsText ? parseInt(servingsText) || undefined : undefined) ?? structured.yieldServings ?? undefined;
    prepTime = parseTime($(".wprm-recipe-prep_time-container").text()) ?? isoMinutes(ld?.prepTime) ?? undefined;
    cookTime = parseTime($(".wprm-recipe-cook_time-container").text()) ?? isoMinutes(ld?.cookTime) ?? undefined;
    $(".wprm-recipe-ingredient").each((_, el) => {
      // Same empty-line rule as parseStructured, so group headings line up by position.
      if (!$(el).text().replace(/\s+/g, " ").trim()) return;
      const rawText = cleanText($(el).text());
      const amount = cleanText($(el).find(".wprm-recipe-ingredient-amount").text()) || undefined;
      const unit = cleanText($(el).find(".wprm-recipe-ingredient-unit").text()) || undefined;
      const name = cleanText($(el).find(".wprm-recipe-ingredient-name").text()) || rawText;
      // parseStructured walks the same non-empty lines in the same order.
      const groupName = structured.ingredients[ingredients.length]?.group ?? undefined;
      ingredients.push({ rawText, name, amount, unit, groupName });
    });
    $(".wprm-recipe-instruction-text").each((_, el) => {
      const t = $(el).text().trim();
      if (t) instructions.push(t);
    });
  } else if (ld) {
    servings = structured.yieldServings ?? undefined;
    prepTime = isoMinutes(ld.prepTime) ?? undefined;
    cookTime = isoMinutes(ld.cookTime) ?? undefined;
    const lines = Array.isArray(ld.recipeIngredient) ? ld.recipeIngredient : [];
    for (const line of lines) {
      if (typeof line !== "string") continue;
      const s = splitIngredientLine(line);
      if (s.rawText) ingredients.push(s);
    }
    instructions.push(...instructionTexts(ld.recipeInstructions));
  }
  if (!instructions.length) instructions.push(...instructionTexts(ld?.recipeInstructions));

  if (requireRecipe && ingredients.length < 2) return null;

  return {
    title, url, imageUrl, servings, prepTime, cookTime,
    course: structured.courses.join(", ") || undefined,
    cuisine: structured.cuisines.join(", ") || undefined,
    yieldText: structured.yieldText ?? undefined,
    refNutrition: structured.nutrition ?? undefined,
    ingredients, instructions,
  };
}
