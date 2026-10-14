# SarapSulit data-transformation layer: integrated proposal

**Status:** a synthesis of five critiqued designs (entity resolution, quantity and units, cooking adjustments, cost model, pipeline) and the edge-case sweep. Where the designs conflicted, the resolution is stated. Wherever the real data profile contradicts a design assumption, the profile wins. Numbers marked **≈** are approximate. The source family is named in brackets: [USDA HM] USDA household measures, [USDA ref] USDA refuse %, [USDA CY] USDA cooking yields, [R6] USDA Retention Factors Release 6, [Bognár] Bognár 2002, [INFOODS] FAO/INFOODS guidelines, [EuroFIR] EuroFIR recipe calculation. Values marked [heur] are author heuristics that the golden set should calibrate. **All prices in the examples are illustrative.**

---

## 0. Resolved conflicts between the five designs

| Conflict | Resolution |
|---|---|
| Matching in the browser vs offline | **Offline.** A local `tsx` script compiles every recipe. The site only looks results up and multiplies by live prices. |
| Separate `ResolvedLine`, `IngredientCooking` and `CompiledLine` tables, plus blue/green `CompileRun` | **None of these for v1.** The compile output is static JSON published with the GitHub Pages site. Reviewed mappings live as CSV/JSON in git, so git provides audit, undo and blame. Postgres gains only the catalog and binding tables that `/api/prices` needs. |
| Nutrition basis vs cost basis | Nutrition uses **grams eaten**, which start from the edible portion (EP). Cost uses **grams used** as purchased (AP). They differ only by the explicit factors in §5–§6. EP never reduces cost. |
| AP/EP by comma position vs by unit kind | **By unit kind**, plus a short "bought trimmed" word list that counts only when the word **precedes** the noun. The comma convention is unreliable in Panlasang Pinoy name spans ("garlic crushed"). |
| FNRI EP% "always wins" vs recipe-form defaults | FNRI EP% applies **only** when the FNRI row describes the same physical form as the recipe line (whole bird, whole fish, head-on shrimp). Volume lines and trimmed forms get EP = 1. |
| Frying oil detected from "for frying" notes | The profile shows only 2 such rows in 21,165. So frying is **inferred from oil volume, title and instructions**, and notes are a bonus. |
| Oil absorption as % of listed oil vs % of fried food | **% of fryable food mass, bounded.** When the food weight came from a fallback, use a listed-oil fraction instead (§5.2). |
| Cheapest DA variant per day vs curated default | **Curated default rank per canonical.** Switch only when the primary has no price; always show the min–max range. Budget mode is an optional later toggle. |
| Coverage by line count, or by grams (water inflates it) | Coverage is weighted by **estimated energy** for nutrition and by **estimated cost share** for cost. Water, free and negligible lines are excluded from both sides. |
| Imputed servings (bodyEP / R) | **No imputation in v1.** NULL servings default to 4, flagged "servings assumed", with no per-serving ranking. Phase 2 tries recovering them from WPRM `recipeYield`. |
| cup = 240 ml vs 236.6 ml | **US customary everywhere:** cup 236.6 ml, tbsp 14.79, tsp 4.93, quart 946.4. Panlasang Pinoy is a US-measure site, and USDA densities are per US cup. |
| `isAnimal` boolean | Replaced by `dietClass` (MEAT, POULTRY, FISH, SEAFOOD, EGG, DAIRY, PLANT). It is evaluated over **all** lines except ALTERNATE, and the vegetarian tag is withheld if any line is unresolved. |
| Retention for B1/B2 | Not in v1. The client does not display B1/B2. Phase 2 implements vitamin C and A retention plus minerals for boil-and-drain. |

---

## 1. The core idea: three quantities per ingredient line

Each ingredient line is a sentence such as "2 lbs chicken, cut into serving pieces". From it we compute three quantities. Each one answers a different question.

1. **As written:** what the recipe says, parsed cleanly. Example: 2 lb, unit kind *mass*, canonical ingredient `chicken_whole_cut`. Nothing is converted yet. The parser only repairs fractions, ranges, malformed amounts and units hidden in the name.
2. **As bought (`gAP`):** the grams you carry home from the market, bones, peel and shells included. DA prices are per kg as sold, so **cost** starts here. A per-line cost fraction `cf` (§5–§6) then scales it into **grams used** (`gUsed = gAP × cf`). For example, frying oil left in the pot is amortised over reuses, but a discarded marinade is still paid for.
3. **As eaten (`gEaten`):** the grams that end up in someone's mouth, `gAP × EP × nf`. Here `EP` is the edible fraction (FNRI values are per 100 g E.P.) and `nf` is the consumption fraction (bay leaf removed = 0, deep-fry oil = only what is absorbed). An optional fat factor `ff` removes rendered or drained fat, and retention factors trim vitamins. **Nutrition** starts here.

```
as written ──parse──► gAP (as bought) ──× cf──► gUsed  ──× ₱/g (live DA)──► cost
                          │
                          └──× EP × nf──► gEaten ──× FNRI/100 × ff × R──► nutrients
```

**Per serving** = Σ lines ÷ servings. Nutrition is never computed per 100 g of the finished dish, so reduction and evaporation need no yield factor. Yield factors appear only when a line is **measured cooked** ("4 cups cooked rice").

---

## 2. Pipeline overview: static compile vs continuous price join

| Part | Changes | Computed | Stored |
|---|---|---|---|
| Recipes, FNRI, catalog, aliases, rules | Rarely (new posts, review sessions) | **Compile**: local `npx tsx scripts/compile.ts` (no 60 s limit), run on demand after edits | `docs/data/recipes.v2.json` plus `docs/data/lines/{bucket}.json`, committed to the site |
| DA prices | Daily | Existing DA scraper, then `GET /api/prices` aggregates on read | `Commodity` (existing) |
| Cost per serving | Daily | **In the browser**: Σ `costBasis` × price | Not stored |

```
 STATIC (git + Postgres, compile on demand)                CONTINUOUS (daily)
 ┌────────────────────────────────────────────┐            ┌──────────────────────────────┐
 │ Recipe / RecipeIngredient / Instruction    │            │ DA PDF → fixed parser        │
 │ NutritionFact (+altNames, EP%, Na, state)  │            │ (merged rows split, category │
 │ git: data/canonicals.csv  aliases.csv      │            │  in key, unit basis parsed)  │
 │      bindings.csv  manual-prices.csv       │            │ → Commodity (NCR, daily)     │
 │      units.json  densities.json  rules.ts  │            └──────────────┬───────────────┘
 │      overrides.csv (by RecipeIngredient.id)│                           │
 └───────────────┬────────────────────────────┘                           ▼
                 │ seed.ts (idempotent) ──► Canonical + Binding tables ──► GET /api/prices
                 ▼                                                     ref price per slug
   compile.ts (pure compileRecipe(), node --test)                      (5-obs median, status,
   → recipes.v2.json  {perServing, quality, costBasis[slug,qty,dim]}    range, source)
   → lines/*.json     (per-line breakdown for the modal + review)       s-maxage=3600
                 │                                                           │
                 └────────────── GitHub Pages (docs/index.html) ◄────────────┘
                                 cost = Σ qty × price[slug][dim]   (toggles re-cost instantly)
```

**Why static.**
- 2,770 recipes and 21,165 lines compile in under 30 s on a laptop.
- No DB writes are needed for compile output, so the Tokyo latency and 60 s Vercel limit don't apply.
- The live API surface shrinks to one small endpoint (`/api/prices`, about 40 KB, CDN-cached).
- `recipes.v2.json` is about 2.5–3 MB raw, roughly 400 KB gzipped by Pages. That is fine, but drop rule codes and confidences from the list file.
- Per-line detail is sharded into ~28 files of 100 recipes each, fetched when a modal opens.

**Bulk DB writes** (seeding, FNRI metadata, Phase 2 group backfill) follow one rule:
- inserts use `createMany` in chunks of ≤ 2,000 rows (keeps bind params under 65,535);
- updates use one `UPDATE … FROM (VALUES …)` statement per 500 rows via `$executeRaw`;
- never a per-row upsert loop. This also applies to the existing `nutrition-scraper.saveRows`.

**Optional:** pin Vercel functions to `hnd1` (Tokyo) if the plan allows. It speeds up every scraper.

---

## 3. Matching

### 3.1 Three hops, reviewed per canonical, not per raw string

```
raw name ──normalize──► nameKey ──aliases.csv──► canonical slug ──canonicals.csv──► FNRI foodCode (+ policy)
                                                        └──bindings.csv──► ranked DA items (+ isProxy)
```

- **nameKey.** 3,386 raw names collapse to about 2,400 nameKeys (est.). Keep a `rawName → nameKey` map for all 3,386 names, so a normalizer change can migrate decisions with explicit merge and split handling.
- **Canonical ingredient.** About 400–800 in total. The MVP reviews about 200, which cover the top ~300 nameKeys. One canonical row carries everything downstream needs:
  - `slug, displayName, kind` (FOOD | SEASONING | BRAND_SEASONING | OIL | WATER | NON_FOOD)
  - `dietClass`
  - `fnriFoodCode, fnriStateUsed, nutritionPolicy` (FNRI | PROXY | CUSTOM | NEGLIGIBLE | UNKNOWN)
  - `customPer100g` (label values for brand mixes)
  - `densityGml` (with form overrides), `pieceG` (with S/M/L), `unitAliases`
  - `epForm` (whole | trimmed), `epOverride`, `cookedYield` (for measured-cooked canonicals)
  - `pricePolicy` (DA | DERIVED | MANUAL | NOT_COSTED | FREE), `derivedFrom`, `derivedRatio`, `buyIncrement`, `pantry`
- **Split rule.** Create a separate canonical only when one of these holds:
  - a different FNRI row differs by more than 15% in kcal or protein;
  - a distinct DA item exists;
  - the edible portion differs by more than 15 points (fish head, pata, head-on shrimp);
  - it is a purchased processed form (dried, canned, smoked, salted);
  - it is measured cooked (cooked rice).

  Never split by prep word, size, or the brand of a commodity product.

### 3.2 Normalizer (deterministic)

Steps, in order:
1. NFKD and lowercase; strip the `▢` prefix.
2. Expand unicode fractions.
3. Recover the notes span: `rawText` minus the amount, unit and name text.
4. Pull out flags: to taste / as needed / optional / for frying / garnish / for serving / for dipping / for dredging.
5. Strip quantity prefixes into `packageGrams`, e.g. `45g pack …`, `14 oz. can …`. Allow `lb.` and `oz.` with a period. Apply `packageGrams` only when the unit is a container or count word, or empty, and multiply it by the amount.
6. Re-parse from `rawText` when the name equals `rawText` or is a bare unit word (`can`, `pack`).

**What the nameKey keeps and drops.**
- **Keeps:** state words (cooked, leftover, dried, canned, smoked, salted, fried, boiled, head-on, peeled, boneless, ground), colour and variety words (red, green, young, ripe, sweet), and plant-part words (leaf/leaves, talbos, flower, blossom).
- **Drops:** prep verbs (chopped, minced, sliced, crushed), size words (stored as `size`), and filler words.

**Singularization is data-driven.** Strip -s/-es/-ies only when the singular form also occurs in the corpus or lexicons, and never for Filipino tokens. This avoids patis→pati, sibuyas→sibuya, bangus→bangu and molasses→molass.

**Hyphen and space compounds are folded on both sides** (all-purpose = all purpose).

### 3.3 Line classification (ordered, first match wins)

1. **HEADER.** Amount and unit are empty, and any of:
   - the name ends with `:`;
   - the name matches `^(for (the )?)?(marinade|sauce|dipping sauce|filling|batter|breading|coating|garnish|toppings?|broth|soup|dough|glaze)( ingredients)?:?$`;
   - the name is `cooking procedure`, `ingredients` or `optional:`.

   A header opens a **pseudo-group** for the rows that follow (by `RecipeIngredient.id` order) until the next header.
