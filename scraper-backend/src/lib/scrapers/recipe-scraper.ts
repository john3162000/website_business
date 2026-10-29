/**
 * Full-site recipe crawler for every site in RECIPE_SOURCES (Panlasang Pinoy first).
 * Walks each site's post sitemaps and stores each new recipe: title, source link, photo
 * link, servings, times, course and the ingredient list. The author's description
 * and steps are not copied; only short method notes the pricing engine reads
 * ("deep fry", "discard the marinade", "oven") are kept, and the site links to the
 * original page for the full method. Recipes saved before 2026-10-27 keep the
 * fields they were saved with.
 *
 * Pages that are not recipes, and (for later sources) dishes already listed from an
 * earlier site, are noted in RecipeSkip so the daily crawl doesn't fetch them again.
 */

import { prisma } from "@/lib/db";
import { ensureRecipeColumns, ensureRecipeSkipTable } from "@/lib/ensure-schema";
import { methodNotes } from "@/lib/recipe-compile/compile";
import { dishKey } from "./ingredient-line";
import { parseRecipePage, type ScrapedRecipe } from "./recipe-page";
import { RECIPE_SOURCES, type RecipeSource } from "./recipe-sources";
import { postSitemapsFromIndex, urlsFromSitemap } from "./sitemaps";

// Panlasang Pinoy's "/recipes/" landing page only lists a small curated subset; the Yoast post
// sitemaps enumerate every published post (~3000 across 3 files). Used when its index can't be read.
const PP_POST_SITEMAPS = [1, 2, 3].map((n) => `https://panlasangpinoy.com/post-sitemap${n === 1 ? "" : n}.xml`);
const SITEMAP_INDEXES = ["sitemap_index.xml", "wp-sitemap.xml", "sitemap.xml"];

// Sitemaps change rarely: a warm server instance reuses them for a while instead of
// downloading them again for every chunk of 4 recipes.
const SITEMAP_TTL_MS = 15 * 60_000;
const sitemapCache = new Map<string, { at: number; urls: string[] }>();

async function cached(key: string, load: () => Promise<string[]>): Promise<string[]> {
  const hit = sitemapCache.get(key);
  if (hit && Date.now() - hit.at < SITEMAP_TTL_MS) return hit.urls;
  const urls = await load();
  sitemapCache.set(key, { at: Date.now(), urls });
  return urls;
}

/** A site's post sitemaps from its sitemap index (Yoast, Rank Math or WordPress core). */
async function postSitemaps(source: RecipeSource): Promise<string[]> {
  return cached(`index:${source.base}`, async () => {
    for (const name of SITEMAP_INDEXES) {
      try {
        const xml = await fetchHtml(`${source.base}/${name}`);
        const found = postSitemapsFromIndex(xml);
        if (found.length) return found;
        // A small site's sitemap.xml can list the pages itself (no index).
        if (/<urlset/i.test(xml) && /<loc>/i.test(xml)) return [`${source.base}/${name}`];
      } catch {
        // try the next index name
      }
    }
    return source.site === "PanlasangPinoy" ? PP_POST_SITEMAPS : [];
  });
}

const DELAY_MS = 1500;
const USER_AGENT = "Mozilla/5.0 (compatible; SarapSulitBot/1.0; +https://john3162000.github.io/website_business/)";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,application/xml" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// Dish keys of every saved recipe, so a later source adds new dishes only.
let dishKeys: { at: number; keys: Set<string> } | null = null;
async function knownDishKeys(): Promise<Set<string>> {
  if (dishKeys && Date.now() - dishKeys.at < SITEMAP_TTL_MS) return dishKeys.keys;
  const rows = await prisma.recipe.findMany({ select: { title: true } });
  dishKeys = { at: Date.now(), keys: new Set(rows.map((r) => dishKey(r.title))) };
  return dishKeys.keys;
}

async function skip(url: string, reason: string, title?: string) {
  await prisma.recipeSkip.upsert({ where: { url }, create: { url, reason, title }, update: { reason, title } }).catch(() => {});
}

// Cap on how many pages a single chunk fetches — each one costs a politeness delay
// plus a fetch, so this keeps a request well under typical serverless time limits.
const MAX_NEW_PER_CHUNK = 4;

export interface RecipeCursor {
  /** Index in RECIPE_SOURCES (absent in cursors saved before there were several sources: 0). */
  sourceIndex?: number;
  sitemapIndex: number;
  urlIndex: number;
  /** Runs in a row that couldn't load this sitemap; after SITEMAP_TRIES it is skipped for this pass. */
  fails?: number;
}

const SITEMAP_TRIES = 3;

export function initialRecipeCursor(): RecipeCursor {
  return { sourceIndex: 0, sitemapIndex: 0, urlIndex: 0 };
}

/**
 * Fetches up to MAX_NEW_PER_CHUNK new pages starting at `cursor.urlIndex` in the
 * current source's sitemap `cursor.sitemapIndex`, returning the updated cursor.
 * Designed to be called repeatedly (one small chunk per request) so a full
 * crawl can be driven from short-lived serverless invocations without ever
 * risking a timeout mid-sitemap (which would otherwise lose all progress).
 */
