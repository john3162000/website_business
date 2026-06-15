/**
 * DA (Department of Agriculture) commodity price scraper.
 * Crawls the last 30 days of "Daily Price Index" PDFs from the DA
 * price-monitoring page, parses each day's commodity rows, and stores them as
 * a dated snapshot (one Commodity row per commodity per day).
 *
 * The price-monitoring page only links the latest ~10 daily PDFs before a
 * gap, so the day list is built by merging the links actually present on the
 * page with constructed dated URLs for every day in the window (DA uploads
 * follow a stable `/wp-content/uploads/{YYYY}/{MM}/Daily-Price-Index-{Month}-
 * {D}-{YYYY}.pdf` pattern). Missing days (weekends/holidays) simply 404 and
 * are skipped.
 */

import * as cheerio from "cheerio";
import { prisma } from "@/lib/db";

const DA_BASE = "https://www.da.gov.ph";
const DA_PAGE_URL = `${DA_BASE}/price-monitoring/`;
const WINDOW_DAYS = 30;

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
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** A UTC-midnight Date for the given y/m(0-based)/d, avoiding timezone drift. */
function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

/** Build the candidate "Daily Price Index" PDF URLs for a given report date. */
function dpiCandidateUrls(date: Date): string[] {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  const fname = `Daily-Price-Index-${MONTHS[m]}-${d}-${y}.pdf`;
  const pad = (n: number) => String(n).padStart(2, "0");
  // Reports are usually uploaded under their own month, but month-end reports
  // can land in the next month's upload folder — try both.
  const next = utcDate(y, m + 1, 1);
  return [
    `${DA_BASE}/wp-content/uploads/${y}/${pad(m + 1)}/${fname}`,
    `${DA_BASE}/wp-content/uploads/${next.getUTCFullYear()}/${pad(next.getUTCMonth() + 1)}/${fname}`,
  ];
}

/** Parse a report date out of a "Daily-Price-Index-June-14-2026.pdf" URL. */
function dateFromDpiUrl(url: string): Date | null {
  const m = url.match(/Daily-Price-Index-([A-Za-z]+)-(\d{1,2})-(\d{4})\.pdf/i);
  if (!m) return null;
  const month = MONTHS.findIndex((name) => name.toLowerCase() === m[1].toLowerCase());
  if (month < 0) return null;
  return utcDate(parseInt(m[3], 10), month, parseInt(m[2], 10));
}

export interface DAWorkItem {
  /** ISO date string (UTC midnight) of the report. */
  date: string;
  /** Candidate PDF URLs to try in order. */
  urls: string[];
}

export interface DACursor {
  queue: DAWorkItem[] | null;
}

export function initialDACursor(): DACursor {
  return { queue: null };
}

/**
 * Builds the list of report days (last WINDOW_DAYS) to fetch, each with the
 * URLs to try. Authoritative links found on the price-monitoring page take
 * priority; constructed dated URLs cover days the page doesn't list.
 */
async function buildWorkQueue(): Promise<DAWorkItem[]> {
  const response = await fetch(DA_PAGE_URL, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch DA price-monitoring page: ${response.status} ${response.statusText}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);

  // Map each in-window report date -> authoritative URL from the page.
  const pageUrlByDate = new Map<string, string>();
  $("a[href*='Daily-Price-Index']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || !/\.pdf$/i.test(href)) return;
    const url = new URL(href, DA_PAGE_URL).toString();
    const date = dateFromDpiUrl(url);
    if (!date) return;
    const key = date.toISOString();
    if (!pageUrlByDate.has(key)) pageUrlByDate.set(key, url);
  });

  const today = new Date();
  const end = utcDate(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const queue: DAWorkItem[] = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const day = new Date(end);
    day.setUTCDate(day.getUTCDate() - i);
    const key = day.toISOString();
    const urls: string[] = [];
    const pageUrl = pageUrlByDate.get(key);
    if (pageUrl) urls.push(pageUrl);
    for (const c of dpiCandidateUrls(day)) {
      if (!urls.includes(c)) urls.push(c);
    }
    queue.push({ date: key, urls });
  }
  return queue;
}

async function parsePdf(buffer: Buffer, sourceDate: Date): Promise<CommodityRow[]> {
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
  return extractCommodities(result.text, sourceDate);
}

/** Try each candidate URL for a day; return the first that yields a valid PDF. */
async function fetchDayPdf(urls: string[]): Promise<Buffer | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(30000) });
      if (!res.ok) continue;
      const type = res.headers.get("content-type") ?? "";
      const buf = Buffer.from(await res.arrayBuffer());
      // Guard against the site returning an HTML "not found" page with status 200.
      if (!type.includes("pdf") && buf.subarray(0, 5).toString("latin1") !== "%PDF-") continue;
      return buf;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Processes one report day per call (fetch + parse + upsert), returning the
 * updated cursor. Designed to be called repeatedly so a 30-day backfill can be
 * driven from short-lived serverless invocations without timing out.
 */
export async function scrapeDAChunk(
  cursor: DACursor,
  onProgress?: (msg: string) => void
): Promise<{ saved: number; cursor: DACursor; done: boolean }> {
  let queue = cursor.queue;

  if (queue === null) {
    onProgress?.("Building list of the last 30 days of Daily Price Index PDFs...");
    queue = await buildWorkQueue();
    onProgress?.(`Queued ${queue.length} day(s) to check.`);
    return { saved: 0, cursor: { queue }, done: false };
  }

  const item = queue[0];
  if (!item) {
    return { saved: 0, cursor: { queue: [] }, done: true };
  }
  const rest = queue.slice(1);
  const sourceDate = new Date(item.date);
  const label = sourceDate.toISOString().slice(0, 10);

  onProgress?.(`Fetching Daily Price Index for ${label}...`);
  const buffer = await fetchDayPdf(item.urls);

  if (!buffer) {
    onProgress?.(`No PDF available for ${label} — skipping.`);
    return { saved: 0, cursor: { queue: rest }, done: rest.length === 0 };
  }

  const rows = await parsePdf(buffer, sourceDate);
  if (rows.length === 0) {
    onProgress?.(`No commodity rows parsed for ${label} — skipping.`);
    return { saved: 0, cursor: { queue: rest }, done: rest.length === 0 };
  }

  onProgress?.(`Saving ${rows.length} commodity rows for ${label}...`);
  for (const row of rows) {
    await prisma.commodity.upsert({
      where: { name_region_sourceDate: { name: row.name, region: "NCR", sourceDate: row.sourceDate } },
      create: { category: row.category, name: row.name, price: row.price, region: "NCR", sourceDate: row.sourceDate },
      update: { category: row.category, price: row.price },
    });
  }

  return { saved: rows.length, cursor: { queue: rest }, done: rest.length === 0 };
}
