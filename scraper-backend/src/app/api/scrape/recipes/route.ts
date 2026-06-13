import { prisma } from "@/lib/db";
import { scrapeRecipeIndexPage } from "@/lib/scrapers/recipe-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPE = "RECIPES";

/**
 * Scrapes one recipe index page per request (chunked, since a full crawl of
 * every recipe can take far longer than a serverless function is allowed to run).
 * The client should keep calling POST while the response's `done` is false.
 */
export async function POST() {
  let log = await prisma.scrapingLog.findFirst({
    where: { type: TYPE, status: "RUNNING" },
  });

  let page = 1;
  if (log?.cursor) {
    page = JSON.parse(log.cursor).page ?? 1;
  } else {
    log = await prisma.scrapingLog.create({
      data: { type: TYPE, status: "RUNNING", message: "Starting full Panlasang Pinoy recipe scrape...", cursor: JSON.stringify({ page: 1 }) },
    });
  }

  try {
    const result = await scrapeRecipeIndexPage(page, (msg) =>
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
      data: { itemsScraped, cursor: JSON.stringify({ page: page + 1 }) },
    });
    return Response.json({ done: false, itemsScraped, page: page + 1 });
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
