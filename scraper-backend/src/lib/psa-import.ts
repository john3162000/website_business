import { prisma } from "@/lib/db";
import { ensurePsaTable } from "@/lib/ensure-schema";
import { fetchPsaPrices } from "@/lib/scrapers/psa-scraper";

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
