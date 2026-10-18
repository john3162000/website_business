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
  return { weights: w.slice(0, d), bias: w[d], seen, answers: rows.length };
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
function recommendDishes(model, recipes, rated, n = 6, vec = tasteVector) {
  const maxValue = Math.max(1, ...recipes.map((r) => r.valueScore || 0));
  const seen = new Set();
  return recipes
    .filter((r) => r.img && r.costPerServing > 0 && !(String(r.id) in rated) && r.category !== "Sauce & Condiment" && r.category !== "Dessert")
    .map((r) => {
      const x = vec(r);
      return { r, x, score: tasteScore(model, x) + 0.25 * ((r.valueScore || 0) / maxValue) };
    })
    .sort((a, b) => b.score - a.score)
    .filter(({ r }) => { const t = r.title.toLowerCase(); if (seen.has(t)) return false; seen.add(t); return true; })
    .slice(0, n);
}
