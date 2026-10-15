/**
 * PSA OpenSTAT retail prices: monthly prevailing (palengke) prices of
 * agricultural commodities, by region, from the Philippine Statistics
 * Authority's public PxWeb JSON API. We keep Metro Manila (NCR) only.
 *
 * Third price source after DA (daily): it covers wet-market items DA doesn't
 * list (tahong, halaan, lapu-lapu, gizzard, kangkong, malunggay…), about a
 * month behind. https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2M/2018NEW
 *
 * The national average ("PH") is kept too: PSA surveys some items only outside
 * Metro Manila (malunggay, beef tripe, clams, puso ng saging), and a national
 * price is better than none. NCR always wins where it has a price.
 */
const BASE = "https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/2M/2018NEW/";
// The 2018-based retail tables (cereals … fish). Their ids are stable.
export const PSA_TABLES = Array.from({ length: 11 }, (_, i) => `0042M4ARN${String(i + 1).padStart(2, "0")}.px`);
// The server refuses clients without a browser-like user agent.
const HEADERS = { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (compatible; SarapSulit/1.0)" };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface PsaRow {
  commodity: string;
  /** "NCR" (Metro Manila) or "PH" (national average). */
  region: "NCR" | "PH";
  category: string | null;
  unit: "kg" | "piece";
  price: number;
  /** First day of the month, UTC. */
  period: Date;
}

interface PxVariable { code: string; text: string; values: string[]; valueTexts: string[] }
interface PxMeta { title: string; variables: PxVariable[] }
interface PxData { data: { key: string[]; values: string[] }[] }

/** "FRESH SHELLS, TAHONG, 1 KG" → kg; "FRESH EGG, QUAIL, LOOSE, 1 PC" → piece. */
export function psaUnit(commodity: string): "kg" | "piece" {
  return /\b1 PC\b/i.test(commodity) ? "piece" : "kg";
}

const find = (meta: PxMeta, re: RegExp) => meta.variables.find((v) => re.test(v.text));

/** The request body for a table: NCR and the national average, every commodity, the given years, every month (not "Annual"). */
export function ncrQuery(meta: PxMeta, years: string[]) {
  const geo = find(meta, /geo|region/i)!;
  const com = find(meta, /commodit/i)!;
  const year = find(meta, /^year$/i)!;
  const per = find(meta, /period/i)!;
  const ncr = geo.values[geo.valueTexts.findIndex((t) => /NATIONAL CAPITAL/i.test(t))];
  const ph = geo.values[geo.valueTexts.findIndex((t) => /^PHILIPPINES/i.test(t.trim()))];
  const yearCodes = year.values.filter((_, i) => years.includes(year.valueTexts[i]));
  const months = per.values.filter((_, i) => per.valueTexts[i] !== "Annual");
  return {
    query: [
      { code: geo.code, selection: { filter: "item", values: ph ? [ncr, ph] : [ncr] } },
      { code: com.code, selection: { filter: "all", values: ["*"] } },
      { code: year.code, selection: { filter: "item", values: yearCodes } },
      { code: per.code, selection: { filter: "item", values: months } },
    ],
    response: { format: "json" },
  };
}

/**
 * Rows from a table's NCR response. PSA fills months not yet surveyed with
 * "." or ".."; only positive numbers are prices.
 */
export function parsePsa(meta: PxMeta, data: PxData): PsaRow[] {
  const geo = find(meta, /geo|region/i)!;
  const com = find(meta, /commodit/i)!;
  const year = find(meta, /^year$/i)!;
  const per = find(meta, /period/i)!;
  const name = (v: PxVariable, code: string) => v.valueTexts[v.values.indexOf(code)];
  const category = meta.title.split(":")[0].trim() || null;
  const out: PsaRow[] = [];
  for (const row of data.data) {
    const [g, c, y, p] = row.key;
    const region = /^PHILIPPINES/i.test((name(geo, g) ?? "").trim()) ? "PH" : "NCR";
    const price = Number(row.values[0]);
    const month = MONTHS.indexOf(name(per, p));
    if (!Number.isFinite(price) || price <= 0 || month < 0) continue;
    const commodity = name(com, c);
    out.push({ commodity, region, category, unit: psaUnit(commodity), price, period: new Date(Date.UTC(Number(name(year, y)), month, 1)) });
  }
  return out;
}

async function json<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`PSA ${url.split("/").pop()}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** All NCR and national monthly prices for this year and last year, from every retail table. */
export async function fetchPsaPrices(now = new Date()): Promise<PsaRow[]> {
  const years = [String(now.getUTCFullYear() - 1), String(now.getUTCFullYear())];
  const rows: PsaRow[] = [];
  for (const t of PSA_TABLES) {
    const meta = await json<PxMeta>(BASE + t);
    rows.push(...parsePsa(meta, await json<PxData>(BASE + t, ncrQuery(meta, years))));
  }
  return rows;
}
