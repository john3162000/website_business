export type LineClass = "FOOD" | "TO_TASTE" | "WATER" | "HEADER" | "UNIT_ONLY" | "EQUIPMENT";

export interface Alias {
  lineClass: LineClass;
  slugs: string[];
  size: "small" | "medium" | "large" | null;
  /** e.g. "unit:thumb", "package:8 oz can" */
  note: string | null;
}

export interface Canonical {
  label: string;
  fnriCode: string | null;
  daName: string | null;
  dietClass: string | null;
  gPerCup: number | null;
  gEach: number | null;
  gEachSmall: number | null;
  gEachLarge: number | null;
  gClove: number | null;
  gHead: number | null;
  gThumb: number | null;
  gBunch: number | null;
  gStalk: number | null;
  gSlice: number | null;
  /** Edible % of the as-purchased weight (mass and count lines only). */
  epPct: number | null;
  role: "normal" | "frying_oil_candidate" | "removed_aromatic" | "water" | "garnish_typical" | string;
  nutrScale: number | null;
  cookedPerRaw: number | null;
  confidence: string | null;
}
