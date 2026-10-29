---
title: "Retention factor datasets"
tags: [source/usda, source/eurofir, source/fao-infoods, source/fnri, data]
aliases: [Datasets, USDA retention factors, Bognár tables, EuroFIR, AH-102]
sources: [USDA 2007, USDA Cooking Yields 2014, Matthews & Garrison 1975, Bognár 2002, Vásquez-Caicedo 2008, Reinivuo 2009, FAO recipe presentation, Greenfield & Southgate 2003, PhilFCT]
updated: 2026-10-29
---

# Retention factor datasets

Back to [[00 Index - Cooking and Nutrients]] · see [[Recipe calculation methods]]

> **Download note.** The USDA and Bognár PDFs could not be opened from this cloud session (its network blocks `ars.usda.gov`, `nal.usda.gov` mirrors and `catalog.data.gov`). Facts below come from their catalog pages and from papers that cite them. **Before building `retention-factors.tsv`, download the tables on the owner's computer and copy the exact values.**

## 1. USDA Table of Nutrient Retention Factors, Release 6 (2007)
- **What:** true-retention factors for **16 vitamins, 8 minerals and alcohol** for about **290 foods** (food group × preparation method: baked, boiled, boiled and drained, broiled, fried, stewed, reheated, etc.). Release 6 added total choline and replaced Release 5 (2003).
- **Method:** true retention per Murphy, Criner & Gray (1975). Covers vitamin C, thiamin, riboflavin, niacin, B6, folate (food folate), B12, vitamin A (IU, RAE, retinol, carotenes), Ca, Fe, Mg, P, K, Na, Zn, Cu. **No factors for protein, fat, carbohydrate or energy**: those are handled by yield and fat change.
- **Files:** `retn06.pdf`, plus CSV (`NutrientRetention.csv` and a data dictionary).
- **Links:** https://www.ars.usda.gov/arsuserfiles/80400530/pdf/retn06.pdf · https://agdatacommons.nal.usda.gov/articles/dataset/USDA_Table_of_Nutrient_Retention_Factors_Release_6_2007_/24660888 · https://catalog.data.gov/dataset/usda-table-of-nutrient-retention-factors-release-6-2007
- **License:** US government work, public domain (Data.gov). **Free to use**, with citation.
- **Usability for SarapSulit:** **best first choice.** Machine-readable, public domain, and organized by food group × method, which maps to catalog slugs. Food groups are US foods but generic enough (leafy greens, roots, legumes, beef, pork, poultry, fish, eggs, grains).

## 2. USDA Agriculture Handbook No. 102 (AH-102), Food Yields (Matthews & Garrison 1975)
- **What:** weight **yield factors** (cooked weight ÷ raw weight, and as-purchased → edible portion) for many foods. Used since 1950 in food service.
- **Status:** old; partly replaced for meat by the table below. *Not opened in this research.*
- **License:** US government work, public domain.

## 3. USDA Table of Cooking Yields for Meat and Poultry, Release 2 (2014)
- **What:** cooking **yield, moisture change and fat change** for specific meat and poultry cuts, from USDA studies with defined cooking methods. Framed as the update to AH-102 for meat.
- **Links:** https://ars.usda.gov/ARSUserFiles/80400535/Data/retn/USDA_CookingYields_MeatPoultry02.pdf · https://agdatacommons.nal.usda.gov/articles/dataset/USDA_Table_of_Cooking_Yields_for_Meat_and_Poultry/24660864/1
- **License:** public domain. **Usability:** good for **fat loss** in grilled/roasted meat. US cuts don't match Filipino cuts exactly (liempo ≈ pork belly).

## 4. Bognár (2002), German Federal Research Centre for Nutrition, Karlsruhe
- **Citation:** Bognár A. *Tables on weight yield of food and retention factors of food constituents for the calculation of nutrient composition of cooked foods (dishes).* Berichte der Bundesforschungsanstalt für Ernährung, BFE-R--02-03. Karlsruhe, 2002.
- **What:** weight yield factors for about **700 foods and dishes**, and retention factors by food group and method (including boiled meat drained vs undrained). Has worked examples and a German–English glossary of cooking methods.
- **Link:** https://publikationen.bibliothek.kit.edu/9642002/1928 (KIT open repository).
- **License:** institutional open-access report; reuse terms not stated in what was seen. **Cite, and check before copying values into a public repo.**
- **Usability:** very good complement to USDA, especially for **boiled-with-broth vs drained** distinctions and for yield factors. Used by EuroFIR and by Food Standards Australia New Zealand (FSANZ) together with USDA.

## 5. EuroFIR recipe calculation (Vásquez-Caicedo, Bell & Hartmann 2008; Reinivuo, Bell & Ovaskainen 2009)
- **What:** EuroFIR's harmonized procedure for calculating composite dishes from raw ingredients with yield and retention factors, plus rules to assign foods to food groups and cooking methods. Recommends a common retention-factor table built mainly from Bognár and USDA.
- **Links:** https://www.eurofir.org/report-on-collection-of-rules-on-use-of-recipe-calculation-procedures-including-the-use-of-yield-and-retention-factors-for-imputing-nutrient-values-for-composite-foods/ · https://www.eurofir.org/how-do-recipes-and-composite-foods-come-to-their-nutritional-values/wp-content/uploads/Final_recipe_calc_harmonisation.pdf
- **Usability:** the **method** to follow. A test across countries found that differences in dish values came **more from the retention factors chosen than from the calculation method** (FAO/INFOODS presentation, 2009 data).

## 6. FAO/INFOODS
- **What:** guidance and training, not a big factor table. Defines yield factor and retention factor, and describes three recipe methods (ingredient, total recipe, mixed); recommends USDA or EuroFIR factors when no local ones exist. Greenfield & Southgate (2003), *Food Composition Data*, FAO, has a chapter on recipe calculation.
- **Links:** https://www.fao.org/fileadmin/templates/food_composition/documents/Presentations/Food_Composition_-_Recipes_and_other_calculations.pdf · https://www.fao.org/4/y4705e/y4705E23.htm · INFOODS Philippines page: https://www.fao.org/infoods/infoods/tables-and-databases/phillipians/en
- **Also:** the FAO/INFOODS **West African** Food Composition Table (2019) and Kenya FCT (2018) include retention-factor tables adapted from USDA/Bognár for tropical foods. *Not opened; worth checking for tropical leafy greens and roots.*

## 7. ASEAN and Philippines
- **ASEAN Food Composition Tables** (INMU, Mahidol University) and Thai tables: no published ASEAN retention-factor table was found. A Thai study gave selenium retention factors for 10 fish species (two cooking methods).
- **FNRI PhilFCT:** mostly raw foods, some cooked rows. No retention-factor table found. See [[Filipino dishes and methods]].

## Recommendation
Use **USDA Release 6** as the base (public domain, CSV), **Bognár 2002** for broth-kept vs drained and yield, and follow the **EuroFIR mixed method**. Keep a `source` column on every row. See [[Applying it to SarapSulit]].
