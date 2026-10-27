// Phone and desktop screenshots: Settings (Tagalog / English, several diets), meat chips,
// grocery list by palengke section, and planner drag and drop with mouse and touch.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const URL0 = process.argv[2];
const browser = await chromium.launch();
const prep = (ctx) => ctx.addInitScript(() => { try { localStorage.setItem("sarapsulit.tour.v1", "done"); localStorage.setItem("sarapsulit.weatherMode", "sunny"); } catch {} });

// ── Phone ──
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await prep(phone);
const page = await phone.newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
const pause = (ms = 1000) => page.waitForTimeout(ms);
const shot = (n, p = page) => p.screenshot({ path: `settings-out/${n}.png` }).then(() => console.log("captured", n));
const width = async (label) => console.log(`width ${label}:`, await page.evaluate(() => `${document.documentElement.scrollWidth} vs ${window.innerWidth}`));
await page.goto(URL0, { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof RECIPES !== "undefined" && RECIPES.length > 0, null, { timeout: 60000 });
await pause(1500); await shot("01-header-gear");

await page.click('button[onclick="openSettings()"]');
await pause(800); await shot("02-settings-en");
await page.evaluate(() => { toggleDietSetting("lowcal"); toggleDietSetting("gout"); });
await pause(600); await shot("03-settings-two-diets");
await page.evaluate(() => document.querySelector("#settings-body .set-row:nth-child(4)").scrollIntoView({ block: "start" }));
await pause(500); await shot("04-settings-suggest-dark-weather");
await page.evaluate(() => setLang("tl"));
await page.evaluate(() => document.querySelector("#settings-body").scrollTo?.(0, 0));
await page.evaluate(() => document.querySelector(".settings-card").scrollTo(0, 0));
await pause(600); await shot("05-settings-tagalog");
await page.evaluate(() => closeSettings());
console.log("diets:", await page.evaluate(() => JSON.stringify(settingsDiets())), "lang:", await page.evaluate(() => document.documentElement.lang));

await page.evaluate(() => showSection("browse"));
await pause(1200);
await page.evaluate(() => document.querySelector("[data-meat-chips]").scrollIntoView({ block: "center" }));
await pause(500); await shot("06-browse-tagalog-diets");
console.log("browse with lowcal+gout:", await page.evaluate(() => document.getElementById("result-count").textContent));
await page.evaluate(() => { clearDietSetting(); toggleMeat("pork"); });
await pause(800);
console.log("browse pork:", await page.evaluate(() => document.getElementById("result-count").textContent),
  await page.evaluate(() => [...document.querySelectorAll("#browse-grid h3")].slice(0, 6).map((h) => h.textContent).join(" | ")));
await page.evaluate(() => toggleMeat("fish"));
await pause(800); await shot("07-browse-pork-fish");
console.log("browse pork+fish:", await page.evaluate(() => document.getElementById("result-count").textContent));
await width("browse");
await page.evaluate(() => { toggleMeat(null); setLang("en"); });

// Planner: a budget week, then the grouped grocery receipt.
await page.evaluate(() => { showSection("planner"); document.getElementById("budget-text").value = "₱1,500 for the week, 4 people"; planOnBudget(); });
await pause(2500);
await page.evaluate(() => document.querySelector("[data-diet-summary]").scrollIntoView({ block: "center" }));
await pause(500); await shot("08-planner-diet-line");
await page.evaluate(() => setReceiptMode("ingredient"));
await page.waitForFunction(() => /rc-day/.test(document.getElementById("plan-receipt").innerHTML), null, { timeout: 60000 }).catch(() => {});
await pause(1000);
await page.evaluate(() => document.getElementById("plan-receipt").scrollIntoView({ block: "start" }));
await pause(500); await shot("09-receipt-by-section");
console.log("sections:", await page.evaluate(() => [...document.querySelectorAll("#plan-receipt .rc-day span:first-child")].map((s) => s.textContent).join(" · ")));
const png = await page.evaluate(async () => groceryCanvas(await currentGrocery()).toDataURL("image/png"));
writeFileSync("settings-out/10-grocery.png", Buffer.from(png.split(",")[1], "base64"));
const html = await page.evaluate(async () => { const g = await currentGrocery(); return groceryHtml(g.receipt, g.people, g.date); });
writeFileSync("settings-out/grocery.html", html);
const hp = await phone.newPage();
await hp.setContent(html);
await hp.waitForTimeout(500); await shot("11-grocery-html", hp); await hp.close();
await width("planner");

// Touch drag: hold a dish, then move it onto a slot.
await page.evaluate(() => { clearPlan(); setSeries("ulam"); window.scrollTo(0, 0); });
await pause(800);
const touch = await page.evaluate(async () => {
  const el = document.querySelector("#plan-picker [data-drag-id]");
  const cell = document.querySelector('.plan-cell[data-key="Lunes|Tanghalian"]');
  const a = el.getBoundingClientRect();
  const fire = (type, target, x, y) => {
    const t = new Touch({ identifier: 1, target, clientX: x, clientY: y });
    target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [t], changedTouches: [t] }));
  };
  fire("touchstart", el, a.x + 20, a.y + 10);
  await new Promise((r) => setTimeout(r, 400));
  const lit = document.querySelectorAll(".plan-cell.drop-ok").length;
  const dim = document.body.classList.contains("plan-dragging");
  cell.scrollIntoView({ block: "center" });
  const c = cell.getBoundingClientRect();
  fire("touchmove", document.body, c.x + c.width / 2, c.y + c.height / 2);
  return { id: Number(el.dataset.dragId), lit, dim, cx: c.x + c.width / 2, cy: c.y + c.height / 2 };
});
await pause(400); await shot("12-touch-drag-lit-slots");
const dropped = await page.evaluate(({ cx, cy }) => {
  const t = new Touch({ identifier: 1, target: document.body, clientX: cx, clientY: cy });
  document.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [], changedTouches: [t] }));
  return JSON.stringify(plan.slots);
}, touch);
console.log("touch drag:", JSON.stringify({ lit: touch.lit, dim: touch.dim }), "plan:", dropped, "expect id", touch.id);
// A quick swipe (no hold) must not start a drag.
const swipe = await page.evaluate(async () => {
  const el = document.querySelector("#plan-picker [data-drag-id]");
  const a = el.getBoundingClientRect();
  const t1 = new Touch({ identifier: 2, target: el, clientX: a.x + 20, clientY: a.y + 10 });
  el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [t1], changedTouches: [t1] }));
  const t2 = new Touch({ identifier: 2, target: el, clientX: a.x + 20, clientY: a.y + 60 });
  el.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [t2], changedTouches: [t2] }));
  await new Promise((r) => setTimeout(r, 400));
  return document.body.classList.contains("plan-dragging");
});
console.log("swipe started a drag?", swipe);
await page.evaluate(() => document.getElementById("plan-grid").scrollIntoView({ block: "center" }));
await pause(500); await shot("13-after-touch-drop");

