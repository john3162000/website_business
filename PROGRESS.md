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
