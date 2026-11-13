// "Napanood mo, lutuin mo": dishes seen in anime and films, on a page of their own. It is not a tab:
// one button in Browse ("Mga ulam mula sa anime at pelikula") leads here, for those who want to look.
// Each title shows the still of an official clip (the studio's own YouTube upload, which it links to)
// and names a published recipe source. Each dish has a freely licensed photo from Wikimedia Commons
// (credited), and today's cost and nutrition, priced live by POST /api/dish (the My Dish engine) from
// our own home-kitchen ingredient lists.
// Uses globals from app.js (API_BASE, escapeHtml, buildRecipe, costText, kcalText, ingredientRows, trackEvent).
// docs/screen.test.mjs tests the pure helpers.

/**
 * Each title: what it is (`kind`), an official clip (`clip`: YouTube id, the channel that posted it and
 * the clip's name), a published recipe source (`ref`), and its dishes. A dish has the scene it comes
 * from, words for a YouTube search of that scene (`find`), a Commons photo (`img`: file name, author,
 * licence), servings and our own ingredient lines [amount, unit, name]; the names are ones the catalog knows.
 */
const SCREEN_TITLES = [
  { key: "naruto", name: "Naruto", kind: { tl: "Anime", en: "Anime" },
    clip: { id: "M5N3TWGthE8", by: "Crunchyroll", name: "Naruto and Kawaki at Ichiraku!" },
    ref: { tl: "Opisyal na cookbook: NARUTO Shippuden: The Official Cookbook (VIZ Media)", en: "Official cookbook: NARUTO Shippuden: The Official Cookbook (VIZ Media)", url: "https://www.viz.com/naruto" },
    dishes: [
      { key: "ramen", name: "Ichiraku-style miso ramen", servings: 4, find: "Ichiraku ramen scene",
        scene: { tl: "Ang paboritong ramen ni Naruto sa Ichiraku.", en: "Naruto's favourite bowl at Ichiraku." },
        img: { file: "Ichiraku Signature Tonkotsu Ramen and Tonkotsu Miso Chashu Ramen sample 20260411.jpg", by: "Solomon203", license: "CC BY-SA 4.0" },
        lines: [[400, "g", "egg noodles"], [300, "g", "pork belly"], [3, "tbsp", "miso paste"], [4, "pieces", "egg"], [2, "stalks", "green onions"],
          [2, "sheets", "nori"], [1, "cup", "bean sprouts"], [4, "cloves", "garlic"], [1, "thumb", "ginger"], [2, "tbsp", "soy sauce"], [6, "cups", "water"]] },
      { key: "onigiri", name: "Tuna mayo onigiri", servings: 4, find: "onigiri rice ball scene",
        scene: { tl: "Kaning binilog, baon ng mga ninja sa misyon.", en: "Rice balls, a ninja's packed meal on missions." },
        img: { file: "Onigiri 001.jpg", by: "Ocdp", license: "CC0" },
        lines: [[4, "cups", "cooked rice"], [2, "sheets", "nori"], [0.5, "tsp", "salt"], [155, "g", "tuna"], [2, "tbsp", "mayonnaise"]] },
      { key: "dango", name: "Hanami dango", servings: 4, find: "dango scene",
        scene: { tl: "Matamis na bilo-bilo sa tuhog, mula sa tindahan ng dango.", en: "Sweet rice dumplings on a stick, from the dango shop." },
        img: { file: "Hanami Dango.jpg", by: "Maakun", license: "CC BY-SA 3.0" },
        lines: [[1.5, "cups", "glutinous rice flour"], [0.25, "cup", "sugar"], [2, "tbsp", "soy sauce"], [1, "tbsp", "cornstarch"], [0.75, "cup", "water"]] },
    ] },
  { key: "onepiece", name: "One Piece", kind: { tl: "Anime", en: "Anime" },
    clip: { id: "dIxPuF1tMxs", by: "Toei Animation", name: "Chef SANJI | ONE PIECE | Official Clip" },
    ref: { tl: "Opisyal na cookbook: One Piece: Pirate Recipes ni Sanji (VIZ Media)", en: "Official cookbook: One Piece: Pirate Recipes by Sanji (VIZ Media)", url: "https://www.simonandschuster.net/books/One-Piece-Pirate-Recipes/Sanji/One-Piece/9781974724468" },
    dishes: [
      { key: "friedrice", name: "Sanji's seafood fried rice", servings: 4, find: "Sanji seafood fried rice Gin scene",
        scene: { tl: "Ang sinangag na inihain ni Sanji sa gutom na pirata.", en: "The fried rice Sanji serves to a starving pirate." },
        img: { file: "Seafood Fried Rice.jpg", by: "ProjectManhattan", license: "CC BY-SA 4.0" },
        lines: [[4, "cups", "cooked rice"], [200, "g", "shrimp"], [200, "g", "squid"], [2, "pieces", "egg"], [4, "cloves", "garlic"], [1, "piece", "onion"],
          [2, "stalks", "green onions"], [2, "tbsp", "soy sauce"], [2, "tbsp", "cooking oil"], [1, "piece", "carrot"], [0.5, "cup", "green peas"]] },
      { key: "meat", name: "Luffy's meat on the bone", servings: 4, find: "Luffy eating meat scene",
        scene: { tl: "Inihaw na hita ng manok bilang karne-sa-buto ni Luffy.", en: "A roast chicken leg stands in for Luffy's meat on the bone." },
        img: { file: "Печени пилешки копани.jpg", by: "Lili Arsova", license: "CC0" },
        lines: [[1, "kg", "chicken leg quarters"], [0.25, "cup", "soy sauce"], [6, "cloves", "garlic"], [2, "tbsp", "brown sugar"], [0.5, "tsp", "black pepper"], [2, "tbsp", "calamansi juice"]] },
      { key: "takoyaki", name: "Hatchan's takoyaki", servings: 4, find: "Hatchan takoyaki scene",
        scene: { tl: "Ang takoyaki ni Hatchan sa Sabaody.", en: "Hatchan's takoyaki stand at Sabaody." },
        img: { file: "Takoyaki dish.jpg", by: "sayo ts", license: "CC0" },
        lines: [[1, "cup", "all purpose flour"], [2, "pieces", "egg"], [150, "g", "octopus"], [1, "cup", "cabbage"], [2, "stalks", "green onions"],
          [2, "tbsp", "mayonnaise"], [2, "tbsp", "worcestershire sauce"], [1, "thumb", "ginger"], [1.5, "cups", "water"]] },
    ] },
  { key: "ratatouille", name: "Ratatouille", kind: { tl: "Pelikula, 2007", en: "Film, 2007" },
    clip: { id: "FjhyXam1Je0", by: "Pixar", name: "Anton Ego Tastes Ratatouille" },
    ref: { tl: "Ang ulam sa pelikula ay ang confit byaldi ni Chef Thomas Keller, food consultant ng pelikula", en: "The film's dish is the confit byaldi of chef Thomas Keller, the film's food consultant", url: "https://en.wikipedia.org/wiki/Confit_byaldi" },
    dishes: [
      { key: "ratatouille", name: "Ratatouille (confit byaldi)", servings: 4, find: "Anton Ego ratatouille scene",
        scene: { tl: "Ang gulay na ulam na nagpaalala sa kritiko ng kanyang kabataan.", en: "The vegetable dish that takes the critic back to his childhood." },
        img: { file: "Confit byaldi 1.jpg", by: "Wikidemon", license: "Public domain" },
        lines: [[2, "pieces", "eggplant"], [2, "pieces", "zucchini"], [4, "pieces", "tomato"], [1, "piece", "red bell pepper"], [1, "piece", "onion"],
          [4, "cloves", "garlic"], [3, "tbsp", "olive oil"], [1, "tsp", "thyme"], [1, "cup", "tomato sauce"], [0.25, "cup", "basil"]] },
      { key: "soup", name: "Remy's potato leek soup", servings: 4, find: "Remy fixes the soup scene",
        scene: { tl: "Ang sopas na inayos ni Remy sa kusina ng Gusteau's.", en: "The soup Remy rescues in Gusteau's kitchen." },
        img: { file: "Potato Leek Soup (4258747258).jpg", by: "Vegan Feast Catering", license: "CC BY 2.0" },
        lines: [[500, "g", "potato"], [2, "stalks", "leeks"], [2, "tbsp", "butter"], [1, "piece", "onion"], [2, "cloves", "garlic"],
          [4, "cups", "chicken broth"], [0.5, "cup", "all purpose cream"], [0.5, "tsp", "thyme"]] },
      { key: "omelette", name: "Remy's cheese omelette", servings: 1, find: "Remy cooks omelette for Linguini scene",
        scene: { tl: "Almusal na niluto ni Remy para kay Linguini.", en: "The breakfast Remy cooks for Linguini." },
        img: { file: "Four cheese omelet with EVOO.jpg", by: "Philipp Michel Reichold", license: "CC BY-SA 4.0" },
        lines: [[3, "pieces", "egg"], [1, "tbsp", "butter"], [0.25, "cup", "cheese"], [1, "tbsp", "parsley"], [1, "tbsp", "milk"]] },
    ] },
  { key: "demonslayer", name: "Demon Slayer", kind: { tl: "Anime", en: "Anime" },
    clip: { id: "6_DdGFIOliU", by: "Crunchyroll", name: "Rengoku's Secret" },
    ref: { tl: "Tungkol sa ulam: gyunabe, ang sukiyaki na baka (Wikipedia)", en: "About the dish: gyunabe, beef sukiyaki (Wikipedia)", url: "https://en.wikipedia.org/wiki/Sukiyaki" },
    dishes: [
      { key: "gyunabe", name: "Rengoku's beef sukiyaki bento", servings: 4, find: "Rengoku bento umai Mugen Train scene",
        scene: { tl: "Ang baon na sunod-sunod na kinain ni Rengoku sa tren.", en: "The boxed meal Rengoku devours on the train." },
        img: { file: "Yonezawa beef sukiyaki at pension in Yonezawa Ski Resort.jpg", by: "Syced", license: "CC0" },
        lines: [[400, "g", "beef sirloin"], [1, "piece", "onion"], [200, "g", "tofu"], [2, "cups", "napa cabbage"], [0.25, "cup", "soy sauce"],
          [2, "tbsp", "sugar"], [100, "g", "shiitake mushrooms"], [4, "cups", "cooked rice"], [50, "g", "sotanghon"]] },
      { key: "tempura", name: "Inosuke's tempura", servings: 4, find: "Inosuke tempura scene",
        scene: { tl: "Ang tempura na paborito ni Inosuke sa bahay ng lola.", en: "The tempura Inosuke falls for at the old lady's house." },
        img: { file: "Tempura shrimp and vegetables - Massachusetts.jpg", by: "Daderot", license: "CC0" },
        lines: [[300, "g", "shrimp"], [1, "piece", "sweet potato"], [1, "piece", "eggplant"], [1, "cup", "all purpose flour"], [2, "tbsp", "cornstarch"],
          [1, "piece", "egg"], [1, "cup", "cooking oil"], [1, "cup", "water"]] },
    ] },
  { key: "jujutsukaisen", name: "Jujutsu Kaisen", kind: { tl: "Anime", en: "Anime" },
    clip: { id: "dBjKYj397LE", by: "Crunchyroll", name: "TOKYO?!" },
    ref: { tl: "Tungkol sa ulam: tsukune, bola-bolang manok (Wikipedia)", en: "About the dish: tsukune, chicken meatballs (Wikipedia)", url: "https://en.wikipedia.org/wiki/Tsukune" },
    dishes: [
      { key: "hotpot", name: "Yuji's chicken meatball hot pot", servings: 4, find: "Yuji meatball hot pot scene",
        scene: { tl: "Ang nilagang bola-bolang manok na niluluto ni Yuji para sa barkada.", en: "The chicken meatball hot pot Yuji cooks for his friends." },
        img: { file: "Chankonabe.jpg", by: "George N", license: "CC BY 2.0" },
        lines: [[400, "g", "ground chicken"], [3, "cups", "napa cabbage"], [1, "thumb", "ginger"], [2, "stalks", "green onions"], [200, "g", "tofu"],
          [100, "g", "mushrooms"], [1, "piece", "egg"], [2, "tbsp", "soy sauce"], [1, "tbsp", "cornstarch"], [6, "cups", "water"]] },
    ] },
  { key: "myheroacademia", name: "My Hero Academia", kind: { tl: "Anime", en: "Anime" },
    clip: { id: "YYXc0lJ5Q48", by: "Crunchyroll", name: "Deku vs Class 1-A" },
    ref: { tl: "Tungkol sa ulam: katsudon (Wikipedia)", en: "About the dish: katsudon (Wikipedia)", url: "https://en.wikipedia.org/wiki/Katsudon" },
    dishes: [
      { key: "katsudon", name: "Deku's katsudon", servings: 2, find: "Deku katsudon favorite food scene",
        scene: { tl: "Ang paboritong ulam ni Deku, luto ng nanay niya.", en: "Deku's favourite meal, the way his mother makes it." },
        img: { file: "Katsudon 001.jpg", by: "Ocdp", license: "CC0" },
        lines: [[300, "g", "pork chop"], [3, "pieces", "egg"], [1, "piece", "onion"], [0.5, "cup", "breadcrumbs"], [0.25, "cup", "all purpose flour"],
          [2, "tbsp", "soy sauce"], [1, "tbsp", "sugar"], [2, "cups", "cooked rice"], [1, "cup", "cooking oil"]] },
    ] },
  { key: "ghibli", name: "Studio Ghibli", kind: { tl: "Mga pelikula", en: "Films" },
    clip: { id: "Guxx_KTm_6M", by: "Netflix Anime", name: "Howl's Moving Castle: Gather Around For Breakfast!" },
    ref: { tl: "Tungkol sa baon: bento (Wikipedia)", en: "About the packed meal: bento (Wikipedia)", url: "https://en.wikipedia.org/wiki/Bento" },
    dishes: [
      { key: "baconeggs", name: "Howl's bacon and eggs", servings: 2, find: "Howl's Moving Castle breakfast scene",
        scene: { tl: "Almusal na niluto ni Howl sa apoy ni Calcifer (Howl's Moving Castle).", en: "The breakfast Howl cooks over Calcifer (Howl's Moving Castle)." },
        img: { file: "Eggs and bacon.jpg", by: "Jon Sullivan", license: "Public domain" },
        lines: [[150, "g", "bacon"], [4, "pieces", "egg"], [4, "slices", "bread"]] },
      { key: "eggtoast", name: "Egg on toast", servings: 1, find: "Castle in the Sky egg toast scene",
        scene: { tl: "Tinapay na may itlog na pinaghatian nina Pazu at Sheeta (Castle in the Sky).", en: "The egg on bread Pazu and Sheeta share (Castle in the Sky)." },
        img: { file: "-2019-01-13 Fried egg with tomato fondue on wholemeal toast, Cromer.jpg", by: "Kolforn", license: "CC BY-SA 4.0" },
        lines: [[1, "slice", "bread"], [1, "piece", "egg"], [1, "tsp", "butter"]] },
      { key: "bento", name: "Satsuki's bento", servings: 1, find: "My Neighbor Totoro Satsuki bento scene",
        scene: { tl: "Ang baon na inihanda ni Satsuki para sa pamilya (My Neighbor Totoro).", en: "The lunch box Satsuki packs for her family (My Neighbor Totoro)." },
        img: { file: "Grilled salmon and mentaiko on rice bento of 7-Eleven in Japan.jpg", by: "毒島みるく", license: "CC0" },
        lines: [[1, "cup", "cooked rice"], [30, "g", "dried fish"], [2, "tbsp", "green peas"], [1, "piece", "egg"], [1, "tsp", "sugar"]] },
    ] },
  { key: "spongebob", name: "SpongeBob SquarePants", kind: { tl: "Cartoon", en: "Cartoon" },
    clip: { id: "5CFWH5r9NC0", by: "SpongeBob SquarePants Official", name: "Krabby Patty Creature Feature!" },
    ref: { tl: "Tungkol sa ulam: Krabby Patty (Wikipedia)", en: "About the dish: Krabby Patty (Wikipedia)", url: "https://en.wikipedia.org/wiki/Krabby_Patty" },
    dishes: [
      { key: "burger", name: "Krabby Patty-style burger", servings: 4, find: "SpongeBob making Krabby Patty scene",
        scene: { tl: "Ang burger ng Krusty Krab; lihim pa rin ang totoong recipe.", en: "The Krusty Krab's burger; the real formula is still a secret." },
        img: { file: "A Homemade Cheeseburger.jpg", by: "Amebrahtu1997", license: "CC0" },
        lines: [[500, "g", "ground beef"], [4, "pieces", "burger buns"], [100, "g", "lettuce"], [1, "piece", "tomato"], [1, "piece", "onion"],
          [4, "slices", "cheese"], [2, "tbsp", "pickle relish"], [2, "tbsp", "ketchup"], [1, "tbsp", "mustard"]] },
    ] },
  { key: "kungfupanda", name: "Kung Fu Panda", kind: { tl: "Pelikula, 2008", en: "Film, 2008" },
    clip: { id: "TD1Pq7Agiis", by: "Paramount+ Australia", name: "Po and Master Shifu battle for dumplings" },
    ref: { tl: "Tungkol sa ulam: siomai (Wikipedia)", en: "About the dish: shumai (Wikipedia)", url: "https://en.wikipedia.org/wiki/Shumai" },
    dishes: [
      { key: "noodlesoup", name: "Mr. Ping's noodle soup", servings: 4, find: "Mr. Ping secret ingredient soup scene",
        scene: { tl: "Ang sopas na may lihim na sangkap ni Mr. Ping.", en: "Mr. Ping's secret ingredient soup." },
        img: { file: "Noodle soup with minced meat, bok choy, and peanuts - Massachusetts.jpg", by: "Daderot", license: "CC0" },
        lines: [[400, "g", "egg noodles"], [6, "cups", "chicken broth"], [1, "piece", "carrot"], [200, "g", "pechay"], [2, "stalks", "green onions"],
          [1, "thumb", "ginger"], [3, "cloves", "garlic"], [2, "tbsp", "soy sauce"]] },
      { key: "dumplings", name: "Po's pork dumplings", servings: 4, find: "Po Shifu dumpling training scene",
        scene: { tl: "Ang dumpling na pinag-agawan nina Po at Master Shifu.", en: "The dumplings Po and Master Shifu fight over." },
        img: { file: "Homemade style pork shumai in Hong Kong.jpg", by: "Peachyeung316", license: "CC BY-SA 4.0" },
        lines: [[400, "g", "ground pork"], [30, "pieces", "wonton wrapper"], [2, "stalks", "green onions"], [1, "thumb", "ginger"], [3, "cloves", "garlic"],
          [2, "tbsp", "soy sauce"], [1, "tbsp", "sesame oil"], [1, "cup", "cabbage"]] },
    ] },
  { key: "haikyu", name: "Haikyu!!", kind: { tl: "Anime", en: "Anime" },
    clip: { id: "S8DqsSznJWY", by: "Crunchyroll", name: "Eat and Grow Stronger" },
    ref: { tl: "Tungkol sa ulam: Japanese curry (Wikipedia)", en: "About the dish: Japanese curry (Wikipedia)", url: "https://en.wikipedia.org/wiki/Japanese_curry" },
    dishes: [
      { key: "nikuman", name: "Sakanoshita meat buns (nikuman)", servings: 8, find: "meat buns Sakanoshita scene",
        scene: { tl: "Ang siopao na binibili ng Karasuno sa tindahan pagkatapos ng ensayo.", en: "The meat buns Karasuno buys at the corner store after practice." },
        img: { file: "肉まん nikuman baozi (3930775841).jpg", by: "Yuya Tamai", license: "CC BY 2.0" },
        lines: [[3, "cups", "all purpose flour"], [1, "tsp", "instant yeast"], [2, "tbsp", "sugar"], [1, "tsp", "baking powder"], [1, "cup", "water"],
          [300, "g", "ground pork"], [1, "piece", "onion"], [50, "g", "shiitake mushrooms"], [1, "thumb", "ginger"], [2, "tbsp", "soy sauce"], [1, "tbsp", "sesame oil"]] },
      { key: "curry", name: "Kageyama's pork curry with egg", servings: 4, find: "Kageyama pork curry egg favorite food",
        scene: { tl: "Paboritong ulam ni Kageyama: pork curry na may malambot na itlog sa ibabaw.", en: "Kageyama's favourite: pork curry with a soft egg on top." },
        img: { file: "Beef curry rice 003.jpg", by: "Ocdp", license: "CC0" },
        lines: [[400, "g", "pork shoulder"], [2, "pieces", "potato"], [1, "piece", "carrot"], [1, "piece", "onion"], [2, "tbsp", "curry powder"],
          [2, "tbsp", "all purpose flour"], [2, "tbsp", "butter"], [4, "cups", "cooked rice"], [4, "pieces", "egg"], [3, "cups", "water"]] },
      { key: "tkg", name: "Hinata's egg over rice (tamago kake gohan)", servings: 1, find: "Hinata favorite food tamago kake gohan",
        scene: { tl: "Paboritong pagkain ni Hinata: kanin na may itlog at toyo.", en: "Hinata's favourite: rice with egg and soy sauce." },
        img: { file: "Tamagokake-gohan 001.jpg", by: "Ocdp", license: "CC0" },
        lines: [[1, "cup", "cooked rice"], [1, "piece", "egg"], [1, "tsp", "soy sauce"], [1, "stalk", "green onions"]] },
    ] },
  { key: "foodwars", name: "Food Wars!", kind: { tl: "Anime", en: "Anime" },
    clip: { id: "TBINEY8hhf4", by: "Crunchyroll", name: "Five Cuisine Fried Rice" },
    ref: { tl: "Tungkol sa ulam: fried rice (Wikipedia)", en: "About the dish: fried rice (Wikipedia)", url: "https://en.wikipedia.org/wiki/Fried_rice" },
    dishes: [
      { key: "chaliapin", name: "Soma's Chaliapin steak don", servings: 2, find: "Soma Chaliapin steak don scene",
        scene: { tl: "Pinalambot ni Soma ang murang baka gamit ang sibuyas, laban sa mamahaling wagyu ni Ikumi.", en: "Soma makes cheap beef tender with onions to take on Ikumi's premium wagyu." },
        img: { file: "Chaliapin sauce.jpg", by: "Hanabishi", license: "CC0" },
        lines: [[300, "g", "beef sirloin"], [2, "pieces", "onion"], [2, "cups", "cooked rice"], [2, "tbsp", "soy sauce"], [2, "tbsp", "rice wine"],
          [1, "tbsp", "sugar"], [1, "tbsp", "butter"], [2, "cloves", "garlic"]] },
      { key: "friedrice", name: "Soma's fried rice", servings: 4, find: "Soma five cuisine fried rice scene",
        scene: { tl: "Isinilid ni Soma ang limang lutuin sa isang sinangag; ito ang simpleng bersyon sa bahay.", en: "Soma packs five cuisines into one fried rice; this is a simple home version." },
        img: { file: "Niku Chahan 06.jpg", by: "ノボホショコロトソ", license: "CC BY 4.0" },
        lines: [[4, "cups", "cooked rice"], [200, "g", "ground pork"], [3, "pieces", "egg"], [4, "cloves", "garlic"], [1, "piece", "onion"],
          [2, "stalks", "green onions"], [2, "tbsp", "soy sauce"], [2, "tbsp", "cooking oil"]] },
    ] },
];

