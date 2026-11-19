// Runs docs/games.js (a plain browser script) in a VM and tests its pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./games.js", import.meta.url), "utf8")}
;globalThis.api = { findDish, buildMatchups, ratingMood, armReach, nextRateDish, roundNote, gameFactsFor, GAME_MATCHUPS, GAME_FACTS };`, ctx);
const { findDish, buildMatchups, ratingMood, armReach, nextRateDish, roundNote, gameFactsFor, GAME_MATCHUPS, GAME_FACTS } = ctx.api;

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
  const many = GAME_MATCHUPS.flatMap(([a, b], i) => [R(100 + i, a.name), R(200 + i, b.name)]);
  assert.equal(buildMatchups(many).length, 30); // backups only fill gaps
  assert.ok(GAME_MATCHUPS.length >= 30);
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

test("roundNote always gives a fact, never a price, and prefers one not shown yet", () => {
  const m = { a: { name: "Sinigang", recipe: R(1, "Sinigang", { costPerServing: 40 }) }, b: { name: "Adobo", recipe: R(2, "Adobo", { costPerServing: 55 }) } };
  const all = new Set([...gameFactsFor("Sinigang"), ...gameFactsFor("Adobo")]);
  for (const x of [0, 0.3, 0.6, 0.99]) {
    const n = roundNote(m, "b", () => x);
    assert.equal(n.kind, "fact");
    assert.ok(all.has(n.text));
    assert.doesNotMatch(n.text, /₱|presyo|price|mura/i);
  }
  const seen = new Set();
  for (let i = 0; i < all.size; i++) { const n = roundNote(m, "a", () => 0, seen); assert.ok(!seen.has(n.text)); seen.add(n.text); }
  assert.equal(seen.size, all.size);
  // Every dish has at least three facts, none about prices.
  for (const [a, b] of GAME_MATCHUPS) for (const d of [a, b]) {
    const f = gameFactsFor(d.name);
    assert.ok(f.length >= 3, `facts for ${d.name}`);
    for (const x of f) assert.doesNotMatch(x, /₱|presyo|per serving/i);
  }
});

test("keys and swipes: 1-9 and 0 rate at once; a sideways swipe picks a side", () => {
  const api3 = vm.runInContext("({ gameKeyRating, gameSwipeSide })", ctx);
  assert.equal(api3.gameKeyRating("1"), 1);
  assert.equal(api3.gameKeyRating("7"), 7);
  assert.equal(api3.gameKeyRating("0"), 10);
  assert.equal(api3.gameKeyRating("a"), null);
  assert.equal(api3.gameKeyRating("Enter"), null);
  assert.equal(api3.gameSwipeSide(-120, 10), "a");
  assert.equal(api3.gameSwipeSide(90, -20), "b");
  assert.equal(api3.gameSwipeSide(30, 0), null); // too short: a tap
  assert.equal(api3.gameSwipeSide(80, 100), null); // mostly scrolling down
});

test("after a Versus pick, any key goes on except Tab, Escape and lone modifiers", () => {
  const api4 = vm.runInContext("({ gameAnyKeyNext })", ctx);
  for (const k of ["Enter", " ", "a", "ArrowLeft", "ArrowRight", "ArrowDown", "5"]) assert.equal(api4.gameAnyKeyNext(k), true, k);
  for (const k of ["Tab", "Escape", "Shift", "Control", "Alt", "Meta", ""]) assert.equal(api4.gameAnyKeyNext(k), false, k);
});
