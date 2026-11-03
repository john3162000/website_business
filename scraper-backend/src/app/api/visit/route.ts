import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { corsJson, corsPreflight } from "@/lib/cors";
import { ensureVisitTable } from "@/lib/ensure-schema";
import { clientIp, geoFrom, isBot, lastDays, manilaDay, visitorCode } from "@/lib/visits";

export const dynamic = "force-dynamic";

const METHODS = "GET, POST, OPTIONS";
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) || null : null);

// A secret salt, so the stored code can't be matched back to an IP by hashing every address.
const salt = () => process.env.VISIT_SALT?.trim() || process.env.CRON_SECRET?.trim() || "";

/**
 * POST /api/visit  { page?, lang? }
 * Counts one visit: one row per visitor (salted hash of the IP) per Manila day, with the
 * country / region / city Vercel derives from the IP. The IP address itself is not stored.
 */
export async function POST(request: Request) {
  if (isBot(request.headers.get("user-agent"))) return corsJson({ ok: true }, undefined, METHODS);
  const ip = clientIp(request.headers);
  if (!ip) return corsJson({ ok: true }, undefined, METHODS);
  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.length <= 2000) body = JSON.parse(text || "{}");
  } catch {
    // no body: still a visit
  }
  await ensureVisitTable();
  const day = manilaDay();
  const visitor = visitorCode(ip, salt());
  const { country, region, city } = geoFrom(request.headers);
  const page = str(body.page, 40);
  const lang = str(body.lang, 5);
  await prisma.visit.upsert({
    where: { day_visitor: { day, visitor } },
    create: { day, visitor, country, region, city, page, lang },
    update: { hits: { increment: 1 }, lastSeen: new Date() },
  });
  return corsJson({ ok: true }, undefined, METHODS);
}

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

/**
 * GET /api/visit (admin only, `x-admin-token`): users today, in the last 7 and 30 days and of all
 * time, new vs returning today, users per day for 30 days, and the top cities and countries.
 */
export async function GET(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;
  await ensureVisitTable();
  const today = manilaDay();
  const days30 = lastDays(today, 30);
  const from7 = days30[23];
  const from30 = days30[0];

  const [totals] = await prisma.$queryRaw<Row[]>`
    SELECT
      COUNT(DISTINCT "visitor") AS "allTime",
      COUNT(DISTINCT "visitor") FILTER (WHERE "day" = ${today}) AS "today",
      COUNT(DISTINCT "visitor") FILTER (WHERE "day" >= ${from7}) AS "last7",
      COUNT(DISTINCT "visitor") FILTER (WHERE "day" >= ${from30}) AS "last30",
      COALESCE(SUM("hits") FILTER (WHERE "day" = ${today}), 0) AS "visitsToday"
    FROM "Visit"`;
  const [fresh] = await prisma.$queryRaw<Row[]>`
    SELECT COUNT(*) AS "newToday" FROM (
      SELECT "visitor" FROM "Visit" GROUP BY "visitor" HAVING MIN("day") = ${today}
    ) t`;
  const daily = await prisma.$queryRaw<Row[]>`
    SELECT "day", COUNT(*) AS "users", SUM("hits") AS "visits"
    FROM "Visit" WHERE "day" >= ${from30} GROUP BY "day" ORDER BY "day"`;
  const cities = await prisma.$queryRaw<Row[]>`
    SELECT COALESCE("city", '?') AS "city", COALESCE("region", '') AS "region", COALESCE("country", '?') AS "country",
           COUNT(DISTINCT "visitor") AS "users"
    FROM "Visit" WHERE "day" >= ${from30}
    GROUP BY 1, 2, 3 ORDER BY "users" DESC LIMIT 25`;
  const countries = await prisma.$queryRaw<Row[]>`
    SELECT COALESCE("country", '?') AS "country", COUNT(DISTINCT "visitor") AS "users"
    FROM "Visit" WHERE "day" >= ${from30} GROUP BY 1 ORDER BY "users" DESC LIMIT 15`;

  const byDay = new Map(daily.map((d) => [String(d.day), { users: num(d.users), visits: num(d.visits) }]));
  const usersToday = num(totals?.today);
  const newToday = num(fresh?.newToday);
  return Response.json(
    {
      today,
      users: { today: usersToday, last7: num(totals?.last7), last30: num(totals?.last30), allTime: num(totals?.allTime) },
      visitsToday: num(totals?.visitsToday),
      newToday,
      returningToday: Math.max(0, usersToday - newToday),
      daily: days30.map((day) => ({ day, ...(byDay.get(day) ?? { users: 0, visits: 0 }) })),
      cities: cities.map((c) => ({ city: String(c.city), region: String(c.region), country: String(c.country), users: num(c.users) })),
      countries: countries.map((c) => ({ country: String(c.country), users: num(c.users) })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export function OPTIONS() {
  return corsPreflight(METHODS);
}
