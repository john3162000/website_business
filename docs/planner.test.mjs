// Runs docs/planner.js (a plain browser script) in a VM and tests its pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./planner.js", import.meta.url), "utf8")}
;globalThis.api = { loadPlan, savePlan, addToSlot, removeFromSlot, plannedDishes, receiptByDish, receiptByIngredient, formatGrams, slotKey, mealTypes, seriesForMeal, randomWeek, parseBudgetText, budgetWeek, isMainUlam, proteinKind, dietOk, cheapestByKind, addSavedPlan, groceryText, groceryRows, groceryHtml, grocerySection, groupGrocery, dietsOk, dietNote, meatTypes, meatOk, dropSlots, moveInPlan };`, ctx);
const { loadPlan, savePlan, addToSlot, removeFromSlot, plannedDishes, receiptByDish, receiptByIngredient, formatGrams, slotKey, mealTypes, seriesForMeal, randomWeek, parseBudgetText, budgetWeek, isMainUlam, proteinKind, dietOk, cheapestByKind, addSavedPlan, groceryText, groceryRows, groceryHtml, grocerySection, groupGrocery, dietsOk, dietNote, meatTypes, meatOk, dropSlots, moveInPlan } = ctx.api;
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
  assert.equal(mealTypes({ title: "Cream Cheese Mashed Potatoes", category: "Main Dish" }).has("ulam"), false); // a side, not ulam
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

test("ulam kind: gulay, isda or karne", () => {
  assert.equal(proteinKind({ title: "Pinakbet", category: "Vegetable Dish", ingredientNames: ["pork belly", "bagoong"] }), "gulay");
  assert.equal(proteinKind({ title: "Sinigang na Bangus", category: "Soup" }), "isda");
  assert.equal(proteinKind({ title: "Pork Adobo", category: "Main Dish" }), "karne");
  assert.equal(proteinKind({ title: "Ginataang Sitaw", category: "Main Dish", ingredientNames: ["string beans", "shrimp"] }), "gulay", "sitaw named: a gulay dish");
  assert.equal(proteinKind({ title: "Paksiw", category: "Main Dish", ingredientNames: ["bangus", "vinegar"] }), "isda");
  assert.equal(proteinKind({ title: "Tortang Talong", category: "Main Dish", ingredientNames: ["eggplant", "egg"] }), "gulay");
  assert.equal(proteinKind({ title: "Sotanghon and Egg Noodle Soup", category: "Soup", ingredientNames: ["sotanghon", "egg", "fish sauce"] }), "other", "patis isn't fish; noodle soup isn't gulay");
  assert.equal(proteinKind({ title: "Mamon", category: "Main Dish" }), "other");
  assert.equal(mealTypes({ title: "Mamon", category: "Main Dish" }).has("ulam"), false);
  assert.equal(mealTypes({ title: "Yellow Arroz Caldo", category: "Soup" }).has("ulam"), false);
  assert.equal(proteinKind({ title: "Ginisang Upo", category: "Main Dish" }), "gulay");
  assert.equal(proteinKind({ title: "Ginisang Sardinas", category: "Vegetable Dish" }), "isda");
  assert.equal(proteinKind({ title: "Ginisang Upo with Shrimp", category: "Main Dish" }), "gulay");
  assert.equal(proteinKind({ title: "Sinigang na Hipon", category: "Fish & Seafood" }), "isda");
  for (const t of ["Pandesal", "Crispy Potato Wedges", "Spam and Egg Sandwich", "Fried Chicken Potato Salad"]) {
    assert.equal(mealTypes({ title: t, category: "Main Dish" }).has("ulam"), false, t);
  }
  // Adobong mani is a snack, not an ulam.
  assert.equal(mealTypes({ title: "Adobong Mani Recipe", category: "Main Dish" }).has("ulam"), false);
});

test("diets: each rule keeps the dishes that fit", () => {
  const base = { nutritionCoverage: 1, category: "Main Dish", ingredientNames: [], nutrition: { carbs: 20, fat: 10 }, protein: 30, calories: 400, sodium: 450, frying: null };
  const R = (o) => ({ ...base, ...o, nutrition: { ...base.nutrition, ...(o.nutrition || {}) } });
  assert.equal(dietOk(R({ title: "Chicken Tinola" }), "protein"), true);
  assert.equal(dietOk(R({ title: "Ginisang Sayote", protein: 6 }), "protein"), false);
  assert.equal(dietOk(R({ title: "Leche Flan", category: "Dessert" }), "diabetic"), false);
  assert.equal(dietOk(R({ title: "Pancit Bihon", category: "Rice & Noodles" }), "diabetic"), false);
  assert.equal(dietOk(R({ title: "Lechon Kawali", frying: "deep" }), "heart"), false);
  assert.equal(dietOk(R({ title: "Steamed Fish", sodium: null }), "heart"), false, "unknown sodium doesn't pass");
  assert.equal(dietOk(R({ title: "Steamed Fish", protein: 18 }), "kidney"), true);
  assert.equal(dietOk(R({ title: "Hotdog with Egg", protein: 15 }), "kidney"), false);
  assert.equal(dietOk(R({ title: "Adobong Atay" }), "gout"), false);
  assert.equal(dietOk(R({ title: "Ginataang Hipon" }), "gout"), false);
  assert.equal(dietOk(R({ title: "Chicken Tinola" }), "gout"), true);
  assert.equal(dietOk(R({ title: "Bulalo", calories: 700 }), "lowcal"), false);
  assert.equal(dietOk(R({ title: "Anything", nutritionCoverage: 0.3 }), "protein"), false, "thin nutrition data");
  assert.equal(dietOk(R({ title: "Anything" }), "all"), true);
});

test("cheapest today: three of each kind, complete prices only, cheapest first", () => {
  const R = (id, title, category, cost, o = {}) => ({ id, title, category, costPerServing: cost, ranked: true, costIncomplete: false, protein: 15, ingredientNames: [], ...o });
  const list = [
    R(1, "Ginisang Monggo", "Vegetable Dish", 18), R(2, "Pinakbet", "Vegetable Dish", 25), R(3, "Ginisang Sayote", "Vegetable Dish", 15),
    R(4, "Paksiw na Galunggong", "Fish & Seafood", 30), R(5, "Fried Tilapia", "Fish & Seafood", 28),
    R(6, "Pork Adobo", "Main Dish", 45), R(7, "Chicken Tinola", "Soup", 40), R(8, "Beef Steak", "Main Dish", 20, { costIncomplete: true }),
    R(9, "Ginisang Upo", "Vegetable Dish", 12), R(10, "Ginisang Upo", "Vegetable Dish", 11),
  ];
  const c = plain(cheapestByKind(list, 3));
  assert.deepEqual(c.gulay.map((r) => r.id), [10, 3, 1], "one Ginisang Upo, cheapest first");
  assert.deepEqual(c.isda.map((r) => r.id), [5, 4]);
  assert.deepEqual(c.karne.map((r) => r.id), [7, 6], "incomplete price left out");
});

test("random week: gulay → isda → karne take turns, leaning to the cheapest", () => {
  const pools = { ulam: [1, 2, 3], gulay: [10, 11, 12, 13, 14, 15, 16], isda: [20, 21, 22, 23, 24, 25, 26], karne: [30, 31, 32, 33, 34, 35, 36] };
  const p = randomWeek({ people: 4, slots: {} }, pools, { meals: ["Tanghalian", "Hapunan"], alternate: true, rng: () => 0 });
  const ids = plain(plannedDishes(p)).map((d) => d.id);
  const kind = (id) => (id < 20 ? "g" : id < 30 ? "i" : "k");
  assert.equal(ids.map(kind).join(""), "gikgikgikgikgi");
  assert.equal(ids[0], 10, "cheapest gulay first");
});

test("saved plans: newest first, same name replaces, at most 8, copies not shared", () => {
  const p = { people: 4, slots: { "Lunes|Hapunan": [1] } };
  let list = addSavedPlan([], "Week 1", p, 1);
  p.slots["Lunes|Hapunan"].push(2); // later edits don't change the saved copy
  assert.deepEqual(plain(list[0].plan.slots), { "Lunes|Hapunan": [1] });
  list = addSavedPlan(list, "Week 2", p, 2);
  list = addSavedPlan(list, " Week 1 ", p, 3);
  assert.deepEqual(plain(list.map((x) => x.name)), ["Week 1", "Week 2"]);
  for (let i = 0; i < 10; i++) list = addSavedPlan(list, `W${i}`, p, 10 + i);
  assert.equal(list.length, 8);
  assert.equal(addSavedPlan([], "  ", p)[0].name, "Plano");
});

test("grocery list text: one checkbox line per ingredient, then the total", () => {
  const receipt = { items: [
    { label: "Pork belly", grams: 1200, cost: 330.4, priced: true, unpricedGrams: 0 },
    { label: "Kangkong", grams: 450, cost: 0, priced: false, unpricedGrams: 450 },
  ], total: 330.4, unpriced: 1 };
  const t = groceryText(receipt, 4, "October 22, 2026");
  assert.match(t, /Para sa 4 tao · October 22, 2026/);
  assert.match(t, /🥩 Karne\n☐ Pork belly: 1\.2 kg · ≈₱330\n\n🥬 Gulay\n☐ Kangkong: 450 g\n/);
  assert.match(t, /Total ≈ ₱330 \(\+ 1 na walang presyo pa\)/);
});

test("grocery picture rows: amount to buy and price, — when unpriced", () => {
  const rows = groceryRows({ items: [
    { label: "Pork belly", grams: 1200, cost: 330.4, priced: true, unpricedGrams: 0 },
    { label: "Calamansi", grams: 80, cost: 12, priced: true, unpricedGrams: 20 },
    { label: "Kangkong", grams: 450, cost: 0, priced: false, unpricedGrams: 450 },
    { label: "Parsley flakes", grams: 0.3, cost: 1, priced: true, unpricedGrams: 0 },
  ] });
  // Grouped by palengke section, a heading row first.
  assert.deepEqual(plain(rows), [
    { heading: "🥩 Karne" },
    { label: "Pork belly", qty: "1.2 kg", price: "₱330" },
    { heading: "🥬 Gulay" },
    { label: "Kangkong", qty: "450 g", price: "—" },
    { label: "Parsley flakes", qty: "<1 g", price: "₱1" },
    { heading: "🍌 Prutas" },
    { label: "Calamansi", qty: "80 g", price: "₱12+" },
  ]);
});

test("grocery HTML file: one checkbox per ingredient, total, and text is escaped", () => {
  const html = groceryHtml({ items: [
    { label: "Pork belly", grams: 1200, cost: 330.4, priced: true, unpricedGrams: 0 },
    { label: "<script>alert(1)</script>", grams: 50, cost: 0, priced: false, unpricedGrams: 50 },
  ], total: 330.4, unpriced: 1 }, 4, "October 23, 2026");
  assert.match(html, /^<!doctype html>/);
  assert.equal((html.match(/type="checkbox"/g) || []).length, 2);
  assert.match(html, /Pork belly<\/span><span class="q">1\.2 kg<\/span><span class="p">₱330</);
  assert.match(html, /Para sa 4 tao · October 23, 2026/);
  assert.match(html, /≈ ₱330/);
  assert.match(html, /<li class="h">🥩 Karne<\/li>/);
  assert.ok(!html.includes("<script>alert(1)"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

test("grocery sections: catalog items go to the right palengke section", () => {
  const sec = (key, label = "") => grocerySection({ key, label });
  for (const k of ["milkfish", "shrimp", "squid", "fish_dried", "anchovies_dried", "tinapa"]) assert.equal(sec(k), "isda", k);
  for (const k of ["pork_belly", "beef_shank", "chicken_thigh", "pork_ground", "chicken_ground", "longganisa", "hotdog_cheese"]) assert.equal(sec(k), "karne", k);
  for (const k of ["kangkong", "eggplant", "garlic", "onion_red", "tofu_firm", "lemongrass", "papaya_green", "sitaw"]) assert.equal(sec(k), "gulay", k);
  for (const k of ["calamansi", "banana_saba", "mango_ripe", "buko_meat"]) assert.equal(sec(k), "prutas", k);
  for (const k of ["egg_chicken", "salted_duck_egg", "milk_evaporated", "cheese_cheddar", "butter"]) assert.equal(sec(k), "itlog", k);
  for (const k of ["pandesal", "bread_crumbs", "lumpia_wrapper", "wonton_wrapper"]) assert.equal(sec(k), "tinapay", k);
  for (const k of ["fish_sauce", "soy_sauce", "vinegar_cane_white", "salt", "black_pepper", "shrimp_paste", "bay_leaf", "cumin_ground", "stock_cube_pork"]) assert.equal(sec(k), "pampalasa", k);
  for (const k of ["rice_white_raw", "oil_cooking", "sugar_white", "noodles_bihon", "coconut_milk", "sardines_tomato_sauce", "corned_beef", "tuna_canned", "broth_chicken", "mung_beans"]) assert.equal(sec(k), "pantry", k);
  // Items without a slug fall back to the label.
  assert.equal(sec(undefined, "Bangus belly"), "isda");
});

test("grocery groups follow the palengke order and skip empty sections", () => {
  const groups = groupGrocery([{ key: "salt" }, { key: "kangkong" }, { key: "milkfish" }, { key: "garlic" }]);
  assert.deepEqual(plain(groups.map((g) => g.key)), ["isda", "gulay", "pampalasa"]);
  assert.deepEqual(plain(groups[1].items.map((i) => i.key)), ["kangkong", "garlic"]);
});

test("several diets: a dish must pass every one; the note keeps the guidance line", () => {
  const base = { nutritionCoverage: 1, nutrition: { carbs: 20, fat: 10 }, sodium: 300, ingredientNames: [] };
  const light = { ...base, title: "Ginisang Sayote", calories: 200, protein: 8 };
  const liver = { ...base, title: "Ginisang Atay", calories: 300, protein: 20, ingredientNames: ["pork liver"] };
  const heavy = { ...base, title: "Pork Stew", calories: 700, protein: 30 };
  assert.equal(dietsOk(light, ["lowcal", "gout"]), true);
  assert.equal(dietsOk(liver, ["lowcal", "gout"]), false); // low calorie, but organ meat
  assert.equal(dietsOk(heavy, ["lowcal", "gout"]), false); // fine for gout, too many calories
  assert.equal(dietsOk(heavy, []), true);
  const note = dietNote(["lowcal", "gout"]);
  assert.match(note, /Gout \/ uric acid: .*Low calorie: |Low calorie: .*Gout \/ uric acid: /);
  assert.match(note, /Gabay lang ito/);
  assert.match(dietNote(["gout"], true), /Guidance only/);
  assert.equal(dietNote([]), "");
});

test("meat types: fish from isda dishes; chicken, pork and beef from karne titles, then ingredients", () => {
  const types = (r) => [...meatTypes({ category: "Main Dish", ingredientNames: [], ...r })].sort();
  assert.deepEqual(types({ title: "Sinigang na Bangus" }), ["fish"]);
  assert.deepEqual(types({ title: "Chicken Adobo" }), ["chicken"]);
  assert.deepEqual(types({ title: "Pork and Chicken Adobo" }), ["chicken", "pork"]);
  assert.deepEqual(types({ title: "Bulalo", category: "Soup" }), ["beef"]);
  assert.deepEqual(types({ title: "Kare-Kare", ingredientNames: ["oxtail", "peanut butter"] }), ["beef"]);
  assert.deepEqual(types({ title: "Menudo", ingredientNames: ["pork shoulder", "liver"] }), ["pork"]);
  assert.deepEqual(types({ title: "Pinakbet", category: "Vegetable Dish", ingredientNames: ["pork belly"] }), []);
  assert.deepEqual(types({ title: "Lechon Kawali" }), ["pork"]);
  assert.deepEqual(types({ title: "Lechon Manok" }), ["chicken"]);
  assert.deepEqual(types({ title: "Chicken Igado" }), ["chicken"]);
  assert.deepEqual(types({ title: "Lechon Sauce Recipe" }), []);
  assert.deepEqual(types({ title: "Liver Sauce", category: "Sauce & Condiment", ingredientNames: ["pork liver"] }), []);
  const adobo = { title: "Chicken Adobo", category: "Main Dish", ingredientNames: [] };
  assert.equal(meatOk(adobo, ["pork", "chicken"]), true);
  assert.equal(meatOk(adobo, ["fish"]), false);
  assert.equal(meatOk(adobo, []), true);
});

test("drag and drop: only meals the dish suits, not full, not already there", () => {
  let p = { people: 4, slots: { "Lunes|Tanghalian": [7], "Martes|Hapunan": [1, 2, 3, 4, 5] } };
  const ulam = dropSlots(p, 7, new Set(["ulam"]));
  assert.equal(ulam.has("Lunes|Tanghalian"), false); // already there
  assert.equal(ulam.has("Martes|Hapunan"), false); // full
  assert.equal(ulam.has("Lunes|Almusal"), false); // not a breakfast dish
  assert.equal(ulam.has("Lunes|Hapunan"), true);
  assert.equal(ulam.size, 7 * 2 - 2);
  assert.equal(dropSlots(p, 9, new Set(["meryenda", "almusal"])).size, 14);
  assert.equal(dropSlots(p, 9, new Set()).size, 27); // unknown kind: any slot with room
  assert.equal(dropSlots(p, 7, new Set(["ulam"]), "Lunes|Tanghalian").has("Lunes|Tanghalian"), false);
  p = moveInPlan(p, "Lunes|Tanghalian", "Linggo|Hapunan", 7);
  assert.deepEqual(plain(p.slots), { "Martes|Hapunan": [1, 2, 3, 4, 5], "Linggo|Hapunan": [7] });
  assert.equal(moveInPlan(p, "Linggo|Hapunan", "Martes|Hapunan", 7), p); // full: nothing moves
});
