// Runs docs/planner.js (a plain browser script) in a VM and tests its pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./planner.js", import.meta.url), "utf8")}
;globalThis.api = { loadPlan, savePlan, addToSlot, removeFromSlot, plannedDishes, receiptByDish, receiptByIngredient, formatGrams, slotKey, mealTypes, seriesForMeal, randomWeek, parseBudgetText, budgetWeek, isMainUlam };`, ctx);
const { loadPlan, savePlan, addToSlot, removeFromSlot, plannedDishes, receiptByDish, receiptByIngredient, formatGrams, slotKey, mealTypes, seriesForMeal, randomWeek, parseBudgetText, budgetWeek, isMainUlam } = ctx.api;
const plain = (v) => JSON.parse(JSON.stringify(v));

test("slots: add without duplicates, at most 5, remove clears empty slots", () => {
  let p = { people: 4, slots: {} };
  const k = slotKey("Lunes", "Almusal");
  p = addToSlot(addToSlot(p, k, 1), k, 1);
  assert.deepEqual(plain(p.slots[k]), [1]);
  for (const id of [2, 3, 4, 5, 6]) p = addToSlot(p, k, id);
  assert.deepEqual(plain(p.slots[k]), [1, 2, 3, 4, 5]);
  for (const id of [1, 2, 3, 4, 5]) p = removeFromSlot(p, k, id);
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

test("random week: two or three ulam per meal, all different; almusal and meryenda stay one", () => {
  const pools = { ulam: Array.from({ length: 60 }, (_, n) => 100 + n), almusal: [1, 2, 3, 4, 5, 6, 7, 8], meryenda: [20, 21, 22, 23, 24, 25, 26, 27] };
  const p = randomWeek({ people: 4, slots: {} }, pools, { ulamPerMeal: 3, rng: () => 0.3 });
  assert.equal(plain(p.slots["Lunes|Tanghalian"]).length, 3);
  assert.equal(plain(p.slots["Lunes|Almusal"]).length, 1);
  const ulam = plain(plannedDishes(p)).filter((d) => d.meal === "Tanghalian" || d.meal === "Hapunan").map((d) => d.id);
  assert.equal(ulam.length, 42);
  assert.equal(new Set(ulam).size, 42, "60 dishes in the pool: no repeats");
  // A slot never holds the same dish twice, even when the pool runs out.
  const small = randomWeek({ people: 4, slots: {} }, { ulam: [1, 2] }, { meals: ["Hapunan"], ulamPerMeal: 3 });
  assert.deepEqual(plain(small.slots["Lunes|Hapunan"]).sort(), [1, 2]);
});

test("budget text: peso amounts, k, and people in English or Tagalog", () => {
  assert.deepEqual(plain(parseBudgetText("₱1,500 for the week, 4 people")), { budget: 1500, people: 4 });
  assert.deepEqual(plain(parseBudgetText("1500 pesos 4 tao")), { budget: 1500, people: 4 });
  assert.deepEqual(plain(parseBudgetText("budget 2k for 5")), { budget: 2000, people: 5 });
  assert.deepEqual(plain(parseBudgetText("₱800")), { budget: 800, people: null });
  assert.deepEqual(plain(parseBudgetText("hello")), { budget: null, people: null });
});

test("budget week: most nutritious dishes that fit, total within budget", () => {
  // 14 ulam slots (Tanghalian + Hapunan), 2 people.
  const recipes = new Map([
    [1, { costPerServing: 100, nutritionScore: 90, valueScore: 3 }],   // great but pricey
    [2, { costPerServing: 30, nutritionScore: 60, valueScore: 8 }],
    [3, { costPerServing: 25, nutritionScore: 50, valueScore: 8 }],
    [4, { costPerServing: 20, nutritionScore: 40, valueScore: 8 }],
    [5, { costPerServing: 15, nutritionScore: 30, valueScore: 8 }],
  ]);
  const pools = { ulam: [1, 2, 3, 4, 5] };
  const r = budgetWeek(pools, recipes, { budget: 1000, people: 2, meals: ["Tanghalian", "Hapunan"] });
  const ids = plain(plannedDishes(r.plan)).map((d) => d.id);
  assert.equal(ids.length, 14);
  assert.ok(r.fits && r.total <= 1000, `total ${r.total}`);
  assert.equal(ids.includes(1), true, "the leftover pays for the best dish once");
  // Too small a budget: the cheapest week, reported as over.
  const tight = budgetWeek(pools, recipes, { budget: 100, people: 2, meals: ["Tanghalian", "Hapunan"] });
  assert.equal(tight.fits, false);
});

test("meal types: kakanin and sweets are meryenda, never ulam, even when filed as a main dish", () => {
  const t = (title, category = "Main Dish", course = null) => [...mealTypes({ title, category, course })].sort().join(",");
  assert.equal(t("Ube Pichi Pichi Recipe"), "meryenda");
  assert.equal(t("Cassava Suman"), "meryenda");
  assert.equal(t("Yema Recipe"), "meryenda");
  assert.equal(t("Chicken Pot Pie"), "ulam");
  assert.equal(t("Pancit Canton"), "meryenda,ulam");
  assert.equal(t("Champorado"), "almusal,meryenda");
  assert.equal(t("Burong Mustasa (Pickled Flat Mustard Greens)"), "");
  assert.equal(t("How to Make Potato Chips on the Stovetop", "Vegetable Dish"), "meryenda");
  assert.equal(t("Crispy Pata"), "ulam");
});

test("main ulam: real mains with protein; not sides of rice, egg how-tos or sweets", () => {
  const R = (title, category, protein) => ({ title, category, protein });
  assert.equal(isMainUlam(R("Chicken Adobo", "Main Dish", 30)), true);
  assert.equal(isMainUlam(R("Sinigang na Baboy", "Soup", 22)), true);
  assert.equal(isMainUlam(R("Cilantro Lime Rice", "Rice & Noodles", 4)), false);
  assert.equal(isMainUlam(R("How to Make Hard Boiled Eggs", "Main Dish", 12)), false);
  assert.equal(isMainUlam(R("Ginisang Sitaw", "Vegetable Dish", 3)), false);
  assert.equal(mealTypes({ title: "Minatamis na Saging", category: "Main Dish" }).has("ulam"), false);
  for (const t of ["Brazo de Mercedes", "Yummy Blueberry Pancake", "Nilupak Recipe", "Baked Chicken Nuggets", "Tokneneng Recipe"]) {
    assert.equal(mealTypes({ title: t, category: "Main Dish" }).has("ulam"), false, t);
  }
  assert.equal(mealTypes({ title: "Yummy Blueberry Pancake", category: "Main Dish" }).has("almusal"), true);
});
