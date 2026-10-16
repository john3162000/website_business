// "Anong lulutuin?": pick the ingredients you have and see which dishes you can
// cook, with what is still missing and what it costs. Reads
// /api/recipes/ingredient-index. Uses app.js helpers: API_BASE, RECIPES,
// DATA_READY, escapeHtml, openModal. docs/finder.test.mjs tests the pure helpers.

const FINDER_KEY = "sarapsulit.finder.v1";

// Picking "Pork (any cut)" matches every catalog slug that starts with "pork_".
const FAMILIES = {
  pork: "Pork (any cut)", chicken: "Chicken (any part)", beef: "Beef (any cut)", fish: "Fish (any)",
  shrimp: "Shrimp (any)", egg: "Egg (any)", cheese: "Cheese (any)", noodles: "Noodles (any)",
  rice: "Rice (any)", banana: "Banana (any)", mushroom: "Mushroom (any)", coconut: "Coconut (any)",
};

// What most Filipino kitchens already have. Counted as "have" while the box is ticked.
const STAPLES = new Set([
  "salt", "salt_sea", "black_pepper", "peppercorn_whole", "oil_cooking", "oil_canola", "garlic", "onion_yellow",
  "onion_red", "soy_sauce", "fish_sauce", "vinegar_cane_white", "vinegar_coconut", "sugar_white", "sugar_brown", "bay_leaf",
]);

// ── Pure helpers ──

// Things named after a family that aren't that food: fish sauce isn't fish, banana ketchup and blossom aren't bananas.
const NOT_FAMILY = /_(bouillon|cube|broth|stock|sauce|powder|seasoning|flavor|paste|oil|extract|ketchup|blossom|and_beans|nuggets)(_|$)/;
const familyOf = (slug) => { const f = slug.split("_")[0]; return f in FAMILIES && !NOT_FAMILY.test(slug) ? f : null; };

/** Does the pantry `have` (slugs and "any:<family>" tokens) cover this slug? */
function hasIngredient(have, slug, staples) {
  if (have.has(slug) || (staples && STAPLES.has(slug))) return true;
  const f = familyOf(slug);
  return !!f && have.has(`any:${f}`);
}

/**
 * Dishes you can make from `have`, best first: fewest missing ingredients, then most of
 * yours used, then best value. A dish needs at least one of your picks (staples don't count).
 * `index` is the API's { ingredients, recipes }; `recipes` maps id → { title, valueScore }.
 */
function matchDishes(index, have, recipes, { staples = true, limit = 60 } = {}) {
  if (!have.size) return [];
  const out = [];
  for (const r of index.recipes) {
    const info = recipes.get(r.id);
    if (!info) continue;
    const used = [], missing = [];
    r.i.forEach((n, k) => {
      const ing = index.ingredients[n];
      const mine = have.has(ing.slug) || (familyOf(ing.slug) && have.has(`any:${familyOf(ing.slug)}`));
      if (mine) used.push(ing.label);
      else if (!hasIngredient(have, ing.slug, staples)) missing.push({ label: ing.label, cost: r.c[k] });
    });
    if (!used.length) continue;
    const missingCost = missing.reduce((s, m) => s + (m.cost || 0), 0);
    out.push({ id: r.id, title: info.title, used, missing, missingCost, unpricedMissing: missing.some((m) => m.cost == null), value: info.valueScore || 0 });
  }
  // Reposts share a title: keep the best match of each.
  const seen = new Set();
  return out
    .sort((a, b) => a.missing.length - b.missing.length || b.used.length - a.used.length || b.value - a.value)
    .filter((d) => { const t = d.title.trim().toLowerCase(); if (seen.has(t)) return false; seen.add(t); return true; })
    .slice(0, limit);
}

/** Search suggestions: families first, then ingredients by how many dishes use them. */
function suggestIngredients(index, query, have, n = 8) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const fam = Object.entries(FAMILIES)
    .filter(([f, label]) => !have.has(`any:${f}`) && (f.startsWith(q) || label.toLowerCase().includes(q)))
    .map(([f, label]) => ({ token: `any:${f}`, label }));
  const ings = index.ingredients
    .filter((x) => !have.has(x.slug) && (x.label.toLowerCase().includes(q) || x.slug.includes(q.replace(/ /g, "_"))))
    .map((x) => ({ token: x.slug, label: x.label }));
  return [...fam, ...ings].slice(0, n);
}

// ── State and rendering ──

let finderIndex = null;
let finderHave = new Set();
let finderStaples = true;

function finderStore() {
  try { return window.localStorage; } catch { return null; }
}

function finderLabel(token) {
  if (token.startsWith("any:")) return FAMILIES[token.slice(4)] || token;
  return finderIndex?.ingredients.find((x) => x.slug === token)?.label || token;
}

