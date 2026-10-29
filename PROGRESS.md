# PROGRESS.md: what has been built, and when

A record of the work on FARM2FIGURE (SarapSulit), newest at the bottom of each section. Each
pull request is in `john3162000/website_business`. See `CLAUDE.md` for how the project works.

## Before this session

- **#1 (2026-06-13):** the first full-stack version. Static site in `docs/`, Next.js + Prisma
  backend in `scraper-backend/`, DA and Panlasang Pinoy scrapers, FNRI nutrition, value ranking.

## 2026-10-15: data quality, prices and first features

- **Setup:**
  - Installed the GitHub CLI and logged in.
  - Pushed the separate `csi-larva-counter` project to its own private repo; models and data are
    left out.
- **#2:** reads Panlasang Pinoy's structured data: ingredient groups (marinade, sauce), course,
  and its own nutrition numbers as a reference.
- **#3:** fills catalog gaps with SM Markets prices, salmon, celery and Filipino names.
- **#4, #5:** price history. "vs a month ago" on DA prices, plus dishes whose cost rose or fell
  ("Mas mahal na" / "Mas mura na").
- **#6:** CI on every PR and push. The required check "Backend tests and type check" gates
  auto-merge.
- **#7:**
  - Calorie and protein filters.
  - Weather-based picks (Open-Meteo, location asked on page load, Manila if refused).
  - A fix for course categories.
- **#8, #9:** My Dish. Build or customize a dish, saved on the device, priced, with a price chart.
- **#10 (security):** removed the database passwords and the dashboard login from the repo.
  **The owner must still rotate the Supabase password and set `ADMIN_TOKEN` in Vercel.**
- **#11, #12:**
  - Weather rules: sunny means cold food (halo-halo, buko, gulaman); rainy means sabaw (bulalo,
    sinigang) and bilo-bilo.
  - Weather override buttons and a rainy blue look.
  - Sortable picks, and a protein-per-calorie ranking.
- **#13:** prices the protein and pantry gaps; sinigang powder and other names.
- **#14:** PSA OpenSTAT added as a third price source (DA → PSA → SM → DTI); "to taste" read from
  the line text.
- **#15, #16:** DTI SRP bulletin data; "1 can" weighed by the DTI can size.

### 2026-10-15/16 overnight run (unattended, approved in advance)

| step | change | result |
|---|---|---|
| #17 | Water phrases and unit-only lines are no longer "unknown" | |
| #18 | Other names (aliases) for foods already in the catalog | |
| #19 | Long-tail foods with FNRI or USDA SR Legacy nutrition | 184 items |
| #20 | Recipes with an unknown ingredient are **hidden, not deleted** | 96 hidden |
| #21, #22 | Weekly Planner tab, with Almusal, Tanghalian/Hapunan and Meryenda series and a receipt per dish or per ingredient | |
| #23 | PSA national averages, plus SM rows for pantry staples | |

Result: 895 of 2,031 meals fully priced (44%), and 91% of food lines priced.

## 2026-10-16: features, pricing recheck, redesign

- **#24, #25:**
  - Planner **Random week**.
  - The **"Anong lulutuin?"** tab: pick the ingredients you have and see which dishes you can
    cook.
  - Backend `/api/recipes/ingredient-index`.
- **#26–#28:** finder redesign. Grouped ingredient dropdowns (karne, isda, gulay, …) and an
  animated **ingredient → dish graph** (d3, Obsidian-style hover), with fixes for leftover nodes
  and phone layout.
- **#29: derived prices** (`derived-prices.tsv`). An item is priced from a parent ingredient × a
  factor, for example toasted garlic = garlic ×2.5 or lemon juice = lemons ×2.3, and shown as "≈".
  **Cost gaps:** dishes whose main protein, or a large share of the cost, is unpriced are flagged
  "⚠ Incomplete price" and ranked last.
- **#30:** standard weights for a whole chicken (1.4 kg), a can of tuna, a fillet, a steak, a slab
  of ribs, a turkey and more. Fixed routing for chicken franks, chicken eggs and chicken quarters.
