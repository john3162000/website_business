// "Alam mo ba?" facts for the recipe pop-up. Dish facts match the title;
// ingredient facts fill in for dishes without one. Only well-documented
// facts; stories that can't be confirmed say so ("is said to", "a popular story").

const FACTS_DISH = [
  [/adobo/i, [
    "The name comes from the Spanish \"adobar\" (to marinate), but cooking meat in vinegar to keep it longer was done here before the Spanish came.",
    "Adobo is often called the unofficial national dish of the Philippines, and almost every family has its own version.",
    "Many cooks swear adobo tastes even better the next day, once the meat has soaked up more of the sauce.",
  ]],
  [/sinigang/i, [
    "Sinigang's sourness traditionally comes from sampalok (tamarind), but kamias, bayabas, kalamansi, santol and even miso are used too.",
    "Gabi (taro) is often added to sinigang because it softens and thickens the broth.",
  ]],
  [/kare.?kare/i, [
    "Kare-kare's thick sauce comes from ground peanuts, and it's traditionally eaten with bagoong alamang on the side.",
    "Kare-kare's orange colour traditionally comes from atsuete (annatto) seeds.",
  ]],
  [/kaldereta|caldereta/i, [
    "Kaldereta is named after the Spanish \"caldera\", a cauldron.",
    "Many kaldereta recipes thicken the sauce with liver spread or mashed liver.",
  ]],
  [/lechon kawali/i, ["\"Kawali\" is the wok-like pan the pork belly is deep-fried in, after it's boiled until tender."]],
  [/^lechon\b(?! (kawali|manok|paksiw|sauce))|cebu lechon|lechon baboy/i, ["\"Lechón\" is Spanish for a suckling pig; \"leche\" means milk.", "Anthony Bourdain famously praised Cebu's lechon as the best pig he'd ever had."]],
  [/lechon manok/i, ["Lechon manok is roasted on a turning spit, often with lemongrass stuffed inside the chicken."]],
  [/crispy pata/i, ["\"Pata\" is the pork leg. It's boiled first, dried, then deep-fried until the skin puffs and crackles."]],
  [/sisig/i, [
    "Sisig comes from Pampanga. The sizzling-plate version was made famous in Angeles City.",
    "In old Kapampangan, \"sisig\" meant a sour dish of unripe fruit with vinegar and salt. The pork version came much later.",
  ]],
  [/bicol express/i, ["Bicol Express is said to be named after the train that ran between Manila and the Bicol region."]],
  [/tinola/i, [
    "Tinola appears in José Rizal's novel Noli Me Tangere.",
    "In Noli Me Tangere, Padre Dámaso sulks when his bowl of tinola gets only the chicken neck and a wing.",
  ]],
  [/nilaga/i, ["\"Nilaga\" simply means \"boiled\". The clear broth gets its flavour from slowly simmered bones."]],
  [/bulalo/i, ["Bulalo is beef shank and marrow bone soup, a favourite in Batangas and cool Tagaytay."]],
  [/batchoy/i, ["Batchoy comes from La Paz, Iloilo: noodle soup with pork, liver and crushed chicharon on top."]],
  [/pancit habhab/i, ["Pancit habhab from Lucban is served on a banana leaf and eaten straight off it, without utensils."]],
  [/pancit|bihon|canton|sotanghon|palabok|miki/i, [
    "Pancit is served at birthdays because long noodles stand for long life.",
    "Pancit came to the Philippines with Chinese traders; the word is often traced to Hokkien for \"something conveniently cooked\".",
  ]],
  [/palabok/i, ["Palabok's orange shrimp sauce is topped with crushed chicharon, tinapa flakes and egg."]],
  [/lumpia/i, ["Lumpia came from Chinese spring rolls. The Shanghai kind is thin, fried and filled with ground pork."]],
  [/lumpiang ubod/i, ["Ubod is the tender heart of the coconut palm."]],
  [/tokwa.?t baboy/i, ["Tokwa't baboy is a classic partner of lugaw: \"lugaw at tokwa't baboy\" is a street-food staple."]],
  [/menudo/i, ["Filipino menudo is a tomato-based pork stew with liver, nothing like Mexican menudo, which is a tripe soup."]],
  [/afritada/i, ["Afritada's name comes from the Spanish \"fritada\". Its cousins are menudo, kaldereta and mechado."]],
  [/mechado/i, ["Mechado is said to be named after \"mecha\" (wick): strips of pork fat pushed into the beef like candle wicks."]],
  [/laing/i, ["Laing is from Bicol: dried taro (gabi) leaves slowly cooked in coconut milk with chili."]],
  [/pinakbet|pakbet/i, ["Pinakbet is an Ilocano dish. The name is said to come from \"pinakebbet\", meaning shrunk or shrivelled."]],
  [/dinuguan/i, ["Dinuguan is a savory stew made with pork blood, which is why it's jokingly called \"chocolate meat\"."]],
  [/bistek/i, ["Bistek is the Filipino take on \"beef steak\": thin slices of beef in soy sauce, kalamansi and onion rings."]],
  [/silog|tapsi/i, ["\"-Silog\" meals are named for sinangag (garlic rice) + itlog (egg): tapsilog, tosilog, longsilog and more."]],
  [/tapa\b/i, ["Tapa is beef cured in salt and seasoning, an old way of keeping meat before refrigerators."]],
  [/longganisa|longanisa/i, ["Each region has its own longganisa: Vigan's is garlicky, while Lucban's is known for its oregano."]],
  [/tocino/i, ["In Spain, \"tocino\" means bacon or pork fat; in the Philippines it's sweet cured pork."]],
  [/arroz caldo/i, ["\"Arroz caldo\" is Spanish for \"rice broth\", but the dish itself comes from Chinese congee."]],
  [/goto\b/i, ["Goto is rice porridge cooked with beef tripe, often topped with toasted garlic and kalamansi."]],
  [/lugaw/i, ["Lugaw is the simplest of Filipino rice porridges; add chicken and ginger and it becomes arroz caldo."]],
  [/champorado/i, ["Champorado comes from Mexican champurrado, brought over on the Manila–Acapulco galleons. Many Filipinos eat it with tuyo."]],
  [/halo.?halo/i, ["\"Halo-halo\" means \"mix-mix\": you're meant to stir everything together before eating."]],
  [/leche flan/i, ["A popular story says leche flan used the egg yolks left over when egg whites were used in building old Spanish-era churches."]],
  [/turon/i, ["Turon is saba banana, often with langka (jackfruit), wrapped in lumpia wrapper and fried with caramelised sugar."]],
  [/bibingka/i, ["Traditional bibingka is baked in a clay pot with hot coals both below and on top, a Christmas and Simbang Gabi favourite."]],
  [/puto bumbong/i, ["Puto bumbong gets its purple colour from pirurutong, a dark heirloom glutinous rice, steamed in bamboo tubes."]],
  [/kutsinta/i, ["Kutsinta gets its chewy, bouncy texture from a little lye water (lihiya)."]],
  [/ube/i, ["Ube is a purple yam, not taro; taro (gabi) is a different root."]],
  [/buko pie/i, ["Buko pie is the famous pasalubong of Laguna, especially along the road through Los Baños."]],
  [/polvoron/i, ["Polvoron is made from toasted flour, powdered milk, sugar and butter, pressed into shape in a special mould."]],
  [/kinilaw|kilawin/i, [
    "Kinilaw is \"cooked\" by the acid in vinegar or citrus, not by heat.",
    "Archaeologists in Butuan found fish bones together with tabon-tabon, a fruit still used in kinilaw, from about a thousand years ago.",
  ]],
  [/inasal/i, ["Chicken inasal comes from Bacolod. It's marinated in vinegar, kalamansi and lemongrass, then basted with annatto (atsuete) oil while grilling."]],
  [/chicharon bulaklak/i, ["Chicharon bulaklak is fried pork mesentery; it opens up like a flower (bulaklak) in the hot oil."]],
  [/embutido/i, ["\"Embutido\" is Spanish for sausage; the Filipino version is a steamed pork roll, often with egg and hotdog inside."]],
  [/relleno/i, ["For rellenong bangus, the fish is gently pulled out of its skin, mixed with vegetables, then stuffed back into the same skin."]],
  [/bangus/i, ["Bangus (milkfish) is often called the national fish of the Philippines."]],
  [/spaghetti/i, ["Filipino spaghetti is sweet thanks to banana ketchup, which food scientist María Orosa is credited with developing."]],
  [/tortang talong/i, ["For tortang talong, the eggplant is grilled, peeled and flattened, then dipped in egg and fried."]],
  [/ampalaya/i, ["Rubbing sliced ampalaya with salt and squeezing out the juice makes it less bitter."]],
  [/humba/i, ["Humba is the Visayan cousin of adobo: braised pork made sweeter, often with fermented black beans."]],
  [/kwek.?kwek/i, ["Kwek-kwek are hard-boiled quail eggs in an orange batter, a classic street-food snack with vinegar dip."]],
  [/sopas/i, ["Sopas, the creamy macaroni soup, is a classic rainy-day comfort food in Filipino homes."]],
  [/paksiw/i, ["\"Paksiw\" means cooking in vinegar, which also helped keep food longer in the days before refrigerators."]],
  [/ginataan|ginataang|sa gata/i, ["\"Ginataan\" means cooked in gata (coconut milk), common in Bicol and the Visayas, where coconuts are plentiful."]],
];

