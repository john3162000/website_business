import { requireCron } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { backfillPsa, importPsa } from "@/lib/psa-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * PSA prices, called daily by Vercel Cron (see vercel.json). Mondays: the weekly update (PSA
 * publishes monthly, so weekly catches a new month within days). Other days: two more years of
 * history for the seasonal price patterns (/api/prices/seasons), back to 2018, then nothing.
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET the route is closed in production.
 */
export async function GET(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;
  if (new Date().getUTCDay() !== 1) return backfill();
  const log = await prisma.scrapingLog.create({ data: { type: "PSA", status: "RUNNING", message: "Weekly update: fetching PSA prices..." } });
  try {
    const r = await importPsa();
    await prisma.scrapingLog.update({
      where: { id: log.id },
      data: { status: "DONE", itemsScraped: r.rows, message: `Weekly update: ${r.rows} prices, ${r.commodities} commodities, latest ${r.latest?.slice(0, 7)}`, finishedAt: new Date() },
    });
    return Response.json({ ok: true, ...r });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.scrapingLog.update({ where: { id: log.id }, data: { status: "ERROR", message: `Weekly update failed: ${message}`, finishedAt: new Date() } });
    return Response.json({ error: message }, { status: 500 });
  }
}

async function backfill() {
  try {
    const r = await backfillPsa();
    if (!r) return Response.json({ ok: true, backfill: "complete" });
    await prisma.scrapingLog.create({
      data: { type: "PSA", status: "DONE", itemsScraped: r.rows, message: `History backfill: ${r.rows} prices for ${r.years.join("–")}`, finishedAt: new Date() },
    });
    return Response.json({ ok: true, backfill: r });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.scrapingLog.create({ data: { type: "PSA", status: "ERROR", message: `History backfill failed: ${message}`, finishedAt: new Date() } });
    return Response.json({ error: message }, { status: 500 });
  }
}
