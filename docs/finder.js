// "Anong lulutuin?": pick the ingredients you have from grouped dropdowns; each pick
// becomes a node in a graph, linked to the dishes (photos) you can cook with it.
// Reads /api/recipes/ingredient-index. Uses app.js helpers: API_BASE, RECIPES,
// DATA_READY, escapeHtml, openModal. The graph uses d3 (loaded when the tab opens).
// docs/finder.test.mjs tests the pure helpers.

const FINDER_KEY = "sarapsulit.finder.v1";
const D3_URL = "https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js";

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

// Dropdown groups, checked in order: the first match wins.
const CATEGORIES = [
  { key: "sarsa", label: "Sarsa at pampalasa", icon: "🧂", color: "#94a3b8",
    re: /(sauce|vinegar|^salt|peppercorn|black_pepper|^sugar|^oil_|paste|powder|seasoning|bouillon|cube|ketchup|mayonnaise|stock|broth|spice|bay_leaf|^wine|honey|syrup|msg|_mix|^mix|extract|mustard|annatto|atsuete|star_anise|cinnamon|cumin|paprika|oregano|basil|thyme|parsley|cilantro|lemongrass|pandan)/ },
  { key: "karne", label: "Karne at manok", icon: "🥩", color: "#f87171",
    re: /^(pork|beef|chicken|goat|carabeef|turkey|duck|lamb|lechon|chicharon|hotdog|bacon|ham|sausage|longg?anisa|tocino|corned|spam|luncheon|meatloaf|chorizo|veal)/ },
  { key: "dagat", label: "Isda at lamang-dagat", icon: "🐟", color: "#60a5fa",
    re: /^(fish|shrimp|prawn|squid|crab|alimasag|mussel|tahong|clam|halaan|oyster|tuna|salmon|tilapia|bangus|milkfish|galunggong|sardine|octopus|dilis|anchov|scallop|lobster|tinapa|daing|tuyo|danggit|mackerel|tanigue|lapu|pompano|pampano|cream_dory|dory|catfish|hito|mudfish|dalag|shellfish|seaweed|lato)/ },
  { key: "itlog", label: "Itlog, gatas at keso", icon: "🥚", color: "#fcd34d",
    re: /^(egg(_|$)|milk|cheese|cream|butter|yogurt|condensed|evaporated|margarine|ice_cream|whipping)/ },
  { key: "kanin", label: "Kanin, noodles at harina", icon: "🍚", color: "#c4b5fd",
    re: /^(rice|noodles?|pasta|spaghetti|macaroni|flour|bread|tortilla|cornstarch|oats|sago|tapioca|lumpia|wrapper|wonton|breadcrumbs|panko|crackers|misua|sotanghon|bihon|canton|miki)/ },
  { key: "prutas", label: "Prutas at niyog", icon: "🥥", color: "#fb923c",
    re: /^(banana|saba|mango|pineapple|calamansi|lemon|lime|coconut|buko|avocado|apple|orange|jackfruit|langka|watermelon|melon|grape|raisin|santol|tamarind|sampalok|kamias|strawberr|blueberr|cherry|peach|pear|kaong|nata|macapuno|dalandan|pomelo|guava|bayabas)/ },
  { key: "gulay", label: "Gulay", icon: "🥬", color: "#4ade80", re: /./ },
];

// ── Pure helpers ──

// Things named after a family that aren't that food: fish sauce isn't fish, banana ketchup and blossom aren't bananas.
const NOT_FAMILY = /_(bouillon|cube|broth|stock|sauce|powder|seasoning|flavor|paste|oil|extract|ketchup|blossom|and_beans|nuggets)(_|$)/;
const familyOf = (slug) => { const f = slug.split("_")[0]; return f in FAMILIES && !NOT_FAMILY.test(slug) ? f : null; };

/** The dropdown group for an ingredient slug, or for a family token ("any:pork"). */
function ingredientCategory(token) {
  const slug = token.startsWith("any:") ? token.slice(4) : token;
  return CATEGORIES.find((c) => c.re.test(slug)) || CATEGORIES[CATEGORIES.length - 1];
}