export async function scrapeRecipeChunk(
  cursor: RecipeCursor,
  onProgress?: (msg: string) => void
): Promise<{ saved: number; cursor: RecipeCursor; done: boolean; pause?: string }> {
  const sourceIndex = cursor.sourceIndex ?? 0;
  const { sitemapIndex } = cursor;
  const source = RECIPE_SOURCES[sourceIndex];
  if (!source) {
    onProgress?.("Every recipe site processed — reached the end.");
    return { saved: 0, cursor, done: true };
  }
  const sitemaps = await postSitemaps(source);
  if (sitemapIndex >= sitemaps.length) {
    onProgress?.(`${source.name}: ${sitemaps.length ? "all post sitemaps processed" : "no post sitemap found"}.`);
    return { saved: 0, cursor: { sourceIndex: sourceIndex + 1, sitemapIndex: 0, urlIndex: 0 }, done: false };
  }

  await ensureRecipeColumns();
  await ensureRecipeSkipTable();
  const sitemapUrl = sitemaps[sitemapIndex];
  onProgress?.(`Fetching sitemap: ${sitemapUrl}...`);

  let urls: string[];
  try {
    urls = await cached(sitemapUrl, async () => urlsFromSitemap(await fetchHtml(sitemapUrl), source.base + (source.pathPrefix ?? "")));
  } catch (err) {
    // Usually transient (rate limiting, a network blip): pause this run and try the same sitemap on
    // the next one. A sitemap that keeps failing is skipped for this pass, so one unreachable site
    // can't hold back the sites after it; the next full pass reads it again.
    const fails = (cursor.fails ?? 0) + 1;
    const why = `Failed to load sitemap ${sitemapUrl}: ${err instanceof Error ? err.message : err}`;
    if (fails >= SITEMAP_TRIES) {
      onProgress?.(`${why} (${fails} runs in a row) — skipping it for this pass.`);
      return { saved: 0, cursor: { sourceIndex, sitemapIndex: sitemapIndex + 1, urlIndex: 0 }, done: false, pause: `${why}; skipped after ${fails} tries` };
    }
    return { saved: 0, cursor: { ...cursor, fails }, done: false, pause: `${why} (try ${fails} of ${SITEMAP_TRIES})` };
  }

  const next: RecipeCursor = { sourceIndex, sitemapIndex: sitemapIndex + 1, urlIndex: 0 };
  if (urls.length === 0) {
    onProgress?.(`Sitemap ${sitemapUrl} has no URLs — skipping.`);
    return { saved: 0, cursor: next, done: false };
  }

  let saved = 0;
  let index = cursor.urlIndex;
  let newCount = 0;
  // One query each for the whole sitemap instead of one per URL: most posts are seen already.
  const known = new Set((await prisma.recipe.findMany({ where: { url: { in: urls } }, select: { url: true } })).map((r) => r.url));
  for (const s of await prisma.recipeSkip.findMany({ where: { url: { in: urls } }, select: { url: true } })) known.add(s.url);

  while (index < urls.length && newCount < MAX_NEW_PER_CHUNK) {
    const url = urls[index];
    if (known.has(url)) {
      index++;
      continue;
    }

    await sleep(DELAY_MS);
    onProgress?.(`Scraping: ${url}`);
    index++;
    newCount++;

    let scraped: ScrapedRecipe | null;
    try {
      scraped = parseRecipePage(await fetchHtml(url), url, source.dedupe);
    } catch (err) {
      // Not noted as skipped: a failed fetch is tried again on the next run.
      onProgress?.(`Failed to scrape ${url}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    if (!scraped) {
      if (source.dedupe) await skip(url, "not-recipe");
      continue;
    }
    if (source.cuisine && !source.cuisine.test(`${scraped.cuisine ?? ""} ${scraped.title}`)) {
      await skip(url, "other-cuisine", scraped.title);
      continue;
    }
    if (source.dedupe) {
      const keys = await knownDishKeys();
      const key = dishKey(scraped.title);
      if (!key || keys.has(key)) {
        await skip(url, "duplicate", scraped.title);
        continue;
      }
      keys.add(key);
    }

    const created = await prisma.recipe.create({
      data: {
        title: scraped.title,
        url: scraped.url,
        // A link to the photo on the source site (not a copy); no description or steps (see the top of this file).
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
        sourceSite: source.site,
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
    }).catch((err: unknown) => {
      // Saved meanwhile by another run (unique url): skip it instead of failing the crawl.
      if ((err as { code?: string }).code === "P2002") return null;
      throw err;
    });
    if (!created) continue;

    saved++;
    onProgress?.(`Saved (${source.name}): ${scraped.title}`);
  }

  if (index >= urls.length) return { saved, cursor: next, done: false };
  return { saved, cursor: { sourceIndex, sitemapIndex, urlIndex: index }, done: false };
}
