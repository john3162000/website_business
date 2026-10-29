# SarapSulit

**SarapSulit** ("masarap, masustansya, sulit") is a free web app, part of **FARM2FIGURE**, that
helps Filipino families cook meals that are nutritious and affordable. It prices every dish at
**today's market prices**, works out its **nutrition from the FNRI Food Composition Table**, and
ranks dishes by **nutrition per peso**.

- **Site:** https://john3162000.github.io/website_business/ (static, in `docs/`)
- **Backend / API:** https://website-business-beta.vercel.app (Next.js + Prisma + Supabase
  Postgres, in `scraper-backend/`)

Other files in this repository (the Python files at the root, `render.yaml`, `platform/`) are not
part of SarapSulit.

## What you can do on the site

- **Browse** dishes ranked by nutrition per peso, cost per serving, calories or protein. You can
  filter by meal, diet (low calorie, gout, diabetes, …), kitchen appliances and meat type (fish,
  chicken, pork, beef). There are also picks for the weather and for occasions (Noche Buena,
  Holy Week, Undas, Eid, …).
- **Prices:** DA daily prices, with changes over a week, two weeks and a month, plus the dishes
  whose cost moved most.
- **Recipe pop-up:** each ingredient line's grams, cost and price source, and the dish's
  nutrients. It also shows the source site's photo (linked, credited) and a **"Paano lutuin?"**
  button that opens the recipe on its own site. SarapSulit never shows the author's steps.
- **Weekly planner:** plan a week of meals with a budget and drag and drop. It builds a grocery
  list grouped by palengke section.
- **"Anong lulutuin?":** pick the ingredients you have and see which dishes you can cook.
- **My Dish:** build your own dish and see its price and nutrition.
- **Price alerts:** set alerts on prices, and share any dish as a picture.
- **Settings:** English or Tagalog, diets, kitchen, dark mode.

## Where the data comes from

| Data | Source | How it's used |
|---|---|---|
| Recipes | Panlasang Pinoy, Kawaling Pinoy, Yummy Kitchen, Recipes by Nora, Pinoy Recipe, Foxy Folksy, Manila Spoon, Pepper.ph (see "Recipe sources") | Title, ingredient list, servings, times, course, a photo **link** and the source link |
| Market prices | **DA** Daily Price Index (Metro Manila), every day | First choice for every ingredient DA lists |
| | **PSA** OpenSTAT monthly retail prices (NCR, else PH average), every Monday | When DA has no price |
| | **SM Markets** and **DTI** SRP bulletins (`manual-prices.tsv`) | Packaged goods DA and PSA don't list (soy sauce, canned goods, noodles, …) |
| | **Derived prices** (`derived-prices.tsv`) | Last resort: a labelled conversion or stand-in from a priced item, shown with "≈" |
| Nutrition | **FNRI** Philippine Food Composition Table (PhilFCT) | Per 100 g edible portion: kcal, protein, fat, carbs, sodium and more |
| | USDA FoodData Central (`nutrients-extra.tsv`) | Only for foods FNRI doesn't have (spices, some imported items) |

## How a recipe becomes a price and a nutrition label

All recipes go through the same engine (`scraper-backend/src/lib/recipe-compile/`), whatever site
they come from:

1. **Read the page.** The crawler reads the recipe card (WP Recipe Maker) or the page's
   schema.org Recipe JSON-LD. From it, each ingredient line is split into amount, unit and name
   (`2 tbsp fish sauce` → 2 · tbsp · fish sauce). Ingredient groups ("Marinade", "Sauce") are
   kept. The steps are only scanned for short **method notes** ("deep fry", "discard the
   marinade", "oven"); the steps themselves are not stored.
2. **Parse the quantity** (`quantity.ts`). Fractions, ranges (midpoint), unicode ½, package sizes
   ("1 (14 oz) can"), US cups and spoons, pieces, cloves, bunches, thumbs, "to taste".
3. **Match the ingredient** to the catalog (`data/catalog/aliases.tsv` → `canonicals.tsv`, about
   1,600 names for about 550 foods). Water, headings, "to taste" and optional lines are
   recognized and left out of cost and nutrition.
4. **Grams bought and eaten.** Volume becomes grams by the food's density. Pieces use typical
   sizes (a medium onion, an egg, a thumb of ginger). The **edible portion** removes bones, skin
   and peel. Assumptions made here:
   - Deep-frying oil: only the share that is absorbed counts.
   - A discarded marinade: only part of it counts.
   - Cooked rice is priced by its raw weight (about 2.8 g cooked per 1 g raw).
5. **Nutrients:** FNRI first, then USDA, per edible gram, per serving.
6. **Cost:** grams bought × price, in the order DA → PSA → SM/DTI → derived.
7. **Checks:**
   - A recipe with an ingredient the catalog doesn't know yet is **hidden, never deleted**. It
     shows again once the catalog learns the ingredient.
   - "⚠ Incomplete price" marks a dish when an unpriced meat or fish line is about 10% or more
     of its cost, or unpriced lines are about 30% or more. These dishes are ranked last.

**Rules we keep:**
- Never guess a price silently.
- Never copy recipe steps, descriptions or photos. Photos are linked from the source and
  credited; we take them down on request.
- Never delete recipes; hide them instead.

## Recipe sources

The crawl (`scraper-backend/src/lib/scrapers/recipe-sources.ts`) reads each site's sitemap.

- **Sites added 2026-10-29:** Kawaling Pinoy, Yummy Kitchen, Recipes by Nora, Pinoy Recipe,
  Foxy Folksy, Manila Spoon and Pepper.ph. Each was checked first:
  - its robots.txt allows crawling and doesn't block AI crawlers;
  - its terms don't forbid automated collection;
  - its recipe pages publish schema.org Recipe JSON-LD.
- **Duplicate dishes:** sites after Panlasang Pinoy only add dishes not already listed. "Easy
  Chicken Adobo Recipe" counts as the same dish as "Chicken Adobo".
- **Filtered sites:** general food blogs only add their Filipino recipes.
- **Sites left out:** sites whose terms forbid scraping, that block AI crawlers in robots.txt, or
  that have no structured recipe data.

It runs by itself twice a day (`/api/cron/recipes`, 03:15 and 15:15 UTC), politely: one page every 1.5 s, with
a `SarapSulitBot` user agent that links to the site. Pages that aren't recipes, or are duplicates,
are remembered (`RecipeSkip`) so they aren't fetched again.

## Run it

```bash
# site: no build step
python -m http.server 5173 --directory docs     # uses the live API

# backend tests and type check
cd scraper-backend && npm ci && npm test && npx tsc --noEmit

# site tests (from the repo root)
node --test docs/*.test.mjs

# after editing any catalog TSV (CRLF line endings), regenerate and commit both
cd scraper-backend && node scripts/build-catalog.mjs
```

The backend needs `DATABASE_URL`, `DIRECT_URL`, `ADMIN_TOKEN` and `CRON_SECRET`, which are set in
Vercel. `CLAUDE.md` has the project rules, and `PROGRESS.md` has the history of every change.

## Credits

- Recipes and photos belong to their authors and sites, which are credited and linked on every
  dish.
- Prices: Department of Agriculture, Philippine Statistics Authority, DTI, SM Markets.
- Nutrition: FNRI-DOST Philippine Food Composition Table and USDA FoodData Central.

© 2026 FARM2FIGURE.
