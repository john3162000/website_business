// "Panoorin kung paano": Kuya Kusinero, a 3D stick-figure cook with an apron and
// a chef's hat, acts out a recipe step by step: palengke, cutting, cooking, serving.
//
// No AI: buildCookScript() turns a recipe into a fixed list of actions with rules.
//   - ingredient lines give the shopping list and how each one is cut
//     ("1 onion, diced", "6 cloves garlic, minced", "2 lbs pork, cut into 2-inch cubes");
//   - the recipe's steps (or the short method notes of newer recipes) give the order of
//     cooking actions and their times ("simmer for 45 minutes", "boil for 3 hours");
//   - with no usable steps, a template for the dish type fills in (sinigang, adobo, fried…).
// The captions are our own short labels, never the recipe site's text.
//
// The player loads Three.js (pinned, with SRI) only when someone opens it, and falls back
// to the plain step list when 3D can't load or motion is reduced.
// docs/cookshow.test.mjs tests the pure helpers.

const COOK_THREE_URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
// Subresource integrity: the browser refuses the file if the CDN ever serves something else.
const COOK_THREE_SRI = "sha384-CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu";

// ── Pure helpers ──

/** How a line says to cut its ingredient: { style, size } or null. Size is in cm when given. */
function cookCutStyle(text) {
  const s = String(text || "").toLowerCase();
  const rules = [
    [/\b(minced|mince|finely chopped|finely diced)\b/, "minced"],
    [/\b(julienne|julienned|matchsticks?|strips?)\b/, "strips"],
    [/\b(crush|crushed|pounded|smashed|bruised)\b/, "crushed"],
    [/\b(cubed|cubes?)\b/, "cubes"],
    [/\b(diced|dice|chopped|chop)\b/, "diced"],
    [/\b(thinly sliced|sliced thinly)\b/, "thin"],
    [/\b(sliced|slices?|rings?)\b/, "sliced"],
    [/\b(quartered|quarters?)\b/, "quartered"],
    [/\b(halved|halves|cut in half)\b/, "halved"],
    [/\b(wedges?|wedged)\b/, "wedges"],
    [/\b(grated|shredded)\b/, "grated"],
    [/\b(serving pieces?|bite[- ]size|chunks?)\b/, "pieces"],
  ];
  const hit = rules.find(([re]) => re.test(s));
  if (!hit) return null;
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:to\s*\d+(?:\.\d+)?\s*)?(?:-?\s*inch(?:es)?|in\.|")/);
  const cm = s.match(/(\d+(?:\.\d+)?)\s*cm\b/);
  const size = m ? Math.round(parseFloat(m[1]) * 2.54 * 10) / 10 : cm ? parseFloat(cm[1]) : null;
  return { style: hit[1], size };
}

/** Minutes a sentence says something takes ("45 minutes", "1 to 2 hours", "overnight"), or null. */
function cookMinutes(sentence) {
  const s = String(sentence || "").toLowerCase();
  if (/\bovernight\b/.test(s)) return 480;
  const m = s.match(/(\d+(?:\.\d+)?)(?:\s*(?:to|-|–)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?)\b/);
  if (!m) return null;
  const n = m[2] ? parseFloat(m[2]) : parseFloat(m[1]);
  return Math.round(/^h/.test(m[3]) ? n * 60 : n);
}

/** "3 oras", "45 minuto", "1 oras 30 minuto" (or English). */
function cookTimeText(minutes, lang) {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const en = lang === "en";
  const hs = h ? `${h} ${en ? (h === 1 ? "hour" : "hours") : "oras"}` : "";
  const ms = m ? `${m} ${en ? "min" : "minuto"}` : "";
  return [hs, ms].filter(Boolean).join(" ");
}

// Emoji stand-ins until the drawn icon set is ready (proposal: drawn icons + photos).
const COOK_ICONS = [
  [/peppercorn|pepper corn|black pepper|paminta/, "🧂"], [/bay leaf|laurel|parsley|cilantro|kinchay|basil|tanglad|lemongrass|pandan|leaves|leaf|herb/, "🌿"],
  [/onion|sibuyas|shallot|leek|scallion|green onion/, "🧅"], [/garlic|bawang/, "🧄"], [/ginger|luya/, "🫚"],
  [/chicken|manok/, "🍗"], [/egg|itlog/, "🥚"], [/shrimp|prawn|hipon/, "🦐"], [/squid|pusit|calamari/, "🦑"],
  [/crab|alimango|alimasag/, "🦀"], [/clam|mussel|tahong|halaan|oyster/, "🦪"],
  [/fish|bangus|milkfish|tilapia|galunggong|tuna|salmon|tuyo|dilis|anchov|sardine|mackerel|pompano/, "🐟"],
  [/pork|beef|meat|bacon|ham|sausage|longganisa|chorizo|liver|oxtail|tripe|goat/, "🥩"],
  [/tomato|kamatis/, "🍅"], [/potato|patatas/, "🥔"], [/carrot/, "🥕"], [/eggplant|talong/, "🍆"],
  [/bell pepper/, "🫑"], [/chili|sili|pepper(?! ?corn)/, "🌶️"], [/corn|mais/, "🌽"],
  [/cabbage|pechay|bok choy|kangkong|spinach|malunggay|lettuce|greens|leaves|sitaw|beans|okra|ampalaya|sayote|squash|kalabasa|radish|labanos|gabi|taro/, "🥬"],
  [/mushroom/, "🍄"], [/rice|bigas|kanin/, "🍚"], [/noodle|pasta|spaghetti|macaroni|bihon|canton|sotanghon|miki|misua/, "🍜"],
  [/banana|saba|plantain/, "🍌"], [/mango/, "🥭"], [/pineapple/, "🍍"], [/lemon|calamansi|lime|dayap/, "🍋"],
  [/coconut|gata/, "🥥"], [/cheese/, "🧀"], [/butter|margarine/, "🧈"], [/milk|cream/, "🥛"],
  [/bread|crumbs|panko/, "🍞"], [/peanut|mani/, "🥜"], [/monggo|mung|chickpea|garbanzo/, "🫘"],
  [/salt|sugar|pepper|powder|seasoning|cube|msg|sarap/, "🧂"], [/water|broth|stock/, "💧"],
  [/oil|vinegar|suka|soy|toyo|patis|fish sauce|oyster sauce|sauce|ketchup|wine|mayonnaise|bagoong/, "🍶"],
  [/flour|starch|cornstarch/, "🌾"], [/honey/, "🍯"],
];

function cookIcon(name) {
  const s = String(name || "").toLowerCase();
  const hit = COOK_ICONS.find(([re]) => re.test(s));
  return hit ? hit[1] : "🥄";
}

const COOK_LIQUID = /(^|_)(water|broth|stock|sauce|vinegar|milk|cream|juice|wine|oil|soy|patis|syrup)(_|$)|fish_sauce|soy_sauce/;
// Bouillon cubes, powders and granules are named after a liquid but go in by hand.
const COOK_SOLID_LIQUID = /cube|powder|granule|mix(_|$)/;
// Wrappers: lumpia, turon, siomai, banana leaves.
const COOK_WRAPPER = /wrapper|spring_roll|banana_leaf|dahon_saging/;
/** "Lumpia wrapper" → "lumpia" (the rolled dish). */
function cookWrappedName(label) {
  const n = String(label || "").replace(/\s*(wrappers?|sheets?)\b.*$/i, "").trim().toLowerCase();
  return n || "lumpia";
}
// Frying oil: shown by "heat the oil", never listed as something added.
const COOK_FRY_OIL = /^oil_(cooking|vegetable|canola|palm|corn|frying)$|^cooking_oil$/;
// Things that are never cut on the board.
const COOK_NO_CUT = /salt|sugar|pepper_ground|black_pepper|powder|flour|starch|oil|sauce|vinegar|water|broth|stock|milk|cream|cube|seasoning|rice|noodle|pasta|spaghetti|macaroni|wrapper|paste|ketchup|mayonnaise|butter|cheese_|honey|wine|juice/;
const COOK_STOP = new Set(["fresh", "ground", "large", "small", "medium", "chopped", "sliced", "minced", "diced", "cups", "cup", "piece", "pieces", "cloves", "clove", "whole", "dried", "cooked", "raw", "boneless", "skinless", "into", "and", "for", "the", "with", "cut", "about", "optional", "taste", "cooking", "lbs", "lb", "pounds", "pound", "grams", "kilo", "kilos", "tablespoons", "tablespoon", "teaspoons", "teaspoon", "tbsp", "tsp", "quart", "ounces", "pack", "packs", "can", "cans", "see", "notes", "note", "needed", "serving", "some", "bunch", "thumbs", "thumb", "inch", "inches", "big"]);

/** Water lines and to-taste lines often have no catalog label: name them from the text. */
function cookLineName(l) {
  if (l.label || l.name) return l.label || l.name;
  const text = String(l.text || "").toLowerCase();
  if (l.status === "water") return /rice wash|hugas bigas/.test(text) ? "Rice wash" : "Water";
  if (l.slug) return l.slug.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  return "";
}

/** The shopping list from engine lines ({text, slug, label, status}) or plain ({name, amount, unit}). */
function cookItemsFromLines(lines) {
  const out = [];
  for (const l of lines || []) {
    if (!l) continue;
    if (l.status === "skipped" || l.status === "optional") continue;
    const name = cookLineName(l);
    const text = l.text || [l.amount, l.unit, l.name].filter(Boolean).join(" ");
    if (!name.trim() || /:\s*$/.test(name.trim())) continue;
    const key = l.slug || name.toLowerCase();
    if (out.some((x) => x.key === key)) continue; // marinade and sauce lists repeat salt or garlic
    const water = l.status === "water" || (/\bwater\b/i.test(name) && !/coconut/i.test(name));
    out.push({
      key, label: name, text, icon: cookIcon(`${name} ${l.slug || ""}`),
      liquid: water || (COOK_LIQUID.test(l.slug || name.toLowerCase().replace(/\s+/g, "_")) && !COOK_SOLID_LIQUID.test(l.slug || name.toLowerCase())),
      water, toTaste: l.status === "to-taste", cost: typeof l.cost === "number" ? l.cost : null, fryOil: !!(l.slug && COOK_FRY_OIL.test(l.slug)),
      cut: (l.slug && COOK_NO_CUT.test(l.slug)) || water ? null : cookCutStyle(text),
      peel: /\b(peeled|deveined|shelled|cleaned|gutted|scaled)\b/i.test(text),
      words: cookWords(`${name} ${l.name || ""} ${(l.slug || "").replace(/_/g, " ")} ${text}`),
    });
  }
  return out;
}

function cookWords(s) {
  return [...new Set(String(s).toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z ]/g, " ").split(/\s+/)
    .map((w) => w.replace(/(ves)$/, "f").replace(/(es|s)$/, (m, x, i, all) => (all.length > 4 ? "" : m)))
    .filter((w) => w.length >= 3 && !COOK_STOP.has(w)))];
}

/**
 * Items a sentence names. Each word in the sentence goes to the item that matches the most
 * of its words ("Maggi Magic Chicken Cubes" → the cube, not the chicken), ties to the simplest
 * item ("add the chicken" → the chicken, not the chicken cube).
 */