/** Does the pantry `have` (slugs and "any:<family>" tokens) cover this slug? */
function hasIngredient(have, slug, staples) {
  if (have.has(slug) || (staples && STAPLES.has(slug))) return true;
  const f = familyOf(slug);
  return !!f && have.has(`any:${f}`);
}

/** Which of your picks covers this slug: the slug itself or its family token. */
function pickFor(have, slug) {
  if (have.has(slug)) return slug;
  const f = familyOf(slug);
  return f && have.has(`any:${f}`) ? `any:${f}` : null;
}

/**
 * Dishes you can make from `have`, best first: fewest missing ingredients, then most of
 * your picks used, then best value. A dish needs at least one of your picks (staples don't count).
 * `index` is the API's { ingredients, recipes }; `recipes` maps id → { title, valueScore }.
 * Each result lists `tokens`: which of your picks it uses (the graph's links).
 */
function matchDishes(index, have, recipes, { staples = true, limit = 60 } = {}) {
  if (!have.size) return [];
  const out = [];
  for (const r of index.recipes) {
    const info = recipes.get(r.id);
    if (!info) continue;
    const used = [], tokens = new Set(), missing = [];
    r.i.forEach((n, k) => {
      const ing = index.ingredients[n];
      const pick = pickFor(have, ing.slug);
      if (pick) { used.push(ing.label); tokens.add(pick); }
      else if (!hasIngredient(have, ing.slug, staples)) missing.push({ slug: ing.slug, label: ing.label, cost: r.c[k] });
    });
    if (!used.length) continue;
    const missingCost = missing.reduce((s, m) => s + (m.cost || 0), 0);
    out.push({ id: r.id, title: info.title, used, tokens: [...tokens], missing, missingCost, costIncomplete: !!info.costIncomplete,
      unpricedMissing: missing.some((m) => m.cost == null), value: info.valueScore || 0 });
  }
  // Reposts share a title: keep the best match of each.
  const seen = new Set();
  return out
    // Dishes with incomplete price data go last.
    .sort((a, b) => (a.costIncomplete - b.costIncomplete) || a.missing.length - b.missing.length || b.tokens.length - a.tokens.length || b.used.length - a.used.length || b.value - a.value)
    .filter((d) => { const t = d.title.trim().toLowerCase(); if (seen.has(t)) return false; seen.add(t); return true; })
    .slice(0, limit);
}

/**
 * One group's dropdown: its families, then its ingredients by how many dishes use them,
 * filtered by `query`. Picked ones stay in the list (shown ticked).
 */
function categoryOptions(index, catKey, query = "") {
  const q = query.trim().toLowerCase();
  const fam = Object.entries(FAMILIES)
    .filter(([f]) => ingredientCategory(`any:${f}`).key === catKey)
    .map(([f, label]) => ({ token: `any:${f}`, label, count: null }));
  const ings = index.ingredients
    .filter((x) => ingredientCategory(x.slug).key === catKey)
    .map((x) => ({ token: x.slug, label: x.label, count: x.count }));
  return [...fam, ...ings].filter((o) => !q || o.label.toLowerCase().includes(q) || o.token.includes(q.replace(/ /g, "_")));
}

/**
 * The dishes to draw: first the ones that join several of your picks (fewest missing first),
 * up to half the graph, then each pick's best dishes in turn, so no pick is left alone.
 */
function graphDishes(have, dishes, max) {
  const out = new Set();
  [...dishes].filter((d) => d.tokens.length > 1)
    .sort((a, b) => b.tokens.length - a.tokens.length || a.missing.length - b.missing.length)
    .slice(0, Math.floor(max / 2)).forEach((d) => out.add(d));
  const queues = [...have].map((t) => dishes.filter((d) => d.tokens.includes(t)));
  for (let round = 0; out.size < max && queues.some((q) => q.length > round); round++) {
    for (const q of queues) if (out.size < max && q[round]) out.add(q[round]);
  }
  return [...out];
}

/**
 * Graph nodes and links: one node per pick, one per dish (top `maxDishes`), and faint
 * nodes for up to `ghostsPerDish` missing ingredients of each dish (shared ones merge).
 */
