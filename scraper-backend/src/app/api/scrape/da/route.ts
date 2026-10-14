import { prisma } from "@/lib/db";
import { initialDACursor, scrapeDAChunk, type DACursor } from "@/lib/scrapers/da-scraper";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPE = "DA";

// The backfill window is "the last 30 days" relative to when a run starts, so
// an old interrupted run's cursor points at stale dates. Don't resume one this old.
const STALE_MS = 6 * 60 * 60 * 1000;

/**
 * Backfills the last 30 days of DA Daily Price Index data, one report day per
 * request (each PDF fetch+parse is heavy). The client should keep calling POST
 * while the response's `done` is false.
 */
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  let log = await prisma.scrapingLog.findFirst({
    where: { type: TYPE, status: "RUNNING" },
  });

  if (!log) {
    // Resume a previously interrupted run rather than starting over, as long as
    // it left a cursor behind.
    const last = await prisma.scrapingLog.findFirst({
      where: { type: TYPE },
      orderBy: { id: "desc" },
    });
    if (last && last.status !== "DONE" && last.cursor && Date.now() - last.startedAt.getTime() < STALE_MS) {
      log = await prisma.scrapingLog.update({
        where: { id: last.id },
        data: { status: "RUNNING", message: "Resuming...", finishedAt: null },
      });
    }
  } else if (Date.now() - log.startedAt.getTime() >= STALE_MS) {
    // A RUNNING row left over from an abandoned run: close it and start fresh.
    await prisma.scrapingLog.update({
      where: { id: log.id },
      data: { status: "ERROR", message: "Abandoned: stale run (dates out of window), restarted fresh", cursor: null, finishedAt: new Date() },
    });
    log = null;
  }

  let cursor: DACursor;
  if (log?.cursor) {
    cursor = JSON.parse(log.cursor);
  } else {
    cursor = initialDACursor();
    log = await prisma.scrapingLog.create({
      data: { type: TYPE, status: "RUNNING", message: "Starting 30-day DA price backfill...", cursor: JSON.stringify(cursor) },
    });
  }

  try {
    const result = await scrapeDAChunk(cursor, (msg) =>
      prisma.scrapingLog
        .update({ where: { id: log!.id }, data: { message: msg } })
        .catch(() => {})
    );

    const itemsScraped = log.itemsScraped + result.saved;

    if (result.done) {
      await prisma.scrapingLog.update({
        where: { id: log.id },
        data: { status: "DONE", itemsScraped, message: `Done — ${itemsScraped} commodity rows saved`, cursor: null, finishedAt: new Date() },
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
