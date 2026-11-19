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
  [{ name: "Halo-Halo", re: [/halo.?halo/i] }, { name: "Leche Flan", re: [/^leche flan/i, /leche flan/i] }],
  [{ name: "Pork Barbecue", re: [/^pork barbecue/i, /pork (bbq|barbecue)/i] }, { name: "Inihaw na Liempo", re: [/^inihaw na liempo/i, /inihaw na liempo/i, /grilled (pork belly|liempo)/i] }],
  [{ name: "Beef Tapa", re: [/^(homemade )?beef tapa$/i, /^beef tapa\b/i, /beef tapa/i] }, { name: "Tocino", re: [/^(homemade )?(pork )?tocino( recipe)?\b(?! fried)/i, /pork tocino(?! sisig)/i] }],
  [{ name: "Longganisa", re: [/^skinless (garlic )?longganisa( recipe)?$/i, /longganisang hubad/i] }, { name: "Embutido", re: [/^(pork )?embutido/i, /embutido/i] }],
  [{ name: "Champorado", re: [/^champorado/i, /champorado/i] }, { name: "Ginataang Bilo-Bilo", re: [/bilo.?bilo/i] }],
  [{ name: "Arroz Caldo", re: [/^arroz caldo/i, /arroz caldo/i] }, { name: "Goto", re: [/^goto\b/i, /\bgoto\b/i] }],
  [{ name: "Biko", re: [/^biko\b/i, /\bbiko\b/i] }, { name: "Suman", re: [/^suman\b/i, /\bsuman\b/i] }],
  [{ name: "Puto", re: [/^puto( recipe)?$/i, /^puto\b/i, /\bputo\b/i] }, { name: "Kutsinta", re: [/kutsinta|cuchinta/i] }],
  [{ name: "Turon", re: [/^turon( recipe)?$/i, /^turon\b/i, /\bturon\b/i] }, { name: "Banana Cue", re: [/banana ?cue/i] }],
  [{ name: "Maja Blanca", re: [/^maja blanca/i, /maja blanca/i] }, { name: "Buko Pandan", re: [/^buko pandan/i, /buko pandan/i] }],
  [{ name: "Bistek", re: [/^bistek/i, /bistek/i] }, { name: "Mechado", re: [/^(beef )?mechado/i, /mechado/i] }],
  [{ name: "Lechon Paksiw", re: [/^lechon paksiw|^paksiw na lechon/i, /lechon paksiw|paksiw na lechon/i] }, { name: "Humba", re: [/^(pork )?humba/i, /humba/i] }],
  [{ name: "Dinuguan", re: [/^dinuguan/i, /dinuguan/i] }, { name: "Igado", re: [/^igado/i, /igado/i] }],
  [{ name: "Ginataang Kalabasa", re: [/^ginataang kalabasa/i, /ginataang kalabasa/i] }, { name: "Chop Suey", re: [/^chop ?suey/i, /chop ?suey/i] }],
  [{ name: "Filipino Spaghetti", re: [/^(pinoy|filipino)[- ]style spaghetti|^(pinoy|filipino) spaghetti/i, /spaghetti/i] }, { name: "Baked Macaroni", re: [/^baked macaroni/i, /baked macaroni/i] }],
  [{ name: "Fried Chicken", re: [/^(pinoy |crispy )?fried chicken/i, /fried chicken/i] }, { name: "Pork Steak", re: [/^pork steak/i, /pork steak/i] }],
  [{ name: "Daing na Bangus", re: [/^daing na bangus/i, /daing na bangus/i] }, { name: "Fried Tilapia", re: [/^fried tilapia/i, /fried tilapia|pritong tilapia/i] }],
  [{ name: "Ginataang Hipon", re: [/^ginataang hipon/i, /ginataang hipon/i] }, { name: "Camaron Rebosado", re: [/^camaron rebosado/i, /camaron rebosado/i] }],
  // Backups, used when a round above has no recipe on the site.
  [{ name: "Chicken Inasal", re: [/^chicken inasal/i, /inasal/i] }, { name: "Lechon Manok", re: [/^lechon manok/i, /lechon manok/i] }],
  [{ name: "Bulalo", re: [/^bulalo( recipe)?$/i, /^bulalo\b(?! (beef )?(mami|pares|kare))/i, /bulalo/i] }, { name: "Batchoy", re: [/^batchoy/i, /batchoy/i] }],
  [{ name: "Tortang Talong", re: [/^tortang talong/i, /tortang talong/i] }, { name: "Ginisang Ampalaya", re: [/^ginisang ampalaya/i, /ampalaya/i] }],
  [{ name: "Escabeche", re: [/^(fish )?escabeche/i, /escabeche/i] }, { name: "Sweet and Sour Fish", re: [/^sweet and sour fish/i, /sweet and sour fish/i] }],
  [{ name: "Pochero", re: [/^(pork |beef )?pochero/i, /pochero/i] }, { name: "Cocido", re: [/^cocido/i, /cocido/i] }],
  [{ name: "Picadillo", re: [/^picadillo/i, /picadillo/i] }, { name: "Tortang Giniling", re: [/^tortang giniling/i, /tortang giniling/i] }],
  [{ name: "Buko Pie", re: [/^buko pie/i, /buko pie/i] }, { name: "Egg Pie", re: [/^egg pie/i, /egg pie/i] }],
  [{ name: "Polvoron", re: [/^polvoron/i, /polvoron/i] }, { name: "Pastillas", re: [/^pastillas/i, /pastillas/i] }],
  [{ name: "Kinilaw", re: [/^kinilaw/i, /kinilaw/i] }, { name: "Sinuglaw", re: [/^sinuglaw/i, /sinuglaw/i] }],
  [{ name: "Sinigang na Hipon", re: [/^sinigang na hipon/i, /sinigang na hipon/i] }, { name: "Halabos na Hipon", re: [/^halabos/i, /halabos/i] }],
  [{ name: "Palitaw", re: [/^palitaw/i, /palitaw/i] }, { name: "Pichi-Pichi", re: [/^pichi.?pichi/i, /pichi.?pichi/i] }],
  [{ name: "Pandesal", re: [/^pandesal/i, /pandesal|pan de sal/i] }, { name: "Ensaymada", re: [/^ensaymada/i, /ensaymada|ensaimada/i] }],
];
const GAME_ROUNDS = 30;

