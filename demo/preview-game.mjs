// Phone-sized preview of the "Laro" tab: screenshots plus a short video of the
// rating slider and one Versus round. Usage: node preview-game.mjs <site-url> <out-dir>
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const SITE = process.argv[2] || "http://localhost:5173/";
const OUT = process.argv[3] || "game-out";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  recordVideo: { dir: OUT, size: { width: 390, height: 844 } },
});
await context.addInitScript(() => {
  try { localStorage.setItem("sarapsulit.tour.v1", "done"); localStorage.setItem("sarapsulit.weatherMode", "sunny"); } catch {}
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
const pause = (ms = 1200) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) }).then(() => console.log("captured", name));

await page.goto(SITE, { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof RECIPES !== "undefined" && RECIPES.length > 0, null, { timeout: 60000 });
await page.evaluate(() => showSection("game"));
await page.waitForSelector("#rate-slider", { timeout: 20000 });
await pause(2000);
await shot("1-rate-5");
await page.evaluate(() => document.getElementById("rate-stage").scrollIntoView({ block: "center" }));
for (const v of [1, 3, 5, 7, 8, 10]) {
  await page.evaluate((v) => { const s = document.getElementById("rate-slider"); s.value = v; updateRate(v); }, v);
  await pause(700);
  if (v === 1 || v === 10) await shot(`2-rate-${v}`);
}
await page.evaluate(() => submitRate());
await pause(800);
await page.evaluate(() => setGameMode("versus"));
await pause(2500);
await shot("3-versus");
await page.click("#vs-a");
await pause(1200);
await page.evaluate(() => document.getElementById("vs-note").scrollIntoView({ block: "center" }));
await pause(800);
await shot("4-versus-picked");
for (let i = 0; i < 12; i++) {
  const done = await page.evaluate(() => { if (gameRound >= gameRounds.length) return true; if (!gameRoundDone) pickVersus(Math.random() < 0.5 ? "a" : "b"); nextVersus(); return false; });
  if (done) break;
  await pause(150);
}
await pause(2500);
await shot("5-versus-champions");
// A test player who loves sour dishes and dislikes fried ones.
await page.evaluate(() => {
  const iS = TASTE_TAGS.findIndex((t) => t.key === "maasim"), iP = TASTE_TAGS.findIndex((t) => t.key === "prito");
  const pool = RECIPES.filter((r) => r.img && r.category !== "Sauce & Condiment");
  for (let k = 0; k < 14; k++) {
    const r = pool[Math.floor(Math.random() * pool.length)];
    const x = tasteVector(r);
    gameRatings[r.id] = x[iS] ? 9 : x[iP] ? 2 : 6;
  }
  gameSave(GAME_RATE_KEY, gameRatings);
  setGameMode("taste");
});
await pause(2500);
await shot("7-panlasa");
await page.evaluate(() => document.querySelector("#game-taste .game-card:nth-child(2)")?.scrollIntoView({ block: "start" }));
await pause(1500);
await shot("8-para-sayo");
console.log("tag counts:", await page.evaluate(() => {
  const counts = TASTE_TAGS.map(() => 0);
  for (const r of RECIPES) tasteVector(r).forEach((v, i) => (counts[i] += v));
  return TASTE_TAGS.map((t, i) => `${t.key}=${counts[i]}`).join(" ") + ` of ${RECIPES.length}`;
}));
console.log("samples:", await page.evaluate(() => ["Sinigang", "Adobo", "Kare", "Laing", "Menudo", "Tinola", "Lechon Kawali", "Pinakbet"].map((n) => {
  const r = RECIPES.find((x) => x.title.includes(n));
  return r ? `${r.title}: ${TASTE_TAGS.filter((_, i) => tasteVector(r)[i]).map((t) => t.key).join(",")}` : `${n}: -`;
}).join("\n")));
await page.evaluate(() => document.documentElement.classList.add("dark"));
await page.evaluate(() => setGameMode("rate"));
await pause(1500);
await shot("6-rate-dark");
console.log("rounds:", await page.evaluate(() => gameRounds.map((m) => `${m.a.name}=${m.a.recipe.title} | ${m.b.name}=${m.b.recipe.title}`).join("\n")));

await context.close();
await browser.close();
const video = readdirSync(OUT).find((f) => f.endsWith(".webm"));
if (video) renameSync(join(OUT, video), join(OUT, "game.webm"));
