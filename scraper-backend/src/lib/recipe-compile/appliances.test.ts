import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAppliances } from "./appliances.ts";

test("detectAppliances reads the title and steps", () => {
  assert.deepEqual(detectAppliances("Baked Macaroni", ["Preheat oven to 350°F.", "Bake for 20 minutes."]), ["oven"]);
  assert.deepEqual(detectAppliances("Air Fryer Lechon Kawali", ["Cook in the air fryer at 400°F."]), ["air_fryer"]);
  assert.deepEqual(detectAppliances("Chicken Inasal", ["Grill the chicken over charcoal."]), ["grill"]);
  assert.deepEqual(detectAppliances("Puto", ["Steam for 15 minutes."]), ["steamer"]);
  assert.deepEqual(detectAppliances("Beef Pares (Instant Pot)", ["Pressure cook for 35 minutes."]), ["pressure_cooker"]);
  assert.deepEqual(detectAppliances("Mango Shake", ["Put everything in a blender and blend."]), ["blender"]);
});

test("ordinary stove cooking needs nothing special", () => {
  assert.deepEqual(detectAppliances("Chicken Adobo", ["Combine chicken, soy sauce and garlic.", "Simmer for 30 minutes.", "Serve with steamed rice."]), []);
  assert.deepEqual(detectAppliances("Pancake", ["Mix flour and baking powder.", "Cook on a pan."]), []);
});

test("several appliances are all listed, in a fixed order", () => {
  assert.deepEqual(detectAppliances("Leche Flan", ["Steam for 30 minutes, or bake in a water bath in the oven."]), ["oven", "steamer"]);
});
