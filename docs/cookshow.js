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
    [/\b(cubed|cubes?)\b/, "cubes"],
    [/\b(diced|dice|chopped|chop)\b/, "diced"],
    [/\b(thinly sliced|sliced thinly)\b/, "thin"],
    [/\b(sliced|slices?|rings?)\b/, "sliced"],
    [/\b(crushed|pounded|smashed|bruised)\b/, "crushed"],
    [/\b(quartered|quarters?)\b/, "quartered"],
    [/\b(halved|halves|cut in half)\b/, "halved"],
    [/\b(wedges?)\b/, "wedges"],
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
      liquid: water || COOK_LIQUID.test(l.slug || name.toLowerCase().replace(/\s+/g, "_")),
      water, toTaste: l.status === "to-taste", fryOil: !!(l.slug && COOK_FRY_OIL.test(l.slug)),
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
  ["drain", /\b(drain|set aside|remove (it|them|from|the)|let (it )?cool|wire rack|paper towel)/],
  ["serve", /\b(serve|transfer to a serving|garnish)/],
];

const COOK_TIMED = new Set(["marinate", "boil", "simmer", "cook", "fry", "deepfry", "grill", "bake", "steam"]);
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
  if (frying === "deep" || /\b(fried|prito|pritong|crispy|lumpia|shanghai|turon|kawali|chicharon)\b/.test(t)) {
    return [{ kind: "heat" }, { kind: "deepfry", items: meats.length ? meats : veg, minutes: 15 }, { kind: "drain" }];
  }
  if (/\b(sinigang|tinola|nilaga|bulalo|sopas|soup|sabaw|batchoy|molo|pochero)\b/.test(t)) {
    return [{ kind: "add", items: meats, vessel: "kaldero" }, { kind: "pour", items: waters }, { kind: "boil", minutes: /bulalo|nilaga|pochero/.test(t) ? 180 : 45 },
      { kind: "add", items: veg }, { kind: "simmer", minutes: 10 }, { kind: "season", items: sauces }];
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
  for (const it of items.filter((x) => x.cut).slice(0, 8)) { steps.push({ kind: "cut", items: [it], style: it.cut.style, size: it.cut.size }); cutDone.add(it); }

  const text = [...(recipe.instructions || []), ...(recipe.methodNotes ? [recipe.methodNotes] : [])].join(" ");
  const sentences = text.split(/(?<=[.!?;])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  let actions = cookActionsFromText(sentences, items);
  const cooking = actions.filter((a) => COOK_TIMED.has(a.kind) || a.kind === "heat" || a.kind === "saute");
  if (!cooking.length) actions = cookTemplate(recipe.title, recipe.frying, items).map((a) => ({ items: [], minutes: null, ...a }));

  let vessel = null, lastMain = null;
  const mains = new Set(items.filter((it) => !it.liquid && !it.toTaste && !/cube|powder|seasoning|salt|sugar|pepper/.test(it.key)));
  for (const a of actions) {
    if (a.kind === "serve") continue;
    if (a.vessel) vessel = a.vessel;
    else if (["deepfry", "fry", "saute"].includes(a.kind)) vessel = vessel === "kaldero" && a.kind !== "deepfry" ? vessel : vessel || "kawali";
    else if (a.kind === "heat") vessel = vessel || "kawali";
    else if (["boil", "simmer"].includes(a.kind)) vessel = vessel || "kaldero";
    if (["grill", "bake", "steam"].includes(a.kind)) vessel = a.kind === "grill" ? "ihawan" : a.kind === "bake" ? "oven" : "steamer";
    let its = (a.items || []).map((k) => byKey.get(k)).filter(Boolean);
    for (const it of its) if (mains.has(it)) lastMain = it;
    if (a.kind === "cut") {
      // "Slice into serving pieces" after cooking: cut whatever was cooked last.
      if (!its.length && lastMain) its = [lastMain];
      its = its.filter((it) => !cutDone.has(it) || steps.some((s) => COOK_TIMED.has(s.kind) && s.items.includes(it)));
      if (!its.length) continue;
      steps.push({ kind: "cut", items: its.slice(0, 1), style: a.cut.style, size: a.cut.size, vessel: vessel || "kawali" });
      continue;
    }
    if (["add", "pour", "mix", "saute", "wrap"].includes(a.kind) && !its.length) continue;
    const kind = a.kind === "add" && its.every((x) => x.liquid) ? "pour" : a.kind;
    const prev = steps[steps.length - 1];
    // Merge "add X" + "add Y" (or two stirs) into one step; keep timed steps separate.
    if (prev && prev.kind === kind && !COOK_TIMED.has(kind) && prev.vessel === (vessel || "kawali")) {
      for (const it of its) if (!prev.items.includes(it)) prev.items.push(it);
      continue;
    }
    steps.push({ kind, items: its, minutes: a.minutes || null, vessel: vessel || "kawali" });
  }
  const seasonings = items.filter((it) => it.toTaste);
  const seasonStep = steps.find((x) => x.kind === "season");
  if (seasonings.length && !seasonStep) steps.push({ kind: "season", items: seasonings, vessel: vessel || "kawali" });
  else if (seasonStep) for (const it of seasonings) if (!seasonStep.items.includes(it)) seasonStep.items.push(it);
  steps.push({ kind: "serve", items: [], vessel: vessel || "kawali" });
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
    case "drain": return en ? "Take out and let it drain" : "Hanguin at patuluin";
    case "serve": return en ? "Serve while hot" : "Ihain habang mainit";
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
    cookStart(rec.title || "", steps, c.costPerServing);
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
    lastResult && lastResult.summary ? lastResult.summary.cost : null);
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
      <div class="cook-stage"><canvas id="cook-canvas" aria-hidden="true"></canvas><p id="cook-caption" class="cook-caption" aria-live="polite"></p></div>
      <div class="cook-controls">
        <button type="button" class="wx-btn" onclick="cookGo(-1)" aria-label="${escapeHtml(cookT("cook.prev", "Nakaraan"))}">⏮</button>
        <button type="button" class="wx-btn on" id="cook-play" onclick="cookToggle()">▶</button>
        <button type="button" class="wx-btn" onclick="cookGo(1)" aria-label="${escapeHtml(cookT("cook.next", "Susunod"))}">⏭</button>
        <span id="cook-count" class="cook-count"></span>
      </div>
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

function cookStart(title, steps, costPerServing) {
  const lang = cookLang();
  cookStop();
  cookShow = { title, steps, i: 0, t: 0, playing: false, cost: costPerServing, last: 0, three: null };
  document.getElementById("cook-title").textContent = title;
  document.getElementById("cook-steps").innerHTML = steps.map((s, i) => `
    <li><button type="button" class="cook-step" data-i="${i}" onclick="cookJump(${i})">
      <span class="cook-step-n">${i + 1}</span><span class="cook-step-ico" aria-hidden="true">${escapeHtml(cookStepIcon(s))}</span><span>${escapeHtml(cookCaption(s, lang))}</span>
    </button></li>`).join("");
  cookShowStep();
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  loadThree().then(() => {
    if (!cookShow) return;
    cookShow.three = cookBuildScene(window.THREE, document.getElementById("cook-canvas"));
    cookEnterStep();
    cookShow.playing = !reduce;
    document.getElementById("cook-play").textContent = cookShow.playing ? "⏸" : "▶";
    cookShow.last = performance.now();
    cookShow.raf = requestAnimationFrame(cookFrame);
  }).catch(() => {
    document.querySelector("#cook-dialog .cook-stage").innerHTML = `<p class="cook-caption">${escapeHtml(cookT("cook.textOnly", "Hindi ma-load ang 3D. Heto ang mga hakbang."))}</p>`;
  });
}

function cookStepIcon(s) {
  return { shop: "🧺", peel: "🧽", cut: "🔪", marinate: "🥣", heat: "🔥", saute: "🍳", add: "➕", pour: "🫗", boil: "♨️", simmer: "♨️",
    fry: "🍳", deepfry: "🛢️", grill: "🔥", bake: "🔥", steam: "♨️", stir: "🥄", mix: "🥣", wrap: "🌯", cook: "♨️", season: "🧂", drain: "🧻", serve: "🍽️" }[s.kind] || "•";
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

/** Seconds a step plays: long cooking gets a little more time for the clock. */
function cookStepLength(s) {
  if (s.kind === "shop") return Math.min(7, 2.2 + 0.45 * s.items.length);
  if (COOK_TIMED.has(s.kind)) return 4.5;
  return 3.2;
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

// ── Scene ──

const COOK_X = { shop: -2.55, board: -0.85, stove: 1.0, plate: 2.55 };

function cookStation(s) {
  if (s.kind === "shop") return COOK_X.shop;
  if (["peel", "marinate", "mix", "wrap"].includes(s.kind) || (s.kind === "cut" && !s.vessel)) return COOK_X.board;
  if (s.kind === "cut") return COOK_X.plate;
  if (s.kind === "serve") return COOK_X.plate;
  return COOK_X.stove;
}

/** A canvas-drawn sprite: an emoji with an optional caption under it. */
function cookSprite(THREE, emoji, label, size = 0.42) {
  const c = document.createElement("canvas");
  c.width = 160; c.height = label ? 200 : 160;
  const g = c.getContext("2d");
  g.textAlign = "center"; g.textBaseline = "middle";
  g.font = "110px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
  g.fillText(emoji, 80, 82);
  if (label) {
    g.font = "bold 24px Inter, sans-serif"; g.fillStyle = "#163F2E";
    const text = label.length > 14 ? `${label.slice(0, 13)}…` : label;
    const w = g.measureText(text).width + 16;
    g.fillStyle = "rgba(248,244,234,.92)"; g.fillRect(80 - w / 2, 160, w, 34);
    g.fillStyle = "#163F2E"; g.fillText(text, 80, 178);
  }
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(size, size * (c.height / c.width), 1);
  return sp;
}

function cookBuildScene(THREE, canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: window.devicePixelRatio < 2, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(document.documentElement.classList.contains("dark") ? 0x16291f : 0xf3ecdb);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
  camera.position.set(0, 2.55, 6.1);
  camera.lookAt(0, 1.05, 0);

  scene.add(new THREE.HemisphereLight(0xfff6e5, 0x6b5a3a, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 0.75);
  sun.position.set(3, 6, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  const box = (w, h, d, color, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  const cyl = (rt, rb, h, color, x, y, z, seg = 24) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };

  // Floor, wall, counter (between the cook and the camera), palengke stall, stove, plate.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), mat(0xe9e2cf)); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  box(14, 4, 0.1, 0xf8f4ea, 0, 2, -1.6);
  box(5.2, 0.9, 0.9, 0x2f7a55, 0.55, 0.45, 0.55);
  box(5.3, 0.06, 1.0, 0xd8c9a3, 0.55, 0.93, 0.55);
  box(1.1, 0.75, 0.8, 0xc9961a, COOK_X.shop, 0.38, 0.55);              // stall
  box(1.2, 0.05, 0.9, 0xdc2626, COOK_X.shop, 1.55, 0.55);              // awning
  [-0.55, 0.55].forEach((dx) => cyl(0.03, 0.03, 0.8, 0x855f0e, COOK_X.shop + dx, 1.15, 0.2));
  const bayong = cyl(0.26, 0.2, 0.32, 0xb88a3e, COOK_X.shop, 0.92, 0.6, 12);
  const board = box(0.85, 0.05, 0.5, 0xd2a46b, COOK_X.board, 0.985, 0.55);
  const knife = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.01, 0.07), mat(0xdfe5ea, { metalness: 0.6, roughness: 0.3 })); blade.position.x = 0.16; knife.add(blade);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.05), mat(0x3b2a1a)); handle.position.x = -0.07; knife.add(handle);
  knife.position.set(COOK_X.board + 0.15, 1.05, 0.5); scene.add(knife);
  box(0.95, 0.12, 0.65, 0x374151, COOK_X.stove, 0.99, 0.55);           // stove
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.22, 12), new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.85 }));
  flame.position.set(COOK_X.stove, 1.12, 0.55); flame.visible = false; scene.add(flame);
  const kawali = cyl(0.36, 0.22, 0.12, 0x2b2b2b, COOK_X.stove, 1.12, 0.55);
  const kaldero = cyl(0.3, 0.3, 0.42, 0x9ca3af, COOK_X.stove, 1.27, 0.55); kaldero.material.metalness = 0.5;
  const pot = { kawali, kaldero };
  const appliance = box(0.85, 0.55, 0.6, 0x4b5563, COOK_X.stove, 1.33, 0.55); appliance.visible = false; // oven / grill / steamer
  const plate = cyl(0.36, 0.3, 0.04, 0xffffff, COOK_X.plate, 0.98, 0.55);

  // Kuya Kusinero: stick limbs, round head, forest apron, chef's hat.
  const ink = mat(0x1f2937), skin = mat(0xf2d3b0), white = mat(0xffffff), apronMat = mat(0x1d5239);
  const cook = new THREE.Group(); scene.add(cook);
  const limb = (len, r = 0.045) => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), ink); m.position.y = -len / 2; m.castShadow = true; g.add(m); const j = new THREE.Mesh(new THREE.SphereGeometry(r * 1.25, 8, 8), ink); j.position.y = -len; g.add(j); return g; };
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.62, 8), ink); torso.position.y = 1.18; torso.castShadow = true; cook.add(torso);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.04), apronMat); apron.position.set(0, 1.08, 0.08); apron.castShadow = true; cook.add(apron);
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.01), mat(0xdcae2b)); pocket.position.set(0, 1.0, 0.105); cook.add(pocket);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), skin); head.position.y = 1.7; head.castShadow = true; cook.add(head);
  [-0.07, 0.07].forEach((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), ink); e.position.set(x, 1.73, 0.18); cook.add(e); });
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.01, 6, 12, Math.PI), ink); smile.position.set(0, 1.65, 0.185); smile.rotation.z = Math.PI; cook.add(smile);
  const hatBand = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.14, 16), white); hatBand.position.y = 1.9; cook.add(hatBand);
  [[-0.1, 0], [0.1, 0], [0, 0.08], [0, -0.06]].forEach(([x, z]) => { const p = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), white); p.position.set(x, 2.07, z); p.castShadow = true; cook.add(p); });
  const shoulderL = limb(0.34), shoulderR = limb(0.34), elbowL = limb(0.3), elbowR = limb(0.3);
  shoulderL.position.set(-0.17, 1.45, 0); shoulderR.position.set(0.17, 1.45, 0);
  elbowL.position.y = -0.34; elbowR.position.y = -0.34; shoulderL.add(elbowL); shoulderR.add(elbowR);
  const hipL = limb(0.86, 0.05), hipR = limb(0.86, 0.05);
  hipL.position.set(-0.09, 0.88, 0); hipR.position.set(0.09, 0.88, 0);
  cook.add(shoulderL, shoulderR, hipL, hipR);
  const spoon = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 6), mat(0x855f0e)); spoon.position.y = -0.36; spoon.rotation.x = 0.4; spoon.visible = false; elbowR.add(spoon);
  cook.position.set(0, 0, -0.25);

  // Particles: steam, bubbles, sizzle.
  const puffs = [];
  const puffTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, "rgba(255,255,255,.9)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  for (let i = 0; i < 26; i++) { const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 })); p.userData.seed = Math.random(); scene.add(p); puffs.push(p); }
  const sparks = [];
  for (let i = 0; i < 18; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffc145 })); s.visible = false; s.userData.seed = Math.random(); scene.add(s); sparks.push(s); }

  // The time-lapse clock for long steps.
  const clockCanvas = document.createElement("canvas"); clockCanvas.width = clockCanvas.height = 160;
  const clockTex = new THREE.CanvasTexture(clockCanvas);
  const clock = new THREE.Sprite(new THREE.SpriteMaterial({ map: clockTex, transparent: true, depthWrite: false }));
  clock.scale.set(0.62, 0.62, 1); clock.position.set(COOK_X.stove + 0.95, 2.05, 0.4); clock.visible = false; scene.add(clock);
  const drawClock = (frac, minutes) => {
    const g = clockCanvas.getContext("2d"); g.clearRect(0, 0, 160, 160);
    g.fillStyle = "#F8F4EA"; g.strokeStyle = "#163F2E"; g.lineWidth = 8; g.beginPath(); g.arc(80, 70, 56, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = "rgba(47,122,85,.35)"; g.beginPath(); g.moveTo(80, 70); g.arc(80, 70, 50, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); g.fill();
    const a = -Math.PI / 2 + Math.PI * 2 * (frac * Math.max(1, minutes / 60) % 1);
    g.strokeStyle = "#163F2E"; g.lineWidth = 6; g.beginPath(); g.moveTo(80, 70); g.lineTo(80 + Math.cos(a) * 40, 70 + Math.sin(a) * 40); g.stroke();
    g.fillStyle = "#163F2E"; g.font = "bold 26px Inter, sans-serif"; g.textAlign = "center";
    g.fillText(cookTimeText(Math.round(minutes * frac), cookLang()) || "0", 80, 152);
    clockTex.needsUpdate = true;
  };

  let props = [];          // sprites made for the current step
  const inPot = [];        // ingredients already in the pot (persist between steps)
  const onBoard = [];
  let fromX = cook.position.x, toX = cook.position.x;

  const clearProps = () => { for (const p of props) { scene.remove(p); p.material.map && p.material.map.dispose(); p.material.dispose(); } props = []; };
  const potTop = () => (kaldero.visible ? 1.5 : 1.2);

  function enter(step, index, steps) {
    clearProps();
    fromX = cook.position.x; toX = cookStation(step);
    // Rebuild what's in the pot so jumping around stays consistent.
    for (const p of inPot.splice(0)) scene.remove(p);
    for (const p of onBoard.splice(0)) scene.remove(p);
    const done = steps.slice(0, index);
    const potKinds = new Set(["saute", "add", "pour", "fry", "deepfry", "boil", "simmer", "marinate", "grill", "bake", "steam"]);
    const vesselNow = step.vessel || (done.slice().reverse().find((s) => s.vessel) || {}).vessel || "kawali";
    kaldero.visible = vesselNow === "kaldero"; kawali.visible = !kaldero.visible && !["oven", "ihawan", "steamer"].includes(vesselNow);
    appliance.visible = ["oven", "ihawan", "steamer"].includes(vesselNow);
    appliance.material.color.set(vesselNow === "ihawan" ? 0x1f2937 : vesselNow === "steamer" ? 0xb8c2cc : 0x4b5563);
    const added = new Set();
    for (const s of done) if (potKinds.has(s.kind)) for (const it of s.items) added.add(it);
    [...added].slice(-6).forEach((it, k) => { const sp = cookSprite(THREE, it.icon, null, 0.26); sp.position.set(COOK_X.stove - 0.2 + (k % 3) * 0.2, potTop() + 0.05 + Math.floor(k / 3) * 0.12, 0.62); scene.add(sp); inPot.push(sp); });
    const cutDone = done.filter((s) => s.kind === "cut").flatMap((s) => s.items).filter((it) => !added.has(it));
    cutDone.slice(-4).forEach((it, k) => { const sp = cookSprite(THREE, it.icon, null, 0.18); sp.position.set(COOK_X.board - 0.3 + k * 0.18, 1.1, 0.68); scene.add(sp); onBoard.push(sp); });

    if (step.kind === "shop") {
      step.items.slice(0, 12).forEach((it, k) => {
        const sp = cookSprite(THREE, it.icon, it.label, 0.42);
        sp.userData = { k, start: new THREE.Vector3(COOK_X.shop - 0.9 + (k % 4) * 0.6, 2.35 - Math.floor(k / 4) * 0.55, 0.9) };
        sp.position.copy(sp.userData.start); scene.add(sp); props.push(sp);
      });
    } else if (step.kind === "serve") {
      const dish = cookSprite(THREE, "🍲", null, 0.6); dish.position.set(COOK_X.plate, 1.25, 0.6); scene.add(dish); props.push(dish);
      if (cookShow && cookShow.cost) { const tag = cookSprite(THREE, "💰", `₱${Number(cookShow.cost).toFixed(0)}/serving`, 0.55); tag.position.set(COOK_X.plate, 1.95, 0.6); scene.add(tag); props.push(tag); }
    } else if (step.items.length) {
      step.items.slice(0, 5).forEach((it, k) => {
        const sp = cookSprite(THREE, it.icon, step.kind === "cut" || step.kind === "peel" ? it.label : null, step.kind === "cut" ? 0.5 : 0.32);
        sp.userData = { k };
        sp.position.set(step.kind === "cut" || step.kind === "peel" ? COOK_X.board - 0.1 : COOK_X.board + k * 0.15, 1.25, 0.6);
        scene.add(sp); props.push(sp);
      });
    }
    flame.visible = !["shop", "peel", "cut", "marinate", "serve"].includes(step.kind) && !appliance.visible;
    clock.visible = !!step.minutes;
    spoon.visible = ["saute", "stir", "add", "boil", "simmer", "season", "pour", "fry", "deepfry"].includes(step.kind);
  }

  function update(step, t, len, dt) {
    const time = performance.now() / 1000;
    // Walk to the station in the first 0.8 s.
    const walk = Math.min(1, t / 0.8);
    cook.position.x = fromX + (toX - fromX) * (walk < 1 ? walk * walk * (3 - 2 * walk) : 1);
    const walking = walk < 1 && Math.abs(toX - fromX) > 0.05;
    const swing = walking ? Math.sin(time * 14) * 0.6 : 0;
    hipL.rotation.x = swing; hipR.rotation.x = -swing;
    cook.position.y = walking ? Math.abs(Math.sin(time * 14)) * 0.04 : 0;
    // Arms by action.
    let sLx = walking ? -swing * 0.6 : 0, sRx = walking ? swing * 0.6 : 0, eLx = -0.2, eRx = -0.2, sRz = 0, sLz = 0;
    const k = step.kind, act = walk >= 1;
    if (act && k === "cut") { sRx = -1.0; eRx = -0.9 + Math.abs(Math.sin(time * 12)) * 0.7; sLx = -0.9; eLx = -0.9; }
    else if (act && k === "peel") { sRx = -1.0; sLx = -1.0; eRx = -1.0 + Math.sin(time * 9) * 0.3; eLx = -1.0 - Math.sin(time * 9) * 0.3; }
    else if (act && ["saute", "stir", "boil", "simmer", "fry", "deepfry", "add", "season"].includes(k)) { sRx = -1.0 + Math.sin(time * 6) * 0.25; sRz = Math.cos(time * 6) * 0.25; eRx = -0.8; sLx = -0.4; }
    else if (act && k === "pour") { sRx = -1.4; eRx = -0.4; sRz = -0.4 - Math.sin(Math.min(1, t / 1.5) * Math.PI) * 0.5; }
    else if (act && k === "shop") { sRx = -1.2 + Math.sin(time * 5) * 0.4; eRx = -0.5; sLx = -0.6; }
    else if (act && k === "serve") { sRx = -1.3; sLx = -1.3; eRx = -0.3; eLx = -0.3; }
    else if (act && k === "heat") { sRx = -0.9; eRx = -0.4; }
    shoulderL.rotation.set(sLx, 0, sLz - 0.08); shoulderR.rotation.set(sRx, 0, sRz + 0.08);
    elbowL.rotation.x = eLx; elbowR.rotation.x = eRx;
    head.rotation.y = act ? Math.sin(time * 1.5) * 0.08 : 0;

    // Props.
    const frac = Math.min(1, t / len);
    if (k === "shop") {
      props.forEach((sp) => {
        const start = 0.6 + sp.userData.k * ((len - 1.2) / Math.max(1, props.length));
        const u = Math.max(0, Math.min(1, (t - start) / 0.6));
        const end = new THREE.Vector3(COOK_X.shop + (Math.random() - 0.5) * 0.02, 1.05, 0.6);
        sp.position.lerpVectors(sp.userData.start, end, u * u);
        sp.position.y += Math.sin(u * Math.PI) * 0.3;
        sp.material.opacity = 1 - Math.max(0, u - 0.85) * 6;
      });
      bayong.scale.y = 1 + 0.05 * Math.sin(time * 8) * (frac < 1 ? 1 : 0);
    } else if (k === "cut") {
      knife.position.set(cook.position.x + 0.25, 1.06 + Math.abs(Math.sin(time * 12)) * 0.12, 0.5);
      const sp = props[0];
      if (sp) { const sq = 1 - 0.55 * frac; sp.scale.set(0.5 * sq, 0.5 * sq * 1.25, 1); sp.position.y = 1.18 - 0.12 * frac; }
      if (frac > 0.55 && props.length === 1 && step.items[0]) {
        for (let i = 0; i < 6; i++) { const bit = cookSprite(THREE, step.items[0].icon, null, 0.12); bit.position.set(COOK_X.board - 0.28 + i * 0.1, 1.05, 0.66 + (i % 2) * 0.06); scene.add(bit); props.push(bit); }
      }
    } else if (["add", "saute", "pour", "fry", "deepfry", "marinate", "season"].includes(k)) {
      knife.position.set(COOK_X.board + 0.15, 1.05, 0.5);
      props.forEach((sp) => {
        const u = Math.max(0, Math.min(1, (t - 0.8 - sp.userData.k * 0.25) / 0.9));
        const target = k === "marinate" ? new THREE.Vector3(COOK_X.board, 1.1, 0.6) : new THREE.Vector3(COOK_X.stove + (sp.userData.k - 2) * 0.1, potTop() + 0.08, 0.62);
        const start = new THREE.Vector3(COOK_X.board + sp.userData.k * 0.15, 1.25, 0.6);
        sp.position.lerpVectors(start, target, u);
        sp.position.y += Math.sin(u * Math.PI) * 0.45;
      });
    }
    // Fire, steam, bubbles, sizzle.
    flame.scale.set(1, 0.8 + Math.sin(time * 20) * 0.15, 1);
    const steaming = ["boil", "simmer", "steam", "serve"].includes(k) || (["add", "pour"].includes(k) && kaldero.visible);
    const sizzling = ["fry", "deepfry", "saute"].includes(k) || (k === "heat" && frac > 0.5);
    puffs.forEach((p, i) => {
      const s = p.userData.seed;
      const cycle = (time * (k === "simmer" ? 0.35 : 0.6) + s) % 1;
      const x0 = k === "serve" ? COOK_X.plate : COOK_X.stove;
      p.position.set(x0 + (s - 0.5) * 0.4 + Math.sin(time + i) * 0.05, (k === "serve" ? 1.2 : potTop()) + cycle * 0.9, 0.6);
      p.scale.setScalar(0.18 + cycle * 0.35);
      p.material.opacity = steaming ? (1 - cycle) * (k === "simmer" ? 0.45 : 0.75) : 0;
    });
    sparks.forEach((s) => {
      s.visible = sizzling;
      if (!sizzling) return;
      const c = (time * 2.2 + s.userData.seed * 3) % 1;
      s.position.set(COOK_X.stove + (s.userData.seed - 0.5) * 0.6, 1.2 + Math.sin(c * Math.PI) * 0.35, 0.55 + (s.userData.seed - 0.5) * 0.4);
    });
    if (clock.visible) drawClock(frac, step.minutes || 0);
    renderer.render(scene, camera);
  }

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(200, box.width), h = Math.max(160, Math.round(w * (w < 560 ? 0.78 : 0.5)));
    renderer.setSize(w, h, false); canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.position.z = w < 560 ? 7.6 : 6.1;
    camera.updateProjectionMatrix();
  }
  resize();
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas.parentElement);

  return {
    enter, update,
    dispose() {
      if (ro) ro.disconnect();
      clearProps();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
      renderer.dispose();
    },
  };
}
