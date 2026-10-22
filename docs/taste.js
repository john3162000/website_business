// Panlasa (taste) model, level 1: everything runs on this device.
// Each dish gets taste tags from its title and ingredients (maasim, gata,
// sabaw, ...). The player's ratings (1-10) and Versus picks train a small
// ridge regression over those tags; the weights become the "Panlasa mo"
// profile and rank the "Para sa'yo" picks. No data leaves the phone.

// Tag order matters only for display.
const TASTE_TAGS = [
  { key: "maasim", label: "Maasim", icon: "🍋" },
  { key: "kamatis", label: "Tomato-based", icon: "🍅" },
  { key: "gata", label: "May gata", icon: "🥥" },
  { key: "sabaw", label: "Sabaw", icon: "🍲" },
  { key: "saucy", label: "Malapot na sarsa", icon: "🥘" },
  { key: "prito", label: "Prito", icon: "🍳" },
  { key: "maanghang", label: "Maanghang", icon: "🌶️" },
  { key: "matamis", label: "Matamis", icon: "🍬" },
  { key: "baboy", label: "Baboy", icon: "🐖" },
  { key: "manok", label: "Manok", icon: "🐔" },
  { key: "baka", label: "Baka", icon: "🐄" },
  { key: "isda", label: "Isda at seafood", icon: "🐟" },
  { key: "gulay", label: "Gulay", icon: "🥬" },
];

const TASTE_MIN_ANSWERS = 5;   // ratings + Versus picks before showing a profile
const TASTE_RIDGE = 1.5;       // pulls weak evidence toward "no preference"
const TASTE_SHOW = 0.12;       // smallest weight worth saying out loud

const TASTE_RE = {
  sour: /sampalok|tamarind|kamias|bilimbi|vinegar|suka\b|calamansi|kalamansi|sinigang mix|batwan|santol|guava|bayabas|lemon|lime/,
  sourTitle: /sinigang|paksiw|kinilaw|adobo|escabeche|sinampalukan/,
  tomato: /tomato (sauce|paste|puree)|crushed tomato|canned tomato|diced tomatoes in|marinara/,
  tomatoTitle: /menudo|afritada|kaldereta|caldereta|mechado|sarsiado|pochero|spaghetti|embutido|morcon/,
  coconut: /coconut (milk|cream)|gata\b|kakang gata/,
  coconutTitle: /ginataang|ginataan|laing|bicol express|sa gata/,
  soupTitle: /sinigang|tinola|nilaga|bulalo|sopas|batchoy|mami\b|lomi|soup|sabaw|pesa|molo|arroz caldo|lugaw|goto|pancit (molo|lomi)/,
  saucyTitle: /adobo|kaldereta|caldereta|menudo|afritada|mechado|kare.?kare|curry|estofado|humba|pochero|stew|braised|guisado|gisado|sarsiado|bistek|asado|binagoongan|dinuguan|bicol express|laing/,
  friedTitle: /fried|prito|crispy|lechon kawali|chicharon|tortang|torta\b|tempura|nuggets|lumpia|calamares|tokwa.?t baboy|pritong/,
  spicy: /chili|chilli|sili\b|siling|labuyo|jalape|cayenne|sriracha|chili flakes/,
  spicyTitle: /spicy|bicol express|maanghang|sisig/,
  sweet: /condensed milk|banana ketchup|pineapple|honey|brown sugar|muscovado|panutsa|molasses/,
  sweetTitle: /sweet|tocino|humba|hamonado|pineapple|leche|halo.?halo|turon|bibingka|biko|suman|cake|cookie|flan|maja|kutsinta|puto|champorado|ginataang bilo|polvoron|pastillas|minatamis/,
  pork: /pork|baboy|liempo|pata\b|bacon|ham\b|chorizo|longganisa|lechon|chicharon|sisig|tocino/,
  chicken: /chicken|manok/,
  beef: /beef|baka|bulalo|oxtail|tapa\b|corned/,
};

// ── Pure helpers ──

