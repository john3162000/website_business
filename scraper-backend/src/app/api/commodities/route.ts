import { prisma } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/cors";
import { isMalformedName, parsePriceBasis, type PriceBasis } from "@/lib/da-units";
import { CANONICALS } from "@/lib/recipe-compile/catalog.generated.ts";
import { ensureNutritionColumns } from "@/lib/ensure-schema";
import { compareDate, pctChange, priceOn } from "@/lib/price-history";

export const dynamic = "force-dynamic";

/**
 * Live DA commodity prices for the SarapSulit site.
 * Returns the latest snapshot price for each commodity plus its full
 * recent price history (so the client can show trend vs. the previous day
 * and, optionally, a sparkline), and the change since `compareDate`: about a
 * month back, or the earliest stored day while history is shorter than that.
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
    unit: PriceBasis;
    localName: string | null;
    low: number | null;
    high: number | null;
    /** Price on compareDate (or the last surveyed day the week before it). */
    monthAgoPrice: number | null;
    /** (price − monthAgoPrice) ÷ monthAgoPrice, e.g. 0.12 = +12%. */
    monthChange: number | null;
  }

  const byName = new Map<string, Entry>();
  let latestDate: string | null = null;

  for (const r of rows) {
    // Skip rows saved before the merged-row parser fix (another row's price in the name).
    if (isMalformedName(r.name)) continue;
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
        unit: parsePriceBasis(r.name),
        localName: null,
        low: null,
        high: null,
        monthAgoPrice: null,
        monthChange: null,
      };
      byName.set(r.name, e);
    }
    // History is appended in ascending date order; the last priced entry is
    // the latest, the one before it is "previous" for trend.
    e.history.push({ date: iso, price: r.price });
    if (r.category) e.category = r.category;
  }

  // Drop names not seen in the last week of data: they were renamed (e.g. rice
  // grades now suffixed with their category) or DA stopped listing them.
  const cutoff = latestDate ? new Date(new Date(latestDate).getTime() - 7 * 86400000).toISOString() : null;
  for (const [name, e] of byName) {
    const lastSeen = e.history[e.history.length - 1]?.date;
    if (cutoff && lastSeen && lastSeen < cutoff) byName.delete(name);
  }

  for (const e of byName.values()) {
    const priced = e.history.filter((h) => h.price != null);
    if (priced.length > 0) {
      e.price = priced[priced.length - 1].price;
      e.latestDate = priced[priced.length - 1].date;
      if (priced.length > 1) e.prevPrice = priced[priced.length - 2].price;
    }
  }

  const compare = latestDate ? compareDate(rows.map((r) => r.sourceDate.toISOString()), latestDate) : null;
  if (compare) {
    for (const e of byName.values()) {
      e.monthAgoPrice = priceOn(e.history, compare);
      e.monthChange = pctChange(e.price != null && e.price > 0 ? e.price : null, e.monthAgoPrice);
    }
  }

  // Filipino name: the FNRI alternate name of the catalog ingredient priced by this DA item.
  const codeByDa = new Map<string, string>();
  for (const c of Object.values(CANONICALS)) if (c.daName && c.fnriCode && !codeByDa.has(c.daName)) codeByDa.set(c.daName, c.fnriCode);
  await ensureNutritionColumns().catch(() => {});
  const alt = await prisma.nutritionFact.findMany({
    where: { foodCode: { in: [...new Set(codeByDa.values())] } },
    select: { foodCode: true, altNames: true },
  }).catch(() => []);
  const altByCode = new Map(alt.map((a) => [a.foodCode, a.altNames]));
  for (const e of byName.values()) {
    const code = codeByDa.get(e.name);
    const a = code ? altByCode.get(code) : null;
    e.localName = a ? a.split(/[,/;]/)[0].trim() : null;
    // DA sometimes reports 0 for an item it didn't survey that day: not a price.
    const priced = e.history.map((h) => h.price).filter((p): p is number => p != null && p > 0);
    e.low = priced.length ? Math.min(...priced) : null;
    e.high = priced.length ? Math.max(...priced) : null;
  }

  const commodities = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));

  return corsJson({ latestDate, compareDate: compare, count: commodities.length, commodities });
}

export function OPTIONS() {
  return corsPreflight();
}
