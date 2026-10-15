import { test } from "node:test";
import assert from "node:assert/strict";
import { compileRecipe, type CompileContext } from "./compile.ts";
import { dishPriceChange } from "./price-movers.ts";
import { testContext } from "./test-context.ts";

const ctx = testContext();
const ing = (amount: string | null, unit: string | null, name: string) => ({ amount, unit, name });
const SINIGANG = {
  id: 30, title: "Sinigang na Baboy", servings: 4,
  ingredients: [ing("2", "lbs", "pork belly"), ing("3", "pieces", "tomato"), ing("1", "piece", "onion"), ing("6", "cloves", "garlic"), ing("8", "cups", "water")],
};
/** The same context with some DA prices changed (or removed, with null). */
const withPrices = (changes: Record<string, number | null>): CompileContext => {
  const da = new Map(ctx.da);
  for (const [name, price] of Object.entries(changes)) {
    if (price === null) da.delete(name);
    else da.set(name, { ...da.get(name)!, price });
  }
  return { ...ctx, da };
};

test("price movers: a 20% rise in pork belly moves the dish and is the top driver", () => {
  const pork = ctx.da.get("Pork Belly (Liempo), Local")!.price!;
  const then = compileRecipe(SINIGANG, ctx);
  const now = compileRecipe(SINIGANG, withPrices({ "Pork Belly (Liempo), Local": pork * 1.2 }));
  const ch = dishPriceChange(now, then)!;
  assert.ok(ch, "comparable");
  assert.ok(ch.change > 0.1 && ch.change < 0.2, `dish +${(ch.change * 100).toFixed(1)}%`);
  assert.equal(ch.drivers[0].label, ctx.canonicals.pork_belly.label);
  assert.ok(Math.abs(ch.drivers[0].change! - 0.2) < 1e-9);
  assert.equal(ch.drivers.length, 1, "unchanged ingredients are not drivers");
});

test("price movers: no comparison when the main ingredient had no price a month ago", () => {
  const then = compileRecipe(SINIGANG, withPrices({ "Pork Belly (Liempo), Local": null }));
  const now = compileRecipe(SINIGANG, ctx);
  assert.equal(dishPriceChange(now, then), null);
});

test("price movers: unchanged prices give a 0% change", () => {
  const c = compileRecipe(SINIGANG, ctx);
  const ch = dishPriceChange(c, c)!;
  assert.equal(ch.change, 0);
  assert.deepEqual(ch.drivers, []);
});
