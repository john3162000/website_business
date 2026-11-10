---
target: docs/index.html (SarapSulit site)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/website_business/docs/index.html"
target_fingerprint: "sha256:9706d1f374aa3d885f90a1501fae79d3dbdc934ee03b92a7568a2caf631831ea"
target_path: /home/user/website_business/docs/index.html
timestamp: 2026-11-09T23-28-51Z
slug: docs-index-html
---
Method: dual-agent (A: design review sub-agent · B: detector + browser sub-agent)

# Critique: SarapSulit (`docs/index.html`), 2026-11-10

Preview: real-data snapshot (Oct 28) through a local harness; the live API, photos and Google Fonts were unreachable. The pop-up's ingredient lines and the seasonal numbers were sample data. The detector overlay ran with the page CSP bypassed in the test browser only.

## Design Health Score: 26/40 (Acceptable; 22/40 on 2026-10-29)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | DA date everywhere; cost beside the pop-up title; "Checking the weather…" stays after Sunny is set |
| 2 | Match System / Real World | 2 | Tagalog mode translates only buttons; first visit opens in English |
| 3 | User Control and Freedom | 3 | Esc, focus trap and a 44 px ✕ work; the required 6-way age question comes before any dish |
| 4 | Consistency and Standards | 2 | Tour uses old section names; gold buttons; blue Sustansya tile |
| 5 | Error Prevention | 3 | Real ulam picks; feeding planner calls Tinolang Tahong gulay |
| 6 | Recognition Rather Than Recall | 3 | Chips, receipt, "+" legend, "Mas sulit sa 65% ng ulam" |
| 7 | Flexibility and Efficiency | 3 | Search first; horizontal rows; feeding export and print |
| 8 | Aesthetic and Minimalist Design | 2 | Browse 17.8k px and Prices 18.9k px tall on phone; 17 Okasyon chips; empty alerts card first |
| 9 | Error Recovery | 2 | Broken-image icons outside Browse cards |
| 10 | Help and Documentation | 3 | Good Taglish tour; step 4 highlights the whole list |

## Design Specificity Verdict

Design review:
- Mostly authored for this product, more than before: the seasonal "Pinakamura tuwing / Hintayin ang", the Okasyon copy, "Saan magsisimula?", the receipt.
- Still generic: the Browse card column, the feeding planner as a stock form, and the government-style Prices header.
- Language is now the biggest drag.

Detector:
- index.html, 121 findings. Real: 36 low-contrast, 5 undersized text, 73 token drift. False positives: share-preview broken-image, cramped-padding, cream-palette, overused-font, the kitchen-wall grid, a hidden shadow.
- Contrast: gray-500 subtitles 4.4:1 on cream; gray-400 2.3–2.5:1 (movers, .plan-dish-sub ×60, hidden note, placeholders, seasonal English names); footer 3.1–4.0:1; dark-mode .occ-cost 3.0:1.
- Small text: meal tags 9.9 px, brand word 9.9 px, badges and finder legend 10.4 px, taste prices 10.9 px, plan captions 11.2 px.
- match-review.html: 10 findings (internal page).

## Priority Issues

1. [P1] Tagalog mode is half-translated, and the first visit starts in English.
   - Cause: lang defaults to "en" (settings.js:15); section intros, the Prices header, the pop-up "Ingredients" / "Estimated total cost", the finder text and the category caps are untranslated; the setting is named "Wika ng mga button".
   - Fix: default to tl; add data-i18n keys everywhere; map the categories to Ulam / Gulay / Isda. (clarify)
2. [P1] The feeding planner mislabels dishes and gives no verdict.
   - Cause: proteinKind calls Tinolang Tahong gulay; one menu had mussels 3 times; no budget or target verdict; tiles stack on phone and lose their fill in dark mode; hard to find.
   - Fix: let the Fish & Seafood category win, with a test; cap shellfish per cycle; add a "Pasok sa budget" line; 2-up tiles on phone; links from "Saan magsisimula?" and Home. (harden, layout)
3. [P1] Grey text and small labels fail readability, including in senior mode.
   - Cause: the contrast and size findings above.
   - Fix: gray-400→500 and 500→600; 12 px minimum; lighter footer green; a dark-mode .occ-cost rule. (polish)
4. [P2] Pages are too long on phone, and Okasyon buries the results.
   - Cause: the first dish starts at y≈1,100; cards are about 580 px tall; Prices opens on the empty alerts card.
   - Fix: fold Okasyon when no holiday is near; compact cards below 640 px; show alerts only when set. (layout, distill)
5. [P2] First run is front-loaded, and the tour is stale.
   - Cause: the required age question, then 10 steps; "Welcome sa FARM2FIGURE"; old names; step 4 highlights the whole list; step 9 sells Laro, which senior mode hides.
   - Fix: "Laktawan muna" on the age question; a 5-step tour; spotlight the first card. (onboard)

## Persona Red Flags

- Aling Nena: lands in English; sees "VEGETABLE DISH" and "Hover a node"; scrolls about 1,100 px to the first dish; grey price lines; 9.9 px tags.
- Lola Remy (senior): the first screen has no dish; every filter and the full grid remain; the pop-up buttons wrap; "Lulutuin" touches the right edge; actions only at the top.
- NGO coordinator: the feeding planner is hidden; no pass/fail verdict; wrong 🥬/🐟; shellfish repeats with no allergen note; no age group; no program name or dates on screen.
- Sam (keyboard): mostly fixed; the feeding table's dish links look plain until hover.

## Minor Observations

- No image fallback in Okasyon, the pop-up, movers or Kahawig na ulam.
- Gold primary buttons.
- Off-palette blue Sustansya tile.
- Uneven desktop header icons; the desktop planner shows 4 of 7 days.
- Feeding grocery totals miss the "+" for unpriced lines.
- Stray single words at line ends.
- 73 token one-offs.

## Questions

- Why does anyone see English first?
- Is a required age question worth being the first screen?
- Should "Para sa maramihan" be its own mode?
- Which of the 7 tabs and 3 icons could merge?
