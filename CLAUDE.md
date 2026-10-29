# CLAUDE.md: FARM2FIGURE (SarapSulit)

Read this first. It covers what the project is, where things live, how to run and ship it, and
the rules the owner (GitHub `john3162000`) has set. For the history of what has been built (each
PR, the numbers, and what is still open), read `PROGRESS.md`.

## What it is

**SarapSulit** is a sub-project of **FARM2FIGURE** (the owner's umbrella brand, whose logo and
colours the site uses). Keep the name SarapSulit for the app (browser title, outreach letters).
It ranks Filipino recipes from Panlasang Pinoy and other Filipino recipe sites by **nutrition per peso**, using today's market prices. Users can
browse dishes, see DA prices and how dish costs moved, build their own dish, plan a week (with a
budget planner), find dishes from ingredients they have, set price alerts and share a recipe as
a picture.

- **Site:** `docs/` → GitHub Pages: https://john3162000.github.io/website_business/
- **Backend:** `scraper-backend/` (Next.js 16, Prisma 7, Supabase Postgres) → Vercel:
  https://website-business-beta.vercel.app

**Not part of this project:** the Python files at the repo root (`ESP32.py`, `Web_deployment.py`,
`trial.py`, `render.yaml`, …) and `platform/` (has its own CLAUDE.md). Leave them alone.

## Layout

```
docs/                         static site, no build step (Tailwind CDN, plain browser scripts)
  index.html                  all sections, styles, theme (forest and cream + dark mode)
  app.js                      data loading, Browse, Prices, recipe pop-up, nav, sulit meter, dark toggle
  weather.js                  weather picks (Open-Meteo)       mydish.js   "My Dish" builder
  planner.js                  weekly planner, Random week (incl. gulay→isda→karne), budget planner,
                              mealTypes(), proteinKind(), meatTypes(), dietOk()/dietsOk() (all chosen diets),
                              grocerySection() palengke groups, drag and drop (dropSlots), Pinakamura ngayon
  finder.js                   "Anong lulutuin?" ingredient finder + d3 graph
  alerts.js                   price alerts (localStorage + browser notifications)
  share.js                    share a recipe as a PNG (canvas) → share sheet / Messenger
  tour.js                     first-time tour (Taglish), replay with the "?" header button
  seasons.js                  Okasyon strip in Browse: holiday/special-event picks (Easter-based Holy Week,
                              lunar-table CNY/Eids, fixed dates), chips to look ahead
  settings.js                 ⚙️ Settings (language tl/en with I18N + data-i18n, diets, kitchen, "Suggest ka pa",
                              dark mode, weather) and the Fish/Chicken/Pork/Beef chips; key sarapsulit.settings.v1
  *.test.mjs                  node:test files; run each script's pure helpers in node:vm
  logo.png, favicon.png       FARM2FIGURE logo
scraper-backend/
  src/lib/recipe-compile/     the engine: compile.ts, load.ts, quantity.ts, ingredient-index.ts
  src/lib/price-history.ts    compareDate / priceOn / pctChange (week, 2 weeks, month)
  src/lib/scrapers/           DA, PSA, SM scrapers; recipe crawl: recipe-sources.ts (the site list),
                              recipe-page.ts (WPRM card or JSON-LD), ingredient-line.ts (line split, dishKey)
  src/app/api/                routes (see below)
  data/catalog/*.tsv          ingredient catalog (source of truth, see "Catalog")
  scripts/build-catalog.mjs   TSVs → src/lib/recipe-compile/catalog.generated.ts
  prisma/schema.prisma        Commodity, Recipe(+Ingredient/Instruction), NutritionFact,
                              StoreProduct, PsaPrice, ScrapingLog
.overnight/                   git-ignored measuring scripts and notes (see "Measuring")
```

## How the engine prices a recipe

For each ingredient line: parse amount and unit (`quantity.ts`) → match an alias to a catalog
slug → grams bought / eaten (edible portion, frying oil absorbed, marinade factors) → nutrients
(FNRI first, then USDA/extra) and cost.

**Price order:** DA daily → PSA OpenSTAT monthly (NCR, else PH national average) → SM Markets
or DTI SRP rows in `manual-prices.tsv` → **derived prices** (`derived-prices.tsv`: parent slug ×
factor, a yield conversion or a stand-in, shown on the site as "≈").

Line statuses are `ok`, `to-taste`, `optional`, `water`, `skipped`, `unmatched`, `no-weight` and
`no-nutrition`.

- **Hidden recipes:** a recipe with an unknown ingredient gets `hidden: true` and is **hidden on
  the site, never deleted**.
- **Incomplete cost:** `costGaps()` flags a dish when an unpriced meat or fish line is about 10%
  or more of its cost, or unpriced lines are about 30% or more. The site shows "⚠ Incomplete
  price" and ranks the dish last.

## Main API routes (backend)

