/*
 * SarapSulit ingredient matcher — shared by index.html (live site) and
 * match-review.html (audit tool) so the two never drift.
 *
 * Matching strategy: tokenize an ingredient name, look candidates up via an
 * inverted token index, then rank by an F1 score (precision × recall) so that
 * focused, fully-covered names win over loose single-word overlaps. Each match
 * carries a `confidence` in [0,1]; callers gate on a minimum confidence and can
 * surface it in the UI.
 */
(function (global) {
  "use strict";

  // ───────── Quantity parsing (free-text amount → grams) ─────────
  const UNIT_GRAMS = {
    g: 1, gram: 1, grams: 1, gr: 1, mg: 0.001,
    kg: 1000, kilo: 1000, kilogram: 1000,
    lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6,
    oz: 28.35, ounce: 28.35, ounces: 28.35,
    ml: 1, milliliter: 1, l: 1000, liter: 1000, litre: 1000,
    cup: 240, cups: 240, tbsp: 15, tablespoon: 15, tablespoons: 15,
    tsp: 5, teaspoon: 5, teaspoons: 5,
    clove: 5, cloves: 5, piece: 50, pieces: 50, pc: 50, pcs: 50, pced: 50,
    slice: 20, slices: 20, bunch: 200, bundle: 200, can: 400, pack: 200, sachet: 8,
    pinch: 0.5, dash: 0.5, head: 500, stalk: 15,
  };

  const ANIMAL_WORDS = ["chicken", "pork", "beef", "fish", "shrimp", "prawn", "squid", "bangus", "tilapia",
    "galunggong", "tuna", "crab", "clam", "mussel", "oyster", "egg", "liver", "meat", "bacon", "ham", "sausage",
    "milkfish", "anchovy", "sardine", "fish sauce", "patis", "bagoong", "gata"];

  function parseQuantity(amount, unit) {
    if (!amount) return null;
    let a = String(amount).trim().toLowerCase().replace(/[()]/g, " ");
    a = a.split(/\s*(?:-|to|–)\s*/)[0].trim();
    let value = 0;
    const mixed = a.match(/^(\d+)\s+(\d+)\/(\d+)/);
    const frac = a.match(/^(\d+)\/(\d+)/);
    const dec = a.match(/^(\d+(?:\.\d+)?)/);
    if (mixed) value = parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
    else if (frac) value = parseInt(frac[1]) / parseInt(frac[2]);
    else if (dec) value = parseFloat(dec[1]);
    else return null;
    const u = String(unit || "").trim().toLowerCase().replace(/[^a-z]/g, "");
    const perUnit = UNIT_GRAMS[u];
    if (perUnit) return value * perUnit;
    return value * 60;
  }

  // ───────── Tokenization ─────────
  const STOPWORDS = new Set(["and", "or", "the", "of", "a", "with", "fresh", "dried", "ground", "raw", "cooked",
    "chopped", "sliced", "minced", "large", "small", "medium", "whole", "to", "taste", "for", "cup", "cups", "tbsp",
    "tsp", "ml", "piece", "pieces", "cut", "into", "serving", "red", "green", "white", "local", "imported",
    "boneless", "skinless", "peeled", "thinly", "finely", "about", "approximately", "optional", "your", "all",
    "purpose", "extra", "lean", "ripe", "young", "old", "big", "thick", "thin", "long", "short",
    // color/descriptor words that cause false positives (e.g. "yellow"→cassava, "black"→pomfret, "hard"→candy)
    "yellow", "black", "dark", "light", "hard", "toasted", "roasted", "crushed", "sweet", "frozen", "dry",
    // size/form modifiers that trigger wrong DB entries (e.g. "head garlic"→"Beef head", "baby bok choy"→cheseballs)
    "head", "baby", "bunch", "bunches",
    // "sea" causes "fine sea salt"→"Sea bass"; "eye" causes "bird's eye chili"→"Scad, big-eye"
    "sea", "eye",
    // "leaf"/"leaves" causes "dried bay leaves"→"Malunggay leaves powder"
    "leaves", "leaf"]);

  function tokenize(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      // stem length > 3 (not > 4) so short plurals like "eggs"→"egg", "peas"→"pea" are normalized
      .map((w) => (w.length > 3 && w.endsWith("es")) ? w.slice(0, -2)
        : (w.length > 3 && w.endsWith("s")) ? w.slice(0, -1) : w);
  }

  // ───────── Filipino/English aliases ─────────
  const COMMODITY_ALIASES = [
    ["garlic", ["bawang"]],
    ["onion", ["sibuyas"]],
    ["spring onion", ["scallion", "leek"]],
    // bidirectional: scallion/green onion → spring onion
    ["scallion", ["spring onion", "green onion"]],
    ["shrimp", ["hipon"]],
    ["prawn", ["hipon", "shrimp"]],
    ["mussel", ["tahong"]],
    ["clam", ["halaan"]],
    ["crab", ["alimango", "alimasag"]],
    ["squid", ["pusit"]],
    ["milkfish", ["bangus"]],
    ["bangus", ["milkfish"]],
    ["pork belly", ["liempo"]],
    ["pork", ["baboy"]],
    ["chicken", ["manok"]],
    ["beef", ["baka"]],
    ["ginger", ["luya"]],
    ["tomato", ["kamatis"]],
    ["cabbage", ["repolyo"]],
    ["eggplant", ["talong"]],
    ["talong", ["eggplant"]],
    ["calamansi", ["lemon", "calamondin"]],
    // kangkong = water spinach ("water" removed — it was matching "Coconut water"; "kangkong" token alone matches FNRI)
    ["kangkong", ["spinach"]],
    ["malunggay", ["moringa"]],
    ["bitter melon", ["ampalaya"]],
    ["ampalaya", ["bitter", "melon"]],
    ["sayote", ["chayote"]],
    ["chayote", ["sayote"]],
    ["sitaw", ["string", "bean"]],
    ["pechay", ["bok", "choy"]],
    ["bok choy", ["pechay"]],
    ["taro", ["gabi"]],
    ["gabi", ["taro"]],
    ["vinegar", ["suka"]],
    ["soy sauce", ["toyo"]],
    ["fish sauce", ["patis"]],
    ["patis", ["fish sauce"]],
    ["shrimp paste", ["bagoong"]],
    ["bagoong", ["shrimp paste"]],
    ["coconut milk", ["gata"]],
    ["coconut", ["niyog"]],
    // tofu / tokwa (bean curd)
    ["tofu", ["bean curd", "tokwa", "soybean"]],
    ["tokwa", ["tofu", "bean curd"]],
    // squash / kalabasa
    ["kalabasa", ["squash", "pumpkin"]],
    ["squash", ["kalabasa"]],
    // paprika / chili pepper family
    ["paprika", ["pepper", "chili"]],
    ["siling labuyo", ["chili", "pepper", "bird"]],
    ["birds eye chili", ["chili", "pepper", "siling labuyo"]],
    ["bird chili", ["chili", "pepper", "siling labuyo"]],
    ["thai chili", ["chili", "pepper"]],
    // Filipino spices / aromatics
    ["tinapa", ["milkfish", "smoked"]],
    ["galunggong", ["scad", "round scad"]],
    ["danggit", ["rabbitfish", "dried"]],
    ["tilapia", ["tilapia"]],
    // root vegetables
    ["singkamas", ["jicama", "turnip"]],
    ["kamote", ["sweet potato", "yam"]],
    ["ubi", ["purple yam"]],
    // legumes
    ["garbanzos", ["chickpea", "garbanzo"]],
    ["monggo", ["mung bean"]],
    ["mung bean", ["monggo"]],
    ["tausi", ["black bean"]],
    // noodles
    ["bihon", ["rice noodle"]],
    ["pancit bihon", ["rice noodle", "bihon"]],
    ["misua", ["wheat noodle"]],
    ["miswa", ["wheat noodle"]],
    ["lumpia wrapper", ["spring roll wrapper"]],
    ["wonton wrapper", ["wonton"]],
    // fish — aliases so common names match FNRI entries
    ["salmon", ["salmon fish"]],
    ["dilis", ["anchovy", "dried fish"]],
    ["tuyo", ["dried fish", "herring"]],
    ["tilapia", ["tilapia"]],
    // Filipino fermented / preserved
    ["bagoong isda", ["fish paste"]],
    ["bagoong monamon", ["fish paste"]],
    ["tahure", ["fermented tofu"]],
    // fruits
    ["kamias", ["bilimbi"]],
    ["dalandan", ["orange"]],
  ];

  // Flavorings / non-grocery items that should not count as a missing price match.
  const NON_PRICEABLE = ["water", "ice", "clove", "cloves", "leaf",
    "pepper", "msg", "bouillon", "stock", "broth", "food coloring", "annatto",
    "vetsin", "powder", "blossom", "puso", "flower", "peel", "zest", "rind",
    "bay", "laurel", "pandan", "lemongrass", "tanglad",
    // spices / flavorings with no retail price match needed
    "star anise", "anise", "vanilla extract",
    // cooking liquids / wine
    "sherry", "mirin", "sake", "rice wine",
    // herbs (dried)
    "oregano", "rosemary", "thyme", "sage", "basil leaves", "italian seasoning",
    // recipe noise — unit/packaging words parsed as ingredient names
    "cooking procedure", "marinade ingredients"];

  function aliasTokens(name) {
    const lc = String(name || "").toLowerCase();
    const extra = [];
    for (const [needle, words] of COMMODITY_ALIASES) {
      if (lc.includes(needle)) {
        for (const w of words) extra.push(...tokenize(w));
      }
    }
    return extra;
  }

  function isNonPriceable(name) {
    const lc = String(name || "").toLowerCase();
    return NON_PRICEABLE.some((w) => lc.includes(w));
  }

  // ───────── Indexing & ranking ─────────
  function buildIndex(items, nameKey) {
    const index = new Map();
    items.forEach((it, i) => {
      for (const t of new Set(tokenize(it[nameKey]))) {
        if (!index.has(t)) index.set(t, []);
        index.get(t).push(i);
      }
    });
    return index;
  }

  /**
   * Returns the best candidate with diagnostics:
   *   { item, matched, ingredientTokens, itemTokens, confidence }
   * `confidence` is an F1 score (0..1): precision rewards focused candidate
   * names, recall rewards covering the ingredient's words. Ties are broken by
   * the shorter (more specific) candidate.
   */
  function rankMatch(name, items, index, nameKey, extraTokens) {
    const base = tokenize(name);
    const tokenSet = new Set(base.concat(extraTokens || []));
    if (tokenSet.size === 0) return null;

    const matchedCount = new Map();
    for (const t of tokenSet) {
      const hits = index.get(t);
      if (!hits) continue;
      for (const i of hits) matchedCount.set(i, (matchedCount.get(i) || 0) + 1);
    }

    let best = null;
    for (const [i, matched] of matchedCount) {
      const itemCount = tokenize(items[i][nameKey]).length || 1;
      const precision = matched / itemCount;
      const recall = matched / tokenSet.size;
      const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;
      if (!best || f1 > best.confidence ||
        (f1 === best.confidence && itemCount < best.itemTokens)) {
        best = { item: items[i], matched, ingredientTokens: tokenSet.size, itemTokens: itemCount, confidence: f1 };
      }
    }
    return best;
  }

  /** Backward-compatible: returns the item only, gated by minConfidence. */
  function bestMatch(name, items, index, nameKey, extraTokens, minConfidence) {
    const r = rankMatch(name, items, index, nameKey, extraTokens);
    if (!r) return null;
    if (minConfidence != null && r.confidence < minConfidence) return null;
    return r.item;
  }

  // Confidence gates used by the live site (tunable in one place).
  const CONFIDENCE = { fnri: 0.4, da: 0.4, sm: 0.34 };

  global.SarapMatcher = {
    UNIT_GRAMS, ANIMAL_WORDS, STOPWORDS, COMMODITY_ALIASES, NON_PRICEABLE, CONFIDENCE,
    parseQuantity, tokenize, aliasTokens, isNonPriceable, buildIndex, rankMatch, bestMatch,
  };
})(typeof window !== "undefined" ? window : globalThis);
