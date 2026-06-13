import { prisma } from "@/lib/db";
import { scrapeAndStoreDAPrices } from "@/lib/scrapers/da-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPE = "DA";

export async function POST() {
  // Clear any stuck RUNNING entries from previous attempts (serverless
  // functions can't truly run in the background after responding).
  await prisma.scrapingLog.updateMany({
    where: { type: TYPE, status: "RUNNING" },
    data: { status: "ERROR", message: "Interrupted", finishedAt: new Date() },
  });

  const log = await prisma.scrapingLog.create({
    data: { type: TYPE, status: "RUNNING", message: "Starting DA price scrape..." },
  });

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
    return Response.json({ success: true, count });
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
