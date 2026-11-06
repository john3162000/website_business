// "Para sa maramihan": a feeding-program planner for NGOs, schools and barangays cooking for
// many people. It picks a cycle menu of main ulam (gulay → isda → karne) that fits a budget per
// head (rice included), scales every ingredient to the headcount, and gives one bulk grocery
// list by palengke section, to download or print.
// Uses globals from app.js (RECIPES, DA_PRICES, API_BASE, escapeHtml, openModal), planner.js
// (isMainUlam, mealTypes, proteinKind, KIND_CYCLE, dietsOk, activeDiets, ingredientTotals,
// groupGrocery, sectionName, formatGrams, detailCache) and settings.js (t).
// docs/feeding.test.mjs tests the pure helpers.

const FEED_KEY = "sarapsulit.feeding.v1";
const FEED_DEFAULTS = { heads: 100, budget: 40, days: 5, riceGrams: 80 };
const FEED_LIMITS = { heads: [10, 2000], budget: [10, 500], days: [1, 30], riceGrams: [0, 200] };

/** Settings clamped to sane ranges; anything missing or not a number falls back to the default. */
function feedSettings(raw) {
  const src = raw || {};
  const out = {};
  for (const [k, [lo, hi]] of Object.entries(FEED_LIMITS)) {
    const v = Number(src[k]);
    out[k] = Number.isFinite(v) && src[k] !== "" && src[k] != null ? Math.min(hi, Math.max(lo, Math.round(v))) : FEED_DEFAULTS[k];
  }
  return out;
}

/**
 * Today's cheapest ordinary rice from the DA list: regular milled first, then well milled.
 * Returns { name, perKg } or null (then the rice is left out of the cost and the page says so).
 */
function feedRicePrice(prices) {
  for (const re of [/^regular milled/i, /^well milled/i]) {
    const hits = (prices || []).filter((p) => re.test(p.name || "") && p.avg > 0);
    if (hits.length) {
      const best = hits.reduce((a, b) => (b.avg < a.avg ? b : a));
      return { name: best.name, perKg: best.avg };
    }
  }
  return null;
}

/** Rice cost per head per meal (₱), or 0 when there is no rice price or no rice. */
function feedRiceCost(rice, grams) {
  return rice && grams > 0 ? (rice.perKg * grams) / 1000 : 0;
}

