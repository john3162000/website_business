// Checks on the static site scripts. node --test docs/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

test("site scripts have no stray control characters", () => {
  // A regex written through an unescaped string once turned \b into a backspace
  // byte (0x08), and the course-based categories silently never matched.
  for (const f of ["app.js", "weather.js"]) {
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
