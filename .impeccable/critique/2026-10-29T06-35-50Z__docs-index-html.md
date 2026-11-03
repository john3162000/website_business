---
target: "FARM2FIGURE site: home, browse, recipe pop-up, planner"
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\John_Maigue\\Downloads\\website_business\\docs\\index.html"
target_fingerprint: "sha256:2f4db96b6a646763431ecb6a220f3a39616d7032276f675aa137af54fd8c1164"
target_path: "C:\\Users\\John_Maigue\\Downloads\\website_business\\docs\\index.html"
timestamp: 2026-10-29T06-35-50Z
slug: docs-index-html
---
Method: dual-agent (A: design review sub-agent · B: detector + browser sub-agent)

# Critique: FARM2FIGURE site (`docs/index.html`), 2026-10-29

**What was reviewed:** Home and the hero, Browse cards, the recipe pop-up and the Weekly Planner.
Each was checked at phone width (375×812) and desktop width (1024+), in light and dark mode, with
the weather set to sunny. The live data came from the Vercel API.

**Run notes:**
- The CLI detector ran on `docs/index.html` and found 26 warnings. `docs/match-review.html` came
  back clean.
- The browser overlay was injected, but the browser pane was hidden at the time (the viewport was
  0 px wide). The overlay elements exist in the [Human] tab, but no one has seen them yet.
  Rescans that depend on layout are unreliable until the overlay is shown visibly.
- No site files were changed.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | The recipe pop-up shows "Loading ingredients…" for 5–9 s with no skeleton. The DA date is shown but its age isn't. |
| 2 | Match System / Real World | 2 | Taglish headings sit on English controls. "Nutri: 7", "Sulit Score 3" and "₱7.6+" are never explained. Sauces and smoothies are treated as ulam. |
| 3 | User Control and Freedom | 2 | Esc doesn't close the pop-up (there is no key handler in the code). The ✕ is about 20×24 px. Random week overwrites the plan with no undo. |
| 4 | Consistency and Standards | 2 | Nav labels change with width (desktop: "Browse Recipes / DA Prices", phone: "Recipes / Prices"). The meter says "Super sulit" while the pop-up tile says "Sulit Score 3". |
| 5 | Error Prevention | 2 | The budget planner and Random week build ₱4,084 weeks out of non-ulam. "Clear week" is a 20 px link right under the receipt. |
| 6 | Recognition Rather Than Recall | 3 | Chips and the receipt keep choices visible. The Sulit Score scale has to be learned from the tour. |
| 7 | Flexibility and Efficiency | 2 | On phone, Browse search sits below the filter form. There are no one-tap budget presets. |
| 8 | Aesthetic and Minimalist Design | 2 | Home is about 6,400 px tall on phone. The pop-up stacks buttons, tiles and every ingredient before the total cost. |
| 9 | Error Recovery | 2 | Image fallbacks are fine and unpriced lines explain themselves. There is no message for a slow or offline API. |
| 10 | Help and Documentation | 3 | The 8-step Taglish tour, the "?" replay button and the "💡 Why this scores this way" note are good. |
| **Total** | | **22/40** | **Acceptable** (significant improvements needed) |

## Design Specificity Verdict

**Design review:**
- **Above the fold, it feels authored.** The forest-and-gold hero with "Masarap, masustansya,
  *sulit.*" in Fraunces, the five-segment sulit meter, the Taglish tour, "Pinakamura ngayon" split
  into Gulay/Isda/Karne, the planner Receipt and the Nutrition Facts label are all choices made for
  this product.
- **Below the hero, it slides back into a generic Tailwind recipe grid.** The cards are identical
  (photo, title, grey caps, two pills), Browse opens with an English filter form, and "How It
  Works" is a formal three-emoji feature block.
- **The data undercuts the design.** The #1 "Best Value" dish is "Lechon Manok Sauce Recipe", and
  Random week (with "Ulam lang" on) serves Banana Smoothie and Hawaiian Pizza for hapunan.

**Deterministic scan** (26 warnings in `docs/index.html`):
- **Real and worth fixing:**
  - **Undersized text (11):** bottom-nav labels at 9.6 px (`.bottom-nav button`, .6rem), the
    FARM2FIGURE brand word at 9.9 px, and the finder legend at 10.4 px.
  - **Bottom-nav contrast:** #6B7F70 on cream is 3.9:1.
  - **Skipped heading (from the live scan):** each section h1 jumps straight to card h3s with no
    h2.
- **Both reviews agree:** the detector's small-text and contrast findings match the design
  review's honesty-marker contrast finding (amber badge 2.7:1, category labels 2.5:1).
