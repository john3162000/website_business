// Runs docs/planner.js and docs/feeding.js (plain browser scripts) in a VM and tests the
// feeding planner's pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
const src = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
vm.runInContext(`${src("./planner.js")}
${src("./feeding.js")}
;globalThis.api = { feedSettings, feedRicePrice, feedRiceCost, feedPool, feedingMenu, feedingTotals, feedRiceGrams, feedingText, ingredientTotals };`, ctx);
const { feedSettings, feedRicePrice, feedRiceCost, feedPool, feedingMenu, feedingTotals, feedRiceGrams, feedingText, ingredientTotals } = ctx.api;
const plain = (v) => JSON.parse(JSON.stringify(v));

let nextId = 1;
const dish = (title, category, costPerServing, nutritionScore, extra = {}) => ({
  id: nextId++, title, category, costPerServing, nutritionScore, ranked: true, costIncomplete: false,
  protein: 15, calories: 300, ingredientNames: [], course: "Main Course", ...extra,
});

const POOL_RECIPES = [
  dish("Ginisang Monggo", "Vegetable Dish", 18, 30),
  dish("Pinakbet", "Vegetable Dish", 22, 28),
  dish("Ginataang Kalabasa at Sitaw", "Vegetable Dish", 20, 25),
  dish("Sinigang na Bangus", "Fish & Seafood", 35, 32),
  dish("Paksiw na Galunggong", "Fish & Seafood", 25, 27),
  dish("Chicken Tinola", "Main Dish", 38, 31),
  dish("Pork Adobo", "Main Dish", 55, 26),
  dish("Beef Caldereta", "Main Dish", 95, 29),
  dish("Leche Flan", "Dessert", 12, 5),
  dish("Sinigang na Bangus", "Fish & Seafood", 36, 32), // same title twice
  dish("Mystery Stew", "Main Dish", 15, 40, { costIncomplete: true }),
];

test("settings are clamped and fall back to the defaults", () => {
  assert.deepEqual(plain(feedSettings({ heads: "250", budget: "35", days: "10", riceGrams: "70" })), { heads: 250, budget: 35, days: 10, riceGrams: 70 });
  assert.deepEqual(plain(feedSettings({ heads: "5", budget: "9999", days: "0", riceGrams: "" })), { heads: 10, budget: 500, days: 1, riceGrams: 80 });
  assert.deepEqual(plain(feedSettings(null)), { heads: 100, budget: 40, days: 5, riceGrams: 80 });
});

test("rice: the cheapest regular milled DA price, else well milled, else none", () => {
  const prices = [
    { name: "Basmati Rice", avg: 194 },
    { name: "Well Milled 1-19% bran streak (LOCAL COMMERCIAL RICE)", avg: 49.34 },
    { name: "Regular Milled 20-40% bran streak (IMPORTED COMMERCIAL RICE)", avg: 45.33 },
    { name: "Regular Milled 20-40% bran streak (LOCAL COMMERCIAL RICE)", avg: 45.2 },
  ];
  assert.equal(feedRicePrice(prices).perKg, 45.2);
  assert.equal(feedRicePrice(prices.slice(0, 2)).perKg, 49.34);
  assert.equal(feedRicePrice([{ name: "Basmati Rice", avg: 194 }]), null);
  assert.ok(Math.abs(feedRiceCost({ perKg: 45 }, 80) - 3.6) < 1e-9);
  assert.equal(feedRiceCost(null, 80), 0);
  assert.equal(feedRiceGrams(100, 5, 80), 40000);
});

test("the pool keeps main ulam with complete prices, one per title", () => {
  const titles = feedPool(POOL_RECIPES).map((r) => r.title);
  assert.ok(!titles.includes("Leche Flan"));
  assert.ok(!titles.includes("Mystery Stew"));
  assert.equal(titles.filter((x) => x === "Sinigang na Bangus").length, 1);
});

