// Loads the LIVE site and checks the Planner: fresh visitor, returning visitor, phone and desktop.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const LIVE = "https://john3162000.github.io/website_business/";
const browser = await chromium.launch();

async function run(label, opts, seed) {
  console.log(`\n===== ${label} =====`);
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript((s) => { try { localStorage.setItem("sarapsulit.tour.v1", "done"); localStorage.setItem("sarapsulit.weatherMode", "sunny"); for (const [k, v] of Object.entries(s || {})) localStorage.setItem(k, v); } catch {} }, seed);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message, (e.stack || "").split("\n").slice(1, 3).join(" | ")));
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERROR:", m.text()); });
  page.on("response", (r) => { if (r.status() >= 400) console.log("HTTP", r.status(), r.url()); });
  await page.goto(LIVE, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof RECIPES !== "undefined" && RECIPES.length > 0, null, { timeout: 60000 }).catch(() => console.log("RECIPES never loaded"));
  console.log("scripts:", await page.evaluate(() => [...document.scripts].map((s) => s.src.split("/").pop()).filter(Boolean).join(",")));
  console.log("globals:", await page.evaluate(() => JSON.stringify({
    dietsOk: typeof dietsOk, meatOk: typeof meatOk, settingsDiets: typeof settingsDiets, initPlannerDrag: typeof initPlannerDrag,
    groupGrocery: typeof groupGrocery, recipes: RECIPES.length,
  })));
  await page.evaluate(() => showSection("planner"));
  await page.waitForTimeout(2500);
  const state = async (tag) => console.log(tag, await page.evaluate(() => JSON.stringify({
    picker: document.querySelectorAll("#plan-picker [data-drag-id]").length,
    pickerText: document.getElementById("plan-picker").textContent.trim().slice(0, 80),
    count: document.getElementById("plan-count").textContent,
    cells: document.querySelectorAll(".plan-cell").length,
    chips: document.querySelectorAll(".plan-chip").length,
    cheapest: document.querySelectorAll("#plan-cheapest .cheap-row").length,
    meatChips: document.querySelectorAll("[data-meat-chips] button").length,
    dietLine: document.querySelector("[data-diet-summary]")?.textContent.replace(/\s+/g, " ").trim(),
    receipt: document.getElementById("plan-receipt").textContent.trim().slice(0, 80),
    hint: document.getElementById("plan-hint").textContent,
    slots: JSON.stringify(plan.slots).slice(0, 120),
  })));
  await state("open:");
  // Tap a dish, then a slot.
  await page.evaluate(() => { setSeries("ulam"); });
  await page.waitForTimeout(500);
  await page.locator("#plan-picker [data-drag-id]").first().click().catch((e) => console.log("tap dish failed:", e.message));
  await page.locator('.plan-cell[data-key="Lunes|Tanghalian"]').click().catch((e) => console.log("tap slot failed:", e.message));
  await page.waitForTimeout(800);
  await state("after tap-tap:");
  await page.evaluate(() => randomizeWeek());
  await page.waitForTimeout(1000);
  await state("after random week:");
  await page.evaluate(() => { document.getElementById("budget-text").value = "₱1,500 for the week, 4 people"; planOnBudget(); });
  await page.waitForTimeout(1500);
  console.log("budget:", await page.evaluate(() => document.getElementById("budget-result").textContent));
  await page.evaluate(() => setReceiptMode("ingredient"));
  await page.waitForTimeout(4000);
  await state("per ingredient:");
  await page.evaluate(() => document.getElementById("plan-grid").scrollIntoView({ block: "center" }));
  await page.screenshot({ path: `debug-out/${label.replace(/\W+/g, "-")}.png` });
  await ctx.close();
}

const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
await run("phone fresh", phone, {});
// A returning visitor: an old saved week, a kitchen choice, ratings and the old diet-free state.
await run("phone returning", phone, {
  "sarapsulit.planner.v1": JSON.stringify({ people: 4, slots: { "Lunes|Tanghalian": [1, 2], "Martes|Hapunan": [3], "Lunes|Almusal": [99999] } }),
  "sarapsulit.savedplans.v1": JSON.stringify([{ name: "Linggo ng Oct 22", savedAt: 1, plan: { people: 4, slots: { "Lunes|Hapunan": [5] } } }]),
  "sarapsulit.kitchen.v1": JSON.stringify(["oven", "rice_cooker"]),
  "sarapsulit.favs.v1": JSON.stringify([1, 5, 9]),
  "sarapsulit.ratings.v1": JSON.stringify({ 1: 9, 2: 3, 5: 8, 9: 2 }),
  "sarapsulit.settings.v1": "{broken",
});
await run("desktop fresh", { viewport: { width: 1366, height: 900 } }, {});
await browser.close();
