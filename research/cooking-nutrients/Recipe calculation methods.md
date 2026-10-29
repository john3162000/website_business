---
title: "Recipe calculation methods"
tags: [concept/recipe-calculation, concept/retention-factor, concept/yield-factor, source/eurofir, source/fao-infoods]
aliases: [Formulas, Retention factor method, Yield factor method, Double counting]
sources: [Murphy 1975, Vásquez-Caicedo 2008, Reinivuo 2009, FAO recipe presentation, Greenfield & Southgate 2003, Bognár 2002, USDA 2007]
updated: 2026-10-29
---

# Recipe calculation methods (the formulas)

Back to [[00 Index - Cooking and Nutrients]] · terms in [[Key terms]] · data in [[Retention factor datasets]]

## The basic formula (ingredient level)

For each ingredient *i* cooked by method *m*, and each nutrient *n*:

```
nutrient_cooked[i,n] = C_raw[i,n] / 100  ×  W_raw[i]  ×  EP[i]  ×  RF[group(i), m, n]
```

- `C_raw` = nutrient per 100 g raw edible portion (FNRI).
- `W_raw` = raw weight as bought (g); `EP` = edible-portion share. (SarapSulit's `gEaten` already equals `W_raw × EP`, with marinade and oil corrections.)
- `RF` = **true** retention factor (0–1) for the food group, method and nutrient.

Dish total: `N_dish[n] = Σ_i nutrient_cooked[i,n]` plus added fat (absorbed oil) and minus lost fat (drippings).

## Per serving vs per 100 g

- **Per serving** = `N_dish / servings`. **No yield factor needed.** This is what SarapSulit shows.
- **Per 100 g cooked dish** needs the cooked weight:
  ```
  W_cooked = Σ_i W_raw[i] × EP[i] × YF[i]      (ingredient-level yield)
          or  (Σ_i W_raw[i] × EP[i]) × YF_recipe (recipe-level yield)
  per100g[n] = N_dish[n] / W_cooked × 100
  ```
  `YF` = cooked weight ÷ raw weight. A yield factor changes concentration only.

## Why true retention matters

True retention (Murphy, Criner & Gray 1975):

```
TR = (C_cooked × W_cooked) / (C_raw × W_raw)
```

Because TR already accounts for weight change, you **multiply raw totals by TR** and you're done. If you instead used *apparent* retention (`C_cooked / C_raw` per 100 g), you'd have to multiply by the yield too, and errors stack. USDA Release 6 and Bognár give true retention.

## The three recipe methods (EuroFIR / FAO-INFOODS)

| Method | Yield applied at | Retention applied at | Pros / cons |
|---|---|---|---|
| **Ingredient method** | each ingredient | each ingredient | No need to decide the dish's food group; total weight change is only estimated. |
| **Recipe method** | whole dish | whole dish (by main ingredient's group) | Needs measured dish weight; one RF for all ingredients is crude. |
| **Mixed method** (recommended) | whole dish | **each ingredient** | Most recommended by EuroFIR. Gives each ingredient the RF of its own food group. |

The FAO/INFOODS comparison found Mixed and Recipe methods gave similar results, and that **the choice of retention factors mattered more than the method**.

**For SarapSulit:** retention at ingredient level (mixed method). Yield only if per-100 g values are ever shown.

## Avoiding double counting (checklist)

1. **Cooked composition rows get no RF.** If the FNRI row is already cooked (boiled rice A020, fried pork belly F149, roasted pork belly F269, canned adobo R050, boiled egg, boiled miki), RF = 1. Its weight must also be a cooked weight. Add a `state` column (`raw` / `cooked` / `as-eaten`) to the catalog.
2. **Use true retention with raw weights**, never true retention and a yield factor together on totals.
3. **Oil counted once.** Absorbed frying oil is added as grams of oil (SarapSulit's `absorbed` range). Don't also apply a "fried → fat gain" factor to the food itself. Fat *loss* from fatty meat is a separate, negative correction.
4. **Leaching counted once.** If a "boiled, drained" RF is used, the leached part is gone. If the broth is eaten, use the "broth kept" RF (or 1.0 for minerals); don't add the broth as a separate ingredient as well.
5. **Marinade fate counted once.** `marinadeFate` already removes nutrients of discarded marinade. Don't also apply a leaching RF to marinade lines.
6. **Bioavailability is not retention.** Don't raise beta-carotene or iron because of fat or vitamin C in the meal; show a note instead.
7. **Processed products** (patis, bagoong, canned sardines, corned beef, tocino, hotdog) are "as eaten" products, so RF applies only to *further* home cooking, and conservatively.
