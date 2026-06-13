/**
 * Nutrition data scraper.
 * Primary source: FNRI Food Composition Table (https://i.fnri.dost.gov.ph/fct/library/food_content/all)
 * This data covers Filipino foods and is the most relevant for local produce.
 */

import * as cheerio from "cheerio";
import { prisma } from "@/lib/db";

const FNRI_BASE = "https://i.fnri.dost.gov.ph";
const FNRI_ALL_URL = `${FNRI_BASE}/fct/library/food_content/all`;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; NutriBot/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseFloat2(text: string): number | null {
  const val = parseFloat(text.replace(/[^0-9.]/g, ""));
  return isNaN(val) ? null : val;
}

interface NutritionRow {
  ingredientName: string;
  calories: number | null;
  protein: number | null;
  carbohydrates: number | null;
  fat: number | null;
  fiber: number | null;
  calcium: number | null;
  iron: number | null;
  vitaminA: number | null;
  vitaminC: number | null;
  vitaminB1: number | null;
  vitaminB2: number | null;
}

async function scrapeFnriPage(url: string): Promise<NutritionRow[]> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const rows: NutritionRow[] = [];

  // FNRI FCT uses a table with columns:
  // Food Name | Energy(kcal) | Protein(g) | Fat(g) | CHO(g) | Fiber(g) | Ca(mg) | Fe(mg) | Vit A(mcg RE) | Thiamin(mg) | Riboflavin(mg) | Vit C(mg)
  $("table tbody tr, table tr").each((_, el) => {
    const cells = $(el).find("td").map((_, td) => $(td).text().trim()).get();
    if (cells.length < 6) return;

    const name = cells[0];
    if (!name || name.length < 2) return;

    rows.push({
      ingredientName: name,
      calories: parseFloat2(cells[1]),
      protein: parseFloat2(cells[2]),
      fat: parseFloat2(cells[3]),
      carbohydrates: parseFloat2(cells[4]),
      fiber: parseFloat2(cells[5]),
      calcium: parseFloat2(cells[6] || ""),
      iron: parseFloat2(cells[7] || ""),
      vitaminA: parseFloat2(cells[8] || ""),
      vitaminB1: parseFloat2(cells[9] || ""),
      vitaminB2: parseFloat2(cells[10] || ""),
      vitaminC: parseFloat2(cells[11] || ""),
    });
  });

  return rows;
}

async function getPaginationUrls($: ReturnType<typeof cheerio.load>): Promise<string[]> {
  const urls: string[] = [];
  $("a[href*='/fct/library/food_content']").each((_, el) => {
    const href = $( el).attr("href");
    if (href) {
      const full = href.startsWith("http") ? href : `${FNRI_BASE}${href}`;
      if (!urls.includes(full)) urls.push(full);
    }
  });
  return urls;
}

export async function scrapeAndStoreNutrition(
  onProgress?: (msg: string) => void
): Promise<number> {
  let total = 0;
  const visitedUrls = new Set<string>();

  const processUrl = async (url: string) => {
    if (visitedUrls.has(url)) return;
    visitedUrls.add(url);

    onProgress?.(`Fetching nutrition data from: ${url}`);
    const html = await fetchHtml(url);
    cheerio.load(html); // load to get the root for pagination

    const rows = await scrapeFnriPage(url);
    onProgress?.(`Found ${rows.length} nutrition entries`);

    // Get pagination from the raw HTML
    const htmlForPagination = html;
    const $page = cheerio.load(htmlForPagination);
    const nextUrls = await getPaginationUrls($page);

    for (const row of rows) {
      if (!row.ingredientName) continue;
      await prisma.nutritionFact.upsert({
        where: { ingredientName: row.ingredientName },
        create: {
          ingredientName: row.ingredientName,
          calories: row.calories,
          protein: row.protein,
          carbohydrates: row.carbohydrates,
          fat: row.fat,
          fiber: row.fiber,
          calcium: row.calcium,
          iron: row.iron,
          vitaminA: row.vitaminA,
          vitaminC: row.vitaminC,
          vitaminB1: row.vitaminB1,
          vitaminB2: row.vitaminB2,
          source: "FNRI",
        },
        update: {
          calories: row.calories,
          protein: row.protein,
          carbohydrates: row.carbohydrates,
          fat: row.fat,
          fiber: row.fiber,
          calcium: row.calcium,
          iron: row.iron,
          vitaminA: row.vitaminA,
          vitaminC: row.vitaminC,
          vitaminB1: row.vitaminB1,
          vitaminB2: row.vitaminB2,
          source: "FNRI",
        },
      });
      total++;
    }

    // Follow pagination
    for (const nextUrl of nextUrls.slice(0, 20)) {
      await sleep(1000);
      await processUrl(nextUrl);
    }
  };

  await processUrl(FNRI_ALL_URL);

  await prisma.scrapingLog.create({
    data: { source: "FNRI", status: "success", count: total },
  });

  return total;
}

export async function findNutritionForIngredient(
  ingredientName: string
): Promise<{ calories: number | null; protein: number | null; carbohydrates: number | null; fat: number | null; vitaminA: number | null; vitaminC: number | null; iron: number | null; calcium: number | null } | null> {
  const normalized = ingredientName.toLowerCase().trim();

  // Exact match first
  let fact = await prisma.nutritionFact.findFirst({
    where: { ingredientName: { equals: normalized, mode: "insensitive" } },
  });

  // Fuzzy: check if ingredientName contains any word from the search term
  if (!fact) {
    const words = normalized.split(/\s+/).filter((w) => w.length > 3);
    for (const word of words) {
      fact = await prisma.nutritionFact.findFirst({
        where: { ingredientName: { contains: word, mode: "insensitive" } },
      });
      if (fact) break;
    }
  }

  if (!fact) return null;

  return {
    calories: fact.calories,
    protein: fact.protein,
    carbohydrates: fact.carbohydrates,
    fat: fact.fat,
    vitaminA: fact.vitaminA,
    vitaminC: fact.vitaminC,
    iron: fact.iron,
    calcium: fact.calcium,
  };
}