// ── Desktop: mouse drag, and moving a chip to another day ──
const desk = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await prep(desk);
const dp = await desk.newPage();
dp.on("pageerror", (e) => console.log("DESKTOP PAGE ERROR:", e.message));
await dp.goto(URL0, { waitUntil: "networkidle" });
await dp.waitForFunction(() => typeof RECIPES !== "undefined" && RECIPES.length > 0, null, { timeout: 60000 });
await dp.evaluate(() => { showSection("planner"); setSeries("meryenda"); });
await dp.waitForTimeout(1200);
const src = await dp.locator("#plan-picker [data-drag-id]").first().boundingBox();
const dst = await dp.locator('.plan-cell[data-key="Martes|Meryenda"]').boundingBox();
await dp.mouse.move(src.x + 30, src.y + 15);
await dp.mouse.down();
await dp.mouse.move(src.x + 60, src.y + 30, { steps: 4 });
await dp.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 12 });
await dp.waitForTimeout(400);
await dp.screenshot({ path: "settings-out/14-desktop-mouse-drag.png" }); console.log("captured 14-desktop-mouse-drag");
console.log("desktop lit:", await dp.evaluate(() => [...document.querySelectorAll(".plan-cell.drop-ok")].map((c) => c.dataset.key).join(",")));
await dp.mouse.up();
await dp.waitForTimeout(500);
console.log("desktop plan after drop:", await dp.evaluate(() => JSON.stringify(plan.slots)));
// Move the chip from Martes to Sabado.
const chip = await dp.locator('.plan-chip[data-from="Martes|Meryenda"]').first().boundingBox();
const dst2 = await dp.locator('.plan-cell[data-key="Sabado|Meryenda"]').boundingBox();
await dp.mouse.move(chip.x + 10, chip.y + 10); await dp.mouse.down();
await dp.mouse.move(dst2.x + dst2.width / 2, dst2.y + dst2.height / 2, { steps: 12 }); await dp.mouse.up();
await dp.waitForTimeout(500);
console.log("desktop plan after chip move:", await dp.evaluate(() => JSON.stringify(plan.slots)));
await dp.evaluate(() => { openSettings(); toggleTheme(); renderSettings(); });
await dp.waitForTimeout(800);
await dp.screenshot({ path: "settings-out/15-desktop-settings-dark.png" }); console.log("captured 15-desktop-settings-dark");
await browser.close();
