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
  if (/\bhalf an? hour\b/.test(s)) return 30;
  if (/\b(an|one) hour\b/.test(s) && !/\d\s*(hours?|hrs?|minutes?|mins?)\b/.test(s)) return 60;
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
/**
 * How a dish is wrapped, from its title and ingredients. Pure, tested.
 * roll: lumpia, turon · halfmoon: empanada, hand pies · pleat: siomai, open dumplings · bun: siopao ·
 * leaf: suman, binalot · parcel: wonton.
 */
function cookWrapStyle(title, items) {
  const t = String(title || "").toLowerCase(), keys = (items || []).map((it) => `${it.key} ${it.label}`.toLowerCase()).join(" | ");
  if (/\b(suman|binalot|pastil|tamales?|ibos|buri|patupat|bibingka sa dahon)\b/.test(t) || /banana_leaf|dahon_saging|banana leaves|buri/.test(keys)) return "leaf";
  if (/\b(siopao|bun|pao|cuapao|kuapao|mantou)\b/.test(t)) return "bun";
  if (/\b(siomai|shumai|shao ?mai)\b/.test(t)) return "pleat";
  if (/\b(wonton|panara)\b/.test(t)) return "parcel";
  if (/\b(empanada|empanadita|hand pie|pie\b|calzone|pastel|dumplings?|gyoza|pierogi|samosa)\b/.test(t)) return "halfmoon";
  if (/\b(lumpia|shanghai|turon|spring rolls?|egg rolls?|kikiam|dinamita|dynamite)\b/.test(t) || /wrapper/.test(keys)) return "roll";
  return /flour/.test(keys) ? "halfmoon" : "roll";
}
const COOK_WRAP_NAME = { roll: ["lumpia", "rolls"], halfmoon: ["empanada", "pastries"], pleat: ["siomai", "siomai"], bun: ["siopao", "buns"], leaf: ["suman", "parcels"], parcel: ["wonton", "wontons"] };
/** The wrapped dish's name: the dish's own word if the title has one ("empanada", "turon"), else the style's. */
function cookWrappedTitle(title, style) {
  const m = String(title || "").toLowerCase().match(/\b(empanadas?|empanaditas?|siopao|siomai|shumai|suman|turon|lumpia|lumpiang shanghai|shanghai|wontons?|dumplings?|panara|pies?|kikiam|binalot|pastil|dinamita)\b/);
  return m ? m[1] : (COOK_WRAP_NAME[style] || COOK_WRAP_NAME.roll)[0];
}

// Seasonings stay seasonings even when they were also in the filling (turon's sugar caramelises in the pan).
const COOK_SEASONING = /salt|sugar|pepper|powder|seasoning|msg|cube|vinegar|sauce|oil/;

/** "Lumpia wrapper" → "lumpia" (the rolled dish). */
function cookWrappedName(label) {
  const n = String(label || "").replace(/\s*(wrappers?|sheets?)\b.*$/i, "").trim().toLowerCase();
  return n || "lumpia";
}
// Frying oil: shown by "heat the oil", never listed as something added.
const COOK_FRY_OIL = /^oil_(cooking|vegetable|canola|palm|corn|frying)$|^cooking_oil$/;
// Things that are never cut on the board.
const COOK_NO_CUT = /salt|sugar|pepper_ground|black_pepper|powder|flour|starch|oil|sauce|vinegar|water|broth|stock|milk|cream|cube|seasoning|rice|noodle|pasta|spaghetti|macaroni|wrapper|paste|ketchup|mayonnaise|butter|cheese_|honey|wine|juice/;
const COOK_STOP = new Set(["fresh", "ground", "large", "small", "medium", "chopped", "sliced", "minced", "diced", "cleaned", "crushed", "scales", "removed", "scaled", "gutted", "trimmed", "rinsed", "washed", "cups", "cup", "piece", "pieces", "cloves", "clove", "whole", "dried", "cooked", "raw", "boneless", "skinless", "into", "and", "for", "the", "with", "cut", "about", "optional", "taste", "cooking", "lbs", "lb", "pounds", "pound", "grams", "kilo", "kilos", "tablespoons", "tablespoon", "teaspoons", "teaspoon", "tbsp", "tsp", "quart", "ounces", "pack", "packs", "can", "cans", "see", "notes", "note", "needed", "serving", "some", "bunch", "thumbs", "thumb", "inch", "inches", "big", "all"]);

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
      water, toTaste: l.status === "to-taste", group: l.group || "", grams: typeof l.gAP === "number" ? l.gAP : null, cost: typeof l.cost === "number" ? l.cost : null, fryOil: !!(l.slug && COOK_FRY_OIL.test(l.slug)),
      cut: (l.slug && COOK_NO_CUT.test(l.slug)) || water ? null : cookCutStyle(text),
      peel: /\b(peeled|deveined|shelled|cleaned|gutted|scaled)\b/i.test(text),
      // "Dredge the fish", "grill the meat": the bangus or the tilapia is "the fish" in the method.
      words: cookWords(`${name} ${l.name || ""} ${(l.slug || "").replace(/_/g, " ")} ${text}${/bangus|milkfish|tilapia|galunggong|tamban|tulingan|lapu|maya[- ]maya|dalagang|salmon|tuna steak|mackerel|hito|dalag|pompano|sapsap|fish fillet|cream dory|pangasius/i.test(`${name} ${l.slug || ""}`) && !/sauce|patis|flake|ball/i.test(`${name} ${l.slug || ""}`) ? " fish" : ""}`),
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
  // "Golden brown" and "browning" aren't the brown sugar.
  sentence = String(sentence || "").toLowerCase().replace(/\b(golden[- ]?)?brown(ed|ing|ish)?\b(?! sugar)/g, " ");
  const words = new Set(cookWords(sentence));
  // "pepper corn" in a step, "peppercorn" in the list.
  const plain = String(sentence || "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
  for (let i = 0; i + 1 < plain.length; i++) for (const w of cookWords(plain[i] + plain[i + 1])) words.add(w);
  // "Dredge the fish" means the bangus, not the fish sauce; "grill the chicken" means the chicken, not the
  // chicken powder: a sauce or a seasoning only wins a shared word when the sentence names it as one.
  const asSauce = /\b(sauce|patis|toyo)\b/.test(sentence), asSeasoning = /\b(powder|cubes?|seasoning|bouillon|granules|knorr|maggi|broth)\b/.test(sentence);
  const scored = items.filter((it) => !it.fryOil).map((it) => {
    let score = it.words.filter((w) => words.has(w)).length;
    if (score && ((it.words.includes("sauce") && !asSauce) || (/cube|powder|seasoning|bouillon|granule/.test(it.key) && !asSeasoning))) score -= 0.5;
    return { it, score };
  });
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
  ["marinate", /\bmarinat(e|ing)\b|\bmarinade (it|them) for\b|\blet (it |them )?marinate|\bsoak(ing)?\b(?! (the |it |them )?(in )?(under|in) the sun)|\bsun[- ]?dr(y|ied)\b|\bunder the sun\b|\bin (cold |warm |lukewarm )?water (for|until|overnight)\b/],
  ["deepfry", /\bdeep[- ]?fr(y|ied|ying)\b/],
  ["heat", /\bheat (up )?(the |a |some )?(cooking )?(oil|pan|pot|wok|skillet|kawali|butter|large|deep|frying|cast)/],
  ["saute", /\b(saut[eé]|gisa|stir[- ]?fry)/],
  ["fry", /\b(pan[- ]?fr(y|ied)|fry|fried)\b|\buntil (the )?garlic (turns |is |becomes )?(light )?(golden|brown|crisp)/],
  ["grill", /\b(grill|ihaw|broil|barbecue)/],
  ["bake", /\b(bake|oven|roast)\b/],
  ["steam", /\bsteam/],
  ["boil", /\b(bring (it )?to a boil|boil|parboil|blanch)|\bcook (the )?[a-z ]{0,30}according to (the )?package|\baccording to (the )?package (direction|instruction)/],
  ["simmer", /\b(simmer|lower the heat|low heat|continue cooking|continue to cook)/],
  ["cook", /\bcook(ing)? (it |them )?(until|for)\b/],
  ["cut", /\b(slice|chop|cut|crush) (it|them|into|the)\b/],
  ["rise", /\b(let (the dough |it )?rise|until (it )?doubles?|to rise|proof the dough)\b/],
  ["shape", /\b(shape (it |them |into)|form (into |them into )?(a |small )?balls?|into (small )?balls|divide the dough|cut into individual|portion the dough|into individual (slices|pieces|portions))\b/],
  ["rollout", /\b(rolling pin|roll (it |them |the dough |each )?out|flatten (the dough|each|it|them|the balls?|into|with|using))\b/],
  ["fill", /\b(filling|palaman)\b[^.]*\b(middle|center|centre)\b|\b(spoon|scoop|place|put|arrange)\b[^.]*\b(filling|mixture)\b|\b(on|over|onto) (the |a |each )?(piece of )?(lumpia |spring roll |wonton |siomai |dumpling )?wrappers?\b/],
  ["coat", /\b(roll|coat|dredge|dip)\b[^.]*\b(on|in|with)\b[^.]*\b(sugar|flour|bread ?crumbs|panko|batter|cornstarch)\b/],
  ["brush", /\bbrush\b[^.]*\b(egg|butter|oil|wash|milk)\b/],
  ["dough", /\b(dough|knead|masahin|pastry blender|cut in the butter|until (it |the mixture )?forms? a ball)\b/],
  ["wrap", /\bwrap\b|\broll (and|it|them|the|to|each|up)\b|\b(fold|crimp|seal|lock the edges|lock the|pinch|pleat|tuck)\b/],
  ["caramel", /\bcarameli[sz]|\bcaramel\b|\bmelt (the )?sugar\b/],
  ["pour", /\bpour\b/],
  ["mix", /\b(combin(e|ing)|mix|blend|beat (the |them |it |until|well|using|with)|whisk)\b/],
  ["add", /\b(add|put|place|toss in|return|arrange)\b/],
  ["stir", /\bstir\b/],
  ["season", /\b(season|rub|to taste|sprinkle)\b/],
  ["chill", /\b(refrigerat\w*|chill|freez\w*|fridge|ref)\b/],
  ["strain", /\b(strain\w*|sieve|colander|salain|salaan)\b/],
  ["top", /\b(top (it |them |the [a-z]+ )?with|on top|garnish(ed)? with|sprinkle\b[^.]*\bover|ilagay sa ibabaw)\b/],
  ["drain", /\b(drain|set aside|remove (it|them|from|the(?! (cover|lid)))|let (it )?cool|wire rack|paper towel)/],
  ["serve", /\b(serve|transfer to a serving)/],
];

const COOK_TIMED = new Set(["marinate", "boil", "simmer", "cook", "fry", "deepfry", "grill", "bake", "steam", "chill", "rise"]);
const COOK_POT_WORDS = /\b(pot|casserole|kaldero|saucepan|stockpot|dutch oven|rice cooker)\b/;
const COOK_PAN_WORDS = /\b(pan|wok|skillet|kawali|frying pan)\b/;

/**
 * Phrases that look like a step but aren't, rewritten before the verbs are read: "so the steam can come out"
 * isn't steaming, "fold until blended" is mixing, "seal the freezer bag" isn't wrapping, "the grilled chicken"
 * isn't grilling it again, "lechon kawali" is a dish, not the pan. Pure, tested.
 */
function cookPhrases(s) {
  let t = s
    .replace(/\bsteam (can |to |will |could )?(come out|escape|out)\b|\blet (the )?steam (out|escape)\b/g, "vapour out")
    .replace(/\b(freezer|ziploc|zip-?lock|zip top|resealable|plastic) bags?\b/g, "bag")
    .replace(/\bseal (the )?(bag|container|jar|lid|tub)\b/g, "close the $2")
    .replace(/\bremove (the )?(excess )?air\b/g, "squeeze out the air")
    .replace(/\b(the|your|with|and) (grilled|fried|baked|steamed|boiled|roasted|toasted) /g, "$1 ")
    .replace(/\blechon kawali\b/g, "lechon")
    .replace(/\bmake the [a-z -]{1,30}? by\b/g, "")
    .replace(/\b(oil|fat|drippings) (from|used for|used in|left from) (frying|cooking) the [a-z]+/g, "$1")
    .replace(/\b(arrange|place|put|transfer|scoop) (the |it |them )?[a-z ]{0,30}?(in|on|onto|to|into) (a |the |individual )?(serving )?(plates?|platter|serving bowl)\b/g, "plate it")
    .replace(/\bremove all\b/g, "remove them")
    .replace(/\bmelt(ing)? (the )?(butter|margarine)\b/g, "heat the butter")
    .replace(/\b(slowly )?cook (it |them )?(slowly )?while stirring\b/g, "cook until")
    .replace(/\bbrown(ing|ed)? (the )?(beef|pork|meat|chicken|ground)/g, "fry the $3")
    .replace(/\b(separate|remove) the (egg )?(yolks?|whites?) (from|of)\b/g, "crack the eggs, keep the yolks, $4")
    .replace(/\buntil (the |it )?(solid )?sugar (turns|melts|becomes)\b/g, "until caramel $3");
  // "Fold until well blended", "fold in the cheese": mixing, unless something is being wrapped.
  if (!/\b(wrapper|dough|edges?|in half|corners?|triangle|sides? over|pastry|leaf|leaves|tortilla)\b/.test(t)) t = t.replace(/\bfold\b(?= (in|it|them|everything|gently|until|to combine|together|the [a-z ]{0,20}(in|into|until)))/g, "mix");
  return t;
}