function cookMentions(sentence, items) {
  const words = new Set(cookWords(sentence));
  // "pepper corn" in a step, "peppercorn" in the list.
  const plain = String(sentence || "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
  for (let i = 0; i + 1 < plain.length; i++) for (const w of cookWords(plain[i] + plain[i + 1])) words.add(w);
  const scored = items.filter((it) => !it.fryOil).map((it) => ({ it, score: it.words.filter((w) => words.has(w)).length }));
  const winners = new Set();
  for (const w of words) {
    let best = null;
    for (const c of scored) {
      if (!c.score || !c.it.words.includes(w)) continue;
      if (!best || c.score > best.score || (c.score === best.score && c.it.words.length < best.it.words.length)) best = c;
    }
    if (best) winners.add(best.it);
  }
  return items.filter((it) => winners.has(it));
}

// Sentence verbs → actions, checked in this order inside each sentence.
const COOK_VERBS = [
  ["marinate", /\bmarinat(e|ing)\b|\bmarinade (it |them )?for\b|\blet (it |them )?marinate/],
  ["deepfry", /\bdeep[- ]?fr(y|ied|ying)\b/],
  ["heat", /\bheat (up )?(the |a |some )?(cooking )?(oil|pan|pot|wok|skillet|kawali|butter|large|deep|frying|cast)/],
  ["saute", /\b(saut[eé]|gisa|stir[- ]?fry)/],
  ["fry", /\b(pan[- ]?fr(y|ied)|fry|fried)\b/],
  ["grill", /\b(grill|ihaw|broil|barbecue)/],
  ["bake", /\b(bake|oven|roast)\b/],
  ["steam", /\bsteam/],
  ["boil", /\b(bring (it )?to a boil|boil|parboil|blanch)/],
  ["simmer", /\b(simmer|lower the heat|low heat|continue cooking|continue to cook)/],
  ["cook", /\bcook(ing)? (it |them )?(until|for)\b/],
  ["cut", /\b(slice|chop|cut|crush) (it|them|into|the)\b/],
  ["wrap", /\b(wrap|roll) (and|it|them|the|to|each)\b/],
  ["pour", /\bpour\b/],
  ["mix", /\b(combine|mix|blend)\b/],
  ["add", /\b(add|put|place|toss in|return)\b/],
  ["stir", /\bstir\b/],
  ["season", /\b(season|rub|to taste|sprinkle)\b/],
  ["chill", /\b(refrigerat\w*|chill|freez\w*|fridge|ref)\b/],
  ["drain", /\b(drain|set aside|remove (it|them|from|the)|let (it )?cool|wire rack|paper towel)/],
  ["serve", /\b(serve|transfer to a serving|garnish)/],
];

const COOK_TIMED = new Set(["marinate", "boil", "simmer", "cook", "fry", "deepfry", "grill", "bake", "steam", "chill"]);
const COOK_POT_WORDS = /\b(pot|casserole|kaldero|saucepan|stockpot|dutch oven)\b/;
const COOK_PAN_WORDS = /\b(pan|wok|skillet|kawali|frying pan)\b/;

/** Cooking actions from free text, in order. Each: { kind, items:[keys], minutes, vessel? }. */
function cookActionsFromText(sentences, items) {
  const out = [];
  for (const sentence of sentences) {
    const s = String(sentence || "").toLowerCase();
    if (/^note\b|\bvideo\b/.test(s)) continue;
    const found = COOK_VERBS.map(([kind, re]) => { const m = s.match(re); return m ? { kind, at: m.index } : null; })
      .filter(Boolean).sort((a, b) => a.at - b.at);
    let kinds = [...new Set(found.map((f) => f.kind))];
    // "Deep fry" also matches "fry"; "combine … then marinate" is one marinating step;
    // "add salt to taste" is seasoning; "combine … in a pot" is adding to the pot.
    if (kinds.includes("deepfry")) kinds = kinds.filter((k) => k !== "fry");
    if (kinds.includes("marinate")) kinds = kinds.filter((k) => k !== "mix");
    if (kinds.includes("season") && /to taste/.test(s)) kinds = kinds.filter((k) => k !== "add");
    if (kinds.includes("mix") && COOK_POT_WORDS.test(s)) kinds = kinds.map((k) => (k === "mix" ? "add" : k));
    if (kinds.includes("cut") && kinds.includes("add")) kinds = kinds.filter((k) => k !== "cut" || /^(slice|chop|cut|crush)/.test(s));
    kinds = [...new Set(kinds)];
    if (!kinds.length) continue;
    const vessel = COOK_POT_WORDS.test(s) ? "kaldero" : COOK_PAN_WORDS.test(s) ? "kawali" : null;
    const mentioned = cookMentions(s, items).map((it) => it.key);
    const minutes = cookMinutes(s);
    let itemsGiven = false, timeGiven = false;
    for (const kind of kinds) {
      const takesItems = !["heat", "serve", "drain", "boil", "simmer", "cook", "stir"].includes(kind) || (kind === "boil" && !itemsGiven);
      const a = { kind, items: takesItems && !itemsGiven ? mentioned : [], minutes: COOK_TIMED.has(kind) && !timeGiven ? minutes : null, vessel };
      if (kind === "cut") a.cut = cookCutStyle(s) || { style: "pieces", size: null };
      if (a.items.length) itemsGiven = true;
      if (a.minutes) timeGiven = true;
      out.push(a);
    }
  }
  return out;
}

/** A dish-type template when the recipe has no usable steps. */
function cookTemplate(title, frying, items) {
  const t = String(title || "").toLowerCase();
  const solid = items.filter((it) => !it.liquid && !it.toTaste);
  const keys = (list, re) => list.filter((it) => re.test(`${it.key} ${it.label}`.toLowerCase())).map((it) => it.key);
  const aromatics = keys(solid, /garlic|onion|ginger|bawang|sibuyas|luya/);
  const meats = keys(solid, /pork|beef|chicken|fish|shrimp|meat|bangus|tilapia|squid|baboy|manok|baka|ribs|belly|goat/)
    .filter((k) => !/cube|powder|seasoning/.test(k));
  const veg = solid.filter((it) => !aromatics.includes(it.key) && !meats.includes(it.key) && !/cube|powder|seasoning/.test(it.key)).map((it) => it.key);
  const waters = items.filter((it) => it.water).map((it) => it.key);
  const sauces = items.filter((it) => it.liquid && !it.water && !it.fryOil).map((it) => it.key);
  const all = solid.map((it) => it.key);
  const sweet = /\b(minatamis|ginataang (mais|bilo|halo|saging)|champorado|porridge|lugaw|arroz caldo|goto|biko|suman|kakanin|maja|leche|flan|halaya|pudding|puto|kutsinta|turon|banana cue|camote cue|bibingka)\b/.test(t);
  // No stove at all: salads, drinks, dips, pickles, kinilaw, chilled desserts.
  if (/\b(salad|smoothie|shake|juice|lemonade|mayonnaise|mayo|pesto|spread|dip|dressing|salsa|kinilaw|kilawin|kilawing|ceviche|atchara|achara|pickle|jelly|ref cake|refrigerator cake|icebox|sandwich|ice cream|float|graham)\b/.test(t)) {
    const out = [{ kind: "mix", items: [...all, ...sauces] }];
    if (/\b(jelly|ref cake|refrigerator|icebox|ice cream|float|graham|salad|atchara|achara|pickle|kinilaw|kilawin|kilawing|ceviche)\b/.test(t)) out.push({ kind: "chill", minutes: /ice cream|float|ref cake|refrigerator|icebox|graham/.test(t) ? 360 : /atchara|achara|pickle/.test(t) ? 1440 : 60 });
    return out;
  }
  // Patties and fritters: mix, shape, fry.
  if (/\b(burger|hamburger|patty|patties|meatball|bola[- ]bola|torta|tortang|okoy|ukoy|pancake|fritter|nuggets?)\b/.test(t)) {
    const filling = all.filter((k) => !/bun|bread|pandesal|lettuce/.test(k));
    return [{ kind: "mix", items: filling }, { kind: "heat" }, { kind: "fry", items: meats.length ? meats : filling.slice(0, 1), minutes: 8 }, { kind: "drain" }];
  }
  if (frying === "deep" || /\b(fried|prito|pritong|crispy|lumpia|shanghai|turon|kawali|chicharon)\b/.test(t)) {
    return [{ kind: "heat" }, { kind: "deepfry", items: meats.length ? meats : veg, minutes: 15 }, { kind: "drain" }];
  }
  if (/\b(sinigang|tinola|nilaga|bulalo|sopas|soup|sabaw|batchoy|molo|pochero)\b/.test(t)) {
    return [{ kind: "add", items: meats, vessel: "kaldero" }, { kind: "pour", items: waters }, { kind: "boil", minutes: /bulalo|nilaga|pochero/.test(t) ? 180 : 45 },
      { kind: "add", items: veg }, { kind: "simmer", minutes: 10 }, { kind: "season", items: sauces }];
  }
  if (sweet) {
    return [{ kind: "pour", items: [...sauces, ...waters], vessel: "kaldero" }, { kind: "boil" }, { kind: "add", items: all }, { kind: "simmer", minutes: 25 }, { kind: "stir", items: all.slice(0, 1) }];
  }
  if (/\b(ginataan|ginataang|gata|curry|kare[- ]kare|laing|bicol express|bringhe|guinataan)\b/.test(t)) {
    return [{ kind: "heat" }, { kind: "saute", items: aromatics }, { kind: "add", items: meats }, { kind: "pour", items: [...sauces, ...waters] },
      { kind: "simmer", minutes: 25 }, { kind: "add", items: veg }, { kind: "simmer", minutes: 10 }, { kind: "season" }];
  }
  if (/\b(pancit|canton|bihon|sotanghon|miki|mami|noodles?|pasta|spaghetti|macaroni|carbonara|alfredo|palabok)\b/.test(t)) {
    const noodles = keys(solid, /noodle|pasta|spaghetti|macaroni|penne|bihon|canton|sotanghon|miki|misua|fettuccine|linguine/);
    return [{ kind: "heat" }, { kind: "saute", items: aromatics }, { kind: "add", items: meats.filter((k) => !noodles.includes(k)) }, { kind: "add", items: veg.filter((k) => !noodles.includes(k)) },
      { kind: "pour", items: [...sauces, ...waters] }, { kind: "boil" }, { kind: "add", items: noodles }, { kind: "cook", minutes: 5 }, { kind: "season" }];
  }
  if (/\b(stir[- ]?fry|stir[- ]?fried|ginisang|guisado|sauteed|chopsuey|chop suey)\b/.test(t)) {
    return [{ kind: "heat" }, { kind: "saute", items: aromatics }, { kind: "fry", items: meats, minutes: 5 }, { kind: "add", items: veg }, { kind: "pour", items: sauces }, { kind: "cook", minutes: 3 }, { kind: "season" }];
  }
  if (/\b(adobo|paksiw|humba|pata tim|asado)\b/.test(t)) {
    return [{ kind: "heat" }, { kind: "saute", items: aromatics }, { kind: "add", items: meats }, { kind: "pour", items: [...sauces, ...waters] },
      { kind: "boil" }, { kind: "simmer", minutes: 40 }];
  }
  return [{ kind: "heat" }, { kind: "saute", items: aromatics }, { kind: "add", items: meats }, { kind: "add", items: veg },
    { kind: "pour", items: [...sauces, ...waters] }, { kind: "simmer", minutes: 20 }, { kind: "season" }];
}

/**
 * The whole script for the player: [{ kind, items:[item], style?, size?, minutes?, vessel }].
 * `recipe`: { title, lines, instructions:[text], methodNotes, frying }.
 */
function buildCookScript(recipe) {
  const items = cookItemsFromLines(recipe.lines);
  const byKey = new Map(items.map((it) => [it.key, it]));
  const steps = [];
  const shop = items.filter((it) => !it.water);
  if (shop.length) steps.push({ kind: "shop", items: shop });
  const peel = items.filter((it) => it.peel);
  if (peel.length) steps.push({ kind: "peel", items: peel });
  const cutDone = new Set();
  for (const it of items.filter((x, i, all) => x.cut && all.findIndex((y) => y.cut && y.label.toLowerCase() === x.label.toLowerCase()) === i).slice(0, 8)) { steps.push({ kind: "cut", items: [it], style: it.cut.style, size: it.cut.size }); cutDone.add(it); }

  // Split each step on its own: many steps have no final period.
  const sentences = [...(recipe.instructions || []), ...(recipe.methodNotes ? [recipe.methodNotes] : [])]
    .flatMap((step) => String(step || "").split(/(?<=[.!?;])\s+|\n+/)).map((x) => x.trim()).filter(Boolean);
  let actions = cookActionsFromText(sentences, items);
  const cooking = actions.filter((a) => COOK_TIMED.has(a.kind) || ["heat", "saute", "mix", "wrap"].includes(a.kind));
  if (!cooking.length) actions = cookTemplate(recipe.title, recipe.frying, items).map((a) => ({ items: [], minutes: null, ...a }));

  let vessel = null, lastMain = null;
  const mains = new Set(items.filter((it) => !it.liquid && !it.toTaste && !/cube|powder|seasoning|salt|sugar|black_pepper|pepper_ground|peppercorn|white_pepper/.test(it.key)));
  for (const a of actions) {
    if (a.kind === "serve") continue;
    if (a.vessel) vessel = a.vessel;
    else if (["deepfry", "fry", "saute"].includes(a.kind)) vessel = vessel === "kaldero" && a.kind !== "deepfry" ? vessel : vessel || "kawali";
    else if (a.kind === "heat") vessel = vessel || "kawali";
    else if (["boil", "simmer"].includes(a.kind)) vessel = vessel || "kaldero";
    if (["grill", "bake", "steam"].includes(a.kind)) vessel = a.kind === "grill" ? "ihawan" : a.kind === "bake" ? "oven" : "steamer";
    let its = (a.items || []).map((k) => byKey.get(k)).filter(Boolean);
    // "Fry it", "slice into pieces": the last meat or fish named.
    for (const it of its) if (mains.has(it) && /pork|beef|chicken|fish|bangus|tilapia|shrimp|squid|meat|belly|ribs|liempo|lumpia|rolled|tofu|egg/.test(`${it.key} ${it.label}`.toLowerCase())) lastMain = it;
    if (a.kind === "cut") {
      // "Slice into serving pieces" after cooking: cut whatever was cooked last.
      if (!its.length && lastMain) its = [lastMain];
      its = its.filter((it) => !cutDone.has(it) || steps.some((s, i) => i > steps.findIndex((c) => c.kind === "cut" && c.items.includes(it)) && COOK_TIMED.has(s.kind) && s.items.includes(it)));
      if (!its.length) continue;
      steps.push({ kind: "cut", items: its.slice(0, 1), style: a.cut.style, size: a.cut.size, vessel: vessel || "kawali" });
      cutDone.add(its[0]);
      continue;
    }
    const wrappers = items.filter((it) => COOK_WRAPPER.test(it.key));
    let kind = a.kind;
    // "Put the filling on a wrapper" and "wrap and roll" are one wrapping step.
    if (kind === "add" && its.length && its.every((it) => COOK_WRAPPER.test(it.key))) kind = "wrap";
    if (kind === "wrap" && !its.length) its = wrappers;
    // "Deep fry the lumpia" names the wrapper: show the rolled dish instead.
    if (["fry", "deepfry"].includes(kind) && its.some((it) => COOK_WRAPPER.test(it.key))) {
      its = its.filter((it) => !COOK_WRAPPER.test(it.key));
      if (!its.length) its = [{ key: "rolled", label: cookWrappedName(wrappers[0] && wrappers[0].label), icon: "🌯", words: [] }];
    }
    // Seasoning lists only what goes on: "rub the Magic Sarap over the pork belly".
    if (kind === "season") its = its.filter((it) => !mains.has(it));
    if (["add", "pour", "mix", "saute", "wrap"].includes(kind) && !its.length) continue;
    // Filler with nothing to show: a bare "stir" or "cook for a while".
    if ((kind === "stir" && !its.length) || (kind === "cook" && !a.minutes && !its.length)) continue;
    if (kind === "add" && its.every((x) => x.liquid && !COOK_SOLID_LIQUID.test(x.key))) kind = "pour";
    if (kind === "pour" && its.some((x) => !x.liquid)) kind = "add";
    if (["fry", "deepfry", "grill"].includes(kind) && !its.length) { if (lastMain && kind !== "deepfry") its = [lastMain]; else if (!a.minutes && kind !== "deepfry") continue; }
    if (kind === "drain" && !steps.some((x) => COOK_TIMED.has(x.kind) && x.kind !== "marinate" && x.kind !== "chill")) continue;
    const prev = steps[steps.length - 1];
    const here = vessel || "kawali";
    // Merge "add X" + "add Y" into one step.
    if (prev && prev.kind === kind && !COOK_TIMED.has(kind) && prev.vessel === here) {
      for (const it of its) if (!prev.items.includes(it)) prev.items.push(it);
      continue;
    }
    // "Bring to a boil" then "simmer 2 hours" stays two steps, but two simmers in a row become one.
    if (prev && COOK_TIMED.has(kind) && (prev.kind === kind || (["simmer", "cook"].includes(prev.kind) && ["simmer", "cook"].includes(kind))) && prev.vessel === here) {
      prev.minutes = Math.max(prev.minutes || 0, a.minutes || 0) || null;
      for (const it of its) if (!prev.items.includes(it)) prev.items.push(it);
      continue;
    }
    steps.push({ kind, items: its, minutes: a.minutes || null, vessel: here });
  }
  const seasonings = items.filter((it) => it.toTaste);
  const seasonStep = steps.find((x) => x.kind === "season");
  if (seasonings.length && !seasonStep) steps.push({ kind: "season", items: seasonings, vessel: vessel || "kawali" });
  else if (seasonStep) for (const it of seasonings) if (!seasonStep.items.includes(it)) seasonStep.items.push(it);
  steps.push({ kind: "serve", items: [], vessel: vessel || "kawali", cold: steps.some((x) => x.kind === "chill") || !steps.some((x) => COOK_TIMED.has(x.kind) && !["marinate", "chill"].includes(x.kind) || x.kind === "heat") });
  return steps.slice(0, 24);
}

const COOK_STYLE_TEXT = {
  minced: ["pinong-pino", "minced"], diced: ["maliliit na kuwadrado", "diced"], cubes: ["pa-cube", "in cubes"],
  thin: ["manipis na hiwa", "thinly sliced"], sliced: ["hiniwa", "sliced"], strips: ["pahaba (julienne)", "in strips"],
  crushed: ["dinikdik", "crushed"], quartered: ["hinati sa apat", "quartered"], halved: ["hinati sa dalawa", "halved"],
  wedges: ["pa-wedge", "in wedges"], grated: ["kinayod", "grated"], pieces: ["katamtamang laki", "in serving pieces"],
};
const COOK_VESSEL_TEXT = { kawali: ["kawali", "pan"], kaldero: ["kaldero", "pot"], oven: ["oven", "oven"], ihawan: ["ihawan", "grill"], steamer: ["steamer", "steamer"] };

function cookList(items) {
  const names = items.map((it) => it.label.toLowerCase());
  return names.length <= 2 ? names.join(" at ") : `${names.slice(0, -1).join(", ")} at ${names[names.length - 1]}`;
}

/** The caption for a step, in Tagalog or English. Our own words, never the source's. */
function cookCaption(step, lang = "tl") {
  const en = lang === "en";
  const L = (pair) => (en ? pair[1] : pair[0]);
  const list = cookList(step.items || []).replace(/ at /g, en ? " and " : " at ");
  const v = L(COOK_VESSEL_TEXT[step.vessel] || COOK_VESSEL_TEXT.kawali);
  const time = step.minutes ? ` ${en ? "for" : "nang"} ${cookTimeText(step.minutes, lang)}` : "";
  switch (step.kind) {
    case "shop": return en ? `Shop for the ingredients (${step.items.length})` : `Mamalengke ng mga sangkap (${step.items.length})`;
    case "peel": return en ? `Clean and peel: ${list}` : `Linisin at balatan: ${list}`;
    case "cut": {
      if (step.style === "crushed" && step.items.every((it) => /cube|cracker|chicharon/.test(it.key))) return en ? `Crush the ${list}` : `Durugin ang ${list}`;
      const style = L(COOK_STYLE_TEXT[step.style] || ["hiwain", "cut"]);
      const size = step.size ? ` (${en ? "about" : "mga"} ${step.size} cm)` : "";
      return en ? `Cut the ${list}: ${style}${size}` : `Hiwain ang ${list}: ${style}${size}`;
    }
    case "marinate": return en ? `Marinate${list ? ` the ${list}` : ""}${time}` : `Ibabad${list ? ` ang ${list}` : ""}${time}`;
    case "heat": return en ? `Heat the ${v}` : `Painitin ang ${v}`;
    case "saute": return en ? `Sauté the ${list}` : `Igisa ang ${list}`;
    case "add": return en ? `Add the ${list}` : `Ilagay ang ${list}`;
    case "pour": return en ? `Pour in the ${list}` : `Ibuhos ang ${list}`;
    case "boil": return en ? `Bring to a boil${time}` : `Pakuluan${time}`;
    case "simmer": return en ? `Simmer on low heat${time}` : `Hinaan ang apoy at pakuluan nang dahan-dahan${time}`;
    case "fry": return en ? `Pan-fry${list ? ` the ${list}` : ""}${time}` : `Iprito${list ? ` ang ${list}` : ""}${time}`;
    case "deepfry": return en ? `Deep-fry${list ? ` the ${list}` : ""}${time}` : `Iprito nang lubog sa mantika${list ? ` ang ${list}` : ""}${time}`;
    case "grill": return en ? `Grill${list ? ` the ${list}` : ""}${time}` : `Ihawin${list ? ` ang ${list}` : ""}${time}`;
    case "bake": return en ? `Bake in the oven${time}` : `I-bake sa oven${time}`;
    case "steam": return en ? `Steam${time}` : `I-steam${time}`;
    case "stir": return en ? "Stir well" : "Haluin nang mabuti";
    case "mix": return en ? `Mix the ${list} in a bowl` : `Paghaluin sa mangkok ang ${list}`;
    case "wrap": return en ? `Wrap in ${list} and roll` : `Ibalot sa ${list} at irolyo`;
    case "cook": return en ? `Cook${time}` : `Lutuin${time}`;
    case "season": return en ? `Season${list ? ` with ${list}` : ""} to taste` : `Timplahan${list ? ` ng ${list}` : ""} ayon sa panlasa`;
    case "chill": return en ? `Chill in the fridge${time}` : `Palamigin sa ref${time}`;
    case "drain": return en ? "Take out and let it drain" : "Hanguin at patuluin";
    case "serve": return step.cold ? (en ? "Serve cold" : "Ihain nang malamig") : en ? "Serve while hot" : "Ihain habang mainit";
    default: return step.kind;
  }
}

// ── The 3D player ──

let cookThreeLoading = null;
let cookShow = null; // { steps, title, i, t, playing, scene… }

function cookLang() { return typeof siteLang === "function" ? siteLang() : "tl"; }
function cookT(key, fallback) { return typeof t === "function" ? t(key) : fallback; }

function loadThree() {
  if (window.THREE) return Promise.resolve();
  return (cookThreeLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = COOK_THREE_URL; s.integrity = COOK_THREE_SRI; s.crossOrigin = "anonymous"; s.onload = resolve;
    s.onerror = () => { cookThreeLoading = null; reject(new Error("3D library didn't load")); };
    document.head.appendChild(s);
  }));
}

/** Opens the player for a site recipe (recipe pop-up button). */
async function openCookShow(id) {
  cookOpenDialog(cookT("cook.loading", "Inihahanda ang kusina…"));
  try {
    const [detail, compiled] = await Promise.all([
      fetch(`${API_BASE}/api/recipes/${id}`).then((r) => r.json()),
      fetch(`${API_BASE}/api/recipes/compiled?id=${id}`).then((r) => r.json()),
    ]);
    const rec = detail.recipe || {};
    const c = compiled.recipe || {};
    const steps = buildCookScript({
      title: rec.title, lines: c.lines || rec.ingredients || [], instructions: (rec.instructions || []).map((s) => s.text),
      methodNotes: rec.methodNotes, frying: c.method && c.method.frying,
    });
    // A dish with an unpriced main ingredient shows no price (the site flags it "Incomplete price").
    cookStart(rec.title || "", steps, c.costGaps && c.costGaps.items && c.costGaps.items.length ? null : c.costPerServing, `r${id}`);
  } catch (e) {
    cookFail(e.message);
  }
}

/** Opens the player for the dish being edited in Ulam ko. */
function openCookShowDish() {
  if (typeof currentDish === "undefined" || !currentDish) return;
  const lines = typeof lastResult !== "undefined" && lastResult && lastResult.lines ? lastResult.lines : currentDish.lines;
  const from = currentDish.fromRecipeId;
  cookOpenDialog(cookT("cook.loading", "Inihahanda ang kusina…"));
  const go = (instructions, notes) => cookStart(currentDish.title, buildCookScript({ title: currentDish.title, lines, instructions, methodNotes: notes }),
    lastResult && lastResult.summary && !lastResult.summary.costIncomplete ? lastResult.summary.cost : null, `d${currentDish.id || currentDish.fromRecipeId || "new"}`);
  if (!from) return go([], null);
  fetch(`${API_BASE}/api/recipes/${from}`).then((r) => r.json())
    .then((d) => go(((d.recipe && d.recipe.instructions) || []).map((s) => s.text), d.recipe && d.recipe.methodNotes))
    .catch(() => go([], null));
}

function cookOpenDialog(message) {
  let dlg = document.getElementById("cook-dialog");
  if (!dlg) {
    dlg = document.createElement("div");
    dlg.id = "cook-dialog";
    dlg.className = "cook-dialog";
    dlg.addEventListener("click", (e) => { if (e.target === dlg) closeCookShow(); });
    document.body.appendChild(dlg);
  }
  dlg.innerHTML = `
    <div class="cook-panel" role="dialog" aria-modal="true" aria-labelledby="cook-title">
      <div class="cook-head">
        <div class="min-w-0"><p class="cook-kicker">🎬 ${escapeHtml(cookT("cook.title", "Panoorin kung paano"))}</p><h2 id="cook-title" tabindex="-1" data-dlg-focus class="cook-name">${escapeHtml(message)}</h2></div>
        <button type="button" onclick="closeCookShow()" class="dlg-x" aria-label="Isara">✕</button>
      </div>
      <div class="cook-stage"><canvas id="cook-canvas" aria-hidden="true"></canvas><p id="cook-hud" class="cook-hud" hidden></p><p id="cook-timer" class="cook-timer" hidden></p><p id="cook-caption" class="cook-caption" aria-live="polite"></p></div>
      <div class="cook-controls">
        <button type="button" class="wx-btn" onclick="cookGo(-1)" aria-label="${escapeHtml(cookT("cook.prev", "Nakaraan"))}">⏮</button>
        <button type="button" class="wx-btn on" id="cook-play" onclick="cookToggle()">▶</button>
        <button type="button" class="wx-btn" onclick="cookGo(1)" aria-label="${escapeHtml(cookT("cook.next", "Susunod"))}">⏭</button>
        <span id="cook-count" class="cook-count"></span>
        <button type="button" class="wx-btn cook-edit-btn" id="cook-edit" onclick="cookEditToggle()">✏️ ${escapeHtml(cookT("cook.edit", "Ayusin ang mga hakbang"))}</button>
      </div>
      <section id="cook-list" class="cook-list-wrap" hidden></section>
      <ol id="cook-steps" class="cook-steps" aria-label="${escapeHtml(cookT("cook.steps", "Mga hakbang"))}"></ol>
      <p class="cook-note">${escapeHtml(cookT("cook.note", "Gawa ng SarapSulit mula sa mga sangkap at paraan ng recipe. Para sa buong paraan, buksan ang orihinal na recipe."))}</p>
    </div>`;
  dlg.classList.add("open");
  document.body.style.overflow = "hidden";
  if (typeof dlgOpen === "function") dlgOpen(dlg.querySelector(".cook-panel"), closeCookShow);
}

function cookFail(msg) {
  const name = document.getElementById("cook-name") || document.getElementById("cook-title");
  if (name) name.textContent = msg;
}

function cookStart(title, built, costPerServing, key) {
  cookStop();
  // The person's own edited steps for this recipe or dish, if saved on this device.
  const saved = key ? cookSavedSteps(key) : null;
  const steps = saved ? cookRestoreSteps(saved, built) : built;
  cookShow = { title, steps, built, key, edited: !!saved, editing: false, i: 0, t: 0, playing: false, cost: costPerServing, last: 0, three: null };
  document.getElementById("cook-title").textContent = title;
  cookRenderSteps();
  cookShowStep();
  cookRenderList(steps);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  loadThree().then(() => {
    if (!cookShow) return;
    cookShow.three = cookBuildScene(window.THREE, document.getElementById("cook-canvas"));
    // Pictures for the shopping list, drawn from the same 3D models.
    const shop = steps[0] && steps[0].kind === "shop" ? steps[0].items : [];
    setTimeout(() => { if (cookShow && cookShow.three) cookFillThumbs(cookShow.three.thumbs(shop)); }, 50);
    cookEnterStep();
    cookShow.playing = !reduce;
    document.getElementById("cook-play").textContent = cookShow.playing ? "⏸" : "▶";
    cookShow.last = performance.now();
    cookShow.raf = requestAnimationFrame(cookFrame);
  }).catch(() => {
    document.querySelector("#cook-dialog .cook-stage").innerHTML = `<p class="cook-caption">${escapeHtml(cookT("cook.textOnly", "Hindi ma-load ang 3D. Heto ang mga hakbang."))}</p>`;
  });
}

// ── Editing the steps (saved on this device) ──

const COOK_STEPS_KEY = "sarapsulit.cooksteps.v1";
const COOK_ADDABLE = ["stir", "boil", "simmer", "cook", "fry", "season", "drain", "chill", "steam", "bake", "grill"];

/** Steps as plain data: item keys instead of objects. Pure, tested. */
function cookSerializeSteps(steps) {
  return steps.map((s) => {
    const o = { kind: s.kind, keys: (s.items || []).map((it) => it.key) };
    for (const f of ["style", "size", "minutes", "vessel", "cold"]) if (s[f] != null && s[f] !== false) o[f] = s[f];
    return o;
  });
}

/** Saved steps back to full steps, matching item keys against the recipe's current ingredients. Pure, tested. */
function cookRestoreSteps(saved, built) {
  const byKey = new Map();
  for (const s of built) for (const it of s.items || []) if (!byKey.has(it.key)) byKey.set(it.key, it);
  const out = [];
  for (const o of saved || []) {
    if (!o || !o.kind) continue;
    const items = (o.keys || []).map((k) => byKey.get(k)).filter(Boolean);
    if (["cut", "peel", "add", "pour", "saute", "mix", "wrap"].includes(o.kind) && !items.length) continue; // that ingredient is gone
    const s = { kind: o.kind, items };
    for (const f of ["style", "size", "minutes", "vessel", "cold"]) if (o[f] != null) s[f] = o[f];
    if (o.kind === "shop") s.items = (built[0] && built[0].kind === "shop" ? built[0].items : items); // the list follows the ingredients
    out.push(s);
  }
  return out.length ? out : built;
}

/** Moves step i by d (-1 up, +1 down); the shopping and serving steps stay first and last. Pure, tested. */
function cookMoveStep(steps, i, d) {
  const j = i + d, fixed = (k) => steps[k] && ["shop", "serve"].includes(steps[k].kind);
  if (j < 0 || j >= steps.length || fixed(i) || fixed(j)) return steps;
  const out = steps.slice(); [out[i], out[j]] = [out[j], out[i]];
  return out;
}

