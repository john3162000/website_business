// Records a phone-sized demo of FARM2FIGURE for the partnership pitch.
// Usage: node record-demo.mjs [site-url] [out-dir]
//   site-url defaults to the live GitHub Pages site; pass http://localhost:5173/ for a local preview.
// Output: out-dir/demo.webm (video) and out-dir/01-*.png … (one screenshot per step).
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require("/opt/node-tools/node_modules/playwright")); }

const SITE = process.argv[2] || "https://john3162000.github.io/website_business/";
const OUT = process.argv[3] || "demo-out";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: "en-PH", recordVideo: { dir: OUT, size: { width: 390, height: 844 } },
});
// Skip the first-time tour and keep the neutral (non-rainy) look.
await context.addInitScript(() => {
  try {
    localStorage.setItem("sarapsulit.tour.v1", "done");
    localStorage.setItem("sarapsulit.weatherMode", "sunny");
  } catch {}
});
const page = await context.newPage();
const pause = (ms = 1800) => page.waitForTimeout(ms);
let n = 0;
async function shot(name) {
  n += 1;
  await page.screenshot({ path: join(OUT, `${String(n).padStart(2, "0")}-${name}.png`) });
  console.log("captured", name);
}
async function go(section) { await page.evaluate((s) => showSection(s), section); await pause(); }

// 1. Home: hero, stats and weather picks, once the data has loaded.
await page.goto(SITE, { waitUntil: "networkidle" });
await page.waitForFunction(() => /\d/.test(document.getElementById("stat-recipes")?.textContent || ""), null, { timeout: 60000 });
await pause(2500);
await shot("home");
await page.evaluate(() => document.getElementById("weather-grid")?.scrollIntoView({ behavior: "smooth" }));
await pause(); await shot("weather-picks");

// 2. Browse: ranked by nutrition per peso, then search for adobo.
await go("browse");
await page.evaluate(() => document.getElementById("result-count")?.scrollIntoView({ behavior: "smooth", block: "start" }));
await pause(); await shot("browse-ranked");
await page.fill("#search-input", "adobo");
await page.dispatchEvent("#search-input", "input");
await page.evaluate(() => document.getElementById("result-count")?.scrollIntoView({ behavior: "smooth", block: "start" }));
await pause(); await shot("browse-adobo");

// 3. Recipe pop-up: per-line grams, cost and price source.
await page.locator("#browse-grid [onclick^='openModal']").first().click();
await page.waitForSelector("#recipe-modal:not(.hidden)", { timeout: 20000 });
await page.waitForFunction(() => !/Loading (ingredients|instructions)/.test(document.getElementById("modal-content")?.textContent || ""), null, { timeout: 30000 });
await pause(1500); await shot("recipe-cost");
await page.evaluate(() => {
  let el = document.getElementById("modal-content");
  while (el && el.scrollHeight <= el.clientHeight + 1) el = el.parentElement;
  (el || window).scrollBy({ top: 900, behavior: "smooth" });
});
await pause(); await shot("recipe-ingredients");
await page.evaluate(() => closeModal());
await pause(800);

// 4. DA prices and price movers.
await go("prices");
await page.waitForFunction(() => !/Loading/.test(document.getElementById("movers-summary")?.textContent || ""), null, { timeout: 60000 }).catch(() => {});
await page.evaluate(() => document.getElementById("movers-summary")?.scrollIntoView({ behavior: "smooth", block: "start" }));
await pause(2000); await shot("prices-movers");
await page.evaluate(() => document.getElementById("price-table-body")?.scrollIntoView({ behavior: "smooth" }));
await pause(); await shot("prices-table");

// 5. Budget planner: ₱1,500 for a family of 4.
await go("planner");
await page.fill("#budget-text", "₱1,500 for the week, 4 people");
await page.evaluate(() => planOnBudget());
await pause(2500);
await page.evaluate(() => document.getElementById("budget-result")?.scrollIntoView({ behavior: "smooth", block: "center" }));
await pause(); await shot("planner-budget");

// 6. Ingredient finder: pick a few things from the first categories.
await go("finder");
await page.waitForSelector("#finder-cats button", { timeout: 30000 });
for (const cat of await page.locator("#finder-cats > *").all().then((a) => a.slice(0, 2))) {
  await cat.locator("button").first().click();
  await pause(800);
  const opts = page.locator(".fx-opt:not(.on)");
  for (let i = 0; i < 2 && (await opts.count()) > 0; i++) { await opts.first().click(); await pause(700); }
}
await page.evaluate(() => { if (finderOpenCat) toggleFinderCat(finderOpenCat); });
await pause(800);
await page.evaluate(() => document.getElementById("finder-count")?.scrollIntoView({ behavior: "smooth", block: "start" }));
await pause(2000); await shot("finder-results");
await page.evaluate(() => document.getElementById("finder-graph")?.scrollIntoView({ behavior: "smooth", block: "center" }));
await pause(2000); await shot("finder-graph");

await context.close();
await browser.close();
const video = readdirSync(OUT).find((f) => f.endsWith(".webm") && f !== "demo.webm");
if (video) renameSync(join(OUT, video), join(OUT, "demo.webm"));
console.log(`Done: ${n} screenshots and demo.webm in ${OUT}`);
