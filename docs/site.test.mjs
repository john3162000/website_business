// Checks on the static site scripts. node --test docs/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (f) => readFileSync(new URL(`./${f}`, import.meta.url), "utf8");

test("site scripts have no stray control characters", () => {
  // A regex written through an unescaped string once turned \b into a backspace
  // byte (0x08), and the course-based categories silently never matched.
  for (const f of ["app.js", "weather.js", "mydish.js", "planner.js", "finder.js", "alerts.js", "share.js", "tour.js", "games.js", "taste.js", "facts.js", "kitchen.js", "settings.js", "seasons.js", "screen.js"]) {
    const bad = [...read(f).matchAll(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g)];
    assert.equal(bad.length, 0, `${f}: control character at offset ${bad[0]?.index}`);
  }
});

test("the page loads no unchecked outside code and keeps its content security policy", () => {
  const html = read("index.html");
  // Built CSS (site-css/) instead of the Tailwind Play CDN, which ran whatever it served.
  assert.ok(!html.includes("cdn.tailwindcss.com"), "Tailwind Play CDN is back");
  assert.ok(!read("match-review.html").includes("cdn.tailwindcss.com"), "match-review.html uses the Play CDN");
  assert.match(html, /<link rel="stylesheet" href="tailwind\.css">\s*<\/head>/);
  // green-700 is re-pointed at forest green #1D5239 (Tailwind writes it as rgb).
  assert.ok(read("tailwind.css").includes("rgb(29 82 57"), "tailwind.css lacks the forest green theme");
  // Every script tag is local (same origin), so the CSP's script hosts are only the two pinned below.
  for (const m of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) assert.ok(!/^https?:/.test(m[1]), `remote script tag: ${m[1]}`);
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
  assert.ok(csp, "no CSP meta tag");
  for (const part of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "https://website-business-beta.vercel.app", "https://api.open-meteo.com"]) {
    assert.ok(csp.includes(part), `CSP lacks ${part}`);
  }
  assert.match(read("finder.js"), /s\.integrity = D3_SRI; s\.crossOrigin = "anonymous"/);
  assert.match(read("finder.js"), /const D3_SRI = "sha384-[A-Za-z0-9+/]{64}"/);
  assert.match(read("app.js"), /s\.src = "https:\/\/gc\.zgo\.at\/count\.v4\.js";\s*s\.integrity = "sha384-[A-Za-z0-9+/]{64}";\s*s\.crossOrigin = "anonymous";/);
});

test("categoryFor: clear courses win, the title decides otherwise", () => {
  const src = read("app.js");
  const ctx = vm.createContext({});
  vm.runInContext(`${src.slice(src.indexOf("function categoryFor"), src.indexOf("// ═══════════════ DATA"))};globalThis.categoryFor = categoryFor;`, ctx);
  const { categoryFor } = ctx;
  assert.equal(categoryFor("Mang Tomas Copycat", "Sauce, Condiment"), "Sauce & Condiment");
  assert.equal(categoryFor("Egg Drop Soup", "Appetizer, Dinner, Main Dish, Soup"), "Soup");
  assert.equal(categoryFor("Leche Flan Cups", "Dessert"), "Dessert");
  assert.equal(categoryFor("Sopas", "Appetizer"), "Soup"); // patchy course, title knows better
  assert.equal(categoryFor("Pork Adobo", "Main Course"), "Main Dish");
  assert.equal(categoryFor("How to Make Sinamak", null), "Sauce & Condiment");
  assert.equal(categoryFor("Chili Garlic Oil Recipe", null), "Sauce & Condiment");
  // Kakanin and sweets the recipe site files as a main dish.
  for (const t of ["Pichi-Pichi", "Ube Pichi Pichi Recipe", "Nilupak na Kamoteng Kahoy", "Panlasang Pinoy Bibingkang Galapong", "Banana Yogurt Smoothie", "New York Style Cheesecake", "Buko Salad Ice candy"]) {
    assert.equal(categoryFor(t, "Main Dish"), "Dessert", t);
  }
  assert.equal(categoryFor("Chicken Adobo", "Main Dish"), "Main Dish");
});

