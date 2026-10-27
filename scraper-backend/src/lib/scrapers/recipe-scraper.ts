/**
 * Panlasang Pinoy full-site recipe scraper.
 * Walks every post sitemap and stores each new recipe: title, source link, photo
 * link, servings, times, course and the ingredient list. The author's description
 * and steps are not copied; only short method notes the pricing engine reads
 * ("deep fry", "discard the marinade", "oven") are kept, and the site links to the
 * original page for the full method. Recipes saved before 2026-10-27 keep the
 * fields they were saved with.
 */

import * as cheerio from "cheerio";
import { prisma } from "@/lib/db";
import { ensureRecipeColumns } from "@/lib/ensure-schema";
import { parseStructured, type RefNutrition } from "./recipe-structured";
import { postSitemapsFromIndex, urlsFromSitemap } from "./sitemaps";
import { methodNotes } from "@/lib/recipe-compile/compile";

const BASE_URL = "https://panlasangpinoy.com";
// The "/recipes/" landing page only lists a small curated subset (~68
// recipes) and its pagination runs out quickly. The Yoast-generated post
// sitemaps enumerate every published post on the site (~3000 across 3
// files), which is the actual full catalog. Not every post is a recipe
// (some are roundups/articles), so non-recipe pages are skipped during
// scraping based on the absence of WPRM recipe markup.
// Used when the sitemap index can't be read; the index also lists newer ones (post-sitemap4, …).
const POST_SITEMAPS = [
  `${BASE_URL}/post-sitemap.xml`,
  `${BASE_URL}/post-sitemap2.xml`,
  `${BASE_URL}/post-sitemap3.xml`,
];

/** The post sitemaps from the site's sitemap index, or the known three when it can't be read. */
async function postSitemaps(): Promise<string[]> {
  try {
    const found = postSitemapsFromIndex(await fetchHtml(`${BASE_URL}/sitemap_index.xml`));
    return found.length ? found : POST_SITEMAPS;
  } catch {
    return POST_SITEMAPS;
  }
}
const DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ScraperBackend/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseTime(text: string): number | null {
  const hourMatch = text.match(/(\d+)\s*h(our)?/i);
  const minMatch = text.match(/(\d+)\s*m(in)?/i);
  let minutes = 0;
  if (hourMatch) minutes += parseInt(hourMatch[1]) * 60;
  if (minMatch) minutes += parseInt(minMatch[1]);
  return minutes > 0 ? minutes : null;
}

interface ScrapedIngredient {
  rawText: string;
  name: string;
  amount?: string;
  unit?: string;
  groupName?: string;
}

interface ScrapedRecipe {
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
  instructions: string[];
}

async function scrapeRecipePage(url: string): Promise<ScrapedRecipe | null> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const title = $(".wprm-recipe-name").first().text().trim() || $("h1").first().text().trim();
  if (!title) return null;

  // Images are lazy-loaded (perfmatters): in the raw server HTML `src` is an
  // inline SVG placeholder and the real URL lives in `data-src`/`data-lazy-src`.
  // Prefer those, and reject any data: URI that slips through.
  const pickImage = (selector: string): string | undefined => {
    const el = $(selector).first();
    const candidate =
      el.attr("data-lazy-src") || el.attr("data-src") || el.attr("src") || undefined;
    return candidate && !candidate.startsWith("data:") ? candidate : undefined;
  };
  const imageUrl =
    pickImage(".wprm-recipe-image img") ||
    $("meta[property='og:image']").attr("content") ||
    pickImage("article img") ||
    undefined;

  const structured = parseStructured(html);

  const servingsText = $(".wprm-recipe-servings").first().text().trim();
  const servings = (servingsText ? parseInt(servingsText) || undefined : undefined) ?? structured.yieldServings ?? undefined;

  const prepTime = parseTime($(".wprm-recipe-prep_time-container").text()) ?? undefined;
  const cookTime = parseTime($(".wprm-recipe-cook_time-container").text()) ?? undefined;

  const ingredients: ScrapedIngredient[] = [];
  $(".wprm-recipe-ingredient").each((_, el) => {
    const rawText = $(el).text().replace(/\s+/g, " ").trim();
    if (!rawText) return;
    const amount = $(el).find(".wprm-recipe-ingredient-amount").text().trim() || undefined;
    const unit = $(el).find(".wprm-recipe-ingredient-unit").text().trim() || undefined;
    const name = $(el).find(".wprm-recipe-ingredient-name").text().trim() || rawText;
    // parseStructured walks the same non-empty lines in the same order.
    const groupName = structured.ingredients[ingredients.length]?.group ?? undefined;
    ingredients.push({ rawText, name, amount, unit, groupName });
  });

  const instructions: string[] = [];
  $(".wprm-recipe-instruction-text").each((_, el) => {
    const text = $(el).text().trim();
    if (text) instructions.push(text);
  });

  return {
    title, url, imageUrl, servings, prepTime, cookTime,
    course: structured.courses.join(", ") || undefined,
    cuisine: structured.cuisines.join(", ") || undefined,
    yieldText: structured.yieldText ?? undefined,
    refNutrition: structured.nutrition ?? undefined,
    ingredients, instructions,
  };
}

