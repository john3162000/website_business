import { test } from "node:test";
import assert from "node:assert/strict";
import { compileRecipe, sectionOf } from "./compile.ts";
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

// ── Marinades, brines and dredging (ingredient groups) ──
const grouped = (group: string | null, amount: string | null, unit: string | null, name: string) => ({ amount, unit, name, group });
const line = (r: ReturnType<typeof compileRecipe>, slug: string) => r.lines.find((l) => l.slug === slug)!;

test("sectionOf: group headings and line notes", () => {
  assert.equal(sectionOf("Marinade ingredients"), "marinade");
  assert.equal(sectionOf("Brine ingredients:"), "brine");
  assert.equal(sectionOf("Breading ingredients:"), "dredge");
  assert.equal(sectionOf("Batter Ingredients"), null);
  assert.equal(sectionOf("Sauce ingredients"), null);
  assert.equal(sectionOf(null, "1 cup all-purpose flour for dredging"), "dredge");
  assert.equal(sectionOf("Sauce", "3 tbsp soy sauce for the marinade"), "marinade");
});

test("discarded marinade: only ≈20% eaten, cost unchanged, meat untouched", () => {
  const r = compileRecipe({
    id: 10, title: "Chicken Inasal", servings: 4,
    ingredients: [grouped(null, "2", "lbs", "chicken"), grouped("Marinade ingredients", "1/2", "cup", "soy sauce"), grouped("Marinade ingredients", "1/4", "cup", "calamansi juice")],
    instructions: ["Marinate the chicken overnight.", "Remove the chicken and discard the marinade.", "Grill until done."],
  }, ctx);
  const soy = line(r, "soy_sauce");
  assert.equal(soy.group, "Marinade ingredients");
  assert.ok(Math.abs(soy.gEaten! - 0.2 * soy.gAP!) < 1e-9, soy.reason ?? "");
  assert.match(soy.reason!, /discarded/);
  const chicken = line(r, "chicken_whole_cut");
  assert.ok(Math.abs(chicken.gEaten! - chicken.gAP! * (ctx.canonicals.chicken_whole_cut.epPct ?? 100) / 100) < 1e-6);
});

test("marinade poured into the pan is eaten in full", () => {
  const r = compileRecipe({
    id: 11, title: "Pork Adobo", servings: 4,
    ingredients: [grouped(null, "2", "lbs", "pork belly"), grouped("Marinade", "1/2", "cup", "soy sauce")],
    instructions: ["Marinate the pork for 1 hour.", "Brown the pork, then pour-in the marinade and simmer for 45 minutes."],
  }, ctx);
  assert.equal(line(r, "soy_sauce").gEaten, line(r, "soy_sauce").gAP);
});

test("heading written as an ingredient line groups the lines below it", () => {
  const r = compileRecipe({
    id: 12, title: "Fried Chicken", servings: 4,
    ingredients: [ing(null, null, "Marinade ingredients:"), ing("1/2", "cup", "soy sauce"), ing("2", "lbs", "chicken"), ing("3", "cups", "cooking oil")],
    instructions: ["Marinate the chicken.", "Deep fry until golden brown."],
  }, ctx);
  const soy = line(r, "soy_sauce");
  assert.equal(soy.group, "Marinade ingredients");
  assert.ok(Math.abs(soy.gEaten! - 0.3 * soy.gAP!) < 1e-9, soy.reason ?? "");
  assert.equal(r.lines[0].group, null);
});

