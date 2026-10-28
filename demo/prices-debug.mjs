// Phone-width check of every section: page width, and the innermost elements past the right edge
// that are not inside a sideways-scrolling box.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch();
for (const width of [360, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem("sarapsulit.tour.v1", "done"); localStorage.setItem("sarapsulit.weatherMode", "sunny"); } catch {} });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
  await page.goto(process.argv[2], { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof RECIPES !== "undefined" && RECIPES.length > 0, null, { timeout: 60000 });
  for (const s of ["home", "browse", "prices", "mydish", "planner", "finder", "game"]) {
    await page.evaluate((name) => showSection(name), s);
    await page.waitForTimeout(s === "prices" ? 6000 : 1500);
    const r = await page.evaluate(() => {
      const W = window.innerWidth;
      const scrolls = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true; } return false; };
      const sec = document.querySelector("section:not(.hidden)");
      const wide = [...sec.querySelectorAll("*")].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.right > W + 1 && !scrolls(el); });
      const innermost = wide.filter((el) => !wide.some((o) => o !== el && el.contains(o)));
      const desc = (el) => { const b = el.getBoundingClientRect(); return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).trim().split(/\s+/).slice(0, 6).join(".")} w=${Math.round(b.width)} right=${Math.round(b.right)} text="${(el.textContent || "").trim().slice(0, 40)}"`; };
      return { page: document.documentElement.scrollWidth, wide: innermost.slice(0, 12).map(desc), chain: innermost[0] ? (() => { const out = []; for (let p = innermost[0]; p && p !== sec; p = p.parentElement) out.push(desc(p).slice(0, 110)); return out.slice(0, 10); })() : [] };
    });
    console.log(`\n[${width}px] ${s}: page width ${r.page}`);
    for (const w of r.wide) console.log("  WIDE:", w);
    if (r.wide.length) for (const c of r.chain) console.log("    in:", c);
    if (s === "prices") await page.screenshot({ path: `prices-out/prices-${width}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
