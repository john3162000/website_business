// PSA prices as the recipe engine sees them: one price per commodity. Pure, for tests.
import type { PsaPrice } from "./compile.ts";

const DAY = 86400000;
/** PSA publishes about a month late; older months are not "current". */
export const PSA_MAX_AGE_DAYS = 120;

export type PsaRow = { commodity: string; unit: string; price: number; period: Date; region: string };

/**
 * The latest PSA price per commodity for months on or before `asOf` (default: now), within
 * PSA_MAX_AGE_DAYS: Metro Manila's, or the national average where NCR has none.
 */
export function psaSnapshot(rows: PsaRow[], asOf?: string): Map<string, PsaPrice> {
  const until = asOf ? new Date(asOf).getTime() : Date.now();
  const ncr = new Map<string, PsaPrice>(), ph = new Map<string, PsaPrice>();
  for (const r of rows) {
    const t = r.period.getTime();
    if (t > until || t < until - PSA_MAX_AGE_DAYS * DAY) continue;
    const national = r.region === "PH";
    (national ? ph : ncr).set(r.commodity, { price: r.price, per: r.unit === "piece" ? "piece" : "kg", period: r.period.toISOString(), ...(national ? { national } : {}) });
  }
  for (const [k, v] of ph) if (!ncr.has(k)) ncr.set(k, v);
  return ncr;
}