- **#31: recheck of every recipe.**
  - 55 SM prices from other brands.
  - PSA palengke prices for cassava, mango, ube, apple, guava, coconut and snails.
  - 64 more conversions and stand-ins.
  - Parsing fixes for "US pint", "juice from 1/2 lemon", sprigs, sticks and bare salt or pepper.
  - **Result: 1,628 of 2,031 meals (80%) fully priced, 94% of lines priced, 23 flagged.**
- **#32: FARM2FIGURE redesign and features.**
  - **Look:** forest-and-cream theme with the logo, Fraunces headings, a calmer hero with a search
    box, a bottom tab bar on phones, skeleton loaders and light animations.
  - **Dark mode** (Night market palette) with a toggle.
  - **Sulit meter**: five segments plus a label.
  - **Price comparisons** vs 1 week, 2 weeks and 1 month (API `changes`, `price-movers?days=`).
  - **Planner:** several ulam per meal; only real ulam in ulam slots.
  - **Budget planner** ("₱1,500 for the week, 4 people").
  - **Price alerts** (on the device, with browser notifications).

## Waiting for the owner's go-ahead (branch `claude/share-recipe`, not deployed)

- **Share a recipe as a picture** (`docs/share.js`): photo, cost and sulit meter, nutrition,
  ingredients with prices, steps and a link. Phones send it to Messenger through the share sheet;
  computers get a save-picture and copy-link panel.
- **Recipe links:** `#recipe=123` opens that recipe.
- **Meal labels** (Almusal, Tanghalian · Hapunan, Meryenda) on the "mas mura" and "mas mahal"
  lists.
- `CLAUDE.md` and this file.

- **#33 (2026-10-16):** shipped the share picture, recipe links, meal labels on the price movers, and these two files.

## Waiting for the owner's go-ahead (branch `claude/planner-diets-favorites`)

- **Planner:**
  - 💸 Pinakamura ngayon: the cheapest gulay, isda and karne at today's prices.
  - Random week style "Gulay → Isda → Karne, pinakamura muna", which picks among the 12 cheapest of each kind.
  - Diet filters (high protein, diabetic, heart/altapresyon, kidney, gout, low calorie) with a "guidance only" note. They apply to the dish list, the randomizer and the budget planner.
- **⭐ Favourites:** on recipes, DA Prices movers and finder cards; they show in the Planner's Favorites series.
- **First-time tour:** 8 steps in Taglish, with "?" to replay.
- **How-to-cook videos:** `/api/recipes/[id]/video` gets the recipe's own YouTube video; YouTube and TikTok search links otherwise.
- **Ulam rules:**
  - Adobong mani, sandwiches, salads, breads, wedges, lugaw and mamon are not ulam.
  - Gulay must look like a vegetable dish.
  - Patis and bagoong don't make a dish "isda".

## Known gaps and ideas not done yet

- **Brand and data clean-up:**
  - Browser title still "SarapSulit": rename to FARM2FIGURE? (waiting on the owner)
  - Junk "b)" row in the DA price table.
  - A few dishes are filed in the wrong category (for example "Creamy Lengua in White Sauce" is
    filed as a sauce).
- **Planner:** meal sorting is title-based, so odd titles can still slip through.
- **Still unpriced:** clam juice, fresh berries, curing salt, lye water, latik and about 20
  items that appear in only one recipe.
- **Can't be weighed:** 140 recipes, mostly lines like "1 serving of X, see recipe".
- **Price alerts:** only run while the site is open (no push server).
- **Ideas suggested but not built:** grocery list by palengke section, health goals, allergy
  filters, substitutions, cook mode, regional prices, and more animations (pop-up opening from the
  card, planner drop, Random week shuffle).

## 2026-10-22/23: games, taste model, kitchen and planner extras

- **#36–#38: Laro.** Rate (stretchy-arm slider), Versus, and "Panlasa mo": a ridge-regression taste model
  over 13 taste tags, learned on the phone only. Browse gets a "Para sa'yo" sort and "bagay sa'yo" badges;
  the recipe pop-up shows "Kahawig na ulam" and "Alam mo ba?" facts.