test("dredging: dry coating ≈30%, egg wash ≈60%; brine salt ≈10%", () => {
  const r = compileRecipe({
    id: 13, title: "Crispy Fried Chicken", servings: 4,
    ingredients: [
      grouped(null, "2", "lbs", "chicken"),
      grouped("Brine ingredients:", "1/4", "cup", "salt"), grouped("Brine ingredients:", "4", "cups", "water"),
      grouped("Breading ingredients:", "1", "cup", "all-purpose flour"), grouped("Breading ingredients:", "2", null, "eggs"),
      grouped(null, "4", "cups", "cooking oil"),
    ],
    instructions: ["Soak the chicken in the brine.", "Dredge in flour, dip in egg.", "Deep fry until golden."],
  }, ctx);
  const flour = line(r, "flour_all_purpose"), egg = line(r, "egg_chicken"), salt = line(r, "salt");
  assert.ok(Math.abs(flour.gEaten! - 0.3 * flour.gAP!) < 1e-9);
  assert.ok(Math.abs(egg.gEaten! - 0.6 * egg.gAP! * (ctx.canonicals.egg_chicken.epPct ?? 100) / 100) < 1e-9);
  assert.ok(Math.abs(salt.gEaten! - 0.1 * salt.gAP!) < 1e-9);
});

test("marinating steps are not mistaken for cooking with the marinade", () => {
  const soyKept = (steps: string[], title = "Pork Ribs") => {
    const r = compileRecipe({
      id: 14, title, servings: 4,
      ingredients: [grouped(null, "2", "lbs", "pork belly"), grouped("Marinade ingredients", "1/2", "cup", "soy sauce")],
      instructions: steps,
    }, ctx);
    const soy = line(r, "soy_sauce");
    return Math.round((soy.gEaten! / soy.gAP!) * 100) / 100;
  };
  assert.equal(soyKept(["Add the marinade ingredients and mix well. Marinate for 30 minutes.", "Fry the marinated pork ribs."], "No-Grill Pork Ribs Barbecue"), 0.3);
  assert.equal(soyKept(["Add the pork to the marinade.", "Fry until brown."]), 0.3);
  assert.equal(soyKept(["Marinate overnight.", "Add-in the reserved marinade and simmer."]), 1);
  assert.equal(soyKept(["Marinate overnight.", "Grill, basting with the marinade."]), 0.5);
  assert.equal(soyKept(["Marinate overnight.", "Cook everything in a pot for an hour."], "Pork Stew"), 1);
});

// ── Catalog gaps (celery, salmon, SM prices, Filipino names) ──
test("celery: ribs weigh like stalks, celery salt is salt", () => {
  const r = compileRecipe({
    id: 20, title: "Chicken Soup", servings: 4,
    ingredients: [ing("4", null, "ribs celery"), ing("2", "ribs", "celery"), ing("1/2", "teaspoon", "celery salt")],
  }, ctx);
  assert.equal(r.lines[0].slug, "celery");
  assert.ok(Math.abs(r.lines[0].gAP! - 4 * ctx.canonicals.celery.gStalk!) < 1e-9);
  assert.ok(Math.abs(r.lines[1].gAP! - 2 * ctx.canonicals.celery.gStalk!) < 1e-9);
  assert.equal(r.lines[2].slug, "salt");
});

test("salmon: Atlantic salmon nutrition, priced; heads and belly resolve", () => {
  const r = compileRecipe({
    id: 21, title: "Salmon Sinigang", servings: 4,
    ingredients: [ing("1", "lb", "salmon fillet"), ing("2", null, "salmon heads"), ing("1/2", "lb", "salmon belly"), ing("1", "lb", "liempo")],
  }, ctx);
  const fillet = line(r, "salmon_fillet");
  // 208 kcal / 100 g (USDA), not carp's ~130
  assert.ok(Math.abs(fillet.nutrients!.kcal / fillet.gEaten! * 100 - 208) < 0.5);
  assert.equal(fillet.priced, true);
  assert.equal(line(r, "salmon_head").slug, "salmon_head");
  assert.equal(line(r, "salmon_belly").slug, "salmon_belly");
  assert.equal(line(r, "pork_belly").status, "ok");
});

