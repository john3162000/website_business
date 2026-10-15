// Weekly planner: drag dishes into a week of Almusal / Tanghalian / Meryenda /
// Hapunan, and see the week's receipt per dish or per ingredient. Saved on this
// device (localStorage). Uses app.js helpers: API_BASE, RECIPES, escapeHtml,
// openModal. docs/planner.test.mjs tests the pure helpers.

const PLAN_KEY = "sarapsulit.planner.v1";
const DAYS = ["Lunes", "Martes", "Miyerkules", "Huwebes", "Biyernes", "Sabado", "Linggo"];
const MEALS = ["Almusal", "Tanghalian", "Meryenda", "Hapunan"];
const MAX_PER_SLOT = 3;

// ── Pure helpers ──

const slotKey = (day, meal) => `${day}|${meal}`;

function emptyPlan() {
  return { people: 4, slots: {} };
}

function loadPlan(storage) {
  try {
    const v = JSON.parse(storage.getItem(PLAN_KEY) || "null");
    if (!v || typeof v !== "object" || typeof v.slots !== "object") return emptyPlan();
    return { people: Math.max(1, Math.min(30, Number(v.people) || 4)), slots: v.slots };
  } catch {
    return emptyPlan();
  }
}

function savePlan(storage, plan) {
  try {
    storage.setItem(PLAN_KEY, JSON.stringify(plan));
    return true;
  } catch {
    return false;
  }
}

/** The plan with dish `id` added to a slot (no duplicates, at most MAX_PER_SLOT). */
function addToSlot(plan, key, id) {
  const cur = plan.slots[key] || [];
  if (cur.includes(id) || cur.length >= MAX_PER_SLOT) return plan;
  return { ...plan, slots: { ...plan.slots, [key]: [...cur, id] } };
}

function removeFromSlot(plan, key, id) {
  const cur = (plan.slots[key] || []).filter((x) => x !== id);
  const slots = { ...plan.slots };
  if (cur.length) slots[key] = cur; else delete slots[key];
  return { ...plan, slots };
}

/** Every planned dish in week order: [{ day, meal, id }]. */
function plannedDishes(plan) {
  const out = [];
  for (const day of DAYS) for (const meal of MEALS) for (const id of plan.slots[slotKey(day, meal)] || []) out.push({ day, meal, id });
  return out;
}

/**
 * Receipt per dish: each planned dish costs its cost per serving × people.
 * `recipes` maps id → { title, costPerServing, priced, partial }. Unpriced dishes count 0 and are flagged.
 */
function receiptByDish(plan, recipes) {
  const rows = plannedDishes(plan).map(({ day, meal, id }) => {
    const r = recipes.get(id);
    const cost = r && r.priced ? r.costPerServing * plan.people : null;
    return { day, meal, id, title: r ? r.title : `Recipe ${id}`, cost, partial: !!(r && r.partial) };
  });
  const byDay = Object.fromEntries(DAYS.map((d) => [d, rows.filter((x) => x.day === d).reduce((s, x) => s + (x.cost || 0), 0)]));
  return { rows, byDay, total: rows.reduce((s, x) => s + (x.cost || 0), 0), unpriced: rows.filter((x) => x.cost == null).length };
}

/**
 * Receipt per ingredient: every planned dish's lines (from /api/recipes/compiled?id=…),
 * scaled from the recipe's servings to the household, summed by ingredient.
 * `details` maps id → { servings, lines: [{ slug, label, text, gAP, cost, priceSource, status }] }.
 */
function receiptByIngredient(plan, details) {
  const items = new Map();
  let total = 0;
  for (const { id } of plannedDishes(plan)) {
    const d = details.get(id);
    if (!d) continue;
    const k = plan.people / (d.servings || 4);
    for (const l of d.lines) {
      if (!["ok", "no-nutrition"].includes(l.status) || l.gAP == null) continue;
      const key = l.slug || l.text.toLowerCase();
      const it = items.get(key) || { key, label: l.label || l.text, grams: 0, cost: 0, priced: false, unpricedGrams: 0, sources: new Set(), dishes: new Set() };
      it.grams += l.gAP * k;
      if (l.cost != null) { it.cost += l.cost * k; it.priced = true; total += l.cost * k; if (l.priceSource) it.sources.add(l.priceSource); }
      else it.unpricedGrams += l.gAP * k;
      it.dishes.add(id);
      items.set(key, it);
    }
  }
  const list = [...items.values()].sort((a, b) => b.cost - a.cost || b.grams - a.grams)
    .map((it) => ({ ...it, sources: [...it.sources], dishes: it.dishes.size }));
  return { items: list, total, unpriced: list.filter((x) => !x.priced).length };
}

