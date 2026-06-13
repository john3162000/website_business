/**
 * DA (Department of Agriculture) Price Index scraper.
 * Downloads the latest daily price monitoring PDF from the DA website,
 * parses commodity names, units, and price ranges, then upserts into the DB.
 */

import { prisma } from "@/lib/db";

// Known DA price monitoring PDF URL patterns
const DA_PDF_URL =
  "https://www.da.gov.ph/price-monitoring/";

export interface CommodityRow {
  name: string;
  localName?: string;
  unit: string;
  lowPrice: number;
  highPrice: number;
  avgPrice: number;
  market?: string;
  region?: string;
  date: Date;
}

export async function parsePdfBuffer(buffer: Buffer, date: Date): Promise<CommodityRow[]> {
  // Dynamic import to avoid bundling issues with pdf-parse
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(buffer);
  return extractCommoditiesFromText(data.text, date);
}

function extractCommoditiesFromText(text: string, date: Date): CommodityRow[] {
  const rows: CommodityRow[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // DA PDFs typically have lines like:
  // "Ampalaya (Bitter gourd)  kg   40.00   60.00   50.00"
  // "Rice, well-milled       kg   48.00   52.00   50.00"
  const pricePattern = /^(.+?)\s+(kg|pc|bunch|tray|head|bag|liter|L|pcs|g|gram)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i;
  const localNamePattern = /^(.+?)\s+\((.+?)\)/;

  for (const line of lines) {
    const match = line.match(pricePattern);
    if (!match) continue;

    const rawName = match[1].trim();
    const unit = match[2].trim();
    const lowPrice = parseFloat(match[3]);
    const highPrice = parseFloat(match[4]);
    const avgPrice = parseFloat(match[5]);

    if (isNaN(lowPrice) || isNaN(highPrice) || isNaN(avgPrice)) continue;
    if (lowPrice <= 0 || highPrice <= 0) continue;

    let name = rawName;
    let localName: string | undefined;

    const localMatch = rawName.match(localNamePattern);
    if (localMatch) {
      name = localMatch[1].trim();
      localName = localMatch[2].trim();
    }

    rows.push({ name, localName, unit, lowPrice, highPrice, avgPrice, date });
  }

  return rows;
}

export async function fetchAndStoreDAPrices(date?: Date): Promise<number> {
  const targetDate = date ?? new Date();

  // Fetch PDF from DA website
  const response = await fetch(DA_PDF_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PriceBot/1.0)" },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch DA price PDF: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const commodities = await parsePdfBuffer(buffer, targetDate);

  if (commodities.length === 0) {
    throw new Error("No commodity data extracted from PDF — format may have changed");
  }

  await prisma.$transaction(
    commodities.map((c) =>
      prisma.commodity.create({
        data: {
          name: c.name,
          localName: c.localName,
          unit: c.unit,
          lowPrice: c.lowPrice,
          highPrice: c.highPrice,
          avgPrice: c.avgPrice,
          market: c.market ?? null,
          region: c.region ?? null,
          date: c.date,
          source: "DA",
        },
      })
    )
  );

  await prisma.scrapingLog.create({
    data: { source: "DA", status: "success", count: commodities.length },
  });

  return commodities.length;
}

export async function storePdfUpload(buffer: Buffer, date: Date): Promise<number> {
  const commodities = await parsePdfBuffer(buffer, date);

  if (commodities.length === 0) {
    throw new Error("No commodity data found in uploaded PDF");
  }

  await prisma.$transaction(
    commodities.map((c) =>
      prisma.commodity.create({
        data: {
          name: c.name,
          localName: c.localName,
          unit: c.unit,
          lowPrice: c.lowPrice,
          highPrice: c.highPrice,
          avgPrice: c.avgPrice,
          market: c.market ?? null,
          region: c.region ?? null,
          date: c.date,
          source: "DA-UPLOAD",
        },
      })
    )
  );

  await prisma.scrapingLog.create({
    data: { source: "DA-UPLOAD", status: "success", count: commodities.length },
  });

  return commodities.length;
}

export async function getLatestPrices(): Promise<CommodityRow[]> {
  const latest = await prisma.commodity.findFirst({
    orderBy: { date: "desc" },
  });
  if (!latest) return [];

  const commodities = await prisma.commodity.findMany({
    where: { date: latest.date },
    orderBy: { name: "asc" },
  });

  type CommodityRow2 = Awaited<ReturnType<typeof prisma.commodity.findMany>>[0];
  return commodities.map((c: CommodityRow2) => ({
    name: c.name,
    localName: c.localName ?? undefined,
    unit: c.unit,
    lowPrice: c.lowPrice,
    highPrice: c.highPrice,
    avgPrice: c.avgPrice,
    market: c.market ?? undefined,
    region: c.region ?? undefined,
    date: c.date,
  }));
}
