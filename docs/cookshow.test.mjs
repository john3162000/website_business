// Runs docs/cookshow.js (a plain browser script) in a VM and tests the rule-based step engine
// and the scene's pure state helpers. The recipes below are short made-up examples.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = vm.createContext({});
vm.runInContext(`${readFileSync(new URL("./cookshow.js", import.meta.url), "utf8")}
;globalThis.api = { cookCutStyle, cookMinutes, cookTimeText, cookItemsFromLines, cookMentions, buildCookScript, cookCaption, cookFoodKind, cookState, cookMixColor, cookBottleWord, cookSerializeSteps, cookRestoreSteps, cookMoveStep, cookCompact, cookCheck, cookBurn, cookIsPoured, cookMixLum, COOK_THREE_SRI };`, ctx);
const { cookCutStyle, cookMinutes, cookTimeText, cookItemsFromLines, cookMentions, buildCookScript, cookCaption, cookFoodKind, cookState, cookMixColor, cookBottleWord, cookSerializeSteps, cookRestoreSteps, cookMoveStep, cookCompact, cookCheck, cookBurn, cookIsPoured, cookMixLum, COOK_THREE_SRI } = ctx.api;
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
  assert.equal(kinds(ADOBO), "shop cut marinate heat add simmer pour simmer season serve");
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
  assert.equal(kinds(r), "shop cut add boil add simmer season serve");
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

test("shorter scripts: same cuts merge, boil-then-simmer is one step", () => {
  const it = (key) => ({ key, label: key, liquid: false });
  const [a, b, c] = [it("garlic"), it("onion"), it("ginger")];
  const out = cookCompact([
    { kind: "cut", items: [a], style: "minced" }, { kind: "cut", items: [b], style: "minced" }, { kind: "cut", items: [c], style: "strips" },
    { kind: "boil", items: [], vessel: "kaldero" }, { kind: "simmer", items: [], minutes: 40, vessel: "kaldero" },
  ]);
  assert.equal(out.length, 3);
  assert.equal(cookCaption(out[0], "tl"), "Hiwain ang garlic at onion: pinong-pino");
  assert.equal(cookCaption(out[2], "tl"), "Pakuluan, saka hinaan ang apoy nang 40 minuto");
  // Past 18 steps, neighbouring cuts of different kinds merge and keep their own cut.
  const many = [...Array(9)].map((_, i) => ({ kind: "cut", items: [it(`v${i}`)], style: i % 2 ? "diced" : "sliced" }))
    .concat([...Array(10)].map((_, i) => ({ kind: "stir", items: [it(`s${i}`)] })));
  const short = cookCompact(many);
  assert.equal(short[0].style, "mixed");
  assert.equal(short[0].cuts.v1, "diced");
  assert.ok(short.length <= 11);
});

