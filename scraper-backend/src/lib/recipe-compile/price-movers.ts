/**
 * How a dish's cost moved between two price snapshots (compileRecipe run with
 * today's DA prices and with the month-ago ones). Pure, for tests and the
 * /api/recipes/price-movers route.
 */
import { isHidden, type CompiledRecipe } from "./compile.ts";

/** Same bar as the Sulit Score ranking: most of the dish (by weight) must be priced. */
export const MIN_COST_COVERAGE = 0.75;
/** Lines priced on both dates must carry ≥ 90% of today's priced weight, so a price DA skipped one day doesn't read as a change. */
export const MIN_SHARED_SHARE = 0.9;

export interface PriceDriver {
  label: string;
  /** "DA", or the SM/DTI reference (those don't change between snapshots). */
  source: string | null;
  /** The ingredient's own price change, e.g. 0.45 = +45%. */
  change: number | null;
  /** Its effect on the dish, ₱ per serving. */
  perServing: number;
}

export interface DishPriceChange {
  id: number;
  servings: number;
  /** ₱ per serving over the lines priced on both dates. */
  now: number;
  then: number;
  change: number;
  /** Up to three ingredients that moved the cost most. */
  drivers: PriceDriver[];
}

export function dishPriceChange(now: CompiledRecipe, then: CompiledRecipe): DishPriceChange | null {
  // Recipes with an ingredient not in the catalog are hidden on the site, so not listed as movers either.
  if (now.isArticle || now.isCollection || isHidden(now) || now.costCoverageByWeight < MIN_COST_COVERAGE) return null;
  let costNow = 0, costThen = 0, gShared = 0, gPricedNow = 0;
  // Same ingredient on two lines (garlic for the sauce and the garnish) is one driver.
  const byLabel = new Map<string, PriceDriver & { costThen: number; costNow: number }>();
  now.lines.forEach((l, i) => {
    const t = then.lines[i];
    if (!l.priced || l.cost == null || l.gAP == null) return;
    gPricedNow += l.gAP;
    if (!t || !t.priced || t.cost == null || t.slug !== l.slug) return;
    costNow += l.cost;
    costThen += t.cost;
    gShared += l.gAP;
    const label = l.label ?? l.text;
    const d = byLabel.get(label) ?? { label, source: l.priceSource, change: null, perServing: 0, costThen: 0, costNow: 0 };
    d.costNow += l.cost;
    d.costThen += t.cost;
    byLabel.set(label, d);
  });
  if (!gPricedNow || gShared / gPricedNow < MIN_SHARED_SHARE || costThen <= 0) return null;

  const drivers = [...byLabel.values()]
    .map(({ costThen: ct, costNow: cn, ...d }) => ({ ...d, change: ct > 0 ? (cn - ct) / ct : null, perServing: (cn - ct) / now.servings }))
    .filter((d) => Math.abs(d.perServing) >= 0.01)
    .sort((a, b) => Math.abs(b.perServing) - Math.abs(a.perServing))
    .slice(0, 3);
  return {
    id: now.id,
    servings: now.servings,
    now: costNow / now.servings,
    then: costThen / now.servings,
    change: (costNow - costThen) / costThen,
    drivers,
  };
}
