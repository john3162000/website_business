import { test } from "node:test";
import assert from "node:assert/strict";
import { compileRecipe, methodNotes, type RecipeInput } from "./compile.ts";
import { testContext } from "./test-context.ts";

const ctx = testContext();
const ing = (amount: string | null, unit: string | null, name: string, group: string | null = null) => ({ amount, unit, name, group });

// Recipes whose steps decide frying, the marinade's fate, or the appliances.
const RECIPES: RecipeInput[] = [
  { id: 1, title: "Lumpia Recipe", servings: 6,
    ingredients: [ing("50", "pieces", "lumpia wrapper"), ing("3", "cups", "cooking oil"), ing("1 1/2", "lbs", "ground pork"), ing("2", "pieces", "onion")],
    instructions: ["Combine the filling.", "Wrap.", "Heat oil in a cooking pot. Deep fry lumpia in medium heat until it floats.", "Let excess oil drip."] },
  { id: 2, title: "Pork Chops", servings: 4,
    ingredients: [ing("4", "pieces", "pork chop"), ing("2/3", "cup", "cooking oil"), ing("1/4", "cup", "soy sauce", "Marinade"), ing("2", "tbsp", "calamansi juice", "Marinade")],
    instructions: ["Marinate the pork overnight.", "Discard the marinade.", "Pan-fry the pork chops both sides until brown."] },
  { id: 3, title: "Chicken Inasal", servings: 4,
    ingredients: [ing("2", "lbs", "chicken thigh"), ing("1/2", "cup", "vinegar", "Marinade"), ing("3", "tbsp", "butter")],
    instructions: ["Marinate the chicken.", "Grill over charcoal, basting with butter.", "Serve with steamed white rice."] },
  { id: 4, title: "Pork Adobo", servings: 4,
    ingredients: [ing("2", "lbs", "pork belly"), ing("1/2", "cup", "soy sauce", "Marinade"), ing("3", "tbsp", "cooking oil")],
    instructions: ["Marinate the pork in soy sauce.", "Saute the garlic.", "Pour-in the marinade and simmer for 40 minutes."] },
  { id: 5, title: "Baked Salmon", servings: 2,
    ingredients: [ing("2", "pieces", "salmon fillet"), ing("2", "tbsp", "butter")],
    instructions: ["Preheat the oven to 375F.", "Bake for 15 minutes. You can use an air fryer too."] },
];

test("method notes keep the engine's results: frying, marinade, appliances, cost and nutrition", () => {
  for (const r of RECIPES) {
    const full = compileRecipe(r, ctx);
    const notes = methodNotes(r.instructions ?? []);
    const slim = compileRecipe({ ...r, instructions: notes ? [notes] : [] }, ctx);
    assert.deepEqual(slim.method, full.method, r.title);
    assert.deepEqual(slim.appliances, full.appliances, r.title);
    assert.deepEqual(slim.perServing, full.perServing, r.title);
    assert.equal(slim.costPerServing, full.costPerServing, r.title);
  }
});

test("method notes are short phrases, not the author's steps", () => {
  const notes = methodNotes(RECIPES[1].instructions!);
  assert.match(notes, /discard the marinade/);
  assert.match(notes, /pan-fry/);
  assert.doesNotMatch(notes, /overnight|both sides until brown/);
  assert.equal(methodNotes(["Combine everything in a bowl.", "Chill and serve."]), "");
  assert.doesNotMatch(methodNotes(RECIPES[2].instructions!), /steamed/); // a side of rice isn't steaming
  for (const r of RECIPES) {
    const notes = methodNotes(r.instructions ?? []).split(". ");
    for (const n of notes) assert.ok(n.split(" ").length <= 10, `${r.title}: "${n}"`);
  }
});
