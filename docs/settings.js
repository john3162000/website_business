// Settings: one ⚙️ button for the language of the app buttons (Tagalog or English),
// diets (several at once), the kitchen, "Suggest ka pa" (taste picks from Laro),
// dark mode and the weather picks. Saved on this device (localStorage). Also the
// Fish / Chicken / Pork / Beef chips in Browse and the Planner.
// docs/settings.test.mjs tests the pure helpers.

const SETTINGS_KEY = "sarapsulit.settings.v1";
const SETTINGS_LANGS = ["tl", "en"];
const SETTINGS_DIET_KEYS = ["protein", "diabetic", "heart", "kidney", "gout", "lowcal"];
const SETTINGS_MEAT_KEYS = ["fish", "chicken", "pork", "beef"];
// Age brackets asked on the first visit; "senior" (60+) turns on large text and a simpler menu.
const SETTINGS_AGES = ["child", "teen", "young", "adult", "midlife", "senior"];

function defaultSettings() {
  return { lang: "tl", langChosen: false, diets: [], meats: [], suggest: true, age: null, large: false, ageAsked: false };
}

/** Saved settings, with anything unknown or broken replaced by the default. */
function readSettings(storage) {
  const d = defaultSettings();
  try {
    const v = JSON.parse(storage.getItem(SETTINGS_KEY) || "null");
    if (!v || typeof v !== "object") return d;
    const known = (list, allowed) => (Array.isArray(list) ? [...new Set(list.filter((k) => allowed.includes(k)))] : []);
    return {
      // English only when the visitor picked it; older saves had "en" as the default and now get Tagalog.
      lang: v.langChosen === true && SETTINGS_LANGS.includes(v.lang) ? v.lang : d.lang,
      langChosen: v.langChosen === true,
      diets: known(v.diets, SETTINGS_DIET_KEYS),
      meats: known(v.meats, SETTINGS_MEAT_KEYS),
      suggest: v.suggest !== false,
      age: SETTINGS_AGES.includes(v.age) ? v.age : null,
      large: v.large === true,
      ageAsked: v.ageAsked === true,
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

/**
 * Settings after choosing an age bracket (an unknown value counts as none). Seniors get large text;
 * moving away from senior turns it off again; other choices leave a manual setting alone.
 */
function withAge(s, age) {
  const a = SETTINGS_AGES.includes(age) ? age : null;
  const large = a === "senior" ? true : s.age === "senior" ? false : s.large;
  return { ...s, age: a, large, ageAsked: true };
}

/** Whether to ask the age bracket now: first visit only, and not when a shared recipe link opens. */
function shouldAskAge(s, hash) {
  return !s.ageAsked && !/^#recipe=\d+$/.test(hash || "");
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
  "feed.title": ["🍲 Para sa maramihan (feeding program)", "🍲 Cooking for many (feeding program)"],
  "feed.intro": ["Para sa NGO, paaralan at barangay: menu na kasya sa badyet bawat tao (kasama ang kanin), at isang listahan ng bibilhin para sa lahat.", "For NGOs, schools and barangays: a cycle menu within your budget per head, rice included, and one bulk grocery list for everyone."],
  "feed.heads": ["Ilang tao", "How many people"],
  "feed.budget": ["Badyet bawat tao bawat kain (₱)", "Budget per head per meal (₱)"],
  "feed.days": ["Ilang araw", "How many days"],
  "feed.riceG": ["Bigas bawat tao (g, hilaw)", "Rice per head (g, uncooked)"],
  "feed.make": ["Gumawa ng plano", "Make the plan"],
  "feed.loading": ["Kinukuha ang mga ulam…", "Loading dishes…"],
  "feed.loadingLines": ["Kinukuha ang mga sangkap…", "Loading the ingredients…"],
  "feed.none": ["Walang ulam na kasya. Subukan ang mas malaking badyet o alisin ang diet sa Settings.", "No dish fits. Try a bigger budget or clear the diets in Settings."],
  "feed.fits": ["Pasok sa {budget} bawat tao: {avg} ang karaniwan bawat kain, kasama ang kanin.", "Fits {budget} per head: {avg} on average per meal, rice included."],
  "feed.notFit": ["Lampas sa {budget} bawat tao: {avg} ang karaniwan bawat kain. Dagdagan ang badyet o bawasan ang araw.", "Over {budget} per head: {avg} on average per meal. Raise the budget or plan fewer days."],
  "feed.shellfish": ["May hipon, tahong o iba pang shellfish sa menu: itanong kung may allergy bago magluto.", "The menu has shrimp, mussels or other shellfish: ask about allergies before cooking."],
  "feed.link": ["🍲 Para sa maramihan? Feeding program planner sa ibaba", "🍲 Cooking for many? Feeding program planner below"],
  "feed.total": ["Kabuuang gastos", "Total cost"],
  "feed.perHead": ["Bawat tao bawat kain", "Per head per meal"],
  "feed.kcal": ["Karaniwang kcal (ulam)", "Average kcal (ulam)"],
  "feed.protein": ["Karaniwang protina (ulam)", "Average protein (ulam)"],
  "feed.over": ["{n} araw ang lampas sa badyet: wala nang mas murang ulam na hindi pa nagamit.", "{n} day(s) go over budget: no cheaper unused dish was left."],
  "feed.overOne": ["Lampas sa badyet", "Over budget"],
  "feed.day": ["Araw", "Day"],
  "feed.dish": ["Ulam", "Dish"],
  "feed.perHeadShort": ["Bawat tao", "Per head"],
  "feed.dayCost": ["Gastos sa araw", "Day's cost"],
  "feed.grocery": ["Bibilhin para sa lahat ng araw", "Shopping list for all days"],
  "feed.rice": ["Bigas", "Rice"],
  "feed.riceNote": ["Kanin: {g} g hilaw bawat tao (mga 1 tasang luto) sa {price}/kg ({name}, DA ngayon) = {cost} bawat tao, kasama na sa gastos.", "Rice: {g} g uncooked per head (about 1 cup cooked) at {price}/kg ({name}, DA today) = {cost} per head, included in the cost."],
  "feed.riceUnpriced": ["Walang presyo ng bigas mula sa DA ngayon, kaya hindi pa kasama ang kanin sa gastos.", "No DA rice price today, so rice is not in the cost yet."],
  "feed.noRice": ["Walang kanin sa plano (0 g).", "No rice in this plan (0 g)."],
  "feed.again": ["Iba pang menu", "Another menu"],
  "feed.download": ["I-download (text)", "Download (text)"],
  "feed.print": ["I-print", "Print"],
  "feed.note": ["Presyo ngayong araw mula sa DA, PSA, SM at DTI; dami bago lutuin, ayon sa bilang ng serving ng bawat recipe. Para sa bata o may sakit, i-check sa dietitian kung sapat ang sustansya.", "Today's prices from DA, PSA, SM and DTI; amounts as bought, scaled from each recipe's servings. For children or patients, check the nutrition targets with a dietitian."],
  "home.updated": ["Presyo ng DA · na-update noong", "DA market prices · updated"],
  "home.lead": ["Mga lutong Pinoy na niranggo ayon sa sustansya bawat piso, sa presyo ng palengke ngayon. Iplano ang linggo, gamitin ang meron ka, gumastos nang mas kaunti.", "Filipino dishes ranked by nutrition per peso, from today's palengke prices. Plan the week, use what you have, spend less."],
  "home.search": ["Hanapin", "Search"],
  "home.plan": ["Iplano ang linggo →", "Plan my week →"],
  "home.statRecipes": ["recipe", "recipes"],
  "home.statFoods": ["pagkain sa FNRI", "FNRI foods"],
  "home.statPrices": ["presyo sa palengke", "market prices"],
  "wx.auto": ["📍 Auto", "📍 Auto"],
  "wx.sunny": ["☀️ Maaraw", "☀️ Sunny"],
  "wx.rainy": ["🌧️ Maulan", "🌧️ Rainy"],
  "wx.cool": ["🌥️ Malamig", "🌥️ Cool"],
  "wx.label": ["Panahon", "Weather"],
  "wx.sort": ["Ayusin", "Sort"],
  "wx.sort.value": ["Pinaka-sulit", "Best value"],
  "wx.sort.cheap": ["Pinakamura", "Cheapest"],
  "wx.sort.protein": ["Pinakamaraming protina", "Most protein"],
  "wx.sort.kcal": ["Pinakakaunting calories", "Fewest calories"],
  "wx.by": ["Panahon mula sa", "Weather by"],
  "wx.privacy": ["Ang lokasyon mo ay ini-round sa mga 1 km at panghanap lang ng panahon.", "Your location is rounded to about 1 km and only used to look up the weather."],
  "home.topTitle": ["Pinaka-sulit na ulam ngayon", "Top Value Dishes Today"],
  "home.topSub": ["Ayon sa Sulit Score (sustansya ÷ gastos bawat serving) ·", "Ranked by Sulit Score (nutrition ÷ cost per serving) ·"],
  "home.daPrices": ["presyo ng DA", "DA prices"],
  "home.viewAll": ["Tingnan lahat →", "View all →"],
  "how.title": ["Paano ito gumagana", "How It Works"],
  "how.da": ["Presyo ng DA", "DA Price Index"],
  "how.recipes": ["Mga Pinoy recipe site", "Filipino Recipe Sites"],
  "how.fnri": ["Sustansya mula sa FNRI", "FNRI Nutrition Data"],
  "how.daText": ["Araw-araw na presyo ng Department of Agriculture sa mga palengke ng Metro Manila: gulay, karne, isda, bigas at iba pa. Kusang na-a-update araw-araw.", "Daily prevailing prices from the Department of Agriculture for Metro Manila markets — vegetables, meat, fish, rice, and more. Updated automatically every day."],
  "how.recipesText": ["Mga ulam mula sa Panlasang Pinoy, Kawaling Pinoy at iba pang Pinoy recipe site: sangkap, serving at oras ng luto, may link sa bawat recipe para sa paraan ng pagluto. Itinutugma ang mga sangkap sa presyo ng DA.", "Dishes from Panlasang Pinoy, Kawaling Pinoy and other Filipino recipe sites: ingredients, servings and cook time, with a link to each recipe for the steps. Ingredients are matched to DA commodity prices."],
  "how.fnriText": ["Sustansya mula sa FNRI Food Composition Table, ang pamantayan sa Pilipinas: calories, protina, bitamina at mineral bawat 100 g ng bawat sangkap.", "Nutritional values from the FNRI Food Composition Table — the Philippine standard. Calories, protein, vitamins, minerals per 100g for each ingredient."],
  "browse.sub": ["I-filter at ayusin ayon sa sustansya, presyo o sangkap. Presyo mula sa DA noong", "Filter and sort by nutrition, price, or specific produce. Prices based on"],
  "browse.subEnd": [".", " DA data."],
  "sort.valueScore": ["Pinaka-sulit (Sulit Score)", "Best Value (Sulit Score)"],
  "sort.nutritionScore": ["Pinakamasustansya", "Most Nutritious"],
  "sort.costPerServing": ["Pinakamura bawat serving", "Cheapest per Serving"],
  "sort.protein": ["Pinakamaraming protina", "Highest Protein"],
  "sort.calories": ["Pinakamaraming calories", "Highest Calories"],
  "sort.caloriesAsc": ["Pinakakaunting calories", "Lowest Calories"],
  "sort.proteinPerPeso": ["Pinakamaraming protina bawat ₱", "Most Protein per ₱"],
  "sort.proteinPer100kcal": ["Pinakamaraming protina bawat calorie", "Most Protein per Calorie"],
  "ph.eg15": ["hal. 15", "e.g. 15"],
  "ph.eg60": ["hal. 60", "e.g. 60"],
  "ph.produce": ["hal. kangkong, baboy", "e.g. kangkong, pork"],
  "preset.light": ["Magaan (≤ 400 kcal)", "Light (≤ 400 kcal)"],
  "preset.regular": ["Katamtaman (400–700)", "Regular (400–700)"],
  "preset.hearty": ["Busog (700+)", "Hearty (700+)"],
  "preset.protein": ["Mataas sa protina (25 g+)", "High protein (25 g+)"],
  "preset.ppk": ["💪 Ayon sa protina bawat calorie", "💪 Rank by protein per calorie"],
  "prices.title": ["Presyo sa palengke ngayon", "DA Daily Price Monitoring"],
  "prices.source": ["Mula sa DA Daily Price Index: karaniwang presyo sa mga palengke ng Metro Manila · kusang na-a-update araw-araw", "Source: Department of Agriculture Daily Price Index, NCR prevailing retail prices · updated automatically every day"],
  "prices.alerts": ["🔔 Mga alerto mo sa presyo", "🔔 Your price alerts"],
  "prices.alertsNote": ["Naka-save sa device na 'to. Tinitingnan tuwing bubuksan mo ang site at bawat oras habang bukas ito.", "Saved on this device. Checked whenever you open the site and every hour while it's open."],
  "prices.compare": ["Ikumpara sa", "Compare with"],
  "prices.period.week": ["Nakaraang linggo", "Last week"],
  "prices.period.twoWeeks": ["2 linggo na", "2 weeks ago"],
  "prices.period.month": ["Nakaraang buwan", "Last month"],
  "prices.movers": ["Ulam na nagbago ang gastos", "Ulam whose cost changed"],
  "prices.pricier": [" ", "(pricier)"],
  "prices.cheaper": [" ", "(cheaper)"],
  "prices.moversNote": ["Gastos bawat serving mula sa mga sangkap na may presyo sa parehong petsa. Ang presyo lang ng DA ang nagbabago araw-araw; nakapirmi ang presyo ng SM at DTI.", "Cost per serving from ingredients priced on both dates. Only DA prices change day to day; SM and DTI reference prices are fixed."],
  "prices.table": ["Presyo ng bilihin", "Commodity prices"],
  "prices.cat.all": ["Lahat", "All"],
  "prices.cat.vegetables": ["Gulay", "Vegetables"],
  "prices.cat.fish": ["Isda at seafood", "Fish & Seafood"],
  "prices.cat.meat": ["Karne at manok", "Meat & Poultry"],
  "prices.cat.staple": ["Bigas at iba pa", "Rice & Staples"],
  "prices.cat.fruits": ["Prutas", "Fruits"],
  "prices.cat.condiments": ["Asukal, asin at mantika", "Sugar, Salt & Oil"],
  "prices.sort.name": ["Ayusin: A–Z", "Sort: A–Z"],
  "prices.sort.up": ["Pinakamalaking taas", "Biggest increase (chosen period)"],
  "prices.sort.down": ["Pinakamalaking baba", "Biggest drop (chosen period)"],
  "th.commodity": ["Bilihin", "Commodity"],
  "th.local": ["Lokal na pangalan", "Local Name"],
  "th.unit": ["Yunit", "Unit"],
  "th.low": ["Pinakamababa, 30 araw (₱)", "30-day Low (₱)"],
  "th.high": ["Pinakamataas, 30 araw (₱)", "30-day High (₱)"],
  "th.latest": ["Ngayon (₱)", "Latest (₱)"],
  "th.trend": ["Galaw", "Trend"],
  "prices.footnote": ["* Karaniwang presyo sa mga palengke ng Metro Manila, mula sa DA Daily Price Index. Ang pinakamababa at pinakamataas ay sa nakaraang 30 araw. Ikinukumpara ng kolum ng pagbabago ang presyo ngayon sa presyo mga isang buwan bago nito (ang petsa ay nasa heading).", "* Prevailing retail prices in Metro Manila markets, from the DA Daily Price Index. Low and high are the range over the last 30 days. The change column compares the latest price with the price about a month earlier (the date in its heading)."],
  "mydish.title": ["Ulam ko", "My Dish"],
  "mydish.sub": ["Gumawa ng sariling ulam, o pindutin ang “Baguhin” sa kahit anong recipe para palitan ang sangkap. Makikita ang gastos bawat serving, sustansya at galaw ng presyo. Naka-save sa device na 'to lang.", "Build your own dish, or tap “Customize this dish” on any recipe to change its ingredients. See its cost per serving, nutrition and how its price moved. Dishes are saved on this device only."],
  "planner.sub": ["Iplano ang almusal, tanghalian, meryenda at hapunan ng isang linggo, at tingnan ang gastos: bawat ulam, o listahan ng bibilhin bawat sangkap. Naka-save sa device na 'to lang.", "Plan a week of almusal, tanghalian, meryenda and hapunan, and see what it costs: per dish, or as a shopping list per ingredient. Saved on this device only."],
  "finder.sub": ["Piliin ang meron ka sa bawat grupo. Lalabas ang mga ulam na kaya mong lutuin, nakakabit sa bawat sangkap. I-tap ang ulam para buksan ang recipe. Naka-save sa device na 'to lang.", "Pick what you have from each group. Every ingredient becomes a node, linked to the dishes you can cook with it. Hover a node to see its links; tap a dish to open the recipe. Saved on this device only."],
  "finder.basics": ["Meron akong pangunahing sangkap: asin, paminta, mantika, bawang, sibuyas, toyo, patis, suka, asukal, dahon ng laurel", "I have the basics: salt, pepper, oil, garlic, onion, soy sauce, patis, vinegar, sugar, bay leaf"],
  "finder.empty": ["Pumili ng sangkap sa kaliwa: lalabas ito dito, kasama ang mga ulam na kaya mong lutuin.", "Pick an ingredient on the left: it appears here as a node, and the dishes you can cook grow out of it."],
  "finder.have": ["sangkap na meron ka", "ingredient you have"],
  "tour.skip": ["Laktawan", "Skip"],
  "tour.back": ["← Bumalik", "← Back"],
  "alert.title": ["🔔 Alerto sa presyo", "🔔 Price alert"],
  "alert.below": ["Sabihan ako kapag bumaba sa", "Tell me when it's below"],
  "alert.cancel": ["Huwag na", "Cancel"],
  "alert.save": ["I-save ang alerto", "Save alert"],
  "share.title": ["I-share ang recipe na 'to", "Share this recipe"],
  "share.help": ["I-save ang larawan, tapos ipadala sa Messenger kasama ang link. Sa phone, ang Share button ay diretsong nagpapadala sa Messenger.", "Save the picture, then send it in Messenger with the link. On a phone, the Share button sends it to Messenger directly."],
  "share.save": ["⬇ I-save ang larawan", "⬇ Save picture"],
  "share.copy": ["Kopyahin ang link", "Copy link"],
  "share.messenger": ["Buksan ang Messenger ↗", "Open Messenger ↗"],
  "cat.Main Dish": ["Ulam", "Main Dish"],
  "cat.Soup": ["Sabaw", "Soup"],
  "cat.Fish & Seafood": ["Isda at seafood", "Fish & Seafood"],
  "cat.Vegetable Dish": ["Gulay", "Vegetable Dish"],
  "cat.Rice & Noodles": ["Kanin at pansit", "Rice & Noodles"],
  "cat.Dessert": ["Panghimagas at kakanin", "Dessert"],
  "cat.Sauce & Condiment": ["Sawsawan at sarsa", "Sauce & Condiment"],
  "modal.ingredients": ["Mga sangkap", "Ingredients"],
  "modal.totalCost": ["Tantyang kabuuang gastos", "Estimated total cost"],
  "modal.alertMe": ["🔔 Sabihan ako kapag mas mura na", "🔔 Alert me when this gets cheaper"],
  "modal.servings": ["serving", "servings"],
  "modal.servingsAssumed": [" (tantya: hindi sinabi ng recipe)", " (assumed: the recipe doesn’t say)"],
  "modal.kcalServing": ["kcal/serving", "kcal/serving"],
  "modal.fried": [" · prito: tantya ang naa-absorb na mantika", " · fried: oil absorption estimated"],
  "modal.priced": ["% ng sangkap (ayon sa timbang) ang may presyo", "% of ingredients (by weight) priced"],
  "modal.incomplete": ["Kulang ang presyo:", "Incomplete price data:"],
  "modal.incompleteText": ["wala pang presyo ang {list}. Mas mataas ang totoong gastos kaysa sa nakikita, kaya nasa huli ang ulam na 'to.", "no price yet for {list}. The real cost is higher than shown, so this dish is listed last."],
  "modal.recipePhoto": ["Recipe at larawan:", "Recipe & photo:"],
  "modal.fullRecipe": ["Nasa {src} ang buong recipe: ang mga hakbang, tips at video ng gumawa nito.", "The full recipe is on {src}: the steps, tips and the cook's video."],
  "modal.seeRecipe": ["📖 Tingnan ang recipe sa {src} ↗", "📖 See the recipe on {src} ↗"],
  "browse.hidden": ["{n} recipe ang nakatago: may sangkap na wala pa sa listahan namin.", "{n} recipes hidden: ingredients not in our catalog yet."],
  "browse.found": ["{n} recipe ang nakita", "{n} recipes found"],
  "browse.byTaste": [" · ayon sa panlasa mo 🧠", " · sorted by your panlasa 🧠"],
  "fact.title": ["💡 Alam mo ba?", "💡 Did you know?"],
  "fact.more": ["Isa pa ↻ ({n})", "Another ↻ ({n})"],
  "alerts.none": ["Wala pang alerto. Pindutin ang 🔔 sa presyo sa ibaba, o ang “Sabihan ako” sa kahit anong recipe.", "No alerts yet. Tap 🔔 on a price below, or “Alert me” on any recipe."],
  "card.incomplete": ["⚠ Kulang ang presyo", "⚠ Incomplete price"],
  "card.protein": ["g protina", "g protein"],
  "occ.show": ["Tingnan ang mga handa ▾", "See the picks ▾"],
  "occ.hide": ["Itago ▴", "Hide ▴"],
  "occ.more": ["Iba pa (+{n})", "More (+{n})"],
  "tour.next": ["Sunod →", "Next →"],
  "age.skip": ["Laktawan muna", "Skip for now"],
  "age.skipNote": ["Pwede mong ilagay mamaya sa ⚙️ Settings.", "You can set it later in ⚙️ Settings."],
  "pcal.title": ["Mura ngayong", "Usually cheap in"],
  "pcal.month": ["Buwan", "Month"],
  "pcal.cheap": ["Karaniwang mas mura", "Usually cheaper"],
  "pcal.dear": ["Karaniwang mas mahal", "Usually pricier"],
  "pcal.bestMonths": ["Pinakamura tuwing", "Cheapest in"],
  "pcal.cheapestMonths": ["Hintayin ang", "Wait for"],
  "pcal.none": ["Walang malaking pagbabago ngayong buwan.", "Nothing moves much this month."],
  "pcal.calendar": ["Kalendaryo ng presyo", "Price calendar"],
  "pcal.item": ["Paninda", "Item"],
  "pcal.keyCheap": ["mas mura kaysa karaniwan", "cheaper than usual"],
  "pcal.keyDear": ["mas mahal kaysa karaniwan", "pricier than usual"],
  "pcal.note": ["Mula sa buwanang presyo ng PSA sa palengke ({span}, Metro Manila). Ang % ay kumpara sa karaniwang presyo ng bawat paninda sa buong taon, hindi hula ng presyo bukas.", "From PSA monthly market prices ({span}, Metro Manila). The % compares each month with that item's usual price over the year; it is a pattern, not a forecast."],
  "card.nutrition": ["Sustansya", "Nutrition"],
  "card.plusLegend": ["“+” sa presyo: may sangkap na wala pang presyo", "“+” on a price: some ingredients have no price yet"],
  "browse.saucesOut": ["walang sawsawan at sauce dito (i-search para makita)", "sauces left out (search to find them)"],
  "browse.filters": ["Filter", "Filters"],
  "browse.filtersDone": ["Ipakita ang resulta", "Show results"],
  "modal.close": ["Isara", "Close"],
  "modal.total": ["buong ulam", "whole dish"],
  "modal.share": ["I-share", "Share"],
  "modal.video": ["Video", "Video"],
  "modal.customize": ["Baguhin", "Customize"],
  "plan.overBudget": ["₱{total} vs ₱{budget} mo", "₱{total} vs your ₱{budget}"],
  "plan.overTip": ["Pinakamurang linggo na ito. Subukan ang “Ulam lang”, 1 ulam bawat kain, o dagdagan ang budget.", "This is the cheapest week. Try “Ulam lang”, 1 ulam per meal, or a bigger budget."],
  "plan.start": ["Saan magsisimula?", "Where to start?"],
  "plan.start1": ["I-type ang budget at ilan kayo", "Type your budget and how many you are"],
  "plan.start2": ["o pindutin ang 🎲 Random week", "or tap 🎲 Random week"],
  "plan.start3": ["Palitan ang ayaw mo, tapos tingnan ang resibo", "Swap what you don't like, then check the receipt"],
  "modal.sulit": ["Sulit meter", "Sulit meter"],
  "modal.betterThan": ["Mas sulit sa {pct}% ng ulam", "Better value than {pct}% of dishes"],
  "modal.unranked": ["Kulang pa ang data", "Not enough data"],
  "modal.perServing": ["Bawat serving", "Per serving"],
  "modal.nutrition": ["Sustansya (score)", "Nutrition score"],
  "modal.sodium": ["Sodium (asin)", "Sodium (salt)"],
  "modal.sodiumLimit": ["ng daily limit", "of daily limit"],
  "modal.salty": ["⚠ Maalat: {pct}% ng daily limit sa isang serving", "⚠ Salty: {pct}% of the daily limit in one serving"],
  "modal.saltyFrom": ["karamihan mula sa", "mostly from"],
  "modal.sodiumToTaste": ["+ may asin, patis o toyo na “to taste” na hindi nabilang, kaya mas mataas pa ito", "+ salt, patis or soy sauce “to taste” is not counted, so it’s higher"],
  "modal.cookedNote": ["≈ Bitamina at mineral pagkaluto", "≈ Vitamins and minerals after cooking"],
  "modal.cookedRaw": ["hilaw na sangkap", "raw ingredients"],
  "modal.cookedHelp": ["Nababawasan ang vitamin C sa init at sa tubig na itinatapon. Ang iron at calcium ay nasa sabaw kung kinakain ito. Tantya mula sa USDA at iba pang food table; nag-iiba depende sa tagal ng luto. Ang ranking ay batay pa rin sa hilaw na sangkap.", "Vitamin C is lost to heat and to cooking water that is thrown away. Iron and calcium stay in the broth when it is eaten. Estimate from USDA and other food tables; real values depend on cooking time. Rankings still use the raw-ingredient values."],
  "cook.raw": ["hilaw", "raw"],
  "cook.acid": ["kinilaw (suka, walang init)", "kinilaw (vinegar, no heat)"],
  "cook.blanch": ["saglit na luto", "cooked briefly"],
  "cook.boil_drained": ["pinakuluan, tinapon ang tubig", "boiled, water drained"],
  "cook.boil_broth": ["sinabawan, kinakain ang sabaw", "simmered, broth eaten"],
  "cook.stew": ["nilaga nang matagal sa sarsa", "stewed in its sauce"],
  "cook.saute": ["ginisa", "sautéed"],
  "cook.steam": ["pinasingawan", "steamed"],
  "cook.deep_fry": ["prito (lubog sa mantika)", "deep-fried"],
  "cook.pan_fry": ["prito sa kawali", "pan-fried"],
  "cook.grill": ["inihaw", "grilled"],
  "cook.bake": ["hurno", "baked"],
  "cook.microwave": ["microwave", "microwaved"],
  "cook.pressure": ["pressure cooker", "pressure-cooked"],
  "cook.cooked": ["hindi tiyak ang paraan ng luto", "cooking method not clear"],
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
  "settings.lang": ["Wika", "Language"],
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
  "settings.age": ["Edad at laki ng text", "Age and text size"],
  "settings.large": ["Malaking text at simpleng menu:", "Large text and a simpler menu:"],
  "settings.largeHelp": ["Para sa 60 pataas ito kusang bukas: mas malaking letra at button, at nakatago ang Laro.", "Turned on by itself for 60 and over: bigger letters and buttons, and Games is hidden."],
  "age.title": ["Ilang taon ka na?", "How old are you?"],
  "age.intro": ["Para maayos namin ang SarapSulit para sa'yo. Sa phone mo lang ito naka-save.", "So we can set up SarapSulit for you. It stays on your phone."],
  "age.child": ["12 pababa", "12 or under"],
  "age.teen": ["13–17", "13–17"],
  "age.young": ["18–29", "18–29"],
  "age.adult": ["30–44", "30–44"],
  "age.midlife": ["45–59", "45–59"],
  "age.senior": ["60 pataas", "60 and over"],
  "age.seniorNote": ["60 pataas: lalaki ang text at magiging mas simple ang menu.", "60 and over: the text gets bigger and the menu simpler."],
  "privacy.visits": ["Binibilang namin ang mga bumibisita gamit ang IP address, na naka-scramble na code lang ang itinatago (hindi ang mismong address), kung saang lungsod galing, at ang age bracket na pinili mo. Hindi binibilang ang browser na naka-“Do Not Track”.", "We count visitors by IP address, stored only as a scrambled code (never the address itself), plus the city it comes from and the age bracket you chose. Browsers set to “Do Not Track” aren't counted."],
  "fb.open": ["Mag-review o mag-suggest", "Review or suggest"],
  "fb.title": ["Ano'ng masasabi mo?", "Tell us what you think"],
  "fb.intro": ["Binabasa namin lahat. Salamat sa pagtulong na gumanda ang SarapSulit!", "We read every message. Thank you for helping make SarapSulit better!"],
  "fb.review": ["⭐ Review", "⭐ Review"],
  "fb.suggestion": ["💡 Suggestion", "💡 Suggestion"],
  "fb.problem": ["⚠️ May problema", "⚠️ Problem"],
  "fb.stars": ["Ilang bituin?", "How many stars?"],
  "fb.message": ["Mensahe", "Message"],
  "fb.message.ph": ["Hal. Sana may Bicol Express na mas mura…", "E.g. I'd love more budget fish dishes…"],
  "fb.name": ["Pangalan (kung gusto mo)", "Name (optional)"],
  "fb.contact": ["Email o Facebook, kung gusto mong sagutin ka", "Email or Facebook, if you'd like a reply"],
  "fb.send": ["Ipadala", "Send"],
  "fb.cancel": ["Huwag na", "Cancel"],
  "fb.direct": ["O kontakin kami nang direkta:", "Or contact us directly:"],
  "fb.thanks": ["Salamat! Natanggap namin.", "Thank you! We got it."],
  "fb.close": ["Isara", "Close"],
  "fb.err.empty": ["Magsulat ng maikling mensahe.", "Write a short message."],
  "fb.err.empty.review": ["Pumili ng bituin o magsulat ng maikling mensahe.", "Pick the stars or write a short message."],
  "fb.err.later": ["Pakisubukan ulit mamaya.", "Please try again later."],
  "fb.err.mail": ["Hindi maipadala dito, kaya binuksan ang email app mo na may mensahe na. O mag-email sa", "Couldn't send from here, so your email app opened with the message. Or email"],
  "contact.title": ["Kontakin kami", "Contact us"],
  "contact.feedback": ["💬 Review o suggestion", "💬 Review or suggestion"],
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
  if (!document.getElementById("settings-dialog").classList.contains("hidden")) {
    // Redrawn on every change: keep keyboard focus on the same control.
    if (typeof dlgKeepFocus === "function") dlgKeepFocus(document.getElementById("settings-body"), renderSettings); else renderSettings();
  }
  if (typeof RECIPES !== "undefined" && RECIPES.length) {
    if (typeof filterRecipes === "function") filterRecipes();
    if (typeof renderOccasion === "function") renderOccasion();
    if (typeof renderPicker === "function" && document.getElementById("plan-picker")) renderPicker();
    if (typeof renderReceipt === "function" && document.getElementById("plan-receipt")) renderReceipt();
    if (typeof renderPriceForYou === "function") renderPriceForYou(typeof moversFell !== "undefined" ? moversFell : new Map());
  }
  if (typeof renderPriceCalendar === "function") renderPriceCalendar();
}

// ── Age bracket and large text ──

/** Large text and the simpler menu (html.senior), from the saved setting. */
function applyAgeMode() {
  document.documentElement.classList.toggle("senior", !!SETTINGS.large);
}

function setAge(age) {
  SETTINGS = withAge(SETTINGS, age);
  applyAgeMode();
  settingsChanged();
  if (typeof trackEvent === "function") trackEvent(`age/${SETTINGS.age || "skip"}`);
}

function setLarge(on) { SETTINGS = { ...SETTINGS, large: on }; applyAgeMode(); settingsChanged(); }

function ageDialogOpen() {
  const d = document.getElementById("age-dialog");
  return !!d && !d.classList.contains("hidden");
}

function openAgeDialog() {
  document.getElementById("age-dialog").classList.remove("hidden");
  // Required answer: focus stays inside, and Esc doesn't close it.
  if (typeof dlgOpen === "function") dlgOpen(document.querySelector("#age-dialog .age-card"), null);
}

/** The first-visit answer (required: the dialog has no skip); the tour starts after this closes. */
function chooseAge(age) {
  setAge(age);
  document.getElementById("age-dialog").classList.add("hidden");
  if (typeof dlgClose === "function") dlgClose(document.querySelector("#age-dialog .age-card"));
}

function setLang(lang) { SETTINGS = { ...SETTINGS, lang, langChosen: true }; settingsChanged(); }
function toggleDietSetting(key) { SETTINGS = { ...SETTINGS, diets: toggleIn(SETTINGS.diets, key) }; settingsChanged(); }
function clearDietSetting() { SETTINGS = { ...SETTINGS, diets: [] }; settingsChanged(); }
function setSuggest(on) { SETTINGS = { ...SETTINGS, suggest: on }; settingsChanged(); }
function toggleMeat(key) { SETTINGS = { ...SETTINGS, meats: key ? toggleIn(SETTINGS.meats, key) : [] }; settingsChanged(); }

// ── The Settings dialog ──

function openSettings() {
  renderSettings();
  document.getElementById("settings-dialog").classList.remove("hidden");
  if (typeof dlgOpen === "function") dlgOpen(document.querySelector("#settings-dialog .settings-card"), closeSettings);
  if (typeof trackEvent === "function") trackEvent("settings/open");
}

function closeSettings() {
  document.getElementById("settings-dialog").classList.add("hidden");
  if (typeof dlgClose === "function") dlgClose(document.querySelector("#settings-dialog .settings-card"));
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
      <h3>${t("settings.age")}</h3>
      <div class="flex flex-wrap gap-2">${SETTINGS_AGES.map((a) => settingsChoice(SETTINGS.age === a, `setAge('${a}')`, t(`age.${a}`))).join("")}</div>
      <div class="flex flex-wrap items-center gap-2 mt-2"><span class="set-help">${t("settings.large")}</span>
        ${settingsChoice(SETTINGS.large, "setLarge(true)", t("settings.on"))}${settingsChoice(!SETTINGS.large, "setLarge(false)", t("settings.off"))}</div>
      <p class="set-help">${t("settings.largeHelp")}</p>
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
  // Before the first paint, so a senior's page never flashes small.
  applyAgeMode();
  const start = () => {
    applyLang(); renderMeatChips(); renderDietSummary();
    if (shouldAskAge(SETTINGS, window.location.hash)) openAgeDialog();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
