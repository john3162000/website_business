/**
 * Panlasang Pinoy full-site recipe scraper.
 * Crawls every recipe index page (stopping only when a page yields no recipes)
 * and stores each recipe — including ingredients and step-by-step instructions —
 * as static snapshot data.
 */

import * as cheerio from "cheerio";
import { prisma } from "@/lib/db";

const BASE_URL = "https://panlasangpinoy.com";
const RECIPE_INDEX_URL = `${BASE_URL}/recipes/`;
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

async function getRecipeUrlsFromIndexPage(page: number): Promise<string[]> {
  const url = page === 1 ? RECIPE_INDEX_URL : `${RECIPE_INDEX_URL}page/${page}/`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const urls: string[] = [];
  $("article a[rel='bookmark'], .entry-title a, h2.entry-title a").each((_, el) => {
    const href = $(el).attr("href");
    if (href && href.startsWith(BASE_URL)) urls.push(href);
  });
  return [...new Set(urls)];
}

// Cap on how many *new* recipes a single chunk scrapes — each one costs a
// politeness delay plus a fetch, so this keeps a request well under typical
// serverless time limits even on pages full of not-yet-saved recipes.
const MAX_NEW_PER_CHUNK = 4;

export interface RecipeCursor {
  page: number;
  index: number;
}

export function initialRecipeCursor(): RecipeCursor {
  return { page: 1, index: 0 };
}

/**
 * Scrapes up to MAX_NEW_PER_CHUNK new recipes starting at `cursor.index` on
 * `cursor.page`, returning the updated cursor. Designed to be called
 * repeatedly (one small chunk per request) so a full crawl can be driven
 * from short-lived serverless invocations without ever risking a timeout
 * mid-page (which would otherwise lose all progress on that page).
 */
export async function scrapeRecipeChunk(
  cursor: RecipeCursor,
  onProgress?: (msg: string) => void
): Promise<{ saved: number; cursor: RecipeCursor; done: boolean }> {
  const { page } = cursor;

  onProgress?.(`Fetching recipe index page ${page}...`);

  let urls: string[];
  try {
    urls = await getRecipeUrlsFromIndexPage(page);
  } catch (err) {
    onProgress?.(`Stopping — failed to load index page ${page}: ${err instanceof Error ? err.message : err}`);
    return { saved: 0, cursor, done: true };
  }

  if (urls.length === 0) {
    onProgress?.(`Page ${page} has no recipes — reached the end.`);
    return { saved: 0, cursor, done: true };
  }

  let saved = 0;
  let index = cursor.index;
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
    return { saved, cursor: { page: page + 1, index: 0 }, done: false };
  }
  return { saved, cursor: { page, index }, done: false };
}
