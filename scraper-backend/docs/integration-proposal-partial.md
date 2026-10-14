# Integration proposal — partial results (designs + edge cases)

Generated before the run was stopped; critiques and final synthesis still pending.


## SarapSulit entity resolution: recipe line → canonical ingredient → FNRI food + DA commodity (persisted, reviewable, LLM-assisted)

# Entity resolution for SarapSulit
Recipe ingredient line → canonical ingredient → FNRI food + DA commodity

Every number below is either measured from the repo (marked "verified") or an estimate that the separate data profile should replace (marked "est.").

---

## 0. Decisions at a glance

1. **Matching leaves the browser.** Offline Node scripts run locally against `DIRECT_URL`, so the 60 s Vercel limit does not apply. They write persisted mapping tables. The live site only looks results up. `docs/matcher.js` stays as the candidate generator: the scripts and the review page `require` it, so it never drifts.
2. **There are three stored hops, each with method, confidence, status and evidence:**
   - `nameKey → CanonicalIngredient` (`IngredientAlias`)
   - `Canonical → FNRI foodCode` (field on the canonical)
   - `Canonical → ranked DA identities` (`CanonicalCommodity`)
   Review happens per canonical: about 800 (est.) instead of 3,386 raw strings × 2 sources.
3. **FNRI state rule: use the composition of the state in which the recipe measures the ingredient.**
   - The default is as purchased: raw, or a purchased processed form such as dried, canned, smoked or salted.
   - Home cooking (boiled, fried, braised) is applied downstream with yield and retention factors (EuroFIR/INFOODS recipe method). It is never applied by picking a cooked FNRI row.
   - Exception: canonicals measured cooked, such as "4 cups cooked rice".
4. **DA identity is decoupled from raw daily names** (`CommodityIdentity` + `CommodityAlias`). For each canonical, the variant comes from a ranked binding list: primary, then fallbacks, with a 7-day stale window, then a derived or manual price.
5. **Claude is used offline and closed-set.**
   - Pass 1 canonicalizes ~2,400 normalized names (est.). It runs sequentially so the canonical list grows consistently.
   - Pass 2 binds canonicals to FNRI codes and DA identities chosen from the full catalogs, via the Batch API.
   - All output is validated against the DB. The LLM never sets `VERIFIED`. Agreement with the token matcher, together with usage, decides `AUTO` vs review.
   - Cost ≈ US$15 on `claude-opus-5-5`.
6. **Mandatory human verification:**
   - every nameKey used ≥ 10 times (≈ top 300, est. ~70% of line uses), and every canonical those keys point to;
   - a 100-item random QA sample of the `AUTO` decisions.
   About 10 h of review in total.
7. **`docs/match-review.html` becomes the review client** for `GET /api/review/queue` and `POST /api/review/decide` (token-protected). A CSV export → spreadsheet → import script round-trip is an acceptable v1.

---

## 1. Defects in today's code (verified by running `docs/matcher.js` with node)

| Input | Current behaviour | Consequence |
|---|---|---|
| `rice` | `isNonPriceable` = true (substring `ice`) | Rice is never costed |
| `red bell pepper` (107 uses), `long green pepper` | non-priceable (`pepper`) | Never costed |
| `garlic cloves`, `sausage`, `peeled shrimp`, `thinly sliced pork`, `cauliflower`, `watermelon`, `calamansi juice`, `milk powder` | non-priceable (substrings `clove`, `sage`, `peel`, `ice`, `flower`, `water`, `powder`) | Never costed |
| `eggplant`, `graham crackers`, `oyster mushroom` (and any line named `gata`) | `ANIMAL_WORDS` substring hit | The recipe loses its "vegetarian" tag |
| `sauces` → `sauc`, `noodles` → `noodl` (but `sauce`, `noodle` stay unchanged) | Plural stemming is asymmetric | Plural and singular forms don't match |
| `milk` | → "Coconut milk" 0.67 beats "Milk, cow's, whole, fluid" 0.50 (sample names) | Wrong food |
| `all-purpose flour` | `all` and `purpose` are stopwords → tokens `[flour]` → "Cassava flour" ties "Wheat flour, all purpose" at 0.67; the shorter name wins | Wrong food |
| `beef broth` → "Beef blood" 0.40; `star anise` → "Star apple" 0.50 | No head-noun check | Wrong food (current gates stop these only by luck) |
| `head` = 500 g, `pack` = 200 g | The flat unit table ignores "45g pack" and "(44g)" written in the line | 1 sachet of sinigang mix is counted as 200 g |
| DA scraper `new Map(rows.map(r => [r.name, r]))` | Same name under two categories on one day: last one wins | **Likely** drops imported-rice rows ("Regular Milled 20-40% bran streak" appears under both IMPORTED and LOCAL COMMERCIAL RICE). Verify on one PDF (§4.2). |

**Conclusion:** substring lists and global stopwords cannot be patched safely. Both audit rounds show each fix regressing something else. Policy (priceable, animal, negligible) belongs on a canonical row, set once and reviewed.

---

## 2. Architecture

```
RecipeIngredient (static)
  │ normalizeLine()  → nameKey, notes, role, stateHint, sizeHint, packageGrams, measureBasis
  │ classifyLine()   → INGREDIENT | COMPOUND | ALTERNATIVE | HEADER | NOISE | EQUIPMENT
  ▼
IngredientAlias(nameKey) ──► CanonicalIngredient ──fnriFoodCode──► NutritionFact (+altNames, EP%, state, kind)
                                   │
                                   └─CanonicalCommodity(rank, isProxy)──► CommodityIdentity ◄─CommodityAlias(rawName)◄─ Commodity.name (daily)
ResolvedLine (materialized per RecipeIngredient × part) ── read by /api/recipes
ReviewEvent (append-only audit log for every human/LLM decision)
```

**Where code runs**

- `scraper-backend/scripts/*.ts`, run with `npx tsx` (add `tsx` as a devDependency) using `DIRECT_URL`.
  - Bulk inserts use `createMany` in chunks of ≤ 5,000.
  - Per-row bulk updates use one `UPDATE … FROM (VALUES …)` via `$executeRaw` per 500 rows.
- On Vercel:
  - the read endpoints;
  - the review endpoints (≤ 4 statements per request);
  - one small hook in the DA scraper (§4.3).
- Optional: set the Vercel Functions region to `hnd1` (Tokyo) to sit next to the DB. Round trips drop from ~150 ms to a few ms. Check that your plan allows choosing the region.

**Scripts** (each one is idempotent and safe to re-run)

| Script | Does | Runtime (est.) |
|---|---|---|
| `fnri-meta.ts` | Fetches alt names, scientific name and EP% (§4.1). Derives `headTerm`, `state`, `foodKind`. | < 30 min |
| `da-identities.ts` | Backfills identities and aliases from all `Commodity.name`. Computes `pricedDays` and `medianPrice`. | < 1 min |
| `seed-canonicals.ts` | Migrates the ~85 `COMMODITY_ALIASES` pairs plus hand-seeded top-50 canonicals | seconds |
| `resolve-names.ts` | Normalizes every line → nameKeys, usage counts, rule classifications, token candidates → `IngredientAlias` | ~1 min |
| `llm-canonicalize.ts` / `llm-bind.ts` | LLM passes 1 and 2 (§8) | ~1.5 h / batch latency |
| `materialize-lines.ts` | Rebuilds `ResolvedLine` (~35k rows est.; delete + createMany in 5k chunks) | ~1 min |
| `import-decisions.ts` | Applies a reviewed CSV (v1 review path) | seconds |
| `eval-golden.ts` (optional) | Scores the resolver against a hand-labelled golden set | seconds |

---

## 3. Data model (Prisma additions)

Relation fields are omitted for brevity. Add `@relation` on every `…Id`.

```prisma
// FNRI: extend the existing model (all nullable; filled by fnri-meta.ts)
model NutritionFact {
  // ... existing fields ...
  alternateNames   String?  // raw FNRI "Alternate/Common name(s)", e.g. "Mais, durog, puti"
  scientificName   String?
  ediblePortionPct Float?   // FNRI "Edible portion" %, e.g. 88
  headTerm         String?  // derived: normalized first comma segment
  state            String?  // derived: RAW|BOILED|FRIED|ROASTED|STEAMED|CANNED|DRIED|SMOKED|SALTED|FERMENTED|PREPARED|UNSPECIFIED
  foodKind         String?  // derived: SINGLE|PROCESSED|COOKED|DISH
}

model CanonicalIngredient {
  id                Int      @id @default(autoincrement())
  slug              String   @unique          // "pork_belly"
  displayName       String                    // "Pork belly (liempo)"
  kind              String                    // FOOD|SEASONING|BRAND_SEASONING|OIL|WATER|NON_FOOD
  isAnimal          Boolean  @default(false)  // replaces ANIMAL_WORDS
  fnriState         String   @default("RAW")  // state in which recipes MEASURE it: RAW|DRIED|CANNED|SMOKED|SALTED|FERMENTED|PRODUCT|COOKED
  // nutrition
  nutritionPolicy   String   @default("UNKNOWN") // FNRI|PROXY|CUSTOM|NEGLIGIBLE|UNKNOWN
  fnriFoodCode      String?                      // NutritionFact.foodCode
  fnriStateUsed     String?                      // state of the bound FNRI row (cooking layer must not re-apply losses to a cooked row)
  ediblePortionPct  Float?                       // override; default = FNRI EP%
  customNutrients   Json?                        // per 100 g, CUSTOM only (e.g. from a label) - optional
  // price
  pricePolicy       String   @default("UNKNOWN") // DA|DERIVED|MANUAL|NOT_COSTED|FREE|UNKNOWN
  derivedFromId     Int?                         // rice_cooked -> rice_milled_raw ; broth_chicken -> bouillon_cube_chicken
  derivedYield      Float?                       // units of this per unit of source (2.6 g cooked rice per g raw; 50 ml broth per g cube)
  manualPricePhp    Float?
  manualPriceQty    Float?                       // 1000
  manualPriceUnit   String?                      // g|ml|pc
  manualPriceSource String?                      // "DTI SRP bulletin 2026-09" / "SM Hypermarket receipt 2026-10-05"
  manualPriceDate   DateTime?
  unitWeights       Json?                        // reserved for the quantity layer: {"piece":110,"clove":5,"ml":0.92}
  reviewStatus      String   @default("UNREVIEWED") // UNREVIEWED|VERIFIED
  version           Int      @default(1)
  updatedAt         DateTime @updatedAt
}

model CanonicalSynonym {          // the alias dictionary, incl. Filipino<->English
  id          Int     @id @default(autoincrement())
  canonicalId Int
  term        String              // normalized, e.g. "liempo", "sitaw", "string bean"
  foldKey     String              // Filipino spelling fold (sec. 5.4), e.g. "sitaw"
  lang        String              // en|fil|ceb|ilo|brand|fnri_alt
  source      String              // SEED|FNRI|LLM|HUMAN
  ambiguous   Boolean @default(false)
  @@unique([term, canonicalId])
  @@index([term])
  @@index([foldKey])
}

model IngredientAlias {           // one row per normalized surface form (~2,400 est.)
  id          Int      @id @default(autoincrement())
  nameKey     String   @unique
  lineKind    String              // INGREDIENT|COMPOUND|ALTERNATIVE|HEADER|NOISE|EQUIPMENT|UNRESOLVED
  canonicalId Int?                // single-part lines
  parts       Json?               // COMPOUND/ALTERNATIVE: [{"canonicalId":12,"role":"TO_TASTE"},{"canonicalId":40,"role":"ALTERNATE"}]
  defaultRole String?             // role implied by the name itself ("salt and pepper to taste")
  method      String              // RULE|SYNONYM|FOLD|TOKEN|LLM|LLM+TOKEN|HUMAN
  confidence  Float
  status      String              // AUTO|NEEDS_REVIEW|VERIFIED|REJECTED
  mustVerify  Boolean  @default(false) // usageCount >= 10
  priority    Float    @default(0)
  usageCount  Int      @default(0)
  evidence    Json?               // {token:[{slug,score}], llm:{slug,conf,reason}, samples:[{recipeId,rawText}]}
  reviewedAt  DateTime?
  version     Int      @default(1)
  @@index([status, priority])
}

model CommodityIdentity {         // a stable DA item across days (~260 est.)
  id           Int      @id @default(autoincrement())
  key          String   @unique   // normKey(name) [+ "|" + category when the name repeats across categories]
  displayName  String             // latest raw spelling
  category     String?
  origin       String?            // LOCAL|IMPORTED
  sizeClass    String?            // SMALL|MEDIUM|LARGE|XL
  attrs        Json?              // {"form":"frozen","cut":"whole round","variety":"suprema","spec":"8-10 cm"}
  priceUnit    String   @default("KG")   // KG|PC|BOTTLE|PACK
  gramsPerUnit Float    @default(1000)   // egg medium 58; oil 1 L bottle 920
  unitStatus   String   @default("AUTO") // AUTO|VERIFIED|SUSPECT
  status       String   @default("NEW")  // NEW|ACTIVE|MERGED|RETIRED
  mergedIntoId Int?
  firstSeen    DateTime
  lastSeen     DateTime
  pricedDays   Int      @default(0)
  medianPrice  Float?
}

model CommodityAlias {            // exact raw DA name -> identity
  rawName    String   @id
  identityId Int
  method     String               // EXACT_KEY|AUTO_MERGE|HUMAN
  createdAt  DateTime @default(now())
}

model CanonicalCommodity {        // ranked price bindings
  canonicalId Int
  identityId  Int
  rank        Int                 // 1 = primary
  isProxy     Boolean @default(false) // similar-but-different item used as a price stand-in (shown as "≈")
  @@id([canonicalId, identityId])
}

model ResolvedLine {              // materialized result per RecipeIngredient part (~35k est.)
  id                 Int     @id @default(autoincrement())
  recipeIngredientId Int
  partIndex          Int     @default(0)
  nameKey            String
  lineKind           String
  canonicalId        Int?
  role               String          // INGREDIENT|TO_TASTE|OPTIONAL|GARNISH|FRYING_MEDIUM|ALTERNATE|EXCLUDED
  groupLabel         String?         // text of the nearest preceding HEADER row ("Marinade ingredients:")
  stateHint          String?         // "fried","boiled" -> cooking layer
  sizeHint           String?         // "large"
  measureBasis       String?         // AP (as purchased) | EP (edible portion), see sec. 6.2
  packageGrams       Float?          // from "45g pack ..." / "(44g)"
  brand              String?
  noteText           String?         // recovered notes span, for audit
  status             String          // copied from the alias at resolve time
  resolverVersion    Int
  @@unique([recipeIngredientId, partIndex])
  @@index([nameKey])
  @@index([canonicalId])
}

model ReviewEvent {
  id        Int      @id @default(autoincrement())
  entity    String   // ALIAS|CANONICAL|BINDING|IDENTITY
  entityId  String
  action    String   // ACCEPT|CHOOSE|CREATE|MERGE|SPLIT|MARK_NOISE|EDIT|UNDO|LLM_PROPOSE
  before    Json?
  after     Json?
  actor     String   @default("owner") // owner|llm:claude-opus-5-5|rule
  createdAt DateTime @default(now())
  @@index([entity, entityId])
}
```

**Audit trail.** Any number on the site traces back as:

`ResolvedLine` → `IngredientAlias` (method, confidence, evidence, events) → `CanonicalIngredient` (FNRI code + status, bindings) → the `CommodityIdentity` and date actually used for the price.

The UI can show it per ingredient, for example: "FNRI: Pork, belly … (verified) · Price: DA 'Pork Liempo', 2026-10-12".

---

## 4. Source-data preparation (do first)

### 4.1 FNRI alternate names and edible portion

The scraper comment says the `/all` directory table server-renders only 10 rows. So:

1. Open the page with the browser Network tab.
   - If the table is DataTables server-side, call its XHR endpoint once with `length=2000`.
   - Otherwise, check whether the `{code}_data` modal already contains these fields.
   - As a last resort, fetch per-food pages: 1,542 GETs at 1/s ≈ 26 min, from a local script.
2. Store `alternateNames`, `scientificName` and `ediblePortionPct`. Verify the separator between multiple alt names; `;` and `/` are likely.
3. Derive these fields (with lexicons):
   - **`headTerm`** = first comma segment.
   - **`state`** from these tokens:
     - `raw`, `fresh` → RAW
     - `boiled`, `steamed`, `cooked` → BOILED/STEAMED
     - `fried`, `deep-fried`, `sauteed` → FRIED
     - `roasted`, `grilled`, `broiled`, `baked`, `toasted` → ROASTED
     - `cnd`, `canned` → CANNED
     - `dried`, `dehydrated` → DRIED
     - `smoked` → SMOKED
     - `salted` → SALTED
     - `fermented` → FERMENTED
     - `prep`, `prepared` → PREPARED
     - none of these → UNSPECIFIED
   - **`foodKind`**:
     - DISH if the name contains `prep`/`prepared`, or a dish word (stir-fry, soup, salad, stew, adobo, sinigang, tinola, nilaga, menudo, afritada, caldereta, kare-kare, dinuguan, pancit, lumpia, torta, guisado, ginataan, sandwich, cake, pie, burger);
     - PROCESSED for CANNED/DRIED/SMOKED/SALTED/FERMENTED or product words (flour, oil, sauce, paste, powder, milk-evap/condensed);
     - COOKED for BOILED/FRIED/ROASTED/STEAMED;
     - SINGLE otherwise.

   DISH rows are excluded from ingredient matching. That fixes `eggs` → "Vegetable stir-fry w/ quail eggs".

### 4.2 DA names: how stable are they?

Names are mostly stable because they come from a fixed PDF template. There are three failure modes:

- (a) Whitespace and punctuation differences from text extraction or line wraps. The scraper prepends wrapped lines, so these are usually stable.
- (b) DA editing a spec string.
- (c) **Identical names under different categories.** Rice grades repeat under IMPORTED and LOCAL. These collide on `(name, region, sourceDate)`, and the current dedupe silently keeps the last one.

Measure before building:

```sql
-- names seen on < 50% of scraped days = wrap/rename suspects
WITH d AS (SELECT COUNT(DISTINCT "sourceDate") n FROM "Commodity")
SELECT name, category, COUNT(*) AS days FROM "Commodity", d
GROUP BY name, category, d.n HAVING COUNT(*) < d.n * 0.5 ORDER BY name;
```

For (c), run `extractCommodities` locally on one PDF and count names with more than one category.

**Fix (later code change):** before the dedupe, qualify repeated names with the category origin, e.g. `Regular Milled 20-40% bran streak (Imported)`.

### 4.3 Identity upkeep

**`normKey(name)`:**
- NFKD, lowercase;
- `–` and `—` → `-`;
- collapse whitespace;
- remove spaces inside `( … )`;
- `liter`/`litre` → `l`, `grams`/`gram` → `g`, `kilo` → `kg`;
- strip trailing punctuation.

**Attribute parse:**
- `origin` ← `Local`/`Imported`;
- `sizeClass` ← `Small`/`Medium`/`Large`/`Extra Large`;
- `form` ← `Frozen`/`Chilled`/`Fresh`;
- `cut` ← `Whole Round`/`Dressed`/`Fillet`;
- `variety` ← the remaining capitalized words (Suprema, Baguio, …).

**Price basis:**

| Pattern in name | `priceUnit` | `gramsPerUnit` |
|---|---|---|
| `(\d+)-(\d+)\s*grams?/pc` | PC | midpoint (eggs 56-60 → 58) |
| `(\d+(?:\.\d+)?)\s*(l\|ml)/bottle` | BOTTLE | ml × density (oil 0.92 → 1 L = 920) |
| `(\d+)\s*(g\|kg)/pack` | PACK | grams |
| anything else | KG | 1000 |

Names containing `/` that match none of these patterns are set to `unitStatus=SUSPECT` (e.g. "…/bunch hd"). That suffix describes size; the item is still per kg.

**Price-band sanity check** (flags `SUSPECT`):

| Unit | Flag when price is outside |
|---|---|
| KG | ₱15–1,500 |
| PC | ₱3–25 |
| BOTTLE | ₱50–600 |

**DA scraper hook,** after the day's transaction (normally 1 round trip):

1. `findMany` `CommodityAlias` for today's names.
2. If any are unknown: `createMany` identities (`status NEW`, `skipDuplicates`) → re-read their ids → `createMany` aliases.

`firstSeen`, `lastSeen`, `pricedDays` and `medianPrice` are recomputed by one `UPDATE … FROM (SELECT … GROUP BY …)` statement when a DA run finishes.

**Merge suggestion for a NEW identity K first seen on day D:**
- Candidates are ACTIVE identities in the same category, absent on D, with `lastSeen ≥ D−3`.
- Score with token Jaccard after removing punctuation:
  - ≥ 0.9 and exactly one candidate → auto-merge (`AUTO_MERGE` + ReviewEvent);
  - 0.6–0.9 → review queue;
  - otherwise → new item.
- Identities unseen for 30 days → `RETIRED`.
- A binding whose identity has `lastSeen < today−3` shows as "binding broken" in the review tool.

---

## 5. Line normalization and classification

### 5.1 `normalizeLine({name, rawText, amount, unit})`

1. `s = name || rawText`. Apply NFKD, strip diacritics, lowercase. `’` → `'`, `&` → `and`, collapse whitespace.
2. **Recover the notes span** (it is not stored separately): `notes = rawText` minus amount, unit and name text. For example, `"(for frying)"` and `", cut into cubes"`.
3. **Parentheticals** `( … )` are removed from `s` and handled as follows:
   - (a) A digit + unit inside, e.g. `(44g)` or `(14 oz)`, → `packageGrams` (oz × 28.35).
   - (b) An exact canonical synonym or FNRI alt-name phrase with no digits, e.g. `(sitaw)`, `(kasim)`, `(patis)`, → `aliasHint`. This is tried first in lookup.
   - (c) Anything else → `noteText`.
4. **Leading package residue:**

   `^(\d+(?:\.\d+)?)\s*(g|grams?|ml|oz|lbs?|kg)\s+((pack|packet|pouch|sachet|can|bottle|box|bar|block)s?\s+)?(of\s+)?`

   This becomes `packageGrams` and is stripped. Then strip `^(pcs?|pieces?|cups?|tbsp|tsp|cans?|packs?)\s+(of\s+)?`.
5. **Trailing clause:** split at the first `,`, ` - ` or `;`. The tail goes to `noteText`. If the tail starts with a prep word, set `measureBasis = AP` (§6.2).
6. **Role phrases** are searched in `rawText` + notes and then removed:

   | Phrase | Role |
   |---|---|
   | `to taste`, `as needed`, `for seasoning` | TO_TASTE |
   | `optional` | OPTIONAL |
   | `for garnish`, `to garnish`, `for topping` | GARNISH |
   | `for (deep\|pan)[ -]?frying`, `for frying` | FRYING_MEDIUM (only when the canonical kind is OIL) |

7. **Token classes:**
   - **PREP** (~60 words): chopped, minced, diced, sliced, julienned, grated, crushed, pounded, mashed, cubed, halved, quartered, wedged, beaten, softened, melted, peeled, deveined, cleaned, trimmed, rinsed, drained, soaked, shredded, flaked, deboned, boneless, skinless, bone-in, thinly, finely, coarsely, roughly, freshly, lightly, cut, into, strips, rings, inch, …
   - **SIZE**: small, medium, large, extra, big, jumbo.
   - **FILLER**: a, an, the, of, some, about, approximately, store-bought, homemade, good-quality, your, favorite, preferred, any.
   - **STATE**: raw, fresh, boiled, hard-boiled, fried, deep-fried, cooked, leftover, day-old, steamed, roasted, grilled, toasted, smoked, dried, sun-dried, canned, frozen, salted, fermented, pickled, cured, instant, ground.
   - **BRAND**: see §7.

   A PREP word *before* the noun sets `measureBasis = EP`. Known hyphen compounds are kept as one token: all-purpose, self-raising, extra-virgin, hard-boiled, deep-fried, sun-dried, bird's-eye.
8. **`nameKey`** = the tokens minus PREP, SIZE and FILLER, singularized. STATE, BRAND and color words **are kept**: "red onion" ≠ "white onion".

   Singularization rules:
   - `ies` → `y`;
   - `(s|x|z|ch|sh|o)es` → drop `es` (tomatoes, potatoes, radishes);
   - irregulars: leaves → leaf, halves → half, loaves → loaf;
   - words ending in `ss` are unchanged;
   - otherwise drop a final `s` when length > 3 (eggs, noodles, cloves, sauces).

   The same rule must replace the stemmer in `matcher.js`.

**Expected reduction:** 3,386 names → ~2,400 nameKeys (est.). Examples: "medium yellow onion" → `yellow onion`; "onion, chopped" → `onion`; "45g pack Knorr Ginataang Gulay Mix" → `knorr ginataang gulay mix`.

### 5.2 `classifyLine()`: ordered rules, first match wins

| # | Kind | Rule |
|---|---|---|
| 1 | HEADER | `rawText` ends with `:`; or `^for (the )?\w[\w ]*$` with `amount==null`; or nameKey ∈ {cooking procedure, procedure, ingredients, marinade, marinade ingredients, sauce, dipping sauce, garnish, toppings, filling, batter, dough, breading, coating, slurry, soup base} with `amount==null && unit==null` |
| 2 | NOISE | nameKey empty, length < 2, or `^[\d\W]+$`; or nameKey ∈ UNIT_WORDS {can, pack, packet, sachet, piece, pc, cup, tbsp, tsp, bottle, box, bag, bunch, head, clove, slice, lb, oz, g, kg, ml} |
| 3 | EQUIPMENT | nameKey ∈ {aluminum foil, foil, parchment paper, wax paper, cling wrap, plastic wrap, cheesecloth, skewer, bamboo skewer, barbecue stick, toothpick, kitchen twine, string, paper towel, cupcake liner, llanera, mold} |
| 4 | COMPOUND | Split nameKey on `,`, ` and `, `&`, `+`. Accept **only if ≥ 2 parts and every part resolves exactly** (lookup steps 1–4 in §9.1). "sweet and sour sauce" stays whole. The line role applies to all parts. If an amount is present, divide it equally (rare; flagged). |
| 5 | ALTERNATIVE | Split on ` or `. The first resolvable part is the primary; the others get role ALTERNATE (not counted). |
| 6 | INGREDIENT | Everything else. Water, salt and banana leaves are canonicals (kind WATER, SEASONING, NON_FOOD), not special kinds. |

**Group labels.** Rows after a HEADER, in `RecipeIngredient.id` order, inherit `groupLabel` until the next header. This gives "marinade" detection for recipes whose authors typed headers as rows.

Optional: re-scrape `.wprm-recipe-group-name` to cover all recipes. That is 2,770 fetches at 1.5 s ≈ 70 min, run chunked locally.

**Default role policy** (standard recipe-analysis practice):
- OPTIONAL and TO_TASTE are excluded from nutrition and cost, but shown as "to taste / optional".
- GARNISH is counted.
- FRYING_MEDIUM is passed to the cooking layer with the listed volume. Until that layer exists, count 10% of the listed oil (placeholder, approximate).
- ALTERNATE is never counted.

### 5.3 Ambiguous heads: unit and context rules

These run *before* the synonym lookup. Each target is a canonical slug.

| Head | Rule → canonical |
|---|---|
| pepper | TO_TASTE, or unit ∈ {tsp, tbsp, pinch, dash}, or modifier ∈ {ground, black, white, cracked, whole, corn} → `black_pepper`. {bell, capsicum} or unit piece → `bell_pepper_red` / `bell_pepper_green`. {long, finger, pansigang, haba} → `chili_long_green`. {bird's-eye, labuyo, thai} → `chili_labuyo` |
| sugar | bare, white, granulated, refined → `sugar_white`; brown, muscovado → `sugar_brown`; washed → `sugar_washed` |
| oil | bare, cooking, vegetable, canola, corn, palm → `oil_cooking`; olive → `oil_olive`; sesame → `oil_sesame` |
| milk | bare, fresh, whole → `milk_fresh`; evaporated → `milk_evaporated`; condensed → `milk_condensed`; coconut → `coconut_milk`; powdered → `milk_powder` |
| rice | + cooked, leftover, steamed, day-old → `rice_cooked`; glutinous, malagkit → `rice_glutinous`; bare, uncooked, jasmine → `rice_milled_raw`; rice flour, noodle, paper, wine → their own |
| onion | green, spring, scallion → `green_onion`; red, sibuyas tagalog, shallot → `onion_red`; white, yellow → `onion_white`; bare → `onion` (generic, ranked bindings) |
| cheese | bare, quick-melt, processed, cheddar → `cheese_processed`; parmesan, mozzarella and cream cheese are separate |
| broth / stock | `broth_{chicken\|beef\|pork\|shrimp\|vegetable}`: NEGLIGIBLE nutrition; DERIVED price from `bouillon_cube_*` at 1 cube (10 g) per 500 ml (label direction, approximate) |
| noodles | canton, bihon, sotanghon, miki, misua, egg noodles → separate canonicals |

### 5.4 Filipino ↔ English aliases

The aliases come from four sources:

1. **FNRI alternate names.** When a canonical is bound to an FNRI row, that row's alt names are auto-added as `CanonicalSynonym(lang=fnri_alt, source=FNRI)`. If a term is already a synonym of another canonical, it is marked `ambiguous` and queued. One binding therefore teaches the resolver every Filipino name FNRI knows for that food.
2. **The existing `COMMODITY_ALIASES`** (~85 pairs) become `SEED` synonyms.
3. **LLM pass 1** proposes `en`, `fil` and regional synonyms per canonical. They are accepted when the canonical is verified.
4. **The `foldKey` spelling fold**, applied symmetrically:
   - `c` → `k` before a, o, u;
   - `ao` → `aw` (sitao/sitaw);
   - final-syllable `u` ↔ `o` (munggo/monggo);
   - `ts` → `ch` (petsay/pechay);
   - `ñ` → `n`;
   - hyphens and spaces in reduplications removed.

   A fold match has confidence 0.85.

---

## 6. Prep and state policy

### 6.1 Which FNRI state

**Rule:** the composition must describe the same state as the quantity (EuroFIR/FAO-INFOODS recipe calculation).

| Line says | Example | Canonical / FNRI row | Passed downstream |
|---|---|---|---|
| nothing, or `raw`/`fresh` | "2 lbs pork belly" | `pork_belly` → raw row | method from instructions (braise) → yield + retention factors (USDA Retention Factors R6 / Bognár 2002) |
| purchase-form word | "dried shrimp", "canned tuna", "tinapa", "salted egg", "evaporated milk", "dried bay leaves" | own canonical, `fnriState` = that form | nothing (already processed) |
| home-cooking word, measured before cooking | "fried garlic", "boiled pork" | raw row of the base canonical + `stateHint` | the cooking step |
| measured cooked | "4 cups cooked rice", "leftover rice", "2 cups cooked noodles", "shredded cooked chicken", "hard-boiled eggs" | own canonical with `fnriState=COOKED` → cooked row | **no** further yield/retention |

- If only a cooked FNRI row exists for a raw canonical, it may be bound. `fnriStateUsed` records this so losses aren't applied twice.
- Frozen is a price variant, not a canonical.

**Canonical granularity rule.** Split a canonical only when the split is *observable in the data*:
- a different FNRI row with a > 15% difference in kcal or protein, or
- a distinct DA identity, or
- a distinct measured state (the cooked-rice case), or
- a purchased processed form.

Never split by prep words, size, or the brand of a commodity product.

Expected size: ~800 canonicals (est.); ~200 cover the top 300 nameKeys.

### 6.2 Edible portion (stored here, used by the quantity layer)

FNRI values are per 100 g EP. DA prices are per kg as purchased (AP).

The `measureBasis` rule follows the recipe-writing convention:
- **EP**: volume units, or a prep word before the noun ("1 cup chopped onion", "1 lb peeled shrimp");
- **AP**: count, whole or weight units with prep after the comma ("1 onion, chopped", "1 lb shrimp, peeled").

| Basis | Nutrition | Cost |
|---|---|---|
| AP | grams × EP%/100 × FNRI/100 | grams × price/1000 |
| EP | grams × FNRI/100 | grams / (EP%/100) × price/1000 |

EP% comes from the FNRI EP column; `ediblePortionPct` on the canonical overrides it.

---

## 7. Brand items

Seed brand list (~40): knorr, maggi, ajinomoto, datu puti, silver swan, marca piña, mama sita's, ufc, jufran, del monte, hunt's, clara ole, lady's choice, best foods, kraft, eden, magnolia, nestle, alaska, carnation, jolly, purefoods, cdo, argentina, san marino, 555, ligo, century, lucky me, mccormick, barrio fiesta, kikkoman, lee kum kee, doña elena, star.

| Pattern | Rule | Examples |
|---|---|---|
| Brand + generic commodity noun (soy sauce, vinegar, fish sauce, tomato sauce, ketchup, evaporated/condensed milk, all-purpose cream, mayonnaise, cheese, corned beef, sardines, tuna) | Strip the brand into `ResolvedLine.brand` and use the generic canonical | "Datu Puti vinegar" → `vinegar_cane`; "Del Monte tomato sauce" → `tomato_sauce`; "Eden cheese" → `cheese_processed` |
| Proprietary seasoning products | `BRAND_SEASONING` canonical **per product type, not per brand**. Nutrition NEGLIGIBLE by default; CUSTOM per-100 g label values are optional. Price MANUAL per piece or pack. | `bouillon_cube_{pork,chicken,beef,shrimp}` (1 piece ≈ 10 g, label approx.); `seasoning_granules` (Magic Sarap, Ajinomoto Ginisa; sachet ≈ 8 g); `liquid_seasoning` (Knorr/Maggi; nutrition PROXY = soy sauce row); `sinigang_mix`; `ginataang_mix`; `gravy_mix`; `breading_mix`; `msg` |
| Package size in the line | `packageGrams` overrides the flat unit table | "45g pack …" → 45 g, not 200 g |

**NEGLIGIBLE threshold:** typical use contributes < 10 kcal per serving and < 2% of the DRV of every tracked micronutrient. Examples: bay leaf, peppercorn, star anise, MSG, cubes, salt. None of the 11 stored nutrients include sodium, so salt is NEGLIGIBLE.

**Pantry fallback prices.** About 40 canonicals have no DA price but heavy usage: soy sauce 397 uses, butter 236, flour 207, fish sauce 192, cornstarch 172, oyster sauce 132, coconut milk 104, sesame oil 84, cubes and mixes. They get MANUAL prices with date and source. The DTI SRP bulletin for basic necessities and prime commodities (condiments, canned fish/meat, milk, noodles) is a citable source; one dated supermarket receipt is acceptable. Prices older than 180 days are flagged.

---

## 8. Claude batch matcher (offline, one-time + incremental)

### 8.1 Why an LLM, and its limits

Pure token matching fails structurally on:
- Filipino ↔ English (needs aliases);
- state selection;
- head-noun errors;
- brand products;
- compounds;
- ambiguous heads.

Each token-level fix regresses something else. A closed-set LLM pick, cross-checked by the token matcher and verified by a human on the high-impact items, costs far less human time.

Limits:
- The LLM only proposes, with `actor = llm:claude-opus-5-5` in `ReviewEvent`.
- It chooses codes from catalogs it is given.
- Every code is validated against the DB.
- It never writes VERIFIED.

### 8.2 Pass 1: canonicalization (`llm-canonicalize.ts`, sequential)

- **Input:** nameKeys sorted by usage descending, 40 per request (~60 requests).
- **Cached system block:** rules from §5–§7 plus ~30 worked examples from the seeded top items.
- **Then:** the current canonical list (slug | displayName | top synonyms; append-only, grows per request).
- **Per item:** nameKey, usage, 2 sample `rawText` lines, and the token matcher's top-3 canonical candidates.
- **Output** (structured outputs, `client.messages.parse` + `zodOutputFormat`, `output_config: {effort: "medium", format}`; forced `tool_choice` is rejected on this model):

```json
{ "items": [ { "nameKey": "string",
    "lineKind": "INGREDIENT|COMPOUND|ALTERNATIVE|HEADER|NOISE|EQUIPMENT",
    "parts": [ { "canonicalSlug": "pork_belly", "role": "INGREDIENT|TO_TASTE|OPTIONAL|GARNISH|FRYING_MEDIUM|ALTERNATE" } ],
    "confidence": 0.0, "reason": "≤ 20 words" } ],
  "newCanonicals": [ { "slug": "^[a-z0-9_]+$", "displayName": "string", "kind": "FOOD|SEASONING|BRAND_SEASONING|OIL|WATER|NON_FOOD",
    "isAnimal": true, "fnriState": "RAW|DRIED|CANNED|SMOKED|SALTED|FERMENTED|PRODUCT|COOKED",
    "synonyms_en": ["string"], "synonyms_fil": ["string"] } ] }
```

It runs sequentially so later batches reuse slugs created earlier.

**Post-pass dedupe:** canonical pairs with the same pass-2 FNRI code *and* the same DA primary → merge suggestion in the queue.

### 8.3 Pass 2: binding (`llm-bind.ts`, Message Batches API, 50% off)

- 30 canonicals per request (~30 requests).
- **System:** rules + the full FNRI catalog as lines `code|foodName|altNames|state|kind|EP%` (~40k tokens, est.) + the DA identity catalog `key|displayName|category|priceUnit|pricedDays|median` (~5k tokens), with `cache_control` on the catalog (best-effort inside batches).
- **Output per canonical:**

```json
{ "slug": "string", "fnriFoodCode": "A001|null", "nutritionPolicy": "FNRI|PROXY|NEGLIGIBLE|UNKNOWN",
  "daIdentityKeys": ["ranked, 0-3"], "isProxy": false, "pricePolicy": "DA|DERIVED|MANUAL|NOT_COSTED|FREE",
  "confidence": 0.0, "reason": "≤ 25 words" }
```

**Validation:**
- the code must exist;
- the code's `foodKind` ≠ DISH;
- DA keys must exist;
- slugs must match the pattern;
- one retry with the error text.

Results are keyed by `custom_id`. Server-side `fallbacks` are not accepted on Batches, so any `stop_reason === "refusal"` item (not expected for food names) is re-run synchronously.

### 8.4 Cross-check → status

| LLM pick vs token matcher (top-1 / top-5) | → status / confidence |
|---|---|
| Same as token top-1, token score ≥ 0.6 | AUTO 0.90 |
| Same as token top-1, token score < 0.6 | AUTO 0.80 |
| In token top-5, not top-1 | NEEDS_REVIEW (priority ×1) |
| Outside token top-5 | NEEDS_REVIEW (priority ×2) |
| LLM: none; token ≥ 0.80 with margin ≥ 0.15 | NEEDS_REVIEW |
| LLM: none; token weaker | UNRESOLVED (policy UNKNOWN); queued if usage ≥ 3 |
| Any item with usage ≥ 10 | `mustVerify=true`: stays AUTO for the site, but the coverage badge counts it as unverified until a human verifies it |

### 8.5 Cost (claude-opus-5-5: $4 / $20 per MTok; cache reads $0.20; 5-min cache write 1.25×; Batches 50% off)

| Pass | Requests | Input | Output (incl. thinking) | ≈ Cost |
|---|---|---|---|---|
| 1 (sequential) | ~60 | ~11k each (~2k cached) ≈ 0.66 M | ~6k each ≈ 0.36 M | ≈ $10 |
| 2 (batch) | ~30 | ~50k each ≈ 1.5 M at $2 | ~6k each ≈ 0.18 M at $10 | ≈ $5 |
| Incremental (new names) | few | — | — | cents |

claude-sonnet-5-5 would cost about half. claude-haiku-5-5 would be ≈ $1, but run a 50-item side-by-side first, because Filipino culinary terms are the hard part. Human review time dominates the cost either way.

---

## 9. Matching algorithm (deterministic part)

### 9.1 nameKey → canonical cascade (first hit wins)

| Step | Method | Confidence | Status |
|---|---|---|---|
| 1 | Existing `IngredientAlias` (VERIFIED/AUTO) | stored | stored |
| 2 | `aliasHint` (parenthetical) or ambiguous-head rule (§5.3) | 0.95 / 0.90 | AUTO |
| 3 | Exact `CanonicalSynonym.term` (non-ambiguous) | 0.95 | AUTO |
| 4 | Exact after dropping STATE/BRAND tokens (kept as hints) | 0.90 | AUTO |
| 5 | `foldKey` exact | 0.85 | AUTO |
| 6 | Safe left-strip: drop leading tokens only from SAFE_MODIFIERS {native, local, imported, organic, filipino, chinese, regular, plain, pure, fresh, store-bought} | 0.85 − 0.05 per token | AUTO |
| 7 | Token score vs canonical synonyms (§9.2): ≥ 0.80 with margin ≥ 0.15 | score × 0.9 | AUTO if usage < 10, else NEEDS_REVIEW |
| 8 | LLM proposal + cross-check (§8.4) | table | table |
| 9 | Nothing | 0 | UNRESOLVED |

### 9.2 Candidate score (canonical→FNRI, canonical→DA, and step 7)

```
score(c) = max over q in {nameKey, synonyms, alias expansions} of F1(tokens(q), tokens(c.name) or tokens(each c.altName))
           × headGate × kindFactor × stateFactor × conflictFactor
```

**headGate (0 or 1).** Head = the last core token. If the phrase contains any Filipino token (from the FNRI alt-name lexicon or `fil` synonyms), the head is the first *or* last token. The gate passes if the head ∈ tokens(full candidate name ∪ alt names); for DA, the category noun is appended (e.g. "rice").
- Blocks: yellow onion → Cassava, yellow; olive oil → Olive, green, in brine; beef broth → Beef blood; star anise → Star apple; kangkong → Eel, swamp.
- Allows: chicken breast → Chicken, breast, raw.

**kindFactor:** DISH = 0 (unless the canonical kind is DISH), else 1.

**stateFactor:**
- desired = the canonical's `fnriState`;
- exact match → 1.0;
- candidate UNSPECIFIED → 0.95;
- desired RAW but candidate cooked or processed → 0.6;
- desired processed but candidate RAW → 0.5.

**conflictFactor:** BASE_FOODS = the set of FNRI `headTerm`s (auto-derived: coconut, cassava, olive, wheat, corn, soy, …). The factor is 0.5^k, minimum 0.25, where k = number of BASE_FOODS tokens in the candidate's first two segments that are absent from the query and its synonyms.
- milk → Coconut milk: 0.67 × 0.5 = 0.33, which loses to Milk, cow's at 0.50.
- all-purpose flour → Cassava 0.33 vs Wheat 0.33: a tie, so margin 0 → review. This is exactly why the canonical `flour_wheat_ap` is bound once by a human.

**Gates:**
- **AUTO:** top-1 ≥ 0.80 and margin ≥ 0.15.
- **SUGGEST:** shows the top-8 FNRI / top-5 DA candidates.
- The token scorer is only a suggestion engine. Exact lookups use nameKeys, which keep color words.

### 9.3 Daily DA price pick per canonical (date D)

```
for b in bindings ordered by rank:
    p = price(b.identity, D) ?? latest non-null price in [D-7, D)  (mark stale, staleDays)
    if p: return { phpPerGramAP: p / b.identity.gramsPerUnit, identity, date, stale, isProxy }
if pricePolicy == DERIVED: return price(derivedFrom, D) / derivedYield
if pricePolicy == MANUAL:  return manualPricePhp / (manualPriceQty in g, via unitWeights.ml for ml)
return null  (unpriced)
```

When the line unit is `piece` and `priceUnit` is PC (eggs), cost = count × price directly.

**Default rank proposal** (auto, then reviewed):
- candidates are restricted to `sizeClass ∈ {MEDIUM, null}` when such identities exist; the `sizeHint` on a line can pick another size;
- exclude proxies;
- sort by availability bucket (priced on ≥ 80% of days first), then `medianPrice` ascending. This is a budget site: the shopper's cheapest *commonly available* variant.

So "Garlic, Imported" normally ranks above "Garlic, Local", and regular-milled rice above premium. The reviewer can override.

---

## 10. Review queue and the evolution of `match-review.html`

**Priority** = `usageCount × (1 − confidence) × (disagreement ? 2 : 1) × (lineKind ∈ {HEADER, NOISE} ? 0.2 : 1)`.

**Coverage metrics** (dashboard and site):
- `nutritionCoverage` = grams of countable lines with FNRI/PROXY/CUSTOM/NEGLIGIBLE ÷ grams of countable lines. Countable excludes TO_TASTE, OPTIONAL, ALTERNATE, HEADER, NOISE and EQUIPMENT.
- `costCoverage` is defined the same way for price.

| Coverage | Badge | Value-score ranking |
|---|---|---|
| ≥ 0.9 | "good" | included |
| 0.7–0.9 | "partial" | included |
| < 0.7 | "rough" | excluded if either coverage is < 0.7 |

Also show usage-weighted status shares:

```sql
SELECT status, SUM("usageCount") uses,
       ROUND(100.0*SUM("usageCount")/SUM(SUM("usageCount")) OVER (),1) pct
FROM "IngredientAlias" GROUP BY status;
```

### v1 (≈ 1 day, no write API)

- The page reads `GET /api/review/queue?entity=alias|canonical|identity&status=NEEDS_REVIEW&limit=50&cursor=…`.
- **Response:** `{id, nameKey, usageCount, priority, samples:[{recipeId,title,rawText}], proposals:{llm:{slug,confidence,reason}, token:[{slug,score}]}, current, version}`.
- Shows the LLM vs token picks side by side.
- **Export CSV** → edit in a spreadsheet (columns: decision, slug, fnriCode, daKeys) → `scripts/import-decisions.ts`, which writes ReviewEvents.
- Keep the JSON download.

### v2 (≈ 2 days, in-page decisions)

**`POST /api/review/decide`**
- Body: `{entity, id, expectedVersion, action: ACCEPT|CHOOSE|CREATE_CANONICAL|MARK_HEADER|MARK_NOISE|MARK_EQUIPMENT|SPLIT|DEFER, payload}`.
- Auth: `Authorization: Bearer <REVIEW_TOKEN>` (Vercel env). The page asks once and keeps it in `localStorage`.
- CORS on these routes only: allow-origin = the GitHub Pages origin (not `*`), methods `POST, OPTIONS`, headers `Authorization, Content-Type`.

**Each decision is one transaction:**
1. update the entity `WHERE id AND version` (on mismatch → 409);
2. insert a ReviewEvent;
3. `updateMany ResolvedLine WHERE nameKey`, so the site updates without a rebuild.

That is ≈ 0.5–0.8 s from us-east to Tokyo.

**`POST /api/review/decide-many`:** ≤ 100 items, e.g. "accept all agreeing rows in view".

**Keyboard:**

| Key | Action |
|---|---|
| `A` | accept |
| `1`–`5` | choose candidate |
| `N` | new canonical (form prefilled from the LLM proposal) |
| `H` / `X` / `E` | header / noise / equipment |
| `S` | split |
| `→` | skip |
| `U` | undo (replays `before` from ReviewEvent) |

### v3 (optional, ≈ 2–3 days)

- **Canonical editor:**
  - FNRI panel: top-8 candidates with state/kind tags, kcal/protein/fat/carbs per 100 g and EP%;
  - DA panel: latest price, priced days out of 29, median; reorder ranks, `isProxy` toggle;
  - manual price form.
- **DA identities tab:** NEW names, merge suggestions, SUSPECT units with the price band shown.
- **Coverage dashboard:** lowest-coverage recipes first.
- **Golden-set regression:** `scripts/golden.json` with 30 hand-labelled recipes (~360 lines). Target ≥ 95% canonical accuracy and ≥ 98% lineKind/role accuracy before the site switches.

**QA sample.** After the LLM run, review 100 random AUTO aliases stratified by usage bucket.
- If the usage-weighted error rate is > 5%, the whole bucket goes to NEEDS_REVIEW.
- A 95% confidence interval at 3% observed error is roughly 1–9%: enough to catch a bad bucket.

**Normalizer changes after review has started:** run a re-key script. It recomputes each alias's nameKey from its stored sample `rawText` and updates the key, so decisions are never orphaned.

---

## 11. Serving to the site

**`GET /api/canonicals`** (~800 rows; 3 queries; `Cache-Control: s-maxage=3600, stale-while-revalidate=86400`) returns:

`{id, slug, displayName, isAnimal, nutritionPolicy, fnriFoodCode, fnriStateUsed, epPct, unitWeights, pricePolicy, price:{phpPerGramAP, source, date, stale, isProxy}}`

The price is computed at request time from the bindings and the latest commodity rows.

**`GET /api/recipes`** adds the `ResolvedLine` fields to each ingredient:

`r:[{c, role, st, mb, pg, grp}]`

`enrichRecipe` replaces the `rankMatch`/`isNonPriceable`/`ANIMAL_WORDS` calls with lookups. The vegetarian tag = no countable line whose canonical has `isAnimal`. `matcher.js` is no longer used on the live site.

---

## 12. Worked examples

Lines are representative of Panlasang Pinoy WPRM rows in the stored format (amount | unit | name, notes recovered from `rawText`); verify them against DB rows. FNRI rows are described, not coded: the exact code is picked in review. DA names in quotes come from the project facts; others are marked "(verify name)". **Prices are hypothetical.**

### Example A: Pork Adobo (servings 4)

| rawText | nameKey / kind / role | Canonical | FNRI (state) | DA binding (rank) or price policy | Method → status | Today |
|---|---|---|---|---|---|---|
| 2 lbs pork belly, cut into cubes | `pork belly` / ING / ING, basis AP | `pork_belly` (syn: liempo) | pork belly raw | Pork Liempo (verify name) #1 | SYNONYM 0.95 → VERIFIED | ok |
| 1 head garlic, crushed | `garlic` / ING | `garlic` (bawang) | garlic bulb raw, EP from FNRI | "Garlic, Imported" #1 (cheaper, ≥ 80% days), "Garlic, Local" #2 | SYNONYM 0.95 | matched, but head = 500 g |
| 1/2 cup soy sauce | `soy sauce` / ING | `soy_sauce` (toyo) | soy sauce | MANUAL ₱/L, dated | SYNONYM | no price → ₱0 |
| 1/4 cup white vinegar | `white vinegar` / ING | `vinegar_cane` (sukang puti) | vinegar | MANUAL | SYNONYM | white = stopword |
| 3 pieces dried bay leaves | `dried bay leaf` / ING | `bay_leaf_dried` (dahon ng laurel) | NEGLIGIBLE | NOT_COSTED | SYNONYM | non-priceable via substring |
| 1 tablespoon whole peppercorn | `whole peppercorn` → pepper rule | `black_pepper` | NEGLIGIBLE (~6 g/recipe) | NOT_COSTED | RULE 0.90 | — |
| 1 tsp brown sugar (optional) | `brown sugar` / ING / **OPTIONAL** | `sugar_brown` | brown sugar | "Sugar (Brown)" KG | SYNONYM | counted |
| 1 cup water | `water` | `water` | 0 | FREE | SYNONYM | "unmatched" |
| 3 tablespoons cooking oil | `cooking oil` / ING (no frying note) | `oil_cooking` | vegetable oil | "Cooking Oil (Coconut) 1 Liter/bottle", BOTTLE 920 g | SYNONYM | — |

**Oil cost:**
- 3 tbsp = 44.4 ml × 0.92 g/ml = 40.8 g.
- At a hypothetical ₱180 per bottle: ₱180 / 920 g = ₱0.196/g → **₱8.0**.
- Today: 45 g × (no per-kg match) → wrong or ₱0.

### Example B: Sinigang na Baboy (Knorr mix)

| rawText | Resolution |
|---|---|
| 2 lbs pork belly or spare ribs | ALTERNATIVE → part 0 `pork_belly` (ING), part 1 `pork_ribs` (ALTERNATE, not counted) |
| 1 bunch kangkong (water spinach) | Filipino head `kangkong`; aliasHint "water spinach"; FNRI alt name "Kangkong" → swamp cabbage/water spinach raw row (EP from FNRI matters: stems trimmed). DA: none → MANUAL or unpriced. Today: → "Eel, swamp" / "Coconut water". |
| 12 pieces string beans (sitaw), cut | aliasHint `sitaw` → `sitaw` (yardlong bean) → FNRI yardlong bean pods raw; DA "Sitao" (verify name), matched by foldKey `ao` → `aw` |
| 2 pieces eggplant, sliced | `eggplant` (talong): DA candidates ranked by availability and median price (e.g. "Eggplant 3-4 Small Bundles" — verify unit; SUSPECT until checked) |
| 3 pieces long green pepper (siling pansigang) | pepper rule `long` → `chili_long_green`; DA chili, green (verify name). Today: non-priceable (`pepper` substring). |
| 1 pack Knorr Sinigang sa Sampaloc Mix (44g) | brand `knorr`, `packageGrams=44` → `sinigang_mix` (BRAND_SEASONING), NEGLIGIBLE or CUSTOM, MANUAL ₱/pack. Today: pack = 200 g × whatever FNRI token match. |
| 2 tablespoons fish sauce | `fish_sauce` (patis) → FNRI patis; MANUAL |
| 2 quarts water | `water` (FREE; the unknown unit no longer matters) |
| Salt and pepper to taste | COMPOUND (both parts resolve) → `salt`, `black_pepper` (TO_TASTE rule) → both **TO_TASTE**, excluded |

### Example C: Edge cases from the audit list

| Name | Result |
|---|---|
| `Marinade ingredients:` | HEADER (ends with `:`). The following rows get `groupLabel` = "Marinade ingredients:". |
| `Cooking Procedure` | HEADER (lexicon, no amount) |
| `can` | NOISE (bare unit word) |
| `Aluminum foil` | EQUIPMENT |
| `45g pack Knorr Ginataang Gulay Mix` | packageGrams 45, brand knorr → nameKey `knorr ginataang gulay mix` → `ginataang_mix`. It dedupes with "Knorr Ginataang Gulay Mix". |
| `cooking oil` + note "(for frying)", 2 cups | `oil_cooking`, **FRYING_MEDIUM** (cooking layer; placeholder 10% counted) |
| `4 cups cooked rice` | `rice_cooked` (fnriState COOKED → FNRI cooked rice row, no further losses). Price DERIVED from `rice_milled_raw` ÷ 2.6 (approx.). At hypothetical ₱45/kg raw → ₱0.0173/g cooked; ≈ 640 g (approx. 160 g/cup) → ₱11.1. |
| `eggs` / `2 eggs, beaten` | `egg_chicken`. DISH rows excluded, so not "Vegetable stir-fry w/ quail eggs". DA "Chicken Egg (White, Medium) 56-60 grams/pc" → PC, 58 g. 3 eggs at hypothetical ₱8.50 = ₱25.50; nutrition uses 174 g AP × EP (≈ 88%, approx.) = 153 g. |
| `olive oil` | headGate `oil` blocks "Olive, green, in brine" → `oil_olive` |
| `beef broth` | headGate blocks "Beef blood" → `broth_beef`: NEGLIGIBLE, DERIVED from `bouillon_cube_beef` |
| `star anise` | headGate blocks "Star apple" → `star_anise`: NEGLIGIBLE, NOT_COSTED |
| `all-purpose flour` | token tie Cassava/Wheat (0.33/0.33) → review once → `flour_wheat_ap` → FNRI wheat flour all-purpose; MANUAL |
| `Knorr Pork Cube` / `Maggi Magic Sarap` / `Knorr Liquid Seasoning` | `bouillon_cube_pork` (10 g/pc) / `seasoning_granules` (8 g/sachet) / `liquid_seasoning` (PROXY = soy sauce row) |

### Example D: DA identity over days (hypothetical drift)

| Day | Raw name | Result |
|---|---|---|
| 1 | "Broccoli, Local Medium (8-10 cm diameter/bunch hd)" | Identity `broccoli, local medium (8-10 cm diameter/bunch hd)`: KG, sizeClass MEDIUM, origin LOCAL; `/bunch hd` → SUSPECT until confirmed per kg |
| 2 | Same name with a stray space before `)` | Same `normKey` → same identity (EXACT_KEY alias) |
| 9 | "…(8-10 cm diameter/bunch head)" | New key; old identity absent that day, same category; Jaccard 8/10 = 0.80 → merge suggestion (not auto, because < 0.9) → reviewer merges; bindings keep working |
| any | "Regular Milled 20-40% bran streak" under IMPORTED and LOCAL | Two identities keyed `…|imported commercial rice` and `…|local commercial rice`, once the scraper stops dropping one |

---

## 13. Effort

| Work item | Dev hours (est.) |
|---|---|
| FNRI metadata scrape + derived columns | 3–4 |
| Schema + migration | 2 |
| Normalizer, classifier, compound/alternative, ambiguous-head rules + unit tests on the top-50 names and the noise rows | 8 |
| DA identities: backfill, scraper hook, stats, merge suggestion | 4 |
| LLM passes 1 and 2: prompts, schemas, validation, cross-check | 6 |
| Resolver cascade + ResolvedLine materialization | 4 |
| Review v1 (queue API + CSV import) | 6 |
| Review v2 (decide API, auth/CORS, keyboard UI, undo) | 10 |
| Site switch (`/api/canonicals`, recipes include, `enrichRecipe` lookups, badges) | 4 |
| **Total** | **≈ 47 h** (~1.5–2 weeks part-time). v3 optional, +16 h. |

| Bucket (est.) | nameKeys | Share of line uses | Handling | Human time |
|---|---|---|---|---|
| Usage ≥ 10 | ~300 | ~70% | LLM + token, mandatory verify; ~200 canonicals bound to FNRI + DA | 300 × 20 s ≈ 1.7 h + 200 × 75 s ≈ 4.2 h |
| Usage 3–9 | ~600 | ~15% | AUTO on agreement; ~150 disagreements reviewed | ≈ 1.7 h |
| Usage 1–2 | ~1,500 | ~15% | AUTO on agreement, else UNRESOLVED; QA sample | 100 × 20 s ≈ 0.6 h |
| Pantry manual prices | ~40 canonicals | — | One dated price check | ≈ 1.5 h |
| **Total review** | | | | **≈ 10 h** |

LLM spend ≈ $15 on Opus 5.5; re-runs only for new names.

---

## 14. Approximate reference values used (all approximate; replace with label or FNRI values where they exist)

| Value | Source family |
|---|---|
| Vegetable oil density 0.92 g/ml (1 tbsp ≈ 13.6 g) | USDA household measures |
| Egg shell refuse ≈ 12% → EP ≈ 88% | USDA refuse; the FNRI EP column is authoritative |
| White rice cooked/raw mass yield ≈ 2.6 | USDA cooking yields |
| Garlic and onion EP ≈ 87–90% | USDA refuse; FNRI EP authoritative |
| Bouillon cube ≈ 10 g makes 500 ml; Magic Sarap sachet ≈ 8 g | Product labels |
| Frying-oil placeholder: 10% of the listed volume absorbed | Placeholder only; replace with food-specific uptake in the cooking-adjustment layer (USDA/Bognár yields) |
| Cooking losses | Downstream: USDA Retention Factors Release 6 and Bognár 2002, with the EuroFIR/INFOODS recipe procedure (raw ingredients → yield factor → retention factor) |


**Key decisions:**
- Move matching from the browser to offline local Node scripts (npx tsx with DIRECT_URL), which persist results into mapping tables; the live site only performs lookups, and docs/matcher.js is kept as the shared candidate generator for scripts and the review page.
- Introduce a canonical-ingredient layer (~800 canonicals est.) that owns FNRI binding, ranked DA bindings, isAnimal, price/nutrition policies, and unit weights; review effort scales with canonicals, not with the 3,386 raw names.
- Canonical split rule: create a separate canonical only when the difference is observable in the data (distinct FNRI row with more than 15% kcal or protein difference, distinct DA identity, purchased processed form, or a measured-cooked state). Never split by prep words, size, or commodity-product brand.
- FNRI state rule: use the composition of the state in which recipes measure the ingredient. Default is as purchased (raw, or a purchased dried/canned/smoked/salted/fermented form); cooking losses are applied downstream via yield and retention factors. Measured-cooked canonicals (cooked rice, leftover rice, cooked noodles, cooked shredded chicken, hard-boiled eggs) bind to cooked rows, and fnriStateUsed prevents applying losses twice.
- Edible-portion basis follows recipe-writing convention: a prep word before the noun or a volume unit means EP; prep after the comma or count/whole/weight units means AP. FNRI EP% is stored on NutritionFact, with a canonical-level override.
- Line classification uses ordered rules: HEADER (trailing colon, 'for the ...', header lexicon with no amount), NOISE (bare unit words, empty), EQUIPMENT lexicon, COMPOUND (split only if every part resolves exactly), ALTERNATIVE (' or ' with first resolvable part as primary), else INGREDIENT. Rows after a header inherit groupLabel.
- Roles: TO_TASTE and OPTIONAL are excluded from totals; GARNISH is counted; ALTERNATE is never counted; FRYING_MEDIUM goes to the cooking layer, with a 10% placeholder counted until that layer exists.
- Brand rule: brand plus generic noun strips to the generic canonical; proprietary seasonings map to one BRAND_SEASONING canonical per product type (bouillon_cube_*, seasoning_granules, liquid_seasoning, sinigang_mix, ginataang_mix), with NEGLIGIBLE nutrition by default and MANUAL price. packageGrams parsed from the line overrides the flat unit table.
- Scoring adds a head-noun gate (Filipino-aware first-or-last token), DISH exclusion, a state factor (1.0/0.95/0.6/0.5), and a base-food conflict factor (0.5^k). AUTO requires top-1 score of at least 0.80 with a margin of at least 0.15; otherwise the item goes to review with the top-8 FNRI / top-5 DA candidates.
- DA identity layer: CommodityIdentity keyed by normKey(name), qualified by category when a name repeats across categories (rice); CommodityAlias maps raw daily names; parsed price basis (KG/PC/BOTTLE/PACK with gramsPerUnit); price-band SUSPECT flags; merge suggestions by Jaccard (0.6 to 0.9 goes to review, 0.9 or above with a single candidate auto-merges).
- DA variant choice: ranked bindings per canonical. The default rank is MEDIUM or unspecified size, availability bucket (priced on at least 80% of days) first, then cheapest median. The daily pick uses primary, then fallbacks with a 7-day stale window, then DERIVED (e.g. cooked rice from raw / 2.6), then MANUAL (dated, flagged after 180 days).
- Use claude-opus-5-5 offline in two closed-set passes: sequential canonicalization of nameKeys (40 per request) with a growing canonical list, then Batch API binding to FNRI/DA codes chosen from the full catalogs. Use structured outputs, validate every code against the DB, never let the LLM set VERIFIED, and resolve status by cross-checking against the token matcher. Approximate cost is US$15.
- Human verification is mandatory for usageCount of 10 or more (about the top 300 names, est. ~70% of uses) and their canonicals, plus all disagreements with usage of 3 or more, plus a 100-item stratified QA sample of AUTO decisions (if usage-weighted error exceeds 5%, the bucket is re-queued). Total is about 10 hours of review.
- match-review.html evolves in steps: v1 reads a persisted queue with LLM vs token evidence and supports a CSV import; v2 adds a token-protected POST /api/review/decide (optimistic versioning, ReviewEvent audit, ResolvedLine updateMany, keyboard UI, undo); v3 (optional) adds a canonical/DA editor, a coverage dashboard, and a golden-set regression.
- Replace the substring NON_PRICEABLE and ANIMAL_WORDS lists with canonical-level pricePolicy and isAnimal. The substring lists currently make rice, red bell pepper, garlic cloves, sausage, peeled shrimp, and cauliflower unpriceable, and make eggplant and graham-cracker recipes non-vegetarian (verified).

## SarapSulit: turning recipe quantities into grams (portion normalization)

# Quantity and unit normalization to grams

**Goal.** Turn each `RecipeIngredient` line (`amount`, `unit`, `name`, `rawText`) into two weights of one specific food:

- **`gramsAP`** (as purchased, the weight you buy). This drives cost, because DA NCR prices are for goods as sold.
- **`gramsEP`** (edible portion). This drives nutrition, because FNRI values are per 100 g E.P.

Each line also carries a **confidence**, a **method** and **flags** that record every assumption made.

**What changes compared with today's `parseQuantity`:**
- No more flat `cup = 240 g`. Volumes are converted with a density per food.
- Count units get a weight per food and per size. `head` was 500 g for everything; a head of garlic is now 40 g, a head of cabbage 900 g.
- An unknown unit no longer becomes `value × 60 g`.
- The edible portion (EP) is applied, using FNRI's own "Edible portion %" (for example, FNRI F113 Chicken, whole is 60%).
- Ranges use the midpoint. Mixed numbers like `1-1/2` are parsed correctly; today the code reads them as 1.
- "To taste", pinch and dash get small default amounts.
- When servings are missing, they are estimated and flagged.

**Scope boundary.** This layer gives the *grams of the ingredient as listed*. How much of it is actually eaten (deep-frying oil, a marinade that is thrown away, water) and what cooking does to it (yield, nutrient retention) belong to the roles and cooking design. This layer only passes those signals on as flags (`FRYING_OIL`, a water role). If that layer isn't built yet, §11 gives placeholder numbers.

---

## 1. Where it runs and file layout

| File | What it holds |
|---|---|
| `docs/portion-data.js` (new, UMD like `matcher.js`) | `UNITS`, `SIZE_WORDS`, `CLASSES`, `FOODS`, `PACKAGES`, `VAGUE`, `TRIM_MARKERS`, `NOTE_PATTERNS`, `EQUIPMENT`, `HEADERS`. Plain object literals, version-controlled, about 150 food rows to start. |
| `docs/portion.js` (new, UMD) | `SarapPortion.preParse(line)`, `normalizeLine(line, ctx)`, `resolveServings(recipe, lines)`, `scale(results, factor)`, `PORTION_VERSION`. Pure functions with no DOM, so the same file runs in the browser and in Node. |
| `docs/matcher.js` | Keeps `parseQuantity` as a thin wrapper that returns `normalizeLine(...).gramsEP`, so `match-review.html` keeps working. |
| `docs/index.html` `enrichRecipe` | Calls `preParse`, then the matcher on `cleanName`, then `normalizeLine`. Nutrition uses `gramsEP × consumedFraction`; cost uses `costGrams × pesoPerGram`. Ingredient rows show grams, flags and a confidence badge. |
| `scraper-backend` | Adds three columns to `NutritionFact` (FNRI EP%, alternate names, scientific name). `/api/recipes` must also return `rawText` and `id` per ingredient (it currently selects only `name`, `amount`, `unit`, so notes like "(for frying)" never reach the client). `/api/nutrition` must return `ediblePortion`. |

**Decision: it runs on the client, as `matcher.js` does.** About 2,770 recipes × ~12 lines ≈ 33k lines, which regex parsing handles in under 100 ms. An optional precompute table can be added later (§14).

**Per-line order of steps:**
1. `preParse`: decide what kind of line it is, split combined lines, pull out notes, size and form, extract the quantity, and produce `cleanName`.
2. Run the matcher on `cleanName` to get the FNRI food (with its EP%) and the DA commodity.
3. `normalizeLine`: resolve the food, convert to grams, apply AP/EP, compute confidence.
4. Roles layer: work out the consumed fraction.
5. Totals, then per-serving values.

---

## 2. Output contract

```ts
type UnitKind = 'mass'|'volume'|'count'|'package'|'vague'|'none';
interface PortionResult {
  ingredientId: number;
  kind: 'ingredient'|'header'|'equipment'|'noise';
  cleanName: string;            // "Knorr Ginataang Gulay Mix" (quantity, notes and size removed); the matcher input
  qty: { value: number|null; low?: number; high?: number;
         unitRaw: string|null; unit: string|null; unitKind: UnitKind;
         size?: 'small'|'medium'|'large'|'xl'|'jumbo';
         pkgSize?: { value: number; unit: 'g'|'ml' };   // from "(12 oz)", "45g pack"
         mult?: number;                                // "2 x 400 ml"
         form: string[];          // ['minced'] | ['packed'] | ...
         notes: string[] };       // ['optional','for_frying','to_taste','for_garnish','drained',...]
  foodKey: string|null;  cls: string;                  // "garlic", "bulb_root_veg"
  ml: number|null;                                     // set for volume lines
  gramsListed: number|null;                            // grams of the item as written in the line
  measuredState: 'AP'|'EP';
  epFraction: number; epSource: 'fnri'|'food'|'class'|'none';
  gramsAP: number|null;                                // as purchased (bought weight)
  gramsEP: number|null;                                // edible portion (input to FNRI per 100 g)
  costGrams: number|null;                              // grams the price applies to (§8.4)
  pieces?: number;                                     // count lines, used for per-piece DA prices (eggs)
  method: 'mass'|'volume*density'|'count*unitWeight'|'package'|'vague-default'|'implied-piece'|'none';
  confidence: number;  band: 'H'|'M'|'L';
  flags: string[];
}
```

Recipe-level output adds `servingsUsed`, `servingsSource` (`'wprm'|'estimated'|'default'`), `coverage` and `estimateQuality` (§10).

---

## 3. Step A: pre-parse

### 3.1 Line kind (runs first)

| Rule | Result |
|---|---|
| `cleanName` ends with `:`, or matches `^(for (the )?|para sa )[a-z ]+:?$` with no amount, or is one of {cooking procedure, marinade ingredients, ingredients, sauce ingredients, batter, filling, toppings, dipping sauce} with no amount | `kind:'header'`. Excluded. Flag `HEADER_ROW`. |
| `cleanName` is in `EQUIPMENT`: aluminum foil, foil, parchment/wax/baking paper, plastic/cling wrap, toothpick(s), skewer(s), kitchen twine, string, cheesecloth, cupcake liners, llanera, molds, ice pop bags, plus banana leaves and corn husks (wrappers) | `kind:'equipment'`. Excluded from nutrition. Wrappers keep an optional cost. |
| `cleanName` is empty after quantity extraction, or is just a unit word ('can', 'pack', 'pieces') | `kind:'noise'`. Excluded. |

### 3.2 Splitting and alternatives

- **Combined to-taste lines.** `^(salt|sea salt|kosher salt)\s*(and|&)\s*(ground )?(black |white )?pepper` becomes two lines, `salt` and `ground black pepper`, each with the `to_taste` note. Flag `SPLIT_LINE`. This covers 153 uses of "Salt and pepper to taste".
- **More generally**, "X and Y to taste" is split when both X and Y have `VAGUE` defaults.
- **Alternatives.** "A or B" ("pork belly or kasim", "spinach or kangkong") resolves to the first alternative that has a `FOODS` row, otherwise to A. Flag `ALT_FIRST`. The `or` inside a range ("1 or 2") is handled by the amount grammar first.

### 3.3 Notes, size, form, and the comma rule

1. **Strip notes** from `rawText` and the name, recording each one:

   | Pattern | Note / effect |
   |---|---|
   | `to taste` | `to_taste` |
   | `optional` | `optional` |
   | `for (deep[- ]?)?frying` | `for_frying` (deep or pan) |
   | `for (garnish\|topping)` | `for_garnish` |
   | `for (dipping\|serving)` | `for_dipping` |
   | `for (brushing\|greasing\|dusting\|dredging\|coating)` | `coating` |
   | `drained` | `drained` |
   | `divided` | ignored |
   | `heaping` | ×1.25 (≈) |
   | `scant` | ×0.9 (≈) |
   | `packed` / `firmly packed` | form `packed` |
   | `sifted` | form `sifted` |

2. **Size words.** `extra[- ]large|x-?large|jumbo|large|big|medium|med|small|baby`, optionally followed by `-sized`, set `size`. `big` maps to large; `baby` maps to small. Size words are removed from `cleanName`; the matcher already ignores them through its stopwords.

3. **Form words** (chopped, minced, diced, cubed, sliced, julienned, shredded, grated, crushed, mashed, ground, whole, halved, quartered, beaten, wedged) go into `form`.

4. **The comma rule** (standard recipe-writing convention). Split `cleanName` at its first comma:
   - **Head** (before the comma): modifiers there describe the food *at the moment it is measured*. "1 lb peeled shrimp" is weighed peeled; "2 cups chopped onion" is measured chopped.
   - **Tail** (after the comma): modifiers there are prep done *after* measuring. "1 lb shrimp, peeled and deveined" is weighed in the shell.
   - Only the head is used for food lookup. The tail feeds `form` and `notes`.

5. **Trim markers in the head** set `trimmedAtMeasure = true`. Markers: boneless, deboned, fillet(s), filleted, peeled, shelled, deveined, pitted, seeded, cored, trimmed, `meat` as the last word (crab meat, coconut meat), flesh, kernels, florets, `leaves`/`tops` for leafy vegetables, juice, zest, ground, minced, plus any form word.

   A subset also means the item was **bought in that form**, so `purchasedTrimmed = true`: boneless, deboned, fillet, ground (meat), crab meat, kernels, florets, and peeled/shelled shrimp.

### 3.4 Where the quantity comes from, in priority order

1. The WPRM `amount` and `unit` spans. Parse the string `S = amount + " " + unit`.
2. If `S` has a number but no unit, try the start of `name` for a unit word (`"cups water"`), or a package pattern (`"(12 oz) can coconut milk"`).
3. If the amount span is empty, parse a leading quantity from `name`, then from `rawText`. Example: `"45g pack Knorr Ginataang Gulay Mix"` gives 1 × pack of 45 g. Flag `AMOUNT_FROM_TEXT`.
   - **Guard:** only accept a leading number from the name when it is directly followed by a unit word, an attached unit (`45g`, `400ml`) or a package word. This stops `"5-spice powder"` or `"7 Up"` being read as amounts.
4. **Parenthetical sizes** count only when they are pure sizes: `\(\s*(about|approx\.?|around)?\s*NUM\s*-?\s*(g|kg|ml|l|oz|fl oz|lb)s?\.?\s*(each)?\s*\)`.
   - `"(good for 2 liters water)"` is rejected. Flag `PAREN_NOT_SIZE`.
   - If the parenthetical sits between the number and a package or count unit (`1 (12 oz) can`, `2 (13.5 oz) cans`), the size is **per unit**.
   - If it comes after the noun with about/approx, or the count is 1 (`1 whole chicken (about 3 lbs)`), it is the **total**.
   - A length in parentheses (`(2-inch)`) is only used for ginger, turmeric, lemongrass and cinnamon.

---

## 4. Step B: amount grammar

**Normalization, applied in this order:**
1. Expand unicode fractions: `½ ⅓ ⅔ ¼ ¾ ⅕ ⅖ ⅗ ⅘ ⅙ ⅚ ⅛ ⅜ ⅝ ⅞` become `1/2`, `1/3`, and so on, with a space inserted after a leading digit (`1½` → `1 1/2`).
2. `⁄` (U+2044) and `∕` (U+2215) become `/`. En and em dashes become `-`.
3. `"1 and 1/2"` becomes `1 1/2`.
4. A comma followed by exactly 3 digits is a thousands separator; any other comma between digits is a decimal point.
5. Trailing `.` on units is removed.
6. Word numbers:

   | Words | Value | Flag |
   |---|---|---|
   | a, an, one … twelve | 1 … 12 | — |
   | half, a half | 0.5 | — |
   | dozen, a dozen | 12 | — |
   | a couple | 2 | — |
   | a few, few | 3 | `AMOUNT_WORD` |
   | several | 4 | `AMOUNT_WORD` |

```js
const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)`;
const RANGE_RE = new RegExp(String.raw`^(${NUM})\s*(-|to|or)\s*(${NUM})`);
const MULT_RE  = new RegExp(String.raw`^(\d+)\s*[x×]\s*`);
function num(t){ const [w,f]=t.includes(' ')?t.split(/\s+/):[null,t];
  const v=f.includes('/')?(+f.split('/')[0]/+f.split('/')[1]):+f; return (w?+w:0)+v; }
function parseAmount(s){                       // s already normalized
  let m;
  if ((m = s.match(RANGE_RE))) { const a=num(m[1]), b=num(m[3]);
    if (m[2]==='-' && Number.isInteger(a) && b<1) return {value:a+b};          // "1-1/2" = 1.5
    if (b>a) return {value:(a+b)/2, low:a, high:b, flags:['AMOUNT_RANGE_MID']};  // "2-3" = 2.5
    return {value:a, flags:['AMOUNT_RANGE_BAD']}; }
  if ((m = s.match(new RegExp('^'+NUM)))) return {value:num(m[0])};
  return null;
}
```

| Input | Value | Rule |
|---|---|---|
| `2`, `1.5`, `1/2`, `1 1/2`, `1½`, `1-1/2`, `1 and 1/2` | 2, 1.5, 0.5, 1.5, 1.5, 1.5, 1.5 | — |
| `2-3`, `2 to 3`, `1/4 to 1/2`, `1 1/2-2`, `1 or 2` | 2.5, 2.5, 0.375, 1.75, 1.5 | **Midpoint**, the least biased estimate. Flag `AMOUNT_RANGE_MID`, confidence ×0.9. |
| `1 cup + 2 tbsp`, `1 cup plus 2 tablespoons` | Sum of both parts in grams | Each part parsed recursively. |
| `2 x 400 ml` | mult 2 × 400 ml | — |
| `a few` | 3 | `AMOUNT_WORD` |

---

## 5. Step C: unit canonicalization

**Lookup order:**
1. Case-sensitive single letters first: `T`, `Tb`, `TB` → tbsp; `t` → tsp; `C`/`c` → cup.
2. Then lowercase, strip trailing dots and `-sized`, and look up the alias.
3. Then retry without a plural ending `(e)s`.
4. If the result is a size word, set `unit='piece'` and record the size. This handles `"2" "medium" "potatoes"`.
5. If still unknown, count it in `unknownUnits` (the audit page lists these), then use the implied-piece fallback (§7.6).

**Measure units:**

| Canonical | Kind | Size | Aliases |
|---|---|---|---|
| g | mass | 1 g | g, gm, gms, gr, grs, gram(s), gramo |
| kg | mass | 1000 g | kg, kgs, kilo(s), kilogram(s) |
| mg | mass | 0.001 g | mg |
| lb | mass | 453.59 g | lb, lbs, pound(s), # |
| oz | **mass** | 28.35 g | oz, ounce(s) |
| floz | volume | 29.57 ml | fl oz, fl. oz, fluid ounce(s) |
| ml | volume | 1 ml | ml, mL, milliliter(s), millilitre(s), cc |
| l | volume | 1000 ml | l, L, liter(s), litre(s), ltr |
| cup | volume | **240 ml** | cup(s), c, C, tasa |
| tbsp | volume | 15 ml | tbsp, tbs, tbl, tblsp, T, Tb, tablespoon(s), kutsara |
| tsp | volume | 5 ml | tsp, t, teaspoon(s), kutsarita |
| quart / pint / gallon | volume | 946.4 / 473.2 / 3785 ml | qt, quart(s), pt, pint(s), gal, gallon(s) |
| pinch / dash / smidgen / drop / splash | vague | 0.31 / 0.62 / 0.16 / 0.05 / 7.5 ml | pinch, dash, smidgen, drop(s), splash |
| handful | vague | per class, §7.5 | handful |

**Count units:** piece (pc, pcs, pced, piraso), clove (butil), head (bulb, ulo), thumb, inch, knob, stalk (stem), sprig, bunch (bundle, tali), leaf, slice, strip, fillet, cube, block, bar, stick, ear (cob), link, sheet (wrapper), whole, dozen (= 12 pieces).

**Package units:** can (tin), pack (packet, pk), sachet, pouch, bottle, jar, box, envelope, bag, tetra pack, tub.

**Fixed conventions:**
- `cup = 240 ml`, `tbsp = 15 ml`, `tsp = 5 ml`. These are the FDA nutrition-labeling measures, and they keep today's cup value.
- Densities are stored in g/ml, derived as USDA grams per household measure ÷ US customary ml (cup 236.6, tbsp 14.79, tsp 4.93). So 1 cup in our system is 1.4% more than a USDA cup, which doesn't matter at this precision.
- **`oz` is always mass.** For liquids in cans, 13.5 oz read as mass is 383 g, versus about 387 g for 13.5 fl oz of coconut milk, roughly a 1% difference. Flag `OZ_AS_MASS` when the food class is a liquid.

---

## 6. Step D: food resolution

The conversion tables need a `foodKey` and a `cls` (food class). They are resolved in this order:

1. **Curated `FOODS` dictionary.** The longest `match` phrase contained in the head of `cleanName` wins, so "brown sugar" beats "sugar" and "coconut milk" beats "milk". Filipino aliases are included (bawang, sibuyas, luya, toyo, patis, itlog, manok, gata, kangkong…).
2. **Class from the matched FNRI food.** The group comes from the first letter of `foodCode`. Observed so far: A = cereals (A001 corn grits), D = vegetables (D087 garlic), F = meat and poultry (F113 chicken), G = fish and shellfish (G074 milkfish), H = eggs (H003). Confirm the full mapping once with `SELECT left("foodCode",1), count(*), min("foodName") FROM "NutritionFact" GROUP BY 1`. Refine with keyword cues: oil, sauce, powder, flour, leaves, whole fish.
3. **DA `Commodity.category`** of the matched commodity, as a weaker cue.
4. Otherwise `cls = 'unknown'`.

---

## 7. Step E: conversion to grams (`gramsListed`)

### 7.1 Mass units
`grams = value × mult × UNITS[unit].g`. Confidence factor 1.00.

### 7.2 Volume units, using a density table

`grams = value × mult × ml(unit) × density`. Density is looked up in this order:

| # | Source | Confidence factor | Flag |
|---|---|---|---|
| 1 | `FOODS[key].dens[form]` (e.g. onion `sliced`) | 0.95 if `q:'ref'`, 0.85 if `q:'approx'` | `DENSITY_FOOD` |
| 2 | `FOODS[key].dens._` (the food's default form) | same | `DENSITY_FOOD` |
| 3 | `CLASSES[cls].dens[form]`, then `CLASSES[cls].dens._` | 0.75 | `DENSITY_CLASS` |
| 4 | Keyword fallback on the name: sauce, juice, milk, broth, syrup, extract → 1.05; powder or ground → 0.50; chopped, sliced, diced, minced → 0.55; otherwise **0.80** | 0.55 | `DENSITY_DEFAULT` |

Form modifiers: `packed` uses the food's packed row if one exists; `sifted` ×0.92; `heaping` ×1.25; `scant` ×0.9 (≈).

**Class defaults (g/ml). All values are ≈ approximations from USDA household-measure families, rounded:**

| cls | Default g/ml | Form overrides | Default piece (AP) | Default EP | Examples |
|---|---|---|---|---|---|
| water | 1.00 | — | — | 1.00 | water, broth, stock, vinegar, coconut water |
| dairy_liquid | 1.03 | — | — | 1.00 | milk, coconut milk 0.96 (row), cream |
| sauce_thin | 1.10 | — | — | 1.00 | soy, fish sauce, liquid seasoning |
| sauce_thick | 1.15 | — | — | 1.00 | oyster sauce, ketchup, hoisin, bagoong |
| oil | 0.92 | — | — | 1.00 | all oils |
| fat_solid | 0.96 | — | — | 1.00 | butter, margarine, lard |
| syrup | 1.40 | — | — | 1.00 | honey 1.43, condensed milk 1.29 |
| sugar | 0.85 | packed 0.93, powdered 0.51 | — | 1.00 | white sugar, brown sugar |
| salt | 1.22 | coarse/rock/kosher 0.95 | — | 1.00 | salt |
| flour_starch | 0.53 | sifted 0.48 | — | 1.00 | flour, cornstarch 0.54, rice flour 0.67 |
| grain_dry | 0.78 | — | — | 1.00 | rice, glutinous rice |
| legume_dry | 0.85 | — | — | 1.00 | mung beans 0.87 |
| noodle_dry | 0.40 | — | pack 250 g | 1.00 | bihon, canton, macaroni 0.44 |
| spice_ground | 0.48 | — | — | 1.00 | pepper, paprika, cumin |
| spice_whole | 0.55 | — | piece 0.4 g | 1.00 | peppercorn, star anise |
| herb_dried | 0.20 | crumbled leaves 0.04 | leaf 0.2 g | 1.00 | oregano, bay leaf |
| herb_fresh | 0.25 | — | sprig 1 g, bunch 50 g | 0.85 | cilantro (wansoy), basil |
| leafy_veg | 0.24 | shredded 0.30 | bunch 250 g | 0.75 | kangkong, pechay, malunggay |
| bulb_root_veg | 0.60 | chopped 0.60, sliced 0.48, grated 0.46 | piece 100 g | 0.88 | onion, carrot, potato, radish |
| fruit_veg | 0.60 | chopped 0.63, sliced 0.45 | piece 120 g | 0.90 | tomato, eggplant, ampalaya |
| legume_fresh | 0.45 | — | piece 10 g, bundle 250 g | 0.95 | sitaw, Baguio beans |
| fruit | 0.65 | — | piece 120 g | 0.70 | saba, mango |
| poultry_bone_in | 0.60 | — | piece 110 g | 0.65 | chicken pieces |
| poultry_boneless | 0.60 | ground 0.95 | fillet 170 g | 1.00 | chicken breast fillet |
| meat_bone_in | 0.65 | — | piece 200 g | 0.70 | ribs, chops, pata, shank |
| meat_boneless | 0.65 | ground 0.95 | slice 30 g | 1.00 | pork belly, kasim, ground pork |
| fish_whole | — | — | piece 250 g | 0.55 | bangus, tilapia |
| fish_fillet | 0.60 | — | fillet 150 g | 1.00 | fillets |
| crustacean_shell | 0.60 (peeled) | — | piece 15 g | 0.55 | shrimp |
| mollusk_shell | — | — | piece 15 g | 0.30 | mussels, clams |
| squid | 0.60 | — | piece 100 g | 0.80 | squid |
| egg | 1.03 (beaten) | — | piece 58 g | 0.87 | eggs |
| processed_meat | 0.65 | — | piece 45 g | 1.00 | hotdog, longganisa, ham |
| cheese | 0.48 (shredded) | cubed 0.55 | slice 20 g, bar 165 g | 1.00 | cheese |
| nuts_seeds | 0.62 | — | — | 1.00 | peanuts, sesame 0.61 |
| seasoning_granules | 0.75 | — | sachet 8 g, cube 10 g | 1.00 | MSG, Magic Sarap, bouillon |
| canned_food | 1.00 | — | can 400 g | 1.00 | canned goods |
| wrapper_dough | — | — | sheet 10 g | 1.00 | lumpia/wonton wrappers |
| unknown | 0.80 | — | null | 1.00 | — |

The full seed rows are in §12.

### 7.3 Count units, using a unit-weight table

```js
// FOODS row (excerpt)
{ key:'onion', match:['onion','yellow onion','white onion','red onion','sibuyas'], cls:'bulb_root_veg',
  dens:{ _:0.68, chopped:0.68, sliced:0.49, minced:0.70 }, densQ:'ref',
  units:{ piece:{ g:110, basis:'EP', q:'ref', sizes:{ small:70, medium:110, large:150 } } },
  ep:0.90, epQ:'ref', src:'USDA HM; USDA refuse 10%' }
{ key:'garlic', match:['garlic','bawang'], cls:'bulb_root_veg',
  dens:{ _:0.57, minced:0.57, crushed:0.50, sliced:0.45 }, densQ:'ref',
  units:{ clove:{ g:4, basis:'AP', q:'approx' }, head:{ g:40, basis:'AP', q:'approx' }, piece:'clove', bulb:'head' },
  ep:0.87, epQ:'approx' }
```

**Rules:**
- **Unit aliases.** A string value is an alias inside that food: `piece` of garlic is a clove; `piece` of ginger is a thumb; `piece` of cabbage is a head.
- **Size.** Use `sizes[size]` when present. If the size is given but the row has no `sizes`, multiply by small 0.65, large 1.35, xl 1.6, jumbo 1.8 (USDA onion ratios: 70/110/150 g). If no size is given, use medium (`g`) and flag `SIZE_DEFAULT_MEDIUM` (×0.95).
- **`basis`** records whether the stored weight is AP (market weight; most PH rows) or EP (USDA household weights are edible portion). This feeds §8.
- **Lookup order:** food row (×0.90 if ref, ×0.80 if approx) → class default piece (×0.55) → null.
- **`dozen`** = 12 × piece. **`inch`** of ginger = 10 g/inch.

### 7.4 Packages

```
if pkgSize given:      grams = count × mult × pkgSize (ml × density)              ×0.95  PKG_EMBEDDED
elif PACKAGES row:     grams = count × row.g (or row.ml × density)               ×0.80  PKG_TABLE
else generic:          can 400 g, pack 200 g, sachet 10 g, bottle 330 ml, jar 250 g, box 250 g   ×0.45  PKG_DEFAULT
if note 'drained':     grams × 0.60 (≈)
```

For bouillon cubes, `pack` means one wrapped cube (10 g), because recipes write "1 pack Knorr cube" for a single cube.

### 7.5 Vague amounts

These are per-recipe base amounts, multiplied by `clamp(servings/4, 0.5, 3)` so they grow with recipe size. They are added only when the line has no number (or only a vague unit). Confidence for the whole line is set to 0.50. Flag `TO_TASTE_DEFAULT` or `VAGUE_DEFAULT`.

| Expression | Base amount | Grams |
|---|---|---|
| salt, to taste | ½ tsp | 3 g |
| ground black pepper, to taste | ¼ tsp | 0.6 g |
| sugar, to taste | 1 tsp | 4 g |
| fish sauce / patis, to taste | 1 tbsp | 18 g |
| soy sauce, to taste | 1 tbsp | 16 g |
| MSG / seasoning granules, to taste | ½ tsp | 2 g |
| chili flakes / labuyo, to taste | ¼ tsp or 1 piece | 0.5–1 g |
| calamansi, to taste | 2 pieces | 20 g AP |
| any other item, to taste | 1 tsp × density | flagged |
| pinch / dash / smidgen | 0.31 / 0.62 / 0.16 ml × density | salt pinch ≈ 0.38 g |
| a few drops / splash | 0.15 ml / 7.5 ml × density | — |
| handful | leafy 30 g, herbs 10 g, nuts/seeds 30 g, other 30 g (≈) | — |
| for garnish, no amount | herbs, green onion, fried garlic: 5 g; others 0 | — |
| for frying, no amount | 0 g, flag `AMOUNT_MISSING_FRYING` (roles layer decides) | — |
| optional, no amount | 0 g, flag `OPTIONAL` | — |
| "some", "as needed", other no-amount lines | 0 g, `AMOUNT_MISSING` (not invented) | — |

Optional ingredients *with* an amount are included and flagged `OPTIONAL`.

### 7.6 No unit

If a number is present and the food has a `piece` weight (row or class), treat it as pieces: "3 eggs", "2 onions", "1 Knorr Pork Cube". Confidence ×0.90, flag `UNIT_IMPLIED_PIECE`.

Otherwise `gramsListed = null`. The line is **excluded**, flagged `UNCONVERTED`, and counted against coverage. The old `value × 60` guess is never used; it turned "1 whole chicken" into 60 g.

---

## 8. Step F: as purchased (AP) vs edible portion (EP)

FNRI values are per 100 g E.P., and FNRI publishes an EP% for each food (seen this session: F113 Chicken, whole 60%; G074 Milkfish/bangus, fresh 65%; H003 Chicken egg, whole, raw 87%; H004 boiled 89%). FNRI EP reflects Philippine market forms (head-on shrimp, dressed chicken), which are the same forms DA prices. That makes FNRI EP the preferred source. This step mirrors the edible-portion step of the EuroFIR / FAO-INFOODS recipe-calculation procedure: raw weights, then edible portion, then yield and retention (the last two belong to the cooking design).

### 8.1 Measured state

| Condition | `measuredState` |
|---|---|
| Volume unit (cup, tbsp…): food is measured prepped | EP |
| `trimmedAtMeasure` (trim marker in the head, §3.3) | EP |
| Count or package unit whose weight row has `basis:'EP'` (USDA onion, bell pepper) | EP |
| Processed or packaged classes (oil, sauce, sugar, flour, canned, seasoning, dairy) | EP (no refuse) |
| Mass or count unit on a whole or untrimmed item, including prep in the tail ("2 lbs chicken, cut into serving pieces", "1 lb shrimp, peeled") | AP |

### 8.2 EP fraction source

The fraction is clamped to [0.20, 1.00].

1. **FNRI `ediblePortion`** of the matched FNRI food, if it is between 1 and 100. Factor 0.95, flag `EP_FNRI`.
   - **Guard:** only use it when the FNRI food is the same physical form as the recipe item. Example: if "garlic" matched D087 "garlic leaves and bulb" (EP 67%), that is a matcher error to fix in the alias list, not a reason to use 67%. The audit page shows EP alongside the match.
2. `FOODS[key].ep`, per cut where defined (chicken thigh 0.80). Factor 0.90, flag `EP_TABLE`.
3. `CLASSES[cls].ep`. Factor 0.80, flag `EP_CLASS`.
4. If the class has no refuse, use 1.00 with factor 1.00.

### 8.3 Formulas

```
AP state: gramsAP = gramsListed;  gramsEP = gramsListed × ep;     confidence ×= epFactor
EP state: gramsEP = gramsListed;  gramsAP = purchasedTrimmed ? gramsListed : gramsListed / ep
```

### 8.4 Cost grams

`costGrams = gramsAP`, so you pay for the bones and peel you buy.

When the measured state is EP from kitchen prep ("1 cup chopped onion" = 163 g EP), cost uses 163 / 0.90 = 181 g AP.

When it is EP because the item is bought trimmed (boneless, ground, fillet), cost uses the EP grams. The price layer may flag `PRICE_FORM_MISMATCH` if the DA commodity is the untrimmed form.

---

## 9. Step G: servings

1. **`servingsUsed`** = `Recipe.servings` if between 1 and 24 (`servingsSource:'wprm'`). Note: the scraper's `parseInt` stores the low end of a range ("4-6" → 4). Optional: store `servingsText` and use the midpoint.
2. **Missing or 0:**
   - Compute `bodyEP` = Σ `gramsEP` excluding water/broth/stock, frying oil, to-taste defaults, garnish, and lines under 5 g.
   - `servingsEst = clamp(round(bodyEP / R), 1, 12)`, with `R = 250 g` as a placeholder.
   - **Calibrate R** from the data profile: R = median of `bodyEP/servings` over recipes that do have servings (by category if one exists). Flag `SERVINGS_ESTIMATED`; per-serving confidence ×0.6.
   - If `bodyEP` cannot be computed (coverage under 50%), fall back to 4 (`'default'`, `SERVINGS_DEFAULT`).
3. **Sanity check.** If `bodyEP/servingsUsed` is under 75 g or over 1,000 g, flag `SERVINGS_SUSPECT` but keep the WPRM value. Example: "24 pieces" of lumpia, where a serving is actually one piece. Optional: scrape `.wprm-recipe-servings-unit` to label it "per piece".
4. **Scaling.** For a viewer-chosen N servings, `factor = N / servingsUsed`, and every gram field is multiplied (to-taste defaults recomputed with the new servings, which is linear inside the clamp). Displayed counts round to 0.5. Per-serving cost uses fractional packages. An optional shopping list rounds packages up.
5. Per serving = Σ line value / `servingsUsed`.

---

## 10. Confidence, flags and recipe quality

**Line confidence** is the product of the step factors. The amount factor is 1.00 if explicit, 0.90 for a range, 0.95 if parsed from text, 0.70 for word amounts. The conversion factor comes from §7, and the EP factor from §8.

**Bands:** **H** ≥ 0.85, **M** 0.60–0.85, **L** < 0.60. The UI shows a dot on each ingredient row; the tooltip lists the flags in plain words, e.g. "assumed medium onion (110 g)".

**Flag vocabulary:**
`AMOUNT_RANGE_MID, AMOUNT_RANGE_BAD, AMOUNT_FROM_TEXT, AMOUNT_WORD, AMOUNT_MISSING, AMOUNT_MISSING_FRYING, UNIT_IMPLIED_PIECE, UNIT_UNKNOWN, OZ_AS_MASS, DENSITY_FOOD, DENSITY_CLASS, DENSITY_DEFAULT, UNITWT_FOOD, UNITWT_CLASS, SIZE_DEFAULT_MEDIUM, PKG_EMBEDDED, PKG_TABLE, PKG_DEFAULT, PAREN_NOT_SIZE, EP_FNRI, EP_TABLE, EP_CLASS, PURCHASED_TRIMMED, TO_TASTE_DEFAULT, VAGUE_DEFAULT, OPTIONAL, FRYING_OIL, SPLIT_LINE, ALT_FIRST, HEADER_ROW, EQUIPMENT_ROW, NOISE_ROW, UNCONVERTED, SERVINGS_ESTIMATED, SERVINGS_DEFAULT, SERVINGS_SUSPECT`.

**Recipe level:**
- `coverage` = converted lines / eligible lines (excluding header, equipment, noise and water).
- `estimateQuality` = kcal-weighted mean confidence for nutrition, and a ₱-weighted mean for cost.
  - **High**: quality ≥ 0.85 and coverage ≥ 0.90.
  - **Medium**: quality ≥ 0.65 and coverage ≥ 0.75.
  - **Low**: otherwise.

**Improvement loop:** on `match-review.html`, rank (foodKey or cleanName, unit) pairs by Σ kcal × (1 − confidence) across all recipes. Each round, add the top 20 as `FOODS` or `PACKAGES` rows.

---

## 11. Hooks for cost and roles (interfaces only)

**DA price basis.** Parse once per commodity name:

| Pattern | Basis | Price per gram | Example |
|---|---|---|---|
| default | per kg | P / 1000 | — |
| `(\d+)\s*-\s*(\d+)\s*grams?\s*/\s*pc` | per piece, mid-weight | P / mid; for count lines use `pieces × P` directly | Egg medium 56–60 g/pc → 58 g |
| `(\d+(\.\d+)?)\s*(liter\|l\|ml)\s*/\s*bottle` | per bottle of V ml | P / (V × density) | Coconut oil 1 L → P/920 per g |
| Grade descriptors ("3-4 Small Bundles", "8-10 cm diameter/bunch hd") | per kg, flag `DA_UNIT_UNVERIFIED` | P / 1000 | See open questions |

**Frying oil placeholders (≈), until the roles/cooking design replaces them.** For `for_frying` lines with an amount:

| Case | Nutrition fraction | Cost fraction |
|---|---|---|
| Listed volume ≥ 120 ml, or "deep" (deep frying) | 0.15 of listed oil | 0.33 (oil reused) |
| Pan frying | 0.50 | 1.00 |

Water and plain ice: grams are computed but contribute 0 kcal and ₱0 (role non-nutritive).

---

## 12. Seed data rows

Source legend:
- **U** = USDA SR Legacy household measure, from memory; spot-check in FoodData Central.
- **U✓** = cross-checked this session against USDA-derived listings.
- **F✓** = FNRI value seen this session.
- **DA** = from the DA commodity name.
- **L** = product label size (verify on pack).
- **≈** = my approximation from PH market or culinary convention.

All ≈ rows get `q:'approx'`.

### 12.1 The audit's top ingredients by recipe uses

| Ingredient (uses) | foodKey / cls | g/ml (forms) | Count / package units → g (basis) | EP | Src |
|---|---|---|---|---|---|
| cooking oil (1063), olive oil (119), sesame oil (84) | oil / oil | 0.92 | — (DA "1 Liter/bottle" is price basis only) | 1 | U✓ 218 g/cup |
| water (910) | water / water | 1.00 | — | 1 | definition |
| garlic (821) | garlic / bulb_root_veg | minced 0.57, crushed 0.50, sliced 0.45 | clove 4 g AP; head 40 g AP; piece→clove | 0.87 | U density; ≈ clove/head (USDA clove 3 g EP; imported cloves larger); U refuse 13% |
| salt (627) | salt / salt | 1.22; coarse/rock/kosher 0.95 | — | 1 | U 6 g/tsp; ≈ coarse |
| ground black pepper (611) | pepper_ground / spice_ground | 0.47 | — | 1 | U 2.3 g/tsp |
| onion (443), medium yellow onion (181) | onion / bulb_root_veg | chopped 0.68, sliced 0.49, minced 0.70 | piece S 70 / M 110 / L 150 g **EP** | 0.90 | U |
| soy sauce (397) | soy_sauce / sauce_thin | 1.08 | — | 1 | U✓ 16 g/tbsp |
| butter (236) | butter / fat_solid | 0.96 | stick 113 g; pat 5 g | 1 | U |
| all-purpose flour (207) | flour_ap / flour_starch | 0.53; sifted 0.48 | — | 1 | U 125 g/cup |
| fish sauce (192) | fish_sauce / sauce_thin | 1.22 | — | 1 | U✓ 18 g/tbsp |
| eggs (182), egg (107) | egg / egg | beaten 1.03 | piece S 53 / **M 58** / L 63 / XL 68 g AP; yolk 17 g EP; white 33 g EP | 0.87 | DA (M 56–60 g/pc); ≈ other sizes; F✓ H003 |
| cornstarch (172) | cornstarch / flour_starch | 0.54 | — | 1 | U 8 g/tbsp |
| brown sugar (161) | sugar_brown / sugar | 0.85 (unpacked default); packed 0.93 | — | 1 | ≈ default; U 220 g/cup packed |
| granulated white sugar (159) | sugar_white / sugar | 0.85 | — | 1 | U 200 g/cup |
| Salt and pepper to taste (153) | split into salt + pepper | §7.5 | — | — | rule |
| ginger (140) | ginger / bulb_root_veg | minced, grated, sliced, julienned 0.41 | thumb 15 g AP; inch 10 g AP; knob 30 g AP; slice 2 g; piece→thumb | 0.90 | U density; ≈ units and EP |
| white vinegar (138) | vinegar / water | 1.01 | — | 1 | U 14.9 g/tbsp |
| dried bay leaves (132) | bay_leaf / herb_dried | crumbled 0.04 | leaf/piece 0.2 g | 1 | U (0.6 g/tbsp crumbled); ≈ leaf |
| oyster sauce (132) | oyster_sauce / sauce_thick | 1.22 | — | 1 | U✓ (secondary) 18 g/tbsp |
| carrot (127) | carrot / bulb_root_veg | chopped 0.54, grated/julienne 0.46 | piece S 60 / M 100 / L 150 g AP | 0.88 | U density; ≈ PH sizes (USDA US medium 61 g); U refuse 11% |
| whole peppercorn (121) | peppercorn / spice_whole | 0.58 | — | 1 | ≈ |
| chicken (111) | chicken_bone_in / poultry_bone_in | — | whole 1,200 g; serving piece 110; drumstick 110; thigh 130; wing 90; breast half 280 (all AP) | FNRI row (F113 whole 60%), else by cut: whole 0.60, drumstick 0.70, thigh 0.80, wing 0.55, breast 0.80 | F✓; ≈ weights and cuts |
| pork belly (108) | pork_belly / meat_boneless | cubed 0.65 | slice 30 g | FNRI row, else 1.0 | ≈ |
| red bell pepper (107) | bell_pepper / fruit_veg | chopped 0.63, sliced 0.39 | piece S 74 / M 119 / L 164 g **EP** | 0.82 | U |
| coconut milk (104) | coconut_milk / dairy_liquid | 0.96 | can 400 ml | 1 | U (canned 226 g/cup); L |
| ground pork (99) | ground_pork / meat_boneless | 0.95 | — | 1 (bought trimmed) | ≈ |
| chicken broth (94), beef broth (91) | broth / water | 1.00 | can 411 g (14.5 oz); carton 946 ml; cube → bouillon row | 1 | U; L |
| shrimp (88) | shrimp / crustacean_shell | peeled 0.60 | piece M 15 / L 25 / jumbo 40 g AP | FNRI row, else head-on 0.55, headless 0.85 | ≈ |
| Knorr Liquid Seasoning (69) | liquid_seasoning / sauce_thin | 1.15 | — | 1 | ≈ |
| Knorr Pork Cube (66) and other cubes | bouillon_cube / seasoning_granules | — | cube/piece/pack 10 g | 1 | L (verify) |
| Maggi Magic Sarap (41) | magic_sarap / seasoning_granules | 0.70 (MSG 0.80) | sachet/pack 8 g | 1 | L (verify); ≈ density |

### 12.2 Filipino staples (second seed batch)

| Item | g/ml | Units → g (AP unless noted) | EP | Src |
|---|---|---|---|---|
| tomato (kamatis) | chopped 0.76 | S 70 / M 100 / L 150 | 0.95 | U density; ≈ PH sizes (US medium 123 g) |
| potato | cubed 0.63 | S 100 / M 170 / L 250 | 0.85 | U; ≈ |
| eggplant (talong) | cubed 0.35 | piece 120 | 0.90 | U; ≈ |
| kangkong | chopped 0.24 | bunch/tali 250; stalk 10 | FNRI, else 0.65 | U (water spinach); ≈ |
| pechay / bok choy | shredded 0.30 | bunch 250; piece 150; baby 60 | 0.90 | U; ≈ |
| malunggay | leaves 0.09 | bunch 100 (on stem); sprig 10 | 0.35 on stem; 1.0 if "leaves" | U (moringa); ≈ |
| sitaw | cut 0.45 | pod/piece 10; bundle 250 | 0.95 | ≈ |
| siling haba / labuyo | — | piece 8 / 1 | 0.90 / 0.95 | ≈ |
| calamansi | juice 1.03 | piece 10 (about 3.5 g juice) | juice yield 0.35 | U (lemon juice); ≈ |
| green onion | chopped 0.42 | stalk 15; bunch 100 | 0.90 | U; ≈ |
| cabbage | chopped 0.38, shredded 0.30 | head 900; leaf 25 | 0.85 | U (about 908 g medium head); ≈ |
| kalabasa | cubed 0.49 | whole 1,500; slice/wedge 200 | 0.75 | U (pumpkin); ≈ |
| ampalaya / sayote / labanos | sliced 0.40 / cubed 0.56 / sliced 0.49 | piece 200 / 250 / 300 | 0.85 / 0.85 / 0.90 | U density; ≈ |
| gabi / okra / saba | — | piece 70 / 12 / 100 | 0.85 / 0.90 / 0.70 | ≈ |
| bangus | — | piece M 450 (2–3 pcs/kg); slice 120 | FNRI G074 0.65 | F✓; ≈ weight |
| tilapia / galunggong | — | piece 250 / 70 | FNRI, else 0.55 / 0.60 | ≈ |
| squid / tahong | 0.60 peeled | piece 100 / 15 | 0.80 / FNRI, else 0.30 | ≈ |
| tokwa (firm tofu) | cubed 0.55 | block/piece 200 | 1 | ≈ |
| hotdog / longganisa | — | piece 45 (jumbo 60) / 40 | 1 | ≈ |
| lumpia wrapper | — | sheet/piece 10 | 1 | ≈ |
| rice, glutinous rice (uncooked) | 0.78 | — | 1 | U 185 g/cup (cooked 0.67, handed to cooking design) |
| evaporated / condensed milk | 1.065 / 1.29 | can 370 ml / 300 ml (PH) | 1 | U; L |
| tomato sauce / tomato paste | 1.04 / 1.10 | can or pouch 227 g / can 170 g | 1 | U; ≈ |
| lemongrass / star anise / cinnamon stick | — | stalk 20 / piece 0.4 / piece 2.5 | 1 | ≈ |
| cheese (quickmelt/cheddar) | shredded 0.48 | slice 20; bar 165 | 1 | U; L |

### 12.3 Packages (`PACKAGES`)

| Product pattern | Unit | Size | Src |
|---|---|---|---|
| coconut milk or cream | can | 400 ml | L (PH; US 13.5 fl oz) |
| evaporated milk | can | 370 ml (PH) or 354 ml (US 12 fl oz) | L |
| condensed milk | can | 300 ml ≈ 387 g (PH) or 397 g (US 14 oz) | L / ≈ |
| corned beef / tuna / sardines | can | 150 / 155 / 155 g | ≈ PH common sizes |
| chickpeas / beans / corn kernels | can | 425 g (15 oz); drained ×0.6 | L / ≈ |
| cream of mushroom | can | 298 g (10.5 oz) | L |
| all-purpose cream | pack / box / can | 250 ml | L |
| liver spread | can | 85 g | ≈ |
| seasoning mix (sinigang, ginataang gulay, kare-kare, menudo, caldereta) | pack / sachet | 40 g; an embedded "(Ng)" wins | ≈ (verify labels) |
| gelatin / gulaman | pack | 25 g | ≈ |
| noodles: bihon / canton / sotanghon / spaghetti | pack | 227 / 227 / 100 / 500 g (generic 250 g) | ≈ |
| beer | bottle / can | 330 ml | ≈ |

---

## 13. Worked examples

Recipe lines below are representative of the Panlasang Pinoy WPRM cards; check them against the DB rows when implementing. "Old" is today's `parseQuantity`.

### Example 1: Chicken Adobo (WPRM servings = 4)

| # | amount / unit / name | Parse and method | gramsAP | EP | gramsEP | Conf. | Old g |
|---|---|---|---|---|---|---|---|
| 1 | 2 / lbs / chicken, cut into serving pieces | mass 2 × 453.59; tail prep, so AP | 907.2 | 0.60 FNRI F113 | **544.3** | 0.95 H | 907 |
| 2 | 3 / pieces / dried bay leaves | count × leaf 0.2 g (≈) | 0.6 | 1 | 0.6 | 0.80 M | 150 |
| 3 | 4 / tablespoons / soy sauce | 60 ml × 1.08 | 64.8 | 1 | 64.8 | 0.95 H | 60 |
| 4 | 2 / tablespoons / white vinegar | 30 ml × 1.01 | 30.3 | 1 | 30.3 | 0.95 H | 30 |
| 5 | 1 / head / garlic, crushed | head 40 g AP (≈) | 40 | 0.87 table | 34.8 | 0.72 M | **500** |
| 6 | 1 1/2 / cups / water | 360 ml × 1.00 (role water: 0 kcal, ₱0) | 360 | 1 | 360 | 0.95 | 360 |
| 7 | 3 / tablespoons / cooking oil | 45 ml × 0.92 (sauté, fully counted) | 41.4 | 1 | 41.4 | 0.95 H | 45 |
| 8 | 1 / teaspoon / granulated white sugar (optional) | 5 ml × 0.85, `OPTIONAL` | 4.3 | 1 | 4.3 | 0.95 H | 5 |
| 9 | 1/4 / teaspoon / salt | 1.25 ml × 1.22 | 1.5 | 1 | 1.5 | 0.95 H | 1.25 |
| 10 | 1 / teaspoon / whole peppercorn | 5 ml × 0.58 (≈) | 2.9 | 1 | 2.9 | 0.85 H | 5 |

**Results:**
- Body EP (excluding water) = **724.9 g**, so **181 g per serving**.
- Chicken energy at FNRI F113's 215 kcal/100 g EP:
  - New: 544.3 g → 1,170 kcal, **293 kcal per serving**.
  - Old: 907 g → 1,950 kcal (488 per serving). That overstates by 67%, because the bones were counted as food.
- Garlic:
  - Old: 500 g ≈ 745 kcal at about 1.5 kcal/g (≈, USDA raw garlic).
  - New: 34.8 g ≈ 52 kcal.
- Bay leaves (if matched): the old 150 g of dried leaves would have added hundreds of phantom kcal.
- Cost uses 907 g AP × the DA chicken price per gram. Garlic cost uses 40 g × the "Garlic, Imported" price per gram.
- Recipe quality: about 0.94 (kcal-weighted), coverage 10/10 → **High**.

### Example 2: Sinigang na Baboy (WPRM servings = 6), plus scaling and missing servings

| # | amount / unit / name | Parse and method | gramsAP | EP | gramsEP | Conf. | Old g |
|---|---|---|---|---|---|---|---|
| 1 | 2 / lbs / pork belly, sliced | mass; boneless class | 907.2 | 1.00 (FNRI EP once scraped) | 907.2 | 1.00 H | 907 |
| 2 | 1 / bunch / kangkong | bunch 250 g (≈) | 250 | 0.65 (≈; FNRI once scraped) | 162.5 | 0.72 M | 200 |
| 3 | 2 / pieces / tomatoes, quartered | 2 × M 100 g, `SIZE_DEFAULT_MEDIUM` | 200 | 0.95 | 190 | 0.68 M | 100 |
| 4 | 1 / piece / radish (labanos), sliced | 300 g (≈) | 300 | 0.90 | 270 | 0.68 M | 50 |
| 5 | 12 / pieces / string beans (sitaw), cut into 2-inch lengths | 12 × 10 g; "2-inch" is in the tail, so ignored | 120 | 0.95 | 114 | 0.72 M | **600** |
| 6 | 2 / pieces / long green pepper (siling haba) | 2 × 8 g | 16 | 0.90 | 14.4 | 0.72 M | 100 |
| 7 | 1 / piece / onion, wedged | M 110 g **EP** row, so AP = 110 / 0.90 | 122.2 | — | 110 | 0.86 H | 50 |
| 8 | 2 / quarts / water | 1,892.7 ml × 1.00 (role water) | 1,892.7 | 1 | 1,892.7 | 0.95 | 120 (unknown unit × 60) |
| 9 | 1 / pack / sinigang mix (good for 2 liters water) | `PAREN_NOT_SIZE`; `PACKAGES` row 40 g | 40 | 1 | 40 | 0.80 M | 200 |
| 10 | 2 to 3 / tablespoons / fish sauce | midpoint 2.5 × 15 ml × 1.22, `AMOUNT_RANGE_MID` | 45.8 | 1 | 45.8 | 0.86 H | 30 (low end) |
| 11 | 1 / piece / eggplant, sliced | 120 g (≈) | 120 | 0.90 | 108 | 0.68 M | 50 |
| 12 | – / – / Salt and pepper to taste | `SPLIT_LINE`: salt 3 g × 1.5 (6/4); pepper 0.6 g × 1.5 | 4.5 + 0.9 | 1 | 5.4 | 0.50 L | null |

**Results:**
- Body EP = **1,967.3 g**, so **328 g per serving**. The pork line dominates energy, so kcal-weighted quality is at least 0.95 → **High**, even though half the vegetable lines are M.
- Cost for the mix and fish sauce is missing (DA does not list them; SM is out of scope). That is flagged and lowers cost coverage.

**Scaling to 3 servings:** factor 0.5. Pork 453.6 g AP, kangkong ½ bunch (125 g AP), mix ½ pack (20 g). Salt is recomputed with servings 3: 3 g × 0.75 = 2.25 g, still linear. Per-serving values are unchanged.

**If servings were missing**, with placeholder R = 250 g:
- Adobo: 724.9 / 250 = 2.9 → **3** (WPRM says 4).
- Sinigang: 1,967.3 / 250 = 7.9 → **8** (WPRM says 6).

Both are flagged `SERVINGS_ESTIMATED` with confidence ×0.6. The two recipes' real ratios (181 g and 328 g) show why R must be calibrated from the servings distribution in the data profile.

### Example 3: one line per tricky pattern

| amount / unit / name | Result |
|---|---|
| 1 / (13.5 oz) can / coconut milk | `PKG_EMBEDDED` + `OZ_AS_MASS`: 13.5 × 28.35 = **382.7 g** (0.95). Without the size: `PACKAGES` 400 ml × 0.96 = 384 g (0.80). |
| – / – / 45g pack Knorr Ginataang Gulay Mix | `AMOUNT_FROM_TEXT`: 1 × 45 g = **45 g** (0.90). `cleanName` "Knorr Ginataang Gulay Mix" also removes the duplicate name for the matcher. |
| 3 / – / eggs | `UNIT_IMPLIED_PIECE`, size M: 3 × 58 = 174 g AP → × 0.87 (FNRI H003) = **151.4 g EP** (0.73). Cost = 3 × DA price per piece. |
| 1 / piece / milkfish (bangus), cleaned and sliced | 450 g AP (≈) × 0.65 (FNRI G074) = **292.5 g EP** (0.72). Cost uses 450 g × DA milkfish price per gram. |
| 1 / thumb / ginger, julienned | 15 g AP × 0.90 = **13.5 g EP** (0.72). Old: unknown unit → 60 g. |
| 2 / cups / cooking oil (for deep frying) | Listed 480 ml × 0.92 = 441.6 g, `FRYING_OIL`. Roles placeholder: nutrition 66.2 g (×0.15), cost 145.7 g (×0.33). Old: 480 g ≈ 4,240 kcal counted as eaten. |
| 1 / cup / all-purpose flour | 240 × 0.53 = **127 g**. Old: 240 g, nearly double. |
| ½ / cup / brown sugar | ½ → 0.5: 120 ml × 0.85 = **102 g** (0.85; packed would give 112 g). |
| 2 / medium / potatoes, cubed | Size word in the unit field → piece, M: 2 × 170 = 340 g AP → × 0.85 = **289 g EP** (0.65). |
| 1 / whole / chicken (about 3 lbs) | Total parenthetical beats unit weight: 1,360.8 g AP × 0.60 = **816.5 g EP** (0.90). Old: 60 g. |
| 1-1/2 / cups / water | Mixed number: **1.5 cups**. Old split on "-" → 1. |
| 2 / pieces / Knorr Pork Cube | 2 × 10 g = **20 g** (0.80). |
| 1 / pinch / salt | 0.31 ml × 1.22 = **0.38 g**. |
| – / – / Cooking Procedure; 1 / – / can; – / – / Aluminum foil | header / noise / equipment. All excluded. |

---

## 14. Schema, scraper and API changes

```prisma
model NutritionFact {
  // ...existing fields
  ediblePortion  Float?   // FNRI "Edible portion" in percent (0–100)
  alternateNames String?  // FNRI "Alternate/Common name(s)", e.g. "Mais, durog, puti" (also useful for matcher aliases)
  scientificName String?
}
// optional
model Recipe { /* ... */ servingsText String?  servingsUnit String? }
```

**FNRI backfill.** The data is static, so run it **once locally with Node** rather than on Vercel.
- Get EP%, alternate names and scientific name from the directory/listing rows, or from each `/fct/library/report/{id}` page (those pages show "Edible portion: NN%").
- At a 1 s polite delay, 1,542 pages take about 26 minutes locally. On Vercel it would need the `ScrapingLog.cursor` resume pattern instead.
- Write with **4 statements instead of 1,542**:

```ts
for (const chunk of chunks(rows, 500)) {
  const values = Prisma.join(chunk.map(r =>
    Prisma.sql`(${r.foodCode}::text, ${r.ep}::float8, ${r.alt}::text, ${r.sci}::text)`));
  await prisma.$executeRaw`UPDATE "NutritionFact" AS n
    SET "ediblePortion" = v.ep, "alternateNames" = v.alt, "scientificName" = v.sci
    FROM (VALUES ${values}) AS v(code, ep, alt, sci) WHERE n."foodCode" = v.code`;
}
```

**API changes:**
- `/api/recipes`: add `id` and `rawText` to the ingredient `select`. Notes like "(for frying)" and "optional" only exist in `rawText`.
- `/api/nutrition`: add `ediblePortion` (and `alternateNames`) to the `select`.

**Optional precompute** (only if client-side parsing becomes slow, or the backend needs the grams):
- Add a `RecipeIngredientPortion` table: `ingredientId @id`, `cleanName`, `kind`, `value`, `unit`, `gramsAP`, `gramsEP`, `costGrams`, `method`, `confidence`, `flags String[]`, `version`, with a back-relation on `RecipeIngredient`.
- Fill it from a Node script that `require`s `docs/portion.js`: `deleteMany({ where: { version: { lt: V } } })`, then `createMany` in chunks of 1,000. That is about 33 round trips, well under the Tokyo latency budget.

---

## 15. Implementation plan and tests

| Phase | Work | Size |
|---|---|---|
| 1 | `portion-data.js` (units, classes, the §12.1 rows, packages, vague defaults) and `portion.js` (pre-parse, grammar, conversions, flags). Replace `parseQuantity` in `enrichRecipe`. Show grams, band and flags in ingredient rows and on `match-review.html`. | 1–2 days |
| 2 | FNRI EP / alternate names backfill, schema migration, API `select` additions. EP step switches from class/table to FNRI. | 1 day |
| 3 | Servings resolver; calibrate R and tune the alias and note lists from the data profile; recipe quality badge. | 0.5 day |
| 4 (optional) | The §12.2 staples rows, the improvement-loop ranking, the precompute table. | ongoing |
| 5 (optional) | Claude batch for the long tail (below). | 0.5 day |

**Tests.** `docs/portion.test.js`, run with `node`, no framework. About 80 fixture lines covering every row of §4 and §13 Example 3, plus Examples 1–2.
- Pass criteria: exact-unit lines within ±2%, density lines ±5%, count/package lines ±15%; every expected flag present.
- After the data profile: at least 95% of lines for the top-50 ingredients convert with confidence ≥ 0.6, and under 3% of eligible lines are `UNCONVERTED`.

**Optional Claude batch for the long tail.**
- Input: the (cleanName, unit) pairs that still fall to `DENSITY_DEFAULT`, `UNITWT_CLASS`, `PKG_DEFAULT` or `UNCONVERTED` after phases 1–3. Likely a few hundred of the 3,386 unique names.
- Model: `claude-opus-5-5` via the **Message Batches API** (asynchronous, half price), with **structured outputs** (`output_config.format` JSON schema: `foodKey`, `cls`, `gPerUnit`, `basis`, `gPerMl`, `epFraction`, `confidence`, `rationale`). Batch about 25 pairs per request and include the §12 rows as reference.
- Rough cost: under $10, likely around $5 batched.
- Merge rows as `q:'approx', src:'llm-reviewed'`, but only after a human spot-checks the top 50 by usage. Never call it at page load.

---

## 16. Sources and approximation notes

- **FNRI EP values** (F113 chicken whole 60%; G074 bangus 65%, G075 broiled 71%, G183 tinapa 65%; H003 egg raw 87%, H004 boiled 89%; D087 garlic leaves and bulb 67%) come from FNRI PhilFCT record pages surfaced by web search. The FNRI site itself would not resolve from this environment, so re-read them during the backfill: [FNRI record](https://i.fnri.dost.gov.ph/fct/library/report/3820), [FNRI record](https://i.fnri.dost.gov.ph/fct/library/report/4054), [FNRI record](https://i.fnri.dost.gov.ph/fct/library/report/4055), [FNRI record](https://i.fnri.dost.gov.ph/fct/library/report/4215), [FNRI record](https://i.fnri.dost.gov.ph/fct/library/report/3366).
- **Household measures cross-checked** (secondary USDA-derived listings): fish sauce 18 g/tbsp ([UH Hospitals, USDA fish sauce](https://www.uhhospitals.org/health-information/health-and-wellness-library/article/nutritionfacts-v1/sauce-fish-ready-to-serve-1-tbsp)); oyster sauce 18 g/tbsp ([UH Hospitals, oyster sauce](https://www.uhhospitals.org/health-information/health-and-wellness-library/article/nutritionfacts-v1/sauce-oyster-ready-to-serve-1-tbsp), [ReciPal](https://www.recipal.com/ingredients/1304-nutrition-facts-calories-protein-carbs-fat-sauce-oyster-ready-to-serve)); soy sauce 16 g/tbsp ([NutritionValue](https://www.nutritionvalue.org/Soy_sauce_41420300_nutritional_value.html)); oil 218 g/cup ([UH Hospitals, oil 1 cup](https://www.uhhospitals.org/health-information/health-and-wellness-library/article/nutritionfacts-v1/usda-commodity-food-oil-vegetable-soybean-refined-1-cup)).
- **All other "U" values** are USDA SR Legacy household measures and refuse percentages from memory, and are approximate. Spot-check the top 30 in FoodData Central during phase 1.
- **"≈" values** are my estimates from PH market sizes and culinary convention.
- **"L" values** are label sizes to verify on the pack.
- **FAO/INFOODS** (Density Database v2; Guidelines for Converting Units, Denominators and Expressions) is the fallback reference for densities USDA lacks.
- **EuroFIR recipe calculation** is the template for the AP → EP → yield → retention order. Yield and retention (USDA retention factors Release 6, USDA cooking yields, Bognár 2002) belong to the cooking design, not this layer.


**Key decisions:**
- Two weights per line: gramsAP (as purchased) drives cost against DA as-sold prices, and gramsEP (edible portion) drives nutrition against FNRI per-100 g E.P. values. costGrams = gramsAP, except for items bought already trimmed (boneless, ground, fillet, peeled shrimp).
- The portion layer runs on the client as a shared UMD module (docs/portion.js + docs/portion-data.js), like matcher.js. About 33k lines parse in under 100 ms. A precomputed DB table is optional.
- Fixed volumes: cup = 240 ml, tbsp = 15 ml, tsp = 5 ml (FDA labeling). Densities are stored in g/ml, derived from USDA household measures. 'oz' is always mass; 'fl oz' is volume.
- Volume-to-mass density lookup order: food row by form, then food default, then class default (35 classes), then a keyword fallback, then a global 0.80 g/ml. Each step lowers confidence.
- Count units use per-food unit-weight rows with S/M/L sizes and an AP/EP basis. When size is missing it defaults to medium (flagged). Size ratios 0.65/1.0/1.35 apply when a row has no sizes.
- Ranges use the midpoint ('2-3' becomes 2.5). '1-1/2' is a mixed number (1.5), not a range. Sums ('1 cup + 2 tbsp') and multipliers ('2 x 400 ml') are supported.
- A parenthetical size only counts when it is a pure size. Between the number and a unit it is per unit; after the noun, or with a count of 1, it is the total. '(good for 2 liters water)' is rejected.
- Comma rule for AP/EP: modifiers before the first comma describe the food when measured (EP if they are trim or prep words); prep after the comma happens after measuring (AP).
- EP fraction priority: FNRI ediblePortion of the matched food (when it is the same physical form), then the food row, then the class default. Clamped to 0.20-1.00. The FNRI EP%, alternate names and scientific name get scraped into new NutritionFact columns.
- An unknown unit without a known piece weight gives null (excluded and counted against coverage). The old value x 60 g fallback is removed.
- 'To taste' gets small per-recipe defaults (salt 3 g, pepper 0.6 g, fish sauce 18 g...) scaled by clamp(servings/4, 0.5, 3), at confidence 0.5. 'Salt and pepper to taste' is split into two lines.
- Missing servings: estimate = clamp(round(bodyEP / R), 1, 12). R starts at 250 g and is calibrated from the data profile. WPRM servings are kept but flagged as suspect when per-serving body mass is under 75 g or over 1,000 g.
- Line confidence is the product of step factors, with bands H >= 0.85, M 0.60-0.85, L < 0.60. Recipe quality is the kcal-weighted (and peso-weighted) mean plus a coverage figure, shown as a High/Medium/Low badge.
- DA price basis is parsed from the commodity name: per kg by default, per piece for 'NN-NN grams/pc' (eggs, 58 g), per bottle for '1 Liter/bottle', converted to price per gram with density.
- /api/recipes must start returning ingredient rawText and id (notes like '(for frying)' exist only there), and /api/nutrition must return ediblePortion.
- Frying oil, marinade and water consumption belong to the roles/cooking design. Until it exists, placeholders apply: deep-fry oil counts 0.15 for nutrition and 0.33 for cost.
- The optional long-tail table filling uses claude-opus-5-5 via the Message Batches API with structured outputs, about 25 pairs per request, under $10, with human review before merging. It never runs at page load.

## Cooking-method transformations for SarapSulit: an "as eaten" model for each ingredient line (consumption fraction, nutrition basis, cost fraction)

# Cooking-method transformations: what is actually eaten

**Scope.** This design covers how cooking changes per-serving **nutrition** and, separately, **cost**, for the 2,770 Panlasang Pinoy (PP) recipes. It does not cover unit/density parsing, servings cleanup or matcher fixes, which are other workstreams. Where this design depends on them, it names the hook.

**Ground truth from the repo (read-only review):**
- `docs/index.html` `enrichRecipe()` multiplies every matched line by its full parsed grams.
- `/api/recipes` returns only `name, amount, unit`. It sends no ids, no `rawText` and no instructions. Ingredient order is also not guaranteed, because there is no `orderBy`.
- `/api/recipes/[id]` returns `rawText` plus instructions, but its ingredients are not ordered either.
- `recipe-scraper.ts` stores `rawText = $(li).text()`. That text already contains the WPRM notes span, so notes such as "(for frying)" can be recovered now. WPRM group names (`.wprm-recipe-group-name`) are not captured.
- `NutritionFact` has no sodium field. As a result, salt, brine and marinade fractions affect nothing visible today (see Phase C).

---

## 0. Decisions in one screen

1. **Each ingredient line gets one annotation, computed offline by rules.** It holds:
   - `role`
   - `method`, used for retention
   - `qty` state (raw, cooked or dry)
   - `ep`, the edible-portion factor
   - `nf`, the consumption fraction
   - `ff`, the fat factor
   - `cf`, the cost fraction
   - optional absolute `eatenG`/`costG`
   - `conf` and the `rules` that fired

   The client only multiplies. All detection logic lives in one shared UMD module, `docs/cooking-rules.js`, used the same way as `matcher.js`. Node uses it to annotate and the audit page uses it to explain.
2. **Frying oil, coatings and discarded marinades are computed from the food, not from the listed amount.** The formula is consumed = min(listed, rate × weight of the food being fried or marinated). A badly parsed "3 cups oil" or "1 head garlic" therefore cannot inflate the result. If 1 L of frying oil goes in and 400 g of fish comes out, about 20 g counts.
3. **Nutrition and cost use different bases.** Nutrition uses the edible grams actually eaten. Cost uses the as-purchased grams you pay for: bones, unabsorbed oil, removed bay leaves and discarded marinade are all paid for. The one exception is frying oil, which is assumed to be reused (cost = max(absorbed, ⅓ of listed)).
4. **When uncertain, count the line in full (nf = 1)**, with three deliberate exceptions:
   - aromatics that are removed count as 0;
   - "optional" and "for serving" items are excluded and shown as add-ons;
   - any oil of 200 g or more is never counted in full without evidence that the oil stays in the dish.
5. **Retention factors: yes, but coarse.** One small table of method × food group for vitamin C, B1, B2 and vitamin A, plus minerals only for boiled-and-drained food. That is about 40 numbers and 20 lines of code. **No** per-food USDA mapping.
6. **Reduction changes nothing.** We sum ingredients and divide by servings, never per 100 g of finished dish, so no yield factors are needed.
7. **Prefer an FNRI row in the same state as the recipe quantity.** For example, use the raw row for raw pork. If FNRI only has the other state, convert with a small yield table (cooked rice ÷ 2.8). Never apply cooking adjustments on top of an FNRI row that is already "fried" or "prep".
8. **The LLM is optional and only gives a second opinion.** It picks enum roles for low-confidence recipes and never outputs numbers. All numbers come from the tables below.

---

## 1. The model

### 1.1 Terms
| Term | Meaning |
|---|---|
| `G_AP` | grams as purchased/listed, from `parseQuantity` (unit workstream) |
| `ep` | edible-portion factor. It is 1 for boneless, peeled, fillet or ground items; T5 gives the defaults; it should be replaced by FNRI "Edible portion %" once that is stored |
| `nf` | **consumption fraction**: the share of edible grams that ends up eaten within the recipe's stated servings |
| `eatenG` | absolute eaten grams, used when the listed amount is unknown, e.g. "cooking oil for frying" with no amount |
| `ff` | **fat factor**: the share of the line's fat that remains, used for rendering, draining and skimming |
| `R_n` | retention factor for nutrient n (T12) |
| `qty` | **nutrition basis of the quantity**: `raw`, `cooked` or `dry`. Matched against the FNRI row state (raw, cooked/prepared or dry, parsed from `foodName`) |
| `cf` / `costG` | **cost fraction** of `G_AP`, or absolute cost grams |

### 1.2 Formula (per line, then Σ ÷ servings)
```
G_eat   = eatenG ?? (G_AP × ep × nf)
B       = 1                         if qty == rowState
        = 1 / Y                     if qty == cooked and row is raw/dry      (Y from T10)
        = Y                         if qty == raw/dry and row is cooked      (avoid by matcher preference)
N_n     = row_n × G_eat/100 × B × R_n(method, group, rowState)    // R = 1 when the FNRI row is already cooked
fat     = fat × ff ;  kcal -= 9 × row_fat × G_eat/100 × B × (1 − ff)
cost    = price_per_g × (costG ?? G_AP × cf)                       // never multiplied by ep
```
`row` is the matched FNRI row, or a synthetic profile (`profile: 'bone_broth'`, T6).

### 1.3 Nutrition basis rules
- **FNRI row state.** Use a regex on `foodName`:
  - `/\b(boiled|fried|steamed|roasted|grilled|broiled|baked|cooked|stewed|sauteed|cnd|canned|prep|w\/)\b/` gives **cooked/prepared**;
  - `/\b(dried|dehydrated|powder|flour|dry)\b/` gives **dry**;
  - anything else is **raw**.

  The exact FNRI abbreviations still need to be confirmed against the 1,542 names (open question).
- **Matcher hook (small change in `rankMatch` callers).** When the line is `qty=raw`, multiply the confidence of cooked/prepared candidates by 0.7, and exclude `prep`/`w/` dishes entirely. This also kills `eggs → Vegetable stir-fry w/ quail eggs`. When the line is `qty=cooked` (rice, noodles), prefer cooked rows.

---

## 2. Data structures

### 2.1 Prisma (one new table, one JSON column, two optional columns)
```prisma
model RecipeIngredient {
  // …existing fields…
  groupName String?            // Phase B (optional): .wprm-recipe-group-name
  notes     String?            // Phase B (optional): .wprm-recipe-ingredient-notes
  cooking   IngredientCooking?
}

model IngredientCooking {
  ingredientId Int     @id
  ingredient   RecipeIngredient @relation(fields: [ingredientId], references: [id], onDelete: Cascade)
  recipeId     Int
  role         String   // see 2.2
  fate         String?  // eaten|reduced|basted|discarded|removed|extracted
  method       String   // raw|brief|saute|soup|boil_drain|braise|fry|grill|steam|bake
  qty          String   @default("raw")   // raw|cooked|dry
  ep           Float    @default(1)
  nf           Float    @default(1)
  eatenG       Float?
  ff           Float    @default(1)
  cf           Float    @default(1)
  costG        Float?
  friedTarget  Boolean  @default(false)
  profile      String?  // 'bone_broth'
  conf         String   // high|medium|low
  rules        String   // "N2,M1,O2,T1:shellfish/battered"
  gramsSeen    Float?   // G_AP the annotator used (drift check vs client parse)
  version      Int
  @@index([recipeId])
}

model Recipe { /* … */ cookingMeta Json? }  // {methods:[…], primary, flags:["X1",…], version}
```
**Writes.** Use `deleteMany()` then `createMany()` in chunks of 2,000 rows. With 15 columns that is 30k bind parameters, under the Postgres limit of 65,535. About 33k lines means about 17 statements, which takes seconds even from us-east to Tokyo. Run the annotator **locally** (`npx tsx scripts/annotate-cooking.ts`, add `tsx` as a dev dependency) so the Vercel 60 s limit does not apply. A chunked route can be added later if needed.

### 2.2 Role enum
`main` · `cooking_fat` · `frying_medium` · `coating` · `batter` · `marinade` · `cooking_liquid` · `bone_extract` · `souring` · `aromatic` · `garnish` · `dip` · `optional` · `serving_side` · `cleaning` · `noise`

Bone-in meat stays `main` with `ep < 1`.

### 2.3 API shape
In `/api/recipes`, add `orderBy: {id: 'asc'}` and the ingredient `id`. Add a compact `a` object **only when the annotation is not the default**. The default is main, nf=ep=ff=cf=1, method = recipe primary.
```json
{"id":91234,"name":"cooking oil","amount":"3","unit":"cups",
 "a":{"r":"frying_medium","m":"fry","nf":0.0504,"cf":0.333,"c":"m","k":"N2,O2"}}
```
At roughly 30% non-default lines × 60 B, this adds about 600 KB raw, about 80 KB gzipped. Add `cookingMeta.primary` per recipe.

### 2.4 Shared module API (`docs/cooking-rules.js`, UMD, global `SarapCooking`)
```js
SarapCooking.VERSION = 1;
SarapCooking.annotateRecipe(recipe, { parseQuantity, tokenize })   // Node + audit page
  // recipe = {title, ingredients:[{id,rawText,name,amount,unit,groupName?}], instructions:[{stepNumber,text}]}
  // → { meta:{methods, primary, flags}, lines: {[id]: Ann} }
SarapCooking.retention(method, group, rowState)   // → {vitaminC, vitaminB1, vitaminB2, vitaminA, calcium, iron}
SarapCooking.BONE_BROTH, UPTAKE, PICKUP, EP_DEFAULTS, FAT_FACTOR, RETENTION, OIL_USES
```
**Client apply** (replaces the body of the nutrition and cost block in `enrichRecipe`):
```js
const a = { r:'main', m: meta.primary, q:'raw', ep:1, nf:1, ff:1, cf:1, ...(ing.a || {}) };
const gEat = a.eatenG ?? (gAP || 0) * a.ep * a.nf;
const src  = a.profile === 'bone_broth' ? SarapCooking.BONE_BROTH : food;
if (src && gEat > 0) {
  const f = gEat / 100 * basis(a.q, src);                       // T10
  const R = SarapCooking.retention(a.m, groupOf(src, ing), rowState(src));
  const fat0 = (src.fat || 0) * f, fatGone = fat0 * (1 - a.ff);
  totals.calories += (src.calories || 0) * f - 9 * fatGone;
  totals.fat      += fat0 - fatGone;
  totals.protein  += (src.protein || 0) * f;   totals.carbs += (src.carbohydrates || 0) * f;
  totals.fiber    += (src.fiber || 0) * f;
  totals.vitaminC += (src.vitaminC || 0) * f * R.vitaminC;  totals.vitaminA += (src.vitaminA || 0) * f * R.vitaminA;
  totals.iron     += (src.iron || 0) * f * R.iron;          totals.calcium  += (src.calcium || 0) * f * R.calcium;
}
const gCost = a.costG ?? (gAP || 0) * a.cf;          // AP grams: bones and unabsorbed oil are paid for
if (com && com.price != null && gCost) lineCost = com.price / 1000 * gCost;
```
**Food group** (`groupOf`): use the FNRI `foodCode` letter prefix once the mapping is verified. Until then use a lexicon: `ANIMAL_WORDS` gives animal; rice, noodle, flour, bread, pasta and oats give grain; beans, monggo and garbanzos give legume; everything else is veg. Fats, sugars and condiments get R = 1.

---

## 3. Pipeline
1. **Annotator (local, about 30 s).**
   - Load recipes with ingredients ordered by `id` (nested create inserts in array order, so id order should equal card order; verify on 5 recipes) and instructions ordered by `stepNumber`.
   - Run `annotateRecipe` and write `IngredientCooking` plus `cookingMeta`.
   - Print role counts, guard hits, and a CSV of the 50 recipes whose kcal per serving changed most.
2. **Re-run triggers:** the rules version, the unit tables in `matcher.js`, or a re-scrape. Fractions are stored as ratios and `gramsSeen` is kept, so the audit page can flag drift.
3. **Client:** applies annotations as in 2.4. UI changes:
   - each ingredient row shows "eaten ≈ X g" and a reason badge, e.g. "5% of frying oil absorbed", "removed before serving", "optional (+45 kcal)";
   - the recipe shows "Adjusted for cooking (confidence: medium)";
   - optional "As listed" toggle.
4. **Audit (`match-review.html`):** add a Cooking tab with the role distribution, low-confidence lines, guard hits and top kcal deltas, plus a JSON download.

---

## 4. Detection

### 4.1 Signals and availability
| Signal | Available | How |
|---|---|---|
| Notes in `rawText` | **now** | `notes = rawText` minus the first occurrences of `amount`, `unit` and `name`, then trim `,()-` and spaces |
| Inline header rows ("Marinade ingredients:", "Cooking Procedure") | **now** | rule H1 below; opens an *inferred* group |
| Instruction verbs and objects | **now** (DB has them; annotator reads directly) | sentence split on `[.;!?]`, keep step index |
| Title keywords | **now** | lexicons in M-rules |
| WPRM group headers ("For the marinade", "Dipping sauce") | **Phase B (optional)** | scraper: iterate `.wprm-recipe-ingredient-group`, read `.wprm-recipe-group-name`, store `groupName` and `.wprm-recipe-ingredient-notes` → `notes`; backfill by re-fetching (≈2,770 × 1.5 s ≈ 70 min of polite crawl in 4-recipe chunks) and matching `li` order |

**Line keys for instruction matching.** Use the `tokenize(name)` head tokens plus aliases, plus role synonyms: oil→"oil|mantika"; flour/cornstarch; marinade→"marinade|mixture"; tamarind→"tamarind|sampalok|sampaloc"; bay→"bay leaves|laurel". A sentence "mentions" a line if it contains any of the line's keys.

### 4.2 Precedence
**H > N > G(scraped) > I > G(inferred) > L > D.** Fate modifiers are layered on top of the role and always apply: marinade fate (I5), skim (I10), render/drain (I11), oil "leaving N tbsp" (O5). Every rule that fires is recorded in `rules`. Confidence is the confidence of the rule that set the numbers.

### 4.3 Recipe-level method detection (M-rules)
| ID | Method | Detect (regex on instruction sentences / title) |
|---|---|---|
| M1 | deep_fry | `/deep[- ]?fr(y|ied|ying)|deep fryer|enough oil to (cover|submerge)|fry in batches/` or (`/fry/` + `/until (golden|crisp)/` + `/paper towel|drain/`), or any N2 note |
| M2 | pan_fry | `/pan[- ]?fr(y|ied|ying)|fry (both|each|the other) sides?|per side|\bflip\b/` |
| M3 | saute | `/saut[eé]|stir[- ]?fr|gisa|ginisa/` or (`/(heat|cook)/` + `/garlic|onion/` + `/(soft|fragrant|translucent)/`) |
| M4 | soup | eaten liquids (water+broth+stock+rice wash+coconut water) ≥ 900 g with `/boil|simmer/` and no I9 discard-all; or title `/sinigang|tinola|nilaga|bulalo|sopas|batchoy|mami|lomi|molo|arroz caldo|lugaw|goto|pochero|binakol|soup|sabaw/` |
| M5 | braise | `/simmer|stew|braise|cover and cook|until (tender|the sauce thickens)/` with liquids 120–900 g; or title `/adobo|kaldereta|caldereta|mechado|menudo|afritada|kare-?kare|pinakbet|laing|ginataan|humba|estofado|paksiw/` |
| M6 | boil_drain | `/blanch|parboil|boil[^.]*then drain|drain (the )?water|discard (the )?(water|liquid)/` |
| M7 | grill | `/grill|ihaw|inihaw|broil|barbecue|skewer|char/` |
| M8 | steam | `/\bsteam(er|ed|ing)?\b/` excluding "steamed rice" |
| M9 | bake | `/bake|oven|preheat/` |
| M10 | raw | none of the above, or title `/kinilaw|ensalada|salad|shake|juice/` |

- **Line method** is the method of the first sentence that mentions the line and matches an M regex. Fried targets always get `fry`. Garnish lines get `raw`. Lines added in the last step with `/turn off the heat|before serving/` get `brief` (optional nicety).
- **Primary method**, used for unmentioned lines: the first one present in this order: soup > braise > steam > saute > pan_fry > deep_fry > grill > bake > boil_drain > raw.

### 4.4 Line rules
| ID | Detect | Role → fate | Nutrition | Cost | Conf |
|---|---|---|---|---|---|
| H1 | `amount` & `unit` null AND (name ends `:` OR `/ingredients?:?$/i` OR `/^(for )?(the )?(marinade|sauce|dipping sauce|dip|batter|breading|coating|garnish|toppings?|filling|broth|soup|dough|glaze|slurry)\b.{0,15}:?$/i`) | noise; opens inferred group | 0 | 0 | high |
| H2 | name in EQUIPMENT (`aluminum foil, parchment, wax paper, skewers, toothpicks, twine, cheesecloth, llanera, mold`, bare `can/pack/pc`, `Cooking Procedure`) | noise | 0 | 0 | high |
| N1 | notes `/\boptional\b/` | optional (add-on) | 0 (UI shows "+kcal") | 0 (UI shows "+₱") | high |
| N2 | notes `/for (deep[- ]?)?fry(ing)?|to fry/` | frying_medium | T1 uptake | T13 | high |
| N3 | notes `/for (dredging|coating|dusting|breading|rolling)/` | coating | T2 pickup | 1 | high |
| N4 | notes `/garnish|for topping|to top/` | garnish | 1 if amount given, else 0 g | 1 | high |
| N5 | notes `/for serving|to serve|on the side|serve with/` | serving_side. Exceptions: calamansi, lemon or lime go to 0.5; sauces go to dip | 0 / 0.5 / 0.4 | 0 / 1 / 1 | high |
| N6 | notes `/for dipping|dipping/` | dip | 0.4 | 1 | high |
| N7 | notes `/for (the )?marinade|for marinating|to marinate/` | marinade | T3 | 1 | high |
| N8 | notes `/for (boiling|blanching|soaking|brining)/` | cooking_liquid, discarded | T11 | 1 | high |
| N9 | notes `/for (greasing|brushing)/` → 0.3; `/for basting/` → 0.6 | partial | 0.3 / 0.6 | 1 | medium |
| N10 | notes `/for (cleaning|washing|rubbing)/` | cleaning | 0 | 1 | high |
| N11 | name/notes `/\b(cooked|steamed|leftover|day[- ]old)\b/` on a grain or noodle | qty=cooked | T10 | 1 | high |
| N12 | name/notes `/bone[- ]?in|with bones?|shank|buto|spare ?ribs|oxtail|pata|hock|whole (chicken|fish)|serving pieces|head[- ]on|on the cob/` | main + ep | T5 | 1 | medium |
| N13 | name `/\bbones?\b|carcass|neck bones/` with no meat-cut word | bone_extract | T6 profile | 1 | medium |
| G1 | group `/marinade|marinat|timpla/` | marinade | T3 | 1 | high (scraped) / medium (inferred) |
| G2 | group `/dipping|sawsawan|\bdip\b|liver sauce/` | dip | 0.4 | 1 | high / medium |
| G3 | group `/batter/` | batter | 0.8 | 1 | medium |
| G4 | group `/breading|coating|dredg|crumb/` | coating | T2 | 1 | high / medium |
| G5 | group `/frying/` | frying_medium | T1 | T13 | high |
| G6 | group `/garnish|topping/` | garnish | 1 | 1 | high |
| G7 | group `/for serving|to serve|side/` | serving_side | 0 | 0 | high |
| G8 | group `/sauce|glaze|gravy|slurry|soup|broth|stock|filling|dough|base/` | main (explicitly kept) | 1 | 1 | high |
| G9 | group `/boil|parboil|brine|curing|to boil/` | cooking_liquid, discarded | T11 | 1 | high |
| L1 | water, ice, rice wash | main or cooking_liquid (0 kcal either way) | 0 kcal | 0 | high |
| L2 | AROMATICS (T8) by **name**, not rawText ("3 cloves garlic" is garlic) | aromatic, removed | T8 | 1 | medium |
| L3 | souring agents (T7) | souring | T7 | 1 | low–medium |
| L4 | `steamed rice` / `cooked rice` with no instruction that cooks or adds it | serving_side | 0 | 0 | medium |
| L5 | brand mixes and cubes (Knorr, Maggi, sinigang mix, gravy mix) | main, dissolved | 1 | 1 | high |
| D1 | nothing matched | main, eaten | 1 | 1 | medium |

**Instruction rules (I-rules).** "S" is a sentence that mentions the line.
| ID | Pattern | Effect | Conf |
|---|---|---|---|
| I1 | S matches M1 and mentions a food line ("deep fry the pork") | that line `friedTarget`; oil line → O2 | high |
| I2 | S matches M2 and mentions a food line | `friedTarget`, pan-fry | high |
| I3 | `/(dredge|coat|dust|roll|dip)[^.]*\b(in|with)\b[^.]*(flour|cornstarch|breadcrumbs?|panko|crumbs|crackers|egg)/` | named lines → coating; class per T2 (flour/cornstarch = dredge, egg = wash, crumbs = crumbs); the object of the verb → `friedTarget` | high |
| I3x | `/(dissolve|mix|combine)[^.]*(cornstarch|flour)[^.]*water|slurry|to thicken/` | cornstarch or flour → main 1.0 (overrides I3) | high |
| I4 | `/(drain|remove|pour (out|off))[^.]*(excess )?(oil|fat)/` after a sauté of ground meat | ground meat ff 0.75 (T4); after sauté oil, cooking_fat nf 0.7 | medium |
| I5a | `/(pour|add|put[- ]?in|return|combine)[^.]*(remaining |reserved )?marinade|reserve (the )?marinade|marinade[^.]*(boil|simmer|reduce)/` | marinade fate reduced → 1.0 | high |
| I5b | `/(baste|brush)[^.]*marinade|marinade[^.]*(baste|basting)/` | marinade fate basted → 0.6 | medium |
| I5c | `/discard[^.]*marinade|(remove|drain|take)[^.]*from (the )?marinade|pat[^.]*dry|shake off/` | marinade fate discarded → T3 pickup | medium |
| I5d | (tocino, tapa) `/(cook|simmer)[^.]*(water)[^.]*(evaporat|dries)/` with cured meat | cure 1.0 | medium |
| I5m | marinade membership: lines mentioned in `/marinat(e|ing)|marinade|(combine|mix)[^.]*(refrigerat|overnight|\d+\s*(min|hour))/` other than the meat (the meat line → `marinatedTarget`) | role marinade (if no N or G) | medium |
| I7 | `/(discard|remove|take out|fish out)[^.]*(bay leaves?|laurel|lemongrass|tanglad|pandan|star anise|cinnamon|ginger slices|peppercorns?|spices|tamarind|sampalo[ck]|bones)/` | named lines removed (aromatic 0; souring T7 "removed whole") | high |
| I8 | `/(mash|squeeze|press)[^.]*(tamarind|sampalo[ck]|guava|bayabas|batwan|batuan)|strain[^.]*(tamarind|sampalo[ck]|broth|liquid)/` | souring "mashed/strained" (T7) | medium |
| I9 | `/(discard|throw (away|out)|drain)[^.]*(water|liquid|broth)|boil[^.]*then drain|parboil|blanch/` | lines first mentioned in that boiling step become cooking_liquid discarded (T11). Veg blanched → method boil_drain | medium |
| I9b | line mentioned in a discarded-liquid step **and** in an eaten step (e.g., salt boiled with pork, then rubbed on it) | nf 0.5 | low |
| I10 | `/skim[^.]*(fat|oil)|remove[^.]*(fat|oil)[^.]*(top|surface|floating)/` | simmered meat lines ff 0.85 | low |
| I10b | `/skim|remove[^.]*(scum|impurities|froth)/` with no fat/oil | **no change** (recorded) | high |
| I11 | `/render/` + `/(drain|discard|pour off|remove)[^.]*(fat|oil|drippings)/` | ff per T4; render without drain → 1.0 | medium |
| I12 | `/reduce|until (the )?(sauce|liquid) (thickens|reduces)|evaporat/` | **no nutrient change** (recorded) | high |
| I13 | `/(wash|rinse|cook)[^.]*rice|add[^.]*rice[^.]*(water|broth)|(boil|simmer)[^.]*rice/` | rice qty raw. Title `/fried rice|sinangag/` or text "cooked/leftover rice" → cooked | medium |
| I14 | `/serve[^.]*(with|alongside|over)[^.]*(rice|sauce|dip|vinegar|bagoong)/` | a listed line named here → serving_side (rice) or dip (sauces) | medium |

**Oil resolution (O-rules).** Thresholds are in today's parser grams (cup = 240). 200 g also tolerates a later density fix (≈218 g/cup).
| ID | Condition | Result | Conf |
|---|---|---|---|
| O1 | N2 or G5 | frying_medium | high |
| O2 | M1 present and oil line ≥ 60 g or amount null | frying_medium. With several oil lines, the largest is the medium and the others are cooking_fat | high/medium |
| O3 | M2 and oil 45–200 g | frying_medium with T1 rates (pan-fry uses the same rates) | medium |
| O3b | M2 and oil < 45 g | cooking_fat nf 0.8 | medium |
| O4 | M3 only and oil < 120 g | cooking_fat 1.0 | high |
| O5 | `/leaving (about )?(\d+) (tbsp|tablespoons?)|reserve (\d+) tablespoons? (of )?(the )?oil/` | frying_medium consumed = absorbed + N × 15 g (cap listed) | medium |
| O6 | no method evidence | < 60 g → cooking_fat 1.0 (medium); 60–200 g → cooking_fat 0.7 (low); ≥ 200 g → frying_medium with fallback absorption (low) | — |
| O7 | N9 greasing/brushing | 0.3 | medium |
| O8 | baking evidence (M9) and oil mentioned in `/(combine|mix|whisk)/` with flour, eggs or sugar | main 1.0 (it is in the batter) | high |

**Fried targets when none are named:** all `main` lines whose name matches T1 classes (ANIMAL_WORDS, tofu/tokwa, egg, potato/kamote/cassava/saba/banana, wrapper/lumpia), excluding sauce/dip groups. For roll and fritter titles (`/lumpia|shanghai|turon|okoy|ukoy|maruya|bunuelo|donut|cascaron|karioka|kwek|tokneneng|camote cue|banana cue/`), all `main` lines except sauce/dip become targets with the roll or fritter rate. **Uptake class:** `battered` if the recipe has any coating or batter line or the name says breaded/battered; `dredged` if it has only dry dredge lines; otherwise `bare`.

---

## 5. Number tables
≈ marks an approximate value; sources are in §10. Ranges are shown in parentheses; the default is the first number.

### T1. Oil uptake, as % of the fried target's raw edible weight. Consumed oil = min(listed, Σ target × rate)
| Target class | bare | dry-dredged | battered/breaded | conf |
|---|---|---|---|---|
| Meat pieces (chicken, pork chop, beef) | 3 (2–5) | 6 (4–8) | 12 (8–18) | medium |
| Fatty pork (belly/liempo, pata, skin, bagnet) | 4 (2–6) + T4 ff | — | — | low |
| Fish (whole, steaks, fillets, daing, tuyo) | 5 (3–8) | 7 (5–10) | 12 (10–20) | medium |
| Shrimp, squid | 5 (3–8) | 8 (6–10) | 15 (10–20) | medium |
| Tofu / tokwa | 10 (8–15) | 12 | 15 | medium |
| Eggs (boiled then fried; kwek-kwek) | 3 | — | 15 | low |
| Thick tuber/plantain pieces (potato, kamote, cassava, saba) | 10 (6–15) | — | — | medium |
| Thin chips / crisps | 30 (25–40) | — | — | medium |
| Rolls: lumpia, turon (wrapper + filling weight) | 12 (8–18) | — | — | low |
| Fritters & doughs (okoy, maruya, buñuelos, donuts, cascaron, karioka); % of all batter + filling | 20 (15–30) | — | — | low |
| Garlic/shallot fried for topping | 30 | — | — | low |
| Noodles/vermicelli fried crisp | 25 | — | — | low |

**Fallback when target grams are unknown:** deep-fry nf = 0.10 of the listed oil, pan-fry nf = 0.35 (low). If the oil amount is null, `eatenG` = absorbed grams.

### T2. Coating pickup, as % of the fried target's raw edible weight. Consumed = min(listed, pickup × target), split pro-rata within a class
| Coating | pickup | conf |
|---|---|---|
| Dry predust/dredge: flour, cornstarch, rice flour | 6 (4–8) | medium |
| Egg wash (beaten egg, egg + milk) | 12 (8–15) | medium |
| Breadcrumbs / panko / crushed crackers | 20 (14–30) | medium |
| Wet batter lines (flour + liquid mixed; tempura, kwek-kwek, okoy) | fixed nf 0.8 of each batter line | low |
| "For dusting" (desserts, pans) | fixed nf 0.3 | low |

A full flour + egg + crumbs breading picks up about 38% of the substrate weight, about 27% of the coated weight. That sits inside the industry "breaded 14–30% pickup" band.

### T3. Marinade
| Fate | Detect | Consumed | conf |
|---|---|---|---|
| Reused / reduced into sauce | I5a | 1.0 | high |
| Basting | I5b | 0.6 | medium |
| Cured and cooked down (tocino, tapa) | I5d | 1.0 | medium |
| Discarded | I5c | pickup **4% (2–6) of the marinated target's edible grams**, split pro-rata across marinade lines; fallback nf 0.2 | low |
| Unknown fate | none | braise/soup/stew → 1.0; grill → 0.6; fry → as discarded | low |

### T4. Fat factor (`ff` = share of the line's own fat that remains)
| Case | ff | conf |
|---|---|---|
| Fatty pork boiled and/or deep-fried (lechon kawali, bagnet) | 0.70 (0.6–0.85) | low |
| Crispy pata (thick, bone-in) | 0.80 | low |
| Chicharon (pork rind) | 0.50 (0.35–0.6), plus T1 uptake 5% | low |
| Bacon or longganisa pan-fried crisp, fat drained | 0.35 (0.25–0.5) | medium |
| Ground meat browned + "drain excess fat" | 0.75 (0.6–0.85) | medium |
| Simmered meat + "skim the fat/oil" | 0.85 | low |
| "Skim the scum/impurities" only | 1.0 | high |
| Rendered fat kept in the dish (e.g., "render the pork fat, then sauté") | 1.0 | high |

### T5. Edible-portion defaults (use only until FNRI E.P.% is stored, then FNRI wins)
| Item | ep |
|---|---|
| Whole chicken / "cut into serving pieces" / legs, thighs, drumsticks | 0.70 |
| Chicken wings | 0.55 |
| Pork spareribs / buto-buto / ribs (nilaga) | 0.60–0.65 (use 0.62) |
| Pork hock / pata | 0.60 |
| Beef shank with marrow (bulalo); marrow counted as eaten | 0.55 |
| Oxtail | 0.45 |
| Bone-in pork chop | 0.80 |
| Whole fish (bangus, tilapia, galunggong, lapu-lapu) | 0.55 |
| Shrimp head-on shell-on / headless shell-on | 0.55 / 0.85 |
| Crab | 0.35 |
| Mussels / clams in shell | 0.30 / 0.20 |
| Corn on the cob pieces | 0.55 |

### T6. Bone-broth profile (`profile:'bone_broth'`), per 100 g of as-purchased bones simmered ≥ 1 h with the broth eaten
kcal 40 · protein 4.0 g · fat 2.5 g (0.5 g if I10 skim) · carbs 0 · fiber 0 · calcium 6 mg · iron 0.3 mg · vitamins 0. **Confidence: low.**

Derivation: home-prepared stock is about 2 g protein per 100 g, and about 2 L of stock is made per kg of bones. Broth calcium is about 9–14 mg per cup.

### T7. Souring agents
| Agent / handling | nf | conf |
|---|---|---|
| Fresh/unripe tamarind pods boiled whole, then removed (no mashing) | 0.10 | low |
| Tamarind boiled, then mashed/squeezed and strained (I8) | 0.30 | low |
| Tamarind, no handling signal | 0.15 | low |
| Tamarind paste/concentrate, sinigang mix powder, miso | 1.0 | high |
| Kamias (bilimbi) or green mango sliced into the soup | 1.0 | medium |
| Batwan/batuan, or guava/bayabas, boiled, mashed and strained | 0.30 / 0.40 | low |
| Calamansi/lemon juice ("juice of N") | 1.0 of the juice (juice yield is a unit-workstream EP: calamansi ≈ 0.4, lemon ≈ 0.3) | medium |
| Calamansi halves "for serving" | 0.5 | low |

### T8. Aromatics not eaten (nf 0, cf 1, by **name**)
Bay leaves/laurel · lemongrass/tanglad · pandan · star anise · cinnamon stick/bark · whole cloves (the spice; never the garlic unit) · whole peppercorns · kaffir lime leaves · knotted green onion · banana leaves / corn husks (wrappers) · tea bags.

Partials:
- ginger slices in soup (tinola, nilaga): 0.5;
- whole dried chilies used to flavour oil: 0.5;
- whole siling haba/pansigang in soup: 1.0. This is deliberately safe; the impact is tiny.

Ground or cracked spices stay `main` (1.0).

*Side benefit:* this table removes phantom grams from today's "unknown unit → value × 60 g" fallback. "5 dried bay leaves" currently parses to 300 g.

### T9. Garnish / optional / serving / dip
| Case | Nutrition | Cost | conf |
|---|---|---|---|
| Garnish with an amount | 1.0 | 1.0 | high |
| Garnish, "to taste" or no amount | 0 g (unchanged) | 0 | high |
| Optional | 0 (UI shows add-on kcal) | 0 (UI shows add-on ₱) | high |
| For serving: steamed rice/bread | 0 (optional "+ rice" toggle: 1 cup cooked ≈ 160 g) | 0 | high |
| Dipping sauce (sawsawan, liver sauce, sweet chili, bagoong on the side) | 0.4 (0.3–0.6) | 1.0 | low |

### T10. Grain basis and yields
- **Weight yield, raw → cooked:**

  | Item | Yield |
  |---|---|
  | White rice (absorption) | 2.8 (2.6–3.0) |
  | Glutinous rice, steamed | 2.2 |
  | Brown rice | 2.5 |
  | Dried pasta / pancit canton | 2.2 |
  | Bihon (rice vermicelli), soaked and cooked | 2.5 |
  | Dried monggo, boiled | 2.4 |
- **Default `qty`:**
  - raw, unless N11 or I13 say "cooked";
  - congee, arroz caldo, champorado, biko and suman → raw;
  - fried rice, sinangag and silog → cooked.
- **Volumes (for the unit workstream):** 1 cup raw rice ≈ 190 g; 1 cup cooked rice ≈ 160 g (≈ 175 g packed).

### T11. Brines, boiling and soaking liquids (water is 0 kcal regardless)
| Line in a **discarded** liquid | nf |
|---|---|
| Salt, sugar, soy sauce, fish sauce, bouillon cubes | 0.10 |
| Aromatics | 0 |
| Oil added to pasta water | 0.10 |

Dry-cure rubs that are cooked with the meat get 1.0. Salt in an eaten soup gets 1.0. Rock salt used as a baking bed and salt "for cleaning" get 0. These rows only matter once sodium is stored (Phase C).

### T12. Retention factors. **Decision: implement this coarse table; skip per-food factors.**
Applied only when the FNRI row is raw. Multi-step lines take the **minimum** factor per nutrient across their steps; factors are not compounded.

**Vegetables and fruit**
| Line method | vit C | B1 | B2 | vit A | Ca | Fe |
|---|---|---|---|---|---|---|
| raw / garnish | 1 | 1 | 1 | 1 | 1 | 1 |
| brief / steam | 0.80 | 0.90 | 0.95 | 0.95 | 1 | 1 |
| sauté / stir-fry | 0.70 | 0.85 | 0.90 | 0.90 | 1 | 1 |
| soup, liquid eaten | 0.75 | 0.85 | 0.90 | 0.90 | 1 | 1 |
| boil & drain | 0.55 | 0.70 | 0.75 | 0.90 | 0.90 | 0.90 |
| braise / long simmer (pinakbet, laing, ginataan) | 0.50 | 0.75 | 0.85 | 0.85 | 1 | 1 |
| fry (lumpia/okoy filling) | 0.60 | 0.80 | 0.90 | 0.85 | 1 | 1 |
| bake | 0.70 | 0.80 | 0.90 | 0.85 | 1 | 1 |

**Meat, poultry, fish and eggs**
| Method | B1 | B2 | vit A | Ca/Fe |
|---|---|---|---|---|
| soup, liquid eaten | 0.70 | 0.90 | 0.90 | 1 |
| braise / stew | 0.55 | 0.85 | 0.85 | 1 |
| boil & drain | 0.55 | 0.80 | 0.85 | 0.95 |
| fry | 0.75 | 0.90 | 0.85 | 1 |
| grill / roast / bake | 0.70 | 0.90 | 0.85 | 1 |
| steam | 0.80 | 0.90 | 0.90 | 1 |

**Grains and legumes**
| Case | Factors |
|---|---|
| Rice or grains by absorption / congee | B1 0.85, B2 0.90 |
| Noodles/pasta boiled and drained | B1 0.60, B2 0.70, Fe 0.95 |
| Legumes boiled, liquid eaten (monggo) | B1 0.75, B2 0.85 |
| Baked goods | B1 0.80, B2 0.90, vit A 0.85, vit C 0.60 |

**Why this is worth it:**
- Vitamin C (16%) and vitamin A (14%) feed `nutritionScore`, and vitamin C is displayed.
- Long-cooked Filipino vegetable dishes would otherwise overstate vitamin C by about 1.3–2×.

**Why not per-food factors:**
- Mapping 1,542 FNRI foods to the USDA R6 food categories is a manual project.
- Gram-estimation error dwarfs the difference between, say, cabbage and pechay.

### T13. Cost fractions (a separate axis from nutrition)
| Role | Cost |
|---|---|
| main, cooking_fat, coating, batter, marinade (any fate), aromatic, souring, bone_extract, dip, garnish, cleaning | cf 1.0 (bought and used up) |
| frying_medium | cf = max(nf, 1/OIL_USES), with `OIL_USES = 3` (configurable; UI shows "₱X if not reused"). Amount null: `costG = eatenG + 145 g` (≈ ⅓ of a 2-cup fill), low confidence |
| cooking_liquid water/ice | 0 (already NON_PRICEABLE) |
| optional, serving_side, noise | 0 (shown as add-on where relevant) |

`ep` never reduces cost.

---

## 6. Safe defaults and guardrails
- **Defaults:** D1 → nf 1; unknown marinade fate → by method (T3); unknown oil → O6; unknown fried targets → T1 fallback; unknown rice state → raw.
- **X1 oil guard.** A line whose FNRI fat ≥ 80 g/100 g, with nf = 1, G ≥ 120 g and > 45% of recipe kcal, is reclassified as frying_medium using the fallback, with flag `X1` and low confidence. Exception: O8 baking.
- **X2.** kcal per serving > 1,500 after adjustments → UI "check" badge plus an entry in the audit queue. Values are not changed.
- **X3.** Any aromatic, spice or leaf line is capped at 10 g, which neutralises the ×60 fallback.
- **X4.** A pickup or uptake line whose target grams are 0 or null uses the fallback nf, with low confidence.
- **Displayed confidence:** recipe confidence = the minimum confidence over lines whose adjustment changes recipe kcal by > 5%.

---

## 7. Worked examples
The ingredient lists come from PP pages found by web search; the DB amount/unit splits may differ slightly. Grams are **today's `parseQuantity`** (cup 240, tbsp 15, lb 453.6, unknown unit × 60). Per-100 g values are ≈ USDA-family stand-ins until the real matched FNRI rows are plugged in:

| Food | kcal | Protein | Fat |
|---|---|---|---|
| Pork belly | 518 | 9.3 g | 53 g |
| Oil | 884 | — | 100 g |
| Squid | 92 | — | — |
| AP flour | 364 | — | — |
| Breadcrumbs | 395 | — | — |
| Egg | 143 | — | — |
| Ripe tamarind | 239 | — | — |
| Black pepper | 251 | — | — |

Prices are illustrative: liempo ₱380/kg, palm oil ₱90/L.

### 7.1 Lechon Kawali (PP ?p=186)
Ingredients: 2 lbs pork belly, 2 tbsp salt, 2 tbsp whole peppercorns, 5 dried bay leaves, 3 cups cooking oil, water. The steps boil the pork with salt, peppercorns and bay leaves, drain and dry it, rub it with salt, then deep-fry.

| Line | G_AP | Rules | Today | New |
|---|---|---|---|---|
| Pork belly | 907.2 | M1, I1 friedTarget (fatty pork, bare 4%), T4 ff 0.70, retention B1 min(boil_drain 0.55, fry 0.75) = 0.55 | 4,699 kcal / 480.8 g fat | fat 336.6 g → **3,401 kcal** |
| Cooking oil | 720 | O2 frying_medium; absorbed 0.04 × 907.2 = 36.3 g → nf 0.050 | 6,365 kcal | **321 kcal**; cost cf max(0.05, ⅓) = 0.333 |
| Salt | 30 | I9 + rub step → I9b nf 0.5 | 0 | 0 (sodium only) |
| Whole peppercorns | 30 | L2 aromatic in discarded liquid → 0, X3 | ≤ 75 (if matched) | 0 |
| Bay leaves | "5" → 300 (×60 fallback) | L2 → 0, X3 | ≤ 939 (if matched) | 0 |
| Water | — | I9 cooking_liquid | 0 | 0 |
| **Recipe** | | | **11,064 kcal (+ ≤ 1,014 phantom)** | **3,722 kcal**, fat 372.9 g |
| **Per serving (÷ 4, code fallback)** | | | 2,766 kcal, 300 g fat | **930 kcal, 93 g fat** |

- **Cost:** pork ₱344.7; oil ₱64.8 → ₱21.6. Total ₱409.5 → **₱366.3** (₱102 → ₱92 per serving). The UI notes "oil assumed reused 3×; ₱43 more if discarded".
- **Sanity check:** about 136 g of cooked lechon kawali per serving at about 690 kcal/100 g. That is consistent with fried pork belly, which is fattier than raw belly because water is lost.

### 7.2 Calamares (PP ?p=5631)
Ingredients: ½ lb squid rings, ¾ cup AP flour, 1 egg (beaten), ¾ cup breadcrumbs, 1 tsp salt, ½ tsp pepper, 2 cups cooking oil. The steps dredge in flour, dip in egg, coat in crumbs, then deep-fry.

| Line | G_AP | Rules | Today kcal | New |
|---|---|---|---|---|
| Squid | 226.8 | I3 object → friedTarget; class shellfish/battered 15% | 209 | 209 |
| AP flour | 180 | I3 dredge, T2 6% → 13.6 g (nf 0.076) | 655 | **50** |
| Egg | 60 (× 60 fallback) | I3 wash, T2 12% → 27.2 g (nf 0.45) | 86 | **39** |
| Breadcrumbs | 180 | I3 crumbs, T2 20% → 45.4 g (nf 0.25) | 711 | **179** |
| Cooking oil | 480 | O2; absorbed 0.15 × 226.8 = 34.0 g (nf 0.071) | 4,243 | **301**; cost cf 0.333 |
| Salt, pepper | 5 / 2.5 | D1 | 6 | 6 |
| **Recipe** | | | **5,910** | **783 kcal** |
| **Per serving (e.g. ÷ 3)** | | | 1,970 | **261** |

The coating total is 86 g on 227 g of squid, or 27% of the coated weight, so it sits in the "breaded" pickup band. The pickup model makes the flour and crumb results **independent of the cup-density error** (240 vs ≈ 125 g/cup), because consumption is driven by the squid weight. Cost: flour, crumbs and egg are counted in full (leftover dredge is thrown away); oil is ⅓.

### 7.3 Sinigang na Liempo sa Sampaloc (PP ?p=19285 / ?p=22492)
Ingredients: 2 lbs pork belly, 16 oz unripe sampaloc, 1 bunch kangkong, 3 medium gabi, 2 tomatoes, 1 onion, 12 okra, 3–4 long green chilies, 4 cups water, 2 cups beef broth, 2 tbsp cooking oil, fish sauce to taste. The steps boil the tamarind for 45 minutes, then remove it from the water.

| Line | Rules | Effect |
|---|---|---|
| Pork belly 907.2 g | M4 soup (liquid eaten) → ff 1.0 (rendered fat stays in the broth); B1 × 0.70 | 4,699 kcal (unchanged) |
| Sampaloc 453.6 g | L3 + I7 "remove the tamarind" (no mash) → T7 nf 0.10 | 1,084 → **108 kcal**. The other PP version, "strain… squeeze to extract juices", hits I8 → nf 0.30 → 325 kcal |
| Kangkong, gabi, tomato, onion, okra, chilies | D1 main 1.0, method soup | kcal unchanged; **vitamin C × 0.75**, B1 × 0.85, vitamin A × 0.90 (e.g. 150 mg → 113 mg vitamin C per recipe) |
| Cooking oil 30 g | O6 (< 60 g) → cooking_fat 1.0 (O4 if a sauté verb is found) | 265 kcal (unchanged) |
| Water 960 g | L1 | 0 |
| Beef broth 480 g | main 1.0 (eaten) | correct only once the matcher stops `beef broth → Beef blood` |
| Fish sauce "to taste" | no amount | 0 g |
| **Recipe** | | ≈ **−976 kcal (−15%)** versus today. Vitamin C −25% |

- If a step said "skim the scum", I10b applies: no change.
- If a step said "skim the fat", I10 applies ff 0.85 to the pork: −72 g fat, −649 kcal.

### 7.4 Quick cases
| PP recipe | Rule hits | Result |
|---|---|---|
| Pork Adobo (2 lbs belly, ½ cup soy, 2 tbsp garlic, 5 bay leaves, 4 tbsp vinegar, 1 tbsp peppercorn, 2 cups water) | I5m: soy + garlic are marinade; "add the remaining marinade" → I5a 1.0; bay leaves and peppercorns L2 → 0; M5 braise (pork B1 0.55) | Marinade fully counted (correct); phantom bay-leaf grams removed |
| Daing na Bangus (1 medium bangus, 10 tbsp vinegar, 1 head garlic, peppercorn, salt, cayenne (optional), ½ cup oil) | N1 cayenne → add-on; I5c "drain" → pickup 4% × fish edible grams (≈ 500 g × ep 0.55 = 275 g → 11 g of the whole marinade); oil bare fish 5% → 13.8 g of 120 g (nf 0.115) | Even if "1 head garlic" mis-parses to 500 g, at most 11 g of marinade is counted |
| Bulalo (2 lbs beef shank, cabbage, pechay, corn, whole peppercorns, onion, green onion, water, fish sauce (optional)) | N12 shank ep 0.55 → 499 g eaten basis, cost on 907 g; corn ep 0.55; peppercorns 0; fish sauce N1 add-on; M4 retention | Meat nutrition −45% versus today |
| Lumpiang Shanghai (+ sweet chili "for dipping") | Roll title → all filling + wrapper lines are targets at 12%; N6 dip 0.4 | ≈ 700 g rolls → 84 g oil counted |
| Sinangag ("4 cups cooked rice") | N11 qty cooked → boiled-rice FNRI row, else ÷ 2.8 | Avoids a ≈ 3× overcount |

---

## 8. Implementation plan (one developer)
**Phase A: core, about 6 dev-days**
1. *(0.5 d)* Prisma migration: `IngredientCooking` and `Recipe.cookingMeta`.
2. *(2 d)* `docs/cooking-rules.js`: lexicons, regexes, tables T1–T13, `annotateRecipe`, `retention`. Tests with `node --test` on 12 golden fixtures, copied from `/api/recipes/[id]` JSON: lechon kawali, calamares, sinigang (×2 tamarind variants), adobo, daing, bulalo, lumpia, tinola, pork BBQ, sinangag, arroz caldo, leche flan.
3. *(0.5 d)* `scripts/annotate-cooking.ts` (tsx). Uses `createRequire` to load `docs/matcher.js` and `docs/cooking-rules.js`; deleteMany + createMany (2,000/chunk); prints role counts, guard hits and a deltas CSV.
4. *(0.5 d)* APIs: add `orderBy:{id:'asc'}`, ingredient `id` and the compact `a` to `/api/recipes`; add the full annotation to `/api/recipes/[id]`.
5. *(1.5 d)* `enrichRecipe` apply (§2.4), UI badges, "adjusted for cooking" note, optional "as listed" toggle.
6. *(1 d)* `match-review.html` Cooking tab.

**Phase B (optional, about 1.5 d + 70 min crawl):** scrape `groupName` and `notes` for new recipes, backfill existing ones, re-annotate. Backfill writes use one `UPDATE … FROM (VALUES …)` per batch of 50 recipes through `$executeRaw`.

**Phase C (optional, about 0.5 d):** add FNRI sodium (verify the modal label, likely "Sodium, Na (mg)") to `NUTRIENT_LABELS` and `NutritionFact`. T11 and the marinade fractions then start to matter (patis, toyo, Knorr cubes).

**Phase D (optional):** a Claude second opinion on low-confidence recipes (§9).

**Phase E (optional):** `docs/cooking-overrides.json`, keyed by recipe URL + rawText, for the top-100 recipes (`source: manual`).

**Calibration queries** (run together with the data profile):
```sql
SELECT COUNT(*) FROM "RecipeIngredient" WHERE "rawText" ~* 'for (deep[- ]?)?fr(y|ying)';
SELECT COUNT(DISTINCT "recipeId") FROM "RecipeInstruction" WHERE text ~* 'deep[- ]?fr';
SELECT COUNT(DISTINCT "recipeId") FROM "RecipeInstruction" WHERE text ~* 'discard[^.]*marinade|from (the )?marinade|pat[^.]*dry';
SELECT COUNT(DISTINCT "recipeId") FROM "RecipeInstruction" WHERE text ~* '(pour|add|put)[^.]*marinade';
SELECT COUNT(DISTINCT "recipeId") FROM "RecipeInstruction" WHERE text ~* 'skim';
SELECT name, COUNT(*) FROM "RecipeIngredient"
 WHERE amount IS NULL AND unit IS NULL AND (name ~ ':\s*$' OR name ~* 'ingredients') GROUP BY 1 ORDER BY 2 DESC LIMIT 50;
SELECT substring(lower("rawText") from '\(([^)]*)\)') AS note, COUNT(*) FROM "RecipeIngredient"
 GROUP BY 1 ORDER BY 2 DESC LIMIT 100;
```
**Acceptance criteria:**
1. No oil line ≥ 200 g is counted at nf 1 without O8 baking evidence.
2. Median kcal per serving of deep-fried recipes falls to about 300–900.
3. On 40 hand-labeled recipes (10 fried, 8 soups, 8 braises, 6 grilled/marinated, 4 desserts, 4 rice dishes), role accuracy is ≥ 90% on lines that move recipe kcal by > 5%.
4. Every X-guard hit is listed in the audit page.

---

## 9. Optional: LLM second opinion (Phase D)
- **Input:** title, ingredient lines (id, rawText) and instruction steps, for recipes with any low-confidence line or guard hit (expected to be about a third).
- **Output:** structured outputs (`output_config.format` with a JSON schema) of `{id, role(enum), fate(enum), friedTarget, qty, evidenceStep}`. Forced `tool_choice` is not available on the 5.5 models, so use structured outputs.
- **The LLM never outputs numbers.** Where it agrees with the rules, confidence is upgraded. Where it disagrees, the line goes to the audit review queue.
- **Cost:** about 1.5k input and 0.4k output tokens per recipe, plus thinking tokens billed as output. Use the Message Batches API, which costs 50% of standard. Estimates for all 2,770 recipes at batch rates, using the 2026-10 cached price table (verify before running):

  | Model | Est. cost (all recipes, batch) |
  |---|---|
  | `claude-opus-5-5` (default) | ≈ $20 |
  | `claude-sonnet-5-5` | ≈ $10 |
  | `claude-haiku-5-5` | ≈ $0.50 |

  Limiting the run to low-confidence recipes cuts this by about 3×. Choosing a cheaper model is the developer's call. Check agreement on the 40 labeled recipes first.

---

## 10. Provenance of the numbers
- **Oil uptake (T1):**
  - French fries reach about 0.22 g oil per g after about 4 minutes in fresh oil, rising as the oil degrades (Food Science 2020, 41(11):1–6).
  - Coated fried meat and seafood absorb 10–20% oil, with batter adhering at 25–40% (industry article found via search, not peer-reviewed).
  - Coatings and frying-oil quality change uptake by 22–49% (whey-protein breaded chicken, PMC10969747).
  - Values for unbattered meat and fish, tofu, rolls and fritters are author estimates in the same family. Confidence is as marked.
- **Pickup (T2):** USDA AMS breading-percentage definition; Perdue categories: lightly breaded ≤ 14%, breaded 14–30%, fritter 30–64%.
- **Retention (T12):** values are ≈, from the USDA Table of Nutrient Retention Factors Release 6 (2007) and Bognár 2002. The tables could not be fetched from this sandbox (DNS blocked). Before shipping, replace them with exact R6 category values from the data.gov CSV. That is about 30 minutes of work.
- **Rendering (T4), EP (T5), yields (T10):** ≈ USDA cooking-yield and refuse families; author judgment for Filipino cuts. Low/medium confidence as marked. FNRI E.P.% supersedes T5 once stored.
- **Bone broth (T6):** USDA SR home-prepared stock family; broth calcium 9–14 mg per cup (USDA figures as cited by Nourished Kitchen).
- **Souring, dips, marinade pickup (T3, T7, T9):** author assumptions. FAO/INFOODS and EuroFIR recipe-calculation guidance only says to account for discarded ingredients and gives no standard fractions. These are low confidence and are the first candidates for the hand-labeled calibration.

**Sources:**
- PP recipes:
  - [Lechon Kawali](https://panlasangpinoy.com/?p=186), [Filipino Lechon Kawali](https://panlasangpinoy.com/filipino-lechon-kawali/)
  - [Sinigang na Liempo sa Sampaloc with Gabi](https://panlasangpinoy.com/?p=19285), [Pork Sinigang](https://panlasangpinoy.com/pork-sinigang-na-baboy/)
  - [Calamares](https://panlasangpinoy.com/?p=5631)
  - [Bulalo](https://panlasangpinoy.com/?p=239)
  - [Pork Adobo](https://panlasangpinoy.com/filipino-food-pork-adobo-recipe/)
  - [Daing na Bangus](https://panlasangpinoy.com/?p=35217)
- Frying and coatings:
  - [Food Science 2020 fries oil uptake](https://www.spkx.net.cn/EN/Y2020/V41/I11/1)
  - [WPI-coated breaded chicken (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10969747/)
  - [MPOB Palm Oil Developments 38](https://palmoilis.mpob.gov.my/publications/POD/pod38-p11.pdf)
  - [Chicken Buying Smarts (pickup categories)](https://www.foodservicedirector.com/foodservice-operations/chicken-buying-smarts)
  - [USDA AMS breading percentage](https://www.ams.usda.gov/sites/default/files/media/QAD%20605%20-%20Certification%20of%20Breading%20Percentage.pdf)
- Retention: [USDA Retention Factors R6 (data.gov)](https://catalog.data.gov/dataset/usda-table-of-nutrient-retention-factors-release-6-2007-1b152)
- Bone broth: [Bone broth calcium](https://nourishedkitchen.com/?p=19538)


**Key decisions:**
- Each ingredient line gets one stored annotation: role, method, qty state, ep, nf (consumption fraction), optional eatenG, ff (fat factor), cf (cost fraction), optional costG, conf, rules. A local script (tsx) computes it offline with a shared UMD module, docs/cooking-rules.js, and writes it to a new IngredientCooking table via deleteMany+createMany in 2,000-row chunks. The client only multiplies.
- Frying oil, coatings and discarded marinades use food-driven pickup: consumed = min(listed, rate x fried or marinated target grams). Rates are T1 oil uptake (e.g. fish bare 5%, battered shrimp/squid 15%, fatty pork 4%), T2 coating (dredge 6%, egg wash 12%, crumbs 20%) and T3 marinade (4% of target). This makes the results robust to unit and density mis-parses.
- Nutrition and cost use different bases. Nutrition uses edible grams eaten (AP x ep x nf). Cost uses as-purchased grams x cf: bones, removed aromatics and discarded marinades are fully paid for. Frying oil cost = max(absorbed share, 1/3), assuming the oil is reused 3 times (configurable).
- When uncertain, count the line in full (nf=1), with three exceptions: aromatics removed by name count as 0; optional and for-serving items are excluded and shown as add-ons; oil of 200 g or more is never counted in full without evidence it stays in the dish (O6 + guard X1).
- Detection precedence: header/noise rows > rawText notes (derivable now as rawText minus amount/unit/name) > scraped WPRM group > instruction verb rules > inferred in-list headers > lexicon > default. Fate modifiers (marinade reused/discarded, skim fat vs scum, render+drain, 'leaving N tbsp oil') layer on top.
- Retention factors are worth implementing as a coarse method x food-group table (about 40 numbers, vitamins C/B1/B2/A; minerals only for boil-and-drain), applied only to raw FNRI rows, taking the minimum factor across steps. Per-food USDA R6 mapping is not worth it.
- Reduction has no nutrient effect, because nutrition is summed and divided by servings, so no dish yield factors are needed. Soup broth is assumed fully eaten; plate waste is out of scope.
- Nutrition basis: prefer FNRI rows in the same state as the recipe quantity (penalize cooked or prepared rows x0.7 for raw lines; exclude 'prep'/'w/' dishes). Otherwise convert with the T10 yields (white rice 2.8, glutinous 2.2, pasta/canton 2.2). Never add cooking adjustments on top of an already-fried FNRI row.
- Bones-only lines use a synthetic bone-broth profile (per 100 g of bones: 40 kcal, 4 g protein, 2.5 g fat, 6 mg Ca). Bone-in cuts stay 'main' with edible-portion defaults (shank 0.55, whole chicken 0.70, whole fish 0.55), until FNRI E.P.% is stored.
- WPRM group-header scraping is an optional Phase B. Phase A works today from rawText notes, inline header rows, instructions and titles. Sodium (Phase C) is the optional step that makes brine, marinade and salt fractions visible.
- The Claude API is optional (Phase D) and only gives a second opinion on low-confidence recipes. It returns enum roles and fates via structured outputs in a Message Batch and never returns numbers; disagreements go to the audit queue.

## SarapSulit cost model: per-serving cost from continuous DA prices (NCR)

# SarapSulit cost model: per-serving cost from continuous DA prices

Scope: per-serving and per-recipe cost from DA Daily Price Index prices (NCR, prevailing retail). SM is out of scope. FNRI and the recipes are static, and DA prices arrive daily. Everything below can be built by one developer. Items marked **(optional)** can wait.

---

## 0. Decisions at a glance

| Topic | Decision |
|---|---|
| Canonical price unit | Every DA row is normalized to **₱ per basis unit** (kg, piece, bottle or pack) plus derived **₱/g**, **₱/ml** and **₱/pc**. Cost is computed in the line's own dimension where possible (count × ₱/pc, ml × ₱/ml, g × ₱/g). Density is only used to cross between dimensions. |
| Unit parsing | Regex on the DA name (`56-60 grams/pc`, `1 Liter/bottle`, `350 ml/bottle`), with **per kg as the default**. A reviewed `commodity-spec.json` (~244 rows) is the source of truth. |
| Quantity basis | Cost is charged on **as-purchased (AP) grams**. Weight and count quantities in recipes are treated as AP. Volume quantities of chopped or minced produce, and garlic cloves, are treated as EP, with `AP = EP / edibleFrac`. |
| Cost vs nutrition | Each line carries `usedG` (what cooking uses up, for cost), `needG` (what must be on hand, for shopping) and `eatenG` (owned by nutrition). Frying oil: `used = absorbed + (V − absorbed)/R`, with **R = 3 reuses** by default and a "single use" toggle. |
| Two cost numbers | **Cost of what you use** (pro-rated, the headline per-serving number) and **Shopping cost** (whole packs and market increments, per recipe, split into fresh items and pantry staples). |
| Price over time | Reference price = **median of the most recent 5 valid observations within a 28-day window** (≈ 7-day median, and immune to weekend gaps). Outliers outside 0.4–2.5× the 28-day median are dropped. Staleness: fresh ≤3 days, aging ≤10, stale ≤27, then expired. Trend = reference vs median of days 7–13, with a ±5% threshold. |
| Variants | Match to a **family**, not a DA row. Order of precedence: a variant the recipe text asks for, then the family's curated default, then the **cheapest fresh, non-frozen** variant. Always show the min–max range. |
| Fallbacks | T1 DA → T2 curated reference price (DTI SRP, about 30 staples) **(optional, recommended)** → T3 category median, only for fresh vegetables and fruits **(optional)** → T4 no price. Every tier is flagged in the UI. A recipe is rankable only if its main ingredient is priced and coverage is ≥ 70%. |
| Cadence | Grams, roles and families are precomputed once per parser version. `/api/prices` is computed on read from about 28 days of `Commodity` rows and CDN-cached for 1 h. Recipe cost is joined in the browser by a shared `docs/cost.js` (same pattern as `matcher.js`). |

---

## 1. What the current code gets wrong (verified against the repo)

I ran these checks against `docs/matcher.js` in a scratch script. No repo files were changed.

| # | Problem | Evidence | Effect |
|---|---|---|---|
| 1 | Every DA price is treated as ₱/kg | `docs/index.html` enrichRecipe: `lineCost = (com.price / 1000) * grams`. `rankMatch("eggs")` → `Chicken Egg (White, Medium) 56-60 grams/pc` (conf 0.50) | 3 eggs at ₱8/pc are priced at 180 g × ₱8/1000 = **₱1.44 instead of ₱24** (−94%) |
| 2 | `isNonPriceable` matches substrings (`lc.includes(w)`) | Returns true for: rice, glutinous rice, rice noodles, calamansi juice, lemon juice, "sliced pork belly" (all via `ice`); red/green bell pepper and chili pepper (`pepper`); cauliflower (`flower`); sausage (`sage`); "shrimp, peeled and deveined" (`peel`); watermelon (`water`); garlic powder (`powder`); garlic cloves (`clove`) | These lines are never priced. Red bell pepper alone has 107 uses, and rice is DA's flagship commodity |
| 3 | Variant choice is arbitrary | `"cooking oil"` → `Cooking Oil (Coconut) 1 Liter/bottle` (conf 0.57). `"granulated white sugar"` → `Sugar (Brown)` because `white` is a stopword | The most-used ingredient (1,063 uses) gets the most expensive oil |
| 4 | The flat unit table hits costs | `parseQuantity("1","head")` = 500 g, so 1 head of garlic is priced as 500 g = ₱70. `5 cloves` = 25 g, but a USDA peeled clove is about 3 g | Lechon kawali is overpriced by about ₱64 for garlic alone |
| 5 | Frying oil is charged in full and counted as eaten in full | 4 cups of oil = 960 g → ₱172.80 at the coconut price, and about 1,414 kcal per serving if matched in FNRI | The two worst-hit categories are fried dishes and their nutrition |
| 6 | The price is the latest single day, and trend is vs the previous day | `/api/commodities` and `loadData()` | Rankings reshuffle daily on vegetable noise |
| 7 | The SM fallback adds a whole package price as the line cost | `lineCost = smProd.price` | Out of scope now, so remove it |
| 8 | The UI labels every DA price "/kg" | Modal row and calculator (`₱${c.price}/kg`) | Wrong for eggs and oil |
| 9 | `/api/recipes` doesn't send `rawText` | Its `select` only has name, amount and unit | "(optional)", "for frying" and "to taste" notes are invisible to the client |

Fixes 2, 7 and 9 are tiny and should land first, whatever else happens.

---

## 2. Pipeline and cadence

```
STATIC: once per parser/matcher version (local Node script, so no 60 s limit; or a chunked admin endpoint)
  RecipeIngredient(rawText,name,amount,unit)
     → parse + match (separate workflow)
     → RecipeLine { kind, role, qtyG|qtyMl|count, qtyBasis, family|refKey, hint, apG }
       (apG is static: it depends only on qty, qtyBasis and the family edibleFrac)

DAILY: DA scrape writes one day (existing one-transaction write)
  Nothing new is written. /api/prices aggregates on read and is cached by the CDN.

READ TIME: browser (GitHub Pages)
  GET /api/recipes (lines, s-maxage=86400) + GET /api/prices (~40 KB, s-maxage=3600)
     → SarapCost.recipeCost(recipe, prices, opts)   // ~33k line multiplications, < 10 ms
```

Why compute on read instead of storing a `PriceRef` table:
- A single `findMany` over 28 days × ~244 commodities (~7k rows) is one round trip to Tokyo, about 1–2 s.
- The CDN cache makes it effectively free.
- There's no migration and no new write path that has to fit the 60 s limit.
- A `PriceRef` table (2-statement `deleteMany` + `createMany`, the same pattern as commit `eca3bd6`) can be added later if the endpoint gets slow, or for snapshots **(optional)**.

Why the client joins: the toggles (oil reuse, variant mode, include optional) re-cost instantly, and it matches today's architecture.

---

## 3. Data structures

### 3.1 `scraper-backend/src/data/commodity-spec.json` (curated, version-controlled)

There is one entry per distinct DA commodity name. It's generated once by a script (regex + category defaults), optionally pre-filled by Claude, then reviewed by hand.

```ts
interface CommoditySpec {
  name: string;            // exact DA name (join key with Commodity.name)
  family: string | null;   // "egg_chicken", "oil_cooking", "onion_bulb", "garlic", "pork_belly", "chicken_whole" ...
  variant: string;         // "white_medium", "palm_1L", "imported", "native", "local" ...
  attrs: string[];         // extracted: ["imported","frozen","large",...]
  basis: "kg" | "piece" | "bottle" | "pack";
  sizeG?: number;          // grams per piece/pack, AP (egg medium: 58)
  sizeMl?: number;         // ml per bottle (1000, 350)
  densityGPerMl?: number;  // liquids only (oil 0.92)
  edibleFrac: number;      // EP/AP (1.0 for oil, sugar, rice)
  buyIncrement: number;    // in basis units: grams for kg (250), 1 for piece/bottle/pack
  pantry: boolean;         // staple most kitchens already have
  sanity: [number, number];// plausible ₱ per basis unit (catches parse errors)
  isDefault?: boolean;     // curated default variant for its family
  fnriRawCode?: string;    // raw FNRI food for this family (later: FNRI EP%)
  specSource: "auto" | "reviewed";
  needsReview?: boolean;
}
```

Families also carry display names and aliases (e.g. `sugar_white: ["white sugar","granulated sugar","refined sugar","asukal"]`) so the matcher indexes families. That also fixes "granulated white sugar → Sugar (Brown)".

### 3.2 `GET /api/prices` response

```json
{
  "asOf": "2026-10-12",          // max(Commodity.sourceDate)
  "lagDays": 1,                   // today (Asia/Manila) − asOf
  "families": {
    "egg_chicken": { "label": "Chicken egg", "aliases": ["egg","itlog"], "variants": [
      { "name": "Chicken Egg (White, Medium) 56-60 grams/pc", "variant": "white_medium", "isDefault": true,
        "basis": "piece", "sizeG": 58, "edibleFrac": 0.88, "buyIncrement": 1, "pantry": false,
        "ref": 8.00, "perPc": 8.00, "perG": 0.1379, "latest": 8.00, "lastSeen": "2026-10-12",
        "nObs": 5, "status": "fresh", "prevRef": 8.00, "trend": "flat", "trendPct": 0.0, "min28": 7.5, "max28": 8.0 } ] }
  },
  "refPrices": {                  // optional tier T2
    "soy_sauce": { "label": "Soy sauce", "packSize": 350, "packUnit": "ml", "packPrice": 19.75,
                    "densityGPerMl": 1.08, "source": "DTI SRP 2025-02-01", "asOf": "2025-02-01", "pantry": true } },
  "categoryMedians": { "LOWLAND VEGETABLES": { "perG": 0.085, "n": 14 } },   // optional tier T3
  "unmapped": ["New DA name with no spec"]                                     // shown on /admin
}
```

### 3.3 `RecipeLine`: the contract the cost layer needs from the parse layer

```ts
interface RecipeLine {
  ingredientId: number;
  label: string;                 // rawText for display
  kind: "ingredient" | "header" | "equipment" | "noise";
  role: "main" | "aromatic" | "seasoning" | "to_taste" | "frying_medium" | "garnish" | "optional" | "water";
  qtyG?: number;                 // weight (or volume converted with density)
  qtyMl?: number;                // kept when the source unit was volumetric
  count?: number;                // kept when the source was a count (2 eggs, 1 head garlic)
  countUnit?: "piece" | "head" | "clove" | "bunch" | "pack";
  qtyBasis: "AP" | "EP";
  apG?: number;                  // precomputed
  family?: string;               // DA family (from the matcher)
  refKey?: string;               // T2 key if not on DA
  hint?: string[];               // variant words from rawText, read BEFORE stopword removal: native|local|imported|frozen|large|coconut|brown|white...
  qtyAssumed: boolean;           // to-taste default, unknown unit, or missing amount
  matchConf?: number;
  parserVersion: number;
}
```

Cost only needs **four role distinctions**:
- **water**: ₱0.
- **optional**: excluded from the total and shown as "+₱x".
- **frying_medium**: use factor below 1.
- **to_taste**: default quantity.

Every other role is charged 100%. Marinades and salt in boiling water are charged in full because you used them up. Only nutrition has to reduce them.

### 3.4 Constants (one block in `docs/cost.js`)

```js
const COST = {
  WINDOW_DAYS: 28, REF_OBS: 5, OUTLIER_LO: 0.4, OUTLIER_HI: 2.5,
  STATUS_DAYS: { fresh: 3, aging: 10 },            // >10 → stale; outside window → expired
  TREND_PREV_DAYS: [7, 13], TREND_PCT: 0.05,
  FRY_REUSE: 3, FRY_DEFAULT_ML: 720, FRY_MIN_ML: 240,
  ABSORB: { plain: 0.05, starchy: 0.08, battered: 0.12, wrapped: 0.15 },  // fraction of raw food weight
  TO_TASTE_PER_SERVING: { salt_g: 1.0, pepper_g: 0.25, sugar_g: 2.0, fish_sauce_ml: 3, soy_sauce_ml: 3 },
  BUY_INC_G: { default: 250, SPICES: 100, RICE: 1000 },
  RANK_MIN_COVERAGE: 0.70, SERVINGS_DEFAULT: 4, SERVINGS_MAX: 24,
};
```

---

## 4. Price unit semantics → ₱/g, ₱/ml, ₱/pc

### 4.1 Parse rules (first match wins; applied to the DA name)

| Rule | Regex (case-insensitive) | basis | size |
|---|---|---|---|
| R1 | `(\d+(?:\.\d+)?)\s*ml\s*/\s*(bottle|pack|pouch)` | bottle | sizeMl = x |
| R2 | `(\d+(?:\.\d+)?)\s*(liters?|litres?|L)\s*/\s*(bottle|pack|pouch)` | bottle | sizeMl = 1000x |
| R3 | `(\d+)\s*-\s*(\d+)\s*(grams?|g)\s*/\s*(pc|piece)` | piece | sizeG = midpoint |
| R4 | `(\d+(?:\.\d+)?)\s*(grams?|g)\s*/\s*(pc|piece|pack)` | piece/pack | sizeG = x |
| R5 | `(\d+(?:\.\d+)?)\s*(kg|kilos?)\s*/\s*(pack|bag|sack)` | pack | sizeG = 1000x |
| R0 | anything else (including `20-40% bran streak`, `8-10 cm diameter`, `3-4 Small Bundles`) | **kg** | — |

If R0 fires on a name containing `bundle|bunch|tie|head|pc`, set `needsReview: true`. These are almost certainly size or grade descriptors, but someone should confirm against one PDF.

Attribute extraction, done separately: `local|imported|native|frozen|fresh|white|brown|red|pewee|small|medium|large|extra large|jumbo|palm|coconut`.

Applied to the names in the facts:

| DA name | Rule | basis | size | g per basis unit |
|---|---|---|---|---|
| Chicken Egg (White, Medium) 56-60 grams/pc | R3 | piece | 58 g | 58 |
| Cooking Oil (Coconut) 1 Liter/bottle | R2 | bottle | 1000 ml | 920 (×0.92) |
| Red Onion, Imported Large | R0 | kg | — | 1000 |
| Garlic, Imported / Pechay Baguio / Squash Suprema Variety / Sugar (Brown) / Pork Chop, Imported | R0 | kg | — | 1000 |
| Regular Milled 20-40% bran streak | R0 (the % is ignored) | kg | — | 1000 |
| Mackerel, Imported Frozen, Whole Round | R0 + attrs [imported, frozen] | kg | — | 1000 |
| Broccoli, Local Medium (8-10 cm diameter/bunch hd) | R0 + needsReview | kg | — | 1000 |
| Eggplant 3-4 Small Bundles | R0 + needsReview | kg | — | 1000 |

### 4.2 Normalization formulas

Let `P` be the reference price in ₱ per basis unit (§8).

```
gramsPerBasis = 1000 (kg) | sizeG (piece, pack) | sizeMl × density (bottle)
perG  = P / gramsPerBasis
perMl = P / sizeMl                    (bottle only)
perPc = P                             (piece only)
```

Densities in g/ml (approximate, from USDA FoodData Central household measures): cooking oil 0.92 (1 cup ≈ 218 g), soy sauce 1.08, fish sauce 1.2, vinegar 1.01, oyster sauce 1.2, coconut milk 1.0.

### 4.3 Same-dimension shortcut

- If the line has `count` and the variant is per piece: `cost = count × perPc`.
- If the line has `qtyMl` and the price is per ml: `cost = qtyMl × perMl`.
- Otherwise use grams.

This avoids density round-trip error. "2 tbsp vinegar" never goes through grams.

### 4.4 Sanity bands (hard filter on each observation; generous, to catch PDF parse errors)

| Category keyword in the DA header | ₱ per basis unit |
|---|---|
| RICE | 25–120 /kg |
| CORN | 15–150 /kg |
| FISH | 60–900 /kg |
| BEEF / PORK / POULTRY / LIVESTOCK / MEAT | 100–900 /kg |
| VEGETABLE | 10–500 /kg |
| SPICE | 20–1,500 /kg (labuyo spikes) |
| FRUIT | 15–500 /kg |
| Other, kg | 20–300 |
| Piece (eggs) | 3–20 /pc |
| Bottle | 50–400 per litre, scaled by sizeMl/1000 |

---

## 5. As-purchased quantity (EP → AP)

You pay for bones, peel and shells. FNRI values are per 100 g EP. So cost uses AP and nutrition uses EP, and the conversion direction depends on how the recipe stated the quantity.

| Recipe form | qtyBasis | Example | AP grams |
|---|---|---|---|
| Weight unit (g/kg/lb/oz), no prep word | AP | "2 lbs chicken, cut into serving pieces" | `qtyG` |
| Weight plus a yield word (`boneless`, `fillet`, `deboned`, `peeled`, `deveined`, `shelled`) while the DA family is sold whole | EP | "1 lb shrimp, peeled and deveined" | `qtyG / edibleFrac` |
| Count (pc, whole, head, bulb, or no unit) | AP | "1 onion", "1 head garlic" | `count × pieceG_AP` |
| Garlic clove | EP | "5 cloves garlic" | `count × 3 g / 0.87` |
| Volume of chopped, minced, sliced or grated produce | EP | "1 cup chopped onion" | `qtyG / edibleFrac` |
| Oil, sugar, flour, rice, condiments, liquids | AP = EP | — | `qtyG` |

### Edible fraction defaults (approximate)

These come from the USDA SR "refuse" field family and should be **replaced by FNRI "Edible portion" %** once that column is scraped. That means adding `ediblePortionPct Float?` to `NutritionFact` and linking each family through `fnriRawCode`.

| Family | edibleFrac | Family | edibleFrac |
|---|---|---|---|
| Whole chicken (dressed) | 0.68 | Onion bulb | 0.90 |
| Chicken leg quarter | 0.75 | Garlic bulb | 0.87 |
| Chicken wings | 0.55 | Ginger | 0.93 |
| Pork belly (liempo, skin-on) | 0.95 | Carrot | 0.89 |
| Pork kasim/pigue (boneless) | 0.98 | Potato (peeled) | 0.80 |
| Pork chop (bone-in) | 0.80 | Tomato | 0.95 |
| Beef cuts (default) | 0.90 | Cabbage | 0.80 |
| Bangus, whole | 0.60 | Bell pepper | 0.82 |
| Galunggong / tilapia / alumahan, whole | 0.55 | Eggplant | 0.81 |
| Shrimp, head-on | 0.50 | Squash (kalabasa) | 0.70 |
| Squid | 0.80 | Ampalaya | 0.85 |
| Chicken egg (in shell) | 0.88 | Sitaw / habichuelas | 0.88 |
| Banana saba | 0.65 | Pechay / leafy greens | 0.85 |
| Calamansi (juice yield) | 0.35 | Rice, sugar, oil, flour, salt | 1.00 |

Category defaults for unreviewed rows: FISH 0.55, MEAT/POULTRY 0.85, VEGETABLE 0.85, SPICE 0.88, FRUIT 0.70, everything else 1.0.

### Piece weights (AP) used when a count meets a per-kg price

These are defaults; the parse layer may override them. They're approximate USDA household weights adjusted to PH market sizes:
- garlic head: 40 g (clove: 3 g EP)
- red onion, medium: 70 g (white/yellow onion: 110 g)
- tomato: 80 g
- long eggplant: 100 g
- potato: 150 g
- carrot: 70 g
- bell pepper: 120 g
- calamansi: 10 g
- siling labuyo: 1 g
- ginger "thumb": 20 g
- dried bay leaf: 0.2 g

Egg weight comes from the DA name itself (58 g for medium).

---

## 6. Used vs eaten: roles and use factors

| Role | Detection (rawText, name, instructions) | usedQty (cost) | needQty (shopping) | Missing amount |
|---|---|---|---|---|
| main / aromatic / seasoning / garnish | default | AP | AP | parse default, `qtyAssumed` |
| water | exact token set {water, ice, ice cubes, hot water} on the **tokenized** name (never substring) | 0 | 0 | — |
| optional | `\(optional\)` or `optional` in rawText | 0 in the total, shown as "+₱x" | listed, ₱0 | — |
| to_taste | `to taste`, `as needed`, or no amount on salt/pepper/sugar/patis | `TO_TASTE_PER_SERVING × S` | same | always assumed |
| frying_medium | oil family AND (`for (deep[- ]?)?fry(ing)?` in rawText OR (qtyMl ≥ 240 AND instructions match `deep[- ]?fr(y|ied)\|fry .* until (golden\|crisp)`)) AND V ≥ 240 ml | formula below | V | V = 720 ml |
| pan oil | oil that isn't frying_medium (including "for frying" with V < 240 ml, which is shallow frying) | full | full | 2 tbsp |
| marinade / boiling salt | no detection needed for cost | full | full | — |
| header / equipment / noise | kind ≠ ingredient ("Cooking Procedure", "Marinade ingredients:", "can", "pack", "Aluminum foil") | skipped | skipped | — |

"Salt and pepper to taste" (153 uses) is split by the parser into two to_taste lines.

### Frying-oil formula

```
V  = oil volume (ml) on the line, or 720 ml if unspecified (flag qtyAssumed)
F  = raw AP grams of the food being fried
     = apG of the heaviest solid line, plus any flour/cornstarch/breadcrumb/wrapper lines
α  = ABSORB[class]:
       plain    0.05   whole meat/fish, unbreaded (lechon kawali, pritong isda)
       starchy  0.08   potato, kamote, saba
       battered 0.12   flour/cornstarch dredge or batter (calamares, fried chicken)
       wrapped  0.15   lumpia, turon, empanada
A  = min(V, α × F / 0.92)                ml of oil absorbed (eaten → nutrition)
R  = reuse count (default 3; UI toggle 1 = single use)
usedOil_ml = A + (V − A) / R             charged to cost
needOil_ml = V                           shopping
```

The α values are approximate engineering defaults inside the published deep-fat-frying uptake range (roughly 3–40% depending on surface and coating; see the Bognár 2002 / oil-uptake review family). They should be revisited if a better per-dish source appears.

---

## 7. Two numbers: cost of what you use vs shopping cost

### Cost of what you use (headline; drives sort, filters and the Sulit Score)

```
used_i       = usedQty_i (in the variant's unit) × unitPrice_v
recipeUsed   = Σ used_i   over priced lines whose role ∉ {optional, water}
perServing   = recipeUsed / S
S            = servings if 1 ≤ servings ≤ 24, else 4 (flag "servings assumed")
```

`unitPrice_v` comes from the variant chosen in §9. For pantry packs this is the pro-rated price: soy sauce at ₱/ml, not a bottle.

### Shopping cost (basket, per recipe; never divided by servings)

1. Merge lines by family. For example, garlic in the sauce and garlic in the garnish become one need.
2. For each family `f`, over the eligible variants `v` (fresh or aging, restricted by any hint):

```
shop_f = min over v of  ceil(need_v / inc_v) × inc_v × unitPrice_v
```

Increments:
- kg basis: `inc` in grams. Meat, fish, vegetables, fruit and sugar: 250 g. SPICES: 100 g. RICE: 1,000 g.
- piece: 1 pc.
- bottle: one whole bottle (`sizeMl`), so the 350 ml and 1 L bottles compete.
- REF: one pack.

```
shoppingFresh  = Σ shop_f where pantry = false
shoppingPantry = Σ shop_f where pantry = true
```

Pantry families: cooking oil, sugar, salt, pepper and peppercorn, soy sauce, vinegar, fish sauce, oyster sauce, bay leaf, cornstarch, all-purpose flour, seasoning granules and cubes, garlic powder, sesame and olive oil. Garlic, onion and butter are **not** pantry, because people buy them per dish.

Display: **"Shopping: ₱214 for fresh items · +₱139 if you also need pantry staples."**

Used cost deliberately takes the lowest per-unit price (the bulk bottle). Shopping cost takes the cheapest *total*, which is often the small bottle. Both are correct answers to different questions.

---

## 8. Price over time (continuous daily DA)

For each commodity `c`, with `asOf` = max sourceDate across the table:

```
obs   = valid rows: price ≠ null, inside the sanity band, asOf − 27 ≤ date ≤ asOf   (date strings, Manila report dates)
if obs empty → status "expired" → this variant is unavailable (fall through to other variants or tiers)
m28   = median(obs)
clean = obs where 0.4·m28 ≤ p ≤ 2.5·m28
        BUT if ≥3 of the last 5 obs fall outside the band, keep obs as-is (genuine regime change, e.g. a labuyo spike)
ref   = median(last 5 of clean)                          ← the price used for cost
latest, lastSeen = last of clean
age   = asOf − lastSeen (days)   → fresh ≤3 · aging 4–10 · stale 11–27 (used, ⚠)
prevRef  = median(clean where asOf−13 ≤ date ≤ asOf−7)    (null if none)
trendPct = (ref − prevRef)/prevRef → up > +5%, down < −5%, flat otherwise, unknown if prevRef is null
min28/max28 shown in the tooltip
```

Why "last 5 observations" and not "last 7 calendar days": DA publishes about 5 days a week, so this gives the same result as a 7-day median while weekends, holidays and `n/a` days need no special handling.

Site-wide freshness: `lagDays = today(Asia/Manila) − asOf`. If lagDays > 3, show a banner: "DA prices last updated Oct 9. The scraper may be behind."

Recipe trend, over T1 lines that have a prevRef:

```
ΔR = Σ used_i·(ref_i − prev_i) / Σ used_i·prev_i
```

Show "↑ 8% vs last week" when |ΔR| ≥ 5%.

The price table keeps showing latest vs previous day (the existing behavior), and adds the 7-day reference and status.

---

## 9. Multiple DA variants per ingredient

The matcher resolves an ingredient to a **family** (aliases are indexed at family level). The cost layer then picks the variant:

1. **Recipe hint.** If `hint` matches a variant's attrs and that variant isn't expired, use it. Hints are read from rawText before stopword removal. Examples: "native garlic" → Garlic Native; "coconut oil" → Coconut; "large eggs" → Large 61-65 g; "white onion" or "yellow onion" → white onion, flagged "substituted".
2. **Curated default.** If the family has an `isDefault` variant, use it:
   - `egg_chicken` → White Medium. Recipes assume a standard egg, and the size changes the per-piece price.
   - `oil_cooking` → Palm, cheapest per ml among its bottles.
   - `sugar_white` → Refined.
   - `chicken` (generic) → Whole Chicken, local. "Cut into serving pieces" implies a whole bird; cut words (thigh, leg, breast, wings) select the cut families instead.
3. **Otherwise** use the **cheapest perG among fresh/aging variants whose attrs exclude `frozen`**. Stale variants are used only if none is fresh. In practice this picks imported garlic and imported red onion when they're cheaper, which matches what most NCR households buy.
4. **Always** compute `rangePerG = [min, max]` across non-expired variants, frozen included, and show it: "Garlic ₱2.41 (₱2.41–6.03 depending on type)".

Optional "Budget mode" toggle: rule 3 without the frozen exclusion, and hints only for explicit "native" or "local".

---

## 10. Fallbacks, coverage and ranking

| Tier | Source | When | UI |
|---|---|---|---|
| T1 DA | §8 reference price | family matched and a non-expired variant exists | `₱x`, plus ⚠ if stale |
| T2 REF **(optional, recommended)** | `ref-prices.json`, about 30 staples, pack price from the DTI SRP bulletin or a receipt, with an `asOf` date | non-DA staple with a `refKey` | `₱x†` "reference price, Feb 2025" |
| T3 CAT **(optional)** | median perG of fresh kg-basis items in the same DA vegetable or fruit category | the line is a fresh vegetable or fruit (FNRI food group or family list) with a weight or count quantity, and no T1/T2 | `~₱x` "estimated from Lowland Vegetables average" |
| T4 NONE | — | everything else, including brand items not in REF | "—" and listed under "Not priced" |

T3 is never used for fish, meat or brand items. Their within-category variance (₱250/kg fresh fish vs ₱600+/kg dilis) would mislead, so "unpriced" is the honest answer.

Proposed T2 keys:

| Group | Keys |
|---|---|
| Condiments and sauces | soy_sauce, vinegar_cane, fish_sauce, oyster_sauce, tomato_sauce, banana_ketchup |
| Salt and spices | salt_iodized, black_pepper_ground, peppercorn_whole, bay_leaf, garlic_powder, star_anise, annatto_powder |
| Baking and starches | flour_ap, cornstarch, baking_powder |
| Dairy | butter, evaporated_milk, condensed_milk, fresh_milk, cheese_processed |
| Coconut | coconut_milk |
| Seasonings (generic names, no brand on the site) | bouillon_chicken_cube, bouillon_pork_cube, bouillon_beef_cube, liquid_seasoning, seasoning_granules, msg |
| Oils | sesame_oil, olive_oil |

Broth lines (94 chicken, 91 beef) can be priced as cubes: `cubes = ml / 500`, flagged "priced as bouillon cube".

Coverage and rankability:

```
P        = lines with kind = ingredient and role ∉ {water, optional}
coverage = |lines in P priced by T1/T2/T3| / |P|
mainLine = the line in P with the largest apG, excluding liquids
rankable = mainLine priced by T1 or T2 AND coverage ≥ 0.70
```

- coverage = 1 → "₱49/serving".
- coverage < 1 → "₱49+/serving · 2 not priced". The "+" marks a lower bound.
- Not rankable → "Incomplete price" badge. The recipe is sorted last in "Cheapest per serving" and excluded from the Sulit Score leaderboard.

---

## 11. `docs/cost.js` (shared UMD module, like matcher.js)

```js
SarapCost.recipeCost(recipe, prices, opts = { fryReuse: 3, includeOptional: false, variantMode: "default" })
  → { usedTotal, perServing, servings, servingsAssumed,
      shoppingFresh, shoppingPantry, coverage, rankable, trendPct,
      unpriced: [label], flags: [...], lines: [lineResult] }

lineResult = { tier: "DA"|"REF"|"CAT"|"NONE"|"SKIP", variantName, unitLabel: "/kg"|"/pc"|"/bottle"|"/pack",
               usedQty, usedUnit, needQty, used, rangeUsed: [lo, hi], status, flags: ["stale","assumed_qty","substituted","frying_reuse_3"] }

function lineUsedQty(line, v, ctx):
  // pick the dimension: count → pcs, qtyMl → ml, otherwise grams
  if v.basis === "piece" && line.count != null:   q = line.count                      // pcs
  else if v.perMl && line.qtyMl != null:           q = line.qtyMl                      // ml
  else { g = line.apG ?? apFrom(line, v); q = toVariantUnit(g, v) }                    // g → g | pcs (g/sizeG) | ml (g/density)
  if line.role === "frying_medium": q = fryUsed(q, ctx)                                // §6
  return q
```

Interim, before the parse workflow lands: derive `count`, `qtyMl`, `qtyG`, `qtyBasis` and `role` in the browser from amount, unit, name and rawText with the regexes above. This requires adding `rawText: true` to the `/api/recipes` select. Count units are {none, pc(s), piece(s), whole, head, bulb, clove}. Volume units are cup 240, tbsp 15, tsp 5 ml.

---

## 12. Worked examples

The prices below are **illustrative 7-day reference values**. Plug in live `/api/prices` values; the formulas and structure are the point.

DA (T1):

| Commodity | Price |
|---|---|
| Whole Chicken, Local | ₱200/kg (DA Bantay Presyo NCR, May 2024 avg: ₱189) |
| Pork Belly (Liempo), Local | ₱390/kg (May 2024 avg: ₱379) |
| Garlic, Imported | ₱140/kg |
| Garlic, Native | ₱350/kg |
| Cooking Oil (Palm) 1 L/bottle | ₱100 |
| Cooking Oil (Palm) 350 ml/bottle | ₱40 |
| Cooking Oil (Coconut) 1 L/bottle | ₱180 |
| Sugar (Refined) | ₱85/kg |
| Chicken Egg (White, Medium) | ₱8/pc |
| Eggplant | ₱90/kg |

Exact DA names for the chicken, liempo, palm-oil and refined-sugar rows are assumed and must be checked against real `Commodity.name` values.

REF (T2):

| Item | Pack price | Per unit | Status |
|---|---|---|---|
| Soy sauce | 350 ml ₱19.75 | ₱0.0564/ml | DTI SRP, 1 Feb 2025 |
| Vinegar | 350 ml ₱18 | ₱0.0514/ml | placeholder |
| Iodized salt | 250 g ₱10 | ₱0.04/g | placeholder |
| Whole peppercorn | 25 g ₱25 | ₱1.00/g | placeholder |
| Bay leaves | 10 g ₱15 | ₱1.50/g | placeholder |

Placeholders should be filled from the DTI bulletin.

### 12.1 Chicken adobo (Panlasang Pinoy-style card, 4 servings)

Verify the lines against the DB row before freezing this as a test fixture.

| # | Line | Role | Quantity → used | Source / variant | Used ₱ | Shopping (unit bought) | Pantry |
|---|---|---|---|---|---|---|---|
| 1 | 2 lbs chicken, cut into serving pieces | main | weight ⇒ AP 907.2 g | T1 Whole Chicken ₱0.200/g | **181.44** | 1,000 g (4×250 g) → 200.00 | no |
| 2 | 3 pieces dried bay leaves | aromatic | 3 × 0.2 g = 0.6 g | T2 ₱1.50/g | 0.90 | 1 pack → 15.00 | yes |
| 3 | 4 tbsp soy sauce | seasoning | 60 ml (same-dimension) | T2 ₱0.0564/ml | 3.39 | 350 ml → 19.75 | yes |
| 4 | 2 tbsp white vinegar | seasoning | 30 ml | T2 ₱0.0514/ml | 1.54 | 350 ml → 18.00 | yes |
| 5 | 5 cloves garlic, crushed | aromatic | EP 15 g ⇒ AP 15/0.87 = 17.2 g | T1 Garlic Imported (cheapest) ₱0.140/g; range to Native ₱6.03 | 2.41 | 100 g (SPICES) → 14.00 | no |
| 6 | 1 1/2 cups water | water | — | — | 0 | — | — |
| 7 | 3 tbsp cooking oil | pan oil | 45 ml, used in full | T1 Palm 1 L ₱0.100/ml (lowest per ml) | 4.50 | min(350 ml ₱40, 1 L ₱100) → 40.00 | yes |
| 8 | 1 tsp white sugar | seasoning | 4.2 g | T1 Sugar Refined (family default) ₱0.085/g | 0.36 | 250 g → 21.25 | yes |
| 9 | 1/2 tsp salt (optional) | optional | 3 g | T2 ₱0.04/g | (+0.12) | listed, ₱0 | yes |
| 10 | 1 tsp whole peppercorn | aromatic | 2.9 g | T2 ₱1.00/g | 2.90 | 25 g → 25.00 | yes |

- **Used total ₱197.44 → ₱49.36, displayed ₱49/serving.** Coverage is 8/8 priceable lines, so the recipe is rankable.
- **Shopping: ₱214.00 for fresh items (chicken, garlic) + ₱139.00 pantry staples = ₱353.00.**
- Current code (DA only, SM removed): ₱193.47 (₱48/serving). Chicken dominates, so the headline barely moves. What this dish gains is correctness of composition: soy sauce, vinegar, bay leaves and peppercorn are priced; oil is palm, not coconut; and the shopping view and coverage flag are new.
- Nutrition note: chicken EP = 907.2 × 0.68 = 617 g, while cost uses 907.2 g.

### 12.2 Lechon kawali (Panlasang Pinoy-style card, 6 servings)

Verify the lines against the DB row.

Frying-oil calculation:
- V = 4 cups = 960 ml (240 ml cup, as in the parser).
- F = 1,360.8 g of pork belly, class plain, so α = 0.05.
- A = 0.05 × 1,360.8 = 68.0 g ÷ 0.92 = 74.0 ml absorbed.
- R = 3, so usedOil = 74.0 + (960 − 74.0)/3 = **369.3 ml**.

| # | Line | Role | Quantity → used | Source | Used ₱ | Shopping | Pantry |
|---|---|---|---|---|---|---|---|
| 1 | 3 lbs pork belly | main | AP 1,360.8 g | T1 Liempo Local ₱0.390/g (frozen excluded from default) | **530.71** | 1,500 g (6×250 g) → 585.00 | no |
| 2 | 8 cups water (for boiling) | water | — | — | 0 | — | — |
| 3 | 2 tbsp salt | seasoning (boiling) | 36 g, charged in full | T2 ₱0.04/g | 1.44 | 250 g → 10.00 | yes |
| 4 | 1 tbsp whole peppercorn | aromatic | 8.7 g | T2 ₱1.00/g | 8.70 | 25 g → 25.00 | yes |
| 5 | 6 pieces dried bay leaves | aromatic | 1.2 g | T2 ₱1.50/g | 1.80 | 15.00 | yes |
| 6 | 1 head garlic, crushed | aromatic | count ⇒ AP 40 g | T1 Garlic Imported ₱0.140/g | 5.60 | 100 g → 14.00 | no |
| 7 | 4 cups cooking oil (for frying) | frying_medium | need 960 ml, used 369.3 ml | T1 Palm 1 L ₱0.100/ml | 36.93 | min(1×1 L ₱100, 3×350 ml ₱120) → 100.00 | yes |

- **Used total ₱585.18 → ₱97.53, displayed ₱98/serving.** With oil counted as single use (R = 1): ₱644.25 → ₱107/serving.
- **Shopping: ₱599 for fresh items + ₱150 pantry = ₱749.**
- Current code: ₱773.51 (₱129/serving). The "1 head" = 500 g garlic adds ₱70, and 960 g of coconut oil adds ₱172.80, while salt, peppercorn and bay are unpriced. **The new model is 24% lower and explains why.**
- Nutrition asymmetry: only A ≈ 68 g of oil is eaten, about 100 kcal/serving. Today the code counts all 960 g, about 1,414 kcal/serving.

### 12.3 Mini example: per-piece eggs (tortang talong, 4 servings)

| Line | Quantity → used | Used ₱ |
|---|---|---|
| 4 eggplants | 4 × 100 g = 400 g × ₱0.090/g | 36.00 |
| 3 eggs | count × ₱8.00/pc (same-dimension) | 24.00 |
| 1/4 cup oil (pan) | 60 ml × ₱0.10 | 6.00 |
| Salt and pepper to taste | 4 g salt (₱0.16) + 1 g pepper (₱1.00), assumed quantities | 1.16 |

- Total ₱67.16 → **₱17/serving**.
- Current code: ₱48.24 → ₱12/serving. The eggs come to ₱1.44 instead of ₱24.

---

## 13. UI changes (docs/index.html)

- **Card:** "₱49/serving" (or "₱49+"), with a small "DA Oct 12" label. Add an "Incomplete price" badge when the recipe is not rankable.
- **Modal cost panel:**
  - "Cost of what you use: ₱197 · ₱49/serving"
  - "Shopping: ₱214 fresh + ₱139 pantry"
  - Toggle: "Frying oil: reused 3× / single use"
  - "↑ 8% vs last week" when the recipe trend is at least 5%
- **Ingredient row**, with the unit label taken from basis:
  - "Garlic, Imported — ₱140/kg (7-day) · 17 g as bought · ₱2.41 (₱2.41–6.03)"
  - "Chicken Egg (White, Medium) — ₱8.00/pc · 3 pc · ₱24.00"
  - "Cooking Oil (Palm) 1 L — ₱100/bottle · 369 of 960 ml used · ₱36.93"
- **Flag legend:** ⚠ stale (shows days since last DA price) · † reference price (shows date) · ~ category estimate · "qty assumed".
- **Calculator:** use the basis label, and ask for pieces or bottles for non-kg items.
- **Rounding:** compute at full precision. Show lines to ₱0.01 (or "<₱0.10" for tiny amounts) and per-serving and totals to the nearest peso.

---

## 14. Implementation plan (one developer, about 5–6 days of core work)

1. **(0.5 d) Quick fixes**
   - Make `isNonPriceable` exact-phrase on tokens: water/ice tokens only, and drop `pepper`, `powder`, `clove`, `peel`, `flower`, `sage` and `stock`/`broth` from the list, because roles and REF handle them.
   - Remove the SM line-cost fallback.
   - Add `rawText` to `/api/recipes`.
   - Fix the "/kg" labels.
2. **(1 d) `scripts/gen-commodity-spec.ts`**
   - Read the distinct `Commodity.name` + `category`, apply §4.1 and the category defaults, and write `src/data/commodity-spec.json`.
   - **(Optional)** Give the 244 names to `claude-sonnet-5-5` once, at temperature 0, to propose family/variant/edibleFrac/pantry. Then review the diff by hand. It costs under $1 and never runs at runtime.
3. **(1 d) `src/lib/prices.ts` + `GET /api/prices`**
   - Implement the §8 aggregation and the family grouping.
   - Return `unmapped` names for /admin.
   - Set `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`.
4. **(1.5 d) `docs/cost.js` + enrichRecipe wiring + UI** (§§6–7, 9–11, 13), using interim line derivation in the browser.
5. **(0.5 d, optional, recommended) `src/data/ref-prices.json`** with about 30 staples from the DTI SRP bulletin. Refresh quarterly.
6. **(After the parse workflow)** Switch to precomputed `RecipeLine`s with apG, count, qtyMl, role and family, generated by a local Node script with `createMany` batches of 1,000.
7. **(Optional)**
   - T3 category medians.
   - "Budget mode".
   - A `RecipeCostSnapshot(recipeId, date, perServing, shoppingFresh, coverage)` table written nightly (3 `createMany` batches) for dish price-history charts.
   - FNRI EP% scrape replacing the edibleFrac defaults.

### Tests (`node --test`, no new dependencies)

- **Spec regex:** every name listed in §4.1 resolves to the expected basis and size.
- **Aggregation:**
  - Weekend gaps.
  - An `n/a` streak.
  - A single ×10 decimal-shift outlier is dropped.
  - A 3-day genuine spike is kept.
  - Last seen 12 days ago gives "stale"; 30 days ago gives "expired".
- **Worked examples:** §12.1–12.3 as fixtures with fixed prices, asserting ₱197.44 / ₱585.18 / ₱67.16 and shopping ₱353 / ₱749 to ±₱0.01.
- **Variants:**
  - "native garlic" picks Native.
  - "eggs" picks Medium.
  - "cooking oil" picks Palm.
  - "coconut oil" picks Coconut.
  - "granulated white sugar" picks Refined.

---

## 15. Reference values: provenance and confidence

| Value | Source family | Confidence |
|---|---|---|
| Densities, household measures (cup oil 218 g, tbsp salt 18 g, tbsp soy sauce 16 g, garlic clove 3 g, tsp sugar 4.2 g) | USDA FoodData Central / SR household weights | Good (approximate) |
| Refuse / edible fractions (§5) | USDA SR refuse %, from memory | Approximate. Replace with FNRI E.P. % |
| Frying absorption α (0.05–0.15) and reuse R = 3 | Bognár 2002 and the deep-fat-frying oil-uptake review literature; R is a household-behavior assumption | Low. These are tunable defaults |
| PH piece weights (onion 70 g, garlic head 40 g, eggplant 100 g) | USDA weights adjusted to PH market sizes | Approximate. The data profile should confirm them |
| Illustrative prices | DA Bantay Presyo NCR, May 2024 (whole chicken ₱189.14/kg, liempo ₱379.03/kg, kasim ₱338.26/kg); DTI SRP 1 Feb 2025 (soy sauce 350 ml ₱19.75, patis 350 ml ₱27.00) | Illustrative only. Live DA values replace them |

## Sources

- DA web release reporting Bantay Presyo NCR averages for May 20–25, 2024 (found via search): https://da.gov.ph/?p=80026
- DTI BNPC SRP Bulletin, 1 Feb 2025: https://esigaw.dti.gov.ph/wp-content/uploads/2025/02/BNPC-SRP-BULLETIN-01-FEBRUARY-2025.002.pdf
- Review of oil uptake mechanisms in deep-fat frying: https://hal.archives-ouvertes.fr/hal-01194942
- Oil absorption kinetics in deep-fried pork skin: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8702101/


**Key decisions:**
- Normalize every DA row to ₱ per basis unit (kg default; piece/bottle/pack parsed from names like '56-60 grams/pc' and '1 Liter/bottle'), derive ₱/g, ₱/ml and ₱/pc, and cost each line in its own dimension (count×₱/pc, ml×₱/ml, g×₱/g) to avoid density round-trip error.
- Use a curated, version-controlled scraper-backend/src/data/commodity-spec.json (~244 rows: family, variant, basis, size, edibleFrac, buyIncrement, pantry, sanity band). Generate it by regex plus category defaults, optionally pre-fill it once with claude-sonnet-5-5, then review it by hand. Unknown new names go to an 'unmapped' list on /admin.
- Charge cost on as-purchased grams. Weight and count quantities in recipes are AP; chopped/minced volumes and garlic cloves are EP, converted with AP = EP / edibleFrac. edibleFrac defaults come from USDA-style refuse values and are later replaced by the FNRI 'Edible portion' % (add ediblePortionPct to NutritionFact).
- Split usedQty (cost) from eatenQty (nutrition). Cost needs only four role distinctions: water = 0; optional excluded and shown as +₱; to_taste uses per-serving defaults; frying_medium uses usedOil = A + (V−A)/R with R = 3 reuses by default (toggle for single use), A = α×food weight, α = 0.05/0.08/0.12/0.15 by coating class, and V = 720 ml when unspecified. Marinades and boiling salt are charged in full.
- Show two numbers: 'cost of what you use' (pro-rated at the lowest per-unit price; drives per-serving, sort and Sulit Score) and 'shopping cost' (cheapest whole-pack or market-increment total per family: 250 g default, 100 g for spices, 1 kg for rice, 1 pc, 1 bottle), split into fresh items vs pantry staples.
- Reference price = median of the most recent 5 valid observations inside a 28-day window, after a sanity band and a 0.4–2.5× m28 outlier filter (skipped if 3 of the last 5 are out of band, i.e. a regime change). Staleness: fresh ≤3 d, aging ≤10, stale ≤27 (used with ⚠), then expired. Trend compares against the median of days 7–13 with a ±5% threshold. Show a site banner if the DA lag is over 3 days.
- Match ingredients to families, not DA rows. Variant precedence: recipe hint (read before stopword removal), then the curated family default (egg→White Medium, oil→Palm, white sugar→Refined, generic chicken→Whole), then the cheapest fresh non-frozen variant. Always show the min–max range; Budget mode is optional.
- Fallback tiers: T1 DA, then T2 curated DTI-SRP reference prices for about 30 staples (optional, recommended), then T3 category median for fresh vegetables and fruit only (optional), then T4 unpriced. Every tier is flagged. A recipe is rankable only if its main ingredient is priced (T1/T2) and coverage is at least 70%; otherwise it shows 'Incomplete price' and sorts last.
- Cadence: recipe lines (grams, roles, families, apG) are precomputed once per parser version by a local script. GET /api/prices is computed on read from about 28 days of Commodity rows and CDN-cached (s-maxage=3600), so no new tables or daily writes. Cost is joined in the browser by a shared docs/cost.js (UMD like matcher.js) so toggles re-cost instantly. A PriceRef table and a RecipeCostSnapshot table are optional later additions.
- Ship the quick fixes first: make isNonPriceable token-exact (the substring match currently excludes rice, juices, sliced meat, bell pepper, cauliflower, sausage and peeled shrimp), remove the SM package-price fallback, add rawText to /api/recipes, and fix the '/kg' labels for per-piece and per-bottle items.
- Worked examples with illustrative prices: chicken adobo ₱197.44 total, ₱49/serving, shopping ₱214 fresh + ₱139 pantry. Lechon kawali ₱585.18 total, ₱98/serving (₱107 with single-use oil), vs ₱129 from the current code. Tortang talong eggs ₱24 vs ₱1.44 in the current code.

## SarapSulit recipe compilation pipeline: static nutrition, read-time cost, review loop, validation, rollout

# SarapSulit: recipe compilation pipeline and data architecture

Scope: where the transformation runs, the data structures it writes, how it is versioned, validated and reviewed, and how to roll it out. The unit, density and cooking-rule *values* are owned by the other workstreams. This document ships **v1 defaults** (rules `r1`) so the pipeline works end to end, and every number in it can be replaced through the files described below.

Grounding (read from the repo): `docs/index.html` `enrichRecipe()` runs `docs/matcher.js` over full dumps of `/api/recipes`, `/api/nutrition`, `/api/commodities` and `/api/store-prices`. The backend is `scraper-backend` (Next 16, Prisma 7 with `@prisma/adapter-pg`). Its chunked jobs use `ScrapingLog.cursor`, and the admin page re-POSTs while `done=false`. The DA scraper already replaces a whole day in one transaction (`deleteMany` + `createMany`). The `POST /api/scrape/*` routes have **no auth**. `platform/` is a legacy Next 14 app and gets no new work.

---

## 0. Decisions in one screen

| # | Decision |
|---|---|
| 1 | **Compile offline, serve precomputed results.** A pure TypeScript compiler (`scraper-backend/src/lib/compile/`) turns every recipe into `CompiledLine` rows (ingredient, FNRI food, grams AP/EP/eaten/costed, role, consumed fraction, confidence, flags) and one `CompiledRecipe` row (per-serving nutrition, coverage, grade, cost basis). The browser stops matching. |
| 2 | **Static and continuous parts are split on purpose.** Nutrition is static: it changes only when recipes, FNRI, mappings or rules change, and it is stored. Cost is continuous: it is computed **per request** as `Σ costBasis[slug].grams × latest price per gram`, then CDN-cached for 30 min. A DA scrape never triggers a recompile. |
| 3 | **Commodity choice happens at read time, not at compile time.** A compiled line stores an *ingredient slug* and *costed grams*. The slug maps to one or more DA items in the catalog, and the cost uses the **cheapest variant with a price of age ≤ 14 days** (Imported vs Local, chicken brands). The cheapest variant changes daily, so freezing a commodity id into compile output would make it stale. |
| 4 | **Two-level matching: recipe name → canonical ingredient → FNRI food / DA items.** About 400 canonical ingredients live in a git-versioned catalog (`scraper-backend/data/ingredients.json`), each with a hand-chosen FNRI code, density, piece weights, edible fraction and DA item list. DA mapping is done **only by hand** (244 items, ~120 priceable ingredients): no fuzzy DA matching at runtime. That removes the `'beef broth'→'Beef blood'` class of errors entirely. |
| 5 | **Human decisions live in the DB, curated reference data lives in git.** Catalog, unit tables, DA unit overrides and reference prices are JSON in git, versioned by commit and `RULES_VERSION`. Name→ingredient aliases (3,386 names) and line/recipe overrides are DB tables, edited by CSV round-trip in the MVP and by an admin page later. |
| 6 | **Fixed precedence:** line override > recipe override > reviewed alias > accepted (LLM/bulk) alias > catalog synonym exact match > token matcher (flagged) > none. A lower level never beats a higher one. |
| 7 | **Every compile is a full recompile into a new `runId`, using blue/green promotion.** 2,770 recipes / 21,165 lines is small: < 30 s from a laptop, 1–3 serverless requests. There is no incremental logic. The API reads only the `ACTIVE` run. A finished run is promoted only if it passes a validation gate. The active and previous runs are kept, so rollback is a status flip. |
| 8 | **Recompile only when inputs change.** A fingerprint of (`RULES_VERSION`, catalog file hash, recipe count + max id, FNRI count + max scrapedAt, alias/override count + max `decidedAt`/`updatedAt`) is compared with the active run. The nightly job calls `POST /api/compile {mode:"ifStale"}`, which is a no-op when nothing changed. |
| 9 | **Serverless pattern:** each request loops over chunks of 250 recipes under a 40 s budget. Each chunk is one array transaction (delete-then-insert for that chunk + cursor advance), so a timeout mid-chunk rolls back and a retry is idempotent. `createMany` batches are ≤ 1,000 rows (24 cols → 24k bind params, under Postgres's 65,535 limit). |
| 10 | **Validation has three layers:** (a) sanity ranges plus an Atwater energy-closure check per recipe; (b) grams-weighted coverage and confidence → grade A/B/C/D, with D hidden; (c) an external benchmark from WPRM per-serving labels, compared against our **`kcalNaive`** (every line 100 % eaten), because WPRM labels almost certainly count all frying oil. A 15–25-recipe hand-checked golden set runs in `npm test`. |
| 11 | **MVP in 10 student-days**, behind `/api/v2/*`, with the old client path kept as a fallback for two weeks. |

---

## 1. Three quantities per line (shared vocabulary)

| Quantity | Meaning | Used for |
|---|---|---|
| `gramsAP` (as purchased) | What the line asks you to buy or use, bones/peel included: `2 lbs chicken` = 907 g | Basis for the other two |
| `gramsEP` (edible portion) | `gramsAP × edibleFraction`. FNRI values are "per 100 g E.P.", so nutrition must start here | Nutrition |
| `gramsEaten` | `gramsEP × consumedFraction` (frying oil absorbed, bay leaf removed, optional = 0) | **Nutrition** |
| `gramsCost` | `gramsAP × costFraction` (frying oil used up incl. reuse amortisation, aromatics fully bought) | **Cost** |

**Edible-portion rule (r1):** apply `edibleFraction` only to mass units and count units (`lb`, `g`, `piece`, `head`, `whole`, `bunch`). Volume-measured lines (`1 cup minced onion`) are measured after prep, so EP = AP for nutrition. For their **cost**, back-convert: `gramsCost = gramsEP / edibleFraction`. Source precedence for `edibleFraction`: catalog value > FNRI `Edible portion` % (Phase 2 scrape) > 1.0.

---

## 2. Where things run (static vs continuous)

```
                 STATIC (changes rarely)                              CONTINUOUS (daily)
 ┌──────────────────────────────────────────────┐          ┌──────────────────────────────┐
 │ Recipe / RecipeIngredient / RecipeInstruction│          │ Commodity (DA, NCR, daily)   │
 │ NutritionFact (+altNames, ediblePortion P2)  │          │   fixed merged-row parser    │
 │ git: data/ingredients.json, units.json,      │          └──────────────┬───────────────┘
 │      da-items.json, reference-prices.json(P2)│                         │ latest price per item
 │ DB:  IngredientAlias, LineOverride,          │                         │ (≤14 d, non-null)
 │      RecipeOverride (human decisions)        │                         │
 └───────────────┬──────────────────────────────┘                         │
                 │ fingerprint changed?                                   │
                 ▼                                                        ▼
   COMPILE (local CLI or chunked /api/compile)            READ  /api/v2/recipes[/:id]
   → CompileRun(runId) → CompiledLine, CompiledRecipe      CompiledRecipe(ACTIVE run)
   → stats → gate → promote (ACTIVE)                       × costBasis × price/gram (min variant)
                                                           → JSON, Cache-Control s-maxage=1800
                                                                         │
                                                         GitHub Pages site (docs/index.html)
```

| Layer | Changes | Stored in | Recomputed when |
|---|---|---|---|
| Recipes | new posts (rare) | `Recipe*` | recipe scraper |
| FNRI | static | `NutritionFact` | manual rescrape |
| Catalog, units, rules | developer edits | git JSON + `RULES_VERSION` const | deploy |
| Aliases / overrides | review | DB tables | CSV import / admin page |
| Compiled lines + per-serving nutrition | derived, static | `CompiledLine`, `CompiledRecipe` per `runId` | compile, only when the fingerprint changes |
| DA prices | daily | `Commodity` | daily scrape |
| Cost per serving | derived, continuous | **not stored** | each request (CDN 30 min) |
| Benchmark | static | `RecipeBenchmark` | one-time WPRM rescrape |

**Execution venues (both call the same `runner.ts`):**
- **Local CLI** (`npx tsx scripts/compile.ts --mode full`) from the student's laptop. A Philippines→Tokyo round-trip is much shorter than us-east→Tokyo, and there is no 60 s limit. This is the default during development.
- **Chunked route** `POST /api/compile` for automation (nightly GitHub Action) and for "recompile after review" from the admin page.
- **Recommended one-line infra fix:** pin Vercel functions to Tokyo (`"regions": ["hnd1"]` in `scraper-backend/vercel.json`, or `export const preferredRegion = "hnd1"` per route). It puts functions next to the DB and cuts per-round-trip latency by roughly 10–20×. It helps every existing scraper too. *Verify that your plan allows choosing a single region; if not, everything below still works within the budget.*

---

## 3. Data model (Prisma sketches)

### 3.1 Additions to existing models

```prisma
model Recipe {
  // ...existing fields...
  rescrapedAt DateTime?          // Phase 2 WPRM re-scrape marker (makes it resumable)
  compiled    CompiledRecipe[]
  benchmark   RecipeBenchmark?
  override    RecipeOverride?
}

model RecipeIngredient {
  // ...existing fields...
  groupName String?   // Phase 2: .wprm-recipe-group-name ("For the marinade")
  notes     String?   // Phase 2: .wprm-recipe-ingredient-notes ("for frying", "optional")
}

model NutritionFact {
  // ...existing fields...
  altNames       String?  // Phase 2: FNRI "Alternate/Common name(s)"; null when "N/A"
  scientificName String?
  ediblePortion  Float?   // Phase 2: 0–1 (FNRI E.P. % / 100); null when "-"
}
```

No `CommodityItem` table in the MVP. `Commodity.name` is already the series identity, once the merged-row bug is fixed and whitespace is collapsed. Unit info comes from name parsing plus `data/da-items.json` overrides. Line order is `RecipeIngredient.id` ascending (nested `create` inserts in order).

### 3.2 Review / override layer (DB is source of truth)

```prisma
model IngredientAlias {
  normName      String    @id               // normalizeName(name): "yellow onion", "knorr pork cube"
  kind          String    @default("unknown") // food | noise | header | equipment | unknown
  status        String    @default("auto")    // auto | accepted | reviewed
  slug          String?                     // decision: catalog slug
  fnriCode      String?                     // decision when no catalog entry fits (nutrition only, no price)
  suggestedSlug String?                     // matcher/LLM suggestion (refreshed every compile while status=auto)
  suggestedFnri String?
  suggestedConf Float?
  source        String    @default("matcher") // matcher | llm | manual
  uses          Int       @default(0)       // line count in the latest run
  example       String?                     // one rawText for reviewers
  note          String?
  decidedAt     DateTime?                   // set ONLY by human/LLM decisions → part of fingerprint
  updatedAt     DateTime  @updatedAt
  @@index([status, uses])
}

model LineOverride {
  id               Int      @id @default(autoincrement())
  recipeId         Int
  lineKey          String   // sha1(normRawText).slice(0,12) + "#" + occurrenceIndex
  slug             String?
  fnriCode         String?
  gramsAP          Float?
  role             String?
  consumedFraction Float?
  exclude          Boolean  @default(false)
  note             String?
  updatedAt        DateTime @updatedAt
  @@unique([recipeId, lineKey])
}

model RecipeOverride {
  recipeId  Int      @id
  recipe    Recipe   @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  servings  Int?
  hidden    Boolean  @default(false)
  note      String?
  updatedAt DateTime @updatedAt
}
```

`lineKey` is a hash of the normalized `rawText` (lowercase, strip `▢`, collapse spaces) plus an **occurrence index**. Flattened marinades list `salt` twice, so the hash alone is not unique. The key survives a re-scrape that deletes and recreates rows. If a line's text changes, its override becomes *orphaned*, and the run report counts it (`orphanOverrides`).

**Important:** `uses` and `suggested*` are rewritten by every compile. If those writes touched the fingerprint, every compile would trigger another one. The fingerprint therefore uses `max(decidedAt)` over `status in ('accepted','reviewed')`, never `updatedAt`.

### 3.3 Compile output (blue/green by `runId`)

```prisma
model CompileRun {
  id           Int       @id @default(autoincrement())
  status       String    // RUNNING | BUILT | ACTIVE | RETIRED | FAILED
  rulesVersion String    // e.g. "r1" (const in src/lib/compile/rules.ts)
  fingerprint  String
  phase        String    @default("lines") // lines | stats | gate | done
  cursor       Int       @default(0)       // last recipeId written
  processed    Int       @default(0)
  total        Int       @default(0)
  metrics      Json?
  message      String?   @db.Text
  startedAt    DateTime  @default(now())
  heartbeatAt  DateTime  @default(now())   // concurrency guard
  finishedAt   DateTime?
  promotedAt   DateTime?
  @@index([status])
}

model CompiledLine {            // ~21k rows per run; no FK (cheap inserts, deleted with the run)
  id               Int      @id @default(autoincrement())
  runId            Int
  recipeId         Int
  lineNo           Int
  lineKey          String
  normName         String
  kind             String          // food | noise | header | equipment
  groupName        String?         // WPRM group (P2) or pseudo-group from a header row
  slug             String?
  fnriCode         String?
  qty              Float?          // parsed amount (range → midpoint)
  qtyMax           Float?
  unit             String?         // canonical unit (cup, tbsp, tsp, g, ml, oz, lb, piece, clove, head, thumb, bunch, pack, can…)
  gramsAP          Float?
  gramsEP          Float?
  role             String
  consumedFraction Float
  gramsEaten       Float?
  costFraction     Float
  gramsCost        Float?
  kcal             Float?          // contribution, for UI/explanations
  matchSource      String          // override | alias_reviewed | alias_accepted | catalog_exact | matcher_catalog | matcher_fnri | none
  matchConf        Float
  qtyConf          Float
  flags            String[]
  @@index([runId, recipeId])
  @@index([runId, normName])
}

model CompiledRecipe {
  runId             Int
  recipeId          Int
  recipe            Recipe   @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  servings          Int
  servingsSource    String   // card | override | imputed
  // per-serving nutrition (static)
  kcal              Float
  protein           Float
  fat               Float
  carbs             Float
  fiber             Float
  calcium           Float
  iron              Float
  vitaminA          Float
  vitaminB1         Float
  vitaminB2         Float
  vitaminC          Float
  kcalNaive         Float    // every line 100 % eaten, optional included (benchmark comparability)
  gramsPerServing   Float
  nutritionCoverage Float    // 0–1, grams-eaten weighted
  confidence        Float    // 0–1, grams-eaten weighted line confidence
  grade             String   // A | B | C | D
  flags             String[]
  isVegetarian      Boolean
  nutritionScore    Int      // existing formula, moved server-side
  costBasis         Json     // [{"s":"chicken-bone-in","g":907.2}, …] gramsCost aggregated by slug
  priceableGrams    Float
  ingredientNames   String[] // canonical names for the site's produce filter
  hidden            Boolean  @default(false)
  @@id([runId, recipeId])
}

model RecipeBenchmark {
  recipeId  Int      @id
  recipe    Recipe   @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  source    String   @default("wprm-jsonld")  // wprm-jsonld | wprm-label
  servings  Int?
  kcal      Float?
  carbs     Float?
  protein   Float?
  fat       Float?
  satFat    Float?
  sodium    Float?
  fiber     Float?
  sugar     Float?
  raw       Json
  scrapedAt DateTime @default(now())
}
```

Storage: about 21k × 250 B ≈ 5 MB per run. Keeping two runs is about 12 MB with indexes, which fits any free Postgres tier.

### 3.4 Git-versioned reference data (`scraper-backend/data/`)

```jsonc
// ingredients.json — one entry per canonical ingredient (~150 in MVP, ~400 later)
{
  "slug": "cooking-oil", "name": "Cooking oil", "kind": "food", "category": "oil",
  "synonyms": ["cooking oil", "vegetable oil", "canola oil", "palm oil", "corn oil", "mantika"],
  "fnri": "<FNRI code of the chosen oil entry>",
  "densityGml": 0.92, "unitGrams": {}, "edibleFraction": 1.0,
  "isAnimal": false, "priceable": true,
  "price": { "items": ["Cooking Oil (Palm) 1 Liter/bottle", "Cooking Oil (Coconut) 1 Liter/bottle"] }
}
{
  "slug": "garlic", "name": "Garlic", "category": "vegetable",
  "synonyms": ["garlic", "bawang"], "fnri": "<code>", "densityGml": 0.58,
  "unitGrams": { "clove": 5, "head": 40 }, "edibleFraction": 0.85,
  "price": { "items": ["Garlic, Imported", "Garlic, Local"] }
}
// da-items.json — only where name parsing is insufficient
{ "Chicken Egg (White, Medium) 56-60 grams/pc": { "priceUnit": "piece", "unitGrams": 58 },
  "Cooking Oil (Coconut) 1 Liter/bottle":       { "priceUnit": "bottle", "unitGrams": 920 },
  "_ignore": ["..."] }
// reference-prices.json (Phase 2, manual, labelled "reference, not live")
{ "soy-sauce": { "phpPerKg": 55.6, "source": "supermarket shelf 2026-10", "asOf": "2026-10-01" } }
```

DA unit parsing: `(\d+)-(\d+) grams/pc` → `piece`, midpoint grams. `(\d+(\.\d+)?) ?(ml|liter|l)/bottle` → `bottle`, ml × density from `da-items.json` (oil 0.92, default 1.0). `pcs/kg` is a size spec, so the price stays per kg. Bundles must be listed in `da-items.json`, otherwise the item is treated as unpriceable. Default: kg = 1,000 g.

---

## 4. The compiler (pure function)

`compileRecipe(recipe, ctx) → { lines: CompiledLine[], result: CompiledRecipe }`. It does no I/O, so it is unit-testable against JSON fixtures.

### 4.1 Stages

1. **Classify the line (`kind`).**
   - *Header*: amount empty and (name ends with `:` or matches `^(for (the )?)?(marinade|sauce|filling|dough|batter|breading|coating|dipping sauce|garnish|toppings?|broth|soup)( ingredients)?:?$` or `^cooking procedure$`). A header row also opens a **pseudo-group** for the following lines until the next header. That gives marinade/sauce semantics before WPRM groups are scraped.
   - *Equipment*: catalog `kind:"equipment"` (aluminum foil, toothpick, skewer, banana leaf for wrapping, twine, cheesecloth).
   - *Noise*: name is a bare unit word (`can`, `pack`), has fewer than 3 letters, or has no letters.
2. **Normalize the name** (`normName`): lowercase, NFD-strip accents, drop `▢`, drop parentheticals and post-comma prep text (`, minced`), and pull out the flags `to taste` / `as needed` / `optional` / `for frying` / `for garnish` / `for serving`.
   - Embedded quantities: if amount is empty and the name matches `^(\d+(?:\.\d+)?)\s*(g|grams?|oz\.?|ml|lbs?\.?)\s+(pack|can|bottle|sachet|pouch)?\s*(.+)$`, the result is qty = 1 pack of that mass (`EMBEDDED_QTY`). With amount `1` and name `14 oz. can condensed milk`, the result is 1 × 14 oz = 397 g.
3. **Parse the amount.** Unicode fractions (½ ¼ ¾ ⅓ ⅔ ⅛), mixed numbers, and ranges (midpoint, `qtyMax` kept, `QTY_RANGE`).
   - Repairs (`QTY_MALFORMED`, qtyConf 0.6): `1 /4`→0.25; `1/ 1/4`→1.25; `68g` with no unit → 68 + `g`; `2 to` + name `matoes` → 2, name `tomatoes`; `1 20` + `oz.` → 1 × 20 oz.
4. **Normalize the unit.** 82 raw spellings map to about 25 canonical units. Size words in the unit field (`medium` 33, `small` 10, `large`) become `piece` with a size multiplier: small 0.75, medium 1.0, large 1.3.
5. **Resolve the ingredient** using the precedence in §6.
6. **Convert to grams.**
   - Mass is direct (lb 453.6, oz 28.35, kg 1000).
   - Volume: US cup 236.6 ml, tbsp 14.79, tsp 4.93, quart 946. Grams = ml × `densityGml` (catalog) or the category default (§4.3).
   - Counts use catalog `unitGrams` or the generic table (§4.3).
   - The AP→EP rule is in §1.
7. **Role & fractions** (rules `r1`, §4.2).
8. **Aggregate.** Totals ÷ servings. Servings come from the override, then the card, then imputation: `clamp(round(Σ gramsEaten excl. water / 300 g), 2, 8)` with `SERVINGS_IMPUTED`, which caps the grade at B. 28 % of recipes have NULL servings. Then compute coverage, confidence, flags and grade (§7).

### 4.2 Roles, `r1` defaults

All numbers below are approximate, from the USDA cooking-yield / Bognár 2002 / FAO-INFOODS / EuroFIR source family. They are owned by the cooking-rules workstream.

| role | detection (r1) | consumedFraction (nutrition) | costFraction |
|---|---|---|---|
| `main` | default | 1.0 | 1.0 |
| `saute_fat` | oil/fat line < 240 ml and no frying-medium signal | 1.0 | 1.0 |
| `frying_medium` | name/notes say "for (deep) frying"; **or** oil ≥ 240 ml (1 cup) and (instructions match `/deep[- ]?fr/i` or the recipe has **no** instructions, which is 23 % of recipes); **or** oil ≥ 480 ml | `absorbed / gramsEP(oil)`, where `absorbed = u × Σ gramsEP(other food lines, excl. water/broth)`. `u = 0.08` if the recipe has a wrapper/flour/breadcrumb/cornstarch/batter line, else `0.05`. Clamped to [0.05, 0.5] of the oil | `consumed + (1 − consumed)/3` (oil assumed reused about 3 times) |
| `shallow_fry` | oil 120–239 ml and instructions match `/pan[- ]?fr|\bfry/i` | as above with `u = 0.04` | same formula |
| `water` | water, ice | 0 kcal anyway; excluded from coverage | 0 (non-priceable) |
| `to_taste` | `to taste` / `as needed` and no amount | 0 g | 0 |
| `optional` | `optional` in name/notes | 0 (counted in `kcalNaive`) | 0 |
| `aromatic_removed` | bay leaf, pandan, lemongrass/tanglad, star anise, cinnamon stick, whole peppercorn, tamarind for sinigang | 0; whole peppercorn 0.5; tamarind 0.1 | 1.0 |
| `garnish` | group/name "garnish", "toppings" | 1.0 if a quantity is given | 1.0 |
| `bones_for_stock` | "bones" (9 rows) | via catalog `edibleFraction` 0.25 | 1.0 |
| `marinade_liquid` *(Phase 2, needs groups)* | liquid in a marinade group | 0.3 if instructions say "discard", 1.0 if "add/pour the marinade", else 0.5 | 1.0 |
| `dredge` *(Phase 2)* | flour/cornstarch/breadcrumbs ≤ 1 cup in a frying recipe | 0.5 | 1.0 |

### 4.3 Generic fallbacks (approximate)

These come from USDA FoodData Central household measures; each use is flagged.

- **Category densities, g/ml** (`DENSITY_DEFAULT`, qtyConf 0.75): water/broth/vinegar 1.0; oil 0.92; soy/fish/oyster sauce 1.08–1.2; coconut milk 0.96; granulated sugar 0.85 (200 g/cup); brown sugar packed 0.93; flour 0.53 (125 g/cup); cornstarch 0.54; raw rice 0.78 (185 g/cup); cooked rice 0.67 (158 g/cup); salt 1.22 (6 g/tsp); chopped vegetables 0.6; leafy greens 0.25; unknown 0.8 (`UNIT_GUESSED`).
- **Piece weights, g AP** (`PIECE_WEIGHT_DEFAULT` when generic): garlic clove 5, garlic head 40, onion medium 150, tomato medium 120, egg 58 (from DA "56–60 grams/pc"), ginger thumb 15, calamansi 10, siling labuyo 1, siling haba 10, bay leaf 0.2, lumpia wrapper 10, bouillon cube 10, magic-sarap sachet 8, bunch (leafy) 250, can 400, unknown piece 50.

### 4.4 Line confidence

`lineConf = matchConf × qtyConf`

- `matchConf`: override 1.0 · alias reviewed 0.95 · catalog synonym exact 0.9 · alias accepted (LLM/bulk) 0.85 · matcher→catalog F1 ≥ 0.6 → F1 × 0.9 · matcher→FNRI F1 ≥ 0.5 (foodName + altNames) → F1 × 0.8 · none 0.
- `qtyConf`: mass 1.0 · embedded pack 0.9 · volume with ingredient density 0.9 · count with ingredient piece weight 0.85 · volume with category density 0.75 · malformed-repaired 0.6 · count/size word with generic weight 0.5 · missing qty 0.3.

Missing quantity on a non-to-taste line: use catalog `defaultGrams` if defined, else 0 g plus `QTY_MISSING`. A `QTY_MISSING` line with category meat/fish/seafood/grain/noodle caps the grade at C.

---

## 5. Running it: chunked, resumable, batched

### 5.1 Route contract

```
POST /api/compile            Authorization: Bearer $ADMIN_TOKEN
  body { "mode": "full" | "ifStale", "force"?: boolean }
  → { done, runId, phase, processed, total, promoted?, gate?: {...} }
GET  /api/compile            → last 10 CompileRun rows (status, metrics summary)
```

Driver options: the admin page loop (existing pattern), a GitHub Action `curl` loop until `done`, or the local CLI (in-process, no HTTP).

### 5.2 Phases

| phase | work | DB round trips |
|---|---|---|
| `init` | Concurrency guard: refuse with 409 if a `RUNNING` run has `heartbeatAt` < 10 min old. Compute the fingerprint. `ifStale` and fingerprint equals ACTIVE's → `done` (no-op). Else create the `CompileRun`. | ~6 |
| `lines` | Loop: load the next 250 recipes `where id > cursor` (with ingredients + instructions) plus the overrides for those ids. Compile in memory. Write one **array** transaction (below). Stop when `elapsed > 40 s`. | ~4 reads + ~8 writes per chunk |
| `stats` | One SQL upsert of `IngredientAlias` (uses + suggestions) from `CompiledLine` of the run, then metrics aggregation (SQL `percentile_cont`, counts by grade/flag) and the benchmark comparison. | ~5 |
| `gate` | Compare metrics with the ACTIVE run (§7.4). Pass → promote in one transaction (old ACTIVE → RETIRED, new → ACTIVE) and delete runs older than the previous one. Fail → status `BUILT` with reasons. | ~4 |

Chunk write (atomic, idempotent on retry):

```ts
await prisma.$transaction([
  prisma.compiledLine.deleteMany({ where: { runId, recipeId: { in: ids } } }),
  ...batches(lines, 1000).map((data) => prisma.compiledLine.createMany({ data })),
  prisma.compiledRecipe.deleteMany({ where: { runId, recipeId: { in: ids } } }),
  prisma.compiledRecipe.createMany({ data: results }),
  prisma.compileRun.update({ where: { id: runId },
    data: { cursor: lastId, processed: { increment: ids.length }, heartbeatAt: new Date() } }),
]);
```

Use the array form, as `da-scraper.ts` already does. Interactive `$transaction(async tx => …)` has a 5 s default timeout, which a far-away DB can hit.

Reference context (FNRI 1,542 rows, aliases ≤ 3.4k, bundled JSON) is loaded once per request and memoised per `runId` for warm instances: 3 queries, about 1 s.

### 5.3 Budget math

Assume about 300 ms per sequential write us-east→Tokyo, from the observed "200 writes ≈ 60 s".

- Per chunk of 250 recipes (~1,900 lines): reads about 1.2 s (3 relation queries + transfer), compute < 0.1 s, writes 8 statements × 0.3 s ≈ 2.4 s, so about **4 s**.
- One request under a 40 s budget does about 9 chunks ≈ 2,250 recipes, so a full compile takes **2 requests + 1 for stats/gate**, about 90 s wall-clock. With `hnd1`, or from the laptop, it is a single request / < 30 s.
- 40 s leaves 20 s for the slowest chunk plus response. The chunk size (`COMPILE_CHUNK=250`) and budget (`COMPILE_BUDGET_MS=40000`) are env-tunable.

### 5.4 Fingerprint (decides "is a recompile needed")

```ts
sha256(JSON.stringify({
  rules: RULES_VERSION,                         // bump when compiler logic changes
  catalog: sha256(readFiles("data/*.json")),    // bundled at build time
  recipes: [count, maxRecipeIngredientId, maxScrapedAt],
  fnri: [count, maxScrapedAt],
  aliases: [countDecided, maxDecidedAt],        // NOT updatedAt (see §3.2)
  overrides: [lineCount, lineMaxUpdatedAt, recipeCount, recipeMaxUpdatedAt],
}))
```

### 5.5 Automation (GitHub Actions, free, lives with the repo)

`.github/workflows/pipeline.yml`, cron `0 3,9 * * *` UTC (11:00 and 17:00 PHT; adjust to when DA posts its PDF):

1. Loop `POST /api/scrape/da?days=3` until `done`. Add a `days` param so daily runs don't rebuild a 30-day queue (31 requests).
2. Loop `POST /api/compile {"mode":"ifStale"}` until `done`. This is usually an immediate no-op.

`ADMIN_TOKEN` is a repo secret. Caveat: scheduled workflows can be delayed and are disabled after 60 days of repo inactivity. Vercel Cron is a worse fit, because it fires one request and these jobs need a loop.

### 5.6 Batching rule for every other far-DB job

Write ≥ 20 items per transaction. Use `createMany` for inserts. For bulk updates use one `UPDATE … FROM (VALUES …)` statement via `$executeRaw` + `Prisma.join`, e.g. setting `groupName`/`notes` for a batch of `RecipeIngredient` ids. Never use per-row `upsert` loops. `nutrition-scraper.saveRows` still upserts row by row and should be converted the same way.

---

## 6. Review / override workflow

### 6.1 Precedence (first hit wins, field by field for overrides)

1. `LineOverride(recipeId, lineKey)`: any non-null field wins; `exclude=true` drops the line.
2. `RecipeOverride`: `servings`, `hidden`.
3. `IngredientAlias` with `status='reviewed'`: `kind` + `slug` (or `fnriCode`). `kind='food'` with no decision means "known food, no mapping yet": no matcher fallback, flagged `NO_MATCH`. That stops a recurring false positive permanently.
4. `IngredientAlias` with `status='accepted'` (LLM / bulk accept).
5. Exact match of `normName` against catalog `synonyms` (incl. Filipino names).
6. Token matcher, a TS port of `matcher.js`: against catalog names first (F1 ≥ 0.6), then FNRI `foodName + altNames` (F1 ≥ 0.5, nutrition only). Always flagged `MATCH_AUTO`.
7. None → `NO_FOOD`.

### 6.2 Review queue

```sql
SELECT * FROM "IngredientAlias"
WHERE status = 'auto' OR (status = 'accepted' AND "suggestedConf" < 0.9)
ORDER BY uses * (1 - COALESCE("suggestedConf", 0)) DESC
LIMIT 200;
```

Other queues, all generated by the `stats` phase:
- recipes with grade D or a `KCAL_IMPLAUSIBLE` / `ENERGY_MISMATCH` flag, sorted by line count;
- lines with `QTY_MALFORMED`;
- benchmark outliers (ratio outside [0.5, 2]);
- DA names seen in the last 7 days that no catalog entry maps and that are not ignored;
- catalog `price.items` not seen in 7 days (DA renamed an item);
- orphaned overrides.

### 6.3 MVP tooling: CSV round-trip, no UI

- `npx tsx scripts/review-export.ts > review/aliases.csv` writes these columns: `normName, uses, example, suggestedSlug, suggestedFnri, suggestedFnriName, top3, confidence, status, decision_kind, decision_slug, decision_fnri, note`.
- The student edits it in Google Sheets / Excel. A new canonical ingredient goes into `data/ingredients.json` first.
- `npx tsx scripts/review-import.ts review/aliases.csv` validates slugs against the catalog and FNRI codes against `NutritionFact`, then upserts `status='reviewed'`, `source='manual'`, `decidedAt=now()`. It prints the rejected rows.

Example row:

```
normName,uses,example,suggestedSlug,suggestedFnri,suggestedFnriName,confidence,decision_kind,decision_slug
yellow onion,181,"1 medium yellow onion, sliced",,<code>,"Cassava, yellow",0.50,food,onion
```

Expected effort: aliases are long-tailed, so reviewing the top 200–300 names by uses covers most of the 21k lines (*measure after the first run*). One evening per 100 names.

**Phase 2:** an `/admin/review` page (Next client component, token-gated) with the same actions plus a **single-recipe preview**. The compiler is pure, so the page can call `GET /api/admin/preview/{recipeId}` to compile one recipe in memory with the pending override, without waiting for a full run.

**Phase 2, optional: LLM bulk proposals** for the long tail (offline, `scripts/llm-aliases.ts`).
- Use the Message Batches API (asynchronous, 50 % of standard price) with `claude-opus-5-5`.
- Each request carries 20 names (with example rawText) plus the top 8 FNRI candidates per name (code, name, Filipino alt name, state). The system prompt holds the catalog (slug/name/synonyms, ~8k tokens, cacheable).
- Output is JSON via structured outputs (`output_config.format`). Forced `tool_choice` is rejected on this model. Each item has `{normName, kind, slug|null, proposedNewIngredient?, fnriCode?, confidence}`.
- Cost: about 170 requests ≈ 2M input + 0.2M output tokens. At batch rates ($2 / $10 per MTok for Opus 5.5 under the 50 % discount) that is **≈ $6 one-off**, or about half with `claude-sonnet-5-5`.
- Auto-accept (`status='accepted'`, `source='llm'`) only when confidence ≥ 0.9, the slug exists, and (for food) the slug's FNRI code is among the matcher's top 8. Everything else goes to the CSV queue. LLM decisions always rank below human review.

### 6.4 Security prerequisite

Add `requireAdmin(request)` (Bearer `ADMIN_TOKEN`) to every POST (`/api/scrape/*`, `/api/compile`, `/api/admin/*`). Today anyone can trigger scrapes. The admin page asks for the token once and keeps it in `localStorage`.

---

## 7. Validation

### 7.1 Coverage and grade (per recipe)

- **Denominator lines:** `kind='food'` and role ∉ {water, to_taste without amount, optional, aromatic_removed with consumed 0}, weighted by `gramsEaten`. Absorbed frying oil counts.
- `nutritionCoverage = Σ gramsEaten(lines with an FNRI food or manual nutrition) / Σ gramsEaten`
- `confidence = Σ gramsEaten × lineConf / Σ gramsEaten`
- `costCoverage = Σ gramsCost(priced) / Σ gramsCost(priceable)`, computed at read time. Catalog `priceable:false` covers spices and pantry items with negligible cost, the successor to `NON_PRICEABLE`.

| grade | rule | site behaviour |
|---|---|---|
| A | coverage ≥ 0.90 and confidence ≥ 0.75 and servings from card and no hard flag | numbers shown |
| B | coverage ≥ 0.75 and confidence ≥ 0.60 (imputed servings caps here) | numbers shown |
| C | coverage ≥ 0.50 | numbers + "rough estimate" badge |
| D | otherwise, or any hard flag | "Not enough data"; excluded from rankings and sorting |

`valueScore` (existing formula `nutritionScore / costPerServing × 3`) is computed only when the grade is A–C and `costCoverage ≥ 0.6`. Otherwise it is `null`.

### 7.2 Sanity rules (r1 numbers; recalibrate after the first run)

| level | check | flag | effect |
|---|---|---|---|
| line | `gramsAP > 3,000` (excl. water/broth/frying oil) | `LINE_HEAVY` | review queue |
| line | count > 60 pieces (excl. wrappers) | `COUNT_SUSPECT` | review queue |
| recipe | kcal/serving < 30 or > 2,500 | `KCAL_IMPLAUSIBLE` | **grade D** |
| recipe | kcal/serving < 100 or > 1,200 | `KCAL_LOW` / `KCAL_HIGH` | badge, review |
| recipe | protein > 100 g, fat > 100 g or carbs > 250 g per serving | `MACRO_HIGH` | review |
| recipe | gramsEaten/serving < 60 g or > 1,200 g | `MASS_OUT` | review |
| recipe | fat energy share > 70 % | `FAT_ENERGY_HIGH` | review (catches frying mistakes) |
| recipe | \|4P + 4C + 9F − kcal\| / kcal > 0.20 | `ENERGY_MISMATCH` | review (missing FNRI nutrient values) |
| recipe | cost/serving < ₱3 or > ₱600 (read time) | `COST_OUT` | badge |

Per-category ranges for desserts and drinks are Phase 3.

### 7.3 External benchmark: WPRM nutrition labels

- **Scrape (Phase 2, local script, resumable via `Recipe.rescrapedAt`).**
  - Primary: parse `script[type="application/ld+json"]`, flatten `@graph`, take the node whose `@type` includes `Recipe`, and read `nutrition.{calories, proteinContent, fatContent, carbohydrateContent, fiberContent, sugarContent, sodiumContent, servingSize}`. Strings like `"512 kcal"` and `"25 g"` are parsed to numbers. Also read `recipeYield`, which may recover some of the 777 NULL servings.
  - Fallback: `.wprm-nutrition-label-container [class*="wprm-nutrition-label-text-nutrition-container-"]`; the class suffix is the key and `.wprm-nutrition-label-text-nutrition-value` is the value.
  - *Selectors are from WPRM's usual markup; panlasangpinoy.com was not reachable from this environment, so verify on one page first.*
  - The same pass captures `.wprm-recipe-group-name` → `RecipeIngredient.groupName` and `.wprm-recipe-ingredient-notes` → `notes`.
  - 2,770 pages × (1.5 s politeness delay + ~1 s fetch) ≈ 2 h, written in batches of 20.
- **Compare against `kcalNaive`, not `kcal`.** WPRM labels are typically produced by WPRM's nutrition API over a US database, or typed in by the author, and they most likely count every listed gram, including all 3 cups of frying oil and discarded marinade. Comparing naive vs WPRM validates our *mechanics* (parsing, units, matching). The gap between `kcal` and `kcalNaive` is our *modelling choice* (consumption rules), which WPRM cannot validate. Expect about 10 % residual noise from FNRI vs USDA composition differences anyway.
- **Benchmark set:** recipes with a label, `servingsSource='card'`, and grade A–C.
- **Metrics:** n; MdAPE(kcal); % within ±20 % and ±35 %; median ratio ours/WPRM (bias); Spearman ρ. Same for protein and fat.
- **Initial targets** (guesses, recalibrate after run 1): MdAPE ≤ 30 %, median ratio in [0.85, 1.15], ρ ≥ 0.7. Recipes with \|ln ratio\| > ln 2 go to the review queue.

### 7.4 Promotion gate (automatic; `force:true` overrides)

A run is promoted only if:

1. `processed == total` and there are no FAILED chunks.
2. Grade D share ≤ previous + 1 pp. On the first run, ≤ 15 %.
3. `KCAL_IMPLAUSIBLE` count ≤ previous.
4. If a benchmark exists: MdAPE(kcalNaive) ≤ previous + 2 pp.
5. Golden-set check passes (below).

A failed gate leaves the run `BUILT`. `GET /api/admin/compile/{runId}/diff?vs=active` (Phase 2) lists the 50 recipes with the largest |Δkcal| and the alias/override changes behind them.

### 7.5 Golden set and unit tests

- `data/golden/*.json` holds 15 recipes (MVP), growing to 25: adobo, sinigang, lumpia, tinola, kare-kare, pancit, leche flan, arroz caldo, etc. Each stores its lines plus hand-checked grams/FNRI codes and the expected per-serving kcal/protein/fat.
- `npm test` (node:test via `tsx`) runs `compileRecipe` on the fixtures without a DB and asserts kcal within ±15 % (tighten to ±10 % in Phase 2).
- Parser tests use every malformed string from the data profile (`1 /4`, `1/ 1/4`, `1 20` oz., `68g`, `2 to`|`matoes`, `½`, `1-2`, `1 ½`, size words in the unit field).

### 7.6 Run metrics (stored in `CompileRun.metrics`, shown on the admin page)

```json
{ "recipes": 2770, "lines": 21165,
  "lineResolution": 0.91,
  "linesByMatchSource": {"alias_reviewed": 9800, "catalog_exact": 5200, "matcher_catalog": 2100, "matcher_fnri": 900, "none": 1700, "excluded": 1465},
  "nutritionCoverage": {"p10": 0.61, "median": 0.88, "mean": 0.83},
  "grades": {"A": 1100, "B": 900, "C": 520, "D": 250},
  "kcalPerServing": {"p5": 140, "median": 430, "p95": 1050},
  "flags": {"KCAL_HIGH": 80, "ENERGY_MISMATCH": 35, "SERVINGS_IMPUTED": 777},
  "benchmark": {"n": 0},
  "orphanOverrides": 0 }
```

*(The values are an illustration of the shape, not predictions.)*

---

## 8. Read-time cost and API shapes

### 8.1 Price resolution, once per request

```sql
SELECT DISTINCT ON (name) name, price, "sourceDate"
FROM "Commodity"
WHERE region = 'NCR' AND price IS NOT NULL AND "sourceDate" >= CURRENT_DATE - 30
ORDER BY name, "sourceDate" DESC;
```

For each catalog slug, let `candidates` be the slug's `price.items` that have a price of age ≤ 14 days.

```
pricePerGram(slug) = min over candidates of price / unitGrams(item)
```

- 15–30 days old → used, flagged `stalePrice`.
- No fresh or stale price → `reference-prices.json` (Phase 2, labelled "reference").
- Else unpriced.

```
recipe.costTotal      = Σ_{(s,g) ∈ costBasis} g × pricePerGram(s)
recipe.costPerServing = costTotal / servings
```

That is about 150 slugs and 2,770 × ~6 multiply-adds per request, well under 10 ms. Responses send `Cache-Control: public, s-maxage=1800, stale-while-revalidate=86400`.

### 8.2 `GET /api/v2/recipes`

The list replaces the client-side `enrichRecipe`.

```json
{
  "schemaVersion": 2,
  "compile": { "runId": 7, "rulesVersion": "r1", "compiledAt": "2026-10-20T03:12:00Z" },
  "prices":  { "asOf": "2026-10-19", "region": "NCR", "source": "DA Daily Price Index" },
  "count": 2770,
  "recipes": [{
    "id": 812, "title": "Chicken Adobo", "url": "https://panlasangpinoy.com/…", "imageUrl": "…",
    "servings": 4, "servingsSource": "card", "totalMinutes": 55,
    "perServing": { "kcal": 428, "protein": 32.7, "fat": 30.1, "carbs": 5.4, "fiber": 0.6,
                    "calcium": 31, "iron": 1.9, "vitaminA": 41, "vitaminC": 1.2 },
    "cost": { "perServing": 46.4, "total": 185.4, "coverage": 0.84, "stalePrice": false },
    "quality": { "grade": "A", "nutritionCoverage": 1.0, "confidence": 0.90, "flags": [] },
    "scores": { "nutrition": 38, "value": 2.5 },
    "dietTags": ["high-protein", "low-carb"],
    "ingredients": ["chicken", "garlic", "soy sauce", "vinegar", "bay leaf", "peppercorn", "cooking oil"]
  }]
}
```

About 350 B per recipe, roughly 1 MB raw / ~150 KB gzip. The site no longer downloads `/api/nutrition` or 21k raw ingredient rows. SM is out of scope, so `/api/store-prices` is dropped from the site.

### 8.3 `GET /api/v2/recipes/{id}`

This is what the modal shows.

```json
{ "recipe": { "...list fields...": "",
  "description": "…",
  "instructions": [{ "step": 1, "text": "…" }],
  "lines": [{
    "lineNo": 1, "text": "2 lbs chicken, cut into serving pieces", "kind": "food", "group": null,
    "ingredient": { "slug": "chicken-bone-in", "name": "Chicken (bone-in pieces)" },
    "food": { "code": "<FNRI code>", "name": "<FNRI food name>" },
    "qty": { "value": 2, "max": null, "unit": "lb" },
    "grams": { "asPurchased": 907, "edible": 635, "eaten": 635, "costed": 907 },
    "role": "main", "consumedFraction": 1.0, "kcal": 1207,
    "price": { "item": "Whole Chicken, Local", "perKg": 195, "asOf": "2026-10-19", "cost": 176.9 },
    "match": { "source": "alias_reviewed", "confidence": 0.95 },
    "flags": []
  }],
  "benchmark": { "source": "wprm-jsonld", "kcal": null, "kcalNaive": 436 }
}}
```

Old endpoints stay untouched until the v1 path is removed.

---

## 9. Worked examples

> **Assumptions.** The line text is representative of the Panlasang Pinoy cards; verify it against the DB rows before using these as golden fixtures. Nutrient values are approximate FNRI/USDA-family per 100 g E.P.; replace them with `NutritionFact` values. DA prices are **illustrative NCR levels, not DB values**.

### 9.1 Chicken Adobo (servings 4 from card; braise; no deep fry)

Instructions mention pan-fry/boil/simmer and no deep fry, and the oil is < 240 ml, so the oil is `saute_fat`.

| # | line | grams rule | AP g | EP g | role (consumed) | eaten g | kcal/100 g | kcal |
|---|---|---|---|---|---|---|---|---|
| 1 | 2 lbs chicken, cut into serving pieces | 2 × 453.6; EP 0.70 (bone-in, catalog) | 907.2 | 635.0 | main (1.0) | 635.0 | 190 | 1,206.5 |
| 2 | 1 head garlic, crushed | head = 40 g; EP 0.85 | 40.0 | 34.0 | main (1.0) | 34.0 | 149 | 50.7 |
| 3 | 3 pieces dried bay leaves | 3 × 0.2 g | 0.6 | 0.6 | aromatic_removed (0) | 0 | — | 0 |
| 4 | 1 1/2 tbsp whole peppercorn | 22.2 ml × 0.55 | 12.2 | 12.2 | aromatic_removed (0.5) | 6.1 | 251 | 15.3 |
| 5 | 1/2 cup soy sauce | 118.3 ml × 1.08 | 127.8 | 127.8 | main (1.0) | 127.8 | 53 | 67.7 |
| 6 | 1 cup water | — | 236.6 | — | water | — | 0 | 0 |
| 7 | 1/4 cup white vinegar | 59.2 ml × 1.01 | 59.7 | 59.7 | main (1.0) | 59.7 | 18 | 10.7 |
| 8 | 3 tbsp cooking oil | 44.4 ml × 0.92 | 40.8 | 40.8 | saute_fat (1.0) | 40.8 | 884 | 360.9 |
| 9 | 1 tsp granulated white sugar (optional) | 4.2 g | 4.2 | 4.2 | optional (0) | 0 | 387 | 0 |
| 10 | Salt to taste | no amount | 0 | 0 | to_taste | 0 | — | 0 |

- **Total** 1,711.8 kcal → **428 kcal/serving**.
- Per serving: protein ≈ 32.7 g, fat ≈ 30.1 g, carbs ≈ 5.4 g. Atwater check: 4·32.7 + 4·5.4 + 9·30.1 = 423, a 1 % gap, so no `ENERGY_MISMATCH`.
- `kcalNaive` (optional sugar, all peppercorn and bay leaf counted) ≈ 1,745 → **436**.
- Coverage: all 6 denominator lines are matched → 1.00. Confidence ≈ 0.90 (garlic 0.95 × 0.85 count factor drags it slightly). **Grade A.**
- **Cost** (read time): chicken 907.2 g × ₱195/kg = ₱176.9; garlic (min of Imported ₱130 / Local) 40 g = ₱5.2; oil (min of Palm ₱75 / Coconut, per 920 g bottle) 40.8 g = ₱3.3.
  - DA-priced total **₱185.4 → ₱46.4/serving**.
  - Priceable grams = chicken + garlic + soy + vinegar + oil = 1,175.5. Bay leaf and peppercorn are `priceable:false`. Priced = 988.0 → **costCoverage 0.84**.
  - With Phase 2 reference prices (soy ₱60/L → ₱7.1, vinegar ₱45/L → ₱2.7): ₱195.2 → ₱48.8/serving, coverage 1.00.
- **Today's client path, same matches assumed:** `head` = 500 g turns garlic into 745 kcal and ₱65. Chicken has no EP (1,724 kcal). Optional sugar is counted. Total ≈ 2,960 kcal → **≈ 740 kcal/serving and ≈ ₱61/serving**. The new path removes the 500 g garlic head and the bones.

### 9.2 Lumpiang Shanghai (servings 8; deep-fried; wrapper present)

Oil is 3 cups (≥ 240 ml) and the instructions contain "deep fry", so the oil is `frying_medium`. The recipe has a wrapper line, so `u = 0.08`.

| # | line | AP g | EP g | role | eaten g | kcal/100 g | kcal |
|---|---|---|---|---|---|---|---|
| 1 | 2 lbs ground pork | 907.2 | 907.2 | main | 907.2 | 263 | 2,385.9 |
| 2 | 1 cup minced onion (160 g/cup, volume → EP=AP) | cost AP 160/0.90 = 177.8 | 160.0 | main | 160.0 | 40 | 64.0 |
| 3 | 1 cup minced carrot (128 g/cup) | cost AP 128/0.88 = 145.5 | 128.0 | main | 128.0 | 41 | 52.5 |
| 4 | 2 eggs (unit empty → piece 58 g; EP 0.88) | 116.0 | 102.1 | main | 102.1 | 143 | 146.0 |
| 5 | 1 1/2 tsp salt (6 g/tsp) | 9.0 | 9.0 | main | 9.0 | 0 | 0 |
| 6 | 1 tsp ground black pepper | 2.3 | 2.3 | main | 2.3 | 251 | 5.8 |
| 7 | 1 tsp garlic powder | 3.1 | 3.1 | main | 3.1 | 331 | 10.3 |
| 8 | 40 pieces lumpia wrapper (10 g/pc) | 400.0 | 400.0 | main | 400.0 | 290 | 1,160.0 |
| 9 | 3 cups cooking oil (709.8 ml × 0.92) | 653.0 | 653.0 | frying_medium | **136.9** | 884 | 1,210.2 |

- **Oil rule:** fried mass = Σ EP of lines 1–8 = 1,711.7 g. Absorbed = 0.08 × 1,711.7 = **136.9 g**, within the cap of 0.5 × 653. `consumedFraction` = 136.9 / 653.0 = **0.21**. `costFraction` = 0.21 + 0.79/3 = **0.473**, so `gramsCost` = 309 g.
- **Total** 5,034.7 kcal → **629 kcal/serving** (≈ 5 rolls). Per serving: protein ≈ 25.2 g, fat ≈ 43.1 g, carbs ≈ 34 g. Atwater 625 vs 629, OK. Fat energy share 62 %, under the 70 % flag.
- `kcalNaive` (all 653 g oil eaten) = 9,597 → **1,200 kcal/serving**. This is the number to hold against the WPRM label.
- **Coverage:** denominator 1,711.7 + 136.9 = 1,848.6 g eaten. If the catalog's `lumpia-wrapper` has an FNRI/manual entry, coverage is 1.00 and the grade is A. If not, coverage = 1,448.6 / 1,848.6 = **0.78 → grade B**, with `NO_FOOD` on line 8 and a high-uses entry in the review queue.
- **Cost** (read time, illustrative):
  - ground pork → catalog items `Pork Picnic Shoulder (Kasim)`, Imported/Local, min ₱290/kg → ₱263.1
  - onion 177.8 g × ₱120 → ₱21.3
  - carrot 145.5 g × ₱90 → ₱13.1
  - eggs 116 g ÷ 58 g/pc × ₱8.00/pc → ₱16.0
  - salt ₱0.2
  - oil 309 g × ₱75/920 g → ₱25.2
  - **DA-priced total ₱338.9 → ₱42.4/serving.** Pepper and garlic powder are `priceable:false`; the wrapper is unpriced in the MVP. costCoverage = 1,664.5 / 2,064.5 = **0.81**, and the site shows "₱42+ / serving · 81 % priced".
- **Today's client path:** oil cup = 240 g gives 720 g × 8.84 = 6,365 kcal. A wrapper "piece" = 50 g gives 2,000 g (5,800 kcal if it matches anything). The egg price ₱8/pc is treated as **₱8/kg**, so 2 eggs cost ₱0.80. Result: **≈ 1,140–1,860 kcal/serving**. The total cost (≈ ₱368) happens to land near the new value only because the errors offset each other.
- **If servings were NULL:** 1,848.6 g / 300 g = 6.2 → **6 servings (imputed)**, grade capped at B, and the UI shows "≈ serves 6 (estimated)".

### 9.3 A compile run, end to end (operational example)

The student imports 120 reviewed aliases, so `max(decidedAt)` changes. At 11:00 PHT the GitHub Action runs:

1. DA `days=3`: 3 requests, today's PDF stored. Cost changes immediately on the next CDN refresh, with no recompile.
2. `POST /api/compile {ifStale}`:
   - **Request 1:** fingerprint differs → run 8 created, 9 chunks (2,250 recipes) in 38 s.
   - **Request 2:** the last 520 recipes, plus `stats` (one alias upsert statement, metrics) in 12 s.
   - **Request 3:** gate. D share 7.9 % → 7.1 % (allowed: ≤ previous + 1 pp); MdAPE 27.4 % → 26.8 %; golden set passes. Run 8 → ACTIVE, run 7 → RETIRED, run 6 deleted (~21k rows, one statement).
   - Site visitors see the new numbers within ≤ 30 min (CDN TTL).
   - If the gate had failed, run 8 would sit as `BUILT` and the admin page would show the 50 largest Δkcal recipes.

---

## 10. Phased rollout

### Phase 0: prerequisites (days 1–2)

1. **Fix DA merged rows** in `extractCommodities` (`scraper-backend/src/lib/scrapers/da-scraper.ts`). After building a row's `name`/`price`, split on embedded prices; each embedded price belongs to the name segment before it, and the trailing price to the last segment:

   ```ts
   const EMBEDDED = /\s([\d,]+\.\d{2}|n\/a)\s+(?=[A-Z])/gi;
   function splitMerged(name: string, price: number | null) {
     const out: { name: string; price: number | null }[] = [];
     let last = 0; let m: RegExpExecArray | null; EMBEDDED.lastIndex = 0;
     while ((m = EMBEDDED.exec(name))) {
       out.push({ name: name.slice(last, m.index).trim(),
                  price: /n\/a/i.test(m[1]) ? null : parseFloat(m[1].replace(/,/g, "")) });
       last = m.index + m[0].length;
     }
     out.push({ name: name.slice(last).trim(), price });
     return out.filter((p) => p.name);
   }
   ```

   Spec numbers such as `56-60 grams/pc`, `13-15 pcs/kg` and `1 Liter` never match `\d+\.\d{2}`. Re-run the 29-day backfill, which is idempotent (per-day replace). Check: `SELECT count(*) FROM "Commodity" WHERE name ~ '\d+\.\d{2}'` must return 0. The 42 bad names come back as about 100 good ones.
2. Add `?days=N` to the DA route. Add `requireAdmin` + `ADMIN_TOKEN` to all POST routes. Optionally pin the region to `hnd1`.
3. Add `tsx` as a dev dependency and a `scripts/` folder. Scripts import `@/lib/db`; tsx honours the tsconfig paths.

### Phase 1: MVP (days 3–10), behind `/api/v2`

| day | deliverable |
|---|---|
| 3 | Migration: `IngredientAlias`, `LineOverride`, `RecipeOverride`, `CompileRun`, `CompiledLine`, `CompiledRecipe`. Port `matcher.js` to `src/lib/compile/matcher.ts`; the TS version becomes the source of truth. |
| 4 | `normalize.ts` (name/amount/unit) + parser tests from the data-profile cases. |
| 5 | Catalog seed: the top ~150 ingredients by uses, with FNRI code, density, piece weights, EP and DA items. Use a helper script that prints matcher candidates per ingredient; the decisions are made by hand. `da-items.json`. |
| 6 | `grams.ts`, `roles.ts` (r1 table), `aggregate.ts` (servings, coverage, confidence, grade, flags). Golden set of 15 recipes. |
| 7 | `runner.ts` + `scripts/compile.ts` + `POST/GET /api/compile` (phases, gate, promotion). |
| 8 | `pricing.ts` + `/api/v2/recipes` and `/api/v2/recipes/[id]` with CDN headers. |
| 9 | `docs/index.html`: map v2 fields; show grade, coverage and the per-line breakdown; `?engine=v1` keeps the old client path; automatic fallback to v1 if v2 errors. Stop fetching `/api/nutrition` and `/api/store-prices`. |
| 10 | `review-export` / `review-import` scripts. First review pass of the top 200 aliases. Run, inspect the old-vs-new diff for the 50 most-changed recipes, promote, and flip the site default to v2. |

**MVP acceptance** (initial targets; adjust after the first run):
- ≥ 90 % of lines resolved or explicitly excluded.
- Median `nutritionCoverage` ≥ 0.85.
- A+B ≥ 60 % of recipes, D ≤ 10 %.
- No recipe shown with > 2,500 kcal/serving.
- Golden set within ±15 %.
- The top 50 ingredients reviewed by hand.

### Phase 2: weeks 3–4

- WPRM re-scrape (groups, notes, JSON-LD nutrition + `recipeYield`), `RecipeBenchmark`, benchmark metrics in the gate.
- FNRI directory scrape: `altNames`, `scientificName`, `ediblePortion`, feeding EP% to the long tail and Filipino names to the matcher.
- Group-aware roles (`marinade_liquid`, `dredge`).
- `reference-prices.json` for the ~30 non-DA staples (soy sauce, vinegar, fish sauce, flour, butter, milk, condensed milk, wrappers, Knorr cubes/mixes).
- `/admin/review` page with single-recipe preview and the run diff view.
- GitHub Actions pipeline.
- Optional LLM bulk alias proposals.
- Convert `nutrition-scraper.saveRows` to batched writes.

### Phase 3: optional

- Per-category sanity ranges.
- Sodium (FNRI minerals tab) and an `isVegetarian` refinement.
- Daily per-recipe cost history (`RecipeCostDaily`, written after the DA scrape) for "cheaper this week" badges.
- Static JSON export of the compiled list to GitHub Pages, with only prices from the API.
- Retire `docs/matcher.js` once `match-review.html` reads `/api/v2` data.
- Remove the v1 client path.

---

## 11. Code layout

```
scraper-backend/
  data/ingredients.json  units.json  da-items.json  reference-prices.json(P2)  golden/*.json
  scripts/compile.ts  review-export.ts  review-import.ts  rescrape-wprm.ts(P2)  fnri-directory.ts(P2)  llm-aliases.ts(P2, optional)
  src/lib/compile/
    normalize.ts   resolve.ts   grams.ts   roles.ts (RULES_VERSION="r1")   aggregate.ts
    compileRecipe.ts (pure)   context.ts (load + memoise)   runner.ts (chunks/phases/gate)   pricing.ts (read time)
  src/lib/auth.ts (requireAdmin)
  src/app/api/compile/route.ts
  src/app/api/v2/recipes/route.ts   src/app/api/v2/recipes/[id]/route.ts
  src/app/api/admin/preview/[recipeId]/route.ts (P2)   src/app/api/admin/compile/[runId]/diff/route.ts (P2)
```

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| The catalog takes longer than a day to seed | Seed only the top ~150 by uses. The matcher fallback (flagged, lower confidence) covers the rest, and the grade reflects it. |
| A rule change silently shifts thousands of recipes | `RULES_VERSION` bump + gate + diff view + kept previous run (rollback = status flip). |
| WPRM labels are themselves estimates | Compare `kcalNaive`. Use the benchmark for regression detection and outlier hunting, not as truth. |
| DA renames an item | Nightly report of catalog items unseen for 7 days; stale-price fallback up to 30 days. |
| Far DB / timeouts | Array transactions, 1,000-row batches, a 40 s budget, idempotent chunks, `hnd1` region. |


**Key decisions:**
- Compile offline into stored tables (CompileRun, CompiledLine, CompiledRecipe) with a pure TypeScript compiler in scraper-backend/src/lib/compile/. The browser stops matching. docs/index.html consumes /api/v2/recipes and /api/v2/recipes/{id}.
- Static and continuous are split: per-serving nutrition is precomputed and versioned. Cost is computed per request from a stored costBasis (grams costed per ingredient slug) times the latest DA price per gram, then CDN-cached with s-maxage=1800. DA scrapes never trigger recompiles.
- DA commodity choice is resolved at read time, not compile time: each catalog ingredient lists acceptable DA items, and cost uses the cheapest variant with a price at most 14 days old (15-30 days is used with a stale flag). DA mapping is done by hand for about 120 priceable ingredients, with no fuzzy DA matching at runtime.
- Matching has two levels: recipe name, then canonical ingredient (git-versioned data/ingredients.json, about 150 entries in the MVP and 400 later), then FNRI code plus density, piece weights, edible fraction and DA items. The 3,386 names map to slugs through the IngredientAlias table.
- Precedence: LineOverride > RecipeOverride > reviewed alias > accepted (LLM/bulk) alias > catalog synonym exact match > token matcher (flagged) > none. A reviewed alias of kind food with no mapping disables the matcher for that name.
- Every compile is a full recompile into a new runId (blue/green). Only the ACTIVE run is served. Promotion is gated, and the previous run is kept for one-flip rollback. A fingerprint (RULES_VERSION, catalog hash, recipe/FNRI counts and max timestamps, alias max(decidedAt), override max(updatedAt)) makes nightly 'ifStale' calls no-ops.
- The fingerprint uses decidedAt, not updatedAt, for aliases, because the compile itself rewrites uses and suggestion fields. Using updatedAt would make every compile trigger another one.
- Serverless pattern: chunks of 250 recipes, looping under a 40 s budget per request. Each chunk is one array $transaction (delete-then-insert for its recipe ids plus the cursor advance), so retries are idempotent. createMany batches are capped at 1,000 rows (24 columns is under the 65,535 bind-param limit). A full compile is about 3 requests from us-east, or 1 request / under 30 s from a laptop or hnd1.
- Recommend pinning Vercel functions to Tokyo (hnd1) to sit next to the DB, after checking the plan allows choosing a region. Also add ADMIN_TOKEN auth to all POST routes, which are open today.
- lineKey is the sha1 of the normalized rawText plus an occurrence index, so overrides survive re-scrapes and duplicate flattened-marinade lines (salt listed twice) stay distinct.
- Three quantities per line: gramsAP, gramsEP (edible fraction applied only to mass and count units; volume lines are already prepped), gramsEaten (EP x consumedFraction) for nutrition, and gramsCost (AP x costFraction) for cost. Frying oil costFraction = consumed + (1 - consumed)/3, assuming about 3 reuses.
- Rules r1 frying detection: 'for frying' in the line, or oil of at least 1 cup with a deep-fry keyword or no instructions, or oil of at least 2 cups. Absorbed oil = 0.08 x fried food EP (wrapped/battered/breaded) or 0.05 (plain), clamped to 5-50% of the oil. These numbers are approximate, from the Bognar 2002 / USDA family.
- Grades A/B/C/D come from grams-weighted coverage (0.90/0.75/0.50) and confidence (0.75/0.60). Imputed servings (round of eaten grams / 300 g, clamped to 2-8) cap the grade at B. Grade D is hidden, and valueScore is shown only when the grade is A-C and cost coverage is at least 0.6.
- Sanity rules: kcal/serving under 30 or over 2,500 forces grade D. Soft flags at under 100 or over 1,200 kcal, macros over 100/100/250 g, mass under 60 or over 1,200 g, fat energy over 70%, and an Atwater energy-closure gap over 20%.
- Benchmark: scrape WPRM per-serving nutrition, preferring JSON-LD Recipe.nutrition with the label spans as fallback, and compare against kcalNaive (all lines 100% eaten), because WPRM labels likely count all frying oil. Metrics are MdAPE, median ratio and Spearman. The promotion gate allows MdAPE to worsen by at most 2 pp and grade D share by at most 1 pp.
- Review in the MVP is a CSV round-trip through local scripts (review-export / review-import), with no UI. Phase 2 adds an /admin/review page with single-recipe in-memory preview. An optional one-time LLM batch (claude-opus-5-5 on the Message Batches API with structured outputs, about $6) proposes long-tail aliases, which are auto-accepted only above confidence 0.9 and rank below human review.
- Fix the DA merged-row bug in extractCommodities by splitting each name on embedded prices (each embedded price belongs to the preceding segment, the trailing price to the last one), then re-run the 29-day backfill. Check that no Commodity name still contains an embedded price.
- Rollout: Phase 0 (days 1-2: DA fix, auth, days param, tsx). MVP (days 3-10: schema, parser, ~150-ingredient catalog, roles r1, runner, v2 API, site switch with v1 fallback, first 200 alias reviews). Phase 2 (WPRM rescrape and benchmark, FNRI alt names and edible portion, group-aware marinade/dredge rules, reference prices, admin page, GitHub Actions). Phase 3 is optional.

## Edge cases (101)

- **[high] Deep-frying oil (oil left in the pot)** — e.g. Lumpiang Shanghai: '2 cups cooking oil (for frying)' with about 700 g filling and 30 wrappers. Same pattern in fried chicken, calamares, turon, okoy, chicharon bulaklak, camaron rebosado.
  - Problem: parseQuantity turns 2 cups into 480 g of oil (cup=240), and all of it is counted as eaten and bought. In reality 1 cup of oil weighs about 218 g (density 0.92), and most of the oil stays in the pot to be reused or thrown away. Cooking oil appears in 1,063 lines, so this is the biggest single error on the site.
  - Detect: Oil-family name (cooking, vegetable, canola, coconut or palm oil, lard, shortening) AND (rawText matches /for (deep[- ])?frying|enough to (cover|submerge)/ OR amount >= 1 cup) AND/OR a step mentions deep fry, deep-fry, 'heat oil in a deep pan/wok', or 'fry until golden ... drain'.
  - Rule: Replace the literal oil amount with fat uptake = uptake% x raw weight of the fried food, capped at the oil listed. Uptake by food type (approximate, from the fat-uptake practice in Bognar 2002 and EuroFIR recipe calculation): unbreaded meat or fish 2-5%; breaded or battered 8-15%; thin wrappers (lumpia, turon, empanada) 12-20%; porous foods (eggplant, tofu, okoy) 10-20%; doughs (bunuelos, karioka, maruya, doughnuts) 15-25%. Convert volume to mass with density 0.92. Cost = uptake plus a pot share, for example one third of the remaining oil assuming about 3 reuses, or let the user choose whether leftover oil is included. For DA 'Cooking Oil ... 1 Liter/bottle', price per liter times ml, not grams.
  - Nutrition: About -3,200 kcal and -350 g fat per batch in the example, roughly -530 kcal per serving at 6 servings. · Cost: Oil cost falls to roughly 35-60% of the current amount (about 0.13 L absorbed plus pot share, against 0.48 L counted now). The 1 L bottle price also needs unit handling.
- **[high] Pan-frying and shallow-frying vs sauteing (gisa)** — e.g. Pritong bangus or daing: '1/2 cup cooking oil' for pan-frying. Tortang talong: '1/2 cup oil' for egg-dipped eggplant. Tokwa't baboy: fried tofu. Compare adobo or any ginisa: '2 tbsp oil' to saute garlic.
  - Problem: 1/2 cup parses as 120 g (the real figure is about 109 g) and is all counted as eaten, but pan-frying leaves a variable amount in the pan. Saute oil is different: it stays in the dish and is eaten.
  - Detect: Oil line with amount 1/4-1 cup plus steps matching /pan[- ]?fry|fry (each|both) sides?|shallow/. Parse 'leaving (\d+) (tbsp|tablespoons)'.
  - Rule: Shallow-fry (oil between 1/4 and 1 cup, steps say pan-fry, 'fry both sides' or shallow): retained oil = min(oil listed, uptake from the deep-fry table). As a fallback, about 20-35% of the oil listed for fish or meat, 40-60% for eggplant, egg tortas and tofu (approximate). Saute (3 tbsp or less, oil stays in the sauce, no 'drain'): 100%. If a step says 'remove excess oil leaving N tbsp', retained = N tbsp + uptake. Cost: the full amount, or retained + 50% when leftover oil is reused (approximate; offer as a setting).
  - Nutrition: For 1/2 cup oil: about -500 to -750 kcal per recipe, roughly -130 to -190 kcal per serving at 4. · Cost: 0 to -50% of the oil line cost, depending on the reuse setting.
- **[high] Cooked or fried FNRI entries matched to raw recipe lines (state lost in tokenizer)** — e.g. 'cooked rice' becomes [rice] because 'cooked' is a stopword, and raw and boiled rice entries then tie. 'dried shiitake' becomes [shiitake] and matches the fresh one. 'eggs' matched 'Vegetable stir-fry w/ quail eggs'. A 'pork belly' line can land on a fried or inihaw FNRI dish while the recipe also lists frying oil.
  - Problem: FNRI per-100 g values differ 2-10x by state: raw milled rice is about 360 kcal and boiled about 130; dried mushrooms are 8-10x fresh. Fried entries already contain absorbed oil and lost water. A fried or prepared entry applied to a raw recipe weight double-counts frying fat and overstates nutrients per gram. A raw entry applied to a cooked weight overstates by 2-3x. The stopwords cooked, dried, roasted, toasted, frozen, boneless and peeled throw this information away.
  - Detect: Deterministic regex over the 1,542 FNRI names, stored as a NutritionFact.state column (one-time batch). Ingredient-state regex on name and rawText.
  - Rule: Give every FNRI food a state tag parsed from foodName: raw | boiled/cooked | fried | grilled/inihaw | canned (cnd) | dried/dehydrated | smoked | salted | prepared dish ('prep', 'w/'). Give every ingredient line a state tag too, by keeping cooked, dried, canned, fried, boiled, leftover and roasted as state tokens instead of dropping them. The ingredient default is raw / as purchased. Hard filter: ingredient state must equal food state. Prepared and composite dishes are never valid ingredient matches. Then apply cooking adjustments (oil uptake, retention, yield) explicitly, once.
  - Nutrition: Prevents 2-4x errors on rice, noodles and legumes and about +10-25% double-counted fat on fried proteins. · Cost: Indirect: drives the cooked-to-raw conversions for cost (rice, noodles, legumes, leftovers).
- **[high] Dredging, breading, egg dip, batter and sugar coating leftovers** — e.g. Fried chicken: '1 cup all-purpose flour (for dredging)', '2 eggs, beaten', '1 cup breadcrumbs'. Calamares: '1 cup cornstarch'. Polvoron or pastillas: 'sugar for rolling'.
  - Problem: 1 cup flour parses as 240 g. Real cup weights: all-purpose flour about 125 g, cornstarch about 128 g, dry breadcrumbs about 108 g, panko about 50-60 g, granulated sugar about 200 g. The whole amount is counted as eaten, but only part sticks to the food and the rest is thrown away. All-purpose flour (207 lines) and cornstarch (172) are heavily used this way.
  - Detect: rawText /(for (dredging|coating|breading|dusting|rolling|dipping))/ OR steps /dredge|coat (with|in)|dip in (beaten )?egg|roll in (bread ?crumbs|panko|sugar)|shake off excess/.
  - Rule: Role = coating. Use per-food cup density. Adhered fraction (approximate practical kitchen yields; EuroFIR recommends weighing the coated item): dry flour or cornstarch dredge 25-35%; breadcrumbs or panko 40-60%; beaten-egg dip 50-70%; batter sized to the food (rebosado, tempura) 70-90%; sugar for rolling 40-60%. Cost: the full purchased mass. Exception: a cornstarch slurry (3 tbsp or less, 'dissolved in water', used to thicken) is 100% eaten.
  - Nutrition: 1 cup flour dredge: about 874 kcal counted (240 g x ~364) vs about 140 kcal actually stuck on (~38 g). That is -735 kcal per recipe, about -185 per serving at 4. · Cost: Small in pesos (flour and cornstarch are cheap and DA may not list them). Cost stays at the full mass, about half of today's 240 g after the density fix.
- **[medium] Rendering and draining fat (bacon, lechon kawali, chicharon, latik)** — e.g. Lechon kawali and crispy pata: pork belly or pata boiled, then deep-fried. Bacon: 'cook until crisp, drain on paper towels'. Sisig or bagnet: 'render the pork fat'. Ground pork: 'brown, then drain excess fat'. Latik: '2 cups coconut cream cooked until the oil separates; drain the oil'.
  - Problem: Raw pork belly is roughly 40-50% fat (approximate). Much of that fat leaves the meat and is drained away, but raw weight x FNRI raw values counts all of it. The right answer depends on whether the rendered fat is thrown away or reused in the dish.
  - Detect: Steps /render|until (the )?fat is rendered|drain (on|onto) paper towels?|pour off|discard (the )?(excess )?(fat|oil)|until (the )?oil separates|latik/ combined with tokens bacon, liempo, pork belly, pata, taba, chicharon, coconut cream, ground pork.
  - Rule: Fat retention by method (approximate; USDA cooking yields and USDA Retention Factors R6 family): bacon cooked crisp and drained 30-40% of raw fat (weight yield about 30-35%); pork belly boiled then deep-fried 60-75%; fatty pork roasted or grilled 70-80%; chicharon from skin 30-50%; browned ground meat with fat drained 75-85%. Latik curds keep 20-40% of the cream's fat if the oil is drained and not served; laing or Bicol express 'cook until oil separates' with nothing drained keeps 100%. Protein and minerals 100%. Where steps say 'use the rendered fat to saute' or 'leave 2 tbsp fat', retain that amount.
  - Nutrition: 1 kg pork belly (about 450 g fat raw) at 70% retention: -135 g fat, about -1,200 kcal per recipe or -300 kcal per serving at 4. · Cost: None; the bought weight is already right.
- **[medium] Grilling and roasting drip loss; basting liquids** — e.g. Inihaw na liempo; pork BBQ skewers basted with marinade; chicken inasal basted with annatto oil or margarine; lechon manok; turbo-roasted pork.
  - Problem: Fat drips onto the coals or into the pan. Basting liquids are counted in full, but much of them drips off too.
  - Detect: Steps /grill|ihaw|broil|roast|turbo|charcoal|baste/ and rawText /(for basting)/.
  - Rule: Fat retention about 75-85% for fatty pork and skin-on chicken that is grilled; about 95-100% for lean meat (approximate, USDA cooking yields). Basting liquid: count 50-70% of the amount listed (approximate). When starting from raw FNRI values, never scale nutrients by moisture weight loss; apply only the fat factor.
  - Nutrition: -10 to -20% fat on liempo. 1/2 cup annatto-oil baste (about 950 kcal) loses about 300-475 kcal per batch. · Cost: None for meat; basting liquid stays at full cost.
- **[medium] Parboiling in water that is thrown away, with aromatics in it; skimmed fat** — e.g. Lechon kawali: 'boil pork belly in 8 cups water with 1 tbsp salt, 1 tbsp peppercorns, 5 bay leaves, 1 onion and 1 head garlic for 45 minutes; drain'. Dinuguan or sinigang: 'boil pork 5 minutes, discard the water'. Nilaga: 'skim the fat'.
  - Problem: Aromatics boiled in water that is then discarded are counted as eaten. Separately, '1 head garlic' parses to 500 g (head=500), while '2 heads' parses to 120 g because 'heads' falls through to 60 g each. A real head of garlic is about 40-50 g. Skimmed fat is also counted.
  - Detect: Steps /(boil|simmer).*(drain|discard (the )?(water|liquid))/ and link each ingredient to the step that names it via RecipeInstruction text. Offline Claude Haiku can classify ingredient-to-step links where regex is too brittle; store the result as the ingredient role.
  - Rule: An aromatic whose only use is a liquid that gets drained or discarded: nutrition 0, cost = full bought amount. Fix count weights: garlic head about 45 g, medium onion about 110-150 g (approximate), and make 'head' and 'heads' consistent. Parboiled-and-drained meat: fat loss about 5-15% (approximate). 'Skim the fat/oil': remove about 20-40% of rendered fat (approximate). Scum skimming: no change.
  - Nutrition: Removes about 745 phantom kcal (500 g garlic x ~149) in the example, plus 5-15% of the pork fat. · Cost: The garlic-head fix cuts that line about 90% (500 g down to 45 g at the DA 'Garlic, Imported' price).
- **[medium] Vitamin losses in wet cooking: drained vs steamed vs liquid eaten vs long braise** — e.g. Blanched kangkong for adobong kangkong or ensalada; boiled sitaw or okra served with bagoong; steamed broccoli; sinigang, tinola or nilaga where the broth is eaten; pinakbet or kare-kare vegetables simmered; stir-fried pancit vegetables.
  - Problem: Raw FNRI vitamin C and B1 values are used with no cooking loss. Vitamin C carries 0.16 weight in the health score, so blanched-greens recipes score better than they should.
  - Detect: Drained: steps /blanch|boil.*drain|shock in (ice|cold) water/. Steamed: /steam/. Soup: title or tag sinigang, tinola, nilaga, sopas, bulalo, soup, 'serve with broth'. Braise length from cookTime or /simmer for (\d+) (minutes|hours?)/.
  - Rule: Apply retention factors in the style of USDA Retention Factors Release 6 (approximate). Boiled and drained vegetables: vit C 45-65% (leafy greens 40-50%), B1 60-80%, B2 75-90%, vit A 85-100%, Ca and Fe 85-95%. Steamed: vit C 70-90%, B1 80-90%. Soups and stews where the liquid is eaten: minerals 100%, vit C 50-75% for a short simmer and 25-50% for a braise over 1 h, B1 70-85%. Stir-fry or saute: vit C 70-85%. Meat B1 in braises 50-70%. Pick the factor from a method tag on each line.
  - Nutrition: Vit C -25 to -60%, B1 -15 to -40%. Negligible for kcal and macros. · Cost: None.
- **[high] Cooking rice: raw vs cooked quantities** — e.g. Sinangag: '4 cups cooked rice (day-old)'. Arroz caldo: '1 cup uncooked rice'. Champorado: '1 cup glutinous rice (malagkit)'. Also 'rice washing water (hugas bigas)' used in sinigang or tinola.
  - Problem: 'cooked' is a stopword, so 'cooked rice' matches raw FNRI rice (about 360 kcal/100 g). cup=240 g is also wrong: cooked rice is about 160-185 g per cup and raw milled rice about 185-200 g. The DA price is per kg of raw milled rice ('Regular Milled 20-40% bran streak'), so cooked grams cannot be priced directly.
  - Detect: Line tokens cross-checked against steps. Flag ambiguous bare 'rice' lines in recipes that have no rice-cooking step.
  - Rule: Rice is cooked if the line says cooked, steamed, leftover, day-old, kanin or sinaing. It is raw if it says uncooked, raw or washed, or has no qualifier and a step says 'add rice and water ... simmer'. Densities: cooked about 170 g/cup, raw milled about 190 g/cup, raw glutinous about 200 g/cup (approximate, USDA SR household measures). Nutrition for cooked lines uses the FNRI boiled-rice entry. Cost uses raw equivalent = cooked g / yield; yield by weight is 2.5-3.0, about 2.4-2.6 at Filipino 1:1.5-2 water ratios (USDA cooking-yields family). Rice washing water: nutrition 0 and cost 0. It is already non-priceable, but it must also be kept out of FNRI matching.
  - Nutrition: About 3,460 kcal (960 g x 360) vs about 880 kcal (680 g x ~130): -2,580 kcal per recipe, about -650 per serving at 4. · Cost: 4 cups cooked rice is costed as 960 g of raw rice today. The right figure is about 270 g raw equivalent (680 g / 2.5), so the current cost is about 3.5x too high.
- **[medium] Dry vs cooked or soaked noodles and pasta; label pack weights** — e.g. Pancit bihon: '8 oz rice noodles, soaked 10 minutes'. Pancit canton: '1 pack (454 g) canton noodles'. Sopas: '2 cups uncooked elbow macaroni'. Macaroni salad: '4 cups cooked macaroni'. Sotanghon soup: '100 g sotanghon'.
  - Problem: Dry and cooked noodles differ 2.5-4x per gram. 'pack' parses as a flat 200 g and ignores '(454 g)'. Dry macaroni is about 100-105 g per cup and cooked about 140 g, not 240 g.
  - Detect: Name tokens noodle, pancit, bihon, canton, sotanghon, miki, misua, macaroni, spaghetti, pasta, plus state tokens. rawText regex /\((\d+(?:\.\d+)?)\s*(g|grams|oz|ounces?|lbs?)\)/.
  - Rule: Default noodle state = dry, as purchased. If 'cooked' or 'soaked' comes before the noun, convert to dry equivalent with these yields: wheat pasta 2.2-2.5x; bihon or rice vermicelli 2.5-3.5x (approximate); sotanghon 3-5x (approximate); fresh miki or pre-cooked canton 1.0. A parenthetical net weight like '(454 g)', '(8 oz)' or '(16 oz)' overrides the unit table. Match the FNRI dry entry and apply only B1 retention (about 70-80%) when the pasta is boiled and drained. The cooking water is discarded: nutrition 0.
  - Nutrition: '4 cups cooked macaroni': about 3,550 kcal today vs about 890 kcal. '1 pack (454 g)' canton: currently counted as 200 g, an undercount of about 56% (about -1,000 kcal). · Cost: DA probably has no noodle prices, so mark these lines 'unpriced' rather than silently 0 (SM is out of scope).
- **[low] Dried legumes (soaked) and canned beans** — e.g. Ginisang monggo: '1 cup dried mung beans, soaked overnight'. Callos or cocido: '1 can (15 oz) garbanzos, drained'. Pork and beans; sweetened red mung beans for halo-halo.
  - Problem: Dry mung beans weigh about 205 g per cup, not 240. Cooking with soaking roughly 2.2-2.6x the weight. Canned drained legumes are about 60% of net weight. A cooked or canned weight matched to a dry FNRI entry triples the kcal.
  - Detect: Tokens monggo, mung, bean, garbanzo, chickpea, lentil, patani, combined with dried, soaked, canned or drained.
  - Rule: State is dry unless cooked, canned or boiled comes before the noun. Dry density per food: mung about 205 g, red beans about 185 g, garbanzo about 200 g per cup (approximate, USDA SR). Soaking water is discarded: nutrition 0; losses of tracked nutrients are minor (about 5-10% Fe and B1, approximate). Canned: net weight from the parenthetical x drained fraction (about 0.6), matched to an FNRI canned or boiled entry. Cost: when only a dry price exists, cooked or canned quantity converts to dry equivalent = cooked / 2.4.
  - Nutrition: -15% from density. Up to -65% where a cooked or canned weight was matched to dry values. · Cost: -15% from the density fix. About -60% where cooked quantities are priced at the dry per-kg price.
- **[medium] Dried mushrooms, dried shrimp and dried fish: counts and rehydration** — e.g. Chop suey: '6 pieces dried shiitake mushrooms, soaked and sliced'. 'Tenga ng daga (wood ear), soaked'. '1/4 cup hibe (dried shrimp)'. '6 pieces tuyo, fried'. '1 piece daing na bangus'.
  - Problem: piece=50 g, but a dried shiitake cap weighs about 3-5 g, a tuyo about 10-20 g and a daing na bangus about 150-250 g (approximate). 'dried' is a stopword, so the fresh FNRI item is matched, which has about 8-10x lower kcal per gram; the errors partly cancel in unpredictable ways. Some recipes give the rehydrated weight (about 4-6x dry for shiitake, 7-10x for wood ear, approximate).
  - Detect: Tokens dried, tuyo, daing, dilis, hibe, tinapa, shiitake, wood ear, tenga with a count unit or a soak/rehydrate verb.
  - Rule: Use a per-food dry piece-weight table. Keep 'dried' as a state token and match dried FNRI entries (FNRI has many dried fish). If 'rehydrated' or 'soaked' comes before the noun on a weight line, divide by the rehydration ratio. Soaking water: 0, including when 'reserve soaking liquid' (tracked nutrients are negligible). Fried dried fish: add 3-8% oil uptake (approximate). Desalting soaks change sodium only, which is not tracked yet.
  - Nutrition: Shiitake example: about 105 kcal now vs about 62 kcal. Tuyo protein about 3x overcounted (300 g counted vs about 90 g). · Cost: Mostly unpriced in DA. Where priced, daing at 50 g instead of about 200 g is a 4x undercount.
- **[medium] Canned goods: drained solids vs packing syrup or brine** — e.g. Buko salad: '1 can (836 g) fruit cocktail, drained'. Pininyahang manok: '1 can (20 oz) pineapple chunks, juice reserved', where the juice is added later. Menudo: '1 cup canned green peas, drained'. '1 can whole kernel corn, drained'. Tuna in oil, drained.
  - Problem: can = a flat 400 g, ignoring the label weight. Drained solids are about 55-65% of net weight. Syrup (about 15-20% sugar, approximate) or packing oil is thrown away but still counted.
  - Detect: /can|canned|cnd|tin/ together with /drained|reserve(d)?/. Cross-check steps for 'add the reserved (juice|syrup)'.
  - Rule: Parse the net weight from the parenthetical. If the line says drained and no step reserves and re-adds the juice or syrup, use a drained fraction (0.6 default, per-food later) and the FNRI canned-drained or in-syrup solids entry. If the juice or syrup is reserved and added: 1.0. Canned fish in oil, drained: remove the packing oil (about 10-15% of can weight, approximate).
  - Nutrition: Fruit cocktail (836 g): counted as 400 g today; should be about 500 g fruit, with about 330 g syrup (about 230 kcal) excluded. · Cost: The whole can is bought, but DA has no canned goods, so these lines stay unpriced (SM is out of scope).
- **[high] Grated coconut squeezed for gata (sapal discarded) and double listing** — e.g. Ginataang kalabasa, laing or biko: '2 cups grated coconut (1 mature coconut), squeezed with 1 cup water for kakang gata, then 2 cups water for the second extraction'. Or a recipe that lists both '1 coconut, grated' and '2 cups coconut milk'.
  - Problem: Grated coconut meat is about 354 kcal, 33 g fat and 9 g fiber per 100 g (approximate), and it is counted at 240 g per cup when freshly grated coconut is about 80-95 g per cup (approximate). After squeezing, the solids (sapal) are thrown away. When the recipe lists both the grated coconut and the milk made from it, both are counted. Coconut milk appears in 104 lines.
  - Detect: Tokens grated, kinayod or niyog with coconut, plus extraction verbs in steps, plus another line in the same recipe matching coconut milk, gata, kakang gata or coconut cream.
  - Rule: Role = extract source. If grated coconut appears with squeeze, pigain, extract, strain or cheesecloth, nutrition = derived coconut milk: fat transfer about 70-80%, protein 40-60%, carbs about 50%, fiber 10-15% of the grated-meat values (approximate; coconut-milk processing literature, FAO/INFOODS recipe-calculation approach). Added water contributes 0. When milk or cream lines come from the same coconut, count nutrition once (on the milk lines) and cost once (on the grated or whole coconut). Grated coconut used as a topping (puto, palitaw, bibingka) is 100% eaten. Reference yields: a mature coconut gives about 350-450 g meat; a buko gives about 150-250 g meat and 250-400 ml water (approximate).
  - Nutrition: 2 cups grated (480 g now, about 1,700 kcal) becomes about 180 g grated, about 640 kcal, x 0.75 fat transfer = about 480 kcal. Fiber -90%. Double listing currently adds about +1,000 kcal. · Cost: Cost goes on the grated or whole coconut, not the derived milk lines. Today the double listing double-costs.
- **[medium] Wet marinade thrown away vs used for basting vs cooked in (includes kinilaw vinegar)** — e.g. Pork BBQ: 1 cup soy sauce, 1/2 cup banana ketchup, 1/2 cup brown sugar, 1 cup lemon-lime soda and 1/4 cup calamansi juice for 1 kg pork; 'reserve marinade for basting'. Chicken inasal: vinegar-calamansi-lemongrass marinade thrown away. Beef tapa: 'cook in the marinade'. Kinilaw: 'wash fish in 1/2 cup vinegar and discard; add 1 cup vinegar'.
  - Problem: The whole marinade is counted as eaten. WPRM group headers ('For the marinade') and notes are not stored, so the role is invisible. Brown sugar is the main calorie source (161 brown-sugar lines; soy sauce 397).
  - Detect: rawText /marinade/ and steps /marinate|discard (the )?marinade|reserve (the )?marinade|baste with (the )?marinade|(cook|simmer).*(with|in) (the )?marinade|pour (in )?the marinade/. Rescrape WPRM .wprm-recipe-group-name and .wprm-recipe-ingredient-notes to recover groups. Classify the ambiguous rest with offline Claude Haiku once and store the result as the ingredient role.
  - Rule: Three outcomes, read from the steps. Thrown away: the meat takes up about 5-10% of its own weight in marinade, so factor = uptake g / marinade g, typically 0.1-0.2 (approximate). Reserved for basting or boiled down to a glaze: 0.5-0.7. Cooked in it (tapa, adobo, humba): 1.0. Kinilaw wash vinegar: 0; serving vinegar: 0.3-0.5 consumed. Cost is always the full amount.
  - Nutrition: BBQ: the marinade is about 750 kcal; at 0.6 for basting, about -300 kcal per batch. Thrown-away vinegar-type marinades lose 80-90% of their kcal, which is small in absolute terms. · Cost: None; cost stays full.
- **[low] Dry cure (tocino, longganisa, tapa): mostly retained** — e.g. Pork tocino: '1 kg pork shoulder, 1 cup brown sugar, 2 tbsp salt, 1 tsp curing salt (Prague powder), 2 tbsp anisado wine, 1 tsp annatto'. Vigan or skinless longganisa. Beef tapa cured and sun-dried.
  - Problem: Unlike a wet marinade, a dry cure is mostly absorbed. Tocino is then cooked in water until the sugar caramelizes on the meat, so applying the marinade discount would undercount. Sun-drying (tapa) removes water only. These are freezer batches with many servings.
  - Detect: Title matches tocino, longganisa, tapa, cured or 'homemade ham'; steps /cure|refrigerate for [1-3] days|sun[- ]?dry|stuff (into|the) casings?/.
  - Rule: Dry cure retention 85-95%: 5-15% lost to purge and pan residue (approximate). Drying: no macro change; apply only vit C and B1 losses. Curing salt and Prague powder: 0 kcal, negligible cost. Hog casings: negligible nutrition; cost them if a price is found.
  - Nutrition: -5 to -15% of the cure's sugar kcal, about -40 to -110 kcal per batch. The main point is to stop the marinade rule from wrongly zeroing the cure. · Cost: None.
- **[medium] Pickles, ferments and condiment batch recipes** — e.g. Atchara: '1 kg green papaya, 2 cups vinegar, 1 1/2 cups sugar, 2 tbsp salt', yielding about a 1 L jar. Also burong mangga, pickled eggs, sinamak (spiced vinegar), lechon sauce, bagoong guisado.
  - Problem: Most of the brine or syrup stays in the jar. A condiment is eaten 15-30 g at a time, but servings is often null, and the default of 4 makes per-serving numbers absurd. Fermentation also uses up part of the sugar.
  - Detect: Title keywords plus steps /pickle|store in (a )?(jar|bottle)|ferment|let (it )?stand for \d+ days/.
  - Rule: Brine role: vinegar or water about 0-10% eaten; dissolved sugar or salt taken up about 25-40% (approximate); fermentation reduces sugar a further 10-30% (approximate). Recipe class condiment/preserve (title keywords atchara, buro, pickled, sawsawan, sauce, dip, bagoong, ketchup, jam, spread): per-serving uses a standard condiment portion (for example 30 g; confirm against PH serving conventions) and an estimated yield from the eaten solids, not the default 4.
  - Nutrition: Atchara sugar today: 360 g, about 1,390 kcal / 4 = about 350 kcal per serving. Corrected: about 300 g x 0.35 = about 400 kcal over about 30 servings, about 13 kcal per serving. · Cost: The brine stays at full cost but is spread over the real yield, so cost per serving falls about 5-10x.
- **[low] Brines and salting (salted eggs, brined chicken)** — e.g. Itlog na maalat: '12 duck eggs, 1 cup salt, 4 cups water', soaked 21 days. Fried-chicken brine: '8 cups water, 1/2 cup salt, 1/4 cup sugar', then drain and rinse. Daing na bangus: 'rub with salt'.
  - Problem: Most of the brine's solutes are thrown away, but the sugar is counted as eaten. Salt is costed, and it will matter once sodium is tracked.
  - Detect: /brine|soak in (salt|salted) water|salted eggs|itlog na maalat|rinse (off )?(the )?(salt|brine)/.
  - Rule: Solute uptake 5-10% (approximate); water 0; salt and sugar at full cost.
  - Nutrition: Sugar in brine -90% (1/4 cup sugar is about -175 kcal per batch). No sodium effect yet. · Cost: Negligible (salt is cheap).
- **[medium] Infused and strained aromatics and souring agents (tamarind, ginger, lemongrass)** — e.g. Sinigang sa sampalok: '1 lb unripe tamarind, boiled, mashed and strained'. Tinola or inasal: 'lemongrass stalks'. 'Pandan leaves' in rice and desserts. Adobo or humba: bay leaves, whole peppercorns, star anise, cinnamon stick. Achuete: 'annatto seeds soaked in water, strained'. Salabat: '1 cup sliced ginger', steeped.
  - Problem: These ingredients are removed or strained out. 454 g of tamarind matched to 'Tamarind, ripe' (about 239 kcal/100 g, approximate) adds about 1,000 kcal, though seeds, shell and fiber are discarded. Tamarind is non-priceable only by accident: the substring check finds 'rind' inside 'tamarind'.
  - Detect: Steps /strain|discard the (seeds|leaves|stalks|ginger|tamarind)|remove (it )?before serving|steep|infuse|mash and strain/ plus aromatic tokens.
  - Rule: Role = infusion. Nutrition = extract fraction: unripe tamarind used for souring gives 10-20% of pulp solids, with pulp about 35-45% of pod weight (approximate). Ginger, lemongrass, pandan, bay leaf, star anise, cinnamon, whole peppercorns boiled in liquid, and steeped annatto seed (color only): 0. Cost: full bought quantity for priceable items (tamarind, ginger, lemongrass). Change the NON_PRICEABLE check to whole-token or phrase matching so tamarind is no longer excluded by accident.
  - Nutrition: -900 to -1,000 kcal per pot for sinigang sa sampalok when ripe tamarind is matched. Salabat: -100% of the ginger kcal. · Cost: Tamarind and ginger become priced (small peso amounts).
- **[medium] Bones and carcasses for stock; meaty bones** — e.g. '2 lbs beef bones (for stock)', 'chicken carcass', '1 kg pork neck bones (buto-buto)' for sinigang. Bulalo: beef shank with marrow, where the marrow is eaten.
  - Problem: 'beef bones' tokenizes to [beef, bon] and can reach the 0.4 gate against a beef meat entry (it scored 0.40 in a local test), so about 900 g of meat that is not there gets counted. A stock extracts only gelatin and some fat.
  - Detect: Tokens bone, bones, buto, carcass, backs or neck with /for (stock|broth)/ or a step that strains the stock.
  - Rule: Bones without meat: nutrition from a broth model, homemade broth at about 10-40 kcal and 1-3 g protein per 100 g of finished liquid (approximate, USDA SR broth family), scaled to final volume (water listed minus 10-25% evaporation). Meaty bones (buto-buto, neck bones, ribs): meat EP about 25-45% (approximate) plus broth. Bulalo marrow bones: marrow about 10-20% of shank weight as bought (approximate). Cost: the full price of the bones.
  - Nutrition: 900 g beef bones counted as beef meat is about 1,800 kcal; a broth model gives about 300 kcal, so about -1,500 kcal per recipe. · Cost: None.
- **[high] Bone-in meat: weight as purchased vs edible portion** — e.g. Tinola: '1 whole chicken (about 3 lbs), cut into serving pieces'. Chicken adobo with drumsticks. Sinigang na baboy: 2 lbs pork ribs. Kare-kare: 3 lbs oxtail. Bulalo: beef shank. Crispy pata.
  - Problem: The recipe weight is as purchased (with bone), but FNRI values are per 100 g edible portion. FNRI's 'Edible portion %' column is not stored. 'boneless' and 'skinless' are stopwords, so that state is lost.
  - Detect: Meat tokens plus bone-in signals: whole, 'cut into serving pieces', drumstick, thigh, wing, ribs, pata, shank, oxtail, buntot, 'with bone'.
  - Rule: Scrape and store FNRI EP% per food. Raw meat lines are as-purchased by default, unless they say boneless, fillet, meat only, ground or cubed. Nutrition grams = as-purchased weight x EP%. Fallback EP when FNRI has none (approximate, FNRI EP column and USDA refuse): whole chicken 65-70%, legs and thighs 70-75%, wings 55-60%, pork ribs 55-65%, pata 50-60%, beef shank 50-60%, oxtail 40-50%. Cost uses the as-purchased weight (DA prices are per kg as purchased). Grammar convention: 'X, deboned' (after the comma) was weighed before deboning; 'deboned X' was weighed after, so weight to buy = weight / EP%.
  - Nutrition: Tinola: 1,361 g as purchased becomes about 920 g edible, about -30% kcal and protein (about -170 kcal and -15 g protein per serving at 6). Oxtail: -50 to -60%. · Cost: None when the recipe gives the as-purchased weight. +40 to +100% when it gives edible weight ('500 g deboned chicken thigh').
- **[high] Whole fish: piece weight and edible portion** — e.g. Paksiw na bangus: '1 piece milkfish (about 1 lb), cleaned and sliced'. Sinigang na isda: '2 pieces tilapia'. Escabeche: '1.5 lbs lapu-lapu'. Fried galunggong: 6 pieces.
  - Problem: piece=50 g, but a bangus weighs about 400-600 g, a tilapia about 250-350 g and a galunggong about 80-120 g (approximate). Head, bones, scales and guts are thrown away, while FNRI values are per edible portion.
  - Detect: Fish species tokens with a count unit, or whole, cleaned, scaled or gutted.
  - Rule: Per-species piece-weight table (as purchased). Nutrition = as-purchased weight x FNRI EP% (approximate: bangus 55-65%, tilapia 45-55%, galunggong 60-70%). Cost = as-purchased grams x DA price per kg (DA lists bangus, tilapia, galunggong and 'Mackerel, Imported Frozen, Whole Round'). Lines that say fillet or deboned bangus are edible weight; weight to buy = edible / EP%, unless DA lists a boneless commodity.
  - Nutrition: The piece-weight fix multiplies 4-10x; the EP fix then takes off 35-55%. · Cost: '2 pieces tilapia' is costed as 100 g today vs about 600 g as purchased: a 6x undercount.
- **[high] Shellfish and crustaceans in the shell** — e.g. Sinigang na hipon: '1 lb shrimp, head-on'. Garlic butter shrimp: '1 lb shrimp, peeled and deveined' vs '1 lb peeled shrimp'. Tinolang tahong: '2 lbs mussels'. Halaan soup: '1 kg clams'. Ginataang alimango: '3 pieces crab'. Adobong pusit: '1 lb squid, cleaned'.
  - Problem: Shells are most of the bought weight, and nutrition is counting them. 'peeled' is a stopword, so the before-or-after-peeling convention is lost. Shrimp appears in 88 lines.
  - Detect: Tokens shrimp, prawn, hipon, sugpo, mussel, tahong, clam, halaan, tulya, crab, alimango, alimasag, squid or pusit, plus state words and their position.
  - Rule: EP (approximate, FNRI EP / USDA refuse family): shrimp head-on, shell-on 45-60%; headless, shell-on 80-85%; mussels in shell 25-35%; clams 15-25%; crabs 25-35%; squid cleaned 75-80%. Grammar convention: a modifier before the noun ('peeled shrimp') means edible weight, so weight to buy = edible / EP%; after a comma ('shrimp, peeled') means as-purchased weight.
  - Nutrition: Mussels: 907 g becomes about 270 g meat (-70%). Clams: about -80%. Shrimp: -40 to -55%. · Cost: '1 lb peeled shrimp' needs about 0.8-1.0 kg as purchased: +80 to +120% cost.
- **[medium] Trimming and peeling vegetables and fruit; prepped volume vs whole count** — e.g. '1 bunch kangkong' (hard stems discarded). '2 cups malunggay leaves' (stripped from the stems). '1 small kalabasa, peeled and cubed'. '6 pieces saba' for turon or maruya. '1 kg unripe langka'. '1 green papaya'. '1 whole buko'.
  - Problem: Count and bunch units give as-purchased weight but use flat weights (piece=50 g, bunch=200 g). Nutrition then uses the as-purchased weight instead of the edible part. Prepped-volume lines (cups of leaves) are edible weight, but DA prices are per kg or bunch as purchased, so they are costed too low.
  - Detect: Count or bunch units; peeled, seeded, cored, 'leaves only' or stripped; adjective-before-noun prepped forms.
  - Rule: Per-food count weights (as purchased) and EP% from the FNRI column. Approximate EP: kangkong 50-60%, malunggay leaves 30-40% of the branch, kalabasa 80-85%, sayote about 85%, green papaya 75-80%, saba 65-70%, unripe langka 50-60%, onion about 90%, garlic 85-90%, carrot 85-90%, cabbage 80-90%, potato about 85%. Whole or count lines: nutrition = as-purchased x EP. Prepped-volume lines ('2 cups chopped X'): weight to buy = edible / EP%. Use per-food cup densities for chopped vegetables (about 70-150 g per cup).
  - Nutrition: -10 to -50% on trimmed lines. Saba is net about +40% after both the piece fix and EP. · Cost: Malunggay: 2 cups of leaves (about 45 g edible) needs about 130 g as purchased. Saba: 6 pieces are 300 g today vs about 700 g as purchased (+130%).
- **[medium] Juice and zest from whole fruit** — e.g. '1/4 cup calamansi juice' in pancit, bistek or inasal. 'Juice of 2 lemons'. 'Zest of 1 dayap' in leche flan.
  - Problem: The recipe measures juice, but the buyer pays for whole fruit at DA price per kg. Juice is only about 30-40% of fruit weight (approximate), and one calamansi weighs about 10-15 g. Whole-fruit FNRI values include peel and fiber.
  - Detect: Tokens juice, katas, juiced, squeezed or zest with citrus names (calamansi, lemon, dayap, dalandan, lime).
  - Rule: Juice lines: nutrition from the FNRI juice entry, or whole fruit minus fiber. Cost = juice g / juice yield x price per kg of fruit. 'Juice of N fruit' = N x per-fruit juice (approximate: calamansi about 5 ml, lemon 35-45 ml, dalandan 50-70 ml). Zest: nutrition 0; cost = whole fruit, unless the juice of the same fruit is also listed (count it once).
  - Nutrition: Small for kcal. Fiber drops; vitamin C per gram of juice is similar to the whole fruit. · Cost: 1/4 cup calamansi juice is costed as 60 g today; it takes about 150-180 g of fruit, so cost x2.5-3.
- **[medium] Pre-cooked or leftover ingredients** — e.g. Chicken sopas or macaroni salad: '2 cups shredded cooked chicken'. Lechon paksiw: '2 lbs leftover lechon'. 'Cooked ham, cubed' in sopas. 'Crushed chicharon' as a topping.
  - Problem: The tokenizer drops cooked, roasted and leftover, so these match raw meat. Cooked meat has 25-35% less water, so more nutrients per gram, and the amount actually bought is larger (raw weight plus bone).
  - Detect: Tokens cooked, leftover, left-over, roasted, 'shredded cooked', boiled or grilled with a meat token; titles such as 'paksiw na lechon' or 'sinangag'.
  - Rule: State cooked: use the FNRI cooked entry, or raw values / yield (cooked yield for boneless chicken about 70-75%, pork 65-75%, approximate, USDA cooking yields). Shredded cooked chicken is about 140 g per cup (USDA SR). Cost: raw as-purchased equivalent = cooked / yield / EP%. Shredded chicken from a whole bird is about 2.2-2.5x the cooked weight. Leftover lines: offer 'cost as 0, uses leftovers' with a visible label, or price as the commodity.
  - Nutrition: The density fix takes off about 40%; the cooked-state fix adds 30-40% per gram. Net about -20%. · Cost: 2 cups cooked chicken: 480 g today vs about 280 g cooked, which needs about 650 g of whole chicken (+35%).
- **[high] Eggs: yolks or whites only, egg wash, shell, and per-piece price** — e.g. Leche flan: '10 egg yolks'. Yema: '6 egg yolks'. Silvanas: '5 egg whites'. Empanada: '1 egg, beaten (for egg wash)'. Embutido or morcon: '4 hard-boiled eggs'.
  - Problem: A unitless count parses as 60 g each whatever the part, but a yolk is about 17 g, a white about 33 g and a whole egg without shell about 50 g. DA 'Chicken Egg (White, Medium) 56-60 grams/pc' is a price per piece, yet the cost formula treats it as price per kg. There are 289 egg lines ('eggs' 182 + 'egg' 107).
  - Detect: Tokens egg, eggs or itlog with yolk(s), white(s), or /for (egg )?wash|for brushing/. DA name regex /(\d+)-(\d+)\s*grams\/pc/.
  - Rule: Part weights: whole edible about 50 g for a medium egg (shell about 11-12% of the egg as bought), yolk about 17 g, white about 33 g; match the FNRI yolk and white entries. Cost = N eggs x price per piece, parsing '/pc' and the 'grams/pc' size from the DA name. A yolk-only or white-only line costs N whole eggs, unless the other part is used in the same recipe; then split by mass, one third to the yolk and two thirds to the white. Egg wash: 30-50% eaten (approximate). Poaching vinegar and water: 0.
  - Nutrition: Leche flan: 600 g of yolk (about 1,950 kcal) vs 170 g (about 550 kcal), so -1,400 kcal per batch. · Cost: 10 eggs cost about P8/1000 x 600 = P4.8 today vs 10 x about P8 = about P80: roughly a 16x undercount on every egg line.
- **[low] Alcohol cooked off** — e.g. Beef caldereta with '1 cup red wine' simmered 1.5 h. Beer-braised chicken with '1 bottle (330 ml) beer'. Humba with Shaoxing or rice wine. Flambeed bananas with '1/4 cup rum'.
  - Problem: FNRI calories for drinks include alcohol (about 7 kcal/g), and part of the alcohol evaporates during cooking. Sherry, mirin, sake and rice wine are on the NON_PRICEABLE list even though they are bought.
  - Detect: Tokens wine, beer, rum, brandy, gin, sherry, mirin, sake, shaoxing, tuba, lambanog or anisado. Simmer time from steps or cookTime; flambe from /flamb|ignite|flame/.
  - Rule: USDA Retention Factors R6 alcohol retention (Augustin et al. 1992): added to boiling liquid and removed from heat 85%; flamed 75%; no heat, stored overnight 70%; baked 25 min unstirred 45%; baked or simmered while stirred: 15 min 40%, 30 min 35%, 1 h 25%, 1.5 h 20%, 2 h 10%, 2.5 h 5%. Apply this to the alcohol kcal only, with ABV assumptions: beer about 5%, wine about 12%, Shaoxing or rice wine 15-18%, rum, brandy or gin about 40%. Non-alcohol carbs stay. Mark these lines 'unpriced' rather than non-priceable.
  - Nutrition: 1 cup red wine (about 200 kcal, about 165 of it alcohol) after 1.5 h is about 70 kcal: -130 kcal per batch. · Cost: None, apart from switching these lines to 'unpriced'.
- **[low] Caramelized sugar and sugar left behind** — e.g. Leche flan: '1 cup white sugar (for caramel)' melted in the llanera. Turon: brown sugar that partly melts into the frying oil. Arnibal for taho or sago't gulaman is mostly consumed (control case).
  - Problem: Caramel stuck to the mold and sugar lost into the oil are counted as eaten. cup=240 g, while white sugar is about 200 g per cup and packed brown sugar about 220 g.
  - Detect: Sugar lines with /caramel|llanera|melt (the )?sugar|until amber/ or a turon title.
  - Rule: Fix sugar density first. Caramel retention 70-85% (residue left in the mold, approximate). Turon sugar retention 70-80% (approximate). Syrup served with the dish or drink: 100%. Mass loss from caramelizing is negligible for kcal.
  - Nutrition: 1 cup caramel: about 929 kcal counted vs about 600 kcal (-35%). · Cost: None.
- **[low] Baking: greasing, dusting and brushing pans; baking losses** — e.g. Puto, bibingka or banana bread: 'butter for greasing the pan', 'flour for dusting', 'oil for brushing the molds'. Ensaymada brushed with butter is a control case: that butter is eaten.
  - Problem: Grease and dusting amounts (often '2 tbsp butter') are counted in full. Baking also degrades thiamin.
  - Detect: rawText /(for (greasing|dusting|brushing))/ or steps /grease (the )?(pan|molds?|llanera)|dust with flour/.
  - Rule: Greasing, dusting or brushing a pan or mold: 25-50% transfers to the food (approximate). Brushed toppings: 100%. Baked goods: B1 75-85% and B2 85-95% retention (USDA R6, approximate). Never scale macros by the baking weight loss (about 10-15% water) when starting from raw ingredients.
  - Nutrition: Small: about -50 to -100 kcal per batch. · Cost: None.
- **[medium] Garnish, 'to taste', 'for serving', dipping sauces and optional items** — e.g. 'Salt and pepper to taste' (153 lines). 'Chopped green onions for garnish'. '6 pieces calamansi (for serving)'. '1/2 cup spiced vinegar for dipping'. '1 cup lechon sauce for dipping'. '1/2 cup bagoong alamang (for serving)' with kare-kare. 'Chili flakes (optional)'.
  - Problem: Dipping sauces and side condiments are only partly eaten, optional items are included in the base totals, and 'to taste' lines with no amount silently count as 0. Calamansi pieces count as 50 g each instead of about 12 g.
  - Detect: rawText /(to taste|for garnish|for serving|for dipping|optional|as needed|as desired)/.
  - Rule: Side or dip role: 30-50% eaten (approximate), with a UI note. Garnish: 100% of the small amount. Optional: excluded from the base and shown as an add-on difference. 'To taste' with no amount: nutrition 0; cost is a token pantry allowance or 0 with a flag. 'X or to taste': use X.
  - Nutrition: Kare-kare bagoong, 1/2 cup (about 150-250 kcal, approximate): 40% eaten. Lechon sauce, 1 cup (about 200-300 kcal, approximate): -50%. · Cost: Dips at full or partial cost (a product decision); fix calamansi piece weight.
- **[medium] Inedible process items and process liquids** — e.g. Suman, bibingka or steamed fish: 'banana leaves, wilted'. BBQ: 'bamboo skewers'. 'Aluminum foil', 'kitchen twine', 'cheesecloth'. Baked tahong: '2 cups rock salt (for the baking bed)'. Isaw, papaitan or dinuguan: 'salt and vinegar for cleaning the intestines'. 'Ice water for shocking'. 'Water for boiling noodles'. 'Rice washing water'.
  - Problem: 'banana leaves' tokenizes to [banana] because 'leaves' is a stopword, and the NON_PRICEABLE substring 'leaf' does not occur in 'leaves'. In a local test it matched a banana fruit entry at confidence 0.67 and would match DA banana too. 'bamboo skewers', 'rock salt' and 'kitchen twine' are not non-priceable. Water (910 lines) must never match FNRI entries such as 'Coconut water'.
  - Detect: Phrase list: banana leaves, corn husk, skewer, foil, twine, cheesecloth, parchment, 'rock salt for', 'for cleaning', 'for washing', 'ice water', 'rice washing'. rawText /(for (wrapping|cleaning|washing|the (bed|base)))/.
  - Rule: Process or inedible role: nutrition always 0. Cost: include consumables that are bought and used up (rock salt, cleaning vinegar, banana leaves if priced); exclude tools (foil, twine, skewers, cheesecloth). Check a process phrase list on whole tokens before any FNRI or DA lookup. Water and ice: 0 nutrition and 0 cost.
  - Nutrition: Removes phantom fruit kcal (about 45-100 kcal per banana-leaf line). Rock salt would otherwise inflate sodium once it is tracked. · Cost: Removes the phantom banana price (about P5-10 per line). Process salt and vinegar get costed or flagged.
- **[high] Substring NON_PRICEABLE match drops priceable staples (kakanin rice, sinigang tamarind, bell pepper, peeled shrimp)** — e.g. I checked this by running docs/matcher.js. isNonPriceable() returns true for: 'glutinous rice', 'rice flour' ('ice' inside 'rice'); 'tamarind' ('rind'); 'red bell pepper' and 'long green pepper' ('pepper'); 'shrimp, peeled and deveined' ('peel'); 'calamansi juice', 'onion, diced', 'pineapple slices' ('ice'); 'Filipino sausage' ('sage'); 'cauliflower' ('flower'); 'watermelon' ('water'); 'bayabas' ('bay').
  - Problem: Missing DA match caused by the code itself. isNonPriceable uses lc.includes(word), so short words fire inside other words. Every rice, rice-flour, bihon, tamarind, juice, bell-pepper, siling-haba and peeled-shrimp row is skipped for DA pricing, and the UI shows no 'No price match' warning for them.
  - Detect: Run the current isNonPriceable and a token-level version over the 3,386 names. Any flipped name with a DA rankMatch confidence of 0.4 or more is a lost price.
  - Rule: Match non-priceables on whole tokens or phrases (word boundaries) against the head noun. A priceable allowlist wins over the non-priceable list: bell pepper, siling haba/long green pepper, chili pepper, tamarind/sampalok, any rice*, and juice (priced via its fruit equivalent). Keep 'pepper' non-priceable only for black/white/ground pepper, peppercorn and 'salt and pepper'. Add a regression test over all 3,386 names that lists every name whose flag flips.
  - Nutrition: None directly (FNRI matching is unaffected), but the valueScore/'sulit' ranking shifts. · Cost: Rice in biko, suman, puto and sinangag is about 30-50% of ingredient cost (e.g. 400 g malagkit at about P60-70/kg is about P25-28), and it currently counts as P0. Red bell pepper (107 uses, about 150 g each) adds about P20-35 per recipe. Shrimp (88 uses) adds P150-300 per recipe when 'peeled' is in the name. Under-costing also inflates valueScore (= nutritionScore / cost).
- **[high] Deep-frying oil counted as eaten (lechon kawali, crispy pata, chicharon, fried daing/tuyo, lumpia, turon, fried chicken)** — e.g. '4 cups cooking oil (for deep frying)' becomes 960 g, times FNRI oil at about 880-900 kcal/100 g, which adds about 8,500 kcal. At the default 4 servings that is about 2,100 kcal per serving of oil that actually stays in the pan.
  - Problem: Wrong consumed fraction. The oil is a frying medium, and only the absorbed part is eaten.
  - Detect: rawText regex plus 'cooking oil'/'vegetable oil' rows with amount >= 2 cups, cross-checked against instruction text containing 'deep fry'.
  - Rule: Set role=frying_medium when rawText/name matches /for (deep[- ]?)?fr(y|ying)|enough to cover|for frying/i, or when there is 2 cups or more of oil and an instruction says deep fry / deep-fry / 'heat oil in a deep'. Nutrition: absorbed_g = fried food raw weight x uptake, capped at the stated oil. Uptake (approximate, Bognar 2002 / USDA fried-food data): wrapped or battered (lumpia, turon, okoy, rebosado) 0.10-0.15; breaded or floured meat/fish 0.06-0.10; unbreaded fish/daing/tuyo 0.03-0.06; pork skin/belly (lechon kawali, crispy pata, chicharon) 0-0.03, because these render fat. Cost: absorbed_g x 1.5 (absorption plus degraded or discarded oil); if the food weight is unknown, 15-25% of the stated volume. Saute oil (3 tbsp or less, 'for sauteing') counts 100%; 'oil for greasing' llanera/molds counts 10-20%.
  - Nutrition: Removes about 1,500-2,000 kcal and about 200 g fat per serving from fried dishes. These swings are large enough to set calorie and low-carb/high-protein tags. · Cost: 4 cups at about P100/L is about P90-100 per recipe today; it should be about P15-25.
- **[high] Lechon kawali / crispy pata / chicharon: boiling liquid thrown away before frying, fat rendering, whole pata** — e.g. Lechon kawali: '2 lbs pork belly', '1 tbsp whole peppercorn', '5 dried bay leaves', '1 head garlic', '8 cups water'. The pork is boiled 45 min, drained, dried, then deep-fried. Crispy pata: '1 whole pork leg (pata), about 3 lbs' has amount '1' and no unit, so it parses as 60 g.
  - Problem: Wrong consumed fraction and purchase unit. The aromatics and salt in the discarded boiling liquid are counted. Fat that renders into the discarded water and the frying oil is counted. The whole pata is read as 60 g.
  - Detect: Title matches /lechon kawali|crispy pata|chicharon|bagnet/, or the instructions have a 'boil' step followed by a 'fry' step on the same ingredient.
  - Rule: Parse the instructions. Ingredients first used in a boil/simmer step that is followed by drain/discard/'remove from the pot' get role=discarded_liquor: nutrition 0, cost 100%. Pork belly or pata after boil plus deep-fry: apply a cooking yield of about 0.60-0.70 and a fat retention of about 0.65-0.80 to the raw FNRI fat; protein retention is about 1.0 (approximate, USDA cooking yields / retention-factor family). Read '(about 3 lbs)' or '(1.5 kg)' from rawText before falling back to count weights. Default pata is 1.2-1.5 kg as purchased, EP about 0.60-0.70 (skin counts as edible).
  - Nutrition: Pata protein and fat are currently under by about 15-20x. After the fix, lechon kawali fat comes out about 20-35% below a plain raw-weight calculation. · Cost: Crispy pata is under-costed about 20x: 60 g instead of about 1,360 g, at a pork hock price of about P300/kg, gives about P18 instead of about P400.
- **[high] Bone-in cuts: nilaga/bulalo shank, kare-kare oxtail, sinigang na baboy ribs, tinola whole chicken** — e.g. '3 lbs oxtail, cut into 2-inch pieces' (kare-kare) counts 1,361 g as edible. '2 lbs beef shank with bone marrow' (bulalo), '2 lbs pork spareribs' (sinigang), '1 whole chicken, cut into serving pieces' (tinola) with no unit parses as 60 g.
  - Problem: Edible portion. FNRI values are per 100 g edible portion (E.P.), but recipes give as-purchased (A.P.) weight. The FNRI 'Edible portion %' column is not stored, and whole-bird counts are not parsed.
  - Detect: Tokens bone|oxtail|shank|ribs|pata|hock|wing|'whole chicken', or FNRI EP < 0.9 with no boneless/fillet word in the name.
  - Rule: Scrape and store FNRI EP%. nutrition_g = AP_g x EP. If the FNRI row matched is boneless but the ingredient says bone-in / with bone / oxtail / shank / ribs / pata / hock / wings / whole / 'cut into serving pieces', use a default EP (approximate, USDA refuse-% family): oxtail 0.40-0.55; beef shank with bone 0.50-0.65 (marrow counted as edible); spareribs 0.60-0.75; pork hock 0.60-0.70; whole chicken 0.65-0.72; wings 0.55-0.65; drumstick/thigh 0.70-0.80; 'bones for broth' 0.05-0.15. Boneless/fillet/ground/cubed means EP 1.0. Cost uses A.P. grams, because DA prices are per kg as purchased. In soups the broth fat is eaten, so there is no fat loss unless the instructions say 'skim'.
  - Nutrition: Kare-kare protein and fat drop about 45-60% compared with treating 3 lbs of oxtail as meat. Tinola chicken protein rises from about 11 g to about 150 g or more per recipe. · Cost: Cost per gram is unchanged. The whole-chicken count fix raises tinola chicken cost about 20x (60 g becomes about 1,300 g).
- **[high] Whole fin fish (sinigang na isda, paksiw na bangus, inihaw na tilapia, escabeche, pinangat)** — e.g. '2 lbs bangus, sliced', '1 whole tilapia, about 1 lb', '1 lb galunggong', '2 pieces tilapia' (piece = 50 g). DA 'Mackerel, Imported Frozen, Whole Round' is priced per kg as purchased.
  - Problem: Edible portion and purchase unit. Whole fish is roughly 45-65% edible (head, bones, scales, guts, fins removed). Count-based fish uses the flat 50 g per piece.
  - Detect: Fish tokens (bangus, tilapia, galunggong, lapu-lapu, maya-maya, tulingan, mackerel) without fillet/boneless/deboned, or a DA match whose name contains 'Whole Round'.
  - Rule: Use FNRI EP% for the matched fish. Defaults (approximate): whole fin fish 0.50 (range 0.45-0.65); steaks/slices 0.80-0.90; fillet/boneless/deboned bangus 1.0. Weight per piece as purchased: tilapia 250-350 g; bangus medium 400-500 g; galunggong 100-150 g; lapu-lapu 500-800 g; tamban/sardinas 40-60 g. Cost uses A.P. grams against DA 'Whole Round' prices.
  - Nutrition: When fish weight is in lbs/kg, protein, fat and calcium are overstated about 1.5-2x. Fish is the main protein in these dishes, so the protein per serving and the high-protein tag can flip. · Cost: Count-based fish is under-costed about 5-7x (50 g instead of about 300 g per tilapia).
- **[high] Shellfish in the shell (tinolang tahong, halaan soup, sinigang na hipon with heads, ginataang alimasag/alimango)** — e.g. '2 lbs mussels (tahong), cleaned', '1 lb clams', '1 lb shrimp, head-on', '3 pieces crabs' (piece = 50 g).
  - Problem: Edible portion. Mussels and clams in the shell are about 20-40% edible, head-on shrimp about 45-60%, whole crab about 15-35% (approximate, USDA refuse % / FNRI EP). Mussels are high in iron, so the nutrition score is inflated. Crab counts are read as 50 g each.
  - Detect: Tokens mussel|tahong|clam|halaan|crab|alimango|alimasag|shrimp|hipon, plus head-on / in shell / peeled words in the name or rawText.
  - Rule: Use FNRI EP% with the defaults above. Names with peeled / meat / shucked / crabmeat mean EP 1.0, and the price must be converted back to as-purchased weight: peeled shrimp grams / about 0.55, priced at the DA shell-on per-kg price. Crab per piece: alimango 250-400 g, alimasag 120-200 g.
  - Nutrition: Tahong/halaan iron and protein are overstated about 3x (900 g as purchased is about 270 g of meat). · Cost: Peeled-shrimp weight priced at the shell-on price understates cost about 1.8x. Crab counts are under-costed 5-8x.
- **[high] Leafy greens measured by the cup (tinola malunggay/chili leaves, sinigang kangkong, ginisang monggo, saluyot, alugbati)** — e.g. '2 cups malunggay leaves' becomes 480 g. USDA household weight for moringa leaves is about 21 g/cup, so about 42 g. '1 bunch kangkong' becomes 200 g, but only the leaves and tender stems are used.
  - Problem: Purchase unit and density: a flat cup = 240 g. Malunggay is one of FNRI's richest sources of vitamin A, calcium and iron.
  - Detect: Unit is cup/cups and the matched FNRI row is a leafy vegetable (or the name has leaves/talbos/dahon).
  - Rule: Cup weights by food class (approximate, USDA FoodData Central household measures): loose leaves (malunggay, chili leaves, alugbati, saluyot, spinach) 20-30 g/cup; kangkong, pechay or bok choy chopped 55-70 g; shredded cabbage 70-90 g; sliced sitaw/okra/ampalaya 100-125 g; cubed squash/gabi/potato 130-150 g. Bunch weights as purchased with EP: kangkong 250-350 g, EP 0.55-0.70; native pechay 250-300 g, EP 0.85; malunggay sprigs 100-150 g, leaves EP 0.35-0.50; sitaw bundle 200-250 g.
  - Nutrition: Malunggay vitamin A, calcium and iron are overstated about 8-11x. That fills the vitamin A, calcium and iron parts of nutritionScore (46% of its weight together) for almost every tinola. · Cost: Small. DA rarely prices malunggay or chili leaves, and kangkong bunch cost changes only moderately.
- **[high] Leaf or flower of a plant matched to its fruit or root (suman banana leaves, tinola chili leaves, laing taro leaves, talbos ng kamote, bulaklak ng kalabasa)** — e.g. tokenize('banana leaves') = ['banana'], because leaf/leaves are stopwords. isNonPriceable('banana leaves') is false, because 'leaves' does not contain the substring 'leaf'. So banana leaves get FNRI banana-fruit nutrition and the DA Banana price. 'dried taro leaves' tokenizes to ['taro','gabi'] and matches the gabi corm. 'chili leaves' tokenizes to ['chili'] and gets the chili-fruit price.
  - Problem: Wrong FNRI/DA match, plus wrong consumed fraction for wrapping leaves that are not eaten.
  - Detect: The name has a part word next to a fruit/vegetable name, and the chosen FNRI/DA row lacks that part word.
  - Rule: Keep plant-part tokens (leaf/leaves, tops/talbos, shoots, flower/bulaklak, blossom/puso, pods, seeds, corm/root) as a required match attribute: a candidate with a different part is rejected. Inedible wrappers ('banana leaves', 'buri/palm leaves', 'corn husks', 'for wrapping/lining') get role=wrapper: nutrition 0, cost a minor unpriced item. Edible leaves map to FNRI leaf rows (gabi leaves dried, kamote tops, sili leaves, squash flowers) and are never priced at the DA price for the fruit or root.
  - Nutrition: Suman gets about +450-500 kcal of banana per batch that isn't there. For laing, dried gabi leaves and the corm differ several-fold in calcium, iron, vitamin A and calories. · Cost: '2 cups chili leaves' becomes 480 g at the DA chili price (often P300-600/kg), about P150-290 per tinola, against about P5-10 real. '10 pieces banana leaves' becomes 500 g of banana, about P40-50 too much.
- **[high] Produce counted with no unit or an odd unit (nilaga corn/saba, sinigang siling haba/radish, adobo garlic head, tinola ginger thumb, tortang talong)** — e.g. parseQuantity gives: '1 head garlic' = 500 g (real 35-50 g); '2 thumbs ginger' = 120 g (real about 30-50 g); '2 ears corn' = 120 g (as purchased about 500 g, kernels about 45%); '3 saba' = 150-180 g (as purchased about 330 g); '3 pieces long green chili' = 150 g (real about 30 g); '1 radish' = 60 g (real 250-350 g).
  - Problem: Purchase unit: flat piece = 50 g, unknown unit = 60 g, head = 500 g.
  - Detect: Rows where the unit is empty, or is one of head/thumb/ear/piece/pc/knob/inch/stalk, with a numeric amount.
  - Rule: Add a per-food item-weight table (as-purchased grams plus EP) and check it before UNIT_GRAMS. Size words (small/medium/large, currently stopwords) scale the weight by about 30% either way. Starting values (approximate, USDA household weights / Philippine market sizes): garlic head 40 g, clove 4 g; ginger thumb 20 g, 1-inch piece 10 g; onion medium 120 g (EP 0.90); tomato 110 g; potato 170 g (EP 0.85); carrot 70 g; eggplant 100 g; radish 300 g; sayote 250 g (EP 0.85); saba 110 g (EP 0.68); corn ear 250 g (kernel EP 0.45); siling haba 10 g; siling labuyo 1.5 g; calamansi 12 g; kamias 12 g; cabbage head 800 g; whole chicken 1,300 g. An unknown unit should give a flagged null, not 60 g.
  - Nutrition: Each garlic head adds about 700 kcal that isn't there. Corn and saba in nilaga/pochero are under-counted about 2x. · Cost: Garlic (821 uses) is about 10x over-costed per head: 500 g x about P140/kg is about P70, against about P6. Corn, saba and radish are under-costed 2-5x.
- **[high] DA egg prices are per piece but treated as per kg (affects every family: torta, leche flan, kare-kare egg, ukoy)** — e.g. DA 'Chicken Egg (White, Medium) 56-60 grams/pc' at about P8 (illustrative) is a per-piece price. enrichRecipe computes price/1000 x grams, so 3 eggs (150 g) cost P1.20 instead of P24. 'Cooking Oil (Coconut) 1 Liter/bottle' is a per-bottle price.
  - Problem: Purchase-unit basis of the DA price.
  - Detect: Any DA name matching /\/pc|\/bottle|\/pack|\/bundle/i.
  - Rule: At DA ingest, read the unit basis from the name. /(\d+)(-(\d+))?\s*grams?\/pc/ gives basis=per_piece with pieceGrams = midpoint (58 g). /(\d+(\.\d+)?)\s*(liter|l|ml)\/bottle/i gives per_bottle with that volume (use volume x density for oil, 0.92). Everything else is per_kg. Size descriptors such as '8-10 cm diameter/bunch hd' or '3-4 Small Bundles' are specifications, not units: keep per_kg until a sample is checked against the PDF unit column. Store unitBasis and unitQty on Commodity. Egg cost = pieces x price, or grams / pieceGrams x price. Egg nutrition uses EP 0.88 of the as-purchased weight (shell).
  - Nutrition: Minor: the 50 g piece default is close to the edible weight of a medium egg. · Cost: Egg lines are under-costed about 20x across the 182 'eggs' and 107 'egg' uses. Oil from the 1 L bottle is about 8% off, and more for other bottle sizes.
- **[high] Leche flan, yema, brazo: yolks vs whites vs whole eggs, and caramel** — e.g. '10 egg yolks' with no unit becomes 10 x 60 g = 600 g, matched to whole egg or yolk. A real yolk is about 17 g, so about 170 g. '1 cup white sugar (for caramel)' becomes 240 g.
  - Problem: Egg part weight and cost of a part. The cost is paid for whole eggs even when only yolks are used.
  - Detect: Name contains yolk/yolks/pula ng itlog/white(s) of egg/puti ng itlog.
  - Rule: Egg-part table: whole 51 g edible, yolk 17 g, white 33 g (approximate, USDA large egg, scaled for DA medium). Match the FNRI yolk or white row when the part is named. Cost: a yolk-only or white-only line costs the full egg (count x per-piece price), unless another line in the same recipe uses the other part (e.g. brazo meringue); then split 1/3 to yolk and 2/3 to white. Caramel sugar counts 100% (the 10-15% left in the llanera can be ignored). Sugar cup = 200 g.
  - Nutrition: Yolk calories are overstated about 3.5x: about 1,900 kcal against about 550 kcal per llanera (yolk is about 320-350 kcal/100 g). · Cost: 10 yolks currently cost about P5 because of the per-kg bug. They should cost about P80 (10 whole eggs).
- **[high] Coconut cream vs coconut milk vs squeezed grated coconut (ginataan, laing, biko, ginataang bilo-bilo, ginataang langka)** — e.g. '2 cups coconut cream (kakang gata)', '2 cups coconut milk', '1 cup grated coconut, squeezed to get 2 cups milk'. 'kakang gata' tokenizes to ['kakang','gata'] with no reverse alias; 'milk' once matched 'Coconut milk' in the audit.
  - Problem: Wrong FNRI match and wrong consumed fraction. Fat differs 3-6x: coconut cream about 30-35 g/100 g, canned coconut milk about 17-24 g, second extraction about 5-10 g (approximate, USDA/FNRI). The squeezed coconut residue (sapal) is thrown away.
  - Detect: Tokens coconut, gata, niyog, kakang, cream; instruction 'squeeze/extract'.
  - Rule: Mapping: cream / kakang gata / first extraction / 'thick' goes to FNRI coconut cream. Plain or canned coconut milk goes to FNRI coconut milk. Second extraction / 'thin' / 'lite' goes to a diluted row, or milk x 0.4. Grated coconut used to make milk: count the extracted milk if its volume is stated; otherwise count 60-70% of the grated meat's fat and kcal and 0 fiber (heuristic). Grated coconut as a topping (kutsinta, puto, palitaw) is 80 g/cup and fully eaten. Add a reverse alias gata/kakang gata to coconut milk/cream. Never let plain 'milk' match coconut rows. Cup of coconut milk = 226-240 g.
  - Nutrition: Fat and calories of ginataan dishes swing 2-3x depending on the mapping. · Cost: DA has no coconut-milk row, so it is unpriced: flag it under cost coverage. If DA lists whole coconut, price it via the meat (one mature coconut gives about 300-400 g meat).
- **[high] Sinigang/paksiw souring: tamarind boiled and strained, kamias left in the pot, calamansi juice** — e.g. '15 pieces young tamarind (sampalok)' becomes 750 g. '1 lb tamarind' matches ripe tamarind pulp (about 240 kcal/100 g) and is also non-priceable through the 'rind' substring. '10 pieces calamansi' becomes 500 g (real about 120 g). '1/4 cup calamansi juice' is non-priceable through 'ice'.
  - Problem: Wrong consumed fraction (tamarind pulp and seeds are strained out), wrong ripeness match, and wrong purchase unit (fruit vs juice).
  - Detect: Tokens tamarind/sampalok/kamias/calamansi/lemon/dayap, or the word juice; title contains sinigang/paksiw/kinilaw.
  - Rule: Tamarind for sinigang (boil, mash, strain): match FNRI young/unripe tamarind; count about 0.25-0.35 of its as-purchased kcal and carbs and 0 fiber (heuristic extract yield, no published factor). Cost is 100% of the as-purchased weight; a pod is 10-20 g. Kamias sliced into the dish is fully eaten, 12 g each. Calamansi: 12 g per fruit, about 4 ml juice per fruit (approximate). 'Juice of N calamansi': nutrition is juice only (FNRI calamansi juice row); cost is N x 12 g x the DA calamansi price per kg. 'X tbsp calamansi juice': cost uses the fruit equivalent (ml / 4 fruits). Lemon gives about 40 ml per fruit.
  - Nutrition: A ripe-tamarind match at 500-750 g adds about 1,200-1,800 kcal that isn't in the sinigang batch. · Cost: Calamansi is about 4x over-costed through piece = 50 g. Tamarind is unpriced today because of the 'rind' bug.
- **[high] Brand seasonings and mixes (Knorr cubes, Knorr Sinigang sa Sampalok mix, Magic Sarap, Knorr Liquid Seasoning, Mama Sita's, Datu Puti, UFC, Mang Tomas)** — e.g. '1 piece Knorr Pork Cube' tokenizes to knorr, pork, cube. Against DA 'Pork Chop, Imported' that scores F1 = 0.40, which passes the 0.4 gate, and FNRI gives 50 g of pork. '1 pack sinigang mix' becomes pack = 200 g, matched to tamarind. '45g pack Knorr Ginataang Gulay Mix' duplicates the quantity in the name.
  - Problem: No real FNRI/DA match exists, so the base food (pork, tamarind) matches instead. Purchase unit is a sachet or cube.
  - Detect: Name contains a brand word (knorr|maggi|mama sita|datu puti|silver swan|ufc|mang tomas|del monte|lady's choice|reno|magic sarap) or the words cube/mix/granules/sachet.
  - Rule: Build a manual brand table of about 40 rows (Knorr, Maggi, Mama Sita's, Datu Puti, Silver Swan, UFC, Mang Tomas, Lady's Choice, Del Monte, Reno). Each row has label grams per unit (cube 10 g, Magic Sarap sachet 8 g, sinigang mix 22/40 g), kcal/protein/fat/carbs per 100 g from the label, and a dated reference price. Rows tagged as brands skip FNRI/DA matching. Strip quantity prefixes from names (/^\d+\s*(g|ml)\s*(pack|sachet)?/i) into the amount field.
  - Nutrition: Each meat/shrimp cube adds about 100-200 kcal and 10 g protein that aren't there. A sinigang-mix pack read as 200 g of tamarind adds about 480 kcal. · Cost: A cube priced as 50 g of pork comes to about P15-17, against about P7 real. Sinigang mix is unpriced.
- **[high] Condiments matched to their base food (kaldereta liver spread, oyster sauce, chicken/beef broth, banana ketchup, lechon sauce)** — e.g. '1/2 cup liver spread' becomes 120 g of pork liver. 'oyster sauce' (132 uses) matches raw oyster (F1 0.67). 'chicken broth' (94 uses) matches chicken meat. 'beef broth' (91 uses) matched beef blood in the audit. 'banana ketchup' gets banana nutrition and the DA banana price. 'lechon sauce' matches lechon.
  - Problem: Wrong FNRI match, because the head noun (sauce, broth, spread) is ignored.
  - Detect: The name's last token is in the head-noun list, but the matched FNRI/DA name lacks that token.
  - Rule: Find the head noun (last noun before commas or parentheses): sauce, broth, stock, cube, spread, paste, ketchup, mix, granules, seasoning, extract, juice, oil, flour, starch, wine, vinegar, cream, milk. Allow a candidate only if it has the same head-noun class: FNRI 'Oyster sauce' passes, 'Oyster, raw' does not. Otherwise fall back to the brand table, then to a generic condiment table (approximate label values): broth from cube about 10-15 kcal/cup; oyster sauce about 50 kcal/100 g; banana ketchup about 110-130 kcal/100 g; liver spread about 250-300 kcal/100 g, of which about 10-30% is liver. Broth stays non-priceable unless the row is a cube or carton.
  - Nutrition: Liver spread read as pork liver adds about 6,000-12,000 µg vitamin A and about 20 mg iron per recipe, which fills those score components. Oyster sauce adds about 3-4 mg iron per 1/4 cup. 4 cups of broth read as chicken meat adds about 1,500 kcal and 170 g protein. · Cost: Banana ketchup priced as bananas is too low. Liver spread and oyster sauce are unpriced, so they go under cost coverage.
- **[high] Marinade thrown away or used for basting (inihaw na liempo, pork BBQ, inasal, daing na bangus, lechon manok) vs adobo marinade cooked into the sauce** — e.g. Pork BBQ for 2 lbs pork: '1 cup banana ketchup', '1/2 cup soy sauce', '1/2 cup brown sugar', '1 cup lemon-lime soda', '1/4 cup calamansi juice'. The WPRM group header 'For the marinade' is not stored, but noise rows such as 'Marinade ingredients:' do exist in the data.
  - Problem: Wrong consumed fraction.
  - Detect: A group-header noise row exists, or the instructions contain marinate/marinade with discard/reserve/baste.
  - Rule: Recover groups from row order: treat noise rows matching /:$|^for the |ingredients:?$/i as group headers, and give the rows that follow that group until the next header (store a group field on RecipeIngredient, and also scrape .wprm-recipe-group-name). Use the instructions to set the fraction: 'discard the marinade' gives 0.10-0.15 (surface uptake, heuristic); 'reserve/boil for basting' gives 0.30-0.50; marinade cooked into the dish (adobo, humba, tocino simmered) gives 1.0. Daing vinegar soak gives 0.05-0.10. Cost is always 100%. Grilled pork belly fat retention is about 0.70-0.85 (drip loss, approximate, USDA retention family).
  - Nutrition: A BBQ marinade is about 900-1,000 kcal of sugar, ketchup and soda. Counting only 15-40% of it removes about 600-800 kcal per batch (about 150-200 kcal per serving). · Cost: None (the ingredients are bought either way).
- **[high] Water, rice washing (hugas bigas), kinilaw wash vinegar, soaking brines, lye water** — e.g. '6 cups rice washing (hugas bigas)' in sinigang/tinola/nilaga tokenizes to rice, washing. A raw-rice FNRI match makes that about 1,440 g, about 5,200 kcal that isn't there. 'water' (910 uses) can match 'Coconut water' (F1 0.67). In kinilaw, '1/2 cup vinegar for washing the fish' is thrown away. 'lye water (lihia)' appears in kutsinta and pichi-pichi.
  - Problem: Wrong consumed fraction and wrong FNRI match.
  - Detect: Count the recipes where a water or rice-washing row got any FNRI match.
  - Rule: Before FNRI matching, apply a hard-zero list on whole phrases: water, ice water, hot water, rice washing / hugas bigas / rice water, lye water / lihia, brine, and anything 'for washing/rinsing/soaking' in rawText. These get nutrition 0 and cost 0, except wash vinegar, which keeps 100% cost with 0 nutrition. Salt: nutrition 0 (sodium is not tracked), cost tiny.
  - Nutrition: Removes up to thousands of kcal that aren't there in sinigang-type soups. Water read as coconut water adds about 20 kcal/100 g over 1-2 kg. · Cost: Small (only the wash vinegar).
- **[high] Cooked vs raw rice, and dry vs soaked noodles (sinangag, arroz caldo, lugaw, pancit bihon/sotanghon/canton/miki)** — e.g. '4 cups cooked rice (leftover)': 'cooked' is a stopword, so it matches raw milled rice. 960 g x about 360 kcal/100 g is about 3,450 kcal, against about 700 g cooked x about 130 kcal/100 g, about 910 kcal. Other examples: '8 oz bihon, soaked in water'; '1 lb fresh miki' vs dry canton.
  - Problem: Wrong food state in the FNRI match, and price should be on the raw-equivalent weight.
  - Detect: The name or rawText has cooked/leftover/steamed/soaked/boiled next to rice/noodle/bihon/sotanghon/canton/miki/misua.
  - Rule: Treat state words (cooked, steamed, leftover, soaked, boiled, fried, dried, canned) as match attributes, not stopwords, and prefer FNRI rows in the same state. If only a raw row exists, convert: cooked rice raw = cooked / 2.6-2.8 (USDA cooking yields, approximate); 1 cup cooked rice = 160-185 g; soaked or cooked rice noodles / 2.5; wheat noodles / 2.2. Price is always on raw/dry-equivalent grams against DA 'Regular Milled' or 'Well Milled' per kg. Arroz caldo and lugaw amounts are already raw.
  - Nutrition: Kcal and carbs of cooked-rice dishes are overstated about 3.5-4x. · Cost: Once the 'ice' bug is fixed, sinangag rice would be about 4x over-costed without state handling (P48 instead of P12).
- **[high] Dry ingredients by the cup in kakanin and baking (puto, kutsinta, bibingka, maja blanca, palitaw; kare-kare peanuts and toasted rice)** — e.g. '2 cups all-purpose flour' becomes 480 g (USDA 125 g/cup gives 250 g). '1/2 cup cornstarch' becomes 120 g (real 64 g). '1 cup brown sugar' becomes 240 g (packed 220 g). '1 cup grated coconut' becomes 240 g (real 80 g). '1 cup ground peanuts' becomes 240 g (real about 145 g). '1 tbsp cornstarch' becomes 15 g (real 8 g).
  - Problem: Density: a flat cup = 240 g for every food.
  - Detect: Unit is cup/tbsp/tsp and the matched FNRI row is a flour, starch, sugar, nut, grated coconut, dry grain or non-water liquid.
  - Rule: Density table in g/cup (approximate, USDA FoodData Central household measures): AP flour 125; rice flour 158; glutinous rice flour 120-130; cornstarch 128 (8 g/tbsp); white sugar 200; brown sugar packed 220; fresh grated coconut 80; desiccated 93; ground peanuts 145; peanut butter 258; raw rice/malagkit 185-200; grated cheese 100-113; breadcrumbs 108; cocoa 86; oil 218; butter 227; soy sauce 255; fish sauce 290; vinegar 240; condensed milk 306; evaporated milk 252; honey 339. Derive spoons from the cup (tbsp = cup/16, tsp = cup/48).
  - Nutrition: Flour alone adds about +840 kcal to a puto batch (about 1.9x). Grated-coconut toppings are about 3x over. · Cost: Flour and sugar are over-costed about 1.2-1.9x (flour 207 uses, cornstarch 172, sugars about 320).
- **[high] Servings given as pieces or batches (lumpia shanghai, puto, kutsinta, turon, longganisa, tocino, ginisang bagoong, atchara, ube halaya)** — e.g. The WPRM servings unit (.wprm-recipe-servings-unit) is not scraped, and parseInt('4-6') gives 4. Lumpia '50' means 50 rolls. A longganisa batch made from 2 kg pork with servings null defaults to 4, which is 500 g of sausage per 'serving'.
  - Problem: The per-serving denominator is wrong.
  - Detect: Servings is null, or a servings-unit word is present, or total edible weight / servings is under 80 g or over 900 g.
  - Rule: Scrape the servings unit. If it is pieces/pcs/rolls/links/cups/jars/bottles/llanera/molds, show per-piece values and convert to portions per person with family defaults: lumpia shanghai 5 pcs; lumpiang sariwa 1; turon 2; puto/kutsinta 3; siopao 1; longganisa 3 links (about 100 g); tocino 100 g raw; bagoong/atchara about 20 g. If servings is null, estimate total cooked edible grams / family portion (main dish 250-350 g, soup 400-500 g, dessert 100-150 g) and flag it. Send recipes with kcal per serving outside 150-1,200 to review.
  - Nutrition: The same factor applies to every per-serving nutrient and to the high-protein/low-carb tags. · Cost: P/serving is off by the same ratio as the portion error, often 3-10x for batch recipes.
- **[high] Lumpia and turon: wrapper weights, saba/langka, sugar coating** — e.g. '25 pieces lumpia wrapper' becomes 1,250 g (real 8-12 g each, about 250 g). Turon '6 saba bananas, halved' becomes 300 g (as purchased about 660 g, edible about 450 g). Other rows: '1 cup brown sugar for rolling', 'water for sealing'.
  - Problem: Purchase unit and per-piece weight, and wrong consumed fraction for the coating sugar.
  - Detect: Tokens wrapper/lumpia/turon/saba/langka, and a title matching /lumpia|turon|shanghai|okoy/.
  - Rule: Wrapper weights: lumpia/spring-roll wrapper 10 g; egg-roll wrapper 7 g; wonton wrapper 5 g. Turon coating sugar is about 0.70-0.85 eaten (the rest burns or stays in the oil; heuristic). Apply frying uptake 0.10-0.15 to filling plus wrapper. Saba is 110 g as purchased, EP 0.68. Ripe langka strips are about 10 g each. Wrappers have no DA row, so they go under cost coverage.
  - Nutrition: Wrapper is about 280-300 kcal/100 g, so the fix removes about 2,800 kcal that isn't there from a 25-wrapper batch. Saba is under-counted about 1.5x. · Cost: Wrappers are unpriced (flag them). Saba is under-costed about 2x.
- **[high] Ripeness and variety words dropped as stopwords (buko vs niyog, green vs ripe papaya/mango/langka, sweet potato vs potato)** — e.g. 'young coconut strips' tokenizes to ['coconut'] and matches mature coconut meat (about 350 kcal/100 g) instead of buko meat (about 70-100, approximate). 'green papaya' (tinola, atchara) matches ripe papaya. 'green mango' (with bagoong) matches ripe mango. 'sweet potato' tokenizes to ['potato'] and matches white potato. Unripe langka (ginataang langka) is not separated from ripe langka (turon, halo-halo).
  - Problem: Wrong FNRI match and wrong DA match.
  - Detect: Produce name has young/green/ripe/unripe/sweet and the FNRI candidate lacks the matching qualifier.
  - Rule: For produce, remove young/green/ripe/unripe/sweet from STOPWORDS and map them to FNRI qualifiers: young to 'young/buko', green/unripe to 'unripe/green', ripe to 'ripe'. Add compound entries: sweet potato to kamote, young corn, green onion to scallion; green peas keep 'green'. Drop colors only for non-produce: 'red bell pepper' is a variety, so keep 'red' (it changes vitamins A and C).
  - Nutrition: Buko salad and buko pie kcal/fat are overstated 4-5x. Orange kamote vitamin A goes from about 0 to very high. Green and ripe papaya differ several-fold in vitamins A and C. · Cost: DA price differs between potato and kamote (about 1.5x) and between green and ripe mango.
- **[high] Daing, tuyo, dilis, danggit, tinapa, hibe: dried or smoked state dropped, per-piece weights, frying** — e.g. '1/2 cup dried shrimp (hibe)' tokenizes to ['shrimp'] and matches fresh shrimp (about 18-20 g protein/100 g) instead of dried (about 60 g). '6 pieces tuyo' becomes 300 g (real about 12-20 g each, about 100 g). 'daing na bangus, 1 piece' becomes 50 g (real 300-400 g butterflied).
  - Problem: Wrong FNRI state, wrong purchase unit, and no DA match.
  - Detect: Name has dried/salted/smoked/tuyo/daing/dilis/danggit/tinapa/hibe/bilad.
  - Rule: When dried/salted/smoked is present, it is a required match attribute (FNRI has dried/salted rows). Alias tuyo, dilis, danggit, tinapa, hibe and daing to those rows. Per-piece weights: tuyo 15 g; danggit 10 g; tinapang galunggong 100 g; daing na bangus 350 g (EP 0.70); dilis about 50 g/cup; hibe about 70 g/cup. Small dried fish are usually eaten whole, so EP about 0.9. Frying uptake 0.03-0.06. Pre-soak water gets role=discarded. DA has no dried-fish row, so flag it under cost coverage.
  - Nutrition: Dried shrimp/fish protein and calcium are under about 3x when the fresh row is matched. Small dried fish are very high in calcium (bones). · Cost: Unpriced. Flag it rather than show a lower cost.
- **[high] Unpriced Filipino pantry staples quietly lower the cost (adobo soy sauce/vinegar, pancit noodles, ginataan coconut milk, lumpia wrappers, patis, bagoong, dried fish)** — e.g. Adobo: pork and garlic are priced; '1/2 cup soy sauce' and '1/3 cup vinegar' have no DA row. Ginataang gulay: coconut milk, often the biggest cost item, is unpriced. costPerServing falls, so valueScore = nutritionScore / cost rises.
  - Problem: Missing DA match, with no visible coverage warning.
  - Detect: Per recipe: lines that are priceable, have grams > 0 and have no DA match.
  - Rule: Compute cost coverage = priced grams / priceable consumed grams, plus the count of unpriced lines. Show 'P X+ (n items unpriced)'. Either leave recipes with coverage under 70% out of the 'sulit' ranking, or fill the gaps from a small manual reference-price table (e.g. DTI SRP for basic necessities: soy sauce, vinegar, patis, canned coconut milk, noodles, wrappers). Date that table and label it as an estimate; SM data stays out of scope.
  - Nutrition: None. · Cost: Ginataan, pancit, lumpia and adobo costs are understated about 20-50%. The 'sulit' ranking is currently biased toward recipes heavy in condiments and processed items.
- **[high] Prepared dishes in FNRI leak into ingredient matches (eggs, pancit canton, chicken, vegetables)** — e.g. Audit examples: 'eggs' matched 'Vegetable stir-fry w/ quail eggs'; 'olive oil' matched 'Olive, green, in brine'. Rows like 'Pancit canton noodles' may match an FNRI prepared-dish row ('prep', 'w/').
  - Problem: Wrong FNRI match: a cooked composite dish is matched for a single ingredient.
  - Detect: Matched FNRI name contains w/|prep|stir-fry|with|style and the ingredient tokens are fewer than the candidate's.
  - Rule: At ingest, classify each FNRI row as raw commodity, processed, cooked state or prepared dish, using name markers (prep, w/, cnd, boiled, fried, 'in syrup', 'in brine', sweetened, dish words such as adobo/sinigang/stir-fry). Default ingredient matching to raw or processed rows. Allow a prepared-dish row only when the ingredient itself is a dish or sub-recipe (leche flan, ube halaya, longganisa). Penalize extra tokens on the candidate, so a short raw row beats a longer dish row.
  - Nutrition: Varies, often large (e.g. eggs vs vegetable stir-fry), on top-50 ingredients. · Cost: None.
- **[medium] Bagoong as a side condiment (kare-kare, green mango) vs a cooking ingredient (pinakbet, binagoongan), and shrimp vs fish paste** — e.g. '1/2 cup bagoong alamang (for serving)' counts all 120 g as eaten. aliasTokens('bagoong isda') adds both shrimp-paste and fish-paste tokens, so fish bagoong can match shrimp paste. 'ginisang bagoong' is its own recipe that yields a jar.
  - Problem: Wrong consumed fraction for side condiments, and an ambiguous alias.
  - Detect: rawText has (for serving|for dipping|on the side|as condiment|sawsawan), or the name has bagoong.
  - Rule: Rows with 'for serving' / on the side / for dipping / as condiment use a portion per serving, capped at the stated amount: bagoong 15-20 g; dipping vinegar or sawsawan 15-30 ml; Mang Tomas 30 g. Cost is charged on the portion used. Bagoong sauteed into the dish counts 100%. Alias priority: specific words (isda/monamon/terong/balayan to fish paste; alamang to shrimp paste) override the generic bagoong-to-shrimp-paste alias. Density 1.2 g/ml.
  - Nutrition: Kcal and protein from the condiment are over 2-4x. This matters most for kare-kare and ensalada. · Cost: Unpriced in DA. If a price is filled in, the side portion cuts the cost 2-4x.
- **[medium] Achuete and whole aromatics that are not eaten (kare-kare/palabok/inasal/kutsinta color; adobo peppercorn and bay; nilaga/tinola lemongrass, pandan, star anise)** — e.g. '2 tbsp achuete seeds, steeped in 1/4 cup oil, seeds discarded' counts 30 g of seeds ('achuete' is not in NON_PRICEABLE; only 'annatto' is). '1 tbsp whole peppercorn' (121 uses) counts 15 g of black pepper (iron about 10 mg/100 g, approximate), though peppercorns are mostly left on the plate.
  - Problem: Wrong consumed fraction.
  - Detect: Tokens achuete/atsuete/annatto/peppercorn/'whole pepper'/bay/star anise/cinnamon stick/tanglad/lemongrass/pandan.
  - Rule: Set role=steep_discard for achuete/annatto seeds when the instructions say steep/soak/strain/discard seeds, and for whole spices: whole peppercorn, bay leaves, star anise, cinnamon stick, lemongrass stalk, pandan, kaffir lime leaves. These get nutrition 0 and minor cost. Achuete oil counts as saute oil. Achuete/annatto powder of 1 tsp or less counts 0. Add achuete/atsuete/achiote as non-priceable aliases. Ground pepper is eaten and stays, but at 2.3 g/tsp.
  - Nutrition: Removes about 1.5 mg iron per recipe from peppercorns and the fiber/kcal of 30 g of seeds. This moves the iron score for adobo, paksiw and nilaga. · Cost: Small.
- **[medium] Canned milk, coconut, fruit and tuna sizes, and rows named just 'can' (leche flan, buko salad, maja blanca, ginataan, sardinas)** — e.g. '1 can (12 oz) evaporated milk' becomes can = 400 g (real 354 ml, about 365 g). '1 can (15 oz) fruit cocktail, drained' becomes 400 g of fruit plus syrup. Some rows have the name 'can' or 'pack' only; the food is in rawText.
  - Problem: Purchase unit, drained weight, and noise rows.
  - Detect: Unit/name is can/tin/pack/bottle, or rawText contains a size in parentheses or 'drained'.
  - Rule: Read the size from parentheses in amount/unit/rawText (/\((\d+(\.\d+)?)\s*(oz|g|ml|grams?)\)/) and from name prefixes such as '45g pack'. oz = 28.35 g; ml x density (condensed 1.3, evaporated 1.03, coconut milk 0.97). 'drained' applies a drained-weight factor: fruit cocktail, kaong or nata about 0.55-0.65; tuna about 0.70-0.75; corn kernels about 0.65. Syrup counts 0 unless 'with syrup'. If the name is can/pack/sachet/bottle, re-parse rawText to get the food.
  - Nutrition: Condensed milk is about 320 kcal/100 g, so 30 g either way per can is about 100 kcal. Fruit-cocktail syrup carries about 40% of the can's sugar. · Cost: Plus or minus 5-40%, mostly through drained fruit.
- **[medium] Sticky rice family: malagkit/glutinous/sweet rice, galapong, pinipig (biko, suman, bilo-bilo, palitaw, espasol)** — e.g. '2 cups sticky rice' tokenizes to sticky, rice. FNRI uses 'glutinous', and the Filipino 'malagkit' is in the Alternate name column, which is not stored. 'galapong' and 'pinipig' match no token. DA rice rows are non-glutinous ('Regular Milled 20-40% bran streak').
  - Problem: No FNRI match, and no DA match.
  - Detect: Tokens sticky/malagkit/glutinous/galapong/pinipig/'sweet rice'.
  - Rule: Store the FNRI Alternate/Common names and index them. Aliases: sticky rice / sweet rice / malagkit to glutinous rice. galapong to wet glutinous-rice dough (about 45% water, so dry equivalent x 0.55, approximate). pinipig to the FNRI pinipig/pounded-rice row. 'glutinous rice flour'/'mochiko' to glutinous flour. Cost: use a DA glutinous row if one exists; otherwise estimate as the Regular Milled price per kg x about 1.4 (approximate market ratio) and label it 'estimated'.
  - Nutrition: Moves from a wrong or missing match to the right one (about 360 kcal/100 g raw). · Cost: Currently unpriced. Adds about P25-40 per biko or suman batch.
- **[medium] Ingredients that are other recipes, and leftovers (paksiw na lechon, halo-halo parts, ube halaya, leche flan as topping, latik, atchara)** — e.g. Rows such as '2 lbs leftover lechon', '1 cup lechon sauce', and halo-halo parts: '2 tbsp leche flan', '2 tbsp ube halaya', 'sweetened saba', 'kaong', 'nata de coco (jarred)'.
  - Problem: No FNRI match, or only a match to the base food. The ingredient is itself a dish.
  - Detect: Ingredient name similarity to a recipe title of 0.8 or more, or the name contains leftover/'store-bought'/'homemade'.
  - Rule: If the ingredient name fuzzy-matches another recipe title, or is on a curated list (leche flan, ube halaya, minatamis na saging, latik, atchara, ginisang bagoong, lechon sauce, caramel), compute its per-gram nutrition and cost from that recipe (totals / total edible weight) and use them. Otherwise use an FNRI prepared/sweetened/'in syrup' row. Price leftovers at the same per-gram cost (opportunity cost) and flag them.
  - Nutrition: Halo-halo is currently far under-counted, apart from the problems in the next case. · Cost: Turns P0 or wrong base-food prices into realistic ones (ube halaya and leche flan are expensive per gram).
- **[medium] Halo-halo: ice, ice cream and jarred syrups** — e.g. '1 cup shaved ice' tokenizes to shaved, ice. It can match an FNRI 'Ice cream' row (F1 about 0.4, which passes the gate), giving 240 g of ice cream, about 450-500 kcal that isn't in the glass. 'ube ice cream' is non-priceable through 'ice'. 'sweetened kaong (in syrup)' is also listed.
  - Problem: Wrong FNRI match for ice, a wrong non-priceable flag for ice cream, and the consumed fraction of syrup.
  - Detect: Tokens ice/shaved/crushed/'ice cream'/'in syrup'/minatamis.
  - Rule: ice, shaved ice and crushed ice count as zero. 'ice cream' is a food: FNRI ice cream row, scoop = 65-70 g, and it is priceable. Jarred fruit in syrup counts drained plus 30-50% of the syrup (heuristic: the spoon carries syrup). Servings = glasses: amounts given per glass are multiplied by the number of glasses.
  - Nutrition: Removes about 450 kcal per glass from 'ice' wrongly matched to ice cream, where that match occurs. · Cost: Ice cream is currently unpriced.
- **[medium] Longganisa, tocino and tapa curing, and longganisa as an ingredient** — e.g. Curing rows: '1 tsp curing salt (Prague powder #1)', 'salitre', '1 tsp red food coloring', '1/2 cup brown sugar per lb pork', 'hog casings'. Elsewhere, 'Vigan longganisa / Filipino sausage, sliced' in pancit or pasta is non-priceable through 'sage' in 'sausage'.
  - Problem: Consumed fraction of curing additives, batch yield, and wrong FNRI/DA match for processed meat.
  - Detect: Title matches /longganisa|tocino|tapa|chorizo|embutido/, or tokens curing/prague/salitre/casing/coloring.
  - Rule: Curing additives count as negligible (0): curing salt, prague powder, saltpeter/salitre, food coloring, anise wine of 1 tbsp or less, MSG. The sugar cure is about 0.85-1.0 retained (tocino is simmered in its own syrup; heuristic). Casings count 0. Apply the batch-servings rule. As an ingredient, match FNRI processed sausage rows (longganisa, chorizo, Chinese sausage), not raw pork. Fix the 'sage' substring bug.
  - Nutrition: Moderate. The main error is the per-serving denominator (see the servings case). · Cost: Small for additives. Processed sausage used as an ingredient is currently unpriced.
- **[medium] Vitamin losses by cooking method (sinigang/nilaga/tinola long simmer, ginisa, pinakbet, fried; kinilaw raw)** — e.g. Kangkong, sitaw and radish in sinigang simmer 10-15 min, as do cabbage and pechay in nilaga. FNRI values are raw, so vitamin C (16% of nutritionScore) and B1 count at 100%.
  - Problem: No cooking adjustment.
  - Detect: The matched FNRI row is raw and the instruction verbs for that ingredient are boil/simmer/fry/grill/saute.
  - Rule: Find each ingredient's method from the instruction steps (boil/simmer/stew, saute, fry, grill, steam, raw/cured). Apply retention factors in the style of USDA Retention Factors Release 6 (approximate): vegetables boiled with the liquid eaten: vitamin C 0.60-0.75, B1 0.75-0.85, B2 0.85-0.95, vitamin A 0.85-0.95, Ca/Fe 0.95-1.0. Vegetables boiled and drained (blanched for ensalada): vitamin C 0.50-0.60, minerals 0.80-0.90. Sauteed: vitamin C 0.70-0.80. Deep-fried: vitamin C about 0.60, B1 about 0.75. Meat stewed: B1 0.50-0.70, B2 0.80-0.90. Grilled meat: B1 0.70-0.80. Raw/cured (kinilaw): 1.0. Atchara: vitamin C about 0.8 for storage. Apply only when the FNRI row is raw.
  - Nutrition: Vitamin C in soups drops 25-50%; B1 in meat drops 30-50%. The vitamin C score component falls noticeably for sinigang/nilaga. · Cost: None.
- **[medium] Tools and equipment parsed as food (pork BBQ bamboo skewers, aluminum foil, toothpicks, twine, cheesecloth, llanera)** — e.g. '20 bamboo skewers, soaked' tokenizes to bamboo, skewer and matches FNRI bamboo shoot: 20 x 50 g = 1,000 g (about 250-300 kcal and 20-30 g fiber that aren't there). 'Aluminum foil' also appears as an ingredient row.
  - Problem: Rows that are not food.
  - Detect: Equipment words in the name, or rows whose FNRI match is bamboo shoot while the name contains skewer.
  - Rule: Use an equipment word list (skewer, stick, foil, toothpick, twine, string, cheesecloth, parchment, wax paper, llanera, mold, ramekin, and 'banana leaf ... for lining') to drop the row (role=equipment) before matching, and log it for audit.
  - Nutrition: The fiber that isn't there is enough to move the fiber score (16% weight) in BBQ recipes. · Cost: Small, unless DA has a bamboo-shoot row.
- **[low] Kinilaw: raw cure liquid, fillet edible portion, and optional coconut milk** — e.g. Kinilaw rows: '1 lb fresh tuna, cubed', '1/2 cup vinegar for washing', '1 cup vinegar', '1/4 cup calamansi juice', '1/2 cup coconut milk (optional)'.
  - Problem: Consumed fraction of the cure liquid, and optional ingredients counted by default.
  - Detect: rawText contains 'optional', or kinilaw/ceviche/kilawin in the title.
  - Rule: Cubed fish or fillet: EP 1.0, no cooking retention (raw = 1.0). Wash vinegar counts 0 for nutrition and 100% for cost. Cure liquid is about 0.3-0.5 eaten (served with its juice; heuristic). '(optional)' rows are left out of the default totals and shown as an alternative version (same for 'optional' chicharon, cheese or Knorr in other families). Detect optional rows from rawText, because 'optional' is a stopword in the tokenizer.
  - Nutrition: Removes optional coconut milk (about 400 kcal per 1/2 cup cream) from the defaults. · Cost: Optional coconut milk or chicharon is about 10-25% of recipe cost when it is counted.
- **[high] Deep-frying oil counted in full** — e.g. "3 cups cooking oil (for deep frying)", "2 cups oil for frying" in lechon kawali, lumpia, fried chicken, daing na bangus
  - Problem: parseQuantity gives 3 x 240 = 720 g, and all of it goes into totals (about 6,360 kcal at about 884 kcal/100 g oil). At 4 servings that adds about 1,590 kcal per serving, but most of the frying oil stays in the pan.
  - Detect: Look for /\b(for|to)\s+(deep[- ]?)?fry(ing)?\b|deep[- ]?fr(y|ied)/i in the rawText notes or name. Also trigger when an oil row is at least 1/2 cup and the instructions match /deep[- ]?fry|fry .{0,40}until (golden|crisp)|heat .{0,30}oil in a (deep|large) (pan|pot|wok)/i. Notes only exist in rawText, and /api/recipes does not select rawText or instructions, so this has to run server-side in the batch job.
  - Rule: Set role=frying_medium. Nutrition counts only the oil the food absorbs: absorbed g = fat-uptake fraction x as-purchased weight of the rows that get fried. Fractions: unbreaded meat/fish 5%, breaded/battered 12%, wrapper foods (lumpia, turon, empanada) 15%, tofu/eggplant 10%. These are heuristic midpoints of the fat-gain ranges in Bognar 2002 and USDA fried-food data, so treat them as approximate. If the fried mass is unknown, absorbed = min(listed oil, 15 g x servings). Cost = absorbed oil + 10% of the listed volume (oil assumed reused). If there is no amount at all, use the fry default: absorbed oil x 1.5 for cost.
  - Nutrition: Fried dishes drop by 1,000 to 1,500 kcal and about 80 to 170 g fat per serving. This is the single largest correction in the dataset. · Cost: 720 g oil at an illustrative PHP 120/kg costs about PHP 86 today. After the fix, 1 kg pork belly (50 g absorbed + 72 g loss) costs about PHP 15.
- **[high] Water, ice and broth matching solid foods** — e.g. "4 cups water" (910 uses), "6 cups chicken broth" (94), "4 cups beef broth" (91), "rice washing (hugas bigas)"
  - Problem: isNonPriceable skips cost, but the nutrition path still runs rankMatch. The audit found 'beef broth'->'Beef blood'. 'chicken broth' {chicken, broth} scores F1 0.5 against a 2-token raw-chicken entry. Plain 'water' scores F1 0.67 against any 2-token '... water' FNRI entry, and the audit's 'kangkong'->'Coconut water' hit shows such an entry exists. The result is 960 g of blood or raw chicken added as if it were solid food.
  - Detect: Canonical name in {water, hot/cold/warm water, ice, ice cubes, rice washing, hugas bigas, broth, stock, bone broth, sabaw}, or the pattern '<meat|vegetable> (broth|stock)'. Check this before tokenizing for FNRI.
  - Rule: Route these names before any FNRI matching. Water, ice and rice washing: 0 nutrients, 0 cost, no match. Broth/stock: use a fixed generic broth analog (about 5-10 kcal, about 1 g protein, about 0.3 g fat per 100 g; approximate, USDA ready-to-serve broth family). Broth cost is 0 when a cube or granules row is also listed (that row carries the cost); otherwise use 1 bouillon cube per 2 cups as a cost proxy. Broth or stock may never match a meat, blood or bone entry.
  - Nutrition: Removes a false +770 to +2,000 kcal and +80 to 180 g protein per recipe where broth matched blood or raw meat. Removes about +180 kcal per 4 cups of water where water matched coconut water. Affects about 1,000 recipes. · Cost: Little change. These rows are already non-priceable. A cube proxy adds about PHP 5-8 to broth recipes that list no cube.
- **[high] Brand seasoning items matching raw meat** — e.g. "1 piece Knorr Pork Cube" (66), "2 tbsp Knorr Liquid Seasoning" (69), "1 pack Maggi Magic Sarap" (41), "Knorr Sinigang sa Sampalok Mix", "Knorr Chicken Cube"
  - Problem: 'knorr', 'cube' and 'magic' have no FNRI or DA hits, so 'pork' or 'chicken' alone decides. That likely gives F1 about 0.5 against a 'Pork, ...' or 'Chicken, ...' entry, which passes the 0.4 gate. With piece=50 g and pack=200 g, a pork cube becomes 50 g of pork priced at the DA pork rate.
  - Detect: Brand lexicon (knorr, maggi, magic sarap, mama sita, datu puti, silver swan, ufc, del monte, lady's choice, ajinomoto, jufran, alaska) or form words (cube, granules, mix, bouillon, instant, seasoning) in the name.
  - Rule: Map brand items to a generic product class with a fixed unit mass: bouillon cube 10 g, seasoning granules sachet 8 g, recipe mix sachet at its embedded size (else 40 g), liquid seasoning 15 g/tbsp. Give each a fixed nutrient analog (bouillon about 2-2.5 kcal/g, approximate, USDA bouillon family). Block FNRI/DA token matching whenever a form word (cube, granules, mix, seasoning, bouillon, instant) is present. Cost: SM is out of scope, so mark the row 'unpriced (brand)' and surface the unpriced-line count. A small static manual price table is optional.
  - Nutrition: Removes a false +100 to 150 kcal and +10 g protein per cube line. A real cube is about 20-25 kcal. Touches about 200+ recipes. · Cost: Removes a false PHP 15-20 per cube line (50 g x about PHP 350/kg pork).
- **[high] 'Head' of garlic = 500 g** — e.g. "1 head garlic, crushed", "2 heads garlic", "1 whole garlic bulb"
  - Problem: head=500 g is used for every food, but a garlic head weighs about 40-50 g imported or 20-30 g native. 'heads' is missing from UNIT_GRAMS, so the plural falls through to 60 g each.
  - Detect: Unit in {head, heads, bulb, bulbs, whole} and canonical food = garlic, or another head-type food.
  - Rule: Use per-food head weights (as purchased; approximate market sizes): garlic 45 g (DA 'Garlic, Imported'), native garlic 25 g, cabbage 1,000 g, lettuce 400 g, broccoli 400 g, cauliflower 600 g, pechay baguio 600 g. Apply edible portion to nutrition only: garlic about 85-88%, cabbage about 80-85% (approximate; swap in the FNRI 'Edible portion' % once it is stored). Unknown head food: 300 g with a low-confidence flag. Treat bulb and whole-garlic the same way.
  - Nutrition: About -670 kcal per head-garlic line (500 g x about 149 kcal/100 g vs about 40 g edible). Garlic appears in 821 recipes, so this is frequent. · Cost: 1 head garlic drops from PHP 60-75 to PHP 5-7 at an illustrative PHP 130-150/kg.
- **[high] Count units with no per-food piece weight** — e.g. "6 pieces calamansi", "5 pieces siling labuyo", "1 whole chicken", "2 pieces eggplant", "1 piece bangus", "1 medium cabbage", "3 pieces dried bay leaves", "2 potatoes"
  - Problem: piece=50 g and no-unit=60 g for every food. Chilies come out 25-50x too heavy, calamansi about 5x too heavy, and a whole chicken about 20x too light (60 g vs about 1.3 kg). The unit 'whole' is unknown, so it also falls to 60 g.
  - Detect: Unit in {piece, pieces, pc, pcs, whole, '', small, medium, large} and the name is a countable food. Size words may sit in the unit span or the name.
  - Rule: Use a per-food piece table (as purchased) times a size modifier (small 0.75, medium 1, large 1.3). Weights (approximate, from USDA FDC household portions and PH market sizes): egg 58 g (DA 56-60 g/pc), calamansi 12 g, siling labuyo 1.5 g, siling haba 8 g, onion 120 g, imported large red onion 150 g, tomato 100 g, potato 170 g, carrot 120 g, eggplant 120 g, radish 300 g, ampalaya 250 g, sayote 300 g, saba 90 g, whole chicken 1,300 g, bangus 450 g, tilapia 300 g, tuyo 15 g, bay leaf 0.2 g, star anise 0.5 g. Unknown countable food: 100 g with a low-confidence flag.
  - Nutrition: Whole chicken: about +1,800 kcal per recipe after edible portion. Chili, calamansi and bay-leaf lines lose tens to hundreds of false grams, including spurious vitamin A and C. · Cost: A whole-chicken line goes from about PHP 12 to about PHP 260 (illustrative PHP 200/kg). A chili line goes from about PHP 50 to about PHP 2.
- **[high] Cup/tbsp volume with no food density** — e.g. "1 cup all-purpose flour", "1 cup brown sugar", "1/2 cup cornstarch", "1 cup grated cheese", "2 cups shredded cabbage", "1 can/1 cup condensed milk", "1 cup panko"
  - Problem: cup=240 g for every food. Real weights: AP flour about 125 g, white sugar 200 g, packed brown sugar about 220 g, cornstarch about 128 g, grated cheddar about 113 g, shredded cabbage about 70-90 g, panko about 60 g, condensed milk about 306 g (USDA FDC household measures; approximate).
  - Detect: Unit in the volume set (cup, tbsp, tsp, ml, l, fl oz) and the food's class is not water-like.
  - Rule: grams = ml x density, with cup=240 ml, tbsp=15 ml, tsp=5 ml. Densities by class (g/ml, approximate, USDA FDC): water-like liquids (water, vinegar, milk, coconut milk) 1.0-1.03; soy/fish sauce 1.1-1.2; oil 0.91; honey/syrup/condensed milk 1.3-1.4; granulated sugar 0.85; packed brown sugar 0.92; AP flour 0.53; cornstarch 0.53; rice flour 0.66; uncooked rice 0.78; cooked rice 0.7; dried legumes 0.86; grated cheese 0.47; chopped onion 0.67; shredded cabbage 0.3; chopped leafy greens 0.15-0.25; breadcrumbs 0.45; panko 0.25; salt 1.2. Defaults: unknown solid 0.6, unknown liquid 1.0.
  - Nutrition: 1 cup AP flour goes from about 875 to about 455 kcal (-48%). Desserts and breaded dishes (flour 207, cornstarch 172 and sugar 320 uses) shift by hundreds of kcal per recipe. · Cost: Flour, sugar and starch costs drop 10-50%. Condensed milk rises about 27%.
- **[high] Unicode fractions dropped or truncated** — e.g. "½ cup soy sauce", "1 ½ cups coconut milk", "¼ tsp pepper", "1½ lbs pork"
  - Problem: Running docs/matcher.js confirms parseQuantity('½','cup') = null, so the ingredient silently contributes nothing. parseQuantity('1 ½','cups') = 240 instead of 360 (-33%).
  - Detect: /[¼-¾⅐-⅞]/ in the amount, unit or name.
  - Rule: Before parsing, replace vulgar fractions (¼ ½ ¾ ⅓ ⅔ ⅛ ⅜ ⅝ ⅞ ⅕ ⅙) with decimals, including the attached form '1½'. Then parse as a mixed number.
  - Nutrition: A dropped '½ cup sugar' is about -390 kcal per recipe. Size depends on frequency, which the pending data profile will show. · Cost: Half-cup and quarter-cup items get priced again instead of PHP 0. 1 1/2-unit items are corrected by +50%.
- **[high] Unit lexicon gaps: plurals, T/t, stick, liters** — e.g. "2 cans coconut milk", "2 stalks lemongrass", "2 heads garlic", "1 stick butter", "3 T sugar", "2 liters water", "2 packs noodles", "1/2 kilos pork"
  - Problem: Running the matcher confirms that 'cans', 'heads', 'stalks' and 'packs' all fall to 60 g each: 2 cans = 120 g instead of about 800 g, 2 stalks = 120 g instead of about 30 g. 'stick' falls to 60 g instead of 113 g. 'T' is lowercased before lookup, so '3 T' = 180 g instead of 45 g. 'liters', 'kilos', 'tbs', 'tsps', 'sprigs', 'packets', 'bottles', 'fl oz', 'qt' and 'pint' are also missing.
  - Detect: Normalized unit not in the lexicon. Log every unknown unit string with its count; the pending data profile will supply the distribution.
  - Rule: Map 'T', 'Tbs' and 'Tbsp' to tbsp and 't' to tsp before lowercasing. Strip periods and singularize. Extend the lexicon: stick butter 113 g, sprig 1 g, bottle (embedded size, else 350 ml), quart 946 ml, pint 473 ml, fl oz 29.6 ml, plus all plurals. An unknown unit goes to the per-food piece weight with a flag, never a blanket value x 60.
  - Nutrition: '2 cans coconut milk' gains about +1,500 kcal per recipe. '3 T sugar' loses about -530 kcal. · Cost: A '2 cans coconut milk' line goes from about PHP 7 to about PHP 50 or more.
- **[high] Parenthetical package size ignored** — e.g. "1 (12 oz) can coconut milk", "1 can (400 ml) coconut milk", "1 (3 lb) whole chicken", "1 cup (240 ml)", "1 lb (450 g) pork"
  - Problem: Confirmed: when the size sits in the amount span ('1 (12 oz)'), the parens are stripped and the result is 1 x can = 400 g instead of 340 g. When it sits in the unit span ('(12 oz) can'), the unit becomes 'ozcan', which is unknown, so the result is 60 g instead of 340 g. When it sits in the name, it pollutes the match tokens.
  - Detect: A parenthesized number+unit anywhere in amount, unit or name, or a count followed by a container word (can, pack, bottle, jar, box).
  - Rule: Search amount, unit, name and rawText for /\(?\s*(\d+(?:\.\d+)?)\s*(oz|ounces?|fl\.? ?oz|g|grams?|ml|kg|lbs?|l|liters?)\.?\s*\)?/. Quantity = count x size. Prefer the metric value when both appear. oz on cans and solids means weight oz (28.35 g); fl oz means 29.57 ml x density. Strip the parenthetical from the name before matching.
  - Nutrition: About -130 kcal or +1,000 kcal per affected coconut milk line. Coconut milk has 104 uses. · Cost: Coconut milk can lines are corrected by -15% (size in amount) or +470% (size in unit).
- **[high] Containers with no size: one 400 g 'can' for everything, no drained weight** — e.g. "1 can corned beef", "1 can Vienna sausage", "1 can tomato sauce", "1 can sardines", "1 can pineapple tidbits, drained", "1 can whole kernel corn, drained", "1 pack pancit canton"
  - Problem: can=400 g and pack=200 g regardless of product. Typical PH sizes (approximate; check against labels): corned beef 150 g or 260 g, Vienna sausage 130 g, sardines 155 g, tomato sauce 200-250 g (US 8 oz = 227 g), cream of mushroom about 298 g, pineapple 227 g or 567 g net, corn 425 g net, coconut milk 400 ml, evaporated milk 370 ml, condensed milk 300 ml (about 390 g), all-purpose cream 250 ml, liver spread 85 g, pancit canton 60 g single or 454 g bulk. A 'drained' note means the brine or syrup is discarded.
  - Detect: Unit in {can, cans, tin, pack, packs, pouch, jar, bottle, box} with no embedded size. Product taken from the canonical name. 'drained' taken from rawText notes.
  - Rule: Use a per-product default size table, applied only when no explicit size was found. When notes contain drained/strained, multiply by a drained fraction (fruit or vegetables in syrup or brine about 0.6; tuna about 0.75; approximate) and prefer the FNRI drained or canned ('cnd') solids entry. An unknown product in a can uses 400 g with a flag.
  - Nutrition: Dishes like corned beef guisado and sardinas with misua are overstated about 2.5x today, which works out to hundreds of kcal per recipe. · Cost: Canned-meat lines drop to about 1/3 (corned beef 400 g to 150 g).
- **[high] DA prices quoted per piece or per bottle used as PHP/kg** — e.g. DA 'Chicken Egg (White, Medium) 56-60 grams/pc' matched by "3 eggs" (eggs 182 + egg 107 uses). DA 'Cooking Oil (Coconut) 1 Liter/bottle'.
  - Problem: enrichRecipe always computes price/1000 x grams. For eggs priced per piece (illustratively PHP 8/pc), 3 eggs (180 g) cost PHP 1.44 instead of PHP 24. For oil priced per 1 L bottle, the per-kg assumption ignores density 0.92 (about 8% low).
  - Detect: Regex on Commodity.name for '/pc', 'grams/pc', '/bottle', 'Liter', '/bunch', 'Bundles'. Spot-check 'Eggplant 3-4 Small Bundles' and 'Broccoli ... bunch hd' manually.
  - Rule: Parse a unit hint from the DA name. /(\d+)-(\d+)\s*grams?\/pc/ means price per piece with mean piece weight = midpoint, so cost = (grams / piece weight) x price. /(\d+(?:\.\d+)?)\s*(liter|l|ml)\/bottle/ means price per liter, so cost = grams / density / 1000 x price. '/bunch', '/bundle' or '/pack' means price per bunch, using the per-food bunch weight. Anything else is per kg. Store the parsed priceUnit on the commodity row.
  - Nutrition: None. · Cost: Egg lines rise about 15-17x (PHP 1.44 to PHP 24 for 3 eggs). Oil lines rise about 8%.
- **[high] Bone-in and whole items weighed as purchased** — e.g. "2 lbs pork, cut into serving pieces", "1 whole chicken, cut into serving pieces", "2 lbs pork ribs", "1 pork hock (pata)", "2 lbs oxtail", "1 lb shrimp" (head-on), "1 kg bangus"
  - Problem: Recipe weights are as purchased, but FNRI values are per 100 g edible portion. Using purchased grams overstates nutrition by the refuse share (approximate, USDA refuse % and FNRI E.P.): whole or cut-up chicken about 30-35%, pork ribs about 25-30%, pata about 35-45%, oxtail about 50-55%, head-on shrimp about 40-55%, whole bangus or tilapia about 35-45%.
  - Detect: Name or notes contain ribs, spareribs, bone-in, whole, pata, hock, buntot/oxtail, neck, wings, drumstick, thigh, legs, head-on, 'cut into serving pieces' (chicken), or a whole-fish name without 'fillet'.
  - Rule: Nutrition grams = AP grams x EP%. Cost grams = AP grams, since DA prices are as purchased. Take EP% from the FNRI 'Edible portion' column once stored; until then use the defaults above. A generic 'pork' with no cut: choose the cut from the title (liempo/lechon kawali/sisig = belly; adobo/menudo = kasim) instead of the first FNRI pork hit.
  - Nutrition: Chicken, pork-rib, oxtail, shrimp and whole-fish dishes drop 25-55% in kcal and protein from that line, roughly -300 to -800 kcal per recipe. Chicken (111) and shrimp (88) are frequent. · Cost: No change. Cost already uses purchased weight.
- **[high] Cooked or leftover rice as an input** — e.g. "4 cups cooked rice (preferably day-old)" in sinangag, "leftover rice", "2 cups steamed rice"
  - Problem: 'cooked' is a stopword, so the name reduces to 'rice', which can hit a raw milled rice entry (about 360 kcal/100 g) instead of boiled (about 130). A cup counts as 240 g instead of about 160-185 g cooked. isNonPriceable('cooked rice') returns true because 'ice' is a substring of 'rice' (confirmed), so the cost is PHP 0.
  - Detect: /\b(cooked|leftover|day[- ]old|steamed|boiled|sinaing|kanin)\b/ next to rice, in the name or notes.
  - Rule: Detect state (cooked, leftover, day-old, steamed, boiled, sinaing) before stopwording. Map to the FNRI boiled/cooked milled rice entry and use 170 g per cup (approximate). Cost = cooked grams / 2.7 (approximate white-rice cooking yield, USDA cooking yields family) x DA 'Regular Milled' price/kg. Apply the same pattern to other cooked starch inputs: cooked noodles (÷2.3) and mashed potato.
  - Nutrition: 4 cups goes from about 3,450 kcal (raw rice, 960 g) to about 880 kcal (680 g cooked), a change of about -640 kcal per serving. · Cost: Adds about PHP 12-15 per 4 cups cooked rice (currently PHP 0).
- **[high] Physical-state words stripped by the tokenizer** — e.g. "1 cup dried mung beans" (monggo), "1/4 cup dried shrimp" (hibe), "6 dried shiitake mushrooms", "6 pieces tuyo", "2 hard-boiled eggs", "1 block fried tofu", "cooked chicken, shredded"
  - Problem: 'dried', 'dry', 'cooked', 'raw', 'roasted', 'toasted' and 'frozen' are stopwords, so a dried food matches its fresh or boiled form (or the reverse). Dried shrimp is about 280-330 kcal/100 g vs about 90 for fresh, with far more calcium. Dried mung beans are about 345 kcal vs about 105-120 boiled (approximate, FNRI/USDA families). FNRI prepared-dish rows ('prep, w/ ...') can also win.
  - Detect: State words in the name or notes, before tokenization. Also check whether the matched FNRI foodName carries a different state token.
  - Rule: Keep state as a separate attribute instead of discarding it. When ranking FNRI candidates, boost those with the same state token (dried, dehydrated, boiled, fried, cnd, raw) and penalize mismatches and 'prep' dish rows. If no same-state food exists, convert using approximate yield factors (USDA cooking yields family): dried legume to boiled x2.4, rice x2.7, pasta x2.3, raw meat to cooked x0.7. Price dried items against a dried DA commodity where one exists; otherwise flag.
  - Nutrition: Monggo: 1 cup dried (207 g) is about 715 kcal vs about 250-290 when matched to boiled. Dried shrimp protein and calcium go up 3-4x on small lines. · Cost: Moderate. Dried goods priced at fresh rates are wrong in both directions.
- **[high] Dredging, breading and egg-wash coatings counted at 100%** — e.g. "1 cup all-purpose flour (for dredging)", "2 cups breadcrumbs (for coating)", "2 eggs, beaten (for egg wash)", "1/2 cup cornstarch for coating"
  - Problem: Only part of a coating sticks to the food. The rest is discarded. Combined with cup=240 g, a dredging-flour line can be overstated 4-6x.
  - Detect: /\b(dredg|coat|bread(ing)?|dust|egg wash|for dipping the)\w*/i in the notes, or instructions that dredge or coat the item in that ingredient, together with a frying step. Exclude 'dissolved in'/'slurry'.
  - Rule: Set role=coating. Retained fraction (heuristic; no standard factor exists, and EuroFIR recommends weighing): flour or starch dredge 35%, breadcrumbs or panko 55%, egg wash 50%. Nutrition = density-corrected grams x retained fraction. Cost stays 100% of the listed amount. Cornstarch used as a slurry or thickener stays at 100%.
  - Nutrition: 1 cup dredging flour: about 875 kcal today vs about 160 kcal (125 g x 35%). Fried and breaded dishes drop 150-700 kcal per recipe. · Cost: No change (100% still charged).
- **[high] Servings missing, given as a range, or yield in pieces** — e.g. servings null (defaults to 4); "6 to 8" or "4-6" (parseInt gives 6 or 4); "30" for lumpia, polvoron or puto (yield in pieces); servings 1 on a 2 kg pot
  - Problem: Servings divides every per-serving number. The scraper uses parseInt on the first .wprm-recipe-servings text and does not capture .wprm-recipe-servings-unit, so 'pieces', 'cups' and 'bars' are lost and ranges collapse to the low end.
  - Detect: servings null; servings text contains '-', 'to' or 'or'; servingsUnit non-empty; mass-per-serving outlier check.
  - Rule: Re-scrape the servings container text and unit, and store servingsMin, servingsMax and servingsUnit. A range uses the midpoint (6-8 becomes 7). When servingsUnit is pieces (or servings >= 12 and the title is a piece food such as lumpia, siopao, empanada, polvoron, puto, kutsinta, pandesal, cookies, turon), report per piece with an explicit label. When servings is missing: estimate = clamp(round(main-protein AP g / 150), 2, 8), or if there is no protein, clamp(round(edible solids g excluding water and frying oil / 300), 2, 8), and flag 'servings estimated'. Both heuristics are rough, not standards. Sanity flag: edible mass per serving outside 120-700 g.
  - Nutrition: Same scaling. For example, '6 to 8' using 6 overstates per-serving values by about 17% against the midpoint. · Cost: Cost per serving can change -20% to +50% on range recipes, and up to 30x on piece-yield recipes with the wrong label.
- **[medium] Ranges take the low end; hyphenated mixed numbers misread** — e.g. "2-3 pieces", "1 to 2 cups", "6-8 cloves", "1-1/2 cups", "1/4 to 1/2 cup", "2 or 3"
  - Problem: split(/-|to|–/)[0] keeps the low end: '2-3' gives 2 and '1/4 to 1/2 cup' gives 60 g. The hyphenated mixed number '1-1/2' is read as a range, so it gives 1 (confirmed 240 g instead of 360 g).
  - Detect: The amount matches /^\s*([\d.\/ ]+)\s*(?:-|–|to|or)\s*([\d.\/ ]+)\s*$/.
  - Rule: First test for /^\d+-\d+\/\d+$/ and read it as a mixed number (1.5). Otherwise, for a numeric range (a-b, a to b, a or b with b > a), use the midpoint and store min and max for the UI.
  - Nutrition: Same proportions. For example, '2-3 lbs pork' goes from 907 g to 1,134 g, about +500 kcal. · Cost: About +10-25% on range lines. +50% on hyphenated mixed numbers.
- **[medium] Hedge words and article amounts drop the ingredient** — e.g. "about 2 cups", "approx. 1 lb", "around 500 g", "a pinch", "a few", "a handful", "several pieces", "a couple"
  - Problem: Confirmed: parseQuantity('about 2','cups') returns null and parseQuantity('a','pinch') returns null, so the whole row contributes nothing.
  - Detect: The amount fails numeric parsing but contains letters, or the amount is null and the name begins with a hedge or article.
  - Rule: Strip hedge words (about, approx., approximately, around, roughly, ~, more or less, at least). Map articles: 'a', 'an' and 'one' to 1; 'a couple' to 2; 'a few' to 3; 'several' to 4. Unit 'handful': leafy 30 g, nuts or shrimp 40 g (household estimate). Flag the row as 'approximate'.
  - Nutrition: Restores the dropped line in full. For example, 'about 2 cups coconut milk' is about +900 kcal. · Cost: Restores dropped lines, which can be large ('about 1 kg pork').
- **[medium] Optional ingredients included in totals** — e.g. "1 cup grated cheese (optional)", "chicharon, crushed (optional)", "1 tbsp sugar, optional", rows under an 'Optional:' header
  - Problem: Optional rows are currently counted whenever they carry an amount, which inflates both the base dish and the cost.
  - Detect: /\boptional\b|if desired|if available|you can skip/i in the rawText notes or name, or the row follows an 'Optional' header.
  - Rule: Set role=optional. Exclude the row from base nutrition and cost, and show it as a '+ optional: X kcal, PHP Y' add-on. Leaving optional items out is the common recipe-analysis convention. Rows that follow an 'Optional' header row inherit the role until the next header.
  - Nutrition: For example, about -400 kcal per recipe for optional grated cheese (after density correction). · Cost: Removes PHP 10-60 per optional premium item (cheese, chicharon).
- **[medium] Garnish, toppings and 'for serving' accompaniments** — e.g. "chopped green onions for garnish" (no amount), "2 hard-boiled eggs, sliced (for topping)", "toasted garlic for topping", "steamed rice (for serving)", "calamansi, to serve"
  - Problem: With no amount the row contributes 0. With an amount it is counted in full. Accompaniments such as rice or bread listed as ingredients get folded into the dish.
  - Detect: /\b(for|to)\s+(garnish|top(ping)?|serve|serving)\b|\bgarnish\b|on the side/i in the notes or name, or a 'Garnish'/'Toppings' header.
  - Rule: A garnish with an amount is counted at 100% (garnishes are eaten). A garnish with no amount uses per-serving defaults (heuristic): herbs 2 g, green onion 3 g, fried garlic or shallot 3 g, chicharon 10 g, boiled egg 0.5 egg, calamansi 1 pc. Accompaniments ('for serving', 'serve with', 'on the side' with rice, bread or pandesal) are excluded from dish totals and shown as an optional 'with rice' line (1 cup cooked rice about 170 g, about 220 kcal; approximate).
  - Nutrition: Egg toppings add about +40 kcal per serving. Excluding listed rice removes up to about 900 kcal per recipe. · Cost: Small additions (PHP 1-10). Removes accompaniment rice from dish cost.
- **[medium] Marinades discarded and dipping sauces partly eaten** — e.g. Pork BBQ: "1 cup soy sauce, 1/2 cup banana ketchup, 1 cup brown sugar" under 'Marinade:' with 'discard the marinade' or 'use for basting'; "1/2 cup vinegar for dipping"
  - Problem: Every marinade and dip row counts at 100%. A sugar-heavy BBQ marinade adds about 800+ kcal per recipe even though most of it never reaches the plate.
  - Detect: Rows after a 'Marinade' header row (order by RecipeIngredient.id, since there is no position column), or notes matching /\b(for|to) (the )?marinade|marinate|for dipping|sawsawan\b/. Then classify by instruction text: discard / reserve / baste / pour.
  - Rule: Instructions say pour, add or simmer the marinade into the dish (adobo, pares): 100%. 'Discard': 20% of nutrients. 'Baste' or 'reduce and brush': 50%. Dipping sauce: 50%. All fractions are heuristic; EuroFIR recommends weighing. Cost stays at 100% in every case.
  - Nutrition: BBQ and inihaw recipes: about -400 to -700 kcal per recipe from sugar and ketchup. · Cost: No change.
- **[low] Thumb, inch or knob of ginger** — e.g. "a thumb of ginger", "1 thumb-sized ginger, sliced", "1 inch ginger, julienned", "2 inches ginger", "1 knob ginger"
  - Problem: 'thumb', 'inch' and 'knob' are not units in the table, so they fall to 60 g each. '2 inches' becomes 120 g. 'a thumb' returns null.
  - Detect: The unit or name contains thumb, thumb-sized, inch(es), knob or cm with ginger, luya, turmeric or galangal.
  - Rule: thumb = 15 g, inch (2.5 cm piece) = 10 g, knob = 20 g (approximate; USDA lists a 1-inch ginger piece at about 11 g). Apply EP of about 85% (peeled) for nutrition. The same lexicon covers lemongrass stalk 15 g (fix 'stalks') and pandan leaf 2 g.
  - Nutrition: Small: about -30 kcal per line. · Cost: About PHP 9 down to PHP 2 per line at an illustrative PHP 150/kg. Ginger has 140 uses.
- **[medium] Bunch and bundle with no per-food weight** — e.g. "1 bunch kangkong", "2 bunches pechay", "1 bunch spring onions", "1 bunch malunggay", "1 bundle sitaw"
  - Problem: bunch=200 g for every food, and the plurals 'bunches' and 'bundles' fall to 60 g. Leaves are also partly inedible: kangkong stems are trimmed and malunggay leaves are stripped from the stalk.
  - Detect: Unit in {bunch, bunches, bundle, bundles, tali} together with a leafy or vegetable canonical name.
  - Rule: Per-food bunch weights (as purchased; approximate PH tali sizes): kangkong 250 g (EP about 65%), pechay 250 g (EP about 85%), sitaw 250 g, alugbati 200 g, saluyot 150 g, malunggay 100 g on the stem (EP about 35% for leaves), green onion 80 g, kinchay or cilantro 40 g. Unknown bunch: 150 g with a flag.
  - Nutrition: kcal changes are small, but vitamin A, vitamin C, iron and calcium per serving change materially. Leafy greens drive those nutrients in the health score. · Cost: About +25% or -60% per line depending on the vegetable. Plurals go up 4x.
- **[medium] Section-header rows stored as ingredients** — e.g. "Cooking Procedure", "Marinade ingredients:", "For the sauce:", "Sauce", "Toppings", "Filling", "Garnish:", "Optional:"
  - Problem: Authors typed these as ingredient lines (real WPRM group names are not captured), so they are matched as foods. For example, 'cooking' can hit a cooking-banana entry. They also depress match-rate KPIs. NON_PRICEABLE only hardcodes two of these phrases.
  - Detect: Amount null, unit null, and either rawText ends with ':' or it matches /^(for (the )?\w+( \w+)?|\w+ ingredients?|ingredients|(cooking )?procedure|marinade|sauce|toppings?|garnish|filling|dough|batter|glaze|syrup|optional|others?)\s*:?\s*$/i. Alternatively, every token falls in a header vocabulary.
  - Rule: Drop these rows from computation. Keep each one as a group label applied to the following rows (by id order) until the next header. The label feeds the optional, marinade, garnish, frying, dipping and sub-recipe role rules.
  - Nutrition: Removes any false matches when an amount is present, and enables the marinade, optional and garnish corrections. · Cost: Indirect: role rules downstream depend on the labels.
- **[medium] Quantity in the name, or a unit word as the name** — e.g. "45g pack Knorr Ginataang Gulay Mix", a name of "2 tbsp soy sauce" with amount null (the WPRM line had no spans, so the scraper fell back to name = rawText), name = "can" or "pack" with "(14 oz) coconut milk" in the notes
  - Problem: The quantity is invisible to parseQuantity, so the row contributes 0. Quantity-prefixed names create duplicate canonical ingredients. When the name is a unit word, the row has no food at all.
  - Detect: Amount null and the name begins with /^[\d¼-¾⅐-⅞]/; the name contains an embedded size; or tokenize(name) is empty or the name is in the unit lexicon.
  - Rule: Run a line parser (amount, unit, name, notes) on rawText whenever amount is null and the name starts with a number or fraction, the name contains /\d+\s*(g|ml|kg|oz|lbs?)\b/, or the name is a unit word. Build the canonical name with quantity and packaging removed ('Knorr Ginataang Gulay Mix'). If nothing edible remains, drop the row.
  - Nutrition: Restores silent zero lines, for example about +40 kcal per '2 tbsp soy sauce' or a whole can of coconut milk. · Cost: Restores silent zero lines.
- **[medium] Equipment and inedible wrappers matched as food** — e.g. "aluminum foil", "20 pieces bamboo skewers (soaked in water)", "kitchen twine", "toothpicks", "parchment paper", "cheesecloth", "llanera", "popsicle sticks", "4 pieces banana leaves (for wrapping)", "corn husks"
  - Problem: 'banana leaves' reduces to 'banana' because 'leaves' is a stopword, so it matches fruit: 4 x 50 g gives about +200 kcal. 'bamboo skewers' likely hits 'Bamboo shoot' at F1 0.5: 20 x 50 g = 1 kg of shoots. 'popsicle sticks' contains 'ice' and 'stick'.
  - Detect: Equipment and wrapper lexicon, plus /for (wrapping|lining|skewering|grilling)|soaked in water/ in the notes.
  - Rule: Equipment lexicon: drop the row from both nutrition and cost and mark it non-food. Inedible-wrapper lexicon (banana leaf, corn husk, pandan for wrapping, bamboo tube): nutrition 0; cost only if a DA commodity exists, else 0. Check the lexicon before matching.
  - Nutrition: Removes false +200 to +300 kcal lines on suman, inihaw and BBQ recipes. · Cost: Removes small false costs.
- **[medium] Alternatives ('pork or chicken', 'butter or margarine')** — e.g. "2 lbs pork or chicken", "butter or margarine", "calamansi or lemon juice", "fish sauce or salt", "kangkong/spinach", "and/or"
  - Problem: The tokens of both options join the match set. This lowers F1 against the correct single food, or rewards a mixed prepared-dish FNRI entry that contains both words (P=R=1). Cost may come from either option.
  - Detect: ' or ', '/' or 'and/or' in the name after removing notes.
  - Rule: Split on /\s+or\s+|\s*\/\s*|\band\/or\b/, but not inside 'or more', 'or to taste', 'or as needed' or 'or so'. Use the first option, the author's primary, for both nutrition and cost, and store the rest as alternatives for the UI. An 'or' inside the amount ('2 or 3') is a range.
  - Nutrition: Avoids matching a prepared dish and keeps fat consistent. Pork vs chicken is roughly +/-30% kcal on the protein line. · Cost: Stable pricing on the primary option. Pork vs chicken can swing about PHP 100 per recipe.
- **[medium] Duplicated rows: real cross-group repeats vs scrape duplicates** — e.g. "4 cloves garlic" in the marinade and "6 cloves garlic" in the sauce (real). A page with two WPRM cards (main dish + sauce, or a card rendered twice) where the scraper selects every .wprm-recipe-ingredient on the page but takes servings from .first().
  - Problem: Deduplicating by name would undercount real repeats (dropping 6 of 10 cloves). Merged multi-card pages double the totals and divide by the first card's servings.
  - Detect: Repeated-block detector over rows in id order. Same canonical name with different amount or notes, separated by a header row, means a real repeat. Count of .wprm-recipe-container elements on re-scrape.
  - Rule: Never dedupe by name alone. Sum real repeats. Collapse an exact repeated block (3 or more consecutive identical name+amount+unit rows). On a re-scrape, record cardIndex per row from .wprm-recipe-container; keep card 1 as the recipe and treat further cards as sub-recipes, or drop them. In the cost and shopping view, aggregate by canonical ingredient and count 'to taste' rows once.
  - Nutrition: Same: about x2 on affected recipes. · Cost: Duplicated cards double cost (x2). Wrong dedupe understates it.
- **[medium] Sub-recipes referenced as ingredients** — e.g. "1 cup lechon sauce (see recipe)", "homemade atchara", "1/2 cup annatto oil (see notes)", "2 cups homemade chicken stock", "1 recipe pie crust", "bagoong guisado (recipe below)"
  - Problem: The name is matched as a raw food. 'lechon sauce' {lechon, sauce} can hit a roast-pork 'Lechon' entry: 240 g of meat for 1 cup of sauce, about +900 kcal. The reverse also happens: condiment recipes have servings=1 or 'makes 1 cup', so their 'per serving' is the whole batch.
  - Detect: /\b(homemade|see (recipe|notes?|below|above)|recipe (below|here|link)|prepared|make ahead)\b/i in rawText, or a canonical name that equals or fuzzy-matches another Recipe.title.
  - Rule: Detect the reference and resolve it to a Recipe by fuzzy title match. Sub-recipe nutrition and cost per gram = sub totals / sub yield mass, where yield mass = sum of ingredient grams x yield factor (sauce simmered about 0.8; EuroFIR recipe-calculation approach; approximate). Apply amount x density. Limit recursion depth to 2 and guard against cycles. If unresolved, use a generic FNRI analog if one exists, else exclude and mark the recipe 'incomplete'. Condiment recipes (title has sauce, dip, atchara, oil, dressing, gravy, or servings <= 1 with yield in cups) report per tbsp.
  - Nutrition: Removes false +500 to +900 kcal lines. Fixes inflated per-serving values on about dozens of condiment recipes. · Cost: Replaces false meat pricing with the real component cost.
- **[low] 'Salt and pepper to taste' and other 'to taste' / 'as needed' lines** — e.g. "Salt and pepper to taste" (153), "fish sauce to taste", "sugar to taste", "water as needed", "oil as needed"
  - Problem: The amount is null, so the row is 0, which is correct for salt and pepper because sodium is not among the stored NutritionFact fields. But compound lines are matched as one food, and 'sugar to taste' drops real energy.
  - Detect: Amount null and /\bto taste\b|as needed|as desired|adjust|q\.?s\.?/i in the name or notes. Compound lines match /\band\b/ between two seasonings.
  - Rule: Split 'X and Y to taste' into separate rows. Salt, pepper and MSG: 0 g for nutrition and a pantry allowance of PHP 0.25 or nothing for cost. Sugar to taste: 1 tbsp (12.5 g). Patis or soy to taste: 1 tbsp (about 16-18 g). Calamansi to taste: 2 pc. Water as needed goes to the water rule; oil as needed goes to the no-amount oil rule. Flag the row 'amount imputed'.
  - Nutrition: Sugar to taste adds about +48 kcal per recipe. Salt and pepper stay about 0 for the tracked nutrients. · Cost: Below PHP 1 to PHP 2 per recipe.
- **[medium] Cooking oil with no amount (not frying)** — e.g. "cooking oil" with no amount (a share of the 1,063 uses), "oil for sautéing", "oil for greasing the pan", "butter for brushing"
  - Problem: With amount null, oil contributes 0 kcal and PHP 0 even though the instructions sauté in it.
  - Detect: Fat or oil name (oil, mantika, lard, butter, margarine) with amount null. Method keywords taken from RecipeInstruction text.
  - Rule: Impute by method from instruction text: sauté or stir-fry 2 tbsp (27 g); greasing or brushing 1 tsp (4.5 g); deep-fry goes to the frying-medium rule; no detectable method 1 tbsp (13.6 g). Flag the row 'amount imputed'.
  - Nutrition: About +240 kcal and +27 g fat per recipe for sauté oil, or about +60 kcal per serving at 4 servings. · Cost: Adds about PHP 2-4 per recipe.
- **[medium] Coconut milk extraction grade ignored** — e.g. "1 cup kakang gata (first extract)", "2 cups coconut milk (second extraction)", "1 cup coconut cream", "2 cups gata from 1 grated coconut"
  - Problem: First extract or cream (about 30-35% fat) and second extract (heavily diluted) match the same entry. The audit also shows 'milk' alone is captured by 'Coconut milk'.
  - Detect: Extraction words, gata/kakang gata, or cream in the name or notes, together with coconut.
  - Rule: 'coconut cream', 'kakang gata' or 'first extract': use the cream/undiluted entry. 'second', 'third' or 'pangalawang piga': use the diluted 'w/ water' entry, or cream x 0.35 (approximate). Plain 'coconut milk' or a can: canned or undiluted milk (about 20 g fat/100 g, USDA canned coconut milk family, approximate). Dairy 'milk' must not match coconut milk unless 'coconut' or 'gata' is present.
  - Nutrition: About +/-150 to 300 kcal per cup depending on grade. Coconut milk has 104 uses, so ginataan dishes shift materially. · Cost: Small. One coconut is priced either way.
- **[low] Juice of N fruits, or N fruits juiced** — e.g. "juice of 1 lemon", "6 pieces calamansi, juiced", "1/4 cup calamansi juice (from about 10 pieces)", "zest of 1 dayap"
  - Problem: 'juice of 1 lemon' sits in the name with amount null, so it contributes 0. '6 calamansi, juiced' counts 6 x 60 g = 360 g of whole fruit when only about 30 g of juice is used.
  - Detect: /juice of|,? ?(juiced|squeezed)|\bzest of/i in the name or notes, with a citrus name.
  - Rule: Nutrition = N x juice yield (calamansi about 5 g, lemon about 45 g, dayap about 10 g; approximate, USDA lemon about 47 g juice per fruit), matched to the FNRI juice entry. Cost = N x whole-fruit piece weight x price. When both a volume and a fruit count are given, use the volume for nutrition and the count for cost. Zest counts 0 g for nutrition.
  - Nutrition: Removes about 300 g of false whole fruit. Vitamin C is corrected downward, about -50 to -100 kcal per line. · Cost: Prices the real number of fruits.
- **[high] NON_PRICEABLE substring false positives** — e.g. isNonPriceable() returns true (verified by running docs/matcher.js) for: "cooked rice", "rice noodles", "calamansi juice", "Vienna sausage", "cauliflower", "red bell pepper" (107 uses), "sunflower oil", "water spinach (kangkong)", "leaf lettuce", "shrimp, peeled and deveined"
  - Problem: The function uses lc.includes(w). 'ice' is inside rice, juice, spice and slices; 'sage' is inside sausage; 'flower' is inside cauliflower and sunflower; 'pepper' is inside bell or chili pepper; 'water' is inside water spinach and watercress; 'leaf' is inside leaf lettuce; 'peel' is inside peeled; 'rind' is inside grind. These rows are never priced.
  - Detect: Run the substring and token-boundary versions side by side over all 3,386 names and review every disagreement.
  - Rule: Match NON_PRICEABLE on whole tokens or phrases after tokenization. Add priceable overrides that win: bell pepper, sili, siling labuyo, siling haba, any rice, juice (mapped to the fruit), sausage, cauliflower, sunflower oil, kangkong/water spinach. Keep 'pepper' non-priceable only for black, white or ground pepper and peppercorns. When unsure, run the DA match and let the confidence gate decide.
  - Nutrition: None. The nutrition path does not use isNonPriceable. · Cost: Restores missing lines. For example, 1 red bell pepper (about 150 g) at an illustrative PHP 200/kg is PHP 30 instead of PHP 0, and 4 cups cooked rice is about PHP 12 instead of PHP 0.