function cookStore() { try { return window.localStorage; } catch { return null; } }
function cookSavedSteps(key) {
  try { const all = JSON.parse(cookStore()?.getItem(COOK_STEPS_KEY) || "{}"); return Array.isArray(all[key]) ? all[key] : null; } catch { return null; }
}
function cookWriteSteps(key, steps) {
  const st = cookStore(); if (!st) return false;
  try {
    const all = JSON.parse(st.getItem(COOK_STEPS_KEY) || "{}");
    if (steps) all[key] = cookSerializeSteps(steps); else delete all[key];
    st.setItem(COOK_STEPS_KEY, JSON.stringify(all)); return true;
  } catch { return false; }
}

function cookRenderSteps() {
  const lang = cookLang(), ed = cookShow.editing, n = cookShow.steps.length;
  const opt = (v, cur, label) => `<option value="${v}"${v === cur ? " selected" : ""}>${escapeHtml(label)}</option>`;
  document.getElementById("cook-steps").innerHTML = cookShow.steps.map((s, i) => {
    const fixed = ["shop", "serve"].includes(s.kind);
    const head = `<span class="cook-step-n">${i + 1}</span><span class="cook-step-ico" aria-hidden="true">${escapeHtml(cookStepIcon(s))}</span><span class="min-w-0">${escapeHtml(cookCaption(s, lang))}</span>`;
    if (!ed) return `<li><button type="button" class="cook-step" data-i="${i}" onclick="cookJump(${i})">${head}</button></li>`;
    const style = s.kind === "cut" ? `<select class="cook-in" aria-label="${escapeHtml(cookT("cook.cutStyle", "Paraan ng paghiwa"))}" onchange="cookEditSet(${i}, 'style', this.value)">${Object.keys(COOK_STYLE_TEXT).map((k) => opt(k, s.style, COOK_STYLE_TEXT[k][lang === "en" ? 1 : 0])).join("")}</select>
      <label class="cook-in-l"><input class="cook-in cook-num" type="number" min="0" max="20" step="0.5" value="${s.size ?? ""}" placeholder="cm" onchange="cookEditSet(${i}, 'size', this.value)"> cm</label>` : "";
    const time = COOK_TIMED.has(s.kind) ? `<label class="cook-in-l"><input class="cook-in cook-num" type="number" min="0" max="2880" step="1" value="${s.minutes ?? ""}" onchange="cookEditSet(${i}, 'minutes', this.value)"> ${escapeHtml(cookT("cook.min", "min"))}</label>` : "";
    const tools = fixed ? "" : `<span class="cook-tools">
      <button type="button" class="cook-tool" onclick="cookEditMove(${i}, -1)" aria-label="${escapeHtml(cookT("cook.up", "Itaas"))}"${i <= 1 ? " disabled" : ""}>↑</button>
      <button type="button" class="cook-tool" onclick="cookEditMove(${i}, 1)" aria-label="${escapeHtml(cookT("cook.down", "Ibaba"))}"${i >= n - 2 ? " disabled" : ""}>↓</button>
      <button type="button" class="cook-tool" onclick="cookEditRemove(${i})" aria-label="${escapeHtml(cookT("cook.remove", "Alisin"))}">🗑</button></span>`;
    return `<li class="cook-edit-row${i === cookShow.i ? " on" : ""}"><div class="cook-edit-top">${head}${tools}</div>${style || time ? `<div class="cook-edit-in">${style}${time}</div>` : ""}</li>`;
  }).join("") + (ed ? `<li class="cook-edit-foot">
      <label class="cook-in-l">${escapeHtml(cookT("cook.addStep", "Magdagdag ng hakbang"))}: <select class="cook-in" id="cook-add-kind">${COOK_ADDABLE.map((k) => opt(k, "", cookCaption({ kind: k, items: [] }, lang))).join("")}</select></label>
      <button type="button" class="wx-btn" onclick="cookEditAdd()">＋</button>
      <span class="cook-edit-actions"><button type="button" class="wx-btn on" onclick="cookEditSave()">💾 ${escapeHtml(cookT("cook.save", "I-save sa device na ito"))}</button>
      ${cookShow.edited ? `<button type="button" class="wx-btn" onclick="cookEditReset()">↺ ${escapeHtml(cookT("cook.reset", "Ibalik sa orihinal"))}</button>` : ""}</span>
      <span id="cook-edit-msg" class="cook-edit-msg" role="status"></span></li>` : "");
  document.getElementById("cook-steps").classList.toggle("editing", ed);
  const eb = document.getElementById("cook-edit");
  if (eb) { eb.textContent = ed ? `✓ ${cookT("cook.editDone", "Tapos na")}` : `✏️ ${cookT("cook.edit", "Ayusin ang mga hakbang")}`; eb.setAttribute("aria-pressed", ed ? "true" : "false"); }
}

function cookStepsChanged() {
  cookShow.i = Math.min(cookShow.i, cookShow.steps.length - 1); cookShow.t = 0;
  cookRenderSteps(); cookShowStep(); cookEnterStep();
}
function cookEditToggle() { if (!cookShow) return; cookShow.editing = !cookShow.editing; if (cookShow.editing) cookShow.playing = false; const pb = document.getElementById("cook-play"); if (pb) pb.textContent = cookShow.playing ? "⏸" : "▶"; cookRenderSteps(); }
function cookEditMove(i, d) { cookShow.steps = cookMoveStep(cookShow.steps, i, d); if (cookShow.i === i) cookShow.i = i + d; cookStepsChanged(); }
function cookEditRemove(i) { if (["shop", "serve"].includes(cookShow.steps[i].kind)) return; cookShow.steps = cookShow.steps.filter((_, k) => k !== i); cookStepsChanged(); }
function cookEditSet(i, field, value) {
  const s = { ...cookShow.steps[i] };
  if (field === "style") s.style = value;
  else { const n = parseFloat(value); s[field] = Number.isFinite(n) && n > 0 ? n : null; }
  cookShow.steps = cookShow.steps.map((x, k) => (k === i ? s : x)); cookShow.i = i; cookStepsChanged();
}
function cookEditAdd() {
  const kind = document.getElementById("cook-add-kind").value;
  const at = cookShow.steps.length - 1, prev = cookShow.steps[at - 1] || {};
  const s = { kind, items: [], minutes: COOK_TIMED.has(kind) ? 10 : null, vessel: prev.vessel || "kawali" };
  cookShow.steps = [...cookShow.steps.slice(0, at), s, ...cookShow.steps.slice(at)]; cookShow.i = at; cookStepsChanged();
}
function cookEditSave() {
  const ok = cookWriteSteps(cookShow.key, cookShow.steps);
  if (ok) cookShow.edited = true;
  cookRenderSteps();
  const m = document.getElementById("cook-edit-msg"); if (m) m.textContent = ok ? cookT("cook.saved", "Na-save sa device na ito.") : cookT("cook.notSaved", "Hindi ma-save sa browser na ito.");
}
function cookEditReset() {
  cookWriteSteps(cookShow.key, null); cookShow.edited = false; cookShow.steps = cookShow.built; cookStepsChanged();
}

/** "2 lbs pork belly (note 1)" → "2 lbs pork belly". */
function cookAmountText(it) {
  return String(it.text || "").replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

/** The shopping list: picture, name, amount and price of each ingredient. */
function cookRenderList(steps) {
  const box = document.getElementById("cook-list");
  if (!box) return;
  const shop = steps[0] && steps[0].kind === "shop" ? steps[0].items : [];
  if (!shop.length) { box.hidden = true; return; }
  const en = cookLang() === "en";
  const priced = shop.filter((it) => it.cost != null);
  const total = priced.reduce((a, it) => a + it.cost, 0);
  box.innerHTML = `
    <h3 class="cook-list-h">🧺 ${escapeHtml(cookT("cook.list", en ? "Shopping list" : "Listahan ng bibilhin"))}</h3>
    <ul class="cook-list">${shop.map((it) => `
      <li class="cook-item"><span class="cook-thumb" data-key="${escapeHtml(it.key)}" aria-hidden="true">${escapeHtml(it.icon)}</span>
        <span class="min-w-0"><span class="cook-item-name">${escapeHtml(it.label)}</span><span class="cook-item-amt">${escapeHtml(cookAmountText(it))}</span></span>
        <span class="cook-item-cost">${it.cost != null ? `₱${it.cost < 10 ? it.cost.toFixed(2) : Math.round(it.cost)}` : it.toTaste ? "" : "—"}</span></li>`).join("")}
    </ul>
    <p class="cook-list-total">${priced.length ? `${escapeHtml(cookT("cook.listTotal", en ? "Total for the whole dish" : "Kabuuan para sa buong ulam"))}: <b>₱${Math.round(total)}</b>` : ""}${priced.length < shop.filter((it) => !it.toTaste).length ? ` <span class="cook-list-gap">· ${escapeHtml(cookT("cook.listGap", en ? "— = no price yet" : "— = wala pang presyo"))}</span>` : ""}</p>`;
  box.hidden = false;
}

function cookFillThumbs(map) {
  if (!map) return;
  document.querySelectorAll("#cook-list .cook-thumb").forEach((el) => {
    const url = map.get(el.dataset.key);
    if (url) el.innerHTML = `<img src="${url}" alt="" width="48" height="48">`;
  });
}

function cookStepIcon(s) {
  return { shop: "🧺", peel: "🧽", cut: "🔪", marinate: "🥣", heat: "🔥", saute: "🍳", add: "➕", pour: "🫗", boil: "♨️", simmer: "♨️",
    fry: "🍳", deepfry: "🛢️", grill: "🔥", bake: "🔥", steam: "♨️", stir: "🥄", mix: "🥣", wrap: "🌯", cook: "♨️", chill: "🧊", season: "🧂", drain: "🧻", serve: "🍽️" }[s.kind] || "•";
}

function cookShowStep() {
  const s = cookShow.steps[cookShow.i];
  document.getElementById("cook-caption").textContent = `${cookShow.i + 1}. ${cookCaption(s, cookLang())}`;
  document.getElementById("cook-count").textContent = `${cookShow.i + 1} / ${cookShow.steps.length}`;
  document.querySelectorAll("#cook-steps .cook-step").forEach((b) => {
    const on = Number(b.dataset.i) === cookShow.i;
    b.classList.toggle("on", on);
    if (on) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
  });
  const cur = document.querySelector("#cook-steps .cook-step.on");
  if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
}

function cookToggle() {
  if (!cookShow) return;
  cookShow.playing = !cookShow.playing;
  if (cookShow.playing && cookShow.i === cookShow.steps.length - 1 && cookShow.t >= cookStepLength(cookShow.steps[cookShow.i])) cookJump(0);
  document.getElementById("cook-play").textContent = cookShow.playing ? "⏸" : "▶";
}

function cookGo(d) { if (cookShow) cookJump(Math.max(0, Math.min(cookShow.steps.length - 1, cookShow.i + d))); }
function cookJump(i) { if (!cookShow) return; cookShow.i = i; cookShow.t = 0; cookShowStep(); cookEnterStep(); }

function closeCookShow() {
  cookStop();
  const dlg = document.getElementById("cook-dialog");
  if (!dlg) return;
  dlg.classList.remove("open");
  document.body.style.overflow = document.getElementById("recipe-modal")?.classList.contains("open") ? "hidden" : "";
  if (typeof dlgClose === "function") dlgClose(dlg.querySelector(".cook-panel"));
}

function cookStop() {
  if (!cookShow) return;
  cancelAnimationFrame(cookShow.raf);
  if (cookShow.three) cookShow.three.dispose();
  cookShow = null;
}

/** Seconds a step plays: the shopping step grows with the list; cooking steps get time for the clock. */
function cookStepLength(s) {
  if (s.kind === "shop") return Math.min(9, 1.6 + 0.55 * s.items.length);
  if (COOK_TIMED.has(s.kind)) return 5;
  if (["cut", "wrap", "serve"].includes(s.kind)) return 4;
  return 3.6;
}

/** The small labels on the video: an ingredient's name, the time-lapse clock, the price. */
function cookHud(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!text) { if (!el.hidden) el.hidden = true; return; }
  if (el.textContent !== text) el.textContent = text;
  if (el.hidden) el.hidden = false;
}

function cookFrame(now) {
  if (!cookShow) return;
  const dt = Math.min(0.05, (now - cookShow.last) / 1000);
  cookShow.last = now;
  if (cookShow.playing && !document.hidden) {
    cookShow.t += dt;
    const len = cookStepLength(cookShow.steps[cookShow.i]);
    if (cookShow.t >= len) {
      if (cookShow.i < cookShow.steps.length - 1) { cookShow.i++; cookShow.t = 0; cookShowStep(); cookEnterStep(); }
      else { cookShow.t = len; cookShow.playing = false; document.getElementById("cook-play").textContent = "▶"; }
    }
  }
  if (cookShow.three) cookShow.three.update(cookShow.steps[cookShow.i], cookShow.t, cookStepLength(cookShow.steps[cookShow.i]), dt);
  cookShow.raf = requestAnimationFrame(cookFrame);
}

function cookEnterStep() {
  if (cookShow && cookShow.three) cookShow.three.enter(cookShow.steps[cookShow.i], cookShow.i, cookShow.steps, cookShow.cost);
}


// ── Scene: an overhead cooking video ──
// Drawn entirely in code, so nothing else downloads: canvas textures (wood grain, onion skin,
// pork belly layers, leaf veins, fish scales), physically based materials, an environment map
// that makes the steel shine, and soft shadows. The camera glides between the prep row, the
// board, the stove and the plate. No hands: the knife, ladle and bottles move on their own.

