// Runs docs/planner.js (a plain browser script) in a VM and tests its pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./planner.js", import.meta.url), "utf8")}
;globalThis.api = { loadPlan, savePlan, addToSlot, removeFromSlot, plannedDishes, receiptByDish, receiptByIngredient, formatGrams, slotKey, mealTypes, seriesForMeal, randomWeek };`, ctx);
const { loadPlan, savePlan, addToSlot, removeFromSlot, plannedDishes, receiptByDish, receiptByIngredient, formatGrams, slotKey, mealTypes, seriesForMeal, randomWeek } = ctx.api;
const plain = (v) => JSON.parse(JSON.stringify(v));

test("slots: add without duplicates, at most 3, remove clears empty slots", () => {
  let p = { people: 4, slots: {} };
  const k = slotKey("Lunes", "Almusal");
  p = addToSlot(addToSlot(p, k, 1), k, 1);
  assert.deepEqual(plain(p.slots[k]), [1]);
  p = addToSlot(addToSlot(addToSlot(p, k, 2), k, 3), k, 4);
  assert.deepEqual(plain(p.slots[k]), [1, 2, 3]);
  for (const id of [1, 2, 3]) p = removeFromSlot(p, k, id);
  assert.equal(k in p.slots, false);
});

test("plannedDishes follows week order (day, then meal)", () => {
  const p = { people: 2, slots: { "Martes|Hapunan": [9], "Lunes|Hapunan": [7], "Lunes|Almusal": [5] } };
  assert.deepEqual(plain(plannedDishes(p)).map((d) => d.id), [5, 7, 9]);
});

test("receipt per dish: cost per serving × people, day totals, unpriced flagged", () => {
  const p = { people: 3, slots: { "Lunes|Tanghalian": [1, 2], "Martes|Hapunan": [1] } };
  const recipes = new Map([[1, { title: "Adobo", costPerServing: 40, priced: true, partial: false }], [2, { title: "Mystery", costPerServing: 0, priced: false }]]);
  const r = receiptByDish(p, recipes);
  assert.equal(r.total, 240);
  assert.equal(r.byDay.Lunes, 120);
  assert.equal(r.byDay.Martes, 120);
  assert.equal(r.unpriced, 1);
});

test("receipt per ingredient: scaled to the household and summed across dishes", () => {
  const p = { people: 2, slots: { "Lunes|Hapunan": [1], "Martes|Hapunan": [2] } };
  const details = new Map([
    [1, { servings: 4, lines: [{ slug: "garlic", label: "Garlic", text: "6 cloves garlic", gAP: 30, cost: 10, status: "ok", priceSource: "DA" },
                               { slug: "salt", label: "Salt", text: "salt to taste", gAP: null, cost: null, status: "to-taste" }] }],
    [2, { servings: 2, lines: [{ slug: "garlic", label: "Garlic", text: "1 head garlic", gAP: 40, cost: 12, status: "ok", priceSource: "DA" },
                               { slug: "lemongrass", label: "Lemongrass", text: "2 stalks lemongrass", gAP: 30, cost: null, status: "ok" }] }],
  ]);
  const r = receiptByIngredient(p, details);
  const garlic = r.items.find((x) => x.key === "garlic");
  assert.equal(garlic.grams, 30 * 0.5 + 40 * 1); // 2 people of a 4-serving dish, then of a 2-serving dish
  assert.equal(garlic.cost, 10 * 0.5 + 12);
  assert.equal(garlic.dishes, 2);
  assert.equal(r.total, 17);
  assert.equal(r.unpriced, 1); // lemongrass
  assert.equal(r.items.some((x) => x.key === "salt"), false); // to taste isn't bought per recipe
});

test("saved plans round-trip; bad or blocked storage falls back to an empty plan", () => {
  const m = new Map();
  const s = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  assert.equal(savePlan(s, { people: 5, slots: { "Lunes|Almusal": [3] } }), true);
  assert.equal(loadPlan(s).people, 5);
  s.setItem("sarapsulit.planner.v1", "{bad");
  assert.deepEqual(plain(loadPlan(s)), { people: 4, slots: {} });
  const blocked = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
  assert.equal(savePlan(blocked, {}), false);
  assert.equal(formatGrams(1250), "1.3 kg");
  assert.equal(formatGrams(350), "350 g");
});

test("mealTypes: meryenda, almusal and ulam series from title, category and course", () => {
  const t = (title, category = "Main Dish", course = null) => [...mealTypes({ title, category, course })].sort().join(",");
  assert.equal(t("Turon", "Dessert"), "meryenda");
  assert.equal(t("Pancit Canton", "Rice & Noodles"), "meryenda,ulam");
  assert.equal(t("Kwek-kwek", "Main Dish", "Appetizer, Snack"), "meryenda");
  assert.equal(t("Tapsilog"), "almusal,ulam");
  assert.equal(t("Champorado", "Dessert", "Breakfast"), "almusal,meryenda");
  assert.equal(t("Sinigang na Baboy", "Soup", "Main Course"), "ulam");
  assert.equal(t("Pinakbet", "Vegetable Dish"), "ulam");
  assert.equal(t("Leche Flan", "Dessert", "Dessert"), "meryenda");
  assert.equal(t("Mang Tomas Copycat", "Sauce & Condiment", "Sauce, Condiment"), "");
  assert.equal(seriesForMeal("Almusal"), "almusal");
  assert.equal(seriesForMeal("Hapunan"), "ulam");
  assert.equal(seriesForMeal("Meryenda"), "meryenda");
});

test("random week: ulam only fills Tanghalian and Hapunan, no repeats while the pool lasts", () => {
  const pools = { ulam: Array.from({ length: 30 }, (_, n) => 100 + n), almusal: [1, 2], meryenda: [7] };
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const start = { people: 4, slots: { "Lunes|Almusal": [1] } };
  const p = randomWeek(start, pools, { meals: ["Tanghalian", "Hapunan"], rng });
  const ids = plain(plannedDishes(p)).filter((d) => d.meal !== "Almusal").map((d) => d.id);
  assert.equal(ids.length, 14);
  assert.equal(new Set(ids).size, 14);
  assert.ok(ids.every((id) => id >= 100));
  assert.deepEqual(plain(p.slots["Lunes|Almusal"]), [1], "other meals untouched");
});

test("random week: keep leaves filled slots, and a small pool repeats instead of leaving gaps", () => {
  const p0 = { people: 2, slots: { "Lunes|Meryenda": [50] } };
  const p = randomWeek(p0, { almusal: [1], ulam: [2, 3], meryenda: [7] }, { keep: true, rng: () => 0.5 });
  assert.deepEqual(plain(p.slots["Lunes|Meryenda"]), [50]);
  assert.deepEqual(plain(p.slots["Martes|Meryenda"]), [7]);
  assert.equal(plain(plannedDishes(p)).length, 28);
  assert.deepEqual(plain(randomWeek(p0, { ulam: [] }, { meals: ["Hapunan"] }).slots), { "Lunes|Meryenda": [50] });
});
