// Runs docs/visits.js (a plain browser script) in a VM and tests its pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./visits.js", import.meta.url), "utf8")}
;globalThis.api = { visitAllowed, visitPayload };`, ctx);
const { visitAllowed, visitPayload } = ctx.api;

test("a visit is counted unless the browser asks not to be tracked", () => {
  assert.equal(visitAllowed({ doNotTrack: null }), true);
  assert.equal(visitAllowed({ doNotTrack: "1" }), false);
  assert.equal(visitAllowed({ doNotTrack: "unspecified", globalPrivacyControl: true }), false);
  assert.equal(visitAllowed({ msDoNotTrack: "1" }), false);
  assert.equal(visitAllowed({ webdriver: true }), false);
  assert.equal(visitAllowed(null), false);
});

test("the visit body carries only the section and the language", () => {
  assert.deepEqual(JSON.parse(visitPayload("planner", "tl")), { page: "planner", lang: "tl" });
  assert.deepEqual(JSON.parse(visitPayload(undefined, "fr")), { page: "home", lang: "en" });
});
