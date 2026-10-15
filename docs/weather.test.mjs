// Runs docs/weather.js (a plain browser script) in a VM and tests its logic.
// node --test docs/weather.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./weather.js", import.meta.url), "utf8")}
;globalThis.api = { weatherMood, dishWeather, weatherPicks, weatherLabel };`, ctx);
const { weatherMood, dishWeather, weatherPicks, weatherLabel } = ctx.api;

test("weatherMood: rain wins, then heat, then cool", () => {
  assert.equal(weatherMood({ code: 63, apparent: 34 }), "rainy"); // raining, even if humid
  assert.equal(weatherMood({ code: 2, apparent: 30, rainChance6h: 70 }), "rainy"); // rain coming
  assert.equal(weatherMood({ code: 3, apparent: 29, precipitation: 0.4 }), "rainy");
  assert.equal(weatherMood({ code: 0, apparent: 36 }), "hot");
  assert.equal(weatherMood({ code: 1, apparent: 21 }), "cool");
  assert.equal(weatherMood({ code: 2, apparent: 28, rainChance6h: 30 }), "mild");
});

test("weatherLabel covers Open-Meteo's WMO codes", () => {
  assert.equal(weatherLabel(95).text, "thunderstorm");
  assert.equal(weatherLabel(81).text, "rain showers");
  assert.equal(weatherLabel(0).icon, "☀️");
});

const R = (title, category = "Main Dish", extra = {}) => ({ title, category, ranked: true, valueScore: 1, nutritionScore: 30, ...extra });

test("dishWeather: soups and stews warm, salads and grilled food cool", () => {
  assert.equal(dishWeather(R("Sinigang na Baboy", "Soup")), "warm");
  assert.equal(dishWeather(R("Beef Kare-Kare")), "warm");
  assert.equal(dishWeather(R("Champorado", "Dessert")), "warm");
  assert.equal(dishWeather(R("Kinilaw na Tanigue", "Fish & Seafood")), "cool");
  assert.equal(dishWeather(R("Inihaw na Liempo")), "cool");
  assert.equal(dishWeather(R("Halo-Halo", "Dessert")), "cool");
  assert.equal(dishWeather(R("Chicken Adobo")), null);
});

test("weatherPicks: best value first, no sauces, deduped, null when mild", () => {
  const recipes = [
    R("Tinola", "Soup", { valueScore: 2 }),
    R("Bulalo", "Soup", { valueScore: 5 }),
    R("Bulalo", "Soup", { valueScore: 4 }), // repost
    R("Sinigang Mix Sauce", "Sauce & Condiment", { valueScore: 9 }),
    R("Lugaw", "Soup", { ranked: false, valueScore: 0, nutritionScore: 50 }),
    R("Ensaladang Talong", "Vegetable Dish", { valueScore: 8 }),
  ];
  assert.deepEqual(weatherPicks("rainy", recipes).map((r) => r.title), ["Bulalo", "Tinola", "Lugaw"]);
  assert.deepEqual(weatherPicks("hot", recipes).map((r) => r.title), ["Ensaladang Talong"]);
  assert.equal(weatherPicks("mild", recipes), null);
});

test("weatherPicks: at most one dessert, so meals lead", () => {
  const recipes = [
    R("Champorado", "Dessert", { valueScore: 9 }),
    R("Easy Champorado", "Dessert", { valueScore: 8 }),
    R("Ginataang Bilo-Bilo", "Dessert", { valueScore: 7 }),
    R("Chicken Tinola", "Soup", { valueScore: 3 }),
  ];
  assert.deepEqual(weatherPicks("rainy", recipes).map((r) => r.title), ["Champorado", "Chicken Tinola"]);
});