2. **NOISE.** The nameKey is empty, has fewer than 2 letters, or is a bare unit word, and re-parsing `rawText` found nothing.
3. **EQUIPMENT.** Whole-phrase match only: aluminum foil, parchment/wax paper, cling wrap, cheesecloth, bamboo skewers, toothpicks, kitchen twine, llanera, molds, popsicle sticks. Bare `string` is not on the list, so it can't catch "string beans".
4. **WHOLE-PHRASE FIRST.** Look up the whole nameKey before splitting ("pork and beans", "sweet and sour sauce", "half and half").
5. **COMPOUND.** Split on `and`/`&`/`,` only if every part resolves exactly. "Salt and pepper to taste" becomes two TO_TASTE parts.
6. **ALTERNATIVE.** Split on ` or `, `/` and `and/or`, but not inside "or more", "or to taste" or "or so". Distribute a shared head word ("chicken or vegetable broth" → "chicken broth" | "vegetable broth"). The first option counts; the others are ALTERNATE and never counted.
7. **INGREDIENT.** Everything else.

### 3.4 Resolution cascade (first hit wins)

| # | Source | Status |
|---|---|---|
| 1 | `overrides.csv` keyed by `RecipeIngredient.id` (ids are stable because the scraper is create-only). Bulk alias updates never touch these. | VERIFIED |
| 2 | **Context rules** for ambiguous head words, evaluated at compile time with unit, title and instructions (table below) | RULE |
| 3 | `aliases.csv` row with status VERIFIED | VERIFIED |
| 4 | `aliases.csv` row with status AUTO (LLM agreeing with the token matcher) | AUTO |
| 5 | Exact match on a canonical synonym, after a Filipino spelling fold (c→k before a/o/u, ao→aw, ts→ch, ñ→n, final o↔u) | AUTO |
| 6 | Exact match after dropping **home-cooking and price-variant words only** (boiled, fried, steamed, grilled, roasted, toasted, cooked, frozen). Dropping a purchase-form word (dried, salted, smoked, canned, cured, pickled, fermented, instant) is never automatic: it sends the line to review. | AUTO / REVIEW |
| 7 | Token matcher (`matcher.js`, kept as a suggestion engine): F1 × head-noun gate × DISH exclusion. AUTO if ≥ 0.80 with a margin of ≥ 0.15 **and** usage < 10. | AUTO / REVIEW |
| 8 | Nothing matched | UNRESOLVED (counted against coverage) |

**Context rules for ambiguous heads.** These replace a single `canonicalId` per nameKey wherever the answer depends on context.

| Head | Rule |
|---|---|
| pepper | Test specific heads first: bell/capsicum → bell pepper; long/haba/pansigang → siling haba; labuyo/bird's-eye → labuyo; cayenne, chili flakes → their own canonicals. Then TO_TASTE, unit tsp/tbsp/pinch, or the modifier ground/black/white/cracked → black pepper (ground). Peppercorn is its own canonical. "Whole" alone does not mean black pepper. |
| rice | cooked/leftover/day-old/steamed/sinaing → `rice_cooked`. Glutinous/malagkit/sticky → `rice_glutinous_raw`. "rice washing"/hugas bigas/rice water → **WATER**. Bare "rice" → raw, unless the title matches sinangag or fried rice. |
| onion | green/spring/scallion → green onion. Red/sibuyas/shallot or bare → `onion_red` (PH default). White/yellow → `onion_white`. |
| oil | bare/cooking/vegetable/palm/canola/corn → `oil_cooking`. Olive and sesame are separate. |
| milk | bare/fresh → `milk_fresh`. Evaporated, condensed, powdered are separate. Coconut/gata only when the word "coconut" or "gata" is present. |
| coconut | cream/kakang gata/first extract → `coconut_cream`. Second extract/"thin" → `coconut_milk_thin`. Can/carton or plain "coconut milk" → `coconut_milk`. "grated coconut" → `coconut_grated`. "coconut water"/buko juice → `coconut_water`. |
| broth/stock | `broth_{chicken,beef,pork,shrimp,veg}` is a low-energy custom food (§5). If "bones" is present → bone canonical. |
| plant part | leaves/talbos/flower/blossom must match a candidate with the same part. "banana leaves" never matches banana fruit. |

**FNRI candidate filters.**
- Classify each FNRI row from its name:
  - **as-sold**: raw, dried, cnd, smoked, salted, flour, powder;
  - **cooked-from-raw**: boiled, fried, steamed, roasted, grilled;
  - **dish**: `prep` or `w/` as a token, or a dish word **heading the first comma segment** with no product noun after it (noodles, wrapper, flour, mix, spread, crust, dressing, oil, cnd).
- Tag the ~150 dish-word rows once by hand to be sure.
- Dish rows are excluded from ingredient matching.
- Cooked-from-raw rows are penalised ×0.6 for raw-measured lines.
- As-sold processed rows are not penalised (canned tuna, tinapa and tuyo are correct matches).

### 3.5 FNRI alternate names

Store `alternateNames` (present for 1,154 of 1,542 foods).
- When a canonical binds to an FNRI row, add that row's alternate-name phrases as synonyms.
- Add the full phrase and its **specific** segments only. Never add single generic heads (baboy, manok, baka, isda, bigas, itlog, gulay), which would teach "bigas" → cooked rice.
- Map the sentinels `N/A` and `-` to null, and split multi-name separators.

**Do not** migrate the 85 `COMMODITY_ALIASES` pairs as synonyms; they are token expansions (calamansi→lemon, kangkong→spinach). Hand-curate only true phrase equivalents: bawang = garlic, liempo = pork belly, patis = fish sauce, toyo = soy sauce, talong = eggplant, sitaw = string beans.

### 3.6 DA variant choice

`bindings.csv` stores `(slug, daItemKey, rank, isProxy)`. `daItemKey` is (category, normalized name). This is why the `Commodity` unique key must include category: the rice grades appear under both IMPORTED and LOCAL.

**Default ranking proposal**, reviewed by a human:
- prefer local/unbranded and MEDIUM/unspecified size when that item is priced on ≥ 80% of days;
- otherwise the cheapest median among commonly available items;
- a size word on a line can pick a different size.

Price pick per day: rank 1 → rank 2 (within the stale window) → DERIVED → MANUAL → unpriced (§6.5). Cooking oil binds to the DA palm or coconut bottle as an `isProxy` price, while nutrition uses the FNRI vegetable-oil row.

### 3.7 Review queue (CSV, no write API in v1)

- `scripts/review-export.ts` writes `review/aliases.csv`, sorted by `usage × (1 − confidence) × (disagreement ? 2 : 1)`. Columns: `nameKey, uses, sample rawText ×2, LLM pick, token top-3, decision_kind, decision_slug, decision_fnri, density, pieceG, epForm, note`.
- The owner edits it in a spreadsheet. `scripts/review-import.ts` validates slugs and codes against the catalog and DB, then writes `aliases.csv` and `canonicals.csv` in git. `seed.ts` loads the catalog and bindings into Postgres.
- **Mandatory human verification:**
  - every nameKey with usage ≥ 10 (about 300, est. ~70% of line uses), plus their canonicals;
  - all disagreements with usage ≥ 3;
  - a QA sample of 60–100 AUTO items each from the 3–9 bucket and the 1–2 bucket. If the usage-weighted error in a bucket is > 5%, re-queue that bucket.
- **Record density, piece weight and EP form in the same review pass**, so the 200 canonicals aren't revisited.
- **Realistic effort: 15–20 h of review.** Allow 2–3 min per canonical.
- `match-review.html` stays read-only. It reads the compiled static JSON and runs on localhost only. Any rendered scraped text must be escaped.

### 3.8 Optional LLM pass (recommended; offline, one-time plus incremental)

**One pass**, sequential, with nameKeys sorted by usage descending, 40 per request (~60 requests).

**Cached prefix:**
- the rules from §3.2–§3.4;
- ~30 worked examples;
- the FNRI catalog as lines `code|name|altNames|state|kind|EP%` (~40k tokens);
- the DA catalog;
- the canonical list, which grows as the pass proceeds.

**Per item:** nameKey, usage, and 2 sample `rawText` lines. **Do not show token-matcher candidates**, so the cross-check stays independent.

**Output** (structured outputs, `output_config.format` / `messages.parse` + `zodOutputFormat`; forced `tool_choice` is rejected on the 5.5 models):
- `lineKind`;
- `canonicalSlug`, or a new canonical with `kind, dietClass, fnriState`;
- `fnriFoodCode | null`;
- `daItemKeys` as an **acceptable set**, with no rank (§3.6 does the ranking);
- `densityGml?`, `pieceG?`, `epForm?`;
- `confidence`, and `reason` (≤ 20 words).

There are **no roles** in the output; roles are per line.

**Validation:**
- every code exists in the DB;
- no DISH rows;
- slugs match `^[a-z0-9_]+$`;
- one retry with the error text.

The LLM never sets VERIFIED. LLM pick == token top-1 **and** usage < 10 → AUTO; everything else goes to the queue.

**Cost (≈; verify current pricing before running):**

| Model | Cost | Notes |
|---|---|---|
| `claude-opus-5-5` | ≈ US$10 | $4/$20 per MTok, cache reads $0.20. Output dominates, because thinking is always on; set effort `low`/`medium` explicitly. |
| `claude-sonnet-5-5` | ≈ US$5 | |
| `claude-haiku-5-5` | < US$1 | |

Run a 50-item side-by-side on Filipino culinary terms before choosing; human review time dominates either way.

---

## 4. Quantity and units

### 4.1 Amount grammar

Normalization, in order:
1. Expand unicode fractions (`1½` → `1 1/2`).
2. Collapse spaces around `/` (`1 /4` → `1/4`, `1/ 1/4` → `1 1/4`).
3. Split attached units (`68g` → 68 + g).
4. Strip hedge words (about, approx., around, ~).
5. Map word numbers: a/an/one = 1, a couple = 2, a few = 3, half = 0.5, dozen = 12.

Parsing:
- `1-1/2` and `1 and 1/2` are mixed numbers (1.5).
- `a-b`, `a to b` and `a or b` with b > a are ranges: use the **midpoint** and keep min/max.
- `1 cup + 2 tbsp` is summed.
- `2 x 400 ml` is multiplied.
- `1 20` + `oz.` is 1 × 20 oz.
- Words split across fields (`2 to` | `matoes`) are repaired from `rawText`.
- Leftover text that is not a range or unit → `AMOUNT_MALFORMED`, low confidence, never a silent wrong value.

Profile cases that become fixtures: `1 /4`, `1/ 1/4`, `1 20` oz., `68g`, `2 to`|`matoes`, `½`, `1-2`, `1 ½`, `1-1/2`, size words in the unit field.

### 4.2 Units (82 spellings → ~25 canonical)

| Kind | Units |
|---|---|
| Mass | g, kg, lb/lbs/lb./pound (453.6 g), oz/oz./ounces (**mass, 28.35 g**; fl oz is volume) |
| Volume (US customary) | cup 236.6 ml, tbsp 14.79, tsp 4.93, quart 946.4, pint 473.2, l, ml, fl oz 29.57. Case-sensitive `T`/`Tb` → tbsp and `t` → tsp, checked before lowercasing. |
| Count | piece/pc/pcs, clove, head, thumb, inch, knob, stalk, sprig, bunch/tali, bundle, slice, leaf, sheet, stick, ear, whole, dozen |
| Package | can, pack, sachet, pouch, bottle, jar, box |
| Vague | pinch (≈ 0.3 ml), dash (0.6 ml), handful (leafy 30 g, other 30–40 g) |

- Size words in the unit field (medium 33 rows, small 10, large) become `unit = piece` with that size.
- An **unknown unit** becomes the per-food piece weight with a flag, or null (excluded and counted against coverage). **The `value × 60 g` fallback is removed.**

### 4.3 Density table (the biggest single unit fix: ~13k of 21k lines are volume)

`grams = ml × density`. Lookup order: canonical (by form) → class default → keyword fallback → 0.80 with `DENSITY_DEFAULT`. Seed values ≈ [USDA HM]:

