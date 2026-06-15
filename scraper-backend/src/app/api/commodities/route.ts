import { prisma } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/cors";

export const dynamic = "force-dynamic";

/**
 * Live DA commodity prices for the SarapSulit site.
 * Returns the latest snapshot price for each commodity plus its full
 * recent price history (so the client can show trend vs. the previous day
 * and, optionally, a sparkline).
 */
export async function GET() {
  // All rows from the last ~35 days, oldest first, so we can fold them into
  // per-commodity history and derive the latest + previous price.
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 35);

  const rows = await prisma.commodity.findMany({
    where: { sourceDate: { gte: since } },
    orderBy: [{ name: "asc" }, { sourceDate: "asc" }],
  });

  interface Entry {
    category: string | null;
    name: string;
    region: string;
    price: number | null;
    prevPrice: number | null;
    latestDate: string;
    history: { date: string; price: number | null }[];
  }

  const byName = new Map<string, Entry>();
  let latestDate: string | null = null;

  for (const r of rows) {
    const iso = r.sourceDate.toISOString();
    if (!latestDate || iso > latestDate) latestDate = iso;

    let e = byName.get(r.name);
    if (!e) {
      e = {
        category: r.category,
        name: r.name,
        region: r.region,
        price: null,
        prevPrice: null,
        latestDate: iso,
        history: [],
      };
      byName.set(r.name, e);
    }
    // History is appended in ascending date order; the last priced entry is
    // the latest, the one before it is "previous" for trend.
    e.history.push({ date: iso, price: r.price });
    if (r.category) e.category = r.category;
  }

  for (const e of byName.values()) {
    const priced = e.history.filter((h) => h.price != null);
    if (priced.length > 0) {
      e.price = priced[priced.length - 1].price;
      e.latestDate = priced[priced.length - 1].date;
      if (priced.length > 1) e.prevPrice = priced[priced.length - 2].price;
    }
  }

  const commodities = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));

  return corsJson({ latestDate, count: commodities.length, commodities });
}

export function OPTIONS() {
  return corsPreflight();
}
