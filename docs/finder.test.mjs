// Runs docs/finder.js (a plain browser script) in a VM and tests its pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./finder.js", import.meta.url), "utf8")}
;globalThis.api = { matchDishes, hasIngredient, ingredientCategory, categoryOptions, graphData };`, ctx);
const { matchDishes, hasIngredient, ingredientCategory, categoryOptions, graphData } = ctx.api;
const plain = (v) => JSON.parse(JSON.stringify(v));

const INDEX = {
  ingredients: [
    { slug: "garlic", label: "Garlic", count: 3 }, { slug: "pork_belly", label: "Pork belly", count: 2 },
    { slug: "kangkong", label: "Kangkong", count: 2 }, { slug: "tamarind_mix", label: "Sinigang mix", count: 1 },
    { slug: "chicken_thigh", label: "Chicken thigh", count: 1 }, { slug: "soy_sauce", label: "Soy sauce", count: 1 },
  ],
  recipes: [
    { id: 1, i: [1, 2, 3, 0], c: [40, 3, 5, 1] },       // sinigang: pork, kangkong, mix, garlic
    { id: 2, i: [2, 0], c: [3, 1] },                    // adobong kangkong
    { id: 3, i: [4, 5, 0], c: [30, 2, 1] },             // chicken adobo
    { id: 4, i: [2, 0], c: [3, 1] },                    // a repost of adobong kangkong
  ],
};
const RECIPES = new Map([
  [1, { title: "Sinigang na Baboy", valueScore: 5 }], [2, { title: "Adobong Kangkong", valueScore: 9 }],
  [3, { title: "Chicken Adobo", valueScore: 7 }], [4, { title: "Adobong Kangkong", valueScore: 2 }],
]);

test("finder: dishes with nothing missing come first; staples count as had", () => {
  const out = plain(matchDishes(INDEX, new Set(["kangkong"]), RECIPES));
  assert.deepEqual(out.map((d) => d.id), [2, 1], "chicken adobo uses none of my picks");
  assert.equal(out[0].missing.length, 0);
  assert.deepEqual(out[1].missing.map((m) => m.label), ["Pork belly", "Sinigang mix"]);
  assert.equal(out[1].missingCost, 45);
});

test("finder: without staples, garlic is missing too", () => {
  const out = plain(matchDishes(INDEX, new Set(["kangkong"]), RECIPES, { staples: false }));
  assert.deepEqual(out[0].missing.map((m) => m.label), ["Garlic"]);
});

test("finder: 'any pork' matches every pork cut; reposts appear once", () => {
  const out = plain(matchDishes(INDEX, new Set(["any:pork", "kangkong"]), RECIPES));
  const sinigang = out.find((d) => d.id === 1);
  assert.deepEqual(sinigang.used, ["Pork belly", "Kangkong"]);
  assert.equal(out.filter((d) => d.title === "Adobong Kangkong").length, 1);
  assert.equal(hasIngredient(new Set(["any:chicken"]), "chicken_thigh", false), true);
  assert.equal(hasIngredient(new Set(), "garlic", true), true);
  assert.equal(hasIngredient(new Set(["any:banana"]), "banana_ketchup", false), false);
  assert.equal(hasIngredient(new Set(["any:fish"]), "fish_sauce", false), false);
  assert.deepEqual(plain(matchDishes(INDEX, new Set(), RECIPES)), []);
});

test("finder: dropdown groups put each ingredient in one list, families first", () => {
  const cat = (t) => ingredientCategory(t).key;
  assert.equal(cat("pork_belly"), "karne");
  assert.equal(cat("any:chicken"), "karne");
  assert.equal(cat("fish_sauce"), "sarsa");
  assert.equal(cat("shrimp_paste"), "sarsa");
  assert.equal(cat("tilapia"), "dagat");
  assert.equal(cat("egg_chicken"), "itlog");
  assert.equal(cat("noodles_bihon"), "kanin");
  assert.equal(cat("kangkong"), "gulay");
  assert.equal(cat("eggplant"), "gulay", "not an egg");
  assert.deepEqual(plain(categoryOptions(INDEX, "karne")).map((o) => o.token), ["any:pork", "any:chicken", "any:beef", "pork_belly", "chicken_thigh"]);
  assert.deepEqual(plain(categoryOptions(INDEX, "karne", "thigh")).map((o) => o.token), ["chicken_thigh"]);
});

test("finder graph: a node per pick and per dish, links for what each dish uses, shared missing nodes merge", () => {
  const dishes = matchDishes(INDEX, new Set(["kangkong"]), RECIPES, { staples: false });
  const g = plain(graphData(new Set(["kangkong"]), dishes, { ghostsPerDish: 3 }));
  assert.deepEqual(g.nodes.filter((n) => n.kind === "ing").map((n) => n.id), ["i:kangkong"]);
  assert.deepEqual(g.nodes.filter((n) => n.kind === "dish").map((n) => n.id), ["d:2", "d:1"]);
  assert.equal(g.links.filter((l) => l.kind === "have").length, 2);
  assert.equal(g.nodes.filter((n) => n.id === "m:garlic").length, 1, "garlic is missing from both, one node");
  assert.equal(g.links.filter((l) => l.source === "m:garlic").length, 2);
  assert.deepEqual(plain(graphData(new Set(["kangkong"]), dishes, { maxDishes: 1, ghostsPerDish: 0 })).nodes.length, 2);
  // A dish that joins two picks is drawn even when single-pick dishes rank higher.
  const two = matchDishes(INDEX, new Set(["kangkong", "any:pork"]), RECIPES);
  const g2 = plain(graphData(new Set(["kangkong", "any:pork"]), two, { maxDishes: 2 }));
  assert.equal(g2.nodes.some((n) => n.id === "d:1"), true);
  assert.equal(g2.links.filter((l) => l.target === "d:1" && l.kind === "have").length, 2);
});