| Food | g/cup | g/ml |
|---|---|---|
| Cooking oil | 218 | 0.92 |
| Water, vinegar, broth | 237–239 | 1.00–1.01 |
| Soy sauce | 255 | 1.08 |
| Fish sauce | 284 | 1.20 |
| Oyster sauce | 288 | 1.22 |
| Coconut milk (canned) | 226 | 0.96 |
| Evaporated milk | 252 | 1.065 |
| Condensed milk | 306 | 1.29 |
| White sugar | 200 | 0.85 |
| **Brown sugar, packed (default)** | 220 | 0.93 |
| All-purpose flour | 125 | 0.53 |
| Cornstarch | 128 | 0.54 |
| Rice flour | 158 | 0.67 |
| Glutinous rice flour | ≈ 125 | 0.53 |
| Raw milled rice | 185–195 | 0.78–0.82 |
| Raw glutinous rice | ≈ 200 | 0.85 |
| Cooked rice | ≈ 170 | 0.72 |
| Dried mung beans | ≈ 205 | 0.87 |
| Salt (table) | ≈ 288 (6 g/tsp) | 1.22 |
| Ground black pepper | ≈ 110 (2.3 g/tsp) | 0.47 |
| Whole peppercorn | — | 0.58 |
| Chopped onion | ≈ 160 | 0.68 |
| Minced garlic | ≈ 136 | 0.57 |
| Grated or julienned ginger | — | 0.41 |
| Chopped leafy greens (kangkong, pechay) | 30–45 | 0.13–0.20 |
| Malunggay leaves | ≈ 21 | 0.09 |
| Shredded cabbage | 70–90 | 0.30–0.38 |
| Fresh grated coconut | ≈ 80 | 0.34 |
| Desiccated coconut | ≈ 93 | — |
| Ground peanuts | ≈ 145 | — |
| Grated cheese | 100–113 | 0.45 |
| Breadcrumbs (dry) | ≈ 108 | — |
| Panko | ≈ 55 | — |
| Butter | 227 | 0.96 |
| Honey | 339 | 1.43 |

Form modifiers: `packed` uses the packed row; `sifted` ×0.92.

### 4.4 Unit-weight table (count lines; as-bought grams)

**Priority 1: weights parsed from DA names.**
- `N-M pcs/kg` → piece = 1000 / midpoint. Red Onion, Local 13-15 pcs/kg → **≈ 71 g**; fish 4-6 pcs/kg → ≈ 200 g.
- `NN-MM grams/pc` → midpoint. Egg, medium 56-60 → **58 g**.
- Run these regexes on the **raw** DA name (normalization rewrites "grams").

**Priority 2: canonical rows**, seeded ≈ from [USDA HM] and adjusted to PH market sizes:

| Item | Weight (AP) |
|---|---|
| Garlic, imported | head 45 g, clove 4–5 g |
| Garlic, local/native | head 20–30 g, clove 2–3 g (the clove weight follows the bound variant) |
| Ginger | thumb 15–20 g, inch 10 g, knob 25 g |
| Red onion (PH) | 70 g (via DA); white/yellow 110 g |
| Tomato (PH) | 80 g |
| Potato | 170 g (PH medium; USDA medium is 213 g) |
| Carrot | 70–100 g |
| Eggplant, long | 100 g |
| Radish | 300 g |
| Sayote | 250 g |
| Ampalaya | 200 g |
| Bell pepper | 120 g |
| Siling haba | 8 g |
| Labuyo | 1–1.5 g |
| Calamansi | 12 g (≈ 4–5 ml juice) |
| Saba | 100 g |
| Corn ear | 250 g |
| Sitaw | pod 10 g, bundle 250 g |
| Kangkong bunch | 250 g |
| Pechay bunch | 250 g |
| Malunggay on stem | 100 g |
| Green onion | stalk 15 g, bunch 80–100 g |
| Lemongrass stalk | 15–20 g |
| Cabbage head | 800–1,000 g |
| Whole chicken | 1,200–1,300 g |
| Pata | 1,000–1,300 g |
| Bangus | 450 g |
| Tilapia | 300 g |
| Galunggong | 100 g |
| Tuyo | 15 g |
| Daing na bangus | 350 g |
| Alimango | 300 g |
| Alimasag | 150 g |
| Egg parts | whole 58 g AP / 51 g edible; yolk 17 g; white 33 g |
| Lumpia wrapper | 8–10 g |
| Bouillon cube | 10 g |
| Magic Sarap sachet | 8 g |
| Bay leaf | 0.2 g |
| Star anise | 0.5 g |
| Butter stick | 113 g |

**Size words:** small ×0.65, large ×1.35, when a row has no S/M/L sizes [USDA HM onion ratios].

**Priority 3: class default** (`UNITWT_CLASS`, low confidence).

**Packages:**
1. An embedded size wins, e.g. `(13.5 oz) can`, `45g pack`. Before the number and unit it is per unit; after the noun with "about", or with count 1, it is the total.
2. Otherwise use a product default:

| Product | Default size |
|---|---|
| Coconut milk | 400 ml |
| Evaporated milk | 370 ml |
| Condensed milk | 300 ml ≈ 390 g |
| Corned beef | 150 g |
| Sardines | 155 g |
| Tomato sauce | 227 g |
| Cream of mushroom | 298 g |
| All-purpose cream | 250 ml |
| Liver spread | 85 g |
| Sinigang mix | 22 g ("good for 1 L") or 44 g ("2 L"); read the "good for N liters" cue |
| Ginataang mix | 45 g |
| Bihon / canton | 227 g |

3. Unknown can → 400 g, flagged.

`drained` multiplies by about 0.6 for fruit or vegetables in syrup or brine, and 0.75 for tuna [heur].

### 4.5 Edible portion (AP → EP)

| Line form | Measured state | Nutrition grams | Cost grams (AP) |
|---|---|---|---|
| Mass or count unit, whole/untrimmed item | AP | gAP × EP | gAP |
| Mass or count with a **bought-trimmed word before the noun** (boneless, fillet, deboned, ground, peeled shrimp, crab meat, kernels, florets) | EP | gAP | gAP. Price against the trimmed DA item if one exists; otherwise gAP ÷ EP of the whole form, flagged `PRICE_FORM_MISMATCH`. |
| Volume of prepped produce ("1 cup chopped onion") | EP | grams | grams ÷ EP |
| Processed goods (oil, sauce, sugar, flour, canned, seasoning, dairy) | EP = AP | grams | grams |

EP sources, in order:
1. Canonical `epOverride` (recipe-form cuts).
2. FNRI `ediblePortionPct`, **only if** `epForm` matches the FNRI form.
3. Class default.
4. 1.0.

When FNRI EP is missing (60 rows): flag the line for bone-in or shell items; use 1.0 for others.

"Whole" is **not** a trim word. "Cut into serving pieces" means bone-in **only** for chicken, duck, fish and ribs.

---

## 5. Cooking adjustments

### 5.1 Role detection: signals ranked by availability in the real data

1. **Ingredient line alone** (always present): canonical kind (OIL, WATER, aromatic list), listed volume, flags recovered from the name and notes (rare, but use them when present), duplicate canonical in the same recipe (flattened marinade/sauce lists), and the header pseudo-group.
2. **Title lexicon** (always present):
   - fry titles: lumpia, shanghai, turon, okoy/ukoy, maruya, chicharon, crispy, prito/pritong, fried, kawali, bagnet, calamares, rebosado, tokwa;
   - soup titles: sinigang, tinola, nilaga, bulalo, sopas;
   - baked/dessert titles: cake, bread, puto, bibingka, leche flan, polvoron, cookies, ensaymada, kutsinta;
   - torta titles: torta, relleno, omelet.
3. **Instructions** (missing in 23% of recipes), matched with **word-boundary regexes**:
   - `\bdeep[- ]?fr(y|ied|ying)\b`, `\bfry\b…until (golden|crisp)`, `pan[- ]?fr`, `\bsaut[eé]|gisa`, `\bsimmer|\bboil\b`, `\bbake\b|\boven\b` (exclude "dutch oven"), `\bgrill|ihaw`, `\bmarinat`, `discard|drain|strain|remove … from (the )?marinade`, `dredge|coat|roll in`, `skim … (fat|oil)`;
   - negative lists: "dutch oven", "steamed rice", "unsalted", "eggplant" (not egg), "patatas" (not pata), "boil" (not oil).
4. **Phase 2: scraped WPRM `.wprm-recipe-group-name` and notes.** This is the only real fix for flattened marinades. A 70–120 min local crawl that also brings servings text and unit, `recipeYield` and nutrition labels.

**Precedence:** override > scraped group/notes > instruction rules > title rules > ingredient-only rules > default. The default when uncertain is **count it in full** (nf = 1), with three exceptions: removed aromatics, optional/for-serving items, and oil ≥ 240 ml.

### 5.2 Frying (the largest error on the site; oil appears in 1,063 lines)

```
V        = listed oil (ml); null amount + fry evidence → frying medium with V unknown
fryMass  = Σ gEP of "fryable" lines (meat, fish, seafood, tofu, egg-for-torta, wrapper, potato/kamote/saba/eggplant,
           plus dredge/batter lines); excludes water, broth, vinegar, sugar, sauces, cornstarch slurry
reliable = every fryable line's grams came from mass, a canonical piece weight or a DA pcs/kg value (not a class fallback)
absorbed = reliable ? min(V·0.92, rate × fryMass) : fallbackShare × V·0.92
cost     = absorbed + (V·0.92 − absorbed)/R,  R = 3 reuses (toggle: single use, R = 1)
```

| Signal | Classification |
|---|---|
| Oil ≥ 240 ml (1 cup), no bake/dessert veto | **Deep-fry medium** (whether or not instructions exist) |
| Oil 120–240 ml with a fry title or `fry` / `pan-fry` / `fry both sides` in the instructions | **Shallow fry** |
| Oil 120–240 ml with no fry evidence | Sauté fat 1.0, flagged `OIL_MID_UNSURE` |
| Oil < 120 ml (≈ ½ cup) | Sauté fat 1.0 |
| **Same-pan rule:** meat pan-fried, then sautéed or simmered in the same pan with no "drain/remove excess oil/set aside the oil", oil < 150 ml (afritada, kaldereta, menudo, adobo with a fried finish) | Sauté fat 1.0 |
| `leaving N tbsp` / `reserve N tbsp oil` | absorbed + N × 13.6 g |
| Two oil lines | The larger is the medium; the smaller is sauté fat |
| Bake/dessert veto: baked or dessert title, `bake|oven|preheat`, flour + sugar + baking powder, `cream|melt|fold|whisk` with flour/egg/sugar, or a title containing oil/dressing/sauce | **Never** a frying medium; oil and butter count 1.0 |

**Uptake rates**, as % of fryable EP mass (≈ [Bognár], frying literature; 3 classes on purpose):

| Class | Deep | Shallow |
|---|---|---|
| Plain meat or fish | 5% | 3% |
| Fatty pork (belly, pata, skin): net uptake, because fat renders out into the oil | 2%, combined with fat factor (§5.3) | 2% |
| Coated: dredged, breaded or battered; tofu; eggplant | 12% | 8% |
| Wrapped and fritters: lumpia, turon, empanada, okoy, maruya, buñuelos, donuts; fried garlic topping capped at 40 g garlic | 15% (fritters/chips may reach 20–30%; flag) | 15% |

`fallbackShare` (target weight unreliable or unknown): deep 0.10, shallow 0.30.

### 5.3 Rules table: cooking, consumption and state

Rules are grouped by theme and keep only those that change numbers materially. **N** = nutrition, **C** = cost.

**A. Fat and frying**

| Signal | Rule | Default numbers | N/C |
|---|---|---|---|
| Oil line meeting §5.2 | Deep/shallow frying medium | Absorbed per §5.2. Cost: absorbed + rest ÷ 3. | N + C |
| Fatty pork with boil→fry or deep-fry (lechon kawali, crispy pata, bagnet) | Fat factor ff on the line's own fat | ff 0.70 (crispy pata 0.80, chicharon 0.45) ≈ [USDA CY] | N |
| Grill/ihaw/roast of fatty pork or skin-on chicken | ff | 0.80; lean meat 1.0 ≈ [USDA CY] | N |
| Bacon/longganisa "cook until crisp, drain" | ff | 0.40 ≈ [USDA CY] | N |
| Ground meat "drain excess fat" | ff | 0.80 | N |
| "Skim the fat/oil" | ff on simmered meat | 0.85. "Skim the scum" → no change. | N |
| Render fat then sauté in it | Kept | 1.0 | N |
| Dredge/coat/roll in, from instructions or flags, **with** fry evidence | Coating, adhered fraction of the listed amount (density-corrected) | Flour/cornstarch 30%, crumbs/panko 50%, egg wash 50%, wet batter 80% [heur]. Cornstarch slurry ("dissolved in water", ≤ 3 tbsp) 100%. Torta/relleno/okoy titles keep egg at 100%. | N only (C 100%) |
| "For greasing/dusting/brushing" a pan or mold | Partial | 30% [heur]; brushed toppings 100% | N |
| Fat with no amount and sauté evidence | Impute | 2 tbsp (27 g); greasing 1 tsp; none detectable 1 tbsp; flagged | N + C |