test("keyboard: Tab wraps inside a pop-up, and the pop-ups carry dialog semantics", () => {
  const src = read("app.js");
  const ctx = vm.createContext({});
  vm.runInContext(`${src.slice(src.indexOf("function dlgWrapIndex"), src.indexOf("function dlgFocusables"))};globalThis.dlgWrapIndex = dlgWrapIndex;`, ctx);
  const { dlgWrapIndex } = ctx;
  assert.equal(dlgWrapIndex(4, 5, false), 0, "Tab on the last goes to the first");
  assert.equal(dlgWrapIndex(0, 5, true), 4, "Shift+Tab on the first goes to the last");
  assert.equal(dlgWrapIndex(-1, 5, false), 0, "focus outside: to the first");
  assert.equal(dlgWrapIndex(-1, 5, true), 4);
  assert.equal(dlgWrapIndex(2, 5, false), 3);
  assert.equal(dlgWrapIndex(0, 0, false), -1);
  const html = read("index.html");
  assert.match(html, /class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title"/);
  assert.match(html, /class="modal-x"[^>]*aria-label="Isara"/);
  assert.match(html, /:focus-visible \{ outline: 3px solid var\(--ring\)/);
  assert.match(src, /id="modal-title" tabindex="-1" data-dlg-focus/);
  assert.match(src, /<button type="button" class="rc-open"/, "recipe cards open from a real button");
  // Every div pop-up registers for Esc and focus handling.
  for (const [file, open] of [["app.js", "dlgOpen(modalPanel(), closeModal)"], ["settings.js", "closeSettings);"], ["kitchen.js", "closeKitchen);"], ["tour.js", "endTour);"]]) {
    assert.ok(read(file).includes(open), `${file} calls dlgOpen`);
  }
});

test("browse: the Filters (n) count", () => {
  const src = read("app.js");
  const ctx = vm.createContext({});
  vm.runInContext(`${src.slice(src.indexOf("function browseFilterCount"), src.indexOf("function updateBrowseFilterCount"))};globalThis.browseFilterCount = browseFilterCount;`, ctx);
  const { browseFilterCount } = ctx;
  assert.equal(browseFilterCount({ sort: "valueScore", minProt: "", maxCost: "", produce: " ", minKcal: "", maxKcal: "" }), 0);
  assert.equal(browseFilterCount({ sort: "protein", minProt: "15", maxCost: "60", produce: "kangkong", minKcal: "", maxKcal: "700" }), 5);
});

test("splitHidden:recipes with an ingredient not in the catalog are hidden, not dropped silently", () => {
  const src = read("app.js");
  const ctx = vm.createContext({});
  vm.runInContext(`${src.slice(src.indexOf("function splitHidden"), src.indexOf("async function loadData"))};globalThis.splitHidden = splitHidden;`, ctx);
  const recipes = [1, 2, 3, 4, 5].map((id) => ({ id, ingredients: id === 5 ? [] : [{ name: "x" }] }));
  const compiled = new Map([
    [1, { id: 1, hidden: false }], [2, { id: 2, hidden: true, unknownLines: 1 }],
    [3, { id: 3, hidden: false, isArticle: true }], [4, { id: 4, hidden: true, isCollection: true }], [5, { id: 5, hidden: false }],
  ]);
  const { shown, hidden } = ctx.splitHidden(recipes, compiled);
  assert.deepEqual(Array.from(shown, (r) => r.id), [1]);
  assert.deepEqual(Array.from(hidden, (r) => r.id), [2]); // articles, round-ups and empty lists are neither
});

test("sulit meter: dishes are placed by how they rank against all others", () => {
  const src = read("app.js");
  const ctx = vm.createContext({});
  vm.runInContext(`${src.slice(src.indexOf("let SULIT_SCORES"), src.indexOf("/** Five-segment meter"))};globalThis.sulitLevel = sulitLevel;`, ctx);
  const scores = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
  assert.equal(ctx.sulitLevel(100, scores).label, "Super sulit"); // better than 99%
  assert.equal(ctx.sulitLevel(75, scores).segs, 4);
  assert.equal(ctx.sulitLevel(50, scores).label, "Okay");
  assert.equal(ctx.sulitLevel(20, scores).label, "Hindi gaano sulit"); // low value, not "expensive"
  assert.equal(ctx.sulitLevel(1, scores).segs, 1);
  assert.equal(ctx.sulitLevel(5, []), null);
});

test("the header tabs and the phone tab bar use the same section names", () => {
  const html = read("index.html");
  const header = html.slice(html.indexOf('<nav class="flex gap-1'), html.indexOf("</nav>"));
  const bottom = html.slice(html.indexOf('<nav class="bottom-nav"'));
  const keys = (s) => [...s.matchAll(/data-i18n="(nav\.[a-z]+)"/g)].map((m) => m[1]);
  assert.ok(keys(header).length >= 6);
  assert.deepEqual(keys(bottom).slice(0, keys(header).length), keys(header));
});

test("the price table's hidden label stays inside its scroll box (Prices fits a phone)", () => {
  // Tailwind's sr-only is position:absolute; without a positioned scroll box it anchored to the page
  // and made the Prices tab ~600 px wide on phones.
  const html = read("index.html");
  const table = html.indexOf('id="price-table-body"');
  const box = html.lastIndexOf('class="overflow-x-auto', table);
  assert.ok(box > 0 && /class="overflow-x-auto[^"]*\brelative\b/.test(html.slice(box, box + 60)));
});

test("the recipe pop-up never shows or loads the source's steps", () => {
  // Offer to partner sites: we show the dish, they teach the cooking ("Paano lutuin?" links to them).
  const app = read("app.js"), share = read("share.js");
  assert.ok(!app.includes("/api/recipes/${id}`)"), "the pop-up must not fetch the stored steps");
  assert.ok(!/>Instructions</.test(app));
  assert.match(app, /Paano lutuin\?/);
  assert.ok(!/steps\)/.test(share.match(/async function drawRecipeCard\([^)]*\)/)[0]), "the share picture takes no steps");
});
