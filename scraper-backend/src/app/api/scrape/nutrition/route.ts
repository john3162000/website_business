import { prisma } from "@/lib/db";
import { initialNutritionCursor, scrapeNutritionBatch, type NutritionCursor } from "@/lib/scrapers/nutrition-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPE = "NUTRITION";

/**
 * Scrapes one FNRI listing page per request (chunked, since the full crawl can
 * span far more pages than a serverless function is allowed to run for).
 * The client should keep calling POST while the response's `done` is false.
 */
export async function POST() {
  let log = await prisma.scrapingLog.findFirst({
    where: { type: TYPE, status: "RUNNING" },
  });

  let cursor: NutritionCursor;
  if (log?.cursor) {
    cursor = JSON.parse(log.cursor);
  } else {
    cursor = initialNutritionCursor();
    log = await prisma.scrapingLog.create({
      data: { type: TYPE, status: "RUNNING", message: "Starting full FNRI nutrition scrape...", cursor: JSON.stringify(cursor) },
    });
  }

  try {
    const result = await scrapeNutritionBatch(cursor, (msg) =>
      prisma.scrapingLog
        .update({ where: { id: log!.id }, data: { message: msg } })
        .catch(() => {})
    );

    const itemsScraped = log.itemsScraped + result.saved;

    if (result.done) {
      await prisma.scrapingLog.update({
        where: { id: log.id },
        data: { status: "DONE", itemsScraped, message: `Done — ${itemsScraped} nutrition entries saved`, cursor: null, finishedAt: new Date() },
      });
      return Response.json({ done: true, itemsScraped });
    }

    await prisma.scrapingLog.update({
      where: { id: log.id },
      data: { itemsScraped, cursor: JSON.stringify(result.cursor) },
    });
    return Response.json({ done: false, itemsScraped, remaining: result.cursor.queue.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.scrapingLog.update({
      where: { id: log.id },
      data: { status: "ERROR", message, finishedAt: new Date() },
    });
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const logs = await prisma.scrapingLog.findMany({
    where: { type: TYPE },
    orderBy: { id: "desc" },
    take: 30,
  });
  return Response.json(logs);
}
