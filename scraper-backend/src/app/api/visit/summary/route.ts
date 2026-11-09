import { prisma } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/cors";
import { checkQuery, textUpTo } from "@/lib/query-guard";
import { ensureVisitTable } from "@/lib/ensure-schema";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

/**
 * GET /api/visit/summary: public, totals only (no codes, no addresses): users and visits in the
 * last 24 hours, 72 hours and 7 days, by when each visitor was last seen, and visitors per city
 * over the last 7 days (`places7d`). Read by the owner's
 * daily report; the detailed stats stay admin-only at GET /api/visit.
 */
export async function GET(request: Request) {
  // The answer is never cached (no-store), so the daily report's cache-buster and the share token
  // the Vercel tool adds (`_vercel_share`) are allowed: they can't force any extra work.
  const q = checkQuery(request.url, { fresh: textUpTo(20), _vercel_share: textUpTo(100) });
  if (!q.ok) return corsJson({ error: q.error }, { status: 400 });
  await ensureVisitTable();
  const now = Date.now();
  const since = (h: number) => new Date(now - h * 3600_000);
  const [r] = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(DISTINCT "visitor") FILTER (WHERE "lastSeen" >= ${since(24)}) AS "users24h",
      COUNT(DISTINCT "visitor") FILTER (WHERE "lastSeen" >= ${since(72)}) AS "users72h",
      COUNT(DISTINCT "visitor") FILTER (WHERE "lastSeen" >= ${since(168)}) AS "users7d",
      COALESCE(SUM("hits") FILTER (WHERE "lastSeen" >= ${since(24)}), 0) AS "visits24h",
      COALESCE(SUM("hits") FILTER (WHERE "lastSeen" >= ${since(72)}), 0) AS "visits72h",
      COALESCE(SUM("hits") FILTER (WHERE "lastSeen" >= ${since(168)}), 0) AS "visits7d",
      COUNT(DISTINCT "visitor") AS "allTime"
    FROM "Visit"`;
  // Where visitors were in the last 7 days: counts per city only (Vercel's guess from the IP),
  // never codes or addresses, so nobody can be picked out.
  const places = await prisma.$queryRaw<Row[]>`
    SELECT COALESCE("city", '?') AS "city", COALESCE("region", '') AS "region", COALESCE("country", '?') AS "country",
           COUNT(DISTINCT "visitor") AS "users"
    FROM "Visit" WHERE "lastSeen" >= ${since(168)}
    GROUP BY 1, 2, 3 ORDER BY "users" DESC, 1 LIMIT 15`;
  return corsJson(
    {
      at: new Date(now).toISOString(),
      users: { last24h: num(r?.users24h), last72h: num(r?.users72h), last7d: num(r?.users7d), allTime: num(r?.allTime) },
      visits: { last24h: num(r?.visits24h), last72h: num(r?.visits72h), last7d: num(r?.visits7d) },
      places7d: places.map((c) => ({ city: String(c.city), region: String(c.region), country: String(c.country), users: num(c.users) })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