function ckRand(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function ckHash(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

/** Which model an ingredient gets. Pure, tested. */
function cookFoodKind(it) {
  const s = `${it.key || ""} ${it.label || ""}`.toLowerCase().replace(/_/g, " ");
  if (it.key === "rolled") return "rolled";
  if (it.water) return "water";
  if (/mussel|tahong|clam|halaan|scallop|snail|kuhol|oyster(?! sauce)|talaba/.test(s)) return "shells";
  if (/crab|alimango|alimasag|lobster|ulang|crayfish/.test(s)) return "crab";
  if (/squid ball|fish ball|kikiam|meatball|bola[- ]bola/.test(s)) return "balls";
  if (/squid|pusit|octopus|calamari/.test(s)) return "squid";
  if (/beer|\bcola\b|soda|mirin|sake|cream|half and half|creamer|evaporated|condensed/.test(s) && !/cream cheese|cream of tartar|whipped|ice cream|sour cream/.test(s)) return "bottle";
  if (/^mix |sinigang mix|soup mix|recipe mix|instant mix|sachet|packet/.test(s)) return "packet";
  if (/vanilla|extract|flavou?ring|food colou?ring|liquor|rum|brandy|whisky|gin\b|sriracha|hot sauce|tabasco|worcestershire/.test(s)) return "bottle";
  if (/mayonnaise|mayo|honey|pulot|relish|mustard|yogh?urt|peanut butter|jam|jelly spread|cream cheese|cheez whiz|nutella|lard|ghee|matamis na bao|sandwich spread/.test(s)) return "jar";
  if (/wrapper/.test(s)) return "wrapper";
  if (/cube|bouillon/.test(s)) return "cube";
  if (it.liquid) return "bottle";
  if (/peppercorn/.test(s)) return "peppercorn";
  if (/sesame|pine nut|cashew|peanut|almond|walnut|pecan|hazelnut|macadamia|pistachio|pili|sunflower seed|pumpkin seed|pepita/.test(s)) return "seeds";
  if (/annatto|atsuete|achuete/.test(s)) return "annatto";
  if (/strawberr|cherry|cranberr|raspberr/.test(s)) return "berries";
  if (/blueberr|grape|ubas/.test(s)) return "grapes";
  if (/caper/.test(s)) return "peas";
  if (/squid ball|fish ball|kikiam|meatball|bola/.test(s)) return "balls";
  if (/pepper flake|chili flake|chili powder|oregano|dill|thyme|rosemary|basil dried|dried herb|italian seasoning|parsley flakes|yeast|grated coconut|desiccated|coconut grated|coconut flakes|cinnamon|nutmeg|clove|cumin|turmeric|curry powder|five spice|star anise|cocoa|baking soda|baking powder|gelatin/.test(s)) return "powder";
  if (/cassava|kamoteng kahoy|ube|purple yam|french fries|hash brown|tater tot/.test(s)) return "root";
  if (/saffron|coriander|cardamom|fennel seed|sage|tarragon|cream of tartar|pancake mix|additive/.test(s)) return "powder";
  if (/miso|pesto|salsa|pico de gallo|guacamole|molasses|refried|sauerkraut|kimchi|pickle|gravy|dressing|thousand island|coleslaw|sour cream|whipped cream|canned pumpkin|pumpkin canned|latik|bagoong|shrimp paste|tomato paste/.test(s)) return "jar";
  if (/shortening/.test(s)) return "butter";
  if (/chocolate|tablea|cacao/.test(s)) return "chocolate";
  if (/marshmallow/.test(s)) return "balls";
  if (/lamb|mutton|venison/.test(s)) return "beef";
  if (/bratwurst|salami|pepperoni/.test(s)) return "sausage";
  if (/snapper|smelt|anchov|maya-maya|dalagang bukid|sapsap/.test(s)) return "fish";
  if (/linguine|miswa|misua|oats|oat bran|wheat bran|hominy|couscous|quinoa/.test(s)) return "grain";
  if (/mixed vegetables|green olive/.test(s)) return "peas";
  if (/black olive|olive|prune|date/.test(s)) return /green/.test(s) ? "peas" : "grapes";
  if (/winged bean|sigarilyas|asparagus/.test(s)) return "beans";
  if (/bamboo shoot|labong|heart of palm|ubod|fennel bulb/.test(s)) return "radish";
  if (/brussels/.test(s)) return "broccoli";
  if (/chive/.test(s)) return "scallion";
  if (/kale|arugula|mint|nori|seaweed|lato|herbs? fresh/.test(s)) return "leafy";
  if (/pimiento|green chile/.test(s)) return "chili";
  if (/avocado|santol|peach|kiwi|mandarin|orange|buko|young coconut|pear|lychee|rambutan|lanzones|chico|atis/.test(s)) return "fruit";
  if (/cherr/.test(s)) return "berries";
  if (/cannellini|beans canned|baked beans/.test(s)) return "pulses";
  if (/roll|muffin|crouton|taco shell/.test(s)) return "bread";
  if (/turkey|duck|quail(?! egg)/.test(s)) return "chicken";
  if (/pig ear|pig.s ear|bagnet|chicharon|lechon|crackling|maskara|tenga/.test(s)) return "pork";
  if (/pie crust|tart shell|tortilla|pita|wrapper dough|puff pastry/.test(s)) return "bread";
  if (/salt|sugar|pepper ground|black pepper|white pepper|powder|seasoning|msg|magic sarap|flour|starch|paprika|cumin/.test(s) && !/bell pepper/.test(s)) return "powder";
  if (/bay leaf|laurel/.test(s)) return "bayleaf";
  if (/garlic|bawang/.test(s)) return "garlic";
  if (/green onion|scallion|spring onion|leek|dahon ng sibuyas/.test(s)) return "scallion";
  if (/onion|sibuyas|shallot/.test(s)) return /red onion|shallot|pulang sibuyas/.test(s) ? "redonion" : "onion";
  if (/ginger|luya/.test(s)) return "ginger";
  if (/tomato|kamatis/.test(s)) return "tomato";
  if (/eggplant|talong/.test(s)) return "eggplant";
  if (/\begg\b|itlog/.test(s)) return "egg";
  if (/shrimp|prawn|hipon/.test(s)) return "shrimp";
  if (/chicken|manok/.test(s)) return "chicken";
  if (/fish|bangus|tilapia|galunggong|tuna|salmon|mackerel|tuyo|dilis|pompano|lapu/.test(s)) return "fish";
  if (/ground|giniling|minced/.test(s) && /pork|beef|meat|chicken/.test(s)) return "mince";
  if (/beef|baka|oxtail|brisket/.test(s)) return "beef";
  if (/pork|meat|belly|ribs|liver|goat|baboy|kasim|liempo|pata/.test(s)) return "pork";
  if (/carrot/.test(s)) return "carrot";
  if (/radish|labanos/.test(s)) return "radish";
  if (/papaya|sayote|chayote|upo|gourd|ampalaya|melon|squash|kalabasa/.test(s)) return "gourd";
  if (/potato|patatas|gabi|taro|kamote|singkamas|turnip|yam/.test(s)) return "root";
  if (/chili|sili|bell pepper|siling/.test(s)) return "chili";
  if (/okra/.test(s)) return "okra";
  if (/sitaw|string bean|green bean|long bean|baguio bean/.test(s)) return "beans";
  if (/pechay|bok choy|kangkong|spinach|malunggay|cabbage|lettuce|leaves|greens|mustasa|parsley|cilantro|kinchay|herb|basil/.test(s)) return "leafy";
  if (/tamarind|sampalok|calamansi|lemon|lime|kamias/.test(s)) return "citrus";
  if (/rice|noodle|pasta|bihon|canton|sotanghon|misua|miki|macaroni|spaghetti|penne|fettuccine/.test(s)) return "grain";
  if (/butter|margarine/.test(s)) return "butter";
  if (/cheese|keso/.test(s)) return "cheese";
  if (/tofu|tokwa/.test(s)) return "tofu";
  if (/\bham\b|hamon|bacon/.test(s)) return "ham";
  if (/chorizo|hotdog|hot dog|sausage|longganisa|longanisa|vienna/.test(s)) return "sausage";
  if (/peas|edamame/.test(s)) return "peas";
  if (/corn|mais/.test(s)) return "corn";
  if (/raisin|pasas/.test(s)) return "raisins";
  if (/tapioca|sago|nata de coco|kaong|gulaman|jelly|pearl/.test(s)) return "sago";
  if (/mung|monggo|chickpea|garbanzo|kidney bean|red bean|white bean/.test(s)) return "pulses";
  if (/guava|bayabas|mango|mangga|jackfruit|langka|pineapple|pinya|papaya ripe|fruit cocktail|apple|melon/.test(s)) return "fruit";
  if (/banana|saging|saba|plantain/.test(s)) return "banana";
  if (/mushroom|kabute|shiitake/.test(s)) return "mushroom";
  if (/broccoli|cauliflower/.test(s)) return /cauli/.test(s) ? "cauliflower" : "broccoli";
  if (/bread|bun|pandesal|crumb|panko|cracker|graham|biscuit/.test(s)) return "bread";
  if (/celery|snow pea|snap pea|cucumber|pipino|zucchini/.test(s)) return "beans";
  return "misc";
}

// Skin (outside), flesh (cut face) and done (well browned or fully cooked) colours.
const CK_LOOK = {
  onion: ["#b97a3b", "#f3eedb", "#c98d48"], redonion: ["#7d2a46", "#efe1e6", "#9a5a4a"], garlic: ["#efe7d9", "#f7efd4", "#cf9a4c"],
  ginger: ["#c39a63", "#f0d78f", "#c99a40"], tomato: ["#c9271d", "#e4553c", "#a7381f"], pork: ["#efc6b4", "#d98d86", "#7c4a24"],
  beef: ["#9a2e2a", "#a8413b", "#4e2f1f"], mince: ["#dc958e", "#dc958e", "#95653f"], chicken: ["#f0d3a6", "#f1c7b6", "#c48a45"],
  fish: ["#a3abb1", "#f2e6de", "#bb8a46"], shrimp: ["#a9a79c", "#e9d8ca", "#f1773f"], carrot: ["#e8721d", "#f28b2d", "#d86e1d"],
  radish: ["#f3f1ea", "#f8f6ef", "#e2d7b4"], root: ["#a77c53", "#f1e6cc", "#d7b06a"], gourd: ["#5d9a3a", "#e7f0c9", "#c2d398"],
  eggplant: ["#4a1e4f", "#efe4c4", "#7a573a"], chili: ["#3d8f2b", "#cfe4a6", "#386e24"], beans: ["#4c8f2d", "#a9d07a", "#3b7325"],
  okra: ["#5e9b3a", "#d9ebb0", "#45792b"], leafy: ["#3e8a35", "#d8edc1", "#2e6a29"], scallion: ["#56a23c", "#eef5dc", "#3e7b2d"],
  egg: ["#ead3b1", "#f6c84a", "#efd27a"], bayleaf: ["#7c8b4b", "#7c8b4b", "#5f6b38"], citrus: ["#7b9b3b", "#d9c271", "#99894a"],
  wrapper: ["#f2e7ca", "#f2e7ca", "#c98a3a"], rolled: ["#ead6a6", "#ead6a6", "#b9772e"], grain: ["#f4f1ea", "#f4f1ea", "#f4f1ea"],
  cube: ["#d6a72c", "#c9a46a", "#c9a46a"], powder: ["#f5f2ea", "#f5f2ea", "#f5f2ea"], peppercorn: ["#2b231d", "#2b231d", "#2b231d"],
  misc: ["#c9b48a", "#e8dcc0", "#b08a50"],
  butter: ["#f2d46a", "#f4dc80", "#d9a441"], cheese: ["#f0c13a", "#f4d060", "#d9902a"], tofu: ["#f3eee0", "#f6f2e6", "#c98e3e"],
  ham: ["#e59a96", "#eaa9a4", "#b8683e"], sausage: ["#a8392b", "#c4594a", "#6e2a1e"], peas: ["#5f9e3c", "#7ab34e", "#4e8a31"],
  corn: ["#f2c230", "#f5cf52", "#d99a28"], raisins: ["#4a2a2c", "#5b3436", "#3a2022"], sago: ["#eef0ee", "#f4f5f2", "#e8e2d0"],
  pulses: ["#4f7a33", "#d9c58a", "#8a6a3a"], fruit: ["#f2b632", "#f6c44a", "#d9902a"], banana: ["#f0cf45", "#f6ead0", "#c98a3a"],
  mushroom: ["#b49478", "#efe4d6", "#7a5636"], broccoli: ["#3f7d2c", "#8ab865", "#2f5e22"], cauliflower: ["#f1ede0", "#f5f1e6", "#d9b06a"],
  bread: ["#d8a057", "#f2e2c0", "#a8642a"],
  seeds: ["#e8d6a8", "#efe2c0", "#c99a52"], annatto: ["#b5341f", "#c4462a", "#8a2614"], berries: ["#c8202f", "#e04a52", "#9a1a24"],
  grapes: ["#3b3f8f", "#5a5fae", "#2b2e6a"], balls: ["#efe2c8", "#f3e9d4", "#c99248"], packet: ["#e5b53a", "#e5b53a", "#e5b53a"],
  jar: ["#f4efe2", "#f4efe2", "#f4efe2"],
  shells: ["#2a2a3a", "#f0c98a", "#e8a85a"], crab: ["#5a6a5a", "#f4e4d0", "#e2552a"], squid: ["#efe6e0", "#f6efe9", "#e0b480"],
  chocolate: ["#4a2a1c", "#5a3424", "#3a2016"], water: ["#d8e6ea", "#d8e6ea", "#d8e6ea"], bottle: ["#8a5a2a", "#8a5a2a", "#8a5a2a"],
};

/** Liquid colour and how strongly it tints a pot. */
function cookLiquidLook(it) {
  const s = `${it.key || ""} ${it.label || ""}`.toLowerCase();
  if (it.water) return /rice wash/.test(s) ? ["#e9e4d6", 0.6] : ["#cfe0e6", 0.25];
  if (/soy|toyo/.test(s)) return ["#2b1408", 3];
  if (/oyster/.test(s)) return ["#3a2112", 2.5];
  if (/fish sauce|fish_sauce|patis/.test(s)) return ["#a6581c", 1.2];
  if (/vinegar|suka/.test(s)) return ["#efe8d2", 0.35];
  if (/coconut|gata/.test(s)) return ["#f3eee2", 2];
  if (/milk|cream/.test(s)) return ["#f7f3ea", 2];
  if (/oil/.test(s)) return ["#e7bf47", 0.6];
  if (/vanilla|extract|rum|brandy|whisky|worcestershire/.test(s)) return ["#4a2614", 1.5];
  if (/sriracha|hot sauce|tabasco|food colou?ring/.test(s)) return ["#c0261a", 2];
  if (/gin\b|liquor|flavou?ring/.test(s)) return ["#f0ead8", 0.3];
  if (/tomato|ketchup|banana sauce/.test(s)) return ["#b2271b", 2.2];
  if (/broth|stock/.test(s)) return ["#d4a456", 1];
  return ["#8a5a2a", 1];
}

/** Fruit skin colour by name (the fruit model is shared). */
function cookFruitColor(it) {
  const s = `${it.key || ""} ${it.label || ""}`.toLowerCase();
  const table = [[/avocado/, "#3d5a22"], [/kiwi|chico|santol/, "#8a6a3e"], [/orange|mandarin|dalandan|ponkan/, "#e8851e"], [/apple/, "#b8232a"], [/guava|bayabas|buko|young coconut/, "#7aa23a"],
    [/peach/, "#f0a36a"], [/pear/, "#c9c25a"], [/lychee|rambutan/, "#c0392b"], [/lanzones|langka|jackfruit|pineapple|pinya|melon/, "#d9b24a"], [/atis/, "#8fb35a"]];
  const hit = table.find(([re]) => re.test(s));
  return hit ? hit[1] : null;
}

/** What's in a jar: colour and how glossy. */
function cookJarLook(it) {
  const s = `${it.key || ""} ${it.label || ""}`.toLowerCase();
  if (/honey|pulot/.test(s)) return ["#c9861c", 0.1, true];
  if (/relish/.test(s)) return ["#7a8a2a", 0.4];
  if (/mustard/.test(s)) return ["#d9a521", 0.3];
  if (/peanut butter/.test(s)) return ["#b07a3c", 0.5];
  if (/jam|matamis na bao|nutella/.test(s)) return /nutella/.test(s) ? ["#4a2a1a", 0.3] : ["#8a3a1e", 0.2];
  if (/cheez|cheese/.test(s)) return ["#f0b62e", 0.3];
  if (/pesto|guacamole/.test(s)) return ["#5a7a2a", 0.4];
  if (/kimchi|salsa|pico|tomato paste|gravy/.test(s)) return /gravy/.test(s) ? ["#7a4a24", 0.2] : ["#b3301e", 0.35];
  if (/molasses|miso|latik/.test(s)) return ["#4a2a14", 0.2];
  if (/bagoong|shrimp paste/.test(s)) return ["#a0503a", 0.4];
  if (/pickle|sauerkraut|coleslaw/.test(s)) return ["#c9c48a", 0.4];
  if (/pumpkin|refried/.test(s)) return /pumpkin/.test(s) ? ["#d9821e", 0.4] : ["#7a4a2a", 0.5];
  if (/lard|ghee/.test(s)) return ["#f4ecd2", 0.5];
  return ["#f6f1e2", 0.35]; // mayonnaise, yogurt, sandwich spread
}

/** The word on a bottle's label (generic, never a brand). */
function cookBottleWord(it) {
  const s = `${it.key || ""} ${it.label || ""}`.toLowerCase();
  if (/soy|toyo/.test(s)) return "TOYO";
  if (/oyster/.test(s)) return "OYSTER";
  if (/fish sauce|fish_sauce|patis/.test(s)) return "PATIS";
  if (/vinegar|suka/.test(s)) return "SUKA";
  if (/sesame/.test(s)) return "SESAME";
  if (/vanilla/.test(s)) return "VANILLA";
  if (/sriracha|hot sauce|tabasco/.test(s)) return "HOT";
  if (/worcestershire/.test(s)) return "SAUCE";
  if (/food colou?ring/.test(s)) return "COLOR";
  if (/extract|flavou?ring/.test(s)) return "FLAVOR";
  if (/rum|brandy|whisky|gin\b|liquor|wine/.test(s)) return "ALAK";
  if (/oil/.test(s)) return "MANTIKA";
  if (/coconut|gata/.test(s)) return "GATA";
  if (/ketchup|tomato|banana/.test(s)) return "SAUCE";
  return "SAWSAWAN";
}

function cookPowderColor(it) {
  const s = `${it.key || ""} ${it.label || ""}`.toLowerCase();
  if (/black pepper|pepper_ground|paminta/.test(s)) return "#4b4038";
  if (/magic|sarap|msg|seasoning|bouillon/.test(s)) return "#e2c56c";
  if (/garlic/.test(s)) return "#e8d8a8";
  if (/paprika|chili|pepper flake/.test(s)) return "#b8432a";
  if (/oregano|dill|thyme|rosemary|basil|herb|italian|parsley/.test(s)) return "#6f7f3a";
  if (/cinnamon|nutmeg|clove|cumin|five spice|star anise/.test(s)) return "#8a5a32";
  if (/turmeric|curry/.test(s)) return "#d9a521";
  if (/cocoa/.test(s)) return "#4a2c1e";
  if (/yeast/.test(s)) return "#d8c08a";
  if (/brown sugar/.test(s)) return "#a8743c";
  return "#f7f5ef";
}

// Where things sit on the table (metres; the table top is y = 0).
const CK_AT = { board: [-0.72, 0.2], bowl: [-1.45, 0.28], stove: [0.32, 0.14], rack: [0.98, 0.02], plate: [1.42, 0.38] };
function ckPrepSpot(i) { return [-1.5 + (i % 8) * 0.42, i < 8 ? -0.62 : -0.34]; }

/** Replays steps 0..upto-1: where every ingredient is, what's in the pot, how browned things are. */
function cookState(steps, upto) {
  const items = (steps[0] && steps[0].kind === "shop" ? steps[0].items : []).slice();
  for (const s of steps) for (const it of s.items || []) if (it.water && !items.includes(it)) items.push(it);
  const st = { items: items.slice(), loc: new Map(), cut: new Map(), brown: new Map(), parts: [], level: 0, oil: 0, vessel: null, heat: false, bowlLiquid: null, served: null };
  for (const it of items) st.loc.set(it, "prep");
  for (let i = 0; i < Math.min(upto, steps.length); i++) cookApply(st, steps[i]);
  return st;
}

function cookApply(st, s) {
  const potKinds = ["heat", "saute", "add", "pour", "fry", "deepfry", "boil", "simmer", "cook", "stir", "season", "grill", "bake", "steam"];
  for (const it of s.items || []) if (!st.loc.has(it)) { st.items.push(it); st.loc.set(it, "board"); }
  if (potKinds.includes(s.kind) && s.vessel) {
    if (st.vessel && st.vessel !== s.vessel) { st.parts = []; st.level = 0; st.oil = 0; }
    st.vessel = s.vessel;
  }
  const toPot = (it) => {
    if (it.liquid && !it.fryOil) { st.parts.push(cookLiquidLook(it).concat([it.water ? 0.4 : 0.1])); st.level = Math.min(0.85, st.level + (it.water ? 0.4 : 0.1)); }
    else if (it.fryOil) st.oil = Math.max(st.oil, 0.18);
    else {
      if (st.loc.get(it) === "bowl" && st.bowlLiquid) { st.parts.push([st.bowlLiquid, 3, 0.12]); st.level = Math.min(0.85, st.level + 0.12); st.bowlLiquid = null; }
      st.loc.set(it, "pot");
    }
  };
  const inPot = () => st.items.filter((it) => st.loc.get(it) === "pot");
  const brown = (list, by) => { for (const it of list) st.brown.set(it, Math.min(1, (st.brown.get(it) || 0) + by)); };
  switch (s.kind) {
    case "cut": for (const it of s.items) { st.cut.set(it, s.style); if (st.loc.get(it) !== "prep") st.loc.set(it, "board"); } break;
    case "mix": case "marinate":
      for (const it of s.items) { if (it.liquid) st.bowlLiquid = cookLiquidLook(it)[0]; else st.loc.set(it, "bowl"); }
      break;
    case "wrap":
      for (const it of st.items) if (st.loc.get(it) === "bowl" || s.items.includes(it)) st.loc.set(it, "wrapped");
      st.rolled = true;
      break;
    case "heat": st.heat = true; if (st.items.some((it) => it.fryOil)) st.oil = Math.max(st.oil, 0.18); break;
    case "saute": case "add": case "pour":
      // Before the stove is on, "add" after a "mix" goes into the mixing bowl (lumpia filling).
      if (!st.heat && s.kind !== "saute" && st.items.some((it) => st.loc.get(it) === "bowl")) { for (const it of s.items) if (!it.liquid) st.loc.set(it, "bowl"); break; }
      s.items.forEach(toPot); if (s.kind === "saute") brown(s.items.filter((it) => !it.liquid), 0.35); break;
    case "fry": s.items.forEach(toPot); brown(inPot(), 0.7); break;
    case "deepfry": st.oil = 0.8; s.items.forEach(toPot); brown(s.items.length ? s.items : inPot(), 1); break;
    case "boil": case "simmer": case "cook":
      s.items.forEach(toPot);
      if (s.minutes >= 30 && st.level > 0.2) st.level = Math.max(0.2, st.level * 0.8);
      if (st.level > 0) st.parts.push(["#d6a35a", Math.min(2, (s.minutes || 15) / 20), 0]);
      // Meat stewed in a dark sauce (adobo, humba) takes on its colour.
      if (st.level > 0 && cookMixLum(st.parts) < 0.5) brown(inPot().filter((it) => ["pork", "beef", "chicken"].includes(cookFoodKind(it))), Math.min(0.85, (s.minutes || 20) / 35));
      break;
    case "season": for (const it of s.items) { if (it.liquid) toPot(it); else st.loc.set(it, "used"); } break;
    // Only the food comes out; spices and leaves go with the water.
    case "drain": for (const it of inPot()) st.loc.set(it, ["peppercorn", "bayleaf", "powder", "cube", "misc", "citrus"].includes(cookFoodKind(it)) ? "used" : "rack"); if (st.vessel === "kaldero") { st.level = 0; st.parts = []; } break;
    case "serve":
      for (const it of st.items) if (["pot", "rack"].includes(st.loc.get(it)) || (s.cold && st.loc.get(it) === "bowl") || (st.loc.get(it) === "board" && st.brown.get(it))) st.loc.set(it, "plate");
      st.served = st.level > 0.25 || (s.cold && st.items.some((it) => /cream|milk|mayonnaise|yogurt|gata|coconut/.test(it.key))) ? "bowl" : "plate";
      break;
    default: break;
  }
  return st;
}

function cookMixLum(parts) {
  const n = parseInt(cookMixColor(parts).slice(1), 16);
  return (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255;
}

/** The pot's liquid colour: a weighted mix of what was poured in. */
function cookMixColor(parts) {
  let r = 0, g = 0, b = 0, w = 0;
  for (const [hex, strength, amount] of parts) {
    const n = parseInt(hex.slice(1), 16), k = strength * Math.max(0.05, amount || 0.1);
    r += ((n >> 16) & 255) * k; g += ((n >> 8) & 255) * k; b += (n & 255) * k; w += k;
  }
  if (!w) return "#cfe0e6";
  const h = (x) => Math.round(x / w).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function cookBuildScene(THREE, canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b2119).convertSRGBToLinear();
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.05, 30);
  const statics = [];
  const keep = (x) => { statics.push(x); return x; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // Colours are written in sRGB; the renderer works in linear light.
  const col = (hex) => new THREE.Color(hex).convertSRGBToLinear();

  // Reflections for steel and glaze: a soft room with two bright windows, prefiltered once.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envMats = [];
  const envMesh = (geo, color) => { const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide }); envMats.push(m); const o = new THREE.Mesh(geo, m); envScene.add(o); return o; };
  envMesh(new THREE.BoxGeometry(12, 6, 12), 0x2e261f);
  const win = (x, z, w, d) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.85, 2.6), side: THREE.DoubleSide }); envMats.push(m); const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); o.rotation.x = Math.PI / 2; o.position.set(x, 2.9, z); envScene.add(o); };
  win(-2, -1, 3, 2); win(2.5, 2, 2, 2);
  const envRT = pmrem.fromScene(envScene, 0.03);
  scene.environment = envRT.texture;
  envScene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  envMats.forEach((m) => m.dispose());
  pmrem.dispose();

  // Light: a big soft window light with shadows, plus warm fill.
  scene.add(new THREE.HemisphereLight(0xfff3e2, 0x3b2b1c, 0.22));
  const key = new THREE.DirectionalLight(0xfff1e0, 1.45);
  key.position.set(-1.4, 3.4, 1.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -2.4, right: 2.4, top: 1.8, bottom: -1.8, near: 0.5, far: 8 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.01; key.shadow.radius = 5;
  scene.add(key);

  // ── Textures, all painted on canvases ──
  const texCache = new Map();
  const tex = (id, size, draw, repeat) => {
    if (texCache.has(id)) return texCache.get(id);
    const c = document.createElement("canvas"); c.width = c.height = size;
    draw(c.getContext("2d"), size, ckRand(ckHash(id)));
    const t = keep(new THREE.CanvasTexture(c));
    t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    texCache.set(id, t);
    return t;
  };
  const shade = (hex, k) => { const c = col(hex); c.multiplyScalar(k); return `#${c.getHexString()}`; };
  const grain = (light, darkC, lines) => (g, n, r) => {
    g.fillStyle = light; g.fillRect(0, 0, n, n);
    for (let i = 0; i < lines; i++) {
      // Whole waves across the width, so the texture tiles without seams.
      const y = r() * n, amp = 2 + r() * 7, f = (1 + Math.floor(r() * 3)) * 2 * Math.PI / n, ph = r() * 6;
      g.strokeStyle = darkC; g.globalAlpha = 0.03 + r() * 0.12; g.lineWidth = 0.4 + r() * 1.8;
      g.beginPath();
      for (let x = 0; x <= n; x += 4) g.lineTo(x, y + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3 + ph) * amp * 0.25);
      g.stroke();
    }
    for (let i = 0; i < 3; i++) { const x = n * 0.15 + r() * n * 0.7, y = n * 0.15 + r() * n * 0.7; g.globalAlpha = 0.25; g.fillStyle = darkC; g.beginPath(); g.ellipse(x, y, 6 + r() * 6, 2 + r() * 2, 0, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  };
  const speckle = (base, dots, count, size) => (g, n, r) => {
    g.fillStyle = base; g.fillRect(0, 0, n, n);
    for (let i = 0; i < count; i++) {
      g.globalAlpha = 0.08 + r() * 0.35; g.fillStyle = dots[Math.floor(r() * dots.length)];
      const s = (0.3 + r()) * size * n / 256;
      g.beginPath(); g.ellipse(r() * n, r() * n, s, s * (0.4 + r()), r() * 3, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  };
  const streaks = (base, lineC, count) => (g, n, r) => {
    g.fillStyle = base; g.fillRect(0, 0, n, n);
    for (let i = 0; i < count; i++) {
      const x = r() * n; g.strokeStyle = lineC; g.globalAlpha = 0.1 + r() * 0.3; g.lineWidth = 0.6 + r() * 2;
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 20, n / 3, x + (r() - 0.5) * 20, 2 * n / 3, x + (r() - 0.5) * 10, n); g.stroke();
    }
    g.globalAlpha = 1;
  };
  const bands = (list) => (g, n, r) => {
    let y = 0;
    for (const [c, h] of list) {
      const hh = h * n; g.fillStyle = c; g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= n; x += 12) g.lineTo(x, y + Math.sin(x * 0.04 + r() * 0.6) * 3);
      g.lineTo(n, y + hh + 5); g.lineTo(0, y + hh + 5); g.closePath(); g.fill(); y += hh;
    }
    for (let i = 0; i < 500; i++) { g.globalAlpha = 0.06 + r() * 0.12; g.fillStyle = r() < 0.5 ? "#ffffff" : "#7a3b33"; g.fillRect(r() * n, r() * n, 1 + r() * 3, 1 + r() * 2); }
    g.globalAlpha = 1;
  };
  const marble = (base, fat) => (g, n, r) => {
    g.fillStyle = base; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = fat; g.globalAlpha = 0.25 + r() * 0.4; g.lineWidth = 0.8 + r() * 3;
      let x = r() * n, y = r() * n; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
  };
  const leaf = (c1, c2) => (g, n, r) => {
    const grd = g.createLinearGradient(0, 0, n, 0); grd.addColorStop(0, c1); grd.addColorStop(0.5, shade(c1, 1.15)); grd.addColorStop(1, c1);
    g.fillStyle = grd; g.fillRect(0, 0, n, n);
    g.strokeStyle = c2; g.lineWidth = n / 28; g.globalAlpha = 0.9; g.beginPath(); g.moveTo(n / 2, n); g.lineTo(n / 2, 0); g.stroke();
    g.lineWidth = n / 120; g.globalAlpha = 0.45;
    for (let y = n * 0.9; y > 0; y -= n / 9) { g.beginPath(); g.moveTo(n / 2, y); g.quadraticCurveTo(n * 0.3, y - n / 14, 0, y - n / 6); g.moveTo(n / 2, y); g.quadraticCurveTo(n * 0.7, y - n / 14, n, y - n / 6); g.stroke(); }
    for (let i = 0; i < 200; i++) { g.globalAlpha = 0.06; g.fillStyle = r() < 0.5 ? "#ffffff" : "#123d12"; g.fillRect(r() * n, r() * n, 2, 2); }
    g.globalAlpha = 1;
  };
  const scales = (base, line) => (g, n) => {
    const grd = g.createLinearGradient(0, 0, 0, n); grd.addColorStop(0, shade(base, 0.6)); grd.addColorStop(0.5, base); grd.addColorStop(1, "#e9ecee");
    g.fillStyle = grd; g.fillRect(0, 0, n, n); g.strokeStyle = line; g.globalAlpha = 0.35; g.lineWidth = 1;
    for (let y = 0; y < n; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < n; x += 8) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI); g.stroke(); }
    g.globalAlpha = 1;
  };

  const std = (o) => new THREE.MeshStandardMaterial(o.color !== undefined ? { ...o, color: col(o.color) } : o);
  const shadowed = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };

  // ── The kitchen ──
  const table = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(7, 0.06, 4.4)),
    keep(std({ map: tex("table", 1024, grain("#9c6c3d", "#4a2a12", 110), [3, 2]), roughness: 0.62 }))), false);
  table.position.set(0, -0.03, 0); scene.add(table);
  const backsplash = new THREE.Mesh(keep(new THREE.BoxGeometry(7, 1.2, 0.04)), keep(std({
    map: tex("tiles", 512, (g, n, r) => { g.fillStyle = "#e9e3d6"; g.fillRect(0, 0, n, n); g.strokeStyle = "#bdb3a0"; g.lineWidth = 3; for (let i = 0; i <= n; i += n / 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, n); g.moveTo(0, i); g.lineTo(n, i); g.stroke(); } for (let i = 0; i < 300; i++) { g.globalAlpha = 0.05; g.fillStyle = "#8a7a60"; g.fillRect(r() * n, r() * n, 3, 3); } g.globalAlpha = 1; }, [10, 2]),
    roughness: 0.25 })));
  backsplash.position.set(0, 0.6, -1.0); scene.add(backsplash);

  const board = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(0.52, 0.028, 0.36)),
    keep(std({ map: tex("board", 512, grain("#c79660", "#7a4a22", 60)), roughness: 0.55 }))));
  board.position.set(CK_AT.board[0], 0.014, CK_AT.board[1]); scene.add(board);
  const BOARD_Y = 0.028;

  // Stove: a dark enamel top, a burner, a cast-iron grate and a ring of blue flame.
  const stoveTop = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(0.64, 0.03, 0.54)), keep(std({ color: 0x0e0f11, metalness: 0.1, roughness: 0.75, envMapIntensity: 0.4 }))), false);
  stoveTop.position.set(CK_AT.stove[0], 0.015, CK_AT.stove[1]); scene.add(stoveTop);
  const burner = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.06, 0.07, 0.02, 32)), keep(std({ color: 0x2a2a2a, metalness: 0.8, roughness: 0.4 })));
  burner.position.set(CK_AT.stove[0], 0.04, CK_AT.stove[1]); scene.add(burner);
  const iron = keep(std({ color: 0x151515, metalness: 0.6, roughness: 0.55 }));
  const grate = new THREE.Group(); grate.position.set(CK_AT.stove[0], 0.03, CK_AT.stove[1]); scene.add(grate);
  const ring = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(0.19, 0.008, 8, 48)), iron)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; grate.add(ring);
  for (let k = 0; k < 4; k++) { const bar = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(0.16, 0.012, 0.014)), iron)); const a = k * Math.PI / 2; bar.position.set(Math.cos(a) * 0.13, 0.05, Math.sin(a) * 0.13); bar.rotation.y = -a; grate.add(bar); }
  const flameMat = keep(new THREE.MeshBasicMaterial({ color: 0x4a8dff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  const flameGeo = keep(new THREE.ConeGeometry(0.006, 0.035, 6));
  const flames = [];
  for (let k = 0; k < 22; k++) { const f = new THREE.Mesh(flameGeo, flameMat); const a = k / 22 * Math.PI * 2; f.position.set(CK_AT.stove[0] + Math.cos(a) * 0.068, 0.06, CK_AT.stove[1] + Math.sin(a) * 0.068); f.rotation.z = -Math.cos(a) * 0.9; f.rotation.x = Math.sin(a) * 0.9; f.visible = false; scene.add(f); flames.push(f); }
  const VESSEL_Y = 0.09;
  const WOK_Y = VESSEL_Y - 0.004; // the wok's round bottom sits in the grate ring, above the bars

  // Kaldero (steel pot) and kawali (black wok), turned on a lathe.
  const steel = keep(std({ color: 0xeef1f4, metalness: 1, roughness: 0.14, envMapIntensity: 1.7, side: THREE.DoubleSide }));
  const potGeo = keep(new THREE.LatheGeometry([[0, 0], [0.145, 0], [0.152, 0.006], [0.155, 0.02], [0.155, 0.17], [0.162, 0.176], [0.162, 0.181], [0.152, 0.181]].map(([x, y]) => new THREE.Vector2(x, y)), 64));
  const kaldero = new THREE.Group(); kaldero.position.set(CK_AT.stove[0], VESSEL_Y, CK_AT.stove[1]); scene.add(kaldero);
  kaldero.add(shadowed(new THREE.Mesh(potGeo, steel)));
  [-1, 1].forEach((sx) => { const h = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(0.026, 0.006, 8, 20, Math.PI)), steel)); h.position.set(sx * 0.165, 0.14, 0); h.rotation.set(0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0); kaldero.add(h); });
  const wokPts = []; for (let i = 0; i <= 16; i++) { const a = (i / 16) * 0.85; wokPts.push(new THREE.Vector2(0.3 * Math.sin(a), 0.3 * (1 - Math.cos(a)))); }
  const castIron = keep(std({ color: 0x232427, metalness: 0.75, roughness: 0.42, side: THREE.DoubleSide }));
  const kawali = new THREE.Group(); kawali.position.set(CK_AT.stove[0], WOK_Y, CK_AT.stove[1]); scene.add(kawali);
  kawali.add(shadowed(new THREE.Mesh(keep(new THREE.LatheGeometry(wokPts, 64)), castIron)));
  [-1, 1].forEach((sx) => { const h = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(0.03, 0.007, 8, 20, Math.PI)), castIron)); h.position.set(sx * 0.235, 0.095, 0); h.rotation.set(0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0); kawali.add(h); });
  const WOK_R = (y) => 0.3 * Math.sin(Math.acos(Math.max(-1, Math.min(1, 1 - y / 0.3))));

  // Liquid surfaces (broth, oil) that rise and change colour.
  const liquidMat = keep(std({ color: 0xcfe0e6, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.85, envMapIntensity: 1.4 }));
  const liquid = new THREE.Mesh(keep(new THREE.CircleGeometry(1, 64)), liquidMat); liquid.rotation.x = -Math.PI / 2; liquid.receiveShadow = true; scene.add(liquid);

  // Steel mixing bowl, white plate, soup bowl, paper-towel rack.
  const bowlPts = []; for (let i = 0; i <= 14; i++) { const a = (i / 14) * 1.35; bowlPts.push(new THREE.Vector2(0.17 * Math.sin(a), 0.17 * (1 - Math.cos(a)) * 0.75)); }
  const mixBowl = shadowed(new THREE.Mesh(keep(new THREE.LatheGeometry(bowlPts, 48)), keep(std({ color: 0xf4f1ea, roughness: 0.2, side: THREE.DoubleSide })))); mixBowl.position.set(CK_AT.bowl[0], 0.001, CK_AT.bowl[1]); scene.add(mixBowl);
  const bowlLiquidMat = keep(std({ color: 0x2b1408, roughness: 0.08, transparent: true, opacity: 0.9 }));
  const bowlLiquid = new THREE.Mesh(keep(new THREE.CircleGeometry(0.12, 40)), bowlLiquidMat); bowlLiquid.rotation.x = -Math.PI / 2; bowlLiquid.position.set(CK_AT.bowl[0], 0.03, CK_AT.bowl[1]); bowlLiquid.visible = false; scene.add(bowlLiquid);
  const glaze = keep(std({ color: 0xfbfaf6, roughness: 0.18, metalness: 0, side: THREE.DoubleSide }));
  const plate = shadowed(new THREE.Mesh(keep(new THREE.LatheGeometry([[0, 0.004], [0.1, 0.004], [0.13, 0.014], [0.16, 0.024], [0.165, 0.026], [0.16, 0.028], [0.13, 0.018], [0.1, 0.008], [0, 0.008]].map(([x, y]) => new THREE.Vector2(x, y)), 64)), glaze));
  plate.position.set(CK_AT.plate[0], 0, CK_AT.plate[1]); scene.add(plate);
  const soupBowl = shadowed(new THREE.Mesh(keep(new THREE.LatheGeometry([[0, 0], [0.05, 0], [0.06, 0.004], [0.1, 0.04], [0.12, 0.075], [0.124, 0.08], [0.116, 0.078], [0.095, 0.045], [0.055, 0.01], [0, 0.01]].map(([x, y]) => new THREE.Vector2(x, y)), 64)), glaze));
  soupBowl.position.set(CK_AT.plate[0], 0, CK_AT.plate[1]); soupBowl.visible = false; scene.add(soupBowl);
  const soupMat = keep(std({ color: 0xd6a35a, roughness: 0.06, transparent: true, opacity: 0.92 }));
  const soup = new THREE.Mesh(keep(new THREE.CircleGeometry(0.098, 48)), soupMat); soup.rotation.x = -Math.PI / 2; soup.position.set(CK_AT.plate[0], 0.05, CK_AT.plate[1]); soup.visible = false; scene.add(soup);
  const rack = new THREE.Group(); rack.position.set(CK_AT.rack[0], 0, CK_AT.rack[1]); scene.add(rack);
  rack.add(shadowed(new THREE.Mesh(keep(new THREE.LatheGeometry([[0, 0.004], [0.14, 0.004], [0.15, 0.016], [0.145, 0.018], [0, 0.008]].map(([x, y]) => new THREE.Vector2(x, y)), 48)), glaze)));
  const towel = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.2, 0.2, 8, 8)), keep(std({ map: tex("towel", 256, speckle("#fbfbf8", ["#e6e6e0", "#d9d9d2"], 900, 3)), roughness: 0.95, side: THREE.DoubleSide })));
  towel.rotation.x = -Math.PI / 2; towel.rotation.z = 0.4; towel.position.y = 0.012; rack.add(towel);

  // Knife (chef's knife, blade on edge) and a wooden sandok.
  const knife = new THREE.Group(); scene.add(knife);
  const bladeShape = new THREE.Shape(); bladeShape.moveTo(0, 0); bladeShape.lineTo(0.17, 0); bladeShape.quadraticCurveTo(0.215, 0.004, 0.23, 0.03); bladeShape.lineTo(0.0, 0.045); bladeShape.lineTo(0, 0);
  const blade = shadowed(new THREE.Mesh(keep(new THREE.ExtrudeGeometry(bladeShape, { depth: 0.0018, bevelEnabled: false })), keep(std({ color: 0xe8ecef, metalness: 1, roughness: 0.12 }))));
  knife.add(blade);
  const handle = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(0.11, 0.022, 0.016)), keep(std({ color: 0x1d1a18, roughness: 0.35 })))); handle.position.set(-0.055, 0.03, 0.001); knife.add(handle);
  [-0.03, -0.06, -0.09].forEach((x) => { const rv = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.003, 0.003, 0.02, 8)), steel); rv.rotation.x = Math.PI / 2; rv.position.set(x, 0.03, 0.001); knife.add(rv); });
  const knifeRest = () => { knife.position.set(CK_AT.board[0] + 0.05, BOARD_Y + 0.001, CK_AT.board[1] + 0.13); knife.rotation.set(-Math.PI / 2, 0, -0.15); };
  knifeRest();
  const woodMat = keep(std({ map: tex("sandok", 256, grain("#b88550", "#6e4523", 30)), roughness: 0.6 }));
  const sandok = new THREE.Group(); scene.add(sandok);
  const stick = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.007, 0.009, 0.3, 10)), woodMat)); stick.position.y = 0.15; sandok.add(stick);
  const scoop = shadowed(new THREE.Mesh(keep(new THREE.SphereGeometry(0.03, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), woodMat)); scoop.scale.set(1, 0.45, 1.3); scoop.position.y = 0.012; sandok.add(scoop);
  const sandokRest = () => { sandok.position.set(CK_AT.stove[0] + 0.36, 0.012, CK_AT.stove[1] + 0.2); sandok.rotation.set(Math.PI / 2, 0, 0.5); };
  sandokRest();

  // Steam, bubbles and droplets.
  const puffTex = tex("puff", 64, (g, n) => { const gr = g.createRadialGradient(n / 2, n / 2, 1, n / 2, n / 2, n / 2); gr.addColorStop(0, "rgba(255,255,255,.75)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, n, n); });
  const puffs = [];
  for (let i = 0; i < 24; i++) { const p = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 }))); p.userData.seed = (i * 0.618) % 1; scene.add(p); puffs.push(p); }
  const bubbleMat = keep(std({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.55 }));
  const bubbles = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(1, 8, 6)), bubbleMat, 80);
  bubbles.count = 0; scene.add(bubbles);
  const bubbleSeeds = Array.from({ length: 80 }, (_, i) => { const r = ckRand(i + 11); return [r(), r(), r()]; });
  const dropMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const drops = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1, 1, 1)), dropMat, 60); drops.count = 0; scene.add(drops);
  const stream = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.004, 0.006, 1, 8, 1, true)), keep(std({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.85 })));
  stream.visible = false; scene.add(stream);
  const dummy = new THREE.Object3D();

  // ── Ingredient models ──
  // Each returns a group sitting on y = 0, at real size.
  const look = (kind) => CK_LOOK[kind] || CK_LOOK.misc;
  const foodMat = (kind, part, brownAmt, extra = {}) => {
    const L = look(kind);
    const base = col(part === "flesh" ? L[1] : L[0]);
    const m = std({ color: 0xffffff, roughness: 0.55, ...extra });
    const b = CK_BUMP[kind];
    if (b && !extra.noBump) { m.bumpMap = b[0](); m.bumpScale = b[1]; }
    m.userData.crisp = ["pork", "chicken", "rolled", "fish"].includes(kind) && part === "skin";
    m.userData.base = base; m.userData.done = col(L[2]);
    m.userData.b0 = brownAmt || 0;
    ckBrown(m, brownAmt || 0);
    return m;
  };
  function ckBrown(m, amt) {
    if (!m.userData.done) return;
    const from = m.map ? col(0xffffff) : m.userData.base;
    // With a texture, the colour multiplies it: divide out the texture's own colour so the result is the cooked colour.
    const b = m.userData.base, d = m.userData.done;
    const to = m.map ? new THREE.Color(Math.min(1.5, d.r / Math.max(0.05, b.r)), Math.min(1.5, d.g / Math.max(0.05, b.g)), Math.min(1.5, d.b / Math.max(0.05, b.b))) : d;
    m.color.copy(from).lerp(to, Math.max(0, Math.min(1, amt)));
    // Cooked food glistens; fried skin blisters and crackles.
    m.roughness = Math.max(0.18, (m.userData.r0 ?? (m.userData.r0 = m.roughness)) - 0.3 * Math.min(1, amt));
    if (m.userData.crisp && amt > 0.5) {
      if (m.bumpMap !== blisters()) { m.bumpMap = blisters(); m.needsUpdate = true; }
      m.bumpScale = 0.002 + 0.006 * amt;
    }
  }
  const skinTex = (kind) => {
    const L = look(kind);
    switch (kind) {
      case "onion": case "redonion": return tex(`skin-${kind}`, 256, streaks(L[0], shade(L[0], 0.6), 70));
      case "garlic": return tex("skin-garlic", 256, streaks(L[0], "#b9a2a8", 40));
      case "ginger": case "root": return tex(`skin-${kind}`, 256, speckle(L[0], [shade(L[0], 0.7), shade(L[0], 1.2)], 1400, 4));
      case "pork": return tex("skin-pork", 512, bands([["#e9bfa6", 0.12], ["#f3e2d4", 0.2], ["#c9706a", 0.22], ["#efdccd", 0.12], ["#bd605b", 0.34]]));
      case "beef": return tex("skin-beef", 256, marble("#9a2e2a", "#f0d6cf"));
      case "mince": return tex("skin-mince", 256, speckle("#d98f88", ["#f3dcd3", "#b8605c", "#f6e8e0"], 2600, 3));
      case "chicken": return tex("skin-chicken", 256, speckle("#efd2a4", ["#f6e3c4", "#d9b17c"], 1500, 3));
      case "fish": return tex("skin-fish", 256, scales("#9aa3a9", "#5c666c"));
      case "carrot": return tex("skin-carrot", 256, (g, n, r) => { g.fillStyle = L[0]; g.fillRect(0, 0, n, n); g.strokeStyle = "#b85712"; for (let y = 0; y < n; y += 10 + r() * 14) { g.globalAlpha = 0.3; g.lineWidth = 1 + r(); g.beginPath(); g.moveTo(0, y); g.lineTo(n, y + (r() - 0.5) * 6); g.stroke(); } g.globalAlpha = 1; });
      case "leafy": case "bayleaf": return tex(`leaf-${kind}`, 256, leaf(L[0], kind === "leafy" ? "#e9f4d8" : "#a9b27a"));
      case "gourd": return tex("skin-gourd", 256, speckle(L[0], ["#86b85a", "#3f7a28"], 900, 4));
      case "wrapper": case "rolled": return tex(`skin-${kind}`, 256, speckle(L[0], [shade(L[0], 0.92), "#ffffff"], 1200, 3));
      default: return null;
    }
  };
  const mesh = (geo, mat) => shadowed(new THREE.Mesh(geo, mat));
  // Real food is never a perfect box: round the corners toward a sphere and add a gentle lumpiness.
  // The offset depends only on the vertex position, so seams stay closed.
  function organic(geo, round, bump, seed) {
    const p = geo.attributes.position, v = new THREE.Vector3();
    geo.computeBoundingSphere();
    const R = geo.boundingSphere.radius, sd = (seed % 97) * 0.37;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const len = v.length() || 1;
      const n = Math.sin(v.x * 180 + sd) * Math.sin(v.y * 210 + sd * 2) * Math.sin(v.z * 170 + sd * 3) + 0.5 * Math.sin(v.x * 420 + v.z * 380 + sd);
      const target = v.clone().multiplyScalar((R * 0.82) / len);
      v.lerp(target, round).multiplyScalar(1 + bump * n);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }
  const box = (w, h, d, seg = 3) => new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  // Grey-scale relief maps (linear, not colour).
  const bumpTex = (id, draw) => { const t = tex(id, 256, draw); t.encoding = THREE.LinearEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  const blisters = () => bumpTex("bump-blister", (g, n, r) => { g.fillStyle = "#808080"; g.fillRect(0, 0, n, n); for (let i = 0; i < 700; i++) { const x = r() * n, y = r() * n, s = 1.5 + r() * 5; const gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, "rgba(128,128,128,0)"); g.fillStyle = gr; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); } });
  const fibres = () => bumpTex("bump-fibre", (g, n, r) => { g.fillStyle = "#808080"; g.fillRect(0, 0, n, n); for (let i = 0; i < 260; i++) { g.strokeStyle = r() < 0.5 ? "#b0b0b0" : "#505050"; g.globalAlpha = 0.5; g.lineWidth = 1 + r() * 2; const y = r() * n; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(n / 3, y + (r() - 0.5) * 20, 2 * n / 3, y + (r() - 0.5) * 20, n, y + (r() - 0.5) * 10); g.stroke(); } g.globalAlpha = 1; });
  const pores = () => bumpTex("bump-pores", (g, n, r) => { g.fillStyle = "#909090"; g.fillRect(0, 0, n, n); for (let i = 0; i < 1500; i++) { g.fillStyle = r() < 0.6 ? "#606060" : "#b8b8b8"; g.globalAlpha = 0.6; g.beginPath(); g.arc(r() * n, r() * n, 0.6 + r() * 1.6, 0, 7); g.fill(); } g.globalAlpha = 1; });
  const ripples = () => bumpTex("bump-ripple", (g, n, r) => { g.fillStyle = "#808080"; g.fillRect(0, 0, n, n); for (let i = 0; i < 90; i++) { const x = r() * n, y = r() * n, s = 8 + r() * 30; const gr = g.createRadialGradient(x, y, 0, x, y, s); const c = r() < 0.5 ? "255,255,255" : "0,0,0"; gr.addColorStop(0, `rgba(${c},.35)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - s, y - s, 2 * s, 2 * s); } });
  const CK_BUMP = { pork: [fibres, 0.004], beef: [fibres, 0.005], chicken: [pores, 0.003], mince: [pores, 0.004], rolled: [blisters, 0.003], root: [pores, 0.003], ginger: [pores, 0.004], fish: [pores, 0.0015], gourd: [pores, 0.002], citrus: [pores, 0.002] };
  const rippleTex = ripples(); rippleTex.repeat.set(2, 2);
  liquidMat.bumpMap = rippleTex; liquidMat.bumpScale = 0.002;
  soupMat.bumpMap = rippleTex; soupMat.bumpScale = 0.0015; soupMat.envMapIntensity = 1.4; soupMat.roughness = 0.04;
  const ellipsoid = (r, sx, sy, sz, mat, seg = 24) => { const m = mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), mat); m.scale.set(sx, sy, sz); m.position.y = r * sy; return m; };
  const bentLeaf = (w, h, mat, curl) => {
    const geo = new THREE.PlaneGeometry(w, h, 4, 8);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const edge = 1 - Math.abs(x) / (w / 2); p.setX(i, x * (0.25 + 0.75 * Math.sin(Math.PI * (y / h + 0.5)))); p.setZ(i, Math.abs(x) * curl + Math.sin((y / h + 0.5) * Math.PI) * 0.01 * edge); }
    geo.computeVertexNormals();
    const m = mesh(geo, mat); m.rotation.x = -Math.PI / 2; return m;
  };
  const ramekin = (r = 0.055, h = 0.035) => mesh(new THREE.LatheGeometry([[0, 0], [r * 0.82, 0], [r * 0.9, 0.003], [r, h], [r * 0.93, h], [r * 0.82, 0.006], [0, 0.006]].map(([x, y]) => new THREE.Vector2(x, y)), 36), glaze);

  function wholeModel(it, brownAmt) {
    const kind = cookFoodKind(it), g = new THREE.Group(), r = ckRand(ckHash(it.key));
    const skin = () => foodMat(kind, "skin", brownAmt, { map: skinTex(kind) || null, roughness: kind === "tomato" || kind === "eggplant" || kind === "chili" ? 0.28 : 0.6 });
    switch (kind) {
      case "onion": case "redonion": {
        const n = it.text && /\b([2-9])\b/.test(it.text) ? 2 : 1;
        for (let k = 0; k < n; k++) { const o = ellipsoid(0.04, 1, 0.88, 1, skin()); o.position.x = k * 0.085; g.add(o); const tip = mesh(new THREE.ConeGeometry(0.008, 0.022, 8), o.material); tip.position.set(k * 0.085, 0.078, 0); g.add(tip); }
        break;
      }
      case "garlic": {
        const m = skin();
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; const c = ellipsoid(0.014, 1, 1.5, 1.1, m, 12); c.position.set(Math.cos(a) * 0.015, 0, Math.sin(a) * 0.015); c.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); g.add(c); }
        const tip = mesh(new THREE.ConeGeometry(0.006, 0.02, 8), m); tip.position.y = 0.045; g.add(tip);
        break;
      }
      case "ginger": { const m = skin(); for (let k = 0; k < 5; k++) { const e = ellipsoid(0.016 + r() * 0.008, 1.8, 0.8, 1, m, 12); e.position.set((r() - 0.5) * 0.06, 0, (r() - 0.5) * 0.04); e.rotation.y = r() * 3; g.add(e); } break; }
      case "tomato": {
        const n = 3;
        for (let k = 0; k < n; k++) {
          const t = ellipsoid(0.034, 1, 0.86, 1, foodMat(kind, "skin", brownAmt, { roughness: 0.22 })); t.position.set((k % 2) * 0.07, 0, Math.floor(k / 2) * 0.07); g.add(t);
          const calyx = mesh(new THREE.ConeGeometry(0.014, 0.006, 5), std({ color: 0x3d7a2a, roughness: 0.6 })); calyx.position.set(t.position.x, 0.06, t.position.z); g.add(calyx);
        }
        break;
      }
      case "pork": case "beef": {
        const side = foodMat(kind, "skin", brownAmt, { map: skinTex(kind) });
        const top = foodMat(kind, "skin", brownAmt, { map: kind === "pork" ? tex("pork-top", 256, speckle("#e6bea3", ["#efd2bf", "#cf9c84"], 900, 4)) : skinTex("beef") });
        const bottom = foodMat(kind, "flesh", brownAmt, { map: tex(`${kind}-bottom`, 256, marble(look(kind)[1], "#f5e3dc")) });
        const slab = mesh(organic(box(0.2, kind === "pork" ? 0.045 : 0.035, 0.13, 6), 0.06, 0.025, ckHash(it.key)), [side, side, top, bottom, side, side]);
        slab.position.y = slab.geometry.parameters.height / 2; g.add(slab);
        if (/ribs/.test(it.key)) { const bone = std({ color: 0xf1e9dc, roughness: 0.5 }); for (let k = 0; k < 4; k++) { const b = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 8), bone); b.rotation.x = Math.PI / 2; b.position.set(-0.07 + k * 0.045, 0.006, 0); g.add(b); } }
        break;
      }
      case "mince": { const m = mesh(new THREE.SphereGeometry(0.07, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), foodMat(kind, "skin", brownAmt, { map: skinTex(kind) })); m.scale.y = 0.45; g.add(m); break; }
      case "chicken": {
        const m = foodMat(kind, "skin", brownAmt, { map: skinTex(kind), roughness: 0.45 });
        for (let k = 0; k < 5; k++) { const p = new THREE.Group(); const meat = ellipsoid(0.026, 1.3, 0.75, 1, m, 16); p.add(meat); const bone = mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.04, 8), std({ color: 0xf0e2c8, roughness: 0.5 })); bone.rotation.z = Math.PI / 2; bone.position.set(0.045, 0.012, 0); p.add(bone); p.position.set((k % 3) * 0.075 - 0.07, 0, Math.floor(k / 3) * 0.07); p.rotation.y = r() * 3; g.add(p); }
        break;
      }
      case "fish": {
        const m = foodMat(kind, "skin", brownAmt, { map: skinTex(kind), metalness: 0.3, roughness: 0.32 });
        const body = ellipsoid(0.045, 2.8, 0.55, 0.8, m, 24); g.add(body);
        const tail = mesh(new THREE.ConeGeometry(0.03, 0.06, 4), m); tail.rotation.z = Math.PI / 2; tail.scale.set(1, 1, 0.25); tail.position.set(0.15, 0.025, 0); g.add(tail);
        const eye = mesh(new THREE.SphereGeometry(0.006, 8, 8), std({ color: 0x111111, roughness: 0.1 })); eye.position.set(-0.1, 0.035, 0.022); g.add(eye);
        break;
      }
      case "shrimp": { const m = foodMat(kind, "skin", brownAmt, { roughness: 0.3, transparent: true, opacity: 0.95 }); for (let k = 0; k < 6; k++) { const s = mesh(new THREE.TorusGeometry(0.02, 0.008, 8, 16, Math.PI * 1.3), m); s.rotation.x = -Math.PI / 2; s.position.set((k % 3) * 0.05 - 0.05, 0.008, Math.floor(k / 3) * 0.05); s.rotation.z = r() * 3; g.add(s); } break; }
      case "carrot": { const m = skin(); for (let k = 0; k < 2; k++) { const c = mesh(new THREE.ConeGeometry(0.018, 0.16, 16), m); c.rotation.z = Math.PI / 2; c.position.set(0, 0.018, k * 0.045); g.add(c); const top = mesh(new THREE.ConeGeometry(0.01, 0.04, 6), std({ color: 0x4f8f2f })); top.rotation.z = -Math.PI / 2; top.position.set(-0.1, 0.018, k * 0.045); g.add(top); } break; }
      case "radish": { const m = foodMat(kind, "skin", brownAmt, { roughness: 0.4 }); const d = mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.2, 20), m); d.rotation.z = Math.PI / 2; d.position.y = 0.025; g.add(d); break; }
      case "root": { const m = skin(); for (let k = 0; k < 2; k++) { const e = ellipsoid(0.035, 1.25, 0.85, 1, m, 16); e.position.x = k * 0.085; g.add(e); } break; }
      case "gourd": { const e = ellipsoid(0.05, 1.7, 0.95, 1, skin(), 24); g.add(e); break; }
      case "eggplant": { const m = foodMat(kind, "skin", brownAmt, { roughness: 0.18 }); for (let k = 0; k < 2; k++) { const e = ellipsoid(0.025, 3.4, 1, 1, m, 20); e.position.z = k * 0.055; g.add(e); const cap = mesh(new THREE.ConeGeometry(0.02, 0.03, 6), std({ color: 0x3f6b2a, roughness: 0.6 })); cap.rotation.z = Math.PI / 2; cap.position.set(-0.085, 0.025, k * 0.055); g.add(cap); } break; }
      case "chili": { const m = foodMat(kind, "skin", brownAmt, { roughness: 0.2 }); for (let k = 0; k < 3; k++) { const c = mesh(new THREE.ConeGeometry(0.008, 0.11, 12), m); c.rotation.z = Math.PI / 2 + (r() - 0.5) * 0.3; c.position.set(0, 0.008, k * 0.022); g.add(c); } break; }
      case "okra": { const m = foodMat(kind, "skin", brownAmt, { roughness: 0.5 }); for (let k = 0; k < 6; k++) { const c = mesh(new THREE.ConeGeometry(0.01, 0.08, 5), m); c.rotation.z = Math.PI / 2; c.position.set(0, 0.01, k * 0.022 - 0.05); c.rotation.x = r(); g.add(c); } break; }
      case "beans": { const m = foodMat(kind, "skin", brownAmt, { roughness: 0.45 }); for (let k = 0; k < 10; k++) { const b = mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.3, 8), m); b.rotation.z = Math.PI / 2; b.rotation.y = (r() - 0.5) * 0.15; b.position.set(0, 0.004 + (k % 3) * 0.006, k * 0.007 - 0.03); g.add(b); } break; }
      case "leafy": case "bayleaf": {
        const m = foodMat(kind, "skin", brownAmt, { map: skinTex(kind), side: THREE.DoubleSide, roughness: 0.5 });
        const n = kind === "leafy" ? 7 : 5, w = kind === "leafy" ? 0.08 : 0.025, h = kind === "leafy" ? 0.17 : 0.06;
        for (let k = 0; k < n; k++) { const l = bentLeaf(w, h, m, 0.25); l.rotation.z = (k / n - 0.5) * 1.2; l.position.set(Math.sin((k / n - 0.5) * 1.2) * h * 0.4, 0.004 + k * 0.002, 0); g.add(l); }
        break;
      }
      case "scallion": { const m = std({ map: tex("scallion", 128, (gg, n) => { const grd = gg.createLinearGradient(0, 0, n, 0); grd.addColorStop(0, "#f2f5e8"); grd.addColorStop(0.3, "#cfe3a6"); grd.addColorStop(0.45, "#5aa23e"); grd.addColorStop(1, "#3f8a2d"); gg.fillStyle = grd; gg.fillRect(0, 0, n, n); }), roughness: 0.4 }); for (let k = 0; k < 6; k++) { const s = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.25, 8), m); s.rotation.z = Math.PI / 2; s.position.set(0, 0.004, k * 0.009); g.add(s); } break; }
      case "egg": { const m = foodMat(kind, "skin", 0, { roughness: 0.35 }); for (let k = 0; k < 2; k++) { const e = ellipsoid(0.022, 1, 1.3, 1, m, 20); e.position.x = k * 0.05; g.add(e); } break; }
      case "citrus": { const m = foodMat(kind, "skin", brownAmt, { roughness: 0.4 }); for (let k = 0; k < 6; k++) { const c = ellipsoid(0.014, 1.6, 0.8, 1, m, 12); c.position.set((k % 3) * 0.035, 0, Math.floor(k / 3) * 0.03); c.rotation.y = r(); g.add(c); } break; }
      case "wrapper": { const m = foodMat(kind, "skin", 0, { map: skinTex(kind), roughness: 0.8 }); const s = mesh(new THREE.BoxGeometry(0.15, 0.012, 0.15), m); s.position.y = 0.006; s.rotation.y = 0.3; g.add(s); break; }
      case "rolled": { const m = foodMat(kind, "skin", brownAmt, { map: skinTex(kind), roughness: 0.6 }); for (let k = 0; k < 6; k++) { const c = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.09, 14), m); c.rotation.z = Math.PI / 2; c.rotation.y = (r() - 0.5) * 0.4; c.position.set((r() - 0.5) * 0.02, 0.011 + Math.floor(k / 3) * 0.02, (k % 3) * 0.026 - 0.026); g.add(c); } break; }
      case "cube": { const m = std({ color: 0xd4a52c, metalness: 0.85, roughness: 0.35 }); for (let k = 0; k < 2; k++) { const c = mesh(new THREE.BoxGeometry(0.022, 0.022, 0.022), m); c.position.set(k * 0.03, 0.011, 0); c.rotation.y = r(); g.add(c); } break; }
      case "powder": case "grain": case "misc": case "peppercorn": {
        g.add(ramekin(kind === "grain" ? 0.07 : 0.05));
        const fill = kind === "powder" ? cookPowderColor(it) : look(kind)[1];
        const top = mesh(new THREE.CircleGeometry(kind === "grain" ? 0.062 : 0.044, 32), std({ map: tex(`fill-${fill}-${kind}`, 128, speckle(fill, [shade(fill, 0.8), "#ffffff"], kind === "grain" ? 900 : 500, kind === "grain" ? 5 : 2)), roughness: 0.9 }));
        top.rotation.x = -Math.PI / 2; top.position.y = 0.028; g.add(top);
        if (kind === "peppercorn") { const pm = std({ color: 0x1f1813, roughness: 0.9, envMapIntensity: 0.3 }); for (let k = 0; k < 18; k++) { const p = mesh(new THREE.SphereGeometry(0.004, 6, 6), pm); p.position.set((r() - 0.5) * 0.06, 0.032, (r() - 0.5) * 0.06); g.add(p); } }
        break;
      }
      case "bottle": case "water": {
        const [lc] = cookLiquidLook(it);
        const glass = std({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.18, envMapIntensity: 2.2 });
        const big = kind === "water";
        const body = mesh(new THREE.CylinderGeometry(big ? 0.055 : 0.028, big ? 0.05 : 0.028, big ? 0.15 : 0.16, 24), glass); body.position.y = big ? 0.075 : 0.08; g.add(body);
        const inner = mesh(new THREE.CylinderGeometry(big ? 0.05 : 0.025, big ? 0.046 : 0.025, big ? 0.11 : 0.12, 24), std({ color: lc, roughness: 0.1, transparent: true, opacity: big ? 0.45 : 0.92 })); inner.position.y = big ? 0.058 : 0.064; inner.name = "fill"; g.add(inner);
        if (!big) { const neck = mesh(new THREE.CylinderGeometry(0.01, 0.024, 0.05, 16), glass); neck.position.y = 0.185; g.add(neck); const cap = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.016, 16), std({ color: /soy|oyster/.test(it.key) ? 0xc0261d : /fish/.test(it.key) ? 0x1d5239 : 0xd8b02a, roughness: 0.4 })); cap.position.y = 0.218; g.add(cap);
          const word = cookBottleWord(it);
          const labelTex = tex(`label-${word}`, 256, (gg, n) => { gg.fillStyle = "#f3ead2"; gg.fillRect(0, 0, n, n); gg.fillStyle = /TOYO|OYSTER/.test(word) ? "#b3261e" : /PATIS/.test(word) ? "#1d5239" : "#c9961a"; gg.fillRect(0, n * 0.12, n, n * 0.12); gg.fillRect(0, n * 0.76, n, n * 0.12); gg.fillStyle = "#2a2a2a"; gg.font = `bold ${n * 0.2}px Inter, Arial, sans-serif`; gg.textAlign = "center"; gg.textBaseline = "middle"; gg.fillText(word, n * 0.25, n * 0.5); gg.fillText(word, n * 0.75, n * 0.5); });
          const label = mesh(new THREE.CylinderGeometry(0.0285, 0.0285, 0.06, 32, 1, true), std({ map: labelTex, roughness: 0.6 })); label.position.y = 0.085; g.add(label); }
        else { const h = mesh(new THREE.TorusGeometry(0.035, 0.006, 8, 16, Math.PI), glass); h.position.set(0.06, 0.08, 0); h.rotation.z = -Math.PI / 2; g.add(h); }
        break;
      }
      case "butter": case "cheese": case "tofu": case "ham": {
        const m = foodMat(kind, "skin", brownAmt, { roughness: kind === "butter" ? 0.3 : 0.5 });
        const dims = { butter: [0.09, 0.03, 0.045], cheese: [0.1, 0.035, 0.06], tofu: [0.08, 0.04, 0.08], ham: [0.12, 0.012, 0.09] }[kind];
        const b = mesh(organic(box(...dims, 3), 0.08, 0.01, ckHash(it.key)), m); b.position.y = dims[1] / 2; g.add(b);
        if (kind === "ham") for (let k = 1; k < 3; k++) { const c = b.clone(); c.position.set(k * 0.01, dims[1] / 2 + k * 0.012, k * 0.008); g.add(c); }
        break;
      }
      case "sausage": { const m = foodMat(kind, "skin", brownAmt, { roughness: 0.35 }); for (let k = 0; k < 4; k++) { const c = mesh(new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.012, 0.07, 6, 12) : new THREE.CylinderGeometry(0.012, 0.012, 0.09, 14), m); c.rotation.z = Math.PI / 2; c.position.set(0, 0.012, k * 0.026 - 0.04); g.add(c); } break; }
      case "jar": {
        const [c, rough, clear] = cookJarLook(it);
        const glassJ = std({ color: 0xffffff, roughness: 0.03, transparent: true, opacity: 0.2, envMapIntensity: 2.2 });
        const body = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.075, 28), glassJ); body.position.y = 0.0375; g.add(body);
        const fill = mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.06, 28), std({ color: c, roughness: rough, transparent: !!clear, opacity: clear ? 0.9 : 1 })); fill.position.y = 0.032; g.add(fill);
        const lid = mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.014, 28), std({ color: 0xc8a23a, metalness: 0.7, roughness: 0.35 })); lid.position.y = 0.082; g.add(lid);
        break;
      }
      case "packet": {
        const word = (it.label || "").replace(/\b(knorr|maggi|mama sita'?s?|del monte|ufc|datu puti|silver swan|ajinomoto)\b/gi, "").trim().split(/\s+/).slice(0, 2).join(" ").toUpperCase() || "MIX";
        const lt = tex(`packet-${word}`, 256, (gg, n) => { gg.fillStyle = "#e5b53a"; gg.fillRect(0, 0, n, n); gg.fillStyle = "#1d5239"; gg.fillRect(0, n * 0.62, n, n * 0.38); gg.fillStyle = "#fff8e6"; gg.font = `bold ${n * 0.13}px Inter, Arial, sans-serif`; gg.textAlign = "center"; gg.fillText(word.slice(0, 14), n / 2, n * 0.84); gg.fillStyle = "rgba(255,255,255,.35)"; gg.fillRect(0, 0, n, n * 0.08); });
        const pk = mesh(organic(box(0.09, 0.008, 0.12, 4), 0, 0.04, 21), [std({ color: 0xe5b53a, roughness: 0.35, metalness: 0.3 }), std({ color: 0xe5b53a, roughness: 0.35, metalness: 0.3 }), std({ map: lt, roughness: 0.35, metalness: 0.2 }), std({ color: 0xe5b53a }), std({ color: 0xe5b53a }), std({ color: 0xe5b53a })]);
        pk.position.y = 0.006; pk.rotation.y = 0.25; g.add(pk);
        break;
      }
      case "shells": {
        const m = foodMat(kind, "skin", 0, { roughness: 0.35, metalness: 0.15 });
        for (let k = 0; k < 8; k++) { const sh = ellipsoid(0.018, 1.6, 0.45, 0.9, m, 14); sh.position.set((k % 4) * 0.032 - 0.05, 0, Math.floor(k / 4) * 0.03); sh.rotation.y = r() * 3; g.add(sh); }
        break;
      }
      case "crab": {
        const shell = foodMat(kind, "skin", brownAmt, { roughness: 0.4, bumpMap: pores(), bumpScale: 0.002 });
        const body = ellipsoid(0.05, 1.3, 0.4, 1, shell, 24); g.add(body);
        for (let k = 0; k < 8; k++) { const side = k < 4 ? -1 : 1, i = k % 4; const leg = mesh(new THREE.CylinderGeometry(0.004, 0.003, 0.06, 6), shell); leg.rotation.z = side * 1.2; leg.rotation.y = (i - 1.5) * 0.35; leg.position.set(side * 0.075, 0.012, (i - 1.5) * 0.022); g.add(leg); }
        [-1, 1].forEach((sd) => { const cl = ellipsoid(0.014, 1.6, 0.8, 1, shell, 12); cl.position.set(sd * 0.04, 0.005, -0.06); g.add(cl); });
        break;
      }
      case "squid": {
        const m = foodMat(kind, "skin", brownAmt, { roughness: 0.3, bumpMap: pores(), bumpScale: 0.001 });
        for (let k = 0; k < 2; k++) { const t = mesh(new THREE.ConeGeometry(0.022, 0.13, 16), m); t.rotation.z = Math.PI / 2; t.position.set(0, 0.022, k * 0.055); g.add(t); for (let a = 0; a < 6; a++) { const tn = mesh(new THREE.CylinderGeometry(0.002, 0.003, 0.06, 5), m); tn.rotation.z = Math.PI / 2 + (r() - 0.5) * 0.3; tn.position.set(-0.09, 0.006, k * 0.055 + (a - 2.5) * 0.006); g.add(tn); } }
        break;
      }
      case "chocolate": {
        const m = foodMat(kind, "skin", 0, { roughness: 0.3 });
        const bar = mesh(box(0.1, 0.01, 0.06, 2), m); bar.position.y = 0.005; g.add(bar);
        for (let x = 0; x < 4; x++) for (let z = 0; z < 2; z++) { const sq = mesh(new THREE.BoxGeometry(0.021, 0.004, 0.025), m); sq.position.set(-0.036 + x * 0.024, 0.012, -0.014 + z * 0.028); g.add(sq); }
        break;
      }
      case "balls": { const m = foodMat(kind, "skin", brownAmt, { roughness: 0.5 }); for (let k = 0; k < 8; k++) { const b = ellipsoid(0.012, 1, 0.95, 1, m, 12); b.position.set((k % 4) * 0.026 - 0.04, 0, Math.floor(k / 4) * 0.026); g.add(b); } break; }
      case "peas": case "corn": case "raisins": case "sago": case "pulses": case "seeds": case "annatto": case "berries": case "grapes": {
        g.add(ramekin(0.055));
        const m = foodMat(kind, "skin", brownAmt, { roughness: kind === "sago" ? 0.1 : 0.45, transparent: kind === "sago", opacity: kind === "sago" ? 0.85 : 1 });
        const geo = kind === "raisins" ? organic(new THREE.SphereGeometry(0.006, 8, 6), 0, 0.3, 3)
          : kind === "seeds" ? (() => { const q = new THREE.SphereGeometry(0.004, 8, 6); q.scale(1.6, 0.6, 1); return q; })()
          : kind === "berries" ? organic(new THREE.SphereGeometry(0.011, 12, 8), 0, 0.12, 4)
          : kind === "grapes" ? new THREE.SphereGeometry(0.009, 12, 8)
          : new THREE.SphereGeometry(kind === "corn" ? 0.005 : kind === "pulses" || kind === "annatto" ? 0.004 : 0.006, 8, 6);
        const inst = new THREE.InstancedMesh(geo, m, 60); inst.castShadow = true;
        for (let k = 0; k < 60; k++) { const a = r() * 6.3, d = Math.sqrt(r()) * 0.042; dummy.position.set(Math.cos(a) * d, 0.012 + r() * 0.016, Math.sin(a) * d); dummy.rotation.set(r() * 3, r() * 3, 0); dummy.scale.setScalar(0.8 + r() * 0.4); dummy.updateMatrix(); inst.setMatrixAt(k, dummy.matrix); }
        g.add(inst);
        break;
      }
      case "fruit": { const m = foodMat(kind, "skin", brownAmt, { roughness: 0.3 }); const fc = cookFruitColor(it); if (fc) { m.userData.base = col(fc); m.color.copy(m.userData.base); } for (let k = 0; k < 2; k++) { const e = ellipsoid(0.035, 1.45, 0.9, 1, m, 20); e.position.x = k * 0.1; g.add(e); } break; }
      case "banana": { const m = foodMat(kind, "skin", brownAmt, { roughness: 0.45 }); for (let k = 0; k < 3; k++) { const b = mesh(new THREE.TorusGeometry(0.07, 0.014, 10, 20, 1.3), m); b.rotation.x = -Math.PI / 2; b.position.set(-0.04, 0.014 + k * 0.004, k * 0.022 - 0.05); g.add(b); } break; }
      case "mushroom": { const cap = foodMat(kind, "skin", brownAmt, { roughness: 0.6 }), stem = foodMat(kind, "flesh", brownAmt, { roughness: 0.6 }); for (let k = 0; k < 4; k++) { const x = (k % 2) * 0.05, z = Math.floor(k / 2) * 0.05; const st = mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.02, 10), stem); st.position.set(x, 0.01, z); g.add(st); const c = mesh(new THREE.SphereGeometry(0.02, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap); c.position.set(x, 0.018, z); c.scale.y = 0.6; g.add(c); } break; }
      case "broccoli": case "cauliflower": { const m = foodMat(kind, "skin", brownAmt, { roughness: 0.75, bumpMap: pores(), bumpScale: 0.003 }); const stem = foodMat(kind, "flesh", 0); const s0 = mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.05, 10), stem); s0.rotation.z = Math.PI / 2; s0.position.set(0.04, 0.016, 0); g.add(s0); for (let k = 0; k < 9; k++) { const f = ellipsoid(0.018, 1, 0.8, 1, m, 12); f.position.set((r() - 0.5) * 0.05, 0.008 + r() * 0.012, (r() - 0.5) * 0.05); g.add(f); } break; }
      case "bread": { const m = foodMat(kind, "skin", brownAmt, { roughness: 0.7, bumpMap: pores(), bumpScale: 0.002 }); for (let k = 0; k < 2; k++) { const d = mesh(new THREE.SphereGeometry(0.04, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m); d.scale.y = 0.55; d.position.x = k * 0.085; g.add(d); } break; }
      default: g.add(ramekin()); break;
    }
    return g;
  }

  // Cut pieces: an instanced pile of the right shape and size, flesh side showing.
  function piecesModel(it, style, radius, brownAmt, seedExtra = 0) {
    const kind = cookFoodKind(it), r = ckRand(ckHash(it.key) + seedExtra);
    const flesh = foodMat(kind, ["beef", "mince", "chicken", "fish", "shrimp", "leafy", "bayleaf", "rolled", "wrapper"].includes(kind) ? "skin" : "flesh", brownAmt,
      { map: kind === "pork" ? tex("pork-cut", 256, marble(look("pork")[1], "#f2dfd4")) : ["beef", "mince", "chicken", "leafy", "fish"].includes(kind) ? skinTex(kind) : null, roughness: 0.5, side: kind === "leafy" ? THREE.DoubleSide : THREE.FrontSide });
    const meat = ["pork", "beef", "chicken", "fish", "shrimp"].includes(kind);
    let geo, n;
    const fleck = kind === "leafy" && ["minced", "diced", "grated"].includes(style);
    if (fleck) flesh.map = null, flesh.userData.base = col(look(kind)[0]), flesh.color.copy(flesh.userData.base);
    switch (kind === "leafy" && !fleck ? "leaf" : style) {
      case "leaf": geo = new THREE.PlaneGeometry(0.045, 0.035); n = 22; break;
      case "minced": geo = organic(box(0.007, 0.005, 0.007, 1), 0.25, 0.2, 3); n = 70; break;
      case "beads": geo = new THREE.SphereGeometry(kind === "peppercorn" ? 0.0035 : 0.005, 8, 6); n = kind === "peppercorn" ? 20 : 45; break;
      case "grated": geo = new THREE.BoxGeometry(0.022, 0.003, 0.003); n = 60; break;
      case "diced": geo = organic(box(0.014, 0.012, 0.014, 2), 0.25, 0.12, 5); n = 36; break;
      case "cubes": geo = organic(box(0.03, 0.026, 0.03, 4), meat ? 0.35 : 0.2, meat ? 0.1 : 0.05, ckHash(it.key)); n = meat ? 14 : 18; break;
      case "strips": geo = new THREE.BoxGeometry(0.05, 0.005, 0.005); n = 32; break;
      case "thin": case "sliced":
        if (kind === "onion" || kind === "redonion") { geo = new THREE.TorusGeometry(0.024, 0.0028, 6, 18, Math.PI); n = 26; }
        else if (meat) { geo = organic(box(0.06, style === "thin" ? 0.005 : 0.012, 0.035, 4), 0.12, 0.06, 7); n = 10; }
        else { geo = new THREE.CylinderGeometry(kind === "eggplant" || kind === "radish" ? 0.024 : 0.018, kind === "eggplant" || kind === "radish" ? 0.024 : 0.018, style === "thin" ? 0.003 : 0.006, 16); n = 16; }
        break;
      case "wedges": geo = new THREE.SphereGeometry(0.034, 10, 8, 0, Math.PI / 3); n = 8; break;
      case "quartered": geo = new THREE.SphereGeometry(0.036, 12, 8, 0, Math.PI / 2); n = 8; break;
      case "halved": geo = new THREE.SphereGeometry(0.036, 14, 10, 0, Math.PI); n = 4; break;
      case "crushed": geo = organic(new THREE.DodecahedronGeometry(0.011, 1), 0, 0.25, 9); geo.scale(1, 0.55, 1); n = 14; break;
      default:
        if (kind === "chicken") {
          // Drumsticks and thighs: a lathe-turned shape, lying down.
          geo = new THREE.LatheGeometry([[0, 0], [0.006, 0.002], [0.007, 0.02], [0.016, 0.035], [0.024, 0.055], [0.024, 0.075], [0.016, 0.09], [0, 0.095]].map(([x, y]) => new THREE.Vector2(x, y)), 16);
          organic(geo, 0, 0.05, 11); geo.rotateZ(Math.PI / 2); geo.translate(0.045, 0, 0); n = 7;
        } else if (kind === "fish") { geo = organic(new THREE.SphereGeometry(0.024, 14, 10), 0, 0.06, 13); geo.scale(1.6, 0.6, 1); n = 7; }
        else if (meat) { geo = organic(box(0.045, 0.032, 0.04, 4), 0.4, 0.1, ckHash(it.key)); n = 9; }
        else { geo = organic(new THREE.DodecahedronGeometry(0.022, 1), 0.2, 0.12, ckHash(it.key)); n = 10; }
        break;
    }
    if (["wedges", "quartered", "halved"].includes(style)) flesh.side = THREE.DoubleSide;
    const inst = new THREE.InstancedMesh(geo, flesh, n);
    inst.castShadow = inst.receiveShadow = true;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
      const sz = geo.parameters && geo.parameters.height ? geo.parameters.height : 0.01;
      dummy.position.set(Math.cos(a) * d, sz / 2 + r() * radius * 0.25 * (1 - d / radius), Math.sin(a) * d);
      dummy.rotation.set(style === "minced" || style === "diced" || style === "crushed" ? r() * 3 : (kind === "leafy" ? -Math.PI / 2 + (r() - 0.5) : (r() - 0.5) * 0.4), r() * 6.3, (r() - 0.5) * 0.4);
      if (["halved", "quartered", "wedges"].includes(style)) dummy.rotation.set(Math.PI / 2 + (r() - 0.5) * 0.3, r() * 6.3, 0);
      dummy.scale.setScalar(0.8 + r() * 0.4);
      dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix);
      c.setScalar(0.88 + r() * 0.14); inst.setColorAt(i, c);
    }
    const g = new THREE.Group(); g.add(inst); g.userData.inst = inst; g.userData.n = n;
    return g;
  }

  const fit = (obj, maxR) => {
    const box = new THREE.Box3().setFromObject(obj); const s = box.getSize(V(0, 0, 0));
    const k = Math.min(1, (maxR * 2) / Math.max(0.001, Math.max(s.x, s.z)));
    obj.scale.multiplyScalar(k); return obj;
  };
  const modelFor = (it, st, radius, seedExtra, where) => {
    const kind = cookFoodKind(it), b = st.brown.get(it) || 0;
    let style = st.cut.get(it);
    const title = (typeof cookShow !== "undefined" && cookShow && cookShow.title) || "";
    if (!style && ["pot", "plate"].includes(where || st.loc.get(it)) && ["pork", "beef", "chicken"].includes(kind) && !/lechon|kawali|crispy|bagnet|liempo|fried/i.test(title)) style = kind === "chicken" ? "pieces" : "cubes";
    // Big vegetables never go into the pot whole.
    // Whole vegetables and fruit never go into a pot, salad or plate whole: show them the way cooks cut them.
    const CK_DEFAULT_CUT = { gourd: "pieces", root: "pieces", eggplant: "sliced", radish: "sliced", carrot: "sliced", onion: "sliced", redonion: "sliced", garlic: "minced", ginger: "strips", tomato: "wedges", fruit: "cubes", banana: "sliced", tofu: "cubes", sausage: "sliced", ham: "diced", cheese: "diced", mushroom: "sliced", broccoli: "pieces", cauliflower: "pieces" };
    if (!style && ["pot", "plate", "bowl"].includes(where || st.loc.get(it)) && CK_DEFAULT_CUT[kind]) style = CK_DEFAULT_CUT[kind];
    const loose = ["pot", "plate", "bowl", "rack"].includes(where || st.loc.get(it));
    if (loose && ["powder", "cube", "peppercorn", "misc", "peas", "corn", "raisins", "sago", "pulses", "seeds", "annatto", "jar", "packet"].includes(kind)) return piecesModel(kind === "peppercorn" ? { key: it.key, label: "peppercorn" } : it, kind === "cube" ? "crushed" : ["peas", "corn", "raisins", "sago", "pulses", "peppercorn", "seeds", "annatto"].includes(kind) ? "beads" : "minced", radius * 0.6, 0, seedExtra);
    if (style && !["bottle", "water", "powder", "cube", "grain", "misc", "peppercorn", "peas", "corn", "raisins", "sago", "pulses", "seeds", "annatto", "jar", "packet"].includes(kind)) return piecesModel(it, style, radius, b, seedExtra);
    return fit(wholeModel(it, b), radius * 1.15);
  };

  // ── Per-step objects ──
  let dyn = new THREE.Group(); scene.add(dyn);
  let brownMax = 1, heatOn = false, movers = [], cur = null, curIndex = 0, potItems = [], spoonMode = null, pourInfo = null, cutInfo = null, wrapInfo = null, brownList = [], camGoal = null;
  const camPos = V(0, 2.4, 1.5), camLook = V(0, 0, -0.2);
  let firstFrame = true;

  const clearDyn = () => {
    dyn.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
    scene.remove(dyn); dyn = new THREE.Group(); scene.add(dyn);
  };
  const vesselGroup = (v) => (v === "kaldero" ? kaldero : kawali);
  const contentY = (st) => {
    if (st.vessel === "kaldero") return VESSEL_Y + 0.008 + Math.max(st.level * 0.15, 0.004);
    return WOK_Y + 0.012 + Math.max(st.oil, st.level) * 0.06;
  };
  const vesselR = (st) => (st.vessel === "kaldero" ? 0.13 : 0.15);
  const spotOf = (st, it, which) => {
    const where = which || st.loc.get(it);
    const i = st.items.indexOf(it);
    if (where === "prep") { const [x, z] = ckPrepSpot(i < 0 ? 0 : i); return V(x, 0, z); }
    if (where === "board") return V(CK_AT.board[0] - 0.05 + ((i % 3) - 1) * 0.12, BOARD_Y, CK_AT.board[1] - 0.04 + ((i % 2) * 0.08));
    if (where === "bowl") return V(CK_AT.bowl[0], 0.012, CK_AT.bowl[1]);
    if (where === "pot") { const r = ckRand(i + 3); const a = r() * 6.3, d = r() * vesselR(st) * 0.45; return V(CK_AT.stove[0] + Math.cos(a) * d, contentY(st) - 0.006, CK_AT.stove[1] + Math.sin(a) * d); }
    if (where === "rack") return V(CK_AT.rack[0] + ((i % 3) - 1) * 0.04, 0.014, CK_AT.rack[1]);
    if (where === "plate") { const r = ckRand(i + 9); const a = r() * 6.3, d = r() * 0.05; return V(CK_AT.plate[0] + Math.cos(a) * d, st.served === "bowl" ? 0.042 : 0.01, CK_AT.plate[1] + Math.sin(a) * d); }
    return V(0, -5, 0);
  };
  const radiusAt = (where) => ({ prep: 0.05, board: 0.07, bowl: 0.085, pot: 0.075, rack: 0.06, plate: 0.075 })[where] || 0.05;

  function place(st, it, where, seedExtra) {
    const kind = cookFoodKind(it);
    if (where === "prep") {
      const g = new THREE.Group(); const p = spotOf(st, it, "prep"); g.position.copy(p);
      if (st.cut.has(it) && !["bottle", "water", "powder", "cube", "grain", "misc", "peppercorn"].includes(kind)) { g.add(ramekin(0.065, 0.04)); const pile = piecesModel(it, st.cut.get(it), 0.045, st.brown.get(it) || 0, seedExtra); pile.position.y = 0.007; g.add(pile); }
      else g.add(modelFor(it, st, 0.075));
      dyn.add(g); return g;
    }
    const m = modelFor(it, st, radiusAt(where), seedExtra, where);
    m.position.copy(spotOf(st, it, where));
    dyn.add(m); return m;
  }

  function enter(step, index, steps, cost) {
    clearDyn();
    movers = []; potItems = []; spoonMode = null; pourInfo = null; cutInfo = null; wrapInfo = null; brownList = [];
    knifeRest(); sandokRest(); stream.visible = false; drops.count = 0;
    cur = step; curIndex = index;
    const st = cookState(steps, index), after = cookApply(cookState(steps, index), step);
    // The vessel on the stove: the one this step uses, else the last one used.
    const v = (["heat", "saute", "add", "pour", "fry", "deepfry", "boil", "simmer", "cook", "stir", "season", "drain"].includes(step.kind) && step.vessel) || st.vessel || "kawali";
    kaldero.visible = v === "kaldero"; kawali.visible = v !== "kaldero";
    if (!st.vessel || st.vessel !== v) { st.vessel = v; }
    if (!after.vessel) after.vessel = v;
    soupBowl.visible = step.kind === "serve" && after.served === "bowl"; plate.visible = !soupBowl.visible;
    const bl = st.bowlLiquid || after.bowlLiquid;
    bowlLiquid.visible = !!bl; if (bl) bowlLiquidMat.color.copy(col(bl));
    bowlLiquid.userData.grow = !st.bowlLiquid && !!after.bowlLiquid;

    // Bottles and ramekins that pour this step (handled below, not drawn twice).
    const pourers = step.items.filter((it) => (it.liquid && ["pour", "add", "saute", "season", "boil", "simmer"].includes(step.kind) && after.loc.get(it) !== "bowl") || (cookFoodKind(it) === "powder" && step.kind === "season"));
    if (step.kind === "heat") { const oil = st.items.find((it) => it.fryOil); if (oil) pourers.push(oil); }
    if (step.kind === "deepfry") { const oil = st.items.find((it) => it.fryOil); if (oil && st.oil < 0.5) pourers.push(oil); }
    const pourer = pourers[0];
    const moving = new Set();
    const movesNow = (it) => st.loc.get(it) !== after.loc.get(it) && after.loc.get(it) !== "used" && after.loc.get(it) !== "wrapped";
    if (step.kind === "shop") step.items.forEach((it) => moving.add(it));
    for (const it of after.items) if (movesNow(it)) moving.add(it);
    if (["cut", "peel"].includes(step.kind)) step.items.forEach((it) => moving.add(it));

    // Everything that stays put this step.
    for (const it of st.items) {
      const where = st.loc.get(it);
      if (moving.has(it) || it === pourer || where === "used" || where === "wrapped") continue;
      if (st.loc.get(it) !== "prep" && it.liquid) continue;
      const o = place(st, it, where);
      if (where === "pot") potItems.push(o);
      // Liquids stay on the prep row as bottles even after pouring.
    }
    for (const it of st.items) if (it.liquid && st.loc.get(it) !== "prep" && !moving.has(it) && it !== pourer) place(st, it, "prep");
    // Empty ramekins left on the prep row after cut pieces moved on.
    for (const it of st.items) if (st.cut.has(it) && st.loc.get(it) !== "prep" && cookFoodKind(it) !== "bottle") { const r = ramekin(0.065, 0.04); r.position.copy(spotOf(st, it, "prep")); dyn.add(r); }
    if (st.rolled && !st.items.some((it) => it.key === "rolled")) { const pseudo = { key: "rolled", label: "lumpia" }; st.items.push(pseudo); st.loc.set(pseudo, "board"); }
    if (!step.items.some((it) => it.key === "rolled")) for (const it of st.items) if (it.key === "rolled" && st.loc.get(it) === "board" && !moving.has(it)) place(st, it, "board");

    // Movers: from where they are to where this step puts them.
    let k = 0;
    const len = cookStepLength(step);
    for (const it of moving) {
      const from = step.kind === "shop" ? "prep" : st.loc.get(it) || "board";
      let to = after.loc.get(it) || from;
      if (step.kind === "cut" || step.kind === "peel") to = "board";
      const obj = from === "prep" && step.kind !== "shop" && !(step.kind === "cut") ? modelFor(it, st, from === "prep" ? 0.05 : radiusAt(to)) : (step.kind === "cut" ? fit(wholeModel(it, st.brown.get(it) || 0), 0.085) : modelFor(it, st, step.kind === "shop" ? 0.075 : radiusAt(to), 0, step.kind === "shop" ? "prep" : to));
      if (step.kind === "shop") { const p = spotOf(st, it, "prep"); obj.position.copy(p); obj.scale.multiplyScalar(0.0001); obj.userData.full = obj.scale.x / 0.0001; }
      dyn.add(obj);
      const pFrom = spotOf(st, it, from), pTo = to === "board" && step.kind === "cut" ? V(CK_AT.board[0] - 0.02, BOARD_Y, CK_AT.board[1]) : spotOf(after, it, to);
      const stagger = step.kind === "shop" ? 0.4 + k * ((len - 1.4) / Math.max(1, moving.size)) : 0.25 + k * 0.22;
      movers.push({ it, obj, from: pFrom, to: pTo, t0: stagger, t1: stagger + (step.kind === "shop" ? 0.45 : 0.75), shop: step.kind === "shop", liquid: it.liquid });
      if (to === "pot") potItems.push(obj);
      k++;
    }
    // Liquids and powders poured in: the bottle or ramekin flies over the pot and tilts.
    if (pourer) {
      const it = pourer;
      const o = place(st, it, "prep");
      pourInfo = { obj: o, home: o.position.clone(), it, color: cookFoodKind(it) === "powder" ? cookPowderColor(it) : cookLiquidLook(it)[0], powder: cookFoodKind(it) === "powder", rubbing: step.kind === "season" && !st.items.some((x) => st.loc.get(x) === "pot") };
    }
    if (step.kind === "cut") {
      const it = step.items[0], m = movers.find((x) => x.it === it);
      const pile = piecesModel(it, step.style, 0.06, st.brown.get(it) || 0, 1); pile.position.set(CK_AT.board[0] + 0.07, BOARD_Y, CK_AT.board[1]); pile.userData.inst.count = 0; dyn.add(pile);
      cutInfo = { whole: m && m.obj, pile, n: pile.userData.n };
      if (m) { m.t0 = 0.1; m.t1 = 0.7; }
    }
    if (step.kind === "wrap") {
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.002, 0.15), foodMat("wrapper", "skin", 0, { map: skinTex("wrapper"), roughness: 0.8 })); sheet.position.set(CK_AT.board[0], BOARD_Y + 0.001, CK_AT.board[1]); sheet.rotation.y = Math.PI / 4; dyn.add(sheet);
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.1, 14), foodMat("mince", "skin", 0, { map: skinTex("mince") })); log.rotation.z = Math.PI / 2; log.position.set(CK_AT.board[0], BOARD_Y + 0.012, CK_AT.board[1] + 0.04); dyn.add(log);
      const rolls = wholeModel({ key: "rolled", label: "lumpia" }, 0); rolls.position.set(CK_AT.board[0] + 0.17, BOARD_Y, CK_AT.board[1] - 0.02); rolls.scale.setScalar(0.001); dyn.add(rolls);
      wrapInfo = { sheet, log, rolls };
    }
    if (["fry", "deepfry", "saute"].includes(step.kind)) {
      for (const it of after.items) if (after.loc.get(it) === "pot" || after.loc.get(it) === "rack") brownList.push([it, st.brown.get(it) || 0, after.brown.get(it) || 0]);
    }
    const toBowl = movers.length > 0 && movers.every((m) => after.loc.get(m.it) === "bowl");
    spoonMode = toBowl || ["mix", "marinate"].includes(step.kind) ? "bowl" : ["saute", "stir", "add", "simmer", "cook"].includes(step.kind) ? "pot" : null;
    brownMax = step.kind === "saute" ? 0.35 : step.kind === "fry" ? 0.8 : 1;
    heatOn = after.heat;

    // Liquid level and colour, before and after.
    const lc0 = st.oil > st.level ? "#c98a1c" : cookMixColor(st.parts), lc1 = after.oil > after.level ? "#c98a1c" : cookMixColor(after.parts);
    liquid.userData = { from: Math.max(st.level, st.oil), to: Math.max(after.level, after.oil), c0: col(lc0), c1: col(lc1), oil: after.oil > after.level, st, after };
    if (step.kind === "serve" && after.served === "bowl") { soupMat.color.copy(col(st.parts.length ? cookMixColor(st.parts) : "#f5efe0")); const l = soupMat.color.r * 0.3 + soupMat.color.g * 0.59 + soupMat.color.b * 0.11; soupMat.opacity = Math.max(0.4, Math.min(0.93, 0.3 + (1 - l) * 1.1)); }

    // Camera.
    const at = (xz, d) => ({ x: xz[0], z: xz[1], d });
    camGoal = step.kind === "shop" ? at([0, -0.42], 2.5)
      : ["cut", "peel", "wrap"].includes(step.kind) ? at(CK_AT.board, 0.95)
      : ["mix", "marinate", "chill"].includes(step.kind) || toBowl ? at([CK_AT.bowl[0] + 0.2, CK_AT.bowl[1] - 0.05], 1.05)
      : step.kind === "serve" ? at(CK_AT.plate, 0.85)
      : step.kind === "drain" ? at([(CK_AT.stove[0] + CK_AT.rack[0]) / 2, CK_AT.stove[1]], 1.15)
      : ["add", "pour", "saute", "season", "heat", "deepfry"].includes(step.kind) && movers.length + (pourInfo ? 1 : 0) > 0 ? at([CK_AT.stove[0] - 0.15, CK_AT.stove[1] - 0.12], 1.35)
      : at(CK_AT.stove, 0.9);
    if (firstFrame) { const p = camFor(camGoal); camPos.copy(p.pos); camLook.copy(p.look); firstFrame = false; }

    cookHud("cook-hud", null);
    cookHud("cook-timer", null);
    if (step.kind === "serve" && cost) cookHud("cook-hud", `₱${Math.round(cost)} ${cookLang() === "en" ? "per serving" : "bawat serving"}`);
  }

  let aspect = 16 / 9;
  function camFor(g) {
    const d = g.d * (aspect < 1.25 ? 1.45 : aspect < 1.6 ? 1.15 : 1);
    return { pos: V(g.x, d * 0.9, g.z + d * 0.48), look: V(g.x, 0, g.z) };
  }

  const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  function update(step, t, len, dt) {
    const time = performance.now() / 1000;
    if (!cur) return;
    // Camera glides toward the step's view.
    const goal = camFor(camGoal);
    const k = 1 - Math.exp(-dt * 2.4);
    camPos.lerp(goal.pos, k); camLook.lerp(goal.look, k);
    camera.position.copy(camPos); camera.lookAt(camLook);
    if (step.kind === "shop") {
      // Follow each ingredient as it comes out, then pull back to the whole spread.
      const now = movers.filter((m) => t >= m.t0 - 0.15).pop() || null;
      camGoal = t > len - 1.0 || !now ? { x: 0, z: -0.45, d: 2.0 } : { x: now.from.x, z: now.from.z + 0.06, d: 0.75 };
    }

    // Movers fly in arcs (shopping items pop up in place instead).
    for (const m of movers) {
      const u = ease((t - m.t0) / (m.t1 - m.t0));
      if (m.shop) {
        const s = u <= 0 ? 0.0001 : (1 + Math.sin(u * Math.PI) * 0.12) * u;
        m.obj.scale.setScalar(Math.max(0.0001, s * m.obj.userData.full));
        if (t >= m.t0 - 0.15 && m.it.label && movers.filter((x) => t >= x.t0 - 0.15).pop() === m) cookHud("cook-hud", m.it.label);
        continue;
      }
      m.obj.position.lerpVectors(m.from, m.to, u);
      m.obj.position.y += Math.sin(u * Math.PI) * 0.18;
      if (step.kind === "peel" && t > m.t1) { m.obj.rotation.y = (t - m.t1) * 2.5; m.obj.rotation.z = Math.sin(t * 6) * 0.1; }
    }
    if (step.kind === "shop" && t > len - 0.5) cookHud("cook-hud", null);

    // The knife chops, the whole ingredient shrinks, the pile grows.
    if (cutInfo) {
      const u = Math.max(0, Math.min(1, (t - 0.8) / (len - 1.2)));
      if (t > 0.8 && u < 1) {
        const chop = Math.abs(Math.sin(time * 13));
        knife.rotation.set(0, Math.PI / 2 + 0.15, 0);
        knife.position.set(CK_AT.board[0] - 0.06 + u * 0.1, BOARD_Y + 0.004 + chop * 0.05, CK_AT.board[1] + 0.12);
        knife.rotation.z = -chop * 0.25;
      } else knifeRest();
      if (cutInfo.whole) { const w = cutInfo.whole; if (!w.userData.s0) w.userData.s0 = w.scale.x; const s = Math.max(0.001, 1 - u); w.scale.setScalar(w.userData.s0 * s); w.visible = s > 0.04; }
      cutInfo.pile.userData.inst.count = Math.round(cutInfo.n * u);
    }
    if (wrapInfo) {
      const u = Math.max(0, Math.min(1, (t - 0.6) / (len - 1.4)));
      wrapInfo.sheet.scale.z = 1 - u * 0.85; wrapInfo.log.position.z = CK_AT.board[1] + 0.04 - u * 0.05; wrapInfo.log.scale.set(1 + u * 0.3, 1, 1 + u * 0.3);
      wrapInfo.sheet.visible = wrapInfo.log.visible = u < 0.98;
      wrapInfo.rolls.scale.setScalar(Math.max(0.001, ease((t - len * 0.6) / (len * 0.3))));
    }
    // Bottle or ramekin: up over the pot, tilt, pour, back.
    stream.visible = false; drops.count = 0;
    if (pourInfo) {
      const target = pourInfo.rubbing ? V(CK_AT.rack[0] + 0.12, 0.25, CK_AT.rack[1] + 0.05) : V(CK_AT.stove[0] + 0.2, 0.36, CK_AT.stove[1]);
      const up = ease(t / 0.8), back = ease((t - (len - 0.9)) / 0.8);
      const p = pourInfo.home.clone().lerp(target, up).lerp(pourInfo.home, back);
      p.y += Math.sin(up * Math.PI) * 0.1;
      pourInfo.obj.position.copy(p);
      const tilt = up >= 1 && back <= 0 ? 1 : Math.min(up, 1 - back);
      pourInfo.obj.rotation.z = tilt * (pourInfo.powder ? 1.2 : 2.0);
      const pouring = up >= 1 && back <= 0;
      if (pouring && !pourInfo.powder) {
        const top = p.clone().add(V(-0.2, -0.09, 0)); const bottomY = pourInfo.rubbing ? 0.02 : contentY(liquid.userData.after);
        stream.visible = true; stream.material.color.copy(col(pourInfo.color)); stream.position.set(top.x, (top.y + bottomY) / 2, top.z); stream.scale.set(1, top.y - bottomY, 1);
      }
      if (pouring && pourInfo.powder) {
        drops.count = 40; dropMat.color.copy(col(pourInfo.color));
        for (let i = 0; i < 40; i++) { const s = bubbleSeeds[i]; const f = (time * 1.6 + s[0]) % 1; dummy.position.set(p.x - 0.06 + (s[1] - 0.5) * 0.03, p.y - 0.02 - f * (p.y - 0.12), p.z + (s[2] - 0.5) * 0.03); dummy.rotation.set(s[0] * 6, s[1] * 6, 0); dummy.scale.setScalar(0.003); dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix); }
        drops.instanceMatrix.needsUpdate = true;
      }
    }
    // The sandok stirs the pot or the bowl; what's in the pot turns slowly with it.
    if (spoonMode && t > 0.6 && t < len - 0.3) {
      const c = spoonMode === "pot" ? CK_AT.stove : CK_AT.bowl, r = spoonMode === "pot" ? 0.07 : 0.08, a = time * 3.2;
      sandok.position.set(c[0] + Math.cos(a) * r, spoonMode === "pot" ? contentY(liquid.userData.after) - 0.01 : 0.02, c[1] + Math.sin(a) * r);
      sandok.rotation.set(-0.35, 0, 0.35);
      if (spoonMode === "pot") for (const o of potItems) { const dx = o.position.x - CK_AT.stove[0], dz = o.position.z - CK_AT.stove[1]; const ang = Math.atan2(dz, dx) + dt * 0.8, rr = Math.hypot(dx, dz); o.position.x = CK_AT.stove[0] + Math.cos(ang) * rr; o.position.z = CK_AT.stove[1] + Math.sin(ang) * rr; o.rotation.y += dt * 0.8; }
    } else sandokRest();

    // Liquid surface.
    const L = liquid.userData, u = ease((t - 0.8) / Math.max(0.5, len - 1.6));
    const lvl = L.from + (L.to - L.from) * (pourInfo || movers.some((m) => m.liquid) || step.kind === "deepfry" || step.kind === "drain" ? u : 1);
    const st = L.after;
    if (lvl > 0.005 && !(step.kind === "serve" && t > len * 0.5 && st.served === "bowl")) {
      liquid.visible = true;
      const y = st.vessel === "kaldero" ? VESSEL_Y + 0.008 + lvl * 0.15 : WOK_Y + 0.004 + lvl * 0.06;
      const rr = st.vessel === "kaldero" ? 0.152 : WOK_R(0.004 + lvl * 0.06);
      liquid.position.set(CK_AT.stove[0], y, CK_AT.stove[1]); liquid.scale.setScalar(rr);
      liquidMat.color.copy(L.c0).lerp(L.c1, u);
      const lum = liquidMat.color.r * 0.3 + liquidMat.color.g * 0.59 + liquidMat.color.b * 0.11;
      liquidMat.opacity = L.oil ? 0.55 : Math.max(0.28, Math.min(0.93, 0.25 + (1 - lum) * 1.1));
    } else liquid.visible = false;
    if (step.kind === "serve" && st.served === "bowl") { soup.visible = t > len * 0.4; soup.scale.setScalar(Math.max(0.01, ease((t - len * 0.4) / (len * 0.4)))); } else soup.visible = false;

    // Browning while frying.
    if (brownList.length) {
      const bu = ease((t - 0.9) / (len - 1.2));
      for (const o of potItems) o.traverse((x) => { if (x.material && !Array.isArray(x.material) && x.material.userData.done) ckBrown(x.material, Math.max(x.material.userData.b0 || 0, bu * brownMax)); if (Array.isArray(x.material)) x.material.forEach((mm) => mm.userData.done && ckBrown(mm, Math.max(mm.userData.b0 || 0, bu * brownMax))); });
    }

    if (bowlLiquid.visible) { const g = bowlLiquid.userData.grow ? Math.max(0.01, ease((t - 0.8) / 1.2)) : 1; bowlLiquid.scale.setScalar(0.4 + 0.6 * g); bowlLiquid.position.y = 0.012 + 0.02 * g; }
    // The surface moves: faster when boiling.
    rippleTex.offset.set(time * (0.02 + 0.05 * (["boil", "deepfry", "fry"].includes(step.kind) ? 1 : 0.2)), time * 0.013);
    liquidMat.bumpScale = ["boil", "deepfry", "fry"].includes(step.kind) ? 0.004 : 0.0015;
    // Fire, bubbles, steam.
    const heated = heatOn && !["shop", "peel", "cut", "mix", "marinate", "wrap", "serve"].includes(step.kind) && (step.kind !== "drain" || t < len * 0.4);
    flames.forEach((f, i) => { f.visible = heated; f.scale.set(1, 0.8 + Math.sin(time * 30 + i) * 0.25, 1); });
    const boiling = ["boil"].includes(step.kind) ? 1 : ["simmer", "cook"].includes(step.kind) ? 0.4 : ["fry", "deepfry"].includes(step.kind) ? 0.8 : ["saute"].includes(step.kind) ? 0.5 : ["add", "pour", "stir", "season"].includes(step.kind) && liquid.visible ? 0.25 : 0;
    const frying = ["fry", "deepfry", "saute"].includes(step.kind) || L.oil;
    const nb = liquid.visible ? Math.round(80 * boiling) : 0;
    bubbles.count = nb;
    if (nb) {
      bubbleMat.color.copy(col(frying ? 0xfff2c0 : 0xffffff));
      const rr = liquid.scale.x * 0.9;
      for (let i = 0; i < nb; i++) {
        const s = bubbleSeeds[i], ph = (time * (frying ? 2.4 : 1.1) * (0.6 + s[2]) + s[0]) % 1;
        const a = s[1] * 6.3 + i, d = Math.sqrt(s[0]) * rr;
        dummy.position.set(CK_AT.stove[0] + Math.cos(a) * d, liquid.position.y + 0.001, CK_AT.stove[1] + Math.sin(a) * d);
        dummy.scale.setScalar((frying ? 0.0025 : 0.004) * (0.4 + s[2]) * Math.sin(ph * Math.PI) + 0.0001); dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix(); bubbles.setMatrixAt(i, dummy.matrix);
      }
      bubbles.instanceMatrix.needsUpdate = true;
    }
    const steamy = (["boil", "simmer", "cook", "steam"].includes(step.kind) ? 1 : 0) || (step.kind === "serve" && !step.cold ? 0.7 : 0) || (liquid.visible && heated && !L.oil ? 0.35 : 0) || (frying && heated ? 0.3 : 0);
    puffs.forEach((p, i) => {
      const s = p.userData.seed, cycle = (time * 0.32 + s) % 1;
      const base = step.kind === "serve" ? V(CK_AT.plate[0], 0.04, CK_AT.plate[1]) : V(CK_AT.stove[0], liquid.visible ? liquid.position.y : VESSEL_Y, CK_AT.stove[1]);
      p.position.set(base.x + (s - 0.5) * 0.18 + Math.sin(time * 0.7 + i) * 0.03, base.y + cycle * 0.45, base.z + ((i * 0.37) % 1 - 0.5) * 0.14);
      p.scale.setScalar(0.05 + cycle * 0.16);
      p.material.opacity = steamy * (1 - cycle) * 0.32;
    });

    // Time-lapse clock for long steps.
    if (step.minutes) { const f = Math.max(0, Math.min(1, (t - 0.5) / (len - 1))); cookHud("cook-timer", `⏱ ${cookTimeText(Math.max(1, Math.round(step.minutes * f)), cookLang())}`); }

    renderer.render(scene, camera);
  }

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(200, box.width), h = Math.max(160, Math.round(w * (w < 560 ? 0.8 : 0.5625)));
    renderer.setSize(w, h, false); canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    aspect = w / h; camera.aspect = aspect; camera.updateProjectionMatrix();
  }
  resize();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas.parentElement);

  /** Small pictures of each ingredient, rendered from its 3D model on a cream background. */
  function thumbs(list) {
    const out = new Map();
    if (!list || !list.length) return out;
    const size = 128, pr = renderer.getPixelRatio();
    const c2 = document.createElement("canvas"); c2.width = c2.height = size; const g2 = c2.getContext("2d");
    const ts = new THREE.Scene(); ts.environment = envRT.texture; ts.background = col("#efe6d2");
    ts.add(new THREE.HemisphereLight(0xfff6ea, 0x5a4a3a, 0.55));
    const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(-1, 3, 2); ts.add(dl);
    const tc = new THREE.PerspectiveCamera(30, 1, 0.005, 5);
    const vp = renderer.getViewport(new THREE.Vector4());
    renderer.setScissorTest(true);
    for (const it of list) {
      const m = wholeModel(it, 0);
      const bx = new THREE.Box3().setFromObject(m), c = bx.getCenter(V(0, 0, 0)), sz = bx.getSize(V(0, 0, 0));
      m.position.sub(c); ts.add(m);
      const d = Math.max(sz.x, sz.y, sz.z) * 2.3 + 0.02;
      tc.position.set(0, d * 0.75, d * 0.66); tc.lookAt(0, 0, 0);
      renderer.setViewport(0, 0, size / pr, size / pr); renderer.setScissor(0, 0, size / pr, size / pr);
      renderer.render(ts, tc);
      g2.drawImage(renderer.domElement, 0, renderer.domElement.height - size, size, size, 0, 0, size, size);
      try { out.set(it.key, c2.toDataURL("image/webp", 0.85)); } catch { /* tainted or unsupported */ }
      ts.remove(m);
      m.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((mm) => mm.dispose()); });
    }
    renderer.setScissorTest(false); renderer.setViewport(vp);
    return out;
  }

  return {
    enter, update, thumbs,
    dispose() {
      if (ro) ro.disconnect();
      clearDyn();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
      for (const x of statics) if (x.dispose) x.dispose();
      envRT.dispose();
      renderer.dispose();
    },
  };
}
