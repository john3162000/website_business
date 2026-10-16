// My Dish: build a dish from scratch or from a site recipe, and see its cost,
// nutrition and price over time. Dishes are saved on this device only
// (localStorage). Uses app.js helpers: API_BASE, RECIPES, buildRecipe, pct,
// ingredientRows, pctText, shortDate, escapeHtml, showSection, closeModal.
// docs/mydish.test.mjs tests the pure helpers.

const DISH_KEY = "sarapsulit.dishes.v1";
const UNITS = ["g", "kg", "cup", "tbsp", "tsp", "piece", "clove", "head", "bunch", "stalk", "slice", "thumb", "lb", "oz", "ml", "can", "pack"];

// ── Pure helpers ──

function loadDishes(storage) {
  try {
    const v = JSON.parse(storage.getItem(DISH_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function saveDishes(storage, list) {
  try {
    storage.setItem(DISH_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // private mode, storage full or blocked
  }
}

/** The list with `dish` replacing the one with its id, or added first. */
function upsertDish(list, dish) {
  const i = list.findIndex((d) => d.id === dish.id);
  return i >= 0 ? list.map((d, j) => (j === i ? dish : d)) : [dish, ...list];
}

function newDishId() {
  return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** A site recipe's ingredient lines as an editable dish (group headings left out). */
function dishFromRecipe(recipe, servings) {
  return {
    id: newDishId(),
    title: `My ${recipe.title}`,
    servings: servings || recipe.servings || 4,
    fromRecipeId: recipe.id,
    lines: (recipe.ingredients || [])
      .filter((i) => i.name && !/:\s*$/.test(i.name.trim()))
      .map((i) => ({ amount: i.amount || "", unit: i.unit || "", name: i.name, slug: null })),
  };
}

/**
 * Days comparable with today: a day missing a DA price looks cheaper only
 * because less is priced, so keep days whose priced share is close to today's.
 */
function comparableHistory(history, todayCoverage) {
  return (history || []).filter((p) => p.cost != null && p.costCoverage != null && p.costCoverage >= (todayCoverage || 0) - 0.05);
}

/** SVG path through [{date, cost}] scaled into w×h, or null with fewer than 2 points. */
function sparkPath(points, w = 300, h = 64, pad = 4) {
  if (!points || points.length < 2) return null;
  const xs = points.map((p) => new Date(p.date).getTime());
  const ys = points.map((p) => p.cost);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sx = (x) => pad + (x1 === x0 ? 0 : (x - x0) / (x1 - x0)) * (w - 2 * pad);
  const sy = (y) => h - pad - (y1 === y0 ? 0.5 : (y - y0) / (y1 - y0)) * (h - 2 * pad);
  return points.map((p, i) => `${i ? "L" : "M"}${sx(xs[i]).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join(" ");
}

// ── State ──

let INGREDIENTS = null;   // [{slug, label, units, priceSource}] from /api/ingredients
let currentDish = null;   // { id, title, servings, lines: [{amount, unit, name, slug}], fromRecipeId?, lastCost?, savedAt? }
let dishTimer = null;
let dishRequest = 0;
let lastResult = null;

function store() {
  try { return window.localStorage; } catch { return null; }
}

async function initMyDish() {
  // Draw first, then calculate: the ingredient list below can take a moment,
  // and drawing the editor after a calculation would wipe its result.
  renderDishList();
  renderEditor();
  if (currentDish) scheduleDish(0);
  if (!INGREDIENTS) {
    try {
      const res = await fetch(`${API_BASE}/api/ingredients`);
      INGREDIENTS = res.ok ? (await res.json()).ingredients : [];
    } catch {
      INGREDIENTS = [];
    }
    document.getElementById("ingredient-options").innerHTML = INGREDIENTS.map((i) => `<option value="${escapeHtml(i.label)}"></option>`).join("");
  }
}

// ── Saved dishes ──

function renderDishList() {
  const s = store();
  const dishes = s ? loadDishes(s) : [];
  const cards = dishes.map((d) => `
    <div class="bg-white rounded-xl shadow px-4 py-3 flex items-center justify-between gap-3 ${currentDish && currentDish.id === d.id ? "ring-2 ring-green-600" : ""}">
      <button onclick="openDish('${d.id}')" class="text-left min-w-0">
        <p class="font-medium truncate">${escapeHtml(d.title)}</p>
        <p class="text-xs text-gray-400">${d.lastCost != null ? `₱${Number(d.lastCost).toFixed(0)}/serving · ` : ""}${d.lines.length} ingredients</p>
      </button>
      <button onclick="deleteDish('${d.id}')" class="text-gray-300 hover:text-red-600 text-lg leading-none" title="Delete">✕</button>
    </div>`).join("");
  document.getElementById("mydish-list").innerHTML = `
    <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
      <h2 class="font-bold text-lg">Saved on this device</h2>
      <button onclick="newDish()" class="bg-green-700 hover:bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-full">+ New dish from scratch</button>
    </div>
    ${s ? "" : `<p class="text-sm text-amber-700 mb-2">This browser blocks storage, so dishes can't be saved here.</p>`}
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${cards || `<p class="text-sm text-gray-400">No saved dishes yet. Start one from scratch, or tap “Customize this dish” on any recipe.</p>`}</div>`;
}

function newDish() {
  currentDish = { id: newDishId(), title: "My dish", servings: 4, lines: [{ amount: "", unit: "", name: "", slug: null }] };
  lastResult = null;
  renderDishList();
  renderEditor();
}

function openDish(id) {
  const s = store();
  const d = s && loadDishes(s).find((x) => x.id === id);
  if (!d) return;
  currentDish = JSON.parse(JSON.stringify(d));
  lastResult = null;
  renderDishList();
  renderEditor();
  scheduleDish(0);
}

function deleteDish(id) {
  const s = store();
  if (!s) return;
  saveDishes(s, loadDishes(s).filter((d) => d.id !== id));
  if (currentDish && currentDish.id === id) currentDish = null;
  renderDishList();
  renderEditor();
}

function saveCurrentDish() {
  const s = store();
  const msg = document.getElementById("mydish-saved");
  if (!currentDish) return;
  currentDish.savedAt = new Date().toISOString();
  if (lastResult) currentDish.lastCost = lastResult.summary.cost;
  const ok = s && saveDishes(s, upsertDish(loadDishes(s), currentDish));
  msg.textContent = ok ? "Saved on this device." : "Couldn’t save: this browser blocks storage.";
  renderDishList();
}

/** Opens a site recipe in the editor (the recipe pop-up's "Customize this dish"). */
async function customizeRecipe(id) {
  const r = RECIPES.find((x) => x.id === id);
  try {
    const detail = await fetch(`${API_BASE}/api/recipes/${id}`).then((res) => res.json());
    currentDish = dishFromRecipe(detail.recipe, r && r.servings);
  } catch {
    return;
  }
  lastResult = null;
  closeModal();
  showSection("mydish"); // initMyDish draws the editor and calculates
}

// ── Editor ──

function lineRow(l, i) {
  const input = "border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
  return `
    <div class="flex gap-2 items-center">
      <input value="${escapeHtml(l.amount)}" placeholder="1 1/2" oninput="dishEdit(${i}, 'amount', this.value)" class="w-16 ${input}" aria-label="Amount"/>
      <input value="${escapeHtml(l.unit)}" placeholder="unit" list="unit-options" oninput="dishEdit(${i}, 'unit', this.value)" class="w-20 ${input}" aria-label="Unit"/>
      <input value="${escapeHtml(l.name)}" placeholder="ingredient, e.g. pork belly" list="ingredient-options" oninput="dishEdit(${i}, 'name', this.value)" class="flex-1 min-w-0 ${input}" aria-label="Ingredient"/>
      <button onclick="dishRemove(${i})" class="text-gray-300 hover:text-red-600 text-lg leading-none px-1" title="Remove">✕</button>
    </div>`;
}

function renderEditor() {
  const el = document.getElementById("mydish-editor");
  if (!currentDish) {
    el.innerHTML = "";
    return;
  }
  const d = currentDish;
  const from = d.fromRecipeId ? RECIPES.find((r) => r.id === d.fromRecipeId) : null;
  el.innerHTML = `
    <div class="grid lg:grid-cols-2 gap-6">
      <div class="bg-white rounded-2xl shadow p-5 space-y-4">
        <div class="flex gap-3 flex-wrap">
          <label class="flex-1 min-w-[12rem]"><span class="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Dish name</span>
            <input value="${escapeHtml(d.title)}" oninput="currentDish.title = this.value" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"/></label>
          <label><span class="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">Servings</span>
            <input type="number" min="1" max="50" value="${d.servings}" oninput="dishEdit(-1, 'servings', this.value)" class="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"/></label>
        </div>
        ${from ? `<p class="text-xs text-gray-400">Based on <button onclick="openModal(${from.id})" class="text-green-700 hover:underline">${escapeHtml(from.title)}</button></p>` : ""}
        <div>
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ingredients</p>
          <div class="space-y-2" id="mydish-lines">${d.lines.map(lineRow).join("")}</div>
          <button onclick="dishAdd()" class="mt-3 text-sm text-green-700 hover:underline font-medium">+ Add ingredient</button>
        </div>
        <div class="flex items-center gap-3 flex-wrap pt-2 border-t border-gray-100">
          <button onclick="saveCurrentDish()" class="bg-green-700 hover:bg-green-600 text-white text-sm font-medium px-5 py-2 rounded-full">Save on this device</button>
          <span id="mydish-saved" class="text-xs text-gray-500"></span>
        </div>
      </div>
      <div id="mydish-result" class="space-y-4">${lastResult ? dishResultHtml(lastResult) : `<p class="text-sm text-gray-400">Add ingredients to see the cost and nutrition.</p>`}</div>
    </div>`;
}

function dishEdit(i, field, value) {
  if (!currentDish) return;
  if (i < 0) {
    currentDish.servings = Math.max(1, Math.min(50, parseInt(value, 10) || 1));
  } else {
    const line = currentDish.lines[i];
    line[field] = value;
    if (field === "name") {
      // Picked from the list: send its slug, so the engine doesn't have to guess.
      const hit = (INGREDIENTS || []).find((x) => x.label.toLowerCase() === value.trim().toLowerCase());
      line.slug = hit ? hit.slug : null;
    }
  }
  document.getElementById("mydish-saved").textContent = "";
  scheduleDish();
}

function dishAdd() {
  currentDish.lines.push({ amount: "", unit: "", name: "", slug: null });
  document.getElementById("mydish-lines").insertAdjacentHTML("beforeend", lineRow(currentDish.lines.at(-1), currentDish.lines.length - 1));
}

function dishRemove(i) {
  currentDish.lines.splice(i, 1);
  document.getElementById("mydish-lines").innerHTML = currentDish.lines.map(lineRow).join("");
  scheduleDish();
}

function scheduleDish(delay = 600) {
  clearTimeout(dishTimer);
  dishTimer = setTimeout(computeDish, delay);
}

async function computeDish() {
  if (!currentDish) return;
  const lines = currentDish.lines.filter((l) => l.name.trim());
  const out = document.getElementById("mydish-result");
  if (!out) return;
  if (!lines.length) {
    out.innerHTML = `<p class="text-sm text-gray-400">Add ingredients to see the cost and nutrition.</p>`;
    return;
  }
  const req = ++dishRequest;
  out.classList.add("opacity-60");
  try {
    const res = await fetch(`${API_BASE}/api/dish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: currentDish.title, servings: currentDish.servings, ingredients: lines }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (req !== dishRequest) return; // a newer edit is on its way
    lastResult = data;
    out.innerHTML = dishResultHtml(data);
  } catch (e) {
    if (req === dishRequest) out.innerHTML = `<p class="text-sm text-red-600">Couldn’t calculate the dish (${escapeHtml(e.message)}).</p>`;
  } finally {
    if (req === dishRequest) out.classList.remove("opacity-60");
  }
}

function dishResultHtml(data) {
  const r = buildRecipe({ id: 0, title: currentDish.title, servings: currentDish.servings, ingredients: currentDish.lines }, data.summary);
  const bars = [["Protein", r.nutrition.protein, "protein", "g"], ["Carbs", r.nutrition.carbs, "carbs", "g"], ["Fat", r.nutrition.fat, "fat", "g"],
    ["Fiber", r.nutrition.fiber, "fiber", "g"], ["Iron", r.nutrition.iron, "iron", "mg"], ["Calcium", r.nutrition.calcium, "calcium", "mg"]]
    .map(([label, val, key, unit]) => `
      <div>
        <div class="flex justify-between text-xs mb-1"><span class="text-gray-600">${label}</span><span class="font-medium">${val}${unit} <span class="text-gray-400">(${pct(val, key)}% DRV)</span></span></div>
        <div class="bar"><div class="bar-fill" style="width:${pct(val, key)}%"></div></div>
      </div>`).join("");
  const unmatched = data.lines.filter((l) => l.status === "unmatched").length;
  return `
    <div class="bg-white rounded-2xl shadow p-5">
      <div class="flex flex-wrap gap-3">
        <div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-center"><p class="text-2xl font-bold text-amber-700">${r.costCoverage < 1 ? `₱${r.costPerServing}+` : `₱${r.costPerServing}`}</p><p class="text-xs text-amber-600 font-medium">Per Serving</p></div>
        <div class="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center"><p class="text-2xl font-bold text-green-700">${r.ranked ? r.valueScore : "—"}</p><p class="text-xs text-green-600 font-medium">Sulit Score</p></div>
        <div class="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-center"><p class="text-2xl font-bold text-blue-700">${r.nutritionScore}</p><p class="text-xs text-blue-600 font-medium">Nutrition Score</p></div>
        <div class="bg-gray-50 border rounded-xl px-4 py-3 text-center"><p class="text-2xl font-bold text-gray-700">${r.calories.toLocaleString()}</p><p class="text-xs text-gray-500 font-medium">kcal/serving</p></div>
      </div>
      <p class="text-xs text-gray-400 mt-3">₱${r.cost.total.toFixed(0)}${r.costCoverage < 1 ? "+" : ""} for ${currentDish.servings} servings · ${Math.round(r.costCoverage * 100)}% of ingredients (by weight) priced${unmatched ? ` · ${unmatched} not recognised yet: try a name from the list` : ""}</p>
    </div>
    ${priceChartHtml(data, r)}
    <div class="bg-white rounded-2xl shadow p-5 space-y-2">${bars}</div>
    <div class="bg-white rounded-2xl shadow p-5"><h3 class="font-bold mb-3">Ingredients</h3><div class="space-y-2">${ingredientRows(data.lines)}</div></div>`;
}

function priceChartHtml(data, r) {
  const pts = comparableHistory(data.history, r.costCoverage);
  const path = sparkPath(pts);
  if (!path) return `<div class="bg-white rounded-2xl shadow p-5 text-sm text-gray-400">Not enough price history for this dish yet.</div>`;
  const first = pts[0], last = pts[pts.length - 1];
  const change = first.cost > 0 ? (last.cost - first.cost) / first.cost : null;
  const ys = pts.map((p) => p.cost);
  return `
    <div class="bg-white rounded-2xl shadow p-5">
      <div class="flex items-baseline justify-between flex-wrap gap-2">
        <h3 class="font-bold">Price over time</h3>
        <span class="text-sm font-bold ${change > 0 ? "price-up" : change < 0 ? "price-down" : "text-gray-500"}">${pctText(change)} since ${shortDate(new Date(first.date))}</span>
      </div>
      <svg viewBox="0 0 300 64" class="w-full h-20 mt-2" preserveAspectRatio="none" role="img" aria-label="Cost per serving over time">
        <path d="${path}" fill="none" stroke="#1D5239" stroke-width="2" vector-effect="non-scaling-stroke"/>
      </svg>
      <p class="text-xs text-gray-400">₱${first.cost.toFixed(2)} → ₱${last.cost.toFixed(2)} per serving · low ₱${Math.min(...ys).toFixed(2)}, high ₱${Math.max(...ys).toFixed(2)} · DA prices change daily; SM and DTI reference prices are fixed</p>
    </div>`;
}