// ── Meal types: which slots a dish suits (a dish can suit several) ──

const MERYENDA_TITLE = /\b(turon|banana ?cue|camote ?cue|kamote ?cue|maruya|lumpia|lumpiang|shanghai|okoy|ukoy|fish ?balls?|kwek[- ]?kwek|tokneneng|siomai|siopao|empanadas?|pancit|palabok|puto|kutsinta|bibingka|suman|biko|palitaw|sapin[- ]?sapin|kakanin|maja|cassava cake|bilo[- ]?bilo|ginataang mais|ginataang halo|binignit|halo[- ]?halo|mais con yelo|sago|gulaman|buko pandan|fruit salad|ensaymada|pandesal|pan de sal|sandwich(es)?|burgers?|spaghetti|arroz caldo|lugaw|goto|champorado|cakes?|cupcakes?|cookies|brownies?|leche flan|flan|polvoron|pastillas|turrones|donuts?|doughnuts?|muffins?|bread|banana loaf|hopia|cheese sticks|french fries|nachos|camote fries)\b/i;
const ALMUSAL_TITLE = /(silog\b|\b(tapa|tocino|longg?anisa|daing|tuyo|danggit|champorado|lugaw|arroz caldo|goto|pandesal|pan de sal|omelet(te)?|torta|tortang|scrambled eggs?|sinangag|fried rice|garlic rice|hotcakes?|pancakes?|french toast|corned beef hash)\b)/i;
const SNACK_COURSE = /\b(snacks?|desserts?|appetizers?|merienda|meryenda)\b/i;
const MEAL_COURSE = /\b(main|dinner|lunch|entree|soup|side dish)\b/i;

/**
 * The slot series a dish fits: "almusal", "ulam" (Tanghalian / Hapunan) and/or "meryenda".
 * From the title, the site category and Panlasang Pinoy's course. Sauces fit none.
 */
function mealTypes(recipe) {
  const title = recipe.title || "", course = recipe.course || "", cat = recipe.category || "";
  const out = new Set();
  if (cat === "Sauce & Condiment") return out;
  if (/\bbreakfast\b/i.test(course) || ALMUSAL_TITLE.test(title)) out.add("almusal");
  if (cat === "Dessert" || SNACK_COURSE.test(course) || MERYENDA_TITLE.test(title)) out.add("meryenda");
  // Anything that is a meal: mains, soups, fish, vegetables, rice and noodles. Not desserts,
  // and not dishes whose course is only a snack or appetizer (kwek-kwek, fishballs).
  const snackOnly = SNACK_COURSE.test(course) && !MEAL_COURSE.test(course);
  if (cat !== "Dessert" && !snackOnly) out.add("ulam");
  return out;
}

const SERIES = [
  { key: "all", label: "Lahat" },
  { key: "almusal", label: "Almusal" },
  { key: "ulam", label: "Tanghalian / Hapunan" },
  { key: "meryenda", label: "Meryenda" },
];

/** The series a slot asks for. */
function seriesForMeal(meal) {
  return meal === "Almusal" ? "almusal" : meal === "Meryenda" ? "meryenda" : "ulam";
}

/** "1.2 kg" / "350 g". */
function formatGrams(g) {
  return g >= 1000 ? `${(g / 1000).toFixed(g >= 10000 ? 0 : 1)} kg` : `${Math.round(g)} g`;
}

// ── State and rendering ──

let plan = emptyPlan();
let receiptMode = "dish";
let picked = null; // tapped dish waiting for a slot (phones)
const detailCache = new Map();

function plannerStore() {
  try { return window.localStorage; } catch { return null; }
}

async function initPlanner() {
  const s = plannerStore();
  plan = s ? loadPlan(s) : emptyPlan();
  document.getElementById("plan-people").value = plan.people;
  const cats = document.getElementById("plan-cat");
  if (cats.options.length <= 1) {
    for (const c of ["Main Dish", "Soup", "Fish & Seafood", "Vegetable Dish", "Rice & Noodles", "Dessert"]) cats.add(new Option(c, c));
  }
  // The dish list needs RECIPES, which may still be loading on a first visit.
  if (!RECIPES.length) {
    document.getElementById("plan-picker").innerHTML = `<p class="text-sm text-gray-400 p-2">Loading dishes…</p>`;
    await DATA_READY?.catch(() => {});
  }
  renderPicker();
  renderGrid();
  renderReceipt();
}

function persist() {
  const s = plannerStore();
  if (s) savePlan(s, plan);
}

