import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { ensureRecipeColumns } from "@/lib/ensure-schema";
import { alignGroups, parseStructured } from "@/lib/scrapers/recipe-structured";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TYPE = "STRUCTURED";
const PARALLEL = 4;
const TIME_BUDGET_MS = 38_000; // + a 12 s fetch in flight stays under maxDuration
const QUEUE = 240;

/**
 * Backfill: reads each stored recipe's page once more for the structured data
 * the first crawl didn't keep: course, cuisine, yield, Panlasang Pinoy's own
 * nutrition estimate and the ingredient group headings ("Marinade", "Breading").
 * Each POST works through recipes not read yet (structuredAt null) for about
 * 40 s, 4 pages at a time; the admin page keeps calling until `done`.
 *
 * A page that is gone (4xx) is marked read with no data. Network errors and
 * 5xx leave the recipe for the next call; 429 stops the call so the admin
 * page backs off.
 */
export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  await ensureRecipeColumns();

  let log = await prisma.scrapingLog.findFirst({ where: { type: TYPE, status: "RUNNING" }, orderBy: { id: "desc" } });
  log ??= await prisma.scrapingLog.create({
    data: { type: TYPE, status: "RUNNING", message: "Reading structured data from recipe pages..." },
  });

  const todo = await prisma.recipe.findMany({
    where: { structuredAt: null },
    orderBy: { id: "asc" },
    take: QUEUE,
    select: { id: true, url: true, servings: true, ingredients: { orderBy: { id: "asc" }, select: { id: true, rawText: true } } },
  });

  const started = Date.now();
  let next = 0, read = 0, gone = 0, failed = 0, withNutrition = 0, withGroups = 0, servingsFilled = 0;
  let rateLimited = false;

  const worker = async () => {
    while (next < todo.length && !rateLimited && Date.now() - started < TIME_BUDGET_MS) {
      const r = todo[next++];
      let res: Response;
      try {
        res = await fetch(r.url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; ScraperBackend/1.0)", Accept: "text/html,application/xhtml+xml" },
          signal: AbortSignal.timeout(12000),
        });
      } catch {
        failed++;
        continue;
      }
      if (res.status === 429) { rateLimited = true; failed++; return; }
      if (res.status >= 400 && res.status < 500) {
        await prisma.recipe.update({ where: { id: r.id }, data: { structuredAt: new Date() } });
        gone++;
        continue;
      }
      if (!res.ok) { failed++; continue; }

      const s = parseStructured(await res.text());
      const groups = alignGroups(r.ingredients, s.ingredients);
      const fillServings = !r.servings && s.yieldServings ? s.yieldServings : undefined;
      await prisma.$transaction([
        prisma.recipe.update({
          where: { id: r.id },
          data: {
            course: s.courses.join(", ") || null,
            cuisine: s.cuisines.join(", ") || null,
            yieldText: s.yieldText,
            refNutrition: s.nutrition ? { ...s.nutrition } : undefined,
            servings: fillServings,
            structuredAt: new Date(),
          },
        }),
        ...r.ingredients.flatMap((ing, i) =>
          groups[i] ? [prisma.recipeIngredient.update({ where: { id: ing.id }, data: { groupName: groups[i] } })] : []
        ),
      ]);
      read++;
      if (s.nutrition) withNutrition++;
      if (groups.some(Boolean)) withGroups++;
      if (fillServings) servingsFilled++;
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  const remaining = await prisma.recipe.count({ where: { structuredAt: null } });
  const done = remaining === 0;
  const itemsScraped = log.itemsScraped + read + gone;
  const summary = `${read} pages read (${withNutrition} with nutrition, ${withGroups} with ingredient groups, ${servingsFilled} servings filled), ${gone} gone, ${failed} failed; ${remaining} left`;
  await prisma.scrapingLog.update({
    where: { id: log.id },
    data: done
      ? { status: "DONE", itemsScraped, message: `Done. Last step: ${summary}`, finishedAt: new Date() }
      : { itemsScraped, message: summary },
  });

  if (rateLimited) return Response.json({ error: "Panlasang Pinoy is rate-limiting (HTTP 429)", remaining }, { status: 429 });
  if (read + gone === 0 && failed > 0) return Response.json({ error: `All ${failed} page fetches failed`, remaining }, { status: 502 });
  return Response.json({ done, read, gone, failed, remaining });
}

export async function GET() {
  const logs = await prisma.scrapingLog.findMany({
    where: { type: TYPE },
    orderBy: { id: "desc" },
    take: 30,
  });
  return Response.json(logs);
}