async function getRecipeUrlsFromSitemap(sitemapUrl: string): Promise<string[]> {
  return urlsFromSitemap(await fetchHtml(sitemapUrl), BASE_URL);
}

// Cap on how many *new* recipes a single chunk scrapes — each one costs a
// politeness delay plus a fetch, so this keeps a request well under typical
// serverless time limits even on pages full of not-yet-saved recipes.
const MAX_NEW_PER_CHUNK = 4;

export interface RecipeCursor {
  sitemapIndex: number;
  urlIndex: number;
}

export function initialRecipeCursor(): RecipeCursor {
  return { sitemapIndex: 0, urlIndex: 0 };
}

/**
 * Scrapes up to MAX_NEW_PER_CHUNK new recipes starting at `cursor.urlIndex`
 * in `POST_SITEMAPS[cursor.sitemapIndex]`, returning the updated cursor.
 * Designed to be called repeatedly (one small chunk per request) so a full
 * crawl can be driven from short-lived serverless invocations without ever
 * risking a timeout mid-sitemap (which would otherwise lose all progress).
 */
export async function scrapeRecipeChunk(
  cursor: RecipeCursor,
  onProgress?: (msg: string) => void
): Promise<{ saved: number; cursor: RecipeCursor; done: boolean }> {
  const { sitemapIndex } = cursor;
  const sitemaps = await postSitemaps();

  if (sitemapIndex >= sitemaps.length) {
    onProgress?.("All post sitemaps processed — reached the end.");
    return { saved: 0, cursor, done: true };
  }

  await ensureRecipeColumns();
  const sitemapUrl = sitemaps[sitemapIndex];
  onProgress?.(`Fetching sitemap: ${sitemapUrl}...`);

  let urls: string[];
  try {
    urls = await getRecipeUrlsFromSitemap(sitemapUrl);
  } catch (err) {
    // A fetch error (e.g. rate limiting) is transient — don't mark the crawl
    // as done or lose the cursor, so it can resume from this sitemap later.
    throw new Error(`Failed to load sitemap ${sitemapUrl}: ${err instanceof Error ? err.message : err}`);
  }

  if (urls.length === 0) {
    onProgress?.(`Sitemap ${sitemapUrl} has no URLs — skipping.`);
    return { saved: 0, cursor: { sitemapIndex: sitemapIndex + 1, urlIndex: 0 }, done: false };
  }

  let saved = 0;
  let index = cursor.urlIndex;
  let newCount = 0;
  // One query for the whole sitemap instead of one per URL: most posts are saved already.
  const known = new Set((await prisma.recipe.findMany({ where: { url: { in: urls } }, select: { url: true } })).map((r) => r.url));

  while (index < urls.length && newCount < MAX_NEW_PER_CHUNK) {
    const url = urls[index];
    if (known.has(url)) {
      index++;
      continue;
    }

    await sleep(DELAY_MS);
    onProgress?.(`Scraping: ${url}`);

    let scraped: ScrapedRecipe | null;
    try {
      scraped = await scrapeRecipePage(url);
    } catch (err) {
      onProgress?.(`Failed to scrape ${url}: ${err instanceof Error ? err.message : err}`);
      index++;
      newCount++;
      continue;
    }
    if (!scraped) {
      index++;
      newCount++;
      continue;
    }

    await prisma.recipe.create({
      data: {
        title: scraped.title,
        url: scraped.url,
        // A link to the photo on Panlasang Pinoy (not a copy); no description or steps (see the top of this file).
        imageUrl: scraped.imageUrl,
        methodNotes: methodNotes(scraped.instructions) || null,
        servings: scraped.servings,
        prepTime: scraped.prepTime,
        cookTime: scraped.cookTime,
        course: scraped.course,
        cuisine: scraped.cuisine,
        yieldText: scraped.yieldText,
        refNutrition: scraped.refNutrition ? { ...scraped.refNutrition } : undefined,
        structuredAt: new Date(),
        sourceSite: "PanlasangPinoy",
        ingredients: {
          create: scraped.ingredients.map((ing) => ({
            rawText: ing.rawText,
            name: ing.name,
            amount: ing.amount,
            unit: ing.unit,
            groupName: ing.groupName,
          })),
        },
      },
    });

    saved++;
    newCount++;
    index++;
    onProgress?.(`Saved: ${scraped.title}`);
  }

  if (index >= urls.length) {
    return { saved, cursor: { sitemapIndex: sitemapIndex + 1, urlIndex: 0 }, done: false };
  }
  return { saved, cursor: { sitemapIndex, urlIndex: index }, done: false };
}
