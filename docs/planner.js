// Weekly planner: drag dishes into a week of Almusal / Tanghalian / Meryenda /
// Hapunan, and see the week's receipt per dish or per ingredient. Saved on this
// device (localStorage). Uses app.js helpers: API_BASE, RECIPES, escapeHtml,
// openModal. docs/planner.test.mjs tests the pure helpers.

const PLAN_KEY = "sarapsulit.planner.v1";
const DAYS = ["Lunes", "Martes", "Miyerkules", "Huwebes", "Biyernes", "Sabado", "Linggo"];
const MEALS = ["Almusal", "Tanghalian", "Meryenda", "Hapunan"];
const MAX_PER_SLOT = 5;

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

// ── Saved plans and the grocery list ──

const SAVED_PLANS_KEY = "sarapsulit.savedplans.v1";
const MAX_SAVED_PLANS = 8;

/** Adds a named copy of the plan, newest first; the same name replaces the older copy. */
function addSavedPlan(list, name, plan, now = Date.now()) {
  const clean = (name || "").trim() || "Plano";
  const copy = JSON.parse(JSON.stringify(plan));
  return [{ name: clean, savedAt: now, plan: copy }, ...(list || []).filter((p) => p.name !== clean)].slice(0, MAX_SAVED_PLANS);
}

/** The shopping list as plain text, for downloading or sending to Messenger. */
function groceryText(receipt, people, dateLabel) {
  const lines = [`🛒 Grocery list · FARM2FIGURE`, `Para sa ${people} tao · ${dateLabel}`, ""];
  for (const it of receipt.items) {
    const price = it.priced ? ` · ≈₱${Math.round(it.cost).toLocaleString("en-PH")}${it.unpricedGrams > 0 ? "+" : ""}` : "";
    lines.push(`☐ ${it.label}: ${formatGrams(it.grams)}${price}`);
  }
  lines.push("", `Total ≈ ₱${Math.round(receipt.total).toLocaleString("en-PH")}${receipt.unpriced ? ` (+ ${receipt.unpriced} na walang presyo pa)` : ""}`);
  lines.push("Presyo mula sa DA, PSA, SM at DTI · amounts as bought, before cooking");
  return lines.join("\n");
}

// ── Meal types: which slots a dish suits (a dish can suit several) ──

const MERYENDA_TITLE = /\b(turon|banana ?cue|camote ?cue|kamote ?cue|maruya|lumpia|lumpiang|shanghai|okoy|ukoy|fish ?balls?|kwek[- ]?kwek|tokneneng|siomai|siopao|empanadas?|pancit|palabok|puto|kutsinta|bibingka|suman|biko|palitaw|sapin[- ]?sapin|kakanin|maja|cassava cake|bilo[- ]?bilo|ginataang mais|ginataang halo|binignit|halo[- ]?halo|mais con yelo|sago|gulaman|buko pandan|fruit salad|ensaymada|pandesal|pan de sal|sandwich(es)?|burgers?|spaghetti|arroz caldo|lugaw|goto|champorado|cakes?|cupcakes?|cookies|brownies?|leche flan|flan|polvoron|pastillas|turrones|donuts?|doughnuts?|muffins?|bread|banana loaf|hopia|cheese sticks|french fries|nachos|camote fries)\b/i;
const ALMUSAL_TITLE = /(silog\b|\b(tapa|tocino|longg?anisa|daing|tuyo|danggit|champorado|lugaw|arroz caldo|goto|pandesal|pan de sal|omelet(te)?|torta|tortang|scrambled eggs?|sinangag|fried rice|garlic rice|hotcakes?|pancakes?|french toast|corned beef hash)\b)/i;
const SNACK_COURSE = /\b(snacks?|desserts?|appetizers?|merienda|meryenda)\b/i;
const MEAL_COURSE = /\b(main|dinner|lunch|entree|soup|side dish)\b/i;
const SNACK_TITLE = /\b(chips|fries|nachos|popcorn|crackers?|chicharon|chicharron|tokneneng|kwek[- ]?kwek|fish ?balls?|squid ?balls?|kikiam|tornado|corndogs?|deviled eggs?|nuggets?|adobong mani|mani|(?:roasted|boiled|fried|garlic|spicy|salted) peanuts?|kropek|kornik|cornick)\b/i;
const SIDE_TITLE = /\b(pickled?|pickles|atchara|achara|burong|buro|dip|dressing|salsa|jam|syrup|salads?|ensalada|ensaladang|sandwich(es)?|burgers?|egg rolls?|spring rolls?|lettuce wraps?|wraps?|tacos?|quesadillas?|nachos|pandesal|pan de sal|bread|buns?|toasts?|potato wedges|wedges|onion rings|lugaw|arroz caldo|goto|congee|porridge|champorado)\b/i;
// Sweets and kakanin are never an ulam, even when the recipe data calls them a main dish.
const SWEET_TITLE = /\b(mamon|ensaymada|silvanas?|sans rival|food for the gods|minatamis|matamis|pastimallows?|marshmallows?|brazo|pancakes?|hotcakes?|waffles?|french toast|nilupak|pichi[- ]?pichi|puto|kutsinta|bibingka|suman|biko|palitaw|sapin[- ]?sapin|kakanin|maja|cassava cake|bilo[- ]?bilo|ginataang mais|ginataang halo|binignit|halo[- ]?halo|mais con yelo|sago|gulaman|buko pandan|fruit salad|ensaymada|cakes?|cupcakes?|cookies|brownies?|leche flan|flan|polvoron|pastillas|turrones|donuts?|doughnuts?|muffins?|banana loaf|hopia|turon|maruya|banana ?cue|camote ?cue|kamote ?cue|yema|tsokolate|champorado|espasol|tikoy|kalamay|ube halaya|halaya|jelly|gelatin|pudding|ice cream)\b/i;

