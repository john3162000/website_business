/**
 * DA (Department of Agriculture) commodity price scraper.
 * Downloads the latest daily price monitoring PDF, parses commodity rows
 * (name, unit, low/high/prevailing price), and stores them as a static snapshot.
 */

import * as cheerio from "cheerio";
import { prisma } from "@/lib/db";

const DA_PAGE_URL = "https://www.da.gov.ph/price-monitoring/";

export interface CommodityRow {
  category: string | null;
  name: string;
  price: number | null;
  sourceDate: Date;
}

// Page/section boilerplate that appears in the extracted text but isn't data.
const SKIP_PATTERNS: RegExp[] = [
  /^Page \d+ of \d+$/i,
  /^-+\s*\d+\s*of\s*\d+\s*-+$/i,
  /^Department of Agriculture$/i,
  /^DAILY PRICE INDEX$/i,
  /^National Capital Region/i,
  /^\(.*\d{4}\)$/, // the "(Friday, June 12, 2026)" date line
  /^Prevailing Retail Price/i,
  /^COMMODITY SPECIFICATION$/i,
  /^PREVAILING$/i,
  /^RETAIL PRICE PER$/i,
  /^UNIT \(P\/UNIT\)$/i,
];

const PRICE_AT_END = /^(.*\S)\s+([\d,]+\.\d{2})$/;
const NA_AT_END = /^(.*\S)\s+n\/a$/i;

/** Parse the report date from the "(Friday, June 12, 2026)" header line. */
function parseReportDate(text: string): Date {
  const m = text.match(/\(?(?:[A-Za-z]+,\s*)?([A-Z][a-z]+\s+\d{1,2},\s*\d{4})\)?/);
  if (m) {
    const d = new Date(m[1]);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * The DA "Daily Price Index" lists an ALL-CAPS category header, then one
 * commodity per line ending in either a price ("194.00") or "n/a". Some
 * commodity names wrap onto a second line, so non-price/non-header lines are
 * buffered and prepended to the following line.
 */
function extractCommodities(text: string, sourceDate: Date): CommodityRow[] {
  const rows: CommodityRow[] = [];
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  let category: string | null = null;
  let pendingName = "";
  let lastWasCategory = false;

  for (const line of lines) {
    if (SKIP_PATTERNS.some((re) => re.test(line))) {
      pendingName = "";
      lastWasCategory = false;
      continue;
    }

    const priceMatch = line.match(PRICE_AT_END);
    if (priceMatch) {
      const name = `${pendingName} ${priceMatch[1]}`.trim();
      const price = parseFloat(priceMatch[2].replace(/,/g, ""));
      if (name && !isNaN(price)) rows.push({ category, name, price, sourceDate });
      pendingName = "";
      lastWasCategory = false;
      continue;
    }

    const naMatch = line.match(NA_AT_END);
    if (naMatch) {
      const name = `${pendingName} ${naMatch[1]}`.trim();
      if (name) rows.push({ category, name, price: null, sourceDate });
      pendingName = "";
      lastWasCategory = false;
      continue;
    }

    // No price on this line: it's either a category header (ALL CAPS, possibly
    // wrapped across two lines) or the start of a wrapped commodity name.
    const isAllCaps = /[A-Z]/.test(line) && line === line.toUpperCase();
    if (isAllCaps) {
      category = lastWasCategory && category ? `${category} ${line}` : line;
      lastWasCategory = true;
      pendingName = "";
    } else {
      pendingName = `${pendingName} ${line}`.trim();
      lastWasCategory = false;
    }
  }

  return rows;
}

const FETCH_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; ScraperBackend/1.0)" };

/**
 * The price-monitoring page is an HTML index, not a PDF directly — find the
 * latest price-monitoring PDF link on it and download that.
 */
async function findLatestPdfUrl(): Promise<string> {
  const response = await fetch(DA_PAGE_URL, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch DA price-monitoring page: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  let pdfUrl: string | undefined;
  $("a[href*='.pdf']").each((_, el) => {
    if (pdfUrl) return;
    const href = $(el).attr("href");
    if (!href) return;
    pdfUrl = new URL(href, DA_PAGE_URL).toString();
  });

  if (!pdfUrl) {
    throw new Error("Could not find a PDF link on the DA price-monitoring page");
  }
  return pdfUrl;
}

async function fetchPdfBuffer(onProgress?: (msg: string) => void): Promise<Buffer> {
  const pdfUrl = await findLatestPdfUrl();
  onProgress?.(`Downloading: ${pdfUrl}`);

  const response = await fetch(pdfUrl, {
    headers: FETCH_HEADERS,
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
  onProgress?.("Looking up latest DA price monitoring PDF...");
  const buffer = await fetchPdfBuffer(onProgress);

  if (typeof globalThis.DOMMatrix === "undefined") {
    // pdfjs-dist (used by pdf-parse) references DOMMatrix even when unused for text extraction.
    class DOMMatrixPolyfill {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).DOMMatrix = DOMMatrixPolyfill;
  }

  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();

  const sourceDate = parseReportDate(result.text);
  const rows = extractCommodities(result.text, sourceDate);

  if (rows.length === 0) {
    throw new Error("No commodity rows extracted — PDF format may have changed");
  }

  onProgress?.(`Parsed ${rows.length} commodity rows for ${sourceDate.toDateString()}, saving...`);

  for (const row of rows) {
    await prisma.commodity.upsert({
      where: { name_region_sourceDate: { name: row.name, region: "NCR", sourceDate: row.sourceDate } },
      create: { category: row.category, name: row.name, price: row.price, region: "NCR", sourceDate: row.sourceDate },
      update: { category: row.category, price: row.price },
    });
  }

  return rows.length;
}
