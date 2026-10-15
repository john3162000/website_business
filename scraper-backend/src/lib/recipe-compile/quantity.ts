/**
 * Recipe quantity parsing (Phase 1, "as written").
 *
 * Turns the scraped WPRM amount / unit / name spans into a number and a
 * canonical unit, without converting to grams yet (that needs the food: a cup
 * of flour and a cup of water weigh differently). Measures are US customary,
 * since Panlasang Pinoy uses US cups and spoons.
 *
 * Formats seen in the data (21,165 lines): integers, decimals, "1/2",
 * "1 1/2", unicode ½ ¼ ¾ ⅓, ranges "2-3" / "2 to 3", and a few malformed
 * spans ("1 /4", "1/ 1/4", "68g" with no unit, "2 to" + name "matoes").
 */

export type UnitKind = "mass" | "volume" | "count" | "vague" | "none";

export interface ParsedQuantity {
  /** Best single value (range midpoint). Null when no amount was given. */
  value: number | null;
  low: number | null;
  high: number | null;
  /** Canonical unit key, e.g. "g", "ml", "piece", "clove", "pinch". Null when none. */
  unit: string | null;
  kind: UnitKind;
  /** Grams for mass units, ml for volume units, per one unit. */
  perUnit: number | null;
  /** Size word found in the unit or name ("small" | "medium" | "large"). */
  size: "small" | "medium" | "large" | null;
  /** Package size parsed from "1 (12 oz) can" / "14 oz. can …" / "45g pack …", in grams or ml. */
  packageAmount: number | null;
  packageKind: "mass" | "volume" | null;
  /** Ingredient name with any embedded quantity removed. */
  name: string;
  /** Notes for review: "range", "malformed-amount", "package", "oz-as-mass", … */
  flags: string[];
}

const UNICODE_FRACTIONS: Record<string, string> = {
  "½": " 1/2", "¼": " 1/4", "¾": " 3/4", "⅓": " 1/3", "⅔": " 2/3",
  "⅛": " 1/8", "⅜": " 3/8", "⅝": " 5/8", "⅞": " 7/8", "⅕": " 1/5",
};

interface UnitDef { unit: string; kind: UnitKind; perUnit: number | null }

const M = (unit: string, perUnit: number): UnitDef => ({ unit, kind: "mass", perUnit });
const V = (unit: string, perUnit: number): UnitDef => ({ unit, kind: "volume", perUnit });
const C = (unit: string): UnitDef => ({ unit, kind: "count", perUnit: null });
const Q = (unit: string): UnitDef => ({ unit, kind: "vague", perUnit: null });

// Keys are lowercase with trailing dots removed.
const UNITS: Record<string, UnitDef> = {
  g: M("g", 1), gr: M("g", 1), gram: M("g", 1), grams: M("g", 1), mg: M("g", 0.001),
  kg: M("g", 1000), kilo: M("g", 1000), kilos: M("g", 1000), kilogram: M("g", 1000), kilograms: M("g", 1000),
  lb: M("g", 453.592), lbs: M("g", 453.592), pound: M("g", 453.592), pounds: M("g", 453.592),
  oz: M("g", 28.3495), ounce: M("g", 28.3495), ounces: M("g", 28.3495),
  ml: V("ml", 1), milliliter: V("ml", 1), milliliters: V("ml", 1), millilitre: V("ml", 1),
  l: V("ml", 1000), liter: V("ml", 1000), liters: V("ml", 1000), litre: V("ml", 1000), litres: V("ml", 1000),
  cup: V("ml", 236.588), cups: V("ml", 236.588), c: V("ml", 236.588),
  tablespoon: V("ml", 14.787), tablespoons: V("ml", 14.787), tbsp: V("ml", 14.787), tbs: V("ml", 14.787), tbl: V("ml", 14.787), t: V("ml", 14.787),
  teaspoon: V("ml", 4.929), teaspoons: V("ml", 4.929), tsp: V("ml", 4.929), tsps: V("ml", 4.929),
  quart: V("ml", 946.353), quarts: V("ml", 946.353), qt: V("ml", 946.353),
  pint: V("ml", 473.176), pints: V("ml", 473.176), pt: V("ml", 473.176),
  gallon: V("ml", 3785.41), gallons: V("ml", 3785.41),
  "fl oz": V("ml", 29.5735), "fluid ounce": V("ml", 29.5735), "fluid ounces": V("ml", 29.5735),
  piece: C("piece"), pieces: C("piece"), pc: C("piece"), pcs: C("piece"), whole: C("piece"),
  clove: C("clove"), cloves: C("clove"),
  head: C("head"), heads: C("head"),
  thumb: C("thumb"), thumbs: C("thumb"), knob: C("knob"), knobs: C("knob"),
  stalk: C("stalk"), stalks: C("stalk"), stem: C("stalk"), stems: C("stalk"), rib: C("stalk"), ribs: C("stalk"),
  bunch: C("bunch"), bunches: C("bunch"), bundle: C("bunch"), bundles: C("bunch"),
  slice: C("slice"), slices: C("slice"), strip: C("strip"), strips: C("strip"),
  sprig: C("sprig"), sprigs: C("sprig"), leaf: C("leaf"), leaves: C("leaf"),
  can: C("can"), cans: C("can"), pack: C("pack"), packs: C("pack"), package: C("pack"), packages: C("pack"),
  packet: C("pack"), packets: C("pack"), pouch: C("pack"), pouches: C("pack"), sachet: C("pack"), sachets: C("pack"),
  bottle: C("bottle"), bottles: C("bottle"), block: C("block"), blocks: C("block"), cube: C("cube"), cubes: C("cube"),
  pinch: Q("pinch"), pinches: Q("pinch"), dash: Q("dash"), dashes: Q("dash"),
};