function graphData(have, dishes, { maxDishes = 14, ghostsPerDish = 2 } = {}) {
  const nodes = [...have].map((t) => ({ id: `i:${t}`, kind: "ing", token: t }));
  const links = [];
  const ghosts = new Set();
  for (const d of graphDishes(have, dishes, maxDishes)) {
    nodes.push({ id: `d:${d.id}`, kind: "dish", dishId: d.id, complete: !d.missing.length, missing: d.missing.length });
    for (const t of d.tokens) links.push({ source: `i:${t}`, target: `d:${d.id}`, kind: "have" });
    for (const m of d.missing.slice(0, ghostsPerDish)) {
      const id = `m:${m.slug}`;
      if (!ghosts.has(id)) { ghosts.add(id); nodes.push({ id, kind: "missing", label: m.label }); }
      links.push({ source: id, target: `d:${d.id}`, kind: "missing" });
    }
  }
  return { nodes, links };
}

// ── State ──

let finderIndex = null;
let finderHave = new Set();
let finderStaples = true;
let finderOpenCat = null;

function finderStore() {
  try { return window.localStorage; } catch { return null; }
}

function finderLabel(token) {
  if (token.startsWith("any:")) return FAMILIES[token.slice(4)] || token;
  return finderIndex?.ingredients.find((x) => x.slug === token)?.label || token;
}

let d3Loading = null;
function loadD3() {
  if (window.d3) return Promise.resolve();
  return (d3Loading ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = D3_URL; s.onload = resolve; s.onerror = () => { d3Loading = null; reject(new Error("graph library didn't load")); };
    document.head.appendChild(s);
  }));
}

