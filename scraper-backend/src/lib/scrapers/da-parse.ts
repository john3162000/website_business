/**
 * Parsing the text of DA's "Daily Price Index" PDF into commodity rows. Pure (no database), so
 * it can be tested; da-scraper.ts fetches the PDFs and stores the rows.
 */

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
  /^COMMODITY SPECIFICATION\b/i, // the table header, repeated at the top of every page (one or several lines)
  /^PREVAILING$/i,
  /^RETAIL PRICE PER$/i,
  /^UNIT \(P\/UNIT\)$/i,
  /^Note\(?s?\)?\s*:/i, // footnote ("Note(s): a) Prevailing price is defined as …")
  /prevailing price is defined|arithmetic mean/i, // footnote text without the "Note(s):" prefix
];

const PRICE_TOKEN = /^([\d,]+\.\d{2}|n\/a)$/i;
const PAGE_HEADER = /^(COMMODITY SPECIFICATION|PREVAILING RETAIL PRICE|RETAIL PRICE PER|UNIT \(P\/UNIT\))\b/i;

/**
 * The DA "Daily Price Index" lists an ALL-CAPS category header, then one
 * commodity per line ending in either a price ("194.00") or "n/a". Some
 * commodity names wrap onto a second line, so non-price/non-header lines are
 * buffered and prepended to the following line.
 */
export function extractCommodities(text: string, sourceDate: Date): CommodityRow[] {
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

    // A price token is "194.00" or "n/a". The PDF text layer sometimes puts
    // two or three table rows on one line ("Ginger, Local … 199.50 Ginger,
    // Imported … 147.00 Red Onion, Local 13-15 pcs/kg 123.46"), so split on
    // every price token instead of only reading the last one. Names never
    // contain a two-decimal number, so this is safe ("1,000 ml", "56-60 grams").
    const tokens = line.split(" ");
    if (tokens.some((t) => PRICE_TOKEN.test(t))) {
      let buf = pendingName ? pendingName.split(" ") : [];
      for (const t of tokens) {
        if (!PRICE_TOKEN.test(t)) {
          buf.push(t);
          continue;
        }
        const name = buf.join(" ").trim();
        const price = /^n\/a$/i.test(t) ? null : parseFloat(t.replace(/,/g, ""));
        if (name && (price === null || !isNaN(price))) rows.push({ category, name, price, sourceDate });
        buf = [];
      }
      // Text after the last price starts the next row (or is a category header). The table
      // header that starts each new page ("COMMODITY SPECIFICATION PREVAILING RETAIL PRICE PER")
      // can land here too: it isn't a category, so the section carries on across the page break.
      const rest = buf.join(" ").trim();
      if (PAGE_HEADER.test(rest)) {
        pendingName = "";
        lastWasCategory = false;
      } else if (rest && /[A-Z]/.test(rest) && rest === rest.toUpperCase()) {
        category = rest;
        pendingName = "";
        lastWasCategory = true;
      } else {
        pendingName = rest;
        lastWasCategory = false;
      }
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

