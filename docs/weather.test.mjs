// Runs docs/weather.js (a plain browser script) in a VM and tests its logic.
// node --test docs/weather.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./weather.js", import.meta.url), "utf8")}
;globalThis.api = { weatherMood, weatherPicks, weatherLabel, percentile, climateLimits };`, ctx);
const { weatherMood, weatherPicks, weatherLabel, percentile, climateLimits } = ctx.api;
const titles = (list) => [...list].map((r) => r.title);

test("weatherMood: only moderate-to-heavy rain, or heat/cold past last year's 85th/15th percentile", () => {
  const L = { hot: 41, cold: 23 };
  assert.equal(weatherMood({ code: 63, apparent: 34 }, L), "rainy"); // moderate rain
  assert.equal(weatherMood({ code: 95, apparent: 30 }, L), "rainy"); // thunderstorm
  assert.equal(weatherMood({ code: 3, apparent: 29, precipitation: 3 }, L), "rainy"); // 3 mm in the last hour
  assert.equal(weatherMood({ code: 61, apparent: 30, precipitation: 0.5 }, L), "mild"); // light rain doesn't count
  assert.equal(weatherMood({ code: 53, apparent: 30 }, L), "mild"); // drizzle doesn't count
  assert.equal(weatherMood({ code: 2, apparent: 30, rainChance6h: 90 }, L), "mild"); // a forecast chance isn't rain
  assert.equal(weatherMood({ code: 0, apparent: 41 }, L), "sunny"); // at the hot limit
  assert.equal(weatherMood({ code: 0, apparent: 38 }, L), "mild"); // hot, but a normal day here
  assert.equal(weatherMood({ code: 1, apparent: 23 }, L), "cool");
  assert.equal(weatherMood({ code: 1, apparent: 25 }, L), "mild");
  assert.equal(weatherMood({ code: 0, apparent: 43 }), "sunny"); // fallback limits before last year's data loads
});

test("percentile and climate limits", () => {
  const days = Array.from({ length: 101 }, (_, i) => i); // 0..100
  assert.equal(percentile(days, 85), 85);
  assert.equal(percentile(days, 15), 15);
  assert.equal(percentile([10, 20], 50), 15);
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([1, null, 3], 50), 2);
  const lim = climateLimits(days.map((d) => 30 + d / 10), days.map((d) => 20 + d / 10));
  assert.equal(lim.hot, 38.5);
  assert.equal(lim.cold, 21.5);
  assert.equal(climateLimits([], [1]), null);
});

test("weatherLabel covers Open-Meteo's WMO codes", () => {
  assert.equal(weatherLabel(95).text, "thunderstorm");
  assert.equal(weatherLabel(81).text, "rain showers");
  assert.equal(weatherLabel(0).icon, "☀️");
});

const R = (title, valueScore = 1, extra = {}) => ({ title, category: "Main Dish", ranked: true, valueScore, nutritionScore: 30, ...extra });
const RECIPES = [
  R("Bulalo Recipe", 1), R("How to Cook Bulalo", 3),
  R("Sinigang na Baboy", 5), R("Sinigang na Hipon", 2), R("Chicken Tinola", 4), R("Pork Nilaga", 2),
  R("Chicken Adobo", 9), R("Sinigang Mix Sauce", 9, { category: "Sauce & Condiment" }),
  R("Ginataang Bilo bilo with Langka", 2, { category: "Dessert" }), R("Champorado", 8, { category: "Dessert" }),
  R("Ginataang Halo-halo (Binignit)", 6, { category: "Dessert" }),
  R("Buko Pandan", 3, { category: "Dessert" }), R("Adobong Manok sa Buko", 9),
  R("Sago at Gulaman", 2, { category: "Dessert" }), R("Filipino Fruit Salad", 2, { category: "Dessert" }),
  R("Kinilaw na Tanigue", 1),
];

test("rainy: bulalo first, other sabaw, then bilo-bilo; one dish per family", () => {
  const picks = titles(weatherPicks("rainy", RECIPES, 4, 0));
  assert.deepEqual(picks, ["How to Cook Bulalo", "Sinigang na Baboy", "Chicken Tinola", "Ginataang Bilo bilo with Langka"]);
});

test("rainy: the families after bulalo rotate by day", () => {
  const a = titles(weatherPicks("rainy", RECIPES, 4, 0));
  const b = titles(weatherPicks("rainy", RECIPES, 4, 1));
  assert.equal(a[0], b[0]); // bulalo stays first
  assert.notDeepEqual(a.slice(1, 3), b.slice(1, 3));
});

test("sunny: cold treats; hot ginataang halo-halo and adobo sa buko left out", () => {
  const picks = titles(weatherPicks("sunny", RECIPES, 4, 0));
  assert.deepEqual(picks, ["Buko Pandan", "Sago at Gulaman", "Filipino Fruit Salad", "Kinilaw na Tanigue"]);
  assert.equal(weatherPicks("mild", RECIPES), null);
});

test("sorting the picks: cheapest, most protein, fewest calories; merienda stays last", () => {
  const { weatherPicks: picks } = ctx.api;
  const D = (title, cost, protein, calories, extra = {}) => ({ title, category: "Soup", ranked: true, valueScore: 1, nutritionScore: 30, costPerServing: cost, protein, calories, nutritionCoverage: 1, ...extra });
  const list = [
    D("Bulalo Recipe", 120, 40, 700), D("Bulalo Budget", 60, 25, 500),
    D("Sinigang na Baboy", 70, 30, 450), D("Chicken Tinola", 50, 28, 300),
    D("Ginataang Bilo bilo", 20, 3, 350, { category: "Dessert" }),
  ];
  assert.deepEqual(titles(picks("rainy", list, 4, 0, "cheap")), ["Chicken Tinola", "Bulalo Budget", "Sinigang na Baboy", "Ginataang Bilo bilo"]);
  assert.deepEqual(titles(picks("rainy", list, 4, 0, "protein")), ["Bulalo Recipe", "Sinigang na Baboy", "Chicken Tinola", "Ginataang Bilo bilo"]);
  assert.deepEqual(titles(picks("rainy", list, 4, 0, "kcal")), ["Chicken Tinola", "Sinigang na Baboy", "Bulalo Budget", "Ginataang Bilo bilo"]);
});

test("weather picks: a dish with incomplete price data loses to its family's other dishes, whatever the sort", () => {
  const list = [R("Bulalo Recipe", 9, { costIncomplete: true, protein: 60 }), R("How to Cook Bulalo", 1, { protein: 10 }), ...RECIPES.slice(2)];
  for (const sort of ["value", "protein", "cheap"]) {
    assert.equal(titles(weatherPicks("rainy", list, 4, 0, sort)).includes("Bulalo Recipe"), false, sort);
  }
});
