import { requireAdmin } from "@/lib/admin-auth";
import { crawlLogs, crawlStep } from "@/lib/recipe-crawl";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scrapes a small chunk (a handful of new recipes) per request, since a full
 * crawl of every recipe can take far longer than a serverless function is
 * allowed to run. The client should keep calling POST while the response's
 * `done` is false. The daily cron (/api/cron/recipes) runs the same steps.
 */
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  try {
    const r = await crawlStep();
    return Response.json(r.done ? { done: true, itemsScraped: r.itemsScraped } : { done: false, itemsScraped: r.itemsScraped, cursor: r.cursor });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  return Response.json(await crawlLogs());
}
