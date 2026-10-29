---
title: "Applying it to SarapSulit"
tags: [sarapsulit, proposal, engine, status/needs-owner-approval]
aliases: [Proposal, Cooking transformations, retention-factors.tsv]
sources: [USDA 2007, Bognár 2002, Vásquez-Caicedo 2008, Reinivuo 2009]
updated: 2026-10-29
---

# Applying it to SarapSulit

> **⚠ PROPOSAL FOR THE OWNER TO APPROVE.** Nothing here has been built. It changes the nutrition numbers on the site, so it needs your go-ahead, and the UI parts need a local preview with screenshots first (CLAUDE.md rule 4).

Back to [[00 Index - Cooking and Nutrients]] · background: [[Recipe calculation methods]], [[Retention table (summary)]]

## Where the engine is today

`compile.ts` takes FNRI values per 100 g (mostly **raw**), multiplies by `gEaten` (edible portion, absorbed frying oil, marinade fate) and `nutrScale`, and sums. It tracks kcal, protein, fat, carbs, sodium, fiber, calcium, iron, vitamin A and vitamin C. Frying (`uptakeRange`) and marinades (`marinadeFate`) are already handled well. **No vitamin or mineral losses are applied.** `cookedPerRaw` is used only for **cost** (cooked grams → raw grams to price).

What this means: **vitamin C is overstated most** (often 1.5–3× in boiled or stewed vegetable dishes), then iron/calcium in boiled-and-drained vegetable dishes (≈10–25%). Vitamin A, protein, carbs, fiber and sodium are close already.

## Step 0: mark cooked catalog rows (prevents double counting)

Add a column `fnriState` to `data/catalog/canonicals.tsv`: `raw` (default) | `cooked` | `as-eaten`.

- `cooked`: rice_white_cooked (A020), egg_hard_boiled, egg_fried, rice_garlic_fried, lechon (F269), lechon_kawali/bagnet (F149), pork_adobo (R050), noodles_miki (boiled), peanut_roasted, walnuts (roasted cashew stand-in).
- `as-eaten`: condiments and processed foods (patis, bagoong, toyo, canned sardines, corned beef, hotdog, cheese, bread…).
- The engine applies retention only when `fnriState = raw`. For `as-eaten` items it may apply a reduced factor only if the dish clearly cooks them again (start with 1.0).

## Step 1: `retention-factors.tsv`

New file `scraper-backend/data/catalog/retention-factors.tsv` (CRLF, like the others), compiled by `build-catalog.mjs`.

| column | meaning | example |
|---|---|---|
| `group` | food group (new catalog column `foodGroup`) | `leafy_veg` |
| `method` | cooking method key | `boil_drained` |
| `nutrient` | `vitaminC`, `vitaminA`, `iron`, `calcium`, `sodium`, `fiber`, … | `vitaminC` |
| `factor` | best estimate, 0–1 | `0.50` |
| `low` / `high` | range for the "≈" display | `0.30` / `0.60` |
| `source` | short key → [[Bibliography]] | `USDA-R6 3xxx; Lee2018` |
| `note` | why | `leafy greens boiled 5–10 min, water discarded` |

**Food groups** (`foodGroup`, ~12 values): `leafy_veg`, `fruit_veg` (talong, kalabasa, ampalaya, okra, sitaw), `root_tuber` (kamote, gabi, patatas, cassava, labanos), `legume_dry` (monggo, beans), `fruit`, `grain` (rice, noodles, flour), `meat`, `poultry`, `fish`, `shellfish`, `egg`, `dairy`, `fat_oil`, `condiment`, `aromatic` (bawang, sibuyas, luya — small amounts; may share `fruit_veg`). This is finer than `dietClass` (PLANT/MEAT/…), which can seed it.

**Method keys** (~14): `raw`, `acid` (kinilaw), `blanch` (≤3 min), `boil_drained`, `boil_broth` (simmer, liquid eaten), `stew` (≥30 min, sauce eaten), `steam`, `saute` (short ginisa), `deep_fry`, `pan_fry`, `grill`, `roast_bake`, `microwave`, `pressure`.

**Starter values** (to be replaced with exact USDA/Bognár rows; see [[Retention table (summary)]]):

| group × method | vitaminC | vitaminA | iron | calcium | sodium | others |
|---|---|---|---|---|---|---|
| leafy_veg × blanch | 0.75 | 0.95 | 0.95 | 0.95 | 0.95 | 1.0 |
| leafy_veg × boil_drained | 0.50 | 0.90 | 0.85 | 0.85 | 0.80 | 1.0 |
| leafy_veg × boil_broth | 0.70 | 0.90 | 1.0 | 1.0 | 1.0 | 1.0 |
| leafy_veg × saute | 0.70 | 0.95 | 1.0 | 1.0 | 1.0 | 1.0 |
| leafy_veg × steam | 0.85 | 0.95 | 0.95 | 0.95 | 0.95 | 1.0 |
| fruit_veg / root × stew | 0.55 | 0.85 | 1.0 | 1.0 | 1.0 | 1.0 |
| fruit_veg / root × boil_drained | 0.55 | 0.90 | 0.85 | 0.85 | 0.80 | 1.0 |
| any veg × deep_fry / pan_fry | 0.75 | 0.85 | 1.0 | 1.0 | 1.0 | 1.0 |
| any veg × grill / roast_bake | 0.70 | 0.90 | 1.0 | 1.0 | 1.0 | 1.0 |
| meat/poultry/fish × any heat | 0.70 | 0.85 | 0.95 | 1.0 | 1.0 | 1.0 |
| any × raw / acid | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |

