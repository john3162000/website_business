import { test } from "node:test";
import assert from "node:assert/strict";
import { compileRecipe } from "./compile.ts";
import { testContext } from "./test-context.ts";

const ctx = testContext();
const ing = (amount: string | null, unit: string | null, name: string) => ({ amount, unit, name });

// Real recipe #1 on the site (from /api/recipes), serves 6.
const LUMPIA = {
  id: 1, title: "Lumpia Recipe", servings: 6,
  ingredients: [
    ing("50", "pieces", "lumpia wrapper"), ing("3", "cups", "cooking oil"), ing("1 1/2", "lbs", "ground pork"),
    ing("2", "pieces", "onion"), ing("2", "pieces", "carrots"), ing("1 1/2", "tsp", "garlic powder"),
    ing("1/2", "tsp", "black pepper"), ing("1/2", "cup", "parsley"), ing("1 1/2", "tsp", "salt"),
    ing("1", "tbsp", "sesame oil"), ing("2", null, "eggs"),
  ],
  instructions: ["Combine the filling.", "Wrap.", "Heat oil in a cooking pot. Deep fry lumpia in medium heat until it floats.", "Let excess oil drip."],
};

test("lumpia: deep-fried, oil mostly not eaten, ≈70–130 kcal per piece", () => {
  const r = compileRecipe(LUMPIA, ctx);
  for (const l of r.lines) console.log(`  ${l.status.padEnd(12)} ${l.text.padEnd(28)} ${String(l.slug).padEnd(22)} AP ${l.gAP?.toFixed(0) ?? "-"} g  eaten ${l.gEaten?.toFixed(0) ?? "-"} g  ${l.nutrients ? l.nutrients.kcal.toFixed(0) + " kcal" : ""}  ${l.cost != null ? "₱" + l.cost.toFixed(2) : ""}  ${l.reason ?? ""}`);
  console.log("  per serving", r.perServing, "cost", r.costPerServing, "cov", r.nutritionCoverage, r.costCoverage, r.method);
  assert.equal(r.method.frying, "deep");
  const oil = r.lines.find((l) => l.slug === "oil_cooking")!;
  assert.ok(oil.gEaten! < 0.4 * oil.gAP!, "most frying oil stays in the pot");
  const perPieceLow = (r.perServing.kcalLow * 6) / 50, perPieceHigh = (r.perServing.kcalHigh * 6) / 50;
  assert.ok(perPieceLow > 55 && perPieceHigh < 140, `per piece ${perPieceLow.toFixed(0)}–${perPieceHigh.toFixed(0)} kcal`);
  assert.ok(r.perServing.kcalLow < r.perServing.kcalHigh);
});

test("lechon kawali: fatty pork renders fat, low oil uptake", () => {
  const r = compileRecipe({
    id: 2, title: "Lechon Kawali", servings: 4,
    ingredients: [ing("2", "lbs", "pork belly"), ing("3", "cups", "cooking oil"), ing("2", "tablespoons", "salt"),
      ing("1", "tablespoon", "whole peppercorn"), ing("5", "pieces", "dried bay leaves"), ing("6", "cups", "water")],
    instructions: ["Boil the pork belly with salt, peppercorns and bay leaves.", "Drain and dry.", "Deep fry until golden and crispy."],
  }, ctx);
  console.log("  lechon kawali per serving", r.perServing, "cost", r.costPerServing);
  assert.equal(r.method.frying, "deep");
  assert.equal(r.lines.find((l) => l.slug === "bay_leaf")?.gEaten, 0);
  assert.equal(r.lines.find((l) => l.status === "water")?.gEaten, 0);
  assert.ok(r.perServing.kcal < 1500, "not counting the whole 3 cups of oil");
});

test("adobo: saute oil is eaten, no frying", () => {
  const r = compileRecipe({
    id: 3, title: "Chicken Adobo", servings: 4,
    ingredients: [ing("2", "lbs", "chicken"), ing("1/2", "cup", "soy sauce"), ing("1/2", "cup", "white vinegar"),
      ing("1", "head", "garlic"), ing("3", "pieces", "dried bay leaves"), ing("1", "teaspoon", "whole peppercorn"),
      ing("3", "tablespoons", "cooking oil"), ing("1", "cup", "water")],
  }, ctx);
  console.log("  adobo per serving", r.perServing, "cost", r.costPerServing);
  assert.equal(r.method.frying, null);
  const oil = r.lines.find((l) => l.slug === "oil_cooking")!;
  assert.equal(oil.gEaten, oil.gAP);
  assert.equal(r.perServing.kcalLow, r.perServing.kcalHigh);
});

test("to-taste, water and headers are not counted; missing servings assumed 4", () => {
  const r = compileRecipe({
    id: 4, title: "Test", servings: null,
    ingredients: [ing(null, null, "salt and pepper to taste"), ing("2", "cups", "water"), ing(null, null, "Marinade ingredients:"), ing("1", "lb", "pork belly")],
  }, ctx);
  assert.equal(r.servingsAssumed, true);
  assert.deepEqual(r.lines.map((l) => l.status), ["to-taste", "water", "skipped", "ok"]);
});