- **#40, #41: Ang kusina ko.** The engine detects appliances in each recipe (`appliances.ts`); the site
  hides dishes you can't cook (with substitutes such as air fryer ↔ oven). Planner: save named plans,
  grocery list as a picture or to Messenger. Tour steps for the kitchen and Laro.
- **#43:** active learning (asks about the dishes the model is least sure of), ulam and meryenda learned
  separately, weather picks only for moderate rain or the 85th/15th percentile of last year's heat/cold,
  Random week leans to your taste, DA Prices movers are ulam-only with photos plus "Mura ngayon at bagay
  sa panlasa mo".
- **#42, #44, #52 (separate security session):** admin/cron auth, API caching, security headers, safer
  inline handlers, Dependabot, copyright footer.
- **#53:** grocery list as a stand-alone HTML file with checkboxes.

## 2026-10-27: Settings, filters, grocery sections, drag and drop, more recipes

- **⚙️ Settings** (header button, `settings.js`): English/Tagalog for the app buttons, diets (several at
  once: a dish must pass all of them; the "guidance only" note stays), Ang kusina ko, "Suggest ka pa"
  (taste picks on/off), dark mode and weather. Saved on the device.
- **Fish / Chicken / Pork / Beef chips** in Browse and the Planner (`meatTypes()` from `proteinKind()`).
- **Grocery list by palengke section:** Isda, Karne, Gulay, Prutas, Itlog/Dairy, Tinapay,
  Pampalasa/Condiments, Bigas/Pantry, in the receipt, PNG, HTML and Messenger text.
- **Planner drag and drop:** the page dims and only slots that can take the dish light up; works with a
  mouse and on phones (hold, then drag); dishes can be moved between days.
- **#55:** a slow tap on a Planner dish (held over ~0.3 s without moving) picks it again instead of being swallowed by drag.
- **Okasyon (holiday picks) in Browse:** 16 occasions (Bagong Taon, Sinulog, Chinese New Year, Valentine's,
  Eid al-Fitr/al-Adha, Lent Fridays, Holy Week, Flores de Mayo/Pahiyas, Mother's/Father's Day, Independence
  Day, Undas, Christmas/Simbang Gabi, Handaan, Fiesta). The one on now or coming soon shows first, with a note
  on the custom; most typical dishes first; no sauces; meatless and no-pork rules where they apply.
- **More recipes:** the crawl reads every post sitemap from the sitemap index (dishes like pastil that
  were missed), keeps method notes instead of copying steps or descriptions, and the owner runs
  `node scripts/add-recipes.mjs` on their own computer. Panlasang Pinoy has ~3,000 posts, so ~5,000
  needs a second source.
- **Recipe pop-up: "we show the dish, you teach the cooking".** The source's photo with a "📷 Panlasang Pinoy"
  credit, a "Recipe & photo" credit, and a "Paano lutuin?" card that sends people to the source recipe; the
  stored steps are no longer fetched or shown (they stay in the database). The share picture does the same.
  "cook/<host>" clicks are counted for monthly partner reports (needs GoatCounter). Basis for the partnership
  offers to Panlasang Pinoy and Kawaling Pinoy (`outreach/recipe-permission-emails.md`, git-ignored).

## 2026-10-29: more recipe sites (target ~5,000 recipes)

Panlasang Pinoy was exhausted at 2,780 database entries, so the crawl now reads other Filipino recipe sites.
Each new recipe gets the same treatment as Panlasang Pinoy's:
- FNRI nutrition;
- prices in the order DA → PSA → SM/DTI → derived;
- method notes only (no steps, description or copied photo);
- photo link and credit, with the "Paano lutuin?" button;
- hidden (never deleted) while an ingredient is unknown.