/** A dish's lines in the shape POST /api/dish takes. */
function screenLines(dish) {
  return dish.lines.map(([amount, unit, name]) => ({ amount: String(amount), unit, name, slug: null }));
}

/** "2 tbsp soy sauce": a line as plain text, shown until the prices arrive. */
function screenLineText([amount, unit, name]) {
  const whole = Math.floor(amount), frac = { 0.25: "¼", 0.5: "½", 0.75: "¾" }[Math.round((amount - whole) * 100) / 100];
  const n = frac ? `${whole || ""}${frac}` : String(amount);
  return `${n} ${unit} ${name}`;
}

/** The official clip on YouTube, and its still (served by YouTube itself). */
function screenClipUrl(title) { return `https://www.youtube.com/watch?v=${encodeURIComponent(title.clip.id)}`; }
function screenClipImg(title) { return `https://i.ytimg.com/vi/${encodeURIComponent(title.clip.id)}/hqdefault.jpg`; }

/** A YouTube search for a dish's own scene (title + scene words), so the link never points at a removed upload. */
function screenFindUrl(title, dish) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title.name} ${dish.find}`)}`;
}

/** A Commons photo at a given width, and its file page (for the credit). */
function screenPhoto(img, width = 480) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(img.file)}?width=${width}`;
}
function screenPhotoPage(img) {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(img.file.replace(/ /g, "_"))}`;
}

