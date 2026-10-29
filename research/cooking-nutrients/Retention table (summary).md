---
title: "Retention table (summary)"
tags: [summary, table, sarapsulit]
aliases: [Summary table, Retention summary, Nutrient by method]
sources: [USDA 2007, Bognár 1998, Bognár 2002, Lešková 2006, Lee 2018, Yuan 2009, McKillop 2002, Kimura & Itokawa 1990, Kimura 1990 thiamin, Bethke & Jansky 2008, Watanabe 1998, Williams 1996, Fillion & Henry 1998, Lombardi-Boccia 2002, Rock 1998, Dewanto 2002, Chai & Liebman 2005]
updated: 2026-10-29
---

# Retention table (summary)

Back to [[00 Index - Cooking and Nutrients]] · formulas in [[Recipe calculation methods]]

**How to read it.** Each cell is the **share of the raw nutrient still in the food you eat** (true retention), as a typical range. 1.0 = nothing lost. Ranges are wide because time, temperature, cut size and amount of water vary. Evidence: **●** well established · **◐** moderate · **○** weak/inferred. Exact USDA values must be checked against `retn06` before use ([[Retention factor datasets]]).

## Vitamins and minerals (vegetables unless stated)

| Nutrient | Boil, drained | Boil/simmer, broth eaten | Long stew (sauce eaten) | Steam | Sauté / stir-fry | Deep / pan fry | Grill / roast | Bake | Microwave | Raw / kinilaw |
|---|---|---|---|---|---|---|---|---|---|---|
| [[Vitamin C]] | 0.0–0.6 ● | 0.6–0.8 ◐ | 0.4–0.7 ◐ | 0.7–0.95 ● | 0.5–0.85 ◐ | 0.6–0.9 ◐ | 0.6–0.9 ○ | 0.5–0.8 ○ | 0.7–0.95 ◐ | ~1.0 |
| [[Thiamin (B1)]] | 0.5–0.8 ● | 0.7–0.9 ◐ | 0.5–0.8 ◐ | 0.8–0.95 ◐ | 0.7–0.9 ◐ | 0.7–0.9 ◐ | 0.6–0.85 ◐ | 0.6–0.85 ◐ | 0.8–0.95 ○ | ~1.0 |
| Folate ([[Other B vitamins]]) | 0.4–0.6 ● | 0.7–0.85 ○ | 0.5–0.7 ○ | 0.85–1.0 ● | 0.7–0.9 ○ | 0.7–0.9 ○ | 0.7–0.9 ○ | 0.6–0.85 ○ | 0.8–0.95 ○ | ~1.0 |
| B12 (meat, fish) | 0.6–0.9 ◐ | 0.8–0.95 ○ | 0.7–0.9 ○ | 0.8–0.95 ○ | 0.8–0.95 ○ | 0.7–0.9 ○ | 0.7–0.9 ◐ | 0.7–0.9 ○ | 0.6–0.7 ● | ~1.0 |
| [[Vitamin A and Carotenoids]] (content) | 0.8–1.0 ◐ | 0.85–1.0 ◐ | 0.75–0.95 ◐ | 0.9–1.0 ◐ | 0.9–1.0 ◐ | 0.75–0.95 ◐ | 0.8–0.95 ○ | 0.8–0.95 ○ | 0.9–1.0 ◐ | ~1.0 |
| …absorption | ↑ | ↑ | ↑ | ↑ | ↑↑ (oil) | ↑↑ | ↑ | ↑ | ↑ | low |
| [[Iron]] | 0.7–0.95 ◐ | 0.95–1.0 ◐ | 0.95–1.0 ◐ | 0.85–1.0 ◐ | 0.95–1.0 ◐ | 0.95–1.0 ● | 0.85–1.0 ◐ | 0.95–1.0 ◐ | 0.95–1.0 ○ | 1.0 |
| [[Calcium]] | 0.75–0.95 ◐ | 0.95–1.0 ◐ | 0.95–1.0 ◐ | 0.85–1.0 ◐ | 0.95–1.0 ◐ | 0.95–1.0 ● | 0.9–1.0 ◐ | 0.95–1.0 ◐ | 0.95–1.0 ○ | 1.0 |
| Potassium | 0.25–0.85 ● | 0.95–1.0 ◐ | 0.95–1.0 ◐ | 0.8–0.95 ◐ | 0.95–1.0 ◐ | 0.95–1.0 ● | 0.85–1.0 ◐ | 0.95–1.0 ● | 0.9–1.0 ○ | 1.0 |
| Magnesium, zinc | 0.7–0.95 ◐ | 0.95–1.0 ◐ | 0.95–1.0 ◐ | 0.85–1.0 ◐ | 0.95–1.0 ◐ | 0.95–1.0 ● | 0.9–1.0 ◐ | 0.95–1.0 ◐ | 0.95–1.0 ○ | 1.0 |
| Sodium (food's own) | 0.6–0.9 ◐ | 1.0 | 1.0 | 0.85–1.0 | 1.0 | 1.0 | 0.9–1.0 | 1.0 | 1.0 | 1.0 |

## Energy nutrients (all foods)

| Nutrient | Water methods | Frying | Grill / roast | Notes |
|---|---|---|---|---|
| [[Protein]] | 0.95–1.0 ● | 1.0 ● | 0.95–1.0 ● | Digestibility **up** (egg 51% → 91%). Lysine slightly down with browning. |
| [[Fat and Frying]] | 1.0 (minus skimming) | **+2 to +14 g / 100 g raw** (coated: high) ●; fatty meat −2 to −30% ● | 0.7–1.0 of raw fat ◐ | Already modelled for frying in SarapSulit. |
| [[Carbohydrates, Starch and Fiber]] | 1.0 ● | 1.0 ● | 1.0 | Resistant starch +~1 g/100 g in cooled rice ◐ |
| Fiber | 0.9–1.1 ◐ | 1.0–1.1 ◐ | 1.0 | |
| Energy (kcal) | follows fat | follows fat | follows fat | |

## Main sources per row
- Vitamin C: Lee et al. 2018 (0–91%; microwave best, boil worst); Yuan et al. 2009 (steam only method without significant loss); Dewanto et al. 2002 (−29% in 30 min); USDA 2007 (leafy boiled ≈ 0.55, secondary); Bognár 1998 & Fillion & Henry 1998 (frying ≥ boiling); Williams 1996 (hot-holding, reheating).
- Thiamin: Kimura et al. 1990 (meals 50–60% of calculated; boiling worst); Lešková et al. 2006 (20–80%).
- Folate: McKillop et al. 2002 (boil 44–49%, steam ~100%).
- B12: Watanabe et al. 1998 (microwave −30–40%).
- Carotenoids: Lee et al. 2018 (40–125%); Rock et al. 1998; Livny et al. 2003; Brown et al. 2004.
- Minerals: Kimura & Itokawa 1990 (60–75% overall in mass cooking); Bognár 1998 (boil/steam −25–50%, frying ~0); Bethke & Jansky 2008 (K −50% diced, −75% shredded).
- Heme iron: Lombardi-Boccia et al. 2002 (−1 to −43%).
- Oxalate (antinutrient): Chai & Liebman 2005 (boil −30–87%, steam −5–53%).

Full references: [[Bibliography]].
