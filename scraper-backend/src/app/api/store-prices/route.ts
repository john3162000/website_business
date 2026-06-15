import { prisma } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/cors";

export const dynamic = "force-dynamic";

/**
 * Live SM Markets retail product prices for the SarapSulit site — a second
 * price source alongside the DA Daily Price Index. Returns the latest snapshot
 * price for each product plus its recent price history (for trend vs. the
 * previous snapshot). Optional `?q=` filters by product name.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  // All rows from the last ~45 days, oldest first, folded into per-SKU history.
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 45);

  const rows = await prisma.storeProduct.findMany({
    where: {
      sourceDate: { gte: since },
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ sku: "asc" }, { sourceDate: "asc" }],
  });

  interface Entry {
    sku: string;
    name: string;
    category: string | null;
    uom: string | null;
    imageUrl: string | null;
    url: string | null;
    price: number | null;
    prevPrice: number | null;
    latestDate: string;
    history: { date: string; price: number | null }[];
  }

  const bySku = new Map<string, Entry>();
  let latestDate: string | null = null;

  for (const r of rows) {
    const iso = r.sourceDate.toISOString();
    if (!latestDate || iso > latestDate) latestDate = iso;

    let e = bySku.get(r.sku);
    if (!e) {
      e = {
        sku: r.sku,
        name: r.name,
        category: r.category,
        uom: r.uom,
        imageUrl: r.imageUrl,
        url: r.url,
        price: null,
        prevPrice: null,
        latestDate: iso,
        history: [],
      };
      bySku.set(r.sku, e);
    }
    // Keep the most recent metadata.
    e.name = r.name;
    e.category = r.category;
    e.uom = r.uom;
    e.imageUrl = r.imageUrl;
    e.url = r.url;
    e.history.push({ date: iso, price: r.price });
  }

  for (const e of bySku.values()) {
    const priced = e.history.filter((h) => h.price != null);
    if (priced.length > 0) {
      e.price = priced[priced.length - 1].price;
      e.latestDate = priced[priced.length - 1].date;
      if (priced.length > 1) e.prevPrice = priced[priced.length - 2].price;
    }
  }

  const products = [...bySku.values()].sort((a, b) => a.name.localeCompare(b.name));

  return corsJson({ latestDate, count: products.length, products });
}

export function OPTIONS() {
  return corsPreflight();
}