test("broth from cubes and shrimp are priced from SM Markets", () => {
  const r = compileRecipe({
    id: 22, title: "Sinigang na Hipon", servings: 4,
    ingredients: [ing("4", "cups", "chicken broth"), ing("1", "lb", "shrimp")],
  }, ctx);
  const broth = line(r, "broth_chicken"), shrimp = line(r, "shrimp");
  assert.equal(broth.priced, true);
  assert.match(broth.priceSource!, /SM Markets/);
  assert.ok(broth.cost! > 5 && broth.cost! < 20, `4 cups broth ₱${broth.cost}`);
  assert.equal(shrimp.priced, true);
});

test("personal dish: a picked catalog slug skips name matching", () => {
  const r = compileRecipe({
    id: 0, title: "My dish", servings: 2,
    ingredients: [{ amount: "300", unit: "g", name: "Liempo ko", slug: "pork_belly" }, { amount: "1", unit: "cup", name: "zzz unknown" }],
  }, ctx);
  assert.equal(r.lines[0].slug, "pork_belly");
  assert.equal(r.lines[0].gAP, 300);
  assert.equal(r.lines[1].status, "unmatched");
});

test("price order: DA, then PSA, then SM; 'to taste' in the text alone is not counted", () => {
  const psa = new Map([
    ["FRESH SHELLS, TAHONG, 1 KG", { price: 123.25, per: "kg" as const, period: "2026-09-01T00:00:00.000Z" }],
    ["FRESH FISH, TILAPIA, MEDIUM, 1 KG", { price: 999, per: "kg" as const, period: "2026-09-01T00:00:00.000Z" }],
  ]);
  const r = compileRecipe({
    id: 40, title: "Tinolang Tahong", servings: 4,
    ingredients: [ing("2", "lbs", "mussels"), ing("1", "lb", "tilapia"), ing(null, null, "ground black pepper to taste")],
  }, { ...ctx, psa });
  const mussels = line(r, "mussels"), tilapia = line(r, "tilapia");
  assert.equal(mussels.priceSource, "PSA Sep 2026"); // PSA beats the SM reference price
  assert.ok(Math.abs(mussels.cost! - (123.25 / 1000) * mussels.gAP!) < 1e-6);
  assert.equal(tilapia.priceSource, "DA"); // DA still first
  assert.equal(r.lines[2].status, "to-taste");
});

// ── Scraper leftovers: lines that aren't ingredients, or whose name span lost the food ──
const raw = (amount: string | null, unit: string | null, name: string, rawText: string) => ({ amount, unit, name, rawText });

test("water phrases are water, whatever the adjectives or purpose; water chestnuts are not", () => {
  const r = compileRecipe({
    id: 50, title: "Siopao", servings: 4,
    ingredients: [ing("3/4", "cup", "lukewarm water"), ing(null, null, "Additional water for boiling"), ing("4", "cups", "of ice cold water placed in a large bowl"),
      ing(null, null, "water enough to cover the leg"), ing("1", "quart", "rice water"), ing("4", "ounces", "chopped water chestnuts")],
  }, ctx);
  assert.deepEqual(r.lines.slice(0, 5).map((l) => l.status), ["water", "water", "water", "water", "water"]);
  assert.notEqual(r.lines[5].status, "water");
});

test("a name that is only a unit or size word is re-read from the whole line", () => {
  const r = compileRecipe({
    id: 51, title: "Liempo", servings: 4,
    ingredients: [raw("1", null, "slab", "1 slab 2 pounds pork belly"), raw("3", null, "tablespoons", "3 tablespoons butter"),
      raw("1", null, "kilo", "1 kilo 2.2 pounds small squid"), raw("1", null, "large", "1 large 15 oz. can spicy sardines in tomato sauce"),
      raw("1", null, "serving", "1 serving 3 1/2 cups marinara sauce (see recipe here)"), raw("1", null, "package", "1 package")],
  }, ctx);
  const [belly, butter, squid, sardines, marinara, pkg] = r.lines;
  assert.equal(belly.slug, "pork_belly");
  assert.ok(Math.abs(belly.gAP! - 2 * 453.592) < 1);
  assert.equal(butter.slug, "butter");
  assert.equal(squid.slug, "squid");
  assert.equal(squid.gAP, 1000);
  assert.equal(sardines.slug, "sardines_tomato_sauce");
  assert.ok(Math.abs(sardines.gAP! - 15 * 28.3495) < 1);
  assert.equal(marinara.slug, "marinara_sauce");
  assert.equal(pkg.status, "skipped"); // nothing left: a unit only
});