/**
 * The slot series a dish fits: "almusal", "ulam" (Tanghalian / Hapunan) and/or "meryenda".
 * From the title, the site category and Panlasang Pinoy's course. Sauces fit none.
 */
function mealTypes(recipe) {
  const title = recipe.title || "", course = recipe.course || "", cat = recipe.category || "";
  const out = new Set();
  if (cat === "Sauce & Condiment") return out;
  if (/\bbreakfast\b/i.test(course) || ALMUSAL_TITLE.test(title)) out.add("almusal");
  const sweet = SWEET_TITLE.test(title);
  const snackish = SNACK_TITLE.test(title);
  if (cat === "Dessert" || sweet || snackish || SNACK_COURSE.test(course) || MERYENDA_TITLE.test(title)) out.add("meryenda");
  // Pickles, dips and dressings go with a meal but aren't the ulam; chips and fries are meryenda.
  if (snackish || SIDE_TITLE.test(title)) return out;
  // Anything that is a meal: mains, soups, fish, vegetables, rice and noodles. Not desserts or
  // kakanin, and not dishes whose course is only a snack or appetizer (kwek-kwek, fishballs).
  const snackOnly = SNACK_COURSE.test(course) && !MEAL_COURSE.test(course);
  if (cat !== "Dessert" && !sweet && !snackOnly) out.add("ulam");
  return out;
}

const SERIES = [
  { key: "all", label: "Lahat" },
  { key: "almusal", label: "Almusal" },
  { key: "ulam", label: "Tanghalian / Hapunan" },
  { key: "meryenda", label: "Meryenda" },
  { key: "fav", label: "⭐ Favorites" },
];

/** The series a slot asks for. */
function seriesForMeal(meal) {
  return meal === "Almusal" ? "almusal" : meal === "Meryenda" ? "meryenda" : "ulam";
}

/**
 * A random week: dishes for each meal in `meals`, from `pools` (series → dish ids, best value
 * first): `ulamPerMeal` for Tanghalian and Hapunan, one for Almusal and Meryenda. Picks lean
 * toward the top of the pool, and no dish repeats in the week while the pool lasts. Slots of
 * other meals are left as they are; with `keep`, filled slots too. With `alternate`, ulam take
 * turns gulay → isda → karne from `pools.gulay/isda/karne` (cheapest first, so picks lean cheap).
 */
const KIND_CYCLE = ["gulay", "isda", "karne"];

function randomWeek(plan, pools, { meals = MEALS, keep = false, rng = Math.random, ulamPerMeal = 1, alternate = false } = {}) {
  const slots = { ...plan.slots };
  const fill = [];
  for (const day of DAYS) for (const meal of meals) {
    const key = slotKey(day, meal);
    if (keep && (slots[key] || []).length) continue;
    delete slots[key];
    fill.push({ key, meal });
  }
  const used = new Set(Object.values(slots).flat());
  let turn = 0; // next kind in the gulay → isda → karne cycle
  for (const { key, meal } of fill) {
    const isUlam = seriesForMeal(meal) === "ulam";
    const n = isUlam ? Math.max(1, Math.min(MAX_PER_SLOT, ulamPerMeal)) : 1;
    const picks = [];
    for (let k = 0; k < n; k++) {
      const kind = isUlam && alternate ? KIND_CYCLE[turn++ % KIND_CYCLE.length] : null;
      const pool = (kind && pools[kind] && pools[kind].length ? pools[kind] : pools[seriesForMeal(meal)]) || [];
      if (!pool.length) continue;
      const fresh = pool.filter((id) => !used.has(id) && !picks.includes(id));
      const left = fresh.length ? fresh : pool.filter((id) => !picks.includes(id));
      // Gulay / isda / karne turns: only among the 12 cheapest still unused ("pinakamura muna").
      const from = kind ? left.slice(0, 12) : left;
      if (!from.length) break;
      // rng² leans toward the start of the list (the better-value dishes).
      const id = from[Math.min(from.length - 1, Math.floor(rng() ** 2 * from.length))];
      used.add(id);
      picks.push(id);
    }
    if (picks.length) slots[key] = picks;
  }
  return { ...plan, slots };
}

