import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_LINES, parseDish } from "./dish-input.ts";

test("a personal dish is checked and trimmed before it is priced", () => {
  const d = parseDish({ title: "  Adobo  ", servings: "4", ingredients: [{ name: " pork belly ", amount: "1", unit: "kg", slug: "pork_belly" }] });
  assert.deepEqual(d, { title: "Adobo", servings: 4, ingredients: [{ name: "pork belly", amount: "1", unit: "kg", slug: "pork_belly" }], instructions: [] });
});

test("anything that isn't a dish is refused", () => {
  for (const bad of [null, "x", 5, [], {}, { ingredients: "pork" }, { ingredients: Array(MAX_LINES + 1).fill({ name: "salt" }) }]) {
    assert.equal(parseDish(bad), null, JSON.stringify(bad)?.slice(0, 40));
  }
});

test("odd field types are dropped, long text is cut and servings stay 1–50", () => {
  const d = parseDish({
    title: { x: 1 },
    servings: true,
    ingredients: [null, 7, { name: 5 }, { name: "x".repeat(500), amount: 3, unit: ["kg"], slug: "../etc/passwd" }],
    instructions: ["a".repeat(900), 4, ""],
  })!;
  assert.equal(d.title, "My dish");
  assert.equal(d.servings, null);
  assert.equal(d.ingredients.length, 1);
  assert.equal(d.ingredients[0].name.length, 120);
  assert.equal(d.ingredients[0].amount, null);
  assert.equal(d.ingredients[0].unit, null);
  assert.equal(d.ingredients[0].slug, null);
  assert.deepEqual(d.instructions, ["a".repeat(500)]);
  assert.equal(parseDish({ servings: 500, ingredients: [] })!.servings, null);
  assert.equal(parseDish({ servings: 0, ingredients: [] })!.servings, null);
});
