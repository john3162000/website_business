// Runs docs/planner.js (a plain browser script) in a VM and tests its pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./planner.js", import.meta.url), "utf8")}
;globalThis.api = { loadPlan, savePlan, addToSlot, removeFromSlot, plannedDishes, receiptByDish, receiptByIngredient, formatGrams, slotKey };`, ctx);
const { loadPlan, savePlan, addToSlot, removeFromSlot, plannedDishes, receiptByDish, receiptByIngredient, formatGrams, slotKey } = ctx.api;
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