/**
 * Reads "₱1,500 for the week, 4 people" (or "1500 pesos 4 tao", "budget 2k for 5"):
 * { budget, people }, either null when not given. The first money-like number is the
 * budget; a number before people/persons/tao/katao (or after "for") is the household.
 */
function parseBudgetText(text) {
  const t = String(text || "").toLowerCase().replace(/,(?=\d{3})/g, "");
  let people = null;
  const pm = t.match(/(\d+)\s*(?:people|persons?|pax|tao|katao|members?)/) || t.match(/\bfor\s+(\d+)\b(?!\s*(?:days?|weeks?))/);
  if (pm) people = Number(pm[1]);
  const rest = pm ? t.replace(pm[0], " ") : t;
  const bm = rest.match(/(?:₱|php|p)?\s*(\d+(?:\.\d+)?)\s*(k)?/);
  const budget = bm ? Number(bm[1]) * (bm[2] ? 1000 : 1) : null;
  return {
    budget: budget && budget >= 50 ? budget : null,
    people: people && people >= 1 && people <= 30 ? people : null,
  };
}

/**
 * A week that fits `budget` (₱, for `people`), most nutritious first. Slot by slot, each takes
 * the dish with the best nutrition score whose cost fits what is left per remaining dish;
 * when nothing fits, the cheapest. `recipes` maps id → { costPerServing, nutritionScore,
 * valueScore }; `pools` maps series → ids. Only Tanghalian/Hapunan get `ulamPerMeal` dishes.
 * Returns { plan, total, fits }.
 */
function budgetWeek(pools, recipes, { budget, people, meals = MEALS, ulamPerMeal = 1 }) {
  const want = [];
  for (const day of DAYS) for (const meal of meals) {
    const n = seriesForMeal(meal) === "ulam" ? Math.max(1, Math.min(MAX_PER_SLOT, ulamPerMeal)) : 1;
    for (let k = 0; k < n; k++) want.push({ key: slotKey(day, meal), series: seriesForMeal(meal) });
  }
  const cost = (id) => recipes.get(id).costPerServing * people;
  const better = (a, b) => recipes.get(b).nutritionScore - recipes.get(a).nutritionScore || recipes.get(b).valueScore - recipes.get(a).valueScore;
  const slots = {};
  const used = new Set();
  let left = budget;
  want.forEach(({ key, series }, i) => {
    const pool = (pools[series] || []).filter((id) => recipes.has(id) && !(slots[key] || []).includes(id));
    if (!pool.length) return;
    const fresh = pool.filter((id) => !used.has(id));
    const from = fresh.length ? fresh : pool;
    const cap = left / (want.length - i);
    const fitting = from.filter((id) => cost(id) <= cap).sort(better);
    const id = fitting[0] ?? [...from].sort((a, b) => cost(a) - cost(b))[0];
    used.add(id);
    slots[key] = [...(slots[key] || []), id];
    left -= cost(id);
  });
  const total = budget - left;
  return { plan: { people, slots }, total, fits: total <= budget + 0.005 };
}

const MAIN_CATEGORIES = new Set(["Main Dish", "Soup", "Fish & Seafood", "Vegetable Dish"]);
const TECHNIQUE_TITLE = /\b(how to (make|cook|boil|poach|fry)|perfect|basic|homemade)\b.*\b(eggs?|rice|stock|broth)\b|\brice$/i;

/**
 * A main ulam for the randomizer and the budget planner: a main dish, soup, fish or vegetable
 * dish with at least 8 g protein per serving, not a side of rice or a how-to for eggs or stock.
 */
function isMainUlam(r) {
  return MAIN_CATEGORIES.has(r.category) && (r.protein ?? 0) >= 8 && !TECHNIQUE_TITLE.test(r.title || "");
}

// ── Gulay, isda or karne ──

const FISH_WORDS = /\b(fish|isda|bangus|milkfish|tilapia|galunggong|tuna|salmon|sardin\w*|dilis|tuyo|daing|danggit|tinapa|hipon|shrimps?|prawns?|sugpo|pusit|squid|calamares|alimasag|crabs?|alimango|tahong|mussels?|halaan|clams?|talaba|oysters?|lapu[- ]?lapu|tanigue|maya[- ]?maya|mackerel|alumahan|hito|dalag|bakalaw|cod|seafood|octopus|pugita|scallops?|lobsters?)\b/i;
const MEAT_WORDS = /\b(pork|baboy|liempo|pata|beef|baka|bulalo|chicken|manok|turkey|duck|pato|goat|kambing|lamb|carabeef|liver|atay|isaw|tripe|tuwalya|lengua|tongue|oxtail|giniling|hotdogs?|longg?anisa|tocino|tapa|ham|bacon|sausages?|corned beef|chorizo|meatballs?|bola[- ]?bola|lechon|sisig|dinuguan|menudo|kaldereta|caldereta|mechado|afritada|embutido|steak|spam|luncheon meat)\b/i;