test("ingredient photos: Wikimedia Commons only, each with its licence and author", () => {
  const photos = JSON.parse(readFileSync(new URL("./cookphotos.json", import.meta.url), "utf8"));
  const entries = Object.entries(photos);
  assert.ok(entries.length >= 50);
  for (const [slug, p] of entries) {
    assert.match(slug, /^[a-z0-9_]+$/);
    assert.match(p.thumb, /^https:\/\/(thumb|upload)\.wikimedia\.org\/wikipedia\/commons\/thumb\//, slug);
    assert.match(p.page, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/, slug);
    assert.match(p.license, /^(CC0|Public domain|CC BY(-SA)? [0-9.]+)$/, slug);
    assert.ok(p.artist && p.artist.length > 1, slug);
    if (/^CC BY/.test(p.license)) assert.match(p.licenseUrl, /^https?:\/\/creativecommons\.org\//, slug);
  }
});

test("kitchen notes: raw meat, cold pan, dry pot, unused ingredients, total time", () => {
  const built = steps(ADOBO);
  const [shop, serve] = [built[0], built[built.length - 1]];
  const pork = shop.items.find((i) => i.key === "pork_belly"), garlic = shop.items.find((i) => i.key === "garlic");
  const types = (list) => list.map((n) => `${n.type}:${n.tl}`);
  // Nothing done yet.
  assert.match(types(cookCheck([shop, serve])).join("|"), /Pumili ng unang gagawin/);
  // Frying in a cold pan, the pork never cooked through, a dry boil.
  const bad = cookCheck([shop, { kind: "saute", items: [garlic], vessel: "kawali" }, { kind: "add", items: [pork], vessel: "kaldero" }, { kind: "boil", items: [], vessel: "kaldero" }, serve]);
  const text = types(bad).join("|");
  assert.match(text, /warn:Painitin muna ang kawali bago mag-gisa/);
  assert.match(text, /warn:Walang tubig o sabaw sa kaldero/);
  assert.doesNotMatch(text, /Hilaw pa/, "boiling cooks what's in the pot");
  assert.match(text, /info:Hindi pa nagagamit: bay leaf/);
  const raw = cookCheck([shop, { kind: "cut", items: [pork], style: "cubes" }, serve]);
  assert.equal(raw[0].type, "warn");
  assert.equal(raw[0].tl, "Hilaw pa ang pork belly. Lutuin muna bago ihain.");
  // The engine's own adobo passes, with its total time.
  const good = cookCheck(built);
  assert.equal(good[0].type, "ok");
  assert.ok(!good.some((n) => n.type === "warn"), JSON.stringify(good));
  assert.ok(good.some((n) => /Kabuuang oras: 1 oras 55 minuto/.test(n.tl)), JSON.stringify(good));
});

test("strain and put on top: read from recipe text, captions and scene state", () => {
  const r = {
    title: "Cheesy Spaghetti",
    lines: [line("spaghetti", "Spaghetti", "500 g spaghetti"), line(null, null, "8 cups water", "water"), line("tomato_sauce", "Tomato sauce", "1 cup tomato sauce"), line("cheese_cheddar", "Cheddar cheese", "1 cup grated cheddar")],
    instructions: ["Boil water in a pot and cook the spaghetti for 10 minutes.", "Strain the spaghetti.", "Heat a pan and pour the tomato sauce. Add the spaghetti.", "Top with grated cheddar and serve."],
  };
  const s = steps(r);
  const strain = s.find((x) => x.kind === "strain"), top = s.find((x) => x.kind === "top");
  assert.ok(strain, kinds(r));
  assert.equal(cookCaption(strain, "tl"), "Salain ang spaghetti at itapon ang tubig");
  assert.equal(cookCaption(top, "tl"), "Ilagay sa ibabaw ang cheddar cheese");
  assert.equal(cookCaption(top, "en"), "Put the cheddar cheese on top");
  const afterStrain = cookState(s, s.indexOf(strain) + 1);
  assert.equal(afterStrain.level, 0, "the water is poured off");
  assert.equal(afterStrain.loc.get(strain.items[0]), "rack");
  const served = cookState(s, s.length);
  assert.ok(served.top.has(top.items[0]));
  assert.equal(served.loc.get(top.items[0]), "plate");
});

test("too long on the fire: overdone, then burnt; the flame changes the limit", () => {
  assert.equal(cookBurn({ kind: "boil", minutes: 45 }), 0);
  assert.equal(cookBurn({ kind: "simmer", minutes: 180 }), 0, "bulalo for 3 hours is normal");
  assert.equal(cookBurn({ kind: "boil", minutes: 1000 }), 2, "1000 minutes boils dry and burns");
  assert.equal(cookBurn({ kind: "fry", minutes: 25 }), 1);
  assert.equal(cookBurn({ kind: "fry", minutes: 25, heat: "high" }), 2, "high heat burns sooner");
  assert.equal(cookBurn({ kind: "fry", minutes: 25, heat: "low" }), 0, "low heat takes longer");
  assert.equal(cookBurn({ kind: "marinate", minutes: 1440 }), 0, "marinating overnight never burns");
  assert.equal(cookBurn({ kind: "chill", minutes: 1440 }), 0);
  assert.equal(cookCaption({ kind: "fry", items: [], minutes: 5, heat: "high" }, "tl"), "Iprito nang 5 minuto sa malakas na apoy");
  // The kitchen notes flag it, and the scene state chars the food and boils the pot dry.
  const built = steps(ADOBO);
  const k = built.findIndex((x) => x.kind === "simmer");
  const burnt = built.map((x, i) => (i === k ? { ...x, minutes: 1000 } : x));
  const notes = cookCheck(burnt);
  assert.match(notes[0].tl, /Masusunog sa hakbang/);
  assert.ok(!notes.some((n) => n.type === "ok"));
  const st = cookState(burnt, k + 1);
  const pork = st.items.find((i) => i.key === "pork_belly");
  assert.ok(st.brown.get(pork) > 1.5, "charred");
  assert.equal(st.level, 0, "boiled dry");
  assert.equal(st.burnt, 2);
});

test("bottles never go into the food; the dish takes the colour of its sauce", () => {
  const items = cookItemsFromLines([
    { slug: "fish_sauce", label: "Fish sauce", text: "2 tbsp patis", status: "ok", gAP: 36 },
    { slug: "soy_sauce", label: "Soy sauce", text: "1/2 cup soy sauce", status: "ok", gAP: 128 },
    { slug: "tomato_sauce", label: "Tomato sauce", text: "2 cups tomato sauce", status: "ok", gAP: 490 },
    { slug: "tomato_paste", label: "Tomato paste", text: "3 tbsp tomato paste", status: "ok", gAP: 48 },
    { slug: "pork_belly", label: "Pork belly", text: "1 kg pork belly", status: "ok", gAP: 1000 },
    { slug: null, label: null, text: "2 cups water", status: "water", gAP: 473 },
  ]);
  const by = (k) => items.find((i) => i.key === k);
  for (const k of ["fish_sauce", "soy_sauce", "tomato_sauce", "tomato_paste", "water"]) assert.ok(cookIsPoured(by(k)), k);
  assert.equal(cookIsPoured(by("pork_belly")), false);
  const shop = { kind: "shop", items };
  // Adobo-style: pork, lots of toyo, a little water → a dark pot, and the pork takes the colour.
  const adobo = [shop, { kind: "add", items: [by("pork_belly"), by("soy_sauce"), by("water")], vessel: "kaldero" }, { kind: "season", items: [by("fish_sauce")], vessel: "kaldero" }, { kind: "simmer", items: [], minutes: 40, vessel: "kaldero" }, { kind: "serve", items: [] }];
  const st = cookState(adobo, 4);
  assert.ok(cookMixLum(st.parts) < 0.35, `dark: ${cookMixColor(st.parts)}`);
  for (const k of ["fish_sauce", "soy_sauce", "water"]) assert.notEqual(st.loc.get(by(k)), "pot", `${k} bottle stays out`);
  assert.ok(st.tint.get(by("pork_belly"))[1] > 0.3, "pork takes the sauce colour");
  // Tomato sauce → red-orange.
  const menudo = [shop, { kind: "add", items: [by("pork_belly"), by("tomato_sauce"), by("tomato_paste"), by("water")], vessel: "kaldero" }, { kind: "simmer", items: [], minutes: 30, vessel: "kaldero" }];
  const red = cookMixColor(cookState(menudo, 3).parts), n = parseInt(red.slice(1), 16);
  assert.ok(((n >> 16) & 255) > 2 * ((n >> 8) & 255), `red: ${red}`);
});
