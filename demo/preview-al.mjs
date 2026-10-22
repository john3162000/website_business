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
console.log("weather:", await page.evaluate(async () => {
  for (let i = 0; i < 30 && !lastWeather; i++) await new Promise((r) => setTimeout(r, 1000));
  return lastWeather ? JSON.stringify({ apparent: lastWeather.w.apparent, code: lastWeather.w.code, precip: lastWeather.w.precipitation, limits: lastWeather.limits, mood: weatherMood(lastWeather.w, lastWeather.limits) }) : "no weather";
}));
await page.evaluate(() => { setWeatherMode("auto"); showSection("home"); document.getElementById("weather-title").scrollIntoView({ block: "start" }); window.scrollBy(0, -90); });
await pause(1500); await shot("6-weather");
await page.evaluate(() => showSection("prices"));
await page.waitForFunction(() => !/Loading/.test(document.getElementById("movers-summary").textContent), null, { timeout: 60000 }).catch(() => {});
await pause(2000);
await page.evaluate(() => document.getElementById("prices-foryou").scrollIntoView({ block: "start" }));
await pause(1200); await shot("8-prices-foryou");
await page.evaluate(() => document.getElementById("movers-rose").scrollIntoView({ block: "start" }));
await pause(1200); await shot("9-movers-ulam");
console.log("wide:", await page.evaluate(() => [...document.querySelectorAll("#section-prices *")].map((el) => ({ el, r: el.getBoundingClientRect() })).filter(({ r }) => r.right > 392 && r.width > 0).slice(0, 12).map(({ el, r }) => `${el.tagName}.${(el.className || "").toString().slice(0, 60)} id=${el.id} w=${Math.round(r.width)} right=${Math.round(r.right)}`).join("\n")));
console.log("prices width:", await page.evaluate(() => `${document.documentElement.scrollWidth} vs ${window.innerWidth}`));
await page.evaluate(() => { showSection("planner"); randomizeWeek(); });
await pause(2000);
console.log("random hint:", await page.evaluate(() => document.getElementById("plan-hint").textContent));
await page.evaluate(() => document.getElementById("plan-grid").scrollIntoView({ block: "center" }));
await pause(1000); await shot("7-random-week");
await page.evaluate(() => { showSection("planner"); document.getElementById("budget-text").value = "₱1,500 for the week, 4 people"; planOnBudget(); });
await pause(2500);
const url = await page.evaluate(async () => groceryCanvas(await currentGrocery()).toDataURL("image/png"));
const { writeFileSync } = await import("node:fs");
writeFileSync("al-out/grocery-list.png", Buffer.from(url.split(",")[1], "base64"));
console.log("grocery png written");
await browser.close();