test("the menu cycles gulay, isda, karne within the budget, without repeats", () => {
  const pool = feedPool(POOL_RECIPES);
  const menu = feedingMenu(pool, { days: 6, cap: 40, rng: () => 0 });
  assert.deepEqual(plain(menu.map((m) => m.kind)), ["gulay", "isda", "karne", "gulay", "isda", "gulay"]);
  assert.equal(new Set(menu.map((m) => m.id)).size, 6);
  assert.ok(menu.every((m) => m.fits));
  const byId = new Map(pool.map((r) => [r.id, r]));
  // rng 0 takes the most nutritious that fits: Monggo (30), Bangus (32), Tinola (31).
  assert.deepEqual(plain(menu.slice(0, 3).map((m) => byId.get(m.id).title)), ["Ginisang Monggo", "Sinigang na Bangus", "Chicken Tinola"]);
});

test("when nothing fits, the cheapest unused dish is taken and flagged", () => {
  const pool = feedPool(POOL_RECIPES);
  const menu = feedingMenu(pool, { days: 2, cap: 10, rng: () => 0 });
  const byId = new Map(pool.map((r) => [r.id, r]));
  assert.deepEqual(plain(menu.map((m) => byId.get(m.id).title)), ["Ginisang Monggo", "Ginataang Kalabasa at Sitaw"]);
  assert.ok(menu.every((m) => !m.fits));
});

test("totals: ulam plus rice per head, times the headcount", () => {
  const pool = feedPool(POOL_RECIPES);
  const byId = new Map(pool.map((r) => [r.id, r]));
  const menu = feedingMenu(pool, { days: 3, cap: 40, rng: () => 0 });
  const t = feedingTotals(menu, byId, { heads: 100, riceCost: 3.6 });
  // 18 + 35 + 38 = 91 per head over 3 days, plus 3 × 3.6 rice.
  assert.ok(Math.abs(t.total - (91 + 10.8) * 100) < 1e-6);
  assert.ok(Math.abs(t.perHeadAvg - (91 + 10.8) / 3) < 1e-9);
  assert.equal(t.overBudget, 0);
  assert.equal(t.kcalAvg, 300);
});

test("ingredient totals scale each dish from its servings to the headcount", () => {
  const details = new Map([
    [1, { servings: 4, lines: [{ slug: "mung-beans", label: "Monggo", text: "1 cup monggo", gAP: 200, cost: 20, status: "ok" }] }],
    [2, { servings: 5, lines: [{ slug: "mung-beans", label: "Monggo", text: "monggo", gAP: 100, cost: 10, status: "ok" }, { label: "Asin", text: "salt", gAP: null, status: "to-taste" }] }],
  ]);
  const r = ingredientTotals([{ id: 1, people: 100 }, { id: 2, people: 100 }], details);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].grams, 200 * 25 + 100 * 20);
  assert.equal(r.total, 20 * 25 + 10 * 20);
});

test("the text plan lists the menu, rice and groceries", () => {
  const pool = feedPool(POOL_RECIPES);
  const byId = new Map(pool.map((r) => [r.id, r]));
  const menu = feedingMenu(pool, { days: 2, cap: 40, rng: () => 0 });
  const totals = feedingTotals(menu, byId, { heads: 50, riceCost: 3.6 });
  const grocery = { items: [{ key: "mung-beans", label: "Monggo", grams: 5000, cost: 500, priced: true, unpricedGrams: 0, sources: [], dishes: 1 }], total: 500, unpriced: 0 };
  const text = feedingText({ heads: 50, budget: 40, days: 2, riceGrams: 80 }, totals, grocery, { name: "Regular Milled", perKg: 45 }, "Nov 6, 2026", "tl");
  assert.match(text, /50 tao · 2 araw/);
  assert.match(text, /Araw 1: Ginisang Monggo/);
  assert.match(text, /☐ Bigas: 8\.0 kg · ≈₱360/);
  assert.match(text, /☐ Monggo: 5\.0 kg · ≈₱500/);
});