- **Likely false positives:**
  - 7× "#000 on #163F2E" contrast: these are inherited non-text nodes; the hero text is cream and
    gold.
  - "#F8F4EA on #FFF": a hidden tour button.
  - `broken-image` on `#share-preview`: its source is set at runtime.
  - `cramped-padding` on the hero band.
  - `flat-type-hierarchy`: the static scan doesn't apply Tailwind CDN sizes.
- **Deliberate brand choices, not defects:** `overused-font` (Inter and Fraunces) and
  `cream-palette`. The brand word at 9.9 px is a logotype and arguable.

**Visual overlays:** injected into the [Human] tab, but the pane was hidden, so no one has seen
them. To see them, open the browser pane and re-run the overlay.

## Overall Impression

The brand and the honesty system are the best things here. Few price sites show "≈ Mung beans,
dried ×0.5 (DA)" or say "93% of ingredients priced". Everything around that system gets in the way
of a quick decision on a phone: English forms, long scroll, an unreadable warning badge, a pop-up
you can't open by keyboard, and a randomizer that serves pizza as ulam.

**The single biggest opportunity:** make the phone path end in a decision in one screen
("Ulam ngayon: Monggo Guisado, ₱16.6/serving"), backed by picks that are actually ulam.

## What's Working

1. **Honest pricing as UI.** The "≈" source lines, the "+" on partly priced costs, the "% priced"
   figure, and the note "The real cost is higher than shown, so this dish is listed last" make
   Principle 1 visible.
2. **Taglish voice where it exists.** The tour ("Yung green na bar? Sulit meter yan"), "Pinakamura
   ngayon" and the Lunes–Linggo grid read as written by someone from Manila.
3. **Real-world metaphors:** the Nutrition Facts label, the palengke receipt, and the sulit meter.
   Night market dark mode holds up, with card text at 5.9–9.5:1.

## Priority Issues (ranked by impact, quick wins first)

### Quick wins (CSS, class or copy changes; small and safe)

