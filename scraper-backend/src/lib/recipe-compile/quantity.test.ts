// Run: node --experimental-strip-types --test src/lib/recipe-compile/*.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQuantity } from "./quantity.ts";

const q = (a: string | null, u: string | null, n: string) => parseQuantity(a, u, n);
const close = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-3, `${a} != ${b}`);

test("integers, decimals, fractions, mixed, unicode", () => {
  close(q("3", "cups", "cooking oil").value, 3);
  close(q("1.5", "tsp", "salt").value, 1.5);
  close(q("1/2", "cup", "parsley").value, 0.5);
  close(q("1 1/2", "lbs", "ground pork").value, 1.5);
  close(q("½", "tsp", "black pepper").value, 0.5);
  close(q("1½", "cups", "water").value, 1.5);
  close(q("¾", "cup", "white vinegar").value, 0.75);
});

test("units are US customary and canonical", () => {
  const cup = q("1", "cup", "water");
  assert.equal(cup.unit, "ml"); assert.equal(cup.kind, "volume"); close(cup.perUnit, 236.588);
  const tbsp = q("2", "tbsp.", "soy sauce");
  close(tbsp.perUnit, 14.787);
  const lb = q("2", "lbs.", "pork belly");
  assert.equal(lb.kind, "mass"); close(lb.perUnit, 453.592);
  assert.equal(q("2", "pieces", "onion").unit, "piece");
  assert.equal(q("6", "cloves", "garlic").unit, "clove");
  assert.equal(q("2", "thumbs", "ginger").unit, "thumb");
  assert.equal(q("1", "bunch", "kangkong").unit, "bunch");
});

test("ranges use the midpoint", () => {
  const r = q("2 to 3", "tbsp", "fish sauce");
  close(r.value, 2.5); close(r.low, 2); close(r.high, 3); assert.ok(r.flags.includes("range"));
  close(q("8-10", "pieces", "shrimps").value, 9);
  close(q("2 - 3", "pieces", "tomato").value, 2.5);
});

test("malformed amounts from the data profile", () => {
  close(q("1 /4", "teaspoon", "ground black pepper").value, 0.25);
  close(q("1/ 1/4", "cup", "all-purpose flour").value, 1.25);
  const dangling = q("1-", "piece", "green bell pepper");
  close(dangling.value, 1); assert.ok(dangling.flags.includes("malformed-amount"));
  const g = q("68g", null, "Knorr Cream of Mushroom Soup");
  close(g.value, 68); assert.equal(g.unit, "g");
  const split = q("2 to", null, "matoes");
  close(split.value, 2); assert.equal(split.name, "tomatoes");
});

test("size word in the unit field", () => {
  const m = q("1", "medium", "onion");
  assert.equal(m.size, "medium"); assert.equal(m.kind, "count");
});

test("package sizes", () => {
  const can = q("1 20", "oz.", "can crushed pineapple");
  close(can.value, 1); assert.equal(can.unit, "can"); close(can.packageAmount, 20 * 28.3495);
  const inName = q("1", null, "14 oz. can condensed milk");
  close(inName.packageAmount, 14 * 28.3495); assert.equal(inName.name, "condensed milk"); assert.equal(inName.unit, "can");
  const knorr = q("1", null, "45g pack Knorr Ginataang Gulay Recipe Mix");
  close(knorr.packageAmount, 45); assert.equal(knorr.name, "Knorr Ginataang Gulay Recipe Mix");
  const paren = q("1", "can", "pineapple chunks (20 oz)");
  close(paren.packageAmount, 20 * 28.3495);
});

test("quantity embedded in the name with no amount", () => {
  const s = q(null, null, "6 ounces salmon steaks");
  close(s.value, 6); assert.equal(s.kind, "mass"); assert.equal(s.name, "salmon steaks");
});

test("to taste and empty amounts", () => {
  const t = q(null, null, "Salt and pepper to taste");
  assert.equal(t.unit, "to-taste"); assert.equal(t.value, null);
  const none = q(null, null, "cooking oil");
  assert.equal(none.value, null); assert.equal(none.kind, "none");
  const pinch = q("1", "pinch", "salt");
  assert.equal(pinch.kind, "vague");
});
