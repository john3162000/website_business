// Runs docs/kitchen.js (a plain browser script) in a VM and tests the appliance filter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./kitchen.js", import.meta.url), "utf8")}
;globalThis.api = { canCook, kitchenStandIns, applianceCounts, KITCHEN_ITEMS, KITCHEN_FACTS };`, ctx);
const { canCook, kitchenStandIns, applianceCounts, KITCHEN_ITEMS, KITCHEN_FACTS } = ctx.api;
const S = (...a) => new Set(["stove", ...a]);

test("stove-only dishes always fit; missing appliances don't", () => {
  assert.equal(canCook([], S()), true);
  assert.equal(canCook(undefined, S()), true);
  assert.equal(canCook(["oven"], S()), false);
  assert.equal(canCook(["oven", "mixer"], S("oven")), false);
  assert.equal(canCook(["oven", "mixer"], S("oven", "mixer")), true);
});

test("an air fryer stands in for an oven and the other way round", () => {
  assert.equal(canCook(["oven"], S("air_fryer")), true);
  assert.equal(canCook(["air_fryer"], S("oven")), true);
  assert.equal(canCook(["grill"], S("air_fryer")), true);
  assert.equal(canCook(["blender"], S("air_fryer", "oven")), false);
  assert.deepEqual(Array.from(kitchenStandIns(S("air_fryer"))), ["oven<-air_fryer", "grill<-air_fryer"]);
  assert.deepEqual(Array.from(kitchenStandIns(S("oven", "air_fryer"))), ["grill<-oven"]);
  for (const k of kitchenStandIns(S("air_fryer", "pressure_cooker", "rice_cooker"))) assert.ok(KITCHEN_FACTS[k], k);
});

test("applianceCounts and the item list", () => {
  const { counts, stoveOnly } = applianceCounts([{ appliances: ["oven"] }, { appliances: ["oven", "mixer"] }, { appliances: [] }, {}]);
  assert.equal(counts.oven, 2);
  assert.equal(counts.mixer, 1);
  assert.equal(stoveOnly, 2);
  assert.equal(KITCHEN_ITEMS.filter((i) => i.always).length, 1);
});
