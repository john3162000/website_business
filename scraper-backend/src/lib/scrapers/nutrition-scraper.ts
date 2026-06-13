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
    signal: AbortSignal.timeout(30000),
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

function extractRows($: ReturnType<typeof cheerio.load>, sourceUrl: string): NutritionRow[] {
  const rows: NutritionRow[] = [];

  $("table tbody tr, table tr").each((_, el) => {
    const cells = $(el)
      .find("td")
      .map((_, td) => $(td).text().trim())
      .get();
    if (cells.length < 6) return;

    const foodName = cells[0];
    if (!foodName || foodName.length < 2) return;

    // Some FNRI tables include a food code column; fall back to a derived key.
    const possibleCode = cells[1] && /^[A-Za-z0-9-]+$/.test(cells[1]) && cells[1].length <= 12 ? cells[1] : null;
    const valueCells = possibleCode ? cells.slice(2) : cells.slice(1);
    const foodCode = possibleCode ?? `${foodName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}__${sourceUrl.split("/").pop()}`;

    rows.push({
      foodName,
      foodCode,
      calories: num(valueCells[0] || ""),
      protein: num(valueCells[1] || ""),
      fat: num(valueCells[2] || ""),
      carbohydrates: num(valueCells[3] || ""),
      fiber: num(valueCells[4] || ""),
      calcium: num(valueCells[5] || ""),
      iron: num(valueCells[6] || ""),
      vitaminA: num(valueCells[7] || ""),
      vitaminB1: num(valueCells[8] || ""),
      vitaminB2: num(valueCells[9] || ""),
      vitaminC: num(valueCells[10] || ""),
      sourceUrl,
    });
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
// in one go. Processing happens in bounded batches, with the queue/visited
// state advanced as soon as the page is fetched so a timeout never causes
// the crawl to "lose its place" and re-fetch the same huge page forever.
const ROWS_PER_CHUNK = 100;

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
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    onProgress?.(`Failed to load ${url}: ${err instanceof Error ? err.message : err}`);
    return { saved: 0, cursor: { queue, visited: [...visited] }, done: queue.length === 0 };
  }

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

  const slice = rows.slice(0, ROWS_PER_CHUNK);
  const saved = await saveRows(slice);

  if (rows.length <= ROWS_PER_CHUNK) {
    return { saved, cursor: { queue, visited: [...visited] }, done: queue.length === 0 };
  }
  return { saved, cursor: { queue, visited: [...visited], pending: { url, rows, index: ROWS_PER_CHUNK } }, done: false };
}