const FACTS_INGREDIENT = [
  [/malunggay|moringa/i, "Malunggay leaves are packed with vitamins and are traditionally added to tinola and given to breastfeeding mothers."],
  [/kangkong|water spinach/i, "Kangkong grows in water, which is why it's also called water spinach."],
  [/calamansi|kalamansi/i, "Kalamansi is a small Philippine citrus, used for everything from dipping sauce to juice."],
  [/tamarind|sampalok/i, "Sampalok (tamarind) gives sinigang its classic sour taste; young green pods are the most sour."],
  [/annatto|atsuete|achuete/i, "Atsuete (annatto) seeds add colour, not much flavour; they're what make kare-kare and inasal orange."],
  [/lemongrass|tanglad/i, "Tanglad (lemongrass) is often stuffed inside lechon and lechon manok for its citrusy aroma."],
  [/bagoong/i, "Bagoong is fermented shrimp or fish paste; alamang is the shrimp kind."],
  [/fish sauce|patis/i, "Patis is fermented fish sauce, where a lot of Filipino cooking gets its salty, savory taste."],
  [/saba|plantain/i, "Saba is a cooking banana, firmer and starchier than the bananas eaten raw."],
  [/gabi|taro/i, "Gabi (taro) root softens and thickens soups, and its leaves are used in laing."],
  [/bitter melon|bitter gourd|ampalaya/i, "Ampalaya (bitter gourd) is famous for its bitterness; salting it first tames it."],
  [/eggplant|talong/i, "Talong is one of the vegetables in the folk song \"Bahay Kubo\"."],
  [/string beans|sitaw/i, "Sitaw (string beans) also appears in the folk song \"Bahay Kubo\"."],
  [/coconut milk|coconut cream|gata/i, "\"Kakang gata\" is the first, thickest press of grated coconut; later presses give thinner gata."],
  [/vinegar|suka/i, "Filipino vinegars are made from coconut sap, sugarcane, nipa palm and more, each with its own taste."],
  [/soy sauce|toyo/i, "Toyo (soy sauce) came with Chinese traders and became one of the pillars of Filipino cooking, together with vinegar."],
  [/ginger|luya/i, "Luya (ginger) is the base of tinola and arroz caldo, and salabat, a ginger tea for sore throats."],
];

