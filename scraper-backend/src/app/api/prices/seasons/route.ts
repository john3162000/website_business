import { prisma } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/cors";
import { ensurePsaTable } from "@/lib/ensure-schema";
import { monthPicks, seasonProfiles } from "@/lib/seasons";

export const dynamic = "force-dynamic";

/** Manila's current month, 0 = January. */
const manilaMonth = () => new Date(Date.now() + 8 * 3600_000).getUTCMonth();

/**
 * GET /api/prices/seasons[?month=1-12]
 * Which produce, fish and meat are usually cheap or dear in a month, from PSA's monthly retail
 * prices since 2018 (Metro Manila, else the national average). `profiles` has every commodity's
 * twelve-month index; `cheap` / `dear` are the month's picks (index ≤ 0.95 / ≥ 1.05).
 */
export async function GET(request: Request) {
  await ensurePsaTable();
  const q = Number(new URL(request.url).searchParams.get("month"));
  const month = q >= 1 && q <= 12 ? q - 1 : manilaMonth();
  const rows = await prisma.psaPrice.findMany({
    where: { region: { in: ["NCR", "PH"] } },
    select: { commodity: true, category: true, unit: true, region: true, period: true, price: true },
  });
  const profiles = seasonProfiles(rows);
  const { cheap, dear } = monthPicks(profiles, month);
  const periods = rows.map((r) => r.period.getTime());
  const span = periods.length
    ? { from: new Date(Math.min(...periods)).toISOString().slice(0, 7), to: new Date(Math.max(...periods)).toISOString().slice(0, 7) }
    : null;
  const brief = (p: (typeof profiles)[number]) => ({ name: p.name, commodity: p.commodity, category: p.category, index: p.index[month], cheapest: p.cheapest, lastPrice: p.lastPrice, unit: p.unit });
  return corsJson(
    {
      month: month + 1,
      source: "PSA OpenSTAT retail prices (Metro Manila, else national average)",
      span,
      cheap: cheap.map(brief),
      dear: dear.map(brief),
      profiles,
    },
    { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
