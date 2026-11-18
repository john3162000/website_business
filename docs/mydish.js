// My Dish: build a dish from scratch or from a site recipe, and see its cost,
// nutrition and price over time. Dishes are saved on this device only
// (localStorage). Uses app.js helpers: API_BASE, RECIPES, buildRecipe, pct,
// ingredientRows, pctText, shortDate, escapeHtml, showSection, closeModal.
// docs/mydish.test.mjs tests the pure helpers.

const DISH_KEY = "sarapsulit.dishes.v1";
const UNITS = ["g", "kg", "cup", "tbsp", "tsp", "piece", "clove", "head", "bunch", "stalk", "slice", "thumb", "lb", "oz", "ml", "can", "pack"];

// ── Pure helpers ──

// Units the person can type, and what they mean ("lbs", "kutsara" → one key).
const DISH_UNIT_ALIASES = {
  g: "g", gram: "g", grams: "g", gramo: "g", gr: "g", kg: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb", libra: "lb", oz: "oz", ounce: "oz", ounces: "oz",
  ml: "ml", l: "l", liter: "l", liters: "l", litre: "l", litro: "l", cup: "cup", cups: "cup", tasa: "cup",
  tbsp: "tbsp", tbs: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", kutsara: "tbsp", tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp", kutsarita: "tsp",
  piece: "piece", pieces: "piece", pc: "piece", pcs: "piece", piraso: "piece", clove: "clove", cloves: "clove", butil: "clove",
  head: "head", heads: "head", bunch: "bunch", bunches: "bunch", tali: "bunch", stalk: "stalk", stalks: "stalk", tangkay: "stalk",
  slice: "slice", slices: "slice", hiwa: "slice", thumb: "thumb", thumbs: "thumb", can: "can", cans: "can", lata: "can", pack: "pack", packs: "pack", packet: "pack",
};
const DISH_UNIT_ORDER = ["g", "kg", "lb", "oz", "cup", "tbsp", "tsp", "ml", "l", "piece", "clove", "head", "bunch", "stalk", "slice", "thumb"];
const DISH_UNIT_TEXT = {
  g: ["gramo (g)", "grams (g)"], kg: ["kilo (kg)", "kilos (kg)"], lb: ["libra (lb)", "pounds (lb)"], oz: ["onsa (oz)", "ounces (oz)"],
  cup: ["tasa (cup)", "cups"], tbsp: ["kutsara (tbsp)", "tablespoons"], tsp: ["kutsarita (tsp)", "teaspoons"], ml: ["ml", "ml"], l: ["litro (L)", "liters (L)"],
  piece: ["piraso", "pieces"], clove: ["butil (clove)", "cloves"], head: ["buo/ulo (head)", "heads"], bunch: ["tali (bunch)", "bunches"],
  stalk: ["tangkay (stalk)", "stalks"], slice: ["hiwa (slice)", "slices"], thumb: ["hinlalaki (thumb)", "thumbs"],
};

// Short names for the unit list on a narrow phone.
const DISH_UNIT_SHORT = {
  g: ["gramo", "g"], kg: ["kilo", "kg"], lb: ["libra", "lb"], oz: ["onsa", "oz"], cup: ["tasa", "cup"], tbsp: ["kutsara", "tbsp"], tsp: ["kutsarita", "tsp"],
  ml: ["ml", "ml"], l: ["litro", "L"], piece: ["piraso", "piece"], clove: ["butil", "clove"], head: ["buo/ulo", "head"], bunch: ["tali", "bunch"],
  stalk: ["tangkay", "stalk"], slice: ["hiwa", "slice"], thumb: ["hinlalaki", "thumb"],
};

/** "lbs", "Kutsara", "tablespoons." → "lb", "tbsp", "tbsp"; empty stays empty. */
function dishUnitKey(u) {
  const s = String(u || "").trim().toLowerCase().replace(/\.$/, "");
  return s ? DISH_UNIT_ALIASES[s] || s : "";
}

/**
 * Units that give this ingredient a weight: every ingredient takes g, kg, lb and oz; cups, spoons, ml
 * and litres only when the catalog knows its weight per cup; pieces, cloves, heads… only when it knows
 * their weight (the API's `units`). Null when the ingredient isn't known.
 */
