import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanText, decodeEntities, dishKey, instructionTexts, isoMinutes, jsonLdImage, splitIngredientLine } from "./ingredient-line.ts";

const plain = (o: unknown) => JSON.parse(JSON.stringify(o));

test("splitIngredientLine reads amount, unit and name", () => {
  assert.deepEqual(plain(splitIngredientLine("2 tbsp fish sauce")), { rawText: "2 tbsp fish sauce", amount: "2", unit: "tbsp", name: "fish sauce" });
  assert.deepEqual(plain(splitIngredientLine("1 1/2 cups coconut milk")), { rawText: "1 1/2 cups coconut milk", amount: "1 1/2", unit: "cups", name: "coconut milk" });
  assert.deepEqual(plain(splitIngredientLine("½ cup vinegar")), { rawText: "½ cup vinegar", amount: "½", unit: "cup", name: "vinegar" });
  assert.deepEqual(plain(splitIngredientLine("2-3 pieces siling haba")), { rawText: "2-3 pieces siling haba", amount: "2-3", unit: "pieces", name: "siling haba" });
  assert.deepEqual(plain(splitIngredientLine("1 kilo pork belly, cut into cubes")), { rawText: "1 kilo pork belly, cut into cubes", amount: "1", unit: "kilo", name: "pork belly, cut into cubes" });
});

test("splitIngredientLine keeps count-only and amount-less lines readable", () => {
  assert.deepEqual(plain(splitIngredientLine("3 eggs")), { rawText: "3 eggs", amount: "3", name: "eggs" });
  assert.deepEqual(plain(splitIngredientLine("salt and pepper to taste")), { rawText: "salt and pepper to taste", name: "salt and pepper to taste" });
  assert.deepEqual(plain(splitIngredientLine("▢ 1 whole chicken")), { rawText: "1 whole chicken", amount: "1", name: "whole chicken" });
  // The package size stays in the name for parseQuantity.
  assert.deepEqual(plain(splitIngredientLine("1 (14 oz) can coconut milk")), { rawText: "1 (14 oz) can coconut milk", amount: "1", unit: "can", name: "(14 oz) coconut milk" });
  assert.equal(splitIngredientLine("1 cup of rice").name, "rice");
  assert.deepEqual(plain(splitIngredientLine("250g ground pork")), { rawText: "250g ground pork", amount: "250", unit: "g", name: "ground pork" });
  // "to" starts a range only when a number follows.
  assert.deepEqual(plain(splitIngredientLine("2 tomatoes, sliced")), { rawText: "2 tomatoes, sliced", amount: "2", name: "tomatoes, sliced" });
  assert.equal(splitIngredientLine("2 to 3 cups rice").amount, "2 to 3");
});

test("cleanText fixes broken escapes, zero-width characters and '1 & ½'", () => {
  assert.equal(cleanText("1 u0026 ½ cups\u200b water"), "1 ½ cups water");
  assert.equal(cleanText("1 and 1/2 cup sugar"), "1 1/2 cup sugar");
  assert.equal(cleanText("salt &amp; pepper"), "salt & pepper");
  assert.deepEqual(plain(splitIngredientLine("1 & ½ cup any chocolate")), { rawText: "1 ½ cup any chocolate", amount: "1 ½", unit: "cup", name: "any chocolate" });
});

test("decodeEntities handles the entities JSON-LD carries", () => {
  assert.equal(decodeEntities("Mama&#8217;s &amp; &frac12; cup"), "Mama’s & ½ cup");
});

test("instructionTexts walks strings, HowToStep lists and sections", () => {
  assert.deepEqual(instructionTexts("Boil the pork.<br>Deep fry until golden."), ["Boil the pork.", "Deep fry until golden."]);
  assert.deepEqual(
    instructionTexts([{ "@type": "HowToSection", name: "Marinade", itemListElement: [{ "@type": "HowToStep", text: "Marinate overnight." }] }, { "@type": "HowToStep", text: "Grill." }]),
    ["Marinate overnight.", "Grill."],
  );
});

test("isoMinutes and jsonLdImage", () => {
  assert.equal(isoMinutes("PT1H30M"), 90);
  assert.equal(isoMinutes("PT45M"), 45);
  assert.equal(isoMinutes("P0DT0H0M"), null);
  assert.equal(isoMinutes(undefined), null);
  assert.equal(jsonLdImage(["https://a/x.jpg", "https://a/y.jpg"]), "https://a/x.jpg");
  assert.equal(jsonLdImage({ "@type": "ImageObject", url: "https://a/z.jpg" }), "https://a/z.jpg");
  assert.equal(jsonLdImage(null), undefined);
});

test("dishKey matches the same dish across sites", () => {
  assert.equal(dishKey("Chicken Adobo Recipe"), dishKey("Easy Filipino Chicken Adobo"));
  assert.equal(dishKey("Sinigang na Baboy Recipe"), dishKey("Baboy Sinigang"));
  assert.equal(dishKey("Leche Flan (Filipino Style)"), dishKey("The Best Leche Flan"));
  assert.equal(dishKey("Crème Brûlée"), "brulee creme");
  assert.notEqual(dishKey("Chicken Adobo"), dishKey("Pork Adobo"));
});
