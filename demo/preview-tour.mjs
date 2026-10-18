// Phone screenshot of the tour's Laro step.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem("sarapsulit.tour.v1", "done"); localStorage.setItem("sarapsulit.weatherMode", "sunny"); } catch {} });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.goto(process.argv[2], { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof RECIPES !== "undefined" && RECIPES.length > 0, null, { timeout: 60000 });
await page.evaluate(() => { startTour(); tourNext(TOUR_STEPS.findIndex((s) => s.section === "game")); });
await page.waitForTimeout(2500);
await page.screenshot({ path: "tour-out/laro-step.png" });
console.log("step:", await page.evaluate(() => document.getElementById("tour-count").textContent));
await browser.close();
