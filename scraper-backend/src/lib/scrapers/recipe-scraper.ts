/**
 * Panlasang Pinoy full-site recipe scraper.
 * Crawls every recipe index page (stopping only when a page yields no recipes)
 * and stores each recipe — including ingredients and step-by-step instructions —
 * as static snapshot data.
 */

import * as cheerio from "cheerio";
import { prisma } from "@/lib/db";

const BASE_URL = "https://panlasangpinoy.com";
// The "/recipes/" landing page only lists a small curated subset (~68
// recipes) and its pagination runs out quickly. The Yoast-generated post
// sitemaps enumerate every published post on the site (~3000 across 3
// files), which is the actual full catalog. Not every post is a recipe
// (some are roundups/articles), so non-recipe pages are skipped during
// scraping based on the absence of WPRM recipe markup.
const POST_SITEMAPS = [
  `${BASE_URL}/post-sitemap.xml`,
  `${BASE_URL}/post-sitemap2.xml`,
  `${BASE_URL}/post-sitemap3.xml`,
];
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
}

interface ScrapedRecipe {
  title: string;
  url: string;
  imageUrl?: string;
  description?: string;
  servings?: number;
  prepTime?: number;
  cookTime?: number;
  ingredients: ScrapedIngredient[];
  instructions: string[];
}

async function scrapeRecipePage(url: string): Promise<ScrapedRecipe | null> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const title = $(".wprm-recipe-name").first().text().trim() || $("h1").first().text().trim();
  if (!title) return null;

  const description =
    $(".wprm-recipe-summary").first().text().trim() ||
    $("meta[name='description']").attr("content") ||
    undefined;

  const imageUrl =
    $(".wprm-recipe-image img").first().attr("src") ||
    $("article img").first().attr("src") ||
    undefined;

  const servingsText = $(".wprm-recipe-servings").first().text().trim();
  const servings = servingsText ? parseInt(servingsText) || undefined : undefined;

  const prepTime = parseTime($(".wprm-recipe-prep_time-container").text()) ?? undefined;
  const cookTime = parseTime($(".wprm-recipe-cook_time-container").text()) ?? undefined;

  const ingredients: ScrapedIngredient[] = [];
  $(".wprm-recipe-ingredient").each((_, el) => {
    const rawText = $(el).text().replace(/\s+/g, " ").trim();
    if (!rawText) return;
    const amount = $(el).find(".wprm-recipe-ingredient-amount").text().trim() || undefined;
    const unit = $(el).find(".wprm-recipe-ingredient-unit").text().trim() || undefined;
    const name = $(el).find(".wprm-recipe-ingredient-name").text().trim() || rawText;
    ingredients.push({ rawText, name, amount, unit });
  });

  const instructions: string[] = [];
  $(".wprm-recipe-instruction-text").each((_, el) => {
    const text = $(el).text().trim();
    if (text) instructions.push(text);
  });

  return { title, url, imageUrl, description, servings, prepTime, cookTime, ingredients, instructions };
}

async function getRecipeUrlsFromSitemap(sitemapUrl: string): Promise<string[]> {
  const xml = await fetchHtml(sitemapUrl);
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls: string[] = [];
  $("url > loc").each((_, el) => {
    const href = $(el).text().trim();
    if (href.startsWith(BASE_URL)) urls.push(href);
  });
  return urls;
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

  if (sitemapIndex >= POST_SITEMAPS.length) {
    onProgress?.("All post sitemaps processed — reached the end.");
    return { saved: 0, cursor, done: true };
  }

  const sitemapUrl = POST_SITEMAPS[sitemapIndex];
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

  while (index < urls.length && newCount < MAX_NEW_PER_CHUNK) {
    const url = urls[index];
    const existing = await prisma.recipe.findUnique({ where: { url } });
    if (existing) {
      onProgress?.(`Already in DB, skipping: ${url}`);
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
        imageUrl: scraped.imageUrl,
        description: scraped.description,
        servings: scraped.servings,
        prepTime: scraped.prepTime,
        cookTime: scraped.cookTime,
        sourceSite: "PanlasangPinoy",
        ingredients: {
          create: scraped.ingredients.map((ing) => ({
            rawText: ing.rawText,
            name: ing.name,
            amount: ing.amount,
            unit: ing.unit,
          })),
        },
        instructions: {
          create: scraped.instructions.map((text, idx) => ({
            stepNumber: idx + 1,
            text,
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
