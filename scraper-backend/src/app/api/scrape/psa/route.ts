import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { importPsa } from "@/lib/psa-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPE = "PSA";

/** Imports PSA OpenSTAT monthly NCR retail prices (one request, about 20 s). */
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  const log = await prisma.scrapingLog.create({ data: { type: TYPE, status: "RUNNING", message: "Fetching PSA OpenSTAT retail prices..." } });
  try {
    const r = await importPsa();
    const message = `${r.rows} monthly prices for ${r.commodities} commodities, latest ${r.latest?.slice(0, 7) ?? "—"}`;
    await prisma.scrapingLog.update({ where: { id: log.id }, data: { status: "DONE", itemsScraped: r.rows, message, finishedAt: new Date() } });
    return Response.json({ done: true, ...r });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.scrapingLog.update({ where: { id: log.id }, data: { status: "ERROR", message, finishedAt: new Date() } });
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const logs = await prisma.scrapingLog.findMany({ where: { type: TYPE }, orderBy: { id: "desc" }, take: 30 });
  return Response.json(logs);
}