function dishUnitsFor(apiUnits) {
  if (!Array.isArray(apiUnits)) return null;
  const set = new Set([...apiUnits.map(dishUnitKey), "g", "kg", "lb", "oz"]);
  if (set.has("cup")) { set.add("ml"); set.add("l"); }
  return DISH_UNIT_ORDER.filter((u) => set.has(u));
}

/** "1 1/2" → 1.5, "½" → 0.5, "2-3" → 2.5, "0.25" → 0.25; null when there's no number. */
function dishAmountValue(text) {
  const s = String(text || "").trim().replace(/[¼½¾⅓⅔⅛]/g, (c) => ({ "¼": " 1/4", "½": " 1/2", "¾": " 3/4", "⅓": " 1/3", "⅔": " 2/3", "⅛": " 1/8" })[c]).trim();
  if (!s) return null;
  const one = (t) => { const m = t.trim().match(/^(\d+(?:\.\d+)?)?(?:\s*(\d+)\/(\d+))?$/); if (!m || (!m[1] && !m[2])) return null; return (m[1] ? parseFloat(m[1]) : 0) + (m[2] ? +m[2] / +m[3] : 0); };
  const range = s.split(/\s*(?:-|–|to)\s*/);
  const vals = range.map(one);
  if (vals.some((v) => v == null)) return null;
  return vals.reduce((a, v) => a + v, 0) / vals.length;
}

/**
 * What's wrong with a line, in the person's language, or null. `allowed` is dishUnitsFor() for its
 * ingredient (null if unknown); `engineStatus` is the calculator's verdict once it has run.
 */
function dishLineIssue(line, allowed, engineStatus, label, en = false) {
  const name = String(line.name || "").trim();
  if (!name) return null;
  if (/\bto taste\b|\bayon sa panlasa\b|\boptional\b/i.test(`${name} ${line.unit || ""}`) && !String(line.amount || "").trim()) return null;
  const amt = dishAmountValue(line.amount);
  if (!String(line.amount || "").trim()) return en ? "Add an amount (e.g. 1)." : "Lagyan ng dami (hal. 1).";
  if (amt == null) return en ? "The amount should be a number like 1, 1/2 or 0.25." : "Numero ang dami, hal. 1, 1/2 o 0.25.";
  if (amt <= 0) return en ? "The amount must be more than 0." : "Dapat higit sa 0 ang dami.";
  const unit = dishUnitKey(line.unit), what = label || name;
  const list = (allowed || []).map((u) => DISH_UNIT_TEXT[u] ? DISH_UNIT_TEXT[u][en ? 1 : 0] : u).join(", ");
  if (allowed && unit && !allowed.includes(unit)) return en ? `"${line.unit}" doesn't work for ${what}. Use: ${list}.` : `Hindi mabilang ang "${line.unit}" para sa ${what}. Gamitin ang: ${list}.`;
  if (allowed && !unit && !allowed.includes("piece")) return en ? `Pick a unit for ${what} (e.g. grams).` : `Pumili ng unit para sa ${what} (hal. gramo).`;
  if (engineStatus === "unmatched") return en ? "We don't know this ingredient yet: pick one from the list." : "Hindi pa namin kilala ang sangkap na ito: pumili sa listahan.";
  if (engineStatus === "no-weight") return en ? "Can't weigh this: change the unit to grams or kilos." : "Hindi matimbang: palitan ang unit ng gramo o kilo.";
  return null;
}

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
  // A heading line ("For the sauce:", "Marinade ingredients:") starts a group of the lines after it.
  let group = "";
  const lines = [];
  for (const i of recipe.ingredients || []) {
    const name = (i.name || "").trim();
    if (!name) continue;
    if (/:\s*$/.test(name)) { group = name.replace(/:\s*$/, "").trim(); continue; }
    const line = { amount: i.amount || "", unit: i.unit || "", name: i.name, slug: null };
    if (group) line.group = group;
    lines.push(line);
  }
  return {
    id: newDishId(),
    title: `My ${recipe.title}`,
    servings: servings || recipe.servings || 4,
    fromRecipeId: recipe.id,
    lines,
  };
}