| Route | Returns |
|---|---|
| `/api/recipes`, `/api/recipes/[id]` | Raw recipes and instructions |
| `/api/recipes/compiled` | Summary per recipe (kcal, protein, cost, `hidden`, `costIncomplete`, …) |
| `/api/recipes/compiled?id=` | One recipe with every line's grams, cost and price source |
| `/api/recipes/price-movers?days=7\|14\|30` | Dishes whose cost moved most |
| `/api/recipes/ingredient-index` | What each recipe needs, used by the finder |
| `/api/recipes/[id]/video` | The recipe's own YouTube/TikTok video from its page (JSON-LD VideoObject) plus search links |
| `/api/commodities` | DA prices, with `changes` for a week, 2 weeks and a month back |
| `/api/store-prices`, `/api/ingredients`, `/api/nutrition` | SM products, catalog ingredients, FNRI foods |
| `POST /api/dish` | Prices a personal dish (My Dish) |
| `/api/scrape/*` | Admin only (`ADMIN_TOKEN`) |
| `/api/cron/da-daily`, `/api/cron/psa` | Vercel crons: DA daily at 10:00 UTC, PSA Mondays at 11:00 UTC |
| `/api/cron/recipes`, `/api/cron/recipes-pm` | Vercel crons daily at 03:15 and 15:15 UTC: the recipe crawl, calling itself (≤150 hops) until every sitemap is read |

## Commands

```bash
cd scraper-backend && npm test                      # backend tests (node --test, strip-types)
cd scraper-backend && npx tsc --noEmit              # type check
node --test docs/*.test.mjs                         # site tests (run from repo root)
cd scraper-backend && node scripts/build-catalog.mjs # after ANY catalog TSV edit; commit both
```

**Local site preview:** `.claude/launch.json` has a "site" entry (`python -m http.server 5173
--directory docs`). The local site still calls the **live** Vercel API (`API_BASE` in `app.js`).
The backend can't run locally: there is no `.env` or database login on this computer, and you
must never ask for or type one.

**CI:** `.github/workflows/test.yml`, job "Backend tests and type check": `npm ci`, `npm test`,
`tsc`, `node --check` on every `docs/*.js`, then `node --test docs/*.test.mjs`. This check is
required on `main`.

## Shipping (the owner's standing rules)

1. Branch from an up-to-date `main` (`claude/<topic>`). Never commit straight to main.
2. Run backend tests, `tsc` and the site tests before opening a PR.
3. Open the PR with `gh` (`"C:\Program Files\GitHub CLI\gh.exe"`) and **turn on auto-merge with
   merge commits** (`gh pr merge --auto --merge --delete-branch`); the required check gates it.
   This is standing permission for this repo.
4. **UI and design changes:** show the owner a **local preview with screenshots first** and wait
   for "deploy" before opening the PR.
5. After the merge, check the live site and API. Vercel takes about 1–2 minutes. GitHub Pages
   takes 1–3 minutes and caches scripts for about 10 minutes, so reload with
   `fetch(file, {cache: "reload"})`.
6. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
   PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Hard-won pitfalls

- **Write regex escapes only with the Edit/Write tools.** A `\b` sent through a bash heredoc
  plus Python has turned into a 0x08 byte several times, so those regexes silently never matched.
  `docs/site.test.mjs` and `source-hygiene.test.ts` catch control characters.
- **Catalog TSVs use CRLF line endings.** `build-catalog.mjs` splits on `/\r?\n/`. Append rows
  with CRLF.
- **One global scope:** all `docs/*.js` files are classic scripts that share globals. Script
  order in `index.html`: weather, mydish, planner, finder, alerts, share, facts, taste, games,
  kitchen, settings, seasons, tour, then app last. New button text gets a `data-i18n` key in settings.js `I18N`
  (`settings.test.mjs` fails on a missing key).
  Favourites (`favIds`, `toggleFav`, key `sarapsulit.favs.v1`) live in `app.js`. Give new
  top-level names a prefix (`SHARE_W`, `FINDER_KEY`) so they can't clash.
- **The theme comes from the Tailwind config:** `index.html` re-points Tailwind's `green` to
  forest green and `amber` to the logo's gold. Dark mode is `html.dark` overrides plus `--bg`,
  `--s1`, `--mint` and similar variables.
- **Rainy look:** `body.rainy` turns the site blue on rainy days. Screenshots taken in Manila
  rain look blue; use `setWeatherMode('sunny')` for a neutral preview.
- **Hidden preview pane:** while the built-in browser pane is hidden, animations pause and
  screenshots can be stale. Check page state with JavaScript before trusting a screenshot.
- **Planner meal sorting** (`mealTypes`, `isMainUlam` in `planner.js`) is title-based. Kakanin,
  sweets, snacks, pickles and egg how-tos are never ulam. Add new odd titles to `SWEET_TITLE`,
  `SNACK_TITLE` or `SIDE_TITLE`, with a test.
