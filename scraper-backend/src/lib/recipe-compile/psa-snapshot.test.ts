import { test } from "node:test";
import assert from "node:assert/strict";
import { compileRecipe } from "./compile.ts";
import { psaSnapshot } from "./psa-snapshot.ts";
import { testContext } from "./test-context.ts";

const row = (commodity: string, region: string, price: number, month: string) => ({ commodity, region, unit: "kg", price, period: new Date(`${month}-01T00:00:00Z`) });

test("PSA snapshot: Metro Manila first, the national average only where NCR has no price", () => {
  const s = psaSnapshot([
    row("FRESH SHELLS, TAHONG, 1 KG", "NCR", 120, "2026-08"), row("FRESH SHELLS, TAHONG, 1 KG", "PH", 90, "2026-09"),
    row("MALUNGGAY, 1 KG", "PH", 70, "2026-09"),
  ], "2026-10-01");
  assert.equal(s.get("FRESH SHELLS, TAHONG, 1 KG")!.price, 120);
  assert.equal(s.get("FRESH SHELLS, TAHONG, 1 KG")!.national, undefined);
  assert.equal(s.get("MALUNGGAY, 1 KG")!.price, 70);
  assert.equal(s.get("MALUNGGAY, 1 KG")!.national, true);
});

test("a national PSA price is labelled as such on the line", () => {
  const ctx = testContext();
  const psa = psaSnapshot([row("MALUNGGAY, 1 KG", "PH", 70, "2026-09")], "2026-10-01");
  const r = compileRecipe({ id: 90, title: "Tinola", servings: 4, ingredients: [{ amount: "100", unit: "g", name: "malunggay leaves" }] }, { ...ctx, psa });
  assert.equal(r.lines[0].slug, "malunggay");
  assert.equal(r.lines[0].priceSource, "PSA PH avg Sep 2026");
  assert.ok(Math.abs(r.lines[0].cost! - (70 / 1000) * r.lines[0].gAP!) < 1e-9);
});
