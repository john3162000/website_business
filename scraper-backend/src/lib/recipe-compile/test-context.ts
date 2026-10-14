// Builds a CompileContext from the committed source snapshots (data/source/*.tsv),
// so tests use real FNRI values and DA prices without a database.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALIASES, CANONICALS } from "./catalog.generated.ts";
import type { CompileContext, DaPrice, FnriFood } from "./compile.ts";

const root = join(import.meta.dirname, "../../..");
const rows = (p: string) => readFileSync(join(root, p), "utf8").split("\n").filter((l) => l.trim()).map((l) => l.split("\t"));
const n = (v: string | undefined) => (v === undefined || v === "" || isNaN(parseFloat(v)) ? null : parseFloat(v));

export function testContext(): CompileContext {
  const fnri = new Map<string, FnriFood>();
  for (const r of rows("data/source/fnri.tsv")) {
    fnri.set(r[0], { calories: n(r[4]), protein: n(r[5]), fat: n(r[6]), carbohydrates: n(r[7]), sodium: n(r[8]) });
  }
  const da = new Map<string, DaPrice>();
  for (const r of rows("data/source/da.tsv")) {
    const label = r[3] ?? "";
    const per = label.startsWith("₱/pc") ? "piece" : label.startsWith("₱/bottle") ? "bottle" : "kg";
    da.set(r[0], { price: n(r[2]), unit: { per, pieceGrams: n(r[4]), bottleMl: n(r[5]) } });
  }
  return { aliases: ALIASES, canonicals: CANONICALS, fnri, da };
}
