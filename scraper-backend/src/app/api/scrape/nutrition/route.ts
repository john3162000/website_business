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

  if (!log) {
    // Resume a previously interrupted run (e.g. timeout/transient error) rather
    // than starting over from scratch, as long as it left a cursor behind.
    const last = await prisma.scrapingLog.findFirst({
      where: { type: TYPE },
      orderBy: { id: "desc" },
    });
    if (last && last.status !== "DONE" && last.cursor) {
      log = await prisma.scrapingLog.update({
        where: { id: last.id },
        data: { status: "RUNNING", message: "Resuming...", finishedAt: null },
      });
    }
  }

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
      // The first scraper version mis-mapped FNRI's table columns and keyed rows
      // as "<name>__<page>" (e.g. "a001__all", with foodName "A001"). Real FNRI
      // codes never contain "__", so once a full run has re-saved every food
      // under its real code, drop those leftover rows.
      const purged = await prisma.nutritionFact.deleteMany({ where: { foodCode: { contains: "__" } } });
      const purgedNote = purged.count > 0 ? `, removed ${purged.count} legacy mis-parsed rows` : "";
      await prisma.scrapingLog.update({
        where: { id: log.id },
        data: { status: "DONE", itemsScraped, message: `Done — ${itemsScraped} nutrition entries saved${purgedNote}`, cursor: null, finishedAt: new Date() },
      });
      return Response.json({ done: true, itemsScraped, purged: purged.count });
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
