// Runs docs/games.js (a plain browser script) in a VM and tests its pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./games.js", import.meta.url), "utf8")}
;globalThis.api = { findDish, buildMatchups, ratingMood, armReach, nextRateDish, roundNote, GAME_MATCHUPS, GAME_FACTS };`, ctx);
const { findDish, buildMatchups, ratingMood, armReach, nextRateDish, roundNote, GAME_MATCHUPS, GAME_FACTS } = ctx.api;

const R = (id, title, extra = {}) => ({ id, title, img: "x.jpg", costPerServing: 50, category: "Main Dish", ...extra });

test("findDish: earlier pattern first, then photo and price, then the shortest title", () => {
  const recipes = [R(1, "Adobong Pusit"), R(2, "Chicken Adobo with Potatoes"), R(3, "Chicken Adobo"), R(4, "Chicken Adobo Flakes", { img: null })];
  assert.equal(findDish(recipes, [/^chicken adobo/i, /adobo/i]).id, 3);
  assert.equal(findDish([R(1, "Adobong Pusit")], [/^chicken adobo/i, /adobo/i]).id, 1);
  assert.equal(findDish(recipes, [/sinigang/i]), null);
  assert.equal(findDish([R(5, "Malaing na Isda"), R(6, "Laing")], [/^laing\b/i, /\blaing\b/i]).id, 6);
});

test("buildMatchups drops rounds with a missing side; every dish has a fact", () => {
  const ms = buildMatchups([R(1, "Sinigang na Baboy"), R(2, "Chicken Adobo"), R(3, "Lechon Kawali")]);
  assert.equal(ms.length, 1);
  assert.equal(ms[0].a.recipe.id, 1);
  assert.equal(GAME_MATCHUPS.length, 10);
  for (const [a, b] of GAME_MATCHUPS) for (const d of [a, b]) assert.ok(GAME_FACTS[d.name], `fact for ${d.name}`);
});

test("rating mood and arm reach", () => {
  assert.equal(ratingMood(1).hand, "👎");
  assert.equal(ratingMood(5).label, "Pwede na");
  assert.equal(ratingMood(10).label, "Sobrang sarap!");
  assert.equal(armReach(1), 0);
  assert.equal(armReach(10), 1);
  assert.equal(armReach(99), 1);
});

test("nextRateDish skips rated dishes, sauces and dishes without a photo", () => {
  const recipes = [R(1, "A"), R(2, "B", { category: "Sauce & Condiment" }), R(3, "C", { img: null }), R(4, "D")];
  assert.equal(nextRateDish(recipes, { 1: 7 }, () => 0).id, 4);
  assert.equal(nextRateDish(recipes, { 1: 7, 4: 2 }), null);
});

test("roundNote gives a fact or a price comparison", () => {
  const m = { a: { name: "Sinigang", recipe: R(1, "Sinigang", { costPerServing: 40 }) }, b: { name: "Adobo", recipe: R(2, "Adobo", { costPerServing: 55 }) } };
  const fact = roundNote(m, "a", () => 0.1);
  assert.equal(fact.kind, "fact");
  assert.equal(fact.text, GAME_FACTS[fact.dish]);
  const price = roundNote(m, "b", () => 0.9);
  assert.equal(price.kind, "price");
  assert.match(price.text, /^Mas mura ang Sinigang ng ₱15 per serving kaysa Adobo/);
});
