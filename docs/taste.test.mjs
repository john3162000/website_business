// Runs docs/taste.js (a plain browser script) in a VM and tests the taste model.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./taste.js", import.meta.url), "utf8")}
;globalThis.api = { TASTE_TAGS, tasteVector, solveLinear, learnTaste, tasteProfile, tasteScore, tasteReasons, recommendDishes, tasteModelFrom, similarDishes, dishWords, tasteVariance, pickToLearn, dishKind };`, ctx);
const { TASTE_TAGS, tasteVector, solveLinear, learnTaste, tasteProfile, tasteScore, tasteReasons, recommendDishes, tasteModelFrom, similarDishes, dishWords, tasteVariance, pickToLearn, dishKind } = ctx.api;

const tags = (r) => Array.from(TASTE_TAGS).filter((_, i) => tasteVector(r)[i]).map((t) => t.key);
const R = (id, title, ingredientNames = [], extra = {}) => ({ id, title, ingredientNames, img: "x.jpg", costPerServing: 50, category: "Main Dish", ...extra });

test("tasteVector tags dishes from title and ingredients", () => {
  assert.deepEqual(tags(R(1, "Sinigang na Baboy", ["pork belly", "tamarind", "kangkong"], { category: "Soup" })), ["maasim", "sabaw", "baboy"]);
  assert.deepEqual(tags(R(2, "Pork Menudo", ["pork", "tomato sauce", "liver"])), ["kamatis", "saucy", "baboy"]);
  assert.deepEqual(tags(R(3, "Bicol Express", ["pork", "coconut milk", "siling haba"])), ["gata", "saucy", "maanghang", "baboy"]);
  assert.deepEqual(tags(R(4, "Chicken Adobo", ["chicken", "vinegar", "soy sauce"])), ["maasim", "saucy", "manok"]);
  assert.ok(tags(R(5, "Lechon Kawali", ["pork belly"], { frying: "deep" })).includes("prito"));
  assert.deepEqual(tags(R(6, "Leche Flan", ["egg yolks", "condensed milk"], { category: "Dessert" })), ["matamis"]);
});

test("solveLinear solves a small system", () => {
  const x = solveLinear([[2, 1], [1, 3]], [3, 5]);
  assert.ok(Math.abs(x[0] - 0.8) < 1e-9 && Math.abs(x[1] - 1.4) < 1e-9);
});

test("learnTaste: a player who loves sour and hates fried", () => {
  const sour = R(1, "Sinigang na Hipon", ["tamarind"], { category: "Soup" });
  const sour2 = R(2, "Paksiw na Isda", ["vinegar"]);
  const fried = R(3, "Fried Chicken", [], { frying: "deep" });
  const fried2 = R(4, "Crispy Pata", [], { frying: "deep" });
  const ratings = [[sour, 10], [sour2, 9], [fried, 2], [fried2, 1]].map(([r, rating]) => ({ x: tasteVector(r), rating }));
  const picks = [{ win: tasteVector(sour), lose: tasteVector(fried) }];
  const model = learnTaste(ratings, picks);
  const w = (k) => model.weights[TASTE_TAGS.findIndex((t) => t.key === k)];
  assert.equal(model.answers, 5);
  assert.ok(w("maasim") > 0.2, `maasim ${w("maasim")}`);
  assert.ok(w("prito") < -0.2, `prito ${w("prito")}`);
  assert.ok(Math.abs(w("gata")) < 1e-9); // never seen: no opinion
  const prof = tasteProfile(model);
  assert.match(prof.sentence, /^Mahilig ka sa maasim 🍋/);
  assert.match(prof.sentence, /pero hindi masyado sa prito 🍳/);
  assert.deepEqual(Array.from(tasteReasons(model, tasteVector(sour))), ["🍋 maasim"]);
  assert.ok(tasteScore(model, tasteVector(sour)) > tasteScore(model, tasteVector(fried)));
});

test("recommendDishes ranks unrated dishes by taste, skips rated ones and repeats", () => {
  const model = { weights: TASTE_TAGS.map((t) => (t.key === "maasim" ? 1 : t.key === "prito" ? -1 : 0)), seen: TASTE_TAGS.map(() => 3) };
  const recipes = [
    R(1, "Sinigang na Baboy", ["tamarind"], { category: "Soup" }),
    R(2, "Fried Chicken", [], { frying: "deep" }),
    R(3, "Paksiw na Bangus", ["vinegar"]),
    R(4, "Paksiw na Bangus", ["vinegar"]),
    R(5, "Pinakbet", ["squash"]),
  ];
  const out = Array.from(recommendDishes(model, recipes, { 1: 8 }, 3), (p) => p.r.id);
  assert.deepEqual(out, [3, 5, 2]);
});

test("tasteModelFrom reads saved ratings and Versus picks", () => {
  const recipes = [R(1, "Sinigang na Baboy", ["tamarind"], { category: "Soup" }), R(2, "Fried Chicken", [], { frying: "deep" })];
  const model = tasteModelFrom(recipes, { 1: 10, 2: 1, 99: 5 }, { "a|b": { n: "Sinigang", w: 1, l: 2 }, old: "Adobo" });
  assert.equal(model.answers, 3); // unknown id 99 and the old string pick are skipped
  assert.ok(tasteScore(model, tasteVector(recipes[0])) > tasteScore(model, tasteVector(recipes[1])));
});

test("similarDishes: same tags and shared ingredients first, no copies", () => {
  assert.deepEqual([...dishWords(R(0, "x", ["2 cups pork belly, sliced", "tamarind soup base", "salt"]))].sort(), ["base", "belly", "pork", "soup", "tamarind"]);
  const recipes = [
    R(1, "Sinigang na Baboy", ["pork belly", "tamarind", "kangkong", "radish"], { category: "Soup" }),
    R(2, "Sinigang na Hipon", ["shrimp", "tamarind", "kangkong", "radish"], { category: "Soup" }),
    R(3, "Sinigang na Hipon", ["shrimp", "tamarind", "kangkong"], { category: "Soup" }),
    R(4, "Leche Flan", ["egg yolks", "condensed milk"], { category: "Dessert" }),
    R(5, "Pork Sinampalukan", ["pork", "tamarind leaves", "ginger"], { category: "Soup" }),
    R(6, "Atchara", ["papaya", "vinegar"], { category: "Sauce & Condiment" }),
  ];
  const out = Array.from(similarDishes(recipes[0], recipes, 3), (r) => r.id);
  assert.ok(out.slice(0, 2).includes(5)); // the other pork-tamarind soup
  assert.ok(out.slice(0, 2).some((id) => id === 2 || id === 3)); // the shrimp sinigang...
  assert.ok(!(out.includes(2) && out.includes(3))); // ...but only one of the two same-titled copies
  assert.ok(!out.includes(6)); // sauces only for sauces
  assert.equal(out[out.length - 1], 4);
});

test("active learning: the model is least sure about tags it hasn't seen", () => {
  const sour = R(1, "Sinigang na Hipon", ["tamarind"], { category: "Soup" });
  const sour2 = R(2, "Paksiw na Bangus", ["vinegar"]);
  const gata = R(3, "Ginataang Kalabasa", ["coconut milk", "squash"]);
  const model = learnTaste([sour, sour2, sour, sour2].map((r, i) => ({ x: tasteVector(r), rating: 9 - i })), []);
  assert.ok(tasteVariance(model, tasteVector(gata)) > tasteVariance(model, tasteVector(sour)));
  // Past the warm-up and not exploring: one of the most uncertain dishes.
  const pick = pickToLearn(model, [sour, sour2, gata], { rng: () => 0.5, top: 1, explore: 0.2 });
  assert.equal(pick.r.id, 3);
  assert.equal(pick.active, true);
  // Cold start (no model, or too few answers): random, not "active".
  assert.equal(pickToLearn(null, [sour, gata], { rng: () => 0 }).active, false);
  assert.equal(pickToLearn(model, [], {}).r, null);
});

test("ulam and meryenda are learned separately", () => {
  const ulam = R(1, "Sinigang na Baboy", ["tamarind"], { category: "Soup" });
  const kakanin = R(2, "Leche Flan", ["condensed milk"], { category: "Dessert" });
  assert.equal(dishKind(ulam), "ulam");
  assert.equal(dishKind(kakanin), "meryenda");
  assert.equal(dishKind(R(3, "Atchara", [], { category: "Sauce & Condiment" })), null);
  const ratings = { 1: 9, 2: 2 };
  assert.equal(tasteModelFrom([ulam, kakanin], ratings, {}, "ulam").answers, 1);
  assert.equal(tasteModelFrom([ulam, kakanin], ratings, {}, "meryenda").answers, 1);
  assert.equal(tasteModelFrom([ulam, kakanin], ratings, {}).answers, 2);
  const m = { weights: TASTE_TAGS.map(() => 0), seen: TASTE_TAGS.map(() => 0) };
  assert.deepEqual(Array.from(recommendDishes(m, [ulam, kakanin], {}, 5, tasteVector, "meryenda"), (p) => p.r.id), [2]);
});
