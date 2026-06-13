/**
 * Panlasang Pinoy recipe scraper.
 * Crawls recipe index pages, extracts recipe URLs, then scrapes each recipe for:
 * title, description, ingredients, instructions, serving size, cook time, image.
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
      "User-Agent": "Mozilla/5.0 (compatible; NutriBot/1.0; +https://github.com)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function parseTime(text: string): number | null {
  const hourMatch = text.match(/(\d+)\s*h(our)?/i);
  const minMatch = text.match(/(\d+)\s*m(in)?/i);
  let minutes = 0;
  if (hourMatch) minutes += parseInt(hourMatch[1]) * 60;
  if (minMatch) minutes += parseInt(minMatch[1]);
  return minutes > 0 ? minutes : null;
}

interface ScrapedRecipe {
  title: string;
  slug: string;
  url: string;
  description?: string;
  imageUrl?: string;
  servings?: number;
  prepTime?: number;
  cookTime?: number;
  totalTime?: number;
  category?: string;
  instructions?: string;
  ingredients: { rawText: string; name: string; quantity?: number; unit?: string }[];
}

export async function scrapeRecipePage(url: string): Promise<ScrapedRecipe | null> {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const title =
      $("h1.wprm-recipe-name").first().text().trim() ||
      $("h1").first().text().trim();

    if (!title) return null;

    const slug = slugify(title);
    const description = $(".wprm-recipe-summary").text().trim() ||
      $("meta[name='description']").attr("content") || "";

    const imageUrl =
      $(".wprm-recipe-image img").attr("src") ||
      $("article img").first().attr("src") || "";

    const servingsText = $(".wprm-recipe-servings").text().trim();
    const servings = servingsText ? parseInt(servingsText) : undefined;

    const prepTimeText = $(".wprm-recipe-prep_time-container").text();
    const cookTimeText = $(".wprm-recipe-cook_time-container").text();
    const totalTimeText = $(".wprm-recipe-total_time-container").text();

    const prepTime = prepTimeText ? parseTime(prepTimeText) ?? undefined : undefined;
    const cookTime = cookTimeText ? parseTime(cookTimeText) ?? undefined : undefined;
    const totalTime = totalTimeText ? parseTime(totalTimeText) ?? undefined : undefined;

    const category = $(".wprm-recipe-course-container .wprm-recipe-course").text().trim() ||
      $("a[rel='category tag']").first().text().trim() || undefined;

    // Ingredients
    const ingredients: ScrapedRecipe["ingredients"] = [];
    $(".wprm-recipe-ingredient").each((_, el) => {
      const rawText = $(el).text().replace(/\s+/g, " ").trim();
      if (!rawText) return;

      const amountText = $(el).find(".wprm-recipe-ingredient-amount").text().trim();
      const unitText = $(el).find(".wprm-recipe-ingredient-unit").text().trim();
      const nameText = $(el).find(".wprm-recipe-ingredient-name").text().trim() || rawText;

      const quantity = amountText ? parseFloat(amountText.replace(/[^\d.]/g, "")) : undefined;
      const unit = unitText || undefined;

      ingredients.push({
        rawText,
        name: nameText,
        quantity: isNaN(quantity!) ? undefined : quantity,
        unit,
      });
    });

    // Fallback for non-WPRM sites
    if (ingredients.length === 0) {
      $("ul li").each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 3 && text.length < 200) {
          ingredients.push({ rawText: text, name: text });
        }
      });
    }

    // Instructions
    const instructionParts: string[] = [];
    $(".wprm-recipe-instruction-text").each((_, el) => {
      const text = $(el).text().trim();
      if (text) instructionParts.push(text);
    });
    const instructions = instructionParts.join("\n\n") || undefined;

    return {
      title,
      slug,
      url,
      description: description || undefined,
      imageUrl: imageUrl || undefined,
      servings,
      prepTime,
      cookTime,
      totalTime,
      category,
      instructions,
      ingredients,
    };
  } catch (err) {
    console.error(`Failed to scrape ${url}:`, err);
    return null;
  }
}

async function getRecipeUrls(page: number): Promise<string[]> {
  const url = `${RECIPE_INDEX_URL}page/${page}/`;
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const urls: string[] = [];
    $("article a[rel='bookmark'], .entry-title a, h2.entry-title a").each((_, el) => {
      const href = $(el).attr("href");
      if (href && href.startsWith(BASE_URL)) urls.push(href);
    });
    return [...new Set(urls)];
  } catch {
    return [];
  }
}

export async function scrapeAndStoreRecipes(
  maxPages = 5,
  onProgress?: (msg: string) => void
): Promise<number> {
  let total = 0;

  for (let page = 1; page <= maxPages; page++) {
    onProgress?.(`Fetching recipe index page ${page}...`);
    const urls = await getRecipeUrls(page);
    if (urls.length === 0) break;

    for (const url of urls) {
      await sleep(DELAY_MS);

      const existing = await prisma.recipe.findFirst({ where: { url } });
      if (existing) {
        onProgress?.(`Skipping (already in DB): ${url}`);
        continue;
      }

      onProgress?.(`Scraping: ${url}`);
      const recipe = await scrapeRecipePage(url);
      if (!recipe || !recipe.title) continue;

      // Ensure unique slug
      let slug = recipe.slug;
      const existing2 = await prisma.recipe.findFirst({ where: { slug } });
      if (existing2) slug = `${slug}-${Date.now()}`;

      await prisma.recipe.create({
        data: {
          title: recipe.title,
          slug,
          url: recipe.url,
          description: recipe.description,
          imageUrl: recipe.imageUrl,
          servings: recipe.servings,
          prepTime: recipe.prepTime,
          cookTime: recipe.cookTime,
          totalTime: recipe.totalTime,
          category: recipe.category,
          instructions: recipe.instructions,
          ingredients: {
            create: recipe.ingredients.map((ing) => ({
              name: ing.name,
              quantity: ing.quantity,
              unit: ing.unit,
              rawText: ing.rawText,
            })),
          },
        },
      });

      total++;
      onProgress?.(`Saved: ${recipe.title}`);
    }
  }

  await prisma.scrapingLog.create({
    data: { source: "PanlasangPinoy", status: "success", count: total },
  });

  return total;
}