**B. Discarded, extracted or removed**

| Signal | Rule | Default numbers | N/C |
|---|---|---|---|
| Whole aromatics by name: bay leaf, whole peppercorn, lemongrass, pandan, star anise, cinnamon stick, whole cloves (the spice), kaffir lime leaf, achuete seeds steeped | Removed | nf 0. Cost full where priced (peppercorn, lemongrass). Ground spices stay at 1.0. | N |
| Ingredient first used in a boil step followed by drain/discard (parboil water with salt, garlic, onion, peppercorn) | Discarded liquor | nf 0 for aromatics; salt/sugar/soy 0.10. Cost full. | N |
| Marinade fate from instructions: discard / "remove from marinade" / pat dry | Pickup | 15% of the marinade line [heur] | N |
| Baste / reserve and boil down | Partial | 50% | N |
| Poured/added/simmered into the dish, or no evidence (adobo, humba, tapa) | Full | 100% | N |
| Marinade membership: lines mentioned in a `marinat|refrigerat|overnight|let stand` step, never lines mentioned again in a later cooking step; duplicate canonical lines assigned in order | — | — | — |
| Tamarind/sampalok pods boiled, removed or strained for sour broth | Extract | nf 0.10 of AP (≈ 30% of pulp, pulp ≈ 35% of pod) [heur]. Paste/mix 100%; kamias sliced in 100%. | N (C full) |
| Grated coconut squeezed (`squeeze|extract|pigain|strain`) | Extract source | Fat 0.75, protein 0.5, carbs 0.5, fiber 0.10 of grated values [heur, INFOODS method]. If coconut milk lines derived from it are listed too, count nutrition on the milk lines and cost on the coconut, **once**. | N + C |
| Bones only ("beef bones", "neck bones", "carcass", "for stock") | Broth only | Nutrition = broth profile on the finished liquid (≈ 10–40 kcal, 1–3 g protein per 100 g [USDA broth family]), or ≈ 0 if unsure. Cost full. | N |
| Kinilaw "wash in vinegar", brine for salted eggs, soaking water | Process liquid | nf 0 (cure vinegar served: 0.4). Cost full. | N |
| Pickles/atchara brine | Brine | Vinegar/water 5%; dissolved sugar/salt 30% [heur]. Recipe reported per 30 g condiment portion. | N |
| "Juice of N fruit" / "N calamansi, juiced" / "¼ cup calamansi juice" | Juice | N: juice grams (calamansi ≈ 4–5 g, lemon 45 g, dayap 10 g) on the FNRI juice row. C: fruit equivalent = juice ÷ 0.35 yield [heur]. Zest → N 0. | N + C |

**C. State and composition**

| Signal | Rule | Default numbers | N/C |
|---|---|---|---|
| cooked/leftover/day-old/steamed rice | `rice_cooked` → FNRI boiled-rice row; no further losses | 170 g/cup. C: raw = cooked ÷ yield. Derive yield from the FNRI raw/boiled energy ratio (≈ 2.6–2.8 [USDA CY]). | N + C |
| cooked/soaked noodles | Convert to dry equivalent | Wheat pasta ÷ 2.3, bihon ÷ 3.0, sotanghon ÷ 3.5 ≈ [USDA CY]. Fresh miki/pre-cooked canton 1.0. | N + C |
| Dried legumes | Dry row, dry density | Cooked/canned measured ÷ 2.4 (USDA kcal ratio suggests 2.8–3.0 for monggo; calibrate) | N + C |
| Dried/salted/smoked fish and shrimp, dried mushroom (purchase form) | Own canonical, as-sold FNRI row | Per-piece table §4.4. Soak water 0. Small dried fish EP ≈ 0.9. | N + C |
| Shredded cooked chicken, leftover lechon | Cooked row, or raw ÷ yield | Boneless chicken yield 0.72, pork 0.70 ≈ [USDA CY]; 140 g/cup. C: ÷ yield ÷ EP. | N + C |
| Canned "drained" without "reserve" | Drained fraction | Fruit 0.6, tuna 0.75, corn 0.65 [heur] | N |
| Coconut cream vs milk vs second extract | Separate canonicals | Cream ≈ 30–35 g fat/100 g; canned milk ≈ 20; thin ≈ 7 (×0.35 of cream) [USDA family] | N |
| Egg yolks or whites only | Part weights and FNRI part rows | Yolk 17 g, white 33 g. C: N whole eggs × ₱/pc, unless the other part is also used (then ⅓ yolk, ⅔ white). | N + C |
| Leaves/flowers vs fruit/root | Part attribute required | Banana leaves → NON_FOOD; gabi leaves ≠ gabi corm; chili leaves ≠ chili | N + C |
| Young/green/ripe/sweet | Variety attribute | buko ≠ niyog, green ≠ ripe papaya/mango, sweet potato = kamote | N + C |

**D. Bone, shell and trim** (EP defaults when FNRI EP is missing or of a different form; ≈ [USDA ref])

| Item | EP |
|---|---|
| Whole chicken / chicken serving pieces | 0.68 / 0.72 |
| Wings | 0.55 |
| Drumstick or thigh | 0.75 |
| Pork ribs | 0.70 |
| Pata | 0.60 |
| Pork chop | 0.80 |
| Beef shank (marrow counted as edible) | 0.50 |
| Oxtail | 0.45 |
| Whole fin fish | 0.55 (bangus 0.65) |
| Fish head | 0.35 |
| Shrimp, head-on / headless | 0.55 / 0.85 |
| Squid, cleaned | 0.80 |
| Crab | 0.30 |
| Mussels / clams | 0.30 / 0.20 |
| Kangkong | 0.65 |
| Malunggay on stem | 0.35 |
| Saba | 0.68 |
| Kalabasa | 0.80 |
| Garlic | 0.87 |
| Onion | 0.90 |
| Corn ear (husked pieces) | 0.55. FNRI's 30% is with husk, a different form. |

These apply to nutrition (N) only. Cost stays on AP.

**E. Zero or near-zero, side and optional**

| Signal | Rule | Default numbers | N/C |
|---|---|---|---|
| water, hot/ice water, ice, rice washing/hugas bigas, lye water | WATER, checked before any FNRI lookup | 0 / 0 | N + C |
| broth/stock (not bones) | Custom low-energy food | ≈ 5–10 kcal, 1 g protein per 100 g. C: DERIVED, 1 cube (10 g) per 500 ml, unless a cube line exists. | N + C |
| Cubes, granules, MSG, liquid seasoning | BRAND_SEASONING | Cube 10 g (≈ 20–25 kcal); granules 8 g; liquid seasoning → soy-sauce proxy. C: MANUAL per pc. Sodium becomes visible once tracked. | N + C |
| Brand **mixes** (sinigang, ginataang, kare-kare, gravy, breading) | CUSTOM label values or PROXY, **not** negligible | Sinigang ≈ 240 kcal/100 g; ginataang mix ≈ 550 (coconut powder); kare-kare → peanut proxy; breading → flour proxy (verify labels) | N + C |
| Brand + generic noun (Datu Puti vinegar, Del Monte tomato sauce, Eden cheese) | Strip the brand into a field; use the generic canonical | — | N + C |
| `optional` | Excluded; shown as "+X kcal, +₱Y" | 0 | N + C |
| To taste / as needed, no amount | 0 g for salt and pepper; sugar 1 tbsp; patis/soy 1 tbsp **once sodium is shown**; "oil as needed" → fat rule; "water as needed" → WATER. Not added if the same canonical already has an amount in the recipe. | Flag `AMOUNT_IMPUTED` | N + C |
| Garnish with an amount / without | 100% / small default | Herbs 2 g, green onion 3 g, fried garlic 3 g, boiled egg ½ per serving | N + C |
| For serving / serve with rice/bread | Accompaniment, excluded | Optional "+ rice" toggle: 1 cup cooked ≈ 170 g | N + C |
| Dipping sauce, bagoong or sawsawan on the side | Partial | 40% [heur]; bagoong capped at 20 g/serving. C 100%. | N |
| Equipment, wrappers (foil, skewers, banana leaves) | NON_FOOD | 0. C: consumables only, if priced. | N + C |
| Alcohol (wine, beer, rum, Shaoxing) | Retention on alcohol kcal only | Simmered 1 h 25%, 1.5 h 20%, 2 h 10% [R6, Augustin 1992]. Mark the line "unpriced", not NOT_COSTED. | N |
| Caramel in llanera, turon sugar | Partial | 80% / 75% [heur] | N |

**F. Retention (Phase 2; only when the bound FNRI row is raw)**

Take the minimum across a line's methods; never compound. Values ≈ [R6, Bognár]; replace with exact R6 category values from the data.gov CSV.

| Method (vegetables) | Vit C | Vit A | Ca/Fe |
|---|---|---|---|
| Raw / garnish | 1.00 | 1.00 | 1.00 |
| Steam / brief | 0.80 | 0.95 | 1.00 |
| Sauté / stir-fry | 0.75 | 0.90 | 1.00 |
| Soup, liquid eaten | 0.70 | 0.90 | 1.00 |
| Braise > 1 h | 0.50 | 0.85 | 1.00 |
| Boil and drain | 0.55 | 0.90 | 0.90 |
| Fry | 0.60 | 0.85 | 1.00 |

Meat, grain and B1/B2 factors are deferred until B1/B2 are displayed.

### 5.4 Things deliberately not modelled

- Mass yield of the finished dish (not needed for sum ÷ servings).
- Plate waste.
- Per-food R6 mapping.
- Six-way souring taxonomies.
- The synthetic bone-broth profile (9 rows): use ≈ 0 or the simple broth row.
- Pinch/dash/smidgen precision (negligible class: fixed tiny grams, excluded from quality).

---

## 6. Cost model

### 6.1 DA preparation (before any matching)

1. **Merged-row bug.** In `extractCommodities` (`scraper-backend/src/lib/scrapers/da-scraper.ts`), split names on embedded prices with `/\s([\d,]+\.\d{2}|[nN]\/[aA])\s+(?=[A-Z])/g` (**no `/i`**, which would defeat the uppercase lookahead). Each embedded price belongs to the segment before it; the trailing price belongs to the last segment.
   - **Dedupe per day** before `createMany`, keeping the non-null or last value.
   - Unit-test against the five real families: Broccoli, Cauliflower, Ginger/Red Onion, Lettuce, Kasim/Rind.
   - Re-run the 29-day backfill (it replaces each day wholesale).
   - Check: `SELECT count(*) FROM "Commodity" WHERE name ~ '\d+\.\d{2}'` returns 0.
2. **Same name under two categories** (rice grades): add `category` to `Commodity @@unique` and to the grouping in `/api/commodities`.
3. **Price basis** parsed from the raw name:

| Pattern | Basis | Price per gram |
|---|---|---|
| `(\d+)\s*-\s*(\d+)\s*(g|grams?)\s*/\s*pc` | piece | ₱/pc; ₱/g = P ÷ midpoint |
| `(\d+(?:\.\d+)?)\s*(ml|l|liters?)\s*/\s*bottle` (case-insensitive) | bottle | ₱/ml = P ÷ ml; ₱/g = ₱/ml ÷ density |
| `N-M pcs/kg` | kg | P/1000; also yields a piece weight |
| `/bunch hd`, `Small Bundles`, cm specs | kg (size or grade descriptor) | P/1000, `needsReview` until one PDF unit column is checked |
| Default | kg | P/1000 |

   Unit-test against all 244 names.
