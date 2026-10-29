// Settings: one ⚙️ button for the language of the app buttons (Tagalog or English),
// diets (several at once), the kitchen, "Suggest ka pa" (taste picks from Laro),
// dark mode and the weather picks. Saved on this device (localStorage). Also the
// Fish / Chicken / Pork / Beef chips in Browse and the Planner.
// docs/settings.test.mjs tests the pure helpers.

const SETTINGS_KEY = "sarapsulit.settings.v1";
const SETTINGS_LANGS = ["tl", "en"];
const SETTINGS_DIET_KEYS = ["protein", "diabetic", "heart", "kidney", "gout", "lowcal"];
const SETTINGS_MEAT_KEYS = ["fish", "chicken", "pork", "beef"];

function defaultSettings() {
  return { lang: "en", diets: [], meats: [], suggest: true };
}

/** Saved settings, with anything unknown or broken replaced by the default. */
function readSettings(storage) {
  const d = defaultSettings();
  try {
    const v = JSON.parse(storage.getItem(SETTINGS_KEY) || "null");
    if (!v || typeof v !== "object") return d;
    const known = (list, allowed) => (Array.isArray(list) ? [...new Set(list.filter((k) => allowed.includes(k)))] : []);
    return {
      lang: SETTINGS_LANGS.includes(v.lang) ? v.lang : d.lang,
      diets: known(v.diets, SETTINGS_DIET_KEYS),
      meats: known(v.meats, SETTINGS_MEAT_KEYS),
      suggest: v.suggest !== false,
    };
  } catch {
    return d;
  }
}

