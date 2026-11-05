import { prisma } from "@/lib/db";
import { ensurePsaTable } from "@/lib/ensure-schema";
import { backfillYears, fetchPsaPrices } from "@/lib/scrapers/psa-scraper";

/**
 * Fetches PSA's NCR and national retail prices (this year and last) and replaces the stored
 * rows for those months: PSA revises recent months, so the newest numbers win.
 */
export async function importPsa(): Promise<{ rows: number; commodities: number; latest: string | null }> {
  await ensurePsaTable();
  const rows = await fetchPsaPrices();
  if (!rows.length) throw new Error("PSA returned no prices");
  const from = new Date(Math.min(...rows.map((r) => r.period.getTime())));
  await prisma.$transaction([
    prisma.psaPrice.deleteMany({ where: { region: { in: ["NCR", "PH"] }, period: { gte: from } } }),
    prisma.psaPrice.createMany({ data: rows, skipDuplicates: true }),
  ]);
  const latest = new Date(Math.max(...rows.map((r) => r.period.getTime())));
  return { rows: rows.length, commodities: new Set(rows.map((r) => r.commodity)).size, latest: latest.toISOString() };
}

/**
 * Adds two more years of PSA history (for the seasonal price patterns), older months only: the
 * stored recent months are never replaced here. Returns null when the history is complete.
 */
export async function backfillPsa(now = new Date()): Promise<{ rows: number; years: number[] } | null> {
  await ensurePsaTable();
  const first = await prisma.psaPrice.findFirst({ where: { region: "NCR" }, orderBy: { period: "asc" }, select: { period: true } });
  const years = backfillYears(first?.period ?? null, now);
  if (!years.length) return null;
  const rows = await fetchPsaPrices(now, years);
  const until = first?.period ?? now;
  const older = rows.filter((r) => r.period < until);
  await prisma.psaPrice.createMany({ data: older, skipDuplicates: true });
  return { rows: older.length, years };
}