const GAME_FACTS = {
  "Sinigang": "Sinigang's sourness traditionally comes from sampalok (tamarind), but kamias, bayabas, kalamansi and santol are used too.",
  "Adobo": "The name comes from the Spanish \"adobar\" (to marinate), but cooking meat in vinegar to keep it longer was done here before the Spanish came.",
  "Kaldereta": "Kaldereta is named after the Spanish \"caldera\", a cauldron. Goat (kambing) kaldereta is a favourite in many provinces.",
  "Kare-Kare": "Kare-kare's thick sauce comes from ground peanuts, and it's traditionally eaten with bagoong alamang on the side.",
  "Lechon Kawali": "\"Kawali\" is the wok-like pan the pork belly is deep-fried in, after it's boiled until tender.",
  "Crispy Pata": "\"Pata\" is the pork leg. It's boiled first, dried, then deep-fried until the skin puffs and crackles.",
  "Sisig": "Sisig comes from Pampanga. The sizzling-plate version was made famous in Angeles City.",
  "Bicol Express": "Bicol Express is said to be named after the train that ran between Manila and the Bicol region.",
  "Tinola": "Tinola appears in José Rizal's novel Noli Me Tangere.",
  "Nilaga": "\"Nilaga\" simply means \"boiled\". The clear broth gets its flavour from slowly simmered beef or pork bones.",
  "Pancit Canton": "Pancit is served at birthdays because long noodles stand for long life.",
  "Pancit Bihon": "Bihon is a thin rice noodle. Pancit came to the Philippines with Chinese traders centuries ago.",
  "Lumpiang Shanghai": "Lumpia came from Chinese spring rolls. The Shanghai kind is thin, fried and filled with ground pork.",
  "Tokwa't Baboy": "Tokwa't baboy is a classic partner of lugaw: \"lugaw at tokwa't baboy\" is a street-food staple.",
  "Menudo": "Filipino menudo is a tomato-based pork stew with liver, nothing like Mexican menudo, which is a tripe soup.",
  "Afritada": "Afritada's name comes from the Spanish \"fritada\". Its cousins are menudo, kaldereta and mechado.",
  "Laing": "Laing is from Bicol: dried taro (gabi) leaves slowly cooked in coconut milk with chili.",
  "Pinakbet": "Pinakbet is an Ilocano dish. The name is said to come from \"pinakebbet\", meaning shrunk or shrivelled.",
  "Halo-Halo": "\"Halo-halo\" means \"mix-mix\": you're meant to stir everything together before eating.",
  "Chicken Inasal": "Chicken inasal comes from Bacolod. It's marinated in vinegar, kalamansi and lemongrass, then basted with annatto (atsuete) oil while grilling.",
  "Lechon Manok": "Lechon manok is roasted on a turning spit, often with lemongrass stuffed inside the chicken.",
  "Bulalo": "Bulalo is beef shank and marrow bone soup, a favourite in Batangas and cool Tagaytay.",
  "Batchoy": "Batchoy comes from La Paz, Iloilo: noodle soup with pork, liver and crushed chicharon on top.",
  "Tortang Talong": "For tortang talong, the eggplant is grilled, peeled and flattened, then dipped in egg and fried.",
  "Ginisang Ampalaya": "Rubbing sliced ampalaya with salt and squeezing out the juice makes it less bitter.",
  "Pork Barbecue": "Pinoy pork barbecue is skewered and basted with a sweet sauce of banana ketchup and soy sauce, a staple of the street-side ihawan.",
  "Inihaw na Liempo": "Liempo is pork belly. For inihaw na liempo it's usually marinated in soy sauce, kalamansi and garlic before grilling.",
  "Beef Tapa": "Tapa is cured, thinly sliced beef. Served with sinangag (garlic rice) and itlog (egg), it becomes tapsilog.",
  "Tocino": "Tocino is sweet cured pork. The name is the Spanish word for bacon.",
  "Longganisa": "Almost every province has its own longganisa, from sweet hamonado styles to the garlicky Vigan and Lucban kinds.",
  "Embutido": "Embutido is a Filipino meatloaf: ground pork with egg, raisins and sausage, rolled in foil and steamed.",
  "Champorado": "Champorado is chocolate rice porridge made with tablea, and many eat it with tuyo for a sweet-and-salty mix.",
  "Ginataang Bilo-Bilo": "Bilo-bilo are glutinous rice balls cooked in coconut milk with saba, kamote, langka and sago.",
  "Arroz Caldo": "Arroz caldo is rice porridge with chicken and ginger, topped with toasted garlic, scallions and kalamansi.",
  "Goto": "Goto is rice porridge cooked with beef tripe and ginger.",
  "Biko": "Biko is glutinous rice cooked in coconut milk and brown sugar, often topped with latik.",
  "Suman": "Suman is glutinous rice wrapped in leaves (banana, buri or ibos) and steamed or boiled.",
  "Puto": "Puto is a steamed rice cake, and a classic partner of dinuguan.",
  "Kutsinta": "Kutsinta gets its chewy bounce from lye water and is served with grated coconut.",
  "Turon": "Turon is saba (often with langka) rolled in a lumpia wrapper with brown sugar, then fried until the sugar caramelises.",
  "Banana Cue": "Banana cue is saba fried in brown sugar that caramelises around it, served on a bamboo skewer.",
  "Maja Blanca": "Maja blanca is a coconut milk pudding thickened with cornstarch, often with corn kernels.",
  "Buko Pandan": "Buko pandan mixes young coconut strips with pandan-flavoured gelatin and cream.",
  "Bistek": "Bistek comes from \"beef steak\": thin beef slices cooked in soy sauce and kalamansi with onion rings.",
  "Mechado": "Mechado is named after the strip of pork fat (mecha, a wick) once threaded through the beef.",
  "Lechon Paksiw": "Lechon paksiw is how leftover lechon is used up: simmered in vinegar and lechon sauce.",
  "Humba": "Humba is a Visayan braised pork, sweet from brown sugar and often cooked with salted black beans (tausi).",
  "Dinuguan": "Dinuguan is pork stewed in pig's blood with vinegar and chili.",
  "Igado": "Igado is an Ilocano dish of pork and liver cooked in vinegar and soy sauce.",
  "Ginataang Kalabasa": "Ginataang kalabasa is squash cooked in coconut milk, often with sitaw and shrimp.",
  "Filipino Spaghetti": "Filipino spaghetti is sweet, from banana ketchup or sugar, and has sliced hotdogs in the sauce.",
  "Pork Steak": "Pork steak is pork cooked the bistek way, in soy sauce, kalamansi and onions.",
  "Daing na Bangus": "Daing na bangus is milkfish split open, marinated in vinegar and garlic, then fried.",
  "Camaron Rebosado": "\"Camaron rebosado\" is Spanish for battered shrimp.",
  "Baked Macaroni": "Pinoy baked macaroni is a party favourite: sweet meat sauce under a layer of white sauce and cheese.",
  "Fried Chicken": "Filipino fried chicken is often marinated in kalamansi, soy sauce or patis before frying, and eaten with rice and gravy.",
  "Fried Tilapia": "Tilapia is one of the most farmed fish in the Philippines, raised in ponds and lakes like Taal and Laguna de Bay.",
  "Ginataang Hipon": "Ginataang hipon is shrimp simmered in coconut milk, often with kalabasa and sitaw.",
  "Chop Suey": "Pinoy chop suey is a stir-fry of mixed vegetables, often with quail eggs, chicken liver or shrimp.",
  "Escabeche": "Escabeche is fried fish in a sweet-and-sour sauce; the word is Spanish for a vinegar marinade.",
  "Sweet and Sour Fish": "Sweet-and-sour dishes came to the Philippines through Chinese cooking.",
  "Pochero": "Pochero is a tomato-based stew with saba, chickpeas and pechay, served with an eggplant sauce on the side.",
  "Cocido": "Cocido comes from the Spanish cocido, a boiled meal of meats, chickpeas and vegetables.",
  "Picadillo": "Filipino picadillo is ground meat with potatoes and carrots; in some homes it's cooked as a soup.",
  "Tortang Giniling": "Tortang giniling is an omelette with sautéed ground meat, an easy baon favourite.",
  "Buko Pie": "Buko pie is a famous pasalubong from Laguna, filled with young coconut.",
  "Egg Pie": "Egg pie is a bakery favourite: egg custard baked in a pie crust.",
  "Polvoron": "Polvoron comes from the Spanish polvo (powder): toasted flour, powdered milk, sugar and butter pressed in a mold.",
  "Pastillas": "Pastillas de leche are milk candies from Bulacan, rolled in sugar and wrapped in paper.",
  "Kinilaw": "Kinilaw is raw fish \"cooked\" in vinegar or kalamansi, a way of eating fish that goes back to before colonial times.",
  "Sinuglaw": "Sinuglaw joins sinugba (grilled pork) and kinilaw (fish in vinegar), from Mindanao and the Visayas.",
  "Sinigang na Hipon": "In sinigang na hipon, the shrimp heads give the broth much of its flavour and an orange tint.",
  "Halabos na Hipon": "Halabos is shrimp steamed in its own juices with a little salt; some cooks add lemon-lime soda.",
  "Palitaw": "Palitaw is named after \"litaw\" (to surface): the rice cakes are done when they float.",
  "Pichi-Pichi": "Pichi-pichi is grated cassava and sugar, steamed and rolled in grated coconut or cheese.",
  "Pandesal": "Pandesal means \"bread of salt\", though it's slightly sweet; it's rolled in breadcrumbs before baking.",
  "Ensaymada": "Ensaymada traces back to the ensaïmada of Mallorca, Spain; the Filipino version is topped with butter, sugar and cheese.",
  "Leche Flan": "A popular story says leche flan used the egg yolks left over when egg whites were used in building old Spanish-era churches.",
};

