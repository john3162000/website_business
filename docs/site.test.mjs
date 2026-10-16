// Checks on the static site scripts. node --test docs/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

test("site scripts have no stray control characters", () => {
  // A regex written through an unescaped string once turned \b into a backspace
  // byte (0x08), and the course-based categories silently never matched.
  for (const f of ["app.js", "weather.js", "mydish.js", "planner.js", "finder.js", "alerts.js"]) {
    const bad = [...read(f).matchAll(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g)];
    assert.equal(bad.length, 0, `${f}: control character at offset ${bad[0]?.index}`);
  }
});

test("categoryFor: clear courses win, the title decides otherwise", () => {
  const src = read("app.js");
  const ctx = vm.createContext({});
  vm.runInContext(`${src.slice(src.indexOf("function categoryFor"), src.indexOf("// ═══════════════ DATA"))};globalThis.categoryFor = categoryFor;`, ctx);
  const { categoryFor } = ctx;
  assert.equal(categoryFor("Mang Tomas Copycat", "Sauce, Condiment"), "Sauce & Condiment");
  assert.equal(categoryFor("Egg Drop Soup", "Appetizer, Dinner, Main Dish, Soup"), "Soup");
  assert.equal(categoryFor("Leche Flan Cups", "Dessert"), "Dessert");
  assert.equal(categoryFor("Sopas", "Appetizer"), "Soup"); // patchy course, title knows better
  assert.equal(categoryFor("Pork Adobo", "Main Course"), "Main Dish");
  assert.equal(categoryFor("How to Make Sinamak", null), "Sauce & Condiment");
  assert.equal(categoryFor("Chili Garlic Oil Recipe", null), "Sauce & Condiment");
});

test("splitHidden: recipes with an ingredient not in the catalog are hidden, not dropped silently", () => {
  const src = read("app.js");
  const ctx = vm.createContext({});
  vm.runInContext(`${src.slice(src.indexOf("function splitHidden"), src.indexOf("async function loadData"))};globalThis.splitHidden = splitHidden;`, ctx);
  const recipes = [1, 2, 3, 4, 5].map((id) => ({ id, ingredients: id === 5 ? [] : [{ name: "x" }] }));
  const compiled = new Map([
    [1, { id: 1, hidden: false }], [2, { id: 2, hidden: true, unknownLines: 1 }],
    [3, { id: 3, hidden: false, isArticle: true }], [4, { id: 4, hidden: true, isCollection: true }], [5, { id: 5, hidden: false }],
  ]);
  const { shown, hidden } = ctx.splitHidden(recipes, compiled);
  assert.deepEqual(Array.from(shown, (r) => r.id), [1]);
  assert.deepEqual(Array.from(hidden, (r) => r.id), [2]); // articles, round-ups and empty lists are neither
});

test("sulit meter: dishes are placed by how they rank against all others", () => {
  const src = read("app.js");
  const ctx = vm.createContext({});
  vm.runInContext(`${src.slice(src.indexOf("let SULIT_SCORES"), src.indexOf("/** Five-segment meter"))};globalThis.sulitLevel = sulitLevel;`, ctx);
  const scores = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
  assert.equal(ctx.sulitLevel(100, scores).label, "Super sulit"); // better than 99%
  assert.equal(ctx.sulitLevel(75, scores).segs, 4);
  assert.equal(ctx.sulitLevel(50, scores).label, "Okay");
  assert.equal(ctx.sulitLevel(20, scores).label, "Medyo mahal");
  assert.equal(ctx.sulitLevel(1, scores).segs, 1);
  assert.equal(ctx.sulitLevel(5, []), null);
});
