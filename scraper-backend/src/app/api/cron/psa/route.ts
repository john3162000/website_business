import { prisma } from "@/lib/db";
import { importPsa } from "@/lib/psa-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Weekly PSA price update, called by Vercel Cron (see vercel.json). PSA
 * publishes monthly, so weekly catches a new month within days. Vercel sends
 * `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
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