async function initFinder() {
  try {
    const v = JSON.parse(finderStore()?.getItem(FINDER_KEY) || "null");
    if (v && Array.isArray(v.have)) { finderHave = new Set(v.have); finderStaples = v.staples !== false; }
  } catch { /* start empty */ }
  document.getElementById("finder-staples").checked = finderStaples;
  if (!finderIndex) {
    document.getElementById("finder-cats").innerHTML = `<p class="text-sm text-gray-400">Loading ingredients…</p>`;
    try {
      const [res] = await Promise.all([fetch(`${API_BASE}/api/recipes/ingredient-index`), DATA_READY?.catch(() => {}), loadD3().catch(() => {})]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      finderIndex = await res.json();
    } catch (e) {
      document.getElementById("finder-cats").innerHTML = `<p class="text-sm text-red-600">Couldn’t load the ingredient list (${escapeHtml(e.message)}). Please try again in a moment.</p>`;
      return;
    }
  }
  renderFinder();
}

function finderSave() {
  try { finderStore()?.setItem(FINDER_KEY, JSON.stringify({ have: [...finderHave], staples: finderStaples })); } catch { /* not saved */ }
}

function finderToggle(token) {
  if (finderHave.has(token)) finderHave.delete(token); else finderHave.add(token);
  finderSave(); renderFinder();
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

function toggleFinderCat(key) {
  finderOpenCat = finderOpenCat === key ? null : key;
  renderFinderCats();
  if (finderOpenCat) document.getElementById(`fx-q-${key}`)?.focus();
}

// ── Rendering: the list of dropdowns ──

function renderFinderCats() {
  const q = finderOpenCat ? document.getElementById(`fx-q-${finderOpenCat}`)?.value || "" : "";
  document.getElementById("finder-cats").innerHTML = CATEGORIES.map((c) => {
    const picked = [...finderHave].filter((t) => ingredientCategory(t).key === c.key);
    const open = finderOpenCat === c.key;
    return `<div class="fx-cat ${open ? "open" : ""}">
      <button class="fx-cat-btn" onclick="toggleFinderCat('${c.key}')">
        <span class="fx-dot" style="background:${c.color}"></span><span class="flex-1 text-left">${c.icon} ${c.label}</span>
        ${picked.length ? `<span class="fx-count">${picked.length}</span>` : ""}<span class="fx-caret">▾</span>
      </button>
      ${open ? `<div class="fx-menu">
        <input id="fx-q-${c.key}" type="search" value="${escapeHtml(q)}" placeholder="Hanapin…" oninput="renderFinderMenu('${c.key}')" autocomplete="off">
        <div id="fx-list-${c.key}" class="fx-list"></div></div>` : ""}
    </div>`;
  }).join("");
  if (finderOpenCat) renderFinderMenu(finderOpenCat);
}

function renderFinderMenu(key) {
  const q = document.getElementById(`fx-q-${key}`)?.value || "";
  const opts = categoryOptions(finderIndex, key, q).slice(0, 40);
  document.getElementById(`fx-list-${key}`).innerHTML = opts.map((o) => `
    <button class="fx-opt ${finderHave.has(o.token) ? "on" : ""}" data-token="${escapeHtml(o.token)}" onclick="finderToggle(this.dataset.token)">
      <span class="fx-check">${finderHave.has(o.token) ? "✓" : ""}</span><span class="flex-1 text-left">${escapeHtml(o.label)}</span>
      <span class="fx-uses">${o.count == null ? "lahat" : `${o.count} dish${o.count > 1 ? "es" : ""}`}</span>
    </button>`).join("") || `<p class="text-xs text-gray-400 p-2">No match.</p>`;
}

function renderFinder() {
  if (!finderIndex) return;
  renderFinderCats();
  document.getElementById("finder-have").innerHTML = [...finderHave].map((t) =>
    `<li class="fx-have" data-token="${escapeHtml(t)}" onmouseenter="graphFocus('i:' + this.dataset.token)" onmouseleave="graphFocus(null)"><span class="fx-dot" style="background:${ingredientCategory(t).color}"></span><span class="flex-1">${escapeHtml(finderLabel(t))}</span>
      <button onclick="finderRemove(this.parentElement.dataset.token)" aria-label="Remove">✕</button></li>`).join("")
    || `<li class="text-sm text-gray-400">Wala pa. Open a group above and pick what you have.</li>`;

  const recipes = new Map(RECIPES.map((r) => [r.id, r]));
  // The graph looks further down the list for dishes that join several picks.
  const all = matchDishes(finderIndex, finderHave, recipes, { staples: finderStaples, limit: 500 });
  const dishes = all.slice(0, 60);
  const ready = dishes.filter((d) => !d.missing.length).length;
  document.getElementById("finder-count").textContent = dishes.length
    ? `${dishes.length} dish${dishes.length > 1 ? "es" : ""}${ready ? ` · ${ready} you can cook now` : ""}` : "";
  renderGraph(all, recipes);
  document.getElementById("finder-results").innerHTML = dishes.map((d) => {
    const r = recipes.get(d.id);
    const miss = d.missing.length
      ? `<p class="text-xs text-amber-700"><strong>Kulang (${d.missing.length}):</strong> ${d.missing.slice(0, 5).map((m) => escapeHtml(m.label)).join(", ")}${d.missing.length > 5 ? "…" : ""}
         ${d.missingCost > 0 ? ` · ~₱${d.missingCost.toFixed(2)}${d.unpricedMissing ? "+" : ""}/serving to buy` : ""}</p>`
      : `<p class="text-xs font-semibold text-green-700">✓ Kumpleto: you have everything</p>`;
    return `<div class="finder-card" onclick="openModal(${d.id})" onmouseenter="graphFocus('d:${d.id}')" onmouseleave="graphFocus(null)">
      ${r.img ? `<img src="${escapeHtml(r.img)}" alt="" loading="lazy">` : `<div class="plan-noimg">🍽️</div>`}
      <div class="min-w-0 flex flex-col gap-1">
        <p class="font-semibold text-gray-900 leading-snug">${typeof favButton === "function" ? favButton(d.id) : ""} ${escapeHtml(d.title)}</p>
        <p class="text-xs text-gray-500">₱${r.costPerServing}${r.costCoverage < 1 ? "+" : ""}/serving · ${escapeHtml(r.category)} · uses your ${d.used.map(escapeHtml).join(", ")}</p>
        ${miss}
      </div></div>`;
  }).join("") || (finderHave.size ? `<p class="text-sm text-gray-400">No dish uses these yet. Try adding another ingredient.</p>` : "");
}

// ── Rendering: the graph ──

let graphSim = null;
let graphNodes = [];
let graphHighlight = null;

const dishRadius = (n) => (n.complete ? 30 : 24);
const nodeRadius = (n) => (n.kind === "dish" ? dishRadius(n) : n.kind === "ing" ? 15 : 6);
const shortTitle = (t) => { const s = t.replace(/\s+recipe$/i, ""); return s.length > 22 ? `${s.slice(0, 21)}…` : s; };

function renderGraph(dishes, recipes) {
  const el = document.getElementById("finder-graph");
  const empty = document.getElementById("finder-graph-empty");
  empty.classList.toggle("hidden", finderHave.size > 0);
  if (!window.d3) { if (finderHave.size) { empty.textContent = "The graph couldn’t load; the list below still works."; empty.classList.remove("hidden"); } return; }
  const d3 = window.d3;
  const W = el.clientWidth || 600, H = el.clientHeight || 460;
  const svg = d3.select(el).attr("viewBox", [0, 0, W, H]);
  if (svg.select("g.fx-zoom").empty()) {
    svg.append("defs").html(`<clipPath id="fx-clip" clipPathUnits="objectBoundingBox"><circle cx=".5" cy=".5" r=".5"/></clipPath>
      <filter id="fx-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`);
    const zoom = svg.append("g").attr("class", "fx-zoom");
    zoom.append("g").attr("class", "fx-links");
    zoom.append("g").attr("class", "fx-nodes");
    svg.call(d3.zoom().scaleExtent([0.4, 3]).on("zoom", (e) => zoom.attr("transform", e.transform)));
  }

  // Phones: fewer dishes and missing nodes, so the graph stays readable.
  const narrow = W < 640;
  const { nodes, links } = graphData(finderHave, dishes, narrow ? { maxDishes: 8, ghostsPerDish: 1 } : {});
  // Keep where existing nodes are; new ones sprout from a node they link to.
  const old = new Map(graphNodes.map((n) => [n.id, n]));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    const o = old.get(n.id);
    if (o) Object.assign(n, { x: o.x, y: o.y, vx: o.vx, vy: o.vy });
  }
  for (const n of nodes) {
    if (n.x != null) continue;
    const l = links.find((x) => (x.target === n.id && byId.get(x.source)?.x != null) || (x.source === n.id && byId.get(x.target)?.x != null));
    const a = l ? byId.get(l.target === n.id ? l.source : l.target) : null;
    n.x = (a ? a.x : W / 2) + (Math.random() - 0.5) * 60;
    n.y = (a ? a.y : H / 2) + (Math.random() - 0.5) * 60;
  }
  graphNodes = nodes;

  // Anything still fading out from the last change goes now, so quick picks don't leave leftovers.
  svg.selectAll(".fx-exiting").interrupt().remove();
  const link = svg.select("g.fx-links").selectAll("line").data(links, (l) => `${l.source.id ?? l.source}>${l.target.id ?? l.target}`);
  link.exit().classed("fx-exiting", true).transition().duration(250).attr("opacity", 0).remove();
  const linkEnter = link.enter().append("line")
    .attr("class", (l) => `fx-link ${l.kind}`).attr("pathLength", 1)
    .attr("stroke-dasharray", 1).attr("stroke-dashoffset", 1);
  linkEnter.transition().delay(150).duration(800).attr("stroke-dashoffset", 0)
    .on("end", function () { d3.select(this).attr("stroke-dasharray", null).attr("pathLength", null); });
  const linkAll = linkEnter.merge(link);

  const node = svg.select("g.fx-nodes").selectAll("g.fx-node").data(nodes, (n) => n.id);
  const gone = node.exit().classed("fx-exiting", true);
  gone.select(".fx-pop").transition().duration(250).attr("transform", "scale(0)");
  gone.transition().duration(260).remove();
  const enter = node.enter().append("g").attr("class", (n) => `fx-node ${n.kind}`)
    .on("mouseenter", (e, n) => graphFocus(n.id)).on("mouseleave", () => graphFocus(null))
    .on("click", (e, n) => { if (n.kind === "dish") openModal(n.dishId); });
  const pop = enter.append("g").attr("class", "fx-pop").attr("transform", "scale(0)");
  pop.transition().delay((n, i) => (n.kind === "ing" ? 0 : 150 + i * 30)).duration(550).ease(d3.easeBackOut).attr("transform", "scale(1)");

  pop.filter((n) => n.kind === "ing").each(function (n) {
    const g = d3.select(this), c = ingredientCategory(n.token);
    g.append("circle").attr("r", 15).attr("fill", c.color).attr("filter", "url(#fx-glow)");
    g.append("text").attr("class", "fx-icon").attr("text-anchor", "middle").attr("dy", "0.35em").text(c.icon);
    g.append("text").attr("class", "fx-label ing").attr("text-anchor", "middle").attr("y", 30).text(finderLabel(n.token));
  });
  pop.filter((n) => n.kind === "dish").each(function (n) {
    const g = d3.select(this), r = recipes.get(n.dishId), rad = dishRadius(n);
    g.append("circle").attr("class", `fx-ring ${n.complete ? "complete" : "partial"}`).attr("r", rad + 3);
    if (r && r.img) g.append("image").attr("href", r.img).attr("x", -rad).attr("y", -rad).attr("width", rad * 2).attr("height", rad * 2)
      .attr("preserveAspectRatio", "xMidYMid slice").attr("clip-path", "url(#fx-clip)");
    else g.append("text").attr("text-anchor", "middle").attr("dy", "0.35em").attr("font-size", 22).text("🍽️");
    g.append("text").attr("class", "fx-label dish").attr("text-anchor", "middle").attr("y", rad + 16).text(shortTitle(r ? r.title : ""));
    if (!n.complete) g.append("text").attr("class", "fx-badge").attr("text-anchor", "middle").attr("x", rad * 0.8).attr("y", -rad * 0.7).text(`−${n.missing}`);
  });
  pop.filter((n) => n.kind === "missing").each(function (n) {
    const g = d3.select(this);
    g.append("circle").attr("r", 6).attr("class", "fx-ghost");
    g.append("text").attr("class", "fx-label ghost").attr("text-anchor", "middle").attr("y", 17).text(n.label);
  });
  enter.call(d3.drag()
    .on("start", (e, n) => { if (!e.active) graphSim.alphaTarget(0.3).restart(); n.fx = n.x; n.fy = n.y; })
    .on("drag", (e, n) => { n.fx = e.x; n.fy = e.y; })
    .on("end", (e, n) => { if (!e.active) graphSim.alphaTarget(0); n.fx = null; n.fy = null; }));
  const nodeAll = enter.merge(node);

  if (graphSim) graphSim.stop();
  graphSim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((n) => n.id).distance((l) => (l.kind === "missing" ? 60 : narrow ? 95 : 130)).strength((l) => (l.kind === "missing" ? 0.5 : 0.3)))
    .force("charge", d3.forceManyBody().strength((n) => (n.kind === "missing" ? -80 : narrow ? -260 : -420)))
    .force("x", d3.forceX(W / 2).strength(0.05)).force("y", d3.forceY(H / 2).strength(0.07))
    .force("collide", d3.forceCollide((n) => nodeRadius(n) + (n.kind === "missing" ? 10 : 22)))
    .alpha(old.size ? 0.6 : 1)
    .on("tick", () => {
      for (const n of nodes) { n.x = Math.max(24, Math.min(W - 24, n.x)); n.y = Math.max(24, Math.min(H - 34, n.y)); }
      linkAll.attr("x1", (l) => l.source.x).attr("y1", (l) => l.source.y).attr("x2", (l) => l.target.x).attr("y2", (l) => l.target.y);
      nodeAll.attr("transform", (n) => `translate(${n.x},${n.y})`);
    });
  graphFocus(graphHighlight);
}

/** Obsidian-style hover: light up a node and its neighbours, fade the rest. */
function graphFocus(id) {
  graphHighlight = id;
  if (!window.d3) return;
  const svg = window.d3.select("#finder-graph");
  if (!id) { svg.classed("fx-focus", false); svg.selectAll(".lit").classed("lit", false); return; }
  const near = new Set([id]);
  svg.selectAll("line.fx-link").each((l) => {
    const s = l.source.id ?? l.source, t = l.target.id ?? l.target;
    if (s === id) near.add(t);
    if (t === id) near.add(s);
  });
  svg.classed("fx-focus", true);
  svg.selectAll("g.fx-node").classed("lit", (n) => near.has(n.id));
  svg.selectAll("line.fx-link").classed("lit", (l) => (l.source.id ?? l.source) === id || (l.target.id ?? l.target) === id);
}
