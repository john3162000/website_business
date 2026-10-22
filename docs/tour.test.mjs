// Runs docs/tour.js (a plain browser script) in a VM and tests its pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./tour.js", import.meta.url), "utf8")}
;globalThis.api = { TOUR_STEPS, shouldAutoTour, markTourDone };`, ctx);
const { TOUR_STEPS, shouldAutoTour, markTourDone } = ctx.api;

test("tour: first visit only, never over a shared recipe link", () => {
  const m = new Map();
  const s = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  assert.equal(shouldAutoTour(s, ""), true);
  assert.equal(shouldAutoTour(s, "#recipe=315"), false);
  markTourDone(s);
  assert.equal(shouldAutoTour(s, ""), false);
  const blocked = { getItem: () => { throw new Error("blocked"); } };
  assert.equal(shouldAutoTour(blocked, ""), false);
});

test("tour: every step names a real tab and has short text", () => {
  const tabs = new Set(["home", "browse", "prices", "mydish", "planner", "finder", "game"]);
  assert.ok(TOUR_STEPS.length >= 6 && TOUR_STEPS.length <= 10);
  for (const st of TOUR_STEPS) {
    assert.ok(tabs.has(st.section), st.section);
    assert.ok(st.title && st.text && st.text.length < 260, st.title);
  }
});