/** All facts that fit a recipe: dish facts first, then up to two ingredient facts. */
function dishFacts(r) {
  const title = r.title || "";
  const out = [];
  for (const [re, facts] of FACTS_DISH) if (re.test(title)) for (const f of facts) if (!out.includes(f)) out.push(f);
  const ings = (r.ingredientNames || []).join(" | ");
  let added = 0;
  for (const [re, fact] of FACTS_INGREDIENT) {
    if (added >= 2) break;
    if (re.test(ings) && !out.includes(fact)) { out.push(fact); added++; }
  }
  return out;
}

let FACT_INDEX = 0;

/** The "Alam mo ba?" box for the recipe pop-up; "Isa pa" cycles through the facts. */
function factBoxHtml(r) {
  const facts = dishFacts(r);
  if (!facts.length) return "";
  FACT_INDEX = r.id % facts.length;
  return `<div id="fact-box" class="fact-box" data-id="${r.id}">
    <p class="text-xs font-bold uppercase tracking-wide text-amber-800">💡 Alam mo ba?</p>
    <p id="fact-text" class="text-sm mt-1">${escapeHtml(facts[FACT_INDEX])}</p>
    ${facts.length > 1 ? `<button onclick="nextFact()" class="text-xs font-semibold text-green-800 mt-2 hover:underline">Isa pa ↻ (${facts.length} facts)</button>` : ""}
  </div>`;
}

function nextFact() {
  const box = document.getElementById("fact-box");
  const r = box && RECIPES.find((x) => x.id === +box.dataset.id);
  if (!r) return;
  const facts = dishFacts(r);
  FACT_INDEX = (FACT_INDEX + 1) % facts.length;
  document.getElementById("fact-text").textContent = facts[FACT_INDEX];
}