4. **Sanity bands** (drop an observation if outside):

| Category | Band |
|---|---|
| Rice | ₱25–120/kg |
| Fish | ₱60–900/kg |
| Meat | ₱100–900/kg |
| Vegetables | ₱10–500/kg |
| Spices | ₱20–1,500/kg |
| Eggs | ₱3–20/pc |
| Bottles | ₱50–400 per L |

### 6.2 Price aggregation (`GET /api/prices`, computed on read, cached `s-maxage=3600, stale-while-revalidate=86400`)

```
obs   = valid prices in [asOf−27, asOf]       (asOf = max sourceDate)
m28   = median(obs); clean = obs ∩ [0.4·m28, 2.5·m28]  (keep all obs if ≥3 of the last 5 are outside → regime change)
ref   = median(last 5 clean)                   ≈ 7-day median, immune to weekend and n/a gaps
age   = asOf − lastSeen → fresh ≤3 d · aging ≤10 · stale ≤27 (used, ⚠) · expired
trend = ref vs median(days 7–13), ±5% threshold   (Phase 2 UI)
```

Site banner when `today(Manila) − asOf > 3` days.

**Response:**

```json
{ "asOf":"2026-10-13", "lagDays":1,
  "prices": { "egg_chicken": {"src":"DA","item":"Chicken Egg (White, Medium) 56-60 grams/pc","basis":"pc",
               "perPc":8.0,"perG":0.138,"status":"fresh","range":[7.5,9.0],"date":"2026-10-13"},
              "soy_sauce":   {"src":"MANUAL","perMl":0.0564,"perG":0.0522,"source":"DTI SRP 2025-02-01","stale":true} } }
```

### 6.3 Line cost (in the browser, `docs/cost.js`, UMD like `matcher.js`)

```
q, dim = count & price.perPc   → (pieces, "pc")
         volume & price.perMl  → (ml × cf, "ml")      // same-dimension shortcut, no density round trip
         else                  → (gUsed = gAP × cf, "g")
lineCost = q × price[slug][dim]
perServing = Σ lineCost(role ∉ {optional, water, accompaniment}) / servings
```

`costBasis` in `recipes.v2.json` holds `[slug, q, dim]` aggregated per slug, so the browser does about 6 multiply-adds per recipe.

**Cost fractions `cf`:**

| Role | cf |
|---|---|
| main, sauté fat, coating, marinade (any fate), removed aromatics, souring, garnish, dips | 1.0 (bought and used up) |
| Frying medium | (absorbed + rest ÷ R) ÷ listed |
| Water, accompaniment, optional, to-taste with no amount | 0 |

### 6.4 Two numbers

- **Cost of what you use** (headline): pro-rated at per-unit prices. It drives sorting and the value score.
- **Shopping cost** (Phase 2): merge lines by canonical, round up to buy increments (250 g produce/meat, 100 g spices, 1 kg rice, whole eggs, whole bottles/packs), and choose the cheapest *total* among bottle sizes. Split into fresh vs pantry. Display: "Shopping ₱214 fresh + ₱139 if you need pantry staples."

### 6.5 Fallback tiers (each flagged in the UI)

| Tier | Source | When |
|---|---|---|
| 1 | DA primary binding | Non-expired price |
| 2 | DA fallback ranks | Primary has no price (switch only then; no daily cheapest-flipping) |
| 3 | DERIVED | rice_cooked ← raw ÷ yield; juice ← fruit ÷ 0.35; broth ← cube ÷ 500 ml; grated coconut ← DA coconut (if listed) |
| 4 | **MANUAL, mandatory in the MVP** | `manual-prices.csv`, ~30–40 staples DA lacks (soy sauce, vinegar, fish sauce, oyster sauce, flour, cornstarch, butter, evaporated/condensed/fresh milk, coconut milk, cheese, cubes, Magic Sarap, liquid seasoning, sinigang/ginataang mixes, lumpia wrapper, noodles, peppercorn, bay leaf, sesame and olive oil, tomato sauce, banana ketchup). Dated and sourced (DTI SRP bulletin or a dated receipt). Volume prices converted with canonical density. Flagged after 180 days. |
| 5 | Category estimate | Fresh vegetables and fruit only. Used for the coverage estimate, shown as "~₱". |
| 6 | Unpriced | Listed under "Not priced" |

**Cost coverage** = priced estimated cost ÷ total estimated cost. The estimate uses tier prices, or class priors for unpriced lines (e.g. vegetables ₱100/kg, meat ₱350/kg, condiments ₱80/L). Display "₱77+/serving · 95% priced".

**Rankable for "cheapest" and value score** = cost coverage ≥ 0.90 **and** nutrition grade A–B **and** servings not assumed. Other recipes are excluded from the default sort, not just sorted last.

---

## 7. Data model and API

### 7.1 Git (source of truth for human decisions and reference data)

```
scraper-backend/data/
  canonicals.csv      slug,displayName,kind,dietClass,fnriFoodCode,fnriStateUsed,nutritionPolicy,customPer100g(json),
                      densityGml,densityForms(json),pieceG(json),epForm,epOverride,cookedYield,pricePolicy,derivedFrom,
                      derivedRatio,pantry,buyIncrement,status,note
  aliases.csv         nameKey,lineKind,canonicalSlug|parts(json),method,confidence,status,uses,sample
  rawname-map.csv     rawName,nameKey                      (all 3,386; for re-keying)
  bindings.csv        slug,daCategory,daName,rank,isProxy
  manual-prices.csv   slug,packQty,packUnit,pricePhp,source,asOf
  overrides.csv       recipeIngredientId,slug?,gAP?,role?,nf?,exclude?,note       (line-level; survives bulk updates)
  recipe-overrides.csv recipeId,servings?,hidden?,note
  units.json  classes.json  fnri-dish-tags.csv  golden/*.json
scraper-backend/src/lib/compile/  normalize.ts parse.ts resolve.ts grams.ts roles.ts(RULES_VERSION) aggregate.ts compileRecipe.ts
scraper-backend/scripts/          compile.ts seed.ts fnri-meta.ts review-export.ts review-import.ts llm-propose.ts rescrape-wprm.ts(P2)
```

### 7.2 Prisma additions

```prisma
model NutritionFact {
  // ...existing...
  alternateNames   String?   // FNRI "Alternate/Common name(s)"; null for "N/A"
  scientificName   String?
  ediblePortionPct Float?    // 0–100; null for "-"
  sodium           Float?    // mg/100 g E.P. (verify label "Sodium, Na (mg)")
  state            String?   // RAW|DRIED|CANNED|SMOKED|SALTED|FERMENTED|BOILED|FRIED|ROASTED|STEAMED|PREPARED|UNSPECIFIED
  foodKind         String?   // SINGLE|PROCESSED|COOKED|DISH  (DISH also hand-tagged)
}

model Commodity {
  // ...existing...
  priceUnit   String  @default("KG")   // KG|PC|BOTTLE, parsed at ingest
  unitQty     Float?                    // grams per pc / ml per bottle
  pieceG      Float?                    // from "N-M pcs/kg"
  @@unique([name, category, region, sourceDate])   // replaces (name, region, sourceDate)
}

model CanonicalIngredient {               // loaded by seed.ts from canonicals.csv; read by /api/prices
  slug          String  @id
  displayName   String
  pricePolicy   String                    // DA|DERIVED|MANUAL|NOT_COSTED|FREE
  densityGml    Float?
  derivedFrom   String?
  derivedRatio  Float?
  bindings      CanonicalCommodity[]
}
model CanonicalCommodity {
  slug        String
  daCategory  String
  daName      String                      // normalized DA name
  rank        Int
  isProxy     Boolean @default(false)
  @@id([slug, daCategory, daName])
}
model ManualPrice { slug String @id  packQty Float  packUnit String  pricePhp Float  source String  asOf DateTime }

// Phase 2 (WPRM re-scrape)
model Recipe           { /* ... */ servingsText String?  servingsUnit String?  recipeYield String?  rescrapedAt DateTime? }
model RecipeIngredient { /* ... */ groupName String?  notes String?  position Int? }
model RecipeBenchmark  { recipeId Int @id  kcal Float?  protein Float?  fat Float?  carbs Float?  sodium Float?  servings Int?  raw Json  scrapedAt DateTime @default(now()) }
```

Not created: `ResolvedLine`, `IngredientCooking`, `CompiledLine`, `CompileRun`, `ReviewEvent`, `CommodityIdentity`/`CommodityAlias`. A check for "bound DA name missing ≥ 3 days" replaces identity tracking.

### 7.3 API and static files

| Surface | Change |
|---|---|
| `GET /api/recipes` (existing) | Add ingredient `id` and `rawText`, plus `orderBy: {id: 'asc'}` on the nested ingredients. Keep it for the v1 fallback and `match-review`. |
| `GET /api/prices` (new) | §6.2 |
| `docs/data/recipes.v2.json` (static) | `{schemaVersion, rulesVersion, compiledAt, recipes:[{id,title,url,servings,servingsSource,perServing:{kcal,protein,fat,carbs,fiber,calcium,iron,vitA,vitC,sodium?},kcalNaive,quality:{grade,nutritionCoverage,flags},dietClass,costBasis:[[slug,q,dim]],estCost:{slug:est},ingredients:[names]}]}` |
| `docs/data/lines/{id/100}.json` | Per line: `{id, text, kind, group, slug, fnri:{code,name}, qty:{v,max,unit}, g:{ap,ep,eaten,used}, role, nf, ff, cf, kcal, method, flags}` |
| Security | `requireAdmin` (Bearer `ADMIN_TOKEN`) on every POST `/api/scrape/*`. They are open today. |

Quick fixes to ship first, whatever else happens:
- remove the SM line-cost fallback;
- replace substring `isNonPriceable` and `ANIMAL_WORDS` with token-exact interim lists (until the canonical policies land). Today they unprice rice, juices, red bell pepper, sausage, peeled shrimp, cauliflower and tamarind, and tag eggplant recipes as non-vegetarian;
- fix the "/kg" labels for per-piece and per-bottle items.

---

## 8. Validation

1. **Unit tests** (`node --test`, no DB):
   - parser fixtures for every profile case;
   - all 244 DA names through the basis regex;
   - the merged-row splitter;
   - **exact snapshot** tests (±1%) of `compileRecipe` on 15–20 golden recipes, growing to 30. Mechanics must be deterministic; ±15% would hide a density typo.
2. **Golden truth set.** 30 hand-labelled recipes (~360 lines: 8 fried, 6 soups, 6 braises, 4 grilled/marinated, 4 desserts, 2 rice dishes).
   - Targets: ≥ 95% canonical accuracy and ≥ 95% role accuracy on lines that move recipe kcal by > 5%.
   - Where FNRI has prepared-dish rows (adobo, sinigang types), compare macro energy shares as a Philippine-analysed sanity check.
3. **Sanity rules** (recalibrate after the first compile):

| Level | Check | Flag / effect |
|---|---|---|
| Line | gAP > 3 kg (excluding water, broth, frying oil) | `LINE_HEAVY` |
| Line | Count > 60 (excluding wrappers) | `COUNT_SUSPECT` |
| Recipe | kcal/serving < 30 or > 2,500 | grade D |
| Recipe | kcal/serving < 100 or > 1,200 | badge, review |
| Recipe | Fat energy > 70%, unless title is a fatty-pork dish | `FAT_ENERGY_HIGH` |
| Recipe | Edible mass/serving < 60 g or > 1,200 g | `MASS_OUT` |
| Recipe | Any line with FNRI nulls | `MISSING_NUTRIENT` |
| Recipe | Cost/serving < ₱3 or > ₱600 | `COST_OUT` |

   The Atwater closure check is dropped: FNRI carbohydrate is by difference and includes fiber, so it produces false flags.
4. **Coverage and grade**, weighted by estimated energy (class kcal prior × grams; water, free and negligible lines excluded):

| Grade | Rule | Site behaviour |
|---|---|---|
| A | Coverage ≥ 0.90, no hard flag, servings from card | Shown |
| B | Coverage ≥ 0.75 | Shown |
| C | Coverage ≥ 0.50, or servings assumed | Shown with "rough estimate" badge |
| D | Otherwise, or any hard flag | Hidden |

   An unconverted line in a major class (meat, fish, oil, starch, sugar, coconut, dairy) caps the grade at C.
