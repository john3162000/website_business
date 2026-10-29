import { requireCron } from "@/lib/admin-auth";
import { crawlStep } from "@/lib/recipe-crawl";
import { hopOrigin } from "@/lib/hop-origin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIME_BUDGET_MS = 45_000;
// Each hop is one function run of up to ~45 s. Vercel's loop protection refuses a function's
// sixth nested call to itself (HTTP 508, seen 2026-10-29), so a run is 5 hops (~70 recipes) and
// vercel.json schedules a run every hour instead.
const MAX_HOPS = 5;

/**
 * Daily recipe crawl, started by Vercel Cron (see vercel.json). Runs crawl steps (4 new recipes
 * each) for ~45 s, then, while posts are left, calls itself again with the same
 * `Authorization: Bearer $CRON_SECRET` Vercel sends, so the whole crawl finishes in one go
 * without anyone handling the admin token. When every sitemap has been read it stops; the next
 * day's run only fetches posts added since. New recipes go through the pricing engine on the
 * next /api/recipes/compiled request, and ones with an unknown ingredient are hidden.
 */
export async function GET(request: Request) {
  const denied = requireCron(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const hop = Number(url.searchParams.get("hop") ?? 0);
  const started = Date.now();
  let saved = 0;
  let steps = 0;
  let last: Awaited<ReturnType<typeof crawlStep>> | null = null;
  try {
    while (Date.now() - started < TIME_BUDGET_MS) {
      last = await crawlStep();
      saved += last.saved;
      steps++;
      if (last.done) break;
    }
  } catch (err) {
    // The run keeps its cursor (ERROR); tomorrow's cron resumes it. No hop, so an outage can't loop.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`recipe crawl hop ${hop} stopped: ${message}`);
    return Response.json({ ok: false, hop, steps, saved, error: message }, { status: 500 });
  }

  const more = !!last && !last.done && hop + 1 < MAX_HOPS;
  console.log(`recipe crawl hop ${hop}: ${steps} steps, ${saved} new, total this run ${last?.itemsScraped ?? 0}${last?.done ? ", done" : ""}${more ? ", next hop" : ""}`);
  if (more) {
    const next = new URL(url.pathname, hopOrigin(request, url));
    next.searchParams.set("hop", String(hop + 1));
    // Start the next hop and return; it runs on its own (we only wait for it to be accepted).
    // A quick non-2xx (401 from Vercel Authentication, 503) means the chain stopped: log it.
    const res = await fetch(next, { headers: { authorization: request.headers.get("authorization") ?? "" }, signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (res && !res.ok) console.error(`recipe crawl hop ${hop + 1} refused: HTTP ${res.status} from ${next.host}`);
  }
  return Response.json({ ok: true, hop, steps, saved, itemsScraped: last?.itemsScraped ?? 0, done: !!last?.done, nextHop: more });
}