**1. [P1] The honesty markers fail contrast.**
- **What:**
  - The "⚠ Incomplete price" badge is white on `bg-amber-500` (#C9961A), about 2.7:1, at 12 px
    over a photo.
  - The ≈ source line in the pop-up is 10 px #A87A12 on white, about 3.9:1.
  - Card category labels are `text-gray-400` on white, 2.5:1.
  - The bottom-nav labels are #6B7F70, 3.9:1, at 9.6 px.
- **Why it matters:** these are exactly the signals PRODUCT.md says must stay visible.
- **Fix:**
  - Give the badge `bg-amber-800` with cream text, or dark text on `amber-300`.
  - Make the source line `amber-700` at 11–12 px.
  - Make category labels `text-gray-500` or darker.
  - Darken the bottom-nav labels to forest and raise them to at least 11 px.
- **Suggested command:** `/impeccable polish`

**2. [P2] Mixed language and opaque labels.**
- **What:**
  - Nav labels differ between phone and desktop.
  - Browse, "How It Works", the budget placeholder and the receipt are in English.
  - "Nutri: 7" sits in a red pill that reads as a warning, even on top dishes.
  - The pop-up shows "Sulit Score 3" while the meter says "Super sulit".
  - "₱7.6+" has no legend.
  - "Medyo mahal" is shown on ₱10/serving dishes when it means "poor value".
- **Why it matters:** Aling Nena and Jordan can't tell what the numbers mean, and red reads as
  danger.
- **Fix:**
  - Use one nav label set everywhere (for example "Recipes · Presyo · My Dish · Planner ·
    Lulutuin").
  - Rename "Nutri" to "Sustansya" and give it a neutral pill.
  - Add the legend "+ may sangkap na wala pang presyo".
  - Show the Sulit Score as the meter, not a bare number.
  - Change "Medyo mahal" to "Hindi gaano sulit".
- **Suggested command:** `/impeccable clarify`

### Bigger fixes (JS, markup or data work)

**3. [P0] Recipe cards and the pop-up are closed to keyboard and screen-reader users.**
- **What:**
  - `.recipe-card` is a `<div onclick="openModal(id)">` with no role, no tabindex and no key
    handler.
  - `#recipe-modal` has no `role="dialog"`, no focus move and no Esc. The codebase has no
    `keydown`/`Escape` handler and no `:focus-visible` style; only `#tour` has dialog semantics.
  - The ✕ has no label.
- **Why it matters:** the core path, picking a dish to see its cost, is blocked for Sam.
- **Fix:**
  - Make each card title a `<button>`, or `<a href="#recipe=id">` stretched over the card.
  - Give the modal `role=dialog`, `aria-modal` and `aria-labelledby`. Move focus in, trap it,
    close on Esc and return focus on close.
  - Make the ✕ at least 44 px with `aria-label="Isara"`.
  - Add a global `:focus-visible` ring.
- **Suggested command:** `/impeccable harden`

**4. [P1] Random week and Best Value surface dishes that aren't ulam.**
- **What:**
  - With "Ulam lang" on, Random week picks Banana Smoothie (₱643), Hawaiian Pizza, Turkey Noodle
    Soup and Scotch Eggs.
  - Browse "Best Value" ranks Lechon Manok Sauce and Lechon Sauce #1–2.
  - Pichi-Pichi and Nilupak are tagged MAIN DISH.
- **Why it matters:** one silly pick makes every number look silly, and it breaks Principle 5
  ("End in a decision").
- **Fix:**
  - Extend `SWEET_TITLE`, `SNACK_TITLE` and `SIDE_TITLE` (smoothie, pizza, sauce, "How to",
    pancakes), with tests.
  - Leave Sauce & Condiment out of Best Value by default.
  - Have the budget planner show "₱4,084 vs your ₱1,500".
- **Suggested command:** `/impeccable clarify` (content rules). This is mostly planner.js and data
  work.

**5. [P2] On phones, the decision is buried.**
- **What:**
  - Home is about 6,400 px tall; Top Value starts at about 2,365 px, and weather picks run one
    full-width card per screen.
  - Browse opens on a 5-field form with the search box below it.
  - The pop-up puts the total cost after every ingredient and stacks 3 action buttons.
  - The planner opens on 38 controls and scrolls in two directions (about 1.7 days visible).
- **Why it matters:** Casey and Aling Nena, on a slow phone, scroll forever before seeing a dish
  or a price.
- **Fix:**
  - Use horizontal scroll rows for weather picks and Top Value on phone.
  - Put search first in Browse and collapse the filters into a "Filters (2)" sheet.
  - Put "₱120+ total · ₱20+/serving" next to the pop-up title and use one icon row for
    Share/Favorite/Video.
  - Give the planner a "start here" step.
- **Suggested command:** `/impeccable layout` (or `/impeccable distill`)

## Persona Red Flags

**Casey (one-handed, distracted, slow connection):**
- Filter and weather chips are 31 px tall.
- "Clear week" is 20 px.
- The "Keep dishes" checkbox is 13 px.
- The pop-up ✕ is about 20×24 px in the top corner, out of thumb reach.
- Ingredients take 5–9 s behind plain "Loading ingredients…" text.
- On phone the planner grid scrolls both ways, with titles cut to "Scotch Eggs...".

**Jordan (confused first-timer):**
- The first tour card covers the hero stats it points at.
- "1,542 FNRI foods" means nothing to a first-timer.
- The Sulit Score number has no scale.
- The red Nutri pills read as warnings.
- The planner has no "start here".

**Sam (keyboard and screen reader):**
- Div cards can't be reached by keyboard.
- The pop-up has no dialog semantics, no focus move and no Esc.
- The ✕ has no label.
- `focus:outline-none` is used with no `:focus-visible` replacement.
- The meter's meaning is only in a `title` attribute.

**Aling Nena (budget home cook, low-end Android, Taglish):**
- Browse is all English, and its top result is a sauce.
- Random week gives her a ₱643 smoothie dinner in a ₱1,500 week.
- The budget field is an English placeholder only.
- Long titles ("…(Mung Bean Stew with Dried Anchovies)", "…Recipe") fill the card.

## Minor Observations

- The browser title still says SarapSulit.
- Home says "1,951 recipes" while Browse says "97 recipes hidden" (PRODUCT.md says 96).
- Titles keep junk such as "Shared Recipe. Maja Blanca", the "Recipe" suffix and "How to Make…".
- "How It Works" calls the recipes "scraped" and is written in formal English.
- With the sunny override, the weather line still reads "drizzle · 90% chance of rain… showing
  sunny picks (your choice)". It's honest but busy.
- At 1024 px the desktop planner squeezes the grid to 2 visible days.
- Sections fade in on switch, so subtitles look washed out for a moment.
- On phone the pop-up is a floating card with margins rather than a full-height sheet, and the
  bottom nav peeks out behind it.
- In dark mode, the receipt's scrollbar touches the prices.
- Headings skip a level (section h1 → card h3).

## Questions to Consider

1. If the principle is "end in a decision", why does the phone Home open on a search box and three
   stats instead of "Ulam ngayon: Monggo Guisado, ₱16.6/serving, lutuin na?"?
2. Should Random week ever be able to produce a week that costs far more than its "best value"
   label implies, without showing the budget comparison by default?
3. Does anyone need "Sulit Score 3" as a number? Or should the meter and a ₱ figure be the only
   public form, with the raw score kept for the "Why this scores this way" note?
