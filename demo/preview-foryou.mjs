// Phone preview of "Para sa'yo" in Browse and "Kahawig na ulam" in the recipe pop-up,
// for a test player who rates sour dishes high and fried ones low.
import { createRequire } from "node:module";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const SITE = process.argv[2] || "http://localhost:5173/";
const OUT = process.argv[3] || "foryou-out";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await context.addInitScript(() => {
  try { localStorage.setItem("sarapsulit.tour.v1", "done"); localStorage.setItem("sarapsulit.weatherMode", "sunny"); } catch {}
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
const pause = (ms = 1200) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) }).then(() => console.log("captured", name));

await page.goto(SITE, { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof RECIPES !== "undefined" && RECIPES.length > 0, null, { timeout: 60000 });
// Before any playing: no Para sa'yo option, similar dishes still work.
console.log("before:", await page.evaluate(() => { showSection("browse"); return document.getElementById("sort-select").value; }));
await page.evaluate(() => {
  const iS = TASTE_TAGS.findIndex((t) => t.key === "maasim"), iP = TASTE_TAGS.findIndex((t) => t.key === "prito");
  const pool = RECIPES.filter((r) => r.img && r.category !== "Sauce & Condiment");
  const ratings = {};
  let k = 0;
  for (const r of pool) {
    const x = tasteVector(r);
    if (x[iS] && Object.keys(ratings).length < 8) ratings[r.id] = 9;
    else if (x[iP] && !x[iS] && k < 6) { ratings[r.id] = 2; k++; }
    if (Object.keys(ratings).length >= 14) break;
  }
  localStorage.setItem("sarapsulit.ratings.v1", JSON.stringify(ratings));
  tasteModelChanged();
  forYouDefaulted = false;
  showSection("browse");
});
await pause(2000);
console.log("after:", await page.evaluate(() => document.getElementById("sort-select").value), await page.evaluate(() => document.getElementById("result-count").textContent));
await page.evaluate(() => document.getElementById("sort-select").scrollIntoView({ block: "start" }));
await pause(800);
await shot("1-browse-sort");
await page.evaluate(() => document.getElementById("result-count").scrollIntoView({ block: "start" }));
await pause(1500);
await shot("2-browse-foryou");
const t0 = Date.now();
await page.evaluate(() => { const r = RECIPES.find((x) => /^sinigang na baboy/i.test(x.title)) || RECIPES[0]; openModal(r.id); });
await page.waitForFunction(() => !/Loading/.test(document.getElementById("modal-content").textContent), null, { timeout: 30000 });
console.log("modal ms:", Date.now() - t0);
await page.evaluate(() => document.getElementById("fact-box")?.scrollIntoView({ block: "center" }));
await pause(1000);
await shot("4-fact-box");
console.log("fact coverage:", await page.evaluate(() => { const n = RECIPES.filter((r) => dishFacts(r).length).length; const d = RECIPES.filter((r) => FACTS_DISH.some(([re]) => re.test(r.title))).length; return `${n} of ${RECIPES.length} dishes have a fact (${d} from a dish fact)`; }));
await page.evaluate(() => [...document.querySelectorAll("#modal-content h3")].find((h) => h.textContent.includes("Kahawig"))?.scrollIntoView({ block: "start" }));
await pause(1500);
await shot("3-kahawig-sinigang");
console.log("similar:", await page.evaluate(() => ["Sinigang na Baboy", "Chicken Adobo", "Kare Kare", "Leche Flan", "Pancit Canton"].map((n) => {
  const r = RECIPES.find((x) => x.title.toLowerCase().startsWith(n.toLowerCase()));
  return r ? `${r.title} -> ${similarDishes(r, RECIPES, 4).map((s) => s.title).join(" | ")}` : `${n}: -`;
}).join("\n")));
await browser.close();