test("'a pinch of', 'juice of 2 lemons', 'bunch leeks': the unit and count come out of the name", () => {
  const r = compileRecipe({
    id: 52, title: "Soup", servings: 4,
    ingredients: [ing(null, null, "a pinch of dried oregano"), ing(null, null, "Juice of 2 lemons"), ing(null, null, "juice from 3 limes"),
      ing("1", null, "bunch green onions"), ing(null, null, "* mushrooms"), ing(null, null, "chives for garnish"), ing("1", null, "small bottle gourd")],
  }, ctx);
  const [oregano, lemon, lime, onions] = r.lines;
  assert.equal(oregano.slug, "oregano_dried");
  assert.equal(oregano.status, "ok");
  assert.equal(lemon.slug, "lemon_juice");
  assert.equal(lemon.gAP, 2 * ctx.canonicals.lemon_juice.gEach!);
  assert.equal(lime.gAP, 3 * ctx.canonicals.lime_juice.gEach!);
  assert.equal(onions.gAP, ctx.canonicals.green_onion.gBunch);
  assert.equal(r.lines[6].slug, "bottle_gourd"); // a size word alone is not a leftover
});

test("equipment and headings found in ingredient lists are skipped, not unknown", () => {
  const r = compileRecipe({
    id: 53, title: "Grilled Fish", servings: 4,
    ingredients: [ing(null, null, "Aluminum foil"), ing(null, null, "Ingredients"), ing(null, null, "Banana leaves for wrapping"), ing("1", "cup", "ice")],
  }, ctx);
  assert.deepEqual(r.lines.map((l) => l.status), ["skipped", "skipped", "skipped", "water"]);
});

// ── Other names for foods already in the catalog ──
test("other names: bitter melon, kamote, daikon, hot dogs, chicharron, alamang, sugpo, miso, monggo", () => {
  const names = ["bitter melon", "kamote", "daikon", "hot dogs", "chicharron", "alamang", "sugpo", "miso", "monggo", "mozzarella", "sharp cheddar", "lard"];
  const r = compileRecipe({ id: 60, title: "Mix", servings: 4, ingredients: names.map((n) => ing("1", "cup", n)) }, ctx);
  assert.deepEqual(r.lines.map((l) => l.slug), ["ampalaya", "sweet_potato", "radish_daikon", "hotdog", "chicharon_pork", "shrimp_paste", "shrimp", "miso_paste", "mung_beans", "cheese_mozzarella", "cheese_cheddar", "shortening"]);
});

test("generic names match only the whole name: young coconut meat is not grated coconut", () => {
  const r = compileRecipe({
    id: 61, title: "Buko Salad", servings: 4,
    ingredients: [ing("1", "cup", "coconut"), ing("1", "cup", "young coconut meat"), ing("1", "cup", "vanilla ice cream"),
      ing("8", "ounces", "mushrooms"), ing("1", "can", "cream style corn"), ing("1", "cup", "flour stick (pancit canton)")],
  }, ctx);
  assert.equal(r.lines[0].slug, "coconut_grated");
  assert.notEqual(r.lines[1].slug, "coconut_grated");
  assert.notEqual(r.lines[2].slug, "vanilla_extract");
  assert.equal(r.lines[3].slug, "mushroom_button");
  assert.notEqual(r.lines[4].slug, "corn_sweet");
  assert.equal(r.lines[5].slug, "noodles_pancit_canton"); // not the flour in "flour stick"
});