- **PSA OpenSTAT needs a browser-like User-Agent** and uses "." for missing values.
- **Panlasang Pinoy images** send `Access-Control-Allow-Origin: *`, which is why `share.js` can
  draw them on a canvas. A site's photo without that header just fails to load and the share card
  has no photo.
- **A new recipe site needs a name** in `RECIPE_SOURCES` in `docs/share.js` (credit and "Paano
  lutuin?" button); `share.test.mjs` checks every host in the backend's `recipe-sources.ts`.

## Adding recipes (recipe sites)

The crawl reads every site in `src/lib/scrapers/recipe-sources.ts`, in order. Panlasang Pinoy is first.
Since 2026-10-29 the list also has Kawaling Pinoy, Yummy Kitchen, Recipes by Nora, Pinoy Recipe, Foxy
Folksy, Manila Spoon and Pepper.ph.

**How it reads a site:**
- It reads each site's post sitemaps from `sitemap_index.xml`, `wp-sitemap.xml` or a flat `sitemap.xml`.
- It saves up to 4 pages per step.
- A page is read from its WP Recipe Maker card or its schema.org Recipe JSON-LD (`recipe-page.ts`).

**What it keeps:** the title, source link, photo link, servings, times, course and ingredients, plus
`methodNotes` (short phrases like "deep fry. discard the marinade" that the engine reads). It does
**not** copy the author's description or steps; the recipe pop-up links to the source site for the method.
Unknown ingredients hide the recipe as usual.

**Skipping:**
- Sites after Panlasang Pinoy skip a dish already listed (same `dishKey`).
- Optional per-site filters: `cuisine: /filipin|pinoy/i` for general food blogs, and `pathPrefix` (Pepper.ph `/recipes/`).
- Pages skipped as `not-recipe`, `duplicate` or `other-cuisine` go in the `RecipeSkip` table, so the
  daily run doesn't fetch them again. Delete a row there to re-read that page.

**Adding a site:** check its robots.txt (no `Disallow: /`, no AI-crawler blocks), its terms (no
ban on scraping or automated collection) and that its recipe pages carry Recipe JSON-LD. Then add it to
`recipe-sources.ts` and give it a name in `docs/share.js`.

**Schedule:** the crawl runs by itself twice a day (`/api/cron/recipes`, 03:15 and 15:15 UTC). Each run crawls for
~45 s, then calls itself again with the `CRON_SECRET` Vercel sends, until every site is read (Hobby
crons can only run daily, hence the hops). Progress is the RECIPES row in `ScrapingLog`; the logic is
`src/lib/recipe-crawl.ts`. To push it along by hand from the owner's computer (the token never goes
through a cloud session):

```bash
cd scraper-backend
node scripts/add-recipes.mjs            # ADMIN_TOKEN from the environment or scraper-backend/.env.local
node scripts/add-recipes.mjs --max 50   # stop after 50 calls; run again to resume
```

The ~5,000-recipe target is why the other sites were added (owner's request, 2026-10-29). See
PROGRESS.md for each site's survey result.

## Data rules

- **Do not scrape Shopee or Puregold** (terms risk). Open Food Facts is not wired in because of
  its ODbL licence; that decision belongs to the owner.
- **Never guess a price silently.** Use a sourced row, or a labelled derived row with a factor
  and a reason. Otherwise leave it unpriced and let `costGaps` flag the dish.
- **Never delete recipes from the database.** Hide them instead.
- **Don't copy recipe prose or photos.** New recipes store method notes and a photo link, not text.
- **Recipe photos stay linked from the source site** (owner's decision, 2026-10-28) until the source asks
  otherwise; take them down promptly on request. Fallback plan: drawn dish-type illustrations for every
  dish, Wikimedia Commons (credited) photos for the best-known dishes, then the owner's own photos.

## Measuring (local, git-ignored)

`.overnight/` holds measuring scripts. Fetch the data into `.overnight/data/`, then run from
`scraper-backend/`:

```bash
node --experimental-strip-types --no-warnings ../.overnight/completeness.mts ../.overnight/data ../pricing-completeness.csv
node --experimental-strip-types --no-warnings ../.overnight/gaps.mts ../.overnight/data     # derived prices used, flagged dishes
node --experimental-strip-types --no-warnings ../.overnight/recheck.mts ../.overnight/data  # still-unpriced and unweighable lines
```

`.overnight/sm_price.mjs specs.psv out.tsv` finds the median SM price from a spec file of include
and exclude regexes.

Last measured on 2026-10-16: 1,628 of 2,031 meals (80%) fully priced, 94% of lines priced,
23 flagged "incomplete price", 96 hidden.

## Open items for the owner

- The Supabase password was once committed. It's removed from the repo but still in git history.
  The owner must rotate it, update `DATABASE_URL` and `DIRECT_URL` in Vercel, and set
  `ADMIN_TOKEN` in Vercel.
- `/api/commodities` still lists one junk row named "b)", left from older DA data.
- Price alerts only run while the site is open. Real push would need a service worker and a push
  server.