function writeSettings(storage, s) {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/** `list` with `key` added, or removed when it was there. */
function toggleIn(list, key) {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
}

// ── Words on the app buttons: Tagalog (tl) and English (en) ──

const I18N = {
  // One set of section names for the header tabs and the phone tab bar.
  "nav.home": ["Simula", "Home"],
  "nav.browse": ["Recipe", "Recipes"],
  "nav.prices": ["Presyo", "Prices"],
  "nav.mydish": ["Ulam ko", "My Dish"],
  "nav.planner": ["Plano", "Planner"],
  "nav.finder": ["Lulutuin", "Cook"],
  "nav.game": ["Laro", "Games"],
  "card.nutrition": ["Sustansya", "Nutrition"],
  "card.plusLegend": ["“+” sa presyo: may sangkap na wala pang presyo", "“+” on a price: some ingredients have no price yet"],
  "modal.sulit": ["Sulit meter", "Sulit meter"],
  "modal.betterThan": ["Mas sulit sa {pct}% ng ulam", "Better value than {pct}% of dishes"],
  "modal.unranked": ["Kulang pa ang data", "Not enough data"],
  "modal.perServing": ["Bawat serving", "Per serving"],
  "modal.nutrition": ["Sustansya (score)", "Nutrition score"],
  "browse.title": ["Mga Lutong Pinoy", "Browse Filipino Recipes"],
  "browse.sort": ["Ayusin ayon sa", "Sort by"],
  "browse.minProtein": ["Pinakamababang protina (g/serving)", "Min Protein (g/serving)"],
  "browse.maxCost": ["Pinakamataas na gastos bawat serving (₱)", "Max Cost per Serving (₱)"],
  "browse.produce": ["May sangkap na", "Contains Produce"],
  "browse.kcal": ["Calories bawat serving (kcal)", "Calories per Serving (kcal)"],
  "browse.search": ["Hanapin ang ulam…", "Search by dish name…"],
  "browse.clear": ["Burahin", "Clear"],
  "kitchen.button": ["🍳 Ang kusina ko", "🍳 My kitchen"],
  "meat.label": ["Karne o isda", "Meat or fish"],
  "meat.all": ["Lahat", "All"],
  "planner.title": ["Lingguhang Plano", "Weekly Planner"],
  "plan.cheapest": ["💸 Pinakamura ngayon", "💸 Cheapest today"],
  "plan.search": ["Hanapin ang ulam…", "Search dishes…"],
  "plan.hint": ["I-drag ang ulam sa isang slot, o i-tap ang ulam tapos ang slot.", "Drag a dish into a slot, or tap a dish then tap a slot."],
  "plan.random": ["🎲 Random na linggo", "🎲 Random week"],
  "plan.ulamOnly": ["Ulam lang", "Main dishes only"],
  "plan.allMeals": ["Lahat ng kain", "All meals"],
  "plan.perMeal": ["Ulam bawat kain", "Dishes per meal"],
  "plan.keep": ["Huwag galawin ang nakalagay na", "Keep dishes already in the week"],
  "plan.style": ["Estilo", "Style"],
  "plan.mix": ["Halo-halo (pinaka-sulit)", "Mix (best value)"],
  "plan.alternate": ["🥬 → 🐟 → 🥩 Gulay, isda, karne · pinakamura muna", "🥬 → 🐟 → 🥩 Veg, fish, meat · cheapest first"],
  "plan.diet": ["Diet", "Diet"],
  "plan.dietNone": ["Wala (lahat ng ulam)", "None (every dish)"],
  "plan.dietChange": ["⚙️ Palitan", "⚙️ Change"],
  "plan.budget": ["₱ Iplano ayon sa budget", "₱ Plan within budget"],
  "plan.budgetText": ["₱1,500 sa isang linggo, 4 na tao", "₱1,500 for the week, 4 people"],
  "plan.receipt": ["Resibo", "Receipt"],
  "plan.people": ["Ilang tao", "People"],
  "plan.perDish": ["Bawat ulam", "Per dish"],
  "plan.perIngredient": ["Bawat sangkap", "Per ingredient"],
  "plan.png": ["⬇️ Listahan (PNG)", "⬇️ Grocery list (PNG)"],
  "plan.html": ["📄 Listahan (HTML)", "📄 Grocery list (HTML)"],
  "plan.messenger": ["💬 Sa Messenger", "💬 To Messenger"],
  "plan.save": ["💾 I-save ang plano sa device", "💾 Save this plan on the device"],
  "plan.clear": ["Burahin ang linggo", "Clear week"],
  "series.all": ["Lahat", "All"],
  "series.almusal": ["Almusal", "Breakfast"],
  "series.ulam": ["Tanghalian / Hapunan", "Lunch / Dinner"],
  "series.meryenda": ["Meryenda", "Snacks"],
  "series.fav": ["⭐ Paborito", "⭐ Favorites"],
  "settings.open": ["Mga setting", "Settings"],
  "settings.title": ["⚙️ Mga setting", "⚙️ Settings"],
  "settings.sub": ["Naka-save sa device na 'to lang.", "Saved on this device only."],
  "settings.lang": ["Wika ng mga button", "Language of the buttons"],
  "settings.diet": ["Diet (pwedeng marami)", "Diet (pick any number)"],
  "settings.dietHelp": ["Lalabas lang ang ulam na pasok sa LAHAT ng napili, sa Recipes at sa Plano.", "Only dishes that pass ALL chosen diets show, in Recipes and the Planner."],
  "settings.kitchen": ["Ang kusina ko", "My kitchen"],
  "settings.kitchenOpen": ["🍳 Piliin ang mga gamit", "🍳 Pick your appliances"],
  "settings.suggest": ["🧠 Suggest ka pa", "🧠 Keep suggesting"],
  "settings.suggestHelp": ["Mga mungkahi ayon sa panlasa mo (mula sa Laro): “Para sa'yo”, Random week at DA Prices.", "Picks from your taste (learned in Games): “For you”, Random week and DA Prices."],
  "settings.dark": ["🌙 Dark mode", "🌙 Dark mode"],
  "settings.weather": ["Weather ng mga suggestion", "Weather for the picks"],
  "settings.done": ["Tapos", "Done"],
  "settings.on": ["Bukas", "On"],
  "settings.off": ["Sarado", "Off"],
};

let SETTINGS = defaultSettings();

function settingsStore() {
  try { return window.localStorage; } catch { return null; }
}

/** The word for `key` in the chosen language; English, then the key itself, when it's missing. */
function t(key, lang = SETTINGS.lang) {
  const row = I18N[key];
  if (!row) return key;
  return (lang === "tl" ? row[0] : row[1]) || row[1];
}

function siteLang() { return SETTINGS.lang; }
function settingsDiets() { return SETTINGS.diets; }
function settingsMeats() { return SETTINGS.meats; }
function suggestOn() { return SETTINGS.suggest; }

/** Puts the chosen language on every element marked data-i18n (text), data-i18n-ph (placeholder) or data-i18n-title. */
function applyLang(root = document) {
  document.documentElement.lang = SETTINGS.lang === "tl" ? "fil" : "en";
  root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute("aria-label", el.title); });
}

