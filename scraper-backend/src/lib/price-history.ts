/**
 * Month-over-month price comparisons for DA history. Pure, so the commodities
 * route, the dish price movers and the tests share one definition of
 * "a month ago".
 */
const DAY = 86400000;

export interface PricePoint {
  date: string;
  price: number | null;
}

/**
 * The day to compare the latest prices against: the last day with data on or
 * before `latest − days`. While less history is stored than that, the earliest
 * day at least `minDays` back (so the site can show "vs Sep 14" honestly).
 * Null when history is shorter than `minDays`.
 */
export function compareDate(dates: Iterable<string>, latest: string, days = 30, minDays = 21): string | null {
  const latestMs = new Date(latest).getTime();
  const sorted = [...new Set(dates)].sort();
  let best: string | null = null;
  for (const d of sorted) if (new Date(d).getTime() <= latestMs - days * DAY) best = d;
  if (best) return best;
  const first = sorted[0];
  return first && latestMs - new Date(first).getTime() >= minDays * DAY ? first : null;
}

/**
 * The price on `date`, or on the last priced day up to `maxGapDays` before it
 * (DA skips weekends and holidays). DA reports 0 for items it didn't survey:
 * that is not a price.
 */
export function priceOn(history: PricePoint[], date: string, maxGapDays = 7): number | null {
  const at = new Date(date).getTime();
  let best: PricePoint | null = null;
  for (const h of history) {
    const t = new Date(h.date).getTime();
    if (h.price == null || h.price <= 0 || t > at || t < at - maxGapDays * DAY) continue;
    if (!best || h.date > best.date) best = h;
  }
  return best ? best.price : null;
}

/** Relative change as a fraction (0.12 = +12%), or null without a usable base. */
export function pctChange(now: number | null, then: number | null): number | null {
  return now == null || then == null || then <= 0 ? null : (now - then) / then;
}
