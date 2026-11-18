import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCommodities } from "./da-parse.ts";

const day = new Date("2026-11-16T00:00:00Z");
const cats = (text: string) => extractCommodities(text, day).map((r) => `${r.category} | ${r.name} | ${r.price}`);

test("a section carries on across a page break (the repeated table header is not a category)", () => {
  // The November 2026 PDF layout: meat names without "Pork"/"Beef", and the table header at the
  // top of each page, sometimes on the same text line as the last price of the page before.
  const text = [
    "PORK",
    "Belly (Liempo), Local Fresh or Chilled 365.89",
    "Spare Ribs, Local Fresh or Chilled 292.54 COMMODITY SPECIFICATION PREVAILING RETAIL PRICE PER",
    "UNIT (P/UNIT)",
    "Tenderloin, Local Fresh or Chilled 310.00",
    "LIVESTOCK & POULTRY PRODUCTS BEEF",
    "Chuck (Kadera sa Unahan), Local Fresh or Chilled 450.00",
    "COMMODITY SPECIFICATION PREVAILING RETAIL PRICE PER",
    "UNIT (P/UNIT)",
    "Tenderloin, Local Fresh or Chilled 802.78",
  ].join("\n");
  assert.deepEqual(cats(text), [
    "PORK | Belly (Liempo), Local Fresh or Chilled | 365.89",
    "PORK | Spare Ribs, Local Fresh or Chilled | 292.54",
    "PORK | Tenderloin, Local Fresh or Chilled | 310",
    "LIVESTOCK & POULTRY PRODUCTS BEEF | Chuck (Kadera sa Unahan), Local Fresh or Chilled | 450",
    "LIVESTOCK & POULTRY PRODUCTS BEEF | Tenderloin, Local Fresh or Chilled | 802.78",
  ]);
});

test("rows on one text line, n/a prices and wrapped names still parse", () => {
  const text = [
    "SPICES",
    "Ginger, Local Fresh, Loose, Medium (150-300 gm) 199.50 Ginger, Imported Fresh, Loose, Medium (150-300 gm) 147.00",
    "Garlic, Native/Local Whole, covered with outer skin,",
    "3.0 cm and 3.9 cm in diam. 180.00",
    "Red Onion, Imported Large n/a",
  ].join("\n");
  assert.deepEqual(cats(text), [
    "SPICES | Ginger, Local Fresh, Loose, Medium (150-300 gm) | 199.5",
    "SPICES | Ginger, Imported Fresh, Loose, Medium (150-300 gm) | 147",
    "SPICES | Garlic, Native/Local Whole, covered with outer skin, 3.0 cm and 3.9 cm in diam. | 180",
    "SPICES | Red Onion, Imported Large | null",
  ]);
});
