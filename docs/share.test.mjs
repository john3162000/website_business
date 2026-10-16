// Runs docs/share.js (a plain browser script) in a VM and tests its pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./share.js", import.meta.url), "utf8")}
;globalThis.api = { recipeLink, recipeIdFromHash, shareText, shareFileName, wrapLines };`, ctx);
const { recipeLink, recipeIdFromHash, shareText, shareFileName, wrapLines } = ctx.api;

test("share links open the recipe; other hashes don't", () => {
  assert.equal(recipeLink(315), "https://john3162000.github.io/website_business/#recipe=315");
  assert.equal(recipeIdFromHash("#recipe=315"), 315);
  assert.equal(recipeIdFromHash("#recipe=abc"), null);
  assert.equal(recipeIdFromHash(""), null);
});

test("share text and file name", () => {
  const r = { id: 315, title: "Arroz Caldo (Chicken Rice Porridge)", costPerServing: 32.4, costCoverage: 1 };
  assert.match(shareText(r), /^Arroz Caldo \(Chicken Rice Porridge\): ₱32\.4 per serving\./);
  assert.match(shareText({ ...r, costCoverage: 0.8 }), /₱32\.4\+ per serving/);
  assert.equal(shareFileName(r), "arroz-caldo-chicken-rice-porridge-315.png");
});

test("wrapLines keeps words whole and lines within the width", () => {
  const measure = (s) => s.length * 10;
  const lines = wrapLines("Saute garlic and onion until soft then add the pork", 160, measure);
  assert.ok(lines.every((l) => measure(l) <= 160 || !l.includes(" ")), JSON.stringify(lines));
  assert.equal(lines.join(" "), "Saute garlic and onion until soft then add the pork");
  assert.deepEqual([...wrapLines("a\nb", 100, measure)], ["a", "b"]);
});
