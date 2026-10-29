---
title: "Fat and Frying"
tags: [nutrient/fat, nutrient/energy, method/deep-frying, method/pan-frying, method/grilling]
aliases: [Fat, Taba, Oil uptake, Frying oil, Dripping loss]
sources: [Bognár 1998, Fillion & Henry 1998, Saguy & Dana 2003, USDA Cooking Yields 2014, Bognár 2002]
updated: 2026-10-29
---

# Fat and frying

Back to [[00 Index - Cooking and Nutrients]] · see also [[Deep frying]], [[Pan frying]], [[Grilling and Roasting]]

Fat is the nutrient whose amount changes most *in both directions* with cooking, and it drives calories (9 kcal per gram).

## Gains: frying
- Fried food **absorbs oil**. Bognár (1998) measured **~2–14 g of fat taken up per 100 g raw food** for pan- and deep-fried vegetables, potatoes, and breaded meat, poultry and fish.
- Uptake rises with: **batter or breading** (lumpia, okoy, calamares, fried chicken), **more surface** (thin slices, shredded), **lower oil temperature**, **longer time**, starchy or porous food.
- Uptake reaches a **saturation limit** for each food. Bognár found **deep-fried meat, poultry and fish usually took up less fat than pan-fried**. The type of oil made no essential difference.
- Most oil enters **after** the food leaves the pan, as it cools (moisture escapes, oil on the surface is drawn in). Draining on paper helps (Saguy & Dana 2003, qualitative).

**SarapSulit already does this:** `uptakeRange()` in `compile.ts` gives 1–3% for fatty pork, 3–7% for plain deep-fried food, 8–14% for coated, 8–15% for wrapped (lumpia), with a kcal range. These ranges fit Bognár's 2–14 g/100 g.

## Losses: fatty meat
- **Non-breaded, high-fat animal foods lose 2–30% of their fat when fried** (Bognár 1998): fat melts into the pan.
- **Grilling and roasting** lose fat as **drippings**. The USDA Table of Cooking Yields for Meat and Poultry (2014) gives *fat change* per cut and method.
- **Lechon kawali / bagnet:** pork belly is boiled first (fat goes into the water), then deep-fried (more fat renders out). The FNRI "pork belly, fried" row (F149) already describes the cooked product, so no factor is needed.
- **Nilaga / bulalo:** fat floats to the top. If skimmed off, less fat is eaten. *Unknown per recipe; leave at 100% unless the steps say "skim".*

## Oil quality
- Reused oil oxidizes: vitamin E falls and harmful oxidation products rise. Fried foods in fresh oil are still a reasonable source of vitamin E (Fillion & Henry 1998). See [[Vitamins D, E and K]].

## For SarapSulit
- Keep the current absorbed-oil model; it's well grounded.
- **Add later:** a fat *loss* factor for grilled or roasted fatty pork and chicken with skin (inihaw na liempo, lechon manok): ~0.7–0.95 of raw fat, using USDA 2014 fat-change values.
- **Never count oil twice.** If the oil line is counted as absorbed grams, don't also apply a "fried" fat gain to the food. See [[Recipe calculation methods]].
