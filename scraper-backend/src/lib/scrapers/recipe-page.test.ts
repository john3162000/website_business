import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRecipePage } from "./recipe-page.ts";
import { methodNotes } from "../recipe-compile/compile.ts";

const plain = (o: unknown) => JSON.parse(JSON.stringify(o));

// A food blog without WP Recipe Maker: only the schema.org Recipe JSON-LD.
const LD_ONLY = `<html><head>
<meta property="og:image" content="https://blog.ph/og.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Article","headline":"x"},
{"@type":"Recipe","name":"Pork Binagoongan","image":{"@type":"ImageObject","url":"https://blog.ph/binagoongan.jpg"},
"recipeYield":"4 servings","prepTime":"PT15M","cookTime":"PT1H","recipeCategory":"Main Dish","recipeCuisine":"Filipino",
"recipeIngredient":["1 kilo pork belly, cubed","3 tbsp bagoong alamang","1/2 cup vinegar","1 &frac12; cups water","salt to taste"],
"recipeInstructions":[{"@type":"HowToStep","text":"Boil the pork until tender."},{"@type":"HowToStep","text":"Deep fry the pork until crisp, then add the bagoong."}]}]}
</script></head><body><h1>Pork Binagoongan</h1><p>Long story about the dish.</p></body></html>`;

test("a JSON-LD-only page: title, photo link, yield, times and split ingredient lines", () => {
  const r = parseRecipePage(LD_ONLY, "https://blog.ph/pork-binagoongan/", true)!;
  assert.equal(r.title, "Pork Binagoongan");
  assert.equal(r.imageUrl, "https://blog.ph/binagoongan.jpg");
  assert.equal(r.servings, 4);
  assert.equal(r.prepTime, 15);
  assert.equal(r.cookTime, 60);
  assert.equal(r.course, "Main Dish");
  assert.deepEqual(plain(r.ingredients.slice(0, 4)), [
    { rawText: "1 kilo pork belly, cubed", amount: "1", unit: "kilo", name: "pork belly, cubed" },
    { rawText: "3 tbsp bagoong alamang", amount: "3", unit: "tbsp", name: "bagoong alamang" },
    { rawText: "1/2 cup vinegar", amount: "1/2", unit: "cup", name: "vinegar" },
    { rawText: "1 ½ cups water", amount: "1 ½", unit: "cups", name: "water" },
  ]);
  assert.deepEqual(plain(r.ingredients[4]), { rawText: "salt to taste", name: "salt to taste" });
  // Steps are read only for the method notes the engine uses (deep frying adds absorbed oil).
  assert.match(methodNotes(r.instructions), /deep fr/);
});

// A WP Recipe Maker card (as on Panlasang Pinoy and Kawaling Pinoy).
const WPRM = `<html><body><h1>Post</h1><div class="wprm-recipe">
<div class="wprm-recipe-name">Ginataang Kalabasa</div>
<div class="wprm-recipe-image"><img src="data:image/svg+xml,x" data-lazy-src="https://kp.com/kalabasa.jpg"></div>
<span class="wprm-recipe-servings">5</span>
<div class="wprm-recipe-ingredient-group"><ul>
<li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-amount">2</span> <span class="wprm-recipe-ingredient-unit">cups</span> <span class="wprm-recipe-ingredient-name">squash</span></li>
<li class="wprm-recipe-ingredient"><span class="wprm-recipe-ingredient-amount">1</span> <span class="wprm-recipe-ingredient-unit">cup</span> <span class="wprm-recipe-ingredient-name">coconut milk</span></li>
</ul></div>
<div class="wprm-recipe-instruction-text">Simmer the squash in coconut milk.</div>
</div></body></html>`;

test("a WPRM card uses the card's own amount, unit and name spans", () => {
  const r = parseRecipePage(WPRM, "https://kp.com/ginataang-kalabasa/", true)!;
  assert.equal(r.title, "Ginataang Kalabasa");
  assert.equal(r.imageUrl, "https://kp.com/kalabasa.jpg");
  assert.equal(r.servings, 5);
  assert.deepEqual(r.ingredients.map((i) => [i.amount, i.unit, i.name]), [["2", "cups", "squash"], ["1", "cup", "coconut milk"]]);
  assert.deepEqual(r.instructions, ["Simmer the squash in coconut milk."]);
});

test("articles are skipped for new sources but still read for Panlasang Pinoy", () => {
  const article = `<html><body><h1>10 Best Ulam for Rainy Days</h1><p>...</p></body></html>`;
  assert.equal(parseRecipePage(article, "https://blog.ph/best-ulam/", true), null);
  assert.equal(parseRecipePage(article, "https://panlasangpinoy.com/best-ulam/")?.title, "10 Best Ulam for Rainy Days");
});
