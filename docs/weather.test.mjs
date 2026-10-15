// Runs docs/weather.js (a plain browser script) in a VM and tests its logic.
// node --test docs/weather.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./weather.js", import.meta.url), "utf8")}
;globalThis.api = { weatherMood, weatherPicks, weatherLabel };`, ctx);
const { weatherMood, weatherPicks, weatherLabel } = ctx.api;
const titles = (list) => [...list].map((r) => r.title);

test("weatherMood: rain wins, then sun or heat, then cool", () => {
  assert.equal(weatherMood({ code: 63, apparent: 34 }), "rainy"); // raining, even if humid
  assert.equal(weatherMood({ code: 2, apparent: 30, rainChance6h: 70 }), "rainy"); // rain coming
  assert.equal(weatherMood({ code: 3, apparent: 29, precipitation: 0.4 }), "rainy");
  assert.equal(weatherMood({ code: 0, apparent: 28 }), "sunny"); // clear and warm
  assert.equal(weatherMood({ code: 2, apparent: 27 }), "sunny"); // partly cloudy still counts
  assert.equal(weatherMood({ code: 3, apparent: 33 }), "sunny"); // overcast but scorching
  assert.equal(weatherMood({ code: 3, apparent: 29 }), "mild"); // overcast, warm
  assert.equal(weatherMood({ code: 0, apparent: 25 }), "mild"); // clear but not hot
  assert.equal(weatherMood({ code: 1, apparent: 21 }), "cool");
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
