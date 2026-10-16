import { corsJson, corsPreflight } from "@/lib/cors";
import { compileNowAndMonthAgo } from "@/lib/recipe-compile/load";
import { dishPriceChange, MIN_COST_COVERAGE, MIN_SHARED_SHARE } from "@/lib/recipe-compile/price-movers.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A dish "moved" when it changed at least this much: 10% over a month, less over a shorter window.
const MIN_CHANGE: Record<number, number> = { 7: 0.05, 14: 0.07, 30: 0.1 };
const MIN_PESOS = 1;         // and at least ₱1 per serving
const MIN_COST = 5;          // ₱ per serving; below this the dish is mostly unpriced
// Prices change once a day: let the CDN keep the result for an hour.
const CACHE = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Dishes whose cost per serving rose or fell most since about a month ago
 * (`compareDate`, see src/lib/price-history.ts), from DA price changes. SM and
 * DTI reference prices are fixed, so only DA-priced ingredients move a dish.
 *
 * GET /api/recipes/price-movers           → top 10 each way
 * GET /api/recipes/price-movers?limit=30
 * GET /api/recipes/price-movers?days=7   → against last week (14: two weeks, 30: a month)
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const limit = Math.min(50, Math.max(1, Number(params.get("limit")) || 10));
  // ?days=7 (last week), 14 (two weeks) or 30 (a month, the default).
  const days = [7, 14, 30].includes(Number(params.get("days"))) ? Number(params.get("days")) : 30;
  const { latestDate, compareDate, now, then } = await compileNowAndMonthAgo(days);
  const base = { latestDate, compareDate, days, thresholds: { minChange: MIN_CHANGE[days], minPesosPerServing: MIN_PESOS, minCostCoverage: MIN_COST_COVERAGE, minSharedShare: MIN_SHARED_SHARE } };
  if (!compareDate) {
    return corsJson({ ...base, compared: 0, rose: [], fell: [], note: "Not enough DA price history stored yet for this comparison." }, { headers: CACHE });
  }

  const thenById = new Map(then.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const changes = now.flatMap((c) => {
    const t = thenById.get(c.id);
    const ch = t ? dishPriceChange(c, t) : null;
    // Reposted recipes share a title; count each dish once.
    const key = c.title.trim().toLowerCase();
    if (!ch || ch.then < MIN_COST || seen.has(key)) return [];
    seen.add(key);
    return [{ ...ch, title: c.title }];
  });
  const movers = changes.filter((x) => Math.abs(x.change) >= MIN_CHANGE[days] && Math.abs(x.now - x.then) >= MIN_PESOS);
  const out = (x: (typeof changes)[number]) => ({
    id: x.id, title: x.title, servings: x.servings, now: r2(x.now), then: r2(x.then), change: r3(x.change),
    drivers: x.drivers.map((d) => ({ label: d.label, source: d.source, change: d.change == null ? null : r3(d.change), perServing: r2(d.perServing) })),
  });
  const sorted = changes.map((x) => x.change).sort((a, b) => a - b);

  return corsJson({
    ...base,
    compared: changes.length,
    medianChange: sorted.length ? r3(sorted[Math.floor(sorted.length / 2)]) : null,
    rising: movers.filter((x) => x.change > 0).length,
    falling: movers.filter((x) => x.change < 0).length,
    rose: movers.filter((x) => x.change > 0).sort((a, b) => b.change - a.change).slice(0, limit).map(out),
    fell: movers.filter((x) => x.change < 0).sort((a, b) => a.change - b.change).slice(0, limit).map(out),
  }, { headers: CACHE });
}

export function OPTIONS() {
  return corsPreflight();
}
