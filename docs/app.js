// SarapSulit front end. All data comes from the scraper backend:
//   /api/recipes           Panlasang Pinoy recipes (static)
//   /api/recipes/compiled  per-serving nutrition (FNRI) and cost (DA, DTI, SM), computed server-side
//   /api/commodities       DA Daily Price Index, updated automatically every day
//   /api/nutrition         FNRI Food Composition Table (only counted here)
const API_BASE = "https://website-business-beta.vercel.app";

const DRV = { protein: 50, carbs: 275, fat: 78, fiber: 25, vitaminC: 60, iron: 18, calcium: 1000, vitaminA: 900 };
// Value rankings only use recipes whose cost and nutrition cover most of their
// weight: a priced pinch of salt must not hide an unpriced 1 kg fish.
const MIN_COST_COVERAGE = 0.75;      // share of grams with a price
const MIN_NUTRITION_COVERAGE = 0.8;  // share of grams with FNRI nutrition
const MIN_COST_PER_SERVING = 5;      // ₱; below this the cost is almost certainly incomplete
const TOP_MIN_NUTRITION_SCORE = 20;  // keep plain rice sides off "Top Value Dishes"

let RECIPES = [];
let DA_PRICES = [];
let LATEST_DA_DATE = null;
let COMPARE_DATE = null; // "a month ago" for price changes (see /api/commodities compareDate)
let DATA_READY = null; // loadData() promise, for sections that need RECIPES

// ═══════════════ UTILITY ═══════════════