/** Taste tags of one recipe as a 0/1 vector in TASTE_TAGS order. */
function tasteVector(r) {
  const title = (r.title || "").toLowerCase();
  const ings = (r.ingredientNames || []).join(" | ").toLowerCase();
  const kind = typeof proteinKind === "function" ? proteinKind(r) : null;
  const soup = r.category === "Soup" || TASTE_RE.soupTitle.test(title);
  const tags = {
    maasim: TASTE_RE.sour.test(ings) || TASTE_RE.sourTitle.test(title),
    kamatis: TASTE_RE.tomato.test(ings) || TASTE_RE.tomatoTitle.test(title),
    gata: TASTE_RE.coconut.test(ings) || TASTE_RE.coconutTitle.test(title),
    sabaw: soup,
    saucy: !soup && TASTE_RE.saucyTitle.test(title),
    prito: !!r.frying || TASTE_RE.friedTitle.test(title),
    maanghang: TASTE_RE.spicy.test(ings) || TASTE_RE.spicyTitle.test(title),
    matamis: r.category === "Dessert" || TASTE_RE.sweet.test(ings) || TASTE_RE.sweetTitle.test(title),
    baboy: TASTE_RE.pork.test(title) || (kind !== "isda" && kind !== "gulay" && TASTE_RE.pork.test(ings)),
    manok: TASTE_RE.chicken.test(title) || (kind !== "isda" && kind !== "gulay" && TASTE_RE.chicken.test(ings) && !TASTE_RE.pork.test(title) && !TASTE_RE.beef.test(title)),
    baka: TASTE_RE.beef.test(title) || (kind !== "isda" && kind !== "gulay" && TASTE_RE.beef.test(ings) && !TASTE_RE.pork.test(title)),
    isda: kind === "isda",
    gulay: kind === "gulay",
  };
  return TASTE_TAGS.map((t) => (tags[t.key] ? 1 : 0));
}

/** Solves A x = b (A square) by Gaussian elimination with partial pivoting. */
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const piv = M[c][c] || 1e-9;
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / piv;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / (M[r][r] || 1e-9);
  }
  return x;
}

/**
 * Learns one weight per tag from ratings ([{ x, rating }]) and Versus picks
 * ([{ win: x, lose: x }]). A rating row says "dishes like this score this
 * much"; a pick row says "the winner's tags beat the loser's". Ridge keeps
 * tags with little evidence near zero.
 */
function learnTaste(ratings, picks, ridge = TASTE_RIDGE) {
  const d = TASTE_TAGS.length;
  const rows = [];
  for (const { x, rating } of ratings) rows.push({ x: [...x, 1], y: (rating - 5.5) / 4.5 });
  for (const { win, lose } of picks) rows.push({ x: [...win.map((v, i) => v - lose[i]), 0], y: 0.5 });
  const n = d + 1;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const b = new Array(n).fill(0);
  const seen = new Array(d).fill(0);
  for (const { x, y } of rows) {
    for (let i = 0; i < n; i++) {
      b[i] += x[i] * y;
      for (let j = 0; j < n; j++) A[i][j] += x[i] * x[j];
    }
    for (let i = 0; i < d; i++) if (x[i] !== 0) seen[i]++;
  }
  for (let i = 0; i < d; i++) A[i][i] += ridge; // the bias (last) is not shrunk
  A[d][d] += 1e-6;
  const w = solveLinear(A, b);
  return { weights: w.slice(0, d), bias: w[d], seen, answers: rows.length, A };
}

/**
 * How unsure the model is about a dish with tags x: the ridge posterior
 * variance x'A⁻¹x (up to the noise scale). High = we've learned little
 * about dishes like this, so rating one teaches the model the most.
 */
function tasteVariance(model, x) {
  const v = [...x, 1];
  const s = solveLinear(model.A, v);
  return v.reduce((sum, vi, i) => sum + vi * s[i], 0);
}

/**
 * Active learning: the next dish to rate. Before a few answers, any dish
 * (random). After that, mostly one of the dishes the model is least sure
 * about, picked at random from the top few so the game stays varied; now
 * and then a fully random dish to keep exploring.
 */
