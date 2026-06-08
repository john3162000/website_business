import { prisma } from "@/lib/db";
import { scrapeAndStoreAllRecipes } from "@/lib/scrapers/recipe-scraper";

export const dynamic = "force-dynamic";

const TYPE = "RECIPES";

export async function POST() {
  const running = await prisma.scrapingLog.findFirst({
    where: { type: TYPE, status: "RUNNING" },
  });
  if (running) {
    return Response.json({ error: "A recipe scrape is already running" }, { status: 409 });
  }

  const log = await prisma.scrapingLog.create({
    data: { type: TYPE, status: "RUNNING", message: "Starting full Panlasang Pinoy recipe scrape..." },
  });

  // Fire-and-forget: this can run for a long time scraping every recipe on the site.
  (async () => {
    try {
      const count = await scrapeAndStoreAllRecipes((msg) =>
        prisma.scrapingLog
          .update({ where: { id: log.id }, data: { message: msg } })
          .catch(() => {})
      );
      await prisma.scrapingLog.update({
        where: { id: log.id },
        data: { status: "DONE", itemsScraped: count, message: `Saved ${count} new recipes`, finishedAt: new Date() },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.scrapingLog.update({
        where: { id: log.id },
        data: { status: "ERROR", message, finishedAt: new Date() },
      });
    }
  })();

  return Response.json({ success: true, logId: log.id });
}

export async function GET() {
  const logs = await prisma.scrapingLog.findMany({
    where: { type: TYPE },
    orderBy: { id: "desc" },
    take: 30,
  });
  return Response.json(logs);
}