const SIZE_WORDS = new Set(["small", "medium", "large", "big", "jumbo"]);
const asSize = (w: string): ParsedQuantity["size"] =>
  w === "small" ? "small" : w === "medium" ? "medium" : w === "large" || w === "big" || w === "jumbo" ? "large" : null;

function unitKey(u: string): string {
  return u.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

/** Whether a word is a unit this parser knows ("tbsp", "lbs.", "pouch"). */
export function isUnit(word: string): boolean {
  return unitKey(word) in UNITS;
}

/** Parses "1", "1.5", "1/2", "1 1/2" (after unicode normalisation). */
function parseNumber(s: string): number | null {
  const t = s.trim();
  let m = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (m) return +m[1] + +m[2] / +m[3];
  m = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return +m[2] ? +m[1] / +m[2] : null;
  m = t.match(/^\d+(?:\.\d+)?$/);
  if (m) return parseFloat(t);
  return null;
}

function normalizeAmount(a: string): string {
  let s = a;
  for (const [k, v] of Object.entries(UNICODE_FRACTIONS)) s = s.split(k).join(v);
  return s.replace(/\s+/g, " ").trim();
}

const PACKAGE_RE = /(\d+(?:\.\d+)?)\s*(oz|ounces?|g|grams?|kg|ml|l|liters?|lbs?)\.?(?=[\s)]|$)/i;

function packageFrom(text: string): { amount: number; kind: "mass" | "volume" } | null {
  const m = text.match(PACKAGE_RE);
  if (!m) return null;
  const def = UNITS[unitKey(m[2])];
  if (!def || !def.perUnit || (def.kind !== "mass" && def.kind !== "volume")) return null;
  return { amount: parseFloat(m[1]) * def.perUnit, kind: def.kind };
}

