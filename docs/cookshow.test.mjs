// Runs docs/cookshow.js (a plain browser script) in a VM and tests the rule-based step engine
// and the scene's pure state helpers. The recipes below are short made-up examples.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./cookshow.js", import.meta.url), "utf8")}
;globalThis.api = { cookCutStyle, cookMinutes, cookTimeText, cookItemsFromLines, cookMentions, buildCookScript, cookCaption, cookFoodKind, cookState, cookMixColor, cookBottleWord, cookSerializeSteps, cookRestoreSteps, cookMoveStep, COOK_THREE_SRI };`, ctx);
const { cookCutStyle, cookMinutes, cookTimeText, cookItemsFromLines, cookMentions, buildCookScript, cookCaption, cookFoodKind, cookState, cookMixColor, cookBottleWord, cookSerializeSteps, cookRestoreSteps, cookMoveStep, COOK_THREE_SRI } = ctx.api;
const plain = (x) => JSON.parse(JSON.stringify(x));

const line = (slug, label, text, status = "ok") => ({ slug, label, text, status });
const ADOBO = {
  title: "Pork Adobo",
  lines: [
    line("pork_belly", "Pork belly", "2 lbs pork belly"),
    line("garlic", "Garlic", "6 cloves garlic, crushed"),
    line("bay_leaf", "Bay leaf", "3 dried bay leaves"),
    line("vinegar_cane_white", "Cane / white vinegar", "4 tbsp vinegar"),
    line("soy_sauce", "Soy sauce", "1/2 cup soy sauce"),
    line("peppercorn_whole", "Whole peppercorn", "1 tbsp whole peppercorn"),
    line(null, null, "2 cups water", "water"),
    line("salt", null, "salt to taste", "to-taste"),
  ],
  instructions: [
    "Mix the pork belly with soy sauce and garlic then marinate for 1 hour",
    "Heat a pot. Put the pork belly in and cook for a few minutes",
    "Add water, pepper corn and bay leaves then bring to a boil. Simmer for 40 minutes",
    "Put the vinegar in and simmer for 15 minutes",
    "Add salt to taste. Serve hot.",
  ],
};
const LECHON = {
  title: "Lechon Kawali",
  lines: [line("pork_belly", "Pork belly", "3 lbs pork belly"), line(null, null, "6 cups water", "water"), line("oil_cooking", "Cooking oil", "4 cups cooking oil"), line("seasoning_magic_sarap", "Maggi Magic Sarap", "1 pack seasoning")],
  instructions: ["Boil the pork belly in water in a pot. Simmer for 1 1/2 to 2 hours.", "Remove the pork from the pot and let it cool.", "Rub the seasoning all over the pork belly.", "Heat the oil in a wok and deep fry the pork belly until crispy.", "Slice into serving pieces. Serve."],
};
const steps = (r) => buildCookScript(r);
const kinds = (r) => steps(r).map((s) => s.kind).join(" ");

test("how a line says to cut, with sizes in cm", () => {
  assert.deepEqual(plain(cookCutStyle("1 onion, diced")), { style: "diced", size: null });
  assert.deepEqual(plain(cookCutStyle("6 cloves garlic, minced")), { style: "minced", size: null });
  assert.deepEqual(plain(cookCutStyle("2 lbs pork, cut into 2-inch cubes")), { style: "cubes", size: 5.1 });
  assert.deepEqual(plain(cookCutStyle("1 thumb ginger, julienned")), { style: "strips", size: null });
  assert.equal(cookCutStyle("2 green papaya, wedged").style, "wedges");
  assert.equal(cookCutStyle("crush the pork cube").style, "crushed");
  assert.equal(cookCutStyle("2 cups water"), null);
});

test("times in a step, and how they read", () => {
  assert.equal(cookMinutes("Simmer for 45 minutes"), 45);
  assert.equal(cookMinutes("Boil for 1 1/2 to 2 hours"), 120);
  assert.equal(cookMinutes("marinate overnight"), 480);
  assert.equal(cookMinutes("Serve hot"), null);
  assert.equal(cookTimeText(90, "tl"), "1 oras 30 minuto");
  assert.equal(cookTimeText(120, "en"), "2 hours");
});

test("the shopping list names water and to-taste lines, and keeps frying oil apart", () => {
  const items = cookItemsFromLines(LECHON.lines);
  assert.deepEqual(plain(items.map((i) => i.label)), ["Pork belly", "Water", "Cooking oil", "Maggi Magic Sarap"]);
  assert.equal(items.find((i) => i.label === "Cooking oil").fryOil, true);
  const cube = cookItemsFromLines([line("stock_cube_chicken", "Chicken bouillon cube", "2 cubes")])[0];
  assert.equal(cube.liquid, false, "a bouillon cube is added by hand, not poured");
});

test("a word in a step goes to the item it fits best", () => {
  const items = cookItemsFromLines([line("chicken_whole_cut", "Chicken, cut up", "3 lbs chicken"), line("stock_cube_chicken", "Chicken bouillon cube", "2 Maggi Magic Chicken Cubes")]);
  assert.deepEqual(plain(cookMentions("Add the chicken.", items).map((i) => i.key)), ["chicken_whole_cut"]);
  assert.deepEqual(plain(cookMentions("Add Maggi Magic Chicken Cubes.", items).map((i) => i.key)), ["stock_cube_chicken"]);
});

test("adobo: marinate, boil, simmer, vinegar, season, serve", () => {
  const s = steps(ADOBO);
  assert.equal(kinds(ADOBO), "shop cut marinate heat add boil simmer pour simmer season serve");
  assert.equal(s.find((x) => x.kind === "marinate").minutes, 60);
  assert.deepEqual(plain(s.filter((x) => x.kind === "simmer").map((x) => x.minutes)), [40, 15]);
  assert.equal(s.find((x) => x.kind === "pour").items[0].key, "vinegar_cane_white");
  assert.equal(cookCaption(s.find((x) => x.kind === "marinate"), "tl"), "Ibabad ang pork belly, garlic at soy sauce nang 1 oras");
  assert.equal(cookCaption(s[s.length - 1], "en"), "Serve while hot");
});

test("lechon kawali: boil in a pot, then deep-fry in a wok, then slice", () => {
  const s = steps(LECHON);
  const boil = s.find((x) => x.kind === "simmer");
  assert.equal(boil.minutes, 120);
  assert.equal(boil.vessel, "kaldero");
  const fry = s.find((x) => x.kind === "deepfry");
  assert.equal(fry.vessel, "kawali");
  assert.deepEqual(plain(fry.items.map((i) => i.key)), ["pork_belly"]);
  const season = s.find((x) => x.kind === "season");
  assert.deepEqual(plain(season.items.map((i) => i.key)), ["seasoning_magic_sarap"], "the pork belly is not a seasoning");
  assert.equal(s[s.length - 2].kind, "cut");
});

test("no steps at all: the dish-type template fills in", () => {
  const r = { title: "Sinigang na Baboy", lines: [line("pork_ribs", "Pork spare ribs", "1 kg pork ribs"), line(null, null, "8 cups water", "water"), line("radish", "Radish", "1 radish, sliced"), line("fish_sauce", "Fish sauce", "2 tbsp fish sauce")] };
  assert.equal(kinds(r), "shop cut add pour boil add simmer season serve");
  assert.equal(steps(r).find((x) => x.kind === "boil").minutes, 45);
});

test("lumpia: wrapping, and frying names the lumpia, not the wrapper", () => {
  const r = {
    title: "Lumpiang Shanghai",
    lines: [line("pork_ground", "Ground pork", "1 lb ground pork"), line("carrot", "Carrot", "1 carrot, minced"), line("lumpia_wrapper", "Lumpia wrapper", "30 lumpia wrappers"), line("oil_cooking", "Cooking oil", "2 cups oil")],
    instructions: ["Combine ground pork and carrot in a bowl.", "Put a spoonful of filling on a lumpia wrapper. Wrap and roll.", "Heat oil in a pan. Deep fry the lumpia until golden brown.", "Serve."],
  };
  const s = steps(r);
  assert.ok(s.some((x) => x.kind === "wrap"));
  assert.equal(cookCaption(s.find((x) => x.kind === "deepfry"), "tl"), "Iprito nang lubog sa mantika ang lumpia");
});

test("which 3D model each ingredient gets", () => {
  const k = (key, label, extra = {}) => cookFoodKind({ key, label, ...extra });
  assert.equal(k("onion_yellow", "Yellow onion"), "onion");
  assert.equal(k("garlic_powder", "Garlic powder"), "powder");
  assert.equal(k("pork_ground", "Ground pork"), "mince");
  assert.equal(k("eggplant", "Eggplant"), "eggplant");
  assert.equal(k("egg_chicken", "Chicken egg"), "egg");
  assert.equal(k("soy_sauce", "Soy sauce", { liquid: true }), "bottle");
  assert.equal(k("stock_cube_pork", "Pork bouillon cube"), "cube");
  assert.equal(k("water", "Water", { water: true, liquid: true }), "water");
  assert.equal(cookBottleWord({ key: "soy_sauce", label: "Soy sauce" }), "TOYO");
  assert.equal(cookBottleWord({ key: "fish_sauce", label: "Fish sauce" }), "PATIS");
});

test("scene state: the marinade follows the meat, the broth darkens, the pot changes", () => {
  const s = steps(ADOBO);
  const at = (kind) => cookState(s, s.findIndex((x) => x.kind === kind) + 1);
  const marinated = at("marinate");
  const pork = marinated.items.find((i) => i.key === "pork_belly");
  assert.equal(marinated.loc.get(pork), "bowl");
  assert.ok(marinated.bowlLiquid);
  const added = at("add");
  assert.equal(added.loc.get(pork), "pot");
  assert.equal(added.bowlLiquid, null);
  const n = parseInt(cookMixColor(added.parts).slice(1), 16);
  assert.ok(((n >> 16) & 255) < 120, "soy turns the broth brown");
  assert.ok((at("serve").brown.get(pork) || 0) > 0.3, "stewing in soy browns the pork");
  const L = steps(LECHON);
  const fried = cookState(L, L.findIndex((x) => x.kind === "deepfry") + 1);
  assert.equal(fried.vessel, "kawali");
  assert.equal(fried.level, 0, "the boiling water was drained before frying");
  assert.ok(fried.oil > 0.5);
  assert.equal(cookState(L, L.length).served, "plate");
});

test("Three.js is pinned with subresource integrity", () => {
  assert.match(COOK_THREE_SRI, /^sha384-[A-Za-z0-9+/]{64}$/);
  const src = readFileSync(new URL("./cookshow.js", import.meta.url), "utf8");
  assert.match(src, /s\.integrity = COOK_THREE_SRI; s\.crossOrigin = "anonymous"/);
  assert.match(src, /three\.js\/r128\/three\.min\.js/);
});

test("edited steps save as plain data and come back matched to the ingredients", () => {
  const built = steps(ADOBO);
  const saved = JSON.parse(JSON.stringify(cookSerializeSteps(built)));
  assert.deepEqual(plain(saved[2]), { kind: "marinate", keys: ["pork_belly", "garlic", "soy_sauce"], minutes: 60, vessel: "kawali" });
  // Change the marinating time and drop the vinegar step, as a person would.
  saved[2].minutes = 480;
  const edited = saved.filter((o) => !(o.kind === "pour" && o.keys[0] === "vinegar_cane_white"));
  const back = cookRestoreSteps(edited, built);
  assert.equal(back.length, built.length - 1);
  assert.equal(back[2].items[0], built[2].items[0], "items are the recipe's own objects again");
  assert.equal(cookCaption(back[2], "tl"), "Ibabad ang pork belly, garlic at soy sauce nang 8 oras");
  // An ingredient removed in Ulam ko drops the steps that only used it.
  const noGarlic = buildCookScript({ ...ADOBO, lines: ADOBO.lines.filter((l) => l.slug !== "garlic") });
  assert.ok(!cookRestoreSteps(saved, noGarlic).some((s) => s.kind === "cut" && s.items.length === 0));
  assert.equal(cookRestoreSteps([], built), built, "nothing saved: the built steps");
});

test("moving steps keeps shopping first and serving last", () => {
  const s = steps(ADOBO);
  assert.equal(cookMoveStep(s, 0, 1), s);
  assert.equal(cookMoveStep(s, 1, -1), s);
  assert.equal(cookMoveStep(s, s.length - 2, 1), s);
  const m = cookMoveStep(s, 3, 1);
  assert.equal(m[3], s[4]); assert.equal(m[4], s[3]);
});
