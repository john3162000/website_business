// Runs docs/pricecal.js (a plain browser script) in a VM and tests its pure helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./pricecal.js", import.meta.url), "utf8")}
;globalThis.api = { pcalLocal, pcalPct, pcalPicks, pcalTone, pcalMonthList };`, ctx);
const { pcalLocal, pcalPct, pcalPicks, pcalTone, pcalMonthList } = ctx.api;
const names = (xs) => xs.map((p) => p.name).join(",");

test("PSA names get their palengke names", () => {
  assert.equal(pcalLocal("Tomato"), "Kamatis");
  assert.equal(pcalLocal("Onion, red"), "Pulang sibuyas");
  assert.equal(pcalLocal("Onion, white"), "Sibuyas");
  assert.equal(pcalLocal("Tahong"), "Tahong");
  assert.equal(pcalLocal("Lanzones"), "Lanzones");
});

test("the index reads as a percent against the usual price, and as a calendar tone", () => {
  assert.equal(pcalPct(0.82), -18);
  assert.equal(pcalPct(1.07), 7);
  assert.equal(pcalTone(0.85), "cheap2");
  assert.equal(pcalTone(0.93), "cheap1");
  assert.equal(pcalTone(1), "even");
  assert.equal(pcalTone(1.06), "dear1");
  assert.equal(pcalTone(1.2), "dear2");
  assert.equal(pcalTone(null), "na");
});

test("a month's picks: cheap and dear, strongest first, flat items left out", () => {
  const idx = (feb) => Array.from({ length: 12 }, (_, m) => (m === 1 ? feb : 1));
  const profiles = [
    { name: "Tomato", index: idx(0.7) },
    { name: "Carrots", index: idx(0.9) },
    { name: "Rice", index: idx(0.99) },
    { name: "Calamansi", index: idx(1.3) },
    { name: "Gap", index: Array(12).fill(null) },
  ];
  const feb = pcalPicks(profiles, 1);
  assert.equal(names(feb.cheap), "Tomato,Carrots");
  assert.equal(names(feb.dear), "Calamansi");
  assert.equal(names(pcalPicks(profiles, 5).cheap), "");
});

test("month lists come out in calendar order in either language", () => {
  assert.equal(pcalMonthList([3, 1, 2], "tl"), "Peb, Mar, Abr");
  assert.equal(pcalMonthList([11, 0], "en"), "Jan, Dec");
});