/** Saves, then redraws everything that depends on a setting. */
function settingsChanged() {
  const s = settingsStore();
  if (s) writeSettings(s, SETTINGS);
  applyLang();
  renderMeatChips();
  renderDietSummary();
  if (!document.getElementById("settings-dialog").classList.contains("hidden")) renderSettings();
  if (typeof RECIPES !== "undefined" && RECIPES.length) {
    if (typeof filterRecipes === "function") filterRecipes();
    if (typeof renderOccasion === "function") renderOccasion();
    if (typeof renderPicker === "function" && document.getElementById("plan-picker")) renderPicker();
    if (typeof renderReceipt === "function" && document.getElementById("plan-receipt")) renderReceipt();
    if (typeof renderPriceForYou === "function") renderPriceForYou(typeof moversFell !== "undefined" ? moversFell : new Map());
  }
}

function setLang(lang) { SETTINGS = { ...SETTINGS, lang }; settingsChanged(); }
function toggleDietSetting(key) { SETTINGS = { ...SETTINGS, diets: toggleIn(SETTINGS.diets, key) }; settingsChanged(); }
function clearDietSetting() { SETTINGS = { ...SETTINGS, diets: [] }; settingsChanged(); }
function setSuggest(on) { SETTINGS = { ...SETTINGS, suggest: on }; settingsChanged(); }
function toggleMeat(key) { SETTINGS = { ...SETTINGS, meats: key ? toggleIn(SETTINGS.meats, key) : [] }; settingsChanged(); }

// ── The Settings dialog ──

function openSettings() {
  renderSettings();
  document.getElementById("settings-dialog").classList.remove("hidden");
  if (typeof trackEvent === "function") trackEvent("settings/open");
}

function closeSettings() {
  document.getElementById("settings-dialog").classList.add("hidden");
}

function settingsChoice(on, onclick, label) {
  return `<button class="wx-btn ${on ? "on" : ""}" onclick="${onclick}" aria-pressed="${on}">${label}</button>`;
}

