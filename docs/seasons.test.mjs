// Runs docs/seasons.js (a plain browser script) in a VM and tests the occasion helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./seasons.js", import.meta.url), "utf8")}
;globalThis.api = { easterDate, nthWeekday, activeOccasions, occasionPicks, occasionDates, nextStart, OCCASIONS };`, ctx);
const { easterDate, nthWeekday, activeOccasions, occasionPicks, occasionDates, nextStart, OCCASIONS } = ctx.api;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const on = (y, m, d) => Array.from(activeOccasions(new Date(y, m - 1, d)), (a) => `${a.o.key}${a.now ? "" : `+${a.daysLeft}`}`);
const occ = (key) => OCCASIONS.find((o) => o.key === key);

test("Easter and the movable Sundays", () => {
  assert.equal(ymd(easterDate(2026)), "2026-04-05");
  assert.equal(ymd(easterDate(2027)), "2027-03-28");
  assert.equal(ymd(easterDate(2028)), "2028-04-16");
  assert.equal(ymd(nthWeekday(2026, 5, 0, 2)), "2026-05-10"); // Mother's Day
  assert.equal(ymd(nthWeekday(2026, 6, 0, 3)), "2026-06-21"); // Father's Day
  assert.equal(ymd(nthWeekday(2027, 1, 0, 3)), "2027-01-17"); // Sinulog
});

test("what's on today, nearest first", () => {
  assert.deepEqual(on(2026, 10, 28), ["undas+3"]);
  assert.deepEqual(on(2026, 11, 1), ["undas"]);
  assert.deepEqual(on(2026, 11, 3), []);
  assert.deepEqual(on(2026, 12, 1), ["pasko+15", "bagongtaon+25"]);
  assert.deepEqual(on(2026, 12, 24), ["pasko", "bagongtaon+2"]);
  assert.deepEqual(on(2026, 12, 31), ["bagongtaon"]);
  assert.deepEqual(on(2027, 1, 1), ["bagongtaon", "sinulog+14"]); // the window crosses into the new year
  assert.deepEqual(on(2026, 4, 3), ["semanasanta"]); // Good Friday 2026
  assert.deepEqual(on(2026, 3, 6), ["kuwaresma", "eidfitr+14"]); // a Lenten Friday
  assert.ok(on(2026, 2, 14).includes("valentines"));
  assert.ok(on(2026, 2, 14).includes("cny+3")); // Feb 17, 2026
  assert.deepEqual(on(2026, 3, 20).filter((k) => k.startsWith("eid")), ["eidfitr"]);
});

test("occasions are suggested two weeks ahead; Christmas and New Year six weeks before the day", () => {
  // Valentine's (Feb 14): from Jan 31.
  assert.ok(!on(2027, 1, 30).some((k) => k.startsWith("valentines")));
  assert.ok(on(2027, 1, 31).includes("valentines+14"));
  // Undas (Oct 31): from Oct 17.
  assert.deepEqual(on(2026, 10, 16), []);
  assert.deepEqual(on(2026, 10, 17), ["undas+14"]);
  // Christmas (Dec 25): from Nov 13, six weeks before.
  assert.deepEqual(on(2026, 11, 12), []);
  assert.deepEqual(on(2026, 11, 13), ["pasko+33"]);
  // New Year (Jan 1): from Nov 20, six weeks before.
  assert.ok(!on(2026, 11, 19).some((k) => k.startsWith("bagongtaon")));
  assert.ok(on(2026, 11, 20).includes("bagongtaon+36"));
});

test("the next date of each occasion; undated ones have none", () => {
  assert.equal(ymd(nextStart(occ("pasko"), new Date(2026, 9, 28))), "2026-12-16");
  assert.equal(ymd(nextStart(occ("semanasanta"), new Date(2026, 9, 28))), "2027-03-21");
  assert.equal(nextStart(occ("handaan"), new Date(2026, 9, 28)), null);
});

test("picks: title fits the occasion, avoided and meat dishes left out, best value first", () => {
  const R = (id, title, extra = {}) => ({ id, title, img: "x.jpg", costPerServing: 40, ranked: true, valueScore: 10 - id, ingredientNames: [], ...extra });
  const recipes = [
    R(1, "Pancit Canton"), R(2, "Pancit Canton"), R(3, "Chicken Pancit"), R(4, "Lechon Kawali"),
    R(5, "Sinigang na Bangus"), R(6, "Pork Paksiw"), R(7, "Leche Flan", { img: "" }), R(8, "Biko", { costPerServing: 0 }),
    R(9, "Pastil"), R(10, "Beef Rendang"), R(11, "Pork Rendang"), R(12, "Chicken Curry", { ingredientNames: ["chicken", "bacon"] }),
  ];
  const ids = (key, kindOf) => Array.from(occasionPicks(occ(key), recipes, 8, () => true, kindOf), (r) => r.id);
  assert.deepEqual(ids("bagongtaon"), [1, 4]); // one Pancit Canton; no chicken; no photo or price, no pick
  const kind = (r) => (/pork|lechon/i.test(r.title) ? "karne" : "isda");
  assert.deepEqual(ids("semanasanta", kind), [5]); // Pork Paksiw is meat
  assert.deepEqual(ids("eidfitr"), [9, 10]); // no pork in the title or the ingredients
});

test("picks: no sauces, the most typical dishes first, and a mix before repeats", () => {
  const R = (id, title, valueScore = 1, extra = {}) => ({ id, title, img: "x.jpg", costPerServing: 40, ranked: true, valueScore, ingredientNames: [], ...extra });
  const recipes = [
    R(1, "Fruit Salad", 9), R(2, "Lechon Sauce", 9), R(3, "Chicken Pancit", 8), R(4, "Pancit Bihon", 7),
    R(5, "Hamon de Bola", 1), R(6, "Christmas Ham", 2), R(7, "Bibingka", 3), R(8, "Liver Spread Dip", 9, { category: "Sauce & Condiment" }),
  ];
  const ids = Array.from(occasionPicks(occ("pasko"), recipes, 8), (r) => r.id);
  assert.ok(!ids.includes(2) && !ids.includes(8)); // sauces and dips aren't dishes
  // "christmas", "hamon", "ham", … come before "pancit" and "fruit salad" in the Christmas list;
  // each word gives one dish before any word gives a second.
  assert.deepEqual(ids, [6, 5, 7, 1, 3, 4]);
});

test("date ranges read naturally", () => {
  assert.equal(occasionDates(new Date(2026, 10, 1), new Date(2026, 10, 2)), "Nov 1–2");
  assert.equal(occasionDates(new Date(2026, 11, 26), new Date(2027, 0, 1)), "Dec 26 – Jan 1");
  assert.equal(occasionDates(new Date(2026, 5, 12), new Date(2026, 5, 12)), "Jun 12");
});
