# Recipe ↔ DA ↔ FNRI integration — data profile & status (2026-10-13)

Status: a proposal for the transformation layer (matching, portions/units, cooking
adjustments, cost model, pipeline) was being generated when the session paused.
Resume by re-running the design work with the facts below (SM store goods are out of scope).

## Goal (from the owner)
- DA prices are continuous (daily); FNRI nutrition and recipes are static.
- DA must match FNRI + recipe ingredients to build a full recipe (nutrition + cost).
- Then interpret portions: inconsistent units, and cooking context
  (e.g. 1 L of oil for deep frying is not all eaten), plus other such cases.

## Data profile (GET-only, live APIs)
### Recipes (/api/recipes)
- 2,770 recipes, 21,165 ingredient rows. Empty amount 5.0%, empty unit 18.4%, both 5.0%.
- Units (82 distinct): cup 3099, tablespoons 2656, teaspoon 2280, cups 1795, pieces 1353,
  piece 825, cloves 699, teaspoons 687, tablespoon 679, ounces 570, lb. 534, lbs. 432, lb 256,
  lbs 219, grams 131, tbsp 126, bunch 87, oz. 84, thumbs 66, tsp 60, quarts 58, head 52,
  slices 52, oz 43, stalks 35, medium 33, quart 31, bunches 24, ml 22, can 20, thumb 18, g 18,
  pound 14, heads 10, pack 10, small 10, pinch 10, clove 10, strips 7, leaves 7, whole 6 …
  => ~13k of 21k lines are VOLUME units: a per-food density table is required (cup ≠ 240 g).
- Amount formats: integer 14440, fraction 2929, unicode 1362, empty 1065, mixed 836,
  range 443, decimal 74, other 16 (e.g. "1 /4", "1/ 1/4", "1 20 oz.", "68g", split words
  "2 to"|"matoes").
- Servings: 4=878, null=777 (28%!), 6=401, 3=240, 5=211, 2=121, 8=81, 10+=36, 1=23; odd 30, 36.
- Name phrases: "to taste" 672 rows; "for frying"/"for deep frying" only 1 each;
  frying oil usually appears as plain "3 cups cooking oil" (lumpia) — must infer from
  instructions ("deep fry") and oil quantity. "water" 1054, whole-word "oil" 1495,
  broth 230, stock 38, bones 9, head 70, whole 215, leftover 30, rice 209.
- 197 names embed a quantity ("14 oz. can condensed milk", "45g pack Knorr Ginataang Gulay Mix").
- Section headers parsed as ingredients ("Marinade ingredients:"); marinade and sauce
  sub-lists are FLATTENED (salt/pepper appear twice, no group label stored).
### Recipe details (/api/recipes/{id}, 150 sampled)
- rawText (prefixed "▢ ") keeps notes; only 4/1270 rows contain "(" e.g. "(optional)".
  Prep notes ("minced", "chopped") are in rawText but not in name.
- Instruction keywords (recipes of 150): deep fry 5, fry 27, pan-fry 6, sauté 43, boil 68,
  simmer 26, steam 10, grill 13, bake 21, roast 4, marinate 14, drain 11, discard 4, strain 4.
- 23% of sampled recipes have ZERO instructions -> instruction-based detection is partial.
### DA (/api/commodities)
- 244 commodities, NCR, fields: category, name, price, prevPrice, latestDate, history.
  No unit field: PHP/kg unless the name says otherwise ("56-60 grams/pc" egg per piece,
  "1 Liter/bottle", "350 ml/bottle", "4-6 pcs/kg", "3-4 Small Bundles").
- BUG: 42 MALFORMED names = 2–3 PDF table rows merged with prices embedded, e.g.
  "Ginger, Local … <price> Ginger, Imported … <price> Red Onion, Local 13-15 pcs/kg" (price
  is Red Onion's), "Pork Picnic Shoulder (Kasim) … Pork Rind/Skin, Local" (price is Pork
  Rind's); families: Broccoli 6, Cauliflower 9, Ginger/Red Onion 9, Lettuce 9, Kasim/Rind 9.
  The real item is the LAST name. Fix in src/lib/scrapers/da-scraper.ts (extractCommodities).
- 36 rows have price null. Many cuts exist as Imported vs Local variants.
### FNRI (page i.fnri.dost.gov.ph/fct/library/food_content/all)
- Directory table columns: Food_ID, Food name, Scientific name, Alternate/Common name(s),
  Edible portion. Only foodCode/foodName/nutrients are stored today.
- Alternate (Filipino) names present for 1154/1542 (74.8%; "N/A" = empty),
  e.g. "Rice, well-milled, boiled" -> "Bigas, maputi, sinaing".
- Edible portion: 100% 900; 90–99 64; 50–89 362; <50 156; "-" 60
  (e.g. corn on cob 30%, coconut meat mature 56%, cassava 74%).
- States in names: boiled 169, dried 107, cnd 97, prep 35, fried 24, smoked 10, salted 10, raw 9.
- Basis everywhere: "Amount per 100 g E.P." (5 tabs: Proximates, Other Carbohydrate,
  Minerals, Vitamins, Lipids).

## Proposal outline (to be finalized)
1. Three quantities per ingredient line: as-written -> as-bought (AP) -> as-eaten (EP x consumed fraction).
   Nutrition uses as-eaten; cost uses as-bought/used-up (e.g. frying oil: cost of oil used, nutrition of oil absorbed).
2. Static "recipe compilation" in the backend (parse, match, convert, apply cooking rules, store
   per-line grams + confidence + per-serving nutrition); cost joined at read time from latest DA prices.
3. Canonical ingredient layer + alias table (incl. FNRI Filipino names) + reviewed mapping table
   (manual overrides win); optional one-time LLM batch matching with human review.
4. Per-food density and unit-weight tables (cup/tbsp/clove/piece/head/thumb/bunch/can), edible-portion %.
5. Cooking-role rules: frying medium (absorption fraction), discarded marinade, dredging, broth bones,
   souring agents/aromatics removed, garnish/optional/to-taste defaults, rice raw vs cooked.
6. Validation: scrape WPRM per-serving nutrition labels as a benchmark; sanity ranges; coverage metrics.
7. Prereqs: fix DA merged-row bug; store FNRI alternate names + edible portion; store WPRM group headers
   and notes; handle null servings.

## Status 2026-10-14 (paused at usage limit)
- Phase 0 done and verified live (d2672d1 + DA follow-up fixes).
- Decisions: AI-assisted catalog; frying oil reused 3x; show calorie RANGES for fried
  dishes (lumpia ≈ 90–107 kcal/piece; oil absorption 8–15% and wrapper ≈ 8 g are the
  key uncertainties).
- Phase 1 in progress: quantity parser + tests (src/lib/recipe-compile/quantity.ts);
  data/source/*.tsv snapshots; data/catalog/SPEC.md. NEXT: build data/catalog/aliases.tsv
  (700 names → slugs) then canonicals.tsv (FNRI code, DA item, densities, piece weights),
  each checked by a reviewer agent; then grams conversion, cooking rules, compile script.