const GULAY_WORDS = /\b(gulay|vegetables?|veggies?|monggo|munggo|mung ?beans?|pinakbet|pakbet|laing|chop ?suey|tofu|tokwa|talong|eggplant|ampalaya|bitter ?(gourd|melon)|sitaw|string beans|kalabasa|squash|upo|bottle gourd|sayote|chayote|kangkong|pechay|bok ?choy|repolyo|cabbage|togue|bean sprouts|malunggay|okra|gabi|taro|langka|jackfruit|puso ng saging|banana blossom|bataw|patani|sigarilyas|labong|bamboo shoots?|broccoli|cauliflower|mushrooms?|kabute|alugbati|saluyot|dahon|camote tops|talbos|munggo)\b/i;
const CONDIMENT_WORDS = /\b(fish|oyster|shrimp|anchovy|crab) (sauce|paste|cubes?|bouillon|powder)\b|\bpatis\b|\bbagoong\w*|\balamang\b|\bdried shrimps?\b|\bknorr\b[^|]*/gi;

/**
 * What kind of ulam a dish is: "gulay", "isda" or "karne". Vegetable and fish categories win,
 * then the title, then the ingredients (pinakbet with a little pork is still gulay).
 */
function proteinKind(r) {
  const title = r.title || "";
  const veg = GULAY_WORDS.test(title);
  // Fish or meat named in the title wins (Ginisang Sardinas), unless a vegetable is named too.
  if (!veg && (r.category === "Fish & Seafood" || FISH_WORDS.test(title))) return "isda";
  if (!veg && MEAT_WORDS.test(title)) return "karne";
  if (r.category === "Vegetable Dish" || veg) return "gulay";
  if (r.category === "Fish & Seafood") return "isda";
  // Condiments made from fish or shrimp (patis, bagoong) don't make a dish an isda ulam.
  const ings = (r.ingredientNames || []).join(" | ").replace(CONDIMENT_WORDS, " ");
  if (FISH_WORDS.test(ings)) return "isda";
  if (MEAT_WORDS.test(ings)) return "karne";
  // Gulay has to look like a vegetable dish; anything else (breads, snacks, egg dishes) is "other".
  return GULAY_WORDS.test(title) ? "gulay" : "other";
}

/** The cheapest dishes of each kind today (complete prices only): { gulay, isda, karne } → recipes. */
function cheapestByKind(recipes, n = 3, ok = () => true) {
  const out = { gulay: [], isda: [], karne: [] };
  const seen = new Set();
  const pool = recipes.filter((r) => r.ranked && !r.costIncomplete && r.costPerServing > 0 && isMainUlam(r) && mealTypes(r).has("ulam") && ok(r))
    .sort((a, b) => a.costPerServing - b.costPerServing);
  for (const r of pool) {
    const t = r.title.trim().toLowerCase();
    if (seen.has(t)) continue;
    seen.add(t);
    const k = proteinKind(r);
    if (out[k] && out[k].length < n) out[k].push(r);
  }
  return out;
}

// ── Diet filters (general guidance, not medical advice) ──

const DIETS = [
  { key: "all", label: "Lahat", note: "" },
  { key: "protein", label: "High protein", note: "25 g protein pataas bawat serving." },
  { key: "diabetic", label: "Diabetic", note: "45 g carbs pababa, walang matamis, walang kanin o pancit na ulam." },
  { key: "heart", label: "Heart / altapresyon", note: "600 mg sodium pababa, 20 g fat pababa, hindi prito, walang lechon, processed o lamang-loob." },
  { key: "kidney", label: "Kidney", note: "500 mg sodium pababa, 20 g protein pababa, walang processed o lamang-loob." },
  { key: "gout", label: "Gout / uric acid", note: "Walang lamang-loob, shellfish, sardinas, dilis o tuyo." },
  { key: "lowcal", label: "Low calorie", note: "450 kcal pababa bawat serving." },
];
const PROCESSED_WORDS = /\b(hotdogs?|longg?anisa|tocino|ham|bacon|sausages?|corned beef|spam|luncheon|chorizo|tapa|tuyo|daing|danggit|tinapa|instant|cup noodles?|franks?)\b/i;
const ORGAN_WORDS = /\b(liver|atay|isaw|bituka|intestines?|tripe|tuwalya|gizzards?|balunbalunan|dinuguan|blood|kidneys?|lengua|tongue|bopis|sisig|papaitan|brains?|chicharon bulaklak)\b/i;
const FATTY_WORDS = /\b(lechon|chicharon|chicharron|crispy|bagnet|liempo|pata|kawali|fried|prito|pritong|deep[- ]fried|carbonara|creamy)\b/i;
const SHELL_WORDS = /\b(shrimps?|hipon|sugpo|prawns?|crabs?|alimasag|alimango|tahong|mussels?|halaan|clams?|talaba|oysters?|scallops?|lobsters?|squid|pusit|sardin\w*|dilis|anchov\w*|tuyo|tinapa)\b/i;

