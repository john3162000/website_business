// Runs docs/mydish.js (a plain browser script) in a VM and tests its pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./mydish.js", import.meta.url), "utf8")}
;globalThis.api = { loadDishes, saveDishes, upsertDish, dishFromRecipe, comparableHistory, sparkPath, dishUnitKey, dishUnitsFor, dishAmountValue, dishLineIssue };`, ctx);
const { loadDishes, saveDishes, upsertDish, dishFromRecipe, comparableHistory, sparkPath, dishUnitKey, dishUnitsFor, dishAmountValue, dishLineIssue } = ctx.api;

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

test("saved dishes round-trip; bad or blocked storage doesn't throw", () => {
  const s = memoryStorage();
  assert.deepEqual([...loadDishes(s)], []);
  assert.equal(saveDishes(s, [{ id: "a", title: "Adobo", lines: [] }]), true);
  assert.equal(loadDishes(s)[0].title, "Adobo");
  s.setItem("sarapsulit.dishes.v1", "{not json");
  assert.deepEqual([...loadDishes(s)], []);
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.deepEqual([...loadDishes(blocked)], []);
  assert.equal(saveDishes(blocked, []), false);
});

test("upsertDish replaces by id, else adds first", () => {
  const list = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
  assert.deepEqual([...upsertDish(list, { id: "b", title: "B2" }).map((d) => d.title)], ["A", "B2"]);
  assert.deepEqual([...upsertDish(list, { id: "c", title: "C" }).map((d) => d.title)], ["C", "A", "B"]);
});

test("dishFromRecipe: editable lines, group headings dropped", () => {
  const d = dishFromRecipe({ id: 7, title: "Sinigang", servings: 6, ingredients: [
    { name: "Marinade ingredients:", amount: null, unit: null },
    { name: "pork belly", amount: "2", unit: "lbs" },
    { name: "salt", amount: null, unit: null },
  ] });
  assert.equal(d.title, "My Sinigang");
  assert.equal(d.servings, 6);
  assert.equal(d.fromRecipeId, 7);
  assert.deepEqual([...d.lines].map((l) => [...[l.amount, l.unit, l.name]]), [["2", "lbs", "pork belly"], ["", "", "salt"]]);
});

test("comparableHistory drops days where less of the dish was priced", () => {
  const h = [
    { date: "2026-09-14", cost: 40, costCoverage: 0.9 },
    { date: "2026-09-15", cost: 25, costCoverage: 0.6 }, // a DA price missing that day
    { date: "2026-09-16", cost: null, costCoverage: null },
    { date: "2026-10-13", cost: 38, costCoverage: 0.92 },
  ];
  assert.deepEqual([...comparableHistory(h, 0.92).map((p) => p.cost)], [40, 38]);
});

test("sparkPath scales points into the box", () => {
  assert.equal(sparkPath([{ date: "2026-09-14", cost: 1 }]), null);
  const p = sparkPath([{ date: "2026-09-14", cost: 10 }, { date: "2026-10-14", cost: 20 }], 100, 50, 0);
  assert.equal(p, "M0.0,50.0 L100.0,0.0");
});

test("units: only the ones that give an ingredient a weight", () => {
  assert.equal(dishUnitKey("lbs"), "lb");
  assert.equal(dishUnitKey("Tablespoons."), "tbsp");
  assert.equal(dishUnitKey("kutsara"), "tbsp");
  assert.equal(dishUnitKey(""), "");
  // Hotdog: weight, cups/spoons and pieces all work; pork belly only by weight.
  assert.deepEqual([...dishUnitsFor(["g", "kg", "cup", "tbsp", "tsp", "piece"])], ["g", "kg", "lb", "oz", "cup", "tbsp", "tsp", "ml", "l", "piece"]);
  assert.deepEqual([...dishUnitsFor(["g", "kg"])], ["g", "kg", "lb", "oz"]);
  assert.equal(dishUnitsFor(undefined), null);
});

test("amounts: fractions, ranges and a minimum above zero", () => {
  assert.equal(dishAmountValue("1 1/2"), 1.5);
  assert.equal(dishAmountValue("½"), 0.5);
  assert.equal(dishAmountValue("2-3"), 2.5);
  assert.equal(dishAmountValue("0.25"), 0.25);
  assert.equal(dishAmountValue("abc"), null);
  assert.equal(dishAmountValue(""), null);
});

test("line hints: wrong unit, missing or zero amount, can't weigh", () => {
  const belly = dishUnitsFor(["g", "kg"]), hotdog = dishUnitsFor(["g", "kg", "cup", "tbsp", "tsp", "piece"]);
  assert.match(dishLineIssue({ amount: "2", unit: "piece", name: "pork belly" }, belly, null, "pork belly"), /Hindi mabilang ang "piece" para sa pork belly\. Gamitin ang: gramo \(g\), kilo \(kg\), libra \(lb\), onsa \(oz\)\./);
  assert.equal(dishLineIssue({ amount: "2", unit: "pcs", name: "hotdog" }, hotdog, "ok", "hotdog"), null);
  assert.equal(dishLineIssue({ amount: "100", unit: "g", name: "hotdog" }, hotdog, "ok", "hotdog"), null);
  assert.equal(dishLineIssue({ amount: "3", unit: "oz", name: "hotdog" }, hotdog, "ok", "hotdog"), null);
  assert.match(dishLineIssue({ amount: "2", unit: "", name: "pork belly" }, belly, null, "pork belly"), /Pumili ng unit/);
  assert.match(dishLineIssue({ amount: "0", unit: "g", name: "garlic" }, null, null), /higit sa 0/);
  assert.match(dishLineIssue({ amount: "", unit: "g", name: "garlic" }, null, null), /Lagyan ng dami/);
  assert.equal(dishLineIssue({ amount: "", unit: "", name: "Salt to taste" }, null, null), null, "to taste needs no amount");
  assert.match(dishLineIssue({ amount: "2", unit: "bundle", name: "kangkong" }, null, "no-weight"), /Hindi matimbang/);
  assert.match(dishLineIssue({ amount: "1", unit: "piece", name: "dragon scale" }, null, "unmatched"), /Hindi pa namin kilala/);
  assert.match(dishLineIssue({ amount: "2", unit: "piece", name: "pork belly" }, belly, null, "pork belly", true), /doesn't work for pork belly/);
});
