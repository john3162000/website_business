// Runs docs/taste.js (a plain browser script) in a VM and tests the taste model.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./taste.js", import.meta.url), "utf8")}
;globalThis.api = { TASTE_TAGS, tasteVector, solveLinear, learnTaste, tasteProfile, tasteScore, tasteReasons, recommendDishes, tasteModelFrom, similarDishes, dishWords, tasteVariance, pickToLearn, dishKind, addSignal, signalStrengths, implicitTaste, blendTaste, diversify, TASTE_MIN_ANSWERS };`, ctx);
const { TASTE_TAGS, tasteVector, solveLinear, learnTaste, tasteProfile, tasteScore, tasteReasons, recommendDishes, tasteModelFrom, similarDishes, dishWords, tasteVariance, pickToLearn, dishKind, addSignal, signalStrengths, implicitTaste, blendTaste, diversify, TASTE_MIN_ANSWERS } = ctx.api;

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

// ── Level 2: learning from what people do ──

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 4);
const idx = (key) => Array.from(TASTE_TAGS).findIndex((t) => t.key === key);

test("signals: actions are saved per dish, opens are counted, favourites aren't stored here", () => {
  let s = addSignal({}, 7, "open", NOW);
  s = addSignal(s, 7, "open", NOW + 1000);
  s = addSignal(s, 7, "cook", NOW + 2000);
  s = addSignal(s, 7, "fav", NOW);
  s = addSignal(s, 7, "bogus", NOW);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), { 7: { open: NOW + 1000, opens: 2, cook: NOW + 2000 } });
});

test("signal strength: favourite > cook > plan > repeated opens > one open, and old signals fade", () => {
  const sig = { 1: { cook: NOW }, 2: { plan: NOW }, 3: { open: NOW, opens: 1 }, 4: { open: NOW, opens: 4 }, 5: { cook: NOW - 90 * DAY } };
  const s = signalStrengths(sig, new Set([9]), NOW);
  assert.equal(s.get("9"), 1);
  assert.ok(s.get("1") > s.get("2") && s.get("2") > s.get("4") && s.get("4") > s.get("3"));
  assert.ok(Math.abs(s.get("5") - 0.8 / 4) < 1e-9); // two half-lives
});

test("the behaviour profile likes the tags that show up more among liked dishes than overall", () => {
  const dishes = [
    R(1, "Sinigang na Baboy", ["pork", "tamarind"], { category: "Soup" }),
    R(2, "Sinigang na Hipon", ["shrimp", "tamarind"], { category: "Soup" }),
    R(3, "Pork Menudo", ["pork", "tomato sauce"]),
    R(4, "Lechon Kawali", ["pork belly"], { frying: "deep" }),
    R(5, "Chicken Adobo", ["chicken", "vinegar"]),
    R(6, "Tinola", ["chicken", "ginger"], { category: "Soup" }),
  ];
  const vecs = dishes.map((r) => ({ id: r.id, x: tasteVector(r) }));
  const liked = signalStrengths({ 6: { cook: NOW } }, new Set([1, 2]), NOW);
  const m = implicitTaste(liked, vecs);
  assert.ok(m.weights[idx("sabaw")] > 0.2, "soups liked");
  assert.ok(m.weights[idx("prito")] < 0, "fried not liked");
  assert.ok(m.strength > 2.7 && m.answers === 3);
  // Nothing liked: no profile.
  assert.equal(implicitTaste(new Map(), vecs).strength, 0);
});

test("blending: either model alone, both added, or none", () => {
  const d = Array.from(TASTE_TAGS).length;
  const explicit = { weights: new Array(d).fill(0.1), bias: 0, seen: new Array(d).fill(1), answers: TASTE_MIN_ANSWERS, A: [] };
  const implicit = { weights: new Array(d).fill(0.5), bias: 0, seen: new Array(d).fill(2), answers: 3, strength: 2.5 };
  assert.equal(blendTaste(null, { ...implicit, strength: 1 }), null);
  assert.equal(blendTaste(explicit, null), explicit);
  assert.equal(blendTaste({ ...explicit, answers: 1 }, implicit).source, "behaviour");
  const both = blendTaste(explicit, implicit);
  assert.equal(both.source, "both");
  assert.ok(Math.abs(both.weights[0] - (0.1 + 0.6 * 0.5)) < 1e-9);
  assert.equal(both.answers, TASTE_MIN_ANSWERS + 3);
});

test("diversify trades a little score for variety", () => {
  const a = [1, 0, 0], b = [0, 1, 0];
  const items = [{ id: "adobo1", x: a, score: 1 }, { id: "adobo2", x: a, score: 0.99 }, { id: "adobo3", x: a, score: 0.98 }, { id: "sinigang", x: b, score: 0.8 }];
  assert.deepEqual([...diversify(items, 2).map((i) => i.id)], ["adobo1", "sinigang"]);
  assert.deepEqual([...diversify(items, 4).map((i) => i.id)].sort(), ["adobo1", "adobo2", "adobo3", "sinigang"]);
});
