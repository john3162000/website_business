import { prisma } from "@/lib/db";
import { initialRecipeCursor, scrapeRecipeChunk, type RecipeCursor } from "@/lib/scrapers/recipe-scraper";

const TYPE = "RECIPES";

/**
 * One step of the recipe crawl over every site in RECIPE_SOURCES (up to 4 pages), shared by the admin
 * button (POST /api/scrape/recipes) and the daily cron (/api/cron/recipes). Progress lives
 * in a RECIPES ScrapingLog row: a RUNNING or interrupted run resumes from its cursor, and a
 * finished one starts over (already-saved URLs are skipped quickly, so a new run only
 * fetches posts added since).
 */
export async function crawlStep(): Promise<{ done: boolean; itemsScraped: number; saved: number; cursor?: RecipeCursor }> {
  let log = await prisma.scrapingLog.findFirst({ where: { type: TYPE, status: "RUNNING" } });

  if (!log) {
    // Resume an interrupted run (timeout, transient error) rather than starting over.
    const last = await prisma.scrapingLog.findFirst({ where: { type: TYPE }, orderBy: { id: "desc" } });
    if (last && last.status !== "DONE" && last.cursor) {
      log = await prisma.scrapingLog.update({
        where: { id: last.id },
        data: { status: "RUNNING", message: "Resuming...", finishedAt: null },
      });
    }
  }

  let cursor: RecipeCursor;
  if (log?.cursor) {
    cursor = JSON.parse(log.cursor);
  } else {
    cursor = initialRecipeCursor();
    log = await prisma.scrapingLog.create({
      data: { type: TYPE, status: "RUNNING", message: "Starting the recipe crawl...", cursor: JSON.stringify(cursor) },
    });
  }
  const logId = log!.id;

  try {
    const result = await scrapeRecipeChunk(cursor, (msg) =>
      prisma.scrapingLog.update({ where: { id: logId }, data: { message: msg } }).catch(() => {})
    );
    const itemsScraped = log!.itemsScraped + result.saved;
    if (result.done) {
      await prisma.scrapingLog.update({
        where: { id: logId },
        data: { status: "DONE", itemsScraped, message: `Done — ${itemsScraped} recipes saved`, cursor: null, finishedAt: new Date() },
      });
      return { done: true, itemsScraped, saved: result.saved };
    }
    await prisma.scrapingLog.update({ where: { id: logId }, data: { itemsScraped, cursor: JSON.stringify(result.cursor) } });
    return { done: false, itemsScraped, saved: result.saved, cursor: result.cursor };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // ERROR keeps the cursor, so the next step resumes from the same place.
    await prisma.scrapingLog.update({ where: { id: logId }, data: { status: "ERROR", message, finishedAt: new Date() } });
    throw err;
  }
}

/** The last crawl runs, newest first (admin page). */
export function crawlLogs() {
  return prisma.scrapingLog.findMany({ where: { type: TYPE }, orderBy: { id: "desc" }, take: 30 });
}