/** Cooking actions from free text, in order. Each: { kind, items:[keys], minutes, vessel? }. */
function cookActionsFromText(sentences, items) {
  const out = [];
  for (const sentence of sentences) {
    // Lower case, no parentheticals, and every kind of space (recipe sites use non-breaking ones) as one space.
    // Parentheses are dropped, except a step hidden in them: "(soak it in water for 10 minutes first)".
    const s = cookPhrases(String(sentence || "").toLowerCase().replace(/\(([^)]*\bsoak[^)]*)\)/g, ", $1,").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " "));
    if (/^note\b|^(watch|see|refer to) (the )?video/.test(s)) continue;
    const found = COOK_VERBS.map(([kind, re]) => { const m = s.match(re); return m ? { kind, at: m.index } : null; })
      .filter(Boolean).sort((a, b) => a.at - b.at);
    let kinds = [...new Set(found.map((f) => f.kind))];
    // "Add the bihon (soak it in water first)": the soaking comes first.
    if (kinds.includes("marinate") && /\b(first soak|soak[^.]*\bfirst)\b/.test(s)) kinds = ["marinate", ...kinds.filter((k) => k !== "marinate")];
    // "Deep fry" also matches "fry"; "combine … then marinate" is one marinating step;
    // "add salt to taste" is seasoning; "combine … in a pot" is adding to the pot.
    if (kinds.includes("deepfry")) kinds = kinds.filter((k) => k !== "fry");
    // "Top with fried chicharon", "add the fried tofu": "fried" describes the food, it isn't a step.
    if (kinds.includes("fry") && kinds.some((k) => ["top", "add", "serve", "mix", "season"].includes(k)) && !/\b(fry|pan[- ]?fry)\b/.test(s)) kinds = kinds.filter((k) => k !== "fry");
    if (kinds.includes("marinate")) kinds = kinds.filter((k) => k !== "mix");
    if (kinds.includes("season") && /to taste/.test(s)) kinds = kinds.filter((k) => k !== "add");
    if (kinds.includes("mix") && COOK_POT_WORDS.test(s)) kinds = kinds.map((k) => (k === "mix" ? "add" : k));
    if (kinds.includes("cut") && kinds.includes("add")) kinds = kinds.filter((k) => k !== "cut" || /^(slice|chop|cut|crush)/.test(s));
    // Dough and wrapping: "dough" names the dough in most sentences ("flatten the dough", "let the dough rise").
    if (kinds.some((k) => ["rollout", "shape", "fill", "wrap", "chill", "rise", "brush"].includes(k))) kinds = kinds.filter((k) => k !== "dough");
    if (kinds.includes("dough")) kinds = kinds.filter((k) => !["mix", "add", "pour", "stir"].includes(k));
    if (kinds.includes("shape")) kinds = kinds.filter((k) => k !== "cut");
    if (kinds.includes("coat")) kinds = kinds.filter((k) => k !== "wrap");
    // "In a mixing bowl, put in the flour … and the yeast mixture" is mixing, not filling a wrapper.
    if (kinds.includes("fill") && /\bbowl\b/.test(s) && !/\b(wrapper|dough|leaf|leaves|container|middle|center|centre)\b/.test(s.replace(/\bmake the dough\b/, ""))) kinds = kinds.filter((k) => k !== "fill").concat(kinds.includes("add") || kinds.includes("mix") ? [] : ["mix"]);
    if (kinds.includes("fill")) kinds = kinds.filter((k) => !["add", "mix"].includes(k));
    // "Remove … and arrange on a plate lined with paper towels", "place in a steamer and steam": one step each.
    if (kinds.includes("drain") || kinds.some((k) => ["steam", "bake", "grill", "deepfry", "fry"].includes(k))) kinds = kinds.filter((k) => k !== "add");
    if (kinds.includes("rollout")) kinds = kinds.filter((k) => k !== "wrap" || /\b(fold|seal|crimp|wrap)\b/.test(s));
    // Melting sugar into caramel is one step, whatever else the sentence says ("put the sugar in the mold and mix").
    // "Put the chicken in a bag and pour in the marinade", "place the yolks in a bowl and beat": a bowl, not the pan.
    if (/\b(bowl|bag|container)\b/.test(s) && !COOK_POT_WORDS.test(s) && kinds.some((k) => ["add", "pour"].includes(k)) && !kinds.some((k) => ["fill", "dough", "marinate", "chill"].includes(k))) kinds = kinds.filter((k) => !["add", "pour"].includes(k)).concat(kinds.includes("mix") ? [] : ["mix"]);
    // "Arrange the mixture in a baking pan" is not a wrapper being filled.
    if (kinds.includes("fill") && /\b(baking|pan|dish|tray|molds?|llanera|plate|platter|casserole|ramekins?)\b/.test(s) && !/\b(wrappers?|dough|leaf|leaves|middle|center|centre)\b/.test(s)) kinds = kinds.map((k) => (k === "fill" ? "add" : k));
    // "Let it cool, then refrigerate" is chilling, not taking food out of the pan.
    if (kinds.includes("chill") && kinds.includes("drain") && !/\b(drain|remove|paper towels?|wire rack|set aside|take out)\b/.test(s)) kinds = kinds.filter((k) => k !== "drain");
    // "Sauté the garlic … continue cooking until the onion softens" is still sautéing.
    if (kinds.includes("saute") && !/\b(simmer|low heat|lower the heat)\b/.test(s)) kinds = kinds.filter((k) => k !== "simmer");
    if (kinds.includes("caramel")) kinds = kinds.filter((k) => !["add", "mix", "cook", "stir", "pour", "heat", "simmer", "boil"].includes(k));
    // "Remove from the grill", "take it out of the oven": the cooking already happened.
    if (kinds.includes("drain") && /\b(from|off|out of) the (grill|oven|steamer|griddle)\b/.test(s)) kinds = kinds.filter((k) => !["grill", "bake", "steam"].includes(k));
    kinds = [...new Set(kinds)];
    if (!kinds.length) continue;
    const sv = s.replace(/\bpan[- ]?fr(y|ied|ying)\b/g, "fry");
    const vessel = COOK_POT_WORDS.test(sv) ? "kaldero" : COOK_PAN_WORDS.test(sv) ? "kawali" : null;
    const mentioned = cookMentions(s, items).map((it) => it.key);
    const minutes = cookMinutes(s);
    let itemsGiven = false, timeGiven = false;
    for (const kind of kinds) {
      const takesItems = !["heat", "serve", "drain", "boil", "simmer", "cook", "stir"].includes(kind) || (kind === "boil" && !itemsGiven);
      const a = { kind, items: takesItems && !itemsGiven ? mentioned : [], minutes: COOK_TIMED.has(kind) && !timeGiven ? minutes : null, vessel };
      if (kind === "cut") a.cut = cookCutStyle(s) || { style: "pieces", size: null };
      if (kind === "steam") a.steamer = /\bsteamer|bamboo|siomai|siopao|puto|kutsinta|dumpling|molds?\b|llanera|ramekin|foil|leche|flan|banana lea/.test(s);
      if (kind === "rollout") { const d = s.match(/(\d+(?:\.\d+)?)(?:\s*(?:to|-)\s*(\d+(?:\.\d+)?))?\s*(?:-?\s*inch(?:es)?|")/); if (d) a.size = Math.round(((parseFloat(d[1]) + parseFloat(d[2] || d[1])) / 2) * 2.54); }
      if (kind === "wrap") a.fork = /\bfork\b/.test(s);
      if (kind === "dough") a.knead = /\bknead|masahin\b/.test(s);
      if (kind === "cook" && /\buntil\b/.test(s)) a.until = true;
      if (["add", "pour"].includes(kind) && /\bmixture\b/.test(s)) a.mixture = true;
      if (kind === "add" && /\b(back|return|previously|reserved|set aside earlier|that were (cooked|fried))\b/.test(s)) a.back = true;
      if (kind === "drain") a.aside = /\b(set (it |them )?aside|let (it )?cool)\b/.test(s) && !/\b(drain|paper towels?|wire rack|strain)\b/.test(s);
      if (kind === "marinate") { a.sun = /\bsun[- ]?dr|\bunder the sun\b/.test(s); a.soak = !a.sun && /\bsoak|\bin (cold |warm |lukewarm )?water\b/.test(s) && !/\bmarinat/.test(s); }
      if (a.items.length && !(kind === "marinate" && /\bsoak/.test(s))) itemsGiven = true;
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
    // Vegetables go in by how long they take: roots and gourds first, beans and eggplant next, leaves last.
    const byTime = (re) => veg.filter((k) => re.test(k));
    const leafy = byTime(/pechay|bok choy|kangkong|spinach|malunggay|moringa|cabbage|petsay|mustard|chili_leaves|sili_leaves|leaves/);
    const mid = byTime(/sitaw|string_bean|long_bean|eggplant|okra|chili|siling|bell_pepper|beans|snow|baguio|corn/).filter((k) => !leafy.includes(k));
    const hard = veg.filter((k) => !leafy.includes(k) && !mid.includes(k));
    const out = [{ kind: "add", items: meats, vessel: "kaldero" }, { kind: "pour", items: waters }, { kind: "boil", minutes: /bulalo|nilaga|pochero/.test(t) ? 180 : 45 }];
    if (hard.length) out.push({ kind: "add", items: hard }, { kind: "simmer", minutes: 10 });
    if (mid.length) out.push({ kind: "add", items: mid }, { kind: "simmer", minutes: 5 });
    out.push({ kind: "season", items: sauces });
    if (leafy.length) out.push({ kind: "add", items: leafy }, { kind: "cook", minutes: 2 });
    return out;
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

  // Wrapped dishes: one item stands for what comes out of the wrapping step (the empanadas, the siopao),
  // and every later step that names the filling, the wrapper or the dish uses it.
  const wrapStyle = cookWrapStyle(recipe.title, items);
  const hasDough = actions.some((a) => ["dough", "rollout", "shape", "rise"].includes(a.kind));
  const wrappedName = cookWrappedTitle(recipe.title, wrapStyle);
  const wrapped = { key: "rolled", label: wrappedName, icon: { roll: "🌯", halfmoon: "🥟", pleat: "🥟", bun: "🍙", leaf: "🍃", parcel: "🥟" }[wrapStyle] || "🥟", words: cookWords(wrappedName), wrapStyle, dough: hasDough };
  let wrapDone = false;
  const consumed = new Set();
  let vessel = null, lastMain = null;
  const mains = new Set(items.filter((it) => !it.liquid && !it.toTaste && !/cube|powder|seasoning|salt|sugar|black_pepper|pepper_ground|peppercorn|white_pepper/.test(it.key)));
  for (const a of actions) {
    if (a.kind === "serve") continue;
    if (a.vessel) vessel = a.vessel;
    else if (["deepfry", "fry", "saute"].includes(a.kind)) vessel = vessel === "kaldero" && a.kind !== "deepfry" ? vessel : vessel || "kawali";
    else if (a.kind === "heat") vessel = vessel || "kawali";
    else if (["boil", "simmer"].includes(a.kind)) vessel = vessel || "kaldero";
    // "Cover and let it steam" in a stew is cooking covered in the same pot, not a steamer.
    if (a.kind === "steam" && !a.steamer && steps.some((x) => ["boil", "simmer", "cook", "saute", "pour"].includes(x.kind))) a.kind = "cook";
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
    // Caramel: the sugar melts in the pan (or the llanera) until it turns amber.
    if (kind === "caramel") {
      if (steps.some((x) => x.caramel)) continue;
      const sugar = items.filter((it) => /sugar|asukal/.test(`${it.key} ${it.label}`.toLowerCase()));
      const its2 = its.filter((it) => sugar.includes(it));
      steps.push({ kind: "cook", caramel: true, items: its2.length ? its2 : sugar.slice(0, 1), minutes: a.minutes || 5, vessel: "kawali", heat: "low" });
      continue;
    }
    // "Put the filling on a wrapper" and "wrap and roll" are one wrapping step.
    if (kind === "add" && its.length && its.every((it) => COOK_WRAPPER.test(it.key))) kind = "fill";
    if (kind === "wrap" && !its.length) its = wrappers;
    // Dough, filling and wrapping steps.
    const prev0 = steps[steps.length - 1];
    // Adding to the dough bowl ("put the butter and cold water in the mixing bowl") is part of making the dough.
    if (["add", "pour", "mix", "stir"].includes(kind) && prev0 && prev0.kind === "dough" && !wrapDone) { for (const it of its) if (!prev0.items.includes(it)) prev0.items.push(it); continue; }
    // Before wrapping, more filling on the wrapper ("add a slice of jackfruit on top") belongs to the filling step.
    if (["add", "top"].includes(kind) && prev0 && prev0.kind === "fill" && !wrapDone) { for (const it of its) if (!prev0.items.includes(it)) prev0.items.push(it); continue; }
    if (kind === "fill" && wrapDone) continue; // "the sugar sticks on the wrapper" after wrapping isn't filling
    // Wrapping needs something to wrap: "lock the leaf container" before any filling is making the container.
    if (kind === "wrap" && !steps.some((x) => ["fill", "coat", "mix", "dough", "rollout", "shape"].includes(x.kind)) && !its.some((it) => COOK_WRAPPER.test(it.key))) continue;
    if (["dough", "shape", "rollout", "rise", "fill", "brush", "coat"].includes(kind) || kind === "wrap") {
      if (kind === "dough") for (const it of its) consumed.add(it);
      if (kind === "fill" || kind === "wrap") for (const it of steps.filter((x) => x.kind !== "shop").flatMap((x) => x.items)) if (!it.fryOil && !it.water && it !== wrapped && !COOK_SEASONING.test(it.key)) consumed.add(it);
      if (kind === "wrap" && prev0 && prev0.kind === "wrap") continue; // "wrap … then seal": one step
      if (["dough", "rollout", "shape", "fill", "rise"].includes(kind) && prev0 && prev0.kind === kind) { for (const it of its) if (!prev0.items.includes(it)) prev0.items.push(it); if (kind === "dough") prev0.knead = prev0.knead || a.knead; if (a.size) prev0.size = a.size; if (a.minutes) prev0.minutes = a.minutes; continue; }
      if (kind === "dough" && !its.length && !a.knead && prev0 && prev0.kind !== "dough") continue;
      const st0 = { kind, items: kind === "wrap" ? its.filter((it) => COOK_WRAPPER.test(it.key) || /leaf|leaves|dahon/.test(it.key)) : its, minutes: a.minutes || null, vessel: vessel || "kawali" };
      if (kind === "wrap") { st0.style = wrapStyle; st0.made = wrapped; st0.fork = !!a.fork; st0.dough = hasDough; wrapDone = true; }
      if (kind === "fill") { st0.style = wrapStyle; st0.dough = hasDough; }
      if (kind === "rollout" && a.size) st0.size = a.size;
      if (kind === "dough") st0.knead = !!a.knead;
      steps.push(st0);
      continue;
    }
    // After wrapping, the filling, the wrapper and the dish's own name all mean the wrapped dish.
    if (wrapDone) {
      if (its.some((it) => consumed.has(it) || COOK_WRAPPER.test(it.key))) its = [wrapped, ...its.filter((it) => !consumed.has(it) && !COOK_WRAPPER.test(it.key))];
      else if (!its.length && ["fry", "deepfry", "steam", "bake", "grill", "boil", "simmer", "cook", "add", "brush"].includes(kind)) its = [wrapped];
    }
    // Frying the wrapped dish: the sugar or salt that sticks to it isn't a second thing being fried.
    if (its[0] === wrapped && ["fry", "deepfry", "bake", "steam"].includes(kind)) its = [wrapped];
    // "Deep fry the lumpia" names the wrapper: show the rolled dish instead.
    if (["fry", "deepfry"].includes(kind) && its.some((it) => COOK_WRAPPER.test(it.key))) {
      its = its.filter((it) => !COOK_WRAPPER.test(it.key));
      if (!its.length) its = [wrapped];
    }
    // "Grill the pork and squid, basting with the soy sauce": the sauce isn't grilled or fried.
    if (["grill", "fry", "deepfry", "bake"].includes(kind) && its.some((it) => !it.liquid)) its = its.filter((it) => !it.liquid);
    // Seasoning lists only what goes on: "rub the Magic Sarap over the pork belly".
    if (kind === "season") its = its.filter((it) => !mains.has(it));
    if (["add", "pour", "mix", "saute", "wrap", "top"].includes(kind) && !its.length && !(kind === "add" && a.back)) continue;
    // Filler with nothing to show: a bare "stir" or "cook for a while".
    if ((kind === "stir" && !its.length) || (kind === "cook" && !a.minutes && !its.length && !a.until)) continue;
    if (kind === "add" && its.length && its.every((x) => x.liquid && !COOK_SOLID_LIQUID.test(x.key))) kind = "pour";
    if (kind === "pour" && its.some((x) => !x.liquid)) kind = "add";
    if (["fry", "deepfry", "grill"].includes(kind) && !its.length) {
      const already = lastMain && steps.some((x) => x.kind === kind && x.items.includes(lastMain));
      if (lastMain && kind !== "deepfry" && !already) its = [lastMain]; else if (kind !== "deepfry") continue;
    }
    if (kind === "drain" && !steps.some((x) => COOK_TIMED.has(x.kind) && x.kind !== "marinate" && x.kind !== "chill")) continue;
    // "Put back the vegetables and meat that were cooked earlier": what was last taken out and set aside.
    if (kind === "add" && a.back && !its.length) {
      const k = steps.map((x) => x.kind).lastIndexOf("drain");
      const back = new Set();
      for (let j = 0; j < k; j++) { const x = steps[j]; if (["drain", "strain"].includes(x.kind)) back.clear(); else if (["add", "saute", "fry"].includes(x.kind)) for (const it of x.items) if (!it.liquid) back.add(it); }
      its = [...back];
      if (its.length) { steps.push({ kind: "add", items: its, minutes: null, vessel: vessel || "kawali", back: true }); continue; }
    }
    // Before anything is heated, more for the bowl ("add the condensed milk and mix") goes into the bowl.
    if (["add", "pour"].includes(kind) && its.length && prev0 && prev0.kind === "mix" && !wrapDone && !a.vessel && !steps.some((x) => COOK_HEAT_KINDS.has(x.kind))) { for (const it of its) if (!prev0.items.includes(it)) prev0.items.push(it); continue; }
    // Something already in the pot isn't added again ("add the cooked rice to the coconut milk and sugar").
    if (["add", "pour"].includes(kind) && !wrapDone) {
      const inPot = new Set();
      for (const x of steps) {
        if (["drain", "strain", "serve"].includes(x.kind)) inPot.clear();
        else if (["add", "pour", "saute", "fry"].includes(x.kind) && x.vessel === (vessel || "kawali")) for (const it of x.items) inPot.add(it);
      }
      const fresh = its.filter((it) => !inPot.has(it) || it.water);
      if (!fresh.length) continue;
      its = fresh;
    }
    // Salt that was already seasoned in isn't seasoned again.
    if (kind === "season") { const done = new Set(steps.filter((x) => x.kind === "season").flatMap((x) => x.items)); its = its.filter((it) => !done.has(it)); if (!its.length && steps.some((x) => x.kind === "season")) continue; }
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
    // "Pour the egg and milk mixture into the mold": the bowl's mixture goes in, poured.
    const mixed = new Set(steps.filter((x) => x.kind === "mix").flatMap((x) => x.items));
    const mixture = a.mixture && ["add", "pour"].includes(kind) && its.length && its.every((it) => mixed.has(it));
    if (mixture) kind = "pour";
    const st1 = { kind, items: its, minutes: a.minutes || null, vessel: here };
    if (mixture) st1.mixture = true;
    if (a.until && kind === "cook") st1.until = true;
    if (a.aside) st1.aside = true;
    if (a.soak) st1.soak = true;
    if (a.sun) { st1.sun = true; if (!st1.items.length && lastMain) st1.items = [lastMain]; }
    steps.push(st1);
  }
  const seasonings = items.filter((it) => it.toTaste);
  const seasonStep = steps.find((x) => x.kind === "season");
  if (seasonings.length && !seasonStep) steps.push({ kind: "season", items: seasonings, vessel: vessel || "kawali" });
  else if (seasonStep) for (const it of seasonings) if (!seasonStep.items.includes(it)) seasonStep.items.push(it);
  // A filling or a rice mixture made before anything is heated is made in a bowl, not in a pan.
  const firstFill = steps.findIndex((x) => x.kind === "fill");
  if (firstFill > 0) for (let k = 0; k < firstFill; k++) {
    const x = steps[k];
    if (["heat", "saute", "boil", "simmer", "cook", "fry", "deepfry"].includes(x.kind)) break;
    if (["add", "pour"].includes(x.kind)) x.kind = "mix";
  }
  steps.splice(0, steps.length, ...cookCompact(steps));
  steps.push({ kind: "serve", items: [], vessel: vessel || "kawali", cold: (() => { const lastChill = steps.map((x) => x.kind).lastIndexOf("chill"), lastHeat = steps.reduce((m, x, i) => ((COOK_TIMED.has(x.kind) && !["marinate", "chill", "rise"].includes(x.kind)) || x.kind === "heat" ? i : m), -1); return lastHeat < 0 || lastChill > lastHeat; })() });
  return steps.slice(0, 24);
}

/**
 * Shorter scripts: cuts of the same kind become one step, "bring to a boil" + "simmer 40 min" becomes one,
 * a bare "cook" before a timed step goes, small "add"s merge. Past 18 steps, all neighbouring cuts merge too.
 * Pure, tested.
 */
function cookCompact(input) {
  const same = (a, b) => (a.vessel || "") === (b.vessel || "");
  let out = [];
  for (const s of input) {
    const prev = out[out.length - 1];
    if (prev && s.kind === "cut" && prev.kind === "cut" && prev.style === s.style && (prev.size || null) === (s.size || null) && !prev.vessel && !s.vessel && prev.items.length < 4) {
      out[out.length - 1] = { ...prev, items: [...prev.items, ...s.items] }; continue;
    }
    if (prev && prev.kind === "boil" && !prev.minutes && !prev.items.length && s.kind === "simmer" && same(prev, s)) {
      out[out.length - 1] = { ...s, boilFirst: true }; continue;
    }
    if (prev && ["cook", "simmer"].includes(prev.kind) && !prev.minutes && !prev.items.length && COOK_TIMED.has(s.kind) && s.minutes && same(prev, s)) {
      out[out.length - 1] = s; continue;
    }
    if (prev && prev.kind === "mix" && s.kind === "mix" && prev.items.length + s.items.length <= 8) {
      out[out.length - 1] = { ...prev, items: [...prev.items, ...s.items.filter((it) => !prev.items.includes(it))] }; continue;
    }
    if (prev && ["add", "pour"].includes(prev.kind) && ["add", "pour"].includes(s.kind) && same(prev, s) && prev.items.length + s.items.length <= 6) {
      const items = [...prev.items, ...s.items.filter((it) => !prev.items.includes(it))];
      out[out.length - 1] = { ...prev, kind: items.every((it) => it.liquid) ? "pour" : "add", items }; continue;
    }
    out.push(s);
  }
  if (out.length > 17) {
    // Still long: a bare simmer or "cook" with no time and nothing added says little.
    out = out.filter((s, i) => !(["simmer", "cook"].includes(s.kind) && !s.minutes && !s.items.length && i > 0));
  }
  if (out.length > 17) {
    // Still long: neighbouring cuts become one step that keeps each item's own cut.
    const merged = [];
    for (const s of out) {
      const prev = merged[merged.length - 1];
      if (prev && s.kind === "cut" && prev.kind === "cut" && !prev.vessel && !s.vessel) {
        const cuts = { ...(prev.cuts || Object.fromEntries(prev.items.map((it) => [it.key, prev.style]))) };
        for (const it of s.items) cuts[it.key] = s.style;
        merged[merged.length - 1] = { ...prev, items: [...prev.items, ...s.items], cuts, style: prev.style === s.style ? prev.style : "mixed" };
        continue;
      }
      merged.push(s);
    }
    out = merged;
  }
  return out;
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

// Flame under the pan or pot: low, medium, high (step.heat). Steps from recipes are medium.
const COOK_HEAT = { low: ["Mahinang apoy", "Low heat", 1.6], med: ["Katamtamang apoy", "Medium heat", 1], high: ["Malakas na apoy", "High heat", 0.6] };
const COOK_HEAT_KINDS = new Set(["heat", "saute", "fry", "deepfry", "boil", "simmer", "cook", "steam", "grill", "bake"]);
// Minutes at medium heat before food is overdone (dries out, darkens) and before it burns.
const COOK_BURN_LIMITS = { boil: [300, 480], simmer: [300, 480], cook: [120, 240], steam: [120, 240], fry: [20, 40], deepfry: [15, 30], saute: [15, 30], grill: [45, 90], bake: [120, 240] };

/** 0 = fine, 1 = overdone, 2 = burnt, from the step's time and flame. Pure, tested. */
function cookBurn(step) {
  const lim = step && COOK_BURN_LIMITS[step.kind];
  if (!lim || !step.minutes) return 0;
  const f = (COOK_HEAT[step.heat] || COOK_HEAT.med)[2];
  return step.minutes >= lim[1] * f ? 2 : step.minutes >= lim[0] * f ? 1 : 0;
}

/** The caption for a step, in Tagalog or English. Our own words, never the source's. */
function cookCaption(step, lang = "tl") {
  const en = lang === "en";
  const L = (pair) => (en ? pair[1] : pair[0]);
  const list = cookList(step.items || []).replace(/ at /g, en ? " and " : " at ");
  const v = L(COOK_VESSEL_TEXT[step.vessel] || COOK_VESSEL_TEXT.kawali);
  const heatTxt = step.heat && step.heat !== "med" && COOK_HEAT[step.heat] ? ` ${en ? "on" : "sa"} ${COOK_HEAT[step.heat][en ? 1 : 0].toLowerCase()}` : "";
  const time = (step.minutes ? ` ${en ? "for" : "nang"} ${cookTimeText(step.minutes, lang)}` : "") + heatTxt;
  switch (step.kind) {
    case "shop": return en ? `Shop for the ingredients (${step.items.length})` : `Mamalengke ng mga sangkap (${step.items.length})`;
    case "peel": {
      // A whole fish or a chicken is cleaned, not peeled; shrimp, potatoes and garlic are peeled.
      const clean = (step.items || []).every((it) => /fish|tilapia|bangus|galunggong|tamban|tuna|salmon|lapu|maya|dalagang|tulingan|chicken|pork|beef|meat|pata|liempo|belly|ribs|leg|thigh|wing|breast|squid|pusit|crab|mussel|tahong|clam/.test(`${it.key} ${it.label}`.toLowerCase()) && !/shrimp|prawn|hipon/.test(it.key));
      return clean ? (en ? `Clean and rinse: ${list}` : `Linisin at hugasan: ${list}`) : en ? `Clean and peel: ${list}` : `Linisin at balatan: ${list}`;
    }
    case "cut": {
      if (step.style === "mixed") return en ? `Cut the ${list} as the recipe says` : `Hiwain ang ${list} ayon sa recipe`;
      if (step.style === "crushed" && step.items.every((it) => /cube|cracker|chicharon/.test(it.key))) return en ? `Crush the ${list}` : `Durugin ang ${list}`;
      const style = L(COOK_STYLE_TEXT[step.style] || ["hiwain", "cut"]);
      const size = step.size ? ` (${en ? "about" : "mga"} ${step.size} cm)` : "";
      return en ? `Cut the ${list}: ${style}${size}` : `Hiwain ang ${list}: ${style}${size}`;
    }
    case "marinate": if (step.sun) return en ? `Dry${list ? ` the ${list}` : ""} under the sun until the skin is dry${time}` : `Patuyuin sa araw${list ? ` ang ${list}` : ""} hanggang matuyo ang balat${time}`;
      if (step.soak) { const l2 = cookList((step.items || []).filter((it) => !it.water)).replace(/ at /g, en ? " and " : " at "); return en ? `Soak${l2 ? ` the ${l2}` : ""} in water${time}` : `Ibabad sa tubig${l2 ? ` ang ${l2}` : ""}${time}`; }
      return en ? `Marinate${list ? ` the ${list}` : ""}${time}` : `Ibabad${list ? ` ang ${list}` : ""}${time}`;
    case "heat": return en ? `Heat the ${v}${heatTxt}` : `Painitin ang ${v}${heatTxt}`;
    case "saute": return en ? `Sauté the ${list}${time}` : `Igisa ang ${list}${time}`;
    case "add": if (step.back) return en ? `Put back the ${list}` : `Ibalik ang ${list}`;
      return en ? `Add the ${list}` : `Ilagay ang ${list}`;
    case "pour": if (step.mixture) return en ? `Pour in the mixture (${list})` : `Ibuhos ang pinaghalong ${list}`;
      return en ? `Pour in the ${list}` : `Ibuhos ang ${list}`;
    case "boil": return list ? (en ? `Boil the ${list}${time}` : `Pakuluan ang ${list}${time}`) : en ? `Bring to a boil${time}` : `Pakuluan${time}`;
    case "simmer":
      if (step.boilFirst) return en ? `Bring to a boil, then simmer${time}` : `Pakuluan, saka hinaan ang apoy${time}`;
      return en ? `Simmer on low heat${time}` : `Hinaan ang apoy at pakuluan nang dahan-dahan${time}`;
    case "fry": return en ? `Pan-fry${list ? ` the ${list}` : ""}${time}` : `Iprito${list ? ` ang ${list}` : ""}${time}`;
    case "deepfry": return en ? `Deep-fry${list ? ` the ${list}` : ""}${time}` : `Iprito nang lubog sa mantika${list ? ` ang ${list}` : ""}${time}`;
    case "grill": return en ? `Grill${list ? ` the ${list}` : ""}${time}` : `Ihawin${list ? ` ang ${list}` : ""}${time}`;
    case "bake": return en ? `Bake in the oven${time}` : `I-bake sa oven${time}`;
    case "steam": return en ? `Steam${time}` : `I-steam${time}`;
    case "stir": return en ? "Stir well" : "Haluin nang mabuti";
    case "mix": return en ? `Mix the ${list} in a bowl` : `Paghaluin sa mangkok ang ${list}`;
    case "dough": return step.knead && !(step.items || []).length
      ? (en ? "Knead the dough until smooth" : "Masahin ang masa hanggang kuminis")
      : step.knead ? (en ? `Make the dough with the ${list} and knead until smooth` : `Gawin ang masa (${list}) at masahin hanggang kuminis`)
      : (en ? `Make the dough: mix the ${list}` : `Gawin ang masa: paghaluin ang ${list}`);
    case "rise": return en ? `Let the dough rise${time}` : `Hayaang umalsa ang masa${time}`;
    case "shape": return en ? "Divide the dough and shape into balls" : "Hatiin ang masa at gawing bola-bola";
    case "rollout": return en ? `Flatten the dough with a rolling pin${step.size ? ` into a ${step.size} cm circle` : ""}` : `Paratin ang masa gamit ang rolling pin${step.size ? ` (bilog, mga ${step.size} cm)` : ""}`;
    case "fill": {
      const base = step.style === "leaf" ? (en ? "the leaf" : "dahon") : step.dough ? (en ? "the dough" : "masa") : (en ? "the wrapper" : "wrapper");
      return en ? `Put the filling in the middle of ${base}` : `Lagyan ng palaman ang gitna ng ${base}`;
    }
    case "wrap": {
      const W = {
        roll: [`Ibalot${list ? ` sa ${list}` : ""}, itupi ang gilid at irolyo nang mahigpit`, `Wrap${list ? ` in the ${list}` : ""}, fold in the sides and roll up tightly`],
        halfmoon: [`Itupi sa kalahati at isara ang gilid${step.fork ? " gamit ang tinidor" : " (kurutin o i-pleat)"}`, `Fold in half and seal the edge${step.fork ? " with a fork" : " (pinch or pleat)"}`],
        pleat: ["Tipunin ang wrapper paikot sa palaman at kurutin pataas (bukas sa ibabaw)", "Gather the wrapper up around the filling and pleat it (open on top)"],
        bun: ["Tipunin ang gilid ng masa sa ibabaw at pilipitin para isara", "Gather the dough's edges over the filling and twist to seal"],
        leaf: ["Ibalot sa dahon, itupi ang dulo at isara", "Wrap in the leaf, fold the ends and seal"],
        parcel: ["Itupi ang wrapper at pagdikitin ang mga dulo", "Fold the wrapper over and press the corners together"],
      }[step.style || "roll"] || [`Ibalot sa ${list} at irolyo`, `Wrap in ${list} and roll`];
      return en ? W[1] : W[0];
    }
    case "coat": { const coats = (x) => /flour|sugar|crumb|panko|cornstarch|starch|batter/.test(x.key); const [a0, ...rest] = [...(step.items || []).filter((x) => !coats(x)), ...(step.items || []).filter(coats)]; const r = cookList(rest); return a0 && rest.length ? (en ? `Roll the ${a0.label.toLowerCase()} in the ${r.replace(/ at /g, " and ")}` : `Ipagulong ang ${a0.label.toLowerCase()} sa ${r}`) : en ? `Coat the ${list}` : `Ipagulong ang ${list}`; }
    case "brush": return en ? `Brush the top with ${list}` : `Pahiran ng ${list} ang ibabaw`;
    case "cook": if (step.caramel) return en ? `Melt the ${list || "sugar"} on low heat until it turns into amber caramel` : `Tunawin ang ${list || "asukal"} sa mahinang apoy hanggang maging kulay-amber na caramel`;
      if (step.until && !step.minutes) return en ? "Cook until done" : "Lutuin hanggang maluto";
      return en ? `Cook${time}` : `Lutuin${time}`;
    case "season": return en ? `Season${list ? ` with ${list}` : ""} to taste` : `Timplahan${list ? ` ng ${list}` : ""} ayon sa panlasa`;
    case "strain": return en ? `Strain${list ? ` the ${list}` : ""} and drain the water` : `Salain${list ? ` ang ${list}` : ""} at itapon ang tubig`;
    case "top": return en ? `Put the ${list} on top` : `Ilagay sa ibabaw ang ${list}`;
    case "chill": return en ? `Chill in the fridge${time}` : `Palamigin sa ref${time}`;
    case "drain": return step.aside ? (en ? "Take it off the heat and set aside" : "Hanguin at itabi muna") : en ? "Take out and let it drain" : "Hanguin at patuluin";
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
  dlg.innerHTML = `<div class="cook-panel" role="dialog" aria-modal="true" aria-labelledby="cook-title">${cookPlayerMarkup(message, false)}</div>`;
  dlg.classList.add("open");
  document.body.style.overflow = "hidden";
  if (typeof dlgOpen === "function") dlgOpen(dlg.querySelector(".cook-panel"), closeCookShow);
}

/** The player's insides, shared by the pop-up and the kitchen in Ulam ko. */
function cookPlayerMarkup(message, inline) {
  return `
      <div class="cook-head">
        <div class="min-w-0"><p class="cook-kicker">${inline ? `🍳 ${escapeHtml(cookT("cook.kitchen", "Lutuin mo ang ulam mo"))}` : `🎬 ${escapeHtml(cookT("cook.title", "Panoorin kung paano"))}`}</p><h2 id="cook-title" tabindex="-1" data-dlg-focus class="cook-name">${escapeHtml(message)}</h2></div>
        ${inline ? `<span class="cook-head-btns"><button type="button" onclick="cookKitchenRestart()" class="wx-btn">↺ ${escapeHtml(cookT("cook.kitchenReset", "Ibalik sa recipe"))}</button><button type="button" onclick="cookKitchenClose()" class="wx-btn">${escapeHtml(cookT("cook.kitchenClose", "Isara ang kusina"))}</button></span>` : `<button type="button" onclick="closeCookShow()" class="dlg-x" aria-label="Isara">✕</button>`}
      </div>
      ${inline ? `<div class="cook-left">` : ""}<div class="cook-stage"><canvas id="cook-canvas" aria-hidden="true"></canvas><p id="cook-hud" class="cook-hud" hidden></p><p id="cook-timer" class="cook-timer" hidden></p><p id="cook-caption" class="cook-caption" aria-live="polite"></p></div>
      <div class="cook-controls">
        <button type="button" class="wx-btn" onclick="cookGo(-1)" aria-label="${escapeHtml(cookT("cook.prev", "Nakaraan"))}">⏮</button>
        <button type="button" class="wx-btn on" id="cook-play" onclick="cookToggle()">▶</button>
        <button type="button" class="wx-btn" onclick="cookGo(1)" aria-label="${escapeHtml(cookT("cook.next", "Susunod"))}">⏭</button>
        <span id="cook-count" class="cook-count"></span>
        ${inline ? "" : `<button type="button" class="wx-btn cook-edit-btn" id="cook-edit" onclick="cookEditToggle()">✏️ ${escapeHtml(cookT("cook.edit", "Ayusin ang mga hakbang"))}</button>`}
      </div>${inline ? `<ol id="cook-steps" class="cook-steps" aria-label="${escapeHtml(cookT("cook.steps", "Mga hakbang"))}"></ol></div><div class="cook-right">` : ""}
      ${inline ? `<section id="cook-builder" class="cook-builder" aria-label="${escapeHtml(cookT("cook.next.q", "Ano ang susunod na gagawin?"))}"></section>` : ""}
      ${inline ? "" : `<ol id="cook-steps" class="cook-steps" aria-label="${escapeHtml(cookT("cook.steps", "Mga hakbang"))}"></ol>`}
      <section id="cook-list" class="cook-list-wrap" hidden></section>
      ${inline ? "</div>" : ""}
      ${inline ? "" : `<p class="cook-note">${escapeHtml(cookT("cook.note", "Gawa ng SarapSulit mula sa mga sangkap at paraan ng recipe. Para sa buong paraan, buksan ang orihinal na recipe."))}</p>`}`;
}

function cookFail(msg) {
  const name = document.getElementById("cook-name") || document.getElementById("cook-title");
  if (name) name.textContent = msg;
}

function cookStart(title, built, costPerServing, key, opts = {}) {
  cookStop();
  // The person's own edited steps for this recipe or dish, if saved on this device.
  const saved = key && !opts.fresh ? cookSavedSteps(key) : null;
  const steps = saved ? cookRestoreSteps(saved, built) : built;
  cookShow = { title, steps, built, key, edited: !!saved, editing: !!opts.builder, builder: !!opts.builder, inline: !!opts.inline, extra: opts.extra || [],
    i: 0, t: 0, playing: false, cost: costPerServing, last: 0, three: null, stopAt: null, draft: null, editAt: null, insertAt: null };
  if (cookShow.builder) cookWriteSteps(key, steps);
  document.getElementById("cook-title").textContent = title;
  cookRenderSteps();
  cookShowStep();
  cookRenderList(steps);
  if (cookShow.builder) cookRenderBuilder();
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  loadThree().then(() => {
    if (!cookShow) return;
    try { cookShow.three = cookBuildScene(window.THREE, document.getElementById("cook-canvas")); }
    catch (e) { cookNo3d("device", e); return; }
    // Pictures for the shopping list, drawn from the same 3D models.
    const shop = steps[0] && steps[0].kind === "shop" ? steps[0].items : [];
    setTimeout(() => { try { if (cookShow && cookShow.three) cookFillThumbs(cookShow.three.thumbs(shop)); } catch { /* pictures are optional */ } }, 50);
    cookEnterStep();
    cookShow.playing = !reduce && !opts.paused;
    document.getElementById("cook-play").textContent = cookShow.playing ? "⏸" : "▶";
    cookShow.last = performance.now();
    cookShow.raf = requestAnimationFrame(cookFrame);
  }).catch((e) => cookNo3d("load", e));
}

/**
 * No 3D: the steps still work. Says why (the library didn't download, or this device can't draw 3D),
 * with a retry, and the error text in small print so a screenshot tells us what happened.
 */
function cookNo3d(why, e) {
  const stage = document.querySelector(".cook-stage");
  if (!stage) return;
  const en = cookLang() === "en";
  const msg = why === "load"
    ? (en ? "The 3D didn't download (slow or blocked connection). The steps below still work." : "Hindi na-download ang 3D (mabagal o naka-block na koneksyon). Gumagana pa rin ang mga hakbang sa ibaba.")
    : (en ? "This device can't draw the 3D (WebGL is off or not supported). The steps below still work." : "Hindi kaya ng device na ito ang 3D (naka-off o walang WebGL). Gumagana pa rin ang mga hakbang sa ibaba.");
  stage.innerHTML = `<div class="cook-no3d"><p>${escapeHtml(msg)}</p>
    <button type="button" class="wx-btn on" onclick="cookRetry3d()">↻ ${escapeHtml(en ? "Try again" : "Subukan ulit")}</button>
    <small>${escapeHtml(String((e && e.message) || e || "").slice(0, 140))}</small></div>`;
}

/** Retry: reopen the same player (pop-up or kitchen) from the steps it already has. */
function cookRetry3d() {
  if (!cookShow) return;
  const { title, steps, cost, key, inline, builder } = cookShow;
  const root = inline ? document.querySelector(".cook-inline") : document.querySelector("#cook-dialog .cook-panel");
  if (root) root.innerHTML = cookPlayerMarkup(title, inline);
  cookStart(title, steps, cost, key, { inline, builder, extra: cookShow.extra, fresh: true });
}

// ── "Lutuin mo": the kitchen in Ulam ko, where people build their own dish's method ──

const COOK_ACTIONS = [
  ["cut", "🔪", "Hiwain", "Cut"], ["peel", "🧽", "Balatan", "Peel"], ["marinate", "🥣", "Ibabad", "Marinate"], ["mix", "🥣", "Paghaluin", "Mix"],
  ["wrap", "🌯", "Ibalot", "Wrap"], ["heat", "🔥", "Painitin", "Heat"], ["saute", "🍳", "Igisa", "Sauté"], ["add", "➕", "Ilagay", "Add"],
  ["pour", "🫗", "Ibuhos", "Pour"], ["boil", "♨️", "Pakuluan", "Boil"], ["simmer", "♨️", "Hinaan ang apoy", "Simmer"], ["fry", "🍳", "Iprito", "Fry"],
  ["deepfry", "🛢️", "Iprito nang lubog", "Deep-fry"], ["grill", "🔥", "Ihawin", "Grill"], ["steam", "♨️", "I-steam", "Steam"], ["bake", "🔥", "I-bake", "Bake"],
  ["stir", "🥄", "Haluin", "Stir"], ["season", "🧂", "Timplahan", "Season"], ["strain", "🫙", "Salain", "Strain"], ["top", "🧀", "Ilagay sa ibabaw", "Put on top"],
  ["chill", "🧊", "Palamigin", "Chill"], ["drain", "🧻", "Hanguin", "Take out"],
];
const COOK_DEFAULT_MIN = { marinate: 30, boil: 10, simmer: 20, cook: 5, fry: 5, deepfry: 10, grill: 10, steam: 15, bake: 25, chill: 60 };
const COOK_NEEDS_ITEMS = new Set(["cut", "peel", "marinate", "mix", "wrap", "saute", "add", "pour", "fry", "deepfry", "grill", "top"]);
const COOK_ON_STOVE = new Set(["heat", "saute", "add", "pour", "fry", "deepfry", "boil", "simmer", "cook", "stir", "season", "drain", "strain", "top"]);

/**
 * The kitchen's comments on a method, like a simulation: raw meat, frying in a cold pan, boiling a dry pot,
 * ingredients never used, total time. Pure, tested. Each note: { type: "warn" | "info" | "ok", tl, en }.
 */
function cookCheck(steps) {
  const shop = steps[0] && steps[0].kind === "shop" ? steps[0].items : [];
  const raw = (it) => ["pork", "beef", "chicken", "fish", "shrimp", "mince", "squid", "crab", "shells", "balls", "sausage", "egg"].includes(cookFoodKind(it));
  const heatKinds = new Set(["boil", "simmer", "cook", "fry", "deepfry", "grill", "bake", "steam", "saute"]);
  const notes = [], cooked = new Set(), used = new Set(), heated = {};
  let inPot = new Set(), liquid = false, vessel = null, total = 0, warnedHeat = false, warnedDry = false, warnedOil = false;
  const name = (list) => cookList(list).replace(/ at /g, " at ");
  const nameEn = (list) => cookList(list).replace(/ at /g, " and ");
  for (const s of steps) {
    if (s.kind === "shop" || s.kind === "serve") continue;
    for (const it of s.items || []) used.add(it);
    const v = s.vessel || vessel || "kawali";
    if (COOK_ON_STOVE.has(s.kind) || heatKinds.has(s.kind)) { if (vessel && v !== vessel && !["drain"].includes(s.kind)) { inPot = new Set(); liquid = false; } vessel = v; }
    if (s.kind === "heat") heated[v] = true;
    if (["saute", "fry", "deepfry"].includes(s.kind) && !heated[v] && !warnedHeat) {
      notes.push({ type: "warn", tl: `Painitin muna ang ${v} bago ${s.kind === "saute" ? "mag-gisa" : "magprito"}.`, en: `Heat the ${v === "kaldero" ? "pot" : "pan"} before you ${s.kind === "saute" ? "sauté" : "fry"}.` });
      warnedHeat = true;
    }
    if (["saute", "add", "pour", "fry", "deepfry", "grill", "steam", "bake", "boil", "simmer", "cook", "season", "top"].includes(s.kind)) {
      for (const it of s.items || []) { if (it.liquid && !it.fryOil) liquid = true; else if (!it.fryOil) inPot.add(it); }
    }
    if (s.kind === "boil" && !liquid && !warnedDry) {
      notes.push({ type: "warn", tl: "Walang tubig o sabaw sa kaldero bago pakuluan. Magbuhos muna.", en: "There's no water or broth in the pot before boiling. Pour some in first." });
      warnedDry = true;
    }
    if (s.kind === "deepfry" && !shop.some((it) => it.fryOil) && !warnedOil) {
      notes.push({ type: "warn", tl: "Walang mantika sa listahan ng sangkap para sa pagprito.", en: "There's no cooking oil in the ingredients for frying." });
      warnedOil = true;
    }
    if (heatKinds.has(s.kind)) { for (const it of inPot) cooked.add(it); for (const it of s.items || []) cooked.add(it); }
    if (s.kind === "drain" || s.kind === "strain") { inPot = new Set(); if (s.kind === "strain") liquid = false; }
    if (s.minutes) total += s.minutes;
  }
  const hilaw = shop.filter((it) => raw(it) && !cooked.has(it));
  if (hilaw.length) notes.unshift({ type: "warn", tl: `Hilaw pa ang ${name(hilaw)}. Lutuin muna bago ihain.`, en: `The ${nameEn(hilaw)} ${hilaw.length > 1 ? "are" : "is"} still raw. Cook before serving.` });
  const unused = shop.filter((it) => !used.has(it) && !it.toTaste && !it.fryOil && !it.water);
  if (unused.length && used.size) notes.push({ type: "info", tl: `Hindi pa nagagamit: ${name(unused)}.`, en: `Not used yet: ${nameEn(unused)}.` });
  if (!used.size && !steps.some((s) => !["shop", "serve"].includes(s.kind))) notes.push({ type: "info", tl: "Pumili ng unang gagawin sa itaas.", en: "Pick the first thing to do above." });
  steps.forEach((s, k) => {
    const b = cookBurn(s);
    if (!b) return;
    const what = cookCaption({ ...s, heat: null, minutes: null }, "tl"), whatEn = cookCaption({ ...s, heat: null, minutes: null }, "en");
    if (b === 2) notes.unshift({ type: "warn", tl: `🔥 Masusunog sa hakbang ${k + 1}: ${cookTimeText(s.minutes, "tl")} ay sobrang tagal (${what.toLowerCase()}). Bawasan ang oras o hinaan ang apoy.`, en: `🔥 Step ${k + 1} will burn: ${cookTimeText(s.minutes, "en")} is far too long (${whatEn.toLowerCase()}). Shorten it or lower the heat.` });
    else notes.unshift({ type: "warn", tl: `Sobra sa luto sa hakbang ${k + 1} (${cookTimeText(s.minutes, "tl")}): matutuyo o lalambot nang husto.`, en: `Step ${k + 1} is overcooked (${cookTimeText(s.minutes, "en")}): it will dry out or turn mushy.` });
  });
  if (total) notes.push({ type: "info", tl: `Kabuuang oras: ${cookTimeText(total, "tl")}.`, en: `Total time: ${cookTimeText(total, "en")}.` });
  if (!notes.some((n) => n.type === "warn") && used.size && shop.some(raw) && !steps.some((x) => cookBurn(x))) notes.unshift({ type: "ok", tl: "Luto na lahat ng karne at isda. Mukhang masarap!", en: "All the meat and fish is cooked. Looks delicious!" });
  return notes;
}

/** The idle card in Ulam ko: start from the suggested method, from scratch, or carry on. */
function cookKitchenIdle() {
  const box = document.getElementById("mydish-kitchen");
  if (!box || typeof currentDish === "undefined" || !currentDish) return;
  const key = `d${currentDish.id || "new"}`;
  const has = !!cookSavedSteps(key);
  box.innerHTML = `
    <div class="cook-kitchen-idle">
      <div class="min-w-0"><h3 class="cook-kitchen-h">🍳 ${escapeHtml(cookT("cook.kitchen", "Lutuin mo ang ulam mo"))}</h3>
        <p class="cook-kitchen-p">${escapeHtml(cookT("cook.kitchenIntro", "Ikaw ang kusinero: piliin ang gagawin, ang sangkap, paano hiwain at gaano katagal, at panoorin itong maluto."))}</p></div>
      <div class="cook-kitchen-btns">
        ${has ? `<button type="button" class="cook-open-btn on" onclick="cookKitchenStart('continue')">▶ ${escapeHtml(cookT("cook.kitchenContinue", "Ituloy ang luto ko"))}</button>` : ""}
        <button type="button" class="cook-open-btn${has ? "" : " on"}" onclick="cookKitchenStart('suggest')">✏️ ${escapeHtml(currentDish.fromRecipeId ? cookT("cook.kitchenEdit", "Baguhin ang paraan ng recipe na ito") : cookT("cook.kitchenSuggest", "Simulan sa mungkahing paraan"))}</button>
        <button type="button" class="cook-open-btn sm" onclick="cookKitchenStart('blank')">🧑‍🍳 ${escapeHtml(cookT("cook.kitchenBlank", "Simula sa wala"))}</button>
      </div>
      <p class="cook-kitchen-tip">${escapeHtml(cookT("cook.kitchenTip", "Tip: simulan sa paraan ng recipe, tapos pindutin ang ✏️ sa hakbang na gusto mong baguhin, o ＋ para magdagdag pagkatapos nito."))}</p>
    </div>`;
}

/** Ingredients of the dish being edited, as engine lines when the dish has been priced. */
function cookDishLines() {
  // The calculator's lines (with catalog slugs), carrying each line's group ("Para sa sauce") from Ulam ko.
  const named = currentDish.lines.filter((l) => String(l.name || "").trim());
  const eng = typeof lastResult !== "undefined" && lastResult && lastResult.lines;
  if (eng && eng.length === named.length) return eng.map((l, k) => ({ ...l, group: named[k].group || "" }));
  return currentDish.lines;
}

/** Items in their groups, the main group first: [[group, items], …]. One group means no headings. */
function cookByGroup(items) {
  const order = [];
  for (const it of items) if (!order.includes(it.group || "")) order.push(it.group || "");
  order.sort((a, b) => (a ? 1 : 0) - (b ? 1 : 0));
  return order.map((g) => [g, items.filter((it) => (it.group || "") === g)]);
}

function cookKitchenStart(mode) {
  if (typeof currentDish === "undefined" || !currentDish) return;
  const box = document.getElementById("mydish-kitchen");
  if (!box) return;
  // The pop-up player and the kitchen share one player: close the pop-up first.
  if (document.getElementById("cook-dialog")?.classList.contains("open")) closeCookShow();
  box.innerHTML = `<div class="cook-panel cook-inline">${cookPlayerMarkup(currentDish.title || cookT("cook.kitchen", "Lutuin mo ang ulam mo"), true)}</div>`;
  const key = `d${currentDish.id || "new"}`;
  const lines = cookDishLines();
  const cost = lastResult && lastResult.summary && !lastResult.summary.costIncomplete ? lastResult.summary.cost : null;
  const extra = cookItemsFromLines(lines).filter((it) => it.water);
  const go = (instructions, notes) => {
    const built = buildCookScript({ title: currentDish.title, lines, instructions, methodNotes: notes });
    const steps = mode === "blank" ? [built[0], built[built.length - 1]] : built;
    cookStart(currentDish.title, steps, cost, key, { inline: true, builder: true, extra, fresh: mode !== "continue", paused: mode === "blank" });
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (mode === "blank" || !currentDish.fromRecipeId) return go([], null);
  fetch(`${API_BASE}/api/recipes/${currentDish.fromRecipeId}`).then((r) => r.json())
    .then((d) => go(((d.recipe && d.recipe.instructions) || []).map((x) => x.text), d.recipe && d.recipe.methodNotes))
    .catch(() => go([], null));
}

function cookKitchenClose() { cookStop(); }

/** Ulam ko's "Panoorin" button: open the kitchen below (carry on if there's a saved method). */
function cookKitchenWatch() {
  if (typeof currentDish === "undefined" || !currentDish) return;
  cookKitchenStart(cookSavedSteps(`d${currentDish.id || "new"}`) ? "continue" : "suggest");
}

/** Ulam ko re-drew the editor: stop a running kitchen and show the start card. */
function cookKitchenReset() {
  if (cookShow && cookShow.inline) { cancelAnimationFrame(cookShow.raf); if (cookShow.three) cookShow.three.dispose(); cookShow = null; }
  cookKitchenIdle();
}

/** The dish's ingredients changed (recalculated in Ulam ko): refresh the kitchen's list and chips. */
function cookKitchenSync() {
  if (!cookShow || !cookShow.builder || typeof currentDish === "undefined" || !currentDish) return;
  const items = cookItemsFromLines(cookDishLines());
  const shop = items.filter((it) => !it.water);
  cookShow.extra = items.filter((it) => it.water);
  // Keep the same item objects where the key still matches, so existing steps stay linked.
  const old = new Map(cookShow.steps[0].items.map((it) => [it.key, it]));
  cookShow.steps[0] = { ...cookShow.steps[0], items: shop.map((it) => old.get(it.key) || it) };
  cookRenderList(cookShow.steps); cookRenderBuilder(); cookWriteSteps(cookShow.key, cookShow.steps);
}

function cookBuilderItems() {
  const shop = cookShow.steps[0] && cookShow.steps[0].kind === "shop" ? cookShow.steps[0].items : [];
  const extra = (cookShow.extra || []).filter((w) => !shop.some((it) => it.key === w.key));
  return [...shop, ...extra];
}

function cookChipThumb(it) {
  const ph = cookPhotos && cookPhotos[it.key];
  return ph && ph.thumb ? `<img src="${escapeHtml(ph.thumb)}" alt="" width="28" height="28" loading="lazy" referrerpolicy="no-referrer">` : `<span aria-hidden="true">${escapeHtml(it.icon || "🥄")}</span>`;
}

function cookDraftStep() {
  const d = cookShow.draft;
  if (!d) return null;
  const items = cookBuilderItems().filter((it) => d.keys.includes(it.key));
  const s = { kind: d.kind, items, vessel: { bake: "oven", grill: "ihawan", steam: "steamer" }[d.kind] || (COOK_ON_STOVE.has(d.kind) ? d.vessel : undefined) };
  if (d.kind === "cut") { s.style = d.style; s.size = d.size || null; if (d.cuts && d.style === "mixed") s.cuts = d.cuts; }
  if (d.boilFirst && d.kind === "simmer") s.boilFirst = true;
  if (COOK_TIMED.has(d.kind)) s.minutes = d.minutes || null;
  if (COOK_HEAT_KINDS.has(d.kind) && d.heat && d.heat !== "med") s.heat = d.heat;
  if (d.kind === "pour" && items.some((it) => !it.liquid)) s.kind = "add";
  return s;
}

function cookRenderBuilder() {
  const box = document.getElementById("cook-builder");
  if (!box || !cookShow) return;
  const en = cookLang() === "en", d = cookShow.draft;
  const items = cookBuilderItems();
  const acts = COOK_ACTIONS.map(([k, ico, tl, e]) => `<button type="button" class="cook-act${d && d.kind === k ? " on" : ""}" aria-pressed="${d && d.kind === k}" onclick="cookPick('${k}')"><span aria-hidden="true">${ico}</span> ${escapeHtml(en ? e : tl)}</button>`).join("");
  let form = "";
  if (d) {
    const needs = COOK_NEEDS_ITEMS.has(d.kind) || ["season", "boil", "simmer", "steam", "bake"].includes(d.kind);
    const list = d.kind === "pour" ? [...items.filter((it) => it.liquid), ...items.filter((it) => !it.liquid)] : d.kind === "wrap" ? items.filter((it) => /wrapper|leaf/.test(it.key)).concat(items.filter((it) => !/wrapper|leaf/.test(it.key))) : items;
    const chips = needs ? `<div class="cook-form-row"><span class="cook-form-l">${escapeHtml(cookT("cook.which", en ? "Which ingredients?" : "Aling sangkap?"))}${d.kind === "cut" ? ` <small>(${escapeHtml(en ? "one at a time" : "isa-isa")})</small>` : ""}</span>
        ${cookByGroup(list).map(([g, its], _, all) => `${all.length > 1 ? `<p class="cook-chip-group">${escapeHtml(g || (en ? "Main" : "Pangunahin"))}</p>` : ""}<div class="cook-chips">${its.map((it) => `<button type="button" class="cook-chip${d.keys.includes(it.key) ? " on" : ""}" aria-pressed="${d.keys.includes(it.key)}" onclick="cookPickItem('${escapeHtml(it.key)}')">${cookChipThumb(it)}<span>${escapeHtml(it.label)}</span></button>`).join("")}</div>`).join("")}</div>` : "";
    const cut = d.kind === "cut" ? `<div class="cook-form-row"><span class="cook-form-l">${escapeHtml(en ? "How to cut" : "Paano hiwain")}</span>
        <div class="cook-chips">${Object.keys(COOK_STYLE_TEXT).map((k) => `<button type="button" class="cook-chip sm${d.style === k ? " on" : ""}" aria-pressed="${d.style === k}" onclick="cookDraftSet('style','${k}')">${escapeHtml(COOK_STYLE_TEXT[k][en ? 1 : 0])}</button>`).join("")}</div>
        <label class="cook-in-l">${escapeHtml(en ? "Size" : "Laki")} <input class="cook-in cook-num" type="number" min="0" max="20" step="0.5" value="${d.size || ""}" placeholder="cm" oninput="cookDraftSet('size', this.value)"> cm</label></div>` : "";
    const time = COOK_TIMED.has(d.kind) ? `<div class="cook-form-row"><span class="cook-form-l">${escapeHtml(en ? "How long" : "Gaano katagal")}</span>
        <div class="cook-chips">${[5, 10, 15, 30, 45, 60, 120, 180].map((m) => `<button type="button" class="cook-chip sm${d.minutes === m ? " on" : ""}" aria-pressed="${d.minutes === m}" onclick="cookDraftSet('minutes', ${m})">${escapeHtml(cookTimeText(m, en ? "en" : "tl"))}</button>`).join("")}
        <label class="cook-in-l"><input class="cook-in cook-num" type="number" min="1" max="2880" value="${d.minutes || ""}" oninput="cookDraftSet('minutes', this.value)"> ${escapeHtml(cookT("cook.min", "min"))}</label></div></div>` : "";
    const ves = COOK_ON_STOVE.has(d.kind) ? `<div class="cook-form-row"><span class="cook-form-l">${escapeHtml(en ? "In the" : "Saan")}</span>
        <div class="cook-chips">${[["kawali", "🍳 Kawali", "🍳 Pan"], ["kaldero", "🍲 Kaldero", "🍲 Pot"]].map(([v, tl, e]) => `<button type="button" class="cook-chip sm${d.vessel === v ? " on" : ""}" aria-pressed="${d.vessel === v}" onclick="cookDraftSet('vessel','${v}')">${escapeHtml(en ? e : tl)}</button>`).join("")}</div></div>` : "";
    const fire = COOK_HEAT_KINDS.has(d.kind) && d.kind !== "bake" ? `<div class="cook-form-row"><span class="cook-form-l">${escapeHtml(en ? "Flame (turn the knob)" : "Apoy (ipihit ang knob)")}</span>${cookKnobHtml(d.heat || "med", en)}</div>` : "";
    const step = cookDraftStep();
    const ready = step && (!COOK_NEEDS_ITEMS.has(d.kind) || step.items.length);
    const burn = step ? cookBurn(step) : 0;
    const burnNote = burn ? `<p class="cook-burn-note ${burn === 2 ? "burnt" : ""}">${burn === 2 ? `🔥 ${escapeHtml(en ? "This will burn! Too long for this step. Shorten the time or lower the flame." : "Masusunog ito! Sobrang tagal para sa hakbang na ito. Bawasan ang oras o hinaan ang apoy.")}` : `⚠ ${escapeHtml(en ? "That's long: it may dry out or overcook." : "Matagal iyan: baka matuyo o maluto nang sobra.")}`}</p>` : "";
    form = `<div class="cook-form">${chips}${cut}${time}${fire}${ves}${burnNote}
      <div class="cook-form-go"><span class="cook-preview">${ready ? `${escapeHtml(cookStepIcon(step))} ${escapeHtml(cookCaption(step, en ? "en" : "tl"))}` : escapeHtml(en ? "Pick the ingredients first." : "Pumili muna ng sangkap.")}</span>
      <button type="button" class="wx-btn on cook-go" onclick="cookAddDraft()"${ready ? "" : " disabled"}>${cookShow.editAt != null ? `💾 ${escapeHtml(en ? "Save and cook" : "I-save at lutuin")}` : `➕ ${escapeHtml(cookT("cook.addCook", en ? "Add and cook" : "Idagdag at lutuin"))}`}</button></div></div>`;
  }
  const notes = cookCheck(cookShow.steps);
  const mode = cookShow.editAt != null
    ? `<div class="cook-mode">✏️ ${escapeHtml(en ? `Editing step ${cookShow.editAt + 1}` : `Binabago ang hakbang ${cookShow.editAt + 1}`)} <button type="button" class="wx-btn" onclick="cookCancelEdit()">${escapeHtml(en ? "Cancel" : "Kanselahin")}</button></div>`
    : cookShow.insertAt != null
      ? `<div class="cook-mode">＋ ${escapeHtml(en ? `Adding after step ${cookShow.insertAt + 1}` : `Idadagdag pagkatapos ng hakbang ${cookShow.insertAt + 1}`)} <button type="button" class="wx-btn" onclick="cookCancelEdit()">${escapeHtml(en ? "Cancel" : "Kanselahin")}</button></div>`
      : "";
  box.innerHTML = `${mode}<h3 class="cook-list-h">${escapeHtml(cookShow.editAt != null ? (en ? "Change what this step does" : "Baguhin ang gagawin sa hakbang na ito") : cookT("cook.next.q", en ? "What's next?" : "Ano ang susunod na gagawin?"))}</h3>
    <div class="cook-acts">${acts}</div>${form}
    <div class="cook-check" aria-live="polite"><p class="cook-check-h">🧑‍🍳 ${escapeHtml(cookT("cook.feedback", en ? "Kitchen notes" : "Puna ng kusina"))}</p>
      <ul>${notes.map((n) => `<li class="cook-note-${n.type}">${n.type === "warn" ? "⚠️" : n.type === "ok" ? "✅" : "ℹ️"} ${escapeHtml(en ? n.en : n.tl)}</li>`).join("")}</ul></div>`;
}

function cookPick(kind) {
  const upto = cookShow.editAt != null ? cookShow.editAt : cookShow.insertAt != null ? cookShow.insertAt + 1 : cookShow.steps.length;
  const prev = cookShow.steps.slice(0, upto).reverse().find((s) => s.vessel && !["shop", "serve"].includes(s.kind));
  const keep = cookShow.draft && cookShow.editAt != null ? cookShow.draft.keys : [];
  cookShow.draft = { kind, heat: "med", keys: keep, style: "diced", size: null, minutes: COOK_DEFAULT_MIN[kind] || null, vessel: (prev && prev.vessel) || (["boil", "simmer"].includes(kind) ? "kaldero" : "kawali") };
  cookRenderBuilder();
}
function cookPickItem(key) {
  const d = cookShow.draft; if (!d) return;
  if (d.kind === "cut") d.keys = d.keys[0] === key ? [] : [key];
  else d.keys = d.keys.includes(key) ? d.keys.filter((k) => k !== key) : [...d.keys, key];
  cookRenderBuilder();
}
function cookDraftSet(field, value) {
  const d = cookShow.draft; if (!d) return;
  if (field === "style" || field === "vessel" || field === "heat") d[field] = value;
  else { const n = parseFloat(value); d[field] = Number.isFinite(n) && n > 0 ? n : null; }
  if (field === "size" || (field === "minutes" && typeof value === "string")) { // typing: keep the focus in the box
    const pv = document.querySelector("#cook-builder .cook-preview"); const st = cookDraftStep(); if (pv && st) pv.textContent = `${cookStepIcon(st)} ${cookCaption(st, cookLang())}`;
    const bn = document.querySelector("#cook-builder .cook-burn-note"), b = st ? cookBurn(st) : 0, en2 = cookLang() === "en";
    if (b) { const html = `<p class="cook-burn-note ${b === 2 ? "burnt" : ""}">${b === 2 ? `🔥 ${en2 ? "This will burn! Too long for this step. Shorten the time or lower the flame." : "Masusunog ito! Sobrang tagal para sa hakbang na ito. Bawasan ang oras o hinaan ang apoy."}` : `⚠ ${en2 ? "That's long: it may dry out or overcook." : "Matagal iyan: baka matuyo o maluto nang sobra."}`}</p>`; if (bn) bn.outerHTML = html; else document.querySelector("#cook-builder .cook-form-go")?.insertAdjacentHTML("beforebegin", html); }
    else if (bn) bn.remove();
    return;
  }
  cookRenderBuilder();
}
function cookAddDraft() {
  const step = cookDraftStep();
  if (!step || (COOK_NEEDS_ITEMS.has(step.kind) && !step.items.length)) return;
  let at;
  if (cookShow.editAt != null) {
    at = cookShow.editAt;
    cookShow.steps = cookShow.steps.map((x, k) => (k === at ? step : x));
  } else {
    const end = cookShow.steps[cookShow.steps.length - 1].kind === "serve" ? cookShow.steps.length - 1 : cookShow.steps.length;
    at = cookShow.insertAt != null ? Math.min(cookShow.insertAt + 1, end) : end;
    cookShow.steps = [...cookShow.steps.slice(0, at), step, ...cookShow.steps.slice(at)];
  }
  cookShow.draft = null; cookShow.editAt = null; cookShow.insertAt = null;
  cookStepsChanged();
  // Play the new step once, like a simulation, then wait for the next one.
  cookShow.i = at; cookShow.t = 0; cookShow.stopAt = at; cookShow.playing = true;
  document.getElementById("cook-play").textContent = "⏸";
  cookShowStep(); cookEnterStep();
}

// ── The gas-stove knob for the flame ──
const COOK_KNOB_LEVELS = ["low", "med", "high"];
// Pointer angle (degrees, clockwise from 12 o'clock) for each level, like a stove knob turned to the left:
// off at the top, high first, then down to low.
const COOK_KNOB_ANGLE = { high: -60, med: -120, low: -180 };

/** The knob: tap or drag it, use the arrow keys, or tap a label. The flame beside it grows with the level. */
function cookKnobHtml(level, en) {
  const i = COOK_KNOB_LEVELS.indexOf(level);
  const marks = COOK_KNOB_LEVELS.map((h) => `<button type="button" class="cook-knob-mark m-${h}${h === level ? " on" : ""}" onclick="cookDraftSet('heat','${h}')" tabindex="-1">${escapeHtml({ low: ["Mahina", "Low"], med: ["Katamtaman", "Medium"], high: ["Malakas", "High"] }[h][en ? 1 : 0])}</button>`).join("");
  return `<div class="cook-stove">
    <div class="cook-knob-face">
      <span class="cook-knob-off" aria-hidden="true">OFF</span>${marks}
      <button type="button" class="cook-knob" role="slider" aria-label="${escapeHtml(en ? "Flame" : "Apoy")}" aria-valuemin="0" aria-valuemax="2" aria-valuenow="${i}" aria-valuetext="${escapeHtml(COOK_HEAT[level][en ? 1 : 0])}"
        style="--a:${COOK_KNOB_ANGLE[level]}deg" onclick="cookKnobTurn(1)" onkeydown="cookKnobKey(event)" onpointerdown="cookKnobDrag(event)"><span class="cook-knob-grip" aria-hidden="true"></span></button>
    </div>
    <div class="cook-burner" aria-hidden="true"><span class="cook-flame cook-flame-${level}"><i></i><i></i><i></i><i></i><i></i></span><span class="cook-burner-ring"></span></div>
    <p class="cook-knob-now">${escapeHtml(COOK_HEAT[level][en ? 1 : 0])}</p>
  </div>`;
}

function cookKnobSet(level) {
  if (cookShow && cookShow.draft && COOK_KNOB_LEVELS.includes(level)) cookDraftSet("heat", level); // re-draws the builder
  document.querySelector("#cook-builder .cook-knob")?.focus({ preventScroll: true });
}
/** A tap turns it one notch further (low → medium → high → low). */
function cookKnobTurn(dir) {
  if (cookShow && cookShow.knobDragged) { cookShow.knobDragged = false; return; }
  const cur = COOK_KNOB_LEVELS.indexOf((cookShow.draft && cookShow.draft.heat) || "med");
  cookKnobSet(COOK_KNOB_LEVELS[(cur + dir + 3) % 3]);
}
function cookKnobKey(e) {
  const cur = COOK_KNOB_LEVELS.indexOf((cookShow.draft && cookShow.draft.heat) || "med");
  const k = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, Home: -9, End: 9 }[e.key];
  if (k == null) return;
  e.preventDefault();
  cookKnobSet(COOK_KNOB_LEVELS[Math.max(0, Math.min(2, cur + k))]);
}
/** Dragging the knob around: the nearest notch to where the finger points. */
function cookKnobDrag(e) {
  const knob = e.currentTarget, box = knob.getBoundingClientRect(), cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  let moved = false;
  const pick = (ev) => {
    const deg = (Math.atan2(ev.clientX - cx, cy - ev.clientY) * 180) / Math.PI; // 0 = up, clockwise positive
    const best = COOK_KNOB_LEVELS.reduce((a, h) => (Math.abs(((deg - COOK_KNOB_ANGLE[h] + 540) % 360) - 180) < Math.abs(((deg - COOK_KNOB_ANGLE[a] + 540) % 360) - 180) ? h : a), "med");
    knob.style.setProperty("--a", `${COOK_KNOB_ANGLE[best]}deg`);
    return best;
  };
  const move = (ev) => { if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > 6) moved = true; if (moved) pick(ev); };
  const up = (ev) => {
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    if (moved) { cookShow.knobDragged = true; cookKnobSet(pick(ev)); setTimeout(() => { if (cookShow) cookShow.knobDragged = false; }, 50); }
  };
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
}

/** ✏️ on a step: load it into the builder to change its action, ingredients, cut or time. */
function cookEditStep(i) {
  const s = cookShow.steps[i];
  if (!s || ["shop", "serve"].includes(s.kind)) return;
  cookShow.editAt = i; cookShow.insertAt = null;
  cookShow.draft = { kind: s.kind, heat: s.heat || "med", keys: (s.items || []).map((it) => it.key), style: s.style || "diced", size: s.size || null, minutes: s.minutes || COOK_DEFAULT_MIN[s.kind] || null, vessel: s.vessel || "kawali", boilFirst: !!s.boilFirst, cuts: s.cuts || null };
  cookRenderSteps(); cookRenderBuilder();
  document.getElementById("cook-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** ＋ on a step: the next step added goes right after it. */
function cookInsertAfter(i) {
  cookShow.insertAt = i; cookShow.editAt = null; cookShow.draft = null;
  cookRenderSteps(); cookRenderBuilder();
  document.getElementById("cook-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cookCancelEdit() { cookShow.editAt = null; cookShow.insertAt = null; cookShow.draft = null; cookRenderSteps(); cookRenderBuilder(); }

/** Tap a step in the kitchen: play just that step. */
function cookPlayOne(i) {
  cookShow.i = i; cookShow.t = 0; cookShow.stopAt = i; cookShow.playing = true;
  const pb = document.getElementById("cook-play"); if (pb) pb.textContent = "⏸";
  cookShowStep(); cookEnterStep();
}

/** "↺ Ibalik sa recipe": back to the method built from the recipe. */
function cookKitchenRestart() {
  if (!cookShow || !cookShow.builder) return;
  const en = cookLang() === "en";
  if (typeof confirm === "function" && !confirm(en ? "Go back to the recipe's method? Your changes to the steps will be lost." : "Ibalik sa paraan ng recipe? Mawawala ang mga binago mo sa mga hakbang.")) return;
  cookWriteSteps(cookShow.key, null);
  cookKitchenStart("suggest");
}

// ── Editing the steps (saved on this device) ──

const COOK_STEPS_KEY = "sarapsulit.cooksteps.v1";
const COOK_ADDABLE = ["stir", "boil", "simmer", "cook", "fry", "season", "drain", "chill", "steam", "bake", "grill"];

/** Steps as plain data: item keys instead of objects. Pure, tested. */
function cookSerializeSteps(steps) {
  return steps.map((s) => {
    const o = { kind: s.kind, keys: (s.items || []).map((it) => it.key) };
    for (const f of ["style", "size", "minutes", "vessel", "cold", "cuts", "boilFirst"]) if (s[f] != null && s[f] !== false) o[f] = s[f];
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
    for (const f of ["style", "size", "minutes", "vessel", "cold", "cuts", "boilFirst"]) if (o[f] != null) s[f] = o[f];
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
    const b = cookShow.builder;
    const addAfter = b && s.kind !== "serve" ? `<button type="button" class="cook-tool" onclick="cookInsertAfter(${i})" aria-label="${escapeHtml(cookT("cook.addAfter", "Magdagdag pagkatapos nito"))}" title="${escapeHtml(cookT("cook.addAfter", "Magdagdag pagkatapos nito"))}">＋</button>` : "";
    const editBtn = b && !fixed ? `<button type="button" class="cook-tool" onclick="cookEditStep(${i})" aria-label="${escapeHtml(cookT("cook.editStep", "Baguhin ang hakbang"))}" title="${escapeHtml(cookT("cook.editStep", "Baguhin ang hakbang"))}">✏️</button>` : "";
    const tools = fixed ? (addAfter ? `<span class="cook-tools">${addAfter}</span>` : "") : `<span class="cook-tools">${editBtn}${addAfter}
      <button type="button" class="cook-tool" onclick="cookEditMove(${i}, -1)" aria-label="${escapeHtml(cookT("cook.up", "Itaas"))}"${i <= 1 ? " disabled" : ""}>↑</button>
      <button type="button" class="cook-tool" onclick="cookEditMove(${i}, 1)" aria-label="${escapeHtml(cookT("cook.down", "Ibaba"))}"${i >= n - 2 ? " disabled" : ""}>↓</button>
      <button type="button" class="cook-tool" onclick="cookEditRemove(${i})" aria-label="${escapeHtml(cookT("cook.remove", "Alisin"))}">🗑</button></span>`;
    const headBtn = b ? `<button type="button" class="cook-step-play" onclick="cookPlayOne(${i})" aria-label="${escapeHtml(cookT("cook.playStep", "Panoorin ang hakbang na ito"))}">${head}</button>` : head;
    const mark = b && cookShow.editAt === i ? " editing" : b && cookShow.insertAt === i ? " insert-after" : "";
    return `<li class="cook-edit-row${i === cookShow.i ? " on" : ""}${mark}"><div class="cook-edit-top">${headBtn}${tools}</div>${style || time ? `<div class="cook-edit-in">${style}${time}</div>` : ""}</li>`;
  }).join("") + (ed && !cookShow.builder ? `<li class="cook-edit-foot">
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
  if (cookShow.builder) { cookWriteSteps(cookShow.key, cookShow.steps); cookRenderBuilder(); }
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
    ${cookByGroup(shop).map(([g, its], _, all) => `${all.length > 1 ? `<p class="cook-chip-group">${escapeHtml(g || (en ? "Main" : "Pangunahin"))}</p>` : ""}<ul class="cook-list">${its.map((it) => `
      <li class="cook-item"><span class="cook-thumb" data-key="${escapeHtml(it.key)}" aria-hidden="true">${escapeHtml(it.icon)}</span>
        <span class="min-w-0"><span class="cook-item-name">${escapeHtml(it.label)}</span><span class="cook-item-amt">${escapeHtml(cookAmountText(it))}</span></span>
        <span class="cook-item-cost">${it.cost != null ? `₱${it.cost < 10 ? it.cost.toFixed(2) : Math.round(it.cost)}` : it.toTaste ? "" : "—"}</span></li>`).join("")}
    </ul>`).join("")}
    <p class="cook-list-total">${priced.length ? `${escapeHtml(cookT("cook.listTotal", en ? "Total for the whole dish" : "Kabuuan para sa buong ulam"))}: <b>₱${Math.round(total)}</b>` : ""}${priced.length < shop.filter((it) => !it.toTaste).length ? ` <span class="cook-list-gap">· ${escapeHtml(cookT("cook.listGap", en ? "— = no price yet" : "— = wala pang presyo"))}</span>` : ""}</p>`;
  box.hidden = false;
  cookLoadPhotos().then((p) => { cookFillPhotos(p, shop); if (cookShow && cookShow.builder) cookRenderBuilder(); });
}

// Credited Wikimedia Commons photos for the most-used ingredients (docs/cookphotos.json), loaded when the player opens.
let cookPhotos = null, cookPhotosLoading = null;
function cookLoadPhotos() {
  if (cookPhotos) return Promise.resolve(cookPhotos);
  return (cookPhotosLoading ||= fetch("cookphotos.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((d) => (cookPhotos = d)));
}

/** Photo, then credits list, for the ingredients that have one. */
function cookFillPhotos(photos, shop) {
  const box = document.getElementById("cook-list");
  if (!box || !photos) return;
  const used = [];
  box.querySelectorAll(".cook-thumb").forEach((el) => {
    const ph = photos[el.dataset.key];
    if (!ph || !ph.thumb) return;
    el.dataset.photo = "1";
    el.innerHTML = `<img src="${escapeHtml(ph.thumb)}" alt="" width="48" height="48" loading="lazy" referrerpolicy="no-referrer">`;
    const it = shop.find((x) => x.key === el.dataset.key);
    used.push([it ? it.label : el.dataset.key, ph]);
  });
  const old = box.querySelector(".cook-credits"); if (old) old.remove();
  if (!used.length) return;
  const en = cookLang() === "en";
  const d = document.createElement("details");
  d.className = "cook-credits";
  d.innerHTML = `<summary>📷 ${escapeHtml(cookT("cook.photos", en ? "Photos: Wikimedia Commons" : "Mga larawan: Wikimedia Commons"))}</summary><ul>${used.map(([label, ph]) =>
    `<li><a href="${escapeHtml(ph.page)}" target="_blank" rel="noopener">${escapeHtml(label)}</a> · ${escapeHtml(ph.artist || "Wikimedia Commons")} · ${ph.licenseUrl ? `<a href="${escapeHtml(ph.licenseUrl)}" target="_blank" rel="noopener">${escapeHtml(ph.license)}</a>` : escapeHtml(ph.license)}</li>`).join("")}</ul>`;
  box.appendChild(d);
}

function cookFillThumbs(map) {
  if (!map) return;
  document.querySelectorAll("#cook-list .cook-thumb").forEach((el) => {
    if (el.dataset.photo) return; // a real photo wins
    const url = map.get(el.dataset.key);
    if (url) el.innerHTML = `<img src="${url}" alt="" width="48" height="48">`;
  });
}

function cookStepIcon(s) {
  return { shop: "🧺", peel: "🧽", cut: "🔪", marinate: "🥣", heat: "🔥", saute: "🍳", add: "➕", pour: "🫗", boil: "♨️", simmer: "♨️",
    fry: "🍳", deepfry: "🛢️", grill: "🔥", bake: "🔥", steam: "♨️", stir: "🥄", mix: "🥣", wrap: "🌯", cook: "♨️", chill: "🧊", strain: "🫙", top: "🧀", dough: "🫓", rise: "⏳", shape: "⚪", rollout: "🪵", fill: "🥄", coat: "🍚", brush: "🖌️", season: "🧂", drain: "🧻", serve: "🍽️" }[s.kind] || "•";
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
  document.querySelectorAll("#cook-steps .cook-edit-row").forEach((li, k) => li.classList.toggle("on", k === cookShow.i));
  cookScrollStepList();
}

/**
 * Keeps the current step in view inside the step list's own scroll box. The page (or pop-up) itself never
 * moves, so the video stays where the person is watching it.
 */
function cookScrollStepList() {
  const list = document.getElementById("cook-steps");
  const cur = list && list.querySelector(".cook-step.on, .cook-edit-row.on");
  if (!cur || list.scrollHeight <= list.clientHeight) return;
  const top = cur.offsetTop - (list.clientHeight - cur.offsetHeight) / 2;
  list.scrollTop = Math.max(0, top);
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
  const wasInline = cookShow.inline;
  cancelAnimationFrame(cookShow.raf);
  if (cookShow.three) cookShow.three.dispose();
  cookShow = null;
  if (wasInline) cookKitchenIdle();
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
      if (cookShow.stopAt === cookShow.i) { cookShow.t = len; cookShow.playing = false; cookShow.stopAt = null; document.getElementById("cook-play").textContent = "▶"; }
      else if (cookShow.i < cookShow.steps.length - 1) { cookShow.i++; cookShow.t = 0; cookShowStep(); cookEnterStep(); }
      else { cookShow.t = len; cookShow.playing = false; document.getElementById("cook-play").textContent = "▶"; }
    }
  }
  const cv = document.getElementById("cook-canvas");
  if (cookShow.three && cv && cv.offsetParent !== null) {
    try { cookShow.three.update(cookShow.steps[cookShow.i], cookShow.t, cookStepLength(cookShow.steps[cookShow.i]), dt); }
    catch (e) { if (!cookShow.three.updateFailed) { cookShow.three.updateFailed = true; cookShow.three.errors.push(`update ${cookShow.i}: ${e && e.message}`); if (typeof console !== "undefined") console.warn("cookshow update", e); } }
  }
  cookShow.raf = requestAnimationFrame(cookFrame);
}

function cookEnterStep() {
  if (!cookShow || !cookShow.three) return;
  try { cookShow.three.enter(cookShow.steps[cookShow.i], cookShow.i, cookShow.steps, cookShow.cost); }
  catch (e) { cookShow.three.errors.push(`enter ${cookShow.i}: ${e && e.message}`); if (typeof console !== "undefined") console.warn("cookshow enter", e); }
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
  wrapper: ["#f2e7ca", "#f2e7ca", "#c98a3a"], rolled: ["#e7cf98", "#e7cf98", "#b26a22"], grain: ["#f4f1ea", "#f4f1ea", "#f4f1ea"],
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

// Cooked through, not browned: boiled pork goes grey-beige, beef brown-grey, shrimp and crab orange-red.
const CK_COOKED = { pork: "#cdb4a2", beef: "#735a4c", mince: "#a88d7b", chicken: "#ecdcc2", shrimp: "#f2804a", crab: "#e0552c", squid: "#f3ece2", shells: "#e9b48a", balls: "#dcc6a8" };

// Where things sit on the table (metres; the table top is y = 0).
const CK_AT = { board: [-0.72, 0.2], bowl: [-1.45, 0.28], stove: [0.32, 0.14], rack: [0.98, 0.02], plate: [1.42, 0.38] };
function ckPrepSpot(i) { return [-1.5 + (i % 8) * 0.42, i < 8 ? -0.62 : -0.34]; }

/** Replays steps 0..upto-1: where every ingredient is, what's in the pot, how browned things are. */
function cookState(steps, upto) {
  const items = (steps[0] && steps[0].kind === "shop" ? steps[0].items : []).slice();
  for (const s of steps) for (const it of s.items || []) if (it.water && !items.includes(it)) items.push(it);
  const st = { items: items.slice(), loc: new Map(), cut: new Map(), brown: new Map(), top: new Set(), parts: [], level: 0, oil: 0, vessel: null, heat: false, bowlLiquid: null, served: null };
  for (const it of items) st.loc.set(it, "prep");
  for (let i = 0; i < Math.min(upto, steps.length); i++) cookApply(st, steps[i]);
  return st;
}

/** The colour of a filling: the sauce it cooked in if that's dark, else the mix of its ingredients' colours. */
function cookFillColor(items, st) {
  const sauce = st.parts && st.parts.length ? cookMixColor(st.parts) : null;
  if (sauce && cookMixLum(st.parts) < 0.5) return sauce;
  const solid = (items || []).filter((it) => !["powder", "peppercorn", "cube", "misc"].includes(cookFoodKind(it)));
  if (!solid.length) return "#a8714a";
  const parts = solid.map((it) => { const L = CK_LOOK[cookFoodKind(it)] || CK_LOOK.misc; const cooked = (st.brown && st.brown.get(it)) || st.heat; return [L[cooked ? 2 : 1], ["pork", "beef", "mince", "chicken", "shrimp", "fish", "grain", "banana", "fruit"].includes(cookFoodKind(it)) ? 3 : 1, 1]; });
  return cookMixColor(parts);
}

/** Food takes on a sauce's colour (stewing, marinating); the strongest exposure so far wins. */
function cookTint(st, it, hex, amt) {
  if (!st.tint) st.tint = new Map();
  const cur = st.tint.get(it);
  st.tint.set(it, cur && cur[1] >= amt ? [cur[0], cur[1]] : [hex, amt]);
}

function cookApply(st, s) {
  const burnt = cookBurn(s);
  const potKinds = ["heat", "saute", "add", "pour", "fry", "deepfry", "boil", "simmer", "cook", "stir", "season", "grill", "bake", "steam", "strain", "top"];
  for (const it of s.items || []) if (!st.loc.has(it)) { st.items.push(it); st.loc.set(it, "board"); }
  if (potKinds.includes(s.kind) && s.vessel) {
    // A stew stays in its pot: adding, seasoning or simmering never moves the food to another pan.
    // Only frying, heating a new pan or an appliance starts in a different vessel.
    const full = st.items.some((it) => st.loc.get(it) === "pot") || st.level > 0.1;
    const carry = st.vessel && st.vessel !== s.vessel && full && !["fry", "deepfry", "saute", "heat", "grill", "bake", "steam"].includes(s.kind);
    if (!carry) {
      if (st.vessel && st.vessel !== s.vessel) { st.parts = []; st.level = 0; st.oil = 0; }
      st.vessel = s.vessel;
    }
  }
  const toPot = (it) => {
    if (cookIsPoured(it)) { const cups = cookAmountCups(it); st.parts.push(cookPouredLook(it).concat([cups])); st.level = Math.min(0.85, st.level + Math.min(0.5, cups * 0.22)); }
    else if (it.fryOil) st.oil = Math.max(st.oil, 0.18);
    else {
      // The marinade follows the meat into the pot, all of it, unless the meat is fried first (the marinade waits).
      if (st.loc.get(it) === "bowl" && st.bowlLiquid && !["fry", "deepfry", "saute", "grill", "bake"].includes(s.kind)) { const cups = st.bowlCups || 0.5; st.parts.push([st.bowlLiquid, 3, cups]); st.level = Math.min(0.85, st.level + Math.min(0.4, cups * 0.22)); st.bowlLiquid = null; st.bowlCups = 0; }
      st.loc.set(it, "pot");
    }
  };
  const inPot = () => st.items.filter((it) => st.loc.get(it) === "pot");
  const brown = (list, by) => { for (const it of list) st.brown.set(it, Math.min(1, (st.brown.get(it) || 0) + by)); };
  switch (s.kind) {
    case "cut": for (const it of s.items) { st.cut.set(it, (s.cuts && s.cuts[it.key]) || s.style); if (st.loc.get(it) !== "prep") st.loc.set(it, "board"); } break;
    case "mix": case "marinate":
      if (s.sun) { for (const it of s.items) st.loc.set(it, "rack"); break; }
      { const poured = s.items.filter(cookIsPoured);
        if (poured.length) { st.bowlLiquid = cookMixColor([...(st.bowlLiquid ? [[st.bowlLiquid, 1, 0.3]] : []), ...poured.map((it) => cookPouredLook(it).concat([cookAmountCups(it)]))]); st.bowlCups = (st.bowlCups || 0) + poured.reduce((a, it) => a + (it.grams > 0 ? cookAmountCups(it) : 0.5), 0); }
        for (const it of s.items) if (!cookIsPoured(it)) st.loc.set(it, "bowl");
        // Beaten eggs turn a milky mixture yellow.
        if (s.kind === "mix" && st.bowlLiquid && s.items.some((it) => cookFoodKind(it) === "egg")) st.bowlLiquid = cookMixColor([[st.bowlLiquid, 1, 0.3], ["#f1c75a", 1.4, 0.3]]);
        if (s.kind === "marinate" && st.bowlLiquid) for (const it of s.items) if (!cookIsPoured(it)) cookTint(st, it, st.bowlLiquid, Math.min(0.45, 0.12 + (s.minutes || 30) / 240)); }
      break;
    case "wrap":
      for (const it of st.items) if (["bowl", "filling"].includes(st.loc.get(it)) || (s.items.includes(it) && !cookIsPoured(it))) st.loc.set(it, "wrapped");
      st.rolled = true; st.dough = null; st.filled = false;
      if (s.made) { if (!st.items.includes(s.made)) st.items.push(s.made); st.loc.set(s.made, "board"); }
      break;
    // Dough: what goes in disappears into it; the dough then rises, is shaped, rolled out and filled.
    case "dough": for (const it of s.items) if (!cookIsPoured(it)) st.loc.set(it, "used"); st.dough = s.knead ? "kneaded" : "bowl"; break;
    case "rise": st.dough = "risen"; break;
    case "shape": st.dough = "balls"; break;
    case "rollout": st.dough = "disc"; break;
    case "coat": for (const it of s.items) st.loc.set(it, COOK_SEASONING.test(it.key) || cookIsPoured(it) ? "used" : "board"); break;
    case "fill": {
      // The filling comes from the bowl (raw mixtures), the pan (cooked fillings) or is named; the pan is emptied.
      const from = st.items.filter((it) => ["bowl", "pot", "rack", "board"].includes(st.loc.get(it)) && !cookIsPoured(it) && !COOK_WRAPPER.test(it.key) && it.key !== "rolled");
      const named = (s.items || []).filter((it) => !cookIsPoured(it) && !COOK_WRAPPER.test(it.key));
      const fill = [...new Set([...from, ...named])];
      st.fillColor = cookFillColor(fill, st);
      for (const it of fill) st.loc.set(it, "filling");
      if (from.some((it) => it && st.loc.get(it) === "filling")) { st.level = 0; st.parts = []; }
      st.filled = true;
      break;
    }
    case "heat": st.heat = true; if (st.items.some((it) => it.fryOil)) st.oil = Math.max(st.oil, 0.18); break;
    case "saute": case "add": case "pour":
      // "Pour the egg and milk mixture into the mold": the bowl's mixture becomes a custard layer over the caramel.
      if (s.kind === "pour" && s.mixture) {
        const egg = st.items.some((it) => st.loc.get(it) === "bowl" && cookFoodKind(it) === "egg");
        const c = egg ? "#f1c75a" : st.bowlLiquid || "#efe6d0";
        for (const it of st.items) if (st.loc.get(it) === "bowl") st.loc.set(it, "used");
        st.parts.push([c, 3, st.bowlCups || 1]); st.level = Math.min(0.6, st.level + 0.3); st.bowlLiquid = null; st.bowlCups = 0;
        if (st.caramel) st.custard = true;
        break;
      }
      // Before the stove is on, "add" after a "mix" goes into the mixing bowl (lumpia filling).
      if (!st.heat && s.kind !== "saute" && st.items.some((it) => st.loc.get(it) === "bowl")) {
        const poured = s.items.filter(cookIsPoured);
        if (poured.length) { st.bowlLiquid = cookMixColor([...(st.bowlLiquid ? [[st.bowlLiquid, 1, 0.3]] : []), ...poured.map((it) => cookPouredLook(it).concat([cookAmountCups(it)]))]); st.bowlCups = (st.bowlCups || 0) + poured.reduce((a, it) => a + (it.grams > 0 ? cookAmountCups(it) : 0.5), 0); }
        for (const it of s.items) if (!cookIsPoured(it)) st.loc.set(it, "bowl");
        break;
      }
      s.items.forEach(toPot); if (s.kind === "saute") brown(s.items.filter((it) => !it.liquid), 0.35); break;
    case "fry": s.items.forEach(toPot); brown(inPot(), 0.7); break;
    case "deepfry": st.oil = 0.8; s.items.forEach(toPot); brown(s.items.length ? s.items : inPot(), 1); break;
    case "bake": case "grill": case "steam":
      st.heat = true;
      if (!s.items.length) for (const it of st.items) if (["bowl", "wrapped", "board", "pot"].includes(st.loc.get(it)) && !cookIsPoured(it)) st.loc.set(it, "pot");
      if (!s.items.length && st.rolled) st.loc.set(st.items.find((it) => it.key === "rolled") || {}, "pot");
      s.items.forEach(toPot);
      if (s.kind !== "steam") brown(inPot().filter((it) => !it.liquid), s.kind === "bake" ? 0.7 : 0.85);
      break;
    case "boil": case "simmer": case "cook":
      // Caramel: the sugar melts into an amber layer on the bottom of the pan (or llanera).
      if (s.caramel) { for (const it of s.items) st.loc.set(it, "used"); st.parts = [["#a65e1c", 2, 0.4]]; st.level = Math.max(st.level, 0.12); st.caramel = true; st.heat = true; break; }
      s.items.forEach(toPot);
      if (s.minutes >= 30 && st.level > 0.2) st.level = Math.max(0.2, st.level * 0.8);
      if (st.level > 0) st.parts.push(["#d6a35a", Math.min(2, (s.minutes || 15) / 20), 0]);
      // Meat stewed in a dark sauce (adobo, humba) takes on its colour.
      if (st.level > 0 && cookMixLum(st.parts) < 0.5) brown(inPot().filter((it) => ["pork", "beef", "chicken"].includes(cookFoodKind(it))), Math.min(0.85, (s.minutes || 20) / 35));
      // Everything stewing in a coloured sauce takes on its colour: dark in toyo, red in tomato sauce.
      if (st.level > 0 && st.parts.length) {
        const sauce = cookMixColor(st.parts), pale = cookMixLum(st.parts) > 0.75;
        if (!pale) for (const it of inPot()) cookTint(st, it, sauce, Math.min(0.7, 0.15 + (s.minutes || 15) / 80));
      }
      break;
    case "season": for (const it of s.items) { if (cookIsPoured(it)) toPot(it); else st.loc.set(it, "used"); } break;
    // Strain: the food (or just what's named) goes to the strainer, the water is poured off.
    case "strain": {
      const out = s.items && s.items.length ? s.items.filter((it) => st.loc.get(it) === "pot") : inPot();
      for (const it of out) st.loc.set(it, ["peppercorn", "bayleaf", "powder", "cube", "misc", "citrus"].includes(cookFoodKind(it)) ? "used" : "rack");
      st.level = 0; st.parts = [];
      break;
    }
    // Put on top: into the pot (or onto what's there), sitting on top, and it stays on top on the plate.
    case "top": for (const it of s.items) {
      if (cookIsPoured(it)) { toPot(it); continue; } // a sauce poured over the top: into the pot's liquid, the bottle stays out
      st.loc.set(it, st.items.some((x) => st.loc.get(x) === "pot") ? "pot" : "plate"); st.top.add(it);
    } break;
    // Only the food comes out; spices and leaves go with the water.
    case "drain": for (const it of inPot()) st.loc.set(it, ["peppercorn", "bayleaf", "powder", "cube", "misc", "citrus"].includes(cookFoodKind(it)) ? "used" : "rack"); if (st.vessel === "kaldero") { st.level = 0; st.parts = []; } break;
    case "serve":
      if (st.custard) { for (const it of st.items) if (["pot", "rack", "bowl"].includes(st.loc.get(it))) st.loc.set(it, "used"); st.served = "plate"; break; }
      for (const it of st.items) if (["pot", "rack"].includes(st.loc.get(it)) || (s.cold && st.loc.get(it) === "bowl") || (st.loc.get(it) === "board" && st.brown.get(it))) st.loc.set(it, "plate");
      st.served = (st.level > 0.25 && !["ihawan", "oven", "steamer"].includes(st.vessel)) || (s.cold && st.items.some((it) => /cream|milk|mayonnaise|yogurt|gata|coconut/.test(it.key))) ? "bowl" : "plate";
      break;
    default: break;
  }
  // Meat and seafood cook through: pink turns the colour of cooked meat, slowly in a pot, at once in a fryer.
  const doneBy = { boil: 15, simmer: 15, cook: 10, steam: 12, fry: 4, deepfry: 3, grill: 6, bake: 10, saute: 6 }[s.kind];
  if (doneBy) {
    if (!st.done) st.done = new Map();
    const by = s.minutes ? Math.min(1, s.minutes / doneBy) : ["fry", "deepfry", "grill", "bake"].includes(s.kind) ? 1 : 0.6;
    for (const it of st.items) if (st.loc.get(it) === "pot" && CK_COOKED[cookFoodKind(it)]) st.done.set(it, Math.min(1, (st.done.get(it) || 0) + by));
  }
  // Too long on the fire: the liquid boils away and the food darkens (overdone) or chars (burnt).
  if (burnt && COOK_BURN_LIMITS[s.kind]) {
    const inside = st.items.filter((it) => st.loc.get(it) === "pot" || (s.items || []).includes(it));
    for (const it of inside) if (!it.liquid) st.brown.set(it, Math.max(st.brown.get(it) || 0, burnt === 2 ? 1.75 : 1.2));
    st.level = burnt === 2 ? 0 : st.level * 0.4; if (burnt === 2) { st.parts = []; st.oil = Math.min(st.oil, 0.05); }
    st.burnt = Math.max(st.burnt || 0, burnt);
  }
  return st;
}

function cookMixLum(parts) {
  const n = parseInt(cookMixColor(parts).slice(1), 16);
  return (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255;
}

/**
 * Whether an ingredient goes in poured or spooned (its bottle, jar or packet stays on the counter):
 * liquids, anything that comes in a bottle, and jarred sauces and pastes. Pure, tested.
 */
function cookIsPoured(it) {
  if (!it || it.fryOil) return false;
  return !!it.liquid || ["bottle", "water", "jar"].includes(cookFoodKind(it));
}

/** Its colour and how strongly it colours a dish: a liquid's look, or a jar's contents. */
function cookPouredLook(it) {
  if (cookFoodKind(it) === "jar") { const [c] = cookJarLook(it); return [c, /tomato|kimchi|salsa|bagoong|shrimp paste|gravy|molasses|miso|pesto/.test(`${it.key} ${it.label}`.toLowerCase()) ? 2.4 : 1.2]; }
  return cookLiquidLook(it);
}

/** How much of the pot an ingredient fills, in cups (from its grams), so ½ cup of toyo outweighs a spoon of patis. */
function cookAmountCups(it) {
  if (it.grams > 0) return Math.max(0.02, Math.min(6, it.grams / 240));
  return it.water ? 1.5 : 0.1;
}

/** The pot's liquid colour: a weighted mix of what was poured in. */
function cookMixColor(parts) {
  // Light passes through every ingredient in a liquid, so dark ones (toyo, oyster sauce) dominate and pale
  // ones (water, vinegar) barely lighten it: a weighted geometric mean of each channel, not an average.
  let r = 0, g = 0, b = 0, w = 0;
  for (const [hex, strength, amount] of parts) {
    const n = parseInt(hex.slice(1), 16), k = strength * Math.max(0.05, amount || 0.1);
    const ch = (v) => Math.log(Math.max(8, v) / 255);
    r += ch((n >> 16) & 255) * k; g += ch((n >> 8) & 255) * k; b += ch(n & 255) * k; w += k;
  }
  if (!w) return "#cfe0e6";
  const h = (x) => Math.round(Math.exp(x / w) * 255).toString(16).padStart(2, "0");
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

  // ── Appliances: oven toaster, charcoal grill (ihawan), steamer ──
  const dummy0 = new THREE.Object3D();
  const SX = CK_AT.stove[0], SZ = CK_AT.stove[1];
  const darkMetal = keep(std({ color: 0x1c1d20, metalness: 0.55, roughness: 0.35 }));
  const brushed = keep(std({ color: 0xc9ced4, metalness: 0.9, roughness: 0.3 }));
  const part = (geo, mat, x, y, z, parent) => { const m = shadowed(new THREE.Mesh(keep(geo), mat)); m.position.set(x, y, z); parent.add(m); return m; };
  // Oven toaster: a box open at the front with a smoked-glass door, glowing elements and a tray.
  const ovenG = new THREE.Group(); ovenG.position.set(SX, 0, SZ); scene.add(ovenG);
  const OW = 0.46, OH = 0.28, OD = 0.32;
  part(new THREE.BoxGeometry(OW + 0.12, 0.02, OD), darkMetal, 0.06, OH, 0, ovenG);            // top
  part(new THREE.BoxGeometry(OW + 0.12, 0.02, OD), darkMetal, 0.06, 0.01, 0, ovenG);          // bottom
  part(new THREE.BoxGeometry(0.02, OH, OD), darkMetal, -OW / 2, OH / 2, 0, ovenG);            // left
  part(new THREE.BoxGeometry(0.02, OH, OD), darkMetal, OW / 2, OH / 2, 0, ovenG);             // right wall of the cavity
  part(new THREE.BoxGeometry(OW, OH, 0.02), keep(std({ color: 0x2a2a2a, metalness: 0.3, roughness: 0.6 })), 0, OH / 2, -OD / 2, ovenG); // back
  const panel = part(new THREE.BoxGeometry(0.1, OH, OD), brushed, OW / 2 + 0.06, OH / 2, 0, ovenG); // controls
  [0.07, 0.15, 0.22].forEach((y) => { const k = part(new THREE.CylinderGeometry(0.018, 0.018, 0.015, 20), darkMetal, OW / 2 + 0.06, y, OD / 2 + 0.008, ovenG); k.rotation.x = Math.PI / 2; });
  const glassDoor = new THREE.Mesh(keep(new THREE.PlaneGeometry(OW - 0.02, OH - 0.03)), keep(std({ color: 0x3a2a1a, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.32, envMapIntensity: 2 })));
  glassDoor.position.set(0, OH / 2, OD / 2); ovenG.add(glassDoor);
  part(new THREE.CylinderGeometry(0.008, 0.008, OW * 0.7, 10), brushed, 0, OH - 0.03, OD / 2 + 0.03, ovenG).rotation.z = Math.PI / 2;
  const rodMat = keep(new THREE.MeshStandardMaterial({ color: 0x401010, emissive: new THREE.Color(1, 0.25, 0.05), emissiveIntensity: 0.1, roughness: 0.5 }));
  [[0.255, -0.06], [0.255, 0.06], [0.03, -0.06], [0.03, 0.06]].forEach(([y, z]) => { const r = part(new THREE.CylinderGeometry(0.005, 0.005, OW - 0.04, 8), rodMat, 0, y, z, ovenG); r.rotation.z = Math.PI / 2; });
  part(new THREE.BoxGeometry(OW - 0.06, 0.006, OD - 0.06), brushed, 0, 0.075, 0, ovenG);      // tray
  // A glass baking dish (llanera-style) on the tray.
  const dishGlass = keep(std({ color: 0xffffff, roughness: 0.04, transparent: true, opacity: 0.35, envMapIntensity: 2 }));
  part(new THREE.BoxGeometry(0.26, 0.006, 0.18), dishGlass, 0, 0.081, 0, ovenG);
  [[-0.13, 0, 0.006, 0.18], [0.13, 0, 0.006, 0.18], [0, -0.09, 0.26, 0.006], [0, 0.09, 0.26, 0.006]].forEach(([x, z, w, d]) => part(new THREE.BoxGeometry(w, 0.04, d), dishGlass, x, 0.1, z, ovenG));
  const ovenLight = new THREE.PointLight(0xff8a3a, 0, 0.6, 2); ovenLight.position.set(0, 0.18, 0); ovenG.add(ovenLight);
  ovenG.visible = false;
  // Charcoal grill: an open box of glowing coals with a grate on top.
  const grillG = new THREE.Group(); grillG.position.set(SX, 0, SZ); scene.add(grillG);
  part(new THREE.BoxGeometry(0.5, 0.02, 0.32), darkMetal, 0, 0.01, 0, grillG);
  [[-0.25, 0, 0.02, 0.32], [0.25, 0, 0.02, 0.32], [0, -0.16, 0.5, 0.02], [0, 0.16, 0.5, 0.02]].forEach(([x, z, w, d]) => part(new THREE.BoxGeometry(w, 0.12, d), darkMetal, x, 0.06, z, grillG));
  const coalMat = keep(new THREE.MeshStandardMaterial({ color: 0x1a1412, emissive: new THREE.Color(0.9, 0.18, 0.02), emissiveIntensity: 0.3, roughness: 0.95 }));
  const coals = new THREE.InstancedMesh(keep(organic(new THREE.DodecahedronGeometry(0.022, 0), 0, 0.2, 5)), coalMat, 40);
  { const rc = ckRand(77); for (let i = 0; i < 40; i++) { dummy0.position.set((rc() - 0.5) * 0.44, 0.04 + rc() * 0.03, (rc() - 0.5) * 0.27); dummy0.rotation.set(rc() * 3, rc() * 3, rc() * 3); dummy0.scale.setScalar(0.7 + rc() * 0.6); dummy0.updateMatrix(); coals.setMatrixAt(i, dummy0.matrix); } }
  grillG.add(coals);
  for (let k = 0; k < 11; k++) { const b = part(new THREE.CylinderGeometry(0.003, 0.003, 0.3, 6), darkMetal, -0.22 + k * 0.044, 0.125, 0, grillG); b.rotation.x = Math.PI / 2; }
  const grillLight = new THREE.PointLight(0xff6a20, 0, 0.6, 2); grillLight.position.set(0, 0.1, 0); grillG.add(grillLight);
  grillG.visible = false;
  // Steamed dumplings (siomai, puto) for a filling that was mixed or wrapped before steaming.
  const dumplings = new THREE.Group();
  { const dm = keep(std({ color: 0xf1e3c4, roughness: 0.55 })), top = keep(std({ color: 0xe8956a, roughness: 0.6 }));
    const body = keep(new THREE.CylinderGeometry(0.022, 0.026, 0.03, 18)), cap = keep(new THREE.SphereGeometry(0.012, 12, 8));
    for (let k = 0; k < 7; k++) { const a = (k / 6) * Math.PI * 2, r = k ? 0.07 : 0; const d = shadowed(new THREE.Mesh(body, dm)); d.position.set(Math.cos(a) * r, 0.015, Math.sin(a) * r); dumplings.add(d); const c = new THREE.Mesh(cap, top); c.position.set(d.position.x, 0.032, d.position.z); dumplings.add(c); } }
  dumplings.visible = false;
  // Steamer: a steel pot with a perforated tier and a lid held up.
  const steamerG = new THREE.Group(); steamerG.position.set(SX, VESSEL_Y, SZ); scene.add(steamerG);
  steamerG.add(shadowed(new THREE.Mesh(potGeo, steel)));
  const holes = tex("steamer-holes", 256, (g, n) => { g.fillStyle = "#d9dde2"; g.fillRect(0, 0, n, n); g.fillStyle = "#3a3d42"; for (let y = 10; y < n; y += 20) for (let x = 10; x < n; x += 20) { g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); } });
  const tier = new THREE.Mesh(keep(new THREE.CircleGeometry(0.148, 48)), keep(std({ map: holes, metalness: 0.8, roughness: 0.35 }))); tier.rotation.x = -Math.PI / 2; tier.position.y = 0.15; steamerG.add(tier);
  const lid = new THREE.Mesh(keep(new THREE.SphereGeometry(0.17, 32, 12, 0, Math.PI * 2, 0, Math.PI / 4)), steel); lid.position.set(0.12, 0.2, -0.08); lid.rotation.z = -0.5; lid.castShadow = true; steamerG.add(lid);
  steamerG.visible = false;
  dumplings.position.y = 0.152; steamerG.add(dumplings);
  // Leche flan: an oval llanera of custard in the steamer, then turned out on the plate, caramel on top.
  const custardMat = keep(std({ color: 0xf1c75a, roughness: 0.25 })), caramelMat = keep(std({ color: 0x9a531a, roughness: 0.15, metalness: 0.05 }));
  const flanTin = new THREE.Group();
  { const tin = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.075, 0.065, 0.035, 40, 1, true)), steel)); tin.scale.x = 1.45; tin.position.y = 0.018; flanTin.add(tin);
    const base = new THREE.Mesh(keep(new THREE.CircleGeometry(0.065, 40)), steel); base.rotation.x = -Math.PI / 2; base.scale.x = 1.45; base.position.y = 0.001; flanTin.add(base);
    const top = new THREE.Mesh(keep(new THREE.CircleGeometry(0.072, 40)), custardMat); top.rotation.x = -Math.PI / 2; top.scale.x = 1.45; top.position.y = 0.03; flanTin.add(top); }
  flanTin.position.y = 0.152; flanTin.visible = false; steamerG.add(flanTin);
  const flanPlate = new THREE.Group();
  { const body = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.068, 0.076, 0.034, 40)), custardMat)); body.scale.x = 1.45; body.position.y = 0.025; flanPlate.add(body);
    const cap = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.069, 0.069, 0.004, 40)), caramelMat); cap.scale.x = 1.45; cap.position.y = 0.043; flanPlate.add(cap);
    const pool = new THREE.Mesh(keep(new THREE.CircleGeometry(0.1, 40)), caramelMat); pool.rotation.x = -Math.PI / 2; pool.scale.x = 1.3; pool.position.y = 0.009; flanPlate.add(pool); }
  flanPlate.visible = false; scene.add(flanPlate);
  const APPLIANCE = { oven: { y: 0.086, r: 0.085 }, ihawan: { y: 0.132, r: 0.13 }, steamer: { y: VESSEL_Y + 0.152, r: 0.11 } };

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
  for (let i = 0; i < 40; i++) { const p = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0 }))); p.userData.seed = (i * 0.618) % 1; scene.add(p); puffs.push(p); }
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
    // Past done: overcooked, then charred black.
    if (amt > 1) m.color.lerp(m.map ? new THREE.Color(0.08, 0.06, 0.05) : col("#1b130e"), Math.min(1, (amt - 1) / 0.75));
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

  // A model that fails to build becomes a plain bowl instead of breaking the whole scene.
  const sceneErrors = [];
  function safely(what, it, build) {
    try { return build(); } catch (e) {
      sceneErrors.push(`${what} ${it && it.key}: ${e && e.message}`);
      if (typeof console !== "undefined") console.warn("cookshow:", what, it && it.key, e);
      const g = new THREE.Group(); g.add(ramekin()); g.userData.inst = { count: 0 }; g.userData.n = 0; return g;
    }
  }
  function wholeModel(it, brownAmt) { return safely("whole", it, () => wholeModelRaw(it, brownAmt)); }

  // ── Dough and wrapped dishes ──
  const doughMat = (b = 0) => { const m = std({ color: 0xf1e2c2, roughness: 0.75, bumpMap: pores(), bumpScale: 0.0015 }); m.userData.base = col("#f1e2c2"); m.userData.done = col("#c9873a"); ckBrown(m, b); return m; };
  const wrapperMat = () => std({ map: tex("wrapper-sheet2", 256, (gg, n, rr) => { gg.fillStyle = "#f3e6c4"; gg.fillRect(0, 0, n, n); for (let k = 0; k < 600; k++) { gg.globalAlpha = 0.1; gg.fillStyle = rr() < 0.5 ? "#fff" : "#d8c08c"; gg.fillRect(rr() * n, rr() * n, 2, 2); } gg.globalAlpha = 1; }), roughness: 0.8, side: THREE.DoubleSide });
  const leafMat = () => std({ map: tex("leaf-sheet", 256, leaf("#4f8a35", "#9cc27a")), roughness: 0.5, side: THREE.DoubleSide });
  const fillMat = (hex) => std({ color: hex || "#a8714a", roughness: 0.6, bumpMap: pores(), bumpScale: 0.002 });
  /** Empanada, siomai, siopao, suman, wonton: a few pieces of the wrapped dish. */
  function madeModel(g, it, b, r) {
    const st = it.wrapStyle, cooked = b;
    if (st === "halfmoon") {
      const m = it.dough === false ? wrapperMat() : doughMat(cooked);
      // A plump half-moon: a half-disc extruded with rounded edges, puffed in the middle, crimped along the curve.
      const shp = new THREE.Shape(); shp.moveTo(-0.045, 0); shp.absarc(0, 0, 0.045, Math.PI, 0, true); shp.lineTo(-0.045, 0);
      const geo = new THREE.ExtrudeGeometry(shp, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.007, bevelSegments: 4, curveSegments: 24 });
      geo.rotateX(-Math.PI / 2); geo.translate(0, 0.008, 0);
      { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i); if (y > 0.01) { const d = Math.hypot(x, z + 0.018) / 0.05; p.setY(i, y + Math.max(0, 1 - d * d) * 0.01); } } geo.computeVertexNormals(); }
      const crimp = std({ color: 0x000000, transparent: true, opacity: 0.25 });
      for (let k = 0; k < 3; k++) {
        const one = new THREE.Group(); one.add(mesh(geo, m));
        for (let j = 0; j < 11; j++) { const a = Math.PI - (j / 10) * Math.PI; const nick = mesh(new THREE.BoxGeometry(0.009, 0.001, 0.0016), crimp); nick.position.set(Math.cos(a) * 0.047, 0.017, -Math.sin(a) * 0.047); nick.rotation.y = a; one.add(nick); }
        one.position.set((k - 1) * 0.07, 0, (k % 2) * 0.035); one.rotation.y = (r() - 0.5) * 0.6; g.add(one);
      }
    } else if (st === "pleat") {
      const w = std({ color: 0xf2d77a, roughness: 0.4 }); w.userData.base = col("#f2d77a"); w.userData.done = col("#c98a3a"); ckBrown(w, cooked * 0.6);
      const f = fillMat("#d99a8c");
      for (let k = 0; k < 6; k++) {
        const one = new THREE.Group();
        const wall = mesh(organic(new THREE.CylinderGeometry(0.017, 0.02, 0.026, 16, 2, true), 0, 0.12, 21 + k), w); wall.material.side = THREE.DoubleSide; wall.position.y = 0.013; one.add(wall);
        const top = mesh(new THREE.CircleGeometry(0.016, 16), f); top.rotation.x = -Math.PI / 2; top.position.y = 0.024; one.add(top);
        const dot = mesh(new THREE.SphereGeometry(0.003, 8, 6), std({ color: 0xe8651e })); dot.position.y = 0.026; one.add(dot);
        one.position.set(((k % 3) - 1) * 0.045, 0, (Math.floor(k / 3) - 0.5) * 0.045); g.add(one);
      }
    } else if (st === "bun") {
      const m = std({ color: 0xfbf7ef, roughness: 0.6, bumpMap: pores(), bumpScale: 0.001 });
      for (let k = 0; k < 3; k++) {
        const bun = ellipsoid(0.034, 1, 0.78, 1, m, 24); bun.position.x = (k - 1) * 0.075;
        const twist = mesh(new THREE.ConeGeometry(0.008, 0.012, 8), m); twist.position.set(bun.position.x, 0.054, 0);
        const paper = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.001, 20), std({ color: 0xf4efe6 })); paper.position.set(bun.position.x, 0.0006, 0);
        g.add(bun, twist, paper);
      }
    } else if (st === "leaf") {
      const m = leafMat(), tie = std({ color: 0x6b5a2e, roughness: 0.8 });
      for (let k = 0; k < 4; k++) {
        const c = mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.1, 14), m); c.rotation.z = Math.PI / 2; c.position.set(0, 0.013 + Math.floor(k / 2) * 0.024, ((k % 2) - 0.5) * 0.028 + Math.floor(k / 2) * 0.012); g.add(c);
        for (const x of [-0.03, 0.03]) { const band = mesh(new THREE.TorusGeometry(0.0135, 0.0018, 6, 16), tie); band.rotation.y = Math.PI / 2; band.position.set(x, c.position.y, c.position.z); g.add(band); }
      }
    } else { // parcel: wonton
      const m = wrapperMat(); m.userData.base = col("#f3e6c4"); m.userData.done = col("#c98a3a"); ckBrown(m, cooked);
      for (let k = 0; k < 6; k++) {
        const one = mesh(organic(new THREE.ConeGeometry(0.022, 0.018, 4), 0, 0.2, 31 + k), m); one.scale.y = 0.7; one.position.set(((k % 3) - 1) * 0.05, 0.007, (Math.floor(k / 3) - 0.5) * 0.045); one.rotation.y = r() * 3; g.add(one);
      }
    }
  }

  // Rolling pin
  const rollingPin = new THREE.Group(); scene.add(rollingPin);
  { const wood = keep(std({ map: tex("pin-wood", 256, grain("#d2a46b", "#8a5a2e", 20)), roughness: 0.55 }));
    const barrel = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 20)), wood)); barrel.rotation.z = Math.PI / 2; rollingPin.add(barrel);
    for (const x of [-0.105, 0.105]) { const h = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.007, 0.008, 0.05, 12)), wood)); h.rotation.z = Math.PI / 2; h.position.x = x; rollingPin.add(h); } }
  const pinRest = () => { rollingPin.position.set(CK_AT.board[0] - 0.04, 0.014, CK_AT.board[1] + 0.22); rollingPin.rotation.set(0, 0.25, 0); };
  pinRest();

  /** The dough as it is now (in the bowl, risen, in balls, rolled out), and this step's animation. */
  function cookDoughScene(st, step, steps, index, after) {
    const k = step.kind, B = CK_AT.board, by = BOARD_Y;
    const ball = (r, x, y, z, mat) => { const m = ellipsoid(r, 1, 0.82, 1, mat || doughMat(), 24); m.position.set(x, y, z); dyn.add(m); return m; };
    const base = (kind) => {
      let m;
      if (kind === "leaf") { m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.11), leafMat()); m.rotation.x = -Math.PI / 2; }
      else if (kind === "disc") { m = mesh(organic(new THREE.CylinderGeometry(0.06, 0.06, 0.004, 40), 0, 0.03, 5), doughMat()); }
      else { m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), wrapperMat()); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.PI / 4; }
      m.position.set(B[0], by + 0.002, B[1]); dyn.add(m); return m;
    };
    const baseKind = step.style === "leaf" ? "leaf" : st.dough || step.dough ? "disc" : "wrapper";
    doughInfo = null;
    if (k === "dough") {
      if (step.knead) { const d = ball(0.045, B[0], by, B[1]); doughInfo = { kind: "knead", d }; }
      else { const d = ball(0.05, CK_AT.bowl[0], 0.008, CK_AT.bowl[1]); d.scale.setScalar(0.001); doughInfo = { kind: "mixdough", d }; }
      return;
    }
    if (k === "rise") { const d = ball(0.05, CK_AT.bowl[0], 0.008, CK_AT.bowl[1]); doughInfo = { kind: "rise", d }; return; }
    if (k === "shape") {
      const big = ball(0.05, B[0], by, B[1]);
      const smalls = [0, 1, 2, 3].map((j) => { const b2 = ball(0.022, B[0] - 0.09 + j * 0.06, by, B[1] + 0.07); b2.scale.setScalar(0.001); return b2; });
      doughInfo = { kind: "shape", big, smalls };
      return;
    }
    if (k === "rollout") {
      const lump = ball(0.03, B[0], by, B[1]);
      const disc = mesh(organic(new THREE.CylinderGeometry(0.06, 0.06, 0.004, 40), 0, 0.03, 5), doughMat()); disc.position.set(B[0], by + 0.002, B[1]); disc.scale.set(0.3, 1, 0.3); dyn.add(disc);
      [0, 1, 2].forEach((j) => ball(0.022, B[0] - 0.09 + j * 0.06, by, B[1] + 0.07));
      doughInfo = { kind: "rollout", lump, disc };
      return;
    }
    if (k === "fill") {
      base(baseKind);
      const mound = mesh(organic(new THREE.SphereGeometry(0.026, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.12, 9), fillMat((after && after.fillColor) || "#a8714a")); mound.scale.set(1.2, 0.55, 1);
      const leafy = baseKind === "leaf";
      if (leafy) mound.scale.set(2.6, 0.5, 0.8);
      mound.position.set(B[0], by + 0.003, B[1] + (baseKind === "disc" && step.style === "halfmoon" ? -0.018 : baseKind === "wrapper" && step.style === "roll" ? 0.025 : 0)); mound.userData.s0 = mound.scale.clone(); mound.scale.multiplyScalar(0.001); dyn.add(mound);
      doughInfo = { kind: "fill", mound };
      return;
    }
    // Between steps: show where the dough is.
    if (st.dough === "bowl" || st.dough === "risen") ball(st.dough === "risen" ? 0.07 : 0.05, CK_AT.bowl[0], 0.008, CK_AT.bowl[1]);
    if (st.dough === "kneaded") ball(0.045, B[0], by, B[1]);
    if (st.dough === "balls") [0, 1, 2, 3].forEach((j) => ball(0.022, B[0] - 0.09 + j * 0.06, by, B[1] + 0.07));
    if (st.dough === "disc") base("disc");
  }
  function piecesModel(it, style, radius, brownAmt, seedExtra = 0) { return safely("pieces", it, () => piecesModelRaw(it, style, radius, brownAmt, seedExtra)); }

  function wholeModelRaw(it, brownAmt) {
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
      case "rolled": if (it.wrapStyle && it.wrapStyle !== "roll") { madeModel(g, it, brownAmt, r); break; } {
        // Lumpiang shanghai: thin, long rolls with folded, pinched ends and a seam, stacked like on a platter.
        const m = foodMat(kind, "skin", brownAmt, { map: tex("lumpia-skin", 256, (gg, n, rr) => { gg.fillStyle = "#e7cf98"; gg.fillRect(0, 0, n, n); for (let i = 0; i < 900; i++) { gg.globalAlpha = 0.08 + rr() * 0.2; gg.fillStyle = rr() < 0.5 ? "#ffffff" : "#c8a468"; gg.beginPath(); gg.ellipse(rr() * n, rr() * n, 1 + rr() * 4, 0.6 + rr() * 2, rr() * 3, 0, 7); gg.fill(); } gg.globalAlpha = 0.35; gg.strokeStyle = "#b98a4a"; gg.lineWidth = 2; for (let x = 0; x < n; x += 22) { gg.beginPath(); gg.moveTo(x, 0); gg.lineTo(x + 10, n); gg.stroke(); } gg.globalAlpha = 1; }), roughness: 0.55, bumpMap: blisters(), bumpScale: 0.0015 + 0.004 * brownAmt });
        const prof = []; const L = 0.1, R = 0.0085;
        for (let k = 0; k <= 16; k++) { const y = (k / 16) * L; const e = Math.min(y, L - y) / (L * 0.12); prof.push(new THREE.Vector2(R * Math.min(1, 0.55 + 0.45 * Math.min(1, e)), y)); }
        const geo = new THREE.LatheGeometry(prof, 18); geo.translate(0, -L / 2, 0); organic(geo, 0, 0.04, 31);
        const rows = [[-0.035, 0], [-0.0175, 0], [0, 0], [0.0175, 0], [0.035, 0], [-0.02625, 0.015], [-0.00875, 0.015], [0.00875, 0.015], [0.02625, 0.015]];
        rows.forEach(([z, y], k) => { const c = mesh(geo, m); c.rotation.z = Math.PI / 2; c.rotation.x = (r() - 0.5) * 0.15; c.position.set((r() - 0.5) * 0.006, R + y, z * 1.02); g.add(c); });
        break;
      }
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
      case "sausage": { const m = foodMat(kind, "skin", brownAmt, { roughness: 0.35 }); for (let k = 0; k < 4; k++) { const c = mesh(organic(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 14, 4), 0, 0.03, 17 + k), m); c.rotation.z = Math.PI / 2; c.position.set(0, 0.012, k * 0.026 - 0.04); g.add(c); } break; }
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
  function piecesModelRaw(it, style, radius, brownAmt, seedExtra = 0) {
    const kind = cookFoodKind(it), r = ckRand(ckHash(it.key) + seedExtra);
    const flesh = foodMat(kind, ["beef", "mince", "chicken", "fish", "shrimp", "leafy", "bayleaf", "rolled", "wrapper"].includes(kind) ? "skin" : "flesh", brownAmt,
      { map: kind === "pork" ? tex("pork-cut", 256, marble(look("pork")[1], "#f2dfd4")) : ["beef", "mince", "chicken", "leafy", "fish"].includes(kind) ? skinTex(kind) : null, roughness: 0.5, side: kind === "leafy" ? THREE.DoubleSide : THREE.FrontSide });
    const meat = ["pork", "beef", "chicken", "fish", "shrimp"].includes(kind);
    let geo, n;
    const fleck = kind === "leafy" && ["minced", "diced", "grated"].includes(style);
    if (fleck) flesh.map = null, flesh.userData.base = col(look(kind)[0]), flesh.color.copy(flesh.userData.base);
    switch (kind === "leafy" && !fleck ? "leaf" : style) {
      case "leaf": geo = new THREE.PlaneGeometry(0.045, 0.035); n = 22; break;
      case "minced": geo = organic(box(0.009, 0.006, 0.009, 1), 0.25, 0.2, 3); n = 90; break;
      case "beads": geo = new THREE.SphereGeometry(kind === "peppercorn" ? 0.0035 : 0.005, 8, 6); n = kind === "peppercorn" ? 20 : 45; break;
      case "grated": geo = new THREE.BoxGeometry(0.022, 0.003, 0.003); n = 60; break;
      case "diced": geo = organic(box(0.016, 0.013, 0.016, 2), 0.25, 0.12, 5); n = 40; break;
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

  // An egg cracked into a bowl or pan: albumen and yolk (cooked: white and set). Beaten (in a mixture): a yellow pool.
  function crackedEgg(it, cooked, beaten, n) {
    const g = new THREE.Group();
    if (beaten) {
      const pool = mesh(new THREE.CircleGeometry(0.05, 32), std({ color: cooked ? 0xf3d27a : 0xf2c14e, roughness: cooked ? 0.6 : 0.12, transparent: !cooked, opacity: 0.92 }));
      pool.rotation.x = -Math.PI / 2; pool.position.y = 0.004; g.add(pool); return g;
    }
    const white = std({ color: cooked ? 0xfbfaf4 : 0xf4f1e6, roughness: cooked ? 0.6 : 0.08, transparent: !cooked, opacity: cooked ? 1 : 0.55 });
    const yolk = std({ color: cooked ? 0xf1b52a : 0xf5a81c, roughness: 0.25 });
    for (let k = 0; k < Math.max(1, Math.min(3, n || 1)); k++) {
      const w = mesh(organic(new THREE.CircleGeometry(0.03, 24), 0, 0.12, 7 + k), white); w.rotation.x = -Math.PI / 2; w.position.set(k * 0.035 - 0.02, 0.003, (k % 2) * 0.02); g.add(w);
      const y = ellipsoid(0.011, 1, 0.55, 1, yolk, 16); y.position.x = w.position.x + 0.004; y.position.z = w.position.z; y.position.y = 0.003; g.add(y);
    }
    return g;
  }
  function looseGrain(it, radius) {
    const s2 = `${it.key} ${it.label}`.toLowerCase(), g = new THREE.Group(), r = ckRand(ckHash(it.key));
    if (/noodle|pasta|spaghetti|bihon|canton|sotanghon|misua|miki|macaroni|penne|linguine|fettuccine/.test(s2)) {
      const short = /macaroni|penne/.test(s2);
      const m = std({ color: /bihon|sotanghon/.test(s2) ? 0xf4efe2 : /canton|miki|egg/.test(s2) ? 0xe9c56a : 0xe8cf8a, roughness: 0.35 });
      if (short) { const geo = new THREE.TorusGeometry(0.008, 0.004, 6, 10, Math.PI * 0.8); for (let k = 0; k < 40; k++) { const p2 = mesh(geo, m); const a = r() * 6.3, d = Math.sqrt(r()) * radius; p2.position.set(Math.cos(a) * d, 0.006 + r() * 0.01, Math.sin(a) * d); p2.rotation.set(r() * 3, r() * 3, r() * 3); g.add(p2); } return g; }
      for (let k = 0; k < 28; k++) { const pts = []; let x = (r() - 0.5) * radius, z = (r() - 0.5) * radius; for (let j = 0; j < 7; j++) { pts.push(new THREE.Vector3(x, 0.004 + r() * 0.008, z)); x += (r() - 0.5) * radius * 0.7; z += (r() - 0.5) * radius * 0.7; x = Math.max(-radius, Math.min(radius, x)); z = Math.max(-radius, Math.min(radius, z)); } g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, /bihon|misua|sotanghon/.test(s2) ? 0.0016 : 0.003, 5), m)); }
      return g;
    }
    const m = std({ color: /glutinous|malagkit/.test(s2) ? 0xfbf9f2 : /brown|red/.test(s2) ? 0xc9a47a : 0xf7f5ee, roughness: 0.5 });
    const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0028, 6, 4), m, 260);
    for (let k = 0; k < 260; k++) { const a = r() * 6.3, d = Math.sqrt(r()) * radius; dummy.position.set(Math.cos(a) * d, 0.003 + r() * 0.012 * (1 - d / radius), Math.sin(a) * d); dummy.scale.set(1.8, 1, 1); dummy.rotation.set(0, r() * 6, 0); dummy.updateMatrix(); inst.setMatrixAt(k, dummy.matrix); }
    inst.castShadow = true; g.add(inst); return g;
  }

  const fit = (obj, maxR) => {
    const box = new THREE.Box3().setFromObject(obj); const s = box.getSize(V(0, 0, 0));
    const k = Math.min(1, (maxR * 2) / Math.max(0.001, Math.max(s.x, s.z)));
    obj.scale.multiplyScalar(k); return obj;
  };
  /** The model for an ingredient where it is, coloured by any sauce it stewed or marinated in. */
  const modelFor = (it, st, radius, seedExtra, where) => {
    const at = where || st.loc.get(it);
    // A poured ingredient is only ever its bottle or jar on the counter, never inside the food.
    if (cookIsPoured(it) && at && at !== "prep") return new THREE.Group();
    const m = modelForRaw(it, st, radius, seedExtra, where);
    // Cooked through: every part turns the cooked colour (a texture keeps its pattern, its colour shifts).
    const done = st.done && st.done.get(it), cookedHex = CK_COOKED[cookFoodKind(it)];
    if (done && cookedHex && at !== "prep") {
      const c = col(cookedHex), raw = col((CK_LOOK[cookFoodKind(it)] || CK_LOOK.misc)[1]);
      const ratio = new THREE.Color(Math.min(1.4, c.r / Math.max(0.05, raw.r)), Math.min(1.4, c.g / Math.max(0.05, raw.g)), Math.min(1.4, c.b / Math.max(0.05, raw.b)));
      m.traverse((o) => {
        if (!o.material) return;
        for (const mm of Array.isArray(o.material) ? o.material : [o.material]) {
          const target = mm.map || o.isInstancedMesh ? mm.color.clone().multiply(ratio) : c;
          mm.color.lerp(target, done);
          if (mm.userData && mm.userData.base) mm.userData.base = mm.userData.base.clone().lerp(mm.map ? mm.userData.base.clone().multiply(ratio) : c, done);
        }
      });
    }
    const tint = st.tint && st.tint.get(it);
    if (tint && at !== "prep") {
      const c = col(tint[0]);
      m.traverse((o) => {
        if (!o.material) return;
        for (const mm of Array.isArray(o.material) ? o.material : [o.material]) {
          mm.color.lerp(c, tint[1]);
          if (mm.userData) { mm.userData.base = mm.userData.base ? mm.userData.base.clone().lerp(c, tint[1]) : mm.userData.base; }
          mm.roughness = Math.max(0.2, mm.roughness - 0.15 * tint[1]); // glossy with sauce
        }
        if (o.isInstancedMesh && o.instanceColor) o.instanceColor.needsUpdate = true;
      });
    }
    return m;
  };
  const modelForRaw = (it, st, radius, seedExtra, where) => {
    const kind = cookFoodKind(it), b = st.brown.get(it) || 0;
    const at = where || st.loc.get(it);
    // Eggs leave their shell: cracked into a pan, beaten into a mixture. Boiled, fried or salted eggs stay as they are.
    if (kind === "egg" && ["bowl", "pot", "plate"].includes(at) && !/boiled|fried|salted|quail|nilaga|pula/i.test(`${it.key} ${it.label}`) && !st.cut.has(it)) {
      const othersInBowl = st.items.some((x) => x !== it && st.loc.get(x) === at && !x.liquid);
      return safely("egg", it, () => crackedEgg(it, at !== "bowl" && (st.heat || b > 0), at === "bowl" || othersInBowl, (String(it.text || "").match(/\b([1-9])\b/) || [])[1] | 0));
    }
    // Rice and noodles: loose grains or strands, not a cup.
    if (kind === "grain" && ["pot", "plate", "bowl", "rack"].includes(at)) return safely("grain", it, () => looseGrain(it, radius));
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
    // A whole fish fills the pan and the plate; it isn't a sardine.
    return fit(wholeModel(it, b), radius * (kind === "fish" && ["pot", "plate", "rack"].includes(at) && !/tuyo|dilis|anchov|sardine|daing|tinapa/i.test(it.key) ? 2.2 : 1.15));
  };

  // ── Per-step objects ──
  let dyn = new THREE.Group(); scene.add(dyn);
  let doughInfo = null, applianceNow = "kawali", brownMax = 1, heatOn = false, movers = [], cur = null, curIndex = 0, potItems = [], spoonMode = null, pourInfo = null, cutInfo = null, wrapInfo = null, brownList = [], camGoal = null;
  const camPos = V(0, 2.4, 1.5), camLook = V(0, 0, -0.2);
  let firstFrame = true;

  const clearDyn = () => {
    dyn.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
    scene.remove(dyn); dyn = new THREE.Group(); scene.add(dyn);
  };
  const vesselGroup = (v) => (v === "kaldero" ? kaldero : kawali);
  const contentY = (st) => {
    if (APPLIANCE[st.vessel]) return APPLIANCE[st.vessel].y;
    if (st.vessel === "kaldero") return VESSEL_Y + 0.008 + Math.max(st.level * 0.15, 0.004);
    return WOK_Y + 0.012 + Math.max(st.oil, st.level) * 0.06;
  };
  const vesselR = (st) => (APPLIANCE[st.vessel] ? APPLIANCE[st.vessel].r * 2 : st.vessel === "kaldero" ? 0.13 : 0.15);
  const spotOf = (st, it, which) => {
    const where = which || st.loc.get(it);
    const i = st.items.indexOf(it);
    if (where === "prep") { const [x, z] = ckPrepSpot(i < 0 ? 0 : i); return V(x, 0, z); }
    if (where === "board") return V(CK_AT.board[0] - 0.05 + ((i % 3) - 1) * 0.12, BOARD_Y, CK_AT.board[1] - 0.04 + ((i % 2) * 0.08));
    if (where === "bowl") {
      // A mixture: the meat makes the base, everything else sits mixed in on top of it.
      const meaty = (x) => ["mince", "pork", "beef", "chicken", "fish", "shrimp"].includes(cookFoodKind(x));
      const base = st.items.some((x) => x !== it && st.loc.get(x) === "bowl" && meaty(x)) && !meaty(it);
      const r2 = ckRand(i + 5), a = r2() * 6.3, d = base ? 0.015 + r2() * 0.025 : 0;
      return V(CK_AT.bowl[0] + Math.cos(a) * d, 0.012 + (base ? 0.024 : 0), CK_AT.bowl[1] + Math.sin(a) * d);
    }
    const onTop = st.top && st.top.has(it) ? 0.022 : 0; // toppings sit above the rest
    if (where === "pot") {
      const r = ckRand(i + 3); const a = r() * 6.3, d = r() * vesselR(st) * (onTop ? 0.2 : 0.45);
      // In a stew or soup the pieces sit down in the liquid (only their tops show); in oil or a dry pan, on the bottom.
      const sunk = !onTop && !APPLIANCE[st.vessel] && st.level > 0.2 && !cookIsPoured(it) ? (st.vessel === "kaldero" ? 0.018 : 0.01) : 0;
      return V(CK_AT.stove[0] + Math.cos(a) * d, contentY(st) - 0.006 - sunk + onTop, CK_AT.stove[1] + Math.sin(a) * d);
    }
    if (where === "rack") return V(CK_AT.rack[0] + ((i % 3) - 1) * 0.04, 0.014, CK_AT.rack[1]);
    if (where === "plate") { const r = ckRand(i + 9); const a = r() * 6.3, d = r() * (onTop ? 0.02 : 0.05); return V(CK_AT.plate[0] + Math.cos(a) * d, (st.served === "bowl" ? 0.042 : 0.01) + onTop, CK_AT.plate[1] + Math.sin(a) * d); }
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
    const v = after.vessel || st.vessel || "kawali";
    const appl = !!APPLIANCE[v];
    kaldero.visible = v === "kaldero"; kawali.visible = !appl && v !== "kaldero";
    ovenG.visible = v === "oven"; grillG.visible = v === "ihawan"; steamerG.visible = v === "steamer";
    // The oven and the grill stand where the stove is; the steamer sits on the burner.
    const onStove = v !== "oven" && v !== "ihawan";
    stoveTop.visible = burner.visible = grate.visible = onStove;
    applianceNow = v;
    // Mixed or wrapped filling that goes into the steamer is shown as steamed dumplings.
    const steamedFilling = v === "steamer" && !steps.slice(0, index + 1).some((x) => x.kind === "wrap") && steps.slice(0, index).some((x) => x.kind === "mix") && ["steam", "serve", "drain"].includes(step.kind);
    dumplings.visible = steamedFilling && !after.custard;
    flanTin.visible = v === "steamer" && !!after.custard && ["steam", "drain"].includes(step.kind);
    flanPlate.visible = step.kind === "serve" && !!after.custard;
    if (flanPlate.visible) { flanPlate.position.set(CK_AT.plate[0], 0, CK_AT.plate[1]); }
    if (!st.vessel || st.vessel !== v) { st.vessel = v; }
    if (!after.vessel) after.vessel = v;
    soupBowl.visible = step.kind === "serve" && after.served === "bowl"; plate.visible = !soupBowl.visible;
    const bl = st.bowlLiquid || after.bowlLiquid;
    bowlLiquid.visible = !!bl; if (bl) bowlLiquidMat.color.copy(col(bl));
    bowlLiquid.userData.grow = !st.bowlLiquid && !!after.bowlLiquid;

    // Bottles and ramekins that pour this step (handled below, not drawn twice).
    const pourers = step.items.filter((it) => (cookIsPoured(it) && ["pour", "add", "saute", "season", "boil", "simmer", "top", "mix", "marinate"].includes(step.kind)) || (cookFoodKind(it) === "powder" && step.kind === "season"));
    if (step.kind === "heat") { const oil = st.items.find((it) => it.fryOil); if (oil) pourers.push(oil); }
    if (step.kind === "deepfry") { const oil = st.items.find((it) => it.fryOil); if (oil && st.oil < 0.5) pourers.push(oil); }
    const pourer = pourers[0];
    if (step.kind === "cut") for (const it of step.items.slice(1)) st.cut.set(it, (step.cuts && step.cuts[it.key]) || step.style);
    const moving = new Set();
    const movesNow = (it) => st.loc.get(it) !== after.loc.get(it) && after.loc.get(it) !== "used" && after.loc.get(it) !== "wrapped";
    if (step.kind === "shop") step.items.forEach((it) => moving.add(it));
    for (const it of after.items) if (movesNow(it)) moving.add(it);
    if (step.kind === "peel") step.items.forEach((it) => moving.add(it));
    if (step.kind === "cut" && step.items[0]) moving.add(step.items[0]);

    // Everything that stays put this step.
    for (const it of st.items) {
      const where = st.loc.get(it);
      if (moving.has(it) || it === pourer || where === "used" || where === "wrapped") continue;
      if (st.loc.get(it) !== "prep" && cookIsPoured(it)) continue; // the bottle stays on the counter, never in the food
      if (dumplings.visible && where === "pot") continue; // shown as the dumplings
      const o = place(st, it, where);
      if (where === "pot") potItems.push(o);
      // Liquids stay on the prep row as bottles even after pouring.
    }
    for (const it of st.items) if (cookIsPoured(it) && st.loc.get(it) !== "prep" && !moving.has(it) && it !== pourer) place(st, it, "prep");
    // Empty ramekins left on the prep row after cut pieces moved on.
    for (const it of st.items) if (st.cut.has(it) && st.loc.get(it) !== "prep" && cookFoodKind(it) !== "bottle") { const r = ramekin(0.065, 0.04); r.position.copy(spotOf(st, it, "prep")); dyn.add(r); }
    if (st.rolled && !st.items.some((it) => it.key === "rolled")) { const pseudo = { key: "rolled", label: "lumpia", wrapStyle: "roll" }; st.items.push(pseudo); st.loc.set(pseudo, "board"); }
    doughInfo = null;
    if (!st.rolled || ["dough", "rise", "shape", "rollout", "fill"].includes(step.kind)) cookDoughScene(st, step, steps, index, after);
    if (!step.items.some((it) => it.key === "rolled")) for (const it of st.items) if (it.key === "rolled" && st.loc.get(it) === "board" && !moving.has(it)) place(st, it, "board");

    // Movers: from where they are to where this step puts them.
    let k = 0;
    const len = cookStepLength(step);
    for (const it of moving) {
      if (dumplings.visible && after.loc.get(it) === "pot") continue;
      const from = step.kind === "shop" ? "prep" : st.loc.get(it) || "board";
      let to = after.loc.get(it) || from;
      if (step.kind === "cut" || step.kind === "peel") to = "board";
      const obj = from === "prep" && step.kind !== "shop" && !(step.kind === "cut") ? modelFor(it, st, from === "prep" ? 0.05 : radiusAt(to), 0, to) : (step.kind === "cut" ? fit(wholeModel(it, st.brown.get(it) || 0), 0.085) : modelFor(it, st, step.kind === "shop" ? 0.075 : radiusAt(to), 0, step.kind === "shop" ? "prep" : to));
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
      const pile = piecesModel(it, (step.cuts && step.cuts[it.key]) || (step.style === "mixed" ? "diced" : step.style), 0.06, st.brown.get(it) || 0, 1); pile.position.set(CK_AT.board[0] + 0.07, BOARD_Y, CK_AT.board[1]); pile.userData.inst.count = 0; dyn.add(pile);
      cutInfo = { whole: m && m.obj, pile, n: pile.userData.n };
      if (m) { m.t0 = 0.1; m.t1 = 0.7; }
    }
    if (step.kind === "wrap" && step.style && step.style !== "roll") {
      const B = CK_AT.board, by = BOARD_Y, fc = st.fillColor || "#a8714a";
      const made = fit(wholeModel(step.made || { key: "rolled", label: "", wrapStyle: step.style }, 0), 0.09);
      made.position.set(B[0] + 0.15, by, B[1] - 0.02); made.userData.s0 = made.scale.x; made.scale.setScalar(0.001); dyn.add(made);
      const mat = step.style === "leaf" ? leafMat() : step.dough || st.dough ? doughMat() : wrapperMat();
      const info = { style: step.style, made };
      if (step.style === "halfmoon" || step.style === "parcel") {
        // Two halves: the far one carries the filling, the near one folds over it on a hinge.
        const half = (start) => step.style === "parcel" ? new THREE.PlaneGeometry(0.11, 0.055) : new THREE.CircleGeometry(0.06, 32, start, Math.PI);
        const a = new THREE.Mesh(half(0), mat); a.rotation.x = -Math.PI / 2; a.position.set(B[0], by + 0.003, B[1] - (step.style === "parcel" ? 0.0275 : 0)); dyn.add(a);
        const hinge = new THREE.Group(); hinge.position.set(B[0], by + 0.003, B[1]); dyn.add(hinge);
        const b2 = new THREE.Mesh(half(Math.PI), mat); b2.rotation.x = -Math.PI / 2; if (step.style === "parcel") b2.position.z = 0.0275; hinge.add(b2);
        const mound = ellipsoid(0.022, 1.4, 0.5, 0.8, fillMat(fc), 16); mound.position.set(B[0], by + 0.004, B[1] - 0.025); dyn.add(mound);
        Object.assign(info, { hinge, parts: [a, mound] });
        if (step.fork) { const fork = new THREE.Group(); for (let j = -1.5; j <= 1.5; j++) { const tine = mesh(new THREE.BoxGeometry(0.002, 0.002, 0.03), steel); tine.position.x = j * 0.005; fork.add(tine); } const hdl = mesh(new THREE.BoxGeometry(0.008, 0.003, 0.09), steel); hdl.position.z = 0.06; fork.add(hdl); fork.position.set(B[0], by + 0.03, B[1] + 0.08); dyn.add(fork); info.fork = fork; }
      } else if (step.style === "pleat" || step.style === "bun") {
        const sheet = step.style === "bun" ? mesh(organic(new THREE.CylinderGeometry(0.06, 0.06, 0.004, 40), 0, 0.03, 5), mat) : new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), mat);
        if (step.style !== "bun") { sheet.rotation.x = -Math.PI / 2; sheet.rotation.z = Math.PI / 4; }
        sheet.position.set(B[0], by + 0.002, B[1]); dyn.add(sheet);
        const mound = ellipsoid(0.02, 1, 0.7, 1, fillMat(fc), 16); mound.position.set(B[0], by + 0.003, B[1]); dyn.add(mound);
        const wall = step.style === "bun" ? ellipsoid(0.036, 1, 0.8, 1, std({ color: 0xfbf7ef, roughness: 0.6 }), 24) : mesh(organic(new THREE.CylinderGeometry(0.018, 0.022, 0.028, 16, 2, true), 0, 0.15, 3), std({ color: 0xf2d77a, roughness: 0.45, side: THREE.DoubleSide }));
        wall.position.set(B[0], by + (step.style === "bun" ? 0 : 0.014), B[1]); wall.scale.y = 0.001; dyn.add(wall);
        Object.assign(info, { sheet, mound, wall });
      } else if (step.style === "leaf") {
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.11), mat); sheet.rotation.x = -Math.PI / 2; sheet.position.set(B[0], by + 0.002, B[1]); dyn.add(sheet);
        const log = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.09, 12), fillMat(fc)); log.rotation.z = Math.PI / 2; log.position.set(B[0], by + 0.009, B[1] + 0.03); dyn.add(log);
        Object.assign(info, { sheet, log });
      }
      wrapInfo = info;
    } else if (step.kind === "wrap") {
      // A square wrapper turned like a diamond, a line of filling near the bottom corner, then it rolls up.
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13), foodMat("wrapper", "skin", 0, { map: tex("wrapper-sheet", 256, (gg, n, rr) => { gg.fillStyle = "#f3e6c4"; gg.fillRect(0, 0, n, n); for (let k = 0; k < 600; k++) { gg.globalAlpha = 0.1; gg.fillStyle = rr() < 0.5 ? "#fff" : "#d8c08c"; gg.fillRect(rr() * n, rr() * n, 2, 2); } gg.globalAlpha = 1; gg.strokeStyle = "#c9a96a"; gg.lineWidth = 6; gg.strokeRect(3, 3, n - 6, n - 6); }), roughness: 0.8, side: THREE.DoubleSide })); sheet.rotation.x = -Math.PI / 2; sheet.rotation.z = Math.PI / 4; sheet.position.set(CK_AT.board[0], BOARD_Y + 0.0015, CK_AT.board[1]); dyn.add(sheet);
      const log = new THREE.Mesh(organic(new THREE.CylinderGeometry(0.006, 0.006, 0.075, 12, 4), 0, 0.12, 3), st.fillColor ? fillMat(st.fillColor) : foodMat("mince", "skin", 0, { map: skinTex("mince") })); log.rotation.z = Math.PI / 2; log.position.set(CK_AT.board[0], BOARD_Y + 0.006, CK_AT.board[1] + 0.035); dyn.add(log);
      const rolls = wholeModel(step.made || { key: "rolled", label: "lumpia" }, 0); rolls.position.set(CK_AT.board[0] + 0.17, BOARD_Y, CK_AT.board[1] - 0.02); rolls.scale.setScalar(0.001); dyn.add(rolls);
      wrapInfo = { sheet, log, rolls };
    }
    if (["fry", "deepfry", "saute", "bake", "grill"].includes(step.kind) || cookBurn(step)) {
      for (const it of after.items) if (after.loc.get(it) === "pot" || after.loc.get(it) === "rack") brownList.push([it, st.brown.get(it) || 0, after.brown.get(it) || 0]);
    }
    const toBowl = movers.length > 0 && movers.every((m) => after.loc.get(m.it) === "bowl");
    spoonMode = toBowl || ["mix", "marinate"].includes(step.kind) ? "bowl" : ["saute", "stir", "add", "simmer", "cook"].includes(step.kind) ? "pot" : null;
    brownMax = cookBurn(step) === 2 ? 1.75 : cookBurn(step) === 1 ? 1.2 : step.kind === "saute" ? 0.35 : step.kind === "fry" ? 0.8 : step.kind === "bake" ? 0.7 : step.kind === "grill" ? 0.85 : 1;
    heatOn = after.heat;

    // Liquid level and colour, before and after.
    const lc0 = st.oil > st.level ? "#c98a1c" : cookMixColor(st.parts), lc1 = after.oil > after.level ? "#c98a1c" : cookMixColor(after.parts);
    liquid.userData = { from: Math.max(st.level, st.oil), to: Math.max(after.level, after.oil), c0: col(lc0), c1: col(lc1), oil: after.oil > after.level, st, after };
    if (step.kind === "serve" && after.served === "bowl") { soupMat.color.copy(col(st.parts.length ? cookMixColor(st.parts) : "#f5efe0")); const l = soupMat.color.r * 0.3 + soupMat.color.g * 0.59 + soupMat.color.b * 0.11; soupMat.opacity = Math.max(0.4, Math.min(0.93, 0.3 + (1 - l) * 1.1)); }

    // Camera.
    const at = (xz, d) => ({ x: xz[0], z: xz[1], d });
    camGoal = step.kind === "shop" ? at([0, -0.42], 2.5)
      : ["wrap", "fill", "rollout", "shape", "coat", "brush"].includes(step.kind) || (step.kind === "dough" && step.knead) ? at([CK_AT.board[0] + 0.05, CK_AT.board[1] + 0.01], 0.62)
      : ["dough", "rise"].includes(step.kind) ? at([CK_AT.bowl[0] + 0.1, CK_AT.bowl[1]], 0.75)
      : ["cut", "peel"].includes(step.kind) ? at(CK_AT.board, 0.8)
      : ["mix", "marinate", "chill"].includes(step.kind) || toBowl ? at([CK_AT.bowl[0] + 0.2, CK_AT.bowl[1] - 0.05], 1.05)
      : step.kind === "serve" || (step.kind === "top" && movers.length && movers.every((m) => after.loc.get(m.it) === "plate")) ? at(CK_AT.plate, 0.65)
      : step.kind === "season" && pourInfo && pourInfo.rubbing ? at([CK_AT.rack[0], CK_AT.rack[1]], 0.75)
      : step.kind === "drain" ? at([(CK_AT.stove[0] + CK_AT.rack[0]) / 2, CK_AT.stove[1]], 1.15)
      : ["add", "pour", "saute", "season", "heat", "deepfry"].includes(step.kind) && movers.length + (pourInfo ? 1 : 0) > 0 ? at([CK_AT.stove[0] - 0.15, CK_AT.stove[1] - 0.12], 1.35)
      : applianceNow === "oven" ? { x: SX, z: SZ, d: 1.0, front: true }
      : at(CK_AT.stove, 0.9);
    if (firstFrame) { const p = camFor(camGoal); camPos.copy(p.pos); camLook.copy(p.look); firstFrame = false; }

    cookHud("cook-hud", null);
    cookHud("cook-timer", null);
    if (step.kind === "serve" && cost) cookHud("cook-hud", `₱${Math.round(cost)} ${cookLang() === "en" ? "per serving" : "bawat serving"}`);
  }

  let aspect = 16 / 9;
  function camFor(g) {
    const d = g.d * (aspect < 1.25 ? 1.45 : aspect < 1.6 ? 1.15 : 1);
    if (g.front) return { pos: V(g.x + 0.05, 0.16 + d * 0.32, g.z + d * 0.92), look: V(g.x + 0.03, 0.13, g.z) };
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
    if (wrapInfo && wrapInfo.style) {
      const u = Math.max(0, Math.min(1, (t - 0.5) / (len - 1.6))), W = wrapInfo, grow = ease((t - len * 0.72) / (len * 0.22));
      if (W.hinge) {
        W.hinge.rotation.x = -Math.PI * Math.min(1, u * 1.25);
        if (W.fork) { const f = Math.max(0, (u - 0.8) / 0.2); W.fork.visible = f > 0; W.fork.position.y = BOARD_Y + 0.02 + Math.abs(Math.sin(t * 14)) * 0.012; W.fork.position.x = CK_AT.board[0] - 0.05 + f * 0.1; W.fork.position.z = CK_AT.board[1] - 0.045 * Math.cos(f * Math.PI); }
        const hide = grow > 0.05; W.hinge.visible = !hide; W.parts.forEach((p) => { p.visible = !hide; });
      }
      if (W.wall) { W.wall.scale.y = Math.max(0.001, u); W.sheet.scale.setScalar(Math.max(0.2, 1 - u * 0.8)); W.mound.visible = W.style !== "bun" || u < 0.8; const hide = grow > 0.05; W.wall.visible = W.sheet.visible = !hide; W.mound.visible = W.mound.visible && !hide; }
      if (W.log) { W.sheet.scale.set(1, Math.max(0.15, 1 - u * 0.85), 1); W.sheet.position.z = CK_AT.board[1] - u * 0.03; W.log.position.z = CK_AT.board[1] + 0.03 - u * 0.055; W.log.scale.set(1, 1 + u * 0.4, 1 + u * 0.4); W.sheet.visible = W.log.visible = grow < 0.05; }
      W.made.scale.setScalar(Math.max(0.001, grow * W.made.userData.s0));
    } else if (wrapInfo) {
      const u = Math.max(0, Math.min(1, (t - 0.6) / (len - 1.4)));
      // The bottom corner folds over the filling and the roll travels up the diamond, getting thicker.
      wrapInfo.sheet.scale.set(1 - u * 0.55, 1 - u * 0.75, 1); wrapInfo.sheet.position.z = CK_AT.board[1] - u * 0.02;
      wrapInfo.log.position.z = CK_AT.board[1] + 0.035 - u * 0.05; wrapInfo.log.scale.set(1 + u * 0.45, 1 + u * 0.3, 1 + u * 0.45); wrapInfo.log.rotation.x = -u * 6;
      if (wrapInfo.log.material.color && u > 0.3) wrapInfo.log.material.color.lerp(col("#efdcae"), 0.06);
      wrapInfo.sheet.visible = wrapInfo.log.visible = u < 0.98;
      wrapInfo.rolls.scale.setScalar(Math.max(0.001, ease((t - len * 0.6) / (len * 0.3))));
    }
    // Dough: mixing, kneading, rising, shaping, rolling out, filling.
    pinRest();
    if (doughInfo) {
      const D = doughInfo, u = Math.max(0, Math.min(1, (t - 0.5) / (len - 1)));
      if (D.kind === "mixdough") D.d.scale.setScalar(Math.max(0.001, ease(u)));
      if (D.kind === "knead") { const sq = Math.abs(Math.sin(t * 5)); D.d.scale.set(1 + sq * 0.3, 1 - sq * 0.35, 1 + sq * 0.15); D.d.rotation.y = t * 0.8; }
      if (D.kind === "rise") D.d.scale.setScalar(1 + 0.55 * ease(u));
      if (D.kind === "shape") { D.big.scale.setScalar(Math.max(0.001, 1 - u)); D.smalls.forEach((b2, j) => b2.scale.setScalar(Math.max(0.001, ease((u - j * 0.2) / 0.25)))); }
      if (D.kind === "rollout") {
        D.lump.scale.set(1 + u * 0.8, Math.max(0.12, 1 - u), 1 + u * 0.8); D.lump.visible = u < 0.85;
        D.disc.scale.set(0.3 + 0.7 * u, 1, 0.3 + 0.7 * u); D.disc.visible = u > 0.2;
        rollingPin.position.set(CK_AT.board[0], BOARD_Y + 0.016 + 0.004 * (1 - u), CK_AT.board[1] + Math.sin(t * 4) * 0.045); rollingPin.rotation.set(Math.sin(t * 4) * 1.5, 0, 0);
      }
      if (D.kind === "fill") D.mound.scale.copy(D.mound.userData.s0).multiplyScalar(Math.max(0.001, ease(u)));
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
    if (lvl > 0.005 && !APPLIANCE[st.vessel] && !(step.kind === "serve" && t > len * 0.5 && st.served === "bowl")) {
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
    const onStove = applianceNow !== "oven" && applianceNow !== "ihawan";
    const fh = { low: 0.5, med: 1, high: 1.8 }[step.heat] || 1;
    flames.forEach((f, i) => { f.visible = heated && onStove; f.scale.set(fh > 1 ? 1.3 : 1, (0.8 + Math.sin(time * 30 + i) * 0.25) * fh, fh > 1 ? 1.3 : 1); });
    flameMat.color.copy(col(fh > 1 ? 0x5a8cff : fh < 1 ? 0x3a6cff : 0x4a8dff));
    const baking = applianceNow === "oven" && heated, grilling = applianceNow === "ihawan" && heated;
    rodMat.emissiveIntensity = baking ? 1.6 + Math.sin(time * 3) * 0.2 : 0.1;
    ovenLight.intensity = baking ? 1.4 : 0;
    coalMat.emissiveIntensity = grilling ? 0.55 + Math.sin(time * 5) * 0.15 : 0.12;
    grillLight.intensity = grilling ? 1.2 + Math.sin(time * 7) * 0.2 : 0;
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
    // Smoke: grilling and baking smoke; a burnt step pours out black smoke.
    const burnLevel = cookBurn(step) && t > len * 0.35 ? cookBurn(step) : 0;
    const smoky = burnLevel === 2 ? 1.4 : grilling ? 1.1 : baking ? 0.7 : burnLevel === 1 ? 0.6 : 0;
    const steamy = smoky || (["boil", "simmer", "cook", "steam"].includes(step.kind) ? 1 : 0) || (step.kind === "serve" && !step.cold ? 0.7 : 0) || (liquid.visible && heated && !L.oil ? 0.35 : 0) || (frying && heated ? 0.3 : 0);
    puffs.forEach((p, i) => {
      const s = p.userData.seed, cycle = (time * 0.32 + s) % 1;
      const base = step.kind === "serve" ? V(CK_AT.plate[0], 0.04, CK_AT.plate[1]) : V(CK_AT.stove[0], liquid.visible ? liquid.position.y : VESSEL_Y, CK_AT.stove[1]);
      // Smoke stays low and thick around the pan so it reads from the camera above; steam rises higher and fainter.
      const spread = smoky ? 0.34 : 0.18, rise = smoky ? 0.38 : 0.45;
      const by = baking && applianceNow === "oven" ? 0.3 : base.y;
      p.position.set(base.x + (s - 0.5) * spread + Math.sin(time * 0.7 + i) * 0.04, by + cycle * rise, base.z + ((i * 0.37) % 1 - 0.5) * (smoky ? 0.22 : 0.14));
      p.scale.setScalar((smoky ? 0.12 : 0.05) + cycle * (smoky ? 0.26 : 0.16));
      p.material.color.copy(col(burnLevel === 2 ? "#2a2522" : smoky ? (grilling ? "#9b958f" : "#b8b2ab") : "#ffffff"));
      p.material.opacity = Math.min(0.9, steamy * (1 - cycle * 0.8) * (smoky ? 0.6 : 0.32));
    });

    // Time-lapse clock for long steps.
    if (step.minutes) { const f = Math.max(0, Math.min(1, (t - 0.5) / (len - 1))); cookHud("cook-timer", `⏱ ${cookTimeText(Math.max(1, Math.round(step.minutes * f)), cookLang())}`); }
    const hudEl = document.getElementById("cook-hud");
    if (burnLevel) { cookHud("cook-hud", burnLevel === 2 ? (cookLang() === "en" ? "🔥 Burnt! Far too long on the fire" : "🔥 Nasunog! Sobrang tagal sa apoy") : (cookLang() === "en" ? "⚠ Overcooked" : "⚠ Sobra sa luto")); if (hudEl) hudEl.classList.toggle("cook-hud-burn", true); }
    else if (hudEl && hudEl.classList.contains("cook-hud-burn")) { hudEl.classList.remove("cook-hud-burn"); cookHud("cook-hud", null); }

    renderer.render(scene, camera);
  }

  function resize() {
    if (!canvas.parentElement) return;
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
    enter, update, thumbs, errors: sceneErrors,
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
