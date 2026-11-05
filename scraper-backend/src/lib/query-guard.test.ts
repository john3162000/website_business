import { test } from "node:test";
import assert from "node:assert/strict";
import { checkQuery, intIn, isId, oneOf, textUpTo } from "./query-guard.ts";
import { clearMemo, memo } from "./memo.ts";

const API = "https://website-business-beta.vercel.app/api/recipes/compiled";

test("a route with no params refuses any query string (cache busting)", () => {
  assert.equal(checkQuery(API).ok, true);
  assert.equal(checkQuery(`${API}?`).ok, true);
  assert.equal(checkQuery(`${API}?x=1`).ok, false);
  assert.equal(checkQuery(`${API}?_=${Date.now()}`).ok, false);
});

test("ids must be plain positive integers", () => {
  const rules = { id: isId };
  assert.equal(checkQuery(`${API}?id=123`, rules).ok, true);
  for (const bad of ["abc", "0", "012", "12abc", "-5", "1.5", "", "1e3", "9999999999"]) {
    assert.equal(checkQuery(`${API}?id=${bad}`, rules).ok, false, bad);
  }
});

test("allowed params still refuse extras, repeats and out-of-range values", () => {
  const rules = { days: oneOf("7", "14", "30"), limit: intIn(1, 50) };
  const url = "https://x.test/api/recipes/price-movers";
  assert.equal(checkQuery(`${url}?limit=50&days=7`, rules).ok, true);
  assert.equal(checkQuery(`${url}?days=8`, rules).ok, false);
  assert.equal(checkQuery(`${url}?limit=51`, rules).ok, false);
  assert.equal(checkQuery(`${url}?limit=010`, rules).ok, false);
  assert.equal(checkQuery(`${url}?days=7&days=14`, rules).ok, false);
  assert.equal(checkQuery(`${url}?days=7&cb=1`, rules).ok, false);
  // Inherited object keys are not params.
  assert.equal(checkQuery(`${url}?constructor=1`, rules).ok, false);
});

test("search text has a length cap", () => {
  const rules = { q: textUpTo(60) };
  assert.equal(checkQuery(`https://x.test/api/nutrition?q=pork`, rules).ok, true);
  assert.equal(checkQuery(`https://x.test/api/nutrition?q=${"a".repeat(61)}`, rules).ok, false);
  assert.equal(checkQuery(`https://x.test/api/nutrition?q=%20`, rules).ok, false);
});

test("memo reuses a load within its time and drops failures", async () => {
  clearMemo();
  let t = 0, calls = 0;
  const load = async () => ++calls;
  assert.equal(await memo("k", 1000, load, () => t), 1);
  t = 999;
  assert.equal(await memo("k", 1000, load, () => t), 1);
  t = 1000;
  assert.equal(await memo("k", 1000, load, () => t), 2);

  let fail = true;
  const flaky = async () => { if (fail) throw new Error("db down"); return "ok"; };
  await assert.rejects(memo("f", 1000, flaky, () => t));
  fail = false;
  assert.equal(await memo("f", 1000, flaky, () => t), "ok");
});
