import { test } from "node:test";
import assert from "node:assert/strict";
import { monthPicks, seasonName, seasonProfiles, type SeasonRow } from "./seasons.ts";
import { backfillYears } from "./scrapers/psa-scraper.ts";

/** Monthly rows for 2019–2025: a base price × a seasonal shape × yearly inflation. */
function series(commodity: string, shape: number[], region = "NCR", base = 100, inflation = 0.06): SeasonRow[] {
  const rows: SeasonRow[] = [];
  for (let y = 2019; y <= 2025; y++) {
    for (let m = 0; m < 12; m++) {
      const trend = (1 + inflation) ** (y - 2019 + m / 12);
      rows.push({ commodity, category: "Fruit Vegetables", unit: "kg", region, period: new Date(Date.UTC(y, m, 1)), price: base * trend * shape[m] });
    }
  }
  return rows;
}

// Cheap Feb–Apr, dear Aug–Oct (the tomato pattern).
const TOMATO = [1, 0.7, 0.75, 0.8, 0.95, 1.05, 1.15, 1.3, 1.35, 1.25, 1, 0.9];
const FLAT = Array(12).fill(1);

test("PSA names read as short display names", () => {
  assert.equal(seasonName("TOMATO, 1 KG"), "Tomato");
  assert.equal(seasonName("FRESH SHELLS, TAHONG, 1 KG"), "Tahong");
  assert.equal(seasonName("RICE, REGULAR MILLED, 1 KG"), "Rice, regular milled");
  assert.equal(seasonName("FRESH EGG, QUAIL, LOOSE, 1 PC"), "Egg, quail, loose");
});

test("the seasonal index finds the cheap and dear months despite inflation", () => {
  const [p] = seasonProfiles(series("TOMATO, 1 KG", TOMATO));
  assert.equal(p.name, "Tomato");
  assert.equal(p.region, "NCR");
  assert.deepEqual(p.cheapest, [1, 2, 3]);
  assert.deepEqual(p.dearest, [8, 7, 9]);
  assert.ok(p.index[1]! < 0.75 && p.index[8]! > 1.3, JSON.stringify(p.index));
  const mean = p.index.reduce((a, b) => a! + b!, 0)! / 12;
  assert.ok(Math.abs(mean - 1) < 0.01);
  assert.ok(p.swing > 0.8);
  assert.equal(p.lastPeriod, "2025-12");
  assert.ok(p.years >= 5);
});

test("a flat price is not seasonal, and the month's picks are sorted strongest first", () => {
  const profiles = seasonProfiles([
    ...series("TOMATO, 1 KG", TOMATO),
    ...series("CARROTS, 1 KG", TOMATO.map((v) => 1 + (v - 1) / 3)),
    ...series("RICE, REGULAR MILLED, 1 KG", FLAT),
  ]);
  const feb = monthPicks(profiles, 1);
  assert.deepEqual(feb.cheap.map((p) => p.name), ["Tomato", "Carrots"]);
  assert.deepEqual(feb.dear, []);
  const sep = monthPicks(profiles, 8);
  assert.deepEqual(sep.dear.map((p) => p.name), ["Tomato", "Carrots"]);
  assert.ok(!sep.cheap.length);
});

test("Metro Manila wins; the national average fills in; short histories are left out", () => {
  const ncr = series("TOMATO, 1 KG", TOMATO);
  const ph = series("TOMATO, 1 KG", FLAT, "PH");
  assert.equal(seasonProfiles([...ph, ...ncr])[0].region, "NCR");
  assert.equal(seasonProfiles(series("MALUNGGAY, 1 KG", TOMATO, "PH"))[0].region, "PH");
  const short = series("TOMATO, 1 KG", TOMATO).filter((r) => r.period.getUTCFullYear() >= 2024);
  assert.deepEqual(seasonProfiles(short), []);
});

test("the PSA history backfill walks back two years at a time to 2018", () => {
  const now = new Date(Date.UTC(2026, 10, 5));
  assert.deepEqual(backfillYears(new Date(Date.UTC(2025, 0, 1)), now), [2023, 2024]);
  assert.deepEqual(backfillYears(new Date(Date.UTC(2023, 0, 1)), now), [2021, 2022]);
  assert.deepEqual(backfillYears(new Date(Date.UTC(2019, 0, 1)), now), [2018]);
  assert.deepEqual(backfillYears(new Date(Date.UTC(2018, 0, 1)), now), []);
  assert.deepEqual(backfillYears(null, now), [2023, 2024]);
});