function pct(val, key) {
  return DRV[key] ? Math.min(100, Math.round(((val || 0) / DRV[key]) * 100)) : 0;
}
function round1(n) { return Math.round((n || 0) * 10) / 10; }
function escapeHtml(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function scoreColor(val) {
  if (val >= 10) return "bg-green-100 text-green-800";
  if (val >= 7) return "bg-lime-100 text-lime-700";
  if (val >= 4) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}
function shortDate(d) {
  return d ? d.toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" }) : "—";
}
function pctText(v) {
  if (v == null) return "—";
  const p = v * 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(Math.abs(p) < 10 ? 1 : 0)}%`;
}
function formatDate(d) {
  return d ? d.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";
}

// Category from the title, unless Panlasang Pinoy's own course says it clearly.
// Their courses are patchy ("Chicken", "Dinner", sopas as "Appetizer"), so only
// soups, desserts and sauces are taken from them.
function categoryFor(title, course) {
  const c = (course || "").toLowerCase();
  if (/\b(desserts?|kakanin|cakes?|cookies|candy|sweets|drinks?|beverages?)\b/.test(c)) return "Dessert";
  if (/\b(sauces?|condiments?|dips?|dressings?)\b/.test(c)) return "Sauce & Condiment";
  if (/\bsoups?\b/.test(c)) return "Soup";
  const t = title.toLowerCase();
  if (/\b(sinigang|tinola|nilaga|bulalo|soup|sopas|molo|lomi|mami|goto|arroz caldo|lugaw|batchoy|pochero|cansi)\b/.test(t)) return "Soup";
  if (/\b(sauce|dip|dipping|dressing|gravy|marinade|vinaigrette|spread|salsa|chutney|syrup|sinamak|chili oil|garlic oil|chili garlic)\b/.test(t)) return "Sauce & Condiment";
  if (/\b(cake|flan|halo|turon|biko|suman|puto|kakanin|ice cream|pie|cookies?|bibingka|maja|leche|dessert|brownies?|polvoron|pastillas|kutsinta|sapin|graham|buko pandan|champorado|yema|candy|tart|muffins?|cupcakes?|donuts?|doughnuts?|bread|ensaymada|silvanas|sans rival|macapuno|ube halaya|taho|gulaman)\b/.test(t)) return "Dessert";
  if (/\b(pancit|bihon|canton|sotanghon|spaghetti|pasta|noodles?|rice|sinangag|carbonara|lasagna|macaroni)\b/.test(t)) return "Rice & Noodles";
  if (/\b(gulay|pinakbet|pakbet|laing|chopsuey|chop suey|ginisang|monggo|munggo|ampalaya|kangkong|talong|okra|tofu|tokwa|vegetable|salad|lumpiang gulay)\b/.test(t)) return "Vegetable Dish";
  if (/\b(bangus|tilapia|fish|isda|galunggong|tuna|salmon|shrimp|hipon|prawn|squid|pusit|crab|alimango|mussels?|tahong|clams?|halaan|seafood|daing|tuyo|tinapa)\b/.test(t)) return "Fish & Seafood";
  return "Main Dish";
}

// ═══════════════ DATA ═══════════════

function buildRecipe(raw, c) {
  const n = c || {};
  const perServing = {
    calories: n.kcal || 0, protein: n.protein || 0, carbs: n.carbs || 0, fat: n.fat || 0, fiber: n.fiber || 0,
    vitaminA: n.vitaminA || 0, vitaminC: n.vitaminC || 0, iron: n.iron || 0, calcium: n.calcium || 0,
  };
  const costPerServing = round1(n.cost || 0);
  const servings = n.servings || raw.servings || 4;
  const nutritionScore = Math.round(
    pct(perServing.protein, "protein") * 0.22 + pct(perServing.fiber, "fiber") * 0.16 +
    pct(perServing.vitaminA, "vitaminA") * 0.14 + pct(perServing.vitaminC, "vitaminC") * 0.16 +
    pct(perServing.iron, "iron") * 0.16 + pct(perServing.calcium, "calcium") * 0.16
  );
  const costCoverage = n.costCoverageByWeight ?? n.costCoverage ?? 0;
  const nutritionCoverage = n.nutritionCoverageByWeight ?? n.nutritionCoverage ?? 0;
  // An unpriced protein or big unpriced share: the cost is too low to rank, so the dish goes last.
  const costIncomplete = !!n.costIncomplete;
  const ranked = !costIncomplete && costCoverage >= MIN_COST_COVERAGE && nutritionCoverage >= MIN_NUTRITION_COVERAGE && costPerServing >= MIN_COST_PER_SERVING;
  const valueScore = ranked ? round1((nutritionScore / costPerServing) * 3) : 0;
  return {
    id: raw.id,
    title: raw.title,
    url: raw.url,
    img: raw.imageUrl && /^https?:/.test(raw.imageUrl) ? raw.imageUrl : null,
    category: categoryFor(raw.title, n.course),
    course: n.course || null,
    servings,
    servingsAssumed: !!n.servingsAssumed,
    prepTime: raw.prepTime,
    cookTime: raw.cookTime,
    ingredientNames: (raw.ingredients || []).map((i) => (i.name || "").toLowerCase()),
    nutrition: {
      calories: Math.round(perServing.calories), protein: round1(perServing.protein), carbs: round1(perServing.carbs),
      fat: round1(perServing.fat), fiber: round1(perServing.fiber), vitaminA: Math.round(perServing.vitaminA),
      vitaminC: round1(perServing.vitaminC), iron: round1(perServing.iron), calcium: Math.round(perServing.calcium),
    },
    calories: Math.round(perServing.calories),
    kcalLow: n.kcalLow != null ? Math.round(n.kcalLow) : null,
    kcalHigh: n.kcalHigh != null ? Math.round(n.kcalHigh) : null,
    frying: n.frying || null,
    sodium: n.sodium ?? null,
    refKcal: n.refKcal ?? null,
    protein: round1(perServing.protein),
    fiber: round1(perServing.fiber),
    cost: { total: round1(costPerServing * servings), perServing: costPerServing },
    costPerServing,
    costCoverage,
    nutritionCoverage,
    costIncomplete,
    costGaps: n.costGaps || [],
    ranked,
    nutritionScore,
    valueScore,
    // Grams of protein per peso, for "Most Protein per ₱" (ranked dishes only: their cost is reliable).
    proteinPerPeso: ranked ? round1(perServing.protein) / costPerServing : 0,
    // Grams of protein per 100 kcal, for "Most Protein per Calorie".
    proteinPer100kcal: perServing.calories > 0 ? (perServing.protein / perServing.calories) * 100 : 0,
  };
}

// DA categories → the price table's filter groups.
function priceGroup(daCategory, name) {
  const c = (daCategory || "").toUpperCase();
  if (/FISH/.test(c)) return "fish";
  if (/BEEF|PORK|POULTRY|LIVESTOCK|CHICKEN|EGG/.test(c) || /\begg\b/i.test(name)) return "meat";
  if (/RICE|CORN|LEGUME|ROOT/.test(c)) return "staple";
  if (/FRUIT/.test(c)) return "fruits";
  if (/VEG|SPICE/.test(c)) return "vegetables";
  return "condiments"; // OTHER BASIC COMMODITIES: sugar, salt, cooking oil
}

// Single recipes only (articles and round-up posts are not), split into the ones shown and
// the ones hidden because an ingredient isn't in the catalog yet (counted, never deleted).
function splitHidden(recipes, compiled) {
  const shown = [], hidden = [];
  for (const r of recipes) {
    const c = compiled.get(r.id);
    if (!c || c.isArticle || c.isCollection || !(r.ingredients || []).length) continue;
    (c.hidden ? hidden : shown).push(r);
  }
  return { shown, hidden };
}

async function loadData() {
  const get = (path) => fetch(`${API_BASE}${path}`).then((r) => { if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); });
  const [comRes, recRes, compRes, nutRes] = await Promise.all([
    get("/api/commodities"), get("/api/recipes"), get("/api/recipes/compiled"), get("/api/nutrition").catch(() => ({ count: null })),
  ]);

  LATEST_DA_DATE = comRes.latestDate ? new Date(comRes.latestDate) : null;
  COMPARE_DATE = comRes.compareDate ? new Date(comRes.compareDate) : null;
  DA_PRICES = (comRes.commodities || []).map((c) => {
    let trend = "stable";
    if (c.price != null && c.prevPrice != null) trend = c.price > c.prevPrice ? "up" : c.price < c.prevPrice ? "down" : "stable";
    return {
      name: c.name, local: c.localName || "", group: priceGroup(c.category, c.name),
      unit: (c.unit && c.unit.label ? c.unit.label : "₱/kg").replace("₱/", ""),
      low: c.low, high: c.high, avg: c.price, trend,
      monthAgo: c.monthAgoPrice ?? null, monthChange: c.monthChange ?? null,
    };
  });

  const compiled = new Map((compRes.recipes || []).map((c) => [c.id, c]));
  // Articles ("What is Broccoli?") and round-up posts with several recipes in one card are not single recipes.
  const { shown, hidden } = splitHidden(recRes.recipes || [], compiled);
  RECIPES = shown.map((r) => buildRecipe(r, compiled.get(r.id)));
  const note = document.getElementById("hidden-note");
  if (note && hidden.length) {
    note.textContent = `${hidden.length.toLocaleString()} recipe${hidden.length !== 1 ? "s" : ""} hidden: ingredients not in our catalog yet.`;
    note.classList.remove("hidden");
  }

  countUp("stat-recipes", RECIPES.length);
  if (nutRes.count != null) countUp("stat-foods", nutRes.count); else setText("stat-foods", "—");
  countUp("stat-commodities", DA_PRICES.filter((p) => p.avg != null).length);
  document.querySelectorAll("[data-da-date]").forEach((el) => { el.textContent = formatDate(LATEST_DA_DATE); });
  document.querySelectorAll("[data-compare-date]").forEach((el) => { el.textContent = COMPARE_DATE ? shortDate(COMPARE_DATE) : "month ago"; });
}

function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

/** A home-page number that counts up from 0 (straight to the value when motion is reduced). */
function countUp(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !window.requestAnimationFrame) { el.textContent = n.toLocaleString(); return; }
  const t0 = performance.now(), ms = 900;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))).toLocaleString();
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** The hero search box: open Browse with the words typed. */
function heroSearch(q) {
  document.getElementById("search-input").value = q.trim();
  showSection("browse");
}

// ═══════════════ RENDER ═══════════════

function kcalText(r) {
  if (r.kcalLow != null && r.kcalHigh != null && r.kcalHigh - r.kcalLow >= 10) return `${r.kcalLow.toLocaleString()}–${r.kcalHigh.toLocaleString()}`;
  return `${r.calories.toLocaleString()}`;
}
function costText(r) {
  return r.costCoverage < 1 ? `₱${r.costPerServing}+` : `₱${r.costPerServing}`;
}

function buildRecipeCard(r) {
  const img = r.img
    ? `<img src="${escapeHtml(r.img)}" alt="${escapeHtml(r.title)}" loading="lazy" class="recipe-img w-full h-full object-cover transition-transform duration-300"
         onerror="this.parentElement.innerHTML='<div class=\\'flex items-center justify-center h-full text-5xl\\'>🍽️</div>'"/>`
    : `<div class="flex items-center justify-center h-full text-5xl">🍽️</div>`;
  return `
    <div class="recipe-card bg-white rounded-2xl overflow-hidden shadow hover:shadow-lg transition-shadow cursor-pointer flex flex-col group"
         onclick="openModal(${r.id})">
      <div class="relative h-44 bg-amber-100 overflow-hidden">
        ${img}
        ${r.ranked ? `<div class="absolute top-2 right-2 bg-green-700 text-white text-xs font-bold px-2 py-1 rounded-full shadow">★ ${r.valueScore} sulit</div>` : ""}
        ${r.costIncomplete ? `<div class="absolute top-2 left-2 bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow" title="No price yet for ${escapeHtml(r.costGaps.join(", "))}">⚠ Incomplete price</div>` : ""}
      </div>
      <div class="p-4 flex flex-col gap-2 flex-1">
        <h3 class="font-semibold text-gray-900 leading-snug group-hover:text-green-700 transition-colors">${escapeHtml(r.title)}</h3>
        <span class="text-xs text-gray-400 uppercase tracking-wide">${r.category}</span>
        <div class="flex flex-wrap gap-1 mt-auto pt-2">
          <span class="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium">${costText(r)}/serving</span>
          <span class="text-xs ${scoreColor(r.nutritionScore / 10)} px-2 py-0.5 rounded-full font-semibold">Nutri: ${r.nutritionScore}</span>
          <span class="text-xs text-gray-500">${r.protein}g protein</span>
        </div>
      </div>
    </div>`;
}

// One row per ingredient line, from the server engine: what was counted as eaten, and why.
function ingredientRows(lines) {
  let lastGroup = null;
  // Heading lines ("Marinade ingredients:") are shown as group headings instead.
  return lines.filter((l) => !(l.status === "skipped" && /header/.test(l.reason || ""))).map((l) => {
    const heading = l.group && l.group !== lastGroup
      ? `<p class="text-xs font-semibold uppercase tracking-wide text-gray-500 pt-2">${escapeHtml(l.group.replace(/:\s*$/, ""))}</p>`
      : "";
    lastGroup = l.group;
    const grams = l.gEaten != null && l.gAP != null
      ? (Math.round(l.gEaten) === Math.round(l.gAP) ? `≈${Math.round(l.gAP)} g` : `≈${Math.round(l.gAP)} g bought · ≈${Math.round(l.gEaten)} g eaten`)
      : "";
    const kcal = l.nutrients ? ` · ${Math.round(l.nutrients.kcal)} kcal` : "";
    const muted = ["to-taste", "optional", "water", "skipped"].includes(l.status);
    const note = l.reason || (l.status === "unmatched" ? "not matched to FNRI/DA yet" : l.status === "no-weight" ? "amount unclear" : "");
    const ps = l.priceSource || "";
    // "≈ Garlic ×2.5 (DA)": no shop sells it, so it is priced from a parent item (an assumption).
    const derived = ps.startsWith("≈");
    const why = derived ? (l.flags || []).find((f) => f.startsWith("price-")) || "" : "";
    const source = l.cost != null ? (derived ? ps : ps === "DA" ? "DA" : ps.startsWith("PSA") ? `${ps} (palengke)` : ps.startsWith("SM") ? "SM Markets" : "DTI SRP") : "";
    return `${heading}
    <div class="flex items-start justify-between gap-3 bg-gray-50 rounded-xl px-4 py-3 ${muted ? "opacity-60" : ""}">
      <div class="min-w-0">
        <p class="font-medium text-sm">${escapeHtml(l.text)}</p>
        <p class="text-xs text-gray-400">${escapeHtml(grams + kcal)}${note ? ` · ${escapeHtml(note)}` : ""}</p>
      </div>
      <p class="text-sm font-semibold text-amber-700 whitespace-nowrap text-right"${why ? ` title="${escapeHtml(why.replace(/^price-[a-z-]+: /, "Assumed: "))}"` : ""}>${l.cost != null ? (derived ? "≈₱" : "₱") + l.cost.toFixed(2) : ""}${source ? `<span class="block text-[10px] font-normal ${derived ? "text-amber-600" : "text-gray-400"}">${escapeHtml(source)}</span>` : ""}</p>
    </div>`;
  }).join("");
}

function buildModal(r, instructions, lines) {
  const nutr = r.nutrition;
  const ingRows = lines ? ingredientRows(lines) : `<p class="text-sm text-gray-400">Loading ingredients…</p>`;
  const steps = (instructions && instructions.length ? instructions : ["Full instructions are on the original recipe page."])
    .map((s, i) => `
    <li class="flex gap-4">
      <span class="flex-shrink-0 w-8 h-8 bg-green-700 text-white rounded-full flex items-center justify-center text-sm font-bold">${i + 1}</span>
      <p class="text-gray-700 leading-relaxed pt-1">${escapeHtml(s)}</p>
    </li>`).join("");

  const nutriBars = [
    { label: "Protein", val: nutr.protein, key: "protein", unit: "g" },
    { label: "Carbs", val: nutr.carbs, key: "carbs", unit: "g" },
    { label: "Fat", val: nutr.fat, key: "fat", unit: "g" },
    { label: "Fiber", val: nutr.fiber, key: "fiber", unit: "g" },
    { label: "Vitamin C", val: nutr.vitaminC, key: "vitaminC", unit: "mg" },
    { label: "Iron", val: nutr.iron, key: "iron", unit: "mg" },
    { label: "Calcium", val: nutr.calcium, key: "calcium", unit: "mg" },
  ].map((n) => {
    const p = pct(n.val, n.key);
    return `
      <div>
        <div class="flex justify-between text-xs mb-1">
          <span class="text-gray-600">${n.label}</span>
          <span class="font-medium">${n.val}${n.unit} <span class="text-gray-400">(${p}% DRV)</span></span>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${p}%"></div></div>
      </div>`;
  }).join("");

  const strength = r.protein >= 20 ? "protein" : r.fiber >= 5 ? "fiber" : "vitamins";
  const insight = r.ranked
    ? `<div class="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700">
        <p class="font-bold mb-1">💡 Why this scores ${r.valueScore >= 7 ? "well" : "this way"}</p>
        <p>Nutrition score ${r.nutritionScore} for about ₱${r.costPerServing} per serving at today’s prices. Strongest in ${strength}.</p>
      </div>`
    : `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
        <p class="font-bold mb-1">Not ranked for value</p>
        <p>About ${Math.round(r.costCoverage * 100)}% of this recipe’s ingredients (by weight) have a market price and ${Math.round(r.nutritionCoverage * 100)}% have nutrition data, so its value score would be unreliable.</p>
      </div>`;

  return `
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-2xl font-bold">${escapeHtml(r.title)}</h2>
        <span class="text-sm text-gray-500">${r.category} · ${r.servings} servings${r.servingsAssumed ? " (assumed: the recipe doesn’t say)" : ""}${(r.prepTime || 0) + (r.cookTime || 0) > 0 ? ` · ${(r.prepTime || 0) + (r.cookTime || 0)} min` : ""}</span>
        ${r.url ? `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener" class="block text-xs text-green-700 hover:underline mt-1">View original on Panlasang Pinoy ↗</a>` : ""}
        ${r.id ? `<button onclick="customizeRecipe(${r.id})" class="mt-2 text-xs font-medium bg-amber-100 hover:bg-amber-200 text-amber-800 px-3 py-1 rounded-full">✏️ Customize this dish</button>` : ""}
      </div>
      <button onclick="closeModalBtn()" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">✕</button>
    </div>

    <div class="grid md:grid-cols-3 gap-6">
      <div class="md:col-span-2 space-y-6">
        <div class="flex flex-wrap gap-3">
          <div class="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center">
            <p class="text-2xl font-bold text-green-700">${r.ranked ? r.valueScore : "—"}</p>
            <p class="text-xs text-green-600 font-medium">Sulit Score</p>
          </div>
          <div class="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-center">
            <p class="text-2xl font-bold text-amber-700">${costText(r)}</p>
            <p class="text-xs text-amber-600 font-medium">Per Serving</p>
          </div>
          <div class="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-center">
            <p class="text-2xl font-bold text-blue-700">${r.nutritionScore}</p>
            <p class="text-xs text-blue-600 font-medium">Nutrition Score</p>
          </div>
          <div class="bg-gray-50 border rounded-xl px-4 py-3 text-center">
            <p class="text-2xl font-bold text-gray-700">${kcalText(r)}</p>
            <p class="text-xs text-gray-500 font-medium">kcal/serving${r.frying ? " · fried: oil absorption estimated" : ""}</p>
          </div>
        </div>

        <div>
          <h3 class="font-bold text-lg mb-3">Ingredients</h3>
          <div class="space-y-2">${ingRows}</div>
          <div class="mt-3 flex justify-between text-sm bg-amber-50 rounded-xl px-4 py-3">
            <span class="text-gray-600">Estimated total cost</span>
            <div class="text-right">
              <p class="font-bold text-amber-700">₱${r.cost.total.toFixed(0)}${r.costCoverage < 1 ? "+" : ""}</p>
              <p class="text-xs text-gray-400">${costText(r)}/serving × ${r.servings} servings${r.costCoverage < 1 ? ` · ${Math.round(r.costCoverage * 100)}% of ingredients (by weight) priced` : ""}</p>
            </div>
          </div>
          ${r.costIncomplete ? `<p class="mt-2 text-xs bg-amber-100 text-amber-900 rounded-xl px-4 py-2">⚠ <strong>Incomplete price data:</strong> no price yet for ${escapeHtml(r.costGaps.join(", "))}. The real cost is higher than shown, so this dish is listed last.</p>` : ""}
        </div>

        <div>
          <h3 class="font-bold text-lg mb-3">Instructions</h3>
          <ol class="space-y-4">${steps}</ol>
        </div>
      </div>

      <div class="space-y-4">
        <div class="border-2 border-gray-900 rounded-xl p-4">
          <div class="border-b-8 border-gray-900 pb-1 mb-1">
            <p class="text-xs font-bold uppercase">Nutrition Facts</p>
            <p class="text-xs text-gray-500">${r.servings} servings per recipe</p>
            <p class="text-sm font-bold">Per Serving</p>
          </div>
          <div class="border-b-4 border-gray-900 pb-2 mb-2">
            <div class="flex justify-between items-center">
              <span class="text-xs">Calories</span>
              <span class="text-3xl font-black">${kcalText(r)}</span>
            </div>
          </div>
          <div class="space-y-2">${nutriBars}</div>
          ${r.sodium != null ? `<p class="text-xs text-gray-600 mt-2">Sodium ≈ ${Math.round(r.sodium).toLocaleString()} mg</p>` : ""}
          ${r.refKcal ? `<p class="text-xs text-gray-500 mt-2">Panlasang Pinoy’s own estimate: ≈ ${Math.round(r.refKcal).toLocaleString()} kcal per serving (it counts all frying oil and marinade)</p>` : ""}
          <p class="text-xs text-gray-400 mt-3">Source: FNRI FCT · per serving estimate · edible portion and cooking losses applied</p>
        </div>
        ${insight}
      </div>
    </div>`;
}

// Meals by Sulit Score: sauces and desserts stay searchable but aren't ranked here.
function topValueMeals() {
  const seen = new Set();
  return RECIPES.filter((r) => r.ranked && r.nutritionScore >= TOP_MIN_NUTRITION_SCORE && r.category !== "Dessert" && r.category !== "Sauce & Condiment")
    .sort((a, b) => b.valueScore - a.valueScore)
    .filter((r) => { const k = r.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

function renderTopRecipes() {
  const sorted = topValueMeals().slice(0, 8);
  document.getElementById("top-recipes-grid").innerHTML = sorted.map(buildRecipeCard).join("")
    || `<p class="col-span-4 text-center text-gray-400 py-10">No ranked recipes yet.</p>`;
}

let currentPriceCat = "all";

function renderPrices(cat) {
  currentPriceCat = cat;
  const sort = (document.getElementById("price-sort") || {}).value || "name";
  // Items without a month-ago price go last in either change order.
  const byChange = (dir) => (a, b) => (a.monthChange == null) - (b.monthChange == null) || dir * ((b.monthChange || 0) - (a.monthChange || 0));
  const filtered = (cat === "all" ? DA_PRICES : DA_PRICES.filter((p) => p.group === cat))
    .slice().sort(sort === "up" ? byChange(1) : sort === "down" ? byChange(-1) : (a, b) => a.name.localeCompare(b.name));
  const trendIcon = { up: "▲", down: "▼", stable: "–" };
  const trendColor = { up: "price-up", down: "price-down", stable: "text-gray-400" };
  const money = (v) => (v != null ? Number(v).toFixed(2) : "—");

  document.getElementById("price-table-body").innerHTML = filtered.length ? filtered.map((p, i) => `
    <tr class="${i % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-green-50 transition-colors">
      <td class="px-5 py-3 font-medium">${escapeHtml(p.name)}</td>
      <td class="px-3 py-3 text-gray-500 hidden sm:table-cell">${escapeHtml(p.local)}</td>
      <td class="px-3 py-3 text-gray-500">/${escapeHtml(p.unit)}</td>
      <td class="px-3 py-3 text-right text-gray-600 tabular-nums">${money(p.low)}</td>
      <td class="px-3 py-3 text-right text-gray-600 tabular-nums">${money(p.high)}</td>
      <td class="px-5 py-3 text-right font-bold tabular-nums">${p.avg != null ? "₱" + money(p.avg) : '<span class="text-gray-400 font-normal">n/a</span>'}</td>
      <td class="px-3 py-3 text-right tabular-nums ${p.monthChange > 0 ? "price-up" : p.monthChange < 0 ? "price-down" : "text-gray-400"}"
          title="${p.monthAgo != null ? "₱" + money(p.monthAgo) + " on " + shortDate(COMPARE_DATE) : "no price a month ago"}">${pctText(p.monthChange)}</td>
      <td class="px-3 py-3 text-center hidden md:table-cell">
        <span class="text-xs font-bold ${trendColor[p.trend]}">${trendIcon[p.trend]}</span>
      </td>
    </tr>`).join("") : `<tr><td colspan="8" class="text-center py-10 text-gray-400">No commodities in this group.</td></tr>`;

  document.querySelectorAll(".price-cat-btn").forEach((b) => {
    b.classList.remove("bg-green-700", "text-white");
    b.classList.add("bg-white", "border", "text-gray-600");
  });
  const active = document.getElementById(`cat-${cat}`);
  if (active) {
    active.classList.remove("bg-white", "border", "text-gray-600");
    active.classList.add("bg-green-700", "text-white");
  }
}

function filterPrices(cat) { renderPrices(cat); }

// ═══════════════ DISH PRICE MOVERS ═══════════════
// Loaded the first time the Prices tab opens: the server compiles every recipe twice.

let moversLoaded = false;

function moverRow(m) {
  const known = RECIPES.some((r) => r.id === m.id);
  const drivers = (m.drivers || [])
    .filter((d) => d.change != null && Math.abs(d.change) >= 0.05)
    .map((d) => `${escapeHtml(d.label)} ${pctText(d.change)}`).join(", ");
  return `
    <div class="flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 ${known ? "cursor-pointer hover:bg-gray-50" : ""}" ${known ? `onclick="openModal(${m.id})"` : ""}>
      <div class="min-w-0">
        <p class="font-medium truncate">${escapeHtml(m.title)}</p>
        ${drivers ? `<p class="text-xs text-gray-400 truncate">${drivers}</p>` : ""}
      </div>
      <div class="text-right whitespace-nowrap">
        <p class="font-bold ${m.change > 0 ? "price-up" : "price-down"}">${pctText(m.change)}</p>
        <p class="text-xs text-gray-400">₱${m.then.toFixed(0)} → ₱${m.now.toFixed(0)}/serving</p>
      </div>
    </div>`;
}

async function loadMovers() {
  if (moversLoaded) return;
  moversLoaded = true;
  const summary = document.getElementById("movers-summary");
  try {
    const res = await fetch(`${API_BASE}/api/recipes/price-movers?limit=8`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const m = await res.json();
    // Rows link to recipes in RECIPES, which may still be loading if the tab
    // was opened right away; a failed load just leaves the rows unlinked.
    await DATA_READY?.catch(() => {});
    if (!m.compareDate) {
      summary.textContent = m.note || "Not enough price history yet.";
      return;
    }
    summary.textContent = `Since ${shortDate(new Date(m.compareDate))} · ${m.compared.toLocaleString()} dishes compared · typical dish ${pctText(m.medianChange)} · ${m.rising} pricier, ${m.falling} cheaper by 10% or more`;
    document.getElementById("movers-rose").innerHTML = m.rose.map(moverRow).join("") || `<p class="text-gray-400 px-2 py-1.5">No dish rose by 10% or more.</p>`;
    document.getElementById("movers-fell").innerHTML = m.fell.map(moverRow).join("") || `<p class="text-gray-400 px-2 py-1.5">No dish fell by 10% or more.</p>`;
  } catch (e) {
    moversLoaded = false; // try again next time the tab opens
    summary.textContent = `Couldn’t load price changes (${e.message}).`;
  }
}

function filterRecipes() {
  const sort = document.getElementById("sort-select").value;
  const minProt = parseFloat(document.getElementById("min-protein").value) || 0;
  const maxCost = parseFloat(document.getElementById("max-cost").value) || Infinity;
  const produce = document.getElementById("produce-filter").value.toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  const search = document.getElementById("search-input").value.toLowerCase();
  const minKcal = parseFloat(document.getElementById("min-kcal").value) || 0;
  const maxKcal = parseFloat(document.getElementById("max-kcal").value) || Infinity;
  const kcalFilter = minKcal > 0 || maxKcal !== Infinity;

  const filtered = RECIPES.filter((r) => {
    if (r.protein < minProt) return false;
    // Calorie filters need trustworthy calories: a dish missing most nutrition data would look "light".
    if (kcalFilter && (!kcalKnown(r) || r.calories < minKcal || r.calories > maxKcal)) return false;
    if (maxCost !== Infinity && (!r.ranked || r.costPerServing > maxCost)) return false;
    if (produce.length && !produce.every((p) => r.ingredientNames.some((n) => n.includes(p)))) return false;
    if (search && !r.title.toLowerCase().includes(search)) return false;
    return true;
  });

  // Dishes with incomplete price data always go last.
  filtered.sort((a, b) => (a.costIncomplete - b.costIncomplete) || browseCmp(a, b));
  function browseCmp(a, b) {
    if (sort === "costPerServing") return (a.ranked ? a.costPerServing : Infinity) - (b.ranked ? b.costPerServing : Infinity);
    if (sort === "caloriesAsc") return (kcalKnown(a) ? a.calories : Infinity) - (kcalKnown(b) ? b.calories : Infinity);
    if (sort === "proteinPer100kcal") return (kcalKnown(b) ? b.proteinPer100kcal : -1) - (kcalKnown(a) ? a.proteinPer100kcal : -1);
    return (b[sort] || 0) - (a[sort] || 0);
  }

  document.getElementById("result-count").textContent = `${filtered.length.toLocaleString()} recipe${filtered.length !== 1 ? "s" : ""} found`;
  // Render in pages so 2,000 cards don't block the page.
  const shown = filtered.slice(0, browseLimit);
  document.getElementById("browse-grid").innerHTML = shown.length > 0
    ? shown.map(buildRecipeCard).join("") + (filtered.length > shown.length
      ? `<div class="col-span-full text-center pt-2"><button onclick="showMore()" class="bg-green-700 hover:bg-green-600 text-white text-sm font-medium px-6 py-2 rounded-full">Show more (${(filtered.length - shown.length).toLocaleString()} left)</button></div>`
      : "")
    : `<div class="col-span-4 text-center py-16 text-gray-400">
        <p class="text-4xl mb-3">🔍</p>
        <p class="font-medium">No recipes match your filters</p>
        <p class="text-sm mt-1">Try widening the criteria above.</p>
       </div>`;
}

let browseLimit = 48;
function showMore() { browseLimit += 48; filterRecipes(); }

// Calories worth comparing: mostly-known nutrition, and a dish rather than a sauce
// (a spoonful of sinamak isn't a light meal).
function kcalKnown(r) { return r.calories > 0 && r.nutritionCoverage >= MIN_NUTRITION_COVERAGE && r.category !== "Sauce & Condiment"; }

// Quick filters: [min kcal, max kcal, min protein]; undefined leaves a field as it is.
const PRESETS = {
  light: [null, 400, undefined],
  regular: [400, 700, undefined],
  hearty: [700, null, undefined],
  protein: [undefined, undefined, 25],
  clear: [null, null, null],
};
// "💪 Rank by protein per calorie": the leanest protein first (grams per 100 kcal).
function rankByProteinPerKcal() {
  document.getElementById("sort-select").value = "proteinPer100kcal";
  browseLimit = 48;
  filterRecipes();
}

function setPreset(kind) {
  const [lo, hi, protein] = PRESETS[kind];
  const set = (id, v) => { if (v !== undefined) document.getElementById(id).value = v ?? ""; };
  set("min-kcal", lo);
  set("max-kcal", hi);
  set("min-protein", protein);
  browseLimit = 48;
  filterRecipes();
}

// ═══════════════ WEATHER PICKS ═══════════════
// weather.js: weatherMood, weatherPicks, fetchWeather, getLocation, MANILA.

// The weather buttons (Auto follows the live weather) and the sort buttons,
// remembered on this device.
const MODE_KEY = "sarapsulit.weatherMode";
const SORT_KEY = "sarapsulit.pickSort";
const MOOD_ICON = { sunny: "☀️", rainy: "🌧️", cool: "🌥️", mild: "⛅" };
let lastWeather = null; // { w, place } from Open-Meteo
let weatherError = null;
let weatherMode = readPref(MODE_KEY, ["auto", "sunny", "rainy", "cool"], "auto");
let pickSort = readPref(SORT_KEY, Object.keys(PICK_SORTS), "value");

function readPref(key, allowed, fallback) {
  try { const v = localStorage.getItem(key); return allowed.includes(v) ? v : fallback; } catch { return fallback; }
}
function writePref(key, v) {
  try { localStorage.setItem(key, v); } catch { /* storage blocked: the choice lasts this visit */ }
}

function setWeatherMode(mode) { weatherMode = mode; writePref(MODE_KEY, mode); renderWeather(); }
function setPickSort(sort) { pickSort = sort; writePref(SORT_KEY, sort); renderWeather(); }

/** Rainy look on or off: palette via body.rainy, falling drops unless reduced motion is asked for. */
function setRainy(on) {
  document.body.classList.toggle("rainy", on);
  let rain = document.getElementById("rain");
  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!on || still) { if (rain) rain.remove(); return; }
  if (rain) return;
  rain = document.createElement("div");
  rain.id = "rain";
  rain.setAttribute("aria-hidden", "true");
  rain.innerHTML = Array.from({ length: 70 }, () => {
    const len = 12 + Math.random() * 14;
    return `<i style="left:${(Math.random() * 105).toFixed(1)}%;height:${len.toFixed(0)}px;animation-duration:${(0.6 + Math.random() * 0.6).toFixed(2)}s;animation-delay:-${(Math.random() * 1.2).toFixed(2)}s;opacity:${(0.35 + Math.random() * 0.5).toFixed(2)}"></i>`;
  }).join("");
  document.body.appendChild(rain);
}

function renderWeather() {
  document.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === weatherMode));
  document.querySelectorAll("[data-sort]").forEach((b) => b.classList.toggle("on", b.dataset.sort === pickSort));
  const live = lastWeather ? weatherMood(lastWeather.w) : null;
  const mood = weatherMode === "auto" ? live : weatherMode;
  const sub = document.getElementById("weather-sub");
  if (lastWeather) {
    const { w, place } = lastWeather;
    const label = weatherLabel(w.code);
    const rain = w.rainChance6h > 0 ? ` · ${w.rainChance6h}% chance of rain in the next 6 hours` : "";
    sub.textContent = `${Math.round(w.temp)}°C, feels like ${Math.round(w.apparent)}°C, ${label.text}${rain} · ${place === MANILA ? MANILA.name : "near you"}`
      + (weatherMode !== "auto" ? ` · showing ${weatherMode} picks (your choice)` : "");
  } else if (weatherError) {
    sub.textContent = `Couldn’t get the weather (${weatherError})${weatherMode !== "auto" ? `. Showing ${weatherMode} picks.` : ". Pick a weather above."}`;
  }
  if (!mood) return; // still waiting for the weather
  setRainy(mood === "rainy");
  const copy = MOOD_COPY[mood];
  setText("weather-icon", weatherMode === "auto" && lastWeather ? weatherLabel(lastWeather.w.code).icon : MOOD_ICON[mood]);
  setText("weather-title", copy.title);
  setText("weather-desc", copy.sub);
  // Mild weather: the next best value meals after the Top Value list, in the chosen order.
  const picks = weatherPicks(mood, RECIPES, 4, undefined, pickSort)
    ?? (pickSort === "value" ? topValueMeals().slice(8, 12) : topValueMeals().slice(8, 12).sort(PICK_SORTS[pickSort].cmp));
  document.getElementById("weather-grid").innerHTML = picks.map(buildRecipeCard).join("")
    || `<p class="col-span-4 text-gray-400">No matching dishes yet.</p>`;
}

async function showWeather(place) {
  try {
    const [w] = await Promise.all([fetchWeather(place), DATA_READY ? DATA_READY.catch(() => {}) : null]);
    lastWeather = { w, place };
    weatherError = null;
  } catch (e) {
    weatherError = e.message;
  }
  renderWeather();
}

// Asks for the phone's location as the page opens. No answer within 8 s (or a
// refusal) shows Metro Manila; a late "allow" then switches to the phone's weather.
async function loadWeatherPicks() {
  const geo = getLocation();
  const first = await Promise.race([geo, new Promise((r) => setTimeout(() => r("timeout"), 8000))]);
  if (first && first !== "timeout") return showWeather(first);
  await showWeather(MANILA);
  if (first === "timeout") {
    const later = await geo;
    if (later) await showWeather(later);
  }
}

// ═══════════════ MODAL ═══════════════

async function openModal(id) {
  const r = RECIPES.find((x) => x.id === id);
  if (!r) return;
  document.getElementById("modal-content").innerHTML = buildModal(r, ["Loading instructions…"], null);
  document.getElementById("recipe-modal").classList.add("open");
  document.body.style.overflow = "hidden";
  const [detail, compiled] = await Promise.all([
    fetch(`${API_BASE}/api/recipes/${id}`).then((res) => res.json()).catch(() => null),
    fetch(`${API_BASE}/api/recipes/compiled?id=${id}`).then((res) => (res.ok ? res.json() : null)).catch(() => null),
  ]);
  const instructions = detail && detail.recipe ? (detail.recipe.instructions || []).map((s) => s.text) : [];
  const lines = compiled && compiled.recipe ? compiled.recipe.lines : [];
  if (!document.getElementById("recipe-modal").classList.contains("open")) return;
  document.getElementById("modal-content").innerHTML = buildModal(r, instructions, lines);
}

function closeModal() {
  document.getElementById("recipe-modal").classList.remove("open");
  document.body.style.overflow = "";
}
function closeModalBtn() { closeModal(); }

// ═══════════════ NAVIGATION ═══════════════

function showSection(name) {
  ["home", "browse", "prices", "mydish", "planner", "finder"].forEach((s) => {
    document.getElementById(`section-${s}`).classList.toggle("hidden", s !== name);
    document.getElementById(`section-${s}`).classList.toggle("flex", s === name);
    const btn = document.getElementById(`nav-${s}`);
    if (btn) btn.classList.toggle("active", s === name);
    document.querySelectorAll(`[data-nav="${s}"]`).forEach((b) => b.classList.toggle("active", s === name));
    // Phones: the nav scrolls sideways; keep the open tab in view.
    if (btn && s === name && btn.scrollIntoView) btn.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  window.scrollTo(0, 0);
  if (name === "browse") filterRecipes();
  if (name === "prices") loadMovers();
  if (name === "mydish") initMyDish();
  if (name === "planner") initPlanner();
  if (name === "finder") initFinder();
}

// ═══════════════ INIT ═══════════════

(async function init() {
  DATA_READY = loadData();
  renderWeather();
  if (weatherMode !== "auto") DATA_READY.then(renderWeather, () => {});
  loadWeatherPicks();
  try {
    await DATA_READY;
  } catch (e) {
    document.getElementById("top-recipes-grid").innerHTML =
      `<p class="col-span-4 text-center text-red-600 py-10">Couldn’t load data from the server (${escapeHtml(e.message)}). Please refresh in a moment.</p>`;
    return;
  }
  renderTopRecipes();
  renderPrices("all");
  filterRecipes();
})();
