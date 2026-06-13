/**
 * DA (Department of Agriculture) commodity price scraper.
 * Downloads the latest daily price monitoring PDF, parses commodity rows
 * (name, unit, low/high/prevailing price), and stores them as a static snapshot.
 */

import { prisma } from "@/lib/db";

const DA_PDF_URL = "https://www.da.gov.ph/price-monitoring/";

export interface CommodityRow {
  name: string;
  unit: string;
  lowPrice: number;
  highPrice: number;
  prevailingPrice: number;
  sourceDate: Date;
}

const PRICE_LINE = /^(.+?)\s+(kg|pc|bunch|tray|head|bag|liter|L|pcs|g|gram)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i;

function extractCommodities(text: string, sourceDate: Date): CommodityRow[] {
  const rows: CommodityRow[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const match = line.match(PRICE_LINE);
    if (!match) continue;

    const name = match[1].trim();
    const unit = match[2].trim();
    const lowPrice = parseFloat(match[3]);
    const highPrice = parseFloat(match[4]);
    const prevailingPrice = parseFloat(match[5]);

    if ([lowPrice, highPrice, prevailingPrice].some((n) => isNaN(n) || n <= 0)) continue;

    rows.push({ name, unit, lowPrice, highPrice, prevailingPrice, sourceDate });
  }

  return rows;
}

async function fetchPdfBuffer(): Promise<Buffer> {
  const response = await fetch(DA_PDF_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ScraperBackend/1.0)" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch DA price PDF: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function scrapeAndStoreDAPrices(
  onProgress?: (msg: string) => void
): Promise<number> {
  const sourceDate = new Date();

  onProgress?.("Downloading DA price monitoring PDF...");
  const buffer = await fetchPdfBuffer();

  if (typeof globalThis.DOMMatrix === "undefined") {
    // pdfjs-dist (used by pdf-parse) references DOMMatrix even when unused for text extraction.
    class DOMMatrixPolyfill {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).DOMMatrix = DOMMatrixPolyfill;
  }

  const pdfParseModule: unknown = await import("pdf-parse");
  const pdfParse = (
    typeof pdfParseModule === "function"
      ? pdfParseModule
      : (pdfParseModule as { default: unknown }).default
  ) as (buf: Buffer) => Promise<{ text: string }>;
  const data = await pdfParse(buffer);
  const rows = extractCommodities(data.text, sourceDate);

  if (rows.length === 0) {
    throw new Error("No commodity rows extracted — PDF format may have changed");
  }

  onProgress?.(`Parsed ${rows.length} commodity rows, saving...`);

  for (const row of rows) {
    await prisma.commodity.upsert({
      where: { name_unit_sourceDate: { name: row.name, unit: row.unit, sourceDate: row.sourceDate } },
      create: row,
      update: {
        lowPrice: row.lowPrice,
        highPrice: row.highPrice,
        prevailingPrice: row.prevailingPrice,
      },
    });
  }

  return rows.length;
}
