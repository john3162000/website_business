// Phone screenshots: Rate with Ulam/Meryenda and active learning; Panlasa with both profiles.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem("sarapsulit.tour.v1", "done"); localStorage.setItem("sarapsulit.weatherMode", "sunny"); } catch {} });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
const pause = (ms = 1200) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `al-out/${n}.png` }).then(() => console.log("captured", n));
await page.goto(process.argv[2], { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof RECIPES !== "undefined" && RECIPES.length > 0, null, { timeout: 60000 });
console.log("kinds:", await page.evaluate(() => { const c = {}; for (const r of RECIPES) { const k = String(dishKind(r)); c[k] = (c[k] || 0) + 1; } return JSON.stringify(c); }));
await page.evaluate(() => showSection("game"));
await page.waitForSelector("#rate-slider", { timeout: 20000 });
await pause(1500); await shot("1-rate-ulam");
// Play 8 ulam rounds as a sour-lover, logging which picks were "active".
const log = await page.evaluate(() => {
  const iS = TASTE_TAGS.findIndex((t) => t.key === "maasim");
  const out = [];
  for (let i = 0; i < 8; i++) {
    const r = gameRateDish; const x = tasteVector(r);
    document.getElementById("rate-slider").value = x[iS] ? 9 : 4;
    out.push(`${gameRateActive ? "ACTIVE" : "random"} ${r.title} [${TASTE_TAGS.filter((_, j) => x[j]).map((t) => t.key).join(",")}]`);
    submitRate();
  }
  return out.join("\n");
});
console.log(log);
await pause(1500); await shot("2-rate-active");
await page.evaluate(() => setRateKind("meryenda"));
await pause(1500); await shot("3-rate-meryenda");
await page.evaluate(() => { for (let i = 0; i < 6; i++) { document.getElementById("rate-slider").value = i % 2 ? 3 : 9; submitRate(); } setGameMode("taste"); });
await pause(2500); await shot("4-panlasa-ulam");
await page.evaluate(() => document.querySelectorAll("#game-taste .game-card")[2]?.scrollIntoView({ block: "start" }));
await pause(1500); await shot("5-panlasa-meryenda");
await browser.close();