/**
 * Whether a dish suits a diet (see DIETS). Number rules need trustworthy nutrition (80% of the
 * weight matched); an unknown sodium fails the sodium rules rather than passing them.
 */
function dietOk(r, diet) {
  if (!diet || diet === "all") return true;
  const n = r.nutrition || {};
  const known = (r.nutritionCoverage ?? 0) >= 0.8;
  const title = r.title || "";
  const words = `${title} | ${(r.ingredientNames || []).join(" | ")}`;
  switch (diet) {
    case "protein": return known && (r.protein ?? 0) >= 25;
    case "diabetic": return known && (n.carbs ?? 99) <= 45 && r.category !== "Dessert" && r.category !== "Rice & Noodles" && !SWEET_TITLE.test(title);
    case "heart": return known && r.sodium != null && r.sodium <= 600 && (n.fat ?? 99) <= 20 && !r.frying
      && !FATTY_WORDS.test(title) && !PROCESSED_WORDS.test(words) && !ORGAN_WORDS.test(title);
    case "kidney": return known && r.sodium != null && r.sodium <= 500 && (r.protein ?? 99) <= 20 && !PROCESSED_WORDS.test(words) && !ORGAN_WORDS.test(words);
    case "gout": return !ORGAN_WORDS.test(words) && !SHELL_WORDS.test(words);
    case "lowcal": return known && r.calories > 0 && r.calories <= 450;
    default: return true;
  }
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
  renderSavedPlans();
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
  const favs = typeof favIds === "function" ? favIds() : new Set();
  const inSeries = (r) => series === "all" || (series === "fav" ? favs.has(r.id) : types.get(r.id).has(series));
  // Sauces and condiments fit no meal slot: not offered. The diet filter applies here too.
  const pool = RECIPES.filter((r) => r.costPerServing > 0 && types.get(r.id).size > 0 && dietOk(r, activeDiet) && plannerKitchenOk(r));
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
      <p class="plan-dish-sub">${favs.has(r.id) ? "⭐ " : ""}₱${r.costPerServing}${r.costCoverage < 1 ? "+" : ""}/serving · ${r.category}
        ${series !== "meryenda" && types.get(r.id).has("meryenda") ? `<span class="plan-badge">Meryenda</span>` : ""}</p></div>
    </div>`).join("") || `<p class="text-sm text-gray-400 p-2">${series === "fav"
      ? "Wala pang favorites. I-tap ang ☆ sa recipe, sa DA Prices o sa “Anong lulutuin?”."
      : "No matching dishes."}</p>`;
  renderCheapest();
}

// ── Diet, randomizer style, and the cheapest dishes today ──

let activeDiet = "all";
let randomStyle = "mix"; // "mix": best value; "alternate": gulay → isda → karne, cheapest first

function setDiet(key) {
  activeDiet = key;
  document.querySelectorAll("[data-diet]").forEach((b) => b.classList.toggle("on", b.dataset.diet === key));
  const d = DIETS.find((x) => x.key === key);
  document.getElementById("diet-note").textContent = d && d.note
    ? `${d.label}: ${d.note} Gabay lang ito; sundin pa rin ang payo ng doktor o dietitian.`
    : "";
  renderPicker();
}

function setRandomStyle(v) {
  randomStyle = v;
  document.querySelectorAll("[data-style]").forEach((b) => b.classList.toggle("on", b.dataset.style === v));
}

const KIND_LABEL = { gulay: "🥬 Gulay", isda: "🐟 Isda", karne: "🥩 Karne" };

function renderCheapest() {
  const box = document.getElementById("plan-cheapest");
  if (!box) return;
  const c = cheapestByKind(RECIPES, 3, (r) => dietOk(r, activeDiet));
  box.innerHTML = Object.entries(c).map(([k, list]) => `
    <div class="min-w-0">
      <p class="text-xs font-bold text-gray-500 mb-1">${KIND_LABEL[k]}</p>
      ${list.map((r) => `<button class="cheap-row" draggable="true" ondragstart="event.dataTransfer.setData('text/plain','${r.id}')" onclick="pickDish(${r.id})" title="Tap, then tap a slot (or drag)">
        <span class="truncate">${escapeHtml(r.title.replace(/ Recipe$/i, ""))}</span><b>₱${r.costPerServing}</b></button>`).join("")
        || `<p class="text-xs text-gray-400">Wala sa diet na ito.</p>`}
    </div>`).join("");
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

let randomMeals = "ulam"; // "ulam": Tanghalian and Hapunan only; "all": every meal
let ulamPerMeal = 1;

function setUlamPerMeal(n) {
  ulamPerMeal = n;
  document.querySelectorAll("[data-ulam-n]").forEach((b) => b.classList.toggle("on", Number(b.dataset.ulamN) === n));
}

function setRandomMeals(v) {
  randomMeals = v;
  document.querySelectorAll("[data-random]").forEach((b) => b.classList.toggle("on", b.dataset.random === v));
}

/**
 * Dish ids per series for the randomizer, within the chosen diet: value-ranked first, one per
 * title (reposts share a title). Also gulay / isda / karne ulam pools, cheapest first.
 */
/** The kitchen filter (kitchen.js), when it's loaded: dishes needing appliances you don't have are left out. */
function plannerKitchenOk(r) {
  return typeof kitchenOk !== "function" || kitchenOk(r);
}

function randomPools() {
  const pools = {};
  const onePerTitle = () => { const seen = new Set(); return (r) => { const t = r.title.trim().toLowerCase(); if (seen.has(t)) return false; seen.add(t); return true; }; };
  const fits = RECIPES.filter((r) => r.costPerServing > 0 && dietOk(r, activeDiet) && plannerKitchenOk(r));
  for (const s of ["almusal", "ulam", "meryenda"]) {
    pools[s] = fits
      .filter((r) => mealTypes(r).has(s) && (s !== "ulam" || isMainUlam(r)))
      .sort((a, b) => (b.ranked - a.ranked) || (b.valueScore - a.valueScore))
      .filter(onePerTitle())
      .map((r) => r.id);
  }
  // Today's prices: the cheapest complete-price ulam of each kind come first.
  const ulam = fits.filter((r) => mealTypes(r).has("ulam") && isMainUlam(r) && r.ranked && !r.costIncomplete)
    .sort((a, b) => a.costPerServing - b.costPerServing);
  for (const k of KIND_CYCLE) pools[k] = ulam.filter((r) => proteinKind(r) === k).filter(onePerTitle()).map((r) => r.id);
  return pools;
}

function randomizeWeek() {
  const meals = randomMeals === "ulam" ? ["Tanghalian", "Hapunan"] : MEALS;
  const keep = document.getElementById("plan-keep").checked;
  plan = randomWeek(plan, randomPools(), { meals, keep, ulamPerMeal, alternate: randomStyle === "alternate" });
  persist(); renderGrid(); renderReceipt();
}

/** The budget box: parse it, fill the week within budget, and say how it went. */
function planOnBudget() {
  const out = document.getElementById("budget-result");
  const { budget, people } = parseBudgetText(document.getElementById("budget-text").value);
  if (!budget) { out.textContent = "Type a budget, for example “₱1,500 for the week, 4 people”."; out.className = "text-xs text-red-600"; return; }
  if (typeof trackEvent === "function") trackEvent("budget-plan");
  const n = people ?? plan.people;
  const meals = randomMeals === "ulam" ? ["Tanghalian", "Hapunan"] : MEALS;
  // Only dishes with a complete, ranked price, so the total can be trusted.
  const recipes = new Map(RECIPES.filter((r) => r.ranked && !r.costIncomplete && r.costPerServing > 0).map((r) => [r.id, r]));
  const pools = randomPools();
  for (const k of Object.keys(pools)) pools[k] = pools[k].filter((id) => recipes.has(id));
  const r = budgetWeek(pools, recipes, { budget, people: n, meals, ulamPerMeal });
  plan = { ...plan, people: n, slots: r.plan.slots };
  document.getElementById("plan-people").value = n;
  persist(); renderGrid(); renderReceipt();
  const peso = (v) => `₱${Math.round(v).toLocaleString()}`;
  out.className = r.fits ? "text-xs text-green-700" : "text-xs text-amber-700";
  out.textContent = r.fits
    ? `Planned ${peso(r.total)} of ${peso(budget)} for ${n} ${n === 1 ? "person" : "people"}: most nutritious dishes that fit.`
    : `The cheapest week still costs ${peso(r.total)}, over ${peso(budget)}. Try “Ulam lang”, 1 ulam per meal, or a bigger budget.`;
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
  const missing = await loadPlanDetails((n) => { out.innerHTML = `<p class="text-sm text-gray-400">Adding up ingredients for ${n} dish${n > 1 ? "es" : ""}…</p>`; });
  if (missing && receiptMode !== "ingredient") return;
  const r = receiptByIngredient(plan, detailCache);
  out.innerHTML = r.items.map((it) => `
    <div class="rc-row"><span class="rc-name">${escapeHtml(it.label)} <span class="rc-qty">${formatGrams(it.grams)}${it.dishes > 1 ? ` · ${it.dishes} dishes` : ""}</span></span>
    <span>${it.priced ? peso(it.cost) + (it.unpricedGrams > 0 ? "+" : "") : "—"}</span></div>`).join("")
    + receiptFooter(r.total, r.unpriced ? `${r.unpriced} ingredient${r.unpriced > 1 ? "s" : ""} without a price (—)` : "", 0);
}

/** Fetches the ingredient lines of planned dishes not seen yet; returns how many were fetched. */
async function loadPlanDetails(onStart) {
  const missing = [...new Set(plannedDishes(plan).map((d) => d.id))].filter((id) => !detailCache.has(id));
  if (!missing.length) return 0;
  if (onStart) onStart(missing.length);
  await Promise.all(missing.map(async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/recipes/compiled?id=${id}`);
      const j = await res.json();
      if (j.recipe) detailCache.set(id, { servings: j.recipe.servings, lines: j.recipe.lines });
    } catch { /* left out of the total */ }
  }));
  return missing.length;
}

