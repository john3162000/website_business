import { prisma } from "@/lib/db";
import { initialRecipeCursor, scrapeRecipeChunk, type RecipeCursor } from "@/lib/scrapers/recipe-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPE = "RECIPES";

/**
 * Scrapes a small chunk (a handful of new recipes) per request, since a full
 * crawl of every recipe can take far longer than a serverless function is
 * allowed to run. The client should keep calling POST while the response's
 * `done` is false.
 */
export async function POST() {
  let log = await prisma.scrapingLog.findFirst({
    where: { type: TYPE, status: "RUNNING" },
  });

  let cursor: RecipeCursor;
  if (log?.cursor) {
    cursor = JSON.parse(log.cursor);
  } else {
    cursor = initialRecipeCursor();
    log = await prisma.scrapingLog.create({
      data: { type: TYPE, status: "RUNNING", message: "Starting full Panlasang Pinoy recipe scrape...", cursor: JSON.stringify(cursor) },
    });
  }

  try {
    const result = await scrapeRecipeChunk(cursor, (msg) =>
      prisma.scrapingLog
        .update({ where: { id: log!.id }, data: { message: msg } })
        .catch(() => {})
    );

    const itemsScraped = log.itemsScraped + result.saved;

    if (result.done) {
      await prisma.scrapingLog.update({
        where: { id: log.id },
        data: { status: "DONE", itemsScraped, message: `Done — ${itemsScraped} recipes saved`, cursor: null, finishedAt: new Date() },
      });
      return Response.json({ done: true, itemsScraped });
    }

    await prisma.scrapingLog.update({
      where: { id: log.id },
      data: { itemsScraped, cursor: JSON.stringify(result.cursor) },
    });
    return Response.json({ done: false, itemsScraped, cursor: result.cursor });
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
