import { prisma } from "@/lib/db";
import { scrapeAndStoreDAPrices } from "@/lib/scrapers/da-scraper";

export const dynamic = "force-dynamic";

const TYPE = "DA";

export async function POST() {
  const running = await prisma.scrapingLog.findFirst({
    where: { type: TYPE, status: "RUNNING" },
  });
  if (running) {
    return Response.json({ error: "A DA scrape is already running" }, { status: 409 });
  }

  const log = await prisma.scrapingLog.create({
    data: { type: TYPE, status: "RUNNING", message: "Starting DA price scrape..." },
  });

  // Fire-and-forget: run the scrape after responding so the request doesn't time out.
  (async () => {
    try {
      const count = await scrapeAndStoreDAPrices((msg) =>
        prisma.scrapingLog
          .update({ where: { id: log.id }, data: { message: msg } })
          .catch(() => {})
      );
      await prisma.scrapingLog.update({
        where: { id: log.id },
        data: { status: "DONE", itemsScraped: count, message: `Saved ${count} commodity rows`, finishedAt: new Date() },
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