- **Survey** (GitHub Actions, about 40 sites). Each site was checked for:
  - post count from its sitemaps;
  - robots.txt, including AI-crawler blocks;
  - schema.org Recipe JSON-LD on sample posts;
  - anti-scraping clauses in its terms (read with `<script>` removed: the first pass matched a
    bot list inside a script).

  Results, by decision:

  | Decision | Site | Posts | Note |
  |---|---|---|---|
  | **Added** | Kawaling Pinoy | 627 | |
  | | Yummy Kitchen | 1,200 | |
  | | Recipes by Nora | 370 | |
  | | Pinoy Recipe | 912 | many are articles, which are skipped |
  | | Foxy Folksy | 617 | Filipino recipes only |
  | | Manila Spoon | 906 | Filipino only |
  | | Pepper.ph | 769 | `/recipes/` pages only |
  | **Left out** | Jeanelle Eats, Kitchen Confidante | | terms forbid scraping |
  | | The Foodie Takes Flight, Mama's Guide, The Peach Kitchen, Riverten Kitchen, Serious Eats, Pinoy Food Guide | | robots.txt blocks AI crawlers |
  | | lutongbahay.net | | robots.txt blocks everyone |
  | | Ajinomoto PH | | terms forbid data mining |
  | | Food and Journeys, Wok and Kin, I Heart Eating, Cooking with Cocktail Rings, Make It Dairy Free | | not Filipino |
  | | Savory Thoughts | | no Filipino recipes in a 40-post sample |
  | | Casa Baluarte, Pinoy Cooking Recipes, Overseas Pinoy Cooking | | no structured recipe data |
  | | Salu Salo, Ang Sarap, Yummy.ph, Knorr | | unreachable, or no sitemap |

- **Crawler** (`recipe-sources.ts`, `recipe-page.ts`, `ingredient-line.ts`):
  - It walks the sites in order, with a per-site cursor (`sourceIndex`).
  - Pages are read from the WP Recipe Maker card or from JSON-LD; `recipeIngredient` strings are
    split into amount, unit and name.
  - Text is cleaned of broken `u0026` escapes, zero-width characters and "1 & ½".
  - Sitemaps can be Yoast, Rank Math, WordPress core, Google XML Sitemaps or a flat `sitemap.xml`.
  - Later sites skip dishes already listed (`dishKey`: no "recipe/easy/Filipino" noise, sorted words).
  - Optional per-site filters: cuisine and path.
  - Skipped pages go in a new `RecipeSkip` table so they aren't fetched again.
  - A second daily cron run (15:15 UTC) speeds up the first full pass. The user agent is now
    `SarapSulitBot` with a link to the site.
- **Dry run** (40 sample posts per site, offline engine):

  | Site | Recipes | Already listed | Hidden among the new ones |
  |---|---|---|---|
  | Kawaling Pinoy | 39 | 12 | 10 of 27 |
  | Yummy Kitchen | 36 | 11 | 15 of 25 |
  | Recipes by Nora | 29 | 11 | 8 of 18 |
  | Pinoy Recipe | 17 | 3 | 10 of 14 |
  | Pepper.ph | 32 | 1 | 16 of 31 |
  | Foxy Folksy | 16 Filipino | 11 | |
  | Manila Spoon | 3 Filipino | 1 | |

  Projection: about 2,000–2,300 new dishes, so roughly **4,800–5,100 recipes** in the database.
- **Catalog:** 54 aliases to foods already priced. Examples: green chilies, chili leaves, dried
  seaweed, broth and bouillon cubes, gulaman powder, turnip (singkamas), cream, mami noodles,
  kamote leaves, atsuete, sigarilyas, liquid seasoning, mayo, plantain, tokwa.
- **Site:** credits and "Paano lutuin?" name every new site (`share.js`, with a test that every
  crawled host has a name). Wording no longer assumes Panlasang Pinoy.
- **Docs:** new root `README.md` (data sources, how a recipe becomes a price and nutrition label,
  assumptions, recipe sources); CLAUDE.md "Adding recipes".
- **Crawl hop fix (same day).** The first multi-site run at 03:15 UTC saved only one hop's worth
  (9 Kawaling Pinoy recipes). The self-call that starts the next hop went to `request.url`. Inside a
  function that can be the deployment's own `*.vercel.app` URL, which Vercel Authentication guards, so
  the chain stopped.

  Changes:
  - Hops now go to `VERCEL_PROJECT_PRODUCTION_URL` (`hopOrigin()`), and a refused hop is logged.
  - Four more daily runs were added (`/api/cron/recipes/extra-1…4`), for six runs a day, 4 hours apart.