function plannerRecipes() {
  return new Map(RECIPES.map((r) => [r.id, { title: r.title, img: r.img, costPerServing: r.costPerServing, priced: r.costPerServing > 0, partial: r.costCoverage < 1 }]));
}

let series = "all";
let targetSlot = null; // slot tapped first (phones): the next dish tapped goes there
const HINT = "Drag a dish into a slot, or tap a dish then tap a slot.";

function setSeries(key) {
  series = key;
  renderPicker();
}

function renderPicker() {
  const q = (document.getElementById("plan-search").value || "").toLowerCase();
  const cat = document.getElementById("plan-cat").value;
  const types = new Map(RECIPES.map((r) => [r.id, mealTypes(r)]));
  const inSeries = (r) => series === "all" || types.get(r.id).has(series);
  // Sauces and condiments fit no meal slot: not offered.
  const pool = RECIPES.filter((r) => r.costPerServing > 0 && types.get(r.id).size > 0);
  document.getElementById("plan-series").innerHTML = SERIES.map((s) =>
    `<button class="wx-btn ${s.key === series ? "on" : ""}" onclick="setSeries('${s.key}')">${s.label}</button>`).join("");
  const matches = pool
    .filter((r) => inSeries(r) && (!q || r.title.toLowerCase().includes(q)) && (!cat || r.category === cat))
    .sort((a, b) => (b.ranked - a.ranked) || (b.valueScore - a.valueScore));
  const label = SERIES.find((s) => s.key === series).label;
  document.getElementById("plan-count").textContent = `${label} · ${matches.length.toLocaleString()} dish${matches.length !== 1 ? "es" : ""}`;
  document.getElementById("plan-picker").innerHTML = matches.slice(0, 60).map((r) => `
    <div class="plan-dish ${picked === r.id ? "picked" : ""}" draggable="true" data-id="${r.id}"
         ondragstart="event.dataTransfer.setData('text/plain','${r.id}')" onclick="pickDish(${r.id})" title="Drag to a day, or tap then tap a slot">
      ${r.img ? `<img src="${escapeHtml(r.img)}" alt="" loading="lazy">` : `<div class="plan-noimg">🍽️</div>`}
      <div class="min-w-0"><p class="plan-dish-title">${escapeHtml(r.title)}</p>
      <p class="plan-dish-sub">₱${r.costPerServing}${r.costCoverage < 1 ? "+" : ""}/serving · ${r.category}
        ${series !== "meryenda" && types.get(r.id).has("meryenda") ? `<span class="plan-badge">Meryenda</span>` : ""}</p></div>
    </div>`).join("") || `<p class="text-sm text-gray-400 p-2">No matching dishes.</p>`;
}

function pickDish(id) {
  if (targetSlot) { const key = targetSlot; targetSlot = null; markTarget(); place(key, id); hint(HINT); return; }
  picked = picked === id ? null : id;
  document.querySelectorAll(".plan-dish").forEach((el) => el.classList.toggle("picked", Number(el.dataset.id) === picked));
  hint(picked ? "Now tap a slot to place it." : HINT);
}

function hint(text) {
  document.getElementById("plan-hint").textContent = text;
}

function markTarget() {
  document.querySelectorAll(".plan-cell").forEach((el) => el.classList.toggle("target", el.dataset.key === targetSlot));
}

function renderGrid() {
  const recipes = plannerRecipes();
  const head = `<div></div>` + DAYS.map((d) => `<div class="plan-day">${d}</div>`).join("");
  const body = MEALS.map((meal) => `<div class="plan-meal">${meal}</div>` + DAYS.map((day) => {
    const key = slotKey(day, meal);
    const ids = plan.slots[key] || [];
    return `<div class="plan-cell ${key === targetSlot ? "target" : ""}" data-key="${key}" ondragover="event.preventDefault();this.classList.add('over')"
              ondragleave="this.classList.remove('over')" ondrop="dropDish(event,'${key}')" onclick="placePicked('${key}')">
      ${ids.map((id) => {
        const r = recipes.get(id);
        return `<div class="plan-chip" onclick="event.stopPropagation();openModal(${id})" title="${escapeHtml(r ? r.title : "")}">
          ${r && r.img ? `<img src="${escapeHtml(r.img)}" alt="">` : ""}<span>${escapeHtml(r ? r.title : `#${id}`)}</span>
          <button onclick="event.stopPropagation();unplan('${key}',${id})" aria-label="Remove">✕</button></div>`;
      }).join("")}
    </div>`;
  }).join("")).join("");
  document.getElementById("plan-grid").innerHTML = head + body;
}