export function parseQuantity(amountIn: string | null | undefined, unitIn: string | null | undefined, nameIn: string): ParsedQuantity {
  const flags: string[] = [];
  let name = (nameIn || "").replace(/\s+/g, " ").trim();
  let amount = normalizeAmount(amountIn ?? "");
  let unitRaw = (unitIn ?? "").trim();
  let size: ParsedQuantity["size"] = null;
  let packageAmount: number | null = null;
  let packageKind: ParsedQuantity["packageKind"] = null;

  // Words split across spans: amount "2 to", name "matoes" -> "2", "tomatoes".
  const split = amount.match(/^(.*\d)\s+to$/i);
  if (split && /^[a-z]/.test(name)) {
    amount = split[1];
    name = `to${name}`;
    flags.push("split-word");
  }

  // Size words that landed in the unit field ("medium", "small").
  if (SIZE_WORDS.has(unitKey(unitRaw))) {
    size = asSize(unitKey(unitRaw));
    unitRaw = "";
  }

  // Amount with an attached unit and no unit span ("68g", "3 oz.").
  if (!unitRaw) {
    const m = amount.match(/^([\d\s./]+?)\s*([a-zA-Z][a-zA-Z.]*)$/);
    if (m && UNITS[unitKey(m[2])]) {
      amount = m[1].trim();
      unitRaw = m[2];
      flags.push("unit-in-amount");
    }
  }

  // Package size inside the amount: "1 20" + oz (from "1 (20 oz) can").
  const pk = amount.match(/^(\d+)\s+(\d{2,})$/);
  if (pk && UNITS[unitKey(unitRaw)]?.kind === "mass") {
    const def = UNITS[unitKey(unitRaw)];
    packageAmount = +pk[2] * def.perUnit!;
    packageKind = "mass";
    amount = pk[1];
    unitRaw = "can";
    flags.push("package");
  }

  // Malformed fractions: "1 /4" -> "1/4", "1/ 1/4" -> "1 1/4".
  if (/^\d+\s+\/\s*\d+$/.test(amount)) { amount = amount.replace(/\s+\/\s*/, "/"); flags.push("malformed-amount"); }
  if (/^\d+\/\s+\d+\/\d+$/.test(amount)) { amount = amount.replace(/^(\d+)\/\s+/, "$1 "); flags.push("malformed-amount"); }

  // Ranges: "2-3", "2 - 3", "2 to 3", "1-" (dangling).
  let low: number | null = null;
  let high: number | null = null;
  const range = amount.match(/^(.+?)\s*(?:-|–|to|or)\s*(.*)$/i);
  if (range && parseNumber(range[1]) !== null) {
    low = parseNumber(range[1]);
    high = range[2] ? parseNumber(range[2]) : null;
    if (high === null) {
      high = low;
      flags.push("malformed-amount");
    } else flags.push("range");
  } else {
    low = high = amount ? parseNumber(amount) : null;
    if (amount && low === null) flags.push("unparsed-amount");
  }
  let value = low !== null && high !== null ? (low + high) / 2 : null;

  // Quantity embedded in the name: "14 oz. can condensed milk", "45g pack Knorr …",
  // "6 ounces salmon steaks" (with no amount span).
  const lead = name.match(/^(\d+(?:\.\d+)?)\s*(oz|ounces?|g|grams?|kg|ml|lbs?|pounds?)\.?\s+(.*)$/i);
  if (lead) {
    const def = UNITS[unitKey(lead[2])];
    const rest = lead[3];
    const isContainer = /^(can|cans|pack|packs|pouch|bottle|box|jar|sachet)\b/i.test(rest);
    if (def?.perUnit && (def.kind === "mass" || def.kind === "volume")) {
      if (isContainer || value !== null) {
        packageAmount = parseFloat(lead[1]) * def.perUnit;
        packageKind = def.kind;
        flags.push("package");
        if (!unitRaw) unitRaw = isContainer ? rest.split(" ")[0] : "pack";
        name = isContainer ? rest.replace(/^\S+\s*/, "") : rest;
        if (value === null) value = low = high = 1;
      } else {
        value = low = high = parseFloat(lead[1]);
        unitRaw = lead[2];
        name = rest;
        flags.push("quantity-in-name");
      }
    }
  } else if (/\s(\d+(?:\.\d+)?)\s*(oz|ounces?|g|grams?|ml)\.?$/i.test(name) && /\bcans?\b|^can$/i.test(`${unitRaw} ${name}`)) {
    // "1 can diced tomatoes 14 oz": package size written after the name.
    const t = name.match(/\s(\d+(?:\.\d+)?)\s*(oz|ounces?|g|grams?|ml)\.?$/i)!;
    const pkg = packageFrom(`${t[1]} ${t[2]}`);
    if (pkg) { packageAmount = pkg.amount; packageKind = pkg.kind; flags.push("package"); name = name.slice(0, t.index).trim(); }
  } else {
    const inner = name.match(/\(([^)]*\d[^)]*)\)/);
    const pkg = inner ? packageFrom(inner[1]) : null;
    if (pkg) {
      packageAmount = pkg.amount;
      packageKind = pkg.kind;
      flags.push("package");
    }
  }

  // Size word at the start of the name ("small tomato").
  const sizeLead = name.match(/^(small|medium|large|big|jumbo)\s+(.*)$/i);
  if (sizeLead) {
    size ??= asSize(sizeLead[1].toLowerCase());
  }

  // "To taste" lines and amount-less pinch/dash.
  if (/\bto taste\b/i.test(name) || /\bto taste\b/i.test(amount)) {
    return { value: null, low: null, high: null, unit: "to-taste", kind: "vague", perUnit: null, size, packageAmount, packageKind, name, flags: [...flags, "to-taste"] };
  }

  const def = unitRaw ? UNITS[unitKey(unitRaw)] : undefined;
  if (unitRaw && !def) flags.push(`unknown-unit:${unitKey(unitRaw)}`);
  if (def && unitKey(unitRaw).startsWith("o") && def.kind === "mass") flags.push("oz-as-mass");

  return {
    value, low, high,
    unit: def ? def.unit : null,
    kind: def ? def.kind : value !== null ? "count" : "none",
    perUnit: def ? def.perUnit : null,
    size, packageAmount, packageKind, name, flags,
  };
}
