import { requireCron } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { initialDACursor, scrapeDAChunk, type DACursor } from "@/lib/scrapers/da-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// How many of the most recent report days to (re)fetch per run. DA posts one
// Daily Price Index per working day; re-checking a few days also fills in a
// report that was uploaded late.
const DAYS_PER_RUN = 3;
const TIME_BUDGET_MS = 50_000;

/**
 * Daily DA price update, called by Vercel Cron (see vercel.json). Fetches the
 * newest Daily Price Index PDFs and replaces those days' rows. Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET the route is closed in production.
 */
export async function GET(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;

  const started = Date.now();
  const log = await prisma.scrapingLog.create({
    data: { type: "DA_DAILY", status: "RUNNING", message: "Daily update: checking the latest DA reports..." },
  });

  try {
    // First call builds the day list (newest first); then one day per call.
    let cursor: DACursor = (await scrapeDAChunk(initialDACursor())).cursor;
    cursor = { queue: (cursor.queue ?? []).slice(0, DAYS_PER_RUN) };
    let saved = 0;
    let days = 0;
    while (cursor.queue && cursor.queue.length > 0 && Date.now() - started < TIME_BUDGET_MS) {
      const r = await scrapeDAChunk(cursor, (msg) =>
        prisma.scrapingLog.update({ where: { id: log.id }, data: { message: `Daily update: ${msg}` } }).catch(() => {})
      );
      saved += r.saved;
      days++;
      cursor = r.cursor;
      if (r.done) break;
    }
    const message = `Daily update done: ${saved} commodity rows saved from the last ${days} report day(s)`;
    await prisma.scrapingLog.update({
      where: { id: log.id },
      data: { status: "DONE", itemsScraped: saved, message, finishedAt: new Date() },
    });
    return Response.json({ ok: true, saved, days });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.scrapingLog.update({
      where: { id: log.id },
      data: { status: "ERROR", message: `Daily update failed: ${message}`, finishedAt: new Date() },
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