`kcal`, `protein`, `carbs`, `fiber` stay at **1.0** in every row. Fat stays as today (absorbed oil) until Step 5.

## Step 2: pick a method per ingredient line

Order of evidence, strongest first:

1. **Line's own role in the steps** (later, if steps are available): "add the kangkong and cook for 2 minutes" → `blanch`.
2. **Recipe method notes**. Today `methodNotes()` keeps frying, oven, grill, steaming, marinade and appliance words. **Add** signals for `boil`, `simmer`, `blanch`, `sauté/ginisa`, `drain`, `discard the water`, `cook for N minutes`. ⚠ Recipes saved with only `methodNotes` need a re-read of their pages to gain the new signals (the `RecipeSkip`/crawl logic must allow that); older recipes with full instructions can be recompiled directly.
3. **Dish type from the title** (strong in Filipino cooking): `nilaga|bulalo|sinigang|tinola|sopas|molo|binacol|pesa|utan|laswa|dinengdeng|batchoy|lomi|mami` → base `boil_broth`; `adobo|kaldereta|menudo|afritada|mechado|paksiw|pochero|kare-kare|ginataan|laing|bicol express|pinakbet` → `stew`; `ginisa|guisado|chopsuey` → `saute`; `prito|fried|lumpia|okoy|chicharon|kawali` → frying (already detected); `inihaw|inasal|bbq` → `grill`; `kinilaw|kilawin|ceviche` → `acid`; `ensalada|salad` → `raw` (or `blanch` if the steps say so); `puto|siomai|steamed` → `steam`.
4. **Line role fallback.** Within a stew or soup, **leafy greens default to `blanch`** (they're almost always added last). Aromatics (garlic, onion, ginger, tomato) at the start of a ginisa get `saute`. Fruit eaten raw in a dessert gets `raw`.
5. **Unknown** → use the group's **median heat factor** and mark the line `method: "assumed"`, so the site can say so.

Store the chosen method on each `CompiledLine` (`cookMethod`, `cookMethodWhy`) like the existing `reason` field, so it is visible in `/api/recipes/compiled?id=`.

## Step 3: the broth rule

- `boil_broth` and `stew` assume the **liquid is eaten**: minerals ≈ 1.0, vitamin C ≈ 0.6–0.7.
- `boil_drained` when the steps say "drain", "discard the water", "set aside the boiled …", or the dish is an ensalada / blanched side.
- **Lechon kawali / bagnet**: the pork is boiled and drained, then fried. The FNRI fried-pork row already covers it (`fnriState = cooked`), so no factor.
- If the recipe says "skim the fat", allow a fat factor later (Step 5).

## Step 4: yield factors

- **Not needed** for SarapSulit's current numbers (per recipe and per serving). Totals don't depend on yield. See [[Recipe calculation methods]].
- Keep using `cookedPerRaw` for cost.
- Needed only if the site ever shows **per 100 g of the cooked dish** or **grams per serving**. Then use Bognár 2002 / USDA 2014 yields per group × method.

## Step 5 (later): fat loss from grilled/roasted fatty meat

Fat factor 0.7–0.95 for inihaw na liempo, lechon manok and grilled chicken with skin, from USDA 2014 fat-change values. Keep the absorbed-oil model for frying as is.

## What to show on the site

- In the recipe pop-up nutrient list: **"Vitamin C (after cooking) ≈ 18 mg"** with a small "ℹ" that opens: *"Raw ingredients: 32 mg. Boiling and long simmering lose some vitamin C into the water and to heat. Estimate from USDA and German food tables; real values depend on cooking time."* Use the `low`–`high` range for "≈ 14–21 mg" if space allows.
- Show "after cooking" only for **vitamin C, vitamin A, iron and calcium** (the ones that change). Other nutrients stay as they are.
- If the method was **assumed** (Step 2 rule 5), add "(cooking method guessed)".
- Tips, not numbers, for absorption: "Kangkong added at the end keeps more vitamin C", "Gata helps your body absorb the vitamin A from kalabasa", "Calamansi helps you absorb iron".
- Every new button or label needs a `data-i18n` key in `settings.js` `I18N` (tl and en).
- **Ranking:** start by **showing** cooked values only. Switch the "sulit" ranking and the nutrition-per-peso score to cooked values **after** you've reviewed the numbers on 20–30 familiar dishes.

## Honest caveats to keep
- Retention factors come mostly from US and European foods and lab conditions. Filipino cooks' times vary widely.
- Ranges for vitamin C are wide (0–90%). The site should say "≈" and never show false precision.
- FNRI publishes no cooked-dish retention data (as far as found).

## Tests to add (when building)
- `retention-factors.tsv` loads; every row's factor is within [low, high] ⊂ [0, 1]; every `source` key exists in the bibliography list.
- A cooked FNRI row (`rice_white_cooked`) gets factor 1.0 (double counting test).
- Sinigang keeps iron at 1.0; ensaladang kangkong (blanched, drained) lowers iron.
- Kinilaw keeps vitamin C at 1.0.
- Protein/kcal unchanged by Step 1.

## What I'd build first
1. Step 0 (`fnriState`) + Step 1 with **vitamin C only** + Step 2 rules 3–5 (title and line role, no re-crawl needed) + Step 3. Show "Vitamin C (after cooking) ≈" in the pop-up only.
2. Then add vitamin A, iron and calcium rows.
3. Then new methodNotes signals and a re-crawl.
4. Then ranking on cooked values, and fat loss.