5. **WPRM benchmark** (Phase 2 re-scrape; JSON-LD `Recipe.nutrition` first, label spans as fallback; verify selectors on one page).
   - Compare **`kcalNaive`** (every listed gram eaten) to the WPRM label to validate parsing, units and matching.
   - Report the `kcal` vs `kcalNaive` gap separately; that gap is our modelling choice.
   - Metrics: MdAPE, median ratio, Spearman ρ, on recipes with card servings. Initial targets: MdAPE ≤ 30%, ratio 0.85–1.15.
   - Use it for **outlier hunting**, not gating: labels come from a US database.
6. **Compile report** (printed and committed as `docs/data/report.json`):
   - line resolution by method, usage-weighted status shares;
   - grade distribution, kcal/serving p5/median/p95, flag counts;
   - the 50 recipes whose kcal or cost changed most vs the previous compile (reviewed before publishing).
7. **MVP acceptance:**
   - ≥ 90% of lines resolved or explicitly excluded;
   - median nutrition coverage ≥ 0.85;
   - no oil line ≥ 240 ml counted at nf 1 without bake evidence;
   - median kcal/serving of fried recipes **with card servings** in 300–900;
   - no shown recipe > 2,500 kcal/serving;
   - top 50 ingredients human-verified;
   - egg lines priced per piece.

---

## 9. Phased roadmap

**Effort is realistic for one student: about 70–90 dev hours for Phases 0–1, plus 15–20 h of review.**

### Phase 0: prerequisites (≈ 2–3 days)
- DA parser: merged-row split with per-day dedupe, category in the unique key and grouping, price-basis and `pcs/kg` parsing. Re-run the 29-day backfill and run the zero-embedded-price check.
- `/api/recipes`: add `id`, `rawText`, ordered ingredients. Remove the SM fallback. Token-exact interim non-priceable list. Unit labels.
- `requireAdmin` on POST routes. Add `tsx` and a `scripts/` folder. Optionally pin `hnd1`.

### Phase 1: MVP (≈ 3–4 weeks part-time)
1. `fnri-meta.ts`: alternate names, scientific name, EP%, **sodium**; derived `state` and `foodKind`; hand-tag ~150 dish rows. One local run with batched `UPDATE … FROM (VALUES)`.
2. Normalizer and parser (§3.2, §4.1–4.2) with the fixture tests.
3. Canonical catalog for the ~200 canonicals behind the top ~300 nameKeys, including density, piece weight, EP form, FNRI code, DA bindings and dietClass. Seeded by one LLM proposal pass (§3.8), then CSV review of usage ≥ 10 plus disagreements ≥ 3.
4. `manual-prices.csv` for ~30–40 non-DA staples (DTI SRP plus a dated receipt).
5. Rules r1: line classes; WATER/broth/brand/mix policies; removed aromatics; optional/to-taste/garnish/accompaniment; frying (§5.2: volume + title + instructions, bake veto, same-pan); fatty-pork ff; boil-and-drain liquor; bone/shell EP; cooked rice/noodles; egg parts; packages; coconut grades; tamarind extract.
6. `compile.ts` → static JSON. `/api/prices`. `docs/cost.js`. `enrichRecipe` switch with `?engine=v1` fallback for 2 weeks.
7. UI: grade badge, "servings assumed", "₱X+ · N% priced", per-line "eaten ≈ X g" with reason, frying-oil reuse toggle, "DA Oct 13" label.
8. Golden set (15 snapshots) and the compile report.

### Phase 2 (≈ 2–3 weeks)
- WPRM re-scrape, local and resumable: group names, notes, servings text and unit, `recipeYield`, nutrition labels → `RecipeBenchmark`. Recover NULL servings where `recipeYield` exists; label 30/36-serving recipes "per piece".
- Group-aware marinade fate, dredge/coating and dipping-sauce rules.
- Retention table (vitamin C, vitamin A, boil-drain minerals); alcohol retention.
- Dried/canned/drained states for the long tail; DERIVED juice and coconut prices.
- Shopping cost (fresh vs pantry) and recipe price trend; QA sample of AUTO aliases; review of usage 3–9.
- To-taste sodium defaults now that sodium is displayed; withhold health-sounding tags until sodium is shown.

### Phase 3 (optional)
- Per-category sanity ranges; B1/B2 display and retention.
- Sub-recipes ("lechon sauce, see recipe") with a depth limit of 2.
- Condiment and pickle recipes reported per tbsp or 30 g.
- Budget mode (cheapest variant); daily cost snapshots for "cheaper this week".
- A localhost review page reading the static JSON; retire `docs/matcher.js` from the live site.

---

## 10. Worked examples, end to end

**Assumptions.**
- Lines are representative Panlasang Pinoy WPRM rows; verify against DB rows before freezing them as fixtures.
- Per-100 g nutrient values are **≈ USDA-family stand-ins** until the bound FNRI rows are plugged in: pork belly 518 kcal / 9.3 g protein / 53 g fat; chicken whole (meat + skin, E.P.) 215 / 18.6 / 15.1; oil 884 / 0 / 100; garlic 149; soy sauce 53; vinegar 18; onion 40; tomato 18; kangkong 19; radish 16; sitaw 47; eggplant 25; siling haba 40; fish sauce 35; sinigang mix ≈ 240 (label, verify).
- Cup = 236.6 ml.

**Illustrative prices:**

| Item | Source | Price |
|---|---|---|
| Pork belly (liempo), local | DA | ₱390/kg |
| Whole chicken, unbranded | DA | ₱200/kg |
| Garlic, imported | DA | ₱140/kg |
| Red onion, local | DA | ₱160/kg |
| Tomato | DA | ₱100/kg |
| Radish | DA | ₱80/kg |
| Sitaw | DA | ₱100/kg |
| Eggplant | DA | ₱90/kg |
| Siling haba | DA | ₱200/kg |
| Salt | DA | ₱40/kg |
| Cooking oil, palm, 1 L bottle | DA | ₱100 → ₱0.100/ml |
| Soy sauce | MANUAL (DTI SRP) | 350 ml ₱19.75 → ₱0.0564/ml |
| Fish sauce | MANUAL (DTI SRP) | 350 ml ₱27 → ₱0.0771/ml |
| Vinegar | MANUAL (placeholder) | 350 ml ₱18 → ₱0.0514/ml |
| Peppercorn | MANUAL (placeholder) | ₱1.00/g |
| Bay leaf | MANUAL (placeholder) | ₱1.50/g |
| Sinigang mix 44 g | MANUAL (placeholder) | ₱22/pack |
| Kangkong | — | Unpriced |

### 10.1 Lechon kawali (card servings 4)

Instructions boil the pork with salt, peppercorns and bay leaves, drain and dry it, then deep-fry. Title "kawali" plus 3 cups of oil gives deep-fry medium (two independent signals). Target class: fatty pork.

| Line | Written → gAP | EP | Role → nf / ff | gEaten | kcal | Cost basis | ₱ |
|---|---|---|---|---|---|---|---|
| 2 lbs pork belly | mass → 907.2 g | 1.0 (boneless, skin eaten) | main, ff 0.70 (boil + deep-fry) | 907.2 | 4,699 raw, minus 9 × 144.2 g fat removed = **3,401** | 907.2 g | 353.81 |
| 3 cups cooking oil | 709.8 ml × 0.92 = 653.0 g | 1.0 | frying medium: absorbed 0.02 × 907.2 = **18.1 g** (nf 0.028) | 18.1 | **160** | 18.1 + 634.9/3 = 229.7 g = 249.7 ml | 24.97 |
| 2 tbsp salt | 29.6 ml × 1.22 = 36.1 g | 1.0 | mostly discarded liquor (sodium later) | — | 0 | 36.1 g | 1.44 |
| 2 tbsp whole peppercorns | 29.6 ml × 0.58 = 17.2 g | 1.0 | removed (boil water discarded), nf 0 | 0 | 0 | 17.2 g | 17.20 |
| 5 dried bay leaves | 5 × 0.2 = 1.0 g | 1.0 | removed, nf 0 | 0 | 0 | 1.0 g | 1.50 |
| water | — | — | WATER | — | 0 | — | 0 |
| **Recipe** | | | | | **3,561 kcal**, fat 354.7 g | | **₱398.92** |
| **Per serving (÷ 4)** | | | | | **890 kcal, 89 g fat** | | **₱100** (single-use oil: ₱111) |

- **Today's code:** cup = 240 g, so 720 g of oil is fully eaten (6,365 kcal) on top of the raw pork, giving 11,064 kcal ≈ **2,770 kcal/serving**. Cost: oil 720 "g" × the coconut-bottle price read as ₱/kg = ₱129.60, and pepper and bay are unpriced by substring, giving ≈ **₱121/serving**.
- **Flags:** `FAT_ENERGY_HIGH` (90%) is expected for this dish class. The fatty-pork exemption suppresses the badge. Confidence: medium (ff and uptake are low-confidence numbers; calibrate on the golden set).

### 10.2 Sinigang na baboy (card servings 6)

Soup title, broth eaten. Vegetable vitamin C ×0.70 in Phase 2.

| Line | Written → gAP | EP | Role | gEaten | kcal | Cost | ₱ |
|---|---|---|---|---|---|---|---|
| 2 lbs pork belly, cubed | 907.2 g | 1.0 | main (fat stays in broth, ff 1.0) | 907.2 | 4,699.3 | 907.2 g | 353.81 |
| 2 quarts water | 1,892.7 ml | — | WATER | — | 0 | — | 0 |
| 1 bunch kangkong | bunch 250 g ≈ | 0.65 | main | 162.5 | 30.9 | unpriced (estimated cost ≈ ₱25 for coverage) | — |
| 2 pieces tomato, quartered | 2 × 80 g = 160 g | 0.91 | main | 145.6 | 26.2 | 160 g | 16.00 |
| 1 piece onion, quartered | DA 13-15 pcs/kg → 71.4 g | 0.90 | main | 64.3 | 25.7 | 71.4 g | 11.43 |
| 1 piece radish, sliced | 300 g ≈ | 0.90 | main | 270.0 | 43.2 | 300 g | 24.00 |
| 12 pieces sitaw, cut | 12 × 10 g = 120 g | 0.95 | main | 114.0 | 53.6 | 120 g | 12.00 |
| 2 pieces eggplant, sliced | 2 × 100 g = 200 g | 0.81 | main | 162.0 | 40.5 | 200 g (DA "3-4 Small Bundles": per kg, review flag) | 18.00 |
| 3 pieces long green pepper | 3 × 8 g = 24 g | 0.90 | main (pepper rule `long` → siling haba) | 21.6 | 8.6 | 24 g | 4.80 |
| 1 pack (44 g) sinigang mix | packageGrams 44 g | 1.0 | main, CUSTOM label | 44.0 | 105.6 | 1 pc | 22.00 |
| 2 to 3 tbsp fish sauce | midpoint 2.5 × 14.79 = 37.0 ml × 1.20 = 44.4 g | 1.0 | main | 44.4 | 15.5 | 37.0 ml | 2.85 |
| Salt and pepper to taste | compound → 2 × TO_TASTE | — | excluded | 0 | 0 | 0 | 0 |
| **Recipe** | | | | | **5,049 kcal** | | **₱464.89 + kangkong** |
| **Per serving (÷ 6)** | | | | | **841 kcal** | | **₱77+** · cost coverage 0.95 → rankable |