function plannerNote(text, ok = true) {
  const el = document.getElementById("plan-save-note");
  if (!el) return;
  el.textContent = text;
  el.className = `text-xs ${ok ? "text-green-700" : "text-red-600"}`;
}

function readSavedPlans() {
  try { return JSON.parse(plannerStore()?.getItem(SAVED_PLANS_KEY) || "[]") || []; } catch { return []; }
}

function saveNamedPlan() {
  if (!plannedDishes(plan).length) { plannerNote("Wala pang ulam sa plano.", false); return; }
  const d = new Date();
  const suggested = `Linggo ng ${d.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`;
  const name = typeof prompt === "function" ? prompt("Pangalan ng plano:", suggested) : suggested;
  if (name === null) return;
  try {
    plannerStore().setItem(SAVED_PLANS_KEY, JSON.stringify(addSavedPlan(readSavedPlans(), name, plan)));
    plannerNote(`Na-save sa device na 'to ✓ (“${(name || "").trim() || "Plano"}”)`);
  } catch { plannerNote("Hindi ma-save: naka-block ang storage ng browser.", false); }
  renderSavedPlans();
}

function renderSavedPlans() {
  const box = document.getElementById("plan-saved");
  if (!box) return;
  const list = readSavedPlans();
  box.innerHTML = list.length ? `<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Mga na-save</p>` + list.map((p, i) => `
    <div class="flex items-center justify-between gap-2 text-sm">
      <span class="truncate">${escapeHtml(p.name)} <span class="text-xs text-gray-400">· ${plannedDishes(p.plan).length} ulam</span></span>
      <span class="shrink-0"><button onclick="loadSavedPlan(${i})" class="text-green-800 font-semibold hover:underline">Buksan</button>
      <button onclick="deleteSavedPlan(${i})" class="text-gray-400 hover:text-red-600 ml-2" aria-label="Delete">✕</button></span>
    </div>`).join("") : "";
}