/** The title and dish for a "title/dish" id, or null. */
function screenFind(id, titles = SCREEN_TITLES) {
  const [tk, dk] = String(id).split("/");
  const title = titles.find((x) => x.key === tk);
  const dish = title && title.dishes.find((d) => d.key === dk);
  return dish ? { title, dish } : null;
}

// ── The page ──

const SCREEN_PRICED = new Map();  // "title/dish" → { r, lines } once priced, or { error }
const SCREEN_SHOWN = new Set();   // "title/dish" ids whose ingredients are unfolded
let SCREEN_PRICING = false;

const screenEn = () => typeof siteLang === "function" && siteLang() === "en";
const screenDom = (id) => id.replace("/", "-");

function toggleScreenLines(id) {
  if (SCREEN_SHOWN.has(id)) SCREEN_SHOWN.delete(id); else SCREEN_SHOWN.add(id);
  const box = document.getElementById(`scr-lines-${screenDom(id)}`);
  const btn = document.querySelector(`[data-scr-toggle="${id}"]`);
  if (box) { box.hidden = !SCREEN_SHOWN.has(id); box.innerHTML = screenLinesHtml(id); }
  if (btn) btn.setAttribute("aria-expanded", String(SCREEN_SHOWN.has(id)));
}

/** Prices every dish once (POST /api/dish), filling in each one's numbers in place as they arrive. */
async function priceScreen() {
  if (SCREEN_PRICING) return;
  SCREEN_PRICING = true;
  const jobs = SCREEN_TITLES.flatMap((title) => title.dishes.map((dish) => ({ id: `${title.key}/${dish.key}`, dish })));
  await Promise.all(jobs.filter((j) => !SCREEN_PRICED.has(j.id)).map(async ({ id, dish }) => {
    try {
      const ingredients = screenLines(dish);
      const res = await fetch(`${API_BASE}/api/dish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: dish.name, servings: dish.servings, ingredients }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      SCREEN_PRICED.set(id, { r: buildRecipe({ id: 0, title: dish.name, servings: dish.servings, ingredients }, data.summary), lines: data.lines });
    } catch (e) {
      SCREEN_PRICED.set(id, { error: e.message });
    }
    const stat = document.getElementById(`scr-stat-${screenDom(id)}`);
    if (stat) stat.innerHTML = screenStatHtml(id);
    const box = document.getElementById(`scr-lines-${screenDom(id)}`);
    if (box && !box.hidden) box.innerHTML = screenLinesHtml(id);
  }));
  SCREEN_PRICING = false;
}

function screenStatHtml(id) {
  const en = screenEn(), p = SCREEN_PRICED.get(id);
  if (!p) return `<span class="scr-wait">${en ? "Pricing…" : "Kinukuwenta…"}</span>`;
  if (p.error) return `<span class="scr-wait">${en ? "Couldn’t get today’s price." : "Hindi makuha ang presyo ngayon."}</span>`;
  const r = p.r;
  return `<span class="scr-cost">${costText(r)}/serving</span><span>${kcalText(r)} kcal</span><span>${r.protein} g protein</span>`;
}

function screenLinesHtml(id) {
  const p = SCREEN_PRICED.get(id), hit = screenFind(id);
  if (p && p.lines) return `<div class="space-y-2">${ingredientRows(p.lines)}</div>`;
  return `<ul class="scr-plain">${hit.dish.lines.map((l) => `<li>${escapeHtml(screenLineText(l))}</li>`).join("")}</ul>`;
}

function screenDishHtml(title, d) {
  const en = screenEn(), id = `${title.key}/${d.key}`, dom = screenDom(id), shown = SCREEN_SHOWN.has(id);
  return `
    <article class="scr-dish">
      <img class="scr-photo" src="${escapeHtml(screenPhoto(d.img))}" alt="" loading="lazy" onerror="this.remove()">
      <div class="scr-dish-body">
        <h3 class="scr-dish-name">${escapeHtml(d.name)}</h3>
        <p class="scr-scene">${escapeHtml(en ? d.scene.en : d.scene.tl)}</p>
        <p class="scr-stat" id="scr-stat-${dom}" aria-live="polite">${screenStatHtml(id)}</p>
        <div class="scr-actions">
          <button type="button" class="scr-btn" data-scr-toggle="${id}" aria-expanded="${shown}" aria-controls="scr-lines-${dom}" onclick="toggleScreenLines('${id}')">${en ? "Ingredients" : "Mga sangkap"}</button>
          <a class="scr-link" href="${escapeHtml(screenFindUrl(title, d))}" target="_blank" rel="noopener noreferrer">${en ? "Find the scene" : "Hanapin ang eksena"}</a>
        </div>
        <div class="scr-lines" id="scr-lines-${dom}"${shown ? "" : " hidden"}>${shown ? screenLinesHtml(id) : ""}</div>
        <p class="scr-credit">${en ? "Photo" : "Larawan"}: <a href="${escapeHtml(screenPhotoPage(d.img))}" target="_blank" rel="noopener noreferrer">${escapeHtml(d.img.by)}</a>, ${escapeHtml(d.img.license)}, Wikimedia Commons</p>
      </div>
    </article>`;
}

function renderScreen() {
  const box = document.getElementById("screen-picks");
  if (!box) return;
  const en = screenEn();
  box.innerHTML = `
    <button type="button" class="scr-back" onclick="showSection('browse')">${en ? "← Back to recipes" : "← Balik sa mga recipe"}</button>
    <h1 class="scr-h1">${en ? "Seen on screen, cooked at home" : "Napanood mo, lutuin mo"}</h1>
    <p class="scr-sub">${en ? "Dishes from anime and films, at today’s palengke prices." : "Mga ulam mula sa anime at pelikula, sa presyo ng palengke ngayon."}</p>
    ${SCREEN_TITLES.map((x) => `
    <section class="scr-title-block" aria-labelledby="scr-t-${x.key}">
      <div class="scr-title-head">
        <a class="scr-clip" href="${escapeHtml(screenClipUrl(x))}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(`${en ? "Watch on YouTube" : "Panoorin sa YouTube"}: ${x.clip.name}`)}">
          <img src="${escapeHtml(screenClipImg(x))}" alt="" loading="lazy">
          <span class="scr-play" aria-hidden="true">▶</span>
        </a>
        <div class="min-w-0">
          <p class="scr-kind">${escapeHtml(en ? x.kind.en : x.kind.tl)}</p>
          <h2 class="scr-name" id="scr-t-${x.key}">${escapeHtml(x.name)}</h2>
          <p class="scr-ref"><a href="${escapeHtml(x.ref.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(en ? x.ref.en : x.ref.tl)}</a></p>
          <p class="scr-credit">${en ? "Clip" : "Clip"}: ${escapeHtml(x.clip.by)}, YouTube</p>
        </div>
      </div>
      <div class="scr-dishes">${x.dishes.map((d) => screenDishHtml(x, d)).join("")}</div>
    </section>`).join("")}
    <p class="scr-fine">${en
      ? "The ingredient lists are our own home-kitchen versions, priced with today’s data; the sources above have the original recipes. Clips belong to their studios and play on YouTube. Fan-made page; not affiliated with or endorsed by the studios."
      : "Sarili naming bersyon sa bahay ang mga sangkap, na kinuwenta sa presyo ngayon; nasa mga source sa itaas ang orihinal na recipe. Pag-aari ng mga studio ang mga clip at sa YouTube pinapanood. Gawa ng fans; hindi kaanib o inendorso ng mga studio."}</p>`;
  priceScreen();
}
