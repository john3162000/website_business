/**
 * FNRI Food Composition Table full-site nutrition scraper.
 * Crawls every paginated food-content listing page (following "next" links until
 * exhausted — no page cap) and stores each food entry as static snapshot data.
 */

import * as cheerio from "cheerio";
import { prisma } from "@/lib/db";

const FNRI_BASE = "https://i.fnri.dost.gov.ph";
const FNRI_ALL_URL = `${FNRI_BASE}/fct/library/food_content/all`;
const DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ScraperBackend/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(50000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function num(text: string): number | null {
  const val = parseFloat(text.replace(/[^0-9.\-]/g, ""));
  return isNaN(val) ? null : val;
}

interface NutritionRow {
  foodName: string;
  foodCode: string;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbohydrates: number | null;
  fiber: number | null;
  calcium: number | null;
  iron: number | null;
  vitaminA: number | null;
  vitaminB1: number | null;
  vitaminB2: number | null;
  vitaminC: number | null;
  sourceUrl: string;
}

// Maps the human-readable nutrient labels used in each food's "Data" modal
// to our NutritionFact fields. Labels come from the FNRI page verbatim,
// e.g. `<div class="col-md-9">Protein (g)</div>` paired with
// `<div class="col-md-3"><strong>8.3</strong></div>`.
type NutrientField = Exclude<keyof NutritionRow, "foodName" | "foodCode" | "sourceUrl">;

const NUTRIENT_LABELS: Record<string, NutrientField> = {
  "Energy, calculated (kcal)": "calories",
  "Protein (g)": "protein",
  "Total Fat (g)": "fat",
  "Carbohydrate, total (g)": "carbohydrates",
  "Fiber, total dietary (g)": "fiber",
  "Calcium, Ca (mg)": "calcium",
  "Iron, Fe (mg)": "iron",
  "Retinol Activity Equivalent, RAE (µg)": "vitaminA",
  "Thiamin, Vitamin B1 (mg)": "vitaminB1",
  "Riboflavin, Vitamin B2 (mg)": "vitaminB2",
  "Ascorbic Acid, Vitamin C (mg)": "vitaminC",
};

/**
 * The FNRI "/all" page's directory table only ever renders 10 rows (its
 * pagination is client-side JS), but every food's full nutrient profile is
 * server-rendered as a hidden Bootstrap modal `<div id="{Food_ID}_data">`
 * with an `<h3>` food name and per-100g values in `.list-group-item.row`
 * entries — and ALL ~1500 of these modals are present in the one page, so
 * iterating over them directly captures the entire dataset in one fetch.
 */
function extractRows($: ReturnType<typeof cheerio.load>, sourceUrl: string): NutritionRow[] {
  const rows: NutritionRow[] = [];

  $("div[id$='_data']").each((_, el) => {
    const id = $(el).attr("id") ?? "";
    const foodCode = id.replace(/_data$/, "");
    const foodName = $(el).find("h3").first().text().trim();
    if (!foodCode || !foodName) return;

    const row: NutritionRow = {
      foodName,
      foodCode,
      calories: null,
      protein: null,
      fat: null,
      carbohydrates: null,
      fiber: null,
      calcium: null,
      iron: null,
      vitaminA: null,
      vitaminB1: null,
      vitaminB2: null,
      vitaminC: null,
      sourceUrl,
    };

    $(el)
      .find(".list-group-item.row")
      .each((_, li) => {
        const label = $(li).find(".col-md-9").first().text().trim();
        const field = NUTRIENT_LABELS[label];
        if (!field) return;
        const value = $(li).find(".col-md-3 strong").first().text().trim();
        row[field] = num(value);
      });

    rows.push(row);
  });

  return rows;
}

function getNextPageUrls($: ReturnType<typeof cheerio.load>): string[] {
  const urls: string[] = [];
  $("a[href*='/fct/library/food_content']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const full = href.startsWith("http") ? href : `${FNRI_BASE}${href}`;
    if (!urls.includes(full)) urls.push(full);
  });
  return urls;
}

// Cap on how many entries from a single listing page get upserted per
// request — some FNRI listing pages (e.g. the "/all" view) contain
// thousands of rows, which would blow past a serverless time limit if done
// alongside the page fetch/parse. Fetching+parsing a page and saving its
// rows are split into separate requests (via `pending`) so each request
// does only one of those, keeping every request comfortably short.
const ROWS_PER_CHUNK = 25;

export interface NutritionCursor {
  queue: string[];
  visited: string[];
  pending?: { url: string; rows: NutritionRow[]; index: number };
}

export function initialNutritionCursor(): NutritionCursor {
  return { queue: [FNRI_ALL_URL], visited: [] };
}

async function saveRows(rows: NutritionRow[]): Promise<number> {
  let saved = 0;
  for (const row of rows) {
    if (!row.foodName) continue;
    await prisma.nutritionFact.upsert({
      where: { foodCode: row.foodCode },
      create: { ...row, source: "FNRI" },
      update: { ...row, source: "FNRI" },
    });
    saved++;
  }
  return saved;
}

/**
 * Processes one bounded chunk of work (either a batch of rows left over from
 * a previously-fetched page, or the next page in the BFS queue) and returns
 * the updated cursor. Designed to be called repeatedly so a full crawl can be
 * driven from short-lived serverless invocations.
 */
export async function scrapeNutritionBatch(
  cursor: NutritionCursor,
  onProgress?: (msg: string) => void
): Promise<{ saved: number; cursor: NutritionCursor; done: boolean }> {
  const queue = [...cursor.queue];
  const visited = new Set(cursor.visited);

  if (cursor.pending) {
    const { url, rows, index } = cursor.pending;
    const slice = rows.slice(index, index + ROWS_PER_CHUNK);
    onProgress?.(`Saving entries ${index + 1}-${index + slice.length} of ${rows.length} from ${url}`);
    const saved = await saveRows(slice);
    const nextIndex = index + slice.length;

    if (nextIndex >= rows.length) {
      return { saved, cursor: { queue, visited: [...visited] }, done: queue.length === 0 };
    }
    return { saved, cursor: { queue, visited: [...visited], pending: { url, rows, index: nextIndex } }, done: false };
  }

  const url = queue.shift();
  if (!url) {
    return { saved: 0, cursor: { queue: [], visited: [...visited] }, done: true };
  }

  if (visited.has(url)) {
    return { saved: 0, cursor: { queue, visited: [...visited] }, done: queue.length === 0 };
  }
  visited.add(url);

  onProgress?.(`Fetching: ${url}`);
  // A fetch failure (e.g. timeout on the very large "/all" page) is transient —
  // throw so the route keeps the pre-call cursor intact and the run can resume
  // from this URL, rather than dropping it and falsely finishing.
  const html = await fetchHtml(url);

  const $ = cheerio.load(html);
  const rows = extractRows($, url);
  onProgress?.(`Found ${rows.length} entries on this page`);

  for (const nextUrl of getNextPageUrls($)) {
    if (!visited.has(nextUrl) && !queue.includes(nextUrl)) queue.push(nextUrl);
  }

  await sleep(DELAY_MS);

  if (rows.length === 0) {
    return { saved: 0, cursor: { queue, visited: [...visited] }, done: queue.length === 0 };
  }

  // Defer saving to the next request(s) — fetching/parsing this page is
  // already done, so don't risk a timeout before the cursor can advance.
  return { saved: 0, cursor: { queue, visited: [...visited], pending: { url, rows, index: 0 } }, done: false };
}
