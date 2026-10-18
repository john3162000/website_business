// Runs docs/facts.js (a plain browser script) in a VM and tests which facts a dish gets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./facts.js", import.meta.url), "utf8")}
;globalThis.api = { dishFacts, FACTS_DISH, FACTS_INGREDIENT };`, ctx);
const { dishFacts, FACTS_DISH, FACTS_INGREDIENT } = ctx.api;

test("dish facts come first, then up to two ingredient facts", () => {
  const f = Array.from(dishFacts({ title: "Chicken Tinola Recipe", ingredientNames: ["chicken", "ginger", "malunggay leaves", "patis"] }));
  assert.match(f[0], /Noli Me Tangere/);
  assert.equal(f.length, 4); // 2 tinola facts + malunggay + patis (ginger is the 3rd ingredient match, dropped)
  assert.match(f[2], /Malunggay/);
});

test("a dish with no title match still gets ingredient facts; unknown dishes get none", () => {
  assert.equal(dishFacts({ title: "Ginisang Kangkong", ingredientNames: ["kangkong"] }).length, 1);
  assert.equal(dishFacts({ title: "Plain Rice", ingredientNames: ["rice"] }).length, 0);
});

test("lechon kawali doesn't get the whole-lechon facts", () => {
  const f = Array.from(dishFacts({ title: "Lechon Kawali", ingredientNames: [] }));
  assert.equal(f.length, 1);
  assert.match(f[0], /Kawali/);
});

test("facts are non-empty sentences", () => {
  for (const [, facts] of FACTS_DISH) for (const t of facts) assert.match(t, /\S.*[.!?]$/);
  for (const [, t] of FACTS_INGREDIENT) assert.match(t, /\S.*[.!?]$/);
});
