import { test } from "node:test";
import assert from "node:assert/strict";
import { compareDate, pctChange, priceOn } from "./price-history.ts";

const d = (s: string) => `${s}T00:00:00.000Z`;

test("compareDate: last day on or before 30 days back", () => {
  const dates = [d("2026-09-01"), d("2026-09-12"), d("2026-09-14"), d("2026-10-13")];
  assert.equal(compareDate(dates, d("2026-10-13")), d("2026-09-12"));
});

test("compareDate: with under 30 days stored, the earliest day at least 21 days back", () => {
  const dates = [d("2026-09-14"), d("2026-09-15"), d("2026-10-13")];
  assert.equal(compareDate(dates, d("2026-10-13")), d("2026-09-14"));
  assert.equal(compareDate([d("2026-10-01"), d("2026-10-13")], d("2026-10-13")), null);
});

test("priceOn: same day, else the last priced day within a week; 0 is not a price", () => {
  const h = [
    { date: d("2026-09-11"), price: 100 },
    { date: d("2026-09-12"), price: 0 },
    { date: d("2026-09-14"), price: 120 },
  ];
  assert.equal(priceOn(h, d("2026-09-14")), 120);
  assert.equal(priceOn(h, d("2026-09-13")), 100); // the 12th was a 0
  assert.equal(priceOn(h, d("2026-09-25")), null); // more than a week after the last price
});

test("pctChange", () => {
  assert.equal(pctChange(110, 100), 0.1);
  assert.equal(pctChange(100, 0), null);
  assert.equal(pctChange(null, 100), null);
});

test("compareDate: a week and two weeks back, with their own minimum history", () => {
  const dates = [d("2026-09-28"), d("2026-10-02"), d("2026-10-06"), d("2026-10-09"), d("2026-10-16")];
  assert.equal(compareDate(dates, d("2026-10-16"), 7, 5), d("2026-10-09"));
  assert.equal(compareDate(dates, d("2026-10-16"), 14, 10), d("2026-10-02"));
  // Only 4 days stored: not enough for "last week".
  assert.equal(compareDate([d("2026-10-12"), d("2026-10-16")], d("2026-10-16"), 7, 5), null);
});
