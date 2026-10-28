// Phone-width check of every section: page width, and the innermost elements past the right edge
// that are not inside a sideways-scrolling box.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const browser = await chromium.launch();
for (const width of [390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem("sarapsulit.tour.v1", "done"); localStorage.setItem("sarapsulit.weatherMode", "sunny"); } catch {} });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
  await page.goto(process.argv[2], { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof RECIPES !== "undefined" && RECIPES.length > 0, null, { timeout: 60000 });
  for (const s of ["prices"]) {
    await page.evaluate((name) => showSection(name), s);
    await page.waitForTimeout(s === "prices" ? 6000 : 1500);
    const r = await page.evaluate(() => {
      const W = window.innerWidth;
      const scrolls = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true; } return false; };
      const sec = document.body;
      const wide = [...sec.querySelectorAll("*")].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.right > W + 1 && !scrolls(el); });
      const innermost = wide.filter((el) => !wide.some((o) => o !== el && el.contains(o)));
      const desc = (el) => { const b = el.getBoundingClientRect(); return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).trim().split(/\s+/).slice(0, 6).join(".")} w=${Math.round(b.width)} right=${Math.round(b.right)} text="${(el.textContent || "").trim().slice(0, 40)}"`; };
      // Also: anything whose content overflows it sideways without a scroll box (scrollWidth > clientWidth).
      const spill = [...document.body.querySelectorAll("*")].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible" && el.clientWidth > 0)
        .slice(0, 8).map((el) => `${el.tagName.toLowerCase()}#${el.id}.${String(el.className).slice(0, 60)} scrollW=${el.scrollWidth} clientW=${el.clientWidth}`);
      return { spill, page: document.documentElement.scrollWidth, wide: innermost.slice(0, 12).map(desc), chain: innermost[0] ? (() => { const out = []; for (let p = innermost[0]; p && p !== sec; p = p.parentElement) out.push(desc(p).slice(0, 110)); return out.slice(0, 10); })() : [] };
    });
    console.log(`\n[${width}px] ${s}: page width ${r.page}`);
    // Hide one child at a time; when the page fits again, that child holds the culprit: go inside it.
    const path = await page.evaluate(() => {
      const W = window.innerWidth, wide = () => document.documentElement.scrollWidth > W + 1;
      const name = (el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).trim().split(/\s+/).slice(0, 5).join(".")}`;
      const out = [];
      let el = document.body;
      for (let depth = 0; depth < 30 && el; depth++) {
        let next = null;
        for (const c of el.children) {
          const old = c.style.display;
          c.style.display = "none";
          const fixed = !wide();
          c.style.display = old;
          if (fixed) { next = c; break; }
        }
        if (!next) break;
        const b = next.getBoundingClientRect(), cs = getComputedStyle(next);
        out.push(`${name(next)} w=${Math.round(b.width)} left=${Math.round(b.left)} right=${Math.round(b.right)} pos=${cs.position} minW=${cs.minWidth} ws=${cs.whiteSpace} text="${(next.textContent || "").trim().slice(0, 30)}"`);
        el = next;
      }
      return out;
    });
    for (const p of path) console.log("  PATH:", p);
    for (const w of r.wide) console.log("  WIDE:", w);
    for (const w of r.spill) console.log("  SPILL:", w);
    if (r.wide.length) for (const c of r.chain) console.log("    in:", c);
    if (s === "prices") await page.screenshot({ path: `prices-out/prices-${width}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