function renderSettings() {
  const en = SETTINGS.lang === "en";
  const dark = document.documentElement.classList.contains("dark");
  const mode = typeof weatherMode === "string" ? weatherMode : "auto";
  const diets = typeof DIETS !== "undefined" ? DIETS.filter((d) => d.key !== "all") : [];
  const note = typeof dietNote === "function" ? dietNote(SETTINGS.diets, en) : "";
  const kitchen = typeof kitchenSummary === "function" ? kitchenSummary() : "";
  const weathers = [["auto", "📍 Auto"], ["sunny", en ? "☀️ Sunny" : "☀️ Maaraw"], ["rainy", en ? "🌧️ Rainy" : "🌧️ Maulan"], ["cool", en ? "🌥️ Cool" : "🌥️ Malamig"]];
  document.getElementById("settings-body").innerHTML = `
    <section class="set-row">
      <h3>${t("settings.lang")}</h3>
      <div class="flex flex-wrap gap-2">${settingsChoice(!en, "setLang('tl')", "🇵🇭 Tagalog")}${settingsChoice(en, "setLang('en')", "🇬🇧 English")}</div>
    </section>
    <section class="set-row">
      <h3>${t("settings.diet")}</h3>
      <div class="flex flex-wrap gap-2">${settingsChoice(!SETTINGS.diets.length, "clearDietSetting()", t("plan.dietNone"))}
        ${diets.map((d) => settingsChoice(SETTINGS.diets.includes(d.key), `toggleDietSetting('${d.key}')`, `${d.icon || ""} ${escapeHtml(d.label)}`)).join("")}</div>
      <p class="set-help">${t("settings.dietHelp")}</p>
      ${note ? `<p class="set-note">${escapeHtml(note)}</p>` : ""}
    </section>
    <section class="set-row">
      <h3>${t("settings.kitchen")}</h3>
      <div class="flex flex-wrap items-center gap-2"><button class="wx-btn" onclick="closeSettings(); openKitchen()">${t("settings.kitchenOpen")}</button>
        <span class="set-help">${escapeHtml(kitchen)}</span></div>
    </section>
    <section class="set-row">
      <h3>${t("settings.suggest")}</h3>
      <div class="flex flex-wrap gap-2">${settingsChoice(SETTINGS.suggest, "setSuggest(true)", t("settings.on"))}${settingsChoice(!SETTINGS.suggest, "setSuggest(false)", t("settings.off"))}</div>
      <p class="set-help">${t("settings.suggestHelp")}</p>
    </section>
    <section class="set-row">
      <h3>${t("settings.dark")}</h3>
      <div class="flex flex-wrap gap-2">${settingsChoice(!dark, dark ? "toggleTheme(); renderSettings()" : "", en ? "☀️ Light" : "☀️ Maliwanag")}${settingsChoice(dark, dark ? "" : "toggleTheme(); renderSettings()", en ? "🌙 Dark" : "🌙 Madilim")}</div>
    </section>
    <section class="set-row">
      <h3>${t("settings.weather")}</h3>
      <div class="flex flex-wrap gap-2">${weathers.map(([k, label]) => settingsChoice(mode === k, `setWeatherMode('${k}'); renderSettings()`, label)).join("")}</div>
    </section>`;
}

// ── Meat chips (Browse and Planner) and the diet line in the Planner ──

function renderMeatChips() {
  const types = typeof MEAT_TYPES !== "undefined" ? MEAT_TYPES : [];
  const en = SETTINGS.lang === "en";
  document.querySelectorAll("[data-meat-chips]").forEach((box) => {
    box.innerHTML = `<span class="text-xs text-gray-500 mr-1">${t("meat.label")}</span>`
      + settingsChoice(!SETTINGS.meats.length, "toggleMeat(null)", t("meat.all"))
      + types.map((m) => settingsChoice(SETTINGS.meats.includes(m.key), `toggleMeat('${m.key}')`, en ? m.en : m.label)).join("");
  });
}

function renderDietSummary() {
  const en = SETTINGS.lang === "en";
  const diets = typeof DIETS !== "undefined" ? DIETS.filter((d) => SETTINGS.diets.includes(d.key)) : [];
  const names = diets.map((d) => `${d.icon || ""} ${escapeHtml(d.label)}`).join(" + ");
  document.querySelectorAll("[data-diet-summary]").forEach((el) => {
    el.innerHTML = `<span class="text-xs text-gray-500">${t("plan.diet")}</span>
      <span class="text-xs font-semibold ${diets.length ? "text-green-800" : "text-gray-400"}">${names || t("plan.dietNone")}</span>
      <button class="wx-btn" onclick="openSettings()">${t("plan.dietChange")}</button>`;
  });
  const note = typeof dietNote === "function" ? dietNote(SETTINGS.diets, en) : "";
  document.querySelectorAll("[data-diet-note]").forEach((el) => { el.textContent = note; });
}

// Before app.js runs: the saved language and chips are in place on the first paint.
(function initSettings() {
  if (typeof document === "undefined" || !document.getElementById) return;
  const s = settingsStore();
  if (s) SETTINGS = readSettings(s);
  const start = () => { applyLang(); renderMeatChips(); renderDietSummary(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
