// "Laro" (games): Rate the ulam (1-10 slider with a stretchy-arm cook) and
// Versus (two dishes face off; tap the one you'd rather eat). Plain browser
// script sharing globals with the others; needs RECIPES and escapeHtml from
// app.js at run time. Picks are saved on this device only.

const GAME_RATE_KEY = "sarapsulit.ratings.v1";
const GAME_VS_KEY = "sarapsulit.versus.v1";

// Each side tries its patterns in order; the first pattern with a match wins.
const GAME_MATCHUPS = [
  [{ name: "Sinigang", re: [/^sinigang na baboy/i, /sinigang/i] }, { name: "Adobo", re: [/^chicken adobo/i, /^(pork )?adobo/i, /adobo/i] }],
  [{ name: "Kaldereta", re: [/^beef (kaldereta|caldereta)/i, /kaldereta|caldereta/i] }, { name: "Kare-Kare", re: [/^kare.?kare/i, /kare.?kare/i] }],
  [{ name: "Lechon Kawali", re: [/lechon kawali/i] }, { name: "Crispy Pata", re: [/crispy pata/i] }],
  [{ name: "Sisig", re: [/^pork sisig/i, /sisig/i] }, { name: "Bicol Express", re: [/bicol express/i] }],
  [{ name: "Tinola", re: [/^chicken tinola/i, /tinola/i] }, { name: "Nilaga", re: [/^nilagang baka/i, /nilaga/i] }],
  [{ name: "Pancit Canton", re: [/pancit canton/i] }, { name: "Pancit Bihon", re: [/pancit bihon/i] }],
  [{ name: "Lumpiang Shanghai", re: [/^lumpiang shanghai/i, /lumpiang shanghai/i, /lumpia/i] }, { name: "Tokwa't Baboy", re: [/tokwa.?t baboy/i] }],
  [{ name: "Menudo", re: [/menudo/i] }, { name: "Afritada", re: [/^(chicken|pork) afritada( recipe)?$/i, /^(chicken|pork) afritada/i, /afritada(?!ng itlog)/i] }],
  [{ name: "Laing", re: [/^laing\b/i, /\blaing\b/i] }, { name: "Pinakbet", re: [/^pinakbet/i, /pinakbet/i] }],
  [{ name: "Pork Barbecue", re: [/^pork barbecue/i, /pork (bbq|barbecue)/i] }, { name: "Inihaw na Liempo", re: [/^inihaw na liempo/i, /inihaw na liempo/i, /grilled (pork belly|liempo)/i] }],
  [{ name: "Beef Tapa", re: [/^(homemade )?beef tapa$/i, /^beef tapa\b/i, /beef tapa/i] }, { name: "Tocino", re: [/^(homemade )?(pork )?tocino( recipe)?\b(?! fried)/i, /pork tocino(?! sisig)/i] }],
  [{ name: "Longganisa", re: [/^skinless (garlic )?longganisa( recipe)?$/i, /longganisang hubad/i] }, { name: "Embutido", re: [/^(pork )?embutido/i, /embutido/i] }],
  [{ name: "Arroz Caldo", re: [/^arroz caldo/i, /arroz caldo/i] }, { name: "Goto", re: [/^goto\b/i, /\bgoto\b/i] }],
  [{ name: "Bistek", re: [/^bistek/i, /bistek/i] }, { name: "Mechado", re: [/^(beef )?mechado/i, /mechado/i] }],
  [{ name: "Lechon Paksiw", re: [/^lechon paksiw|^paksiw na lechon/i, /lechon paksiw|paksiw na lechon/i] }, { name: "Humba", re: [/^(pork )?humba/i, /humba/i] }],
  [{ name: "Dinuguan", re: [/^dinuguan/i, /dinuguan/i] }, { name: "Igado", re: [/^igado/i, /igado/i] }],
  [{ name: "Ginataang Kalabasa", re: [/^ginataang kalabasa/i, /ginataang kalabasa/i] }, { name: "Chop Suey", re: [/^chop ?suey/i, /chop ?suey/i] }],
  [{ name: "Filipino Spaghetti", re: [/^(pinoy|filipino)[- ]style spaghetti|^(pinoy|filipino) spaghetti/i, /spaghetti/i] }, { name: "Baked Macaroni", re: [/^baked macaroni/i, /baked macaroni/i] }],
  [{ name: "Fried Chicken", re: [/^(pinoy |crispy )?fried chicken/i, /fried chicken/i] }, { name: "Pork Steak", re: [/^pork steak/i, /pork steak/i] }],
  [{ name: "Daing na Bangus", re: [/^daing na bangus/i, /daing na bangus/i] }, { name: "Fried Tilapia", re: [/^fried tilapia/i, /fried tilapia|pritong tilapia/i] }],
  [{ name: "Ginataang Hipon", re: [/^ginataang hipon/i, /ginataang hipon/i] }, { name: "Camaron Rebosado", re: [/^camaron rebosado/i, /camaron rebosado/i] }],
  [{ name: "Paksiw na Bangus", re: [/^paksiw na bangus/i, /paksiw na bangus/i] }, { name: "Sinigang na Bangus", re: [/^sinigang na bangus( recipe)?$/i, /sinigang na bangus/i] }],
  [{ name: "Adobong Pusit", re: [/^adobong pusit( recipe)?$/i, /adobong pusit/i] }, { name: "Calamares", re: [/^calamares( recipe)?$/i, /calamares/i] }],
  // Backups, used when a round above has no recipe on the site.
  [{ name: "Chicken Inasal", re: [/^chicken inasal/i, /inasal/i] }, { name: "Lechon Manok", re: [/^lechon manok/i, /lechon manok/i] }],
  [{ name: "Bulalo", re: [/^bulalo( recipe)?$/i, /^bulalo\b(?! (beef )?(mami|pares|kare))/i, /bulalo/i] }, { name: "Batchoy", re: [/^batchoy/i, /batchoy/i] }],
  [{ name: "Tortang Talong", re: [/^tortang talong/i, /tortang talong/i] }, { name: "Ginisang Ampalaya", re: [/^ginisang ampalaya/i, /ampalaya/i] }],
  [{ name: "Escabeche", re: [/^(fish )?escabeche/i, /escabeche/i] }, { name: "Sweet and Sour Fish", re: [/^sweet and sour fish/i, /sweet and sour fish/i] }],
  [{ name: "Pochero", re: [/^(pork |beef )?pochero/i, /pochero/i] }, { name: "Cocido", re: [/^cocido/i, /cocido/i] }],
  [{ name: "Picadillo", re: [/^picadillo/i, /picadillo/i] }, { name: "Tortang Giniling", re: [/^tortang giniling/i, /tortang giniling/i] }],
  [{ name: "Kinilaw", re: [/^kinilaw/i, /kinilaw/i] }, { name: "Sinuglaw", re: [/^sinuglaw/i, /sinuglaw/i] }],
  [{ name: "Sinigang na Hipon", re: [/^sinigang na hipon/i, /sinigang na hipon/i] }, { name: "Halabos na Hipon", re: [/^halabos/i, /halabos/i] }],
  [{ name: "Ginisang Monggo", re: [/^ginisang (monggo|munggo)( \(monggo\))?$/i, /^ginisang (monggo|munggo)/i, /ginisang (monggo|munggo)/i] }, { name: "Ginataang Langka", re: [/^ginataang langka/i, /ginataang langka/i] }],
  [{ name: "Pancit Palabok", re: [/^pancit palabok/i, /palabok(?! arroz)/i] }, { name: "Lomi", re: [/^(pork |batangas )?lomi\b/i, /\blomi\b(?! pares)/i] }],
  [{ name: "Adobong Kangkong", re: [/^adobong kangkong/i, /adobong kangkong/i] }, { name: "Ginisang Repolyo", re: [/^ginisang repolyo$/i, /ginisang repolyo/i] }],
];
const GAME_ROUNDS = 30;
// Panghimagas (sweets and desserts): their own Versus, 20 rounds.
const GAME_SWEET_MATCHUPS = [
  [{ name: "Halo-Halo", re: [/halo.?halo/i] }, { name: "Mais con Yelo", re: [/mais con yelo/i] }],
  [{ name: "Leche Flan", re: [/^leche flan$/i, /^leche flan/i, /leche flan/i] }, { name: "Ube Halaya", re: [/^ube halaya$/i, /ube halaya|halayang ube/i] }],
  [{ name: "Champorado", re: [/^champorado/i, /champorado/i] }, { name: "Ginataang Bilo-Bilo", re: [/bilo.?bilo/i] }],
  [{ name: "Biko", re: [/^biko\b/i, /\bbiko\b/i] }, { name: "Suman", re: [/^suman\b/i, /\bsuman\b/i] }],
  [{ name: "Puto", re: [/^puto( recipe)?$/i, /^puto\b(?! bumbong)/i, /\bputo\b(?! bumbong)/i] }, { name: "Kutsinta", re: [/kutsinta|cuchinta/i] }],
  [{ name: "Turon", re: [/^turon \(banana lumpia/i, /^turon( recipe)?$/i, /^turon\b/i, /\bturon\b/i] }, { name: "Banana Cue", re: [/banana ?cue/i] }],
  [{ name: "Maja Blanca", re: [/^maja blanca/i, /maja blanca/i] }, { name: "Buko Pandan", re: [/^buko pandan/i, /buko pandan/i] }],
  [{ name: "Buko Pie", re: [/^buko pie/i, /buko pie/i] }, { name: "Egg Pie", re: [/^egg pie/i, /egg pie/i] }],
  [{ name: "Polvoron", re: [/^polvoron/i, /polvoron/i] }, { name: "Pastillas", re: [/^pastillas/i, /pastillas/i] }],
  [{ name: "Palitaw", re: [/^palitaw/i, /palitaw/i] }, { name: "Pichi-Pichi", re: [/^pichi.?pichi/i, /pichi.?pichi/i] }],
  [{ name: "Bibingka", re: [/^bibingka( recipe)?$/i, /^bibingka/i, /bibingka/i] }, { name: "Puto Bumbong", re: [/puto bumbong/i] }],
  [{ name: "Cassava Cake", re: [/^cassava cake$/i, /^cassava cake/i, /cassava cake/i] }, { name: "Sapin-Sapin", re: [/^sapin.?sapin( recipe)?$/i, /sapin.?sapin/i] }],
  [{ name: "Mango Float", re: [/^mango float$/i, /mango float/i] }, { name: "Buko Salad", re: [/^buko salad( recipe)?$/i, /buko salad(?! drink)/i] }],
  [{ name: "Sans Rival", re: [/^sans rival$/i, /sans rival/i] }, { name: "Brazo de Mercedes", re: [/brazo de mercedes/i] }],
  [{ name: "Ensaymada", re: [/^ensaymada/i, /ensaymada|ensaimada/i] }, { name: "Mamon", re: [/^mamon( recipe)?$/i, /^mamon\b/i] }],
  [{ name: "Yema", re: [/^yema( recipe)?$/i, /^yema\b(?! cake)/i] }, { name: "Silvanas", re: [/silvanas|sylvanas/i] }],
  [{ name: "Taho", re: [/^(homemade )?taho\b/i, /\btaho\b/i] }, { name: "Sago't Gulaman", re: [/sago (at|'t|’t) gulaman/i, /sago.*gulaman/i] }],
  [{ name: "Kalamay", re: [/^kalamay (hati|sa latik)/i, /^kalamay/i, /kalamay/i] }, { name: "Espasol", re: [/espasol/i] }],
  [{ name: "Ginataang Mais", re: [/^ginataang mais( recipe)?$/i, /ginataang mais/i] }, { name: "Minatamis na Saging", re: [/^minatamis na saging$/i, /minatamis na saging/i] }],
  [{ name: "Fruit Salad", re: [/^filipino fruit salad$/i, /^fruit salad( recipe)?$/i, /fruit salad(?! macaroni)/i] }, { name: "Custard Cake", re: [/^custard cake( recipe)?$/i, /custard cake/i] }],
  // Backups, used when a round above has no recipe on the site.
  [{ name: "Maruya", re: [/^banana fritters \(maruya\)/i, /maruya/i] }, { name: "Kamote Cue", re: [/^kamote cue( recipe)?$/i, /kamote cue|camote cue/i] }],
  [{ name: "Nilupak", re: [/^nilupak( recipe)?$/i, /nilupak/i] }, { name: "Carioca", re: [/^carioca$/i, /carioca|karioka/i] }],
];
const GAME_SWEET_ROUNDS = 20;

// Facts per dish: where the name comes from, its history, and why it was made. Our own words; stories that are
// told rather than proven say "said to" or "one story says". Never about prices.
const GAME_FACTS = {
  "Sinigang": [
    "Sour soups were cooked in the islands long before the Spanish came; souring with local fruit was the native way.",
    "Each region sours it with what grows nearby: sampalok, kamias, bayabas, santol, batuan in Negros and Panay, or green mango.",
    "Instant sinigang mixes made it easy for Filipinos abroad to cook the dish they say they miss most.",
  ],
  "Adobo": [
    "\"Adobo\" is from the Spanish \"adobar\", to marinate; the Spanish used the word for the vinegar-stewed dishes they found here.",
    "Cooking in vinegar and salt was an old way to keep meat from spoiling in the heat, long before refrigerators.",
    "Soy sauce came into adobo through Chinese traders; older versions used only vinegar, garlic and salt (adobong puti).",
  ],
  "Kaldereta": [
    "\"Kaldereta\" comes from the Spanish \"caldera\", a cauldron, the big pot it was cooked in.",
    "It's believed to have started as a goat (kambing) stew, a Spanish-style tomato stew adapted to local meat.",
    "Tomatoes came from the Americas on the Manila galleons, which made Spanish-era tomato stews like this possible.",
  ],
  "Kare-Kare": [
    "One story links kare-kare to Indian sepoys who stayed in Cainta after the British occupied Manila (1762–64) and missed their curry.",
    "Another story says it comes from Pampanga, the province known for its cooking.",
    "It was a fiesta dish because oxtail and tripe take hours to soften, so it was saved for special days.",
  ],
  "Lechon Kawali": [
    "\"Lechon\" is Spanish for suckling pig and \"kawali\" is the Tagalog wok: it's a home way to get crackling skin without roasting a whole pig.",
    "Boiling first, then frying, was a way to make tough pork belly tender and still crisp.",
    "It became a carinderia favourite because it can be fried in batches and sold by the slice.",
  ],
  "Crispy Pata": [
    "\"Pata\" means the leg or trotter, from the Spanish word for an animal's foot.",
    "Crispy pata is often credited to the Barrio Fiesta restaurant, which opened in the 1950s.",
    "It turned a cheap, bony cut into a showpiece for sharing with family or barkada.",
  ],
  "Sisig": [
    "\"Sisig\" is an old Kapampangan word for a sour salad; a 1732 Kapampangan dictionary already lists it.",
    "Lucia \"Aling Lucing\" Cunanan of Angeles City is credited with sizzling pork sisig in the 1970s, using cheap pig's head.",
    "Angeles City calls itself the sisig capital and holds a yearly sisig festival.",
  ],
  "Bicol Express": [
    "It's said to be named in the 1960s by a cook in Malate, Manila, after the train between Manila and Bicol.",
    "Bicolanos had long cooked pork with gata and chili as \"sinilihan\"; the train name made it famous.",
    "Its heat suits Bicol, a region known for cooking with plenty of siling labuyo.",
  ],
  "Tinola": [
    "Tinola appears in Rizal's Noli Me Tangere (1887): Padre Dámaso is served only the neck and a wing, and sulks.",
    "It's an old way to make one chicken feed a big family: lots of broth, with green papaya to stretch it.",
    "Ginger broth has long been given to the sick and to new mothers as a \"warming\" food.",
  ],
  "Nilaga": [
    "\"Nilaga\" comes from \"laga\", to boil.",
    "Boiling meat with vegetables is one of the simplest and oldest ways to cook in the islands.",
    "Its clear broth is a classic meal for the sick and on rainy days.",
  ],
  "Pancit Canton": [
    "\"Pancit\" is said to come from the Hokkien \"pian i sit\", something conveniently cooked.",
    "\"Canton\" refers to Guangzhou (Canton) in southern China, linked to these egg noodles.",
    "Chinese traders brought noodles centuries ago, and panciterias spread around Manila in the 1800s.",
  ],
  "Pancit Bihon": [
    "\"Bihon\" comes from the Hokkien word for rice noodles.",
    "Noodles are served at birthdays because long noodles stand for long life, a Chinese belief Filipinos adopted.",
    "Many towns have their own pancit: Malabon, Lucban's habhab, Cabagan and more.",
  ],
  "Lumpiang Shanghai": [
    "\"Lumpia\" comes from the Hokkien word for a soft spring roll.",
    "The name \"Shanghai\" is Filipino; the dish isn't what you'd find in Shanghai itself.",
    "It became a party staple because it can be rolled ahead, frozen, and fried in minutes.",
  ],
  "Tokwa't Baboy": [
    "\"Tokwa\" comes from the Hokkien word for dried, pressed tofu, brought by Chinese settlers.",
    "It started as a cheap pulutan using pork ears and face, then became lugaw's classic partner.",
    "The vinegar-soy dip cuts the richness, which is why it pairs so well with lugaw.",
  ],
  "Menudo": [
    "\"Menudo\" comes from the Spanish for small or minute, for the small cubes of meat.",
    "It's one of the Spanish-era tomato stews, cousins of afritada and kaldereta.",
    "Liver was added to stretch the meat and thicken the sauce.",
  ],
  "Afritada": [
    "\"Afritada\" comes from the Spanish \"fritada\", something fried first; the meat is browned before stewing.",
    "Tomatoes came from the Americas on the Manila galleons, making these stews possible.",
    "It's a common fiesta dish because it's easy to cook in big pots for many guests.",
  ],
  "Laing": [
    "Laing comes from Bicol, where gabi grows well and coconuts are plentiful.",
    "Drying the gabi leaves first was a way to store them, and it also takes away the itch.",
    "A related Bicol dish, pinangat, wraps the same filling in gabi leaves.",
  ],
  "Pinakbet": [
    "The name is said to come from the Ilocano \"pinakebbet\", shrunk or shriveled, as the vegetables cook down.",
    "It uses vegetables that thrive in Ilocano backyards and dry, sandy soil.",
    "Bagoong isda (fermented fish) was a way to keep fish for the lean season, and it seasons pinakbet.",
  ],
  "Pork Barbecue": [
    "Its sauce uses banana ketchup, invented by food scientist Maria Orosa in the 1940s when tomatoes were scarce.",
    "Grilling on sticks made meat easy to sell on the street, which is how barbecue stands spread.",
    "Street grills also sell parts once thrown away, named for their looks: isaw, betamax, adidas.",
  ],
  "Inihaw na Liempo": [
    "\"Inihaw\" comes from \"ihaw\", to grill over coals.",
    "Grilling over coconut husk or charcoal was the everyday way to cook outdoors, in the field or at the beach.",
    "It's grilled whole and sliced to share, which made it a handaan favourite.",
  ],
  "Beef Tapa": [
    "Tapa was a way to preserve meat: sliced thin, salted and dried in the sun.",
    "Tapsilog (tapa, sinangag, itlog) is often called the first of the \"silog\" meals, from around the 1980s.",
    "Tapsihan stalls sprang up selling tapa day and night to students and workers.",
  ],
  "Tocino": [
    "\"Tocino\" is Spanish for bacon or salt pork.",
    "Curing pork with salt and sugar kept it longer without a fridge.",
    "Pampanga, often called the country's culinary capital, is famous for its tocino.",
  ],
  "Longganisa": [
    "\"Longganisa\" comes from the Spanish \"longaniza\", a long sausage.",
    "Each town made its own to use up pork and keep it longer, so there are dozens of kinds.",
    "Vigan's is small and garlicky; Lucban's is known for its oregano.",
  ],
  "Embutido": [
    "\"Embutido\" is Spanish for a stuffed sausage.",
    "It's a Filipino meatloaf, steamed because most homes had no oven.",
    "It's a Christmas and fiesta dish because it can be made ahead and kept frozen.",
  ],
  "Arroz Caldo": [
    "\"Arroz caldo\" is Spanish for rice broth, the name Spanish-era cooks gave to Chinese-style congee.",
    "Ginger in rice porridge comes from a Chinese tradition for colds and recovery.",
    "Lugaw is the plain version; arroz caldo is the one with chicken.",
  ],
  "Goto": [
    "\"Goto\" is said to come from the Hokkien word for beef tripe.",
    "It made use of tripe and innards, cheap parts that need long, slow cooking.",
    "Batangas has its own goto: a beef-offal soup served without rice.",
  ],
  "Bistek": [
    "\"Bistek\" comes from \"beefsteak\", heard through the Spanish \"bistec\".",
    "It swapped Western butter for soy sauce and kalamansi, which were cheap and local.",
    "Slicing thin let tough local beef cook fast and stay tender.",
  ],
  "Mechado": [
    "\"Mechado\" comes from the Spanish \"mecha\", a wick: a strip of pork fat was threaded through the beef like one.",
    "The fat strip kept lean beef juicy during the long simmer.",
    "It's a Spanish-era dish that Filipinos made their own with soy sauce.",
  ],
  "Lechon Paksiw": [
    "It was made so leftover lechon from a fiesta never goes to waste.",
    "\"Paksiw\" means cooking in vinegar, which also helped the leftovers keep a few more days.",
    "Lechon sauce itself was a way to use the roasted pig's liver.",
  ],
  "Humba": [
    "Humba is believed to come from Chinese red-braised pork brought by Fujianese settlers.",
    "It's a Visayan favourite, especially in Cebu and Bohol.",
    "Its sweetness and dark colour come from the Chinese way of braising in sugar and soy sauce.",
  ],
  "Dinuguan": [
    "\"Dinuguan\" comes from \"dugo\", blood.",
    "Using the blood was part of using the whole pig, with nothing wasted after a butchering.",
    "Ilocanos have their own drier version called dinardaraan.",
  ],
  "Igado": [
    "\"Igado\" comes from the Spanish \"hígado\", liver.",
    "It's an Ilocano fiesta dish, made from the pig butchered for the feast.",
    "Sukang Iloko, the region's sugarcane vinegar, gives it its tang.",
  ],
  "Ginataang Kalabasa": [
    "\"Ginataan\" means cooked in gata, one of the oldest ways of cooking in the islands.",
    "Squash came from the Americas on the galleons and became a backyard staple.",
    "It made a filling ulam out of what grew in the yard.",
  ],
  "Chop Suey": [
    "\"Chop suey\" is said to come from the Cantonese for \"mixed bits\".",
    "It became famous in Chinese-American restaurants and reached the Philippines through Chinese cooks.",
    "It began as a way to use up leftover vegetables and meat.",
  ],
  "Filipino Spaghetti": [
    "Its sweet sauce traces back to banana ketchup, invented by Maria Orosa in the 1940s.",
    "Pasta became common in the American era, and Filipinos sweetened it to local taste.",
    "Fast-food chains made sweet spaghetti a must at children's birthdays.",
  ],
  "Baked Macaroni": [
    "Macaroni became common in Filipino kitchens in the American era.",
    "Ovens were once rare at home, so baked dishes became special-occasion food.",
    "It's a cousin of Italian baked pasta, made sweeter Filipino-style.",
  ],
  "Fried Chicken": [
    "Fried chicken spread through American influence, then fast-food chains.",
    "Max's Restaurant, opened in 1945, became famous for chicken fried without batter.",
    "Filipino cooks marinate it in kalamansi and patis first, an older local way of seasoning.",
  ],
  "Pork Steak": [
    "Pork steak is the pork version of bistek, for when beef was too dear.",
    "It shows how the Western \"steak\" became a soy-and-kalamansi dish here.",
    "It's a common carinderia and baon dish.",
  ],
  "Daing na Bangus": [
    "\"Daing\" means fish split open, salted or soured, and dried: an old way to preserve the catch.",
    "Dagupan in Pangasinan calls itself the bangus capital and holds a yearly Bangus Festival.",
    "Bangus is often called the unofficial national fish of the Philippines.",
  ],
  "Fried Tilapia": [
    "Tilapia isn't native: it was brought to the Philippines in the 1950s.",
    "It spread because it grows fast and survives in ponds, lakes and even rice fields.",
    "Frying it whole until crisp means even the tail and fins can be eaten.",
  ],
  "Ginataang Hipon": [
    "Cooking in coconut milk was an everyday method long before the Spanish arrived.",
    "Shrimp from rivers, lakes and fishponds made it common in many towns.",
    "Bicol and Quezon, coconut country, are known for their many gata dishes.",
  ],
  "Camaron Rebosado": [
    "\"Camarón rebozado\" is Spanish for battered shrimp; \"rebozar\" means to coat in batter.",
    "It's a Spanish name on a Chinese-style dish, a mix found in many old panciterias.",
    "Leaving the tail on gives a handle for dipping.",
  ],
  "Paksiw na Bangus": [
    "\"Paksiw\" means cooking in vinegar, which kept fish from spoiling for a day or two.",
    "Vinegar from coconut, cane or nipa was made in almost every province.",
    "It's one of the cheapest everyday ways to cook bangus.",
  ],
  "Sinigang na Bangus": [
    "Fish sinigang is likely older than pork sinigang, since fish was the everyday food by rivers and seas.",
    "Sinigang sa miso adds fermented soybean paste, a later influence from Japanese cooking.",
    "Bangus belly became a prized cut once deboned bangus became popular.",
  ],
  "Adobong Pusit": [
    "Adobong pusit shows how \"adobo\" became a method, not one dish: almost anything can be cooked adobo-style.",
    "Cooking squid in its own ink uses every part of the catch.",
    "Spain has a similar dish: calamares en su tinta.",
  ],
  "Calamares": [
    "\"Calamares\" is Spanish for squid; fried squid rings are a classic in Spain too.",
    "It became a street food, sold with spiced vinegar.",
    "It's a classic pulutan.",
  ],
  "Chicken Inasal": [
    "\"Inasal\" is Hiligaynon for something grilled or roasted over fire.",
    "Bacolod's Manokan Country, a row of grill stalls, made inasal famous.",
    "Pouring the chicken oil over rice was a way to use the drippings.",
  ],
  "Lechon Manok": [
    "Lechon manok is the chicken version of lechon, turned on a spit.",
    "Roadside lechon manok stalls spread across the country in the 1980s and 90s.",
    "Stuffing it with lemongrass is a local touch.",
  ],
  "Bulalo": [
    "Bulalo comes from Batangas and Cavite, cattle-raising provinces.",
    "\"Bulalo\" refers to the beef shank and marrow bone.",
    "It became the dish to have in cool Tagaytay, overlooking Taal Volcano.",
  ],
  "Batchoy": [
    "Batchoy comes from the La Paz market in Iloilo, around the 1930s.",
    "The name is said to come from the Chinese for pieces of meat.",
    "It used pork innards and liver, cheap parts sold at the market.",
  ],
  "Tortang Talong": [
    "\"Torta\" is Spanish for a cake or omelette.",
    "Grilling and flattening the eggplant made one egg and one eggplant into a meal.",
    "It's a long-time meatless dish for Fridays and Lent.",
  ],
  "Ginisang Ampalaya": [
    "\"Gisa\" comes from the Spanish \"guisar\", to sauté or stew.",
    "Ampalaya has long been valued as medicine as much as food.",
    "Cooking it with egg softens the bitterness, a trick to get children to eat it.",
  ],
  "Escabeche": [
    "Escabeche came from Spain, from an Arabic word for dishes cooked with vinegar.",
    "Fish in vinegar sauce kept longer, which suited the hot climate.",
    "The Filipino version grew sweeter, close to sweet-and-sour.",
  ],
  "Sweet and Sour Fish": [
    "Sweet-and-sour cooking came from southern China with Chinese settlers.",
    "Ketchup in the sauce is a newer, American-era addition.",
    "It's a favourite at Filipino-Chinese restaurants and parties.",
  ],
  "Pochero": [
    "\"Pochero\" comes from the Spanish \"puchero\", a cooking pot and the stew made in it.",
    "It was a Sunday meal in Spanish-era homes: meat and vegetables boiled together.",
    "Filipinos added saba and a side of eggplant sauce.",
  ],
  "Cocido": [
    "\"Cocido\" is Spanish for cooked, from the boiled dinners of Madrid.",
    "It came with the Spanish and stayed as a holiday dish in some families.",
    "Cocido and pochero are close cousins.",
  ],
  "Picadillo": [
    "\"Picadillo\" comes from the Spanish \"picar\", to mince.",
    "It's found across the old Spanish colonies, from Cuba and Mexico to the Philippines.",
    "It stretched a little ground meat with potatoes to feed a family.",
  ],
  "Tortang Giniling": [
    "\"Giniling\" means ground, from \"giling\", to grind.",
    "\"Torta\" comes from Spanish.",
    "Mixing meat into eggs was a way to stretch a small amount of meat.",
  ],
  "Kinilaw": [
    "Kinilaw is very old: at a 10th–13th century site in Butuan, archaeologists found fish bones with tabon-tabon fruit, still used for kinilaw.",
    "\"Kilaw\" means raw; the vinegar or citrus \"cooks\" the fish.",
    "Fishermen made it right on the boat with the fresh catch.",
  ],
  "Sinuglaw": [
    "\"Sinuglaw\" joins \"sinugba\" (grilled) and \"kinilaw\" (raw fish in vinegar).",
    "It comes from Mindanao and the Visayas, especially Davao.",
    "It began as pulutan.",
  ],
  "Sinigang na Hipon": [
    "Shrimp sinigang is a Tagalog favourite in lake towns around Laguna de Bay.",
    "A sour broth brings out the sweetness of shrimp.",
    "Using the heads for the broth wastes nothing.",
  ],
  "Halabos na Hipon": [
    "\"Halabos\" means to cook quickly in very little liquid.",
    "It's one of the simplest, oldest ways to cook very fresh shrimp.",
    "Adding lemon-lime soda is a modern twist.",
  ],
  "Ginisang Monggo": [
    "Many families eat monggo on Fridays, a habit from Catholic meatless Fridays.",
    "Mung beans came with early traders from mainland Asia.",
    "It was cheap protein when meat was dear.",
  ],
  "Ginataang Langka": [
    "Langka came from South Asia long ago and now grows in many backyards.",
    "Cooking it young used the fruit before it ripened.",
    "Gata cooking is one of the oldest Filipino methods.",
  ],
  "Pancit Palabok": [
    "\"Palabok\" means garnish or topping, for all the toppings on it.",
    "It's a cousin of pancit Malabon, from the fishing town where seafood toppings were plentiful.",
    "Noodles at a birthday stand for long life.",
  ],
  "Lomi": [
    "Lomi is said to come from the Chinese lo mein.",
    "Lipa, Batangas is famous for its lomihan (lomi houses).",
    "It's a hearty, cheap meal for workers on cool nights.",
  ],
  "Adobong Kangkong": [
    "Kangkong grows wild in ponds and rice paddies, so it was free food for many families.",
    "Cooking it adobo-style shows how adobo became a method for anything.",
    "It was a meatless dish for Lent and hard times.",
  ],
  "Ginisang Repolyo": [
    "\"Gisa\" comes from the Spanish \"guisar\", to sauté.",
    "Cabbage grows well in the cool highlands of Benguet, which supply much of the country.",
    "It's a cheap ulam for a tight budget.",
  ],
  "Halo-Halo": [
    "Halo-halo is linked to Japanese settlers before World War II who sold sweet beans over shaved ice.",
    "It became possible once ice was easy to buy, after ice plants spread in the American era.",
    "\"Halo-halo\" means \"mix-mix\".",
  ],
  "Mais con Yelo": [
    "The name is Spanish-Filipino: maíz con hielo, corn with ice.",
    "Like halo-halo, it became possible once ice was cheap.",
    "It's the simpler, cheaper summer cooler.",
  ],
  "Leche Flan": [
    "Leche flan comes from the Spanish flan.",
    "A popular story says Spanish-era builders used egg whites in church walls, leaving the yolks for flan.",
    "It's steamed in a llanera because few homes once had ovens.",
  ],
  "Ube Halaya": [
    "\"Halaya\" comes from the Spanish \"jalea\", jelly or jam.",
    "Ube has been grown in the islands for a very long time.",
    "Cooking it into halaya was a way to keep ube longer.",
  ],
  "Champorado": [
    "Champorado comes from the Mexican champurrado, a chocolate drink, via the galleon trade.",
    "Filipinos made it with rice instead of corn.",
    "Cacao was brought from Mexico in the 1600s; tablea came from it.",
  ],
  "Ginataang Bilo-Bilo": [
    "\"Bilo\" means round, for the little sticky rice balls.",
    "It used small amounts of glutinous rice and fruit from the yard.",
    "It's a favourite on rainy days and during Holy Week.",
  ],
  "Biko": [
    "Biko is one of many kakanin made from glutinous rice, served at feasts and gatherings.",
    "Many say sticky rice is served at gatherings to keep the family and friends \"sticking\" together.",
    "Latik, its topping, is made by cooking down coconut milk.",
  ],
  "Suman": [
    "Suman is one of the oldest kakanin: wrapping rice in leaves let it travel and keep.",
    "It was carried to the fields as baon.",
    "Many towns have their own suman, each wrapped in a different leaf.",
  ],
  "Puto": [
    "\"Puto\" may come from the Malay \"puttu\", a steamed rice cake.",
    "It started as a way to use leftover rice, ground and fermented.",
    "Biñan in Laguna is famous for its puto.",
  ],
  "Kutsinta": [
    "Kutsinta is believed to have Chinese roots, like many steamed rice cakes.",
    "Lye water (lihiya) gives it its bounce, an old technique.",
    "It's sold in palengke stalls right beside puto.",
  ],
  "Turon": [
    "Turon is also called banana lumpia: lumpia came from the Chinese spring roll.",
    "Saba was everywhere and cheap, so wrapping it made a quick snack to sell.",
    "It's a classic street merienda.",
  ],
  "Banana Cue": [
    "The name joins \"banana\" and \"barbecue\", because it's sold on a stick like barbecue.",
    "Frying saba in brown sugar was a cheap way to make a sweet snack.",
    "It's sold by street vendors beside kamote cue.",
  ],
  "Maja Blanca": [
    "\"Maja blanca\" comes from the Spanish \"manjar blanco\", white delicacy.",
    "The Spanish version used milk and almonds; Filipinos used coconut milk and corn.",
    "It's a fiesta and Christmas dessert.",
  ],
  "Buko Pandan": [
    "Buko pandan is a fairly recent dessert, popular from the late 20th century.",
    "Pandan has long been used in Filipino kitchens to scent rice.",
    "It's a party dessert because it's cheap and served cold.",
  ],
  "Buko Pie": [
    "Buko pie is credited to the Pahud family of Los Baños, Laguna, in the 1960s.",
    "Laguna's coconut farms made young coconut cheap.",
    "It became the pasalubong of travellers on the southern highway.",
  ],
  "Egg Pie": [
    "Egg pie comes from the custard pies of American and British baking.",
    "It became a panaderia staple.",
    "It turned eggs and milk into a cheap dessert.",
  ],
  "Polvoron": [
    "\"Polvoron\" comes from the Spanish \"polvo\", powder.",
    "It comes from polvorones, Spanish Christmas shortbread.",
    "Filipinos added powdered milk and pinipig.",
  ],
  "Pastillas": [
    "Pastillas de leche are linked to San Miguel, Bulacan.",
    "They were made to use up carabao's milk.",
    "The cut-paper wrappers (pabalat) became an art of their own.",
  ],
  "Palitaw": [
    "\"Palitaw\" comes from \"litaw\", to rise or surface: the cakes are done when they float.",
    "It's one of the simplest kakanin: just rice dough boiled.",
    "It's sold in palengke stalls and by street vendors.",
  ],
  "Pichi-Pichi": [
    "Pichi-pichi is said to come from Quezon province.",
    "It's a way to use cassava, which grows easily even in poor soil.",
    "It's a favourite at parties and in pasalubong boxes.",
  ],
  "Bibingka": [
    "Bibingka may share roots with other Asian rice cakes, like Goa's bebinca.",
    "It's sold outside churches during Simbang Gabi, the nine dawn Masses before Christmas.",
    "It was baked in clay pots with coals above and below, long before home ovens.",
  ],
  "Puto Bumbong": [
    "\"Bumbong\" means bamboo tube, which it's steamed in.",
    "It's a Christmas tradition at Simbang Gabi.",
    "Its purple colour comes from pirurutong, a native black-purple glutinous rice.",
  ],
  "Cassava Cake": [
    "Cassava came from the Americas on the Manila galleons.",
    "It grows in poor soil, so it was a hard-times food that became a dessert.",
    "Cassava cake became popular as ovens spread in homes.",
  ],
  "Sapin-Sapin": [
    "\"Sapin\" means layer.",
    "Steaming one layer at a time is an old kakanin technique.",
    "It's a fiesta kakanin.",
  ],
  "Mango Float": [
    "Mango float is a fairly recent dessert, a Filipino take on the American icebox cake.",
    "It needs no oven, which made it a home favourite.",
    "Philippine carabao mangoes were once named the sweetest in the world by Guinness.",
  ],
  "Buko Salad": [
    "Buko salad became a holiday dish as canned fruit cocktail and cream became common.",
    "Coconut is everywhere in the islands, so buko was cheap.",
    "It's a Christmas and fiesta dessert.",
  ],
  "Sans Rival": [
    "\"Sans rival\" is French for \"without rival\".",
    "It's said to be a Filipino creation inspired by the French dacquoise.",
    "Dumaguete is famous for it.",
  ],
  "Brazo de Mercedes": [
    "\"Brazo de Mercedes\" is Spanish for \"arm of Mercedes\".",
    "It's said to be named after Our Lady of Mercy (Nuestra Señora de las Mercedes).",
    "It's a cousin of the Spanish brazo de gitano roll cake.",
  ],
  "Ensaymada": [
    "Ensaymada traces back to the ensaïmada of Mallorca, Spain, whose name comes from \"saïm\", pork lard.",
    "Filipino bakers made it softer and richer, topped with butter, sugar and grated cheese.",
    "It's a merienda favourite and a Christmas gift, often given in boxes.",
  ],
  "Mamon": [
    "Mamon comes from Spanish sponge cakes.",
    "It's a panaderia staple.",
    "Taisan is its loaf-shaped cousin.",
  ],
  "Yema": [
    "\"Yema\" is Spanish for egg yolk.",
    "Spanish nuns made yemas from leftover yolks.",
    "The Filipino version uses condensed milk, which became common in the American era.",
  ],
  "Silvanas": [
    "Silvanas are a Dumaguete specialty.",
    "They're a small, frozen cousin of sans rival.",
    "They're kept frozen and eaten cold.",
  ],
  "Taho": [
    "Taho comes from the Chinese douhua, soft tofu pudding.",
    "Magtataho carry it in two buckets on a pole, calling \"Tahoooo!\" in the morning.",
    "\"Arnibal\", its syrup, comes from the Spanish \"almíbar\", syrup.",
  ],
  "Sago't Gulaman": [
    "Gulaman comes from seaweed, used long before gelatin.",
    "Sago pearls are made from palm or cassava starch.",
    "It became a street drink to beat the heat.",
  ],
  "Kalamay": [
    "Kalamay is an old kakanin; Bohol sells it packed in coconut shells.",
    "It was stirred for hours, often by many hands at gatherings.",
    "Some say its stickiness stands for close family ties.",
  ],
  "Espasol": [
    "Espasol comes from Laguna.",
    "Toasting the rice flour was a way to keep it longer.",
    "It's a favourite pasalubong from Laguna.",
  ],
  "Ginataang Mais": [
    "Corn came from the Americas on the galleons and became a staple in the Visayas and Mindanao.",
    "Cooking it with sticky rice and gata made a filling merienda.",
    "It's a rainy-day favourite.",
  ],
  "Minatamis na Saging": [
    "\"Minatamis\" means made sweet.",
    "It was a way to use ripe saba before it spoiled.",
    "It's a key halo-halo ingredient.",
  ],
  "Fruit Salad": [
    "Filipino fruit salad became a holiday dish in the American era, when canned fruit arrived.",
    "Canned fruit cocktail was a luxury, so it was saved for Christmas.",
    "Kaong (sugar palm fruit) and nata de coco are its local touches.",
  ],
  "Custard Cake": [
    "Custard cake joins two favourites in one pan: chiffon cake and leche flan.",
    "It's a home-baking creation.",
    "It's also called flan cake.",
  ],
  "Maruya": [
    "Maruya is the Filipino banana fritter.",
    "It was a way to use ripe saba before it spoiled.",
    "Fanning out the slices helps them cook evenly.",
  ],
  "Kamote Cue": [
    "Kamote came from the Americas and grows easily, a lifesaver in hard times.",
    "It's named like banana cue, after barbecue sticks.",
    "It's sold by street vendors.",
  ],
  "Nilupak": [
    "\"Lupak\" means to pound.",
    "It was pounded in a lusong (wooden mortar), often by many hands.",
    "It's made from cassava or saba, cheap and filling.",
  ],
  "Carioca": [
    "Carioca is fried glutinous rice balls, sold on sticks.",
    "Some places call it karioka or cascaron.",
    "It's a classic street merienda.",
  ],
};

/** Every fact for a dish: the main one first. */
function gameFactsFor(name) {
  return (GAME_FACTS[name] || []).filter(Boolean);
}

// ── Pure helpers ──

/** The best recipe for a dish: first pattern with a match, then photo and price first, then the shortest title. */
function findDish(recipes, patterns) {
  for (const re of patterns) {
    const hits = recipes.filter((r) => re.test(r.title || ""));
    if (hits.length === 0) continue;
    const score = (r) => (r.img ? 0 : 2) + (r.costPerServing > 0 ? 0 : 1);
    return hits.slice().sort((a, b) => score(a) - score(b) || a.title.length - b.title.length)[0];
  }
  return null;
}

/** The ten face-offs with the recipe found for each side; rounds missing a side are dropped. */
function buildMatchups(recipes, matchups = GAME_MATCHUPS, rounds = GAME_ROUNDS) {
  return matchups
    .map(([a, b]) => ({ a: { name: a.name, recipe: findDish(recipes, a.re) }, b: { name: b.name, recipe: findDish(recipes, b.re) } }))
    .filter((m) => m.a.recipe && m.b.recipe)
    .slice(0, rounds);
}

/** Words and hand for a 1-10 rating. */
function ratingMood(rating) {
  if (rating <= 2) return { label: "Ayoko talaga!", hand: "👎" };
  if (rating <= 4) return { label: "Hindi masyado", hand: "🤚" };
  if (rating <= 6) return { label: "Pwede na", hand: "👌" };
  if (rating <= 8) return { label: "Masarap!", hand: "👍" };
  return { label: "Sobrang sarap!", hand: "🤩" };
}

/** How far the arm reaches (0 at 1, 1 at 10). */
function armReach(rating) {
  return (Math.min(10, Math.max(1, rating)) - 1) / 9;
}

/** Dishes with a photo not rated yet, of one kind ("ulam"/"meryenda") when given; sauces and condiments are skipped. */
/** Sweets and desserts (Panghimagas): the Dessert category or a sweet title (kakanin, cakes, halo-halo). */
function gameSweet(r) {
  return r.category === "Dessert" || (typeof SWEET_TITLE !== "undefined" && SWEET_TITLE.test(r.title || ""));
}

/** The game's dish kinds: "ulam", "meryenda" (savoury snacks) or "sweets" (Panghimagas). */
function gameKindOf(r) {
  const k = typeof dishKind === "function" ? dishKind(r) : "ulam";
  return k && gameSweet(r) ? "sweets" : k;
}

function ratePool(recipes, rated, kind = null, kindOf = gameKindOf) {
  return recipes.filter((r) => r.img && !(String(r.id) in rated) && r.category !== "Sauce & Condiment" && (!kind || kindOf(r) === kind));
}

/** A random dish to rate (no model yet); see pickToLearn in taste.js for the active-learning pick. */
function nextRateDish(recipes, rated, rng = Math.random, kind = null) {
  const pool = ratePool(recipes, rated, kind);
  return pool.length ? pool[Math.floor(rng() * pool.length)] : null;
}

/**
 * What to say after a round: a fact about one of the two dishes, one not shown yet when there is one.
 * Never about prices. `seen` is the set of facts already shown. Pure, tested.
 */
function roundNote(m, winnerSide, rng = Math.random, seen = new Set()) {
  const win = m[winnerSide], other = m[winnerSide === "a" ? "b" : "a"];
  const all = [win, other].flatMap((d) => gameFactsFor(d.name).map((text) => ({ dish: d.name, text })));
  const fresh = all.filter((f) => !seen.has(f.text));
  const pool = fresh.length ? fresh : all;
  if (!pool.length) return { kind: "fact", dish: win.name, text: `Napili mo ang ${win.name}!` };
  const f = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  return { kind: "fact", dish: f.dish, text: f.text };
}

// ── State and storage ──

let gameRatings = {};      // { recipeId: 1-10 }
let gameVsPicks = {};      // { "Sinigang|Adobo": { n: "Sinigang", w: winnerId, l: loserId } }
let gameRateDish = null;
let gameRateActive = false; // the dish was picked because the model is unsure about it
let gameRateKind = "ulam";
let gameRounds = [];
let gameRound = 0;
let gameRoundDone = false;
let gameMode = "rate";
let gameSeenFacts = new Set(); // facts already shown this visit, so a replay shows new ones

function gameLoad(key) {
  try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; } catch { return {}; }
}
function gameSave(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked: lasts this visit */ }
}

function initGames() {
  if (!RECIPES.length) { setTimeout(initGames, 500); return; }
  gameRatings = gameLoad(GAME_RATE_KEY);
  gameVsPicks = gameLoad(GAME_VS_KEY);
  setGameMode(gameMode);
}

function setGameMode(mode) {
  gameMode = mode;
  document.querySelectorAll("[data-game]").forEach((b) => b.classList.toggle("on", b.dataset.game === mode));
  document.getElementById("game-rate").classList.toggle("hidden", mode !== "rate");
  document.getElementById("game-versus").classList.toggle("hidden", mode !== "versus");
  document.getElementById("game-taste").classList.toggle("hidden", mode !== "taste");
  if (typeof trackEvent === "function") trackEvent(`game/${mode}`);
  if (mode === "rate") { if (!gameRateDish) chooseRateDish(); renderRate(); }
  else if (mode === "versus") startVersus();
  else renderTaste();
}

// ── Rate the ulam ──

/** Active learning: the next dish is one the taste model (of this kind) is least sure about. */
function chooseRateDish() {
  // Sweets learn with the meryenda taste model (the model knows ulam and meryenda).
  const model = tasteModelFrom(RECIPES, gameRatings, gameVsPicks, gameRateKind === "sweets" ? "meryenda" : gameRateKind);
  const pick = pickToLearn(model, ratePool(RECIPES, gameRatings, gameRateKind), { vec: tasteVec });
  gameRateDish = pick.r;
  gameRateActive = pick.active;
}

function setRateKind(kind) {
  gameRateKind = kind;
  chooseRateDish();
  renderRate();
}

function renderRate() {
  const box = document.getElementById("game-rate");
  const r = gameRateDish;
  const kinds = `<div class="flex gap-2 justify-center mb-3">
    <button class="wx-btn ${gameRateKind === "ulam" ? "on" : ""}" onclick="setRateKind('ulam')">🍛 Ulam</button>
    <button class="wx-btn ${gameRateKind === "meryenda" ? "on" : ""}" onclick="setRateKind('meryenda')">🍡 Meryenda</button>
    <button class="wx-btn ${gameRateKind === "sweets" ? "on" : ""}" onclick="setRateKind('sweets')">🍮 Panghimagas</button>
  </div>`;
  if (!r) { box.innerHTML = `${kinds}<p class="text-sm text-gray-500 p-6 text-center">Na-rate mo na lahat! 🎉</p>${rateHistory()}`; return; }
  box.innerHTML = `${kinds}
    ${gameRateActive ? `<p class="text-xs text-center text-green-800 font-semibold mb-2">🧠 Pinili para mas makilala ang panlasa mo</p>` : ""}
    <div class="game-card rate-card">
      <div class="game-photo-wrap"><img src="${escapeHtml(r.img)}" alt="" class="game-photo" loading="lazy">${gameHeart(r.id)}</div>
      <div class="rate-body p-4">
        <p class="font-display text-xl font-bold leading-tight">${escapeHtml(r.title)}</p>
        <p class="text-xs text-gray-500 mt-1">${r.costPerServing > 0 ? `₱${r.costPerServing}/serving · ` : ""}${escapeHtml(catLabel(r.category))}</p>
        <p class="rate-q text-sm font-semibold mt-4">Gaano mo kagusto 'to?</p>
        <div class="rate-stage" id="rate-stage">
          ${GAME_COOK_SVG}
          <div class="rate-arm" id="rate-arm"><span class="rate-hand" id="rate-hand">👌</span></div>
        </div>
        <input id="rate-slider" type="range" min="1" max="10" step="1" value="5" class="rate-slider" aria-label="Rating from 1 to 10" oninput="updateRate(+this.value)">
        <div class="flex justify-between text-[.65rem] text-gray-400 -mt-1 px-1"><span>1 · ayoko</span><span>10 · paborito</span></div>
        <p class="game-keys-hint text-center text-[.7rem] text-gray-400 mt-2" data-i18n="game.rateKeys">⌨️ Pindutin ang 1–9 (0 = 10), rated na agad</p>
        <p class="rate-score text-center mt-3"><span id="rate-num" class="rate-num">5</span><span class="text-gray-400 font-semibold">/10</span> <span id="rate-label" class="text-sm font-semibold text-green-800"></span></p>
        <div class="rate-actions flex gap-2 mt-4">
          <button onclick="skipRate()" class="flex-1 border border-gray-200 rounded-full py-2 text-sm font-semibold text-gray-600">Skip</button>
          <button onclick="submitRate()" class="flex-[2] bg-green-800 text-amber-50 rounded-full py-2 text-sm font-semibold">I-rate ✓</button>
        </div>
      </div>
    </div>
    ${rateHistory()}`;
  updateRate(5);
}

function updateRate(rating) {
  const mood = ratingMood(rating);
  const stage = document.getElementById("rate-stage");
  const arm = document.getElementById("rate-arm");
  if (!stage || !arm) return;
  const room = stage.clientWidth - 92 - 36; // shoulder to the right edge, less the hand
  arm.style.width = `${14 + Math.max(0, room) * armReach(rating)}px`;
  document.getElementById("rate-hand").textContent = mood.hand;
  document.getElementById("rate-num").textContent = rating;
  document.getElementById("rate-label").textContent = mood.label;
  stage.dataset.mood = rating <= 3 ? "sad" : rating <= 6 ? "meh" : "happy";
}

function submitRate() {
  if (!gameRateDish) return;
  gameKeyBusy = false;
  gameRatings[gameRateDish.id] = +document.getElementById("rate-slider").value;
  gameSave(GAME_RATE_KEY, gameRatings);
  tasteModelChanged();
  if (typeof trackEvent === "function") trackEvent("game/rated");
  chooseRateDish();
  renderRate();
}

function skipRate() {
  const skipped = gameRateDish;
  chooseRateDish();
  if (skipped && gameRateDish && gameRateDish.id === skipped.id) gameRateDish = nextRateDish(RECIPES, gameRatings, Math.random, gameRateKind);
  renderRate();
}

function rateHistory() {
  const byId = new Map(RECIPES.map((r) => [String(r.id), r]));
  const rows = Object.entries(gameRatings)
    .map(([id, v]) => ({ r: byId.get(id), v }))
    .filter((x) => x.r)
    .sort((a, b) => b.v - a.v)
    .slice(0, 5);
  if (!rows.length) return "";
  return `<div class="game-card p-4 mt-4">
    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Top mo (${Object.keys(gameRatings).length} rated)</p>
    ${rows.map(({ r, v }) => `<div class="flex items-center justify-between gap-2 py-1 cursor-pointer" role="button" tabindex="0" onclick="openModal(${r.id})"><span class="text-sm truncate">${escapeHtml(r.title)}</span><span class="text-sm font-bold text-green-800 shrink-0">${v}/10</span></div>`).join("")}
  </div>`;
}

// Original mascot: a palengke cook in a salakot. The arm is drawn outside the SVG so it can stretch.
const GAME_COOK_SVG = `<svg class="rate-cook" viewBox="0 0 100 130" aria-hidden="true">
  <path d="M8 40 L50 8 L92 40 Z" fill="#D9A21B"/><path d="M8 40 L50 8 L92 40" fill="none" stroke="#9C7212" stroke-width="2"/>
  <circle cx="50" cy="56" r="22" fill="#E8B583"/>
  <g class="eyes"><circle cx="42" cy="54" r="2.6" fill="#1F2A24"/><circle cx="58" cy="54" r="2.6" fill="#1F2A24"/></g>
  <path class="mouth-happy" d="M40 63 Q50 73 60 63" fill="none" stroke="#1F2A24" stroke-width="2.6" stroke-linecap="round"/>
  <path class="mouth-meh" d="M42 66 L58 66" fill="none" stroke="#1F2A24" stroke-width="2.6" stroke-linecap="round"/>
  <path class="mouth-sad" d="M41 69 Q50 61 59 69" fill="none" stroke="#1F2A24" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M24 130 Q24 84 50 82 Q76 84 76 130 Z" fill="#1F5A3D"/>
  <path d="M38 84 L50 98 L62 84" fill="none" stroke="#F8F4EA" stroke-width="3"/>
</svg>`;

// ── Versus ──

let gameVsSet = "ulam"; // "ulam" (30 rounds, ulam and more) or "sweets" (Panghimagas, 20 rounds)

function setVersusSet(set) {
  gameVsSet = set === "sweets" ? "sweets" : "ulam";
  startVersus();
}

function gameVsSetChips() {
  return `<div class="flex gap-2 justify-center mb-3">
    <button class="wx-btn ${gameVsSet === "ulam" ? "on" : ""}" onclick="setVersusSet('ulam')">🍛 Ulam</button>
    <button class="wx-btn ${gameVsSet === "sweets" ? "on" : ""}" onclick="setVersusSet('sweets')">🍮 Panghimagas</button>
  </div>`;
}

function startVersus() {
  const all = gameVsSet === "sweets" ? buildMatchups(RECIPES, GAME_SWEET_MATCHUPS, GAME_SWEET_ROUNDS) : buildMatchups(RECIPES);
  gameRounds = all.sort(() => Math.random() - 0.5);
  gameRound = 0;
  gameRoundDone = false;
  renderVersus();
}

function vsKey(m) { return `${m.a.name}|${m.b.name}`; }

function renderVersus() {
  const box = document.getElementById("game-versus");
  if (!gameRounds.length) { box.innerHTML = `<p class="text-sm text-gray-500 p-6 text-center">Loading dishes…</p>`; return; }
  if (gameRound >= gameRounds.length) { renderVersusEnd(); return; }
  const m = gameRounds[gameRound];
  const side = (s) => {
    const d = m[s];
    return `<div class="vs-side"><button class="vs-card" id="vs-${s}" onclick="pickVersus('${s}')">
      <img src="${escapeHtml(d.recipe.img || "logo.png")}" alt="" loading="lazy">
      <span class="vs-name">${escapeHtml(d.name)}</span>
      <span class="vs-price">${d.recipe.costPerServing > 0 ? `₱${d.recipe.costPerServing}/serving` : ""}</span>
      <span class="vs-badge">PANALO!</span>
    </button>${gameHeart(d.recipe.id)}</div>`;
  };
  box.innerHTML = `${gameVsSetChips()}
    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide text-center mb-3">Round ${gameRound + 1} of ${gameRounds.length} · Alin ang mas gusto mo?</p>
    <div class="vs-arena" id="vs-arena">${side("a")}<span class="vs-mark">VS</span>${side("b")}</div>
    <p class="text-center text-[.7rem] text-gray-400 mt-2"><span class="game-touch-hint" data-i18n="game.vsSwipe">👈 I-swipe pakaliwa o pakanan para pumili 👉</span><span class="game-keys-hint" data-i18n="game.vsKeys">⌨️ ← kaliwa · → kanan · kahit anong key = susunod</span></p>
    <div id="vs-note" class="vs-note hidden"></div>`;
}

function pickVersus(s) {
  if (gameRoundDone) return;
  gameRoundDone = true;
  const m = gameRounds[gameRound];
  const lose = s === "a" ? "b" : "a";
  gameVsPicks[vsKey(m)] = { n: m[s].name, w: m[s].recipe.id, l: m[lose].recipe.id };
  gameSave(GAME_VS_KEY, gameVsPicks);
  tasteModelChanged();
  if (typeof trackEvent === "function") trackEvent("game/versus-pick");
  document.getElementById(`vs-${s}`).classList.add("win");
  document.getElementById(`vs-${s === "a" ? "b" : "a"}`).classList.add("lose");
  const note = roundNote(m, s, Math.random, gameSeenFacts);
  gameSeenFacts.add(note.text);
  const el = document.getElementById("vs-note");
  el.innerHTML = `<p class="text-xs font-bold uppercase tracking-wide text-amber-700">💡 Alam mo ba? (${escapeHtml(note.dish)})</p>
    <p class="text-sm mt-1">${escapeHtml(note.text)}</p>
    <button onclick="nextVersus()" class="mt-3 w-full bg-green-800 text-amber-50 rounded-full py-2 text-sm font-semibold">${gameRound + 1 < gameRounds.length ? "Next round →" : "Tingnan ang resulta"}</button>
    <p class="game-keys-hint text-center text-[.7rem] text-gray-400 mt-2">⌨️ Pindutin ang kahit anong key para tumuloy</p>`;
  el.classList.remove("hidden");
}

function nextVersus() {
  gameRound++;
  gameRoundDone = false;
  renderVersus();
}

function renderVersusEnd() {
  const winners = gameRounds.map((m) => gameVsPicks[vsKey(m)]).filter((p) => p && p.n).map((p) => p.n);
  const pics = new Map(gameRounds.flatMap((m) => [[m.a.name, m.a.recipe], [m.b.name, m.b.recipe]]));
  document.getElementById("game-versus").innerHTML = `${gameVsSetChips()}
    <div class="game-card p-5 text-center">
      <p class="text-3xl">🏆</p>
      <p class="font-display text-2xl font-bold mt-1">Ang mga champion mo</p>
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
        ${winners.map((n) => { const r = pics.get(n); return `<button class="vs-champ" onclick="openModal(${r.id})"><img src="${escapeHtml(r.img || "logo.png")}" alt="" loading="lazy"><span>${escapeHtml(n)}</span></button>`; }).join("")}
      </div>
      <div class="flex flex-wrap gap-2 justify-center mt-5">
        <button onclick="startVersus()" class="border border-gray-200 rounded-full px-5 py-2 text-sm font-semibold text-gray-600">Laro ulit 🔁</button>
        <button onclick="setGameMode('taste')" class="bg-green-800 text-amber-50 rounded-full px-5 py-2 text-sm font-semibold">🧠 Tingnan ang panlasa mo</button>
      </div>
    </div>`;
}

// ── Panlasa mo (taste profile and picks, from taste.js) ──

/** Trains the taste model for ulam or meryenda on this device's ratings and Versus picks. */
function gameTasteModel(kind = "ulam") {
  return tasteModelFrom(RECIPES, gameRatings, gameVsPicks, kind);
}

const GAME_KIND_LABEL = { ulam: "🍛 Ulam", meryenda: "🍡 Meryenda" };

function renderTaste() {
  document.getElementById("game-taste").innerHTML = tasteSection("ulam") + tasteSection("meryenda");
}

/** One kind's profile and picks, or how many more answers it needs. */
function tasteSection(kind) {
  const model = gameTasteModel(kind);
  if (model.answers < TASTE_MIN_ANSWERS) {
    const left = TASTE_MIN_ANSWERS - model.answers;
    return `<div class="game-card p-5 text-center mb-4">
      <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">${GAME_KIND_LABEL[kind]}</p>
      <p class="font-display text-lg font-bold mt-1">Kilalanin natin ang panlasa mo sa ${kind}</p>
      <p class="text-sm text-gray-500 mt-1">Mag-rate ng ${left} pang ${kind}${kind === "ulam" ? " (o maglaro ng Versus)" : ""} para makita ang hilig mo.</p>
      <button onclick="setGameMode('rate'); setRateKind('${kind}')" class="mt-3 bg-green-800 text-amber-50 rounded-full px-5 py-2 text-sm font-semibold">⭐ Rate ${kind}</button>
    </div>`;
  }
  const prof = tasteProfile(model);
  const max = Math.max(0.3, ...prof.items.map((t) => Math.abs(t.w)));
  const bars = prof.items.slice().sort((a, b) => b.w - a.w).map((t) => {
    const pct = Math.round((Math.abs(t.w) / max) * 50);
    const side = t.w >= 0 ? `left:50%;width:${pct}%` : `right:50%;width:${pct}%`;
    return `<div class="taste-row"><span class="taste-label">${t.icon} ${escapeHtml(t.label)}</span>
      <span class="taste-track"><span class="taste-bar ${t.w >= 0 ? "pos" : "neg"}" style="${side}"></span></span></div>`;
  }).join("");
  const picks = recommendDishes(model, RECIPES, gameRatings, 6, tasteVec, kind);
  return `
    <div class="game-card p-5">
      <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">${GAME_KIND_LABEL[kind]} · Panlasa mo · from ${model.answers} answers</p>
      <p class="font-display text-xl font-bold mt-1 leading-snug">${escapeHtml(prof.sentence || "Wala ka pang malinaw na paborito. Laro pa!")}</p>
      <div class="mt-4">${bars}</div>
      <div class="flex justify-between text-[.65rem] text-gray-400 mt-1"><span>← hindi masyado</span><span>mas gusto →</span></div>
    </div>
    <div class="game-card p-5 mt-4">
      <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Para sa'yo · bagay sa panlasa mo at sulit</p>
      <div class="grid grid-cols-2 gap-3">
        ${picks.map(({ r, x }) => `<button class="taste-pick" onclick="openModal(${r.id})">
          <img src="${escapeHtml(r.img)}" alt="" loading="lazy">
          <span class="taste-pick-name">${escapeHtml(r.title)}</span>
          <span class="taste-pick-why">${escapeHtml(tasteReasons(model, x).join(" · ") || "sulit pick")}</span>
          <span class="taste-pick-price">₱${r.costPerServing}/serving</span>
        </button>`).join("")}
      </div>
      <p class="text-[.7rem] text-gray-400 mt-3">Learned on this phone only from your ratings and Versus picks. The more you play, the better it gets.</p>
    </div>
    <div class="mb-4"></div>`;
}

// ── Heart: add a dish to Favorites (app.js), so it shows in Recipes (⭐ Favorites) and in the planner ──

function gameHeart(id) {
  const on = typeof favIds === "function" && favIds().has(id);
  return `<button type="button" class="game-heart ${on ? "on" : ""}" data-gheart="${id}" aria-pressed="${on}" onclick="event.stopPropagation(); gameToggleFav(${id})"
    aria-label="${on ? "Alisin sa Favorites" : "Idagdag sa Favorites"}" title="${on ? "Nasa Favorites (Recipes at Planner)" : "Idagdag sa Favorites (Recipes at Planner)"}">${on ? "♥" : "♡"}</button>`;
}

function gameToggleFav(id) {
  if (typeof toggleFav !== "function") return;
  toggleFav(id);
  const on = favIds().has(id);
  document.querySelectorAll(`[data-gheart="${id}"]`).forEach((b) => {
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
    b.textContent = on ? "♥" : "♡";
    b.setAttribute("aria-label", on ? "Alisin sa Favorites" : "Idagdag sa Favorites");
    b.title = on ? "Nasa Favorites (Recipes at Planner)" : "Idagdag sa Favorites (Recipes at Planner)";
    if (on) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
  });
  gameToast(on ? "♥ Nasa Favorites na (Recipes at Planner)" : "Inalis sa Favorites");
}

function gameToast(text) {
  let t = document.getElementById("game-toast");
  if (!t) { t = document.createElement("div"); t.id = "game-toast"; t.className = "game-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(gameToast.timer);
  gameToast.timer = setTimeout(() => t.classList.remove("show"), 2600);
}

// ── Keyboard and swipe ──
// Rate: one key press answers (1-9, 0 = 10). Versus: ← / → pick the left or right dish, Enter or an
// arrow goes to the next round; on a phone, swipe left or right the same way.
let gameKeyBusy = false;

/** The rating a key stands for: "1"-"9" → 1-9, "0" → 10, anything else → null. Pure, tested. */
function gameKeyRating(key) {
  if (!/^[0-9]$/.test(String(key))) return null;
  return key === "0" ? 10 : +key;
}

/** After a pick, which keys go to the next round: any key except Tab, Escape and lone modifiers. Pure, tested. */
function gameAnyKeyNext(key) {
  return !!key && !["Tab", "Escape", "Shift", "Control", "Alt", "Meta", "CapsLock", "Fn", "Dead", "Unidentified"].includes(key);
}

/** Which side a horizontal swipe picks: "a" (left), "b" (right) or null if too short or mostly vertical. Pure, tested. */
function gameSwipeSide(dx, dy, min = 50) {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.3) return null;
  return dx < 0 ? "a" : "b";
}

function gameShown(id) {
  const el = document.getElementById(id);
  return !!el && !el.classList.contains("hidden") && el.offsetParent !== null;
}

function gameKeyTarget(e) {
  const t = e.target, tag = t && t.tagName;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (t && (t.isContentEditable || tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && t.id !== "rate-slider"))) return false;
  // A pop-up (recipe, dialog) is open over the games: leave its keys alone.
  if (document.querySelector("dialog[open], #recipe-modal.open") || [...document.querySelectorAll('[aria-modal="true"]')].some((d) => d.offsetParent !== null)) return false;
  return true;
}

function gameOnKey(e) {
  if (!gameKeyTarget(e)) return;
  if (gameMode === "rate" && gameShown("game-rate") && gameRateDish) {
    const n = gameKeyRating(e.key);
    if (n == null || gameKeyBusy) return;
    e.preventDefault();
    gameKeyBusy = true;
    const slider = document.getElementById("rate-slider");
    if (slider) slider.value = n;
    updateRate(n);
    setTimeout(submitRate, 280); // long enough to see the cook react
    return;
  }
  if (gameMode === "versus" && gameShown("game-versus") && gameRounds.length && gameRound < gameRounds.length) {
    // Pick with ← or →; once picked, any key goes to the next round (not Tab or a lone Shift/Ctrl/Alt).
    if (gameRoundDone) {
      if (!gameAnyKeyNext(e.key)) return;
      e.preventDefault();
      nextVersus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      pickVersus(e.key === "ArrowLeft" ? "a" : "b");
    }
  }
}

let gameTouch = null;
function gameOnTouchStart(e) {
  if (gameMode !== "versus" || !e.touches || e.touches.length !== 1) { gameTouch = null; return; }
  const arena = e.target.closest && e.target.closest("#game-versus");
  gameTouch = arena ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
}
function gameOnTouchMove(e) {
  if (!gameTouch || !e.touches.length) return;
  const dx = e.touches[0].clientX - gameTouch.x, dy = e.touches[0].clientY - gameTouch.y;
  const arena = document.getElementById("vs-arena");
  if (arena && Math.abs(dx) > Math.abs(dy)) { arena.style.transition = "none"; arena.style.transform = `translateX(${dx * 0.25}px) rotate(${dx * 0.02}deg)`; }
}
function gameOnTouchEnd(e) {
  if (!gameTouch) return;
  const t = e.changedTouches && e.changedTouches[0];
  const arena = document.getElementById("vs-arena");
  if (arena) { arena.style.transition = "transform .2s"; arena.style.transform = ""; }
  const side = t ? gameSwipeSide(t.clientX - gameTouch.x, t.clientY - gameTouch.y) : null;
  gameTouch = null;
  if (!side || !gameRounds.length || gameRound >= gameRounds.length) return;
  if (gameRoundDone) nextVersus(); else pickVersus(side);
}

if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("keydown", gameOnKey);
  document.addEventListener("touchstart", gameOnTouchStart, { passive: true });
  document.addEventListener("touchmove", gameOnTouchMove, { passive: true });
  document.addEventListener("touchend", gameOnTouchEnd, { passive: true });
}
