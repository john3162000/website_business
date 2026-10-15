import { test } from "node:test";
import assert from "node:assert/strict";
import { alignGroups, parseStructured, parseYield, yieldCount } from "./recipe-structured.ts";

// Trimmed from a real Panlasang Pinoy page: Yoast graph JSON-LD plus a WPRM card with two groups.
const PAGE = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"x"},
{"@type":"Recipe","name":"Sticky Crispy Chicken","recipeYield":["4","4 people"],"recipeCategory":["Main Course"],"recipeCuisine":["Chinese"],
"nutrition":{"@type":"NutritionInformation","calories":"1170 kcal","carbohydrateContent":"85 g","proteinContent":"51 g","fatContent":"70 g","sodiumContent":"2,233 mg","fiberContent":"4 g","servingSize":"1 serving"}}]}</script>
</head><body>
<div class="wprm-recipe-ingredient-group">
  <ul><li class="wprm-recipe-ingredient">▢ 2 lbs chicken thighs</li><li class="wprm-recipe-ingredient"> </li></ul>
</div>
<div class="wprm-recipe-ingredient-group"><h4 class="wprm-recipe-group-name">Sauce ingredients:</h4>
  <ul><li class="wprm-recipe-ingredient">▢ 3 tablespoons soy sauce</li><li class="wprm-recipe-ingredient">▢ 2 tablespoons honey</li></ul>
</div>
</body></html>`;

test("parseStructured: JSON-LD in a Yoast graph and ingredient groups", () => {
  const s = parseStructured(PAGE);
  assert.equal(s.yieldServings, 4);
  assert.equal(s.yieldText, "4 people");
  assert.deepEqual(s.courses, ["Main Course"]);
  assert.deepEqual(s.cuisines, ["Chinese"]);
  assert.equal(s.nutrition?.kcal, 1170);
  assert.equal(s.nutrition?.sodium, 2233);
  assert.equal(s.nutrition?.sugar, null);
  // The empty <li> is skipped, as in the recipe scraper.
  assert.deepEqual(s.ingredients, [
    { rawText: "▢ 2 lbs chicken thighs", group: null },
    { rawText: "▢ 3 tablespoons soy sauce", group: "Sauce ingredients:" },
    { rawText: "▢ 2 tablespoons honey", group: "Sauce ingredients:" },
  ]);
});

test("parseStructured: page without a recipe", () => {
  const s = parseStructured("<html><body><h1>What is Broccoli?</h1></body></html>");
  assert.equal(s.nutrition, null);
  assert.equal(s.yieldServings, null);
  assert.deepEqual(s.courses, []);
  assert.deepEqual(s.ingredients, []);
});

test("parseYield: servings only for servings-like units", () => {
  assert.equal(parseYield(["4", "4 people"]).servings, 4);
  assert.equal(parseYield(["8"]).servings, 8);
  assert.equal(parseYield("6-8 servings").servings, 6);
  assert.equal(parseYield(["24", "24 pieces"]).servings, null);
  assert.equal(parseYield(["24", "24 pieces"]).text, "24 pieces");
  assert.deepEqual(parseYield(undefined), { servings: null, text: null });
});

test("yieldCount: the divisor WPRM used, 1 without a yield", () => {
  assert.equal(yieldCount("4 people"), 4);
  assert.equal(yieldCount("24 pieces"), 24);
  assert.equal(yieldCount(null), 1);
});

test("alignGroups: by position when the lines match, else by text", () => {
  const page = parseStructured(PAGE).ingredients;
  assert.deepEqual(
    alignGroups([{ rawText: "2 lbs chicken thighs" }, { rawText: "3 tablespoons soy sauce" }, { rawText: "2 tablespoons honey" }], page),
    [null, "Sauce ingredients:", "Sauce ingredients:"],
  );
  // Stored recipe has a line the page no longer shows, and is missing one.
  assert.deepEqual(
    alignGroups([{ rawText: "▢ 3 tablespoons soy sauce" }, { rawText: "1 tsp sesame oil" }, { rawText: "▢ 2 tablespoons HONEY" }], page),
    ["Sauce ingredients:", null, "Sauce ingredients:"],
  );
});