async function initFinder() {
  try {
    const v = JSON.parse(finderStore()?.getItem(FINDER_KEY) || "null");
    if (v && Array.isArray(v.have)) { finderHave = new Set(v.have); finderStaples = v.staples !== false; }
  } catch { /* start empty */ }
  document.getElementById("finder-staples").checked = finderStaples;
  if (!finderIndex) {
    document.getElementById("finder-results").innerHTML = `<p class="text-sm text-gray-400">Loading ingredients…</p>`;
    try {
      const [res] = await Promise.all([fetch(`${API_BASE}/api/recipes/ingredient-index`), DATA_READY?.catch(() => {})]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      finderIndex = await res.json();
    } catch (e) {
      document.getElementById("finder-results").innerHTML = `<p class="text-sm text-red-600">Couldn’t load the ingredient list (${escapeHtml(e.message)}). Please try again in a moment.</p>`;
      return;
    }
  }
  renderFinder();
}

function finderSave() {
  try { finderStore()?.setItem(FINDER_KEY, JSON.stringify({ have: [...finderHave], staples: finderStaples })); } catch { /* not saved */ }
}

function finderAdd(token) {
  finderHave.add(token);
  document.getElementById("finder-search").value = "";
  finderSave(); renderFinder();
  document.getElementById("finder-search").focus();
}

function finderRemove(token) {
  finderHave.delete(token);
  finderSave(); renderFinder();
}

function finderClear() {
  finderHave = new Set();
  finderSave(); renderFinder();
}

function setFinderStaples(on) {
  finderStaples = on;
  finderSave(); renderFinder();
}

function finderKey(e) {
  if (e.key !== "Enter") return;
  const first = suggestIngredients(finderIndex, e.target.value, finderHave, 1)[0];
  if (first) finderAdd(first.token);
}

function renderFinderSuggest() {
  if (!finderIndex) return;
  const list = suggestIngredients(finderIndex, document.getElementById("finder-search").value, finderHave);
  document.getElementById("finder-suggest").innerHTML = list.map((s) =>
    `<button class="finder-chip" onclick="finderAdd('${escapeHtml(s.token)}')">+ ${escapeHtml(s.label)}</button>`).join("");
}

function renderFinder() {
  if (!finderIndex) return;
  renderFinderSuggest();
  document.getElementById("finder-have").innerHTML = [...finderHave].map((t) =>
    `<span class="finder-chip on">${escapeHtml(finderLabel(t))}<button onclick="finderRemove('${escapeHtml(t)}')" aria-label="Remove">✕</button></span>`).join("")
    || `<span class="text-sm text-gray-400">Nothing picked yet: search above, or tap a common one below.</span>`;
  // Common picks: the most used ingredients that aren't staples, plus the meat families.
  const common = ["any:pork", "any:chicken", "any:beef", "any:fish", "egg_chicken", ...finderIndex.ingredients
    .filter((x) => !STAPLES.has(x.slug) && !familyOf(x.slug)).slice(0, 15).map((x) => x.slug)].filter((t) => !finderHave.has(t));
  document.getElementById("finder-common").innerHTML = common.map((t) =>
    `<button class="finder-chip" onclick="finderAdd('${escapeHtml(t)}')">+ ${escapeHtml(finderLabel(t))}</button>`).join("");

  const out = document.getElementById("finder-results");
  if (!finderHave.size) { out.innerHTML = ""; document.getElementById("finder-count").textContent = ""; return; }
  const recipes = new Map(RECIPES.map((r) => [r.id, r]));
  const dishes = matchDishes(finderIndex, finderHave, recipes, { staples: finderStaples });
  const ready = dishes.filter((d) => !d.missing.length).length;
  document.getElementById("finder-count").textContent = dishes.length
    ? `${dishes.length} dish${dishes.length > 1 ? "es" : ""}${ready ? ` · ${ready} you can cook now` : ""}` : "";
  out.innerHTML = dishes.map((d) => {
    const r = recipes.get(d.id);
    const miss = d.missing.length
      ? `<p class="text-xs text-amber-700"><strong>Kulang (${d.missing.length}):</strong> ${d.missing.slice(0, 5).map((m) => escapeHtml(m.label)).join(", ")}${d.missing.length > 5 ? "…" : ""}
         ${d.missingCost > 0 ? ` · ~₱${d.missingCost.toFixed(2)}${d.unpricedMissing ? "+" : ""}/serving to buy` : ""}</p>`
      : `<p class="text-xs font-semibold text-green-700">✓ Kumpleto: you have everything</p>`;
    return `<div class="finder-card" onclick="openModal(${d.id})">
      ${r.img ? `<img src="${escapeHtml(r.img)}" alt="" loading="lazy">` : `<div class="plan-noimg">🍽️</div>`}
      <div class="min-w-0 flex flex-col gap-1">
        <p class="font-semibold text-gray-900 leading-snug">${escapeHtml(d.title)}</p>
        <p class="text-xs text-gray-500">₱${r.costPerServing}${r.costCoverage < 1 ? "+" : ""}/serving · ${escapeHtml(r.category)} · uses your ${d.used.map(escapeHtml).join(", ")}</p>
        ${miss}
      </div></div>`;
  }).join("") || `<p class="text-sm text-gray-400">No dish uses these yet. Try adding another ingredient.</p>`;
}