function pickToLearn(model, pool, { rng = Math.random, vec = tasteVector, top = 12, explore = 0.2, warmup = 3 } = {}) {
  if (!pool.length) return { r: null, active: false };
  if (!model || model.answers < warmup || rng() < explore) return { r: pool[Math.floor(rng() * pool.length)], active: false };
  const ranked = pool.map((r) => ({ r, u: tasteVariance(model, vec(r)) })).sort((a, b) => b.u - a.u).slice(0, top);
  return { r: ranked[Math.floor(rng() * ranked.length)].r, active: true };
}

/** Plain-language profile: what they like and what they skip, strongest first. */
function tasteProfile(model, show = TASTE_SHOW) {
  const items = TASTE_TAGS.map((t, i) => ({ ...t, w: model.weights[i], seen: model.seen[i] })).filter((t) => t.seen >= 2);
  const likes = items.filter((t) => t.w >= show).sort((a, b) => b.w - a.w);
  const dislikes = items.filter((t) => t.w <= -show).sort((a, b) => a.w - b.w);
  const names = (xs) => xs.slice(0, 3).map((t) => `${t.label.toLowerCase()} ${t.icon}`);
  const join = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} at ${xs[xs.length - 1]}` : xs[0]);
  const parts = [];
  if (likes.length) parts.push(`Mahilig ka sa ${join(names(likes))}`);
  if (dislikes.length) parts.push(likes.length ? `pero hindi masyado sa ${join(names(dislikes))}` : `Hindi ka masyadong mahilig sa ${join(names(dislikes))}`);
  return { items, likes, dislikes, sentence: parts.length ? `${parts.join(", ")}.` : "" };
}

/** Taste match of a dish for this player (higher = more their style). */
function tasteScore(model, x) {
  return x.reduce((s, v, i) => s + v * model.weights[i], 0);
}

/** Why a dish was picked: the dish's tags this player likes most. */
function tasteReasons(model, x, n = 2) {
  return TASTE_TAGS.map((t, i) => ({ t, w: x[i] ? model.weights[i] : 0 }))
    .filter((e) => e.w >= TASTE_SHOW)
    .sort((a, b) => b.w - a.w)
    .slice(0, n)
    .map((e) => `${e.t.icon} ${e.t.label.toLowerCase()}`);
}

/**
 * "Para sa'yo": unrated dishes ranked by taste match, with a nudge toward
 * dishes that are sulit (good nutrition for the price). One per title.
 */
function recommendDishes(model, recipes, rated, n = 6, vec = tasteVector, kind = null, kindOf = dishKind) {
  const maxValue = Math.max(1, ...recipes.map((r) => r.valueScore || 0));
  const seen = new Set();
  return recipes
    .filter((r) => r.img && r.costPerServing > 0 && !(String(r.id) in rated) && r.category !== "Sauce & Condiment")
    .filter((r) => (kind ? kindOf(r) === kind : r.category !== "Dessert"))
    .map((r) => {
      const x = vec(r);
      return { r, x, score: tasteScore(model, x) + 0.25 * ((r.valueScore || 0) / maxValue) };
    })
    .sort((a, b) => b.score - a.score)
    .filter(({ r }) => { const t = r.title.toLowerCase(); if (seen.has(t)) return false; seen.add(t); return true; })
    .slice(0, n);
}

// ── Using the model across the site (Browse sort, badges, similar dishes) ──

const TASTE_RATE_KEY = "sarapsulit.ratings.v1"; // written by games.js
const TASTE_VS_KEY = "sarapsulit.versus.v1";
const TASTE_MATCH = 0.3; // taste score worth a "bagay sa'yo" badge

const tasteModelCache = new Map();
const tasteVecCache = new Map();
const tasteKindCache = new Map();

/**
 * Ulam and meryenda are learned separately: liking sweet kakanin says
 * nothing about liking sweet ulam. Uses planner.js's meal types; null for
 * dishes that are neither (sauces, sides).
 */
function dishKind(r) {
  if (tasteKindCache.has(r.id)) return tasteKindCache.get(r.id);
  let k = null;
  if (r.category === "Sauce & Condiment") k = null;
  else if (typeof mealTypes !== "function") k = r.category === "Dessert" ? "meryenda" : "ulam";
  else {
    const t = mealTypes(r);
    if (t.has("ulam") && (typeof isMainUlam !== "function" || isMainUlam(r))) k = "ulam";
    else if (t.has("meryenda")) k = "meryenda";
  }
  if (r.id != null) tasteKindCache.set(r.id, k);
  return k;
}

/** Taste vector of a recipe, computed once per page load. */
function tasteVec(r) {
  if (!tasteVecCache.has(r.id)) tasteVecCache.set(r.id, tasteVector(r));
  return tasteVecCache.get(r.id);
}

/**
 * Trains the model from saved ratings ({ id: 1-10 }) and Versus picks ({ key: { w, l } }).
 * With a kind ("ulam" or "meryenda"), only dishes of that kind count.
 */
function tasteModelFrom(recipes, ratings, picks, kind = null, kindOf = dishKind) {
  const byId = new Map(recipes.map((r) => [String(r.id), r]));
  const fits = (id) => byId.has(String(id)) && (!kind || kindOf(byId.get(String(id))) === kind);
  const rows = Object.entries(ratings || {})
    .filter(([id]) => fits(id))
    .map(([id, rating]) => ({ x: tasteVec(byId.get(id)), rating }));
  const pairs = Object.values(picks || {})
    .filter((p) => p && fits(p.w) && byId.has(String(p.l)))
    .map((p) => ({ win: tasteVec(byId.get(String(p.w))), lose: tasteVec(byId.get(String(p.l))) }));
  return learnTaste(rows, pairs);
}

/** This device's taste model for ulam or meryenda, or null until there are enough answers of that kind. */
function currentTasteModel(kind = "ulam") {
  if (!kind) return null;
  if (!tasteModelCache.has(kind)) {
    const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch { return {}; } };
    tasteModelCache.set(kind, tasteModelFrom(typeof RECIPES !== "undefined" ? RECIPES : [], read(TASTE_RATE_KEY), read(TASTE_VS_KEY), kind));
  }
  const m = tasteModelCache.get(kind);
  return m.answers >= TASTE_MIN_ANSWERS ? m : null;
}

/** Call after a new rating or pick so the next use retrains. */
function tasteModelChanged() { tasteModelCache.clear(); }

// Words that say nothing about what a dish is.
const TASTE_STOP = new Set(["cup", "cups", "tablespoon", "tablespoons", "teaspoon", "teaspoons", "pieces", "piece", "chopped", "minced", "sliced", "diced", "crushed", "large", "small", "medium", "fresh", "ground", "whole", "salt", "pepper", "water", "garlic", "onion", "onions", "cooking", "oil", "sugar", "black", "white", "cloves", "into", "with", "and", "taste", "pounds", "pound", "grams", "ounces", "optional", "about", "cut", "thinly", "finely", "leaves"]);

/** The meaningful ingredient words of a recipe (pork, tamarind, kangkong, ...). */
function dishWords(r) {
  const words = new Set();
  for (const name of r.ingredientNames || []) {
    for (const w of name.toLowerCase().split(/[^a-z]+/)) if (w.length >= 4 && !TASTE_STOP.has(w)) words.add(w);
  }
  return words;
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Dishes like this one: same taste tags and shared ingredients, a little
 * nudge for the same category and, when there's a profile, for the player's
 * taste. Skips the dish itself, same-titled copies and dishes without photos.
 */
function similarDishes(r, recipes, n = 4, model = null, vec = tasteVec, words = dishWords) {
  const x = vec(r), w = words(r), title = r.title.trim().toLowerCase();
  const sauce = r.category === "Sauce & Condiment";
  const seen = new Set([title]);
  return recipes
    .filter((o) => o.id !== r.id && o.img && (sauce || o.category !== "Sauce & Condiment"))
    .map((o) => {
      const ox = vec(o);
      const score = 0.55 * cosine(x, ox) + 0.45 * jaccard(w, words(o)) + (o.category === r.category ? 0.08 : 0) + (model ? 0.1 * tasteScore(model, ox) : 0);
      return { r: o, score };
    })
    .sort((a, b) => b.score - a.score)
    .filter(({ r: o }) => { const t = o.title.trim().toLowerCase(); if (seen.has(t)) return false; seen.add(t); return true; })
    .slice(0, n)
    .map((s) => s.r);
}