/** The dish's groups in order of first use; the main (unnamed) group always first. Pure, tested. */
function dishGroups(lines) {
  const gs = [""];
  for (const l of lines || []) { const g = l.group || ""; if (!gs.includes(g)) gs.push(g); }
  return gs;
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

/**
 * The price chart over a fixed six-month window: the DA days as a line, the weekly PSA points
 * (before DA's history starts) as dots, month labels along the bottom. Pure, tested.
 * Returns null with fewer than two points.
 */
const DISH_CHART_DAYS = 183;
const DISH_MONTHS = { tl: ["Ene", "Peb", "Mar", "Abr", "May", "Hun", "Hul", "Ago", "Set", "Okt", "Nob", "Dis"], en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] };
function dishChartGeom(points, nowMs, lang = "tl", w = 300, h = 80, pad = 4) {
  const end = nowMs, start = end - DISH_CHART_DAYS * 86400000;
  const pts = (points || []).filter((p) => p.cost != null && Date.parse(p.date) >= start && Date.parse(p.date) <= end + 86400000)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (pts.length < 2) return null;
  const ys = pts.map((p) => p.cost);
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (t) => pad + ((t - start) / (end - start)) * (w - 2 * pad);
  const sy = (y) => h - pad - (y1 === y0 ? 0.5 : (y - y0) / (y1 - y0)) * (h - 2 * pad);
  const da = pts.filter((p) => p.source !== "PSA");
  const path = da.length >= 2 ? da.map((p, i) => `${i ? "L" : "M"}${sx(Date.parse(p.date)).toFixed(1)},${sy(p.cost).toFixed(1)}`).join(" ") : null;
  const dots = pts.filter((p) => p.source === "PSA" || da.length < 2).map((p) => ({ x: +sx(Date.parse(p.date)).toFixed(1), y: +sy(p.cost).toFixed(1) }));
  const ticks = [];
  const d = new Date(start); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
  for (; d.getTime() <= end; d.setUTCMonth(d.getUTCMonth() + 1)) ticks.push({ x: +(((d.getTime() - start) / (end - start)) * 100).toFixed(1), label: DISH_MONTHS[lang === "en" ? "en" : "tl"][d.getUTCMonth()] });
  return { path, dots, ticks, y0, y1, first: pts[0], last: pts[pts.length - 1], daFrom: da.length ? da[0].date : null };
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
      <button data-id="${escapeHtml(d.id)}" onclick="openDish(this.dataset.id)" class="text-left min-w-0">
        <p class="font-medium truncate">${escapeHtml(d.title)}</p>
        <p class="text-xs text-gray-400">${d.lastCost != null ? `₱${Number(d.lastCost).toFixed(0)}/serving · ` : ""}${d.lines.length} ingredients</p>
      </button>
      <button data-id="${escapeHtml(d.id)}" onclick="deleteDish(this.dataset.id)" class="text-gray-300 hover:text-red-600 text-lg leading-none" title="Delete">✕</button>
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

const DISH_INPUT = "border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

/** The catalog ingredient a line stands for: picked from the list, or what the calculator matched. */
function dishLineIngredient(l) {
  if (!INGREDIENTS) return null;
  const slug = l.slug || l.engineSlug;
  if (slug) return INGREDIENTS.find((x) => x.slug === slug) || null;
  const name = String(l.name || "").trim().toLowerCase();
  return name ? INGREDIENTS.find((x) => x.label.toLowerCase() === name) || null : null;
}

/** The unit box: a list of only the units that work for this ingredient, or free text when it's unknown. */
function dishUnitControl(l, i) {
  const ing = dishLineIngredient(l);
  const allowed = ing ? dishUnitsFor(ing.units) : null;
  const en = typeof siteLang === "function" && siteLang() === "en";
  if (!allowed) return `<input value="${escapeHtml(l.unit)}" placeholder="unit" list="unit-options" oninput="dishEdit(${i}, 'unit', this.value)" class="dish-unit-sel ${DISH_INPUT}" aria-label="Unit"/>`;
  // No unit with a count ("2 eggs") means pieces: show it as "piraso".
  const cur = dishUnitKey(l.unit) || (allowed.includes("piece") ? "piece" : "");
  const opts = [];
  if (!cur) opts.push(`<option value="" selected disabled>unit…</option>`);
  if (cur && !allowed.includes(cur)) opts.push(`<option value="${escapeHtml(l.unit)}" selected>⚠ ${escapeHtml(l.unit)}</option>`);
  for (const u of allowed) opts.push(`<option value="${u}"${u === cur ? " selected" : ""} title="${escapeHtml(DISH_UNIT_TEXT[u][en ? 1 : 0])}">${escapeHtml(DISH_UNIT_SHORT[u][en ? 1 : 0])}</option>`);
  return `<select onchange="dishEdit(${i}, 'unit', this.value)" class="dish-unit-sel ${DISH_INPUT}${cur && !allowed.includes(cur) ? " dish-bad" : ""}" aria-label="Unit">${opts.join("")}</select>`;
}

function dishHintText(l) {
  const ing = dishLineIngredient(l);
  const en = typeof siteLang === "function" && siteLang() === "en";
  return dishLineIssue(l, ing ? dishUnitsFor(ing.units) : null, l.engineStatus, ing ? ing.label.toLowerCase() : null, en);
}

/** Ingredient lines under their group headings, each group with its own "+ Add ingredient". */
function dishLinesHtml(d) {
  const en = typeof siteLang === "function" && siteLang() === "en";
  const gs = dishGroups(d.lines);
  const many = gs.length > 1;
  return gs.map((g, gi) => {
    const rows = d.lines.map((l, i) => ((l.group || "") === g ? lineRow(l, i) : "")).join("");
    const head = !many ? "" : g
      ? `<div class="dish-group-h"><span aria-hidden="true">📋</span><input value="${escapeHtml(g)}" onchange="dishRenameGroup(${gi}, this.value)" class="flex-1 min-w-0 ${DISH_INPUT}" aria-label="${en ? "Group name" : "Pangalan ng grupo"}"/>
          <button onclick="dishRemoveGroup(${gi})" class="text-gray-400 hover:text-red-600 text-xs px-1" title="${en ? "Remove the group (keeps its ingredients)" : "Alisin ang grupo (maiiwan ang mga sangkap)"}">${en ? "Ungroup" : "Alisin ang grupo"}</button></div>`
      : `<p class="dish-group-main">${en ? "Main" : "Pangunahin"}</p>`;
    return `<div class="dish-group">${head}<div class="space-y-2">${rows}</div>
      <button onclick="dishAdd(${gi})" class="mt-2 text-sm text-green-700 hover:underline font-medium">+ ${en ? "Add ingredient" : "Magdagdag ng sangkap"}</button></div>`;
  }).join("") + `<button onclick="dishAddGroup()" class="dish-add-group">＋ ${en ? "Add a group (e.g. For the sauce)" : "Magdagdag ng grupo (hal. Para sa sauce)"}</button>`;
}

function dishRenderLines(focusIndex) {
  const box = document.getElementById("mydish-lines");
  if (!box || !currentDish) return;
  box.innerHTML = dishLinesHtml(currentDish);
  if (focusIndex != null) box.querySelector(`[data-line="${focusIndex}"] [aria-label=Amount]`)?.focus();
}

function dishAddGroup() {
  if (!currentDish) return;
  const en = typeof siteLang === "function" && siteLang() === "en";
  const taken = dishGroups(currentDish.lines);
  let name = en ? "For the sauce" : "Para sa sauce", k = 2;
  while (taken.includes(name)) name = `${en ? "Group" : "Grupo"} ${k++}`;
  currentDish.lines.push({ amount: "", unit: "", name: "", slug: null, group: name });
  dishRenderLines();
  const inputs = document.querySelectorAll("#mydish-lines .dish-group-h input");
  const last = inputs[inputs.length - 1]; if (last) { last.focus(); last.select(); }
}

function dishRenameGroup(gi, value) {
  const old = dishGroups(currentDish.lines)[gi], name = String(value || "").trim();
  if (!old) return;
  for (const l of currentDish.lines) if ((l.group || "") === old) { if (name) l.group = name; else delete l.group; }
  dishRenderLines();
  if (typeof cookKitchenSync === "function") cookKitchenSync();
}

function dishRemoveGroup(gi) {
  const old = dishGroups(currentDish.lines)[gi];
  if (!old) return;
  for (const l of currentDish.lines) if (l.group === old) delete l.group;
  dishRenderLines();
  if (typeof cookKitchenSync === "function") cookKitchenSync();
}

function lineRow(l, i) {
  const hint = dishHintText(l);
  return `
    <div class="dish-line" data-line="${i}">
      <div class="flex gap-2 items-center">
        <input value="${escapeHtml(l.amount)}" placeholder="1 1/2" inputmode="decimal" oninput="dishEdit(${i}, 'amount', this.value)" class="w-16 ${DISH_INPUT}" aria-label="Amount"/>
        <span id="dish-unit-${i}">${dishUnitControl(l, i)}</span>
        <input value="${escapeHtml(l.name)}" placeholder="ingredient, e.g. pork belly" list="ingredient-options" oninput="dishEdit(${i}, 'name', this.value)" class="flex-1 min-w-0 ${DISH_INPUT}" aria-label="Ingredient"/>
        <button onclick="dishRemove(${i})" class="text-gray-300 hover:text-red-600 text-lg leading-none px-1" title="Remove">✕</button>
      </div>
      <p id="dish-hint-${i}" class="dish-hint" role="status"${hint ? "" : " hidden"}>⚠ ${escapeHtml(hint || "")}</p>
    </div>`;
}

/** Updates only the unit boxes and hints (never the box being typed in), after an edit or a recalculation. */
function dishRefreshAids(only) {
  if (!currentDish) return;
  currentDish.lines.forEach((l, i) => {
    if (only != null && i !== only) return;
    const box = document.getElementById(`dish-unit-${i}`), hint = document.getElementById(`dish-hint-${i}`);
    if (box && !box.contains(document.activeElement)) { const html = dishUnitControl(l, i); if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; } }
    if (hint) { const h = dishHintText(l); hint.hidden = !h; const txt = h ? `⚠ ${h}` : ""; if (hint.textContent !== txt) hint.textContent = txt; }
  });
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
          <div id="mydish-lines">${dishLinesHtml(d)}</div>
        </div>
        <div class="flex items-center gap-3 flex-wrap pt-2 border-t border-gray-100">
          <button onclick="saveCurrentDish()" class="bg-green-700 hover:bg-green-600 text-white text-sm font-medium px-5 py-2 rounded-full">Save on this device</button>
          <button type="button" onclick="cookKitchenWatch()" class="cook-open-btn">${typeof t === "function" ? t("cook.watch") : "🎬 Panoorin kung paano"}</button>
          <span id="mydish-saved" class="text-xs text-gray-500"></span>
        </div>
      </div>
      <div id="mydish-result" class="space-y-4">${lastResult ? dishResultHtml(lastResult) : `<p class="text-sm text-gray-400">Add ingredients to see the cost and nutrition.</p>`}</div>
    </div>
    <section id="mydish-kitchen" class="cook-kitchen" aria-label="Lutuin mo ang ulam mo"></section>`;
  if (typeof cookKitchenReset === "function") cookKitchenReset();
}

function dishEdit(i, field, value) {
  if (!currentDish) return;
  if (i < 0) {
    currentDish.servings = Math.max(1, Math.min(50, parseInt(value, 10) || 1));
  } else {
    const line = currentDish.lines[i];
    line[field] = value;
    line.engineStatus = null;
    if (field === "name") {
      // Picked from the list: send its slug, so the engine doesn't have to guess.
      const hit = (INGREDIENTS || []).find((x) => x.label.toLowerCase() === value.trim().toLowerCase());
      line.slug = hit ? hit.slug : null;
      line.engineSlug = null;
    }
    dishRefreshAids(i);
  }
  document.getElementById("mydish-saved").textContent = "";
  scheduleDish();
}

function dishAdd(gi = 0) {
  const group = dishGroups(currentDish.lines)[gi] || "";
  const line = { amount: "", unit: "", name: "", slug: null };
  if (group) line.group = group;
  currentDish.lines.push(line);
  dishRenderLines(currentDish.lines.length - 1);
}

function dishRemove(i) {
  currentDish.lines.splice(i, 1);
  dishRenderLines();
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
      body: JSON.stringify({ title: currentDish.title, servings: currentDish.servings, ingredients: lines.map(({ amount, unit, name, slug }) => ({ amount, unit, name, slug })) }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (req !== dishRequest) return; // a newer edit is on its way
    lastResult = data;
    out.innerHTML = dishResultHtml(data);
    // What the calculator made of each line (in order), for the unit lists and the hints.
    const named = currentDish.lines.filter((l) => l.name.trim());
    if (Array.isArray(data.lines) && data.lines.length === named.length) named.forEach((l, k) => { l.engineSlug = data.lines[k].slug || null; l.engineStatus = data.lines[k].status || null; });
    dishRefreshAids();
    if (typeof cookKitchenSync === "function") cookKitchenSync(); // the kitchen below follows the ingredients
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
        ${sulitTile(r)}
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
  const en = typeof siteLang === "function" && siteLang() === "en";
  const pts = comparableHistory(data.history, r.costCoverage);
  const g = dishChartGeom(pts, Date.now(), en ? "en" : "tl");
  if (!g) return `<div class="bg-white rounded-2xl shadow p-5 text-sm text-gray-400">${en ? "Not enough price history for this dish yet." : "Kulang pa ang kasaysayan ng presyo ng ulam na ito."}</div>`;
  const { first, last } = g;
  const change = first.cost > 0 ? (last.cost - first.cost) / first.cost : null;
  const day = (iso) => new Date(iso).toLocaleDateString(en ? "en-PH" : "fil-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `
    <div class="bg-white rounded-2xl shadow p-5">
      <div class="flex items-baseline justify-between flex-wrap gap-2">
        <h3 class="font-bold">${en ? "Price over the last 6 months" : "Presyo sa nakaraang 6 na buwan"}</h3>
        <span class="text-sm font-bold ${change > 0 ? "price-up" : change < 0 ? "price-down" : "text-gray-500"}">${pctText(change)} ${en ? "since" : "mula"} ${day(first.date)}</span>
      </div>
      <div class="dish-chart">
        <span class="dish-chart-y top">₱${g.y1.toFixed(2)}</span><span class="dish-chart-y bottom">₱${g.y0.toFixed(2)}</span>
        <svg viewBox="0 0 300 80" class="w-full h-24" preserveAspectRatio="none" role="img" aria-label="${en ? "Cost per serving over the last 6 months" : "Gastos bawat serving sa nakaraang 6 na buwan"}">
          ${g.ticks.map((t) => `<line x1="${(t.x * 3).toFixed(1)}" x2="${(t.x * 3).toFixed(1)}" y1="0" y2="80" class="dish-chart-grid" vector-effect="non-scaling-stroke"/>`).join("")}
          ${g.path ? `<path d="${g.path}" fill="none" stroke="#1D5239" stroke-width="2" vector-effect="non-scaling-stroke"/>` : ""}
          ${g.dots.map((d) => `<circle cx="${d.x}" cy="${d.y}" r="1.6" fill="#DDAE2B"/>`).join("")}
        </svg>
        <div class="dish-chart-x" aria-hidden="true">${g.ticks.map((t) => `<span style="left:${t.x}%">${t.label}</span>`).join("")}</div>
      </div>
      <p class="text-xs text-gray-500 mt-1">${day(first.date)} → ${day(last.date)} · ₱${first.cost.toFixed(2)} → ₱${last.cost.toFixed(2)} ${en ? "per serving" : "bawat serving"} · ${en ? "low" : "pinakamura"} ₱${g.y0.toFixed(2)}, ${en ? "high" : "pinakamahal"} ₱${g.y1.toFixed(2)}</p>
      <p class="text-xs text-gray-400 mt-1">${g.dots.length && g.path ? (en ? "Line: DA daily prices. Gold dots: PSA monthly averages, before DA's daily record starts." : "Linya: arawang presyo ng DA. Gintong tuldok: buwanang average ng PSA, bago magsimula ang arawang tala ng DA.") : ""} ${g.daFrom ? `${en ? "DA daily prices from" : "Arawang presyo ng DA mula"} ${day(g.daFrom)}.` : ""} ${en ? "SM and DTI reference prices are fixed." : "Nakapirmi ang presyong reference ng SM at DTI."}</p>
    </div>`;
}
