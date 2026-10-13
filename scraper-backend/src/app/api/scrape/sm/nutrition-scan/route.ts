import { prisma } from "@/lib/db";
import { scanSMNutrition } from "@/lib/scrapers/sm-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Shelf-stable categories, where products carry a printed nutrition label.
const PACKAGED_CATEGORY_WORDS = [
  "canned", "condiment", "sauce", "snack", "biscuit", "cracker", "chips", "noodle", "pasta",
  "beverage", "drink", "juice", "milk", "dairy", "coffee", "cereal", "spread", "instant", "baking",
];

/**
 * Diagnostic: does SM Markets expose nutrition facts? Samples packaged
 * products already in StoreProduct (spread across categories) and scans all
 * their attributes and descriptions in one go. Pass `?skus=a,b,c` to scan
 * specific SKUs instead, or `?limit=` (default 40, max 100).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 40, 1), 100);

  const skus = (searchParams.get("skus") ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  if (skus.length === 0) {
    const rows = await prisma.storeProduct.findMany({
      where: { OR: PACKAGED_CATEGORY_WORDS.map((w) => ({ category: { contains: w, mode: "insensitive" as const } })) },
      distinct: ["sku"],
      orderBy: { sourceDate: "desc" },
      select: { sku: true, category: true },
      take: 2000,
    });
    // Round-robin across categories so the sample isn't all one aisle.
    const byCat = new Map<string, string[]>();
    for (const r of rows) {
      const key = r.category ?? "";
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(r.sku);
    }
    const lists = [...byCat.values()];
    for (let i = 0; skus.length < limit && lists.some((l) => i < l.length); i++) {
      for (const l of lists) if (i < l.length && skus.length < limit) skus.push(l[i]);
    }
  }

  if (skus.length === 0) {
    return Response.json({ error: "No packaged StoreProduct rows found to sample." }, { status: 400 });
  }

  try {
    return Response.json(await scanSMNutrition(skus.slice(0, 100)));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
