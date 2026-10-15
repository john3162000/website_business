import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { ensureRecipeColumns } from "@/lib/ensure-schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 25;
const PARALLEL = 5;

/**
 * One-off backfill: recipes scraped before the lazy-image fix saved the inline
 * SVG placeholder ("data:image/svg+xml…") as their image. Each POST fixes up
 * to 25 of them from the page's og:image tag; call until `remaining` is 0.
 */
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  await ensureRecipeColumns();

  const todo = await prisma.recipe.findMany({
    where: { OR: [{ imageUrl: null }, { imageUrl: { startsWith: "data:" } }] },
    select: { id: true, url: true },
    orderBy: { id: "asc" },
    take: BATCH,
  });

  let fixed = 0, failed = 0;
  for (let i = 0; i < todo.length; i += PARALLEL) {
    await Promise.all(todo.slice(i, i + PARALLEL).map(async (r) => {
      try {
        const res = await fetch(r.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; ScraperBackend/1.0)" }, signal: AbortSignal.timeout(15000) });
        const html = res.ok ? await res.text() : "";
        const m = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
        // Mark pages without an image with "" so they aren't retried forever.
        await prisma.recipe.update({ where: { id: r.id }, data: { imageUrl: m ? m[1] : "" } });
        if (m) fixed++; else failed++;
      } catch {
        failed++;
      }
    }));
  }

  const remaining = await prisma.recipe.count({ where: { OR: [{ imageUrl: null }, { imageUrl: { startsWith: "data:" } }] } });
  return Response.json({ done: remaining === 0, fixed, failed, remaining });
}
