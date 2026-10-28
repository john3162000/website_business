// Screenshots of the Okasyon strip in Browse, and the dishes each occasion picks from the live data.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem("sarapsulit.tour.v1", "done"); localStorage.setItem("sarapsulit.weatherMode", "sunny"); } catch {} });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
const shot = (n, p = page) => p.screenshot({ path: `occ-out/${n}.png` }).then(() => console.log("captured", n));
await page.goto(process.argv[2], { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof RECIPES !== "undefined" && RECIPES.length > 0, null, { timeout: 60000 });
await page.evaluate(() => showSection("browse"));
await page.waitForTimeout(1500);
await shot("1-browse-today");
console.log("today:", await page.evaluate(() => document.querySelector(".occ-kicker")?.textContent + " | " + document.querySelector(".occ-title")?.textContent));
const keys = await page.evaluate(() => OCCASIONS.map((o) => o.key));
for (const key of keys) {
  const titles = await page.evaluate((k) => { setOccasion(k); return [...document.querySelectorAll(".occ-name")].map((e) => e.textContent).join(" | "); }, key);
  console.log(`${key}: ${titles || "(none)"}`);
}
await page.evaluate(() => setOccasion("pasko"));
await page.waitForTimeout(1200); await shot("2-pasko");
await page.evaluate(() => { setLang("tl"); setOccasion("bagongtaon"); });
await page.waitForTimeout(1200); await shot("3-bagongtaon-tagalog");
await page.evaluate(() => { setLang("en"); setOccasion("semanasanta"); });
await page.waitForTimeout(1200); await shot("4-semanasanta");
await page.evaluate(() => { toggleTheme(); setOccasion("eidfitr"); });
await page.waitForTimeout(1200); await shot("5-eid-dark");
console.log("width:", await page.evaluate(() => `${document.documentElement.scrollWidth} vs ${innerWidth}`));
const desk = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await desk.addInitScript(() => { try { localStorage.setItem("sarapsulit.tour.v1", "done"); localStorage.setItem("sarapsulit.weatherMode", "sunny"); } catch {} });
const dp = await desk.newPage();
await dp.goto(process.argv[2], { waitUntil: "networkidle" }).catch(() => {});
await dp.waitForFunction(() => typeof RECIPES !== "undefined" && RECIPES.length > 0, null, { timeout: 60000 });
await dp.evaluate(() => showSection("browse"));
await dp.waitForTimeout(1500); await shot("6-desktop", dp);
await browser.close();
