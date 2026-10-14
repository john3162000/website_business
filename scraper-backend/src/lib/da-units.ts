/**
 * DA Daily Price Index rows have no unit column: prices are PHP per kg unless
 * the commodity name says otherwise ("Chicken Egg (White, Medium) 56-60
 * grams/pc" is per piece, "Cooking Oil (Palm) 1 Liter/bottle" is per bottle).
 * This reads the basis out of the name so callers can convert to ₱ per gram/ml.
 */
export interface PriceBasis {
  /** What one quoted price buys. */
  per: "kg" | "piece" | "bottle";
  /** Bottle size in ml (per = "bottle"). */
  bottleMl: number | null;
  /** Typical piece weight in grams (per = "piece", from "56-60 grams/pc"). */
  pieceGrams: number | null;
  /** Pieces per kg for per-kg items sold by count ("13-15 pcs/kg"), midpoint. */
  piecesPerKg: number | null;
  /** Short display label, e.g. "₱/kg", "₱/pc", "₱/bottle (1 L)". */
  label: string;
}

const mid = (a: string, b?: string) => (b ? (parseFloat(a) + parseFloat(b)) / 2 : parseFloat(a));

export function parsePriceBasis(name: string): PriceBasis {
  const n = name.replace(/,/g, "");

  const ml = n.match(/(\d+(?:\.\d+)?)\s*ml\s*\/\s*bottle/i);
  const liter = n.match(/(\d+(?:\.\d+)?)\s*(?:liter|litre|l)\s*\/\s*bottle/i);
  if (ml || liter) {
    const bottleMl = ml ? parseFloat(ml[1]) : parseFloat(liter![1]) * 1000;
    const size = bottleMl >= 1000 ? `${bottleMl / 1000} L` : `${bottleMl} ml`;
    return { per: "bottle", bottleMl, pieceGrams: null, piecesPerKg: null, label: `₱/bottle (${size})` };
  }

  const g = n.match(/(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(?:grams?|gm|g)\s*\/\s*pc/i);
  if (g) {
    const pieceGrams = mid(g[1], g[2]);
    // A size spec in parentheses ("Bell Pepper … Local Medium (151-250gm/pc)") describes
    // the piece; the price is still per kg. Outside parentheses ("Chicken Egg (White,
    // Medium) 56-60 grams/pc") the price is per piece.
    const inParens = new RegExp(`\\([^)]*${g[0].replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}[^)]*\\)`).test(n);
    if (inParens) return { per: "kg", bottleMl: null, pieceGrams, piecesPerKg: Math.round(1000 / pieceGrams), label: "₱/kg" };
    return { per: "piece", bottleMl: null, pieceGrams, piecesPerKg: null, label: "₱/pc" };
  }

  const pcs = n.match(/(\d+)(?:\s*-\s*(\d+))?\s*pcs\s*\/\s*kg/i);
  return { per: "kg", bottleMl: null, pieceGrams: null, piecesPerKg: pcs ? mid(pcs[1], pcs[2]) : null, label: "₱/kg" };
}

/**
 * Not a real commodity: rows saved before the merged-row parser fix carry
 * another row's price inside the name, and the PDF footnote ("Note(s): a)
 * Prevailing price is defined as …") can be parsed as a row.
 */
export function isMalformedName(name: string): boolean {
  return /(^|\s)([\d,]+\.\d{2}|n\/a)(\s|$)/i.test(name) || /^note\(?s?\)?\s*:/i.test(name.trim());
}
