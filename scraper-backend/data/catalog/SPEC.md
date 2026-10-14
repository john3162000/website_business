# Ingredient catalog spec (Phase 1)

Source snapshots (read-only): `data/source/ingredients.tsv` (top 700 normalized
recipe names: name, uses, top units, example rawText), `data/source/fnri.tsv`
(foodCode, foodName, altNames, ediblePortion %, kcal, protein, fat, carbs,
sodium — all per 100 g edible portion), `data/source/da.tsv` (name, category,
price, unit label, pieceGrams, bottleMl, piecesPerKg).

## aliases.tsv — one row per recipe name (nameKey)
Columns, tab-separated, header row first:
`nameKey  lineClass  slugs  size  note`
- `nameKey`: exactly the name from ingredients.tsv.
- `lineClass`: one of
  - `FOOD` — a real ingredient (most rows)
  - `TO_TASTE` — seasoning "to taste" lines; slugs list what is seasoned with (e.g. `salt|black_pepper`)
  - `WATER` — plain water / ice / water for boiling (not "coconut water", "rice water")
  - `HEADER` — section headers or junk ("cooking procedure", ">>cake:", "marinade ingredients:")
  - `UNIT_ONLY` — a leftover unit/container with no food ("can", "cans", "pack", "cup", "of salt" is NOT this: map it)
  - `EQUIPMENT` — foil, skewers, banana leaves used only for wrapping
- `slugs`: canonical ingredient slug(s), `|`-separated for compound lines
  ("salt and pepper to taste" → `salt|black_pepper`). Empty for HEADER/UNIT_ONLY/EQUIPMENT/WATER.
- `size`: `small|medium|large` when the name carries a size word, else empty.
- `note`: short, optional (e.g. "unit word in name: thumbs").

## Slug rules
- snake_case, singular, specific enough to pick ONE FNRI food and ONE DA item:
  `onion_yellow`, `onion_red`, `garlic`, `garlic_powder`, `pork_belly`, `pork_ground`,
  `chicken_whole_cut`, `chicken_breast_boneless`, `egg_chicken`, `egg_quail`,
  `oil_cooking`, `oil_olive`, `oil_sesame`, `soy_sauce`, `soy_sauce_dark`, `fish_sauce`,
  `vinegar_cane_white`, `vinegar_coconut`, `sugar_white`, `sugar_brown`, `flour_all_purpose`,
  `cornstarch`, `black_pepper`, `peppercorn_whole`, `bay_leaf`, `bell_pepper_red`,
  `bell_pepper_green`, `chili_long_green` (siling haba), `chili_bird` (siling labuyo / Thai chili),
  `stock_cube_pork` (Knorr pork cube), `broth_chicken`, `rice_white_raw`, `rice_white_cooked`.
- Prep/state words that change the food: keep them in the slug (`rice_white_cooked`,
  `garlic_toasted`, `egg_hard_boiled`, `cheese_cheddar`). Prep words that don't (minced,
  chopped, crushed, sliced, fresh, medium) do NOT create a new slug.
- Brands: generic slug unless the product is distinct (`stock_cube_pork`, `seasoning_magic_sarap`,
  `mix_sinigang_tamarind`, `mayonnaise`, `liver_spread`, `seasoning_liquid_knorr`).
- Alternatives "pork or chicken": first option.

## canonicals.tsv — one row per slug
`slug  label  fnriCode  fnriName  fnriWhy  daName  daWhy  dietClass  gPerCup  gEach  gEachSmall  gEachLarge  gClove  gHead  gThumb  gBunch  gStalk  gSlice  epPct  epNote  role  confidence  notes`
- `fnriCode`/`fnriName`: the single best FNRI row for the food AS USED IN THE RECIPE
  (raw unless the slug says cooked/fried/dried/canned). Never a prepared dish
  ("prep", "w/ …") for a basic ingredient. Leave empty if FNRI has nothing close — do not force.
- `daName`: exact DA name from da.tsv, or empty when DA does not sell it (condiments, dairy,
  flour, sauces…). Prefer Local over Imported, unbranded over branded, medium size, when several fit.
- `dietClass`: MEAT|POULTRY|FISH|SEAFOOD|EGG|DAIRY|ANIMAL_CONDIMENT (patis, bagoong, oyster sauce,
  meat cubes, lard, gelatin)|PLANT.
- `gPerCup`: grams per US cup (236.6 ml) of the ingredient as typically measured
  (USDA household measures; water 236.6, oil 218, all-purpose flour 125, white sugar 200,
  raw white rice 185, soy sauce 255). Leave empty for things never measured by volume.
- `gEach`: grams of one typical (medium) piece AS PURCHASED (whole onion incl. skin ≈ 110,
  egg ≈ 50 shell-off / 58 in shell — use as purchased 58, tomato 120, carrot 70, chicken cube 10,
  lumpia wrapper ≈ 8?). `gEachSmall`/`gEachLarge` when sizes matter.
- `gClove` (garlic ≈ 5), `gHead` (garlic ≈ 40, cabbage ≈ 900, lettuce), `gThumb` (ginger ≈ 15),
  `gBunch` (kangkong ≈ 250, pechay ≈ 300), `gStalk` (lemongrass ≈ 15, celery ≈ 40, green onion ≈ 10),
  `gSlice` (bread, bacon, cheese, ginger): only where that unit is used.
- `epPct`: edible fraction (%) of the AS-PURCHASED piece/weight when the recipe weight includes
  refuse (onion skin 90, whole chicken cut 68, bone-in chops, whole fish, shrimp head-on 55,
  unpeeled carrot 89). 100 for boneless/trimmed/volume-measured. Prefer FNRI ediblePortion when the
  FNRI row describes the same physical form; say which in epNote.
- `role`: default cooking role hint: `normal` | `frying_oil_candidate` (cooking/vegetable/canola/palm
  /coconut oil, lard, shortening) | `removed_aromatic` (bay leaf, whole peppercorn, lemongrass stalk,
  pandan, star anise, cinnamon stick) | `water` | `garnish_typical`.
- `confidence`: high|medium|low for the FNRI+DA choice; `notes`: anything a reviewer should check.
- All numbers are approximate: mark doubtful ones with `?` in notes, never invent precision.

## Added after review
- `nutrScale`: multiply the FNRI nutrients by this when the closest FNRI row is a
  denser form (coconut_milk 0.6 against the coconut-cream-like K002; cream_heavy 1.4).
- `cookedPerRaw`: the slug is measured cooked but priced from a raw DA item; cost uses
  grams ÷ cookedPerRaw at the raw price (rice_white_cooked 2.76).
- `epPct` applies to mass and count lines only. Volume-measured lines (cups, tbsp) are
  already the trimmed food, so their edible fraction is 100.
- Review files: review-top.tsv (slugs 1–120) and review-rest.tsv (121–346). All
  proposals were applied except the three bell pepper daName switches, because the DA
  unit parser now reads "(151-250gm/pc)" as a per-kg price with a piece size.