function loadSavedPlan(i) {
  const p = readSavedPlans()[i];
  if (!p) return;
  plan = { ...emptyPlan(), ...JSON.parse(JSON.stringify(p.plan)) };
  document.getElementById("plan-people").value = plan.people;
  persist(); renderGrid(); renderReceipt();
  plannerNote(`Binuksan: “${p.name}”`);
}

function deleteSavedPlan(i) {
  const list = readSavedPlans();
  list.splice(i, 1);
  try { plannerStore().setItem(SAVED_PLANS_KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
  renderSavedPlans();
}

/** Builds the grocery list text for the current plan (fetching ingredient lines first). */
/** The current plan's grocery receipt (fetching ingredient lines first), or null when the week is empty. */
async function currentGrocery() {
  if (!plannedDishes(plan).length) { plannerNote("Wala pang ulam sa plano.", false); return null; }
  await loadPlanDetails((n) => plannerNote(`Inaayos ang listahan (${n} ulam)…`));
  const date = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  return { receipt: receiptByIngredient(plan, detailCache), people: plan.people, date };
}

async function currentGroceryText() {
  const g = await currentGrocery();
  return g ? groceryText(g.receipt, g.people, g.date) : null;
}

/** The grocery list drawn as a picture (1080 px wide, as tall as the list), like a market receipt. */
function groceryCanvas({ receipt, people, date }) {
  const W = 1080, PAD = 64, ROW = 58, HEAD = 250, FOOT = 230;
  const rows = groceryRows(receipt);
  const c = document.createElement("canvas");
  c.width = W; c.height = HEAD + rows.length * ROW + FOOT;
  const ctx = c.getContext("2d");
  const font = (w, px) => `${w} ${px}px Inter, "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = "#F8F4EA"; ctx.fillRect(0, 0, W, c.height);
  // Header band
  ctx.fillStyle = "#163F2E"; ctx.fillRect(0, 0, W, 170);
  ctx.fillStyle = "#E6C265"; ctx.font = font(800, 26); ctx.fillText("FARM2FIGURE", PAD, 62);
  ctx.fillStyle = "#F8F4EA"; ctx.font = font(800, 60); ctx.fillText("Grocery list", PAD, 132);
  ctx.fillStyle = "#3D3420"; ctx.font = font(600, 30); ctx.fillText(`Para sa ${people} tao · ${date}`, PAD, 222);
  // Rows: checkbox, item, amount, price
  let y = HEAD;
  const fit = (text, max) => { let t = text; while (ctx.measureText(t).width > max && t.length > 4) t = t.slice(0, -2); return t === text ? t : `${t.trimEnd()}…`; };
  rows.forEach((r, i) => {
    if (i % 2 === 0) { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(PAD - 16, y, W - 2 * PAD + 32, ROW); }
    ctx.strokeStyle = "#1F5A3D"; ctx.lineWidth = 3; ctx.strokeRect(PAD, y + 16, 26, 26);
    ctx.fillStyle = "#1F2A24"; ctx.font = font(600, 30);
    ctx.fillText(fit(r.label, 560), PAD + 48, y + 40);
    ctx.fillStyle = "#6B7F70"; ctx.font = font(500, 28); ctx.textAlign = "right";
    ctx.fillText(r.qty, W - PAD - 190, y + 40);
    ctx.fillStyle = "#8A6A12"; ctx.font = font(700, 28);
    ctx.fillText(r.price, W - PAD, y + 40);
    ctx.textAlign = "left";
    y += ROW;
  });
  // Total and sources
  y += 24;
  ctx.fillStyle = "#163F2E"; ctx.fillRect(PAD - 16, y, W - 2 * PAD + 32, 4);
  ctx.font = font(800, 40); ctx.fillText("Total", PAD, y + 66);
  ctx.textAlign = "right"; ctx.fillText(`≈ ₱${Math.round(receipt.total).toLocaleString("en-PH")}`, W - PAD, y + 66); ctx.textAlign = "left";
  ctx.fillStyle = "#6B7F70"; ctx.font = font(500, 24);
  ctx.fillText(receipt.unpriced ? `${receipt.unpriced} na sangkap ang wala pang presyo (—). ` : "", PAD, y + 112);
  ctx.fillText("Presyo mula sa DA, PSA, SM at DTI · dami ay bago lutuin (as bought)", PAD, y + 148);
  return c;
}

/** One printable row per ingredient: label, amount to buy, price. */
function groceryRows(receipt) {
  return receipt.items.map((it) => ({
    label: it.label,
    qty: it.grams > 0 && it.grams < 1 ? "<1 g" : formatGrams(it.grams),
    price: it.priced ? `₱${Math.round(it.cost).toLocaleString("en-PH")}${it.unpricedGrams > 0 ? "+" : ""}` : "—",
  }));
}

function groceryFileName() {
  return `grocery-list-${new Date().toISOString().slice(0, 10)}.png`;
}

const canvasBlob = (c) => new Promise((resolve) => c.toBlob(resolve, "image/png"));

async function downloadGroceryList() {
  const g = await currentGrocery();
  if (!g) return;
  const blob = await canvasBlob(groceryCanvas(g));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = groceryFileName();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  plannerNote("Na-download ang grocery list (larawan) ✓");
  if (typeof trackEvent === "function") trackEvent("grocery/download");
}

/** Phones: share the picture (Messenger is on the share sheet). Elsewhere: copy the list as text, then open Messenger. */
async function sendGroceryList() {
  const g = await currentGrocery();
  if (!g) return;
  if (typeof trackEvent === "function") trackEvent("grocery/share");
  const text = groceryText(g.receipt, g.people, g.date);
  if (navigator.share) {
    try {
      const file = new File([await canvasBlob(groceryCanvas(g))], groceryFileName(), { type: "image/png" });
      const payload = navigator.canShare && navigator.canShare({ files: [file] }) ? { files: [file], title: "Grocery list" } : { title: "Grocery list", text };
      await navigator.share(payload);
      plannerNote("Na-send ✓");
      return;
    } catch (e) { if (e && e.name === "AbortError") return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    plannerNote("Na-copy ang listahan ✓ I-paste sa Messenger.");
    window.open("https://www.messenger.com/", "_blank", "noopener");
  } catch { plannerNote("Hindi ma-copy. Subukan ang Download.", false); }
}

function receiptFooter(total, note, unpricedDishes) {
  return `
    <div class="rc-total"><span>Total for the week</span><span>${peso(total)}</span></div>
    <p class="rc-note">For ${plan.people} ${plan.people === 1 ? "person" : "people"} · DA, PSA, SM and DTI prices${note ? ` · ${note}` : ""}${unpricedDishes ? ` · ${unpricedDishes} dish${unpricedDishes > 1 ? "es" : ""} without a price` : ""}</p>`;
}