// More facts per dish, so a round almost never repeats one. Our own words; well-known kitchen and food-history facts.
const GAME_MORE_FACTS = {
  "Sinigang": ["Sinigang na baboy usually has kangkong, sitaw, labanos, talong, okra and siling haba.", "Sinigang sa miso, cooked with fish and mustasa, is a well-loved version."],
  "Adobo": ["There's adobong puti (vinegar, no soy sauce), adobo sa gata, and adobong dilaw with turmeric.", "Adobo keeps for days without a fridge because of the vinegar, which is why it's a favourite baon."],
  "Kaldereta": ["Many kaldereta recipes thicken the sauce with liver spread, and some melt in cheese.", "Kaldereta usually has potatoes, carrots, bell peppers and olives or green peas."],
  "Kare-Kare": ["Kare-kare is traditionally made with oxtail and tripe, with talong, pechay and sitaw.", "Its orange colour comes from atsuete (annatto)."],
  "Lechon Kawali": ["The pork belly is boiled first so it's tender, then dried so the skin crackles when fried.", "Lechon kawali is usually dipped in lechon sauce or sukang maanghang."],
  "Crispy Pata": ["Crispy pata is often dipped in soy sauce and vinegar with onions and chili.", "A whole crispy pata is a classic sharing dish for family or barkada."],
  "Sisig": ["Before the sizzling plate, \"sisig\" meant a sour salad, like green papaya or mango with vinegar.", "Lucia \"Aling Lucing\" Cunanan of Angeles is credited with the sizzling pork sisig."],
  "Bicol Express": ["Its heat comes from siling labuyo and siling haba, cooked with pork in coconut milk and bagoong.", "Bicolanos are known for cooking with gata and chili, and Bicol Express has both."],
  "Tinola": ["Tinola uses green papaya or sayote, plus chili leaves or malunggay.", "Native chicken (manok na Tagalog) is prized for tinola for its richer broth."],
  "Nilaga": ["Nilaga often has potatoes, corn, cabbage, pechay and saba.", "The broth stays clear if you skim off the scum while it boils."],
  "Pancit Canton": ["Canton noodles are egg noodles, stir-fried with soy sauce and often oyster sauce.", "\"Pancit\" is said to come from the Hokkien \"pian i sit\": something conveniently cooked."],
  "Pancit Bihon": ["Bihon is soaked in water first so it cooks evenly and doesn't break into bits.", "Pancit is often served with kalamansi to squeeze over it."],
  "Lumpiang Shanghai": ["Lumpiang Shanghai is a party staple, usually served with sweet chili sauce.", "Rolling them thin helps the filling cook through before the wrapper burns."],
  "Tokwa't Baboy": ["The dipping sauce is soy sauce and vinegar with onions and chili.", "Tokwa is firm tofu, fried until golden before it's mixed with the pork."],
  "Menudo": ["Menudo is cut into small cubes, often with hotdogs, potatoes, carrots and raisins.", "\"Menudo\" comes from the Spanish word for small or minute, for its small pieces."],
  "Afritada": ["Afritada is chicken or pork stewed in tomato sauce with potatoes, carrots and bell peppers.", "Unlike menudo and kaldereta, afritada is usually cooked without liver."],
  "Laing": ["The gabi leaves are usually dried first; cooking them well keeps them from itching the throat.", "Laing is cooked slowly until the gata thickens and turns oily."],
  "Pinakbet": ["Ilocanos make pinakbet with bagoong isda (fish); many Tagalog cooks use bagoong alamang (shrimp).", "Its usual vegetables are ampalaya, talong, okra, sitaw, kalabasa and tomato."],
  "Halo-Halo": ["Common halo-halo layers: shaved ice, milk, sweet beans, nata de coco, kaong, leche flan and ube.", "Halo-halo is a summer favourite, sold in many stalls when the weather is hot."],
  "Leche Flan": ["Leche flan is steamed or baked in an oval llanera, then turned out so the caramel is on top.", "Using only egg yolks makes leche flan richer and smoother."],
  "Pork Barbecue": ["Barbecue sticks are often eaten with sukang maanghang or atchara.", "Many cooks brush the leftover marinade on while grilling for a glossy finish."],
  "Inihaw na Liempo": ["Grilled liempo is often eaten with toyo-mansi or ensaladang mangga.", "The fat on liempo melts over the coals, which keeps the meat juicy."],
  "Beef Tapa": ["Tapa was once a way to keep meat longer by curing and drying it.", "Beef tapa is usually sliced thin against the grain so it stays tender."],
  "Tocino": ["Pampanga is especially known for its tocino.", "Tocino's sugar caramelises in the pan, so it's cooked on low heat to keep it from burning."],
  "Longganisa": ["Vigan longganisa is small and garlicky; Lucban's is known for its garlic and oregano.", "Longganisa with sinangag and itlog is called longsilog."],
  "Embutido": ["Embutido can be steamed ahead, frozen, then sliced and fried when needed.", "A hard-boiled egg or sausage in the middle gives each slice a pattern."],
  "Champorado": ["Champorado is often topped with evaporated or condensed milk.", "It's a favourite rainy-day breakfast or merienda."],
  "Ginataang Bilo-Bilo": ["Some places call it ginataang halo-halo because of all the mix-ins.", "The bilo-bilo balls are done when they float to the top."],
  "Arroz Caldo": ["\"Arroz caldo\" is Spanish for rice broth, but the dish is believed to come from Chinese congee.", "It's often served with a hard-boiled egg, and is a favourite on rainy days or when sick."],
  "Goto": ["Goto is often eaten with tokwa't baboy on the side.", "Toasted garlic, scallions and kalamansi are the usual toppings."],
  "Biko": ["Biko is a fiesta favourite, sliced into squares and shared.", "Latik is made by cooking coconut milk until it turns into brown curds."],
  "Suman": ["Suman sa ibos is wrapped in buri palm leaves; suman sa lihiya uses lye water.", "Suman is often eaten with sugar, latik or ripe mango."],
  "Puto": ["Puto Biñan from Laguna is one of the best-known kinds.", "Puto is often topped with cheese or salted egg."],
  "Kutsinta": ["Kutsinta's brown colour comes from brown sugar, sometimes with a little annatto.", "Kutsinta is steamed in small cups, which gives it its shape."],
  "Turon": ["Turon is often sold by street vendors alongside banana cue and camote cue.", "Turon is also called \"banana lumpia\"."],
  "Banana Cue": ["The name comes from \"banana\" and \"barbecue\": it's sold on a stick like barbecue.", "Saba is used because it stays firm when fried."],
  "Maja Blanca": ["Maja blanca is a classic Christmas and fiesta dessert, often topped with latik.", "It sets as it cools, so it can be sliced into neat squares."],
  "Buko Pandan": ["Pandan leaves give buko pandan its green colour and scent.", "It's served cold, which makes it a favourite at summer parties."],
  "Bistek": ["Bistek is topped with plenty of onion rings, added at the end so they stay a bit crisp.", "Kalamansi gives bistek its tangy taste."],
  "Mechado": ["Mechado is beef stewed in tomato sauce and soy sauce, with potatoes and carrots.", "Mechado often uses tougher cuts that turn tender after long, slow cooking."],
  "Lechon Paksiw": ["Lechon sauce, made with liver, vinegar and sugar, makes lechon paksiw sweet and thick.", "Lechon paksiw is a common dish the day after a fiesta."],
  "Humba": ["Humba is often compared to adobo, but it's sweeter and darker.", "Some humba recipes add dried banana blossoms."],
  "Dinuguan": ["Dinuguan is often called \"chocolate meat\" as a playful nickname.", "Dinuguan and puto are a classic pair."],
  "Igado": ["Igado often has bell peppers and green peas.", "Igado is a favourite at Ilocano fiestas."],
  "Ginataang Kalabasa": ["Kalabasa is rich in beta-carotene, which the body turns into vitamin A.", "Kalabasa softens into the gata and makes the sauce creamy and orange."],
  "Chop Suey": ["Harder vegetables like carrots go in first and leafy ones last, so all stay crisp.", "Chop suey's sauce is thickened with a little cornstarch slurry."],
  "Filipino Spaghetti": ["Filipino spaghetti is a must at children's birthday parties.", "It's usually topped with grated cheese."],
  "Baked Macaroni": ["Baked macaroni is often made in big trays to share at Christmas and birthdays.", "The white sauce on top is a béchamel of butter, flour and milk."],
  "Fried Chicken": ["Many Filipinos eat fried chicken with rice and gravy or banana ketchup.", "Marinating the chicken first seasons it all the way to the bone."],
  "Pork Steak": ["Pork steak is usually made with pork chops or kasim (shoulder).", "Like bistek, it's finished with plenty of onions."],
  "Daing na Bangus": ["Bangus is often called the national fish of the Philippines.", "Daing na bangus is a favourite breakfast, with garlic rice and egg (dangsilog)."],
  "Fried Tilapia": ["Fried tilapia is often eaten with sukang maanghang or tomato and onions.", "Patting the fish dry before frying keeps the oil from splattering."],
  "Ginataang Hipon": ["The shrimp heads give the gata an orange colour and rich flavour.", "Shrimp cook fast, so they go in near the end to stay tender."],
  "Camaron Rebosado": ["Camaron rebosado is a classic in Filipino-Chinese restaurants.", "It's usually dipped in sweet and sour sauce."],
  "Chicken Inasal": ["Inasal is eaten with sinamak (spiced vinegar), soy sauce, kalamansi and chicken oil on the rice.", "Bacolod's Manokan Country is famous for its inasal stalls."],
  "Lechon Manok": ["Lechon manok is often eaten with a liver-based lechon sauce.", "Turning on the spit cooks the chicken evenly and bastes it in its own juices."],
  "Bulalo": ["For many, the bone marrow is the best part: scooped out and eaten with rice.", "Bulalo is cooked for hours so the beef shank turns tender."],
  "Batchoy": ["La Paz batchoy's broth is flavoured with pork bones and shrimp paste.", "Batchoy is often topped with crushed chicharon and fried garlic."],
  "Tortang Talong": ["Some versions add ground pork to the egg for a heartier torta.", "Tortang talong is often eaten with banana ketchup."],
  "Ginisang Ampalaya": ["Cooking ampalaya with egg softens its bitterness.", "Ampalaya is a good source of vitamin C."],
  "Escabeche": ["Escabeche is often made with lapu-lapu or tilapia, with ginger and bell peppers.", "The fish is fried first so it stays firm under the sauce."],
  "Sweet and Sour Fish": ["The sauce is usually vinegar, sugar and ketchup, thickened with cornstarch.", "Pineapple chunks and bell peppers are common in the sauce."],
  "Pochero": ["Pochero comes from the Spanish puchero, a cooking pot.", "Saba bananas make pochero's broth slightly sweet."],
  "Cocido": ["Cocido and pochero are cousins: both are Spanish-style boiled meals with chickpeas.", "Cocido is often served with a separate sauce for dipping."],
  "Picadillo": ["Picadillo comes from the Spanish \"picar\", to chop or mince.", "It's a quick weeknight dish because ground meat cooks fast."],
  "Tortang Giniling": ["Tortang giniling is often eaten with banana ketchup.", "The meat is cooked first, then mixed with beaten egg and fried."],
  "Buko Pie": ["Buko pie is linked to Los Baños, Laguna, where it's sold along the highway.", "The filling is young coconut meat in a creamy custard."],
  "Egg Pie": ["Egg pie is a classic in Filipino panaderias.", "Its top bakes into a browned layer while the inside stays soft."],
  "Polvoron": ["Polvoron is wrapped in colourful paper; eat it slowly, or the powder makes you cough!", "Some versions add pinipig, peanuts or cookies and cream."],
  "Pastillas": ["Bulacan pastillas wrappers are often cut into fine designs called pabalat.", "The original pastillas de leche used carabao's milk."],
  "Kinilaw": ["Kinilaw often uses tuna or tanigue with ginger, onions, chili and coconut vinegar.", "The fish is eaten soon after mixing so it stays fresh and firm."],
  "Sinuglaw": ["Sinuglaw is especially popular in Davao.", "The grilled pork's smokiness balances the sour kinilaw."],
  "Sinigang na Hipon": ["Shrimp go in near the end so they stay tender.", "Sinigang na hipon often has kangkong, labanos and sitaw."],
  "Halabos na Hipon": ["Halabos means cooking shrimp quickly in very little liquid.", "The shrimp turn bright orange when they're done."],
  "Palitaw": ["Palitaw is coated in grated coconut, sugar and toasted sesame seeds.", "Its flat shape comes from pressing the dough before boiling."],
  "Pichi-Pichi": ["Pichi-pichi uses lye water for its chewy, jelly-like texture.", "It's often rolled in grated coconut or grated cheese."],
  "Pandesal": ["Pandesal is the classic breakfast bread, bought warm from the panaderia in the morning.", "It's often eaten with coffee, cheese or a filling like corned beef."],
  "Ensaymada": ["Ensaymada is coiled before baking, which gives it its spiral shape.", "Some bakeries top it with salted egg or ube."],
};

