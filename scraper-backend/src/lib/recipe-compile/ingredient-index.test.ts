import { test } from "node:test";
import assert from "node:assert/strict";
import { compileRecipe } from "./compile.ts";
import { ingredientIndex } from "./ingredient-index.ts";
import { testContext } from "./test-context.ts";

const ctx = testContext();
const ing = (amount: string | null, unit: string | null, name: string) => ({ amount, unit, name });
const ADOBO = compileRecipe({ id: 1, title: "Chicken Adobo", servings: 4, ingredients: [
  ing("2", "lbs", "chicken thighs"), ing("6", "cloves", "garlic"), ing("1/2", "cup", "soy sauce"),
  ing("3", "cloves", "garlic"), ing(null, null, "salt to taste"), ing("1", "cup", "water")] }, ctx);
const SINIGANG = compileRecipe({ id: 2, title: "Sinigang na Baboy", servings: 4, ingredients: [
  ing("2", "lbs", "pork belly"), ing("3", "pieces", "tomato"), ing("6", "cloves", "garlic"), ing("8", "cups", "water")] }, ctx);

test("ingredient index: what each recipe needs, without to-taste lines or water", () => {
  const idx = ingredientIndex([ADOBO, SINIGANG]);
  const slugsOf = (id: number) => idx.recipes.find((r) => r.id === id)!.i.map((n) => idx.ingredients[n].slug);
  assert.equal(slugsOf(1).includes("garlic"), true);
  assert.equal(slugsOf(1).includes("salt"), false);
  assert.equal(slugsOf(1).filter((s) => s === "garlic").length, 1, "garlic listed once");
  assert.equal(slugsOf(2).includes("pork_belly"), true);
  // Garlic is in both recipes, so it comes first.
  assert.equal(idx.ingredients[0].slug, "garlic");
  assert.equal(idx.ingredients[0].count, 2);
});

test("ingredient index: a repeated ingredient's costs add up, per serving", () => {
  const idx = ingredientIndex([ADOBO]);
  const r = idx.recipes[0];
  const g = r.i.findIndex((n) => idx.ingredients[n].slug === "garlic");
  const garlicCost = ADOBO.lines.filter((l) => l.slug === "garlic").reduce((s, l) => s + (l.cost ?? 0), 0) / 4;
  assert.ok(Math.abs((r.c[g] ?? 0) - garlicCost) < 0.01);
});
