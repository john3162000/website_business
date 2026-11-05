// Seasonal price patterns from PSA's monthly retail prices: which months a commodity is usually
// cheap or dear. Pure, for tests; the route reads the rows from PsaPrice.
//
// Method: ratio to a centred 12-month moving average (the classic seasonal-index method), so a
// price that rises every year with inflation doesn't make December look "dear" and January
// "cheap". For each calendar month, the median ratio over the years is that month's index,
// rescaled so the twelve average 1. Index 0.85 = usually 15% below the commodity's typical price.

export type SeasonRow = { commodity: string; category: string | null; unit: string; region: string; period: Date; price: number };

export interface SeasonProfile {
  /** Short display name ("Tomato", "Tahong"). */
  name: string;
  /** PSA commodity text as published. */
  commodity: string;
  category: string | null;
  unit: string;
  /** "NCR" (Metro Manila) or "PH" (national average, where NCR has too little history). */
  region: string;
  /** How many years of ratios the index rests on (the smallest count over the months). */
  years: number;
  /** Twelve indexes, January first; null where a month has too few years. */
  index: (number | null)[];
  /** The three months with the lowest and highest index (0 = January). */
  cheapest: number[];
  dearest: number[];
  /** Highest index over lowest, minus 1: 0.4 = the dear month is 40% above the cheap month. */
  swing: number;
  /** The latest price and month (YYYY-MM). */
  lastPrice: number;
  lastPeriod: string;
}

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** "FRESH SHELLS, TAHONG, 1 KG" → "Tahong"; "TOMATO, 1 KG" → "Tomato"; "RICE, REGULAR MILLED, 1 KG" → "Rice, regular milled". */
export function seasonName(commodity: string): string {
  const parts = commodity.split(",").map((p) => p.trim()).filter((p) => p && !/^\d+(\.\d+)?\s*(KG|PC|PCS|G|L|ML)\b/i.test(p));
  // PSA prefixes fish and shellfish with their group ("FRESH SHELLS", "FRESH FISH"): the item is the next part.
  if (parts.length > 1 && /^(FRESH|FROZEN|DRIED) (FISH|SHELLS?|SHELLFISH|SEAFOODS?|CRUSTACEANS?)$/i.test(parts[0])) parts.shift();
  return parts.join(", ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

/** One commodity's monthly series ("year*12+month" → price) for one region. */
function seasonalIndex(series: Map<number, number>, minYears: number): { index: (number | null)[]; years: number } | null {
  const ratios: number[][] = Array.from({ length: 12 }, () => []);
  for (const [t, x] of series) {
    let sum = 0;
    let ok = true;
    for (let k = -6; k <= 6; k++) {
      const v = series.get(t + k);
      if (v == null) { ok = false; break; }
      sum += Math.abs(k) === 6 ? v / 2 : v;
    }
    if (ok) ratios[((t % 12) + 12) % 12].push(x / (sum / 12));
  }
  const raw = ratios.map((r) => (r.length >= minYears ? median(r) : null));
  const known = raw.filter((v): v is number => v != null);
  if (known.length < 10) return null;
  const mean = known.reduce((a, b) => a + b, 0) / known.length;
  return { index: raw.map((v) => (v == null ? null : round(v / mean))), years: Math.min(...ratios.filter((r) => r.length >= minYears).map((r) => r.length)) };
}

/**
 * Seasonal profiles for every commodity with at least `minYears` years of history: Metro Manila's
 * prices where NCR has enough, else the national average.
 */
export function seasonProfiles(rows: SeasonRow[], minYears = 3): SeasonProfile[] {
  type Group = { category: string | null; unit: string; series: Map<string, Map<number, number>> };
  const groups = new Map<string, Group>();
  for (const r of rows) {
    if (!(r.price > 0)) continue;
    const g = groups.get(r.commodity) ?? { category: r.category, unit: r.unit, series: new Map() };
    groups.set(r.commodity, g);
    const s = g.series.get(r.region) ?? new Map<number, number>();
    g.series.set(r.region, s);
    s.set(r.period.getUTCFullYear() * 12 + r.period.getUTCMonth(), r.price);
  }
  const out: SeasonProfile[] = [];
  for (const [commodity, g] of groups) {
    for (const region of ["NCR", "PH"]) {
      const series = g.series.get(region);
      if (!series) continue;
      const si = seasonalIndex(series, minYears);
      if (!si) continue;
      const months = si.index.map((v, m) => ({ v, m })).filter((x): x is { v: number; m: number } => x.v != null);
      const byIndex = [...months].sort((a, b) => a.v - b.v);
      const lastT = Math.max(...series.keys());
      const lo = byIndex[0].v;
      const hi = byIndex[byIndex.length - 1].v;
      out.push({
        name: seasonName(commodity),
        commodity,
        category: g.category,
        unit: g.unit,
        region,
        years: si.years,
        index: si.index,
        cheapest: byIndex.slice(0, 3).map((x) => x.m),
        dearest: byIndex.slice(-3).reverse().map((x) => x.m),
        swing: round(hi / lo - 1),
        lastPrice: series.get(lastT)!,
        lastPeriod: `${Math.floor(lastT / 12)}-${String((lastT % 12) + 1).padStart(2, "0")}`,
      });
      break; // NCR wins when it has a profile
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * What is usually cheap (index at or below 1 − `margin`) or dear (at or above 1 + `margin`) in a
 * month, the strongest first. Commodities whose prices barely move all year are left out.
 */
export function monthPicks(profiles: SeasonProfile[], month: number, margin = 0.05) {
  const at = (p: SeasonProfile) => p.index[month];
  const cheap = profiles.filter((p) => at(p) != null && at(p)! <= 1 - margin).sort((a, b) => at(a)! - at(b)!);
  const dear = profiles.filter((p) => at(p) != null && at(p)! >= 1 + margin).sort((a, b) => at(b)! - at(a)!);
  return { cheap, dear };
}