- Kcal is dominated by the pork-belly stand-in (151 g belly per serving). Binding the real FNRI belly row will move it.
- **Today's code:**
  - sitaw 12 × 50 g = 600 g;
  - "quarts" is an unknown unit, so 2 × 60 g;
  - the sinigang mix pack = 200 g, token-matched to tamarind (≈ +480 kcal that isn't there);
  - the fish sauce range takes the low end;
  - "long green pepper" is unpriced by substring;
  - kangkong risks an "Eel, swamp" / "Coconut water" match.

### 10.3 Chicken adobo (card servings 4)

Braise; the sauce is eaten. If the instructions pan-fry the chicken first and then simmer in the same pan, the same-pan rule keeps the oil at 1.0.

| Line | Written → gAP | EP | Role | gEaten | kcal | Cost | ₱ |
|---|---|---|---|---|---|---|---|
| 2 lbs chicken, cut into serving pieces | 907.2 g | 0.68 (whole bird cut; FNRI EP replaces) | main | 616.9 | **1,326.3** | 907.2 g | 181.44 |
| 1 head garlic, crushed | imported head 45 g | 0.87 | main | 39.2 | 58.4 | 45 g | 6.30 |
| ½ cup soy sauce | 118.3 ml × 1.08 = 127.8 g | 1.0 | main | 127.8 | 67.7 | 118.3 ml | 6.67 |
| ¼ cup white vinegar | 59.2 ml × 1.01 = 59.8 g | 1.0 | main | 59.8 | 10.8 | 59.2 ml | 3.04 |
| 3 pieces dried bay leaves | 0.6 g | 1.0 | removed | 0 | 0 | 0.6 g | 0.90 |
| 1 tbsp whole peppercorn | 14.79 ml × 0.58 = 8.6 g | 1.0 | removed | 0 | 0 | 8.6 g | 8.60 |
| 1½ cups water | — | — | WATER | — | 0 | — | 0 |
| 3 tbsp cooking oil | 44.4 ml × 0.92 = 40.8 g | 1.0 | sauté fat 1.0 | 40.8 | **360.7** | 44.4 ml | 4.44 |
| 1 tsp white sugar (optional) | 4.9 ml × 0.85 = 4.2 g | — | optional → add-on "+16 kcal, +₱0.36" | 0 | 0 | 0 | 0 |
| Salt to taste | — | — | to taste | 0 | 0 | 0 | 0 |
| **Recipe** | | | | | **1,823.9 kcal** | | **₱211.39** |
| **Per serving (÷ 4)** | | | | | **456 kcal**, ≈ 32 g protein, ≈ 33 g fat | | **₱53** |

- **Today's code:**
  - chicken has no EP: 907 g × 2.15 = 1,950 kcal;
  - "1 head" = 500 g garlic: 745 kcal and ₱70;
  - optional sugar is counted;
  - soy sauce and vinegar are unpriced, bay and peppercorn unpriceable;
  - result: ≈ 3,190 kcal ≈ **800 kcal/serving** and ≈ ₱259 ≈ **₱65/serving**, despite the missing condiment costs, because of the 500 g garlic head.
- If FNRI F113 EP turns out to be 60% (a prior read suggested this; re-verify), chicken kcal falls about 12%, to ≈ 418 kcal/serving.

---

## 11. Decisions the owner must make

1. **Static compiled JSON on GitHub Pages plus a live `/api/prices`** (recommended), or keep the compile output in Postgres behind API routes.
2. **Frying-oil cost default:** reused 3× (recommended, with a "single use" toggle), or full cost.
3. **DA variant policy:** curated default per ingredient, local/unbranded and medium size, switching only on a missing price (recommended), or cheapest-per-day "budget" as the default.
4. **Track sodium now** (recommended, in the Phase 1 FNRI pass). This also decides whether to-taste salt, patis and cube defaults matter.
5. **NULL servings (28% of recipes):** show totals plus "assumed 4", excluded from per-serving rankings (recommended), or show per-serving numbers anyway.
6. **Manual reference prices:** acceptable sources (DTI SRP bulletin, dated receipts) and refresh cadence (quarterly recommended). These are required for ranking condiment-heavy dishes.
7. **Ranking threshold:** cost coverage ≥ 0.90 plus nutrition grade A–B (recommended), or a looser 0.70.
8. **LLM spend:** one proposal pass on Sonnet 5.5 (≈ $5) or Opus 5.5 (≈ $10) after a 50-item side-by-side with Haiku 5.5; or no LLM, with hand-seeding of ~200 canonicals only.
9. **Partial-consumption conventions shown to users:** dips 40% eaten, discarded marinade 15%, optional items excluded. Show an "as listed" toggle, or not.
10. **Region pinning:** move Vercel functions to `hnd1` (Tokyo) if the plan allows.

---

# Completeness review (corrections to apply)

# Completeness review of the SarapSulit integration proposal

I checked the proposal against the repo (read-only, no files changed) and redid every calculation. The arithmetic in the worked examples is correct. The problems are missing rules, a few reference values, and five places where the proposal disagrees with itself.

- **Pricing confirmed** from the bundled Claude API reference:
  - Opus 5.5: $4 in / $20 out per MTok, cache reads $0.20, effort defaults to `medium`, thinking cannot be turned off.
  - Sonnet 5.5: $2 / $10, cache reads $0.20.
  - Haiku 5.5: $0.10 / $0.50.
  - Forced `tool_choice` (`any`/`tool`) returns a 400 on Opus, Sonnet and Haiku 5.5.
- **"Thinking is always on"** is true only for Opus 5.5. Sonnet 5.5 can turn it off with `between_tools`, and Haiku 5.5 can disable it at effort `high` or below.
- **Not checked:** the cooking and food-science reference values. I did not run web searches, so the numbers below come from memory and are marked ≈ with their source family.

## (a) Important cases or decisions still missing

1. **The value score is never defined.** §6.4, §6.5 and §8 all rank by it.
2. **Recipes with very large card servings would win "cheapest per serving" in v1.** Servings of 30 or 36 come from the recipe card, so they count as rankable, and the "per piece" label is only planned for Phase 2. They need a v1 rule.
3. **Servings ranges are already lost at scrape time.** The scraper runs `parseInt(".wprm-recipe-servings")`, so "4-6" is stored as 4. Per-serving numbers for those recipes can be up to 50% too high, and v1 cannot tell which ones they are.
4. **`costBasis: [slug, q, dim]` cannot support the promised toggles.**
   - The frying-oil reuse toggle, the optional add-ons and "+ rice" each need their own quantities.
   - `dim` is fixed at compile time. If the rank-1 DA item is missing on a day and the fallback item or manual price uses a different basis (per piece vs per kg vs per ml), the browser has nothing to multiply.
5. **Lines with no grams drop out of coverage.** Coverage is weighted by estimated energy or cost (grams × class prior). Unresolved lines and unknown units have no grams, so they add nothing and coverage looks too high exactly where the data is weakest. They need a prior gram value.
6. **"Hard flag" is not defined,** yet any hard flag sets grade D, which hides the recipe.
7. **Frying with no oil amount has no default.** A frying medium with unknown volume V has nothing to cost and no cap on absorption.
8. **The §5.2 signal rows overlap and have no order.** At 120–150 ml the same-pan rule and the shallow-fry row conflict.
9. **Animal-derived condiments need a `dietClass`.** Patis, bagoong, oyster sauce, shrimp paste, Knorr pork/chicken/beef cubes, Magic Sarap, lard and gelatin all affect the vegetarian tag.
10. **The DA per-day dedupe keys on name only.** `da-scraper.ts:282` does `new Map(rows.map(r => [r.name, r]))`. Even after `category` joins the unique key, this would still drop one of the two rice grades.
11. **The Phase 2 WPRM re-scrape must update ingredient rows in place.** It should match rows by order and never delete and recreate them, or every row in `overrides.csv` (keyed by `RecipeIngredient.id`) is orphaned. The compile should fail when an override points at a missing id.
12. **Recipes newer than the last compile have no defined behaviour.** The site needs a rule (hide them, or use the `?engine=v1` path), and the compile report should list them.
13. **Weights are missing for common count units.** There are no slice weights (52 rows), stalk weights (35 rows), or meat and fish piece weights ("6 pieces pork chop", "4 chicken thighs"), even though `piece`/`pieces` make up about 2,180 lines.
14. **LLM pass details:**
   - The Batch API (50% off) is not considered.
   - The canonical list grows during the pass, so it must sit after the last cache breakpoint or it breaks the cache for everything that follows.
   - Use a 1-hour cache TTL if the run will pause.
15. **Missing FNRI values are not handled per nutrient.** A null must never be summed as 0; each nutrient needs its own coverage.

## (b) Numbers that look wrong

| Item | Proposal | Should be (≈, source family) |
|---|---|---|
| Glutinous rice flour | 125 g/cup | ≈ 150–160 g/cup (0.63–0.68 g/ml) [USDA HM / mochiko-label family] |
| Raw glutinous rice | ≈ 200 g/cup | ≈ 185 g/cup (0.78) [USDA HM] |
| Chopped leafy greens, given kangkong and pechay as the examples | 30–45 g/cup | Kangkong ≈ 56 (0.24), pechay ≈ 70 (0.30); 30 g fits only spinach-type loose leaves [USDA HM] |
| Monggo energy ratio, raw to boiled | "2.8–3.0" | 347 / 105 ≈ 3.3 [USDA family]. Use a cooked ÷ 2.8 default, range 2.4–3.3, and calibrate |
| Mass used for frying uptake | Raw weight, even when the item was boiled first | Mass when it goes into the oil: × ≈ 0.75 after boiling [USDA CY]. Lechon kawali becomes 880 kcal/serving instead of 890 |
| LLM cost, Opus / Sonnet | ≈ $10 / ≈ $5 | Medium-effort thinking on 40-item batches is about 10–20k output tokens per request, so ≈ $12–25 / ≈ $6–12. Haiku stays under $1, and the Batch API halves all of these |
| "Today's code" oil cost in §10.1 | Uses a coconut-oil bottle at ₱180 | v2 uses palm oil at ₱100/L, so the before/after comparison mixes two prices. With the same ₱100 price, today's code gives ₱107/serving |
| Line-detail shards | "~28 files" | `ceil(maxId / 100)`; recipe ids may have gaps |
| `createMany` chunk of ≤ 2,000 rows | Stated as always safe | Safe only up to 32 columns; use `floor(65,535 / columns)` |

## (c) Internal contradictions

1. **The bake/dessert veto cancels the fritter frying class.** The veto fires on flour + sugar + baking powder, which also describes maruya, buñuelos, carioca, cascaron and donuts. Turon also has a dessert title. All of these are deep-fried and listed in the §5.2 uptake table.
2. **Chicken edible portion.** §5.3 D says serving pieces are 0.72, but §10.3 uses 0.68 for "cut into serving pieces".
3. **When the alias QA sample happens.** §3.7 makes the AUTO QA sample mandatory, but the roadmap puts it in Phase 2. That means low-usage AUTO aliases ship unaudited in Phase 1.
4. **Whether to-taste defaults are costed.** §5.3 E marks the imputed to-taste amounts as nutrition + cost, but the §6.3 cost table gives them cf 0.
5. **Trim words.** §0 says a trim word counts only before the noun, but §4.5 also lists head nouns (crab meat, fillet, kernels, florets).
6. **The `FAT_ENERGY_HIGH` exemption is keyed on the title.** Sinigang na baboy has 86% of its energy from fat but no fatty-pork title, so it would be flagged. §10.2 doesn't mention this.
7. **DA variant ranking vs the garlic example.** §3.6 prefers local items, but §10.3 binds imported garlic, which changes the head weight from 20–30 g to 45 g.
8. **"No imputation" vs a default of 4.** Defaulting NULL servings to 4 is an imputation; it should be described as "assumed 4, display only".

## (d) Things that could mislead users

1. **Too much precision.** Values like "₱398.92" or "1,823.9 kcal" imply accuracy the model doesn't have. Round and use "≈".
2. **The cost is a share of ingredients, not the shopping bill.** Label it as such, and show the oil-reuse assumption next to the number.
3. **The prices are Metro Manila (NCR) market prices only,** not supermarket or provincial prices. Show the DA date, and show the source and date for manual prices.
4. **The "cheapest" list leaves recipes out without saying so.** It should state how many recipes are not ranked.
5. **"Vegetarian" is too strong** when some lines are unresolved or a condiment is animal-derived. Say "no meat listed" instead, and only once all lines resolve and condiments are checked.
6. **Stand-in nutrition must be visible.** USDA stand-in values, brand-label values and lines with assumed amounts should be marked on each line, not hidden in an average.

---

# Corrected sections (replacement markdown)

### §0: replace two rows

| Conflict | Resolution |
|---|---|
| AP/EP by comma position vs by unit kind | **By unit kind**, plus a short "bought trimmed" list. A trim **modifier** counts only before the noun (boneless, deboned, ground, peeled, skinless). A trim **head noun** counts anywhere (fillet, crab meat, kernels, florets, "laman"). |
| Imputed servings (bodyEP / R) | **Display-only assumption in v1.** NULL servings show "assumed 4"; servings > 12 show "per piece". Both get no per-serving ranking. Card ranges ("4-6") are stored as the low end by `parseInt` and can't be detected until the Phase 2 `servingsText` re-scrape. |

### §2: replace the bulk-write bullets and the shard bullet

- Inserts use `createMany` in chunks of `floor(65,535 / columns)` rows, capped at 2,000.
- Updates use one `UPDATE … FROM (VALUES …)` statement per 500 rows.
- Never a per-row upsert loop.
- Per-line detail is sharded as `lines/{floor(id/100)}.json`. The shard count is `ceil(maxId/100)`, because ids can have gaps.
- Recipes newer than `compiledAt` are listed in the compile report and hidden from v2 lists until recompiled. The `?engine=v1` fallback can still show them.

### §3.6: add after the default ranking

- Rank 1 is the form **most commonly sold in NCR markets**, picked by a human, not "local" by rule. Garlic and onion default to the imported variant when it is priced on ≥ 80% of days.
- The binding decides piece weights: garlic imported is a 45 g head; native is 20–30 g.

### §3.7: replace "Mandatory human verification"

- Every nameKey with usage ≥ 10 (≈ 300, est. ~70% of line uses), plus their canonicals.
- All disagreements with usage ≥ 3.
- **Phase 1:** a QA sample of 60 AUTO items from the 3–9 usage bucket. If the usage-weighted error is > 5%, the whole bucket goes back to review before launch.
- **Phase 2:** a sample of 60–100 from the 1–2 bucket.
- **dietClass is reviewed for every SEASONING and BRAND_SEASONING canonical.** Patis, bagoong, oyster sauce, shrimp paste, meat cubes, Magic Sarap, lard and gelatin are not PLANT.

### §3.8: replace the cost block

**Cost (≈; list prices checked 2026-10; re-check before running):**

| Model | Price/MTok (in / out / cache read) | Est. pass cost | Notes |
|---|---|---|---|
| `claude-opus-5-5` | $4 / $20 / $0.20 | ≈ US$12–25 | Thinking can't be disabled; set `output_config.effort` (defaults to `medium`). |
| `claude-sonnet-5-5` | $2 / $10 / $0.20 | ≈ US$6–12 | Effort defaults to `high`; `low`/`medium` is enough here. |
| `claude-haiku-5-5` | $0.10 / $0.50 | < US$1 | |

- Output tokens (thinking included) dominate. Measure the first 3 requests and extrapolate.
- Prompt order: rules, examples, FNRI catalog and DA catalog first, cached with a 1-hour TTL. The **growing canonical list goes after the last cache breakpoint**.
- The Message Batches API halves cost but runs requests in parallel. Use it only with a fixed canonical list, e.g. a second pass over the tail.
- Forced `tool_choice` returns a 400 on all 5.5 models. Use `output_config.format` / `messages.parse` + `zodOutputFormat`.

### §4.3: replace these rows

| Food | g/cup | g/ml |
|---|---|---|
| Glutinous rice flour | ≈ 150–160 | 0.63–0.68 |
| Raw glutinous rice | ≈ 185 | 0.78 |
| Cooked rice (long-grain) | ≈ 160–170 | 0.68–0.72 |
| Chopped kangkong | ≈ 56 | 0.24 |
| Shredded pechay / bok choy | ≈ 70 | 0.30 |
| Loose leaves (spinach-type, malunggay excluded) | ≈ 30 | 0.13 |

### §4.4: add to Priority 2 (all [heur], to be checked in review)

| Item | Weight (AP) |
|---|---|
| Slice: ginger / bread / cheese / raw bacon | 3 g / 28 g / 20 g / ≈ 20–28 g [USDA HM ≈] |
| Stalk: celery / lemongrass / green onion | 40 g / 15–20 g / 15 g |
| Chicken piece: leg quarter / thigh / drumstick / wing (bone-in) | 250 / 120 / 90 / 80 g |
| Pork chop (bone-in) | 180 g |
| Bangus belly / fish steak | 200 g / 100 g |
| Shrimp, medium, head-on | 15 g |
| Meat or fish "piece" with no specific cut | 100 g, flagged `PIECE_CLASS_DEFAULT` |

### §5.2: replace the formula and the signal table

```
fryMass  = Σ gEP at frying time (× 0.75 if the line was boiled or simmered first ≈ [USDA CY])
V null + fry evidence → V = 480 ml (2 cups) for cost and as the absorption cap, flagged OIL_V_IMPUTED
```

Rules are **evaluated in order; the first match wins**:

| # | Signal | Classification |
|---|---|---|
| 1 | Bake veto: `\bbake|oven|preheat` (not "dutch oven"), or a baked title (cake, bread, puto, bibingka, cookies, ensaymada), or a title containing oil/dressing/sauce | Never a frying medium; oil and butter count 1.0 |
| 2 | Fry title (incl. turon, maruya, buñuelos, carioca, cascaron, donut, okoy) or deep-fry/fry-until-golden instructions | Frying allowed even when flour + sugar + baking powder are present |
| 3 | Same-pan rule (pan-fry then simmer in the same pan, no drain/set-aside oil), oil < 150 ml | Sauté fat 1.0 |
| 4 | Oil ≥ 240 ml | Deep-fry medium |
| 5 | Oil 120–240 ml + fry evidence | Shallow fry |
| 6 | Oil 120–240 ml, no fry evidence | Sauté fat 1.0, `OIL_MID_UNSURE` |
| 7 | Oil < 120 ml | Sauté fat 1.0 |

- Wrapped items (lumpia, turon, empanada): fryMass includes **all filling lines** plus the wrappers.
- Dessert titles without bake evidence (rows 1–2) no longer veto frying.

### §5.3 C: replace the dried-legumes row

| Dried legumes | Dry row, dry density | Cooked or canned measure ÷ 2.8 by default (range 2.4–3.3; USDA monggo energy ratio ≈ 3.3). Calibrate on the golden set. | N + C |

### §5.3 D: replace the chicken row

| Whole chicken, including "cut into serving pieces" from a whole bird | 0.68 |
| Bought mixed parts ("chicken parts", legs and thighs) | 0.72 |

### §6.1 step 1: replace the dedupe bullet

- **Dedupe per day by `(category, name)`** before `createMany`, keeping the non-null or last value. Today's `new Map(rows.map(r => [r.name, r]))` at `da-scraper.ts:282` must change at the same time as the unique key, or one rice grade is still dropped.

### §6.3: replace the line-cost block and the cf table

```
costBasis entry = [slug, g, ml|null, pc|null, part]
  part ∈ {main, fryRest, optional, rice}
  g is always present; ml/pc only when the line was written in that unit

/api/prices always returns perG, plus perMl/perPc when that is the native basis

lineCost  = native q × native price when both exist, else g × perG
perServing = Σ lineCost(part = main, plus fryRest ÷ R, R = 3 or 1)
             + optional/rice only when toggled on
             ÷ servings
```

| Role | cf |
|---|---|
| main, sauté fat, coating, marinade (any fate), removed aromatics, souring, garnish, dips | 1.0 |
| **Imputed to-taste or as-needed amounts** (sugar 1 tbsp, patis/soy 1 tbsp) | 1.0 on the imputed grams, flagged `AMOUNT_IMPUTED` |
| Frying medium | absorbed (part = main) + rest (part = fryRest, ÷ R at runtime) |
| Water, accompaniment (unless toggled), optional (unless toggled), salt/pepper to taste | 0 |

### §7.2: add to `Commodity`

```prisma
  basisNeedsReview Boolean @default(false)   // bunch, bundle and cm-spec names, until checked against a PDF unit column
```

### §7.3: replace the `recipes.v2.json` row

`{schemaVersion, rulesVersion, compiledAt, recipes:[{id, title, url, servings, servingsSource (CARD|ASSUMED|PIECES), perServing:{…}, kcalNaive, quality:{grade, nutritionCoverage, perNutrientCoverage, flags}, dietClass, costBasis:[[slug,g,ml,pc,part]], estCost:{slug:est}, ingredients:[names]}]}`

### §8.3: replace the fat-energy row and add one row

| Recipe | Fat energy > 70%, unless ≥ 50% of kcal comes from fatty-pork canonicals (belly, pata, skin, chicharon, bagnet) | `FAT_ENERGY_HIGH` (exempt cases stay informational, with no badge) |
| Recipe | Card servings > 12 | `SERVINGS_PIECES`: shown "per piece", not ranked |

### §8.4: add after the grade table

- **Hard flags** (any one gives grade D):
  - kcal/serving < 30 or > 2,500;
  - `LINE_HEAVY` on a major-class line;
  - `AMOUNT_MALFORMED` on a major-class line;
  - `COST_OUT`, but for the cost display only.
- **Coverage denominator for lines with no grams** (unresolved, unknown unit): use the corpus median grams for that unit (50 g when the unit is unknown) × the class kcal prior. If the class is unknown, use 200 kcal and ₱150/kg. This way unconverted lines lower coverage instead of disappearing.
- A null FNRI nutrient is never summed as 0. Report each nutrient's coverage, and hide a nutrient when its coverage is < 0.75.

### §8.8 (new): display rules

- Round displayed values:
  - kcal to the nearest 10;
  - protein, fat, carbs and fiber to 1 g;
  - cost to ₱1;
  - all shown with "≈".
- Grade C recipes show a ± range, not a single value.
- Label cost as **"ingredient cost per serving (pro-rated)"**, with "oil reused 3×" beside it when frying applies.
- Show the price source as **"DA Metro Manila market prices, <date>"**. Manual prices show their own source and date.
- Per line, mark USDA stand-in, brand-label and assumed-amount values ("≈ eaten X g · assumed").
- The cheapest sort shows "N recipes not ranked (incomplete price or servings data)".
- Replace "vegetarian" with "no meat listed". Show it only when every line is resolved and no condiment is animal-derived.

### §10.1: replace the oil row and the recipe, per-serving and today's-code lines

| 3 cups cooking oil | 709.8 ml × 0.92 = 653.0 g | 1.0 | frying medium: absorbed 0.02 × (907.2 × 0.75 boiled) = **13.6 g** | 13.6 | **120** | 13.6 + 639.4/3 = 226.7 g = 246.4 ml | 24.64 |
| **Recipe** | | | | | **3,521 kcal**, fat 350.2 g | | **₱398.59** |
| **Per serving (÷ 4)** | | | | | **≈ 880 kcal, ≈ 88 g fat** | | **≈ ₱100** (single-use oil: ≈ ₱111) |

- **Today's code**, using the same palm-oil price (₱100/L read as ₱/kg):
  - kcal: unchanged at ≈ 2,770 kcal/serving;
  - cost: oil 720 "g" × ₱0.10 = ₱72.00, salt ₱1.20, pepper and bay unpriced. Total ₱427.01 ≈ **₱107/serving**.
- **Flags:** `FAT_ENERGY_HIGH` is informational and exempt, because 100% of kcal comes from fatty pork.

### §10.2: add below the table

- Fat energy is ≈ 86% (pork-belly stand-in). It is exempt under the new §8.3 rule because 93% of kcal comes from fatty pork; under the old title rule it would have been flagged.

### §10.3: replace the chicken row's EP cell

| 2 lbs chicken, cut into serving pieces | 907.2 g | 0.68 (whole bird cut up, §5.3 D; FNRI EP replaces it only if the bound row is whole-bird form) | … |

### §11: add these decisions

11. **Value score:** none in v1 (cost sort only), or a defined metric such as protein g per ₱10 with a kcal floor. It must be defined before any UI uses it.
12. **Card servings > 12:** treated as "per piece" and not ranked (recommended), or ranked as written.
13. **Diet tag wording:** "no meat listed" (recommended) vs "vegetarian".
14. **LLM execution:** run the pass sequentially with caching (recommended, because the canonical list grows), or use the Batch API at half price with a fixed list in a second pass.