/** Dishes a feeding program can serve: a main ulam with a complete price, one per title. */
function feedPool(recipes, ok = () => true) {
  const seen = new Set();
  return recipes
    .filter((r) => r.ranked && !r.costIncomplete && r.costPerServing > 0 && isMainUlam(r) && mealTypes(r).has("ulam") && ok(r))
    .filter((r) => {
      const k = r.title.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/**
 * A cycle menu: one main ulam per day, gulay → isda → karne in turn, each within `cap` (₱ per
 * head for the ulam). Among the dishes that fit, one of the five most nutritious is picked
 * (`rng` decides, so "Iba pa" gives another menu). No dish repeats until the pool runs out.
 * When nothing of the day's kind fits, any kind that fits; when nothing fits, the cheapest.
 */
function feedingMenu(pool, { days, cap, rng = Math.random }) {
  const used = new Set();
  const menu = [];
  const pick = (list) => {
    const top = [...list].sort((a, b) => b.nutritionScore - a.nutritionScore || a.costPerServing - b.costPerServing).slice(0, 5);
    return top[Math.min(top.length - 1, Math.floor(rng() * top.length))];
  };
  for (let d = 0; d < days; d++) {
    if (used.size >= pool.length) used.clear();
    const fresh = pool.filter((r) => !used.has(r.id));
    const kind = KIND_CYCLE[d % KIND_CYCLE.length];
    const fits = fresh.filter((r) => r.costPerServing <= cap);
    const r = pick(fits.filter((x) => proteinKind(x) === kind)) || pick(fits)
      || [...fresh].sort((a, b) => a.costPerServing - b.costPerServing)[0];
    if (!r) break;
    used.add(r.id);
    menu.push({ day: d + 1, id: r.id, kind: proteinKind(r), fits: r.costPerServing <= cap });
  }
  return menu;
}

/** Cost and nutrition for the whole program: per day, per head, and the total. */
function feedingTotals(menu, byId, { heads, riceCost }) {
  const rows = menu.map((m) => {
    const r = byId.get(m.id);
    const perHead = r.costPerServing + riceCost;
    return { ...m, title: r.title, ulamPerHead: r.costPerServing, perHead, dayCost: perHead * heads, kcal: r.calories, protein: r.protein };
  });
  const total = rows.reduce((s, x) => s + x.dayCost, 0);
  const n = rows.length || 1;
  return {
    rows,
    total,
    perHeadAvg: rows.reduce((s, x) => s + x.perHead, 0) / n,
    kcalAvg: rows.reduce((s, x) => s + (x.kcal || 0), 0) / n,
    proteinAvg: rows.reduce((s, x) => s + (x.protein || 0), 0) / n,
    overBudget: rows.filter((x) => !x.fits).length,
  };
}

/** Rice to buy for the whole program, in grams (uncooked). */
function feedRiceGrams(heads, days, grams) {
  return heads * days * grams;
}

const feedPeso = (v) => `₱${Math.round(v).toLocaleString("en-PH")}`;

/** The plan as plain text, for downloading or sending. */
function feedingText(s, totals, grocery, rice, dateLabel, lang = "tl") {
  const tl = lang === "tl";
  const lines = [
    `🍲 ${tl ? "Plano para sa feeding program" : "Feeding program plan"} · SarapSulit (FARM2FIGURE)`,
    `${s.heads} ${tl ? "tao" : "people"} · ${s.days} ${tl ? "araw" : "days"} · ${tl ? "badyet" : "budget"} ${feedPeso(s.budget)}/${tl ? "tao bawat kain" : "head per meal"} · ${dateLabel}`,
    "",
    tl ? "MENU" : "MENU",
  ];
  for (const r of totals.rows) {
    lines.push(`${tl ? "Araw" : "Day"} ${r.day}: ${r.title} · ${feedPeso(r.perHead)}/${tl ? "tao" : "head"} · ${feedPeso(r.dayCost)}${r.fits ? "" : " (!)"}`);
  }
  lines.push("", tl ? "BILHIN (lahat ng araw)" : "SHOPPING LIST (all days)");
  if (s.riceGrams > 0) lines.push(`☐ ${tl ? "Bigas" : "Rice"}: ${formatGrams(feedRiceGrams(s.heads, s.days, s.riceGrams))}${rice ? ` · ≈${feedPeso((feedRiceGrams(s.heads, s.days, s.riceGrams) / 1000) * rice.perKg)}` : ""}`);
  for (const g of groupGrocery(grocery.items)) {
    lines.push(sectionName(g));
    for (const it of g.items) lines.push(`☐ ${it.label}: ${formatGrams(it.grams)}${it.priced ? ` · ≈${feedPeso(it.cost)}${it.unpricedGrams > 0 ? "+" : ""}` : ""}`);
  }
  lines.push("", `${tl ? "Kabuuan" : "Total"} ≈ ${feedPeso(totals.total)} (${feedPeso(totals.perHeadAvg)}/${tl ? "tao bawat kain" : "head per meal"})`);
  lines.push(tl
    ? "Presyo mula sa DA, PSA, SM at DTI ngayong araw · dami bago lutuin · i-check sa dietitian ang sapat na sustansya para sa inyong grupo"
    : "Prices from DA, PSA, SM and DTI today · amounts as bought, before cooking · check nutrition targets for your group with a dietitian");
  return lines.join("\n");
}

// ── State and rendering ──

let FEED = { ...FEED_DEFAULTS };
let FEED_MENU = [];

function feedStore() {
  try { return window.localStorage; } catch { return null; }
}

function feedLoad() {
  try { FEED = feedSettings(JSON.parse(feedStore()?.getItem(FEED_KEY) || "{}")); } catch { FEED = { ...FEED_DEFAULTS }; }
}

function feedSave() {
  try { feedStore()?.setItem(FEED_KEY, JSON.stringify(FEED)); } catch { /* not saved */ }
}

function feedReadInputs() {
  const v = (id) => document.getElementById(id)?.value;
  FEED = feedSettings({ heads: v("feed-heads"), budget: v("feed-budget"), days: v("feed-days"), riceGrams: v("feed-rice") });
  feedSave();
}

function initFeeding() {
  feedLoad();
  for (const [id, k] of [["feed-heads", "heads"], ["feed-budget", "budget"], ["feed-days", "days"], ["feed-rice", "riceGrams"]]) {
    const el = document.getElementById(id);
    if (el) el.value = FEED[k];
  }
}

/** Builds a new menu from the inputs ("Gumawa ng plano" / "Iba pa"). */
async function makeFeedingPlan() {
  feedReadInputs();
  const out = document.getElementById("feed-out");
  if (!out) return;
  if (!RECIPES.length) {
    out.innerHTML = `<p class="text-sm text-gray-400">${escapeHtml(t("feed.loading"))}</p>`;
    await DATA_READY?.catch(() => {});
  }
  const rice = feedRicePrice(DA_PRICES);
  const riceCost = feedRiceCost(rice, FEED.riceGrams);
  const diets = typeof activeDiets === "function" ? activeDiets() : [];
  const pool = feedPool(RECIPES, (r) => typeof dietsOk !== "function" || dietsOk(r, diets));
  FEED_MENU = feedingMenu(pool, { days: FEED.days, cap: FEED.budget - riceCost });
  if (typeof trackEvent === "function") trackEvent("feeding/plan");
  await renderFeeding();
}

async function renderFeeding() {
  const out = document.getElementById("feed-out");
  if (!out || !FEED_MENU.length) {
    if (out && !FEED_MENU.length && RECIPES.length) out.innerHTML = `<p class="text-sm text-gray-400">${escapeHtml(t("feed.none"))}</p>`;
    return;
  }
  const byId = new Map(RECIPES.map((r) => [r.id, r]));
  const rice = feedRicePrice(DA_PRICES);
  const riceCost = feedRiceCost(rice, FEED.riceGrams);
  const totals = feedingTotals(FEED_MENU, byId, { heads: FEED.heads, riceCost });
  const kindIcon = { gulay: "🥬", isda: "🐟", karne: "🥩", other: "🍽️" };
  const riceNote = FEED.riceGrams <= 0
    ? t("feed.noRice")
    : rice
      ? t("feed.riceNote").replace("{g}", FEED.riceGrams).replace("{name}", rice.name).replace("{price}", feedPeso(rice.perKg)).replace("{cost}", `₱${riceCost.toFixed(2)}`)
      : t("feed.riceUnpriced");
  out.innerHTML = `
    <div class="grid sm:grid-cols-4 gap-3 mb-4">
      <div class="feed-stat"><span>${escapeHtml(t("feed.total"))}</span><b>${feedPeso(totals.total)}</b></div>
      <div class="feed-stat"><span>${escapeHtml(t("feed.perHead"))}</span><b>${feedPeso(totals.perHeadAvg)}</b></div>
      <div class="feed-stat"><span>${escapeHtml(t("feed.kcal"))}</span><b>${Math.round(totals.kcalAvg)} kcal</b></div>
      <div class="feed-stat"><span>${escapeHtml(t("feed.protein"))}</span><b>${Math.round(totals.proteinAvg)} g</b></div>
    </div>
    ${totals.overBudget ? `<p class="text-sm text-amber-800 mb-3">⚠ ${escapeHtml(t("feed.over").replace("{n}", totals.overBudget))}</p>` : ""}
    <div class="overflow-x-auto"><table class="w-full text-sm">
      <thead><tr class="text-left text-xs text-gray-500 uppercase tracking-wide">
        <th class="py-2 pr-2">${escapeHtml(t("feed.day"))}</th><th class="py-2 pr-2">${escapeHtml(t("feed.dish"))}</th>
        <th class="py-2 pr-2 text-right">${escapeHtml(t("feed.perHeadShort"))}</th><th class="py-2 pr-2 text-right hidden sm:table-cell">kcal</th>
        <th class="py-2 pr-2 text-right hidden sm:table-cell">protein</th><th class="py-2 text-right">${escapeHtml(t("feed.dayCost"))}</th></tr></thead>
      <tbody class="divide-y divide-gray-100">${totals.rows.map((r) => `
        <tr><td class="py-2 pr-2 whitespace-nowrap">${r.day}</td>
          <td class="py-2 pr-2"><button type="button" class="text-left hover:underline" onclick="openModal(${r.id})">${kindIcon[r.kind] || ""} ${escapeHtml(r.title)}</button>${r.fits ? "" : ` <span class="text-amber-800" title="${escapeHtml(t("feed.overOne"))}">⚠</span>`}</td>
          <td class="py-2 pr-2 text-right tabular-nums">${feedPeso(r.perHead)}</td>
          <td class="py-2 pr-2 text-right tabular-nums hidden sm:table-cell">${Math.round(r.kcal || 0)}</td>
          <td class="py-2 pr-2 text-right tabular-nums hidden sm:table-cell">${Math.round(r.protein || 0)} g</td>
          <td class="py-2 text-right tabular-nums font-semibold">${feedPeso(r.dayCost)}</td></tr>`).join("")}</tbody>
    </table></div>
    <p class="text-xs text-gray-500 mt-2">${escapeHtml(riceNote)}</p>
    <h3 class="font-semibold mt-5 mb-2">🛒 ${escapeHtml(t("feed.grocery"))}</h3>
    <div id="feed-grocery" class="text-sm"><p class="text-gray-400">${escapeHtml(t("feed.loadingLines"))}</p></div>
    <div class="flex flex-wrap gap-2 mt-4 feed-actions">
      <button type="button" class="wx-btn" onclick="makeFeedingPlan()">🔀 ${escapeHtml(t("feed.again"))}</button>
      <button type="button" class="wx-btn" onclick="downloadFeeding()">⬇️ ${escapeHtml(t("feed.download"))}</button>
      <button type="button" class="wx-btn" onclick="printFeeding()">🖨️ ${escapeHtml(t("feed.print"))}</button>
    </div>
    <p class="text-xs text-gray-400 mt-3">${escapeHtml(t("feed.note"))}</p>`;
  await feedLoadDetails();
  renderFeedGrocery(rice);
}

/** Fetches the ingredient lines of menu dishes not seen yet (shared cache with the planner). */
async function feedLoadDetails() {
  const missing = [...new Set(FEED_MENU.map((m) => m.id))].filter((id) => !detailCache.has(id));
  await Promise.all(missing.map(async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/recipes/compiled?id=${id}`);
      const j = await res.json();
      if (j.recipe) detailCache.set(id, { servings: j.recipe.servings, lines: j.recipe.lines });
    } catch { /* left out of the list */ }
  }));
}

function feedGrocery() {
  return ingredientTotals(FEED_MENU.map((m) => ({ id: m.id, people: FEED.heads })), detailCache);
}

function renderFeedGrocery(rice) {
  const box = document.getElementById("feed-grocery");
  if (!box) return;
  const g = feedGrocery();
  const riceG = feedRiceGrams(FEED.heads, FEED.days, FEED.riceGrams);
  const riceRow = FEED.riceGrams > 0
    ? `<div class="rc-row"><span class="rc-name">${escapeHtml(t("feed.rice"))} <span class="rc-qty">${formatGrams(riceG)}</span></span><span>${rice ? feedPeso((riceG / 1000) * rice.perKg) : "—"}</span></div>`
    : "";
  box.innerHTML = `<div class="rc-day"><span>🍚 ${escapeHtml(t("feed.rice"))}</span><span></span></div>${riceRow}`
    + groupGrocery(g.items).map((grp) => `<div class="rc-day"><span>${escapeHtml(sectionName(grp))}</span><span>${feedPeso(grp.items.reduce((s, it) => s + it.cost, 0))}</span></div>`
      + grp.items.map((it) => `<div class="rc-row"><span class="rc-name">${escapeHtml(it.label)} <span class="rc-qty">${formatGrams(it.grams)}</span></span><span>${it.priced ? feedPeso(it.cost) + (it.unpricedGrams > 0 ? "+" : "") : "—"}</span></div>`).join("")).join("");
}

function downloadFeeding() {
  if (!FEED_MENU.length) return;
  const byId = new Map(RECIPES.map((r) => [r.id, r]));
  const rice = feedRicePrice(DA_PRICES);
  const totals = feedingTotals(FEED_MENU, byId, { heads: FEED.heads, riceCost: feedRiceCost(rice, FEED.riceGrams) });
  const lang = typeof SETTINGS !== "undefined" && SETTINGS.lang === "en" ? "en" : "tl";
  const text = feedingText(FEED, totals, feedGrocery(), rice, new Date().toLocaleDateString("en-PH", { dateStyle: "medium" }), lang);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  a.download = `feeding-plan-${FEED.heads}-tao.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Prints only the feeding card (see the print CSS in index.html). */
function printFeeding() {
  document.body.classList.add("printing-feed");
  const done = () => { document.body.classList.remove("printing-feed"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
}

if (typeof document !== "undefined" && document.getElementById && document.getElementById("feeding")) initFeeding();