/** Every fact for a dish: the main one first. */
function gameFactsFor(name) {
  return [GAME_FACTS[name], ...(GAME_MORE_FACTS[name] || [])].filter(Boolean);
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
function buildMatchups(recipes, matchups = GAME_MATCHUPS) {
  return matchups
    .map(([a, b]) => ({ a: { name: a.name, recipe: findDish(recipes, a.re) }, b: { name: b.name, recipe: findDish(recipes, b.re) } }))
    .filter((m) => m.a.recipe && m.b.recipe)
    .slice(0, GAME_ROUNDS);
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
function ratePool(recipes, rated, kind = null, kindOf = typeof dishKind === "function" ? dishKind : () => "ulam") {
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
  const model = tasteModelFrom(RECIPES, gameRatings, gameVsPicks, gameRateKind);
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
  </div>`;
  if (!r) { box.innerHTML = `${kinds}<p class="text-sm text-gray-500 p-6 text-center">Na-rate mo na lahat! 🎉</p>${rateHistory()}`; return; }
  box.innerHTML = `${kinds}
    ${gameRateActive ? `<p class="text-xs text-center text-green-800 font-semibold mb-2">🧠 Pinili para mas makilala ang panlasa mo</p>` : ""}
    <div class="game-card rate-card">
      <img src="${escapeHtml(r.img)}" alt="" class="game-photo" loading="lazy">
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

function startVersus() {
  const all = buildMatchups(RECIPES);
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
    return `<button class="vs-card" id="vs-${s}" onclick="pickVersus('${s}')">
      <img src="${escapeHtml(d.recipe.img || "logo.png")}" alt="" loading="lazy">
      <span class="vs-name">${escapeHtml(d.name)}</span>
      <span class="vs-price">${d.recipe.costPerServing > 0 ? `₱${d.recipe.costPerServing}/serving` : ""}</span>
      <span class="vs-badge">PANALO!</span>
    </button>`;
  };
  box.innerHTML = `
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
  document.getElementById("game-versus").innerHTML = `
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
