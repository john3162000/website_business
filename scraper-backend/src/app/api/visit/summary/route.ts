import { prisma } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/cors";
import { checkQuery } from "@/lib/query-guard";
import { ensureVisitTable } from "@/lib/ensure-schema";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

/**
 * GET /api/visit/summary: public, totals only (no codes, no locations): users and visits in the
 * last 24 hours, 72 hours and 7 days, by when each visitor was last seen. Read by the owner's
 * daily report; the detailed stats stay admin-only at GET /api/visit.
 */
export async function GET(request: Request) {
  const q = checkQuery(request.url);
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
  return corsJson(
    {
      at: new Date(now).toISOString(),
      users: { last24h: num(r?.users24h), last72h: num(r?.users72h), last7d: num(r?.users7d), allTime: num(r?.allTime) },
      visits: { last24h: num(r?.visits24h), last72h: num(r?.visits72h), last7d: num(r?.visits7d) },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