function dropDish(e, key) {
  e.preventDefault();
  e.currentTarget.classList.remove("over");
  const id = Number(e.dataTransfer.getData("text/plain"));
  if (id) place(key, id);
  setSeries(seriesForMeal(key.split("|")[1]));
}

/** A slot was tapped: place the picked dish, or show that slot's series and wait for a dish. */
function placePicked(key) {
  const meal = key.split("|")[1];
  if (picked) { const id = picked; pickDish(id); place(key, id); setSeries(seriesForMeal(meal)); return; }
  targetSlot = targetSlot === key ? null : key;
  markTarget();
  if (!targetSlot) { hint(HINT); return; }
  setSeries(seriesForMeal(meal));
  hint(`Tap a dish to put it in ${key.replace("|", " · ")}.`);
  // Phones: the picker sits above the grid.
  if (window.matchMedia && window.matchMedia("(max-width: 1023px)").matches) document.getElementById("plan-picker-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

function place(key, id) {
  plan = addToSlot(plan, key, id);
  persist(); renderGrid(); renderReceipt();
}

function unplan(key, id) {
  plan = removeFromSlot(plan, key, id);
  persist(); renderGrid(); renderReceipt();
}

function setPeople(v) {
  plan = { ...plan, people: Math.max(1, Math.min(30, parseInt(v, 10) || 1)) };
  persist(); renderReceipt();
}

function clearPlan() {
  plan = { ...emptyPlan(), people: plan.people };
  persist(); renderGrid(); renderReceipt();
}

function setReceiptMode(mode) {
  receiptMode = mode;
  document.querySelectorAll("[data-receipt]").forEach((b) => b.classList.toggle("on", b.dataset.receipt === mode));
  renderReceipt();
}

const peso = (v) => `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function renderReceipt() {
  const out = document.getElementById("plan-receipt");
  const dishes = plannedDishes(plan);
  if (!dishes.length) {
    out.innerHTML = `<p class="text-sm text-gray-400">Your receipt appears here once you add dishes.</p>`;
    return;
  }
  if (receiptMode === "dish") {
    const r = receiptByDish(plan, plannerRecipes());
    out.innerHTML = DAYS.filter((d) => r.rows.some((x) => x.day === d)).map((d) => `
      <div class="rc-day"><span>${d}</span><span>${peso(r.byDay[d])}</span></div>
      ${r.rows.filter((x) => x.day === d).map((x) => `
        <div class="rc-row"><span class="rc-name">${x.meal}: ${escapeHtml(x.title)}</span>
        <span>${x.cost == null ? "—" : peso(x.cost) + (x.partial ? "+" : "")}</span></div>`).join("")}`).join("")
      + receiptFooter(r.total, r.rows.some((x) => x.partial) ? "+ some ingredients have no price yet" : "", r.unpriced);
    return;
  }
  // Per ingredient: needs each dish's lines.
  const missing = [...new Set(dishes.map((d) => d.id))].filter((id) => !detailCache.has(id));
  if (missing.length) {
    out.innerHTML = `<p class="text-sm text-gray-400">Adding up ingredients for ${missing.length} dish${missing.length > 1 ? "es" : ""}…</p>`;
    await Promise.all(missing.map(async (id) => {
      try {
        const res = await fetch(`${API_BASE}/api/recipes/compiled?id=${id}`);
        const j = await res.json();
        if (j.recipe) detailCache.set(id, { servings: j.recipe.servings, lines: j.recipe.lines });
      } catch { /* left out of the total */ }
    }));
    if (receiptMode !== "ingredient") return;
  }
  const r = receiptByIngredient(plan, detailCache);
  out.innerHTML = r.items.map((it) => `
    <div class="rc-row"><span class="rc-name">${escapeHtml(it.label)} <span class="rc-qty">${formatGrams(it.grams)}${it.dishes > 1 ? ` · ${it.dishes} dishes` : ""}</span></span>
    <span>${it.priced ? peso(it.cost) + (it.unpricedGrams > 0 ? "+" : "") : "—"}</span></div>`).join("")
    + receiptFooter(r.total, r.unpriced ? `${r.unpriced} ingredient${r.unpriced > 1 ? "s" : ""} without a price (—)` : "", 0);
}

function receiptFooter(total, note, unpricedDishes) {
  return `
    <div class="rc-total"><span>Total for the week</span><span>${peso(total)}</span></div>
    <p class="rc-note">For ${plan.people} ${plan.people === 1 ? "person" : "people"} · DA, PSA, SM and DTI prices${note ? ` · ${note}` : ""}${unpricedDishes ? ` · ${unpricedDishes} dish${unpricedDishes > 1 ? "es" : ""} without a price` : ""}</p>`;
}
